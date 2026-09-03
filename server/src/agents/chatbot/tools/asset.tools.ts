import { FunctionTool } from '@google/adk';
import { Type } from '@google/genai';
import { getDatabaseProvider } from '@/database/index.js';
import { Logger } from '@/utils/logger.js';
import { AssetService } from '@/services/AssetService.js';
import { EntityNormalizer } from '@/utils/EntityNormalizer.js';
import { executeWithRetry, getActiveChatContext, type ToolContextParams, type ToolExecutionResult } from './context.js';
import type { LocationAsset, PropAsset, SceneEntity, EpisodeEntity, AssetJobItem } from '@/types.js';

export class AssetToolExecutors {
  /**
   * Generate environmental concept art for single location or all locations
   */
  static async generateLocationAsset(params: {
    userId: string;
    seriesId: string;
    episodeId: string;
    locationName?: string;
    locationId?: string;
    forceRegenerate?: boolean;
    onItemProgress?: (item: { asset: AssetJobItem; current: number; total: number; description: string }) => Promise<void> | void;
  }): Promise<ToolExecutionResult> {
    try {
      const db = await getDatabaseProvider();
      const series = await db.getSeriesById(params.seriesId);
      if (!series) return { success: false, message: `Series ${params.seriesId} not found` };

      let episode: EpisodeEntity | null = null;
      if (params.episodeId) {
        episode = await db.getEpisodeById(params.episodeId);
      }

      const allLocations: LocationAsset[] = (series?.locations || []) as LocationAsset[];
      if (allLocations.length === 0) {
        return { success: false, message: `Series "${series.title}" has no locations defined.` };
      }

      let targets = allLocations;
      if (params.locationName) {
        const found = allLocations.filter(
          (l) => l.name.toLowerCase().includes(params.locationName!.toLowerCase())
        );
        if (found.length > 0) targets = found;
      } else if (params.locationId) {
        const found = allLocations.filter((l) => l.id === params.locationId);
        if (found.length > 0) targets = found;
      }

      const results: Array<{ name: string; status: string; image_url?: string }> = [];
      const updatedLocations: LocationAsset[] = [...allLocations];

      for (const loc of targets) {
        const existingUrl = loc.image_url;
        if (!params.forceRegenerate && existingUrl) {
          results.push({ name: loc.name, status: 'already_exists', image_url: existingUrl });
          await params.onItemProgress?.({
            asset: {
              id: loc.id,
              name: `Location: ${loc.name}`,
              type: 'location',
              status: 'completed',
              url: existingUrl,
              thumbnail: existingUrl,
            },
            current: results.length,
            total: targets.length,
            description: `Location: ${loc.name} (Ready)`,
          });
          continue;
        }

        const { result } = await executeWithRetry(`Generate Location Concept for "${loc.name}"`, async () => {
          return await AssetService.generateLocationAsset({
            series_id: params.seriesId,
            episode_id: params.episodeId,
            location_id: loc.id,
            name: loc.name,
            physical_characteristics: loc.physical_characteristics,
            time_of_day: loc.time_of_day,
            visual_style: series.visual_style,
            user_id: params.userId,
          });
        });

        const idx = updatedLocations.findIndex((l) => l.id === loc.id || l.name === loc.name);
        if (idx >= 0) {
          updatedLocations[idx] = result.location;
        }

        results.push({ name: loc.name, status: 'generated', image_url: result.image_url });

        await params.onItemProgress?.({
          asset: {
            id: loc.id,
            name: `Location: ${loc.name}`,
            type: 'location',
            status: 'completed',
            url: result.image_url,
            thumbnail: result.image_url,
          },
          current: results.length,
          total: targets.length,
          description: `Generated Location: ${loc.name}`,
        });
      }

      await db.updateSeries(params.seriesId, { locations: updatedLocations });

      const generatedCount = results.filter((r) => r.status === 'generated').length;
      return {
        success: true,
        message: `Successfully processed ${results.length} location(s) (${generatedCount} generated, ${results.length - generatedCount} existing) for Series "${series.title}".`,
        data: { series_id: params.seriesId, locations: updatedLocations, details: results },
      };
    } catch (err: any) {
      Logger.error(`[AssetTools] Failed to generate location asset: ${err.message}`);
      return { success: false, message: `Failed to generate location asset: ${err.message}`, error: err.message };
    }
  }

