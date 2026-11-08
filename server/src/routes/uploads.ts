import { Router, Request, Response } from 'express';
import multer from 'multer';
import { StorageFactory } from '@/services/storage/StorageFactory.js';
import { getDatabaseProvider } from '@/database/index.js';
import { getUserId } from '@/utils/auth.js';
import { Logger } from '@/utils/logger.js';
import { nanoid } from 'nanoid';

export const uploadsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB max per file
});

/**
 * GET /api/uploads — Fetch all uploaded user assets from SQLite / DB
 */
uploadsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const db = await getDatabaseProvider();
    const userId = getUserId(req);
    const assets = await db.getAssets({ user_id: userId, type: req.query.type as string });

    const uploads = assets.map((a) => ({
      id: a.id,
      name: a.name,
      filePath: a.s3_key || a.url,
      contentType: a.type,
      type: a.type?.includes('video') ? 'video' : a.type?.includes('audio') ? 'audio' : 'image',
      size: a.size_bytes || 0,
      url: a.url,
    }));

    return res.json({ success: true, uploads, count: uploads.length });
  } catch (err: any) {
    Logger.error(`[UploadsRouter] Failed to fetch uploads: ${err.message}`);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/uploads — Multipart file upload (images, videos, audio)
 */
uploadsRouter.post('/', upload.array('files', 10), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files provided' });
    }

    const db = await getDatabaseProvider();
    const userId = getUserId(req);
    const uploadedResults: any[] = [];

    for (const file of files) {
      const mime = file.mimetype;
      const ext = file.originalname.split('.').pop() || (mime.startsWith('video/') ? 'mp4' : mime.startsWith('audio/') ? 'mp3' : 'png');
      const folder = mime.startsWith('video/') ? 'videos' : mime.startsWith('audio/') ? 'audio' : 'images';

      const s3Result = await StorageFactory.uploadMedia(file.buffer, folder, ext, mime);
      const url = `/api/assets/file/${s3Result.key}`;
      const assetId = `ast_${nanoid(8)}`;
      const assetType = mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'image';

      await db.saveAsset({
        id: assetId,
        user_id: userId,
        name: file.originalname,
        type: assetType,
        ext: `.${ext.toUpperCase()}`,
        size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
        size_bytes: file.size,
        category_label: 'Uploaded Media',
        category_color: 'text-blue-500',
        s3_key: s3Result.key,
        url,
        thumbnail: url,
        provider: 'user_upload',
        created_at: new Date().toISOString(),
      });

      uploadedResults.push({
        id: assetId,
        name: file.originalname,
        filePath: s3Result.key,
        contentType: mime,
        type: assetType,
        size: file.size,
        url,
      });
    }

    return res.json({ success: true, uploads: uploadedResults, count: uploadedResults.length });
  } catch (err: any) {
    Logger.error(`[UploadsRouter] Upload error: ${err.message}`);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/uploads — Remove one of the caller's uploads.
 * Body: { filePath } (storage key or URL, as returned by GET /api/uploads) or { id }.
 */
uploadsRouter.delete('/', async (req: Request, res: Response) => {
  try {
    const { filePath, id } = req.body || {};
    if (!filePath && !id) {
      return res.status(400).json({ success: false, error: 'filePath or id is required' });
    }

    const db = await getDatabaseProvider();
    const userId = getUserId(req);
    const assets = await db.getAssets({ user_id: userId });
    const asset = assets.find(
      (a: any) => (id && a.id === id) || (filePath && (a.s3_key === filePath || a.url === filePath))
    );

    // Only assets owned by the caller are found above, so other users' files are never touched.
    if (!asset) {
      return res.status(404).json({ success: false, error: 'Upload not found' });
    }

    if (asset.s3_key) {
      try {
        const storage = await StorageFactory.getActiveAdapter();
        await storage.deleteFile(asset.s3_key);
      } catch (storageErr: any) {
        Logger.warn(`[UploadsRouter] Storage delete failed for ${asset.s3_key}: ${storageErr.message}`);
      }
    }
    await db.deleteAsset(asset.id);

    return res.json({ success: true, deleted: asset.id });
  } catch (err: any) {
    Logger.error(`[UploadsRouter] Delete error: ${err.message}`);
    return res.status(500).json({ success: false, error: err.message });
  }
});
