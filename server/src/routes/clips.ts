import { Router, Request, Response } from 'express';
import { getDatabaseProvider } from '@/database/index.js';
import { getUserId } from '@/utils/auth.js';
import { TeaserClipService } from '@/services/TeaserClipService.js';

export const clipsRouter = Router();

// POST /api/clips/teasers — start AI teaser extraction for an episode's rendered video.
// Body: { episode_id, max_clips?: 1-5, video_url?: specific render to clip }
// Ownership of episode_id is enforced by bodySeriesOwnershipGuard at mount time.
clipsRouter.post('/teasers', async (req: Request, res: Response) => {
  const { episode_id, max_clips, video_url } = req.body || {};
  if (!episode_id) {
    return res.status(400).json({ code: 400, data: null, message: 'episode_id is required', error: 'INVALID_PAYLOAD' });
  }
  const userId = getUserId(req);

  try {
    const job = await TeaserClipService.start({ userId, episodeId: episode_id, videoUrl: video_url, maxClips: max_clips });
    return res.status(202).json({ code: 202, data: { job }, message: 'Teaser extraction started', error: null });
  } catch (err: any) {
    const status = err?.status || 500;
    return res.status(status).json({ code: status, data: null, message: err.message, error: status === 402 ? 'INSUFFICIENT_CREDITS' : 'TEASER_FAILED' });
  }
});

// GET /api/clips/teasers?episode_id= — teaser clips already generated for an episode.
clipsRouter.get('/teasers', async (req: Request, res: Response) => {
  const episodeId = String(req.query.episode_id || '');
  if (!episodeId) {
    return res.status(400).json({ code: 400, data: null, message: 'episode_id is required', error: 'INVALID_PAYLOAD' });
  }
  const db = await getDatabaseProvider();
  const assets = await db.getAssets({ user_id: getUserId(req), episode_id: episodeId, type: 'video' });
  const clips = assets
    .filter((a: any) => a.provider === 'teaser_clip')
    .sort((a: any, b: any) => (b.metadata?.score || 0) - (a.metadata?.score || 0));
  return res.json({ code: 200, data: clips, message: 'Teaser clips retrieved', error: null });
});
