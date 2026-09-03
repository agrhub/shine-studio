import { aiProviderRouter } from '@/integrations/ai/router/AIProviderRouter.js';
import { StorageFactory } from '@/services/storage/StorageFactory.js';
import { PromptLoader } from '@/utils/PromptLoader.js';
import { getVisualStylePrompt } from '../constants/VisualStyles.js';
import { Logger } from '@/utils/logger.js';
import { getDatabaseProvider } from '@/database/index.js';
import { EntityNormalizer } from '@/utils/EntityNormalizer.js';
import { CreditService } from '@/services/CreditService.js';
import type { LocationAsset, PropAsset, ShotFrame, SceneEntity, ScreenplayAssetsResult, CharacterSeriesEntity, CharacterSceneCostumes, CharacterWardrobeVariant } from '@/types.js';

/**
 * AssetService: Responsible for Image Asset Generation (Character sheets, Location sheets, Prop shots, Storyboard shot images)
 */
export class AssetService {
  // ── Core Image Asset Generation ──────────────────────────────────────────

  /**
   * 1. Generate Single Character Portrait / Avatar
   */
  public static async generateCharacterPortrait(
    characterName: string,
    physicalCharacteristics: string,
    clothingAndAccessories?: string,
    visualStyle?: string,
    age?: number,
    gender?: string,
    aspectRatio: '9:16' | '16:9' | '4:3' | '1:1' = '9:16'
  ): Promise<{ imageUrl: string }> {
    const stylePrompt = getVisualStylePrompt(visualStyle);
    const ageTag = age ? `${age}-year-old ` : '';
    const genderTag = gender && gender !== 'neutral' ? `${gender} ` : '';
    const traits = physicalCharacteristics || 'Cinematic character portrait';
    const clothing = clothingAndAccessories ? `, wearing ${clothingAndAccessories}` : '';

    const prompt = `${stylePrompt}, centered vertical single person portrait of ${ageTag}${genderTag}${characterName}, ${traits}${clothing}, cinematic lighting, 9:16 vertical framing, age-accurate facial features, character continuity reference, clear head and shoulders framed properly within bounds.`;

    Logger.info(`[AssetService.generateCharacterPortrait] Prompt for ${characterName}: ${prompt}`);

    const result = await aiProviderRouter.generateImage(prompt, {
      aspectRatio,
    });

    if (!result?.url) {
      throw new Error(`Failed to generate character portrait for ${characterName}`);
    }

    const s3 = await StorageFactory.uploadMedia(result.url, 'images', 'png', result.mimeType || 'image/png');
    return { imageUrl: `/api/assets/file/${s3.key}` };
  }

  /**
   * 2. Generate 2-in-1 Character Sheet (Head & shoulders portrait left + Full body right on white background)
   */
  public static async generateCharacterSheet(
    characterName: string,
    physicalCharacteristics: string,
    clothingAndAccessories: string,
    visualStyle?: string,
    referenceImageUrl?: string
  ): Promise<{ imageUrl: string }> {
    const stylePrompt = getVisualStylePrompt(visualStyle);
    const prompt = PromptLoader.render('assets/character_sheet', {
      characterName,
      physicalCharacteristics,
      clothingAndAccessories,
      visualStyle: stylePrompt,
      referenceImageUrl,
    });

    Logger.info(`[AssetService.generateCharacterSheet] Prompt for ${characterName}: ${prompt} (Ref: ${referenceImageUrl || 'none'})`);

    const referencePool = referenceImageUrl ? [referenceImageUrl] : [];

    const result = await aiProviderRouter.generateImage(prompt, {
      aspectRatio: '16:9',
      characterReferences: referencePool,
      imageInputs: referencePool,
    });

    if (!result?.url) {
      throw new Error(`Failed to generate character sheet for ${characterName}`);
    }

    const s3 = await StorageFactory.uploadMedia(result.url, 'images', 'png', result.mimeType || 'image/png');
    return { imageUrl: `/api/assets/file/${s3.key}` };
  }

  /**
   * 3. Generate 4-in-1 Location Sheet
   */
  public static async generateLocationSheet(
    locationName: string,
    physicalCharacteristics: string,
    timeOfDay: string = 'Daytime',
    visualStyle?: string
  ): Promise<{ imageUrl: string }> {
    const stylePrompt = getVisualStylePrompt(visualStyle);
    const prompt = PromptLoader.render('assets/location_sheet', {
      locationName,
      physicalCharacteristics,
      timeOfDay,
      visualStyle: stylePrompt,
    });

    Logger.info(`[AssetService.generateLocationSheet] Prompt for ${locationName}: ${prompt}`);

    const result = await aiProviderRouter.generateImage(prompt, {
      aspectRatio: '16:9',
    });

    if (!result?.url) {
      throw new Error(`Failed to generate location sheet for ${locationName}`);
    }

    const s3 = await StorageFactory.uploadMedia(result.url, 'images', 'png', result.mimeType || 'image/png');
    return { imageUrl: `/api/assets/file/${s3.key}` };
  }

