import ffmpeg from 'fluent-ffmpeg';
import { resolveFfmpegPath } from '@/services/media/ffmpegPath.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { nanoid } from 'nanoid';
import { getDatabaseProvider } from '@/database/index.js';
import { StorageFactory } from '@/services/storage/StorageFactory.js';
import { geminiClient } from '@/integrations/ai/gemini/GeminiClient.js';
import { aiUsageGuard } from '@/services/ai/AiUsageGuard.js';
import { PromptLoader } from '@/utils/PromptLoader.js';
import { PatchSyncService } from '@/realtime/PatchSyncService.js';
import { EnvConfig } from '@/config/env.js';
import { Logger } from '@/utils/logger.js';
import { analyzeSilence, snapToSilence } from '@/services/media/SilenceDetectionService.js';
import { CreditService } from '@/services/CreditService.js';
import type { PipelineJobEntity } from '@/types.js';

// Teaser / trailer clip extraction, adapted from AntStudio's ClippingEngine
// (server/src/services/ai/ClippingEngine.ts) for episodes instead of live
// recordings: Gemini picks hook segments, cut points are snapped to dialogue
// pauses, FFmpeg renders each clip, and clips are stored as assets.

ffmpeg.setFfmpegPath(resolveFfmpegPath());

export const TEASER_LIMITS = { minSec: 8, maxSec: 45, maxClips: 5 };

export interface TeaserSegment {
  start: number;
  duration: number;
  title: string;
  hook: string;
  reason: string;
  score: number;
}

export interface TeaserClip extends TeaserSegment {
  asset_id: string;
  url: string;
}

/** Validates and clamps raw model output into usable, non-overlapping segments. */
export function sanitizeSegments(raw: unknown, durationSec: number, maxClips: number): TeaserSegment[] {
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as any)?.segments) ? (raw as any).segments : [];
  const out: TeaserSegment[] = [];
  for (const s of list) {
    let start = Number(s?.start);
    let duration = Number(s?.duration);
    if (!Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0) continue;
    start = Math.max(0, start);
    if (durationSec > 0) {
      if (start >= durationSec) continue;
      duration = Math.min(duration, durationSec - start);
    }
    duration = Math.min(duration, TEASER_LIMITS.maxSec);
    if (duration < TEASER_LIMITS.minSec) continue;
    const end = start + duration;
    if (out.some((o) => start < o.start + o.duration && end > o.start)) continue; // overlap
    out.push({
      start,
      duration,
      title: String(s?.title || 'Teaser').slice(0, 80),
      hook: String(s?.hook || ''),
      reason: String(s?.reason || s?.description || ''),
      score: Math.max(0, Math.min(10, Number(s?.score) || 5)),
    });
    if (out.length >= maxClips) break;
  }
  return out;
}

function cutClip(input: string, output: string, start: number, duration: number): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .setStartTime(start)
      .setDuration(duration)
      // Re-encode for frame-accurate cuts (stream copy snaps to keyframes).
      .outputOptions(['-c:v libx264', '-preset veryfast', '-crf 22', '-c:a aac', '-b:a 128k', '-movflags +faststart'])
      .on('error', reject)
      .on('end', () => resolve())
      .save(output);
  });
}

