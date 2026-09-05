import type {
  CharacterSeriesEntity,
  CharacterWardrobeVariant,
  LocationAsset,
  PropAsset,
  SceneEntity,
  EpisodeEntity,
} from '@/types.js';
import {
  CharacterSeriesEntitySchema,
  LocationAssetSchema,
  PropAssetSchema,
  SceneEntitySchema,
} from '@/schemas/AISchemas.js';
import { nanoid } from 'nanoid';

export interface DialogueLine {
  character: string;
  line: string;
  emotion?: string;
  speech_tone?: string;
  speech_start_sec?: number;
  speech_end_sec?: number;
}

export class EntityNormalizer {
  static extractDialogueText(raw: any): string {
    if (!raw) return '';
    if (typeof raw === 'string') return raw.trim();
    if (Array.isArray(raw)) {
      return raw
        .map((item) => {
          if (!item) return '';
          if (typeof item === 'string') return item.trim();
          if (typeof item === 'object') {
            const speaker = item.character || '';
            const line = item.line || '';
            return speaker ? `${speaker}: ${line}` : line;
          }
          return String(item);
        })
        .filter(Boolean)
        .join('\n');
    }
    if (typeof raw === 'object') {
      return String(raw.line || '').trim();
    }
    return String(raw).trim();
  }

  static extractDialogueLines(raw: any, defaultSpeaker: string = 'Narrator'): DialogueLine[] {
    if (!raw) return [];
    if (Array.isArray(raw)) {
      return raw
        .map((item) => {
          if (!item) return null;
          if (typeof item === 'string') {
            const parts = item.split(/:\s*(.*)/s);
            if (parts.length > 1) {
              return {
                character: parts[0].trim(),
                line: parts[1].trim(),
              };
            }
            return { character: defaultSpeaker, line: item.trim() };
          }
          if (typeof item === 'object') {
            return {
              character: item.character || defaultSpeaker,
              line: item.line || '',
              emotion: item.emotion,
              speech_tone: item.speech_tone,
              speech_start_sec: item.speech_start_sec,
              speech_end_sec: item.speech_end_sec,
            };
          }
          return { character: defaultSpeaker, line: String(item) };
        })
        .filter((d): d is DialogueLine => Boolean(d && d.line));
    }
    return [];
  }

  static normalizeCharacter(raw: any): CharacterSeriesEntity | null {
    if (!raw || typeof raw !== 'object') return null;
    const name = (raw.name || '').trim();
    if (!name) return null;

    const wardrobeVariants: CharacterWardrobeVariant[] = Array.isArray(raw.wardrobe_variants)
      ? raw.wardrobe_variants.map((w: any, wIdx: number) => ({
          variant_id: w.variant_id || `wv_${wIdx + 1}`,
          name: w.name || `Variant ${wIdx + 1}`,
          clothing_and_accessories: w.clothing_and_accessories || '',
          image_url: w.image_url,
          prompt: w.prompt,
          versions: Array.isArray(w.versions) ? w.versions : (w.image_url ? [{ id: `v_${wIdx + 1}`, image_url: w.image_url, prompt: w.prompt, created_at: w.created_at || new Date().toISOString(), is_selected: true }] : []),
          associated_scenes: Array.isArray(w.associated_scenes) ? w.associated_scenes : [],
        }))
      : (raw.clothing_and_accessories ? [{
          variant_id: `wv_default`,
          name: raw.clothing_and_accessories.slice(0, 40),
          clothing_and_accessories: raw.clothing_and_accessories,
          prompt: raw.prompt,
          versions: [],
        }] : []);

    const charImageUrl = raw.avatar || null;
    const charVersions = Array.isArray(raw.versions) && raw.versions.length > 0
      ? raw.versions
      : (charImageUrl ? [{ id: `v_init`, image_url: charImageUrl, prompt: raw.prompt, created_at: raw.created_at || new Date().toISOString(), is_selected: true }] : []);

    const parsed = CharacterSeriesEntitySchema.safeParse({
      id: raw.id || `char_${nanoid(8)}`,
      series_id: raw.series_id || '',
      name,
      role: raw.role || 'protagonist',
      age: Number(raw.age) || 25,
      gender: raw.gender || 'neutral',
      nationality: raw.nationality || 'United States',
      voice_id: raw.voice_id || 'Fenrir',
      identity: raw.identity || '',
      traits: raw.traits || '',
      visual_traits: raw.visual_traits || '',
      physical_characteristics: raw.physical_characteristics || '',
      appearance: raw.appearance || '',
      clothing_and_accessories: raw.clothing_and_accessories || '',
      frame_description: raw.frame_description || '',
      wardrobe_variants: wardrobeVariants,
      speech_style: raw.speech_style || '',
      avatar: raw.avatar || '',
      prompt: raw.prompt,
      versions: charVersions,
      lora_model: raw.lora_model || '',
      description: raw.description || '',
      created_at: raw.created_at || new Date().toISOString(),
    });
    return parsed.success ? (parsed.data as CharacterSeriesEntity) : null;
  }