  /**
   * Generate key narrative prop asset
   */
  static async generatePropAsset(params: {
    userId: string;
    seriesId: string;
    episodeId: string;
    propName?: string;
    propId?: string;
    forceRegenerate?: boolean;
    onItemProgress?: (item: { asset: AssetJobItem; current: number; total: number; description: string }) => Promise<void> | void;
  }): Promise<ToolExecutionResult> {
    try {
      const db = await getDatabaseProvider();
      const series = await db.getSeriesById(params.seriesId);
      if (!series) return { success: false, message: `Series ${params.seriesId} not found` };

      let episode: EpisodeEntity | null = null;
      if (params.episodeId) {
        episode = await db.getEpisodeById(params.episodeId);
      }

      const allProps: PropAsset[] = (series?.props || []) as PropAsset[];
      if (allProps.length === 0) {
        return { success: false, message: `Series "${series.title}" has no props defined.` };
      }

      let targets = allProps;
      if (params.propName) {
        const found = allProps.filter((p) => p.name.toLowerCase().includes(params.propName!.toLowerCase()));
        if (found.length > 0) targets = found;
      } else if (params.propId) {
        const found = allProps.filter((p) => p.id === params.propId);
        if (found.length > 0) targets = found;
      }

      const results: Array<{ name: string; status: string; image_url?: string }> = [];
      const updatedProps: PropAsset[] = [...allProps];

      for (const prop of targets) {
        const existingUrl = prop.image_url;
        if (!params.forceRegenerate && existingUrl) {
          results.push({ name: prop.name, status: 'already_exists', image_url: existingUrl });
          await params.onItemProgress?.({
            asset: {
              id: prop.id,
              name: `Prop: ${prop.name}`,
              type: 'prop',
              status: 'completed',
              url: existingUrl,
              thumbnail: existingUrl,
            },
            current: results.length,
            total: targets.length,
            description: `Prop: ${prop.name} (Ready)`,
          });
          continue;
        }

        const { result } = await executeWithRetry(`Generate Prop Concept for "${prop.name}"`, async () => {
          return await AssetService.generatePropAsset({
            series_id: params.seriesId,
            episode_id: params.episodeId,
            prop_id: prop.id,
            name: prop.name,
            physical_characteristics: prop.physical_characteristics,
            owner: prop.owner,
            visual_style: series.visual_style,
            user_id: params.userId,
          });
        });

        const idx = updatedProps.findIndex((p) => p.id === prop.id || p.name === prop.name);
        if (idx >= 0) {
          updatedProps[idx] = result.prop;
        }

        results.push({ name: prop.name, status: 'generated', image_url: result.image_url });

        await params.onItemProgress?.({
          asset: {
            id: prop.id,
            name: `Prop: ${prop.name}`,
            type: 'prop',
            status: 'completed',
            url: result.image_url,
            thumbnail: result.image_url,
          },
          current: results.length,
          total: targets.length,
          description: `Generated Prop: ${prop.name}`,
        });
      }

      await db.updateSeries(params.seriesId, { props: updatedProps });

      const generatedCount = results.filter((r) => r.status === 'generated').length;
      return {
        success: true,
        message: `Successfully processed ${results.length} prop(s) (${generatedCount} generated, ${results.length - generatedCount} existing) for Series "${series.title}".`,
        data: { series_id: params.seriesId, props: updatedProps, details: results },
      };
    } catch (err: any) {
      Logger.error(`[AssetTools] Failed to generate prop asset: ${err.message}`);
      return { success: false, message: `Failed to generate prop asset: ${err.message}`, error: err.message };
    }
  }

