import { z } from 'zod';
import { Logger } from '@/utils/logger.js';

// ─── 1. Core Asset Schemas ──────────────────────────────────────────────────

export const AssetVersionSchema = z.object({
  id: z.string(),
  image_url: z.string(),
  prompt: z.string().optional(),
  negative_prompt: z.string().optional(),
  created_at: z.string(),
  is_selected: z.boolean().optional(),
  aspect_ratio: z.string().optional(),
  model: z.string().optional(),
});

export const CharacterWardrobeVariantSchema = z.object({
  variant_id: z.string().min(1, 'Wardrobe variant_id is required'),
  name: z.string().min(1, 'Wardrobe variant name is required'),
  clothing_and_accessories: z.string().min(1, 'Wardrobe clothing_and_accessories is required'),
  image_url: z.string().optional().nullable(),
  prompt: z.string().optional(),
  versions: z.array(AssetVersionSchema).optional().default([]),
  associated_scenes: z.array(z.number()).optional().default([]),
});

export const CharacterSeriesEntitySchema = z.object({
  id: z.string().min(1, 'Character id is required'),
  series_id: z.string().optional(),
  name: z.string().min(1, 'Character name is required'),
  role: z.string().min(1, 'Character role is required'),
  age: z.number().or(z.string().transform(v => Number(v) || 24)),
  gender: z.string().min(1, 'Character gender is required'),
  nationality: z.string().min(1, 'Character nationality is required'),
  voice_id: z.string().min(1, 'Character voice_id is required'),
  identity: z.string().min(1, 'Character identity is required'),
  traits: z.string().min(1, 'Character traits are required'),
  visual_traits: z.string().min(1, 'Character visual traits are required'),
  physical_characteristics: z.string().min(1, 'Character physical characteristics are required'),
  appearance: z.string().min(1, 'Character appearance is required'),
  clothing_and_accessories: z.string().min(1, 'Character clothing and accessories are required'),
  frame_description: z.string().optional().default(''),
  wardrobe_variants: z.array(CharacterWardrobeVariantSchema).optional().default([]),
  circumstance: z.string().optional().default(''),
  action: z.string().optional().default(''),
  ending: z.string().optional().default(''),
  speech_style: z.string().min(1, 'Character speech style is required'),
  description: z.string().min(1, 'Character description is required'),
  empathy_elements: z.string().optional().default(''),
  avatar: z.string().optional().nullable(),
  image_url: z.string().optional().nullable(),
  prompt: z.string().optional(),
  versions: z.array(AssetVersionSchema).optional().default([]),
  lora_model: z.string().optional().nullable(),
  created_at: z.string().optional(),
});

export const LocationAssetSchema = z.object({
  id: z.string().min(1, 'Location id is required'),
  series_id: z.string().optional(),
  name: z.string().min(1, 'Location name is required'),
  physical_characteristics: z.string().min(1, 'Location physical_characteristics is required'),
  time_of_day: z.string().optional().default('DAY'),
  image_url: z.string().optional().nullable(),
  prompt: z.string().optional(),
  versions: z.array(AssetVersionSchema).optional().default([]),
  frame_description: z.string().optional(),
});

export const PropAssetSchema = z.object({
  id: z.string().min(1, 'Prop id is required'),
  series_id: z.string().optional(),
  name: z.string().min(1, 'Prop name is required'),
  physical_characteristics: z.string().min(1, 'Prop physical_characteristics is required'),
  image_url: z.string().optional().nullable(),
  prompt: z.string().optional(),
  versions: z.array(AssetVersionSchema).optional().default([]),
  frame_description: z.string().optional(),
  owner: z.string().optional(),
  status: z.string().optional(),
});

// ─── 2. Scene & Dialogue Schemas ────────────────────────────────────────────

export const SceneDialogueSchema = z.object({
  character: z.string().min(1, 'Dialogue character is required'),
  line: z.string().min(1, 'Dialogue line is required'),
  speech_tone: z.string().optional().default(''),
  emotion: z.string().optional().default('neutral'),
  speed: z.number().optional().default(1.0),
  speech_start_sec: z.number().optional().default(0),
  speech_duration_sec: z.number().optional().default(0),
  voice_id: z.string().optional().default(''),
});

