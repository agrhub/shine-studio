import fs from 'fs';
import path from 'path';
import { IStorageAdapter } from './StorageAdapter.js';

/**
 * Resolves `key` under `baseDir`, refusing anything that escapes it
 * (`../`, absolute paths, NUL bytes). Returns null for unsafe keys.
 */
export function resolveWithin(baseDir: string, key: string): string | null {
  if (typeof key !== 'string' || key.includes('\0')) return null;
  const base = path.resolve(baseDir);
  const target = path.resolve(base, key.replace(/^[\\/]+/, ''));
  if (target !== base && !target.startsWith(base + path.sep)) return null;
  return target;
}

function requireWithin(baseDir: string, key: string): string {
  const resolved = resolveWithin(baseDir, key);
  if (!resolved || resolved === path.resolve(baseDir)) {
    throw new Error(`Invalid storage key: ${key}`);
  }
  return resolved;
}

export class LocalStorageAdapter implements IStorageAdapter {
  private static instance: LocalStorageAdapter | null = null;
  private uploadDir: string;

  private constructor() {
    this.uploadDir = path.resolve(process.cwd(), 'server', 'uploads_storage');
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  public static getInstance(): LocalStorageAdapter {
    if (!LocalStorageAdapter.instance) {
      LocalStorageAdapter.instance = new LocalStorageAdapter();
    }
    return LocalStorageAdapter.instance;
  }

  public destroy(): void {
    LocalStorageAdapter.instance = null;
  }

  public async uploadFile(
    key: string,
    body: Buffer | Uint8Array | string,
    contentType: string = 'application/octet-stream'
  ): Promise<{ key: string; url: string }> {
    const filePath = requireWithin(this.uploadDir, key);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let data: Buffer;
    if (typeof body === 'string') {
      data = Buffer.from(body, 'utf-8');
    } else if (Buffer.isBuffer(body)) {
      data = body;
    } else {
      data = Buffer.from(body);
    }

    await fs.promises.writeFile(filePath, data);
    const url = `/api/media/${key}`;
    return { key, url };
  }

  public async getFileUrl(key: string, expiresIn?: number): Promise<string> {
    return `/api/media/${key}`;
  }

  public async deleteFile(key: string): Promise<void> {
    const filePath = requireWithin(this.uploadDir, key);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }

  public async deleteFolder(prefix: string): Promise<void> {
    const folderPath = requireWithin(this.uploadDir, prefix);
    if (fs.existsSync(folderPath)) {
      await fs.promises.rm(folderPath, { recursive: true, force: true });
    }
  }

  public async exists(key: string): Promise<boolean> {
    return this.getLocalFilePath(key) !== null;
  }

  public async listFiles(
    prefix?: string
  ): Promise<Array<{ key: string; url: string; size?: number; lastModified?: Date }>> {
    return [];
  }

  public getLocalFilePath(key: string): string | null {
    const normalizedKey = key.replace(/^\/+/, '');
    const baseDirs = [
      this.uploadDir,
      path.resolve(process.cwd(), 'uploads_storage'),
      path.resolve(process.cwd(), 'server', 'uploads_storage'),
      path.resolve(process.cwd(), 'server', 'server', 'uploads_storage'),
    ];
    for (const baseDir of baseDirs) {
      const p = resolveWithin(baseDir, normalizedKey);
      if (p && p !== path.resolve(baseDir) && fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    }
    return null;
  }

  public async getFileMetadata(key: string): Promise<{ size?: number; contentType?: string } | null> {
    const filePath = this.getLocalFilePath(key);
    if (!filePath) return null;
    try {
      const stats = await fs.promises.stat(filePath);
      return { size: stats.size };
    } catch {
      return null;
    }
  }

  public async getFileStream(key: string, options?: { start?: number; end?: number }): Promise<any> {
    const filePath = this.getLocalFilePath(key) || requireWithin(this.uploadDir, key);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Local file not found: ${key}`);
    }
    return fs.createReadStream(filePath, options);
  }

  public async getUploadUrl(key: string, contentType?: string, expiresIn?: number): Promise<string> {
    return this.getFileUrl(key);
  }
}