  static normalizeLocation(raw: any): LocationAsset | null {
    if (!raw || typeof raw !== 'object') return null;
    const name = (raw.name || '').trim();
    if (!name) return null;
    const locVersions = Array.isArray(raw.versions) && raw.versions.length > 0
      ? raw.versions
      : (raw.image_url ? [{ id: `v_init`, image_url: raw.image_url, prompt: raw.prompt, created_at: new Date().toISOString(), is_selected: true }] : []);

    const parsed = LocationAssetSchema.safeParse({
      id: raw.id || `loc_${nanoid(6)}`,
      series_id: raw.series_id,
      name,
      physical_characteristics: raw.physical_characteristics || '',
      time_of_day: raw.time_of_day || 'Day',
      image_url: raw.image_url,
      prompt: raw.prompt,
      versions: locVersions,
      frame_description: raw.frame_description || '',
    });
    return parsed.success ? (parsed.data as LocationAsset) : null;
  }

  static normalizeProp(raw: any): PropAsset | null {
    if (!raw || typeof raw !== 'object') return null;
    const name = (raw.name || '').trim();
    if (!name) return null;
    const propVersions = Array.isArray(raw.versions) && raw.versions.length > 0
      ? raw.versions
      : (raw.image_url ? [{ id: `v_init`, image_url: raw.image_url, prompt: raw.prompt, created_at: new Date().toISOString(), is_selected: true }] : []);

    const parsed = PropAssetSchema.safeParse({
      id: raw.id || `prop_${nanoid(6)}`,
      series_id: raw.series_id,
      name,
      owner: raw.owner || '',
      physical_characteristics: raw.physical_characteristics || '',
      image_url: raw.image_url,
      prompt: raw.prompt,
      versions: propVersions,
      frame_description: raw.frame_description || '',
    });
    return parsed.success ? (parsed.data as PropAsset) : null;
  }

