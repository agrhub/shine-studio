import { geminiClient, GEMINI_SUPPORTED_VOICES } from '../integrations/ai/gemini/GeminiClient.js';
import { aiProviderRouter } from '../integrations/ai/router/AIProviderRouter.js';
import { renderSkill, loadSkill } from '../utils/SkillLoader.js';
import { PromptLoader } from '../utils/PromptLoader.js';
import { Logger } from '../utils/logger.js';
import { getLanguageForCountry } from '../utils/LanguageMapping.js';
import { getVisualStylePrompt } from '../constants/VisualStyles.js';
import {
  ShotFrame,
  SceneEntity,
  LocationAsset,
  PropAsset,
  CharacterSeriesEntity,
  CharacterWardrobeVariant,
  ScriptAgentInput,
  ScriptShot,
  ScriptScene,
  ScriptSceneGroup,
  ScriptItem,
} from '../types.js';
import { nanoid } from 'nanoid';
import { CaptionService } from '~/services/CaptionService.js';

export class ScriptAgent {
  // ── 1. DURATION & SCENE/SHOT TIER SCALING ─────────────────────────────────

  public calculateDurationTiers(durationSec?: number) {
    const targetDuration = Math.min(Math.max(Number(durationSec) || 90, 30), 600);
    // Each video shot is strictly 4s to 8s (average ~5.5s - 6.5s for dynamic vertical micro-drama pacing).
    // minShots: Minimum shots needed assuming shots average ~6.5s (so episode reaches target duration naturally)
    const minShots = Math.max(3, Math.ceil(targetDuration / 6.5));
    // maxShots: Maximum shots if scenes are fast-paced (~4.5s per shot)
    const maxShots = Math.max(minShots + 2, Math.ceil(targetDuration / 4.5));

    // Scaling scenes and shots per scene:
    const minShotsPerScene = targetDuration <= 60 ? 2 : targetDuration <= 180 ? 3 : 4;
    const maxShotsPerScene = targetDuration <= 60 ? 4 : targetDuration <= 180 ? 6 : 8;
    const minScenes = Math.max(1, Math.ceil(minShots / maxShotsPerScene));
    const maxScenes = Math.max(minScenes + 1, Math.ceil(maxShots / minShotsPerScene));
    const useBatchGeneration = targetDuration > 240;

    return {
      targetDuration,
      minShots,
      maxShots,
      minShotsPerScene,
      maxShotsPerScene,
      minScenes,
      maxScenes,
      useBatchGeneration,
    };
  }

  // ── 2. ASSET NORMALIZATION HELPERS ────────────────────────────────────────

  public normalizeCharacters(
    raw: Array<any | string>,
    existing: CharacterSeriesEntity[] = [],
    descriptions: Record<string, { 
      physical_characteristics?: string; 
      clothing_and_accessories?: string; 
      backstory?: string; 
      wardrobe_variants?: CharacterWardrobeVariant[]
    }> = {}
  ): CharacterSeriesEntity[] {
    const existingMap = new Map(existing.map((c: any) => [c.name?.toLowerCase().trim(), c]));
    return (raw || []).map((item, i) => {
      const name = typeof item === 'string' ? item : item.name || `Character ${i + 1}`;
      const existingObj = existingMap.get(name.toLowerCase().trim());
      const desc = descriptions[name] || {};

      const existingVariants = Array.isArray(existingObj?.wardrobe_variants || existingObj?.wardrobeVariants)
        ? (existingObj?.wardrobe_variants || existingObj?.wardrobeVariants)
        : [];
      const itemVariants = (typeof item === 'object' && Array.isArray(item.wardrobe_variants || item.wardrobeVariants))
        ? (item.wardrobe_variants || item.wardrobeVariants)
        : (desc.wardrobe_variants && Array.isArray(desc.wardrobe_variants))
        ? desc.wardrobe_variants
        : [];

      const variantMap = new Map<string, any>();
      existingVariants.forEach((v: any) => {
        const vid = (v.variant_id || v.variantId || '').toLowerCase().trim();
        if (vid) variantMap.set(vid, v);
      });
      itemVariants.forEach((v: any) => {
        const vid = (v.variant_id || v.variantId || '').toLowerCase().trim();
        if (vid && !variantMap.has(vid)) {
          variantMap.set(vid, v);
        }
      });

      const rawVariants = variantMap.size > 0 ? Array.from(variantMap.values()) : existingVariants;

      const slug = (typeof item === 'object' && item.id) || existingObj?.id || `char_${i + 1}`;
      const defaultCloth = (typeof item === 'object' && (item.clothing_and_accessories || item.clothingAndAccessories || item.wardrobe || item.costume_style || item.costumeStyle))
        || desc.clothing_and_accessories
        || existingObj?.clothing_and_accessories
        || existingObj?.clothingAndAccessories
        || existingObj?.costume_style
        || existingObj?.wardrobe
        || '';

      const wardrobe_variants = (rawVariants.length > 0
        ? rawVariants.map((v: any, vi: number) => ({
            variant_id: v.variant_id || v.variantId || `${slug}_variant_${vi + 1}`,
            name: v.name || `Outfit ${vi + 1}`,
            clothing_and_accessories: v.clothing_and_accessories || v.clothingAndAccessories || defaultCloth || '',
            associated_scenes: Array.isArray(v.associated_scenes || v.associatedScenes) && (v.associated_scenes || v.associatedScenes).length > 0 ? (v.associated_scenes || v.associatedScenes) : [1],
            image_url: v.image_url || v.imageUrl || undefined,
          }))
        : (defaultCloth
          ? [{
              variant_id: `${slug}_default`,
              name: 'Default Attire',
              clothing_and_accessories: defaultCloth,
              associated_scenes: [1],
            }]
          : []));

      const physical = (typeof item === 'object' && (item.physical_characteristics || item.physicalCharacteristics || item.appearance || item.visual_traits || item.visualTraits || item.description))
        || desc.physical_characteristics
        || existingObj?.physical_characteristics
        || existingObj?.physicalCharacteristics
        || existingObj?.appearance
        || existingObj?.visual_traits
        || existingObj?.visualTraits
        || existingObj?.description
        || '';

      const existingVoice = existingObj?.voice_id || existingObj?.voiceId;
      const rawItemVoice = (typeof item === 'object' && (item.voice_id || item.voiceId)) ? (item.voice_id || item.voiceId) : null;
      const gender = (typeof item === 'object' && item.gender) || existingObj?.gender || (i % 2 === 0 ? 'Male' : 'Female');
      const isFemale = String(gender).toLowerCase() === 'female';

      let resolvedVoiceId = isFemale ? 'Kore' : 'Fenrir';
      if (existingVoice && GEMINI_SUPPORTED_VOICES.includes(existingVoice)) {
        resolvedVoiceId = existingVoice;
      } else if (rawItemVoice && GEMINI_SUPPORTED_VOICES.includes(rawItemVoice)) {
        resolvedVoiceId = rawItemVoice;
      } else if (existingVoice) {
        resolvedVoiceId = existingVoice;
      }

      return {
        id: slug,
        series_id: (typeof item === 'object' && item.series_id) || existingObj?.series_id || '',
        name,
        role: (typeof item === 'object' && item.role) || existingObj?.role || (i === 0 ? 'protagonist' : 'supporting'),
        age: Number((typeof item === 'object' && item.age) || existingObj?.age) || 25,
        gender: String(gender),
        nationality: (typeof item === 'object' && item.nationality) || existingObj?.nationality || 'United States',
        voice_id: resolvedVoiceId,
        identity: (typeof item === 'object' && item.identity) || existingObj?.identity || '',
        traits: (typeof item === 'object' && item.traits) || existingObj?.traits || '',
        visual_traits: physical,
        physical_characteristics: physical,
        appearance: physical,
        clothing_and_accessories: defaultCloth,
        frame_description: (typeof item === 'object' && (item.frame_description || item.frameDescription)) || existingObj?.frame_description || existingObj?.frameDescription || 'A character sheet with a head and shoulders shot showing the characters face on the left and a full body shot of the character on the right wearing the same clothing and accessories against a seamless white background.',
        wardrobe_variants,
        avatar: (typeof item === 'object' && (item.avatar || item.image_url || item.imageUrl)) || existingObj?.avatar || existingObj?.image_url || existingObj?.imageUrl || null,
        speech_style: (typeof item === 'object' && item.speech_style) || existingObj?.speech_style || '',
        description: physical || (typeof item === 'object' && item.description) || '',
      };
    });
  }