export const SceneCaptionWordLevelSchema = z.object({
  word: z.string().min(1, 'Word is required'),
  start_ms: z.number().min(0, 'start_ms must be non-negative'),
  end_ms: z.number().min(0, 'end_ms must be non-negative'),
  speaker: z.string().optional().default(''),
});

export const SceneCaptionSchema = z.object({
  start_time: z.number().min(0, 'start_time must be non-negative'),
  end_time: z.number().min(0, 'end_time must be non-negative'),
  text: z.string().min(1, 'Caption text is required'),
  speaker: z.string().optional().default(''),
  words: z.array(SceneCaptionWordLevelSchema).optional().default([]),
});

export const CharacterSceneCostumesSchema = z.object({
  character: z.string().min(1, 'Character name is required in costumes'),
  wardrobe: z.string().min(1, 'Wardrobe description is required in costumes'),
  variant_id: z.string().min(1, 'variant_id is required in costumes'),
  character_id: z.string().optional().default(''),
});

export const SceneReferenceAssetsSchema = z.object({
  characters: z.array(z.string()).default([]),
  locations: z.array(z.string()).default([]),
  props: z.array(z.string()).default([]),
});

export const SceneEntitySchema = z.object({
  index: z.number().min(0),
  scene_number: z.number().min(1, 'Scene scene_number is required'),
  title: z.string().min(1, 'Scene title is required'),
  location: z.string().min(1, 'Scene location is required'),
  time_of_day: z.string().min(1, 'Scene time_of_day is required'),
  lighting_mood: z.string().min(1, 'Scene lighting_mood is required'),
  bgm_mood: z.string().optional().default(''),
  action: z.string().min(1, 'Scene action is required'),
  camera_movement: z.string().min(1, 'Scene camera_movement is required'),
  dialogue: z.array(SceneDialogueSchema).default([]),
  character_costumes: z.array(CharacterSceneCostumesSchema).default([]),
  reference_assets: SceneReferenceAssetsSchema.default({ characters: [], locations: [], props: [] }),
  visual_prompt: z.string().min(1, 'Scene visual_prompt is required'),
  end_frame_prompt: z.string().optional().default(''),
  duration_seconds: z.number().min(1, 'Scene duration_seconds must be at least 1').default(5),
  voice_start_us: z.number().optional().default(0),
  voice_duration_us: z.number().optional().default(0),
  voice_id: z.string().optional().default(''),
  captions_data: z.array(SceneCaptionSchema).optional().default([]),
  words: z.array(SceneCaptionWordLevelSchema).optional().default([]),
  speech_timing_prompt: z.string().optional().default(''),
  status: z.string().optional().default('draft'),
  storyboard_frame_url: z.string().optional().nullable(),
  storyboard_end_frame_url: z.string().optional().nullable(),
  video_url: z.string().optional().nullable(),
  voiceover_url: z.string().optional().nullable(),
  bgm_url: z.string().optional().nullable(),
  transition_effect: z.string().optional().default('none'),
  video_effect: z.string().optional().default('none'),
  image_gen_prompt: z.string().optional(),
  video_gen_prompt: z.string().optional(),
});

// ─── 3. Episode & Plan Schemas ──────────────────────────────────────────────

export const StoryCoreSchema = z.object({
  core_attraction: z.string().min(1, 'core_attraction is required'),
  psychological_pleasure: z.string().min(1, 'psychological_pleasure is required'),
  gold_finger_rule: z.string().min(1, 'gold_finger_rule is required'),
});

export const ActStructureSchema = z.object({
  act_number: z.number().min(1),
  name: z.string().min(1, 'Act name is required'),
  episode_range: z.string().min(1, 'episode_range is required'),
  function: z.string().min(1, 'Act function is required'),
  core_question: z.string().min(1, 'Act core_question is required'),
  act_climax: z.string().min(1, 'Act act_climax is required'),
});

export const MajorReversalSchema = z.object({
  reversal_index: z.number().min(1),
  episode_number: z.number().min(1),
  setup_hook: z.string().min(1, 'setup_hook is required'),
  reversal_event: z.string().min(1, 'reversal_event is required'),
  audience_impact: z.string().min(1, 'audience_impact is required'),
});