  static normalizeScene(raw: any, index: number = 1): SceneEntity | null {
    if (!raw || typeof raw !== 'object') return null;
    const sceneIdx = Number(raw.index ?? raw.scene_number ?? index) || index;
    const sceneNum = Number(raw.scene_number ?? sceneIdx);
    const shotNum = Number(raw.shot_number ?? sceneIdx);

    const parsed = SceneEntitySchema.safeParse({
      id: raw.id || `scene_${nanoid(8)}`,
      index: sceneIdx,
      scene_number: sceneNum,
      shot_number: shotNum,
      title: raw.title || `Shot ${shotNum}`,
      heading: raw.heading || `SCENE ${sceneNum}`,
      location: raw.location || 'Scene Location',
      time_of_day: raw.time_of_day || 'Day',
      lighting_mood: raw.lighting_mood || 'Cinematic lighting',
      frame_description: raw.frame_description || '',
      description: raw.description || raw.frame_description || '',
      scene_context: raw.scene_context || '',
      camera_movement: raw.camera_movement || 'Static',
      action: raw.action || '',
      dialogue: Array.isArray(raw.dialogue) ? raw.dialogue : [],
      character_costumes: Array.isArray(raw.character_costumes) ? raw.character_costumes : [],
      prop_details: raw.prop_details || '',
      reference_assets: raw.reference_assets || { characters: [], locations: [], props: [] },
      visual_prompt: raw.visual_prompt || '',
      end_frame_prompt: raw.end_frame_prompt || '',
      transition_effect: raw.transition_effect || 'cut',
      effects: Array.isArray(raw.effects) ? raw.effects : [],
      video_effect: raw.video_effect || '',
      duration_seconds: Number(raw.duration_seconds) || 6,
      image_url: raw.image_url || raw.storyboard_frame_url || null,
      storyboard_frame_url: raw.storyboard_frame_url || raw.image_url || null,
      storyboard_end_frame_url: raw.storyboard_end_frame_url || null,
      video_url: raw.video_url || null,
      voiceover_url: raw.voiceover_url || null,
      bgm_url: raw.bgm_url || null,
      bgm_mood: raw.bgm_mood || '',
      sfx_cues: Array.isArray(raw.sfx_cues) ? raw.sfx_cues : [],
      voice_start_us: raw.voice_start_us ?? 0,
      voice_duration_us: raw.voice_duration_us ?? 0,
      captions_data: Array.isArray(raw.captions_data) ? raw.captions_data : [],
      words: Array.isArray(raw.words) ? raw.words : [],
      translations: raw.translations || {},
      status: raw.status || (raw.video_url ? 'video_ready' : (raw.image_url || raw.storyboard_frame_url ? 'image_ready' : 'draft')),
    });
    return parsed.success ? (parsed.data as unknown as SceneEntity) : null;
  }

  static normalizeEpisode(raw: any, index: number = 1): Partial<EpisodeEntity> {
    if (!raw) return {};
    const rawScenes = Array.isArray(raw.scenes) ? raw.scenes : [];
    const scenes = rawScenes.map((s: any, idx: number) => this.normalizeScene(s, idx + 1)).filter((s): s is SceneEntity => s !== null);
    const scenesTotalDuration = scenes.reduce((sum: number, sc: any) => sum + (Number(sc.duration_seconds) || 0), 0);
    const resolvedDuration = scenesTotalDuration > 0
      ? scenesTotalDuration
      : (Number(raw.duration_seconds) || Number(raw.duration) || 60);

    return {
      id: raw.id || `ep_${index}`,
      series_id: raw.series_id || '',
      episode_number: Number(raw.episode_number) || index,
      title: raw.title || `Episode ${index}`,
      synopsis: raw.synopsis || '',
      scene_core: raw.scene_core || '',
      conflict_escalation: raw.conflict_escalation || '',
      cliffhanger_hook: raw.cliffhanger_hook || '',
      phase: raw.phase || '',
      duration: resolvedDuration,
      duration_seconds: resolvedDuration,
      reference_assets: raw.reference_assets || { character_ids: [], location_ids: [], prop_ids: [] },
      scenes,
      cover_image: raw.cover_image || '',
      video_url: raw.video_url || '',
      video_urls: raw.video_urls || {},
      dubbing_languages: Array.isArray(raw.dubbing_languages)
        ? raw.dubbing_languages.filter((l: any): l is string => typeof l === 'string' && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/i.test(l.trim()))
        : [],
      caption_languages: Array.isArray(raw.caption_languages)
        ? raw.caption_languages.filter((l: any): l is string => typeof l === 'string' && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/i.test(l.trim()))
        : [],
      status: raw.status || 'draft',
    };
  }
}
