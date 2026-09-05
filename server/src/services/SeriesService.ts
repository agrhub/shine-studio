import { getDatabaseProvider } from '@/database/index.js';
import { scriptAgent } from '@/agents/ScriptAgent.js';
import { GEMINI_SUPPORTED_VOICES } from '@/integrations/ai/gemini/GeminiClient.js';
import { Logger } from '@/utils/logger.js';
import { nanoid } from 'nanoid';
import { normalizeSceneEntity } from '@/utils/sceneNormalizer.js';
import type {
  CharacterSeriesEntity,
  CharacterWardrobeVariant,
  CreateSeriesParams,
  SeriesEntity,
  EpisodeEntity,
  SceneEntity,
} from '@/types.js';

export class SeriesService {
  /**
   * Universal series and serialized episodes creator
   * Used by REST endpoint, AI Agent create_series tool, and CLI wizards
   */
  public static async createSeries(params: CreateSeriesParams): Promise<{ series: SeriesEntity; episodes: EpisodeEntity[] }> {
    const {
      title,
      genre,
      visual_style,
      visual_style_prompt,
      target_audience,
      episode_count,
      user_id,
      master_plan,
      synopsis,
      country,
      language,
      ratio,
      characters,
      locations,
      props,
      pre_generate_ep1,
    } = params;

    if (!user_id) {
      throw new Error('user_id is required to create a series');
    }

    if (!title || !genre) {
      throw new Error('Title and genre are required to create a series');
    }

    if(!master_plan){
      throw new Error('master_plan is required to create a series');
    }

    const resolvedMasterPlan = master_plan;
    if (!resolvedMasterPlan.title) resolvedMasterPlan.title = title;
    if (!resolvedMasterPlan.genre) resolvedMasterPlan.genre = genre;
    if (!resolvedMasterPlan.synopsis) resolvedMasterPlan.synopsis = synopsis || 'Serialized micro-drama series';

    const rawEpCount = Number(episode_count) || Number(resolvedMasterPlan?.total_episodes) || (Array.isArray(resolvedMasterPlan?.episodes) && resolvedMasterPlan.episodes.length > 0 ? resolvedMasterPlan.episodes.length : 24);
    const planEpisodes: any[] = Array.isArray(resolvedMasterPlan?.episodes) ? [...resolvedMasterPlan.episodes] : [];

    // Auto-fill missing episodes up to rawEpCount
    while (planEpisodes.length < rawEpCount) {
      // const epNum = planEpisodes.length + 1;
      // planEpisodes.push({
      //   episode_number: epNum,
      //   title: `Episode ${epNum}`,
      //   synopsis: `Plot progression and dramatic tension build-up for Episode ${epNum}.`,
      //   scene_core: `Core conflict and pacing for Episode ${epNum}.`,
      //   conflict_escalation: `Rising stakes and narrative tension.`,
      //   cliffhanger_hook: `Dramatic cliffhanger leading into Episode ${epNum + 1}.`,
      //   phase: epNum <= 3 ? 'Act 1' : epNum <= Math.floor(rawEpCount * 0.7) ? 'Act 2' : 'Act 3',
      //   scene_count: 4,
      //   duration_seconds: 90,
      // });
      throw new Error('Episodes are not defined or not enought in the master_plan, please check and try again');
    }
    resolvedMasterPlan.episodes = planEpisodes;

    const seriesId = params.id || `srs_${nanoid(10)}`;
    resolvedMasterPlan.series_id = seriesId;

    const rawCharacters = characters || master_plan?.characters || [];
    let normalizedCharacters: CharacterSeriesEntity[] = (Array.isArray(rawCharacters) ? rawCharacters : []).map((c: any, idx: number) => {
      const charId = c.id || `char_${seriesId}_${idx + 1}`;
      const charGender = (c.gender || '').toLowerCase().trim();
      const validVoices = GEMINI_SUPPORTED_VOICES.map(v => v.id);
      const isVoiceValid = c.voice_id && validVoices.includes(c.voice_id);
      let resolvedVoice = c.voice_id;
      if (!isVoiceValid) {
        if (charGender === 'female') {
          resolvedVoice = 'Kore';
        } else if (charGender === 'male') {
          resolvedVoice = 'Fenrir';
        } else {
          resolvedVoice = 'Puck';
        }
      }
      const defaultClothing = c.clothing_and_accessories || c.costume_style || c.wardrobe || 'Signature look';
      const wardrobe_variants: CharacterWardrobeVariant[] = Array.isArray(c.wardrobe_variants) && c.wardrobe_variants.length > 0
        ? c.wardrobe_variants
        : [{
            variant_id: `${charId}_default`,
            name: defaultClothing.slice(0, 40) || 'Default Outfit',
            clothing_and_accessories: defaultClothing,
          }];

      return {
        id: charId,
        series_id: seriesId,
        name: c.name,
        role: c.role || 'protagonist',
        age: Number(c.age) || 25,
        gender: c.gender || (idx === 0 ? 'male' : idx === 1 ? 'female' : 'neutral'),
        nationality: c.nationality || country || 'United States',
        voice_id: resolvedVoice,
        identity: c.identity || c.traits || '',
        traits: c.traits || '',
        visual_traits: c.visual_traits || '',
        physical_characteristics: c.physical_characteristics || c.appearance || c.visual_traits || '',
        appearance: c.appearance || c.physical_characteristics || '',
        clothing_and_accessories: defaultClothing,
        frame_description: c.frame_description || 'A character sheet with a head and shoulders shot showing the characters face on the left and a full body shot of the character on the right wearing the same clothing and accessories against a seamless white background.',
        wardrobe_variants,
        speech_style: c.speech_style || 'Sharp and concise',
        avatar: c.avatar || null,
        lora_model: c.lora_model || `lora-${(c.name || 'char').toLowerCase().replace(/\s+/g, '-')}-sdxl`,
        description: c.description || '',
      };
    });

    const rawLanguage = (language || master_plan?.language || 'en-US').trim();
    if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/i.test(rawLanguage)) {
      throw new Error(`Invalid language code "${rawLanguage}". Must be a valid BCP-47 language tag (e.g. "en-US", "vi-VN").`);
    }