  public normalizeLocations(
    raw: Array<any | string>,
    existing: any[] = [],
    descriptions: Record<string, { physical_characteristics?: string; time_of_day?: string }> = {}
  ): LocationAsset[] {
    const existingMap = new Map(existing.map((l: any) => [l.name?.toLowerCase().trim(), l]));
    return (raw || []).map((item, i) => {
      const name = typeof item === 'string' ? item : item.name || `Location ${i + 1}`;
      const existingObj = existingMap.get(name.toLowerCase().trim());
      const desc = descriptions[name] || {};
      const physical = (typeof item === 'object' && (item.physical_characteristics || item.physicalCharacteristics || item.appearance || item.description))
        || desc.physical_characteristics
        || existingObj?.physical_characteristics
        || existingObj?.physicalCharacteristics
        || existingObj?.description
        || '';

      return {
        id: (typeof item === 'object' && item.id) || existingObj?.id || `loc_${i + 1}`,
        name,
        time_of_day: (typeof item === 'object' && (item.time_of_day || item.timeOfDay)) || desc.time_of_day || existingObj?.time_of_day || existingObj?.timeOfDay || 'DAY',
        frame_description: (typeof item === 'object' && (item.frame_description || item.frameDescription)) || existingObj?.frame_description || existingObj?.frameDescription || 'Make a single image with 4 different 16:9 views of this same location with perfect continuity.',
        physical_characteristics: physical,
        image_url: (typeof item === 'object' && (item.image_url || item.imageUrl)) || existingObj?.image_url || existingObj?.imageUrl || '',
        status: (typeof item === 'object' && item.status) || existingObj?.status || 'draft',
      };
    });
  }

  public normalizeProps(
    raw: Array<any | string>,
    existing: any[] = [],
    descriptions: Record<string, { physical_characteristics?: string }> = {}
  ): PropAsset[] {
    const existingMap = new Map(existing.map((p: any) => [p.name?.toLowerCase().trim(), p]));
    return (raw || []).map((item, i) => {
      const name = typeof item === 'string' ? item : item.name || `Prop ${i + 1}`;
      const existingObj = existingMap.get(name.toLowerCase().trim());
      const desc = descriptions[name] || {};
      const physical = (typeof item === 'object' && (item.physical_characteristics || item.physicalCharacteristics || item.appearance || item.description))
        || desc.physical_characteristics
        || existingObj?.physical_characteristics
        || existingObj?.physicalCharacteristics
        || existingObj?.description
        || '';

      return {
        id: (typeof item === 'object' && item.id) || existingObj?.id || `prop_${i + 1}`,
        name,
        owner: (typeof item === 'object' && item.owner) || existingObj?.owner || '',
        frame_description: (typeof item === 'object' && (item.frame_description || item.frameDescription)) || existingObj?.frame_description || existingObj?.frameDescription || 'A product image of just the item described against a white background.',
        physical_characteristics: physical,
        image_url: (typeof item === 'object' && (item.image_url || item.imageUrl)) || existingObj?.image_url || existingObj?.imageUrl || '',
        status: (typeof item === 'object' && item.status) || existingObj?.status || 'draft',
      };
    });
  }

  public extractCanonicalAssets(parsed: any) {
    return {
      characters: this.normalizeCharacters(Array.isArray(parsed?.characters) ? parsed.characters : []),
      locations: this.normalizeLocations(Array.isArray(parsed?.locations) ? parsed.locations : []),
      props: this.normalizeProps(Array.isArray(parsed?.props) ? parsed.props : []),
    };
  }

  public formatCharactersContext(characters: CharacterSeriesEntity[]): string {
    return (characters || [])
      .map(c => {
        let text = `- ${c.name} (${c.role || 'character'}): ${c.physical_characteristics || 'Authentic'} | Wardrobe: ${c.clothing_and_accessories || 'Signature styling'}`;
        if (Array.isArray(c.wardrobe_variants) && c.wardrobe_variants.length > 0) {
          const variantsStr = c.wardrobe_variants
            .map(v => `[variant_id: "${v.variant_id}", name: "${v.name}", outfit: "${v.clothing_and_accessories || ''}", scenes: ${JSON.stringify(v.associated_scenes || [])}]`)
            .join(', ');
          text += ` | Wardrobe Variants: ${variantsStr}`;
        }
        return text;
      })
      .join('\n');
  }

  public formatLocationsContext(locations: LocationAsset[]): string {
    return (locations || [])
      .map(l => `- ${l.name} (${l.time_of_day || 'DAY'}): ${l.physical_characteristics || 'Standard cinematic environment'}`)
      .join('\n');
  }

  public formatPropsContext(props: PropAsset[]): string {
    return (props || [])
      .map(p => `- ${p.name}: ${p.physical_characteristics || 'Key cinematic item'}`)
      .join('\n');
  }

  // ── 3. VISUAL PROMPT BUILDER ──────────────────────────────────────────────

  public buildVisualPrompt(
    frameDesc: string,
    locName: string,
    charNames: string[],
    costumes: any[],
    propNames: string[],
    localLocations: LocationAsset[] = [],
    localCharacters: CharacterSeriesEntity[] = [],
    localProps: PropAsset[] = [],
    speechTimingPrompt?: string
  ): string {
    let vp = `FrameDescription: ${frameDesc || 'Cinematic shot'}\n`;
    if (locName) {
      const locObj = localLocations.find(l => l.name?.toLowerCase() === locName.toLowerCase());
      vp += `Locations: ${locName}: ${locObj?.physical_characteristics || locName}\n`;
    }
    if (charNames.length > 0) {
      const charDescList = charNames.map(cName => {
        const cObj = localCharacters.find(c => c.name?.toLowerCase() === cName.toLowerCase());
        const costObj = (costumes || []).find((cc: any) => cc.character?.toLowerCase() === cName.toLowerCase());
        const wardrobe = costObj?.wardrobe || cObj?.clothing_and_accessories || 'Signature wardrobe';
        const phys = cObj?.physical_characteristics || 'Authentic facial traits';
        return `${cName}: ${phys}, wearing ${wardrobe}`;
      });
      vp += `Characters: ${charDescList.join('. ')}\n`;
    }
    if (propNames.length > 0) {
      const propDescList = propNames.map(pName => {
        const pObj = localProps.find(p => p.name?.toLowerCase() === pName.toLowerCase());
        return `${pName}: ${pObj?.physical_characteristics || 'Detailed prop'}`;
      });
      vp += `Props: ${propDescList.join('. ')}\n`;
    }
    if (speechTimingPrompt) {
      vp += `${speechTimingPrompt}`;
    }
    return vp.trim();
  }