  /**
   * 4. High-level Location Generation with Credit Deduction & Database persistence
   */
  public static async generateLocationAsset(params: {
    series_id: string;
    episode_id?: string;
    location_id?: string;
    name?: string;
    physical_characteristics?: string;
    time_of_day?: string;
    visual_style?: string;
    visual_style_prompt?: string;
    user_id?: string;
  }): Promise<{ image_url: string; location: LocationAsset }> {
    const db = await getDatabaseProvider();
    const series = await db.getSeriesById(params.series_id);
    let episode: any = null;
    if (params.episode_id) {
      episode = await db.getEpisodeById(params.episode_id);
    }

    const locList: any[] = episode?.locations || series?.locations || [];
    const dbLoc = locList.find((l: any) => l.id === params.location_id || l.name === params.name);

    const locName = params.name || dbLoc?.name || '';
    const locTraits = params.physical_characteristics || dbLoc?.physical_characteristics || dbLoc?.description || '';
    const timeOfDay = params.time_of_day || dbLoc?.time_of_day || '';
    const visualStyle = params.visual_style || series?.visual_style || '';

    if (params.user_id) {
      try {
        await CreditService.deductUserCredits(params.user_id, 'sceneImage', 'Location Asset Generation', `Generated concept art for location ${locName}`);
      } catch (cErr: any) {
        Logger.warn(`[AssetService] Credit deduction notice: ${cErr.message}`);
      }
    }

    const { imageUrl } = await this.generateLocationSheet(locName, locTraits, timeOfDay, visualStyle);

    const normalizedLoc = EntityNormalizer.normalizeLocation({
      ...(dbLoc || {}),
      id: params.location_id || dbLoc?.id || `loc_${Date.now()}`,
      name: locName,
      time_of_day: timeOfDay,
      physical_characteristics: locTraits,
      image_url: imageUrl,
    });

    if (!normalizedLoc) {
      throw new Error(`Failed to normalize location ${locName}`);
    }

    // Update in Series
    if (series) {
      const existingLocs = Array.isArray(series.locations) ? [...series.locations] : [];
      const mIdx = existingLocs.findIndex((l: any) => l.id === normalizedLoc.id || l.name === normalizedLoc.name);
      if (mIdx >= 0) existingLocs[mIdx] = { ...existingLocs[mIdx], ...normalizedLoc };
      else existingLocs.push(normalizedLoc);
      await db.updateSeries(params.series_id, { locations: existingLocs });
    }

    return { image_url: imageUrl, location: normalizedLoc };
  }

  /**
   * 5. Generate Prop Product Shot (Isolated on white background)
   */
  public static async generatePropProductShot(
    propName: string,
    physicalCharacteristics: string,
    visualStyle?: string
  ): Promise<{ imageUrl: string }> {
    const stylePrompt = getVisualStylePrompt(visualStyle);
    const prompt = PromptLoader.render('assets/prop_product_shot', {
      propName,
      physicalCharacteristics,
      visualStyle: stylePrompt,
    });

    Logger.info(`[AssetService.generatePropProductShot] Prompt for ${propName}: ${prompt}`);

    const result = await aiProviderRouter.generateImage(prompt, {
      aspectRatio: '16:9',
    });

    if (!result?.url) {
      throw new Error(`Failed to generate prop product shot for ${propName}`);
    }

    const s3 = await StorageFactory.uploadMedia(result.url, 'images', 'png', result.mimeType || 'image/png');
    return { imageUrl: `/api/assets/file/${s3.key}` };
  }

