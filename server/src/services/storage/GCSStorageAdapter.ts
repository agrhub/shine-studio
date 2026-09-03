import { Storage, Bucket } from '@google-cloud/storage';
import axios from 'axios';
import { IStorageAdapter } from './StorageAdapter.js';
import { EnvConfig } from '@/config/env.js';
import { Logger } from '@/utils/logger.js';
import fs from 'fs';

export class GCSStorageAdapter implements IStorageAdapter {
  private static instance: GCSStorageAdapter | null = null;
  private storage: Storage;
  private bucket: Bucket;
  private bucketName: string;
  private publicDomain: string;

  private constructor(customConfig?: any) {
    const gcsConfig = customConfig || EnvConfig.gcs || {};
    this.bucketName = gcsConfig.bucketName || process.env.GCS_BUCKET_NAME || 'shine-studio-media';
    this.publicDomain = gcsConfig.publicDomain || process.env.GCS_PUBLIC_DOMAIN || `https://storage.googleapis.com/${this.bucketName}`;

    const storageOptions: any = {};
    const projectId = gcsConfig.projectId || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID;
    if (projectId) {
      storageOptions.projectId = projectId;
    }

    const keyFilename = gcsConfig.keyFilename || process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (keyFilename && fs.existsSync(keyFilename)) {
      storageOptions.keyFilename = keyFilename;
    }

    this.storage = new Storage(storageOptions);
    this.bucket = this.storage.bucket(this.bucketName);
    Logger.info(`[GCSStorageAdapter] Initialized GCS Storage Adapter for bucket: ${this.bucketName}`);
  }

  public static getInstance(customConfig?: any): GCSStorageAdapter {
    if (!GCSStorageAdapter.instance) {
      GCSStorageAdapter.instance = new GCSStorageAdapter(customConfig);
    }
    return GCSStorageAdapter.instance;
  }

  public static resetInstance(): void {
    GCSStorageAdapter.instance = null;
  }

  public destroy(): void {
    GCSStorageAdapter.instance = null;
  }

