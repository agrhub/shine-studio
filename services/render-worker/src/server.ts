import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import { PubSub, Topic } from '@google-cloud/pubsub';
import { Storage } from '@google-cloud/storage';
import { videoRendererPool } from './VideoRendererPool.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' }));

interface RenderJob {
  id: string;
  status: 'queued' | 'rendering' | 'completed' | 'failed';
  progress: number;
  createdAt: number;
  completedAt?: number;
  gcsSignedUrl?: string;
  gcsUri?: string;
  localFilePath?: string;
  fileSize?: number;
  error?: string;
  renderTimeMs?: number;
}

const jobs = new Map<string, RenderJob>();

// ─── Pub/Sub Client for Realtime Telemetry ────────────────────────────────────
const pubsubProjectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID;
const statusTopicName = process.env.PUBSUB_TOPIC_STATUS || 'shine-render-status';
let pubsub: PubSub | null = null;
let statusTopic: Topic | null = null;

try {
  const options: any = {};
  if (pubsubProjectId) options.projectId = pubsubProjectId;
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) options.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  pubsub = new PubSub(options);
  statusTopic = pubsub.topic(statusTopicName);
  console.log(`[RenderWorker] Pub/Sub Status Publisher initialized (Topic: ${statusTopicName})`);
} catch (e: any) {
  console.warn(`[RenderWorker] Pub/Sub initialization notice (standalone mode): ${e.message}`);
}

// ─── Google Cloud Storage for Direct-to-GCS Render Upload (No Disk) ───────────
const gcsBucketName = process.env.GCS_BUCKET || process.env.GCS_BUCKET_NAME || process.env.GOOGLE_CLOUD_STORAGE_BUCKET || process.env.GCP_STORAGE_BUCKET || 'shine-studio-media';
let storage: Storage | null = null;

if (gcsBucketName) {
  try {
    const storageOpts: any = {};
    if (pubsubProjectId) storageOpts.projectId = pubsubProjectId;
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) storageOpts.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    storage = new Storage(storageOpts);
    console.log(`[RenderWorker] GCS Direct Storage initialized (Bucket: ${gcsBucketName})`);
  } catch (e: any) {
    console.warn(`[RenderWorker] GCS Storage initialization notice: ${e.message}`);
  }
} else {
  console.log(`[RenderWorker] Notice: GCS_BUCKET not set. Temporary disk streaming active in ${os.tmpdir()}`);
}

const WORKER_ID = process.env.K_REVISION || `worker-${os.hostname()}`;
const WORKER_NAME = `Playwright WebCodecs Node (${os.hostname()})`;
const SERVICE_NAME = 'shine-render-worker';
const REGION = process.env.GCP_REGION || 'us-central1';
const SHINE_APP_URL = (process.env.SHINE_APP_URL || process.env.APP_URL || 'https://shine-app-asmlum4txq-uc.a.run.app').replace(/\/+$/, '');

let completedJobsCount = 0;
let failedJobsCount = 0;

/**
 * Normalizes and sanitizes project timeline data:
 * 1. Strips localhost / 127.0.0.1 prefixes (from dev machines)
 * 2. Automatically resolves relative URLs (/api/...) by prefixing with SHINE_APP_URL
 * 3. Preserves all valid cloud URLs (GCS, S3, CDN, signed URLs) untouched
 * 4. Prunes dead clip references from tracks
 */
