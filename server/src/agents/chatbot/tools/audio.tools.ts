import { FunctionTool } from '@google/adk';
import { Type } from '@google/genai';
import { getDatabaseProvider } from '@/database/index.js';
import type { SceneEntity, SceneDialogue, AssetJobItem, AssetVersion, DialogueVoiceSynthesisResult } from '@/types.js';
import { Logger } from '@/utils/logger.js';
import { generateDialogueVoiceSynthesis } from '@/routes/voices.js';
import { CaptionService } from '@/services/CaptionService.js';
import { executeWithRetry, withCreditDeduction, getActiveChatContext, type ToolContextParams, type ToolExecutionResult } from './context.js';

export class AudioToolExecutors {
  /**
   * Generate voiceover TTS for a specific scene or all scenes.
   * Rule: Main language voiceovers are kept as-is (not recreated).
   * Sub-languages are translated, synthesized with TTS, and stored in scene.translations[subLang].
   */
  static async generateSceneVoiceover(params: {
    userId: string;
    seriesId: string;
    episodeId: string;
    sceneIndex?: number;
    voiceId?: string;
    emotion?: string;
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
        return { success: false, message: `Episode "${episode.title}" has no scenes to generate voiceovers for.` };
      }

      // Determine primary / main language and target language
      const primaryLang = (series.language || episode.dubbing_languages?.[0] || 'en-US').trim();
      const targetLang = (params.languageCode || primaryLang).trim();
      const isMainLang = targetLang.toLowerCase() === primaryLang.toLowerCase();

      let targets = scenes;
      if (params.sceneIndex !== undefined) {
        targets = scenes.filter((s: SceneEntity) => Number(s.index || s.scene_number) === Number(params.sceneIndex));
        if (targets.length === 0) {
          return { success: false, message: `Scene #${params.sceneIndex} not found in Episode "${episode.title}".` };
        }
      }

      const results: Array<{ sceneIndex: number; language?: string; status: string; audio_url?: string }> = [];
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
          const existingVoice = sc.voiceover_url;
          if (!params.forceRegenerate && existingVoice) {
            results.push({
              sceneIndex: scIndex,
              language: primaryLang,
              status: 'main_language_voice_already_exists',
              audio_url: existingVoice,
            });
            await params.onItemProgress?.({
              asset: {
                id: `voice_${params.episodeId}_s${scIndex}`,
                name: `Scene #${scIndex} Voiceover`,
                type: 'voice',
                status: 'completed',
                url: existingVoice,
                scene_index: scIndex,
              },
              current: results.length,
              total: targets.length,
              description: `Scene #${scIndex} Voiceover (Ready)`,
            });
            continue;
          }

          // Synthesize voiceover for main language
          const { result } = await executeWithRetry(`Generate Main Voiceover for Scene #${scIndex}`, async () => {
            return await withCreditDeduction(params.userId, 'voiceoverTts', 'Dialogue Voiceover Synthesis', `Synthesized TTS voiceover (${primaryLang}) for Scene #${scIndex}`, async () => {
              return await generateDialogueVoiceSynthesis({
                dialogue: sourceDialogue,
                voice_id: params.voiceId,
                emotion: params.emotion,
                language: primaryLang,
                episode_id: params.episodeId,
                scene_id: sc.id || `scene_${scIndex}`,
              });
            });
          });

          const curVoiceVersions: AssetVersion[] = Array.isArray(updatedScenes[idx].voice_versions) ? [...(updatedScenes[idx].voice_versions as AssetVersion[])] : [];
          if (curVoiceVersions.length === 0 && updatedScenes[idx].voiceover_url && updatedScenes[idx].voiceover_url !== result?.audio_url) {
            curVoiceVersions.push({
              id: `v1_voice_${scIndex}`,
              image_url: updatedScenes[idx].voiceover_url,
              created_at: new Date().toISOString(),
              is_selected: false,
            });
          }
          const newVoiceVer: AssetVersion = {
            id: `ver_voice_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            image_url: '',
            voiceover_url: result?.audio_url || '',
            created_at: new Date().toISOString(),
            is_selected: true,
            model: params.voiceId,
          };
          updatedScenes[idx].voice_versions = [newVoiceVer, ...curVoiceVersions.map((v: AssetVersion) => ({ ...v, is_selected: false }))];
          updatedScenes[idx].voiceover_url = result?.audio_url;
          updatedScenes[idx].voice_duration_us = result?.duration_us || ((result?.duration_ms || 3000) * 1000);
          updatedScenes[idx].voice_start_us = result?.start_us || 500_000;

          if (result?.cues?.length) {
            updatedScenes[idx].captions_data = result.cues;
          }
          if ((result as DialogueVoiceSynthesisResult | undefined)?.words?.length) {
            updatedScenes[idx].words = (result as DialogueVoiceSynthesisResult).words;
          }

          results.push({
            sceneIndex: scIndex,
            language: primaryLang,
            status: 'main_language_voice_generated',
            audio_url: result?.audio_url,
          });

          await params.onItemProgress?.({
            asset: {
              id: `voice_${params.episodeId}_s${scIndex}`,
              name: `Scene #${scIndex} Voiceover`,
              type: 'voice',
              status: 'completed',
              url: result?.audio_url,
              scene_index: scIndex,
            },
            current: results.length,
            total: targets.length,
            description: `Synthesized Voiceover for Scene #${scIndex}`,
          });
        } else {
          // ── SUB-LANGUAGE: Translate and synthesize voiceover in subLang ────────
          if (!updatedScenes[idx].translations) {
            updatedScenes[idx].translations = {};
          }
          if (!updatedScenes[idx].translations[targetLang]) {
            updatedScenes[idx].translations[targetLang] = {};
          }

          const existingSubVoice = updatedScenes[idx].translations[targetLang]?.voiceover_url;
          if (!params.forceRegenerate && existingSubVoice) {
            results.push({
              sceneIndex: scIndex,
              language: targetLang,
              status: 'sub_language_voice_already_exists',
              audio_url: existingSubVoice,
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

          // 2. Synthesize TTS voiceover in target language
          const { result } = await executeWithRetry(`Generate Sub-language Voiceover for Scene #${scIndex}`, async () => {
            return await withCreditDeduction(params.userId, 'voiceoverTts', 'Dialogue Voiceover Synthesis', `Synthesized TTS voiceover (${targetLang}) for Scene #${scIndex}`, async () => {
              return await generateDialogueVoiceSynthesis({
                dialogue: translatedDialogue,
                voice_id: params.voiceId,
                emotion: params.emotion,
                language: targetLang,
                episode_id: params.episodeId,
                scene_id: sc.id || `scene_${scIndex}`,
              });
            });
          });

          const durUs = result?.duration_us || ((result?.duration_ms || 3000) * 1000);
          const startUs = result?.start_us || 500_000;

          updatedScenes[idx].translations[targetLang].voiceover_url = result?.audio_url;
          updatedScenes[idx].translations[targetLang].voice_duration_us = durUs;
          updatedScenes[idx].translations[targetLang].voice_start_us = startUs;

          // 3. Align kinetic word-level captions for sub-language
          if (result?.cues?.length) {
            updatedScenes[idx].translations[targetLang].captions_data = result.cues;
          } else {
            const wordCaptions = CaptionService.buildWordLevelCaptionsFromDialogue(translatedDialogue, sceneDur, startUs / 1_000_000);
            updatedScenes[idx].translations[targetLang].captions_data = wordCaptions.captions_data;
            if (!updatedScenes[idx].translations[targetLang].words) {
              updatedScenes[idx].translations[targetLang].words = wordCaptions.words;
            }
          }

          if ((result as any)?.words?.length) {
            updatedScenes[idx].translations[targetLang].words = (result as any).words;
          }

          results.push({
            sceneIndex: scIndex,
            language: targetLang,
            status: 'sub_language_voice_generated',
            audio_url: result?.audio_url,
          });
        }
      }

      // Add target language to episode.dubbing_languages if sub-language
      const currentDubLangs = new Set(episode.dubbing_languages || []);
      currentDubLangs.add(targetLang);
      await db.updateEpisode(params.episodeId, {
        scenes: updatedScenes,
        dubbing_languages: Array.from(currentDubLangs),
      });
      try {
        const { TimelineService } = await import('@/services/TimelineService.js');
        await TimelineService.getOrBuildEpisodeTimeline(params.episodeId);
      } catch (tlErr: any) {
        Logger.warn(`[AudioTools.generateSceneVoiceover] Timeline sync notice: ${tlErr.message}`);
      }

      const generatedCount = results.filter((r) => r.status.includes('generated')).length;
      return {
        success: true,
        message: `Processed ${results.length} scene voiceover(s) for "${targetLang}" (${isMainLang ? 'Main Language' : 'Sub-Language Translation'}) in Episode #${episode.episode_number || 1} "${episode.title}": ${generatedCount} generated, ${results.length - generatedCount} kept/skipped.`,
        data: {
          episode_id: params.episodeId,
          language: targetLang,
          is_main_language: isMainLang,
          scenes: updatedScenes,
          details: results,
        },
      };
    } catch (err: any) {
      Logger.error(`[AudioTools] Failed to generate scene voiceover: ${err.message}`);
      return { success: false, message: `Failed to generate scene voiceover: ${err.message}`, error: err.message };
    }
  }

  /**
   * Generate or extract background music (BGM) for a scene.
   * If scene has video and dialogue, extracts clean BGM stem using Demucs.
   * Otherwise, generates AI BGM soundtrack via SfxService.
   */
  static async generateSceneBgm(params: {
    userId: string;
    seriesId: string;
    episodeId: string;
    sceneIndex?: number;
    forceRegenerate?: boolean;
  }): Promise<ToolExecutionResult> {
    try {
      const db = await getDatabaseProvider();
      const episode = await db.getEpisodeById(params.episodeId);
      if (!episode) return { success: false, message: `Episode ${params.episodeId} not found` };

      const scenes = (episode.scenes || []) as SceneEntity[];
      const targetScene = params.sceneIndex !== undefined
        ? scenes.find(s => Number(s.index || s.scene_number) === Number(params.sceneIndex))
        : scenes[0];

      if (!targetScene) {
        return { success: false, message: `Scene not found in Episode "${episode.title}"` };
      }

      const hasDialogue = Array.isArray(targetScene.dialogue) && targetScene.dialogue.length > 0 && targetScene.dialogue.some(d => (d.line || '').trim().length > 0);

      let bgmUrl = '';
      if (targetScene.video_url && hasDialogue) {
        // Extract clean BGM from video using Demucs
        const { DemucsAudioService } = await import('@/services/DemucsAudioService.js');
        const sep = await DemucsAudioService.separateStem(targetScene.video_url);
        bgmUrl = sep?.bgmUrl || '';
      }

      if (!bgmUrl) {
        // Generate AI BGM soundtrack via SfxService
        const { SfxService } = await import('@/services/SfxService.js');
        const series = await db.getSeriesById(params.seriesId);
        const sfxRes = await SfxService.getSceneAudio({
          prompt: targetScene.bgm_mood || `${series?.genre || 'cinematic'} background score`,
          duration: Number(targetScene.duration_seconds) || 15,
        });
        bgmUrl = sfxRes.audioUrl;
      }

      if (bgmUrl) {
        const scIdx = scenes.findIndex(s => s.id === targetScene.id || s.index === targetScene.index);
        if (scIdx >= 0) {
          const curBgmVersions: AssetVersion[] = Array.isArray(scenes[scIdx].bgm_versions) ? [...(scenes[scIdx].bgm_versions as AssetVersion[])] : [];
          if (curBgmVersions.length === 0 && scenes[scIdx].bgm_url && scenes[scIdx].bgm_url !== bgmUrl) {
            curBgmVersions.push({
              id: `v1_bgm_${targetScene.index || scIdx + 1}`,
              image_url: scenes[scIdx].bgm_url,
              created_at: new Date().toISOString(),
              is_selected: false,
            });
          }
          const newBgmVer: AssetVersion = {
            id: `ver_bgm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            image_url: bgmUrl,
            created_at: new Date().toISOString(),
            is_selected: true,
          };
          scenes[scIdx].bgm_versions = [newBgmVer, ...curBgmVersions.map((v: AssetVersion) => ({ ...v, is_selected: false }))];
          scenes[scIdx].bgm_url = bgmUrl;
          await db.updateEpisode(params.episodeId, { scenes });
          try {
            const { TimelineService } = await import('@/services/TimelineService.js');
            await TimelineService.getOrBuildEpisodeTimeline(params.episodeId);
          } catch (tlErr: any) {
            Logger.warn(`[AudioTools.generateSceneBgm] Timeline sync notice: ${tlErr.message}`);
          }
        }
      }

      return {
        success: true,
        message: `BGM generated/extracted successfully for Scene #${targetScene.index || 1}`,
        data: {
          scene_index: targetScene.index,
          bgm_url: bgmUrl,
          audio_url: bgmUrl,
        },
      };
    } catch (err: any) {
      Logger.error(`[AudioTools.generateSceneBgm] Error: ${err.message}`);
      return { success: false, message: `Failed to generate BGM: ${err.message}`, error: err.message };
    }
  }
}

export function createAudioTools(context?: ToolContextParams): FunctionTool[] {
  return [
    new FunctionTool({
      name: 'generate_scene_voiceover',
      description: 'Synthesize neural TTS voiceover for a specific scene or all scenes. For main language, existing voiceovers are kept intact. For sub-languages, dialogue is translated and synthesized with target-language TTS.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          scene_index: { type: Type.NUMBER, description: 'Scene index number' },
          voice_id: { type: Type.STRING, description: 'Voice ID preset' },
          emotion: { type: Type.STRING, description: 'Emotion tone' },
          language_code: { type: Type.STRING, description: 'Target language code (e.g. en-US, vi-VN, ja-JP)' },
          force_regenerate: { type: Type.BOOLEAN, description: 'Force regeneration' },
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

        const res = await AudioToolExecutors.generateSceneVoiceover({
          userId,
          seriesId,
          episodeId,
          sceneIndex: args.scene_index || args.sceneIndex,
          voiceId: args.voice_id || args.voiceId,
          emotion: args.emotion,
          languageCode: args.language_code || args.languageCode,
          forceRegenerate: args.force_regenerate || args.forceRegenerate,
        });

        if (res.success && res.data) {
          onItemUpdated?.({ type: 'voiceovers_updated', data: res.data });
        }
        return res;
      },
    }),
  ];
}
