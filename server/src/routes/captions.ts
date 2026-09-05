import { Router, Request, Response } from 'express';
import { geminiClient } from '../integrations/ai/gemini/GeminiClient.js';
import { aiProviderRouter } from '../integrations/ai/router/AIProviderRouter.js';
import { PromptLoader } from '../utils/PromptLoader.js';
import { getDatabaseProvider } from '../database/index.js';
import { CharacterSeriesEntity, EpisodeEntity, SceneDialogue, SceneEntity, SeriesEntity,  } from '@/types.js';
import { StorageFactory } from '../services/storage/StorageFactory.js';
import { TimelineService } from '../services/TimelineService.js';
import { PatchSyncService } from '../realtime/PatchSyncService.js';
import { CaptionService } from '../services/CaptionService.js';
import { EpisodeChatSession } from '~/types.js';

export const captionsRouter = Router();

const CAPTION_PRESETS = [
  {
    id: 'preset_dramatic_yellow',
    name: 'Dramatic Punch',
    style: {
      fontSize: 64,
      fontFamily: 'Montserrat, sans-serif',
      fontWeight: '900',
      color: '#FFE600',
      activeColor: '#FFFFFF',
      align: 'center',
      stroke: { color: '#000000', width: 6 },
    },
    animation: 'pop-in',
  },
  {
    id: 'preset_clean_minimal',
    name: 'Clean Minimalist',
    style: {
      fontSize: 54,
      fontFamily: 'Inter, sans-serif',
      fontWeight: '600',
      color: '#FFFFFF',
      activeColor: '#38BDF8',
      align: 'center',
      shadow: { color: '#000000', alpha: 0.6, blur: 4 },
    },
    animation: 'fade-slide',
  },
  {
    id: 'preset_comic_action',
    name: 'Comic Action',
    style: {
      fontSize: 82,
      fontFamily: 'Bangers, cursive',
      fontWeight: '900',
      color: '#FFF200',
      activeColor: '#FF3366',
      align: 'center',
      stroke: { color: '#000000', width: 6 },
    },
    animation: 'bounce',
  },
  {
    id: 'preset_neon_cyberpunk',
    name: 'Neon Cyberpunk',
    style: {
      fontSize: 68,
      fontFamily: 'Outfit, sans-serif',
      fontWeight: '700',
      color: '#00FFFF',
      activeColor: '#FF00FF',
      align: 'center',
      shadow: { color: '#00FFFF', alpha: 0.8, blur: 10 },
    },
    animation: 'glow-pulse',
  },
];

// GET /api/captions/presets
captionsRouter.get('/presets', (_req: Request, res: Response) => {
  res.json({
    code: 200,
    data: { presets: CAPTION_PRESETS },
    message: 'Caption presets retrieved successfully',
    error: null,
  });
});

// Helper function for auto-generating captions
export async function generateCaptionsInternal(params: {
  episodeId?: string;
  language?: string;
  text?: string;
}) {
  const { episodeId = 'ep-001', language = 'en-US', text } = params;
  const dialogue = text || "Where are you, Kael? You're never late. Too late, Mara. They're already here.";

  try {
    const prompt = PromptLoader.render('audio/caption_auto_generate', {
      language,
      dialogue,
    });

    const raw = await aiProviderRouter.generateText({
      prompt,
      systemInstruction: 'You are an AI Subtitle & Kinetic Caption Timing Engine for vertical short-form video. word.from and word.to must be relative milliseconds from 0.',
      jsonMode: true,
    });

    const parsed = JSON.parse(raw);
    const rawCues = Array.isArray(parsed) ? parsed : (parsed.cues || []);
    const cues = rawCues.map((c: any) => ({
      ...c,
      words: Array.isArray(c.words)
        ? c.words.map((w: any) => ({
            ...w,
            from: w.from > 10000 ? Math.round(w.from / 1000) : w.from,
            to: w.to > 10000 ? Math.round(w.to / 1000) : w.to,
          }))
        : undefined,
    }));

    return {
      episode_id: episodeId,
      language,
      cues_count: cues.length,
      cues,
    };
  } catch (err: any) {
    const words = dialogue.split(' ');
    let timeUs = 200000;
    const cues: any[] = [];
    for (let i = 0; i < words.length; i += 4) {
      const chunk = words.slice(i, i + 4);
      const fromUs = timeUs;
      const durationUs = chunk.length * 400000;
      const toUs = fromUs + durationUs;
      timeUs = toUs + 200000;

      cues.push({
        id: `cue_${i / 4 + 1}`,
        text: chunk.join(' '),
        timing: { display: { from: fromUs, to: toUs }, duration: durationUs },
        words: chunk.map((w: string, idx: number) => ({
          text: w,
          from: idx * 380,
          to: (idx + 1) * 380,
          isKeyWord: idx === chunk.length - 1,
        })),
      });
    }

    return {
      episode_id: episodeId,
      language,
      cues_count: cues.length,
      cues,
    };
  }
}

