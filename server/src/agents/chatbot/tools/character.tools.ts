import { FunctionTool } from '@google/adk';
import { Type } from '@google/genai';
import { getDatabaseProvider } from '@/database/index.js';
import { Logger } from '@/utils/logger.js';
import { characterService } from '@/services/CharacterService.js';
import { EntityNormalizer } from '@/utils/EntityNormalizer.js';
import { executeWithRetry, withCreditDeduction, getActiveChatContext, type ToolContextParams, type ToolExecutionResult } from './context.js';
import type { CharacterSeriesEntity, CharacterWardrobeVariant, AssetJobItem, EpisodeEntity } from '@/types.js';

export class CharacterToolExecutors {
  /**
   * Generate portrait/avatar for single character or batch for all characters
   */
  static async generateCharacterAsset(params: {
    userId: string;
    seriesId: string;
    characterName?: string;
    characterId?: string;
    aspectRatio?: string;
    style?: string;
    forceRegenerate?: boolean;
    onItemProgress?: (item: { asset: AssetJobItem; current: number; total: number; description: string }) => Promise<void> | void;
  }): Promise<ToolExecutionResult> {
    try {
      const db = await getDatabaseProvider();
      const series = await db.getSeriesById(params.seriesId);
      if (!series) return { success: false, message: `Series ${params.seriesId} not found` };

      const allChars = await characterService.listCharacters(params.seriesId);
      if (allChars.length === 0) {
        return {
          success: false,
          message: `Cannot generate character asset: Series "${series.title}" has no characters. Please generate master plan or add characters first.`,
        };
      }

      let targets = allChars;
      if (params.characterName) {
        const found = allChars.filter(
          (c) => c.name.toLowerCase().includes(params.characterName!.toLowerCase())
        );
        if (found.length > 0) targets = found;
      } else if (params.characterId) {
        const found = allChars.filter((c) => c.id === params.characterId);
        if (found.length > 0) targets = found;
      }

      const results: Array<{ name: string; status: string; avatar?: string }> = [];
      const updatedChars: CharacterSeriesEntity[] = [...allChars];

      for (const char of targets) {
        const existingAvatar = char.avatar;
        if (!params.forceRegenerate && existingAvatar) {
          Logger.info(`[CharacterTools] Character "${char.name}" already has avatar: ${existingAvatar}. Skipping.`);
          results.push({ name: char.name, status: 'already_exists', avatar: existingAvatar });
          await params.onItemProgress?.({
            asset: {
              id: char.id,
              name: `Portrait: ${char.name}`,
              type: 'character',
              status: 'completed',
              url: existingAvatar,
              thumbnail: existingAvatar,
            },
            current: results.length,
            total: targets.length,
            description: `Character Portrait: ${char.name} (Ready)`,
          });
          continue;
        }

        const { result } = await executeWithRetry(`Generate Character Portrait for "${char.name}"`, async () => {
          return await characterService.generatePortrait({
            series_id: params.seriesId,
            character_id: char.id,
            name: char.name,
            age: char.age,
            gender: char.gender,
            nationality: char.nationality,
            visual_traits: char.visual_traits || char.traits,
            style: params.style,
            aspect_ratio: params.aspectRatio || '9:16',
            user_id: params.userId,
          });
        });

        const idx = updatedChars.findIndex((c) => c.id === char.id || c.name === char.name);
        if (idx >= 0) {
          updatedChars[idx] = result.character;
        }

        results.push({ name: char.name, status: 'generated', avatar: result.avatar_url });

        await params.onItemProgress?.({
          asset: {
            id: char.id,
            name: `Portrait: ${char.name}`,
            type: 'character',
            status: 'completed',
            url: result.avatar_url,
            thumbnail: result.avatar_url,
          },
          current: results.length,
          total: targets.length,
          description: `Generated Portrait: ${char.name}`,
        });
      }

      await db.updateSeries(params.seriesId, { characters: updatedChars });

      const generatedCount = results.filter((r) => r.status === 'generated').length;
      return {
        success: true,
        message: `Successfully processed ${results.length} character(s) (${generatedCount} generated, ${results.length - generatedCount} existing) for Series "${series.title}".`,
        data: { series_id: params.seriesId, characters: updatedChars, details: results },
      };
    } catch (err: any) {
      Logger.error(`[CharacterTools] Failed to generate character assets: ${err.message}`);
      return { success: false, message: `Failed to generate character asset: ${err.message}`, error: err.message };
    }
  }

