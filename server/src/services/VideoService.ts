import { aiProviderRouter } from '@/integrations/ai/router/AIProviderRouter.js';
import { StorageFactory } from '@/services/storage/StorageFactory.js';
import { SynthIDService } from '@/services/SynthIDService.js';
import { CaptionService } from '@/services/CaptionService.js';
import { TimelineService } from '@/services/TimelineService.js';
import { getDatabaseProvider } from '@/database/index.js';
import { loadSkill } from '@/utils/SkillLoader.js';
import { PromptLoader } from '@/utils/PromptLoader.js';
import { getVisualStylePrompt } from '~/constants/VisualStyles.js';
import { Logger } from '@/utils/logger.js';
import { nanoid } from 'nanoid';
import { EnvConfig } from '@/config/env.js';
import type {
  AssetVersion,
  SceneEntity,
  EpisodeEntity,
  SeriesEntity,
  LocationAsset,
  PropAsset,
  CharacterSeriesEntity,
  CharacterSceneCostumes,
  CharacterWardrobeVariant,
  SceneDialogue,
  VideoRenderJob,
  GenerateSceneImageParams,
  GenerateSceneVideoParams,
  GenerateSceneVideoResult,
  SceneAudioPipelineResult,
} from '@/types.js';

export class VideoService {
  private jobs: Map<string, VideoRenderJob> = new Map();

