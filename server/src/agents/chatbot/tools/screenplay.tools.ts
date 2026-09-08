import { FunctionTool } from '@google/adk';
import { Type } from '@google/genai';
import { getDatabaseProvider } from '@/database/index.js';
import { Logger } from '@/utils/logger.js';
import { scriptAgent } from '@/agents/ScriptAgent.js';
import { characterService } from '@/services/CharacterService.js';
import { EntityNormalizer } from '@/utils/EntityNormalizer.js';
import { executeWithRetry, withCreditDeduction, getActiveChatContext, type ToolContextParams, type ToolExecutionResult } from './context.js';
import type {
  CharacterSeriesEntity,
  LocationAsset,
  PropAsset,
  SceneEntity,
  CharacterSceneCostumes,
  CharacterWardrobeVariant,
} from '@/types.js';

export class ScreenplayToolExecutors {
  /**
   * Fetch full episode context for the screenplay writer agent
   */
  static async getEpisodeContext(params: {
    seriesId: string;
    episodeId: string;
  }): Promise<ToolExecutionResult> {
    try {
      const db = await getDatabaseProvider();
      const series = await db.getSeriesById(params.seriesId);
      if (!series) return { success: false, message: `Series ${params.seriesId} not found` };

      const episode = await db.getEpisodeById(params.episodeId);
      if (!episode) return { success: false, message: `Episode ${params.episodeId} not found` };

      const characters: CharacterSeriesEntity[] = Array.isArray(series.characters) ? series.characters : [];
      const locations: LocationAsset[] = Array.isArray(series.locations) ? series.locations : [];
      const props: PropAsset[] = Array.isArray(series.props) ? series.props : [];

      const charactersSummary = characters.map((c: CharacterSeriesEntity) => ({
        id: c.id,
        name: c.name,
        role: c.role,
        gender: c.gender,
        voice_id: c.voice_id,
        physical_characteristics: c.physical_characteristics,
        wardrobe_variants: (c.wardrobe_variants || []).map((v: CharacterWardrobeVariant) => ({
          variant_id: v.variant_id,
          name: v.name,
          clothing_and_accessories: v.clothing_and_accessories,
          associated_scenes: v.associated_scenes,
        })),
      }));

      const locationsSummary = locations.map((l: LocationAsset) => ({
        id: l.id,
        name: l.name,
        physical_characteristics: l.physical_characteristics,
        time_of_day: l.time_of_day,
        frame_description: l.frame_description,
      }));

      const propsSummary = props.map((p: PropAsset) => ({
        id: p.id,
        name: p.name,
        physical_characteristics: p.physical_characteristics,
        owner: p.owner,
      }));

      return {
        success: true,
        message: `Episode context loaded for Episode #${episode.episode_number} "${episode.title}"`,
        data: {
          series: {
            id: series.id,
            title: series.title,
            genre: series.genre,
            visual_style: series.visual_style,
            visual_style_prompt: series.visual_style_prompt,
            country: series.country,
            episode_duration: series.episode_duration,
            ratio: series.ratio || '9:16',
          },
          episode: {
            id: episode.id,
            episode_number: episode.episode_number,
            title: episode.title,
            synopsis: episode.synopsis,
            scene_core: episode.scene_core,
            conflict_escalation: episode.conflict_escalation,
            cliffhanger_hook: episode.cliffhanger_hook,
            phase: episode.phase,
            existing_scenes_count: Array.isArray(episode.scenes) ? episode.scenes.length : 0,
          },
          characters: charactersSummary,
          locations: locationsSummary,
          props: propsSummary,
        },
      };
    } catch (err: any) {
      Logger.error(`[ScreenplayTools] get_episode_context failed: ${err.message}`);
      return { success: false, message: `Failed to get episode context: ${err.message}`, error: err.message };
    }
  }

