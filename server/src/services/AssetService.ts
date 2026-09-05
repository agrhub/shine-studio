import { aiProviderRouter } from '@/integrations/ai/router/AIProviderRouter.js';
import { StorageFactory } from '@/services/storage/StorageFactory.js';
import { PromptLoader } from '@/utils/PromptLoader.js';
import { getVisualStylePrompt } from '../constants/VisualStyles.js';
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

export const STRICT_NO_TEXT_DIRECTIVE = 'Clean visual photography, completely free of text, typography, letters, titles, subtitles, words, watermarks, UI elements, overlays, labels, badges, or captions.';

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
  ): Promise<{ imageUrl: string; prompt: string; version: AssetVersion }> {
    const stylePrompt = getVisualStylePrompt(visualStyle);
    const ageTag = age ? `${age}-year-old ` : '';
    const genderTag = gender && gender !== 'neutral' ? `${gender} ` : '';
    const traits = physicalCharacteristics || 'Cinematic character portrait';
    const clothing = clothingAndAccessories ? `, wearing ${clothingAndAccessories}` : '';

    const prompt = `${stylePrompt}, centered vertical single person portrait of ${ageTag}${genderTag}${characterName}, ${traits}${clothing}, cinematic lighting, 9:16 vertical framing, age-accurate facial features, character continuity reference, clear head and shoulders framed properly within bounds. ${STRICT_NO_TEXT_DIRECTIVE}`;

    Logger.info(`[AssetService.generateCharacterPortrait] Prompt for ${characterName}: ${prompt}`);

    const result = await aiProviderRouter.generateImage(prompt, {
      aspectRatio,
    });

    if (!result?.url) {
      throw new Error(`Failed to generate character portrait for ${characterName}`);
    }

    const s3 = await StorageFactory.uploadMedia(result.url, 'images', 'png', result.mimeType || 'image/png');
    const imageUrl = `/api/assets/file/${s3.key}`;
    const version: AssetVersion = {
      id: `v_${Date.now()}`,
      image_url: imageUrl,
      prompt,
      created_at: new Date().toISOString(),
      is_selected: true,
      aspect_ratio: aspectRatio,
    };
    return { imageUrl, prompt, version };
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
  ): Promise<{ imageUrl: string; prompt: string; version: AssetVersion }> {
    const stylePrompt = getVisualStylePrompt(visualStyle);
    const prompt = `${PromptLoader.render('assets/character_sheet', {
      characterName,
      physicalCharacteristics,
      clothingAndAccessories,
      visualStyle: stylePrompt,
      referenceImageUrl,
    })}. ${STRICT_NO_TEXT_DIRECTIVE}`;

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
    const imageUrl = `/api/assets/file/${s3.key}`;
    const version: AssetVersion = {
      id: `v_${Date.now()}`,
      image_url: imageUrl,
      prompt,
      created_at: new Date().toISOString(),
      is_selected: true,
      aspect_ratio: '16:9',
    };
    return { imageUrl, prompt, version };
  }

  /**
   * 3. Generate 4-in-1 Location Sheet
   */
  public static async generateLocationSheet(
    locationName: string,
    physicalCharacteristics: string,
    timeOfDay: string = 'Daytime',
    visualStyle?: string
  ): Promise<{ imageUrl: string; prompt: string; version: AssetVersion }> {
    const stylePrompt = getVisualStylePrompt(visualStyle);
    const prompt = `${PromptLoader.render('assets/location_sheet', {
      locationName,
      physicalCharacteristics,
      timeOfDay,
      visualStyle: stylePrompt,
    })}. ${STRICT_NO_TEXT_DIRECTIVE}`;

    Logger.info(`[AssetService.generateLocationSheet] Prompt for ${locationName}: ${prompt}`);

    const result = await aiProviderRouter.generateImage(prompt, {
      aspectRatio: '16:9',
    });

    if (!result?.url) {
      throw new Error(`Failed to generate location sheet for ${locationName}`);
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
    return { imageUrl, prompt, version };
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
  }): Promise<{ image_url: string; location: LocationAsset; prompt: string; version: AssetVersion }> {
    const db = await getDatabaseProvider();
    const series = await db.getSeriesById(params.series_id);
    let episode: EpisodeEntity | null = null;
    if (params.episode_id) {
      episode = await db.getEpisodeById(params.episode_id);
    }

    const locList: LocationAsset[] = episode?.locations || series?.locations || [];
    const dbLoc = locList.find((l: LocationAsset) => l.id === params.location_id || l.name === params.name);

    const locName = params.name || dbLoc?.name || '';
    const locTraits = params.physical_characteristics || dbLoc?.physical_characteristics || '';
    const timeOfDay = params.time_of_day || dbLoc?.time_of_day || '';
    const visualStyle = params.visual_style || series?.visual_style || '';

    if (params.user_id) {
      try {
        await CreditService.deductUserCredits(params.user_id, 'sceneImage', 'Location Asset Generation', `Generated concept art for location ${locName}`);
      } catch (cErr: any) {
        Logger.warn(`[AssetService] Credit deduction notice: ${cErr.message}`);
      }
    }

    const { imageUrl, prompt, version } = await this.generateLocationSheet(locName, locTraits, timeOfDay, visualStyle);
    const existingVersions: AssetVersion[] = Array.isArray(dbLoc?.versions) ? [...dbLoc.versions] : [];
    if (existingVersions.length === 0 && dbLoc?.image_url && dbLoc.image_url !== imageUrl) {
      existingVersions.push({
        id: `v1_loc_${params.location_id || dbLoc?.id || 'main'}`,
        image_url: dbLoc.image_url,
        url: dbLoc.image_url,
        prompt: dbLoc.prompt || '',
        created_at: new Date().toISOString(),
        is_selected: false,
      });
    }
    const newVersions: AssetVersion[] = [version, ...existingVersions.map((v: AssetVersion) => ({ ...v, is_selected: false }))];

    const normalizedLoc = EntityNormalizer.normalizeLocation({
      ...(dbLoc || {}),
      id: params.location_id || dbLoc?.id || `loc_${Date.now()}`,
      name: locName,
      time_of_day: timeOfDay,
      physical_characteristics: locTraits,
      image_url: imageUrl,
      prompt,
      versions: newVersions,
    });

    if (!normalizedLoc) {
      throw new Error(`Failed to normalize location ${locName}`);
    }

    // Update in Series
    if (series) {
      const existingLocs: LocationAsset[] = Array.isArray(series.locations) ? [...series.locations] : [];
      const mIdx = existingLocs.findIndex((l: LocationAsset) => l.id === normalizedLoc.id || l.name === normalizedLoc.name);
      if (mIdx >= 0) existingLocs[mIdx] = { ...existingLocs[mIdx], ...normalizedLoc };
      else existingLocs.push(normalizedLoc);
      await db.updateSeries(params.series_id, { locations: existingLocs });
    }

    return { image_url: imageUrl, location: normalizedLoc, prompt, version };
  }

  /**
   * 5. Generate Prop Product Shot (Isolated on white background)
   */
  public static async generatePropProductShot(
    propName: string,
    physicalCharacteristics: string,
    visualStyle?: string
  ): Promise<{ imageUrl: string; prompt: string }> {
    const stylePrompt = getVisualStylePrompt(visualStyle);
    const basePrompt = PromptLoader.render('assets/prop_product_shot', {
      propName,
      physicalCharacteristics,
      visualStyle: stylePrompt,
    });
    const prompt = `${basePrompt}\n${STRICT_NO_TEXT_DIRECTIVE}`;

    Logger.info(`[AssetService.generatePropProductShot] Prompt for ${propName}: ${prompt}`);

    const result = await aiProviderRouter.generateImage(prompt, {
      aspectRatio: '16:9',
    });

    if (!result?.url) {
      throw new Error(`Failed to generate prop product shot for ${propName}`);
    }

    const s3 = await StorageFactory.uploadMedia(result.url, 'images', 'png', result.mimeType || 'image/png');
    return { imageUrl: `/api/assets/file/${s3.key}`, prompt };
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
  }): Promise<{ image_url: string; prop: PropAsset; prompt: string; version: AssetVersion }> {
    const db = await getDatabaseProvider();
    const series = await db.getSeriesById(params.series_id);
    let episode: EpisodeEntity | null = null;
    if (params.episode_id) {
      episode = await db.getEpisodeById(params.episode_id);
    }

    const propList: PropAsset[] = episode?.props || series?.props || [];
    const dbProp = propList.find((p: PropAsset) => p.id === params.prop_id || p.name === params.name);

    const propName = params.name || dbProp?.name || 'Key Prop';
    const propTraits = params.physical_characteristics || dbProp?.physical_characteristics || 'Detailed narrative key prop';
    const visualStyle = params.visual_style || series?.visual_style || 'realistic';

    if (params.user_id) {
      try {
        await CreditService.deductUserCredits(params.user_id, 'sceneImage', 'Prop Asset Generation', `Generated concept asset for prop ${propName}`);
      } catch (cErr: any) {
        Logger.warn(`[AssetService] Credit deduction notice: ${cErr.message}`);
      }
    }

    const { imageUrl, prompt } = await this.generatePropProductShot(propName, propTraits, visualStyle);

    const version: AssetVersion = {
      id: `ver_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      image_url: imageUrl,
      url: imageUrl,
      prompt,
      created_at: new Date().toISOString(),
      is_selected: true,
      aspect_ratio: '16:9',
    };

    const existingVersions: AssetVersion[] = Array.isArray(dbProp?.versions) ? [...dbProp.versions] : [];
    if (existingVersions.length === 0 && dbProp?.image_url && dbProp.image_url !== imageUrl) {
      existingVersions.push({
        id: `v1_prop_${params.prop_id || dbProp?.id || 'main'}`,
        image_url: dbProp.image_url,
        url: dbProp.image_url,
        prompt: dbProp.prompt || '',
        created_at: new Date().toISOString(),
        is_selected: false,
      });
    }
    const newVersions: AssetVersion[] = [
      version,
      ...existingVersions.map((v: AssetVersion) => ({ ...v, is_selected: false })),
    ];

    const normalizedProp = EntityNormalizer.normalizeProp({
      ...(dbProp || {}),
      id: params.prop_id || dbProp?.id || `prop_${Date.now()}`,
      name: propName,
      owner: params.owner || dbProp?.owner || '',
      physical_characteristics: propTraits,
      image_url: imageUrl,
      prompt,
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
    }

    return { image_url: imageUrl, prop: normalizedProp, prompt, version };
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
  }): Promise<{ image_url: string; end_frame_url?: string; scene: SceneEntity; prompt?: string; version?: AssetVersion }> {
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
    const allChars: CharacterSeriesEntity[] = Array.isArray(series.characters) ? series.characters : [];
    const allLocs: LocationAsset[] = Array.isArray(series.locations) ? series.locations : [];
    const allProps: PropAsset[] = Array.isArray(series.props) ? series.props : [];

    const referenceImages: string[] = [];
    const characterContextList: string[] = [];
    let locationContext = '';
    const propContextList: string[] = [];

    // 2. Resolve Characters in this scene
    const sceneCharNames: string[] = Array.isArray(scene.reference_assets?.characters) && scene.reference_assets.characters.length > 0
      ? scene.reference_assets.characters
      : (Array.isArray(scene.character_costumes) ? scene.character_costumes.map((cc: CharacterSceneCostumes) => cc.character) : []);

    for (const cName of sceneCharNames) {
      if (!cName) continue;
      const cNameOrIdLower = String(cName).toLowerCase().trim();
      const matchedChar = allChars.find((c: CharacterSeriesEntity) => (c.name || '').toLowerCase().trim() === cNameOrIdLower || c.id === cNameOrIdLower);
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
    const fullPrompt = `${stylePrompt}, ${prompt}\n${STRICT_NO_TEXT_DIRECTIVE}, aspect ratio ${targetAspect}.`;

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

    const version: AssetVersion = {
      id: `ver_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      image_url: imageUrl,
      prompt: fullPrompt,
      created_at: new Date().toISOString(),
      is_selected: true,
      aspect_ratio: targetAspect,
    };

    const existingVersions: AssetVersion[] = Array.isArray(scene.versions) ? [...scene.versions] : [];
    scene.versions = [
      ...existingVersions.map((v) => ({ ...v, is_selected: false })),
      version,
    ];
    scene.prompt = fullPrompt;
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

        const fullEndPrompt = `${stylePrompt}, ${endPrompt}\n${STRICT_NO_TEXT_DIRECTIVE}, aspect ratio ${targetAspect}.`;
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
    try {
      await TimelineService.getOrBuildEpisodeTimeline(params.episode_id);
    } catch (tlErr: any) {
      Logger.warn(`[AssetService.generateStoryboardShot] Timeline sync notice: ${tlErr.message}`);
    }

    return { image_url: imageUrl, end_frame_url: endFrameUrl, scene: scenesList[sceneIdx], prompt: fullPrompt, version };
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

    if (params.user_id) {
      try {
        await CreditService.deductUserCredits(params.user_id, 'sceneImage', 'Asset Customization', `Customized ${params.asset_type} with custom prompt`);
      } catch (cErr: any) {
        Logger.warn(`[AssetService.customizeAsset] Credit deduction notice: ${cErr.message}`);
      }
    }

    const targetAspect: '9:16' | '16:9' | '1:1' = (params.aspect_ratio as '9:16' | '16:9' | '1:1') || (params.asset_type === 'scene_frame' ? ((series.ratio as '9:16' | '16:9' | '1:1') || '9:16') : (params.asset_type === 'character' || params.asset_type === 'wardrobe' ? '9:16' : '16:9'));
    const fullPrompt = `${params.custom_prompt.trim()}\n${STRICT_NO_TEXT_DIRECTIVE}`;

    const referenceImages: string[] = [];
    if (params.use_reference_image !== false && params.reference_image_url) {
      referenceImages.push(params.reference_image_url);
    }

    Logger.info(`[AssetService.customizeAsset] Customizing ${params.asset_type} [${params.asset_id}] with prompt: ${fullPrompt} and ${referenceImages.length} references`);

    const result = await aiProviderRouter.generateImage(fullPrompt, {
      aspectRatio: targetAspect,
      characterReferences: referenceImages,
      imageInputs: referenceImages,
    });

    if (!result?.url) {
      throw new Error(`Failed to customize ${params.asset_type} asset`);
    }

    const s3 = await StorageFactory.uploadMedia(result.url, 'images', 'png', result.mimeType || 'image/png');
    const imageUrl = `/api/assets/file/${s3.key}`;

    const newVersion: AssetVersion = {
      id: `ver_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      image_url: imageUrl,
      url: imageUrl,
      prompt: fullPrompt,
      created_at: new Date().toISOString(),
      is_selected: true,
      aspect_ratio: targetAspect,
    };

    let updatedAsset: CustomizableAsset | null = null;

    if (params.asset_type === 'character') {
      const chars: CharacterSeriesEntity[] = Array.isArray(series.characters) ? [...series.characters] : [];
      const idx = chars.findIndex((c: CharacterSeriesEntity) => c.id === params.asset_id || c.name === params.asset_id);
      if (idx === -1) throw new Error(`Character ${params.asset_id} not found`);

      const char: CharacterSeriesEntity = { ...chars[idx] };
      const curVersions: AssetVersion[] = Array.isArray(char.versions) ? [...char.versions] : [];
      const charImg = char.avatar || '';
      if (curVersions.length === 0 && charImg) {
        curVersions.push({
          id: `v1_char_${char.id || params.asset_id}`,
          image_url: charImg,
          url: charImg,
          prompt: char.prompt || '',
          created_at: char.created_at || new Date().toISOString(),
          is_selected: false,
        });
      }
      char.versions = [newVersion, ...curVersions.map((v: AssetVersion) => ({ ...v, is_selected: false }))];
      char.avatar = imageUrl;
      char.prompt = fullPrompt;
      chars[idx] = char;
      await db.updateSeries(params.series_id, { characters: chars });
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
      const curVersions: AssetVersion[] = Array.isArray(variant.versions) ? [...variant.versions] : [];
      if (curVersions.length === 0 && variant.image_url) {
        curVersions.push({
          id: `v1_wardrobe_${variant.variant_id || params.variant_id}`,
          image_url: variant.image_url,
          url: variant.image_url,
          prompt: variant.prompt || '',
          created_at: new Date().toISOString(),
          is_selected: false,
        });
      }
      variant.versions = [newVersion, ...curVersions.map((v: AssetVersion) => ({ ...v, is_selected: false }))];
      variant.image_url = imageUrl;
      variant.prompt = fullPrompt;
      variants[vIdx] = variant;
      char.wardrobe_variants = variants;
      chars[idx] = char;
      await db.updateSeries(params.series_id, { characters: chars });
      updatedAsset = variant;
    } else if (params.asset_type === 'location') {
      const locs: LocationAsset[] = Array.isArray(series.locations) ? [...series.locations] : [];
      const idx = locs.findIndex((l: LocationAsset) => l.id === params.asset_id || l.name === params.asset_id);
      if (idx === -1) throw new Error(`Location ${params.asset_id} not found`);

      const loc: LocationAsset = { ...locs[idx] };
      const curVersions: AssetVersion[] = Array.isArray(loc.versions) ? [...loc.versions] : [];
      if (curVersions.length === 0 && loc.image_url) {
        curVersions.push({
          id: `v1_loc_${loc.id || params.asset_id}`,
          image_url: loc.image_url,
          url: loc.image_url,
          prompt: loc.prompt || '',
          created_at: new Date().toISOString(),
          is_selected: false,
        });
      }
      loc.versions = [newVersion, ...curVersions.map((v: AssetVersion) => ({ ...v, is_selected: false }))];
      loc.image_url = imageUrl;
      loc.prompt = fullPrompt;
      locs[idx] = loc;
      await db.updateSeries(params.series_id, { locations: locs });
      updatedAsset = loc;
    } else if (params.asset_type === 'prop') {
      const props: PropAsset[] = Array.isArray(series.props) ? [...series.props] : [];
      const idx = props.findIndex((p: PropAsset) => p.id === params.asset_id || p.name === params.asset_id);
      if (idx === -1) throw new Error(`Prop ${params.asset_id} not found`);

      const prop: PropAsset = { ...props[idx] };
      const curVersions: AssetVersion[] = Array.isArray(prop.versions) ? [...prop.versions] : [];
      if (curVersions.length === 0 && prop.image_url) {
        curVersions.push({
          id: `v1_prop_${prop.id || params.asset_id}`,
          image_url: prop.image_url,
          url: prop.image_url,
          prompt: prop.prompt || '',
          created_at: new Date().toISOString(),
          is_selected: false,
        });
      }
      prop.versions = [newVersion, ...curVersions.map((v: AssetVersion) => ({ ...v, is_selected: false }))];
      prop.image_url = imageUrl;
      prop.prompt = fullPrompt;
      props[idx] = prop;
      await db.updateSeries(params.series_id, { props });
      updatedAsset = prop;
    } else if (params.asset_type === 'scene_frame') {
      if (!episode) throw new Error(`Episode required for scene_frame customization`);
      const scenes: SceneEntity[] = Array.isArray(episode.scenes) ? [...episode.scenes] : [];
      const idx = scenes.findIndex((s: SceneEntity) => s.id === params.asset_id || String(s.index || s.scene_number) === String(params.asset_id));
      if (idx === -1) throw new Error(`Scene frame ${params.asset_id} not found`);

      const scene: SceneEntity = { ...scenes[idx] };
      const isEndFrame = params.variant_id === 'end_frame' || params.variant_id === 'scene_end_frame';

      if (isEndFrame) {
        const curVersions: AssetVersion[] = Array.isArray(scene.end_frame_versions) ? [...scene.end_frame_versions] : [];
        if (curVersions.length === 0 && scene.storyboard_end_frame_url) {
          curVersions.push({
            id: `v1_end_${params.asset_id}`,
            image_url: scene.storyboard_end_frame_url,
            url: scene.storyboard_end_frame_url,
            prompt: scene.end_frame_prompt || scene.prompt || '',
            created_at: scene.created_at || new Date().toISOString(),
            is_selected: false,
          });
        }
        scene.end_frame_versions = [newVersion, ...curVersions.map((v: AssetVersion) => ({ ...v, is_selected: false }))];
        scene.storyboard_end_frame_url = imageUrl;
        scene.end_frame_prompt = fullPrompt;
      } else {
        const curVersions: AssetVersion[] = Array.isArray(scene.versions) ? [...scene.versions] : [];
        const startImg = scene.storyboard_frame_url || scene.image_url;
        if (curVersions.length === 0 && startImg) {
          curVersions.push({
            id: `v1_start_${params.asset_id}`,
            image_url: startImg,
            url: startImg,
            prompt: scene.prompt || '',
            created_at: scene.created_at || new Date().toISOString(),
            is_selected: false,
          });
        }
        scene.versions = [newVersion, ...curVersions.map((v: AssetVersion) => ({ ...v, is_selected: false }))];
        scene.image_url = imageUrl;
        scene.storyboard_frame_url = imageUrl;
        scene.prompt = fullPrompt;
        scene.status = 'image_ready';
      }
      scenes[idx] = scene;
      await db.updateEpisode(episode.id, { scenes });
      try {
        await TimelineService.getOrBuildEpisodeTimeline(episode.id);
      } catch (tlErr: any) {
        Logger.warn(`[AssetService.customizeAsset] Timeline sync notice: ${tlErr.message}`);
      }
      updatedAsset = scene;
    }

    if (!updatedAsset) {
      throw new Error(`Failed to update asset ${params.asset_type} [${params.asset_id}]`);
    }

    return { image_url: imageUrl, prompt: fullPrompt, version: newVersion, asset: updatedAsset };
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
      if (targetVer.prompt) char.prompt = targetVer.prompt;
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
      if (targetVer.prompt) variant.prompt = targetVer.prompt;
      variants[vIdx] = variant;
      char.wardrobe_variants = variants;
      chars[idx] = char;
      await db.updateSeries(params.series_id, { characters: chars });
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
      if (targetVer.prompt) loc.prompt = targetVer.prompt;
      locs[idx] = loc;
      await db.updateSeries(params.series_id, { locations: locs });
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
      if (targetVer.prompt) prop.prompt = targetVer.prompt;
      props[idx] = prop;
      await db.updateSeries(params.series_id, { props });
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
        if (targetVer.prompt) scene.end_frame_prompt = targetVer.prompt;
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
        if (targetVer.prompt) scene.prompt = targetVer.prompt;
        activeImageUrl = targetVer.image_url;
      }
      scenes[idx] = scene;
      await db.updateEpisode(episode.id, { scenes });
      try {
        await TimelineService.getOrBuildEpisodeTimeline(episode.id);
      } catch (tlErr: any) {
        Logger.warn(`[AssetService.selectAssetVersion] Timeline sync notice: ${tlErr.message}`);
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
      activeImageUrl = episode.bgm_url;
      updatedAsset = episode;
    }

    if (!updatedAsset) {
      throw new Error(`Failed to select version for ${params.asset_type} [${params.asset_id}]`);
    }

    return { success: true, active_image_url: activeImageUrl, asset: updatedAsset };
  }
}