function sanitizeProjectData(projectData: any, baseUrl: string): any {
  if (!projectData || typeof projectData !== 'object') return projectData;
  const base = baseUrl.replace(/\/+$/, '');
  const cloned = JSON.parse(JSON.stringify(projectData));

  if (cloned.clips && typeof cloned.clips === 'object') {
    const existingClipIds = new Set(Object.keys(cloned.clips));

    for (const clipId of existingClipIds) {
      const clip = cloned.clips[clipId];
      if (!clip) continue;

      for (const prop of ['src', 'videoUrl', 'audioUrl', 'imageUrl', 'fontUrl']) {
        if (typeof clip[prop] === 'string') {
          const val: string = clip[prop].trim();
          // 1. Strip localhost / 127.0.0.1 prefixes (from dev machines)
          const localMatch = val.match(/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(\/.*)$/);
          if (localMatch) {
            clip[prop] = `${base}${localMatch[1]}`;
          }
          // 2. Relative endpoints (/api/...)
          else if (val.startsWith('/')) {
            clip[prop] = `${base}${val}`;
          }
          // 3. Any fully qualified URLs (https://storage.googleapis.com/..., CDN, signed URLs) are kept intact
        }
      }
    }

    // Clean up tracks clipIds
    if (Array.isArray(cloned.tracks)) {
      for (const track of cloned.tracks) {
        if (Array.isArray(track.clipIds)) {
          track.clipIds = track.clipIds.filter((cid: string) => existingClipIds.has(cid));
        }
      }
    }
  }

  return cloned;
}

// Periodic cleanup of temporary render files older than 30 minutes
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [jobId, job] of jobs.entries()) {
    if (job.createdAt < cutoff) {
      if (job.localFilePath && fs.existsSync(job.localFilePath)) {
        try {
          fs.unlinkSync(job.localFilePath);
          console.log(`[RenderWorker] Cleaned up temporary video file: ${job.localFilePath}`);
        } catch {}
      }
      jobs.delete(jobId);
    }
  }
}, 10 * 60 * 1000);

async function publishHeartbeat(): Promise<void> {
  const activeJobsCount = Array.from(jobs.values()).filter(j => j.status === 'rendering' || j.status === 'queued').length;
  const memUsage = Math.round(process.memoryUsage().rss / (1024 * 1024));
  const cpus = os.cpus();
  const cpuCount = cpus.length || 4;
  const poolStats = videoRendererPool.getStats();

  const heartbeat = {
    workerId: WORKER_ID,
    workerName: WORKER_NAME,
    serviceName: SERVICE_NAME,
    region: REGION,
    status: activeJobsCount > 0 ? 'BUSY' : 'IDLE',
    cpuUsagePct: Math.min(100, Math.round((os.loadavg()[0] / cpuCount) * 100)),
    memoryUsageMb: memUsage,
    activeJobsCount,
    completedJobsCount,
    failedJobsCount,
    timestamp: new Date().toISOString(),
    metadata: {
      uptimeSec: Math.round(process.uptime()),
      totalJobsProcessed: completedJobsCount + failedJobsCount,
      gcsDirectUpload: !!storage,
      bucket: gcsBucketName || 'none',
      pool: poolStats.pool,
    }
  };

  // 1. Publish to Pub/Sub Status Topic
  if (statusTopic) {
    try {
      await statusTopic.publishMessage({
        data: Buffer.from(JSON.stringify(heartbeat)),
        attributes: { workerId: WORKER_ID, type: 'heartbeat' },
      });
    } catch {}
  }

  // 2. HTTP POST fallback to Shine App
  if (SHINE_APP_URL) {
    try {
      fetch(`${SHINE_APP_URL}/api/admin/workers/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(heartbeat),
      }).catch(() => {});
    } catch {}
  }
}

// Start periodic heartbeat every 30s
setInterval(publishHeartbeat, 30000);
setTimeout(publishHeartbeat, 2000);

async function publishStatusEvent(event: {
  jobId: string;
  seriesId?: string;
  seriesTitle?: string;
  episodeId?: string;
  status: 'queued' | 'rendering' | 'completed' | 'failed';
  progressPercent: number;
  downloadUrl?: string;
  outputUrl?: string;
  error?: string;
  renderTimeMs?: number;
  fileSize?: number;
}): Promise<void> {
  if (event.status === 'completed') completedJobsCount++;
  if (event.status === 'failed') failedJobsCount++;

  const payload = {
    ...event,
    workerId: WORKER_ID,
    workerName: WORKER_NAME,
    serviceName: SERVICE_NAME,
    timestamp: new Date().toISOString(),
  };

  // 1. Publish to Pub/Sub
  if (statusTopic) {
    try {
      await statusTopic.publishMessage({
        data: Buffer.from(JSON.stringify(payload)),
        attributes: { jobId: event.jobId, status: event.status },
      });
    } catch (err: any) {
      console.warn(`[RenderWorker] Failed to publish Pub/Sub status: ${err.message}`);
    }
  }

  // 2. HTTP POST backup to Shine App
  if (SHINE_APP_URL) {
    try {
      fetch(`${SHINE_APP_URL}/api/admin/workers/job-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {});
    } catch {}
  }
}