  /**
   * Save generated screenplay scenes and shots to the database
   */
  static async saveEpisodeScreenplay(params: {
    userId: string;
    seriesId: string;
    episodeId: string;
    scenes: Partial<SceneEntity>[];
    screenplay?: string;
  }): Promise<ToolExecutionResult> {
    try {
      const db = await getDatabaseProvider();
      const series = await db.getSeriesById(params.seriesId);
      if (!series) return { success: false, message: `Series ${params.seriesId} not found` };

      const episode = await db.getEpisodeById(params.episodeId);
      if (!episode) return { success: false, message: `Episode ${params.episodeId} not found` };

      const characters: CharacterSeriesEntity[] = Array.isArray(series.characters) ? series.characters : [];
      const locations: LocationAsset[] = Array.isArray(series.locations) ? series.locations : [];
      const props: PropAsset[] = Array.isArray(series.props) ? series.props : [];

      // Normalize scenes using ScriptAgent.flattenAndEnrichShots for canonical output
      const rawShots = scriptAgent.flattenAndEnrichShots(params.scenes || [], {
        characters,
        locations,
        props,
      });
      const normalizedScenes: SceneEntity[] = rawShots
        .map((s: Partial<SceneEntity>, idx: number) => EntityNormalizer.normalizeScene(s, idx + 1))
        .filter((s): s is SceneEntity => s !== null);
      
      // Compute accurate episode reference_assets from scene data
      const charIdSet = new Set<string>();
      const locIdSet = new Set<string>();
      const propIdSet = new Set<string>();

      const norm = (s: unknown): string =>
        (typeof s === 'string'
          ? s
          : (typeof s === 'object' && s !== null && 'name' in s
            ? String((s as { name: unknown }).name)
            : (typeof s === 'object' && s !== null && 'id' in s ? String((s as { id: unknown }).id) : (s != null ? String(s) : '')))).normalize('NFC').toLowerCase().trim();

      normalizedScenes.forEach((sc: SceneEntity) => {
        // Gather from character_costumes
        (sc.character_costumes || []).forEach((cc: CharacterSceneCostumes) => {
          const charName = norm(cc.character || '');
          const found = characters.find((c: CharacterSeriesEntity) => norm(c.name) === charName || norm(c.id) === charName);
          if (found) charIdSet.add(found.id);
        });
        // Gather from reference_assets (already resolved to IDs by flattenAndEnrichShots)
        (sc.reference_assets?.characters || []).forEach((v: string) => {
          if (characters.find((c: CharacterSeriesEntity) => c.id === v)) charIdSet.add(v);
        });
        (sc.reference_assets?.locations || []).forEach((v: string) => {
          if (locations.find((l: LocationAsset) => l.id === v)) locIdSet.add(v);
        });
        (sc.reference_assets?.props || []).forEach((v: string) => {
          if (props.find((p: PropAsset) => p.id === v)) propIdSet.add(v);
        });
      });

      // Generate screenplay markdown if not provided or if raw JSON was provided
      const isRawJson = (str?: string) => {
        const trimmed = (str || '').trim();
        return trimmed.startsWith('```json') || trimmed.startsWith('{') || trimmed.startsWith('```\n{') || trimmed.startsWith('```\r\n{');
      };
      const screenplay = (!params.screenplay || isRawJson(params.screenplay))
        ? scriptAgent.assembleMarkdownScreenplay(normalizedScenes as any, episode.title)
        : params.screenplay;

      await db.updateEpisode(params.episodeId, {
        scenes: normalizedScenes,
        screenplay,
        reference_assets: {
          character_ids: charIdSet.size > 0 ? Array.from(charIdSet) : characters.map((c: any) => c.id),
          location_ids: locIdSet.size > 0 ? Array.from(locIdSet) : locations.map((l: any) => l.id),
          prop_ids: Array.from(propIdSet),
        },
        status: 'SCRIPT' as any,
      });

      Logger.info(`[ScreenplayTools] Saved ${normalizedScenes.length} scenes for Episode ${params.episodeId}`);

      return {
        success: true,
        message: `Successfully saved screenplay for Episode #${episode.episode_number} "${episode.title}" with ${normalizedScenes.length} shots.`,
        data: {
          episode_id: params.episodeId,
          scenes_count: normalizedScenes.length,
          character_ids: Array.from(charIdSet),
          location_ids: Array.from(locIdSet),
        },
      };
    } catch (err: any) {
      Logger.error(`[ScreenplayTools] save_episode_screenplay failed: ${err.message}`);
      return { success: false, message: `Failed to save screenplay: ${err.message}`, error: err.message };
    }
  }
}

