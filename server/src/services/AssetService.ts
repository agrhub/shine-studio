import { aiProviderRouter } from '@/integrations/ai/router/AIProviderRouter.js';
import { StorageFactory } from '@/services/storage/StorageFactory.js';
import { PromptLoader } from '@/utils/PromptLoader.js';
import { getVisualStyleById, getVisualStylePrompt } from '../constants/VisualStyles.js';
import { Logger } from '@/utils/logger.js';
import { getDatabaseProvider } from '@/database/index.js';
import { EntityNormalizer } from '@/utils/EntityNormalizer.js';
import { CreditService } from '@/services/CreditService.js';
import { TimelineService } from '@/services/TimelineService.js';
import type {
  LocationAsset,
  PropAsset,
  ShotFrame,
  SceneEntity,
  EpisodeEntity,
  SeriesEntity,
  ScreenplayAssetsResult,
  CharacterSeriesEntity,
  CharacterSceneCostumes,
  CharacterWardrobeVariant,
  AssetVersion,
  CustomizableAsset,
  CustomizableAssetType,
  CustomizeAssetParams,
  CustomizeAssetResult,
  SelectAssetVersionParams,
  SelectAssetVersionResult,
} from '@/types.js';
import { characterService } from './CharacterService.js';

export const STRICT_NO_TEXT_DIRECTIVE = 'Clean visual photography, completely free of text, typography, letters, titles, subtitles, words, watermarks, UI elements, overlays, labels, badges, or captions.';

/**
 * AssetService: Responsible for Image Asset Generation (Character sheets, Location sheets, Prop shots, Storyboard shot images)
 */
export class AssetService {
  // ── Core Image Asset Generation ──────────────────────────────────────────

  /**
   * 1. Generate Single Character Portrait / Avatar (supports both params object and positional arguments)
   */
  public static async generateCharacterPortrait(params: {
    user_id: string;
    series_id: string;
    character_id: string;
    // visual_style?: string;
    // age?: number;
    // gender?: string;
    // physical_characteristics?: string;
    // clothing_and_accessories?: string;
    custom_prompt?: string;
    reference_image_url?: string;
  }): Promise<{ image_url: string; character?: CharacterSeriesEntity; prompt: string; version: AssetVersion }> {
    const db = await getDatabaseProvider();
    const series = await db.getSeriesById(params.series_id);
    if(!series){
      throw new Error('Series not found');
    }
    const allChars: CharacterSeriesEntity[] = Array.isArray(series?.characters) ? [...series!.characters] : [];
    const char = allChars.find((c) => c.id === params.character_id || c.name === params.character_id);
    if(!char){
      throw new Error('Character not found');
    }

    const result = await characterService.generatePortrait({
      user_id: params.user_id,
      character_id: char.id,
      // name: char.name,
      series_id: params.series_id,
      // visual_style: series.visual_style,
      // age: char.age,
      // gender: char.gender,
      // nationality: char.nationality,
      // visual_traits: params.physical_characteristics || char.description || char.visual_traits || char.physical_characteristics,
      // clothing_and_accessories: params.clothing_and_accessories || char.clothing_and_accessories,
      custom_prompt: params.custom_prompt,
      reference_image_url: params.reference_image_url,
    });

    if(!result || !result.image_url){
      throw new Error('Failed to generate character portrait');
    }

    return { image_url: result.image_url, character: result.character, prompt: result.prompt, version: result.version };

    // const charTraits = physical_characteristics || char?.visual_traits || char?.physical_characteristics || 'Cinematic character portrait';
    // const clothing = clothing_and_accessories || char?.clothing_and_accessories || '';
    // const style = getVisualStylePrompt(visual_style || series?.visual_style || 'realistic');

    // if (typeof paramsOrName === 'object') {
      // const params = paramsOrName;
      // const db = await getDatabaseProvider();
      // const series = params.series_id ? await db.getSeriesById(params.series_id) : null;
      // const allChars: CharacterSeriesEntity[] = Array.isArray(series?.characters) ? [...series!.characters] : [];
      // const char = allChars.find((c) => c.id === params.character_id || c.name === params.name || (params.character_id && c.name === params.character_id));

      // const characterName = params.name || char?.name || 'Main Character';
      // const charTraits = params.physical_characteristics || char?.visual_traits || char?.physical_characteristics || 'Cinematic character portrait';
      // const clothing = params.clothing_and_accessories || char?.clothing_and_accessories || '';
      // const style = params.visual_style || series?.visual_style || 'realistic';
      // const targetAspect: '9:16' | '16:9' | '4:3' | '1:1' = (params.aspect_ratio as '9:16' | '16:9' | '4:3' | '1:1') || '9:16';

      // if (params.user_id) {
      //   try {
      //     await CreditService.deductUserCredits(params.user_id, 'sceneImage', 'Character Portrait Generation', `Generated portrait for character ${characterName}`);
      //   } catch (cErr: any) {
      //     Logger.warn(`[AssetService] Credit deduction notice: ${cErr.message}`);
      //   }
      // }

    //   let prompt: string;
    //   if (params.custom_prompt) {
    //     const cleanPrompt = AssetService.cleanNegativeDirectives(params.custom_prompt);
    //     const stylePrompt = getVisualStylePrompt(style);
    //     prompt = `${stylePrompt}, ${cleanPrompt}\n${STRICT_NO_TEXT_DIRECTIVE}`;
    //   } else {
    //     const stylePrompt = getVisualStylePrompt(style);
    //     const ageTag = params.age || char?.age ? `${params.age || char?.age}-year-old ` : '';
    //     const genderTag = (params.gender || char?.gender) && (params.gender || char?.gender) !== 'neutral' ? `${params.gender || char?.gender} ` : '';
    //     const clothingTag = clothing ? `, wearing ${clothing}` : '';
    //     prompt = `${stylePrompt}, centered vertical single person portrait of ${ageTag}${genderTag}${characterName}, ${charTraits}${clothingTag}, cinematic lighting, 9:16 vertical framing, age-accurate facial features, character continuity reference, clear head and shoulders framed properly within bounds. ${STRICT_NO_TEXT_DIRECTIVE}`;
    //   }

    //   const refImages: string[] = [];
    //   if (params.reference_image_url) {
    //     refImages.push(params.reference_image_url);
    //   } else if (char?.avatar) {
    //     refImages.push(char.avatar);
    //   }

    //   Logger.info(`[AssetService.generateCharacterPortrait] Generating portrait for ${characterName}`);
    //   const result = await aiProviderRouter.generateImage(prompt, {
    //     aspectRatio: targetAspect,
    //     characterReferences: refImages,
    //     imageInputs: refImages,
    //   });

    //   if (!result?.url) throw new Error(`Failed to generate character portrait for ${characterName}`);
    //   const s3 = await StorageFactory.uploadMedia(result.url, 'images', 'png', result.mimeType || 'image/png');
    //   const imageUrl = `/api/assets/file/${s3.key}`;

    //   const newVersion: AssetVersion = {
    //     id: `ver_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    //     image_url: imageUrl,
    //     url: imageUrl,
    //     prompt,
    //     created_at: new Date().toISOString(),
    //     is_selected: true,
    //     aspect_ratio: targetAspect,
    //   };

    //   let updatedChar: CharacterSeriesEntity | undefined;
    //   if (char && series && params.series_id) {
    //     const curVersions: AssetVersion[] = Array.isArray(char.versions) ? [...char.versions] : [];
    //     if (curVersions.length === 0 && char.avatar && char.avatar !== imageUrl) {
    //       curVersions.push({
    //         id: `v1_char_${char.id || 'main'}`,
    //         image_url: char.avatar,
    //         url: char.avatar,
    //         prompt: char.prompt || '',
    //         created_at: char.created_at || new Date().toISOString(),
    //         is_selected: false,
    //       });
    //     }
    //     char.versions = [newVersion, ...curVersions.map((v) => ({ ...v, is_selected: false }))];
    //     char.avatar = imageUrl;
    //     char.prompt = prompt;
    //     updatedChar = char;

    //     const idx = allChars.findIndex((c) => c.id === char.id);
    //     if (idx >= 0) allChars[idx] = char;
    //     await db.updateSeries(params.series_id, { characters: allChars });
    //   }

    //   return { imageUrl, image_url: imageUrl, character: updatedChar || char, prompt, version: newVersion };
    // }

    // const refImages: string[] = [];
    // if (params.reference_image_url) {
    //   refImages.push(params.reference_image_url);
    // } else if (char?.avatar) {
    //   refImages.push(char.avatar);
    // }
    // const characterName = char?.name || 'Main Character';
    // // const stylePrompt = getVisualStylePrompt(visualStyle);
    // const charTraits = params.physical_characteristics || char?.visual_traits || char?.traits || char?.appearance || char?.physical_characteristics || 'Cinematic character portrait';
    // // const clothing = clothing_and_accessories || char?.clothing_and_accessories || '';
    // const style = getVisualStylePrompt(params.visual_style || series?.visual_style || 'realistic');
    // const ageTag = params.age || char?.age ? `${params.age || char?.age}-year-old ` : '';
    // const genderTag = params.gender && params.gender !== 'neutral' ? `${params.gender} ` : '';
    // const nationalityTag = char.nationality || '';
    // // const traits = physical_characteristics || 'Cinematic character portrait';
    // const clothing = params.clothing_and_accessories ? `, wearing ${params.clothing_and_accessories}` : '';
    // //   let prompt: string;
    // //   if (params.custom_prompt) {
    // //     const cleanPrompt = AssetService.cleanNegativeDirectives(params.custom_prompt);
    // //     const stylePrompt = getVisualStylePrompt(style);
    // //     prompt = `${stylePrompt}, ${cleanPrompt}\n${STRICT_NO_TEXT_DIRECTIVE}`;
    // //   }
    // const prompt = `${params.custom_prompt ? (AssetService.cleanNegativeDirectives(params.custom_prompt) + ',') : ''}  ${style}, centered vertical single person portrait of ${ageTag}${genderTag}${characterName}, ${nationalityTag}, ${charTraits}${clothing}, 9:16 vertical framing, age-accurate facial features, character continuity reference, clear head and shoulders framed properly within bounds. ${STRICT_NO_TEXT_DIRECTIVE}`;
    // // const stylePrompt = getVisualStylePrompt(style);
    // // const ageTag = params.age || char?.age ? `${params.age || char?.age}-year-old ` : '';
    // // const genderTag = (params.gender || char?.gender) && (params.gender || char?.gender) !== 'neutral' ? `${params.gender || char?.gender} ` : '';
    // // const clothingTag = clothing ? `, wearing ${clothing}` : '';
    // // prompt = `${stylePrompt}, centered vertical single person portrait of ${ageTag}${genderTag}${characterName}, ${charTraits}${clothingTag}, cinematic lighting, 9:16 vertical framing, age-accurate facial features, character continuity reference, clear head and shoulders framed properly within bounds. ${STRICT_NO_TEXT_DIRECTIVE}`;

    // try {
    //   await CreditService.deductUserCredits(params.user_id, 'sceneImage', 'Character Portrait Generation', `Generated portrait for character ${characterName}`);
    // } catch (cErr: any) {
    //   Logger.warn(`[AssetService] Credit deduction notice: ${cErr.message}`);
    // }

    // Logger.info(`[AssetService.generateCharacterPortrait] Prompt for ${characterName}: ${prompt}`);

    // const result = await aiProviderRouter.generateImage(prompt, {
    //   aspectRatio: '9:16',
    //   imageInputs: refImages,
    // });

    // if (!result?.url) {
    //   throw new Error(`Failed to generate character portrait for ${characterName}`);
    // }

    // const s3 = await StorageFactory.uploadMedia(result.url, 'images', 'png', result.mimeType || 'image/png');
    // const imageUrl = `/api/assets/file/${s3.key}`;
    // const version: AssetVersion = {
    //   id: `v_${Date.now()}`,
    //   image_url: imageUrl,
    //   prompt,
    //   created_at: new Date().toISOString(),
    //   is_selected: true,
    //   aspect_ratio: '9:16',
    // };
    // return { imageUrl, image_url: imageUrl, prompt, version };
  }