    const db = await getDatabaseProvider();
    const newSeries = await db.createSeries({
      id: seriesId,
      user_id,
      title,
      genre,
      synopsis: synopsis || master_plan?.story_core?.core_attraction || master_plan?.synopsis || '',
      visual_style: visual_style || master_plan?.visual_style || 'realistic',
      visual_style_prompt: visual_style_prompt || master_plan?.visual_style_prompt || '',
      target_audience: target_audience || master_plan?.target_audience || 'General',
      country: country || master_plan?.country || 'United States',
      language: rawLanguage,
      ratio: ((ratio || master_plan?.ratio || '9:16') as "9:16" | "16:9" | "4:3" | "1:1"),
      viral_hook: master_plan?.viral_hook || '',
      master_plan: master_plan,
      characters: normalizedCharacters,
      locations: locations || master_plan?.locations || [],
      props: props || master_plan?.props || [],
      episode_count: rawEpCount,
      episode_duration: master_plan?.total_duration_seconds || 60,
      status: 'DRAFT',
    });

    Logger.info(`[SeriesService] Created Series "${title}" (ID: ${seriesId}) with all ${rawEpCount} episodes for user ${user_id}`);

    // Optional: Pre-generate full scene screenplay for Episode 1 synchronously.
    // When false (default), screenplay_writer_agent handles it via streaming chat.
    let ep1Scenes: SceneEntity[] = [];
    let ep1Screenplay: string = '';
    let ep1Duration: number = newSeries.episode_duration || 60;