/**
 * Creates ADK FunctionTools for the Screenplay Writer Sub-Agent
 */
export function createScreenplayTools(_params?: ToolContextParams): FunctionTool[] {
  return [
    new FunctionTool({
      name: 'get_episode_context',
      description: 'Fetch the full episode context including series metadata, characters (with wardrobe_variants), locations, props, and episode synopsis/scene_core/conflict/cliffhanger. Call this FIRST before writing any screenplay.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          series_id: { type: Type.STRING, description: 'The series ID from context' },
          episode_id: { type: Type.STRING, description: 'The episode ID to generate screenplay for' },
        },
        required: ['series_id', 'episode_id'],
      },
      execute: async (args: any) => {
        const ctx = getActiveChatContext();
        const seriesId = args.series_id || ctx?.seriesId || '';
        const episodeId = args.episode_id || ctx?.episodeId || '';
        return await ScreenplayToolExecutors.getEpisodeContext({ seriesId, episodeId });
      },
    }),

    new FunctionTool({
      name: 'save_episode_screenplay',
      description: 'Save the finalized episode scenes/shots breakdown to the database. Call this after you have written all shots for the episode.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          series_id: { type: Type.STRING, description: 'The series ID' },
          episode_id: { type: Type.STRING, description: 'The episode ID' },
          screenplay: { type: Type.STRING, description: 'Optional: pre-formatted screenplay markdown text' },
          scenes: {
            type: Type.ARRAY,
            description: 'Array of shot objects following the canonical scene/shot schema',
            items: {
              type: Type.OBJECT,
              properties: {
                scene_number: { type: Type.NUMBER },
                shot_number: { type: Type.NUMBER },
                heading: { type: Type.STRING },
                location: { type: Type.STRING },
                time_of_day: { type: Type.STRING },
                lighting_mood: { type: Type.STRING },
                frame_description: { type: Type.STRING },
                camera_movement: { type: Type.STRING },
                action: { type: Type.STRING },
                duration_seconds: { type: Type.NUMBER },
                dialogue: { type: Type.ARRAY, items: { type: Type.OBJECT } },
                character_costumes: { type: Type.ARRAY, items: { type: Type.OBJECT } },
                reference_assets: { type: Type.OBJECT },
                sfx_cues: { type: Type.ARRAY, items: { type: Type.STRING } },
                bgm_mood: { type: Type.STRING },
                visual_prompt: { type: Type.STRING },
                end_frame_prompt: { type: Type.STRING },
                scene_context: { type: Type.STRING },
                prop_details: { type: Type.STRING },
                transition_effect: { type: Type.STRING },
                video_effect: { type: Type.STRING },
                effects: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
            },
          },
        },
        required: ['series_id', 'episode_id', 'scenes'],
      },
      execute: async (args: any) => {
        const ctx = getActiveChatContext();
        const userId = ctx?.userId || '';
        const seriesId = args.series_id || ctx?.seriesId || '';
        const episodeId = args.episode_id || ctx?.episodeId || '';
        return await ScreenplayToolExecutors.saveEpisodeScreenplay({
          userId,
          seriesId,
          episodeId,
          scenes: args.scenes || [],
          screenplay: args.screenplay,
        });
      },
    }),
  ];
}
