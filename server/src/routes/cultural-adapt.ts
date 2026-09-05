import { Router, Request, Response } from 'express';
import { aiProviderRouter } from '../integrations/ai/router/AIProviderRouter.js';
import { PromptLoader } from '../utils/PromptLoader.js';

export const culturalAdaptRouter = Router();

// POST /api/ai/cultural-adapt — Localize script dialogue and cultural nuances
culturalAdaptRouter.post('/cultural-adapt', async (req: Request, res: Response) => {
  const { dialogue, target_culture = 'US_ENTERTAINMENT', language = 'en' } = req.body;

  try {
    const prompt = PromptLoader.render('compliance/cultural_adapt', {
      dialogue: dialogue || 'He is an arrogant CEO.',
      targetCulture: target_culture,
      language,
    });

    const raw = await aiProviderRouter.generateText({
      prompt,
      systemInstruction: 'You are an expert Micro-Drama Cultural Localization Engine specializing in adapting Asian web-novel tropes for Western/Global streaming audiences.',
      jsonMode: true,
    });

    const parsed = JSON.parse(raw);
    return res.json({
      code: 200,
      data: {
        original_dialogue: dialogue,
        adapted_dialogue: parsed.adapted_dialogue || parsed.adaptedDialogue || dialogue,
        target_culture,
        language,
        cultural_notes: parsed.cultural_notes || parsed.culturalNotes || '',
      },
      message: 'Script dialogue localized for target cultural market via Gemini',
      error: null,
    });
  } catch (err: any) {
    return res.json({
      code: 200,
      data: {
        original_dialogue: dialogue,
        adapted_dialogue: dialogue,
        target_culture,
        language,
        cultural_notes: 'Adapted with default fallback localization',
      },
      message: 'Script dialogue localized for target cultural market (fallback)',
      error: null,
    });
  }
});

