import { getDatabaseProvider } from '../database/index.js';
import { StorageFactory } from './storage/StorageFactory.js';
import { Logger } from '../utils/logger.js';

export function extractStorageKeysFromAsset(asset: any): string[] {
  const keys: string[] = [];
  if (asset.s3_key) {
    keys.push(asset.s3_key);
  }
  if (asset.url && typeof asset.url === 'string' && asset.url.includes('/api/assets/file/')) {
    const key = asset.url.replace('/api/assets/file/', '').replace(/^\/+/, '');
    if (key && !keys.includes(key)) keys.push(key);
  }
  if (asset.thumbnail && typeof asset.thumbnail === 'string' && asset.thumbnail.includes('/api/assets/file/')) {
    const thumbKey = asset.thumbnail.replace('/api/assets/file/', '').replace(/^\/+/, '');
    if (thumbKey && !keys.includes(thumbKey)) keys.push(thumbKey);
  }
  return keys;
}

export class SeriesDeletionQueue {
  private static queue: string[] = [];
  private static isProcessing = false;
  private static isInitialized = false;

  /**
   * Immediately mark series as 'DELETING' and unlink its owner so that it vanishes
   * from all user lists instantly (<100ms), then enqueue it for background purge.
   */
  public static async markAndEnqueue(seriesId: string): Promise<boolean> {
    const db = await getDatabaseProvider();
    const series = await db.getSeriesById(seriesId);
    if (!series) return false;

    // 1. Instantly detach user ownership and set status to DELETING
    const detachedUserId = series.user_id ? `deleted_${series.user_id}` : 'deleted_user';
    await db.updateSeries(seriesId, {
      status: 'DELETING',
      user_id: detachedUserId,
    });

    Logger.info(`[SeriesDeletionQueue] Series "${seriesId}" unlinked (owner: ${series.user_id} -> ${detachedUserId}) and set to DELETING.`);

    // 2. Add to background sequential queue
    this.enqueue(seriesId);
    return true;
  }

  /**
   * Add seriesId to queue and trigger process loop
   */
  public static enqueue(seriesId: string): void {
    if (!seriesId) return;
    if (!this.queue.includes(seriesId)) {
      this.queue.push(seriesId);
      Logger.info(`[SeriesDeletionQueue] Enqueued series "${seriesId}" for background deletion. Queue length: ${this.queue.length}`);
    }
    this.processNext().catch(err => {
      Logger.error(`[SeriesDeletionQueue] Error triggering processNext: ${err?.message}`);
    });
  }

  /**
   * On application startup, scan the database for any series in 'DELETING' state
   * and resume background deletion sequentially.
   */
  public static async recoverPendingDeletions(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;

    try {
      const db = await getDatabaseProvider();
      // Look up series in 'DELETING' state across database
      const deletingSeries = await db.getSeriesList(undefined, undefined, 'DELETING');
      if (deletingSeries && deletingSeries.length > 0) {
        Logger.info(`[SeriesDeletionQueue] Found ${deletingSeries.length} series in DELETING status. Resuming background cleanup...`);
        for (const s of deletingSeries) {
          this.enqueue(s.id);
        }
      }
    } catch (err: any) {
      Logger.warn(`[SeriesDeletionQueue] Failed to recover pending deletions on startup: ${err?.message}`);
    }
  }

  /**
   * Process series in queue sequentially
   */
  private static async processNext(): Promise<void> {
    if (this.isProcessing) return;
    if (this.queue.length === 0) return;

    this.isProcessing = true;
    const seriesId = this.queue.shift()!;

    try {
      Logger.info(`[SeriesDeletionQueue] Starting sequential background purge for series "${seriesId}"...`);
      const db = await getDatabaseProvider();
      const episodes = await db.getEpisodesBySeriesId(seriesId);

      // 1. Purge cloud storage assets (S3 / Cloud Storage / B2)
      try {
        const storage = await StorageFactory.getActiveAdapter();
        Logger.info(`[SeriesDeletionQueue] Purging storage assets for series "${seriesId}" and ${episodes.length} episodes...`);

        await storage.deleteFolder(`series/${seriesId}`).catch(() => {});
        await storage.deleteFolder(`images/${seriesId}`).catch(() => {});
        await storage.deleteFolder(`videos/${seriesId}`).catch(() => {});
        await storage.deleteFolder(`audio/${seriesId}`).catch(() => {});

        for (const ep of episodes) {
          await storage.deleteFolder(`episodes/${ep.id}`).catch(() => {});
        }

        const seriesAssets = await db.getAssets({ series_id: seriesId });
        for (const a of seriesAssets) {
          const keys = extractStorageKeysFromAsset(a);
          for (const k of keys) {
            await storage.deleteFile(k).catch(() => {});
          }
        }

        for (const ep of episodes) {
          const epAssets = await db.getAssets({ episode_id: ep.id });
          for (const a of epAssets) {
            const keys = extractStorageKeysFromAsset(a);
            for (const k of keys) {
              await storage.deleteFile(k).catch(() => {});
            }
          }
        }
        Logger.info(`[SeriesDeletionQueue] Storage assets purged for "${seriesId}".`);
      } catch (storageErr: any) {
        Logger.warn(`[SeriesDeletionQueue] Storage purge warning for "${seriesId}": ${storageErr?.message}`);
      }

      // 2. Cascade delete from Database (episodes, timelines, versions, chat, assets, jobs, series)
      await db.deleteSeries(seriesId);
      Logger.info(`[SeriesDeletionQueue] Successfully purged series "${seriesId}" and all related DB documents.`);
    } catch (err: any) {
      Logger.error(`[SeriesDeletionQueue] Failed to delete series "${seriesId}": ${err?.message}`);
    } finally {
      this.isProcessing = false;
      // Process next item sequentially if any remaining in queue
      if (this.queue.length > 0) {
        setImmediate(() => this.processNext());
      }
    }
  }
}