  static async generatePipelineEpisodeStoryboard(params: {
    userId: string;
    seriesId: string;
    episodeId: string;
    forceRegenerate?: boolean;
    onItemProgress?: (item: { asset: AssetJobItem; current: number; total: number; description: string }) => Promise<void> | void;
  }): Promise<ToolExecutionResult> {
    try {
      const { userId, seriesId, episodeId, forceRegenerate, onItemProgress } = params;
      if (!userId) {
        return { success: false, message: 'User ID is required' };
      }
      if (!seriesId) {
        return { success: false, message: 'Series ID is required' };
      }
      if (!episodeId) {
        return { success: false, message: 'Episode ID is required' };
      }
      
      const db = await getDatabaseProvider();
      const series = await db.getSeriesById(seriesId);
      const episode = await db.getEpisodeById(episodeId);
      
      if (!series) return { success: false, message: `Series ${seriesId} not found` };
      if (!episode) return { success: false, message: `Episode ${episodeId} not found` };

      const scenes: SceneEntity[] = (episode.scenes || []) as SceneEntity[];
      if (scenes.length === 0) {
        return { success: false, message: 'Episode has no scenes' };
      }

      const res = await this.generateSceneStoryboard({
        userId,
        seriesId,
        episodeId,
        forceRegenerate,
        onItemProgress,
      });

      return res;
    } catch (error: any) {
      return { success: false, message: `Failed to generate episode storyboard: ${error.message}`, error };
    }
  }

  /**
   * Generate high-fidelity visual keyframe storyboard for a scene shot
   */
  static async generateSceneStoryboard(params: {
    userId: string;
    seriesId: string;
    episodeId: string;
    sceneIndex?: number;
    shotIndex?: number;
    visualPrompt?: string;
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
        return { success: false, message: `Episode "${episode.title}" has no scenes to generate storyboards for.` };
      }

      let targets = scenes;
      if (params.sceneIndex !== undefined) {
        targets = scenes.filter((s: SceneEntity) => Number(s.index || s.scene_number) === Number(params.sceneIndex));
        if (targets.length === 0) {
          return { success: false, message: `Scene #${params.sceneIndex} not found in Episode "${episode.title}".` };
        }
      }

      const results: Array<{ sceneIndex: number; status: string; image_url?: string; error?: string }> = [];
      const updatedScenes: SceneEntity[] = [...scenes];
      let hasFailures = false;
      const failureReasons: string[] = [];

      for (const sc of targets) {
        const scIndex = Number(sc.index || sc.scene_number);
        const existingUrl = sc.storyboard_frame_url || sc.image_url;
        if (!params.forceRegenerate && existingUrl) {
          results.push({ sceneIndex: scIndex, status: 'already_exists', image_url: existingUrl });
          await params.onItemProgress?.({
            asset: {
              id: `sb_${params.episodeId}_s${scIndex}`,
              name: `Scene #${scIndex} Storyboard`,
              type: 'storyboard',
              status: 'completed',
              url: existingUrl,
              thumbnail: existingUrl,
              scene_index: scIndex,
            },
            current: results.length,
            total: targets.length,
            description: `Scene #${scIndex} Storyboard (Ready)`,
          });
          continue;
        }

        try {
          const { result } = await executeWithRetry(`Generate Storyboard Frame for Scene #${scIndex}`, async () => {
            return await AssetService.generateStoryboardShot({
              series_id: params.seriesId,
              episode_id: params.episodeId,
              scene_index: scIndex,
              visual_prompt: params.visualPrompt,
              user_id: params.userId,
            });
          });

          if (!result?.image_url) {
            throw new Error(`AI generated an empty storyboard image URL for scene #${scIndex}`);
          }

          const idx = updatedScenes.findIndex((s) => Number(s.index || s.scene_number) === scIndex);
          if (idx >= 0 && result.scene) {
            updatedScenes[idx] = result.scene;
          }

          results.push({ sceneIndex: scIndex, status: 'generated', image_url: result.image_url });

          await params.onItemProgress?.({
            asset: {
              id: `sb_${params.episodeId}_s${scIndex}`,
              name: `Scene #${scIndex} Storyboard`,
              type: 'storyboard',
              status: 'completed',
              url: result.image_url,
              thumbnail: result.image_url,
              scene_index: scIndex,
            },
            current: results.length,
            total: targets.length,
            description: `Generated Storyboard for Scene #${scIndex}`,
          });
        } catch (scErr: any) {
          hasFailures = true;
          failureReasons.push(`Scene #${scIndex}: ${scErr.message}`);
          Logger.error(`[AssetTools] Failed to generate storyboard for Scene #${scIndex}: ${scErr.message}`);
          results.push({ sceneIndex: scIndex, status: 'failed', error: scErr.message });
          await params.onItemProgress?.({
            asset: {
              id: `sb_${params.episodeId}_s${scIndex}`,
              name: `Scene #${scIndex} Storyboard`,
              type: 'storyboard',
              status: 'failed',
              scene_index: scIndex,
            },
            current: results.length,
            total: targets.length,
            description: `Failed Scene #${scIndex} Storyboard: ${scErr.message}`,
          });
        }
      }

      // Persist any scenes that succeeded into database
      await db.updateEpisode(params.episodeId, { scenes: updatedScenes });

      if (hasFailures) {
        return {
          success: false,
          message: `Storyboard generation failed for some scenes: ${failureReasons.join('; ')}`,
          data: { episode_id: params.episodeId, scenes: updatedScenes, details: results },
        };
      }

      const generatedCount = results.filter((r) => r.status === 'generated').length;
      return {
        success: true,
        message: `Successfully processed ${results.length} storyboard frame(s) (${generatedCount} generated, ${results.length - generatedCount} existing) for Episode #${episode.episode_number || 1} "${episode.title}".`,
        data: { episode_id: params.episodeId, scenes: updatedScenes, details: results },
      };
    } catch (err: any) {
      Logger.error(`[AssetTools] Failed to generate scene storyboard: ${err.message}`);
      return { success: false, message: `Failed to generate scene storyboard: ${err.message}`, error: err.message };
    }
  }
}

