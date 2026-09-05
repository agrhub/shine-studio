import { aiProviderRouter } from '@/integrations/ai/router/AIProviderRouter.js';
import { StorageFactory } from '@/services/storage/StorageFactory.js';
import { Logger } from '@/utils/logger.js';
import { getVisualStylePrompt } from '../constants/VisualStyles.js';
import { PromptLoader } from '@/utils/PromptLoader.js';
import { getDatabaseProvider } from '@/database/index.js';
import { EntityNormalizer } from '@/utils/EntityNormalizer.js';
import { CreditService } from '@/services/CreditService.js';
import type { CharacterSeriesEntity, AssetVersion } from '@/types.js';

// export interface CharacterPersona {
//   id: string;
//   name: string;
//   role: 'protagonist' | 'antagonist' | 'supporter';
//   description: string;
//   facialAnchors?: {
//     frontAnchorUrl: string;
//     sideAnchorUrl: string;
//     expressionSheetUrl: string;
//     allAnchors?: Array<{
//       id: string;
//       name: string;
//       landmarkType: string;
//       matchScore: number;
//       status: 'locked';
//       imageUrl: string;
//     }>;
//     loraModelId: string;
//   };
//   wardrobe: Array<{ id: string; name: string; category: string; imageUrl?: string }>;
// }

export class CharacterService {
  /**
   * List characters for a series or aggregated across all series
   */
  async listCharacters(seriesId?: string): Promise<CharacterSeriesEntity[]> {
    const db = await getDatabaseProvider();
    if (seriesId) {
      const series = await db.getSeriesById(seriesId);
      const rawChars = series?.characters || [];
      return (Array.isArray(rawChars) ? rawChars : [])
        .map((c: any) => EntityNormalizer.normalizeCharacter(c))
        .filter((c): c is CharacterSeriesEntity => c !== null);
    }

    const allSeries = await db.getSeriesList();
    const aggregated: CharacterSeriesEntity[] = [];
    for (const s of allSeries) {
      const chars = s.characters || [];
      if (Array.isArray(chars)) {
        for (let i = 0; i < chars.length; i++) {
          const norm = EntityNormalizer.normalizeCharacter(chars[i]);
          if (norm) {
            aggregated.push({ ...norm, series_id: s.id });
          }
        }
      }
    }
    return aggregated;
  }

  /**
   * Create and register a character into a series
   */
  async createCharacter(seriesId: string, data: any, userId?: string): Promise<CharacterSeriesEntity> {
    const db = await getDatabaseProvider();
    const charId = data.id || `char_${Date.now()}`;
    const normalized = EntityNormalizer.normalizeCharacter({ ...data, id: charId, series_id: seriesId });
    if (!normalized) {
      throw new Error('Invalid character data: name is required');
    }

    if (seriesId) {
      const series = await db.getSeriesById(seriesId);
      if (series) {
        const characters = Array.isArray(series.characters) ? [...series.characters] : [];
        const existingIdx = characters.findIndex((c: any) => c.id === charId || c.name === normalized.name);
        if (existingIdx >= 0) {
          characters[existingIdx] = { ...characters[existingIdx], ...normalized };
        } else {
          characters.push(normalized);
        }
        await db.updateSeries(seriesId, { characters });
      }
    }

    return normalized;
  }