  /**
   * 1b. Generate Character Wardrobe Variant with Credit Deduction & DB Persistence
   */
  public static async generateCharacterWardrobe(params: {
    series_id: string;
    character_id: string;
    variant_id: string;
    custom_prompt?: string;
    reference_image_url?: string;
    // physical_characteristics?: string;
    clothing_and_accessories?: string;
    user_id: string;
  }): Promise<{ image_url: string; wardrobe: CharacterWardrobeVariant; prompt: string; version: AssetVersion }> {
    const db = await getDatabaseProvider();
    const series = await db.getSeriesById(params.series_id);
    if (!series) throw new Error(`Series ${params.series_id} not found`);

    const allChars: CharacterSeriesEntity[] = Array.isArray(series.characters) ? [...series.characters] : [];
    const cIdx = allChars.findIndex((c) => c.id === params.character_id || c.name === params.character_id);
    if (cIdx === -1) throw new Error(`Character ${params.character_id} not found`);

    const char = { ...allChars[cIdx] };
    const variants: CharacterWardrobeVariant[] = char.wardrobe_variants || [];

    const vIdx = variants.findIndex((v: CharacterWardrobeVariant) => v.variant_id === params.variant_id || v.name === params.variant_id);
    if (vIdx === -1) throw new Error(`Wardrobe variant ${params.variant_id} not found for character ${char.name}`);

    const variant = { ...variants[vIdx] };

    // if (params.user_id) {
    //   try {
    //     await CreditService.deductUserCredits(params.user_id, 'sceneImage', 'Character Wardrobe Generation', `Generated wardrobe variant for ${char.name}`);
    //   } catch (cErr: any) {
    //     Logger.warn(`[AssetService] Credit deduction notice: ${cErr.message}`);
    //   }
    // }

    const result = await characterService.generateWardrobeLookbook({
      user_id: params.user_id,
      series_id: params.series_id,
      character_id: params.character_id,
      variant_id: params.variant_id,
      // char_name: char.name,
      // char_traits: params.physical_characteristics || char.visual_traits || char.physical_characteristics || '',
      clothing_desc: params.clothing_and_accessories || variant.clothing_and_accessories || variant.name,
      // age: char.age,
      // gender: char.gender,
      // nationality: char.nationality,
      reference_avatar_url: params.reference_image_url || char.avatar || '',
      // visual_style: series.visual_style || 'realistic',
      // visual_style_prompt: series.visual_style_prompt || '',
      custom_prompt: params.custom_prompt || '',
    });

    if(!result || !result.image_url){
      throw new Error(`Failed to generate wardrobe variant for character ${char.name}`);
    }

    // const style = series.visual_style || 'realistic';
    // const stylePrompt = getVisualStylePrompt(style);
    // const physical_characteristics = params.physical_characteristics || char.visual_traits || char.physical_characteristics || '';

    // let prompt = `${stylePrompt}, character wardrobe visual reference of ${char.name}, ${physical_characteristics}. Wearing: ${params.clothing_and_accessories || variant.clothing_and_accessories || variant.name}`
    // if (params.custom_prompt) {
    //   const cleanPrompt = AssetService.cleanNegativeDirectives(params.custom_prompt);
    //   prompt += `\nCustom conditioning: ${cleanPrompt}`;
    //   // prompt = `${stylePrompt}, ${cleanPrompt}\n${STRICT_NO_TEXT_DIRECTIVE}`;
    // } 
    // prompt += `\nClear costume framing. ${STRICT_NO_TEXT_DIRECTIVE}`;
    // // else {
    // //   const charTraits = params.physical_characteristics || char.visual_traits || char.physical_characteristics || '';
    // //   prompt = `${stylePrompt}, character wardrobe visual reference of ${char.name}, ${charTraits}. Wearing: ${params.clothing_and_accessories || variant.clothing_and_accessories || variant.name}. Clear costume framing, cinematic lighting. ${STRICT_NO_TEXT_DIRECTIVE}`;
    // // }

    // const refImages: string[] = [];
    // if (params.reference_image_url) {
    //   refImages.push(params.reference_image_url);
    // } else if (variant.image_url) {
    //   refImages.push(variant.image_url);
    // }
    // if (char.avatar && !refImages.includes(char.avatar)) {
    //   refImages.push(char.avatar);
    // }

    // Logger.info(`[AssetService.generateCharacterWardrobe] Generating wardrobe for ${char.name} [${variant.name}]`);
    // const result = await aiProviderRouter.generateImage(prompt, {
    //   aspectRatio: '16:9',
    //   characterReferences: refImages,
    //   imageInputs: refImages,
    // });

    // if (!result?.url) throw new Error(`Failed to generate wardrobe image for ${char.name}`);
    // const s3 = await StorageFactory.uploadMedia(result.url, 'images', 'png', result.mimeType || 'image/png');
    // const imageUrl = `/api/assets/file/${s3.key}`;

    // const newVersion: AssetVersion = {
    //   id: `ver_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    //   image_url: imageUrl,
    //   url: imageUrl,
    //   prompt,
    //   created_at: new Date().toISOString(),
    //   is_selected: true,
    //   aspect_ratio: '16:9',
    // };

    const curVersions: AssetVersion[] = Array.isArray(variant.versions) ? [...variant.versions] : [];
    if (curVersions.length === 0 && variant.image_url && variant.image_url !== result.image_url) {
      curVersions.push({
        id: `v1_wardrobe_${variant.variant_id || 'main'}`,
        image_url: variant.image_url,
        url: variant.image_url,
        prompt: variant.prompt || '',
        created_at: new Date().toISOString(),
        is_selected: false,
      });
    }
    variant.versions = [result.version, ...curVersions.map((v) => ({ ...v, is_selected: false }))];
    variant.image_url = result.image_url;
    // variant.prompt = result.prompt;

    variants[vIdx] = variant;
    char.wardrobe_variants = variants;
    allChars[cIdx] = char;
    await db.updateSeries(params.series_id, { characters: allChars });

    return { image_url: result.image_url, wardrobe: variant, prompt: result.prompt, version: result.version };
  }

  /**
   * 2. Generate 2-in-1 Character Sheet (Head & shoulders portrait left + Full body right on white background)
   */
  // public static async generateCharacterSheet(
  //   characterName: string,
  //   physicalCharacteristics: string,
  //   clothingAndAccessories: string,
  //   visualStyle?: string,
  //   referenceImageUrl?: string
  // ): Promise<{ imageUrl: string; prompt: string; version: AssetVersion }> {
  //   const stylePrompt = getVisualStylePrompt(visualStyle);
  //   const prompt = `${PromptLoader.render('assets/character_sheet', {
  //     characterName,
  //     physicalCharacteristics,
  //     clothingAndAccessories,
  //     visualStyle: stylePrompt,
  //     referenceImageUrl,
  //   })}. ${STRICT_NO_TEXT_DIRECTIVE}`;

  //   Logger.info(`[AssetService.generateCharacterSheet] Prompt for ${characterName}: ${prompt} (Ref: ${referenceImageUrl || 'none'})`);

  //   const referencePool = referenceImageUrl ? [referenceImageUrl] : [];

  //   const result = await aiProviderRouter.generateImage(prompt, {
  //     aspectRatio: '16:9',
  //     characterReferences: referencePool,
  //     imageInputs: referencePool,
  //   });

  //   if (!result?.url) {
  //     throw new Error(`Failed to generate character sheet for ${characterName}`);
  //   }

  //   const s3 = await StorageFactory.uploadMedia(result.url, 'images', 'png', result.mimeType || 'image/png');
  //   const imageUrl = `/api/assets/file/${s3.key}`;
  //   const version: AssetVersion = {
  //     id: `v_${Date.now()}`,
  //     image_url: imageUrl,
  //     prompt,
  //     created_at: new Date().toISOString(),
  //     is_selected: true,
  //     aspect_ratio: '16:9',
  //   };
  //   return { imageUrl, prompt, version };
  // }