  public static async generateShotImage(
    shot: ShotFrame,
    assetsMap: Map<string, { name: string; type: string; imageUrl?: string; image_url?: string; physicalCharacteristics?: string; physical_characteristics?: string }>,
    visualStyle?: string,
    aspectRatio: string = '9:16'
  ): Promise<{ imageUrl: string }> {
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

    const prompt = PromptLoader.render('storyboard/shot_image', {
      frameVisual: shot.frame_visual,
      frameMotion: shot.frame_motion || 'Cinematic composition',
      contextDescriptions: contextDescriptions.join('\n'),
      visualStyle: stylePrompt,
    });

    Logger.info(`[AssetService.generateShotImage] Generating shot #${shot.index} with ${referenceImageUrls.length} references`);
    const result = await aiProviderRouter.generateImage(prompt, {
      aspectRatio: aspectRatio as any,
      characterReferences: referenceImageUrls,
      imageInputs: referenceImageUrls,
    });

    if (!result?.url) {
      throw new Error(`Failed to generate storyboard image for shot #${shot.index}`);
    }
    const s3 = await StorageFactory.uploadMedia(result.url, 'images', 'png', result.mimeType || 'image/png');
    return { imageUrl: `/api/assets/file/${s3.key}` };
  };

  /**
   * 6. High-level Prop Generation with Credit Deduction & Database persistence
   */
  public static async generatePropAsset(params: {
    series_id: string;
    episode_id?: string;
    prop_id?: string;
    name?: string;
    physical_characteristics?: string;
    owner?: string;
    visual_style?: string;
    visual_style_prompt?: string;
    user_id?: string;
  }): Promise<{ image_url: string; prop: PropAsset }> {
    const db = await getDatabaseProvider();
    const series = await db.getSeriesById(params.series_id);
    let episode: any = null;
    if (params.episode_id) {
      episode = await db.getEpisodeById(params.episode_id);
    }

    const propList: any[] = episode?.props || series?.props || [];
    const dbProp = propList.find((p: any) => p.id === params.prop_id || p.name === params.name);

    const propName = params.name || dbProp?.name || 'Key Prop';
    const propTraits = params.physical_characteristics || dbProp?.physical_characteristics || dbProp?.description || 'Detailed narrative key prop';
    const visualStyle = params.visual_style || series?.visual_style || 'realistic';

    if (params.user_id) {
      try {
        await CreditService.deductUserCredits(params.user_id, 'sceneImage', 'Prop Asset Generation', `Generated concept asset for prop ${propName}`);
      } catch (cErr: any) {
        Logger.warn(`[AssetService] Credit deduction notice: ${cErr.message}`);
      }
    }

    const { imageUrl } = await this.generatePropProductShot(propName, propTraits, visualStyle);

    const normalizedProp = EntityNormalizer.normalizeProp({
      ...(dbProp || {}),
      id: params.prop_id || dbProp?.id || `prop_${Date.now()}`,
      name: propName,
      owner: params.owner || dbProp?.owner || '',
      physical_characteristics: propTraits,
      image_url: imageUrl,
    });

    if (!normalizedProp) {
      throw new Error(`Failed to normalize prop ${propName}`);
    }

    if (series) {
      const existingProps = Array.isArray(series.props) ? [...series.props] : [];
      const mIdx = existingProps.findIndex((p: any) => p.id === normalizedProp.id || p.name === normalizedProp.name);
      if (mIdx >= 0) existingProps[mIdx] = { ...existingProps[mIdx], ...normalizedProp };
      else existingProps.push(normalizedProp);
      await db.updateSeries(params.series_id, { props: existingProps });
    }

    return { image_url: imageUrl, prop: normalizedProp };
  }

