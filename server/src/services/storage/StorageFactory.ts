import axios from 'axios';
import { nanoid } from 'nanoid';
import { IStorageAdapter } from './StorageAdapter.js';
import { S3StorageAdapter } from './S3StorageAdapter.js';
import { B2StorageAdapter } from './B2StorageAdapter.js';
import { GCSStorageAdapter } from './GCSStorageAdapter.js';
import { LocalStorageAdapter } from './LocalStorageAdapter.js';
import { config, EnvConfig, isStorageConfigured } from '@/config/env.js';
import { getDatabaseProvider } from '~/database/index.js';
import type { StudioSystemConfig } from '@/types.js';

export type StorageProviderType = 's3' | 'r2' | 'b2' | 'gcs' | 'local';

export class StorageFactory {
  private static adapters: Map<string, Promise<IStorageAdapter>> = new Map();
  /** Cached resolved provider so we don't re-query DB on every streaming chunk request */
  private static cachedProvider: StorageProviderType | null = null;
  private static cachedProviderAt: number = 0;
  private static readonly PROVIDER_CACHE_TTL_MS = 30_000; // 30 seconds

  public static clearAdapters(): void {
    this.adapters.clear();
    this.cachedProvider = null;
    this.cachedProviderAt = 0;
  }

  /**
   * Returns active storage adapter based on env variables or fallback.
   * Caches the resolved provider for PROVIDER_CACHE_TTL_MS to avoid DB round-trips
   * on every byte-range streaming request.
   */
  public static async getActiveAdapter(): Promise<IStorageAdapter> {
    const now = Date.now();
    // Use cached provider if still fresh to avoid DB query on every streaming chunk
    if (this.cachedProvider && (now - this.cachedProviderAt) < this.PROVIDER_CACHE_TTL_MS) {
      return this.getAdapter(this.cachedProvider);
    }

    let provider: StorageProviderType = 'local';
    const db = await getDatabaseProvider();
    const savedConfig = await db.getSystemSetting<StudioSystemConfig>('studio_config');
    const envProvider = (
      savedConfig?.s3?.provider ||
      savedConfig?.storage?.provider ||
      config.s3.provider ||
      ''
    ).toLowerCase();

    if (envProvider === 'gcs') {
      provider = 'gcs';
    } else if (envProvider === 'b2') {
      provider = 'b2';
    } else if (envProvider === 'r2') {
      provider = 'r2';
    } else if (envProvider === 's3') {
      provider = 's3';
    } else if (config.s3.accountId && isStorageConfigured()) {
      provider = 'r2';
    } else if (isStorageConfigured()) {
      provider = 's3';
    } else {
      provider = 'local';
    }

    this.cachedProvider = provider;
    this.cachedProviderAt = now;

    return this.getAdapter(provider, savedConfig);
  }

  /**
   * Returns singleton instance of requested adapter.
   */
  public static async getAdapter(provider: StorageProviderType, savedConfig?: any): Promise<IStorageAdapter> {
    if (this.adapters.has(provider)) {
      return this.adapters.get(provider)!;
    }

    const adapterPromise = (async () => {
      let adapter: IStorageAdapter;

      if (provider === 'gcs') {
        try {
          adapter = GCSStorageAdapter.getInstance(savedConfig?.gcs);
          console.log('[StorageFactory] Active Storage Provider: Google Cloud Storage (GCSStorageAdapter)');
        } catch (e) {
          console.warn('[StorageFactory] Google Cloud Storage config failed, falling back to Local Storage:', e);
          adapter = LocalStorageAdapter.getInstance();
        }
      } else if (provider === 'b2') {
        try {
          adapter = B2StorageAdapter.getInstance();
          console.log('[StorageFactory] Active Storage Provider: Backblaze B2 (B2StorageAdapter)');
        } catch (e) {
          console.warn('[StorageFactory] Backblaze B2 config failed, falling back to Local Storage:', e);
          adapter = LocalStorageAdapter.getInstance();
        }
      } else if (provider === 's3' || provider === 'r2') {
        try {
          adapter = S3StorageAdapter.getInstance();
          console.log(`[StorageFactory] Active Storage Provider: ${provider.toUpperCase()} (S3StorageAdapter)`);
        } catch (e) {
          console.warn(`[StorageFactory] Cloud ${provider.toUpperCase()} config failed, falling back to Local Storage:`, e);
          adapter = LocalStorageAdapter.getInstance();
        }
      } else {
        console.log('[StorageFactory] Active Storage Provider: Local Storage (LocalStorageAdapter)');
        adapter = LocalStorageAdapter.getInstance();
      }

      return adapter;
    })();

    this.adapters.set(provider, adapterPromise);
    return adapterPromise;
  }