  /**
   * 3. Generate 4-in-1 Location Sheet
   */
  public static async generateLocationSheet(params: {
    user_id: string,
    series_id: string,
    location_id: string,
    physical_characteristics?: string,
    time_of_day?: string,
    visual_style?: string,
    custom_prompt?: string,
    reference_image_url?: string
  }): Promise<{ image_url: string; location: LocationAsset, prompt: string; version: AssetVersion }> {
    if (!params.user_id) {
      throw new Error('user_id is required');
    }
    if (!params.series_id) {
      throw new Error('series_id is required');
    }
    if (!params.location_id) {
      throw new Error('location_id is required');
    }
    const db = await getDatabaseProvider();
    const series = await db.getSeriesById(params.series_id);
    if (!series) {
      throw new Error('series not found');
    }
    const location = series.locations.find((l) => l.id.trim().toLowerCase() === params.location_id.trim().toLowerCase());
    if (!location) {
      throw new Error('location not found');
    }

    const stylePrompt = getVisualStylePrompt(params.visual_style || series.visual_style || 'realistic');
    const prompt = `${PromptLoader.render('assets/location_sheet', {
      locationName: location.name,
      physicalCharacteristics: params.physical_characteristics || location.physical_characteristics,
      timeOfDay: params.time_of_day || location.time_of_day,
      visualStyle: stylePrompt,
      customPrompt: params.custom_prompt,
      referenceImageUrl: params.reference_image_url,
    })}. ${STRICT_NO_TEXT_DIRECTIVE}`;

    Logger.info(`[AssetService.generateLocationSheet] Prompt for ${location.name}: ${prompt}`);

    const result = await aiProviderRouter.generateImage(prompt, {
      aspectRatio: '16:9',
      imageInputs: params.reference_image_url ? [params.reference_image_url] : [],
    });

    if (!result || !result?.url) {
      throw new Error(`Failed to generate location sheet for ${location.name}`);
    }
    const storePrompt = params.custom_prompt || location.physical_characteristics;
    const s3 = await StorageFactory.uploadMedia(result.url, 'images', 'png', result.mimeType || 'image/png');
    const imageUrl = `/api/assets/file/${s3.key}`;
    const version: AssetVersion = {
      id: `v_${Date.now()}`,
      image_url: imageUrl,
      prompt: storePrompt,
      created_at: new Date().toISOString(),
      is_selected: true,
      aspect_ratio: '16:9',
    };

    const existingVersions: AssetVersion[] = Array.isArray(location?.versions) ? [...location.versions] : [];
    if (existingVersions.length === 0 && location?.image_url && location.image_url !== imageUrl) {
      existingVersions.push({
        id: location?.id || '',
        image_url: location.image_url,
        url: location.image_url,
        prompt: storePrompt,
        created_at: new Date().toISOString(),
        is_selected: false,
      });
    }
    const newVersions: AssetVersion[] = [version, ...existingVersions.map((v: AssetVersion) => ({ ...v, is_selected: false }))];

    const normalizedLoc = EntityNormalizer.normalizeLocation({
      ...(location || {}),
      id: location?.id || `loc_${Date.now()}`,
      name: location.name,
      time_of_day: location.time_of_day,
      physical_characteristics: location.physical_characteristics,
      image_url: imageUrl,
      prompt: storePrompt,
      versions: newVersions,
    });

    if (!normalizedLoc) {
      throw new Error(`Failed to normalize location ${location.name}`);
    }

    // Update in Series
    if (series) {
      const existingLocs: LocationAsset[] = Array.isArray(series.locations) ? [...series.locations] : [];
      const mIdx = existingLocs.findIndex((l: LocationAsset) => l.id === normalizedLoc.id || l.name === normalizedLoc.name);
      if (mIdx >= 0) existingLocs[mIdx] = { ...existingLocs[mIdx], ...normalizedLoc };
      else existingLocs.push(normalizedLoc);
      await db.updateSeries(params.series_id, { locations: existingLocs });
      const { PatchSyncService } = await import('@/realtime/PatchSyncService.js');
      const updatedSeries = await db.getSeriesById(params.series_id);
      if (updatedSeries) {
        PatchSyncService.broadcast(params.series_id, 'series:updated', updatedSeries);
      }
    }

    return { image_url: imageUrl, location: normalizedLoc, version, prompt: storePrompt };
    // return { image_url: imageUrl, prompt, version };
  }

  /**
   * 4. High-level Location Generation with Credit Deduction & Database persistence
   */
  // public static async generateLocationAsset(params: {
  //   series_id: string;
  //   episode_id?: string;
  //   location_id?: string;
  //   name?: string;
  //   physical_characteristics?: string;
  //   time_of_day?: string;
  //   visual_style?: string;
  //   visual_style_prompt?: string;
  //   user_id: string;
  //   custom_prompt?: string;
  //   reference_image_url?: string;
  //   // aspect_ratio?: string;
  // }): Promise<{ image_url: string; location: LocationAsset; prompt: string; version: AssetVersion }> {
  //   const db = await getDatabaseProvider();
  //   const series = await db.getSeriesById(params.series_id);
  //   let episode: EpisodeEntity | null = null;
  //   if (params.episode_id) {
  //     episode = await db.getEpisodeById(params.episode_id);
  //   }

  //   const locList: LocationAsset[] = (episode?.locations && episode.locations.length > 0) ? episode.locations : (series?.locations || []);
  //   const dbLoc = locList.find((l: LocationAsset) => l.id === params.location_id || l.name === params.name);

  //   const locName = params.name || dbLoc?.name || 'Location Scene';
  //   const locTraits = params.physical_characteristics || dbLoc?.physical_characteristics || '';
  //   const timeOfDay = params.time_of_day || dbLoc?.time_of_day || 'Daytime';
  //   const visualStyle = params.visual_style || series?.visual_style || 'realistic';
  //   // const targetAspect: '9:16' | '16:9' | '4:3' | '1:1' = (params.aspect_ratio as '9:16' | '16:9' | '4:3' | '1:1') || '16:9';

  //   if (params.user_id) {
  //     try {
  //       await CreditService.deductUserCredits(params.user_id, 'sceneImage', 'Location Asset Generation', `Generated concept art for location ${locName}`);
  //     } catch (cErr: any) {
  //       Logger.warn(`[AssetService] Credit deduction notice: ${cErr.message}`);
  //     }
  //   }

  //   let imageUrl: string;
  //   let prompt: string;
  //   let version: AssetVersion;

  //   if (params.custom_prompt) {
  //     const cleanPrompt = AssetService.cleanNegativeDirectives(params.custom_prompt);
  //     const stylePrompt = getVisualStylePrompt(visualStyle);
  //     prompt = `${stylePrompt}, ${cleanPrompt}\n${STRICT_NO_TEXT_DIRECTIVE}`;
  //     const refImages: string[] = [];
  //     if (params.reference_image_url) {
  //       refImages.push(params.reference_image_url);
  //     } else if (dbLoc?.image_url) {
  //       refImages.push(dbLoc.image_url);
  //     }

  //     Logger.info(`[AssetService.generateLocationAsset] Generating location with custom prompt for ${locName}`);
  //     const result = await aiProviderRouter.generateImage(prompt, {
  //       aspectRatio: '16:9',
  //       characterReferences: refImages,
  //       imageInputs: refImages,
  //     });

  //     if (!result?.url) throw new Error(`Failed to generate location image for ${locName}`);
  //     const s3 = await StorageFactory.uploadMedia(result.url, 'images', 'png', result.mimeType || 'image/png');
  //     imageUrl = `/api/assets/file/${s3.key}`;
  //     version = {
  //       id: `ver_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
  //       image_url: imageUrl,
  //       url: imageUrl,
  //       prompt,
  //       created_at: new Date().toISOString(),
  //       is_selected: true,
  //       aspect_ratio: '16:9',
  //     };
  //   } else {
  //     const sheetRes = await this.generateLocationSheet({
  //       user_id: params.user_id,
  //       series_id: params.series_id,
  //       location_name: locName,
  //       physical_characteristics: locTraits,
  //       time_of_day: timeOfDay,
  //       visual_style: visualStyle,
  //     });
  //     imageUrl = sheetRes.image_url;
  //     prompt = sheetRes.prompt;
  //     version = sheetRes.version;
  //   }

  //   const existingVersions: AssetVersion[] = Array.isArray(dbLoc?.versions) ? [...dbLoc.versions] : [];
  //   if (existingVersions.length === 0 && dbLoc?.image_url && dbLoc.image_url !== imageUrl) {
  //     existingVersions.push({
  //       id: `v1_loc_${params.location_id || dbLoc?.id || 'main'}`,
  //       image_url: dbLoc.image_url,
  //       url: dbLoc.image_url,
  //       prompt: dbLoc.prompt || '',
  //       created_at: new Date().toISOString(),
  //       is_selected: false,
  //     });
  //   }
  //   const newVersions: AssetVersion[] = [version, ...existingVersions.map((v: AssetVersion) => ({ ...v, is_selected: false }))];

  //   const normalizedLoc = EntityNormalizer.normalizeLocation({
  //     ...(dbLoc || {}),
  //     id: params.location_id || dbLoc?.id || `loc_${Date.now()}`,
  //     name: locName,
  //     time_of_day: timeOfDay,
  //     physical_characteristics: locTraits,
  //     image_url: imageUrl,
  //     prompt,
  //     versions: newVersions,
  //   });

  //   if (!normalizedLoc) {
  //     throw new Error(`Failed to normalize location ${locName}`);
  //   }

  //   // Update in Series
  //   if (series) {
  //     const existingLocs: LocationAsset[] = Array.isArray(series.locations) ? [...series.locations] : [];
  //     const mIdx = existingLocs.findIndex((l: LocationAsset) => l.id === normalizedLoc.id || l.name === normalizedLoc.name);
  //     if (mIdx >= 0) existingLocs[mIdx] = { ...existingLocs[mIdx], ...normalizedLoc };
  //     else existingLocs.push(normalizedLoc);
  //     await db.updateSeries(params.series_id, { locations: existingLocs });
  //   }

  //   return { image_url: imageUrl, location: normalizedLoc, prompt, version };
  // }