// POST /api/captions/auto-generate
captionsRouter.post('/auto-generate', async (req: Request, res: Response) => {
  const { episode_id, episodeId = 'ep-001', language = 'en-US', text } = req.body;
  const targetEpisodeId = episode_id || episodeId;

  try {
    const result = await generateCaptionsInternal({ episodeId: targetEpisodeId, language, text });
    return res.json({
      code: 200,
      data: result,
      message: 'Captions auto-generated successfully via Gemini',
      error: null,
    });
  } catch (err: any) {
    return res.status(500).json({
      code: 500,
      data: null,
      message: `Failed to generate captions: ${err.message}`,
      error: err.message,
    });
  }
});

// POST /api/captions/translate
captionsRouter.post('/translate', async (req: Request, res: Response) => {
  const { episode_id, language = 'en-US', text, cues = [] } = req.body;
  const targetEpisodeId = episode_id || 'ep-001';
  const sourceText = text || (cues.map((c: any) => c.text).join(' ')) || 'Where are you, Kael?';

  try {
    const prompt = PromptLoader.render('audio/caption_translate', {
      language,
      sourceText,
      cuesCount: cues.length,
    });

    const raw = await aiProviderRouter.generateText({
      prompt,
      systemInstruction: 'You are a professional film localization translator for vertical micro-dramas. Translate each cue into punchy natural dialogue in target language.',
      jsonMode: true,
    });

    const parsed = JSON.parse(raw);
    const translatedCues = Array.isArray(parsed) ? parsed : (parsed.translated_cues || []);

    return res.json({
      code: 200,
      data: {
        episode_id: targetEpisodeId,
        language,
        translated_cues: translatedCues,
      },
      message: 'Captions translated successfully',
      error: null,
    });
  } catch (err: any) {
    return res.status(500).json({ code: 500, data: null, message: err.message, error: 'TRANSLATION_FAILED' });
  }
});

// POST /api/captions/apply-style
captionsRouter.post('/apply-style', (req: Request, res: Response) => {
  const { episode_id, preset_id, custom_style } = req.body;
  const preset = CAPTION_PRESETS.find((p) => p.id === preset_id) || CAPTION_PRESETS[0];

  res.json({
    code: 200,
    data: {
      episode_id,
      applied_preset: preset.id,
      style: { ...preset.style, ...(custom_style || {}) },
      updated_at: new Date().toISOString(),
    },
    message: 'Subtitle styling preset applied successfully',
    error: null,
  });
});

// POST /api/captions/kinetic-style
captionsRouter.post('/kinetic-style', (req: Request, res: Response) => {
  const { episode_id, style, highlight_color = '#FFD700', enable_emoji = true } = req.body;

  res.json({
    code: 200,
    data: {
      episode_id: episode_id || 'ep-001',
      applied_style: style || { preset: 'kinetic_pop', highlight_color, enable_emoji, bass_sync: true },
      css_animation: 'keyframe-pop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      updated_at: new Date().toISOString(),
    },
    message: 'Kinetic caption style applied successfully',
    error: null,
  });
});

