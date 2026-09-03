import { PubSub, Topic, Subscription, Message } from '@google-cloud/pubsub';
import { EnvConfig } from '@/config/env.js';
import { Logger } from '@/utils/logger.js';
import { getDatabaseProvider } from '@/database/index.js';
import EventEmitter from 'events';

export interface RenderJobPayload {
  jobId: string;
  seriesId: string;
  episodeId: string;
  sceneIndex?: number;
  timelineData: any;
  aspectRatio?: string;
  fps?: number;
  resolution?: string;
  outputFormat?: string;
  callbackUrl?: string;
  submittedAt: string;
}

export interface RenderProgressEvent {
  jobId: string;
  episodeId?: string;
  status: 'queued' | 'rendering' | 'compositing' | 'completed' | 'failed';
  progressPercent: number;
  downloadUrl?: string;
  outputUrl?: string;
  s3Key?: string;
  error?: string;
  renderTimeMs?: number;
  fileSize?: number;
  timestamp: string;
}

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

  private constructor() {
    this.eventEmitter.setMaxListeners(100);
    const pubsubConfig = EnvConfig.pubsub;
    this.jobTopicName = pubsubConfig.topicRender || 'shine-render-jobs';
    this.statusTopicName = process.env.PUBSUB_TOPIC_STATUS || 'shine-render-status';
    this.statusSubscriptionName = process.env.PUBSUB_SUBSCRIPTION_STATUS || 'shine-render-status-sub';

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
          const event: any = JSON.parse(raw);
          message.ack();

          if (event && event.jobId) {
            this.emitProgress(event);

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