  /**
   * Uploads a file buffer or string to GCS bucket.
   */
  async uploadFile(
    key: string,
    body: Buffer | Uint8Array | string,
    contentType: string = 'application/octet-stream'
  ): Promise<{ key: string; url: string }> {
    try {
      const normalizedKey = key.replace(/^\/+/, '');
      const file = this.bucket.file(normalizedKey);
      const buffer = Buffer.isBuffer(body)
        ? body
        : typeof body === 'string'
        ? Buffer.from(body)
        : Buffer.from(body.buffer);

      await file.save(buffer, {
        metadata: {
          contentType,
        },
        resumable: false,
      });

      const url = `${this.publicDomain.replace(/\/+$/, '')}/${normalizedKey}`;
      return { key: normalizedKey, url };
    } catch (err: any) {
      Logger.error(`[GCSStorageAdapter] Upload failed for key ${key}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Retrieves public or presigned download URL for a file key.
   */
  async getFileUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const normalizedKey = key.replace(/^\/+/, '');
    if (this.publicDomain && !this.publicDomain.includes('storage.googleapis.com')) {
      return `${this.publicDomain.replace(/\/+$/, '')}/${normalizedKey}`;
    }

    try {
      const file = this.bucket.file(normalizedKey);
      const [url] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + expiresIn * 1000,
      });
      return url;
    } catch {
      return `${this.publicDomain.replace(/\/+$/, '')}/${normalizedKey}`;
    }
  }

  /**
   * Deletes a single file by key.
   */
  async deleteFile(key: string): Promise<void> {
    try {
      const normalizedKey = key.replace(/^\/+/, '');
      await this.bucket.file(normalizedKey).delete({ ignoreNotFound: true });
    } catch (err: any) {
      Logger.warn(`[GCSStorageAdapter] Delete file failed for key ${key}: ${err.message}`);
    }
  }

  /**
   * Deletes multiple files matching a prefix/folder.
   */
  async deleteFolder(prefix: string): Promise<void> {
    try {
      const normalizedPrefix = prefix.replace(/^\/+/, '');
      await this.bucket.deleteFiles({ prefix: normalizedPrefix, force: true });
    } catch (err: any) {
      Logger.warn(`[GCSStorageAdapter] Delete folder failed for prefix ${prefix}: ${err.message}`);
    }
  }

  /**
   * Checks if a file key exists.
   */
  async exists(key: string): Promise<boolean> {
    try {
      const normalizedKey = key.replace(/^\/+/, '');
      const [exists] = await this.bucket.file(normalizedKey).exists();
      return exists;
    } catch {
      return false;
    }
  }

  /**
   * Lists files matching an optional prefix.
   */
  async listFiles(
    prefix?: string
  ): Promise<Array<{ key: string; url: string; size?: number; lastModified?: Date }>> {
    try {
      const options: any = {};
      if (prefix) options.prefix = prefix.replace(/^\/+/, '');

      const [files] = await this.bucket.getFiles(options);
      return files.map((f) => ({
        key: f.name,
        url: `${this.publicDomain.replace(/\/+$/, '')}/${f.name}`,
        size: Number(f.metadata.size || 0),
        lastModified: f.metadata.updated ? new Date(f.metadata.updated) : undefined,
      }));
    } catch (err: any) {
      Logger.warn(`[GCSStorageAdapter] List files failed for prefix ${prefix}: ${err.message}`);
      return [];
    }
  }

  /**
   * Retrieves a readable stream for media files, transparently proxying the
   * client's Range header directly to GCS via native SDK.
   *
   * Returns { stream, status, headers } so the caller can forward GCS's
   * Content-Range / Content-Length headers without extra dependencies.
   */
  async getFileStream(
    key: string,
    options?: { start?: number; end?: number } | string
  ): Promise<any> {
    const normalizedKey = key.replace(/^\/+/, '');
    const file = this.bucket.file(normalizedKey);

    try {
      const [metadata] = await file.getMetadata();
      const fileSize = Number(metadata.size || 0);
      const contentType = metadata.contentType || 'video/mp4';

      let start = 0;
      let end = fileSize > 0 ? fileSize - 1 : 0;
      let isRange = false;

      if (typeof options === 'string' && options.startsWith('bytes=')) {
        const parts = options.replace('bytes=', '').split('-');
        start = parseInt(parts[0], 10) || 0;
        if (parts[1] && parts[1].trim().length > 0) {
          end = parseInt(parts[1], 10);
        }
        isRange = true;
      } else if (typeof options === 'object' && options !== null) {
        if (options.start !== undefined) {
          start = options.start;
          isRange = true;
        }
        if (options.end !== undefined) {
          end = options.end;
          isRange = true;
        }
      }

      if (end < start) end = start;
      if (fileSize > 0 && end >= fileSize) end = fileSize - 1;

      const stream = file.createReadStream(isRange ? { start, end } : {});
      const chunkSize = (end - start) + 1;

      return {
        stream,
        status: isRange ? 206 : 200,
        headers: {
          'content-range': isRange && fileSize > 0 ? `bytes ${start}-${end}/${fileSize}` : undefined,
          'content-length': String(isRange ? chunkSize : fileSize),
          'content-type': contentType,
          'accept-ranges': 'bytes',
        },
      };
    } catch (err: any) {
      Logger.warn(`[GCSStorageAdapter] Direct metadata fetch failed for ${normalizedKey}: ${err.message}. Falling back to createReadStream.`);
      const sdkOptions = typeof options === 'object' && options !== null ? options : {};
      const stream = file.createReadStream(sdkOptions as { start?: number; end?: number });
      return {
        stream,
        status: 200,
        headers: {
          'content-type': 'video/mp4',
          'accept-ranges': 'bytes',
        },
      };
    }
  }

  /**
   * Retrieves file metadata (size, contentType, etc.)
   */
  async getFileMetadata(key: string): Promise<{ size?: number; contentType?: string } | null> {
    try {
      const normalizedKey = key.replace(/^\/+/, '');
      const [metadata] = await this.bucket.file(normalizedKey).getMetadata();
      return {
        size: Number(metadata.size || 0),
        contentType: metadata.contentType,
      };
    } catch {
      return null;
    }
  }

  /**
   * Gets presigned upload URL for direct client uploads.
   */
  async getUploadUrl(key: string, contentType: string = 'application/octet-stream', expiresIn: number = 3600): Promise<string> {
    const normalizedKey = key.replace(/^\/+/, '');
    const file = this.bucket.file(normalizedKey);
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + expiresIn * 1000,
      contentType,
    });
    return url;
  }
}
