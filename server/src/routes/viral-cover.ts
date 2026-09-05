import { Router, Request, Response } from 'express';
import { aiProviderRouter } from '../integrations/ai/router/AIProviderRouter.js';
import { PromptLoader } from '../utils/PromptLoader.js';

export const viralCoverRouter = Router();

// POST /api/ai/viral-cover/generate — AI scanning video frames to produce 3 viral cover thumbnails
viralCoverRouter.post('/viral-cover/generate', async (req: Request, res: Response) => {
  const { episodeId = 'episode-001', seriesTitle = 'The Neon Betrayal' } = req.body;

  try {
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