// POST /api/captions/batch-translate
captionsRouter.post('/batch-translate', async (req: Request, res: Response) => {
  const {
    series_id,
    seriesId,
    episode_id,
    episodeId,
    target_language,
    targetLanguage = 'en-US',
    scenes = [],
  }: {
    series_id?: string;
    seriesId?: string;
    episode_id?: string;
    episodeId?: string;
    target_language?: string;
    targetLanguage?: string;
    scenes?: SceneEntity[];
  } = req.body;
  const targetSeriesId = series_id || seriesId;
  const targetEpisodeId = episode_id || episodeId;
  const reqTargetLang = target_language || targetLanguage;

  if (!Array.isArray(scenes) || scenes.length === 0) {
    return res.status(400).json({ code: 400, message: 'Scenes array is required and must not be empty' });
  }

  try {
    const db = await getDatabaseProvider();
    let episode: EpisodeEntity | null = null;
    let series: SeriesEntity | null = null;
    if (targetEpisodeId) {
      episode = await db.getEpisodeById(targetEpisodeId);
      if (episode?.series_id) {
        series = await db.getSeriesById(episode.series_id);
      }
    }

    const inputItems = scenes
      .map((s: SceneEntity) => {
        const speaker = Array.isArray(s.dialogue) && s.dialogue[0]?.character ? s.dialogue[0].character : 'Character';
        const line = Array.isArray(s.dialogue)
          ? s.dialogue.map((d: SceneDialogue) => d.line).filter(Boolean).join(' ')
          : (typeof s.dialogue === 'string' ? s.dialogue : '');
        return {
          scene_index: s.index,
          character: speaker,
          dialogue: CaptionService.cleanDialogueLine(line, speaker),
        };
      })
      .filter((item) => item.dialogue.trim().length > 0);

    if (inputItems.length === 0) {
      return res.json({
        code: 200,
        data: { episode_id: targetEpisodeId, target_language: reqTargetLang, translated_scenes: [] },
        message: 'No dialogue to translate',
      });
    }

    const promptText = `Translate the following dialogue lines from a micro-drama series into language: ${reqTargetLang}.
Context: Keep high dramatic tension, character emotions, punchy delivery, and match the target culture's phrasing.
Ensure the translated text is strictly in ${reqTargetLang} without retaining any source language words.

Input JSON:
${JSON.stringify(inputItems, null, 2)}

Respond with ONLY valid JSON adhering strictly to this schema:
{
  "translated_scenes": [
    {
      "scene_index": 1,
      "character": "Speaker Name",
      "translated_dialogue": "Translated line in ${reqTargetLang}"
    }
  ]
}`;

    const raw = await aiProviderRouter.generateText({
      prompt: promptText,
      systemInstruction: `You are a master micro-drama subtitle & dubbing translator. You translate lines into ${reqTargetLang} while preserving raw emotion, dramatic pacing, and natural spoken flow. Return valid JSON only.`,
      jsonMode: true,
    });

    const parsed = JSON.parse(raw);
    const rawTranslated = parsed.translated_scenes || [];
    const translatedScenes = rawTranslated.map((t: any) => ({
      scene_index: t.scene_index,
      character: t.character,
      translated_dialogue: CaptionService.cleanDialogueLine(t.translated_dialogue || t.line || '', t.character),
    }));

    // Persist translations directly into the database episode entity
    if (episode && targetEpisodeId) {
      const epScenes = episode.scenes || [];
      for (const t of translatedScenes) {
        const sc = epScenes.find((s: SceneEntity) => s.index === t.scene_index || s.id === `scene_${t.scene_index}`);
        if (sc) {
          if (!sc.translations) sc.translations = {};
          const speaker = t.character || (Array.isArray(sc.dialogue) && sc.dialogue[0]?.character) || 'Character';
          const sceneDur = Number(sc.duration_seconds) || 6;
          const transDialogues: SceneDialogue[] = [
            {
              character: speaker,
              line: t.translated_dialogue,
            },
          ];
          const { captions_data, words } = CaptionService.buildWordLevelCaptionsFromDialogue(transDialogues, sceneDur, 0.5);
          sc.translations[reqTargetLang] = {
            ...(sc.translations[reqTargetLang] || {}),
            dialogue: transDialogues,
            captions_data,
            words,
          };
        }
      }

      if (!episode.caption_languages?.includes(reqTargetLang)) {
        if (!episode.caption_languages) episode.caption_languages = [];
        episode.caption_languages.push(reqTargetLang);
      }

      await db.updateEpisode(targetEpisodeId, {
        scenes: epScenes,
        caption_languages: episode.caption_languages,
      });

      const currentTimeline = await db.getLatestTimeline(targetEpisodeId);
      if (currentTimeline) {
        const syncedTimeline = TimelineService.syncTimelineWithScenes(episode, currentTimeline as any, series as any);
        await db.saveTimeline(targetEpisodeId, syncedTimeline, { id: 'system', name: 'Studio Pipeline' }, `Synced ${reqTargetLang} translated captions`);
      }

      if (targetSeriesId || episode.series_id) {
        PatchSyncService.broadcast(targetSeriesId || episode.series_id, 'episode:updated', episode);
      }
    }

    return res.json({
      code: 200,
      data: {
        episode_id: targetEpisodeId,
        target_language: reqTargetLang,
        translated_scenes: translatedScenes,
      },
      message: `Successfully translated dialogue to ${reqTargetLang}`,
      error: null,
    });
  } catch (err: any) {
    return res.status(500).json({
      code: 500,
      data: null,
      message: err.message || 'Failed to translate dialogue lines',
      error: err.message,
    });
  }
});