  // ── 3B. WORD-LEVEL CAPTIONS & DIALOGUE TIMING GENERATOR ──────────────────

  public buildWordLevelCaptionsForShot(
    dialogue: any[],
    durSec: number,
    localCharacters: CharacterSeriesEntity[] = []
  ): {
    voice_start_us: number;
    voice_duration_us: number;
    voice_id: string;
    captions_data: any[];
    words: any[];
    speechTimingPrompt: string;
  } {
    if (!Array.isArray(dialogue) || dialogue.length === 0) {
      return {
        voice_start_us: 0,
        voice_duration_us: 0,
        voice_id: '',
        captions_data: [],
        words: [],
        speechTimingPrompt: '',
      };
    }

    const firstDlg = dialogue[0];
    const rawCharName = (firstDlg.character || firstDlg.speaker || '').trim();
    const cleanCharName = rawCharName.replace(/\s*\([^)]*\)\s*/g, '').trim().toLowerCase();
    const charDef = localCharacters.find(c =>
      c.name?.toLowerCase().trim() === cleanCharName ||
      c.name?.toLowerCase().trim() === rawCharName.toLowerCase()
    );
    const voice_id = charDef?.voice_id || (charDef?.role === 'antagonist' ? 'Fenrir' : 'Kore');

    const rawLine = (firstDlg.line || firstDlg.text || '').trim();
    if (!rawLine) {
      return {
        voice_start_us: 0,
        voice_duration_us: 0,
        voice_id,
        captions_data: [],
        words: [],
        speechTimingPrompt: '',
      };
    }

    const startSec = Number(firstDlg.speech_start_sec !== undefined ? firstDlg.speech_start_sec : (firstDlg.speechStartSec !== undefined ? firstDlg.speechStartSec : 0.5));
    const { voice_start_us, voice_duration_us, captions_data, words } = CaptionService.buildWordLevelCaptionsFromDialogue(
      [firstDlg],
      durSec,
      startSec
    );

    const endSec = startSec + (voice_duration_us / 1_000_000);
    const speechTimingPrompt = `[Speech & Vocal Profile]: At ${startSec.toFixed(1)}s to ${endSec.toFixed(1)}s, ${rawCharName || 'Character'} (Voice Model: ${voice_id}, Emotion: ${firstDlg.emotion || 'Dramatic'}) speaks: "${rawLine}". Lip movements, facial expressions, and vocal cadence synchronize naturally between ${startSec.toFixed(1)}s and ${endSec.toFixed(1)}s.`;

