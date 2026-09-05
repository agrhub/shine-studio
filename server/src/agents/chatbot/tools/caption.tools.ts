import { FunctionTool } from '@google/adk';
import { Type } from '@google/genai';
import { getDatabaseProvider } from '@/database/index.js';
import type { SceneEntity, SceneDialogue, SceneCaptionData, SceneCaptionWord, AssetJobItem } from '@/types.js';
import { Logger } from '@/utils/logger.js';
import { CaptionService } from '@/services/CaptionService.js';
import { executeWithRetry, withCreditDeduction, getActiveChatContext, type ToolContextParams, type ToolExecutionResult } from './context.js';

export class CaptionToolExecutors {
  /**
   * Generate captions for a specific scene or all scenes with word-by-word timing.
   * Rule: Main language captions/voices are kept as-is (not recreated).
   * Sub-languages are translated word-by-word and stored in scene.translations[subLang].
   */
  static async generateSceneCaption(params: {
    userId: string;
    seriesId: string;
    episodeId: string;
    sceneIndex?: number;
    languageCode?: string;
    forceRegenerate?: boolean;
    onItemProgress?: (item: { asset: AssetJobItem; current: number; total: number; description: string }) => Promise<void> | void;
  }): Promise<ToolExecutionResult> {
    try {
      const db = await getDatabaseProvider();
      const series = await db.getSeriesById(params.seriesId);
      if (!series) return { success: false, message: `Series ${params.seriesId} not found` };

      const episode = await db.getEpisodeById(params.episodeId);
      if (!episode) return { success: false, message: `Episode ${params.episodeId} not found` };

      const scenes = (episode.scenes || []) as SceneEntity[];
      if (scenes.length === 0) {
        return { success: false, message: `Episode "${episode.title}" has no scenes to generate captions for.` };
      }

      // Determine primary / main language and target language
      const primaryLang = (series.language || episode.dubbing_languages?.[0] || episode.caption_languages?.[0] || 'vi-VN').trim();
      const targetLang = (params.languageCode || primaryLang).trim();
      const isMainLang = targetLang.toLowerCase() === primaryLang.toLowerCase();

      let targets = scenes;
      if (params.sceneIndex !== undefined) {
        targets = scenes.filter((s: SceneEntity) => Number(s.index || s.scene_number) === Number(params.sceneIndex));
        if (targets.length === 0) {
          return { success: false, message: `Scene #${params.sceneIndex} not found in Episode "${episode.title}".` };
        }
      }

      const results: Array<{ sceneIndex: number; language?: string; status: string; captions_count?: number }> = [];
      const updatedScenes: SceneEntity[] = [...scenes];

      for (const sc of targets) {
        const scIndex = Number(sc.index || sc.scene_number);
        const sourceDialogue: SceneDialogue[] = Array.isArray(sc.dialogue) ? sc.dialogue : [];
        const hasDialogue = sourceDialogue.length > 0 && sourceDialogue.some((d) => (d.line || '').trim().length > 0);

        if (!hasDialogue) {
          results.push({ sceneIndex: scIndex, status: 'no_dialogue_skipped' });
          continue;
        }

        const sceneDur = Number(sc.duration_seconds) || 6;
        const idx = updatedScenes.findIndex((s) => Number(s.index || s.scene_number) === scIndex);
        if (idx < 0) continue;

        if (isMainLang) {
          // ── MAIN LANGUAGE: Keep existing unless forced or missing ─────────────
          const existingCaptions = sc.captions_data;
          if (!params.forceRegenerate && Array.isArray(existingCaptions) && existingCaptions.length > 0) {
            results.push({
              sceneIndex: scIndex,
              language: primaryLang,
              status: 'main_language_already_exists',
              captions_count: existingCaptions.length,
            });
            await params.onItemProgress?.({
              asset: {
                id: `sub_${params.episodeId}_s${scIndex}`,
                name: `Scene #${scIndex} Subtitle`,
                type: 'subtitle',
                status: 'completed',
                scene_index: scIndex,
              },
              current: results.length,
              total: targets.length,
              description: `Scene #${scIndex} Subtitles (Ready)`,
            });
            continue;
          }

          // Build root-level word-by-word captions
          const { captions_data, words, voice_start_us, voice_duration_us } = CaptionService.buildWordLevelCaptionsFromDialogue(
            sourceDialogue,
            sceneDur,
            sc.voice_start_us ? sc.voice_start_us / 1_000_000 : 0.5
          );

          updatedScenes[idx].captions_data = captions_data;
          updatedScenes[idx].words = words;
          if (!updatedScenes[idx].voice_duration_us) {
            updatedScenes[idx].voice_duration_us = voice_duration_us;
            updatedScenes[idx].voice_start_us = voice_start_us;
          }

          results.push({
            sceneIndex: scIndex,
            language: primaryLang,
            status: 'captions_generated',
            captions_count: captions_data.length,
          });

          await params.onItemProgress?.({
            asset: {
              id: `sub_${params.episodeId}_s${scIndex}`,
              name: `Scene #${scIndex} Subtitle`,
              type: 'subtitle',
              status: 'completed',
              scene_index: scIndex,
            },
            current: results.length,
            total: targets.length,
            description: `Generated Subtitles for Scene #${scIndex}`,
          });
        } else {
          // ── SUB-LANGUAGE: Translate and generate word-level captions ──────────
          if (!updatedScenes[idx].translations) {
            updatedScenes[idx].translations = {};
          }
          if (!updatedScenes[idx].translations[targetLang]) {
            updatedScenes[idx].translations[targetLang] = {};
          }

          const existingSubCaptions = updatedScenes[idx].translations[targetLang]?.captions_data;
          if (!params.forceRegenerate && Array.isArray(existingSubCaptions) && existingSubCaptions.length > 0) {
            results.push({
              sceneIndex: scIndex,
              language: targetLang,
              status: 'sub_language_already_exists',
              captions_count: existingSubCaptions.length,
            });
            continue;
          }

          // 1. Check or generate translated dialogue
          let translatedDialogue: SceneDialogue[] = updatedScenes[idx].translations[targetLang]?.dialogue || [];
          if (!Array.isArray(translatedDialogue) || translatedDialogue.length === 0) {
            const { result: transList } = await executeWithRetry(`Translate Scene #${scIndex} Dialogue to ${targetLang}`, async () => {
              return await withCreditDeduction(params.userId, 'subtitleTranslate', 'Dialogue Translation', `Translated Scene #${scIndex} to ${targetLang}`, async () => {
                return await CaptionService.translateDialogueList(sourceDialogue, targetLang);
              });
            });
            translatedDialogue = transList || sourceDialogue;
            updatedScenes[idx].translations[targetLang].dialogue = translatedDialogue;
          }

          // 2. Build word-by-word timestamps in sub-language
          const voiceStartSec = (updatedScenes[idx].translations[targetLang]?.voice_start_us || sc.voice_start_us || 500_000) / 1_000_000;
          const { captions_data, words, voice_start_us, voice_duration_us } = CaptionService.buildWordLevelCaptionsFromDialogue(
            translatedDialogue,
            sceneDur,
            voiceStartSec
          );

          updatedScenes[idx].translations[targetLang].captions_data = captions_data;
          updatedScenes[idx].translations[targetLang].words = words;
          if (!updatedScenes[idx].translations[targetLang].voice_duration_us) {
            updatedScenes[idx].translations[targetLang].voice_duration_us = voice_duration_us;
            updatedScenes[idx].translations[targetLang].voice_start_us = voice_start_us;
          }

          results.push({
            sceneIndex: scIndex,
            language: targetLang,
            status: 'sub_language_caption_generated',
            captions_count: captions_data.length,
          });
        }
      }

      // Add target language to episode.caption_languages if sub-language
      const currentCapLangs = new Set(episode.caption_languages || []);
      currentCapLangs.add(targetLang);
      await db.updateEpisode(params.episodeId, {
        scenes: updatedScenes,
        caption_languages: Array.from(currentCapLangs),
      });
      try {
        const { TimelineService } = await import('@/services/TimelineService.js');
        await TimelineService.getOrBuildEpisodeTimeline(params.episodeId);
      } catch (tlErr: any) {
        Logger.warn(`[CaptionTools.generateSceneCaption] Timeline sync notice: ${tlErr.message}`);
      }

      const generatedCount = results.filter((r) => r.status.includes('generated')).length;
      return {
        success: true,
        message: `Processed ${results.length} scene caption(s) for "${targetLang}" (${isMainLang ? 'Main Language' : 'Sub-Language Translation'}) in Episode #${episode.episode_number || 1} "${episode.title}": ${generatedCount} generated, ${results.length - generatedCount} kept/skipped.`,
        data: {
          episode_id: params.episodeId,
          language: targetLang,
          is_main_language: isMainLang,
          scenes: updatedScenes,
          details: results,
        },
      };
    } catch (err: any) {
      Logger.error(`[CaptionTools] Failed to generate scene caption: ${err.message}`);
      return { success: false, message: `Failed to generate scene caption: ${err.message}`, error: err.message };
    }
  }
}