  /**
   * Generate wardrobe costume variants for all main characters or specific character
   */
  static async generateWardrobeVariants(params: {
    userId: string;
    seriesId: string;
    episodeId: string;
    characterName?: string;
    forceRegenerate?: boolean;
    onItemProgress?: (item: { asset: AssetJobItem; current: number; total: number; description: string }) => Promise<void> | void;
  }): Promise<ToolExecutionResult> {
    try {
      if (!params.userId) return { success: false, message: `No user selected. Please select a user first.` };
      if (!params.seriesId) return { success: false, message: `No series selected. Please select a series first.` };
      if (!params.episodeId) return { success: false, message: `No episode selected. Please select an episode first.` };
      const db = await getDatabaseProvider();
      const series = await db.getSeriesById(params.seriesId);
      if (!series) return { success: false, message: `Series ${params.seriesId} not found` };

      let episode: EpisodeEntity | null = null;
      if (params.episodeId) {
        episode = await db.getEpisodeById(params.episodeId);
      }

      const allChars = await characterService.listCharacters(params.seriesId);
      if (allChars.length === 0) {
        return { success: false, message: `Series "${series.title}" has no characters to generate wardrobes for.` };
      }

      let targets = allChars;
      if (params.characterName) {
        const found = allChars.filter(
          (c) => c.name.toLowerCase().includes(params.characterName!.toLowerCase())
        );
        if (found.length > 0) targets = found;
      }

      const results: Array<{ character: string; variant: string; status: string; image_url?: string }> = [];
      const updatedChars: CharacterSeriesEntity[] = [...allChars];

      for (const char of targets) {
        const variants: CharacterWardrobeVariant[] = char.wardrobe_variants && char.wardrobe_variants.length > 0
          ? [...char.wardrobe_variants]
          : [
              { variant_id: `wardrobe_${char.id}_signature`, name: 'Signature Look', category: 'Formal', clothing_and_accessories: char.clothing_and_accessories || 'Classic signature look' },
              { variant_id: `wardrobe_${char.id}_casual`, name: 'Casual Look', category: 'Casual', clothing_and_accessories: 'Relaxed civilian attire' }
            ];

        for (const variant of variants) {
          const varId = variant.variant_id || (variant as Partial<CharacterWardrobeVariant> & { id?: string }).id || `var_${char.id}`;
          if (!params.forceRegenerate && variant.image_url) {
            results.push({ character: char.name, variant: variant.name, status: 'already_exists', image_url: variant.image_url });
            await params.onItemProgress?.({
              asset: {
                id: `${char.id}_${varId}`,
                name: `Wardrobe: ${char.name} (${variant.name})`,
                type: 'wardrobe',
                status: 'completed',
                url: variant.image_url,
                thumbnail: variant.image_url,
              },
              current: results.length,
              total: targets.length * 2,
              description: `Wardrobe: ${char.name} - ${variant.name} (Ready)`,
            });
            continue;
          }

          const { result } = await executeWithRetry(`Generate Wardrobe Variant "${variant.name}" for "${char.name}"`, async () => {
            return await characterService.generateWardrobeLookbook({
              character_id: char.id,
              variant_id: varId,
              variant_name: variant.name,
              char_name: char.name,
              clothing_desc: variant.clothing_and_accessories || (variant as any).description || 'Signature character wardrobe outfit',
              char_traits: char.visual_traits || char.physical_characteristics || char.traits,
              age: char.age,
              gender: char.gender,
              nationality: char.nationality || series.country,
              reference_avatar_url: char.avatar || undefined,
              visual_style: series.visual_style,
              visual_style_prompt: series.visual_style_prompt,
              user_id: params.userId,
            });
          });

          variant.image_url = result.image_url;
          results.push({ character: char.name, variant: variant.name, status: 'generated', image_url: result.image_url });

          await params.onItemProgress?.({
            asset: {
              id: `${char.id}_${varId}`,
              name: `Wardrobe: ${char.name} (${variant.name})`,
              type: 'wardrobe',
              status: 'completed',
              url: result.image_url,
              thumbnail: result.image_url,
            },
            current: results.length,
            total: targets.length * 2,
            description: `Generated Wardrobe: ${char.name} (${variant.name})`,
          });
        }

        const idx = updatedChars.findIndex((c) => c.id === char.id);
        if (idx >= 0) {
          updatedChars[idx] = { ...updatedChars[idx], wardrobe_variants: variants };
        }
      }

      await db.updateSeries(params.seriesId, { characters: updatedChars });

      return {
        success: true,
        message: `Successfully processed wardrobe variants for ${targets.length} character(s).`,
        data: { series_id: params.seriesId, characters: updatedChars, details: results },
      };
    } catch (err: any) {
      Logger.error(`[CharacterTools] Failed to generate wardrobe variants: ${err.message}`);
      return { success: false, message: `Failed to generate wardrobe variants: ${err.message}`, error: err.message };
    }
  }
}

export function createCharacterTools(context?: ToolContextParams): FunctionTool[] {
  return [
    new FunctionTool({
      name: 'generate_character_asset',
      description: 'Generate single character portrait/avatar asset or batch generate all characters for the series.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          character_name: { type: Type.STRING, description: 'Optional specific character name' },
          character_id: { type: Type.STRING, description: 'Optional specific character ID' },
          aspect_ratio: { type: Type.STRING, description: 'Aspect ratio (e.g. 9:16)' },
          style: { type: Type.STRING, description: 'Optional visual style description' },
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
        const res = await CharacterToolExecutors.generateCharacterAsset({
          userId,
          seriesId,
          characterName: args.character_name || args.characterName,
          characterId: args.character_id || args.characterId,
          aspectRatio: args.aspect_ratio || args.aspectRatio,
          style: args.style,
          forceRegenerate: args.force_regenerate || args.forceRegenerate,
        });
        if (res.success && res.data) {
          onItemUpdated?.({ type: 'characters_updated', data: res.data });
        }
        return res;
      },
    }),

    new FunctionTool({
      name: 'generate_wardrobe_variants',
      description: 'Generate distinct wardrobe and costume variants for characters.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          character_name: { type: Type.STRING, description: 'Optional specific character name' },
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
        const res = await CharacterToolExecutors.generateWardrobeVariants({
          userId,
          seriesId,
          episodeId,
          characterName: args.character_name || args.characterName,
          forceRegenerate: args.force_regenerate || args.forceRegenerate,
        });
        if (res.success && res.data) {
          onItemUpdated?.({ type: 'wardrobes_updated', data: res.data });
        }
        return res;
      },
    }),
  ];
}