  /**
   * 5. Generate Prop Product Shot (Isolated on white background)
   */
  public static async generatePropProductShot(params: {
    series_id: string;
    episode_id?: string;
    prop_id?: string;
    physical_characteristics?: string;
    // owner?: string;
    user_id?: string;
    custom_prompt?: string;
    reference_image_url?: string;
  }): Promise<{ image_url: string; prop: PropAsset; prompt: string; version: AssetVersion }> {
    try{
      const db = await getDatabaseProvider();
      const series = await db.getSeriesById(params.series_id);
      if(!series){
        throw new Error('Series not found');
      }
      const prop = series.props?.find((p: PropAsset) => p.id === params.prop_id);
      if(!prop){
        throw new Error('Prop not found');
      }

      const propName = prop.name;
      const physicalCharacteristics = params.physical_characteristics || prop.physical_characteristics || '';
      const visualStyle = series.visual_style || 'realistic';
      const stylePrompt = getVisualStylePrompt(visualStyle);
      const basePrompt = PromptLoader.render('assets/prop_product_shot', {
        propName,
        physicalCharacteristics,
        visualStyle: stylePrompt,
        customPrompt: params.custom_prompt || ''
      });
      const prompt = `${basePrompt}\n${STRICT_NO_TEXT_DIRECTIVE}`;

      Logger.info(`[AssetService.generatePropProductShot] Prompt for ${propName}: ${prompt}`);

      const result = await aiProviderRouter.generateImage(prompt, {
        aspectRatio: '16:9',
        imageInputs: params.reference_image_url ? [params.reference_image_url] : [],
      });

      if (!result || !result?.url) {
        throw new Error(`Failed to generate prop product shot for ${propName}`);
      }

      const s3 = await StorageFactory.uploadMedia(result.url, 'images', 'png', result.mimeType || 'image/png');
      const imageUrl = `/api/assets/file/${s3.key}`;
      const version: AssetVersion = {
        id: `v_${Date.now()}`,
        image_url: imageUrl,
        prompt,
        created_at: new Date().toISOString(),
        is_selected: true,
        aspect_ratio: '16:9',
      };

      const storePrompt = params.custom_prompt || prop.physical_characteristics;
      const existingVersions: AssetVersion[] = Array.isArray(prop?.versions) ? [...prop.versions] : [];
      if (existingVersions.length === 0 && prop?.image_url && prop.image_url !== imageUrl) {
        existingVersions.push({
          id: `v1_prop_${params.prop_id || prop?.id || 'main'}`,
          image_url: prop.image_url,
          url: prop.image_url,
          prompt: storePrompt,
          created_at: new Date().toISOString(),
          is_selected: false,
        });
      }
      const newVersions: AssetVersion[] = [
        version,
        ...existingVersions.map((v: AssetVersion) => ({ ...v, is_selected: false })),
      ];

      const normalizedProp = EntityNormalizer.normalizeProp({
        ...(prop || {}),
        id: params.prop_id || prop?.id || `prop_${Date.now()}`,
        name: propName,
        owner: prop.owner || prop.holder || '',
        physical_characteristics: physicalCharacteristics,
        image_url: imageUrl,
        prompt: storePrompt,
        versions: newVersions,
      });

      if (!normalizedProp) {
        throw new Error(`Failed to normalize prop ${propName}`);
      }

      if (series) {
        const existingProps: PropAsset[] = Array.isArray(series.props) ? [...series.props] : [];
        const mIdx = existingProps.findIndex((p: PropAsset) => p.id === normalizedProp.id || p.name === normalizedProp.name);
        if (mIdx >= 0) existingProps[mIdx] = { ...existingProps[mIdx], ...normalizedProp };
        else existingProps.push(normalizedProp);
        await db.updateSeries(params.series_id, { props: existingProps });
        const { PatchSyncService } = await import('@/realtime/PatchSyncService.js');
        const updatedSeries = await db.getSeriesById(params.series_id);
        if (updatedSeries) {
          PatchSyncService.broadcast(params.series_id, 'series:updated', updatedSeries);
        }
      }
      
      return { image_url: imageUrl, prop: normalizedProp, version, prompt: storePrompt };
    }catch(err){
      Logger.error(`[AssetService.generatePropProductShot] Failed to generate prop product shot for ${params.prop_id}: ${err}`);
      throw err;
    }
  }

  public static async generateShotImage(
    shot: ShotFrame,
    assetsMap: Map<string, { name: string; type: string; imageUrl?: string; image_url?: string; physicalCharacteristics?: string; physical_characteristics?: string }>,
    visualStyle?: string,
    aspectRatio: string = '9:16'
  ): Promise<{ imageUrl: string; prompt: string }> {
    const stylePrompt = getVisualStylePrompt(visualStyle);
    // Collect reference image URLs for multi-modal context
    const referenceImageUrls: string[] = [];
    const contextDescriptions: string[] = [];

    const linkedIds = shot.linked_asset_ids;
    if (Array.isArray(linkedIds)) {
      for (const assetId of linkedIds) {
        const asset = assetsMap.get(assetId);
        if (asset) {
          const img = asset.image_url || asset.imageUrl;
          if (img) {
            referenceImageUrls.push(img);
          }
          const charDesc = asset.physical_characteristics || asset.physicalCharacteristics;
          if (charDesc) {
            contextDescriptions.push(`[${(asset.type || 'ASSET').toUpperCase()}: ${asset.name}] ${charDesc}`);
          }
        }
      }
    }

    const basePrompt = PromptLoader.render('storyboard/shot_image', {
      frameVisual: shot.frame_visual,
      frameMotion: shot.frame_motion || 'Cinematic composition',
      contextDescriptions: contextDescriptions.join('\n'),
      visualStyle: stylePrompt,
    });
    const prompt = `${basePrompt}\n${STRICT_NO_TEXT_DIRECTIVE}`;

    Logger.info(`[AssetService.generateShotImage] Generating shot #${shot.index} with ${referenceImageUrls.length} references`);
    const result = await aiProviderRouter.generateImage(prompt, {
      aspectRatio: (aspectRatio as '9:16' | '16:9' | '1:1') || '9:16',
      characterReferences: referenceImageUrls,
      imageInputs: referenceImageUrls,
    });

    if (!result?.url) {
      throw new Error(`Failed to generate storyboard image for shot #${shot.index}`);
    }
    const s3 = await StorageFactory.uploadMedia(result.url, 'images', 'png', result.mimeType || 'image/png');
    return { imageUrl: `/api/assets/file/${s3.key}`, prompt };
  };

  /**
   * 6. High-level Prop Generation with Credit Deduction & Database persistence
   */
  // public static async generatePropAsset(params: {
  //   series_id: string;
  //   episode_id?: string;
  //   prop_id?: string;
  //   name?: string;
  //   physical_characteristics?: string;
  //   owner?: string;
  //   visual_style?: string;
  //   visual_style_prompt?: string;
  //   user_id?: string;
  //   custom_prompt?: string;
  //   reference_image_url?: string;
  //   aspect_ratio?: string;
  // }): Promise<{ image_url: string; prop: PropAsset; prompt: string; version: AssetVersion }> {
  //   const db = await getDatabaseProvider();
  //   const series = await db.getSeriesById(params.series_id);
  //   let episode: EpisodeEntity | null = null;
  //   if (params.episode_id) {
  //     episode = await db.getEpisodeById(params.episode_id);
  //   }

  //   const propList: PropAsset[] = (episode?.props && episode.props.length > 0) ? episode.props : (series?.props || []);
  //   const dbProp = propList.find((p: PropAsset) => p.id === params.prop_id || p.name === params.name);

  //   const propName = params.name || dbProp?.name || 'Key Prop';
  //   const propTraits = params.physical_characteristics || dbProp?.physical_characteristics || 'Detailed narrative key prop';
  //   const visualStyle = params.visual_style || series?.visual_style || 'realistic';
  //   // const targetAspect: '9:16' | '16:9' | '4:3' | '1:1' = (params.aspect_ratio as '9:16' | '16:9' | '4:3' | '1:1') || '16:9';

  //   if (params.user_id) {
  //     try {
  //       await CreditService.deductUserCredits(params.user_id, 'sceneImage', 'Prop Asset Generation', `Generated concept asset for prop ${propName}`);
  //     } catch (cErr: any) {
  //       Logger.warn(`[AssetService] Credit deduction notice: ${cErr.message}`);
  //     }
  //   }

  //   let imageUrl: string;
  //   let prompt: string;
  //   let version: AssetVersion;

  //   if (params.custom_prompt) {
  //     const cleanPrompt = AssetService.cleanNegativeDirectives(params.custom_prompt);
  //     const stylePrompt = getVisualStylePrompt(visualStyle);
  //     prompt = `${stylePrompt}, ${cleanPrompt}\n${STRICT_NO_TEXT_DIRECTIVE}`;
  //     const refImages: string[] = [];
  //     if (params.reference_image_url) {
  //       refImages.push(params.reference_image_url);
  //     } else if (dbProp?.image_url) {
  //       refImages.push(dbProp.image_url);
  //     }

  //     Logger.info(`[AssetService.generatePropAsset] Generating prop with custom prompt for ${propName}`);
  //     const result = await aiProviderRouter.generateImage(prompt, {
  //       aspectRatio: '16:9',
  //       characterReferences: refImages,
  //       imageInputs: refImages,
  //     });

  //     if (!result?.url) throw new Error(`Failed to generate prop image for ${propName}`);
  //     const s3 = await StorageFactory.uploadMedia(result.url, 'images', 'png', result.mimeType || 'image/png');
  //     imageUrl = `/api/assets/file/${s3.key}`;
  //     version = {
  //       id: `ver_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
  //       image_url: imageUrl,
  //       url: imageUrl,
  //       prompt,
  //       created_at: new Date().toISOString(),
  //       is_selected: true,
  //       aspect_ratio: '16:9',
  //     };
  //   } else {
  //     const shotRes = await this.generatePropProductShot(propName, propTraits, visualStyle);
  //     imageUrl = shotRes.imageUrl;
  //     prompt = shotRes.prompt;
  //     version = {
  //       id: `ver_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
  //       image_url: imageUrl,
  //       url: imageUrl,
  //       prompt,
  //       created_at: new Date().toISOString(),
  //       is_selected: true,
  //       aspect_ratio: '16:9',
  //     };
  //   }