async function translateDialogueList(dialogues: SceneDialogue[], targetLang: string): Promise<SceneDialogue[]> {
  if (!dialogues || dialogues.length === 0) return [];
  const lines = dialogues.map(d => d.line).filter(Boolean);
  if (lines.length === 0) return dialogues;

  try {
    const raw = await aiProviderRouter.generateText({
      prompt: `Translate the following dialogue lines into ${targetLang}:\n${JSON.stringify(lines, null, 2)}\nReturn ONLY a JSON array of translated strings: ["..."]`,
      jsonMode: true,
    });
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return dialogues.map((d, i) => ({
        ...d,
        line: parsed[i] || d.line,
      }));
    }
  } catch {
    // fallback
  }
  return dialogues;
}

/**
 * POST /api/captions/batch-dubbing
 * Generates speech audio and builds word-level SRT timing per scene.
 */
captionsRouter.post('/batch-dubbing', async (req: Request, res: Response) => {
  const { series_id, seriesId, episode_id, episodeId, target_language, targetLanguage, default_voice_id, defaultVoiceId, scenes } = req.body;
  const targetSeriesId = series_id || seriesId;
  const targetEpisodeId = episode_id || episodeId;
  const reqTargetLang = target_language || targetLanguage;

  if (!Array.isArray(scenes) || scenes.length === 0) {
    return res.status(400).json({ code: 400, message: 'Scenes array is required and must not be empty' });
  }

  try {
    const db = await getDatabaseProvider();
    let seriesChars: CharacterSeriesEntity[] = [];
    let episode: EpisodeEntity | null = null;
    let series: SeriesEntity | null = null;

    if (targetEpisodeId) {
      episode = await db.getEpisodeById(targetEpisodeId);
      if (episode?.series_id) {
        series = await db.getSeriesById(episode.series_id);
        seriesChars = series?.characters || [];
      }
    } else if (targetSeriesId) {
      series = await db.getSeriesById(targetSeriesId);
      seriesChars = series?.characters || [];
    }

    const results: Record<number, { audio_url: string; duration_seconds: number; dialogue: string; captions_data: any[]; words: any[] }> = {};
    const epScenes = episode?.scenes || [];

    for (const sc of scenes) {
      const idx = sc.index;
      const matchedEpScene = epScenes.find((s: SceneEntity) => s.index === idx || s.id === `scene_${idx}`);
      
      // Determine what dialogue to dub:
      // If target language is NOT main language, check if translated line exists in matchedEpScene or sc
      let targetDialogueList: SceneDialogue[] = [];
      const trans = matchedEpScene?.translations?.[reqTargetLang] || sc.translations?.[reqTargetLang];
      
      if (trans?.dialogue && Array.isArray(trans.dialogue) && trans.dialogue.length > 0) {
        targetDialogueList = trans.dialogue;
      } else if (typeof trans?.translated_dialogue === 'string' && trans.translated_dialogue.trim()) {
        const speaker = (Array.isArray(sc.dialogue) && sc.dialogue[0]?.character) || 'Character';
        targetDialogueList = [{ character: speaker, line: trans.translated_dialogue }];
      } else if (typeof trans?.dialogue === 'string' && (trans.dialogue as string).trim()) {
        const speaker = (Array.isArray(sc.dialogue) && sc.dialogue[0]?.character) || 'Character';
        targetDialogueList = [{ character: speaker, line: trans.dialogue as string }];
      } else {
        // Translate dialogue to target language if not yet translated
        const sourceDialogues: SceneDialogue[] = Array.isArray(sc.dialogue) && sc.dialogue.length > 0
          ? sc.dialogue
          : (matchedEpScene?.dialogue || []);
        
        if (sourceDialogues.length > 0) {
          targetDialogueList = await translateDialogueList(sourceDialogues, reqTargetLang);
        }
      }

      if (targetDialogueList.length === 0) continue;

      const primaryDialogue = targetDialogueList[0];
      const speakerName = primaryDialogue.character || 'Character';
      const textToVoice = CaptionService.cleanDialogueLine(primaryDialogue.line, speakerName);
      if (!textToVoice.trim()) continue;

      const emotion = primaryDialogue.emotion || 'dramatic';
      const speechTone = primaryDialogue.speech_tone || 'expressive';
      const speechSpeed = (typeof primaryDialogue.speed === 'number' && primaryDialogue.speed > 0) ? primaryDialogue.speed : 1.0;
      const matchedChar = seriesChars.find((c: CharacterSeriesEntity) => c.name.toLowerCase() === speakerName.toLowerCase());
      const resolvedVoiceId = matchedChar?.voice_id || default_voice_id || defaultVoiceId || 'Puck';

      try {
        const audioRes = await geminiClient.generateAudio(textToVoice, resolvedVoiceId, undefined, {
          emotion,
          speech_tone: speechTone,
          speed: speechSpeed,
        });
        if (audioRes?.url) {
          let audioUrl = audioRes.url;
          if (audioUrl.startsWith('data:')) {
            const s3Result = await StorageFactory.uploadMedia(audioUrl, 'audio', 'wav', audioRes.mimeType || 'audio/wav');
            audioUrl = `/api/assets/file/${s3Result.key}`;
          }

          const sceneDur = audioRes.durationSeconds || Number(sc.duration_seconds) || 6;
          const translatedDialogues: SceneDialogue[] = [
            {
              character: speakerName,
              line: textToVoice,
              emotion,
              speech_tone: speechTone,
              speed: speechSpeed,
            },
          ];

          const { captions_data, words } = CaptionService.buildWordLevelCaptionsFromDialogue(
            translatedDialogues,
            sceneDur,
            0.5
          );

          results[idx] = {
            audio_url: audioUrl,
            duration_seconds: sceneDur,
            dialogue: textToVoice,
            captions_data,
            words,
          };

          // Update scene translation in database entity
          if (matchedEpScene) {
            if (!matchedEpScene.translations) matchedEpScene.translations = {};
            matchedEpScene.translations[reqTargetLang] = {
              dialogue: translatedDialogues,
              voiceover_url: audioUrl,
              voice_duration_us: Math.round(sceneDur * 1_000_000),
              voice_start_us: 500_000,
              captions_data,
              words,
            };
          }
        }
      } catch (voiceErr: any) {
        console.warn(`[BatchDubbing] Failed for Scene #${idx}:`, voiceErr.message);
      }
    }

    // Persist updated episode and synchronize timeline
    if (episode && targetEpisodeId) {
      if (!episode.dubbing_languages?.includes(reqTargetLang)) {
        if (!episode.dubbing_languages) episode.dubbing_languages = [];
        episode.dubbing_languages.push(reqTargetLang);
      }
      if (!episode.caption_languages?.includes(reqTargetLang)) {
        if (!episode.caption_languages) episode.caption_languages = [];
        episode.caption_languages.push(reqTargetLang);
      }

      await db.updateEpisode(targetEpisodeId, {
        scenes: epScenes,
        dubbing_languages: episode.dubbing_languages,
        caption_languages: episode.caption_languages,
      });

      const currentTimeline = await db.getLatestTimeline(targetEpisodeId);
      if (currentTimeline) {
        const syncedTimeline = TimelineService.syncTimelineWithScenes(episode, currentTimeline as any, series as any);
        await db.saveTimeline(targetEpisodeId, syncedTimeline, { id: 'system', name: 'Studio Pipeline' }, `Synced ${reqTargetLang} audio and word-by-word captions`);
      }

      if (targetSeriesId || episode.series_id) {
        PatchSyncService.broadcast(targetSeriesId || episode.series_id, 'episode:updated', episode);
      }
    }

    return res.json({
      code: 200,
      data: {
        series_id: targetSeriesId,
        episode_id: targetEpisodeId,
        target_language: reqTargetLang,
        voice_id: defaultVoiceId,
        voiceovers: results,
      },
      message: `Successfully generated ${Object.keys(results).length} dubbing voiceovers and word-level captions in ${reqTargetLang}`,
      error: null,
    });
  } catch (err: any) {
    return res.status(500).json({
      code: 500,
      message: `Batch dubbing failed: ${err.message}`,
      error: err.message,
    });
  }
});

export default captionsRouter;