    if (pre_generate_ep1) {
      try {
        const ep1 = planEpisodes[0];
        const scriptRes = await scriptAgent.execute({
          series_id: seriesId,
          episode_number: Number(ep1.episode_number) || 1,
          title: ep1.title,
          genre: newSeries.genre,
          visual_style: newSeries.visual_style,
          synopsis: ep1.synopsis,
          scene_core: ep1.scene_core,
          conflict_escalation: ep1.conflict_escalation,
          cliffhanger_hook: ep1.cliffhanger_hook,
          characters: newSeries.characters,
          locations: newSeries.locations,
          props: newSeries.props,
          story_core: master_plan?.story_core,
          country: newSeries.country,
          ratio: newSeries.ratio,
          target_duration_seconds: newSeries.episode_duration || 60,
        });

        if (scriptRes?.scenes) {
          ep1Scenes = (scriptRes.scenes || [])
            .map((s: SceneEntity, idx: number) => normalizeSceneEntity(s, idx + 1))
            .filter((s): s is SceneEntity => s !== null);
          ep1Screenplay = scriptRes.screenplay || '';
          ep1Duration = scriptRes.total_duration_seconds || ep1Duration;
          if (Array.isArray(scriptRes.characters) && scriptRes.characters.length > 0) {
            normalizedCharacters = scriptRes.characters;
            await db.updateSeries(seriesId, { characters: normalizedCharacters });
          }
        }
      } catch (e: any) {
        Logger.warn(`[SeriesService] Ep 1 script pre-generation error: ${e.message}`);
      }
    }

    const createdEpisodes: any[] = [];
    const defaultReferenceAssets = {
      character_ids: normalizedCharacters.map(c => c.id),
      location_ids: (newSeries.locations || []).map(l => l.id),
      prop_ids: (newSeries.props || []).map(p => p.id),
    };

    for (let i = 0; i < planEpisodes.length; i++) {
      const ep = planEpisodes[i];
      const epId = ep.id || `ep_${nanoid(10)}`;
      const isEp1 = i === 0 && ep1Scenes.length > 0;

      let epRefAssets = defaultReferenceAssets;
      if (isEp1) {
        const ep1CharNames = new Set<string>();
        const ep1LocNames = new Set<string>();
        const ep1PropNames = new Set<string>();
        ep1Scenes.forEach(sc => {
          (sc.reference_assets?.characters || []).forEach((c: string) => ep1CharNames.add(c.toLowerCase().trim()));
          (sc.reference_assets?.locations || []).forEach((l: string) => ep1LocNames.add(l.toLowerCase().trim()));
          (sc.reference_assets?.props || []).forEach((p: string) => ep1PropNames.add(p.toLowerCase().trim()));
        });
        const charIds = normalizedCharacters.filter(c => ep1CharNames.has(c.name.toLowerCase().trim()) || ep1CharNames.has(c.id.toLowerCase().trim())).map(c => c.id);
        const locIds = (newSeries.locations || []).filter(l => ep1LocNames.has(l.name.toLowerCase().trim()) || ep1LocNames.has(l.id.toLowerCase().trim())).map(l => l.id);
        const propIds = (newSeries.props || []).filter(p => ep1PropNames.has(p.name.toLowerCase().trim()) || ep1PropNames.has(p.id.toLowerCase().trim())).map(p => p.id);
        epRefAssets = {
          character_ids: charIds.length > 0 ? charIds : defaultReferenceAssets.character_ids,
          location_ids: locIds.length > 0 ? locIds : defaultReferenceAssets.location_ids,
          prop_ids: propIds,
        };
      }

      const episodeEntity = await db.createEpisode({
        id: epId,
        series_id: seriesId,
        episode_number: Number(ep.episode_number) || (i + 1),
        title: ep.title || `Episode ${i + 1}`,
        synopsis: ep.synopsis || ep.scene_core || 'Plot beat and conflict escalation.',
        screenplay: isEp1 ? ep1Screenplay : (ep.screenplay || ''),
        scene_core: ep.scene_core || '',
        conflict_escalation: ep.conflict_escalation || '',
        cliffhanger_hook: ep.cliffhanger_hook || '',
        phase: ep.phase || '',
        reference_assets: epRefAssets,
        scenes: isEp1 ? ep1Scenes : (Array.isArray(ep.scenes) ? ep.scenes.map((s: any, idx: number) => normalizeSceneEntity(s, idx + 1)) : []),
        duration: isEp1 ? ep1Duration : (Number(ep.duration) || 60),
        status: 'DRAFT',
      });
      createdEpisodes.push(episodeEntity);
    }
    Logger.info(`[SeriesService] Created ${createdEpisodes.length} serialized episodes for series ${seriesId}`);

    return { series: newSeries, episodes: createdEpisodes };
  }
}