  //   const existingVersions: AssetVersion[] = Array.isArray(dbProp?.versions) ? [...dbProp.versions] : [];
  //   if (existingVersions.length === 0 && dbProp?.image_url && dbProp.image_url !== imageUrl) {
  //     existingVersions.push({
  //       id: `v1_prop_${params.prop_id || dbProp?.id || 'main'}`,
  //       image_url: dbProp.image_url,
  //       url: dbProp.image_url,
  //       prompt: dbProp.prompt || '',
  //       created_at: new Date().toISOString(),
  //       is_selected: false,
  //     });
  //   }
  //   const newVersions: AssetVersion[] = [
  //     version,
  //     ...existingVersions.map((v: AssetVersion) => ({ ...v, is_selected: false })),
  //   ];

  //   const normalizedProp = EntityNormalizer.normalizeProp({
  //     ...(dbProp || {}),
  //     id: params.prop_id || dbProp?.id || `prop_${Date.now()}`,
  //     name: propName,
  //     owner: params.owner || dbProp?.owner || '',
  //     physical_characteristics: propTraits,
  //     image_url: imageUrl,
  //     prompt,
  //     versions: newVersions,
  //   });

  //   if (!normalizedProp) {
  //     throw new Error(`Failed to normalize prop ${propName}`);
  //   }

  //   if (series) {
  //     const existingProps: PropAsset[] = Array.isArray(series.props) ? [...series.props] : [];
  //     const mIdx = existingProps.findIndex((p: PropAsset) => p.id === normalizedProp.id || p.name === normalizedProp.name);
  //     if (mIdx >= 0) existingProps[mIdx] = { ...existingProps[mIdx], ...normalizedProp };
  //     else existingProps.push(normalizedProp);
  //     await db.updateSeries(params.series_id, { props: existingProps });
  //   }

  //   return { image_url: imageUrl, prop: normalizedProp, prompt, version };
  // }