// ─── Health check probe ───────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'shine-render-worker',
    engine: '@openvideo/video-renderer (Playwright Chromium Instance Pool + WebCodecs)',
    pool: videoRendererPool.getStats(),
    pubsubConnected: !!statusTopic,
    gcsConnected: !!storage,
    bucket: gcsBucketName || null,
    activeJobs: jobs.size,
    uptime: process.uptime(),
  });
});

// ─── GCS Asset Proxy Endpoint (Streams media with HTTP Range support) ────────
app.get('/api/assets/file/*', async (req: Request, res: Response) => {
  const match = req.url.match(/\/api\/assets\/file\/(.+)$/);
  const rawKey = match ? match[1] : '';
  const storageKey = decodeURIComponent(rawKey.split('?')[0]);

  if (!storageKey) {
    return res.status(400).send('Missing storage key');
  }

  if (!storage || !gcsBucketName) {
    return res.status(503).send('GCS storage not configured on worker');
  }

  try {
    const file = storage.bucket(gcsBucketName).file(storageKey);
    const [exists] = await file.exists();
    if (!exists) {
      console.warn(`[AssetProxy] GCS file not found: ${storageKey}`);
      return res.status(404).send(`Asset not found in bucket: ${storageKey}`);
    }

    const [metadata] = await file.getMetadata();
    if (metadata.contentType) res.setHeader('Content-Type', metadata.contentType);
    if (metadata.size) res.setHeader('Content-Length', metadata.size);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const range = req.headers.range;
    if (range && metadata.size) {
      const total = Number(metadata.size);
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
      const chunksize = end - start + 1;

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      res.setHeader('Content-Length', chunksize);

      file.createReadStream({ start, end }).pipe(res);
    } else {
      file.createReadStream().pipe(res);
    }
  } catch (err: any) {
    console.error(`[AssetProxy] Error streaming GCS asset ${storageKey}:`, err.message);
    res.status(500).send(`Error streaming asset: ${err.message}`);
  }
});