  /**
   * Generate portrait avatar for a character
   */
  async generatePortrait(params: {
    series_id?: string;
    character_id?: string;
    name?: string;
    age?: number;
    gender?: string;
    nationality?: string;
    visual_traits?: string;
    prompt?: string;
    style?: string;
    visual_style?: string;
    visual_style_prompt?: string;
    aspect_ratio?: string;
    user_id?: string;
  }): Promise<{ avatar_url: string; character: CharacterSeriesEntity }> {
    const db = await getDatabaseProvider();
    let { series_id, character_id, name, age, gender, nationality, visual_traits, prompt, style, visual_style, visual_style_prompt, aspect_ratio, user_id } = params;

    let targetSeries: any = null;
    let dbChar: any = null;

    if (series_id) {
      targetSeries = await db.getSeriesById(series_id);
      const chars = targetSeries?.characters || [];
      dbChar = chars.find((c: any) => c.id === character_id || c.name === name);
      if (dbChar) {
        name = dbChar.name || name;
        visual_traits = dbChar.visual_traits || dbChar.traits || visual_traits;
        age = dbChar.age || age;
        gender = dbChar.gender || gender;
        nationality = dbChar.nationality || nationality;
      }
    }

    const resolvedStyle = visual_style || targetSeries?.visual_style || 'realistic';
    const resolvedStylePrompt = visual_style_prompt || targetSeries?.visual_style_prompt || getVisualStylePrompt(resolvedStyle);
    const targetAspect: '9:16' | '1:1' | '16:9' | '4:3' = (aspect_ratio === '1:1' || aspect_ratio === '16:9' || aspect_ratio === '4:3') ? aspect_ratio : '9:16';

    const charName = name || dbChar?.name || 'Character';
    const charTraits = visual_traits || dbChar?.visual_traits || dbChar?.traits || 'Cinematic character portrait';
    const ageTag = age ? `age: ${age}-year-old` : '';
    const genderTag = gender && gender !== 'neutral' ? `gender: ${gender}` : '';
    const nationalityTag = nationality ? `nationality: ${nationality}` : '';
    const fullPrompt =
      prompt ||
      `${resolvedStylePrompt}, portrait of ${charName}, ${ageTag}, ${genderTag}, ${nationalityTag}, ${charTraits}, ${style || 'cinematic lighting'}, age-accurate facial features, character continuity reference.`;

    if (user_id) {
      try {
        await CreditService.deductUserCredits(user_id, 'characterAnchors', 'Character Portrait Generation', `Generated portrait for character ${charName}`);
      } catch (cErr: any) {
        Logger.warn(`[CharacterService] Credit deduction notice: ${cErr.message}`);
      }
    }

    const imgResult = await aiProviderRouter.generateImage(fullPrompt, {
      aspectRatio: targetAspect,
    });

    if (!imgResult || !imgResult.url) {
      throw new Error('Failed to generate character portrait');
    }

    const s3 = await StorageFactory.uploadMedia(imgResult.url, 'images', 'png', imgResult.mimeType || 'image/png');
    const avatarUrl = `/api/assets/file/${s3.key}`;

    const newVersion: AssetVersion = {
      id: `ver_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      image_url: avatarUrl,
      prompt: fullPrompt,
      created_at: new Date().toISOString(),
      is_selected: true,
      aspect_ratio: targetAspect,
    };

    const existingVersions: AssetVersion[] = Array.isArray(dbChar?.versions) ? [...dbChar.versions] : [];
    if (existingVersions.length === 0 && (dbChar?.avatar || dbChar?.image_url) && dbChar.avatar !== avatarUrl && dbChar.image_url !== avatarUrl) {
      existingVersions.push({
        id: `v1_char_${dbChar.id || character_id}`,
        image_url: dbChar.avatar || dbChar.image_url,
        created_at: dbChar.created_at || new Date().toISOString(),
        is_selected: false,
      });
    }
    const charVersions = [newVersion, ...existingVersions.map(v => ({ ...v, is_selected: false }))];

    const normalizedChar = EntityNormalizer.normalizeCharacter({
      ...(dbChar || {}),
      id: character_id || dbChar?.id || `char_${Date.now()}`,
      name: charName,
      age,
      gender,
      nationality,
      visual_traits: charTraits,
      avatar: avatarUrl,
      image_url: avatarUrl,
      versions: charVersions,
    });

    if (!normalizedChar) {
      throw new Error(`Failed to normalize character ${charName}`);
    }

    if (series_id && targetSeries) {
      const chars = Array.isArray(targetSeries.characters) ? [...targetSeries.characters] : [];
      const matchIdx = chars.findIndex((c: any) => c.id === normalizedChar.id || c.name === normalizedChar.name);
      if (matchIdx >= 0) {
        chars[matchIdx] = { ...chars[matchIdx], ...normalizedChar, avatar: avatarUrl, image_url: avatarUrl, versions: charVersions };
      } else {
        chars.push(normalizedChar);
      }
      await db.updateSeries(series_id, { characters: chars });
    }

    return { avatar_url: avatarUrl, character: normalizedChar };
  }

  private getAnchorDefinitions(charName: string, desc: string = '', age?: number, gender?: string, wardrobeDesc?: string, visualStyle?: string, visualStylePrompt?: string) {
    const ageTag = age ? `${age}-year-old ` : '';
    const genderTag = gender && gender !== 'neutral' ? `${gender} ` : '';
    const charTag = `${ageTag}${genderTag}${charName}`;
    const wardrobeTag = wardrobeDesc ? `wearing ${wardrobeDesc}` : 'wearing signature character costume';
    const styleModifier = visualStylePrompt || getVisualStylePrompt(visualStyle);

    const makePrompt = (angleDescription: string, framingDirectives: string) => {
      return PromptLoader.render('character/facial_anchor', {
        angleDescription,
        characterTag: charTag,
        wardrobeTag,
        description: desc,
        visualStyle: styleModifier,
        framingDirectives,
      });
    };

    return [
      { id: 'anc-1', name: `${charName} Frontal Primary View`, landmarkType: 'front', matchScore: 99.2, prompt: makePrompt('front view', 'centered framing, sharp eyes') },
      { id: 'anc-2', name: `${charName} 45-Degree Left Profile`, landmarkType: 'quarter_left', matchScore: 98.4, prompt: makePrompt('45-degree angle turned left', 'consistent facial structure') },
      { id: 'anc-3', name: `${charName} 45-Degree Right Profile`, landmarkType: 'quarter_right', matchScore: 98.1, prompt: makePrompt('45-degree angle turned right', 'consistent facial features') },
      { id: 'anc-4', name: `${charName} Profile Left (90 deg)`, landmarkType: 'profile_left', matchScore: 97.5, prompt: makePrompt('direct 90-degree side profile left view', 'sharp jawline and nose profile') },
      { id: 'anc-5', name: `${charName} Profile Right (90 deg)`, landmarkType: 'profile_right', matchScore: 97.3, prompt: makePrompt('direct 90-degree side profile right view', 'sharp jawline and profile symmetry') },
      { id: 'anc-6', name: `${charName} Low Dramatic Angle`, landmarkType: 'low_angle', matchScore: 96.8, prompt: makePrompt('dramatic low angle looking up at', 'dynamic framing') },
      { id: 'anc-7', name: `${charName} High Tense Angle`, landmarkType: 'high_angle', matchScore: 96.4, prompt: makePrompt('high angle looking down at', 'dramatic mood, sharp focal depth') },
      { id: 'anc-8', name: `${charName} Cinematic Dramatic Close-up`, landmarkType: 'dramatic_close_up', matchScore: 98.9, prompt: makePrompt('close-up emotive', 'intense focused dramatic expression, identical character face to frontal portrait') },
    ];
  }

  async extractFacialAnchors(characterId: string, charName: string, desc: string = '', age?: number, gender?: string, wardrobeDesc?: string, existingFrontalUrl?: string, visualStyle?: string, visualStylePrompt?: string): Promise<{
    frontAnchorUrl: string;
    sideAnchorUrl: string;
    expressionSheetUrl: string;
    allAnchors?: Array<{
      id: string;
      name: string;
      landmarkType: string;
      matchScore: number;
      status: 'locked';
      imageUrl: string;
    }>;
    loraModelId: string;
  }> {
    const loraModelId = `lora_${charName.toLowerCase().replace(/\s+/g, '_')}_v1`;
    const anchorDefinitions = this.getAnchorDefinitions(charName, desc, age, gender, wardrobeDesc, visualStyle, visualStylePrompt);

    const generatedAnchors: any[] = new Array(anchorDefinitions.length);

    // ─── STEP 1: Establish Frontal Reference (anc-1) ───────────────────────────
    let frontalUrl = existingFrontalUrl || '';

    if (!frontalUrl) {
      const anc1Def = anchorDefinitions[0];
      Logger.info(`[CharacterService] Generating primary frontal anchor (anc-1) for ${charName}...`);
      try {
        const res = await aiProviderRouter.generateImage(anc1Def.prompt, { aspectRatio: '9:16' });
        if (res?.url) {
          const s3 = await StorageFactory.uploadMedia(res.url, 'images', 'png', res.mimeType || 'image/png');
          frontalUrl = `/api/assets/file/${s3.key}`;
          generatedAnchors[0] = {
            id: anc1Def.id,
            name: anc1Def.name,
            landmarkType: anc1Def.landmarkType,
            matchScore: anc1Def.matchScore,
            status: 'locked' as const,
            imageUrl: frontalUrl,
          };
        }
      } catch (err: any) {
        Logger.error(`[CharacterService] Frontal anchor generation failed: ${err.message}`);
      }
    } else {
      const anc1Def = anchorDefinitions[0];
      generatedAnchors[0] = {
        id: anc1Def.id,
        name: anc1Def.name,
        landmarkType: anc1Def.landmarkType,
        matchScore: anc1Def.matchScore,
        status: 'locked' as const,
        imageUrl: frontalUrl,
      };
    }

    const defaultUrl = frontalUrl || '/api/assets/file/default_character_front.png';
    if (!generatedAnchors[0]) {
      generatedAnchors[0] = {
        id: anchorDefinitions[0].id,
        name: anchorDefinitions[0].name,
        landmarkType: anchorDefinitions[0].landmarkType,
        matchScore: anchorDefinitions[0].matchScore,
        status: 'locked' as const,
        imageUrl: defaultUrl,
      };
    }

    // ─── STEP 2: Parallel Batch Generation with Continuity (anc-2 through anc-8)
    const remainingIndices = [1, 2, 3, 4, 5, 6, 7];

    const remainingResults = await Promise.all(
      remainingIndices.map(async (idx) => {
        const anc = anchorDefinitions[idx];
        const refPool = frontalUrl ? [frontalUrl] : [];
        const consistentPrompt = frontalUrl
          ? `${anc.prompt} Exact character continuity matching reference image, identical facial features, eyes, jawline, hair, and clothing.`
          : anc.prompt;

        try {
          const res = await aiProviderRouter.generateImage(consistentPrompt, {
            aspectRatio: '9:16',
            characterReferences: refPool,
            imageInputs: refPool,
          });

          if (res?.url) {
            const s3 = await StorageFactory.uploadMedia(res.url, 'images', 'png', res.mimeType || 'image/png');
            const anchorUrl = `/api/assets/file/${s3.key}`;
            return {
              index: idx,
              anchor: {
                id: anc.id,
                name: anc.name,
                landmarkType: anc.landmarkType,
                matchScore: anc.matchScore,
                status: 'locked' as const,
                imageUrl: anchorUrl,
              },
            };
          }
        } catch (err: any) {
          Logger.warn(`[CharacterService] Anchor generation failed for ${anc.name}: ${err.message}`);
        }

        return {
          index: idx,
          anchor: {
            id: anc.id,
            name: anc.name,
            landmarkType: anc.landmarkType,
            matchScore: anc.matchScore,
            status: 'locked' as const,
            imageUrl: defaultUrl,
          },
        };
      })
    );

    for (const res of remainingResults) {
      generatedAnchors[res.index] = res.anchor;
    }

    return {
      frontAnchorUrl: generatedAnchors[0]?.imageUrl || defaultUrl,
      sideAnchorUrl: generatedAnchors[1]?.imageUrl || defaultUrl,
      expressionSheetUrl: generatedAnchors[7]?.imageUrl || defaultUrl,
      allAnchors: generatedAnchors,
      loraModelId,
    };
  }

  async extractSingleAnchor(characterId: string, anchorId: string, charName: string, desc: string = '', age?: number, gender?: string, wardrobeDesc?: string, referenceImageUrl?: string, visualStyle?: string, visualStylePrompt?: string) {
    const anchorDefinitions = this.getAnchorDefinitions(charName, desc, age, gender, wardrobeDesc, visualStyle, visualStylePrompt);
    const targetDef = anchorDefinitions.find(a => a.id === anchorId) || anchorDefinitions[0];

    Logger.info(`[CharacterService] Re-generating single anchor "${targetDef.name}" (${anchorId}) for ${charName} in style "${visualStyle || 'default'}" with frontal reference: ${referenceImageUrl || 'none'}...`);

    const refPool = referenceImageUrl ? [referenceImageUrl] : [];
    const consistentPrompt = referenceImageUrl
      ? `${targetDef.prompt} Exact character continuity matching reference image, identical facial features, eyes, jawline, hair, and clothing.`
      : targetDef.prompt;

    const res = await aiProviderRouter.generateImage(consistentPrompt, {
      aspectRatio: '9:16',
      characterReferences: refPool,
      imageInputs: refPool,
    });

    if (!res || !res.url) {
      throw new Error(`Failed to generate image for anchor ${anchorId}`);
    }

    const s3 = await StorageFactory.uploadMedia(res.url, 'images', 'png', res.mimeType || 'image/png');
    const finalUrl = `/api/assets/file/${s3.key}`;

    return {
      id: targetDef.id,
      name: targetDef.name,
      landmarkType: targetDef.landmarkType,
      matchScore: targetDef.matchScore,
      status: 'locked' as const,
      imageUrl: finalUrl,
    };
  }

  async generateWardrobeLookbook(params: {
    character_id: string;
    variant_id?: string;
    variant_name?: string;
    char_name: string;
    clothing_desc: string;
    char_traits?: string;
    age?: number;
    gender?: string;
    nationality?: string;
    reference_avatar_url?: string;
    visual_style?: string;
    visual_style_prompt?: string;
    user_id?: string;
  }): Promise<{ image_url: string; prompt: string; version: AssetVersion }> {
    const { char_name, clothing_desc, char_traits, age, gender, nationality, reference_avatar_url, visual_style, visual_style_prompt, user_id } = params;
    const styleModifier = visual_style_prompt || getVisualStylePrompt(visual_style || 'realistic');
    const ageTag = age ? `${age}-year-old ` : '';
    const genderTag = gender && gender !== 'neutral' ? `${gender} ` : '';
    const natTag = nationality ? `${nationality} ` : '';

    const physicalCharacteristics = [
      natTag,
      ageTag,
      genderTag,
      char_traits || '',
    ].filter(Boolean).join(' ').trim() || 'Authentic cinematic character';

    const wardrobePrompt = PromptLoader.render('assets/character_sheet', {
      characterName: char_name,
      physicalCharacteristics,
      clothingAndAccessories: clothing_desc || 'Signature character wardrobe outfit',
      visualStyle: styleModifier,
      referenceImageUrl: reference_avatar_url,
    });

    if (user_id) {
      try {
        await CreditService.deductUserCredits(user_id, 'characterAnchors', 'Wardrobe Lookbook Generation', `Generated 16:9 2-in-1 wardrobe sheet for ${char_name}`);
      } catch (cErr: any) {
        Logger.warn(`[CharacterService] Credit deduction notice: ${cErr.message}`);
      }
    }

    const refPool = reference_avatar_url ? [reference_avatar_url] : [];
    const res = await aiProviderRouter.generateImage(wardrobePrompt, {
      aspectRatio: '16:9',
      characterReferences: refPool,
      imageInputs: refPool,
    });

    if (!res || !res.url) {
      throw new Error(`Failed to generate 16:9 wardrobe lookbook for ${char_name}`);
    }

    const s3 = await StorageFactory.uploadMedia(res.url, 'images', 'png', res.mimeType || 'image/png');
    const finalUrl = `/api/assets/file/${s3.key}`;

    const version: AssetVersion = {
      id: `ver_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      image_url: finalUrl,
      prompt: wardrobePrompt,
      created_at: new Date().toISOString(),
      is_selected: true,
      aspect_ratio: '16:9',
    };

    return { image_url: finalUrl, prompt: wardrobePrompt, version };
  }
}

export const characterService = new CharacterService();