async function findSegments(videoPath: string, ctx: { seriesTitle: string; episodeTitle: string; durationSec: number; maxClips: number }) {
  let fileName = '';
  try {
    const file: any = await geminiClient.uploadFile(videoPath, 'video/mp4', `teaser_${path.basename(videoPath)}`);
    fileName = file?.name || file?.uri || '';
    if (!file?.uri) throw new Error('Gemini file upload returned no URI');
    await geminiClient.waitForFileActive(fileName);

    const prompt = PromptLoader.render('clips/teaser_segments', {
      seriesTitle: ctx.seriesTitle,
      episodeTitle: ctx.episodeTitle,
      durationSec: Math.round(ctx.durationSec),
      maxClips: ctx.maxClips,
      minSec: TEASER_LIMITS.minSec,
      maxSec: TEASER_LIMITS.maxSec,
    });

    const response: any = await aiUsageGuard.track('TEXT', () =>
      geminiClient.generateContent(
        [{ text: prompt }, { fileData: { fileUri: file.uri, mimeType: 'video/mp4' } }],
        EnvConfig.geminiModelText,
        { generationConfig: { responseMimeType: 'application/json' } }
      )
    );
    const text = typeof response === 'string' ? response : response?.text ?? response?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return JSON.parse(String(text).replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } finally {
    if (fileName) geminiClient.deleteFile(fileName).catch(() => {});
  }
}

export class TeaserClipService {
  /**
   * Starts teaser extraction for an episode in the background and returns the
   * pipeline job id; progress is broadcast as `pipeline_job:updated`.
   */
  static async start(params: { userId: string; episodeId: string; videoUrl?: string; maxClips?: number }): Promise<PipelineJobEntity> {
    const db = await getDatabaseProvider();
    const episode = await db.getEpisodeById(params.episodeId);
    if (!episode) throw Object.assign(new Error('Episode not found'), { status: 404 });

    // Only this episode's own renders may be clipped — never an arbitrary URL
    // (getFileBuffer can fetch remote URLs, which would allow SSRF).
    const episodeVideos = [
      ...(episode.render_versions || []).map((v: any) => v?.video_url || v?.url),
      ...Object.values(episode.video_urls || {}),
      episode.video_url,
    ].filter((u): u is string => typeof u === 'string' && u.length > 0);
    if (params.videoUrl && !episodeVideos.includes(params.videoUrl)) {
      throw Object.assign(new Error('video_url must be one of this episode\'s rendered versions'), { status: 400 });
    }
    const videoUrl = params.videoUrl || episodeVideos[0];
    if (!videoUrl) throw Object.assign(new Error('This episode has no rendered video yet. Export it first.'), { status: 400 });

    const maxClips = Math.max(1, Math.min(TEASER_LIMITS.maxClips, Number(params.maxClips) || 3));

    // Charged once per job; refunded if the job fails (see run()).
    const deduct = await CreditService.deductUserCredits(params.userId, 'videoRender', 'Teaser Clip Extraction', `Episode: ${episode.id}`);
    if (!deduct.success) throw Object.assign(new Error(deduct.error || 'Insufficient credits'), { status: 402 });
    const now = new Date().toISOString();
    const job: PipelineJobEntity = {
      id: `job_teaser_${nanoid(10)}`,
      user_id: params.userId,
      series_id: episode.series_id,
      episode_id: episode.id,
      type: 'teaser_clips',
      title: `Teaser clips: EP #${episode.episode_number || ''} ${episode.title || ''}`.trim(),
      status: 'running',
      progress: 5,
      current_step: 'Preparing episode video...',
      logs: [{ timestamp: now, level: 'info', message: `Extracting up to ${maxClips} teaser clips` }],
      outputs: { clips: [] },
      created_at: now,
      updated_at: now,
    } as PipelineJobEntity;
    await db.savePipelineJob(job);
    PatchSyncService.broadcast(episode.series_id, 'pipeline_job:updated', job);

    // Fire and forget; AsyncLocalStorage keeps the user's AI-usage context.
    this.run(job, videoUrl, maxClips).catch(() => {});
    return job;
  }

  private static async update(job: PipelineJobEntity, patch: Partial<PipelineJobEntity>, log?: string) {
    const db = await getDatabaseProvider();
    Object.assign(job, patch, { updated_at: new Date().toISOString() });
    if (log) job.logs = [...(job.logs || []), { timestamp: job.updated_at!, level: patch.status === 'failed' ? 'error' : 'info', message: log } as any];
    const saved = (await db.updatePipelineJob(job.id, job).catch(() => null)) || job;
    PatchSyncService.broadcast(job.series_id, 'pipeline_job:updated', saved);
  }

  private static async run(job: PipelineJobEntity, videoUrl: string, maxClips: number) {
    const workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'shine-teaser-'));
    try {
      const db = await getDatabaseProvider();
      const [episode, series] = await Promise.all([db.getEpisodeById(job.episode_id), db.getSeriesById(job.series_id)]);

      const media = await StorageFactory.getFileBuffer(videoUrl);
      if (!media?.buffer?.length) throw new Error(`Could not load episode video (${videoUrl})`);
      const sourcePath = path.join(workDir, 'episode.mp4');
      await fs.promises.writeFile(sourcePath, media.buffer);

      await this.update(job, { progress: 15, current_step: 'Finding dialogue pauses...' });
      const silence = await analyzeSilence(sourcePath).catch((err) => {
        Logger.warn(`[TeaserClips] Silence analysis failed, cutting without snapping: ${err.message}`);
        return { duration: 0, silences: [], active: [] };
      });

      await this.update(job, { progress: 30, current_step: 'AI is choosing the strongest hooks...' });
      const raw = await findSegments(sourcePath, {
        seriesTitle: series?.title || 'Untitled series',
        episodeTitle: episode?.title || `Episode ${episode?.episode_number || ''}`,
        durationSec: silence.duration,
        maxClips,
      });

      const segments = sanitizeSegments(raw, silence.duration, maxClips).map((s) => {
        const start = snapToSilence(s.start, silence.silences);
        const end = snapToSilence(s.start + s.duration, silence.silences);
        const duration = end - start;
        return duration >= TEASER_LIMITS.minSec && duration <= TEASER_LIMITS.maxSec + 3 ? { ...s, start, duration } : s;
      });
      if (segments.length === 0) throw new Error('The AI did not find any usable teaser segment in this episode.');

      const clips: TeaserClip[] = [];
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        await this.update(job, {
          progress: 40 + Math.round((i / segments.length) * 55),
          current_step: `Rendering clip ${i + 1}/${segments.length}: ${seg.title}`,
        });

        const outPath = path.join(workDir, `clip_${i}.mp4`);
        await cutClip(sourcePath, outPath, seg.start, seg.duration);
        const buffer = await fs.promises.readFile(outPath);
        const stored = await StorageFactory.uploadMedia(buffer, 'videos', 'mp4', 'video/mp4');
        const url = `/api/assets/file/${stored.key}`;
        const assetId = `ast_${nanoid(10)}`;

        await db.saveAsset({
          id: assetId,
          user_id: job.user_id,
          series_id: job.series_id,
          episode_id: job.episode_id,
          name: seg.title,
          type: 'video',
          ext: '.MP4',
          size: `${(buffer.length / (1024 * 1024)).toFixed(1)} MB`,
          size_bytes: buffer.length,
          category_label: 'Teaser Clip',
          category_color: 'text-pink-500',
          s3_key: stored.key,
          url,
          thumbnail: url,
          provider: 'teaser_clip',
          metadata: { teaser: true, start: seg.start, duration: seg.duration, hook: seg.hook, reason: seg.reason, score: seg.score, source_url: videoUrl },
          created_at: new Date().toISOString(),
        } as any);

        clips.push({ ...seg, asset_id: assetId, url });
        job.outputs = { ...(job.outputs || {}), clips };
      }

      await this.update(job, { status: 'completed', progress: 100, current_step: `${clips.length} teaser clip(s) ready` }, `Created ${clips.length} teaser clips`);
    } catch (err: any) {
      Logger.error(`[TeaserClips] Job ${job.id} failed: ${err?.message}`);
      await CreditService.refundUserCredits(job.user_id, 'videoRender', 'Teaser Clip Refund', `Job ${job.id} failed`).catch(() => {});
      await this.update(job, { status: 'failed', error: err?.message || 'Teaser extraction failed', current_step: 'Failed' }, err?.message);
    } finally {
      fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