// ─── 1. Submit Render Job (Async non-blocking, Direct-to-GCS + Local Temp Fallback) ──
app.post('/render', async (req: Request, res: Response) => {
  const { projectData, options } = req.body;

  if (!projectData || typeof projectData !== 'object') {
    return res.status(400).json({ success: false, error: 'Missing or invalid projectData payload' });
  }

  const effectiveBaseUrl = SHINE_APP_URL || `http://127.0.0.1:${PORT}`;
  const sanitizedProject = sanitizeProjectData(projectData, effectiveBaseUrl);
  const jobId = `rnd_${nanoid(10)}`;
  const job: RenderJob = {
    id: jobId,
    status: 'rendering',
    progress: 0,
    createdAt: Date.now(),
  };
  jobs.set(jobId, job);


  console.log(`[RenderWorker] [${jobId}] Accepted render task (${sanitizedProject.settings?.width}x${sanitizedProject.settings?.height}, duration: ${((sanitizedProject.settings?.duration || 0) / 1_000_000).toFixed(1)}s)`);

  // Broadcast initial status via Pub/Sub
  publishStatusEvent({
    jobId,
    status: 'rendering',
    progressPercent: 0,
  });

  // Respond immediately with jobId so caller can poll
  res.status(202).json({
    success: true,
    jobId,
    status: 'rendering',
    message: 'Render job initiated successfully',
  });

  // Execute rendering in background using the Managed Instance Pool
  (async () => {
    const startTime = Date.now();
    let lastBroadcastProgress = 0;

    try {
      const renderOpts = {
        width: options?.width || sanitizedProject.settings?.width || 1080,
        height: options?.height || sanitizedProject.settings?.height || 1920,
        fps: options?.fps || sanitizedProject.settings?.fps || 30,
        format: options?.format || 'mp4',
        bitrate: options?.bitrate || 12_000_000,
        audio: options?.audio !== undefined ? options.audio : true,
        prioritizeSpeed: options?.prioritizeSpeed !== undefined ? options.prioritizeSpeed : false,
        timeout: options?.timeout || 300_000, // 5 minutes safety timeout
        backgroundColor: options?.backgroundColor || "#111111",
        videoCodec: options?.videoCodec || (options?.format === "webm" ? "vp09.00.51.08" : "avc1.640033"),
        audioCodec: options?.audioCodec || (options?.format === "webm" ? "opus" : "aac"),
        audioSampleRate: options?.audioSampleRate || 48000,
        onProgress: (progress: number) => {
          const currentJob = jobs.get(jobId);
          const currentPct = Math.round(progress * 100);
          if (currentJob) {
            currentJob.progress = currentPct;
          }

          // Broadcast progress updates
          if (currentPct - lastBroadcastProgress >= 10 || currentPct === 100) {
            lastBroadcastProgress = currentPct;
            publishStatusEvent({
              jobId,
              status: 'rendering',
              progressPercent: currentPct,
            });
          }
        },
      };

      // 1. Render using Managed VideoRenderer Pool (Guaranteed Memory-Safe Instance Limit)
      const videoBuffer = await videoRendererPool.render(sanitizedProject, renderOpts);
      const renderTimeMs = Date.now() - startTime;

      if (!videoBuffer || videoBuffer.length < 10_000) {
        throw new Error(`Video rendering produced an empty or corrupted file (${videoBuffer?.length || 0} bytes). Audio/Video encoder may have failed.`);
      }

      // Always save to local temporary file to guarantee reliable streaming fallback
      const localFilePath = path.join(os.tmpdir(), `shine_render_${jobId}.mp4`);
      await fs.promises.writeFile(localFilePath, videoBuffer);
      job.localFilePath = localFilePath;

      let gcsSignedUrl: string | undefined;
      let gcsUri: string | undefined;

      // 2. Direct upload to Google Cloud Storage (if configured)
      if (storage && gcsBucketName) {
        try {
          const objectPath = `temp-renders/${jobId}.mp4`;
          const gcsFile = storage.bucket(gcsBucketName).file(objectPath);

          await gcsFile.save(videoBuffer, {
            contentType: 'video/mp4',
            resumable: false,
            metadata: {
              cacheControl: 'public, max-age=1800',
              customTime: new Date().toISOString(),
              metadata: {
                jobId,
                renderedBy: WORKER_ID,
                createdAt: new Date().toISOString(),
              },
            },
          });

          // 3. Try Generate 30-Minute V4 Signed URL for direct download
          try {
            const [signedUrl] = await gcsFile.getSignedUrl({
              version: 'v4',
              action: 'read',
              expires: Date.now() + 30 * 60 * 1000, // 30 minutes expiration
            });
            gcsSignedUrl = signedUrl;
          } catch (signErr: any) {
            console.warn(`[RenderWorker] [${jobId}] Notice: Could not generate V4 Signed URL (${signErr.message}). Using local streaming endpoint.`);
          }

          gcsUri = `gs://${gcsBucketName}/${objectPath}`;
          console.log(`[RenderWorker] [${jobId}] Uploaded to GCS in ${(renderTimeMs / 1000).toFixed(2)}s (${(videoBuffer.length / (1024 * 1024)).toFixed(2)} MB) -> ${gcsUri}`);
        } catch (gcsErr: any) {
          console.warn(`[RenderWorker] [${jobId}] GCS upload warning (${gcsErr.message}). Video is available via local worker download stream.`);
        }
      } else {
        console.log(`[RenderWorker] [${jobId}] Completed in local temp file in ${(renderTimeMs / 1000).toFixed(2)}s (${(videoBuffer.length / (1024 * 1024)).toFixed(2)} MB)`);
      }

      job.status = 'completed';
      job.progress = 100;
      job.completedAt = Date.now();
      job.gcsSignedUrl = gcsSignedUrl;
      job.gcsUri = gcsUri;
      job.fileSize = videoBuffer.length;
      job.renderTimeMs = renderTimeMs;

      // Broadcast completion event to Pub/Sub
      publishStatusEvent({
        jobId,
        status: 'completed',
        progressPercent: 100,
        downloadUrl: gcsSignedUrl || `/download/${jobId}`,
        outputUrl: gcsUri || gcsSignedUrl,
        fileSize: videoBuffer.length,
        renderTimeMs,
      });
    } catch (err: any) {
      console.error(`[RenderWorker] [${jobId}] Render error:`, err);
      job.status = 'failed';
      job.error = err.message || 'Rendering failed inside Playwright WebCodecs engine';
      job.renderTimeMs = Date.now() - startTime;

      // Broadcast failure event to Pub/Sub
      publishStatusEvent({
        jobId,
        status: 'failed',
        progressPercent: 0,
        error: job.error,
        renderTimeMs: job.renderTimeMs,
      });
    }
  })();
});