    return {
      voice_start_us,
      voice_duration_us,
      voice_id,
      captions_data,
      words,
      speechTimingPrompt,
    };
  }

  // ── 4. SCENE & SHOT FLATTENING AND NORMALIZATION ─────────────────────────

  private resolveAssetIds(
    charNames: string[],
    locationNames: string[],
    propNames: string[],
    localCharacters: CharacterSeriesEntity[],
    localLocations: LocationAsset[],
    localProps: PropAsset[]
  ): { character_ids: string[]; location_ids: string[]; prop_ids: string[] } {
    const norm = (s: any): string => (typeof s === 'string' ? s : (s?.name ?? s?.id ?? (s != null ? String(s) : ''))).normalize('NFC').toLowerCase().trim();
    const uniqueCharIds = Array.from(new Set(
      (Array.isArray(charNames) ? charNames : []).map(n => {
        const nn = norm(n);
        if (!nn) return null;
        const found = localCharacters.find(c => {
          const cn = norm(c.name);
          const cid = norm(c.id);
          return cn === nn || cid === nn || (cn && nn && (cn.includes(nn) || nn.includes(cn)));
        });
        return found?.id || null;
      }).filter(Boolean)
    )) as string[];
    const uniqueLocIds = Array.from(new Set(
      (Array.isArray(locationNames) ? locationNames : []).map(n => {
        const nn = norm(n);
        if (!nn) return null;
        const found = localLocations.find(l => {
          const ln = norm(l.name);
          const lid = norm(l.id);
          return ln === nn || lid === nn || (ln && nn && (ln.includes(nn) || nn.includes(ln)));
        });
        return found?.id || null;
      }).filter(Boolean)
    )) as string[];
    const uniquePropIds = Array.from(new Set(
      (Array.isArray(propNames) ? propNames : []).map(n => {
        const nn = norm(n);
        if (!nn) return null;
        const found = localProps.find(p => {
          const pn = norm(p.name);
          const pid = norm(p.id);
          return pn === nn || pid === nn || (pn && nn && (pn.includes(nn) || nn.includes(pn)));
        });
        return found?.id || null;
      }).filter(Boolean)
    )) as string[];
    return { character_ids: uniqueCharIds, location_ids: uniqueLocIds, prop_ids: uniquePropIds };
  }

  public normalizeCharacterCostumes(
    rawCostumes: any[],
    charNames: string[],
    sceneNumber: number,
    localCharacters: CharacterSeriesEntity[]
  ): Array<{ character: string; wardrobe: string; variant_id: string }> {
    const result: Array<{ character: string; wardrobe: string; variant_id: string }> = [];
    const processedChars = new Set<string>();
    const costumesArr = Array.isArray(rawCostumes) ? rawCostumes : [];

    const norm = (s: any): string => (typeof s === 'string' ? s : (s?.name ?? s?.id ?? (s != null ? String(s) : ''))).normalize('NFC').toLowerCase().trim();
    const findCharDef = (name: string) => {
      const n = norm(name);
      if (!n) return undefined;
      return localCharacters.find(c => {
        const cn = norm(c.name);
        const cid = norm(c.id);
        return cn === n || cid === n || (cn && n && (cn.includes(n) || n.includes(cn)));
      });
    };

    for (const cost of costumesArr) {
      if (!cost || !cost.character) continue;
      const charName = String(cost.character).trim();
      const charDef = findCharDef(charName);
      // Always use canonical name from DB to avoid case/accent mismatch duplicates
      const canonicalName = charDef?.name || charName;
      const canonicalNorm = norm(canonicalName);
      if (processedChars.has(canonicalNorm)) continue;
      processedChars.add(canonicalNorm);

      const variants = Array.isArray(charDef?.wardrobe_variants) ? charDef.wardrobe_variants : [];

      let matchedVariant: any = null;
      const costVariantId = norm(cost.variant_id || cost.variantId || '');
      const costWardrobe = norm(cost.wardrobe || '');

      // 1. Match by variant_id exact or substring
      if (costVariantId && variants.length > 0) {
        matchedVariant = variants.find(v => {
          const vId = norm(v.variant_id);
          const vName = norm(v.name);
          return vId === costVariantId || vName === costVariantId || (vId && (vId.includes(costVariantId) || costVariantId.includes(vId)));
        });
      }
      // 2. Match by scene_number in associated_scenes
      if (!matchedVariant && sceneNumber && variants.length > 0) {
        matchedVariant = variants.find(v => Array.isArray(v.associated_scenes) && v.associated_scenes.includes(sceneNumber));
      }
      // 3. Match by wardrobe description / name similarity
      if (!matchedVariant && costWardrobe && variants.length > 0) {
        matchedVariant = variants.find(v => {
          const vName = norm(v.name);
          const vClothing = norm(v.clothing_and_accessories);
          return (vName && costWardrobe.includes(vName)) ||
                 (vClothing && (costWardrobe.includes(vClothing) || vClothing.includes(costWardrobe)));
        });
      }
      // 4. Fallback to first variant with image or first variant
      if (!matchedVariant && variants.length > 0) {
        matchedVariant = variants.find(v => v.image_url) || variants[0];
      }

      const slug = charDef?.id || charName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const fallbackVariantId = variants.length > 0 ? variants[0].variant_id : `${slug}_default`;
      const resolvedVariantId = matchedVariant?.variant_id || fallbackVariantId;
      const resolvedWardrobe = matchedVariant?.clothing_and_accessories || matchedVariant?.name || cost.wardrobe || charDef?.clothing_and_accessories || 'Signature attire';

      result.push({
        character: canonicalName,
        wardrobe: resolvedWardrobe,
        variant_id: resolvedVariantId,
      });
    }

    // Only add from charNames if not already covered by rawCostumes
    for (const cName of charNames) {
      if (!cName) continue;
      const charDef = findCharDef(cName);
      const canonicalName = charDef?.name || cName;
      const canonicalNorm = norm(canonicalName);
      if (processedChars.has(canonicalNorm)) continue;
      processedChars.add(canonicalNorm);

      const variants = Array.isArray(charDef?.wardrobe_variants) ? charDef.wardrobe_variants : [];

      let matchedVariant: any = null;
      if (sceneNumber && variants.length > 0) {
        matchedVariant = variants.find(v => Array.isArray(v.associated_scenes) && v.associated_scenes.includes(sceneNumber));
      }
      if (!matchedVariant && variants.length > 0) {
        matchedVariant = variants.find(v => v.image_url) || variants[0];
      }

      const slug = charDef?.id || cName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const fallbackVariantId = variants.length > 0 ? variants[0].variant_id : `${slug}_default`;
      const resolvedVariantId = matchedVariant?.variant_id || fallbackVariantId;
      const resolvedWardrobe = matchedVariant?.clothing_and_accessories || matchedVariant?.name || charDef?.clothing_and_accessories || 'Signature attire';

      result.push({
        character: canonicalName,
        wardrobe: resolvedWardrobe,
        variant_id: resolvedVariantId,
      });
    }

    return result;
  }

  public flattenAndEnrichShots(
    rawScenes: any[],
    context: { characters?: CharacterSeriesEntity[]; locations?: LocationAsset[]; props?: PropAsset[] } = {}
  ): ScriptShot[] {
    if (!Array.isArray(rawScenes) || rawScenes.length === 0) return [];
    const localCharacters = context.characters || [];
    const localLocations = context.locations || [];
    const localProps = context.props || [];

    const shots: ScriptShot[] = [];
    let globalIdx = 1;

    const hasNested = rawScenes.some((s: any) => Array.isArray(s.shots) && s.shots.length > 0);

    if (hasNested) {
      rawScenes.forEach((sc: any, scIdx: number) => {
        const scNum = sc.scene_number || sc.sceneNumber || scIdx + 1;
        const scHeading = sc.heading || `INT. SCENE ${scNum} - NIGHT`;
        const scLoc = sc.location || sc.location_name || '';
        const scTime = sc.time_of_day || sc.timeOfDay || '';
        const scLighting = sc.lighting_mood || sc.lightingMood || '';
        const scCore = sc.scene_core || sc.sceneCore || '';
        const scConflict = sc.conflict_escalation || sc.conflictEscalation || '';
        const scCliffhanger = sc.cliffhanger_hook || sc.cliffhangerHook || '';
        const scContext = sc.scene_context || sc.sceneContext || '';
        const scPropsDetail = sc.prop_details || sc.propDetails || '';

        (Array.isArray(sc.shots) ? sc.shots : []).forEach((sh: any, shIdx: number) => {
          const dur = Math.min(Math.max(Number(sh.duration_seconds || sh.durationSeconds) || 6, 4), 8);
          const rawProps = Array.isArray(sh.props) ? sh.props : [];
          const rawDialogue = (Array.isArray(sh.dialogue)
            ? sh.dialogue
            : (sh.dialogue?.speaker && sh.dialogue?.text ? [sh.dialogue] : (sh.dialogue?.character && sh.dialogue?.line ? [sh.dialogue] : []))).slice(0, 1);
          const rawCostumes = Array.isArray(sh.character_costumes || sh.characterCostumes) ? (sh.character_costumes || sh.characterCostumes) : [];
          const charNames = Array.from(new Set([
            ...rawCostumes.map((c: any) => c.character),
            ...rawDialogue.map((d: any) => d.character || d.speaker),
            ...(Array.isArray(sh.reference_assets?.characters || sh.referenceAssets?.characters) ? (sh.reference_assets?.characters || sh.referenceAssets?.characters) : []),
          ])).filter(Boolean) as string[];

          const charCostumes = this.normalizeCharacterCostumes(rawCostumes, charNames, scNum, localCharacters);
          const shotProps = Array.from(new Set([
            ...rawProps,
            ...(Array.isArray(sh.reference_assets?.props || sh.referenceAssets?.props) ? (sh.reference_assets?.props || sh.referenceAssets?.props) : []),
          ])).filter(Boolean) as string[];
          const frameDesc = sh.frame_description || sh.frameDescription || sh.action || '';

          const audioMeta = this.buildWordLevelCaptionsForShot(rawDialogue, dur, localCharacters);
          const endFramePrompt = sh.end_frame_prompt || sh.endFramePrompt || '';
          const videoEffect = sh.video_effect || sh.videoEffect || (scLighting.toLowerCase().includes('candle') || scLighting.toLowerCase().includes('moody') ? 'vignette' : 'glowFilter');
          const resolvedAssets = this.resolveAssetIds(charNames, [scLoc], shotProps, localCharacters, localLocations, localProps);

          shots.push({
            id: sh.id || `scene_${nanoid(8)}`,
            index: globalIdx++,
            scene_number: scNum,
            shot_number: sh.shot_number || sh.shotNumber || shIdx + 1,
            title: sh.title || `Shot ${shIdx + 1}`,
            heading: scHeading,
            location: scLoc,
            time_of_day: scTime,
            lighting_mood: scLighting,
            description: frameDesc,
            scene_context: sh.scene_context || sh.sceneContext || scContext,
            prop_details: sh.prop_details || sh.propDetails || scPropsDetail || (shotProps.length ? shotProps.join(', ') : ''),
            frame_description: frameDesc,
            camera_movement: sh.camera_movement || sh.cameraMovement || 'Slow push-in',
            action: sh.action || '',
            character_costumes: charCostumes,
            dialogue: rawDialogue,
            duration_seconds: dur,
            bgm_mood: sh.bgm_mood || sh.bgmMood || sc.bgm_mood || sc.bgmMood || 'Atmospheric suspense',
            sfx_cues: Array.isArray(sh.sfx_cues || sh.sfxCues) ? (sh.sfx_cues || sh.sfxCues) : [],
            reference_assets: { characters: resolvedAssets.character_ids, locations: resolvedAssets.location_ids, props: resolvedAssets.prop_ids },
            visual_prompt: sh.visual_prompt || sh.visualPrompt || this.buildVisualPrompt(frameDesc, scLoc, charNames, charCostumes, shotProps, localLocations, localCharacters, localProps, audioMeta.speechTimingPrompt),
            end_frame_prompt: endFramePrompt,
            transition_effect: (sh.transition_effect || sh.transitionEffect || 'fade') as any,
            effects: sh.effects || [],
            voice_start_us: audioMeta.voice_start_us,
            voice_duration_us: audioMeta.voice_duration_us,
            captions_data: audioMeta.captions_data,
            words: audioMeta.words,
            video_effect: videoEffect,
            image_url: sh.image_url || sh.imageUrl || sh.storyboard_frame_url || sh.storyboardFrameUrl,
            storyboard_frame_url: sh.storyboard_frame_url || sh.storyboardFrameUrl || sh.image_url || sh.imageUrl,
            storyboard_end_frame_url: sh.storyboard_end_frame_url || sh.storyboardEndFrameUrl,
            video_url: sh.video_url || sh.videoUrl,
            voiceover_url: sh.voiceover_url || sh.voiceoverUrl,
            bgm_url: sh.bgm_url || sh.bgmUrl,
            status: sh.status || (sh.video_url || sh.videoUrl ? 'video_ready' : ((sh.storyboard_frame_url || sh.storyboardFrameUrl || sh.image_url) ? 'image_ready' : 'draft')),
          });
        });
      });
    } else {
      // Flat scenes
      const perSceneShotCounter: Record<number, number> = {};
      rawScenes.forEach((s: any, idx: number) => {
        const dur = Math.min(Math.max(Number(s.duration_seconds || s.durationSeconds) || 6, 4), 8);
        const rawDialogue = (Array.isArray(s.dialogue)
          ? s.dialogue
          : (s.dialogue?.speaker && s.dialogue?.text ? [s.dialogue] : (s.dialogue?.character && s.dialogue?.line ? [s.dialogue] : []))).slice(0, 1);

        const scLoc = s.location || s.location_name || (localLocations[0]?.name || 'Interior Setting');
        const rawCostumes = Array.isArray(s.character_costumes || s.characterCostumes) ? (s.character_costumes || s.characterCostumes) : [];
        const rawProps = Array.isArray(s.props) ? s.props : [];
        const charNames = Array.from(new Set([
          ...rawCostumes.map((c: any) => c.character),
          ...rawDialogue.map((d: any) => d.character || d.speaker),
          ...(Array.isArray(s.reference_assets?.characters || s.referenceAssets?.characters) ? (s.reference_assets?.characters || s.referenceAssets?.characters) : []),
        ])).filter(Boolean) as string[];
        const sceneNum = s.scene_number || s.sceneNumber || 1;
        if (!perSceneShotCounter[sceneNum]) perSceneShotCounter[sceneNum] = 0;
        perSceneShotCounter[sceneNum]++;
        const localShotNum = s.shot_number || s.shotNumber || perSceneShotCounter[sceneNum];
        const charCostumes = this.normalizeCharacterCostumes(rawCostumes, charNames, sceneNum, localCharacters);
        const shotProps = Array.from(new Set([
          ...rawProps,
          ...(Array.isArray(s.reference_assets?.props || s.referenceAssets?.props) ? (s.reference_assets?.props || s.referenceAssets?.props) : []),
        ])).filter(Boolean) as string[];
        const frameDesc = s.frame_description || s.frameDescription || s.action || '';

        const audioMeta = this.buildWordLevelCaptionsForShot(rawDialogue, dur, localCharacters);
        const endFramePrompt = s.end_frame_prompt || s.endFramePrompt || '';
        const videoEffect = s.video_effect || s.videoEffect || '';
        const resolvedAssets = this.resolveAssetIds(charNames, [scLoc], shotProps, localCharacters, localLocations, localProps);

        shots.push({
          id: s.id || `scene_${nanoid(8)}`,
          index: s.index || globalIdx++,
          scene_number: sceneNum,
          shot_number: localShotNum,
          title: s.title || `Shot ${localShotNum}`,
          heading: s.heading || `INT. SCENE ${sceneNum} - NIGHT`,
          location: scLoc,
          time_of_day: s.time_of_day || s.timeOfDay || 'NIGHT',
          lighting_mood: s.lighting_mood || s.lightingMood || 'Cinematic lighting',
          description: frameDesc,
          scene_context: s.scene_context || s.sceneContext || '',
          prop_details: s.prop_details || s.propDetails || (shotProps.length ? shotProps.join(', ') : ''),
          frame_description: frameDesc,
          camera_movement: s.camera_movement || s.cameraMovement || 'Slow push-in',
          action: s.action || '',
          character_costumes: charCostumes,
          dialogue: rawDialogue,
          duration_seconds: dur,
          bgm_mood: s.bgm_mood || s.bgmMood || 'Atmospheric suspense',
          sfx_cues: Array.isArray(s.sfx_cues || s.sfxCues) ? (s.sfx_cues || s.sfxCues) : [],
          reference_assets: { characters: resolvedAssets.character_ids, locations: resolvedAssets.location_ids, props: resolvedAssets.prop_ids },
          visual_prompt: s.visual_prompt || s.visualPrompt || this.buildVisualPrompt(frameDesc, scLoc, charNames, charCostumes, shotProps, localLocations, localCharacters, localProps, audioMeta.speechTimingPrompt),
          end_frame_prompt: endFramePrompt,
          transition_effect: (s.transition_effect || s.transitionEffect || 'fade') as any,
          effects: s.effects || [],
          voice_start_us: audioMeta.voice_start_us,
          voice_duration_us: audioMeta.voice_duration_us,
          captions_data: audioMeta.captions_data,
          words: audioMeta.words,
          video_effect: videoEffect,
          image_url: s.image_url || s.imageUrl || s.storyboard_frame_url || s.storyboardFrameUrl,
          storyboard_frame_url: s.storyboard_frame_url || s.storyboardFrameUrl || s.image_url || s.imageUrl,
          storyboard_end_frame_url: s.storyboard_end_frame_url || s.storyboardEndFrameUrl,
          video_url: s.video_url || s.videoUrl,
          voiceover_url: s.voiceover_url || s.voiceoverUrl,
          bgm_url: s.bgm_url || s.bgmUrl,
          status: s.status || (s.video_url || s.videoUrl ? 'video_ready' : ((s.storyboard_frame_url || s.storyboardFrameUrl || s.image_url) ? 'image_ready' : 'draft')),
        });
      });
    }

    return shots;
  }

  // ── 5. SCREENPLAY FORMATTING ─────────────────────────────────────────────

  public assembleMarkdownScreenplay(shots: ScriptShot[], title?: string): string {
    let currentHeading = '';
    let markdownScreenplay = title ? `# ${title.toUpperCase()}\n\n` : '';
    markdownScreenplay += shots.map((s) => {
      let prefix = '';
      if (s.heading && s.heading !== currentHeading) {
        currentHeading = s.heading;
        prefix = `### ${s.heading.toUpperCase()}\n\n`;
      }
      let sText = prefix + s.action;
      if (s.dialogue && s.dialogue.length > 0) {
        const dlgText = s.dialogue.map((d: any) => {
          const tone = d.speechTone || d.emotion ? `_(${d.speechTone || d.emotion})_\n` : '';
          return `**${(d.character || 'CHARACTER').toUpperCase()}**\n${tone}${d.line}`;
        }).join('\n\n');
        sText += `\n\n${dlgText}`;
      }
      return sText;
    }).join('\n\n') + '\n\n##### FADE TO BLACK:';
    return markdownScreenplay;
  }

  // ── 6. PUBLIC WORKFLOW: EXECUTE (NEW SCRIPT GENERATION) ─────────────────

  async execute(input: ScriptAgentInput): Promise<ScriptItem | null> {
    const epNum = input.episode_number || 1;
    const epStr = `EP ${String(epNum).padStart(2, '0')}`;
    const epTitle = input.title || `${epStr}: The Turning Point`;
    const genre = input.genre || 'Suspense / Drama';
    const visual_style = input.visual_style || 'realistic';
    const visual_style_prompt = input.visual_style_prompt || getVisualStylePrompt(visual_style);
    const country = input.country || 'US';
    const language = input.language || input.country || 'en-US';
    const ratio = input.ratio || '9:16';
    const langInfo = getLanguageForCountry(language);

    const tiers = this.calculateDurationTiers(input.target_duration_seconds);
    const { targetDuration, minShots, maxShots, minScenes, maxScenes } = tiers;

    const skillVars = {
      languageInstruction: langInfo.dialogueInstruction,
      targetDuration,
      minShots,
      maxShots,
      minScenes,
      maxScenes,
    };

    Logger.info(
      `[ScriptAgent] Generating screenplay for "${epTitle}" (${epStr}, target ${targetDuration}s, ` +
      `~${minShots}-${maxShots} shots across ${minScenes}-${maxScenes} scenes) in ${langInfo.name}...`
    );

    const charactersList = this.formatCharactersContext(input.characters || []);

    const prompt = PromptLoader.render('screenplay/script_scene_writer', {
      epStr,
      epNum,
      epTitle,
      genre,
      visualStyle: visual_style,
      visualStylePrompt: visual_style_prompt,
      country,
      languageName: langInfo.name,
      languageNativeName: langInfo.nativeName,
      languageCode: langInfo.code,
      languageInstruction: langInfo.dialogueInstruction,
      ratio,
      targetDurationSeconds: targetDuration,
      minShots: minShots,
      maxShots: maxShots,
      minScenes: minScenes,
      maxScenes: maxScenes,
      synopsis: input.synopsis,
      sceneCore: input.scene_core,
      conflictEscalation: input.conflict_escalation,
      cliffhangerHook: input.cliffhanger_hook,
      charactersList: charactersList,
      coreAttraction: input.story_core?.core_attraction,
      goldFingerRule: input.story_core?.gold_finger_rule,
    });

    const buildSystemInstruction = (): string =>
      renderSkill('screenplay_system', skillVars);

    try {
      // 1. Generate full screenplay text using Gemini
      const rawText = await geminiClient.generateText({
        prompt,
        systemInstruction: buildSystemInstruction(),
        jsonMode: true,
      });

      let generatedScreenplay = '';
      let parsedJson: any = null;
      try {
        parsedJson = JSON.parse(rawText);
        generatedScreenplay = parsedJson.screenplay || '';
      } catch {
        generatedScreenplay = rawText;
      }

      if (parsedJson?.scenes && Array.isArray(parsedJson.scenes) && parsedJson.scenes.length > 0) {
        const rawChars = Array.isArray(parsedJson.characters) && parsedJson.characters.length > 0
          ? parsedJson.characters
          : (input.characters || []);
        const rawLocs = Array.isArray(parsedJson.locations) && parsedJson.locations.length > 0
          ? parsedJson.locations
          : (input.locations || []);
        const rawProps = Array.isArray(parsedJson.props) && parsedJson.props.length > 0
          ? parsedJson.props
          : (input.props || []);

        const characters = this.normalizeCharacters(rawChars, input.characters || []);
        const locations = this.normalizeLocations(rawLocs, input.locations || []);
        const props = this.normalizeProps(rawProps, input.props || []);

        const shots = this.flattenAndEnrichShots(parsedJson.scenes, {
          characters,
          locations,
          props,
        });

        const screenplay = parsedJson.screenplay || this.assembleMarkdownScreenplay(shots, epTitle);
        const totalDuration = shots.reduce((sum: number, s: any) => sum + (s.duration_seconds || s.durationSeconds || 6), 0);

        return {
          episode: epStr,
          episode_number: epNum,
          title: parsedJson?.title || epTitle,
          synopsis: parsedJson?.synopsis || input.synopsis || '',
          screenplay,
          scene_core: parsedJson?.scene_core || parsedJson?.sceneCore || input.scene_core,
          conflict_escalation: parsedJson?.conflict_escalation || parsedJson?.conflictEscalation || input.conflict_escalation,
          cliffhanger_hook: parsedJson?.cliffhanger_hook || parsedJson?.cliffhangerHook || input.cliffhanger_hook,
          total_duration_seconds: totalDuration,
          scenes: shots,
          characters,
          locations,
          props,
        };
      }

      // 2. Delegate raw screenplay text to analyzeAndBreakdownScreenplay if scenes were not provided
      const breakdown = await this.analyzeAndBreakdownScreenplay({
        screenplay: generatedScreenplay,
        country,
        language: langInfo.code,
        targetDurationSeconds: targetDuration,
        existingCharacters: input.characters || [],
        existingLocations: input.locations || [],
        existingProps: input.props || [],
      });

      return {
        episode: epStr,
        episode_number: epNum,
        title: parsedJson?.title || epTitle,
        synopsis: parsedJson?.synopsis || input.synopsis || '',
        screenplay: breakdown.screenplay,
        scene_core: parsedJson?.scene_core || parsedJson?.sceneCore || input.scene_core,
        conflict_escalation: parsedJson?.conflict_escalation || parsedJson?.conflictEscalation || input.conflict_escalation,
        cliffhanger_hook: parsedJson?.cliffhanger_hook || parsedJson?.cliffhangerHook || input.cliffhanger_hook,
        total_duration_seconds: breakdown.total_duration_seconds,
        scenes: breakdown.scenes,
        characters: breakdown.characters,
        locations: breakdown.locations,
        props: breakdown.props,
      };
    } catch (e: any) {
      Logger.warn(`[ScriptAgent] AI Screenplay generation failed (${e.message})`);
      throw new Error(`[ScriptAgent] AI Screenplay generation failed: ${e.message}`);
    }
  }

  // ── 7. SCREENPLAY EXTRACTION & DESCRIPTION API METHODS ──────────────────

  public async extractAssets(screenplay: string, countryOrLanguage?: string): Promise<{
    characters: string[];
    locations: string[];
    props: string[];
  }> {
    const langInfo = getLanguageForCountry(countryOrLanguage);
    const prompt = PromptLoader.render('screenplay/extract_assets', {
      screenplay,
      languageInstruction: langInfo.dialogueInstruction,
    });
    const skill = loadSkill('asset_extractor');

    try {
      const response = await aiProviderRouter.generateJSON<{
        characters?: string[];
        locations?: string[];
        props?: string[];
      }>(prompt, { characters: [], locations: [], props: [] }, skill ? { systemInstruction: `${skill}\n${langInfo.dialogueInstruction}` } : { systemInstruction: langInfo.dialogueInstruction });

      return {
        characters: Array.isArray(response?.characters) ? response.characters : [],
        locations: Array.isArray(response?.locations) ? response.locations : [],
        props: Array.isArray(response?.props) ? response.props : [],
      };
    } catch (err: any) {
      Logger.error(`[ScriptAgent.extractAssets] Extraction failed: ${err.message}`);
      return { characters: [], locations: [], props: [] };
    }
  }

  public async describeCharacters(
    screenplay: string,
    characterNames: string[],
    countryOrLanguage?: string
  ): Promise<Record<string, { physical_characteristics: string; clothing_and_accessories: string; backstory: string; wardrobe_variants?: any[] }>> {
    const langInfo = getLanguageForCountry(countryOrLanguage);
    const result: Record<string, { physical_characteristics: string; clothing_and_accessories: string; backstory: string; wardrobe_variants?: any[] }> = {};

    await Promise.all(
      characterNames.map(async (name) => {
        const prompt = PromptLoader.render('screenplay/describe_character', {
          characterName: name,
          screenplay,
          languageInstruction: langInfo.dialogueInstruction,
        });
        const skill = loadSkill('character_writer');

        try {
          const res = await aiProviderRouter.generateJSON<{
            physical_characteristics?: string;
            physicalCharacteristics?: string;
            clothing_and_accessories?: string;
            clothingAndAccessories?: string;
            backstory?: string;
            wardrobe_variants?: any[];
            wardrobeVariants?: any[];
          }>(
            prompt,
            { physical_characteristics: '', clothing_and_accessories: '', backstory: '', wardrobe_variants: [] },
            skill ? { systemInstruction: `${skill}\n${langInfo.dialogueInstruction}` } : { systemInstruction: langInfo.dialogueInstruction }
          );

          const rawVariants: any[] = Array.isArray(res?.wardrobe_variants)
            ? res.wardrobe_variants
            : (Array.isArray(res?.wardrobeVariants) ? res.wardrobeVariants : []);
          const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');
          const cleanVariants = rawVariants.map((v: any, vi: number) => ({
            variant_id: v.variant_id || v.variantId || `${slug}_variant_${vi + 1}`,
            name: v.name || `Outfit ${vi + 1}`,
            clothing_and_accessories: v.clothing_and_accessories || v.clothingAndAccessories || res?.clothing_and_accessories || res?.clothingAndAccessories || '',
            associated_scenes: Array.isArray(v.associated_scenes || v.associatedScenes) ? (v.associated_scenes || v.associatedScenes) : [],
          }));

          result[name] = {
            physical_characteristics: res?.physical_characteristics || res?.physicalCharacteristics || '',
            clothing_and_accessories: res?.clothing_and_accessories || res?.clothingAndAccessories || '',
            backstory: res?.backstory || '',
            wardrobe_variants: cleanVariants,
          };
        } catch (err: any) {
          Logger.error(`[ScriptAgent.describeCharacters] Failed for ${name}: ${err.message}`);
          result[name] = { physical_characteristics: '', clothing_and_accessories: '', backstory: '', wardrobe_variants: [] };
        }
      })
    );

    return result;
  }

  public async describeLocations(
    screenplay: string,
    locationNames: string[],
    countryOrLanguage?: string
  ): Promise<Record<string, { physical_characteristics: string; time_of_day: string }>> {
    const langInfo = getLanguageForCountry(countryOrLanguage);
    const result: Record<string, { physical_characteristics: string; time_of_day: string }> = {};

    await Promise.all(
      locationNames.map(async (name) => {
        const prompt = PromptLoader.render('screenplay/describe_location', {
          locationName: name,
          screenplay,
          languageInstruction: langInfo.dialogueInstruction,
        });
        const skill = loadSkill('location_writer');

        try {
          const res = await aiProviderRouter.generateJSON<{
            physical_characteristics?: string;
            physicalCharacteristics?: string;
            time_of_day?: string;
            timeOfDay?: string;
          }>(
            prompt,
            { physical_characteristics: '', time_of_day: 'DAY' },
            skill ? { systemInstruction: `${skill}\n${langInfo.dialogueInstruction}` } : { systemInstruction: langInfo.dialogueInstruction }
          );

          result[name] = {
            physical_characteristics: res?.physical_characteristics || res?.physicalCharacteristics || '',
            time_of_day: res?.time_of_day || res?.timeOfDay || 'DAY',
          };
        } catch (err: any) {
          Logger.error(`[ScriptAgent.describeLocations] Failed for ${name}: ${err.message}`);
          result[name] = { physical_characteristics: '', time_of_day: 'DAY' };
        }
      })
    );

    return result;
  }

  public async describeProps(
    screenplay: string,
    propNames: string[],
    countryOrLanguage?: string
  ): Promise<Record<string, { physical_characteristics: string }>> {
    const langInfo = getLanguageForCountry(countryOrLanguage);
    const result: Record<string, { physical_characteristics: string }> = {};

    await Promise.all(
      propNames.map(async (name) => {
        const prompt = PromptLoader.render('screenplay/describe_prop', {
          propName: name,
          screenplay,
          languageInstruction: langInfo.dialogueInstruction,
        });
        const skill = loadSkill('prop_writer');

        try {
          const res = await aiProviderRouter.generateJSON<{ physical_characteristics?: string; physicalCharacteristics?: string }>(
            prompt,
            { physical_characteristics: '' },
            skill ? { systemInstruction: `${skill}\n${langInfo.dialogueInstruction}` } : { systemInstruction: langInfo.dialogueInstruction }
          );

          result[name] = {
            physical_characteristics: res?.physical_characteristics || res?.physicalCharacteristics || '',
          };
        } catch (err: any) {
          Logger.error(`[ScriptAgent.describeProps] Failed for ${name}: ${err.message}`);
          result[name] = { physical_characteristics: '' };
        }
      })
    );

    return result;
  }

  public async breakdownSceneToShots(
    sceneTitle: string,
    sceneContent: string,
    availableAssets: Array<{ id: string; name: string; type: 'character' | 'location' | 'prop' }>,
    countryOrLanguage?: string
  ): Promise<ShotFrame[]> {
    const langInfo = getLanguageForCountry(countryOrLanguage);
    const assetsFormatted = availableAssets
      .map(a => `- ${a.name} (${a.type}) [id:${a.id}]`)
      .join('\n');

    const prompt = PromptLoader.render('storyboard/breakdown_shots', {
      sceneTitle,
      sceneContent,
      availableAssets: assetsFormatted,
      languageInstruction: langInfo.dialogueInstruction,
    });
    const skill = loadSkill('storyboard_breakdown');

    try {
      const response = await aiProviderRouter.generateJSON<{ frames: any[] }>(
        prompt,
        { frames: [] },
        skill ? { systemInstruction: `${skill}\n${langInfo.dialogueInstruction}` } : { systemInstruction: langInfo.dialogueInstruction }
      );

      const frames = response?.frames || [];
      return frames.map((f: any, idx: number): ShotFrame => ({
        id: `shot_${nanoid(8)}`,
        index: idx + 1,
        title: f.title || `Shot ${idx + 1}`,
        frame_visual: f.frame_visual || f.frameVisual || '',
        frame_audio: f.frame_audio || f.frameAudio || '',
        frame_motion: f.frame_motion || f.frameMotion || '',
        dialogue: f.dialogue?.speaker && f.dialogue?.text ? f.dialogue : undefined,
        duration_seconds: Math.min(Math.max(Number(f.duration_seconds || f.durationSeconds) || 5, 3), 8),
        linked_asset_ids: Array.isArray(f.linked_asset_ids || f.linkedAssetIds) ? (f.linked_asset_ids || f.linkedAssetIds) : [],
        status: 'draft',
      }));
    } catch (err: any) {
      Logger.error(`[ScriptAgent.breakdownSceneToShots] Error: ${err.message}`);
      return [];
    }
  }

  // ── 8. PUBLIC WORKFLOW: ANALYZE AND BREAKDOWN EXISTING SCREENPLAY ─────────

  public async analyzeAndBreakdownScreenplay(params: {
    screenplay: string;
    country?: string;
    language?: string;
    targetDurationSeconds?: number;
    existingCharacters?: CharacterSeriesEntity[];
    existingLocations?: LocationAsset[];
    existingProps?: PropAsset[];
    existingScenes?: any[];
  }): Promise<{
    screenplay: string;
    characters: CharacterSeriesEntity[];
    locations: LocationAsset[];
    props: PropAsset[];
    scenes: SceneEntity[];
    total_duration_seconds: number;
  }> {
    const {
      screenplay,
      country,
      language,
      existingCharacters = [],
      existingLocations = [],
      existingProps = [],
      existingScenes = [],
    } = params;
    const langInfo = getLanguageForCountry(language || country || 'en-US');

    const tiers = this.calculateDurationTiers(params.targetDurationSeconds);
    const { targetDuration, minShots, maxShots } = tiers;

    Logger.info(`[ScriptAgent.analyzeAndBreakdownScreenplay] Analyzing screenplay (${screenplay.length} chars, target ${targetDuration}s, ~${minShots}-${maxShots} shots) in language ${langInfo.name}...`);

    // 1. Extract asset names
    const assetNames = await this.extractAssets(screenplay, langInfo.code);

    // 2. Generate descriptions in target language in parallel
    const [charDescriptions, locDescriptions, propDescriptions] = await Promise.all([
      assetNames.characters.length > 0 ? this.describeCharacters(screenplay, assetNames.characters, langInfo.code) : {},
      assetNames.locations.length > 0 ? this.describeLocations(screenplay, assetNames.locations, langInfo.code) : {},
      assetNames.props.length > 0 ? this.describeProps(screenplay, assetNames.props, langInfo.code) : {},
    ]);

    // 3. Normalize all assets preserving existing IDs and customizations
    const characters = this.normalizeCharacters(assetNames.characters, existingCharacters, charDescriptions);
    const locations = this.normalizeLocations(assetNames.locations, existingLocations, locDescriptions);
    const props = this.normalizeProps(assetNames.props, existingProps, propDescriptions);

    // 4. Detect scene headings from screenplay to enforce 100% full scene coverage
    const headingMatches = Array.from(
      screenplay.matchAll(/(?:^|\n)#{1,4}\s*([^\n]+)/gi)
    ).map(m => m[1].trim()).filter(h =>
      !h.toUpperCase().startsWith('EP') &&
      !h.toUpperCase().includes('FADE TO BLACK') &&
      (h.toUpperCase().includes('INT.') || h.toUpperCase().includes('EXT.') || h.toUpperCase().includes('SCENE') || h.toUpperCase().includes('CẢNH'))
    );

    const detectedScenesList = headingMatches.length > 0
      ? headingMatches.map((h, i) => `Scene ${i + 1}: ${h}`).join('\n')
      : '';

    const existingScenesSummary = Array.isArray(existingScenes) && existingScenes.length > 0
      ? existingScenes.map((s, idx) => {
          const dlg = Array.isArray(s.dialogue) ? s.dialogue.map((d: any) => `${d.character || d.speaker || 'Character'}: "${d.line || d.text || ''}"`).join(', ') : '';
          const endFrame = s.end_frame_prompt || s.endFramePrompt || '';
          const frameDesc = s.frame_description || s.frameDescription || s.description || '';
          const ctx = s.scene_context || s.sceneContext || '';
          return `Scene #${s.index || (idx + 1)} - Title: "${s.title || ''}" | Heading: "${s.heading || ''}" | Context: "${ctx}" | Frame: "${frameDesc}" | End Frame: "${endFrame}" | Dialogue: [${dlg}]`;
        }).join('\n')
      : '';

    // 5. Breakdown screenplay into sequential timed shots adhering to target duration & all scenes
    const breakdownPrompt = PromptLoader.render('screenplay/breakdown_screenplay', {
      screenplay,
      country: country || 'US',
      languageName: langInfo.name,
      languageNativeName: langInfo.nativeName,
      languageCode: langInfo.code,
      languageInstruction: langInfo.dialogueInstruction,
      targetDuration,
      minShots,
      maxShots,
      existingScenesSummary,
      detectedScenesList,
      charactersList: this.formatCharactersContext(characters) || 'None specified',
      locationsList: this.formatLocationsContext(locations) || 'None specified',
      propsList: this.formatPropsContext(props) || 'None specified',
    });

    const breakdownSkill = loadSkill('storyboard_breakdown');

    let parsedShots: ScriptShot[] = [];
    try {
      const breakdownRes = await aiProviderRouter.generateJSON<{ scenes: any[] }>(
        breakdownPrompt,
        { scenes: [] },
        breakdownSkill
          ? { systemInstruction: `${breakdownSkill}\n${langInfo.dialogueInstruction}\nTarget Duration: ${targetDuration}s (Must generate ${minShots}-${maxShots} shots covering ALL scenes)` }
          : { systemInstruction: `${langInfo.dialogueInstruction}\nTarget Duration: ${targetDuration}s (Must cover ALL scenes)` }
      );

      const rawScenes = Array.isArray(breakdownRes?.scenes) ? breakdownRes.scenes : [];
      parsedShots = this.flattenAndEnrichShots(rawScenes, {
        characters,
        locations,
        props,
      });

      // LLM Iterative Expansion: If shots are below minShots, feed previous draft back into LLM to enrich and expand scenes authentically
      let iteration = 0;
      const retry = 1;
      while (parsedShots.length < minShots && iteration < retry) {
        iteration++;
        Logger.warn(`[ScriptAgent.analyzeAndBreakdownScreenplay] Generated ${parsedShots.length} shots (need ≥ ${minShots}). Prompting LLM to enrich and expand existing breakdown (Attempt ${iteration})...`);
        try {
          const prevJson = rawScenes.map((scene: SceneEntity, idx: number) => {
            return {
              scene_number: scene.index ?? idx + 1,
              title: scene.title,
              heading: scene.heading,
              description: scene.description,
              dialogue: scene.dialogue,
              end_frame_prompt: scene.end_frame_prompt,
              frame_description: scene.frame_description,
              action: scene.action
            };
          });
          const enrichPrompt = PromptLoader.render('screenplay/breakdown_screenplay_expand', {
            currentShotsCount: parsedShots.length,
            targetDuration,
            minShots,
            maxShots,
            previousDraftJson: JSON.stringify(prevJson, null, 2),
            screenplay,
            charactersList: this.formatCharactersContext(characters) || 'None specified',
            locationsList: this.formatLocationsContext(locations) || 'None specified',
            propsList: this.formatPropsContext(props) || 'None specified',
            languageInstruction: langInfo.dialogueInstruction,
          });

          const rawRetry = await aiProviderRouter.generateJSON<{ scenes: any[] }>(
            enrichPrompt,
            { scenes: [] },
            breakdownSkill
              ? { systemInstruction: `${breakdownSkill}\n${langInfo.dialogueInstruction}\nCRITICAL: Must generate ${minShots}-${maxShots} shots.` }
              : { systemInstruction: `${langInfo.dialogueInstruction}\nCRITICAL: Must generate ${minShots}-${maxShots} shots.` }
          );
          if (rawRetry && Array.isArray(rawRetry.scenes) && rawRetry.scenes.length > 0) {
            const retryShots = this.flattenAndEnrichShots(rawRetry.scenes, { characters, locations, props });
            if (retryShots.length > parsedShots.length) {
              Logger.info(`[ScriptAgent.analyzeAndBreakdownScreenplay] LLM expansion produced ${retryShots.length} shots (was ${parsedShots.length}).`);
              parsedShots = retryShots;
            }
          }
        } catch (retryErr: any) {
          Logger.warn(`[ScriptAgent.analyzeAndBreakdownScreenplay] Retry ${iteration} failed: ${retryErr.message}`);
        }
      }
    } catch (e: any) {
      Logger.error(`[ScriptAgent.analyzeAndBreakdownScreenplay] Breakdown error: ${e.message}`);
    }

    const totalDuration = parsedShots.reduce((sum: number, s: any) => sum + (s.duration_seconds || s.durationSeconds || 6), 0);

    return {
      screenplay,
      characters,
      locations,
      props,
      scenes: parsedShots,
      total_duration_seconds: totalDuration,
    };
  }
}

export const scriptAgent = new ScriptAgent();