export function createAssetTools(context?: ToolContextParams): FunctionTool[] {
  return [
    new FunctionTool({
      name: 'generate_location_asset',
      description: 'Generate atmospheric environment and background concept art for locations.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          location_name: { type: Type.STRING, description: 'Optional specific location name' },
          location_id: { type: Type.STRING, description: 'Optional specific location ID' },
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
        const res = await AssetToolExecutors.generateLocationAsset({
          userId,
          seriesId,
          episodeId,
          locationName: args.location_name || args.locationName,
          locationId: args.location_id || args.locationId,
          forceRegenerate: args.force_regenerate || args.forceRegenerate,
        });
        if (res.success && res.data) {
          onItemUpdated?.({ type: 'locations_updated', data: res.data });
        }
        return res;
      },
    }),

    new FunctionTool({
      name: 'generate_prop_asset',
      description: 'Generate key narrative prop assets and isolated product shots.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          prop_name: { type: Type.STRING, description: 'Optional specific prop name' },
          prop_id: { type: Type.STRING, description: 'Optional specific prop ID' },
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
        const res = await AssetToolExecutors.generatePropAsset({
          userId,
          seriesId,
          episodeId,
          propName: args.prop_name || args.propName,
          propId: args.prop_id || args.propId,
          forceRegenerate: args.force_regenerate || args.forceRegenerate,
        });
        if (res.success && res.data) {
          onItemUpdated?.({ type: 'props_updated', data: res.data });
        }
        return res;
      },
    }),

    new FunctionTool({
      name: 'generate_scene_storyboard',
      description: 'Generate high-fidelity visual keyframe illustrations for scene shots.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          scene_index: { type: Type.NUMBER, description: 'Scene index number' },
          shot_index: { type: Type.NUMBER, description: 'Optional shot index within scene' },
          visual_prompt: { type: Type.STRING, description: 'Custom visual prompt override' },
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
        const res = await AssetToolExecutors.generateSceneStoryboard({
          userId,
          seriesId,
          episodeId,
          sceneIndex: args.scene_index || args.sceneIndex,
          shotIndex: args.shot_index || args.shotIndex,
          visualPrompt: args.visual_prompt || args.visualPrompt,
          forceRegenerate: args.force_regenerate || args.forceRegenerate,
        });
        if (res.success && res.data) {
          onItemUpdated?.({ type: 'storyboards_updated', data: res.data });
        }
        return res;
      },
    }),
  ];
}