export function createCaptionTools(context?: ToolContextParams): FunctionTool[] {
  return [
    new FunctionTool({
      name: 'generate_scene_caption',
      description: 'Generate kinetic word-by-word subtitle captions for a specific scene or all scenes. For main language, existing captions are kept intact. For sub-languages, dialogue is translated and aligned with word-by-word timestamps.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          scene_index: { type: Type.NUMBER, description: 'Scene index number' },
          language_code: { type: Type.STRING, description: 'Target language code (e.g. en-US, vi-VN, ja-JP)' },
          force_regenerate: { type: Type.BOOLEAN, description: 'Force regeneration even if captions already exist' },
        },
      },
      execute: async (args: any) => {
        const ctx = getActiveChatContext();
        const userId = args.userId || args.user_id || context?.userId || ctx?.userId;
        const seriesId = args.seriesId || args.series_id || context?.seriesId || ctx?.seriesId;
        const episodeId = args.episodeId || args.episode_id || context?.episodeId || ctx?.episodeId || '1';
        const onItemUpdated = context?.onItemUpdated || ctx?.onItemUpdated;

        if (!userId) return { success: false, message: `No user selected. Please select a user first.` };
        if (!seriesId) return { success: false, message: `No series selected. Please select a series first.` };
        if (!episodeId) return { success: false, message: `No episode selected. Please select an episode first.` };

        const res = await CaptionToolExecutors.generateSceneCaption({
          userId,
          seriesId,
          episodeId,
          sceneIndex: args.scene_index || args.sceneIndex,
          languageCode: args.language_code || args.languageCode,
          forceRegenerate: args.force_regenerate || args.forceRegenerate,
        });

        if (res.success && res.data) {
          onItemUpdated?.({ type: 'captions_updated', data: res.data });
        }
        return res;
      },
    }),
  ];
}
