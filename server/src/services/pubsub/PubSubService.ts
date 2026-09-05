import { PubSub, Topic, Subscription, Message } from '@google-cloud/pubsub';
import axios from 'axios';
import { EnvConfig } from '@/config/env.js';
import { Logger } from '@/utils/logger.js';
import { getDatabaseProvider } from '@/database/index.js';
import { StorageFactory } from '@/services/storage/StorageFactory.js';
import EventEmitter from 'events';
import type { TrackedRenderJob, RenderJobPayload, RenderProgressEvent } from '@/types.js';
export type { TrackedRenderJob, RenderJobPayload, RenderProgressEvent };

export class PubSubService {
  private static instance: PubSubService | null = null;
  private pubsub: PubSub | null = null;
  private jobTopic: Topic | null = null;
  private statusTopic: Topic | null = null;
  private statusSubscription: Subscription | null = null;
  private jobTopicName: string;
  private statusTopicName: string;
  private statusSubscriptionName: string;
  private eventEmitter: EventEmitter = new EventEmitter();
  private isInitialized = false;
  private trackedJobs: Map<string, TrackedRenderJob> = new Map();
  private watchdogTimer: NodeJS.Timeout | null = null;

  private constructor() {
    this.eventEmitter.setMaxListeners(100);
    const pubsubConfig = EnvConfig.pubsub;
    this.jobTopicName = pubsubConfig.topicRender || 'shine-render-jobs';
    this.statusTopicName = process.env.PUBSUB_TOPIC_STATUS || 'shine-render-status';
    this.statusSubscriptionName = process.env.PUBSUB_SUBSCRIPTION_STATUS || 'shine-render-status-sub';

    // Start background watchdog interval to auto-detect crashed/destroyed workers and auto-retry
    this.startWatchdog();

    // Auto-recover running render jobs from database on startup to resume watchdog polling immediately
    this.recoverRunningJobsFromDb().catch((err) => {
      Logger.warn(`[PubSubService] Startup job recovery notice: ${err.message}`);
    });

    try {
      const options: any = {};
      if (pubsubConfig.projectId || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID) {
        options.projectId = pubsubConfig.projectId || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID;
      }
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        options.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      }

      this.pubsub = new PubSub(options);
      this.jobTopic = this.pubsub.topic(this.jobTopicName);
      this.statusTopic = this.pubsub.topic(this.statusTopicName);
      this.statusSubscription = this.pubsub.subscription(this.statusSubscriptionName);
      this.isInitialized = true;
      Logger.info(`[PubSubService] Connected to Google Cloud Pub/Sub (Job Topic: ${this.jobTopicName}, Status Topic: ${this.statusTopicName})`);

      // Start listening to incoming status messages
      this.initStatusListener().catch((err) => {
        Logger.warn(`[PubSubService] Failed to initialize status subscription listener: ${err.message}`);
      });
    } catch (err: any) {
      Logger.warn(`[PubSubService] Pub/Sub init fallback (in-memory mode): ${err.message}`);
      this.pubsub = null;
    }
  }

  public static getInstance(): PubSubService {
    if (!PubSubService.instance) {
      PubSubService.instance = new PubSubService();
    }
    return PubSubService.instance;
  }

  /**
   * Initializes Pub/Sub subscription and listens for real-time status messages from Cloud Run Workers.
   */
  private async initStatusListener(): Promise<void> {
    if (!this.pubsub || !this.statusTopic) return;

    try {
      // Auto-create topic if not exists
      const [topicExists] = await this.statusTopic.exists();
      if (!topicExists) {
        await this.statusTopic.create();
        Logger.info(`[PubSubService] Created status topic: ${this.statusTopicName}`);
      }

      // Auto-create subscription if not exists
      const [subExists] = await this.statusSubscription!.exists();
      if (!subExists) {
        await this.statusTopic.createSubscription(this.statusSubscriptionName, {
          ackDeadlineSeconds: 30,
        });
        Logger.info(`[PubSubService] Created status subscription: ${this.statusSubscriptionName}`);
      }

      // Listen to messages
      this.statusSubscription!.on('message', async (message: Message) => {
        try {
          const raw = message.data.toString();
          Logger.info("PubSubService: incoming message: " + raw);
          const event: any = JSON.parse(raw);
          message.ack();

          if (event && event.jobId) {
            this.emitProgress(event);

            // Hook for tracked render jobs
            const tracked = this.trackedJobs.get(event.jobId);
            if (tracked) {
              tracked.lastActivityTime = Date.now();
              if (event.status === 'completed') {
                await this.handleJobCompleted(event.jobId, tracked, event.downloadUrl || event.outputUrl || '');
                return;
              } else if (event.status === 'failed') {
                const isCrash = (event.error || '').includes('closed') ||
                  (event.error || '').includes('destroy') ||
                  (event.error || '').includes('crash') ||
                  (event.error || '').includes('Target page');
                if (isCrash) {
                  await this.handleWorkerCrashOrMissing(event.jobId, tracked);
                  return;
                }
              }
            }

            // 1. Persist job telemetry to Database
            try {
              const db = await getDatabaseProvider();
              await db.recordWorkerJob({
                job_id: event.jobId,
                worker_id: event.workerId || 'cloudrun-worker-01',
                worker_name: event.workerName || 'Playwright WebCodecs Worker',
                service_name: event.serviceName || 'shine-render-worker',
                series_id: event.seriesId,
                series_title: event.seriesTitle,
                episode_id: event.episodeId,
                progress: event.progressPercent !== undefined ? event.progressPercent : (event.progress || 0),
                status: (event.status?.toUpperCase() || 'RENDERING') as any,
                download_url: event.downloadUrl || event.outputUrl,
                output_url: event.outputUrl,
                error: event.error,
                render_time_ms: event.renderTimeMs,
                file_size: event.fileSize,
                submitted_at: event.submittedAt || new Date().toISOString(),
                updated_at: event.timestamp || new Date().toISOString(),
              });

              // 2. Global Pipeline Job Sync: Update active pipeline_jobs even if server restarted or was idle
              try {
                const { PatchSyncService } = await import('@/realtime/PatchSyncService.js');
                let targetJob = await db.getPipelineJobById(event.jobId);
                
                // If not found by exact ID, search running pipeline jobs matching episode_id or remoteJobId
                if (!targetJob && event.episodeId) {
                  const runningJobs = await db.getPipelineJobs({ series_id: event.seriesId, status: 'running' });
                  targetJob = runningJobs.find((j: any) => 
                    (j.episode_id === event.episodeId || j.metadata?.remoteJobId === event.jobId || j.metadata?.remoteJobIds?.includes(event.jobId))
                    && j.status === 'running'
                  ) || null;
                }

                if (targetJob) {
                  const currentPct = Math.min(100, Math.max(0, Math.round(event.progressPercent !== undefined ? event.progressPercent : (event.progress || 0))));
                  targetJob.progress = currentPct;
                  targetJob.current_step = `Rendering (Cloud Run): ${currentPct}%`;
                  targetJob.updated_at = new Date().toISOString();

                  if (targetJob.step_progress?.render) {
                    targetJob.step_progress.render.progress = currentPct;
                    targetJob.step_progress.render.message = `Rendering (Cloud Run): ${currentPct}%`;
                  }

                  if (event.status === 'completed') {
                    targetJob.status = 'completed';
                    targetJob.progress = 100;
                    targetJob.completed_at = new Date().toISOString();
                    const finalVideoUrl = event.downloadUrl || event.outputUrl || '';
                    if (finalVideoUrl) {
                      targetJob.outputs = {
                        ...(targetJob.outputs || {}),
                        video: finalVideoUrl,
                      };
                    }

                    if (event.episodeId) {
                      try {
                        const ep = await db.getEpisodeById(event.episodeId);
                        if (ep) {
                          const langKey = (event as any).language || targetJob.metadata?.language || ep.dubbing_languages?.[0] || 'en-US';
                          const mergedUrls = {
                            ...(ep.video_urls || {}),
                            [langKey]: finalVideoUrl,
                          };
                          const updatedEp = await db.updateEpisode(event.episodeId, {
                            video_url: finalVideoUrl,
                            video_urls: mergedUrls,
                            status: 'RENDER',
                          });
                          if (updatedEp) {
                            PatchSyncService.broadcast(targetJob.series_id || event.seriesId || 'all', 'episode:updated', updatedEp);
                          }
                        }
                      } catch (epUpdateErr: any) {
                        Logger.warn(`[PubSubService] Episode auto-sync notice: ${epUpdateErr.message}`);
                      }
                    }
                  } else if (event.status === 'failed') {
                    targetJob.status = 'failed';
                    targetJob.error = event.error || 'Cloud Run Render Worker reported an error';
                  }

                  await db.savePipelineJob(targetJob);
                  PatchSyncService.broadcast(targetJob.series_id || event.seriesId || 'all', 'pipeline_job:updated', targetJob);
                  if (targetJob.status === 'completed') {
                    PatchSyncService.broadcast(targetJob.series_id || event.seriesId || 'all', 'pipeline_job:completed', targetJob);
                  }
                }
              } catch (pipelineSyncErr: any) {
                Logger.debug(`[PubSubService] Pipeline job global sync notice: ${pipelineSyncErr.message}`);
              }
            } catch (dbErr: any) {
              Logger.warn(`[PubSubService] Failed to record worker job: ${dbErr.message}`);
            }
          } else if (event && event.workerId) {
            // Persist worker heartbeat
            try {
              const db = await getDatabaseProvider();
              await db.recordWorkerHeartbeat({
                worker_id: event.workerId,
                worker_name: event.workerName || event.workerId,
                service_name: event.serviceName || 'shine-render-worker',
                region: event.region || process.env.GCP_REGION || 'us-central1',
                status: event.status || 'ONLINE',
                cpu_usage_pct: event.cpuUsagePct,
                memory_usage_mb: event.memoryUsageMb,
                active_jobs_count: event.activeJobsCount,
                completed_jobs_count: event.completedJobsCount,
                failed_jobs_count: event.failedJobsCount,
                last_heartbeat: event.timestamp || new Date().toISOString(),
                metadata: event.metadata,
              });
            } catch (dbErr: any) {
              Logger.warn(`[PubSubService] Failed to record worker heartbeat: ${dbErr.message}`);
            }
          }
        } catch (parseErr: any) {
          Logger.warn(`[PubSubService] Failed to parse status message: ${parseErr.message}`);
          message.ack();
        }
      });

      this.statusSubscription!.on('error', (err) => {
        Logger.warn(`[PubSubService] Status subscription error: ${err.message}`);
      });

      Logger.info(`[PubSubService] Listening for real-time render status events on ${this.statusSubscriptionName}...`);
    } catch (e: any) {
      Logger.warn(`[PubSubService] Status listener setup notice: ${e.message}`);
    }
  }

  /**
   * Recovers running render jobs from database on server startup or watchdog polling.
   * Re-populates trackedJobs so watchdog HTTP polling and Pub/Sub resume immediately.
   */
  public async recoverRunningJobsFromDb(): Promise<void> {
    try {
      const db = await getDatabaseProvider();
      const runningJobs = await db.getPipelineJobs({ status: 'running' });
      const defaultWorkerUrl = (process.env.CLOUD_RUN_RENDER_WORKER_URL || process.env.RENDER_WORKER_URL || 'https://shine-render-worker-asmlum4txq-uc.a.run.app').replace(/\/+$/, '');

      let recoveredCount = 0;
      for (const pJob of runningJobs) {
        if (pJob.type === 'render') {
          const remoteJobId = pJob.outputs?.remote_job_id;
          if (remoteJobId && !this.trackedJobs.has(remoteJobId)) {
            const workerUrl = (pJob.outputs?.worker_url || defaultWorkerUrl).replace(/\/+$/, '');
            const storageKey = pJob.outputs?.storage_key || `renders/${pJob.series_id || 'general'}/${pJob.episode_id || 'ep'}/rendered_${remoteJobId}.mp4`;

            this.trackedJobs.set(remoteJobId, {
              remoteJobId: remoteJobId,
              pipelineJobId: pJob.id,
              seriesId: pJob.series_id || '',
              episodeId: pJob.episode_id || '',
              workerUrl: workerUrl,
              storageKey: storageKey,
              combKey: pJob.outputs?.comb_key || 'primary',
              combLabel: pJob.outputs?.comb_label || 'Default Render',
              projectData: pJob.outputs?.project_data || null,
              options: pJob.outputs?.render_options || {},
              retryCount: 0,
              lastProgressPct: pJob.progress || 5,
              lastActivityTime: Date.now() - 10000, // Trigger immediate poll on next watchdog tick
            });
            recoveredCount++;
            Logger.info(`[PubSubService] Auto-recovered running render job ${remoteJobId} for Episode ${pJob.episode_id} (Pipeline: ${pJob.id}). Resuming watchdog polling.`);
          }
        }
      }
      if (recoveredCount > 0) {
        Logger.info(`[PubSubService] Successfully recovered ${recoveredCount} running render jobs from DB.`);
      }
    } catch (err: any) {
      Logger.warn(`[PubSubService] Notice during recoverRunningJobsFromDb: ${err.message}`);
    }
  }

  /**
   * Starts background watchdog timer for checking tracked render jobs
   */
  private startWatchdog(): void {
    if (this.watchdogTimer) return;
    this.watchdogTimer = setInterval(() => {
      this.runWatchdogPoll().catch((err) => {
        Logger.debug(`[PubSubService] Watchdog poll notice: ${err.message}`);
      });
    }, 4000);
  }

  /**
   * Registers a render job dispatched to Cloud Run for autonomous monitoring,
   * polling fallback, and automatic retry on worker crash/destroy.
   */
  public trackRenderJob(job: Omit<TrackedRenderJob, 'retryCount' | 'lastProgressPct' | 'lastActivityTime'>): void {
    const fullJob: TrackedRenderJob = {
      ...job,
      retryCount: 0,
      lastProgressPct: 5,
      lastActivityTime: Date.now(),
    };
    this.trackedJobs.set(job.remoteJobId, fullJob);
    Logger.info(`[PubSubService] Registered tracked job ${job.remoteJobId} for Episode ${job.episodeId}. Autonomous watchdog active.`);
  }

  /**
   * Autonomous watchdog loop: checks tracked jobs that haven't received Pub/Sub updates
   */
  private async runWatchdogPoll(): Promise<void> {
    if (this.trackedJobs.size === 0) {
      // Check if DB has any running render jobs that need to be picked up
      await this.recoverRunningJobsFromDb();
      if (this.trackedJobs.size === 0) return;
    }

    for (const [remoteJobId, job] of Array.from(this.trackedJobs.entries())) {
      const idleMs = Date.now() - job.lastActivityTime;
      // If we received Pub/Sub updates recently (< 6s), no need to poll HTTP
      if (idleMs < 6000) continue;

      try {
        const resp = await axios.get(`${job.workerUrl}/jobs/${job.remoteJobId}`, {
          timeout: 6000,
          validateStatus: () => true, // capture 404/500 without throwing
        });

        // 1. Worker Crash / 404 Detected: Job missing from worker container
        const isMissing = resp.status === 404 || (resp.data && !resp.data.success && (
          resp.data.error?.includes('not found') ||
          resp.data.error?.includes('expired') ||
          resp.data.error?.includes('Missing')
        ));

        if (isMissing) {
          await this.handleWorkerCrashOrMissing(remoteJobId, job);
          continue;
        }

        const data = resp.data;
        if (data && data.success) {
          job.lastActivityTime = Date.now();

          if (data.status === 'rendering' || data.status === 'queued') {
            const pct = Math.min(99, Math.max(1, Math.round(data.progress || 0)));
            job.lastProgressPct = pct;
            await this.updateTrackedProgress(job, pct);
          } else if (data.status === 'completed') {
            await this.handleJobCompleted(remoteJobId, job, data.downloadUrl || `${job.workerUrl}/download/${job.remoteJobId}`);
          } else if (data.status === 'failed') {
            const isCrash = (data.error || '').includes('closed') ||
              (data.error || '').includes('destroy') ||
              (data.error || '').includes('crash') ||
              (data.error || '').includes('Target page');

            if (isCrash) {
              await this.handleWorkerCrashOrMissing(remoteJobId, job);
            } else {
              await this.handleJobFailed(remoteJobId, job, data.error);
            }
          }
        }
      } catch (pollErr: any) {
        // If worker network error persists > 15s, worker likely crashed/rebooting
        if (idleMs > 15000) {
          Logger.warn(`[PubSubService] Worker unreachable for ${Math.round(idleMs / 1000)}s on job ${job.remoteJobId}. Treating as crash.`);
          await this.handleWorkerCrashOrMissing(remoteJobId, job);
        }
      }
    }
  }

  /**
   * Resubmits a render job when worker crashes or returns 404
   */
  private async handleWorkerCrashOrMissing(remoteJobId: string, job: TrackedRenderJob): Promise<void> {
    const MAX_RETRIES = 3;
    this.trackedJobs.delete(remoteJobId);

    if (job.retryCount < MAX_RETRIES && job.projectData) {
      job.retryCount++;
      Logger.warn(`[PubSubService] Worker crashed or job ${remoteJobId} lost. Auto-resubmitting render task (Attempt ${job.retryCount}/${MAX_RETRIES})...`);

      try {
        const db = await getDatabaseProvider();
        const pJob = await db.getPipelineJobById(job.pipelineJobId);
        if (pJob && pJob.status === 'running') {
          pJob.current_step = `Worker restarted. Auto-resubmitting render task (${job.retryCount}/${MAX_RETRIES})...`;
          await db.savePipelineJob(pJob);
          const { PatchSyncService } = await import('@/realtime/PatchSyncService.js');
          PatchSyncService.broadcast(job.seriesId, 'pipeline_job:updated', pJob);
        }

        const submitResp = await axios.post(
          `${job.workerUrl}/render`,
          {
            projectData: job.projectData,
            options: job.options,
          },
          { timeout: 30000 }
        );

        const newJobId = submitResp.data?.jobId;
        if (newJobId) {
          const newJob: TrackedRenderJob = {
            ...job,
            remoteJobId: newJobId,
            lastActivityTime: Date.now(),
          };
          this.trackedJobs.set(newJobId, newJob);
          Logger.info(`[PubSubService] Successfully auto-resubmitted render task. New remoteJobId: ${newJobId}`);
        } else {
          Logger.warn(`[PubSubService] Worker did not return new jobId on retry.`);
        }
      } catch (err: any) {
        Logger.error(`[PubSubService] Failed to auto-resubmit render job: ${err.message}`);
      }
    } else if (!job.projectData) {
      Logger.error(`[PubSubService] Render job ${remoteJobId} cannot auto-retry: projectData was not available in memory/DB. Marking failed.`);
      await this.handleJobFailed(remoteJobId, job, 'Worker instance recycled and timeline project data was not cached for auto-resubmission.');
    } else {
      Logger.error(`[PubSubService] Render job ${remoteJobId} exceeded max retries (${MAX_RETRIES}). Marking failed.`);
      await this.handleJobFailed(remoteJobId, job, `Render worker crashed repeatedly (${MAX_RETRIES} attempts exhausted).`);
    }
  }

  /**
   * Updates pipeline job progress in real-time
   */
  private async updateTrackedProgress(job: TrackedRenderJob, pct: number): Promise<void> {
    try {
      const db = await getDatabaseProvider();
      const pJob = await db.getPipelineJobById(job.pipelineJobId);
      if (pJob && pJob.status === 'running') {
        pJob.progress = pct;
        pJob.current_step = `Rendering ${job.combLabel} (Cloud Run): ${pct}%`;
        pJob.updated_at = new Date().toISOString();
        if (pJob.step_progress?.render) {
          pJob.step_progress.render.progress = pct;
          pJob.step_progress.render.message = `Rendering (Cloud Run): ${pct}%`;
        }
        await db.savePipelineJob(pJob);
        const { PatchSyncService } = await import('@/realtime/PatchSyncService.js');
        PatchSyncService.broadcast(job.seriesId, 'pipeline_job:updated', pJob);
      }
    } catch {}
  }

  /**
   * Handles video completion: downloads video, uploads to cloud storage, updates DB and broadcasts
   */
  private async handleJobCompleted(remoteJobId: string, job: TrackedRenderJob, downloadUrl: string): Promise<void> {
    this.trackedJobs.delete(remoteJobId);
    const safeStorageKey = job.storageKey || `renders/${job.seriesId || 'general'}/${job.episodeId || 'ep'}/rendered_${remoteJobId}.mp4`;
    Logger.info(`[PubSubService] Tracked job ${remoteJobId} completed. Downloading & uploading to permanent storage (${safeStorageKey})...`);

    try {
      const fullDownloadUrl = downloadUrl.startsWith('http') ? downloadUrl : `${job.workerUrl}${downloadUrl}`;
      const resp = await axios.get(fullDownloadUrl, { responseType: 'arraybuffer', timeout: 120000 });
      const videoBuffer = Buffer.from(resp.data);
      const adapter = await StorageFactory.getActiveAdapter();
      await adapter.uploadFile(safeStorageKey, videoBuffer, 'video/mp4');

      const fileEndpointUrl = `/api/assets/file/${safeStorageKey}`;
      const db = await getDatabaseProvider();

      // Update Episode
      const ep = await db.getEpisodeById(job.episodeId);
      if (ep) {
        const mergedUrls = {
          ...(ep.video_urls || {}),
          [job.combKey]: fileEndpointUrl,
        };
        const epScenes = (ep.scenes || []) as any[];
        const coverThumb = epScenes.find((s: any) => s.storyboard_frame_url || s.image_url)?.storyboard_frame_url
          || epScenes.find((s: any) => s.storyboard_frame_url || s.image_url)?.image_url
          || ep.cover_image
          || '';

        const updatedEp = await db.updateEpisode(job.episodeId, {
          video_url: fileEndpointUrl,
          video_urls: mergedUrls,
          cover_image: coverThumb,
          status: 'RENDER',
        });
        const { PatchSyncService } = await import('@/realtime/PatchSyncService.js');
        PatchSyncService.broadcast(job.seriesId, 'episode:updated', updatedEp);
      }

      // Update Pipeline Job
      const pJob = await db.getPipelineJobById(job.pipelineJobId);
      if (pJob) {
        pJob.status = 'completed';
        pJob.progress = 100;
        pJob.current_step = 'Render completed';
        pJob.completed_at = new Date().toISOString();
        pJob.outputs = {
          ...(pJob.outputs || {}),
          video: fileEndpointUrl,
          video_url: fileEndpointUrl,
        };
        if (pJob.step_progress?.render) {
          pJob.step_progress.render.status = 'completed';
          pJob.step_progress.render.progress = 100;
          pJob.step_progress.render.message = 'Render completed successfully';
        }
        await db.savePipelineJob(pJob);
        const { PatchSyncService } = await import('@/realtime/PatchSyncService.js');
        PatchSyncService.broadcast(job.seriesId, 'pipeline_job:completed', pJob);
        PatchSyncService.broadcast(job.seriesId, 'pipeline_job:updated', pJob);
      }
      Logger.info(`[PubSubService] Video render completed & saved: ${fileEndpointUrl}`);
    } catch (err: any) {
      Logger.error(`[PubSubService] Failed to finalize completed render job ${remoteJobId}: ${err.message}`);
    }
  }

  /**
   * Marks a tracked render job as failed
   */
  private async handleJobFailed(remoteJobId: string, job: TrackedRenderJob, errorMsg?: string): Promise<void> {
    this.trackedJobs.delete(remoteJobId);
    Logger.warn(`[PubSubService] Tracked job ${remoteJobId} marked failed: ${errorMsg}`);

    try {
      const db = await getDatabaseProvider();
      const pJob = await db.getPipelineJobById(job.pipelineJobId);
      if (pJob) {
        pJob.status = 'failed';
        pJob.error = errorMsg || 'Render job failed on worker';
        pJob.current_step = `Render failed: ${errorMsg || 'Worker error'}`;
        if (pJob.step_progress?.render) {
          pJob.step_progress.render.status = 'failed';
          pJob.step_progress.render.message = errorMsg || 'Render failed';
        }
        await db.savePipelineJob(pJob);
        const { PatchSyncService } = await import('@/realtime/PatchSyncService.js');
        PatchSyncService.broadcast(job.seriesId, 'pipeline_job:updated', pJob);
      }
    } catch {}
  }

  /**
   * Publishes a render job to the Pub/Sub topic (or in-memory queue fallback).
   */
  async publishRenderJob(job: RenderJobPayload): Promise<string> {
    const dataBuffer = Buffer.from(JSON.stringify(job));
    const attributes = {
      jobId: job.jobId,
      episodeId: job.episodeId,
      seriesId: job.seriesId,
      submittedAt: job.submittedAt,
    };

    if (this.pubsub && this.jobTopic) {
      try {
        const messageId = await this.jobTopic.publishMessage({
          data: dataBuffer,
          attributes,
        });
        Logger.info(`[PubSubService] Published render job ${job.jobId} to topic ${this.jobTopicName} (msgId: ${messageId})`);
        return messageId;
      } catch (err: any) {
        Logger.warn(`[PubSubService] Failed to publish message to topic, using event fallback: ${err.message}`);
      }
    }

    // In-memory fallback emitter
    this.eventEmitter.emit('job_queued', job);
    Logger.info(`[PubSubService] Render job ${job.jobId} queued in local event queue`);
    return `local_msg_${Date.now()}`;
  }

  /**
   * Publishes a real-time status update to the status topic.
   */
  async publishRenderStatus(event: RenderProgressEvent): Promise<void> {
    const dataBuffer = Buffer.from(JSON.stringify(event));
    if (this.pubsub && this.statusTopic) {
      try {
        await this.statusTopic.publishMessage({
          data: dataBuffer,
          attributes: { jobId: event.jobId, status: event.status },
        });
      } catch (err: any) {
        Logger.warn(`[PubSubService] Failed to publish status event: ${err.message}`);
      }
    }
    this.emitProgress(event);
  }

  /**
   * Broadcasts a render progress event for SSE / WebSocket streaming.
   */
  emitProgress(event: RenderProgressEvent): void {
    this.eventEmitter.emit('progress', event);
    this.eventEmitter.emit(`progress:${event.jobId}`, event);
    if (event.status === 'completed') {
      this.eventEmitter.emit(`completed:${event.jobId}`, event);
    } else if (event.status === 'failed') {
      this.eventEmitter.emit(`failed:${event.jobId}`, event);
    }
  }

  /**
   * Subscribes to global render progress events.
   */
  onProgress(callback: (event: RenderProgressEvent) => void): () => void {
    this.eventEmitter.on('progress', callback);
    return () => this.eventEmitter.off('progress', callback);
  }

  /**
   * Subscribes to a specific job's progress events.
   */
  onJobProgress(jobId: string, callback: (event: RenderProgressEvent) => void): () => void {
    const eventKey = `progress:${jobId}`;
    this.eventEmitter.on(eventKey, callback);
    return () => this.eventEmitter.off(eventKey, callback);
  }

  /**
   * Subscribes to a specific job's completion event.
   */
  onJobCompleted(jobId: string, callback: (event: RenderProgressEvent) => void): () => void {
    const eventKey = `completed:${jobId}`;
    this.eventEmitter.once(eventKey, callback);
    return () => this.eventEmitter.off(eventKey, callback);
  }

  /**
   * Subscribes to a specific job's failure event.
   */
  onJobFailed(jobId: string, callback: (event: RenderProgressEvent) => void): () => void {
    const eventKey = `failed:${jobId}`;
    this.eventEmitter.once(eventKey, callback);
    return () => this.eventEmitter.off(eventKey, callback);
  }

  /**
   * Returns current Pub/Sub queue depth estimate.
   */
  async getQueueDepth(): Promise<number> {
    return this.eventEmitter.listenerCount('progress') || 0;
  }
}
