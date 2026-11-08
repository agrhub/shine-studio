import os from 'os';
import { nanoid } from 'nanoid';
import { getDatabaseProvider } from '@/database/index.js';
import { PatchSyncService } from '@/realtime/PatchSyncService.js';
import { Logger } from '@/utils/logger.js';
import type { PipelineJobEntity } from '@/types.js';

/**
 * Scheduled publications are stored as pipeline jobs (type "publish_schedule",
 * status "queued"), so they show up in the task manager and can be cancelled
 * with the existing job cancel endpoint.
 *
 * Due jobs are run by runDuePublications(), triggered both by an in-process
 * ticker (warm instances, local dev) and by Cloud Scheduler calling an internal
 * endpoint every minute (Cloud Run scales to zero, so a ticker alone is not
 * enough). A claim + re-read guard keeps two runners from publishing the same
 * job; it narrows the race to a few hundred ms rather than eliminating it,
 * because the database providers have no compare-and-set.
 */

export const SCHEDULE_JOB_TYPE = 'publish_schedule';
const MAX_AHEAD_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_LATE_MS = 24 * 60 * 60 * 1000; // publish late runs within a day, fail older ones
const INSTANCE_ID = `${os.hostname()}_${process.pid}_${nanoid(6)}`;

type StartPublish = (userId: string, body: any) => Promise<{ status: number; payload: any }>;

async function save(job: PipelineJobEntity, patch: Partial<PipelineJobEntity>, log?: { level: 'info' | 'warn' | 'error'; message: string }) {
  const db = await getDatabaseProvider();
  const now = new Date().toISOString();
  const logs = log ? [...(job.logs || []), { timestamp: now, ...log }] : job.logs;
  const updated = (await db.updatePipelineJob(job.id, { ...patch, logs, updated_at: now } as any)) || ({ ...job, ...patch, logs } as PipelineJobEntity);
  PatchSyncService.broadcast(job.series_id, 'pipeline_job:updated', updated);
  return updated;
}

export async function schedulePublication(userId: string, body: any): Promise<PipelineJobEntity> {
  const when = new Date(body?.scheduledTime);
  const now = Date.now();
  if (Number.isNaN(when.getTime())) throw Object.assign(new Error('scheduledTime must be a valid date'), { status: 400 });
  if (when.getTime() < now + 60_000) throw Object.assign(new Error('scheduledTime must be at least one minute in the future'), { status: 400 });
  if (when.getTime() > now + MAX_AHEAD_MS) throw Object.assign(new Error('scheduledTime must be within one year'), { status: 400 });
  if (!body?.episodeId || !Array.isArray(body?.platforms) || body.platforms.length === 0) {
    throw Object.assign(new Error('episodeId and at least one platform are required'), { status: 400 });
  }

  const db = await getDatabaseProvider();
  const createdAt = new Date().toISOString();
  const job: PipelineJobEntity = {
    id: `job_sched_${nanoid(10)}`,
    user_id: userId,
    series_id: body.seriesId || '',
    episode_id: body.episodeId,
    type: SCHEDULE_JOB_TYPE,
    title: `Scheduled publish: ${body.title || 'Episode'} (${body.platforms.map((p: string) => String(p).toUpperCase()).join(', ')})`,
    status: 'queued',
    progress: 0,
    current_step: `Scheduled for ${when.toISOString()}`,
    logs: [{ timestamp: createdAt, level: 'info', message: `Publication scheduled for ${when.toISOString()}` }],
    // The stored request is replayed through the normal publish flow when due.
    outputs: { scheduled_at: when.toISOString(), request: { ...body, caption: body.caption ?? body.description ?? body.title } },
    created_at: createdAt,
    updated_at: createdAt,
  } as PipelineJobEntity;
  await db.savePipelineJob(job);
  PatchSyncService.broadcast(job.series_id, 'pipeline_job:updated', job);
  return job;
}

export async function listScheduledPublications(userId: string): Promise<PipelineJobEntity[]> {
  const db = await getDatabaseProvider();
  const jobs = await db.getPipelineJobs({ user_id: userId, limit: 500 });
  return jobs
    .filter((j) => j.type === SCHEDULE_JOB_TYPE)
    .sort((a, b) => String(a.outputs?.scheduled_at).localeCompare(String(b.outputs?.scheduled_at)));
}

let running = false;

/** Publishes every queued schedule whose time has come. Returns how many were started. */
export async function runDuePublications(startPublish: StartPublish, now = new Date()): Promise<{ started: number; failed: number }> {
  if (running) return { started: 0, failed: 0 }; // overlapping tick in this process
  running = true;
  let started = 0;
  let failed = 0;
  try {
    const db = await getDatabaseProvider();
    // Publish in scheduled order (earliest first), independent of how the DB sorts jobs.
    const due = (await db.getPipelineJobs({ status: 'queued', limit: 500 }))
      .filter((j) => j.type === SCHEDULE_JOB_TYPE && j.outputs?.scheduled_at && new Date(j.outputs.scheduled_at).getTime() <= now.getTime())
      .sort((a, b) => new Date(a.outputs!.scheduled_at).getTime() - new Date(b.outputs!.scheduled_at).getTime());

    for (const job of due) {
      // Claim, then re-read: if another runner claimed it after us, back off.
      await save(job, { status: 'running', progress: 5, current_step: 'Publishing…', outputs: { ...job.outputs, claimed_by: INSTANCE_ID, claimed_at: now.toISOString() } });
      await new Promise((r) => setTimeout(r, 300));
      const fresh = await db.getPipelineJobById(job.id);
      if (!fresh || fresh.outputs?.claimed_by !== INSTANCE_ID || fresh.status !== 'running') continue;

      const lateMs = now.getTime() - new Date(job.outputs!.scheduled_at).getTime();
      if (lateMs > MAX_LATE_MS) {
        failed++;
        await save(fresh, { status: 'failed', error: 'Missed the publishing window (more than 24h late)', current_step: 'Missed' }, { level: 'error', message: 'Not published: the scheduled time passed more than 24 hours ago.' });
        continue;
      }

      try {
        const { status, payload } = await startPublish(job.user_id, job.outputs!.request);
        if (status >= 200 && status < 300) {
          started++;
          await save(
            fresh,
            { status: 'completed', progress: 100, current_step: 'Publish job started', outputs: { ...fresh.outputs, publish_job_id: payload?.data?.id } },
            { level: 'info', message: `Started publish job ${payload?.data?.id || ''}${lateMs > 120_000 ? ` (${Math.round(lateMs / 60000)} min late)` : ''}` }
          );
        } else {
          failed++;
          await save(fresh, { status: 'failed', error: payload?.message || `Publish rejected (${status})`, current_step: 'Failed' }, { level: 'error', message: payload?.message || `Publish rejected (${status})` });
        }
      } catch (err: any) {
        failed++;
        await save(fresh, { status: 'failed', error: err?.message || 'Publish failed', current_step: 'Failed' }, { level: 'error', message: err?.message || 'Publish failed' });
      }
    }
  } catch (err: any) {
    Logger.error(`[ScheduledPublish] Runner error: ${err?.message}`);
  } finally {
    running = false;
  }
  if (started || failed) Logger.info(`[ScheduledPublish] Due publications: ${started} started, ${failed} failed`);
  return { started, failed };
}

let ticker: NodeJS.Timeout | null = null;
export function startScheduledPublishTicker(startPublish: StartPublish, intervalMs = 60_000): void {
  if (ticker) return;
  ticker = setInterval(() => void runDuePublications(startPublish), intervalMs);
  ticker.unref?.();
}
