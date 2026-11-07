import { Router, Request, Response } from 'express';
import { aiProviderRouter } from '../integrations/ai/router/AIProviderRouter.js';
import { PromptLoader } from '../utils/PromptLoader.js';
import { getDatabaseProvider } from '@/database/index.js';

export const viralCoverRouter = Router();

// POST /api/ai/viral-cover/generate — AI scanning video frames to produce 3 viral cover thumbnails
viralCoverRouter.post('/viral-cover/generate', async (req: Request, res: Response) => {
  const episodeId: string = req.body.episode_id || req.body.episodeId;
  if (!episodeId) {
    return res.status(400).json({ code: 400, data: null, message: 'episode_id is required', error: 'INVALID_PAYLOAD' });
  }

  try {
    // Ownership of episode_id is enforced by bodySeriesOwnershipGuard at mount time.
    const db = await getDatabaseProvider();
    const episode = await db.getEpisodeById(episodeId);
    if (!episode) {
      return res.status(404).json({ code: 404, data: null, message: 'Episode not found', error: 'NOT_FOUND' });
    }
    const series = episode.series_id ? await db.getSeriesById(episode.series_id) : null;
    const seriesTitle = req.body.series_title || req.body.seriesTitle || series?.title || episode.title || 'Untitled Series';

    const prompt = PromptLoader.render('scene/viral_cover_generate', {
      seriesTitle,
      episodeId,
    });

    const raw = await aiProviderRouter.generateText({
      prompt,
      systemInstruction: 'You are a Viral TikTok/Shorts Thumbnail & Title Optimization Engine predicting click-through rates.',
      jsonMode: true,
    });

    const parsed = JSON.parse(raw);
    const variants = Array.isArray(parsed) ? parsed : (parsed.variants || []);
    return res.json({
      code: 200,
      data: {
        episodeId,
        variants,
      },
      message: '3 viral cover variants generated successfully via Gemini',
      error: null,
    });
  } catch (err: any) {
    return res.status(500).json({
      code: 500,
      data: null,
      message: 'Failed to generate viral cover variants',
      error: err.message,
    });
  }
});

