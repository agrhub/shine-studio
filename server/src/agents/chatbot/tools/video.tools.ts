import { FunctionTool } from '@google/adk';
import { Type } from '@google/genai';
import { getDatabaseProvider } from '@/database/index.js';
import { Logger } from '@/utils/logger.js';
import { videoService } from '@/services/VideoService.js';
import { EntityNormalizer } from '@/utils/EntityNormalizer.js';
import { executeWithRetry, getActiveChatContext, type ToolContextParams, type ToolExecutionResult } from './context.js';
import type { SceneEntity, AssetJobItem, AssetVersion } from '@/types.js';

export class VideoToolExecutors {
  /**
   * Generate video clip using motion models (Image-to-Video) for a scene shot
   */
  static async generateSceneVideo(params: {
    userId?: string;
    seriesId: string;
    episodeId: string;
    sceneIndex?: number;
    motionStrength?: number;
    forceRegenerate?: boolean;
    onItemProgress?: (item: { asset: AssetJobItem; current: number; total: number; description: string }) => Promise<void> | void;
  }): Promise<ToolExecutionResult> {
    try {
      const db = await getDatabaseProvider();
      const series = await db.getSeriesById(params.seriesId);
      if (!series) return { success: false, message: `Series ${params.seriesId} not found` };

      const episode = await db.getEpisodeById(params.episodeId);
      if (!episode) return { success: false, message: `Episode ${params.episodeId} not found` };

      const scenes: SceneEntity[] = (episode.scenes || []) as SceneEntity[];
      if (scenes.length === 0) {
        return { success: false, message: `Episode "${episode.title}" has no scenes to generate video clips for.` };
      }

      let targets = scenes;
      if (params.sceneIndex !== undefined) {
        targets = scenes.filter((s: SceneEntity) => Number(s.index || s.scene_number) === Number(params.sceneIndex));
        if (targets.length === 0) {
          return { success: false, message: `Scene #${params.sceneIndex} not found in Episode "${episode.title}".` };
        }
      }

      // Validate visual prerequisites
      const unready = targets.filter((s: SceneEntity) => !s.storyboard_frame_url && !s.image_url);
      if (unready.length > 0) {
        const missingList = unready.map((s: SceneEntity) => `#${s.index || s.scene_number || '?'}`).join(', ');
        return {
          success: false,
          message: `Cannot generate video: Prerequisite storyboard image(s) for scene(s) ${missingList} are not ready. Please generate storyboard frames first (b2).`,
        };
      }

      const results: Array<{ sceneIndex: number; status: string; video_url?: string; error?: string }> = [];
      const updatedScenes: SceneEntity[] = [...scenes];

      for (const sc of targets) {
        const scIndex = Number(sc.index || sc.scene_number);
        const startFrame = sc.storyboard_frame_url || sc.image_url;
        const endFrame = sc.storyboard_end_frame_url;
        const customPrompt = `${sc.visual_prompt || ''}, ${sc.end_frame_prompt || ''}, ${sc.action || ''}`;

        if (!params.forceRegenerate && sc.video_url) {
          results.push({ sceneIndex: scIndex, status: 'already_exists', video_url: sc.video_url });
          await params.onItemProgress?.({
            asset: {
              id: `vid_${params.episodeId}_s${scIndex}`,
              name: `Scene #${scIndex} Video Clip`,
              type: 'video',
              status: 'completed',
              url: sc.video_url,
              thumbnail: startFrame,
              scene_index: scIndex,
            },
            current: results.length,
            total: targets.length,
            description: `Scene #${scIndex} Video Clip (Ready)`,
          });
          continue;
        }

        try {
          const { result } = await executeWithRetry(`Generate Video Clip for Scene #${scIndex}`, async () => {
            return await videoService.generateSceneVideo({
              user_id: params.userId || 'system',
              series_id: params.seriesId,
              episode_id: params.episodeId,
              scene_id: sc.id || `scene_${scIndex}`,
              start_frame_url: startFrame,
              end_frame_url: endFrame,
              prompt: customPrompt,
              duration: sc.duration_seconds || 5,
              aspect_ratio: series.ratio,
              scene_data: sc,
            });
          });

          const videoUrl = result?.url;
          const idx = updatedScenes.findIndex((s) => Number(s.index || s.scene_number) === scIndex);
          if (idx >= 0 && videoUrl) {
            const curVidVersions: AssetVersion[] = Array.isArray(updatedScenes[idx].video_versions) ? [...(updatedScenes[idx].video_versions as AssetVersion[])] : [];
            if (curVidVersions.length === 0 && updatedScenes[idx].video_url && updatedScenes[idx].video_url !== videoUrl) {
              curVidVersions.push({
                id: `v1_vid_${scIndex}`,
                image_url: updatedScenes[idx].video_url,
                created_at: new Date().toISOString(),
                is_selected: false,
              });
            }
            const newVidVer: AssetVersion = {
              id: `ver_vid_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              image_url: videoUrl,
              prompt: customPrompt,
              created_at: new Date().toISOString(),
              is_selected: true,
              aspect_ratio: '9:16',
            };
            updatedScenes[idx] = {
              ...updatedScenes[idx],
              video_url: videoUrl,
              video_versions: [newVidVer, ...curVidVersions.map((v: AssetVersion) => ({ ...v, is_selected: false }))],
              bgm_url: result?.bgmUrl || updatedScenes[idx].bgm_url,
              voiceover_url: result?.voiceoverUrl || updatedScenes[idx].voiceover_url,
              captions_data: result?.captionsData?.length ? result.captionsData : updatedScenes[idx].captions_data,
            };
          }

          results.push({ sceneIndex: scIndex, status: 'generated', video_url: videoUrl });

          await params.onItemProgress?.({
            asset: {
              id: `vid_${params.episodeId}_s${scIndex}`,
              name: `Scene #${scIndex} Video Clip`,
              type: 'video',
              status: 'completed',
              url: videoUrl,
              thumbnail: startFrame,
              scene_index: scIndex,
            },
            current: results.length,
            total: targets.length,
            description: `Synthesized Video Clip for Scene #${scIndex}`,
          });
        } catch (scErr: any) {
          results.push({ sceneIndex: scIndex, status: 'failed', error: scErr.message });
          await params.onItemProgress?.({
            asset: {
              id: `vid_${params.episodeId}_s${scIndex}`,
              name: `Scene #${scIndex} Video Clip`,
              type: 'video',
              status: 'failed',
              scene_index: scIndex,
            },
            current: results.length,
            total: targets.length,
            description: `Failed Scene #${scIndex} Video Clip: ${scErr.message}`,
          });
        }
      }

      await db.updateEpisode(params.episodeId, { scenes: updatedScenes });
      try {
        const { TimelineService } = await import('@/services/TimelineService.js');
        await TimelineService.getOrBuildEpisodeTimeline(params.episodeId);
      } catch (tlErr: any) {
        Logger.warn(`[VideoTools.generateSceneVideo] Timeline sync notice: ${tlErr.message}`);
      }
      try {
        const { PatchSyncService } = await import('@/realtime/PatchSyncService.js');
        const updatedEp = await db.getEpisodeById(params.episodeId);
        if (updatedEp) {
          PatchSyncService.broadcast(params.seriesId, 'episode:updated', updatedEp);
        }
      } catch (wsErr: any) {
        Logger.warn(`[VideoTools.generateSceneVideo] WebSocket broadcast notice: ${wsErr.message}`);
      }

      const failedResults = results.filter((r) => r.status === 'failed');
      if (failedResults.length > 0) {
        const errorDetails = failedResults.map((f) => `Scene #${f.sceneIndex}: ${f.error}`).join('; ');
        return {
          success: false,
          message: `Failed to generate video clip(s) for ${failedResults.length} scene(s): ${errorDetails}`,
          error: errorDetails,
          data: { episode_id: params.episodeId, scenes: updatedScenes, details: results },
        };
      }

      const generatedCount = results.filter((r) => r.status === 'generated').length;
      return {
        success: true,
        message: `Successfully processed ${results.length} video clip(s) (${generatedCount} generated, ${results.length - generatedCount} existing) for Episode #${episode.episode_number || 1} "${episode.title}".`,
        data: { episode_id: params.episodeId, scenes: updatedScenes, details: results },
      };
    } catch (err: any) {
      Logger.error(`[VideoTools] Failed to generate scene video: ${err.message}`);
      return { success: false, message: `Failed to generate scene video: ${err.message}`, error: err.message };
    }
  }
}

export function createVideoTools(context?: ToolContextParams): FunctionTool[] {
  return [
    new FunctionTool({
      name: 'generate_scene_video',
      description: 'Generate AI video clips (Image-to-Video) for scenes using motion models.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          scene_index: { type: Type.NUMBER, description: 'Scene index number' },
          motion_strength: { type: Type.NUMBER, description: 'Motion strength (1-10)' },
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
        const res = await VideoToolExecutors.generateSceneVideo({
          userId,
          seriesId,
          episodeId,
          sceneIndex: args.scene_index || args.sceneIndex,
          motionStrength: args.motion_strength || args.motionStrength,
          forceRegenerate: args.force_regenerate || args.forceRegenerate,
        });
        if (res.success && res.data) {
          onItemUpdated?.({ type: 'videos_updated', data: res.data });
        }
        return res;
      },
    }),
  ];
}
