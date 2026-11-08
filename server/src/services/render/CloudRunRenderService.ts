import axios from 'axios';
import { EnvConfig } from '@/config/env.js';
import { PubSubService, RenderJobPayload, RenderProgressEvent } from '@/services/pubsub/PubSubService.js';
import { StorageFactory } from '@/services/storage/StorageFactory.js';
import { Logger } from '@/utils/logger.js';
import os from 'os';
import { CloudRunClusterStatus } from '~/types';

export class CloudRunRenderService {
  private static instance: CloudRunRenderService | null = null;
  private pubsub = PubSubService.getInstance();

  public static getInstance(): CloudRunRenderService {
    if (!CloudRunRenderService.instance) {
      CloudRunRenderService.instance = new CloudRunRenderService();
    }
    return CloudRunRenderService.instance;
  }

  /**
   * Dispatches a batch render job to Google Cloud Run workers via Pub/Sub or Direct Trigger.
   */
  async dispatchRenderJob(job: RenderJobPayload): Promise<{ job_id: string; status: string; queue_type: string }> {
    Logger.info(`[CloudRunRenderService] Dispatching render job ${job.jobId} for Episode: ${job.episodeId}`);

    // 1. Emit initial queued progress event
    this.pubsub.emitProgress({
      jobId: job.jobId,
      episodeId: job.episodeId,
      status: 'queued',
      progressPercent: 5,
      timestamp: new Date().toISOString(),
    });

    const cloudRunUrl = EnvConfig.cloudRun.renderUrl;

    // 2. If Cloud Run Render Worker URL is configured, forward to Cloud Run container
    if (cloudRunUrl) {
      try {
        Logger.info(`[CloudRunRenderService] Forwarding job to Cloud Run endpoint: ${cloudRunUrl}`);
        const res = await axios.post(`${cloudRunUrl}/render`, job, {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
          },
        });

        return {
          job_id: job.jobId,
          status: res.data?.status || 'dispatched',
          queue_type: 'cloud_run_worker',
        };
      } catch (err: any) {
        Logger.warn(`[CloudRunRenderService] Direct Cloud Run call failed (${err.message}), falling back to Pub/Sub queue`);
      }
    }

    // 3. Publish to Pub/Sub for background worker pickup
    const messageId = await this.pubsub.publishRenderJob(job);

    if (messageId.startsWith('local')) {
      // No Pub/Sub topic and no reachable worker: nothing will consume this job.
      // Report it as failed instead of pretending it rendered (previously a
      // timer emitted "completed" with a non-existent output URL).
      const error = 'No render worker available: set RENDER_WORKER_URL or configure the Pub/Sub render topic.';
      Logger.warn(`[CloudRunRenderService] Job ${job.jobId}: ${error}`);
      this.pubsub.emitProgress({
        jobId: job.jobId,
        episodeId: job.episodeId,
        status: 'failed',
        progressPercent: 0,
        error,
        timestamp: new Date().toISOString(),
      });
      return { job_id: job.jobId, status: 'failed', queue_type: 'unavailable' };
    }

    return {
      job_id: job.jobId,
      status: 'queued',
      queue_type: 'gcp_pubsub',
    };
  }

  /**
   * Retrieves live metrics from Cloud Run render cluster for FinOps dashboard.
   */
  async getClusterMetrics(): Promise<CloudRunClusterStatus> {
    const cloudRunConfig = EnvConfig.cloudRun;
    const queueDepth = await this.pubsub.getQueueDepth();

    const mem = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    let clusterStatus: 'ONLINE' | 'STANDBY' | 'DEGRADED' = 'STANDBY';
    let activeWorkers = 1;

    if (cloudRunConfig.renderUrl) {
      try {
        const ping = await axios.get(`${cloudRunConfig.renderUrl}/health`, { timeout: 2500 });
        if (ping.status === 200) {
          clusterStatus = 'ONLINE';
          activeWorkers = Number(ping.data?.activeWorkers) || 3;
        }
      } catch {
        clusterStatus = 'DEGRADED';
      }
    } else {
      clusterStatus = 'STANDBY';
    }

    return {
      serviceName: cloudRunConfig.serviceName || 'shine-render-worker',
      region: cloudRunConfig.region || 'us-central1',
      renderUrl: cloudRunConfig.renderUrl || 'Headless OpenVideo Local Compositor',
      status: clusterStatus,
      activeWorkers: activeWorkers,
      maxConcurrency: 80,
      queueDepth: queueDepth,
      systemLoad: {
        cpuCores: os.cpus().length,
        freeMemoryMb: Math.round(freeMem / (1024 * 1024)),
        totalMemoryMb: Math.round(totalMem / (1024 * 1024)),
      },
    };
  }
}
