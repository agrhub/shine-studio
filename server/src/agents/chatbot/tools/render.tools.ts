import { FunctionTool } from '@google/adk';
import { Type } from '@google/genai';
import { getDatabaseProvider } from '@/database/index.js';
import { Logger } from '@/utils/logger.js';
import { compositorWorker, type RenderJobState } from '@/services/compositor/CompositorWorker.js';
import { TimelineService } from '@/services/TimelineService.js';
import { generateDialogueVoiceSynthesis } from '@/routes/voices.js';
import { generateCaptionsInternal } from '@/routes/captions.js';
import { EntityNormalizer } from '@/utils/EntityNormalizer.js';
import { CaptionService } from '@/services/CaptionService.js';
import { withCreditDeduction, getActiveChatContext, type ToolContextParams, type ToolExecutionResult } from './context.js';

export class RenderToolExecutors {
  /**
   * Render the complete final episode video using CompositorWorker
   */
  static async renderEpisodeVideo(params: {
    userId?: string;
    seriesId: string;
    episodeId: string;
    languageCode?: string;
    dubbingLanguages?: string[];
    captionLanguages?: string[];
    noCaptions?: boolean;
    forceRegenerate?: boolean;
    pipelineJobId?: string;
  }): Promise<ToolExecutionResult> {
    try {
      const db = await getDatabaseProvider();
      const series = await db.getSeriesById(params.seriesId);
      if (!series) return { success: false, message: `Series ${params.seriesId} not found` };

      const episode = await db.getEpisodeById(params.episodeId);
      if (!episode) return { success: false, message: `Episode ${params.episodeId} not found` };

      const rawScenes = (episode.scenes || []) as any[];
      if (rawScenes.length === 0) {
        return { success: false, message: `Cannot render episode video: Episode "${episode.title}" has no scenes.` };
      }

      // Validate visual prerequisites
      const unreadyScenes = rawScenes.filter((s: any) => !s.video_url && !s.storyboard_frame_url && !s.image_url);
      if (unreadyScenes.length > 0) {
        const missingList = unreadyScenes.map((s: any) => `#${s.index || '?'}`).join(', ');
        return {
          success: false,
          message: `Cannot render final video: Prerequisite scene visuals are not ready. Scene(s) ${missingList} do not have video clips or storyboard frames. Please run step b2/b3 first.`,
        };
      }

      const epAny = episode as any;
      if (!params.forceRegenerate && (episode.video_url || (epAny.video_urls && Object.values(epAny.video_urls)[0]))) {
        const existingUrl = episode.video_url || Object.values(epAny.video_urls || {})[0];
        return {
          success: true,
          message: `Episode "${episode.title}" final video already rendered: ${existingUrl}`,
          data: {
            episode_id: params.episodeId,
            video_url: existingUrl,
            status: episode.status || 'RENDER',
            outputs_by_lang: epAny.video_urls,
            render_versions: epAny.render_versions || [],
          },
        };
      }

      const primaryLang = episode.dubbing_languages?.[0] || episode.caption_languages?.[0] || series.language || 'en-US';

      // 1. Resolve dubbing languages
      let dubbingLangs: string[] = [];
      if (params.dubbingLanguages?.length) {
        dubbingLangs = params.dubbingLanguages.map((l) => l.trim()).filter(Boolean);
      } else if (params.languageCode) {
        dubbingLangs = [params.languageCode.trim()];
      } else if (episode.dubbing_languages?.length) {
        dubbingLangs = [...episode.dubbing_languages];
      } else {
        dubbingLangs = [primaryLang];
      }

      // 2. Resolve caption languages
      let captionLangs: string[] = [];
      const hasExplicitNoCaptions =
        params.noCaptions === true || (Array.isArray(params.captionLanguages) && params.captionLanguages.length === 0);
      if (hasExplicitNoCaptions) {
        captionLangs = [];
      } else if (params.captionLanguages?.length) {
        captionLangs = params.captionLanguages.map((l) => l.trim()).filter(Boolean);
      } else if (params.languageCode) {
        captionLangs = [params.languageCode.trim()];
      } else if (episode.caption_languages?.length) {
        captionLangs = [...episode.caption_languages];
      } else {
        captionLangs = [primaryLang];
      }

      let episodeUpdated = false;
      const scenesList = [...rawScenes];

      // 3. Auto-provision missing DUBBING language TTS
      for (const dLang of dubbingLangs) {
        const isPrimary = dLang === primaryLang;
        for (const sc of scenesList) {
          const rawDiag = sc.dialogue || [];
          const hasSourceDiag = Array.isArray(rawDiag) ? rawDiag.length > 0 && rawDiag.some((d: any) => (d.line || '').trim()) : Boolean(String(rawDiag || '').trim());
          if (!hasSourceDiag) continue;

          // If sub-language dialogue translation is missing, translate now
          if (!isPrimary) {
            if (!sc.translations) sc.translations = {};
            if (!sc.translations[dLang]) sc.translations[dLang] = {};
            if (!Array.isArray(sc.translations[dLang].dialogue) || sc.translations[dLang].dialogue.length === 0) {
              try {
                Logger.info(`[RenderTools] Translating Scene #${sc.index || 1} dialogue to ${dLang}...`);
                const translated = await CaptionService.translateDialogueList(rawDiag, dLang);
                sc.translations[dLang].dialogue = translated;
                episodeUpdated = true;
              } catch (trErr: any) {
                Logger.warn(`[RenderTools] Translation failed for Scene #${sc.index} (${dLang}): ${trErr.message}`);
              }
            }
          }

          const diag = isPrimary ? rawDiag : (sc.translations?.[dLang]?.dialogue || rawDiag);
          const existingVo = sc.translations?.[dLang]?.voiceover_url || (isPrimary ? sc.voiceover_url : null);

          if (!existingVo) {
            Logger.info(`[RenderTools] Generating missing TTS voiceover for scene #${sc.index || 1} (${dLang})...`);
            try {
              const ttsRes = await generateDialogueVoiceSynthesis({
                dialogue: Array.isArray(diag) ? diag : [{ character: 'Character', line: String(diag), emotion: 'neutral', speech_tone: 'natural' }],
                language: dLang,
                episode_id: params.episodeId,
                scene_id: sc.id || `scene_${sc.index || 1}`,
              });
              if (ttsRes?.audio_url) {
                if (!sc.translations) sc.translations = {};
                if (!sc.translations[dLang]) sc.translations[dLang] = {};
                sc.translations[dLang].voiceover_url = ttsRes.audio_url;
                sc.translations[dLang].voice_duration_us = ttsRes.duration_us || ttsRes.duration_ms * 1000;
                if (ttsRes.cues?.length) {
                  sc.translations[dLang].captions_data = ttsRes.cues;
                }
                if (isPrimary && !sc.voiceover_url) {
                  sc.voiceover_url = ttsRes.audio_url;
                }
                episodeUpdated = true;
              }
            } catch (ttsErr: any) {
              Logger.warn(`[RenderTools] Failed to auto-generate TTS for scene #${sc.index} (${dLang}): ${ttsErr.message}`);
            }
          }
        }
        if (!episode.dubbing_languages?.includes(dLang)) {
          if (!episode.dubbing_languages) episode.dubbing_languages = [];
          episode.dubbing_languages.push(dLang);
          episodeUpdated = true;
        }
      }

      // 4. Auto-provision missing CAPTION language cues with word-by-word alignment
      for (const cLang of captionLangs) {
        if (cLang === 'none') continue;
        const isPrimary = cLang === primaryLang;
        for (const sc of scenesList) {
          const rawDiag = sc.dialogue || [];
          const hasSourceDiag = Array.isArray(rawDiag) ? rawDiag.length > 0 && rawDiag.some((d: any) => (d.line || '').trim()) : Boolean(String(rawDiag || '').trim());
          if (!hasSourceDiag) continue;

          // If sub-language dialogue translation is missing, translate now
          if (!isPrimary) {
            if (!sc.translations) sc.translations = {};
            if (!sc.translations[cLang]) sc.translations[cLang] = {};
            if (!Array.isArray(sc.translations[cLang].dialogue) || sc.translations[cLang].dialogue.length === 0) {
              try {
                Logger.info(`[RenderTools] Translating Scene #${sc.index || 1} captions to ${cLang}...`);
                const translated = await CaptionService.translateDialogueList(rawDiag, cLang);
                sc.translations[cLang].dialogue = translated;
                episodeUpdated = true;
              } catch (trErr: any) {
                Logger.warn(`[RenderTools] Translation failed for Scene #${sc.index} (${cLang}): ${trErr.message}`);
              }
            }
          }

          const existingCaptions = sc.translations?.[cLang]?.captions_data || (isPrimary ? sc.captions_data : null);

          if (!existingCaptions || existingCaptions.length === 0) {
            Logger.info(`[RenderTools] Generating kinetic word-by-word captions for scene #${sc.index || 1} (${cLang})...`);
            const targetDialogue = isPrimary ? rawDiag : (sc.translations?.[cLang]?.dialogue || rawDiag);
            const sceneDur = Number(sc.duration_seconds) || 6;
            const voiceStartSec = ((isPrimary ? sc.voice_start_us : sc.translations?.[cLang]?.voice_start_us) || 500_000) / 1_000_000;

            const { captions_data, words, voice_start_us, voice_duration_us } = CaptionService.buildWordLevelCaptionsFromDialogue(
              targetDialogue,
              sceneDur,
              voiceStartSec
            );

            if (captions_data.length > 0) {
              if (!sc.translations) sc.translations = {};
              if (!sc.translations[cLang]) sc.translations[cLang] = {};
              sc.translations[cLang].captions_data = captions_data;
              sc.translations[cLang].words = words;
              if (!sc.translations[cLang].voice_duration_us) {
                sc.translations[cLang].voice_duration_us = voice_duration_us;
                sc.translations[cLang].voice_start_us = voice_start_us;
              }
              if (isPrimary && (!sc.captions_data || sc.captions_data.length === 0)) {
                sc.captions_data = captions_data;
                sc.words = words;
              }
              episodeUpdated = true;
            }
          }
        }
        if (!episode.caption_languages?.includes(cLang)) {
          if (!episode.caption_languages) episode.caption_languages = [];
          episode.caption_languages.push(cLang);
          episodeUpdated = true;
        }
      }

      if (episodeUpdated) {
        await db.updateEpisode(params.episodeId, {
          scenes: scenesList,
          dubbing_languages: episode.dubbing_languages,
          caption_languages: episode.caption_languages,
        });
        const currentTimeline = await db.getLatestTimeline(params.episodeId);
        if (currentTimeline) {
          const syncedTimeline = TimelineService.syncTimelineWithScenes(episode, currentTimeline);
          await db.saveTimeline(params.episodeId, syncedTimeline, { id: 'system', name: 'Studio System' }, 'Synchronized timeline with latest languages');
        }
      }

      if (params.userId) {
        try {
          await withCreditDeduction(params.userId, 'videoRender', 'Final Episode Video Render', `Rendered final video for Episode #${episode.episode_number || 1}`, async () => {});
        } catch (cErr: any) {
          Logger.warn(`[RenderTools] Credit deduction notice: ${cErr.message}`);
        }
      }

      Logger.info(`[RenderTools] Starting Headless CompositorWorker export for Episode #${episode.episode_number || 1} "${episode.title}" (Dubbing: [${dubbingLangs.join(', ')}], Captions: [${captionLangs.length ? captionLangs.join(', ') : 'None (No Subtitles)'}])...`);

      const job = compositorWorker.createJob({
        series_id: params.seriesId,
        episode_id: params.episodeId,
        pipeline_job_id: params.pipelineJobId,
        dubbing_languages: dubbingLangs,
        caption_languages: captionLangs,
      });

      const finalJob: RenderJobState = await new Promise((resolve, reject) => {
        // Extended safety timeout (60 minutes) to allow remote Cloud Run workers or local rendering to finish smoothly
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('CompositorWorker render job timed out after 30 minutes'));
        }, 60*60*1000);

        const onCompleted = (completedJob: RenderJobState) => {
          if (completedJob.jobId === job.jobId) {
            cleanup();
            resolve(completedJob);
          }
        };

        const onStatus = (statusJob: RenderJobState) => {
          if (statusJob.jobId === job.jobId && statusJob.status === 'failed') {
            cleanup();
            reject(new Error(statusJob.error || 'OpenVideo Compositor render failed'));
          }
        };

        const cleanup = () => {
          clearTimeout(timeout);
          compositorWorker.off('completed', onCompleted);
          compositorWorker.off('status', onStatus);
        };

        compositorWorker.on('completed', onCompleted);
        compositorWorker.on('status', onStatus);
      });

      const outputsByLang = finalJob.outputsByLang || {};
      const targetLangKey = params.languageCode || dubbingLangs?.[0] || primaryLang;
      const videoUrl = outputsByLang[targetLangKey] || finalJob.outputUrl || Object.values(outputsByLang)[0] || '';

      const mergedOutputs = {
        ...(epAny.video_urls || {}),
        ...outputsByLang,
      };

      const existingVersions = Array.isArray(epAny.render_versions) ? [...epAny.render_versions] : [];
      const newVersionNumber = existingVersions.length + 1;
      const newVersion = {
        version_id: `ver_${Date.now()}_v${newVersionNumber}`,
        version_number: newVersionNumber,
        rendered_at: new Date().toISOString(),
        status: 'RENDER' as const,
        video_url: videoUrl,
        video_urls_by_lang: mergedOutputs,
        languages: Object.keys(mergedOutputs),
        duration: episode.duration || 90,
        notes: `Rendered via CompositorWorker with ${Object.keys(mergedOutputs).length} language track(s)`,
      };
      existingVersions.push(newVersion);

      const coverThumb =
        scenesList.find((s: any) => s.storyboard_frame_url || s.image_url)?.storyboard_frame_url ||
        scenesList.find((s: any) => s.storyboard_frame_url || s.image_url)?.image_url ||
        episode.cover_image ||
        '';

      await db.updateEpisode(params.episodeId, {
        video_url: videoUrl,
        video_urls: mergedOutputs,
        cover_image: coverThumb,
        render_versions: existingVersions,
        status: 'RENDER',
      });

      return {
        success: true,
        message: `Successfully rendered final video (v${newVersionNumber}) for Episode #${episode.episode_number || 1} "${episode.title}"!\n\nVideo URL: ${videoUrl}`,
        data: {
          episode_id: params.episodeId,
          version: newVersion,
          video_url: videoUrl,
          status: 'RENDER',
          outputs_by_lang: mergedOutputs,
          all_versions: existingVersions,
        },
      };
    } catch (err: any) {
      Logger.error(`[RenderTools] Failed to render episode video: ${err.message}`);
      return { success: false, message: `Failed to render episode video: ${err.message}`, error: err.message };
    }
  }

  /**
   * Approve episode video and mark as ready for release
   */
  static async approveEpisodeVideo(params: {
    userId?: string;
    seriesId: string;
    episodeId: string;
    notes?: string;
  }): Promise<ToolExecutionResult> {
    try {
      const db = await getDatabaseProvider();
      const episode = await db.getEpisodeById(params.episodeId);
      if (!episode) return { success: false, message: `Episode ${params.episodeId} not found` };

      if (!episode.video_url && !(episode as any).video_urls) {
        return { success: false, message: `Cannot approve: Episode "${episode.title}" has no rendered video yet.` };
      }

      await db.updateEpisode(params.episodeId, {
        status: 'COMPLETED' as any,
      });

      return {
        success: true,
        message: `Episode #${episode.episode_number || 1} "${episode.title}" video approved and marked as COMPLETED!`,
        data: { episode_id: params.episodeId, status: 'COMPLETED', video_url: episode.video_url },
      };
    } catch (err: any) {
      Logger.error(`[RenderTools] Failed to approve episode video: ${err.message}`);
      return { success: false, message: `Failed to approve episode video: ${err.message}`, error: err.message };
    }
  }
}