  /**
   * High-level helper to ingest media (base64 Data URI or remote URL) and store it via active adapter.
   * Returns only key and size metadata.
   */
  public static async uploadMedia(
    sourceUrlOrData: string | Buffer,
    folder: 'images' | 'videos' | 'audio' | 'music' = 'images',
    defaultExt: string = 'png',
    mimeType?: string
  ): Promise<{ key: string; size: number; contentType: string }> {
    let buffer: Buffer;
    let resolvedContentType: string = mimeType || 'application/octet-stream';
    let ext = defaultExt;

    if (Buffer.isBuffer(sourceUrlOrData)) {
      buffer = sourceUrlOrData;
    } else if (sourceUrlOrData.startsWith('data:')) {
      const matches = sourceUrlOrData.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches || matches.length < 3) {
        throw new Error('Invalid Base64 Data URI string');
      }
      resolvedContentType = matches[1];
      if (resolvedContentType.includes('png')) ext = 'png';
      else if (resolvedContentType.includes('jpeg') || resolvedContentType.includes('jpg')) ext = 'jpg';
      else if (resolvedContentType.includes('webp')) ext = 'webp';
      else if (resolvedContentType.includes('mp4')) ext = 'mp4';
      else if (resolvedContentType.includes('webm')) ext = 'webm';
      else if (resolvedContentType.includes('wav')) ext = 'wav';
      else if (resolvedContentType.includes('mp3') || resolvedContentType.includes('mpeg')) ext = 'mp3';

      buffer = Buffer.from(matches[2], 'base64');
    } else if (sourceUrlOrData.startsWith('http://') || sourceUrlOrData.startsWith('https://')) {
      const response = await axios.get(sourceUrlOrData, { responseType: 'arraybuffer' });
      buffer = Buffer.from(response.data);
      const headerType = response.headers['content-type'];
      if (headerType) {
        resolvedContentType = String(headerType);
      }
    } else {
      buffer = Buffer.from(sourceUrlOrData, 'base64');
    }

    const key = `assets/${folder}/${nanoid()}.${ext}`;
    const adapter = await this.getActiveAdapter();
    await adapter.uploadFile(key, buffer, resolvedContentType);