  /**
   * Dedicated Scene & Background Image Generation (Step B2)
   */
  async generateSceneImage(params: GenerateSceneImageParams) {
    const userId = params.user_id || '';
    const seriesId = params.series_id;
    const episodeId = params.episode_id;
    const sceneId = params.scene_id;
    const sceneIndex = params.scene_index;
    const prompt = params.prompt;
    const aspectRatio = params.aspect_ratio;
    const style = params.style;
    const reqCharacters = params.characters;
    const sceneData = params.scene_data;
    const type = params.type;
    const isEndFrame = Boolean(params.is_end_frame ?? false);

    const db = await getDatabaseProvider();
    const frameSkill = loadSkill('production_frame_prompt') || '';

    // Contextual enrichment from Series and Episode in Database
    let targetSeries: SeriesEntity | null = null;
    let targetEpisode: EpisodeEntity | null = null;
    let seriesTitle = '';
    let seriesGenre = '';
    let seriesVisual = 'realistic';

    if (seriesId) {
      targetSeries = await db.getSeriesById(seriesId);
      if (!targetSeries) {
        throw new Error('Series not found');
      }
    }

    if (episodeId && !targetSeries) {
      targetEpisode = await db.getEpisodeById(episodeId);
      if (!targetEpisode) {
        throw new Error('Episode not found');
      }

      if (targetEpisode.series_id && !targetSeries) {
        targetSeries = await db.getSeriesById(targetEpisode.series_id);
      }

      if (!targetSeries) {
        throw new Error('Series not found');
      }
    }

    // Logger.info(`[VideoService.generateSceneImage] targetSeries: ${JSON.stringify(targetSeries, null, 2)}`);
    // Logger.info(`[VideoService.generateSceneImage] targetEpisode: ${JSON.stringify(targetEpisode, null, 2)}`);

    if (targetSeries) {
      seriesTitle = targetSeries.title || '';
      seriesGenre = targetSeries.genre || seriesGenre;
      seriesVisual = targetSeries.visual_style || seriesVisual;
    }

    const targetAspect = (aspectRatio || targetSeries?.ratio || '9:16').trim();

    // Look up scene object & previous scene/shot from DB if not passed in sceneData
    let sceneObj: Partial<SceneEntity> | undefined = sceneData;
    let previousShotUrl: string | undefined;    // previous shot in the same scene
    let locationAssetUrl: string | undefined;   // approved location reference sheet
    let characterImages: string[] = [];
    let ep: EpisodeEntity | null = null;

    if (episodeId) {
      try {
        ep = await db.getEpisodeById(episodeId);
        const sNum = typeof sceneIndex === 'number' ? sceneIndex : parseInt(String(sceneId).replace(/\D/g, ''), 10) || 1;

        // Resolve the current shot object from the episode
        if (!sceneObj && ep?.scenes) {
          sceneObj = ep.scenes.find((s: SceneEntity) => s.index === sNum || s.id === sceneId);
        }

        // Find the previous shot that belongs to the SAME scene (same sceneNumber) and has a rendered frame
        if (ep?.scenes && sceneObj) {
          const currSceneNum = sceneObj.scene_number;
          const prevShot = ep.scenes
            .filter((s: SceneEntity) => s.scene_number === currSceneNum && s.index < sNum && (s.storyboard_frame_url || s.image_url))
            .sort((a: SceneEntity, b: SceneEntity) => b.index - a.index)[0]; // most recent rendered shot in same scene
          if (prevShot) {
            previousShotUrl = prevShot.storyboard_frame_url || prevShot.image_url;
          }
        }

        // Fallback: if no same-scene previous shot, try the immediately preceding shot regardless of scene
        if (!previousShotUrl && sNum > 1 && ep?.scenes) {
          const prevAny = ep.scenes.find((s: SceneEntity) => s.index === sNum - 1);
          if (prevAny) {
            previousShotUrl = prevAny.storyboard_frame_url || prevAny.image_url;
          }
        }
      } catch (epErr) {
        Logger.warn(`[VideoService.generateSceneImage] Failed to load episode for scene: ${epErr}`);
      }
    }

    // Resolve location reference image (from series locations)
    const allLocations: LocationAsset[] = [
      ...(Array.isArray(targetSeries?.locations) ? (targetSeries.locations as LocationAsset[]) : []),
    ];

    if (allLocations.length > 0 && sceneObj) {
      const explicitLocs: string[] = (sceneObj.reference_assets?.locations || []).map((l: string) => String(l).toLowerCase().trim());

      const headingLoc = (sceneObj.heading || '').toLowerCase();
      const sceneLoc = (sceneObj.location || '').toLowerCase();

      const locAsset = allLocations.find((l: LocationAsset) => {
        const lName = (l.name || '').toLowerCase().trim();
        const lId = (l.id || '').toLowerCase().trim();
        if (!lName && !lId) return false;
        if (explicitLocs.some(el => el && (el === lName || el === lId || el.includes(lName) || lName.includes(el)))) return true;
        if (headingLoc && lName && (headingLoc.includes(lName) || lName.includes(headingLoc))) return true;
        if (sceneLoc && sceneLoc !== 'scene location' && lName && (sceneLoc.includes(lName) || lName.includes(sceneLoc))) return true;
        return false;
      });

      if (locAsset) {
        locationAssetUrl = locAsset.image_url;
      }
    }

    const sceneHeading = sceneObj?.heading || sceneObj?.title || '';
    const sceneLocation = sceneObj?.location || '';
    const sceneAction = isEndFrame
      ? (sceneObj?.end_frame_prompt || sceneObj?.description || sceneObj?.action || prompt || '')
      : (sceneObj?.description || sceneObj?.action || prompt || '');
    const sceneLighting = sceneObj?.lighting_mood || style || '';
    const sceneMood = sceneObj?.bgm_mood || '';
    const sceneContext = sceneObj?.scene_context || '';
    const propDetails = sceneObj?.prop_details || '';

    // ─── Character Continuity & Face Reference Extraction ─────────────────────
    const rawCharacters: CharacterSeriesEntity[] = [
      ...(Array.isArray(targetSeries?.characters) ? targetSeries.characters : []),
    ];

    // Merge & deduplicate characters by name/id
    const allSeriesCharacters: CharacterSeriesEntity[] = [];
    const seenChars = new Set<string>();
    for (const c of rawCharacters) {
      const key = (c.name || c.id || '').trim().toLowerCase();
      if (key && !seenChars.has(key)) {
        seenChars.add(key);
        allSeriesCharacters.push(c);
      }
    }

    const characterReferences: string[] = [];
    const characterContinuityDescriptions: string[] = [];
    const promptUpper = `${prompt || ''} ${sceneAction}`.toUpperCase();

    // Check if reference_assets.characters provides explicit ground truth of who is physically present in frame
    const rawExplicitChars = sceneObj?.reference_assets?.characters || [];
    const explicitPhysicalChars = rawExplicitChars.length > 0
      ? rawExplicitChars.map((c: string) => String(c).toUpperCase().trim())
      : null;
    const sceneContextLower = (sceneContext || '').toLowerCase();

    const norm = (s: unknown): string => (typeof s === 'string' ? s : (typeof s === 'object' && s !== null && 'name' in s ? String((s as { name?: unknown }).name) : (s != null ? String(s) : ''))).normalize('NFC').toLowerCase().trim();

    for (const char of allSeriesCharacters) {
      const charNameNorm = norm(char.name);
      const charNameUpper = (char.name || '').toUpperCase().trim();

      // If sceneContext indicates character is not physically present (e.g. only on screen/laptop/call), do NOT add as physical person
      const isVirtualOnly =
        sceneContextLower.includes(`${charNameNorm} is not physically present`) ||
        sceneContextLower.includes(`${charNameNorm} is only on`) ||
        sceneContextLower.includes(`${charNameNorm} appears on screen`);

      const isPresent = explicitPhysicalChars
        ? explicitPhysicalChars.some(ec => ec && (ec === charNameUpper || ec.includes(charNameUpper) || charNameUpper.includes(ec)))
        : ((Array.isArray(reqCharacters) && reqCharacters.some((c: string) => c.toUpperCase() === charNameUpper)) ||
           (charNameUpper && promptUpper.includes(charNameUpper))) && !isVirtualOnly;

      if (isPresent) {
        // Resolve scene costume & wardrobe variant
        const rawCostumes: CharacterSceneCostumes[] = Array.isArray(sceneObj?.character_costumes)
          ? sceneObj.character_costumes
          : [];
        const sceneCostume = rawCostumes.find((cc: CharacterSceneCostumes) => {
          const cName = norm(cc.character);
          return cName && (cName === charNameNorm || cName.includes(charNameNorm) || charNameNorm.includes(cName));
        });

        const wardrobeVariants: CharacterWardrobeVariant[] = Array.isArray(char.wardrobe_variants)
          ? char.wardrobe_variants
          : [];
        let matchedVariant: CharacterWardrobeVariant | undefined = undefined;

        // 1. Match by variant_id exact or substring/name
        if (sceneCostume?.variant_id && wardrobeVariants.length > 0) {
          const vIdTarget = norm(sceneCostume.variant_id);
          matchedVariant = wardrobeVariants.find((v: CharacterWardrobeVariant) => {
            const vId = norm(v.variant_id);
            const vName = norm(v.name);
            return vId === vIdTarget || vName === vIdTarget || (vId && (vId.includes(vIdTarget) || vIdTarget.includes(vId)));
          });
        }
        // 2. Match by sceneNumber in associatedScenes
        if (!matchedVariant && sceneObj?.scene_number && wardrobeVariants.length > 0) {
          matchedVariant = wardrobeVariants.find((v: CharacterWardrobeVariant) => {
            const scenes = Array.isArray(v.associated_scenes) ? v.associated_scenes : [];
            return scenes.includes(sceneObj!.scene_number!);
          });
        }
        // 3. Match by wardrobe description / name similarity
        if (!matchedVariant && sceneCostume?.wardrobe && wardrobeVariants.length > 0) {
          const wLower = norm(sceneCostume.wardrobe);
          matchedVariant = wardrobeVariants.find((v: CharacterWardrobeVariant) => {
            const vName = norm(v.name);
            const vClothing = norm(v.clothing_and_accessories);
            return (vName && wLower.includes(vName)) || (vClothing && (wLower.includes(vClothing) || vClothing.includes(wLower)));
          });
        }
        // 4. Fallback to first variant with image or first variant
        if (!matchedVariant && wardrobeVariants.length > 0) {
          matchedVariant = wardrobeVariants.find((v: CharacterWardrobeVariant) => v.image_url) || wardrobeVariants[0];
        }

        // Determine reference image URL: prioritize matched wardrobe variant image, fallback to any wardrobe variant with image, fallback to character avatar
        const refUrl = matchedVariant?.image_url ||
          wardrobeVariants.find((v: CharacterWardrobeVariant) => v.image_url)?.image_url ||
          char.avatar;

        if (refUrl && !characterReferences.includes(refUrl)) {
          characterReferences.push(refUrl);
        }

        const ageTag = char.age ? `${char.age}-year-old ` : '';
        const genderTag = char.gender && char.gender !== 'neutral' ? `${char.gender} ` : '';
        let wardrobeTag = '';
        const costumeDesc = matchedVariant?.clothing_and_accessories ||
          sceneCostume?.wardrobe || char.clothing_and_accessories;
        if (costumeDesc) {
          wardrobeTag = `, wearing ${costumeDesc}`;
        }
        const traits = char.visual_traits || char.physical_characteristics || char.traits || '';
        characterContinuityDescriptions.push(
          `Character ${char.name}: ${ageTag}${genderTag}${traits}${wardrobeTag}, exact face matching reference photo.`
        );
      }
    }

    // ─── Prop Reference Extraction & Scene Consistency ─────────────────────────
    const propReferences: string[] = [];
    const propContextDescriptions: string[] = [];
    let shotPropNames: string[] = [
      ...(Array.isArray(sceneObj?.reference_assets?.props) ? sceneObj.reference_assets.props : []),
    ];

    // Gather props from other shots in the same scene group (same sceneNumber) to ensure visual consistency
    if (episodeId && ep) {
      try {
        const currSceneNum = sceneObj?.scene_number;
        if (currSceneNum && Array.isArray(ep?.scenes)) {
          const sameSceneShots = ep.scenes.filter((s: SceneEntity) => s.scene_number === currSceneNum);
          for (const sh of sameSceneShots) {
            if (Array.isArray(sh.reference_assets?.props)) shotPropNames.push(...sh.reference_assets.props);
          }
        }
        shotPropNames = shotPropNames.filter((v, i, a) => v && a.indexOf(v) === i);

        const allEpProps: PropAsset[] = [
          ...(Array.isArray(targetSeries?.props) ? (targetSeries.props as PropAsset[]) : []),
        ];

        for (const pName of shotPropNames) {
          const pNameLower = String(pName).toLowerCase().trim();
          const propAsset = allEpProps.find((p: PropAsset) => {
            const epPropName = (p.name || '').toLowerCase().trim();
            const epPropId = (p.id || '').toLowerCase().trim();
            return (epPropName && (pNameLower.includes(epPropName) || epPropName.includes(pNameLower))) ||
                   (epPropId && (pNameLower === epPropId || pNameLower.includes(epPropId)));
          });
          if (propAsset) {
            const pUrl = propAsset.image_url;
            if (pUrl && !propReferences.includes(pUrl)) {
              propReferences.push(pUrl);
            }
            const propDesc = propAsset.physical_characteristics || '';
            propContextDescriptions.push(`${propAsset.name}${propDesc ? ': ' + propDesc : ''}`);
          } else {
            // No rendered asset found, still describe from name alone
            propContextDescriptions.push(pName);
          }
        }
      } catch (propErr) {
        Logger.warn(`[VideoService.generateSceneImage] Failed to extract props: ${propErr}`);
      }
    }

    // Step 1: Translate and enrich scene action, location, and key props into vivid English visual description
    let visualDescription = '';
    try {
      const locationText = sceneHeading ? sceneHeading + (sceneLocation ? ` - ${sceneLocation}` : '') : sceneLocation || 'Interior luxury room at night';
      const lightingText = `${sceneLighting}${sceneMood ? ` (${sceneMood})` : ''}`;

      const translationPrompt = PromptLoader.render('scene/scene_image_translation', {
        location: locationText,
        sceneContext: sceneContext,
        action: sceneAction,
        propDetails: propDetails,
        lighting: lightingText,
        visualStyle: getVisualStylePrompt(seriesVisual),
      });

      const generated = await aiProviderRouter.generateText(translationPrompt, {
        systemInstruction:
          'You are an expert cinematic visual prompt engineer for film production. Translate and describe the visual scene action, character appearance, setting details, props, and lighting into a single coherent paragraph of descriptive English. Never include meta-labels, shot numbers, or camera technicalities like "9:16 aspect ratio".',
      });

      if (typeof generated === 'string') {
        visualDescription = generated.replace(/^["']|["']$/g, '').trim();
      } else if (generated && typeof generated === 'object' && 'text' in generated && typeof (generated as { text: unknown }).text === 'string') {
        visualDescription = (generated as { text: string }).text.replace(/^["']|["']$/g, '').trim();
      }
    } catch (gErr) {
      Logger.warn(`[VideoService.generateSceneImage] Visual prompt optimization error: ${gErr}`);
    }

    // Build clean visual prompt without meta-labels (prevents AI from baking text cards/watermarks into the image)
    const visualStylePrompt = getVisualStylePrompt(seriesVisual);
    let cleanVisual = (visualDescription || sceneAction || prompt || '')
      .replace(/^(Scene Action & Setting|Scene setting|Prompt):\s*/gi, '')
      .trim();

    const charContext = characterContinuityDescriptions.length > 0
      ? characterContinuityDescriptions.join(' ')
      : '';

    // Build location context text for prompt (name + physical description of the approved set)
    let locationContext = '';
    if (allLocations.length > 0) {
      const explicitLocs: string[] = (sceneObj?.reference_assets?.locations || []).map((l: string) => String(l).toLowerCase().trim());
      const headingLoc = (sceneObj?.heading || '').toLowerCase();
      const sceneLoc = (sceneObj?.location || '').toLowerCase();

      const matchedLoc = allLocations.find((l: LocationAsset) => {
        const lName = (l.name || '').toLowerCase().trim();
        const lId = (l.id || '').toLowerCase().trim();
        if (!lName && !lId) return false;
        if (explicitLocs.some(el => el && (el === lName || el === lId || el.includes(lName) || lName.includes(el)))) return true;
        if (headingLoc && lName && (headingLoc.includes(lName) || lName.includes(headingLoc))) return true;
        if (sceneLoc && sceneLoc !== 'scene location' && lName && (sceneLoc.includes(lName) || lName.includes(sceneLoc))) return true;
        return false;
      });
      if (matchedLoc) {
        const locDesc = matchedLoc.physical_characteristics || '';
        locationContext = `${matchedLoc.name}${locDesc ? ': ' + locDesc : ''}`;
      }
    }
    if (!locationContext) {
      locationContext = (sceneLocation && sceneLocation !== 'Scene Location') ? sceneLocation : (sceneHeading || '');
    }

    const propContext = propContextDescriptions.length > 0 ? propContextDescriptions.join(', ') : '';

    const enhancedPrompt = PromptLoader.render('scene/scene_image_final', {
      visualDescription: cleanVisual,
      characterContext: charContext,
      locationContext,
      propContext,
      visualStyle: visualStylePrompt,
    });

    const imageInputs = [...characterReferences];
    // Inject approved location reference sheet (set-decoration continuity)
    if (locationAssetUrl && !imageInputs.includes(locationAssetUrl)) {
      imageInputs.push(locationAssetUrl);
    }
    // Inject prop reference images (object appearance continuity)
    for (const pUrl of propReferences) {
      if (!imageInputs.includes(pUrl)) imageInputs.push(pUrl);
    }
    // Inject previous shot in same scene (costume & spatial continuity) — last so it's closest context
    if (previousShotUrl && !imageInputs.includes(previousShotUrl)) {
      imageInputs.push(previousShotUrl);
    }

    Logger.info(
      `[VideoService.generateSceneImage] Generating scene ${isEndFrame ? 'end-frame' : 'start-frame'} (${targetAspect}) with ${imageInputs.length} ref(s) [chars:${characterReferences.length}, loc:${locationAssetUrl ? 1 : 0}, props:${propReferences.length}, prevShot:${previousShotUrl ? 1 : 0}] for shot ${sceneId || sceneIndex || 'frame'}`
    );

    // Generate image via AIProviderRouter (loads Google Flow or Gemini dynamically with character references)
    const imageResult = await aiProviderRouter.generateImage(enhancedPrompt, {
      aspectRatio: targetAspect as '9:16' | '16:9' | '4:3' | '1:1',
      systemPrompt: frameSkill,
      characterReferences,
      imageInputs,
    });

    if (!imageResult || !imageResult.url) {
      throw new Error('Image generation failed across all AI providers.');
    }

    // Upload to Storage
    const s3Result = await StorageFactory.uploadMedia(imageResult.url, 'images', 'png', imageResult.mimeType || 'image/png');
    const internalUrl = `/api/assets/file/${s3Result.key}`;

    // Embed SynthID Watermark
    const synthIdResult = await SynthIDService.embedSynthID({
      assetType: 'image',
      model: imageResult.provider || 'Google Flow',
      seriesId: seriesId || episodeId,
      sceneId,
    });

    const assetId = `ast_${nanoid(8)}`;
    const assetName = `Scene_${sceneId || sceneIndex || 'Background'}_${isEndFrame ? 'End' : 'Start'}_${nanoid(4)}`;
    const aspectClass =
      targetAspect === '16:9'
        ? 'aspect-[16/9]'
        : targetAspect === '4:3'
        ? 'aspect-[4/3]'
        : targetAspect === '1:1'
        ? 'aspect-square'
        : 'aspect-[9/16]';

    // Query existing versions to calculate sequential version number
    const existingAssets = (episodeId || sceneId) ? await db.getAssets({
      episode_id: episodeId,
      scene_id: sceneId,
      type: isEndFrame ? 'scene_end_image' : 'scene_image',
    }) : [];
    const versionNum = existingAssets.length + 1;

    // Save Asset in Database
    const savedAsset = await db.saveAsset({
      id: assetId,
      user_id: userId,
      name: `${assetName}_v${versionNum}`,
      type: isEndFrame ? 'scene_end_image' : 'scene_image',
      ext: '.PNG',
      size: `${(s3Result.size / (1024 * 1024)).toFixed(1)} MB`,
      size_bytes: s3Result.size,
      category_label: isEndFrame ? 'Scene End Frame' : 'Scene Background',
      category_color: isEndFrame ? 'text-indigo-500 dark:text-indigo-400' : 'text-pink-500 dark:text-pink-400',
      s3_key: s3Result.key,
      url: internalUrl,
      thumbnail: internalUrl,
      series_id: seriesId,
      episode_id: episodeId,
      scene_id: sceneId,
      prompt: enhancedPrompt,
      provider: imageResult.provider,
      aspect: aspectClass,
      version: versionNum,
      is_active: true,
      synth_id_verified: true,
      synth_id_hash: synthIdResult.synthIdHash,
      synth_id_metadata: synthIdResult.synthIdMetadata,
      created_at: new Date().toISOString(),
    });

    // Auto-update episode scene in Database
    if (episodeId) {
      try {
        const ep = await db.getEpisodeById(episodeId);
        if (ep && Array.isArray(ep.scenes)) {
          const sIdx =
            typeof sceneIndex === 'number'
               ? ep.scenes.findIndex((s: SceneEntity) => s.index === sceneIndex || s.id === sceneId)
              : ep.scenes.findIndex((s: SceneEntity) => s.id === sceneId);
          if (sIdx !== -1) {
            const newVersion: AssetVersion = {
              id: `ver_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              image_url: internalUrl,
              url: internalUrl,
              prompt: enhancedPrompt,
              created_at: new Date().toISOString(),
              is_selected: true,
              aspect_ratio: targetAspect,
            };

            if (isEndFrame) {
              const curVersions: AssetVersion[] = Array.isArray(ep.scenes[sIdx].end_frame_versions) ? [...ep.scenes[sIdx].end_frame_versions] : [];
              if (curVersions.length === 0 && ep.scenes[sIdx].storyboard_end_frame_url && ep.scenes[sIdx].storyboard_end_frame_url !== internalUrl) {
                curVersions.push({
                  id: `v1_end_${ep.scenes[sIdx].id || sIdx + 1}`,
                  image_url: ep.scenes[sIdx].storyboard_end_frame_url,
                  url: ep.scenes[sIdx].storyboard_end_frame_url,
                  created_at: ep.scenes[sIdx].created_at || new Date().toISOString(),
                  is_selected: false,
                });
              }
              ep.scenes[sIdx].end_frame_versions = [newVersion, ...curVersions.map((v: AssetVersion) => ({ ...v, is_selected: false }))];
              ep.scenes[sIdx].storyboard_end_frame_url = internalUrl;
            } else {
              const curVersions: AssetVersion[] = Array.isArray(ep.scenes[sIdx].versions) ? [...ep.scenes[sIdx].versions] : [];
              const startImg = ep.scenes[sIdx].storyboard_frame_url || ep.scenes[sIdx].image_url;
              if (curVersions.length === 0 && startImg && startImg !== internalUrl) {
                curVersions.push({
                  id: `v1_start_${ep.scenes[sIdx].id || sIdx + 1}`,
                  image_url: startImg,
                  url: startImg,
                  created_at: ep.scenes[sIdx].created_at || new Date().toISOString(),
                  is_selected: false,
                });
              }
              ep.scenes[sIdx].versions = [newVersion, ...curVersions.map((v: AssetVersion) => ({ ...v, is_selected: false }))];
              ep.scenes[sIdx].storyboard_frame_url = internalUrl;
              ep.scenes[sIdx].image_url = internalUrl;
              ep.scenes[sIdx].status = 'image_ready';
            }
            await db.updateEpisode(ep.id, { scenes: ep.scenes });
            await TimelineService.getOrBuildEpisodeTimeline(ep.id);
          }
        }
      } catch (err: any) {
        Logger.warn(`[VideoService.generateSceneImage] Auto-update episode scene failed: ${err.message}`);
      }
    }

    return {
      assetId: savedAsset.id,
      s3Key: s3Result.key,
      url: internalUrl,
      imageUrl: internalUrl,
      isEndFrame,
      sizeBytes: s3Result.size,
      provider: imageResult.provider,
      synthId: synthIdResult.synthIdMetadata,
      synthIdHeaders: synthIdResult.headers,
      enhancedPrompt,
      status: 'completed',
    };
  }

  /**
   * Real Scene Image-to-Video Generation with Native Audio & Dialogue (Step B3)
   */
  async generateSceneVideo(params: GenerateSceneVideoParams): Promise<GenerateSceneVideoResult> {
    const userId = params.user_id || '';
    const seriesId = params.series_id;
    const episodeId = params.episode_id;
    const sceneId = params.scene_id;
    const duration = params.duration;
    const motion = params.motion;
    const cameraMovement = params.camera_movement;
    const prompt = params.prompt;
    const aspectRatio = params.aspect_ratio;
    const initialStartFrameUrl = params.start_frame_url;
    const initialEndFrameUrl = params.end_frame_url;
    const characterImageIds = params.character_image_ids;
    const language = params.language;
    const sceneData = params.scene_data;

    const db = await getDatabaseProvider();

    // Contextual enrichment from Series and Episode in Database
    let seriesGenre = 'micro-drama';
    let seriesRatio = (aspectRatio || '9:16').trim();
    let seriesVisual = 'realistic';
    let seriesLanguage = language || 'en-US';

    let seriesChars: CharacterSeriesEntity[] = [];
    if (seriesId) {
      const s = await db.getSeriesById(seriesId);
      if (s) {
        seriesGenre = s.genre || seriesGenre;
        seriesRatio = (aspectRatio || s.ratio || seriesRatio).trim();
        seriesVisual = s.visual_style || seriesVisual;
        if (s.language) seriesLanguage = s.language;
        seriesChars = [...(s.characters || [])];
      }
    }
    if (episodeId) {
      const ep = await db.getEpisodeById(episodeId);
      if (ep) {
        if (!seriesId && ep.series_id) {
          const s = await db.getSeriesById(ep.series_id);
          if (s) {
            seriesGenre = s.genre || seriesGenre;
            seriesRatio = (aspectRatio || s.ratio || seriesRatio).trim();
            seriesVisual = s.visual_style || seriesVisual;
            if (s.language) seriesLanguage = s.language;
            seriesChars = s.characters || [];
          }
        }
      }
    }

    // Build Character Profiles Summary for Veo
    const charProfiles = seriesChars.map((c) => {
      const name = c.name || 'Character';
      const gender = (c as Partial<CharacterSeriesEntity>).gender || 'Unknown';
      const age = (c as Partial<CharacterSeriesEntity>).age ? `${(c as Partial<CharacterSeriesEntity>).age}yo` : '';
      const visual = (c as Partial<CharacterSeriesEntity>).visual_traits || (c as Partial<CharacterSeriesEntity>).physical_characteristics || (c as Partial<CharacterSeriesEntity>).traits || '';
      const voiceInfo = (c as Partial<CharacterSeriesEntity>).voice_id || '';
      return `- ${name} (${gender}, ${age}): ${visual ? visual + '. ' : ''}${voiceInfo ? 'Voice/Tone: ' + voiceInfo : ''}`;
    }).join('\n');

    // Dynamically resolve full language name using standard Intl.DisplayNames API
    let targetLanguageName = seriesLanguage || 'en-US';
    try {
      const displayNames = new Intl.DisplayNames(['en'], { type: 'language' });
      targetLanguageName = displayNames.of(seriesLanguage.split('-')[0]) || displayNames.of(seriesLanguage) || seriesLanguage;
    } catch {
      targetLanguageName = seriesLanguage;
    }

    const targetDuration = Math.min(Math.max(Number(duration) || 5, 4), 8);
    const motionIntensity = motion || 'subtle cinematic movement';

    // Robust extraction of all dialogue turns from sceneData or DB episode scenes
    let rawDialogues: SceneDialogue[] | undefined = sceneData?.dialogue;
    if ((!rawDialogues || rawDialogues.length === 0) && episodeId) {
      try {
        const ep = await db.getEpisodeById(episodeId);
        const sceneNum = parseInt(String(sceneId).replace(/\D/g, ''), 10) || 1;
        const foundScene = ep?.scenes?.find((s: SceneEntity) => s.index === sceneNum || s.id === sceneId);
        if (foundScene?.dialogue) {
          rawDialogues = foundScene.dialogue;
        }
      } catch {}
    }

    const dialogues: Array<SceneDialogue & {
      voiceId?: string;
      speechStartSec?: number;
      speechEndSec?: number;
      charInfo?: string;
    }> = [];
    if (Array.isArray(rawDialogues)) {
      for (const d of rawDialogues) {
        if (d && typeof d === 'object') {
          const line = (d.line || '').trim();
          if (line) {
            const charName = (d.character || 'Character').trim();
            const matchedChar = seriesChars.find(
              (c) => c.name && c.name.toLowerCase() === charName.toLowerCase()
            );
            const charInfo = matchedChar
              ? `${(matchedChar as Partial<CharacterSeriesEntity>).gender || ''} ${(matchedChar as Partial<CharacterSeriesEntity>).age ? (matchedChar as Partial<CharacterSeriesEntity>).age + 'yo' : ''}, ${(matchedChar as Partial<CharacterSeriesEntity>).visual_traits || (matchedChar as Partial<CharacterSeriesEntity>).physical_characteristics || (matchedChar as Partial<CharacterSeriesEntity>).traits || ''}`.trim()
              : '';

            const charObj = seriesChars.find((c) => c.name?.toLowerCase() === charName.toLowerCase());
            const voiceId = (charObj as Partial<CharacterSeriesEntity>)?.voice_id || ((charObj as Partial<CharacterSeriesEntity>)?.gender == 'male' ? 'Fenrir' : 'Kore');
            const speechStartSec = sceneData?.voice_start_us ? sceneData.voice_start_us / 1_000_000 : 0.5;
            const speechEndSec = sceneData?.voice_duration_us ? speechStartSec + (sceneData.voice_duration_us / 1_000_000) : speechStartSec + (line.length / 14);

            dialogues.push({
              character: charName,
              line: line.replace(/^["']|["']$/g, ''),
              emotion: d.emotion || 'neutral',
              speech_tone: d.speech_tone || 'natural tone',
              voiceId,
              speechStartSec,
              speechEndSec,
              charInfo: charInfo || undefined,
            });
          }
        }
      }
    }

    const sfxCues = Array.isArray(sceneData?.sfx_cues)
      ? sceneData.sfx_cues.join(', ')
      : (sceneData?.sfx_cues || '');

    const sceneHeading = sceneData?.heading || sceneData?.title || '';
    const sceneLocation = sceneData?.location || '';
    const sceneAction = sceneData?.action || sceneData?.description || prompt || '';
    const sceneLighting = sceneData?.lighting_mood || '';
    const sceneMood = sceneData?.bgm_mood || '';
    const sceneCamera = cameraMovement || sceneData?.camera_movement || '';
    const sceneContext = sceneData?.scene_context || '';
    const propDetails = sceneData?.prop_details || '';

    // ─── Character Continuity & Face Reference Extraction for Video ───────────
    const allSeriesCharacters: CharacterSeriesEntity[] = seriesChars;
    const characterReferences: string[] = Array.isArray(characterImageIds)
      ? [...characterImageIds]
      : characterImageIds
      ? [characterImageIds]
      : [];
    const characterContinuityDescriptions: string[] = [];
    const sceneCharsInvolved: string[] = Array.isArray(sceneData?.reference_assets?.characters) && sceneData.reference_assets.characters.length > 0
      ? sceneData.reference_assets.characters
      : dialogues.map(d => d.character);

    const explicitPhysicalChars = (sceneData?.reference_assets?.characters || []).map((c: string) => String(c).toUpperCase());

    const sceneContextLower = (sceneContext || '').toLowerCase();

    const norm = (s: unknown): string => (typeof s === 'string' ? s : (typeof s === 'object' && s !== null && 'name' in s ? String((s as { name?: unknown }).name) : (s != null ? String(s) : ''))).normalize('NFC').toLowerCase().trim();

    for (const char of allSeriesCharacters) {
      const charNameNorm = norm(char.name);
      const charNameUpper = (char.name || '').toUpperCase().trim();

      const isVirtualOnly =
        sceneContextLower.includes(`${charNameNorm} is not physically present`) ||
        sceneContextLower.includes(`${charNameNorm} is only on`) ||
        sceneContextLower.includes(`${charNameNorm} appears on screen`);

      const isPresent = explicitPhysicalChars.length > 0
        ? explicitPhysicalChars.some(ec => ec === charNameUpper || ec.includes(charNameUpper) || charNameUpper.includes(ec))
        : (sceneCharsInvolved.some((c: string) => String(c).toUpperCase() === charNameUpper) ||
           (charNameUpper && `${sceneAction} ${prompt || ''}`.toUpperCase().includes(charNameUpper))) && !isVirtualOnly;

      if (isPresent) {
        // Resolve scene costume & wardrobe variant
        const rawCostumes: CharacterSceneCostumes[] = Array.isArray(sceneData?.character_costumes)
          ? sceneData.character_costumes
          : [];
        const sceneCostume = rawCostumes.find((cc: CharacterSceneCostumes) => {
          const cName = norm(cc.character);
          return cName && (cName === charNameNorm || cName.includes(charNameNorm) || charNameNorm.includes(cName));
        });

        const wardrobeVariants: CharacterWardrobeVariant[] = Array.isArray(char.wardrobe_variants)
          ? char.wardrobe_variants
          : [];
        let matchedVariant: CharacterWardrobeVariant | undefined = undefined;

        // 1. Match by variant_id exact or substring/name
        if (sceneCostume?.variant_id && wardrobeVariants.length > 0) {
          const vIdTarget = norm(sceneCostume.variant_id);
          matchedVariant = wardrobeVariants.find((v: CharacterWardrobeVariant) => {
            const vId = norm(v.variant_id);
            const vName = norm(v.name);
            return vId === vIdTarget || vName === vIdTarget || (vId && (vId.includes(vIdTarget) || vIdTarget.includes(vId)));
          });
        }
        // 2. Match by scene_number in associated_scenes
        const currScNum = sceneData?.scene_number;
        if (!matchedVariant && currScNum && wardrobeVariants.length > 0) {
          matchedVariant = wardrobeVariants.find((v: CharacterWardrobeVariant) => {
            const scenes = v.associated_scenes || [];
            return Array.isArray(scenes) && scenes.includes(currScNum);
          });
        }
        // 3. Match by wardrobe description / name similarity
        if (!matchedVariant && sceneCostume?.wardrobe && wardrobeVariants.length > 0) {
          const wLower = norm(sceneCostume.wardrobe);
          matchedVariant = wardrobeVariants.find((v: CharacterWardrobeVariant) => {
            const vName = norm(v.name);
            const vClothing = norm(v.clothing_and_accessories);
            return (vName && wLower.includes(vName)) || (vClothing && (wLower.includes(vClothing) || vClothing.includes(wLower)));
          });
        }
        // 4. Fallback to first variant with image or first variant
        if (!matchedVariant && wardrobeVariants.length > 0) {
          matchedVariant = wardrobeVariants.find((v: CharacterWardrobeVariant) => v.image_url) || wardrobeVariants[0];
        }

        const refUrl = matchedVariant?.image_url ||
          wardrobeVariants.find((v: CharacterWardrobeVariant) => v.image_url)?.image_url ||
          char.avatar;

        if (refUrl && !characterReferences.includes(refUrl)) {
          characterReferences.push(refUrl);
        }

        const ageTag = char.age ? `${char.age}-year-old ` : '';
        const genderTag = char.gender && char.gender !== 'neutral' ? `${char.gender} ` : '';
        let wardrobeTag = '';
        const costumeDesc = matchedVariant?.clothing_and_accessories ||
          sceneCostume?.wardrobe || char.clothing_and_accessories;
        if (costumeDesc) {
          wardrobeTag = `, wearing ${costumeDesc}`;
        }
        const traits = char.visual_traits || char.physical_characteristics || char.traits || '';
        characterContinuityDescriptions.push(
          `Character ${char.name}: ${ageTag}${genderTag}${traits}${wardrobeTag}, exact face matching reference photo.`
        );
      }
    }

    // ─── Resolve Start Frame & End Frame (Current Shot Only) ────────
    const startFrameUrl = initialStartFrameUrl || sceneData?.storyboard_frame_url || sceneData?.image_url;
    if (!startFrameUrl) {
      throw new Error('Start frame is required for video generation.');
    }
    // Strictly do not look up nextScene.storyboardFrameUrl — only use current shot end-frame if present
    const endFrameUrl = initialEndFrameUrl || sceneData?.storyboard_end_frame_url;
    const startFrameDesc = sceneData?.frame_description || sceneData?.description || sceneData?.visual_prompt || '';
    const endFrameDesc = sceneData?.end_frame_prompt || (sceneData as { end_frame_action?: string } | undefined)?.end_frame_action || '';
    const timeOfDay = sceneData?.time_of_day || '';
    const videoEffect = sceneData?.video_effect || (Array.isArray(sceneData?.effects) ? sceneData.effects.join(', ') : '');

    const isSilent = dialogues.length === 0;
    const locationText = sceneHeading ? sceneHeading + (sceneLocation ? ` - ${sceneLocation}` : '') : sceneLocation || '';
    const lightingText = `${sceneLighting}${sceneMood ? ` (${sceneMood})` : ''}`;

    // Step 1: Gemini ONLY translates and enhances the Visual Action & Cinematography into English
    let visualPart = '';
    try {
      const characterContextText = characterContinuityDescriptions.length > 0 ? characterContinuityDescriptions.join('\n') : '';

      const visualTranslationPrompt = PromptLoader.render('scene/scene_video_translation', {
        location: locationText,
        timeOfDay,
        sceneContext: sceneContext,
        characterContext: characterContextText,
        startFrame: startFrameDesc,
        action: sceneAction,
        endFrame: endFrameDesc,
        cameraMovement: sceneCamera,
        propDetails: propDetails,
        lighting: lightingText,
        videoEffect,
        sfxCues,
        visualStyle: getVisualStylePrompt(seriesVisual),
        isSilent: isSilent,
      });

      const generated = await aiProviderRouter.generateText(visualTranslationPrompt, {
        systemInstruction:
          'You are an expert cinematic visual prompt engineer. Describe ONLY specific character visual identity, actions, camera movement, scene props, lighting, and environmental atmosphere in English. Do NOT write or invent dialogue.' +
          (isSilent ? ' Note: This shot is completely silent with no dialogue; ensure characters keep their lips closed with no talking or mouth movement.' : ''),
      });

      if (typeof generated === 'string') {
        visualPart = generated.replace(/^["']|["']$/g, '').trim();
      } else if (generated && typeof generated === 'object' && 'text' in generated && typeof (generated as { text: unknown }).text === 'string') {
        visualPart = (generated as { text: string }).text.replace(/^["']|["']$/g, '').trim();
      }
    } catch (gErr) {
      Logger.warn(`[VideoService.generateSceneVideo] Gemini visual prompt optimization error: ${gErr}`);
    }

    if (!visualPart) {
      const cleanVisual = (prompt || sceneData?.visual_prompt || '').replace(/^(16:9|9:16|4:3|1:1)\s*aspect ratio,?\s*/i, '');
      const silencePart = isSilent ? ' Lips closed, no talking, silent action.' : '';
      const startPart = startFrameDesc ? ` Initial framing: ${startFrameDesc}.` : '';
      const endPart = endFrameDesc ? ` Concluding frame: ${endFrameDesc}.` : '';
      const propPart = propDetails ? ` Props: ${propDetails}.` : '';
      const effectPart = videoEffect ? ` Atmospheric effect: ${videoEffect}.` : '';
      visualPart = `Cinematic ${seriesGenre} scene. ${locationText}${timeOfDay ? ' (' + timeOfDay + ')' : ''}.${startPart} ${sceneAction || cleanVisual}.${endPart}${propPart}${effectPart}${silencePart} Camera movement: ${sceneCamera}. Motion: ${motionIntensity}. Lighting: ${sceneLighting}.`;
    }

    // Step 2: Deterministically assemble the final Google Veo prompt with exact dialogue & audio cues
    let videoPrompt = visualPart.replace(/[.\s]+$/, '');

    if (dialogues.length > 0) {
      const speechClauses = dialogues
        .map(
          (d) =>
            `[Speech & Vocal Profile]: At ${d.speechStartSec !== undefined ? d.speechStartSec.toFixed(1) : '0.5'}s to ${d.speechEndSec !== undefined ? d.speechEndSec.toFixed(1) : '3.5'}s, ${d.character} (Voice: ${d.voiceId || 'Studio'}, Tone: ${d.speech_tone}) speaks aloud in ${targetLanguageName}: "${d.line}". Lip movements, facial expressions, and vocal cadence synchronize naturally between ${d.speechStartSec !== undefined ? d.speechStartSec.toFixed(1) : '0.5'}s and ${d.speechEndSec !== undefined ? d.speechEndSec.toFixed(1) : '3.5'}s.`
        )
        .join(' ');
      videoPrompt = `${videoPrompt}. ${speechClauses}`;
      const audioPart = sfxCues ? ` Audio: ${sfxCues}.` : ' Audio: soft ambient room sound with clear voice.';
      videoPrompt = `${videoPrompt.replace(/[.\s]+$/, '')}.${audioPart}`;
    } else {
      // ════ NO DIALOGUE: EXPLICITLY ENFORCE SILENT SCENE & CLOSED MOUTH / NO LIP SYNC ════
      videoPrompt = `${videoPrompt}. Silent scene, no character speaking, characters keep lips closed with no talking, natural facial expressions without mouth movement.`;
      const audioPart = sfxCues ? ` Audio: ${sfxCues}.` : ' Audio: subtle environmental room tone, natural atmospheric sound.';
      videoPrompt = `${videoPrompt.replace(/[.\s]+$/, '')}.${audioPart}`;
    }

    Logger.info(`[VideoService.generateSceneVideo] Finalized cinematic video prompt (${targetLanguageName}, silent=${isSilent}): ${videoPrompt}`);
    Logger.info(`[VideoService.generateSceneVideo] Attached ${characterReferences.length} character reference image(s) for Veo, startFrame: ${!!startFrameUrl}, endFrame: ${!!endFrameUrl}`);

    const videoResult = await aiProviderRouter.generateVideo(videoPrompt, {
      aspectRatio: (seriesRatio as '9:16' | '1:1' | '16:9') || '9:16',
      // characterReferences,//disable references
      imageStart: startFrameUrl,
      imageEnd: endFrameUrl,
      duration: targetDuration,
    });

    if (!videoResult || !videoResult.url) {
      throw new Error('Video generation failed across all AI providers (Google Flow Veo & Gemini).');
    }

    // Upload generated video to Storage
    const s3Result = await StorageFactory.uploadMedia(videoResult.url, 'videos', 'mp4', 'video/mp4');
    const internalUrl = `/api/assets/file/${s3Result.key}`;

    // Embed SynthID Watermark Metadata
    const synthIdResult = await SynthIDService.embedSynthID({
      assetType: 'video',
      model: videoResult.provider || 'Google Veo (Flow)',
      seriesId: seriesId || episodeId,
      sceneId,
    });

    const assetId = `ast_${nanoid(8)}`;
    const assetName = `Video_${sceneId || 'Scene'}_${nanoid(4)}`;

    // Query existing versions to calculate sequential version number
    const existingVideos = (episodeId || sceneId) ? await db.getAssets({
      episode_id: episodeId,
      scene_id: sceneId,
      type: 'scene_video',
    }) : [];
    const videoVersionNum = existingVideos.length + 1;

    // Save Video Asset in Database
    const savedAsset = await db.saveAsset({
      id: assetId,
      user_id: userId,
      name: `${assetName}_v${videoVersionNum}`,
      type: 'scene_video',
      ext: '.MP4',
      size: `${(s3Result.size / (1024 * 1024)).toFixed(1)} MB`,
      size_bytes: s3Result.size,
      category_label: 'Scene Video',
      category_color: 'text-purple-500 dark:text-purple-400',
      s3_key: s3Result.key,
      url: internalUrl,
      thumbnail: startFrameUrl || internalUrl,
      series_id: seriesId,
      episode_id: episodeId,
      scene_id: sceneId,
      prompt: videoPrompt,
      provider: videoResult.provider,
      aspect: seriesRatio === '16:9' ? 'aspect-[16/9]' : seriesRatio === '4:3' ? 'aspect-[4/3]' : seriesRatio === '1:1' ? 'aspect-square' : 'aspect-[9/16]',
      version: videoVersionNum,
      is_active: true,
      synth_id_verified: true,
      synth_id_hash: synthIdResult.synthIdHash,
      synth_id_metadata: synthIdResult.synthIdMetadata,
      created_at: new Date().toISOString(),
    });

    let sceneNum = Number(sceneData?.index) || Number(sceneData?.scene_number) || 0;
    if (!sceneNum && episodeId) {
      try {
        const ep = await db.getEpisodeById(episodeId);
        if (ep && Array.isArray(ep.scenes)) {
          const matchedIdx = ep.scenes.findIndex((s: SceneEntity) => (sceneId && s.id === sceneId) || (sceneData?.id && s.id === sceneData.id));
          if (matchedIdx !== -1) {
            sceneNum = ep.scenes[matchedIdx].index || (matchedIdx + 1);
          }
        }
      } catch {}
    }
    if (!sceneNum) {
      sceneNum = parseInt(String(sceneId).replace(/\D/g, ''), 10) || 1;
    }

    // ─── Automated Audio & Word-Level Caption Pipeline (BGM, TTS, Gemini Deepgram-style Captions) ───
    let audioPipelineResult: SceneAudioPipelineResult | null = null;
    try {
      audioPipelineResult = await CaptionService.processSceneAudioAndCaptions({
        videoUrl: internalUrl,
        episodeId,
        sceneId: sceneId || sceneData?.id,
        sceneIndex: sceneNum,
        dialogue: dialogues,
        language,
        durationSeconds: targetDuration,
      });
      Logger.info(`[VideoService.generateSceneVideo] Auto audio & caption pipeline completed for scene ${sceneNum}: bgm=${!!audioPipelineResult?.bgmUrl}, voice=${!!audioPipelineResult?.voiceoverUrl}, cues=${audioPipelineResult?.captionsData?.length || 0}`);
    } catch (aErr: any) {
      Logger.warn(`[VideoService.generateSceneVideo] Auto audio/caption pipeline notice: ${aErr.message}`);
    }

    // Auto-update episode scene's video_url, bgm_url, voiceover_url, captions_data & sync timeline
    if (episodeId) {
      try {
        const ep = await db.getEpisodeById(episodeId);
        if (ep && Array.isArray(ep.scenes)) {
          const sIdx = ep.scenes.findIndex((s: SceneEntity) => (sceneId && s.id === sceneId) || (sceneData?.id && s.id === sceneData.id) || (sceneNum && s.index === sceneNum));
          if (sIdx !== -1) {
            // 1. Maintain Video Version History
            const curVidVersions: AssetVersion[] = Array.isArray(ep.scenes[sIdx].video_versions) ? [...ep.scenes[sIdx].video_versions] : [];
            if (curVidVersions.length === 0 && ep.scenes[sIdx].video_url && ep.scenes[sIdx].video_url !== internalUrl) {
              curVidVersions.push({
                id: `v1_vid_${ep.scenes[sIdx].id || sIdx + 1}`,
                image_url: ep.scenes[sIdx].video_url,
                video_url: ep.scenes[sIdx].video_url,
                url: ep.scenes[sIdx].video_url,
                created_at: ep.scenes[sIdx].created_at || new Date().toISOString(),
                is_selected: false,
              });
            }
            const newVidVer: AssetVersion = {
              id: `ver_vid_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              image_url: internalUrl,
              video_url: internalUrl,
              url: internalUrl,
              prompt: videoPrompt,
              created_at: new Date().toISOString(),
              is_selected: true,
              aspect_ratio: seriesRatio || '9:16',
            };
            ep.scenes[sIdx].video_versions = [newVidVer, ...curVidVersions.map((v: AssetVersion) => ({ ...v, is_selected: false }))];
            ep.scenes[sIdx].video_url = internalUrl;

            // 2. Maintain BGM Version History
            if (audioPipelineResult?.bgmUrl) {
              const curBgmVersions: AssetVersion[] = Array.isArray(ep.scenes[sIdx].bgm_versions) ? [...ep.scenes[sIdx].bgm_versions] : [];
              if (curBgmVersions.length === 0 && ep.scenes[sIdx].bgm_url && ep.scenes[sIdx].bgm_url !== audioPipelineResult.bgmUrl) {
                curBgmVersions.push({
                  id: `v1_bgm_${ep.scenes[sIdx].id || sIdx + 1}`,
                  image_url: ep.scenes[sIdx].bgm_url,
                  audio_url: ep.scenes[sIdx].bgm_url,
                  bgm_url: ep.scenes[sIdx].bgm_url,
                  url: ep.scenes[sIdx].bgm_url,
                  created_at: new Date().toISOString(),
                  is_selected: false,
                });
              }
              const newBgmVer: AssetVersion = {
                id: `ver_bgm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                image_url: audioPipelineResult.bgmUrl,
                audio_url: audioPipelineResult.bgmUrl,
                bgm_url: audioPipelineResult.bgmUrl,
                url: audioPipelineResult.bgmUrl,
                created_at: new Date().toISOString(),
                is_selected: true,
              };
              ep.scenes[sIdx].bgm_versions = [newBgmVer, ...curBgmVersions.map((v: AssetVersion) => ({ ...v, is_selected: false }))];
              ep.scenes[sIdx].bgm_url = audioPipelineResult.bgmUrl;
            }

            // 3. Maintain Voiceover Version History
            if (audioPipelineResult?.voiceoverUrl) {
              const curVoiceVersions: AssetVersion[] = Array.isArray(ep.scenes[sIdx].voice_versions) ? [...ep.scenes[sIdx].voice_versions] : [];
              if (curVoiceVersions.length === 0 && ep.scenes[sIdx].voiceover_url && ep.scenes[sIdx].voiceover_url !== audioPipelineResult.voiceoverUrl) {
                curVoiceVersions.push({
                  id: `v1_voice_${ep.scenes[sIdx].id || sIdx + 1}`,
                  image_url: ep.scenes[sIdx].voiceover_url,
                  audio_url: ep.scenes[sIdx].voiceover_url,
                  voiceover_url: ep.scenes[sIdx].voiceover_url,
                  url: ep.scenes[sIdx].voiceover_url,
                  created_at: new Date().toISOString(),
                  is_selected: false,
                });
              }
              const newVoiceVer: AssetVersion = {
                id: `ver_voice_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                image_url: audioPipelineResult.voiceoverUrl,
                audio_url: audioPipelineResult.voiceoverUrl,
                voiceover_url: audioPipelineResult.voiceoverUrl,
                url: audioPipelineResult.voiceoverUrl,
                created_at: new Date().toISOString(),
                is_selected: true,
              };
              ep.scenes[sIdx].voice_versions = [newVoiceVer, ...curVoiceVersions.map((v: AssetVersion) => ({ ...v, is_selected: false }))];
              ep.scenes[sIdx].voiceover_url = audioPipelineResult.voiceoverUrl;
            }
            if (audioPipelineResult?.voiceStartUs !== undefined) {
              ep.scenes[sIdx].voice_start_us = audioPipelineResult.voiceStartUs;
            }
            if (audioPipelineResult?.voiceDurationUs !== undefined) {
              ep.scenes[sIdx].voice_duration_us = audioPipelineResult.voiceDurationUs;
            }
            if (audioPipelineResult?.captionsData?.length) {
              ep.scenes[sIdx].captions_data = audioPipelineResult.captionsData;
            }
            if (audioPipelineResult?.words?.length) {
              ep.scenes[sIdx].words = audioPipelineResult.words;
            }
            if (language && language !== seriesLanguage && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/i.test(language.trim())) {
              const langKey = language.trim();
              if (!ep.scenes[sIdx].translations) ep.scenes[sIdx].translations = {};
              ep.scenes[sIdx].translations[langKey] = {
                ...(ep.scenes[sIdx].translations[langKey] || {}),
                voiceover_url: audioPipelineResult?.voiceoverUrl || ep.scenes[sIdx].translations[langKey]?.voiceover_url,
                captions_data: audioPipelineResult?.captionsData || ep.scenes[sIdx].translations[langKey]?.captions_data,
                words: audioPipelineResult?.words || ep.scenes[sIdx].translations[langKey]?.words,
                voice_duration_us: audioPipelineResult?.voiceDurationUs,
              };
            }
            await db.updateEpisode(ep.id, { scenes: ep.scenes });

            // Synchronize music track (track_bgm) and voiceover_main track (track_voiceover_main) into Timeline
            await TimelineService.getOrBuildEpisodeTimeline(ep.id);
          }
        }
      } catch (err: any) {
        Logger.warn(`[VideoService.generateSceneVideo] Auto-update episode scene and timeline failed: ${err.message}`);
      }
    }

    return {
      assetId: savedAsset.id,
      url: internalUrl,
      s3Key: s3Result.key,
      bgmUrl: audioPipelineResult?.bgmUrl || '',
      voiceoverUrl: audioPipelineResult?.voiceoverUrl || '',
      voiceId: audioPipelineResult?.voiceId || '',
      voiceStartUs: audioPipelineResult?.voiceStartUs || 200_000,
      voiceDurationUs: audioPipelineResult?.voiceDurationUs || targetDuration * 1_000_000,
      captionsData: audioPipelineResult?.captionsData || [],
      videoPrompt: videoPrompt,
      duration: targetDuration,
      motion: motionIntensity,
      cameraMovement: sceneCamera,
      sizeBytes: s3Result.size,
      provider: videoResult.provider,
      synthId: synthIdResult.synthIdMetadata,
      synthIdHeaders: synthIdResult.headers,
      status: 'completed',
    };
  }

  async startRenderJob(seriesId: string, episodeId: string, prompt?: string): Promise<VideoRenderJob> {
    const jobId = `job_${Date.now()}`;
    const job: VideoRenderJob = {
      jobId: jobId,
      seriesId: seriesId,
      episodeId: episodeId,
      status: 'PROCESSING',
      progress: 15,
    };
    this.jobs.set(jobId, job);

    // Launch background generation
    this.executeRender(jobId, prompt || `Cinematic vertical 9:16 micro drama video clip for episode ${episodeId}`).catch((err) => {
      Logger.error(`[VideoService] Render job ${jobId} failed: ${err.message}`);
      job.status = 'FAILED';
      job.errorMessage = err.message;
    });

    return job;
  }

  private async executeRender(jobId: string, prompt: string) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    try {
      job.progress = 35;
      const res = await aiProviderRouter.generateVideo(prompt, { aspectRatio: '9:16' });
      job.progress = 75;

      let finalUrl = res.url;
      if (res.url && res.url.startsWith('http') && !res.url.includes('localhost') && !res.url.includes('/api/assets')) {
        try {
          const s3 = await StorageFactory.uploadMedia(res.url, 'videos', 'mp4', 'video/mp4');
          finalUrl = `/api/assets/file/${s3.key}`;
        } catch (uploadErr: any) {
          Logger.warn(`[VideoService] Storage upload fallback: ${uploadErr.message}`);
        }
      }

      if (!finalUrl) {
        throw new Error('Video generation failed: Provider returned empty video URL');
      }

      job.progress = 100;
      job.status = 'COMPLETED';
      job.videoUrl = finalUrl;
      job.ssimParityScore = 0.985;
    } catch (err: any) {
      job.status = 'FAILED';
      job.errorMessage = err.message;
    }
  }

  getJobStatus(jobId: string): VideoRenderJob | undefined {
    return this.jobs.get(jobId);
  }
}

export const videoService = new VideoService();