// ─── 2. Poll Job Status ───────────────────────────────────────────────────────
app.get('/jobs/:jobId', (req: Request, res: Response) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ success: false, error: 'Job not found or expired' });
  }

  res.json({
    success: true,
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    renderTimeMs: job.renderTimeMs,
    fileSize: job.fileSize,
    downloadUrl: job.status === 'completed' ? (job.gcsSignedUrl || `/download/${job.id}`) : undefined,
    gcsUri: job.gcsUri,
    error: job.error,
  });
});

// ─── 3. Direct Download with Range Stream & GCS 302 Redirect Fallback ──────────
app.get('/download/:jobId', async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job || job.status !== 'completed') {
    return res.status(404).json({ success: false, error: 'File not available or expired' });
  }

  // 1. If GCS Signed URL is available, 302 Redirect directly to GCS
  if (job.gcsSignedUrl) {
    return res.redirect(302, job.gcsSignedUrl);
  }

  // 2. Stream from local temporary file if available (guaranteed reliable)
  if (job.localFilePath && fs.existsSync(job.localFilePath)) {
    try {
      const stats = await fs.promises.stat(job.localFilePath);
      const totalSize = stats.size;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
        const chunksize = end - start + 1;

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${totalSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'video/mp4',
        });
        return fs.createReadStream(job.localFilePath, { start, end }).pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': totalSize,
          'Content-Type': 'video/mp4',
          'Accept-Ranges': 'bytes',
        });
        return fs.createReadStream(job.localFilePath).pipe(res);
      }
    } catch (localErr: any) {
      console.warn(`[RenderWorker] Local streaming notice for ${jobId}: ${localErr.message}`);
    }
  }

  // 3. Stream directly from GCS bucket if signed URL is unavailable
  if (storage && gcsBucketName) {
    try {
      const objectPath = `temp-renders/${jobId}.mp4`;
      const file = storage.bucket(gcsBucketName).file(objectPath);
      res.setHeader('Content-Type', 'video/mp4');
      if (job.fileSize) res.setHeader('Content-Length', job.fileSize);
      res.setHeader('Accept-Ranges', 'bytes');
      return file.createReadStream().pipe(res);
    } catch (streamErr: any) {
      return res.status(500).json({ success: false, error: `Streaming failed: ${streamErr.message}` });
    }
  }

  return res.status(404).json({ success: false, error: 'Render completed but no download stream available' });
});

// ─── Root & Fallback Routing ──────────────────────────────────────────────────
app.get('/', (_req: Request, res: Response) => {
  res.redirect(302, SHINE_APP_URL);
});

app.use((req: Request, res: Response) => {
  const accept = req.headers.accept || '';
  if (accept.includes('application/json') || req.method === 'POST') {
    return res.status(404).json({ success: false, error: 'Endpoint not found on Render Worker' });
  }
  res.redirect(302, SHINE_APP_URL);
});

const PORT = parseInt(process.env.PORT || '8080', 10);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[ShineRenderWorker] Video Render Worker active on port ${PORT}`);
});