    return {
      key,
      size: buffer.length,
      contentType: resolvedContentType,
    };
  }

  /**
   * Directly upload raw Buffer to active storage adapter.
   */
  public static async uploadBuffer(
    buffer: Buffer,
    key: string,
    contentType: string = 'application/octet-stream'
  ): Promise<{ key: string; size: number; contentType: string }> {
    const adapter = await this.getActiveAdapter();
    await adapter.uploadFile(key, buffer, contentType);
    return {
      key,
      size: buffer.length,
      contentType,
    };
  }

  /**
   * Get streaming readable stream from active storage adapter.
   */
  public static async getFileStream(key: string, options?: { start?: number; end?: number }): Promise<any> {
    // Check if URL matches /api/assets/file/{storageKey}
    const match = key.match(/(?:\/api\/assets\/file\/)(.+)$/);
    if (match && match[1]) {
      key = decodeURIComponent(match[1]);
    }
    // Resolve adapter ONCE and hold reference — never re-resolve mid-stream
    const adapter = await this.getActiveAdapter();
    const exists = await adapter.exists?.(key);
    if (exists === false) {
      // Fallback: try local disk if file was uploaded prior to switching adapter
      try {
        const local = await this.getAdapter('local');
        if (await local.exists?.(key)) {
          // Asynchronously sync local file to active cloud adapter
          (async () => {
            try {
              const fileBuf = await this.getFileBuffer(key);
              if (fileBuf?.buffer && !(adapter instanceof LocalStorageAdapter)) {
                await adapter.uploadFile(key, fileBuf.buffer, fileBuf.mimeType || 'application/octet-stream');
                console.log(`[StorageFactory] Auto-synced missing cloud file from local disk: ${key}`);
              }
            } catch (syncErr: any) {
              console.warn(`[StorageFactory] Auto-sync to cloud failed for ${key}: ${syncErr.message}`);
            }
          })();
          return (local as any).getFileStream(key, options);
        }
      } catch {}
      // Fallback: try B2 if previously stored there
      try {
        const b2 = await this.getAdapter('b2');
        if (await b2.exists?.(key)) {
          return (b2 as any).getFileStream(key, options);
        }
      } catch {}
      // Fallback: try GCS if previously stored there
      try {
        const gcs = await this.getAdapter('gcs');
        if (await gcs.exists?.(key)) {
          return (gcs as any).getFileStream(key, options);
        }
      } catch {}
    }
    return (adapter as any).getFileStream(key, options);
  }

  /**
   * Bulk sync all local storage files to the active cloud storage adapter.
   */
  public static async syncAllLocalToCloud(): Promise<{ total: number; synced: number; skipped: number; errors: number }> {
    const local = await this.getAdapter('local');
    const cloud = await this.getActiveAdapter();

    if (cloud instanceof LocalStorageAdapter) {
      return { total: 0, synced: 0, skipped: 0, errors: 0 };
    }

    const localFiles = await local.listFiles?.() || [];
    let synced = 0;
    let skipped = 0;
    let errors = 0;

    for (const file of localFiles) {
      try {
        const cloudExists = await cloud.exists?.(file.key);
        if (cloudExists) {
          skipped++;
          continue;
        }

        const buf = await this.getFileBuffer(file.key);
        if (buf?.buffer) {
          await cloud.uploadFile(file.key, buf.buffer, buf.mimeType || 'application/octet-stream');
          synced++;
        }
      } catch (err: any) {
        console.warn(`[StorageFactory] Failed to sync ${file.key} to cloud: ${err.message}`);
        errors++;
      }
    }

    return { total: localFiles.length, synced, skipped, errors };
  }

  /**
   * Get complete Buffer for a storage key or /api/assets/file/* URL.
   */
  public static async getFileBuffer(keyOrUrl: string): Promise<{ buffer: Buffer; mimeType?: string }> {
    if (!keyOrUrl) throw new Error('Empty storage key or URL');

    if (keyOrUrl.startsWith('http://') || keyOrUrl.startsWith('https://')) {
      const response = await axios.get(keyOrUrl, { responseType: 'arraybuffer' });
      return {
        buffer: Buffer.from(response.data),
        mimeType: String(response.headers['content-type'] || 'application/octet-stream'),
      };
    }

    if (keyOrUrl.startsWith('data:')) {
      const parts = keyOrUrl.split(',');
      const mimeType = parts[0].split(':')[1].split(';')[0];
      return {
        buffer: Buffer.from(parts[1], 'base64'),
        mimeType,
      };
    }

    const streamResult = await this.getFileStream(keyOrUrl);
    const rawStream = streamResult?.stream || streamResult;

    if (Buffer.isBuffer(rawStream)) {
      return { buffer: rawStream, mimeType: streamResult?.headers?.['content-type'] };
    }

    const chunks: Buffer[] = [];
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      if (typeof rawStream?.on === 'function') {
        rawStream.on('data', (chunk: any) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        rawStream.on('error', reject);
        rawStream.on('end', () => resolve(Buffer.concat(chunks)));
      } else if (typeof rawStream?.transformToByteArray === 'function') {
        rawStream.transformToByteArray().then((bytes: Uint8Array) => resolve(Buffer.from(bytes))).catch(reject);
      } else if (rawStream && typeof rawStream[Symbol.asyncIterator] === 'function') {
        (async () => {
          try {
            for await (const chunk of rawStream) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            resolve(Buffer.concat(chunks));
          } catch (e) {
            reject(e);
          }
        })();
      } else {
        reject(new Error(`Unrecognized stream object: ${typeof rawStream}`));
      }
    });

    return { buffer, mimeType: streamResult?.headers?.['content-type'] };
  }

  /**
   * Resolves internal /api/assets/file/* format or raw storage key to a public S3 / Cloud Storage URL.
   * Guarantees absolute URL so headless renderers (like Playwright) can fetch the asset directly.
   */
  public static async resolvePublicUrl(urlOrKey: string): Promise<string> {
    if (!urlOrKey || typeof urlOrKey !== 'string') return urlOrKey;
    const adapter = await this.getActiveAdapter();
    const port = process.env.PORT || 3001;
    const localOrigin = `http://127.0.0.1:${port}`;

    let resolved = urlOrKey;

    // Check if URL matches /api/assets/file/{storageKey} or /api/media/{storageKey}
    const match = urlOrKey.match(/(?:\/api\/(?:assets\/file|media)\/)(.+)$/);
    if (match && match[1]) {
      const storageKey = decodeURIComponent(match[1]);
      resolved = await adapter.getFileUrl(storageKey);
    } else if (!urlOrKey.startsWith('http://') && !urlOrKey.startsWith('https://') && !urlOrKey.startsWith('data:') && !urlOrKey.startsWith('blob:')) {
      resolved = await adapter.getFileUrl(urlOrKey);
    }

    // If still relative e.g. /api/media/... or /api/assets/..., prefix with local server origin
    if (resolved.startsWith('/')) {
      resolved = `${localOrigin}${resolved}`;
    }

    return resolved;
  }

  public static async reset(): Promise<void> {
    const currentAdapters = Array.from(this.adapters.values());
    this.adapters.clear();

    for (const adapterPromise of currentAdapters) {
      try {
        const adapter = await adapterPromise;
        adapter.destroy();
      } catch (err) {
        // Ignore destroy errors
      }
    }
  }
}