  /**
   * 7. Generate Storyboard Frame for a Scene (flat SceneEntity)
   */
  public static async generateStoryboardShot(params: {
    series_id: string;
    episode_id: string;
    scene_index: number;
    visual_prompt?: string;
    user_id: string;
    generate_start_end_frame?: boolean;
  }): Promise<{ image_url: string; end_frame_url?: string; scene: SceneEntity }> {
    const db = await getDatabaseProvider();
    const series = await db.getSeriesById(params.series_id);
    if (!series) throw new Error(`Series ${params.series_id} not found`);
    
    const episode = await db.getEpisodeById(params.episode_id);
    if (!episode) throw new Error(`Episode ${params.episode_id} not found`);

    const scenesList = (episode.scenes || []) as SceneEntity[];
    const sceneIdx = scenesList.findIndex((s: SceneEntity) => Number(s.index || s.scene_number) === Number(params.scene_index));
    if (sceneIdx === -1) throw new Error(`Scene #${params.scene_index} not found in episode`);

    const scene = scenesList[sceneIdx];
    const stylePrompt = getVisualStylePrompt(series.visual_style || 'realistic');

    // 1. Collect all series master assets
    const allChars: CharacterSeriesEntity[] = (Array.isArray(series.characters) ? series.characters : []).map((c: any) => ({ ...c, type: 'character' }));
    const allLocs: LocationAsset[] = (Array.isArray(series.locations) ? series.locations : []).map((l: any) => ({ ...l, type: 'location' }));
    const allProps: PropAsset[] = (Array.isArray(series.props) ? series.props : []).map((p: any) => ({ ...p, type: 'prop' }));

    const referenceImages: string[] = [];
    const characterContextList: string[] = [];
    let locationContext = '';
    const propContextList: string[] = [];

    // 2. Resolve Characters in this scene
    const sceneCharNames: string[] = Array.isArray(scene.reference_assets?.characters) && scene.reference_assets.characters.length > 0
      ? scene.reference_assets.characters
      : (Array.isArray(scene.character_costumes) ? scene.character_costumes.map((cc: any) => cc.character) : []);

    for (const cName of sceneCharNames) {
      if (!cName) continue;
      const cNameOrIdLower = String(cName).toLowerCase().trim();
      const matchedChar = allChars.find((c: any) => (c.name || '').toLowerCase().trim() === cNameOrIdLower || c.id === cNameOrIdLower);
      if (matchedChar) {
        // Find wardrobe variant
        const sceneCostume = Array.isArray(scene.character_costumes)
          ? scene.character_costumes.find((cc: CharacterSceneCostumes) => (cc.character || '').toLowerCase().trim() === cNameOrIdLower)
          : null;
        const variants = Array.isArray(matchedChar.wardrobe_variants) ? matchedChar.wardrobe_variants : [];
        let matchedVariant: CharacterWardrobeVariant | undefined = undefined;
        if (sceneCostume?.variant_id && variants.length > 0) {
          matchedVariant = variants.find((v: CharacterWardrobeVariant) => v.variant_id?.toLowerCase() === String(sceneCostume.variant_id).toLowerCase());
        }
        if (!matchedVariant && sceneCostume?.wardrobe && variants.length > 0) {
          const wLower = String(sceneCostume.wardrobe).toLowerCase();
          matchedVariant = variants.find((v: CharacterWardrobeVariant) => (v.name && wLower.includes(v.name.toLowerCase())) || (v.clothing_and_accessories && wLower.includes(v.clothing_and_accessories.toLowerCase())));
        }

        const charImg = matchedVariant?.image_url || matchedChar.avatar;
        if (charImg && !referenceImages.includes(charImg)) {
          referenceImages.push(charImg);
        }

        const traits = matchedChar.visual_traits || matchedChar.physical_characteristics || matchedChar.appearance || matchedChar.traits || '';
        const wardrobe = matchedVariant?.clothing_and_accessories || sceneCostume?.wardrobe || matchedChar.clothing_and_accessories || '';
        characterContextList.push(`[CHARACTER: ${matchedChar.name}] Physical appearance: ${traits}. Wearing: ${wardrobe}. Must maintain exact facial structure and costume consistency as reference image.`);
      }
    }

    // 3. Resolve Location
    const sceneLocNames: string[] = Array.isArray(scene.reference_assets?.locations) && scene.reference_assets.locations.length > 0
      ? scene.reference_assets.locations
      : (scene.location ? [scene.location] : (scene.heading ? [scene.heading] : []));

    for (const lName of sceneLocNames) {
      if (!lName) continue;
      const lNameLower = String(lName).toLowerCase().trim();
      const matchedLoc = allLocs.find((l: LocationAsset) => (l.name || '').toLowerCase().trim() === lNameLower || lNameLower.includes((l.name || '').toLowerCase().trim()) || (l.name || '').toLowerCase().includes(lNameLower));
      if (matchedLoc) {
        if (matchedLoc.image_url && !referenceImages.includes(matchedLoc.image_url)) {
          referenceImages.push(matchedLoc.image_url);
        }
        const locDesc = matchedLoc.physical_characteristics || '';
        locationContext = `[LOCATION: ${matchedLoc.name}] Environment: ${locDesc} (Time: ${matchedLoc.time_of_day || scene.time_of_day || 'Daytime'}).`;
        break;
      }
    }

    // 4. Resolve Props
    const scenePropNames: string[] = Array.isArray(scene.reference_assets?.props) ? scene.reference_assets.props : [];
    for (const pName of scenePropNames) {
      if (!pName) continue;
      const pNameLower = String(pName).toLowerCase().trim();
      const matchedProp = allProps.find((p: PropAsset) => (p.name || '').toLowerCase().trim() === pNameLower || p.id === pName);
      if (matchedProp) {
        if (matchedProp.image_url && !referenceImages.includes(matchedProp.image_url)) {
          referenceImages.push(matchedProp.image_url);
        }
        propContextList.push(`[PROP: ${matchedProp.name}] Details: ${matchedProp.physical_characteristics || ''}`);
      }
    }

    // 5. Build prompt for Start Frame
    const visualDesc = scene.visual_prompt || scene.frame_description || scene.description || scene.action || `Cinematic vertical shot for scene #${params.scene_index}`;
    const prompt = PromptLoader.render('scene/scene_image_final', {
      locationContext: locationContext || undefined,
      propContext: propContextList.length > 0 ? propContextList.join('; ') : (scene.prop_details || undefined),
      visualDescription: visualDesc,
      characterContext: characterContextList.length > 0 ? characterContextList.join('\n') : undefined,
      visualStyle: stylePrompt,
    });
    
    const targetAspect: '9:16' | '16:9' | '4:3' | '1:1' = (series.ratio === '1:1' || series.ratio === '16:9' || series.ratio === '4:3') ? series.ratio : '9:16';
    const fullPrompt = `${stylePrompt}, ${prompt}, aspect ratio ${targetAspect}.`;

    if (params.user_id) {
      try {
        await CreditService.deductUserCredits(params.user_id, 'sceneImage', 'Storyboard Frame Generation', `Generated storyboard keyframe for Scene #${params.scene_index}`);
      } catch (cErr: any) {
        Logger.warn(`[AssetService] Credit deduction notice: ${cErr.message}`);
      }
    }

    Logger.info(`[AssetService.generateStoryboardShot] Generating scene #${params.scene_index} start frame with ${referenceImages.length} reference image(s): ${referenceImages.join(', ')}`);

    const result = await aiProviderRouter.generateImage(fullPrompt, {
      aspectRatio: targetAspect,
      characterReferences: referenceImages,
      imageInputs: referenceImages,
    });

    if (!result?.url) throw new Error(`Failed to generate storyboard image for Scene #${params.scene_index}`);

    const s3 = await StorageFactory.uploadMedia(result.url, 'images', 'png', result.mimeType || 'image/png');
    const imageUrl = `/api/assets/file/${s3.key}`;

    scene.image_url = imageUrl;
    scene.storyboard_frame_url = imageUrl;
    scene.status = 'image_ready';

    // 6. Optional End Frame generation if GENERATE_START_END_FRAME is enabled (default is false)
    const shouldGenerateEndFrame = Boolean(
      params.generate_start_end_frame ??
      (process.env.GENERATE_START_END_FRAME === 'true')
    );

    let endFrameUrl: string | undefined;

    if (shouldGenerateEndFrame) {
      try {
        Logger.info(`[AssetService.generateStoryboardShot] GENERATE_START_END_FRAME=true: Generating end frame for Scene #${params.scene_index}`);
        const endVisualDesc = scene.end_frame_prompt || `${visualDesc}, concluding moment of the action`;
        const endPrompt = PromptLoader.render('scene/scene_image_final', {
          locationContext: locationContext || undefined,
          propContext: propContextList.length > 0 ? propContextList.join('; ') : (scene.prop_details || undefined),
          visualDescription: endVisualDesc,
          characterContext: characterContextList.length > 0 ? characterContextList.join('\n') : undefined,
          visualStyle: stylePrompt,
        });

        const fullEndPrompt = `${stylePrompt}, ${endPrompt}, aspect ratio ${targetAspect}.`;
        const endRefImages = [imageUrl, ...referenceImages.filter((r) => r !== imageUrl)];

        const endResult = await aiProviderRouter.generateImage(fullEndPrompt, {
          aspectRatio: targetAspect,
          characterReferences: endRefImages,
          imageInputs: endRefImages,
        });

        if (endResult?.url) {
          const endS3 = await StorageFactory.uploadMedia(endResult.url, 'images', 'png', endResult.mimeType || 'image/png');
          endFrameUrl = `/api/assets/file/${endS3.key}`;
          scene.storyboard_end_frame_url = endFrameUrl;
          Logger.info(`[AssetService.generateStoryboardShot] End frame generated for Scene #${params.scene_index}: ${endFrameUrl}`);
        }
      } catch (endErr: any) {
        Logger.warn(`[AssetService.generateStoryboardShot] End frame generation skipped for Scene #${params.scene_index}: ${endErr.message}`);
      }
    }

    scenesList[sceneIdx] = scene;
    await db.updateEpisode(params.episode_id, { scenes: scenesList });

    return { image_url: imageUrl, end_frame_url: endFrameUrl, scene: scenesList[sceneIdx] };
  }
}