  /**
   * Cleans repeated negative directives, typography warnings, and aspect ratio tags from prompt.
   */
  public static cleanNegativeDirectives(rawPrompt?: string): string {
    if (!rawPrompt) return '';
    let cleaned = rawPrompt;
    cleaned = cleaned.replace(/Clean visual photography, completely free of text, typography, letters, titles, subtitles, words, watermarks, UI elements, overlays, labels, badges, or captions\.?/gi, '');
    cleaned = cleaned.replace(/,?\s*aspect ratio \d+:\d+\.?/gi, '');
    return cleaned
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  /**
   * Resolves the best wardrobe variant image for a character in a specific scene/episode.
   * Prioritizes in-episode wardrobe variants over the character's general avatar portrait.
   */
  public static resolveCharacterWardrobe(
    matchedChar: CharacterSeriesEntity,
    scene?: SceneEntity,
    episode?: EpisodeEntity | null
  ): { image_url?: string; wardrobeText?: string } {
    const variants = Array.isArray(matchedChar.wardrobe_variants) ? matchedChar.wardrobe_variants : [];
    const cNameNorm = (matchedChar.name || '').toLowerCase().trim();

    const sceneCostume = Array.isArray(scene?.character_costumes)
      ? scene!.character_costumes!.find((cc: CharacterSceneCostumes) => {
          const ccName = (cc.character || '').toLowerCase().trim();
          return ccName === cNameNorm || ccName.includes(cNameNorm) || cNameNorm.includes(ccName);
        })
      : null;

    let matchedVariant: CharacterWardrobeVariant | undefined;

    // 1. Match by variant_id in scene costume
    if (sceneCostume?.variant_id && variants.length > 0) {
      const vIdTarget = String(sceneCostume.variant_id).toLowerCase().trim();
      matchedVariant = variants.find(v => (v.variant_id || '').toLowerCase().trim() === vIdTarget || (v.name || '').toLowerCase().trim() === vIdTarget);
    }

    // 2. Match by wardrobe text in sceneCostume
    if (!matchedVariant && sceneCostume?.wardrobe && variants.length > 0) {
      const wLower = String(sceneCostume.wardrobe).toLowerCase().trim();
      matchedVariant = variants.find(v => {
        const vName = (v.name || '').toLowerCase().trim();
        const vClothing = (v.clothing_and_accessories || '').toLowerCase().trim();
        return (vName && wLower.includes(vName)) || (vClothing && (wLower.includes(vClothing) || vClothing.includes(wLower)));
      });
    }

    // 3. Match by scene number in associated_scenes
    const sceneNum = scene?.scene_number || scene?.index;
    if (!matchedVariant && typeof sceneNum === 'number' && variants.length > 0) {
      matchedVariant = variants.find(v => Array.isArray(v.associated_scenes) && v.associated_scenes.includes(sceneNum));
    }

    // 4. Match by scene description / visual prompt text keywords (e.g. "janitor", "jumpsuit", "uniform", "suit")
    if (!matchedVariant && variants.length > 0) {
      const sceneText = `${scene?.description || ''} ${scene?.action || ''} ${scene?.visual_prompt || ''} ${scene?.prompt || ''} ${scene?.end_frame_prompt || ''} ${scene?.frame_description || ''}`.toLowerCase();
      matchedVariant = variants.find(v => {
        const vName = (v.name || '').toLowerCase().trim();
        const vClothing = (v.clothing_and_accessories || '').toLowerCase().trim();
        return (vName && sceneText.includes(vName)) || (vClothing && sceneText.includes(vClothing));
      });
    }

    // 5. Look for any wardrobe variant in the same episode's scenes
    if (!matchedVariant && episode && Array.isArray(episode.scenes) && variants.length > 0) {
      for (const epScene of episode.scenes) {
        const epCostume = Array.isArray(epScene.character_costumes)
          ? epScene.character_costumes.find((cc: CharacterSceneCostumes) => (cc.character || '').toLowerCase().trim() === cNameNorm)
          : null;
        if (epCostume?.variant_id) {
          const vTarget = String(epCostume.variant_id).toLowerCase().trim();
          matchedVariant = variants.find(v => (v.variant_id || '').toLowerCase().trim() === vTarget);
          if (matchedVariant) break;
        }
      }
    }

    // 6. CRITICAL FALLBACK: If character has wardrobe variants with an image, ALWAYS prefer that over raw avatar!
    // The master avatar is often an off-costume portrait, while wardrobe variants are the in-series costumes.
    if (!matchedVariant && variants.length > 0) {
      matchedVariant = variants.find(v => v.image_url) || variants[0];
    }

    const image_url = matchedVariant?.image_url ||
      variants.find(v => v.image_url)?.image_url ||
      matchedChar.avatar ||
      undefined;

    const wardrobeText = matchedVariant?.clothing_and_accessories ||
      sceneCostume?.wardrobe ||
      matchedChar.clothing_and_accessories ||
      '';

    return { image_url, wardrobeText };
  }

  /**
   * Resolves the full list of reference asset images and contexts for a scene
   * identically to how storyboard keyframes are initially generated:
   * 1. Character wardrobe images (prioritizing in-episode wardrobe variants over avatars)
   * 2. Location image
   * 3. Props images
   */
  public static resolveSceneReferenceAssets(
    series: SeriesEntity,
    episode: EpisodeEntity | null,
    scene: SceneEntity,
  ): {
    referenceImages: string[];
    characterContextList: string[];
    locationContext: string;
    propContextList: string[];
  } {
    const allChars: CharacterSeriesEntity[] = Array.isArray(series.characters) ? series.characters : [];
    const allLocs: LocationAsset[] = Array.isArray(series.locations) ? series.locations : [];
    const allProps: PropAsset[] = Array.isArray(series.props) ? series.props : [];

    const referenceImages: string[] = [];
    const characterContextList: string[] = [];
    let locationContext = '';
    const propContextList: string[] = [];

    // 1. Resolve Characters in this scene
    const sceneCharNames: string[] = Array.isArray(scene.reference_assets?.characters) && scene.reference_assets.characters.length > 0
      ? scene.reference_assets.characters
      : (Array.isArray(scene.character_costumes) ? scene.character_costumes.map((cc: CharacterSceneCostumes) => cc.character) : []);

    for (const cName of sceneCharNames) {
      if (!cName) continue;
      const cNameOrIdLower = String(cName).toLowerCase().trim();
      const matchedChar = allChars.find((c: CharacterSeriesEntity) => (c.name || '').toLowerCase().trim() === cNameOrIdLower || c.id === cNameOrIdLower);
      if (matchedChar) {
        const { image_url: charImg, wardrobeText } = AssetService.resolveCharacterWardrobe(matchedChar, scene, episode);
        if (charImg && !referenceImages.includes(charImg)) {
          referenceImages.push(charImg);
        }

        const traits = matchedChar.visual_traits || matchedChar.physical_characteristics || matchedChar.appearance || matchedChar.traits || '';
        const wardrobe = wardrobeText || matchedChar.clothing_and_accessories || '';
        characterContextList.push(`[CHARACTER: ${matchedChar.name}] Physical appearance: ${traits}. Wearing: ${wardrobe}. Must maintain exact facial structure and costume consistency as reference image.`);
      }
    }

    // 2. Resolve Location
    const sceneLocNames: string[] = Array.isArray(scene.reference_assets?.locations) && scene.reference_assets.locations.length > 0
      ? scene.reference_assets.locations
      : (scene.location ? [scene.location] : (scene.heading ? [scene.heading] : []));

    for (const lName of sceneLocNames) {
      if (!lName) continue;
      const lNameLower = String(lName).toLowerCase().trim();
      const matchedLoc = allLocs.find((l: LocationAsset) => l.id === lName || (l.name || '').toLowerCase().trim() === lNameLower || lNameLower.includes((l.name || '').toLowerCase().trim()) || (l.name || '').toLowerCase().includes(lNameLower));
      if (matchedLoc) {
        if (matchedLoc.image_url && !referenceImages.includes(matchedLoc.image_url)) {
          referenceImages.push(matchedLoc.image_url);
        }
        const locDesc = matchedLoc.physical_characteristics || '';
        locationContext = `[LOCATION: ${matchedLoc.name}] Environment: ${locDesc} (Time: ${matchedLoc.time_of_day || scene.time_of_day || 'Daytime'}).`;
        break;
      }
    }

    // 3. Resolve Props
    const scenePropNames: string[] = Array.isArray(scene.reference_assets?.props) ? scene.reference_assets.props : [];
    for (const pName of scenePropNames) {
      if (!pName) continue;
      const pNameLower = String(pName).toLowerCase().trim();
      const matchedProp = allProps.find((p: PropAsset) => p.id === pName || (p.name || '').toLowerCase().trim() === pNameLower);
      if (matchedProp) {
        if (matchedProp.image_url && !referenceImages.includes(matchedProp.image_url)) {
          referenceImages.push(matchedProp.image_url);
        }
        propContextList.push(`[PROP: ${matchedProp.name}] Details: ${matchedProp.physical_characteristics || ''}`);
      }
    }

    return { referenceImages, characterContextList, locationContext, propContextList };
  }

  /**
   * 7. Generate storyboard keyframe for a scene with strict character consistency
   */
  public static async generateStoryboardShot(params: {
    series_id: string;
    episode_id: string;
    scene_index: number;
    custom_prompt?: string;
    user_id: string;
    generate_start_frame: boolean;
    generate_end_frame: boolean;
    use_reference_frame?: string;
  }): Promise<{ image_url: string; end_frame_url?: string; scene: SceneEntity; prompt?: string; version?: AssetVersion }> {
    Logger.info(`generateStoryboardShot: ${JSON.stringify(params)}`);
    const db = await getDatabaseProvider();
    const series = await db.getSeriesById(params.series_id);
    if (!series) throw new Error(`Series ${params.series_id} not found`);
    if (!params.user_id) {
      throw new Error('User ID is required');
    }
    
    const episode = await db.getEpisodeById(params.episode_id);
    const scenesList: SceneEntity[] = Array.isArray(episode?.scenes) ? episode!.scenes : [];
    const sceneIdx = scenesList.findIndex((s: SceneEntity) => Number(s.index || s.scene_number) === Number(params.scene_index));
    if (sceneIdx === -1) throw new Error(`Scene #${params.scene_index} not found in episode`);

    const scene = scenesList[sceneIdx];
    const stylePrompt = getVisualStylePrompt(series.visual_style || 'realistic');

    // Collect all reference_assets exactly: wardrobe variants, location, props
    let { referenceImages, characterContextList, locationContext, propContextList } =
      AssetService.resolveSceneReferenceAssets(series, episode, scene);

    Logger.info(`generateStoryboardShot resolveSceneReferenceAssets: ${JSON.stringify({ referenceImages, characterContextList, locationContext, propContextList })}`);

    const targetAspect: '9:16' | '16:9' | '4:3' | '1:1' = (series.ratio === '1:1' || series.ratio === '16:9' || series.ratio === '4:3') ? series.ratio : '9:16';
    let startImageUrl: string | '' = '';
    let endImageUrl: string | '' = '';
    let fullPrompt: string | '' = '';
    let version: AssetVersion | undefined = undefined;
    
    // Deduct credits
    if(params.generate_start_frame){
      const deduct = await CreditService.deductUserCredits(params.user_id, 'sceneImage', 'Storyboard Start Frame Generation', `Generated storyboard keyframe for Scene #${params.scene_index}`);
      if (!deduct.success) {
        throw new Error(deduct.error || 'Credit deduction failed');
      }
    }

    if(params.generate_end_frame){
      const deduct = await CreditService.deductUserCredits(params.user_id, 'sceneImage', 'Storyboard End Frame Generation', `Generated storyboard keyframe for Scene #${params.scene_index}`);
      if (!deduct.success) {
        await CreditService.refundUserCredits(params.user_id, 'sceneImage', 'Storyboard Start Frame Generation', `Generated storyboard keyframe for Scene #${params.scene_index}`);
        throw new Error(deduct.error || 'Credit deduction failed');
      }
    }

    // Build prompt for Start Frame
    let storePrompt = '';
    if (params.generate_start_frame) {
      const visualDesc = params.custom_prompt || scene.visual_prompt || scene.frame_description || scene.description || scene.action || '';
      const prompt = PromptLoader.render('scene/scene_image_final', {
        locationContext: locationContext || undefined,
        propContext: propContextList.length > 0 ? propContextList.join('; ') : (scene.prop_details || undefined),
        visualDescription: visualDesc,
        characterContext: characterContextList.length > 0 ? characterContextList.join('\n') : undefined,
        visualStyle: stylePrompt,
      });

      fullPrompt = `${stylePrompt}, ${prompt}\n${STRICT_NO_TEXT_DIRECTIVE}, aspect ratio ${targetAspect}.`;
      storePrompt = visualDesc;
      if(params.use_reference_frame){
        referenceImages.unshift(params.use_reference_frame);
      }
      Logger.info(`[AssetService.generateStoryboardShot] Generating scene #${params.scene_index} start frame with ${referenceImages.length} reference image(s): ${referenceImages.join(', ')}`);

      const result = await aiProviderRouter.generateImage(fullPrompt, {
        aspectRatio: targetAspect,
        // characterReferences: referenceImages,
        imageInputs: referenceImages,
      });

      if (!result?.url) throw new Error(`Failed to generate storyboard image for Scene #${params.scene_index}`);

      const s3 = await StorageFactory.uploadMedia(result.url, 'images', 'png', result.mimeType || 'image/png');
      startImageUrl = `/api/assets/file/${s3.key}`;

      version = {
        id: `ver_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        image_url: startImageUrl,
        prompt: storePrompt,
        created_at: new Date().toISOString(),
        is_selected: true,
        aspect_ratio: targetAspect,
      };

      const existingVersions: AssetVersion[] = Array.isArray(scene.versions) ? [...scene.versions] : [];
      scene.versions = [
        ...existingVersions.map((v) => ({ ...v, is_selected: false })),
        version,
      ];
      // scene.prompt = fullPrompt;
      scene.image_url = startImageUrl;
      scene.storyboard_frame_url = startImageUrl;
      scene.status = 'image_ready';
    }
    else{
      startImageUrl = scene.storyboard_frame_url || '';
    }

    if(params.generate_end_frame){
      try {
        let endFrameUrl: string | undefined;
        const reserveEndPrompt = params.generate_start_frame && params.generate_start_frame;
        Logger.info(`[AssetService.generateStoryboardShot] GENERATE_START_END_FRAME=true: Generating end frame for Scene #${params.scene_index}`);
        const originVisualDesc = scene.end_frame_prompt || scene.frame_description || scene.description || scene.action || '';
        const endPrompt = PromptLoader.render('scene/scene_image_final', {
          locationContext: locationContext || undefined,
          propContext: propContextList.length > 0 ? propContextList.join('; ') : (scene.prop_details || undefined),
          visualDescription: reserveEndPrompt ? originVisualDesc : (params.custom_prompt || originVisualDesc),
          characterContext: characterContextList.length > 0 ? characterContextList.join('\n') : undefined,
          visualStyle: stylePrompt,
        });

        storePrompt = reserveEndPrompt ? originVisualDesc : (params.custom_prompt || originVisualDesc);
        fullPrompt = `${stylePrompt}, ${endPrompt}\n${STRICT_NO_TEXT_DIRECTIVE}, aspect ratio ${targetAspect}.`;
        const endRefImages = [startImageUrl, ...referenceImages.filter((r) => r !== startImageUrl)];
        if(params.use_reference_frame){
          endRefImages.unshift(params.use_reference_frame);
        }

        const endResult = await aiProviderRouter.generateImage(fullPrompt, {
          aspectRatio: targetAspect,
          // characterReferences: (endRefImages && endRefImages.length > 0 ? endRefImages : []),
          imageInputs: (endRefImages && endRefImages.length > 0 ? endRefImages : []),
        });

        if (endResult?.url) {
          const endS3 = await StorageFactory.uploadMedia(endResult.url, 'images', 'png', endResult.mimeType || 'image/png');
          endImageUrl = `/api/assets/file/${endS3.key}`;
          scene.storyboard_end_frame_url = endImageUrl;
          // scene.end_frame_prompt = fullPrompt;

          const endVersion: AssetVersion = {
            id: `ver_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            image_url: endImageUrl,
            prompt: storePrompt,
            created_at: new Date().toISOString(),
            is_selected: true,
            aspect_ratio: targetAspect,
          };

          const curEndVersions: AssetVersion[] = Array.isArray(scene.end_frame_versions) ? [...scene.end_frame_versions] : [];
          scene.end_frame_versions = [
            ...curEndVersions.map((v) => ({ ...v, is_selected: false })),
            endVersion,
          ];

          if (!params.generate_start_frame) {
            version = endVersion;
          }

          Logger.info(`[AssetService.generateStoryboardShot] End frame generated for Scene #${params.scene_index}: ${endImageUrl}`);
        }
      } catch (endErr: any) {
        Logger.warn(`[AssetService.generateStoryboardShot] End frame generation skipped for Scene #${params.scene_index}: ${endErr.message}`);
      }
    }

    scenesList[sceneIdx] = scene;
    await db.updateEpisode(params.episode_id, { scenes: scenesList });
    try {
      await TimelineService.getOrBuildEpisodeTimeline(params.episode_id);
    } catch (tlErr: any) {
      Logger.warn(`[AssetService.generateStoryboardShot] Timeline sync notice: ${tlErr.message}`);
    }

    try {
      const { PatchSyncService } = await import('@/realtime/PatchSyncService.js');
      const updatedEp = await db.getEpisodeById(params.episode_id);
      if (updatedEp) {
        PatchSyncService.broadcast(params.series_id, 'episode:updated', updatedEp);
      }
    } catch (wsErr: any) {
      Logger.warn(`[AssetService.generateStoryboardShot] WebSocket broadcast notice: ${wsErr.message}`);
    }

    storePrompt = params.custom_prompt || storePrompt;
    return { image_url: startImageUrl, end_frame_url: endImageUrl, scene: scenesList[sceneIdx], prompt: storePrompt, version };
  }

  /**
   * 8. Customize an asset via custom prompt, using the asset's current image as reference
   */
  public static async customizeAsset(params: CustomizeAssetParams): Promise<CustomizeAssetResult> {
    const db = await getDatabaseProvider();
    const series = await db.getSeriesById(params.series_id);
    if (!series) throw new Error(`Series ${params.series_id} not found`);

    let episode: EpisodeEntity | null = null;
    if (params.episode_id) {
      episode = await db.getEpisodeById(params.episode_id);
    }

    if (!params.user_id) {
      throw new Error("User not found");
    }

    // Ensure episode is loaded if customizing a scene_frame
    if (!episode && params.series_id && params.asset_type === 'scene_frame') {
      try {
        const eps = await db.getEpisodesBySeriesId(params.series_id);
        if (eps && eps.length > 0) {
          episode = eps.find((e: EpisodeEntity) => Array.isArray(e.scenes) && e.scenes.some((s: SceneEntity) => s.id === params.asset_id || String(s.index || s.scene_number) === String(params.asset_id))) || eps[0];
        }
      } catch {}
    }

    const isCharacterAsset = params.asset_type === 'character';
    const isLocationAsset = params.asset_type === 'location';
    const isPropAsset = params.asset_type === 'prop';
    const isWardrobeAsset = params.asset_type === 'wardrobe';
    const isSceneFrame = params.asset_type === 'scene_frame';
    const isEndFrame = isSceneFrame && (params.variant_id === 'end_frame' || params.variant_id === 'scene_end_frame');

    if (isSceneFrame) {
      const scenes: SceneEntity[] = Array.isArray(episode?.scenes) ? episode!.scenes : [];
      const scene = scenes.find((s: SceneEntity) => s.id === params.asset_id || String(s.index || s.scene_number) === String(params.asset_id));
      if (!scene) throw new Error(`Scene frame ${params.asset_id} not found in episode`);

      const sceneIndex = Number(scene.index ?? scene.scene_number);
      let use_reference_frame: string | undefined = undefined;
      if (params.use_reference_image !== false) {
        if (params.reference_image_url) {
          use_reference_frame = params.reference_image_url;
        } else if (isEndFrame) {
          use_reference_frame = scene.storyboard_end_frame_url || scene.storyboard_frame_url || scene.image_url;
        } else {
          use_reference_frame = scene.storyboard_frame_url || scene.image_url;
        }
      }

      const result = await this.generateStoryboardShot({
        series_id: params.series_id,
        episode_id: params.episode_id || episode?.id || '',
        scene_index: sceneIndex,
        custom_prompt: params.custom_prompt,
        user_id: params.user_id,
        generate_start_frame: !isEndFrame,
        generate_end_frame: isEndFrame,
        use_reference_frame: use_reference_frame || undefined,
      });

      const finalImageUrl = isEndFrame ? (result.end_frame_url || result.image_url) : (result.image_url || result.end_frame_url);
      if (!result || !finalImageUrl) {
        throw new Error(`Failed to customize ${params.asset_type} asset`);
      }

      const finalVersion: AssetVersion = result.version || {
        id: `ver_${Date.now()}`,
        image_url: finalImageUrl,
        prompt: result.prompt || params.custom_prompt,
        created_at: new Date().toISOString(),
        is_selected: true,
      };

      return {
        image_url: finalImageUrl,
        prompt: result.prompt || params.custom_prompt,
        version: finalVersion,
        asset: result.scene,
      };
    } else if (isCharacterAsset) {
      const result = await this.generateCharacterPortrait({
        user_id: params.user_id,
        series_id: params.series_id,
        character_id: params.asset_id,
        custom_prompt: params.custom_prompt,
        reference_image_url: params.use_reference_image !== false ? params.reference_image_url : undefined,
      });

      if (!result || !result.image_url) {
        throw new Error(`Failed to customize character asset ${params.asset_id}`);
      }

      return {
        image_url: result.image_url,
        prompt: result.prompt,
        version: result.version,
        asset: (result.character || { id: params.asset_id, name: params.asset_id }) as CustomizableAsset,
      };
    } else if (isWardrobeAsset) {
      if(!params.variant_id){
        throw new Error(`Variant ID is required for wardrobe asset`);
      }
      const result = await this.generateCharacterWardrobe({
        series_id: params.series_id,
        character_id: params.asset_id,
        variant_id: params.variant_id,
        custom_prompt: params.custom_prompt,
        reference_image_url: params.use_reference_image !== false ? params.reference_image_url : undefined,
        user_id: params.user_id,
      });

      if (!result || !result.image_url) {
        throw new Error(`Failed to customize wardrobe asset ${params.variant_id}`);
      }

      return {
        image_url: result.image_url,
        prompt: result.prompt,
        version: result.version,
        asset: result.wardrobe,
      };
    } else if (isLocationAsset) {
      const result = await this.generateLocationSheet({
        user_id: params.user_id,
        series_id: params.series_id,
        // episode_id: params.episode_id,
        location_id: params.asset_id,
        custom_prompt: params.custom_prompt,
        reference_image_url: params.use_reference_image !== false ? params.reference_image_url : undefined,
      });

      if (!result || !result.image_url) {
        throw new Error(`Failed to customize location asset ${params.asset_id}`);
      }

      return {
        image_url: result.image_url,
        prompt: result.prompt,
        version: result.version,
        asset: result.location,
      };
    } else if (isPropAsset) {
      const result = await this.generatePropProductShot({
        series_id: params.series_id,
        episode_id: params.episode_id,
        prop_id: params.asset_id,
        custom_prompt: params.custom_prompt,
        reference_image_url: params.use_reference_image !== false ? params.reference_image_url : undefined,
        user_id: params.user_id,
      });

      if (!result || !result.image_url) {
        throw new Error(`Failed to customize prop asset ${params.asset_id}`);
      }

      return {
        image_url: result.image_url,
        prompt: result.prompt,
        version: result.version,
        asset: result.prop,
      };
    } else {
      throw new Error(`Invalid asset type: ${params.asset_type}`);
    }
  }

  /**
   * 9. Select a specific version for an asset
   */
  public static async selectAssetVersion(params: SelectAssetVersionParams): Promise<SelectAssetVersionResult> {
    const db = await getDatabaseProvider();
    const series = await db.getSeriesById(params.series_id);
    if (!series) throw new Error(`Series ${params.series_id} not found`);

    let episode: EpisodeEntity | null = null;
    if (params.episode_id) {
      episode = await db.getEpisodeById(params.episode_id);
    }

    let activeImageUrl = '';
    let updatedAsset: CustomizableAsset | null = null;

    if (params.asset_type === 'character') {
      const chars: CharacterSeriesEntity[] = Array.isArray(series.characters) ? [...series.characters] : [];
      const idx = chars.findIndex((c: CharacterSeriesEntity) => c.id === params.asset_id || c.name === params.asset_id);
      if (idx === -1) throw new Error(`Character ${params.asset_id} not found`);

      const char: CharacterSeriesEntity = { ...chars[idx] };
      const versions: AssetVersion[] = Array.isArray(char.versions) ? [...char.versions] : [];
      let targetVer = versions.find((v: AssetVersion) => v.id === params.version_id);
      if (!targetVer && (params.version_id.startsWith('v1_') || params.version_id.startsWith('ver_init_'))) {
        targetVer = versions[0];
      }
      if (!targetVer) throw new Error(`Version ${params.version_id} not found`);

      char.versions = versions.map((v: AssetVersion) => ({ ...v, is_selected: v.id === targetVer!.id }));
      char.avatar = targetVer.image_url;
      // if (targetVer.prompt) char.prompt = targetVer.prompt;
      chars[idx] = char;
      await db.updateSeries(params.series_id, { characters: chars });
      activeImageUrl = targetVer.image_url || '';
      updatedAsset = char;
    } else if (params.asset_type === 'wardrobe') {
      const chars: CharacterSeriesEntity[] = Array.isArray(series.characters) ? [...series.characters] : [];
      const idx = chars.findIndex((c: CharacterSeriesEntity) => c.id === params.asset_id || c.name === params.asset_id);
      if (idx === -1) throw new Error(`Character ${params.asset_id} not found`);

      const char: CharacterSeriesEntity = { ...chars[idx] };
      const variants: CharacterWardrobeVariant[] = Array.isArray(char.wardrobe_variants) ? [...char.wardrobe_variants] : [];
      const vIdx = variants.findIndex((v: CharacterWardrobeVariant) => v.variant_id === params.variant_id || (v as { id?: string }).id === params.variant_id || v.name === params.variant_id);
      if (vIdx === -1) throw new Error(`Wardrobe variant ${params.variant_id} not found`);

      const variant: CharacterWardrobeVariant = { ...variants[vIdx] };
      const versions: AssetVersion[] = Array.isArray(variant.versions) ? [...variant.versions] : [];
      let targetVer = versions.find((v: AssetVersion) => v.id === params.version_id);
      if (!targetVer && (params.version_id.startsWith('v1_') || params.version_id.startsWith('ver_init_'))) {
        targetVer = versions[0];
      }
      if (!targetVer) throw new Error(`Version ${params.version_id} not found`);

      variant.versions = versions.map((v: AssetVersion) => ({ ...v, is_selected: v.id === targetVer!.id }));
      variant.image_url = targetVer.image_url;
      // if (targetVer.prompt) variant.prompt = targetVer.prompt;
      variants[vIdx] = variant;
      char.wardrobe_variants = variants;
      chars[idx] = char;
      await db.updateSeries(params.series_id, { characters: chars });
      try {
        const { PatchSyncService } = await import('@/realtime/PatchSyncService.js');
        const updatedSeries = await db.getSeriesById(params.series_id);
        if (updatedSeries) {
          PatchSyncService.broadcast(params.series_id, 'series:updated', updatedSeries);
        }
      } catch (wsErr: any) {
        Logger.warn(`[AssetService.selectAssetVersion] WebSocket broadcast notice: ${wsErr.message}`);
      }
      activeImageUrl = targetVer.image_url;
      updatedAsset = variant;
    } else if (params.asset_type === 'location') {
      const locs: LocationAsset[] = Array.isArray(series.locations) ? [...series.locations] : [];
      const idx = locs.findIndex((l: LocationAsset) => l.id === params.asset_id || l.name === params.asset_id);
      if (idx === -1) throw new Error(`Location ${params.asset_id} not found`);

      const loc: LocationAsset = { ...locs[idx] };
      const versions: AssetVersion[] = Array.isArray(loc.versions) ? [...loc.versions] : [];
      let targetVer = versions.find((v: AssetVersion) => v.id === params.version_id);
      if (!targetVer && (params.version_id.startsWith('v1_') || params.version_id.startsWith('ver_init_'))) {
        targetVer = versions[0];
      }
      if (!targetVer) throw new Error(`Version ${params.version_id} not found`);

      loc.versions = versions.map((v: AssetVersion) => ({ ...v, is_selected: v.id === targetVer!.id }));
      loc.image_url = targetVer.image_url;
      // if (targetVer.prompt) loc.prompt = targetVer.prompt;
      locs[idx] = loc;
      await db.updateSeries(params.series_id, { locations: locs });
      try {
        const { PatchSyncService } = await import('@/realtime/PatchSyncService.js');
        const updatedSeries = await db.getSeriesById(params.series_id);
        if (updatedSeries) {
          PatchSyncService.broadcast(params.series_id, 'series:updated', updatedSeries);
        }
      } catch (wsErr: any) {
        Logger.warn(`[AssetService.selectAssetVersion] WebSocket broadcast notice: ${wsErr.message}`);
      }
      activeImageUrl = targetVer.image_url;
      updatedAsset = loc;
    } else if (params.asset_type === 'prop') {
      const props: PropAsset[] = Array.isArray(series.props) ? [...series.props] : [];
      const idx = props.findIndex((p: PropAsset) => p.id === params.asset_id || p.name === params.asset_id);
      if (idx === -1) throw new Error(`Prop ${params.asset_id} not found`);

      const prop: PropAsset = { ...props[idx] };
      const versions: AssetVersion[] = Array.isArray(prop.versions) ? [...prop.versions] : [];
      let targetVer = versions.find((v: AssetVersion) => v.id === params.version_id);
      if (!targetVer && (params.version_id.startsWith('v1_') || params.version_id.startsWith('ver_init_'))) {
        targetVer = versions[0];
      }
      if (!targetVer) throw new Error(`Version ${params.version_id} not found`);

      prop.versions = versions.map((v: AssetVersion) => ({ ...v, is_selected: v.id === targetVer!.id }));
      prop.image_url = targetVer.image_url;
      // if (targetVer.prompt) prop.prompt = targetVer.prompt;
      props[idx] = prop;
      await db.updateSeries(params.series_id, { props });
      try {
        const { PatchSyncService } = await import('@/realtime/PatchSyncService.js');
        const updatedSeries = await db.getSeriesById(params.series_id);
        if (updatedSeries) {
          PatchSyncService.broadcast(params.series_id, 'series:updated', updatedSeries);
        }
      } catch (wsErr: any) {
        Logger.warn(`[AssetService.selectAssetVersion] WebSocket broadcast notice: ${wsErr.message}`);
      }
      activeImageUrl = targetVer.image_url;
      updatedAsset = prop;
    } else if (params.asset_type === 'scene_frame' || params.asset_type === 'scene_video' || params.asset_type === 'voiceover' || params.asset_type === 'bgm') {
      if (!episode) throw new Error(`Episode required for scene version selection`);
      const scenes: SceneEntity[] = Array.isArray(episode.scenes) ? [...episode.scenes] : [];
      const idx = scenes.findIndex((s: SceneEntity) => s.id === params.asset_id || String(s.index || s.scene_number) === String(params.asset_id));
      if (idx === -1) throw new Error(`Scene frame ${params.asset_id} not found`);

      const scene: SceneEntity = { ...scenes[idx] };
      const isEndFrame = params.variant_id === 'end_frame' || params.variant_id === 'scene_end_frame';
      const isVideo = params.asset_type === 'scene_video' || params.variant_id === 'video' || params.variant_id === 'scene_video';
      const isVoice = params.asset_type === 'voiceover' || params.variant_id === 'voiceover' || params.variant_id === 'voice';
      const isBgm = params.asset_type === 'bgm' || params.variant_id === 'bgm';

      if (isEndFrame) {
        const versions: AssetVersion[] = Array.isArray(scene.end_frame_versions) ? [...scene.end_frame_versions] : [];
        let targetVer = versions.find((v: AssetVersion) => v.id === params.version_id);
        if (!targetVer && (params.version_id.startsWith('v1_') || params.version_id.startsWith('ver_init_'))) {
          targetVer = versions[0];
        }
        if (!targetVer) throw new Error(`Version ${params.version_id} not found`);

        scene.end_frame_versions = versions.map((v: AssetVersion) => ({ ...v, is_selected: v.id === targetVer!.id }));
        scene.storyboard_end_frame_url = targetVer.image_url;
        // if (targetVer.prompt) scene.end_frame_prompt = targetVer.prompt;
        activeImageUrl = targetVer.image_url;
      } else if (isVideo) {
        const versions: AssetVersion[] = Array.isArray(scene.video_versions) ? [...scene.video_versions] : [];
        let targetVer = versions.find((v: AssetVersion) => v.id === params.version_id);
        if (!targetVer && (params.version_id.startsWith('v1_') || params.version_id.startsWith('ver_init_'))) {
          targetVer = versions[0];
        }
        if (!targetVer) throw new Error(`Version ${params.version_id} not found`);

        scene.video_versions = versions.map((v: AssetVersion) => ({ ...v, is_selected: v.id === targetVer!.id }));
        scene.video_url = targetVer.video_url || targetVer.image_url || targetVer.url || '';
        activeImageUrl = scene.video_url;
      } else if (isVoice) {
        const versions: AssetVersion[] = Array.isArray(scene.voice_versions) ? [...scene.voice_versions] : [];
        let targetVer = versions.find((v: AssetVersion) => v.id === params.version_id);
        if (!targetVer && (params.version_id.startsWith('v1_') || params.version_id.startsWith('ver_init_'))) {
          targetVer = versions[0];
        }
        if (!targetVer) throw new Error(`Version ${params.version_id} not found`);

        scene.voice_versions = versions.map((v: AssetVersion) => ({ ...v, is_selected: v.id === targetVer!.id }));
        scene.voiceover_url = targetVer.voiceover_url || targetVer.audio_url || targetVer.image_url || targetVer.url || '';
        activeImageUrl = scene.voiceover_url;
      } else if (isBgm) {
        const versions: AssetVersion[] = Array.isArray(scene.bgm_versions) ? [...scene.bgm_versions] : [];
        let targetVer = versions.find((v: AssetVersion) => v.id === params.version_id);
        if (!targetVer && (params.version_id.startsWith('v1_') || params.version_id.startsWith('ver_init_'))) {
          targetVer = versions[0];
        }
        if (!targetVer) throw new Error(`Version ${params.version_id} not found`);

        scene.bgm_versions = versions.map((v: AssetVersion) => ({ ...v, is_selected: v.id === targetVer!.id }));
        scene.bgm_url = targetVer.bgm_url || targetVer.audio_url || targetVer.image_url || targetVer.url || '';
        activeImageUrl = scene.bgm_url;
      } else {
        const versions: AssetVersion[] = Array.isArray(scene.versions) ? [...scene.versions] : [];
        let targetVer = versions.find((v: AssetVersion) => v.id === params.version_id);
        if (!targetVer && (params.version_id.startsWith('v1_') || params.version_id.startsWith('ver_init_'))) {
          targetVer = versions[0];
        }
        if (!targetVer) throw new Error(`Version ${params.version_id} not found`);

        scene.versions = versions.map((v: AssetVersion) => ({ ...v, is_selected: v.id === targetVer!.id }));
        scene.image_url = targetVer.image_url;
        scene.storyboard_frame_url = targetVer.image_url;
        // if (targetVer.prompt) scene.prompt = targetVer.prompt;
        activeImageUrl = targetVer.image_url;
      }
      scenes[idx] = scene;
      await db.updateEpisode(episode.id, { scenes });
      try {
        await TimelineService.getOrBuildEpisodeTimeline(episode.id);
      } catch (tlErr: any) {
        Logger.warn(`[AssetService.selectAssetVersion] Timeline sync notice: ${tlErr.message}`);
      }
      try {
        const { PatchSyncService } = await import('@/realtime/PatchSyncService.js');
        const updatedEp = await db.getEpisodeById(episode.id);
        if (updatedEp) {
          PatchSyncService.broadcast(params.series_id, 'episode:updated', updatedEp);
        }
      } catch (wsErr: any) {
        Logger.warn(`[AssetService.selectAssetVersion] WebSocket broadcast notice: ${wsErr.message}`);
      }
      updatedAsset = scene;
    } else if (params.asset_type === 'episode_bgm') {
      if (!episode) throw new Error(`Episode required for episode_bgm version selection`);
      const versions: AssetVersion[] = Array.isArray(episode.bgm_versions) ? [...episode.bgm_versions] : [];
      let targetVer = versions.find((v: AssetVersion) => v.id === params.version_id);
      if (!targetVer && (params.version_id.startsWith('v1_') || params.version_id.startsWith('ver_init_'))) {
        targetVer = versions[0];
      }
      if (!targetVer) throw new Error(`Version ${params.version_id} not found`);

      episode.bgm_versions = versions.map((v: AssetVersion) => ({ ...v, is_selected: v.id === targetVer!.id }));
      episode.bgm_url = targetVer.bgm_url || targetVer.audio_url || targetVer.image_url || targetVer.url || '';
      await db.updateEpisode(episode.id, { bgm_url: episode.bgm_url, bgm_versions: episode.bgm_versions });
      try {
        await TimelineService.getOrBuildEpisodeTimeline(episode.id);
      } catch (tlErr: any) {
        Logger.warn(`[AssetService.selectAssetVersion] Timeline sync notice: ${tlErr.message}`);
      }
      try {
        const { PatchSyncService } = await import('@/realtime/PatchSyncService.js');
        const updatedEp = await db.getEpisodeById(episode.id);
        if (updatedEp) {
          PatchSyncService.broadcast(params.series_id || episode.series_id || 'all', 'episode:updated', updatedEp);
        }
      } catch (wsErr: any) {
        Logger.warn(`[AssetService.selectAssetVersion] WebSocket broadcast notice: ${wsErr.message}`);
      }
      activeImageUrl = episode.bgm_url;
      updatedAsset = episode;
    }

    if (!updatedAsset) {
      throw new Error(`Failed to select version for ${params.asset_type} [${params.asset_id}]`);
    }

    return { success: true, active_image_url: activeImageUrl, asset: updatedAsset };
  }
}
