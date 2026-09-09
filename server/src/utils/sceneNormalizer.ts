import { nanoid } from 'nanoid';
import type { SceneEntity, LocationAsset, PropAsset, CharacterSeriesEntity, SceneCaptionData, SceneCaptionWord, SceneReferenceAssets, CharacterSceneCostumes, CharacterWardrobeVariant } from '../types.js';

export function normalizeSceneEntity(s: any, idx?: number): SceneEntity | null {
  if (!s || typeof s !== 'object') {
    return null;
  }

  const sceneIdx = Number(s.index ?? s.scene_number ?? idx ?? 1);
  const sceneNum = Number(s.scene_number ?? sceneIdx);
  const shotNum = Number(s.shot_number ?? sceneIdx);
  const heading = s.heading || `INT. SCENE ${sceneNum}`;
  const location = s.location || '';
  const timeOfDay = s.time_of_day || '';
  const lightingMood = s.lighting_mood || '';
  const frameDescription = s.frame_description || s.action || '';
  const cameraMovement = s.camera_movement || '';
  const action = s.action || '';
  const durationSeconds = Number(s.duration_seconds) || 6;
  const bgmMood = s.bgm_mood || '';
  const sfxCues = Array.isArray(s.sfx_cues) ? s.sfx_cues : [];
  const visualPrompt = s.visual_prompt || '';
  const endFramePrompt = s.end_frame_prompt || '';
  const sceneContext = s.scene_context || '';
  const propDetails = s.prop_details || '';
  const transitionEffect = s.transition_effect || 'cut';
  const videoEffect = s.video_effect || '';
  const storyboardFrameUrl = s.storyboard_frame_url || s.image_url || undefined;
  const storyboardEndFrameUrl = s.storyboard_end_frame_url || undefined;
  const videoUrl = s.video_url || undefined;
  const voiceoverUrl = s.voiceover_url || undefined;
  const bgmUrl = s.bgm_url || undefined;
  const voiceStartUs = Number(s.voice_start_us) || 0;
  const voiceDurationUs = Number(s.voice_duration_us) || 0;

  const captionsData: SceneCaptionData[] = Array.isArray(s.captions_data) ? s.captions_data : [];
  const words: SceneCaptionWord[] = Array.isArray(s.words) ? s.words : [];
  const characterCostumes: CharacterSceneCostumes[] = Array.isArray(s.character_costumes) ? s.character_costumes : [];
  const versions = Array.isArray(s.versions) ? s.versions : [];
  const endFrameVersions = Array.isArray(s.end_frame_versions) ? s.end_frame_versions : [];
  const videoVersions = Array.isArray(s.video_versions) ? s.video_versions : [];
  const voiceVersions = Array.isArray(s.voice_versions) ? s.voice_versions : [];
  const bgmVersions = Array.isArray(s.bgm_versions) ? s.bgm_versions : [];

  const rawRef = s.reference_assets || {};
  const referenceAssets: SceneReferenceAssets = {
    characters: Array.isArray(rawRef.characters) ? rawRef.characters : [],
    locations: Array.isArray(rawRef.locations) ? rawRef.locations : [location],
    props: Array.isArray(rawRef.props) ? rawRef.props : [],
  };

  return {
    id: s.id || `scene_${nanoid(8)}`,
    index: sceneIdx,
    scene_number: sceneNum,
    shot_number: shotNum,
    title: s.title || `Shot ${shotNum}`,
    heading,
    location,
    time_of_day: timeOfDay,
    lighting_mood: lightingMood,
    description: s.description || frameDescription,
    frame_description: frameDescription,
    prop_details: propDetails,
    camera_movement: cameraMovement,
    action,
    character_costumes: characterCostumes,
    dialogue: Array.isArray(s.dialogue) ? s.dialogue : [],
    duration_seconds: durationSeconds,
    bgm_mood: bgmMood,
    sfx_cues: sfxCues,
    reference_assets: referenceAssets,
    visual_prompt: visualPrompt,
    end_frame_prompt: endFramePrompt,
    scene_context: sceneContext,
    transition_effect: transitionEffect,
    effects: Array.isArray(s.effects) ? s.effects : [],
    video_effect: videoEffect,
    // image_url: storyboardFrameUrl,
    storyboard_frame_url: storyboardFrameUrl,
    storyboard_end_frame_url: storyboardEndFrameUrl,
    video_url: videoUrl,
    voiceover_url: voiceoverUrl,
    bgm_url: bgmUrl,
    voice_start_us: voiceStartUs,
    voice_duration_us: voiceDurationUs,
    captions_data: captionsData,
    words,
    versions,
    end_frame_versions: endFrameVersions,
    video_versions: videoVersions,
    voice_versions: voiceVersions,
    bgm_versions: bgmVersions,
    status: s.status || (videoUrl ? 'video_ready' : (storyboardFrameUrl ? 'image_ready' : 'draft')),
  };
}

export function normalizeLocationAsset(l: any, idx?: number): LocationAsset | null {
  if (!l || typeof l !== 'object') return null;
  return {
    id: l.id || `loc_${nanoid(6)}`,
    series_id: l.series_id,
    name: l.name || `Location ${idx || 1}`,
    physical_characteristics: l.physical_characteristics || '',
    time_of_day: l.time_of_day || '',
    image_url: l.image_url,
    frame_description: l.frame_description || '',
  };
}

export function normalizePropAsset(p: any, idx?: number): PropAsset | null {
  if (!p || typeof p !== 'object') return null;
  return {
    id: p.id || `prop_${nanoid(6)}`,
    series_id: p.series_id,
    name: p.name || `Prop ${idx || 1}`,
    physical_characteristics: p.physical_characteristics || '',
    image_url: p.image_url,
    frame_description: p.frame_description || '',
    owner: p.owner || '',
  };
}

export function normalizeCharacterEntity(c: any, idx?: number): CharacterSeriesEntity | null {
  if (!c || typeof c !== 'object') return null;
  const wardrobeVariants: CharacterWardrobeVariant[] = Array.isArray(c.wardrobe_variants)
    ? c.wardrobe_variants.map((v: any, vi: number) => ({
        variant_id: v.variant_id || `wv_${vi + 1}`,
        name: v.name || `Wardrobe ${vi + 1}`,
        clothing_and_accessories: v.clothing_and_accessories || '',
        image_url: v.image_url,
        associated_scenes: Array.isArray(v.associated_scenes) ? v.associated_scenes : [],
      }))
    : [];

  return {
    id: c.id || `char_${nanoid(6)}`,
    series_id: c.series_id || '',
    name: c.name || `Character ${idx || 1}`,
    role: c.role || '',
    age: Number(c.age) || 0,
    gender: c.gender || '',
    nationality: c.nationality || '',
    voice_id: c.voice_id || '',
    identity: c.identity || '',
    traits: c.traits || '',
    visual_traits: c.visual_traits || '',
    physical_characteristics: c.physical_characteristics || '',
    appearance: c.appearance || '',
    clothing_and_accessories: c.clothing_and_accessories || '',
    frame_description: c.frame_description || '',
    wardrobe_variants: wardrobeVariants,
    speech_style: c.speech_style || '',
    description: c.description || '',
  };
}