export const PaywallHookSchema = z.object({
  percentage: z.string().min(1, 'percentage is required'),
  episode_number: z.number().min(1, 'episode_number is required'),
  type: z.string().min(1, 'Paywall hook type is required'),
  hook_description: z.string().min(1, 'hook_description is required'),
  ad_hook_30s_prompt: z.string().optional().default(''),
});

export const EpisodeSkeletonSchema = z.object({
  episode_number: z.number().min(1, 'episode_number is required'),
  title: z.string().min(1, 'Episode title is required'),
  synopsis: z.string().min(1, 'Episode synopsis is required'),
  scene_core: z.string().optional().default(''),
  conflict_escalation: z.string().optional().default(''),
  cliffhanger_hook: z.string().min(1, 'Episode cliffhanger_hook is required'),
  phase: z.string().optional().default(''),
  scene_count: z.number().optional().default(3),
  duration_seconds: z.number().optional().default(60),
});

export const MasterPlanSchema = z.object({
  series_id: z.string().optional().default(''),
  title: z.string().min(1, 'Series title is required'),
  genre: z.string().min(1, 'Series genre is required'),
  visual_style: z.string().min(1, 'Visual style is required'),
  visual_style_prompt: z.string().optional().default(''),
  country: z.string().min(1, 'Country is required'),
  ratio: z.string().optional().default('9:16'),
  total_episodes: z.number().min(1, 'Total episodes must be at least 1'),
  total_duration_seconds: z.number().optional().default(60),
  story_core: StoryCoreSchema,
  synopsis: z.string().min(1, 'Synopsis is required'),
  hidden_line: z.string().min(1, 'hidden_line is required'),
  target_audience: z.string().min(1, 'target_audience is required'),
  viral_hook: z.string().min(1, 'viral_hook is required'),
  estimated_retention: z.string().optional().default('85%'),
  characters: z.array(CharacterSeriesEntitySchema).min(1, 'At least 1 character is required'),
  locations: z.array(LocationAssetSchema).optional().default([]),
  props: z.array(PropAssetSchema).optional().default([]),
  three_acts: z.array(ActStructureSchema).min(3, 'Master plan must contain exactly 3 acts (Act 1, Act 2, Act 3)'),
  major_reversals: z.array(MajorReversalSchema).optional().default([]),
  paywall_hooks: z.array(PaywallHookSchema).min(3, 'Master plan must contain at least 3 strategic paywall hooks'),
  episodes: z.array(EpisodeSkeletonSchema).min(1, 'Master plan must contain episode blueprints'),
});

export const ScriptItemSchema = z.object({
  episode: z.string().optional().default(''),
  episode_number: z.number().min(1, 'Episode episode_number is required'),
  title: z.string().min(1, 'Episode title is required'),
  synopsis: z.string().min(1, 'Episode synopsis is required'),
  screenplay: z.string().optional().default(''),
  scene_core: z.string().optional().default(''),
  conflict_escalation: z.string().optional().default(''),
  cliffhanger_hook: z.string().min(1, 'Episode cliffhanger_hook is required'),
  total_duration_seconds: z.number().min(1).default(60),
  scenes: z.array(SceneEntitySchema).min(1, 'At least 1 scene is required in episode script'),
  characters: z.array(CharacterSeriesEntitySchema).optional().default([]),
  locations: z.array(LocationAssetSchema).optional().default([]),
  props: z.array(PropAssetSchema).optional().default([]),
});

// ─── 4. Validation Helper ───────────────────────────────────────────────────

export function validateAiJson<T>(
  raw: unknown,
  schema: z.ZodType<T>,
  contextName = 'AI Response'
): T {
  let dataToValidate = raw;

  if (typeof raw === 'string') {
    let clean = raw.trim();
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
    }
    try {
      dataToValidate = JSON.parse(clean);
    } catch (parseError: any) {
      Logger.error(`[ZodValidation] Failed to parse JSON string for ${contextName}: ${parseError.message}`);
      throw new Error(`Invalid JSON format in ${contextName}: ${parseError.message}`);
    }
  }

  const result = schema.safeParse(dataToValidate);
  if (!result.success) {
    const errorDetails = result.error.errors
      .map(e => `• ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    Logger.error(`[ZodValidation] Schema validation failed for ${contextName}:\n${errorDetails}`);
    throw new Error(`AI output validation failed for ${contextName}:\n${errorDetails}`);
  }

  return result.data;
}