export function createRenderTools(context?: ToolContextParams): FunctionTool[] {
  return [
    new FunctionTool({
      name: 'render_episode_video',
      description: 'Render the complete final 9:16 episode video with CompositorWorker. Supports custom dubbing and subtitle languages, auto-generating missing TTS or word-by-word captions, or rendering with NO subtitles if requested.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          language_code: { type: Type.STRING, description: 'Primary language code (e.g. vi-VN, en-US, ja-JP)' },
          dubbing_languages: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Target dubbing languages (e.g. ["vi-VN", "en-US"]). Auto-generates TTS if missing.' },
          caption_languages: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Target subtitle caption languages (e.g. ["vi-VN"]). Pass empty array [] if user requests NO subtitles.' },
          no_captions: { type: Type.BOOLEAN, description: 'Set to true if user explicitly requested video WITHOUT any subtitles / captions.' },
          force_regenerate: { type: Type.BOOLEAN, description: 'Force re-render even if video exists' },
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

        const { PipelineJobService } = await import('@/services/PipelineJobService.js');
        const { job, is_new } = await PipelineJobService.startOrGetPipelineJob({
          user_id: userId,
          series_id: seriesId,
          episode_id: episodeId,
          type: 'render',
          force_regenerate: args.force_regenerate || args.forceRegenerate,
        });

        onItemUpdated?.({ type: 'job_started', data: job });

        return {
          success: true,
          message: is_new
            ? `🎬 Video Render Job **${job.id}** has been started in the background!\n- Status: ${job.status}\n- Progress: ${job.progress}%\n- You can monitor progress in the Job Popover or I will notify you once rendering is completed.`
            : `⚡ Video Render Job **${job.id}** is already in progress (${job.progress}% - ${job.current_step}).`,
          data: {
            job_id: job.id,
            status: job.status,
            progress: job.progress,
            current_step: job.current_step,
            is_new,
          },
        };
      },
    }),

    new FunctionTool({
      name: 'approve_episode_video',
      description: 'Mark the rendered episode video as approved and ready for distribution.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          notes: { type: Type.STRING, description: 'Optional approval notes' },
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
        const res = await RenderToolExecutors.approveEpisodeVideo({
          userId,
          seriesId,
          episodeId,
          notes: args.notes,
        });
        if (res.success && res.data) {
          onItemUpdated?.({ type: 'episode_approved', data: res.data });
        }
        return res;
      },
    }),
  ];
}
