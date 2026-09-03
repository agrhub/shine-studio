export interface ApiResponse<T = any> {
  code: number;
  data: T;
  message: string;
  error: string | null;
}

export interface ViralTopic {
  id: string;
  topic: string;
  hash_tag: string;
  category: string;
  region: string;
  virality_score: number;
  retention_estimate: number;
  description: string;
}

export interface CharacterWardrobeVariant {
  variant_id: string;
  name: string;
  clothing_and_accessories: string;
  image_url?: string;
  associated_scenes?: number[];
}

/**
 * Series-level Master Character Entity (Single Source of Truth)
 */
export interface Character {
  id: string;
  series_id?: string;
  name: string;
  role: 'protagonist' | 'antagonist' | 'supporting' | 'supporter' | 'lead' | 'extra' | string;
  age: number;
  gender: string;
  nationality: string;
  voice_id: string;
  identity?: string;
  traits?: string;
  visual_traits?: string;
  physical_characteristics?: string;
  appearance?: string;
  clothing_and_accessories?: string;
  speech_style?: string;
  avatar?: string | null;//Portrail image of the character 9:16
  image_url?: string;//A character sheet with a head and shoulders shot showing the characters face on the left and a full body shot of the character on the right wearing the same clothing and accessories against a seamless white background.
  lora_model?: string;
  description?: string;
  frame_description?: string;//A character sheet with a head and shoulders shot showing the characters face on the left and a full body shot of the character on the right wearing the same clothing and accessories against a seamless white background.
  wardrobe_variants?: CharacterWardrobeVariant[];
  created_at?: string;
}

export interface LocationAsset {
  id: string;
  name: string;
  physical_characteristics: string;
  time_of_day: string;
  image_url?: string;
  status: 'draft' | 'ready';
  created_at?: string;
}

export interface PropAsset {
  id: string;
  name: string;
  physical_characteristics: string;
  image_url?: string;
  status: 'draft' | 'ready';
  created_at?: string;
}

export interface ShotFrame {
  id: string;
  index: number;
  title: string;
  frame_visual: string;
  frame_audio?: string;
  frame_motion?: string;
  dialogue?: {
    speaker: string;
    text: string;
    tone?: string;
  };
  duration_seconds: number;
  linked_asset_ids: string[];
  image_url?: string;
  video_url?: string;
  status: 'draft' | 'image_ready' | 'video_ready';
  video_effect?: string;
}

export interface SceneLine {
  id: string;
  speaker: string;
  dialogue: string;
  emotion: string;
  camera_movement: string;
  pacing: string;
}

export interface CaptionsData {
  [key: string]: any;
  start_ms: number; 
  end_ms: number; 
  text: string;
}

export interface ReferenceAssets {
  characters?: string[];
  locations?: string[];
  props?: string[];
}

export interface CharacterCostumes {
  character: string;
  wardrobe: string;
  variant_id?: string;
}

export interface SceneDialogue {
  character: string;
  emotion?: string;
  line: string;
  speech_tone?: string;
  speed?: number;
}

export interface Scene {
  id: string;
  scene_number?: number;
  index: number;
  heading?: string;
  title?: string;
  location?: string;
  location_id?: string;
  location_name?: string;
  time_of_day?: string;
  atmosphere?: string;
  description?: string;
  action?: string;
  lines?: SceneLine[];
  storyboard_frame_url?: string;
  storyboard_end_frame_url?: string;
  video_url?: string;
  voiceover_url?: string;
  bgm_url?: string;
  dialogue?: SceneDialogue[];
  characters?: Character[] | string[];
  props?: string[];
  end_frame_prompt?: string;
  scene_context?: string;
  prop_details?: string;
  transition_effect?: string;
  video_effect?: string;

  shot_number?: number;
  lighting_mood?: string;
  frame_description?: string;
  camera_movement?: string;
  character_costumes?: CharacterCostumes[];
  duration_seconds: number;
  bgm_mood?: string;
  sfx_cues?: string[];
  reference_assets?: ReferenceAssets;
  visual_prompt?: string;
  voice_duration_us?: number;
  voice_start_us?: number;
  captions_data?: CaptionsData[];
  words?: any[];
  translations?: Record<string, SceneTranslation>;
}

// export interface Scene {
//   index: number;
//   scene_number?: number;
//   shot_number?: number;
//   title?: string;
//   heading: string;
//   location: string;
//   time_of_day: string;
//   lighting_mood?: string;
//   frame_description?: string;
//   camera_movement?: string;
//   action: string;
//   character_costumes?: Array<{
//     character: string;
//     wardrobe: string;
//     variant_id?: string;
//   }>;
//   props?: string[];
//   dialogue: Array<{
//     character: string;
//     line: string;
//     emotion?: string;
//     speech_tone?: string;
//   }>;
//   duration_seconds: number;
//   bgm_mood?: string;
//   sfx_cues?: string[];
//   reference_assets?: {
//     characters?: string[];
//     locations?: string[];
//     props?: string[];
//   };
//   visual_prompt?: string;
//   storyboard_frame_url?: string;
//   video_url?: string;
//   voiceover_url?: string;
//   bgm_url?: string;
//   voice_duration_us?: number;
//   voice_start_us?: number;
//   captions_data?: Array<{ startMs: number; endMs: number; text: string; [key: string]: any }>;
//   words?: any[];
//   translations?: Record<string, SceneTranslation>;
// }

export interface SceneTranslation {
  dialogue?: string;
  translated_dialogue?: string;
  voiceover_url?: string;
  voice_duration_us?: number;
  voice_duration_ms?: number;
  captions_data?: any[];
  words?: any[];
}

// export interface Episode {
//   episode: string;
//   episode_number: number;
//   title: string;
//   synopsis?: string;
//   screenplay?: string;
//   scene_core?: string;
//   conflict_escalation?: string;
//   cliffhanger_hook?: string;
//   total_duration_seconds?: number;
//   scenes: ScriptScene[];
//   characters?: any[];
//   locations?: any[];
//   props?: any[];
// }

export interface CaptionCue {
  id?: string;
  text: string;
  start_ms: number;
  end_ms: number;
  from_us?: number;
  to_us?: number;
  duration_us?: number;
  duration_ms?: number;
  words?: Array<{ text: string; from: number; to: number; isKeyWord?: boolean }>;
  timing?: {
    display: { from: number, to: number },
    trim: { from: number, to: number },
  }
}

export interface LanguageTrack {
  language_code: string;  // e.g. 'vi-VN', 'en-US', 'zh-CN'
  language_label: string; // e.g. 'Tiếng Việt', 'English', '中文'
  voice_id?: string;      // Gemini voice ID for this language
  scene_voiceovers: Record<number, string>;      // sceneIndex -> audioUrl
  scene_captions: Record<number, CaptionCue[]>;  // sceneIndex -> cues
  scene_dialogues?: Record<number, string>;      // sceneIndex -> translated dialogue text
}

export interface RenderVersionEntity {
  id?: string;
  version_id?: string;
  episode_id?: string;
  episode_number?: number;
  episode_title?: string;
  language: string;
  languages?: string[];
  voice?: string;
  subtitles?: string[];
  resolution?: string;
  video_url?: string;
  url?: string;
  thumbnail_url?: string;
  duration?: number;
  file_size?: string;
  rendered_at?: string;
  status?: 'ready' | 'draft' | 'rendering' | 'failed' | string;
}

export interface DubbingSettings {
  voice_name?: string;
  voice_id?: string;
  speed?: number;
  languages?: string[];
  primary_language?: string;
  enable_dubbing?: boolean;
  auto_ducking?: boolean;
  voice_preset?: string;
  voice_intensity?: number;
  voice_pacing?: number;
  // [key: string]: any;
}

export interface CaptionSettings {
  languages?: string[];
  burn_in?: boolean;
  enable_caption?: boolean;
  caption_style?: 'pop' | 'minimal' | 'comic' | 'neon' | 'karaoke';
  font_family?: string;
  font_size?: number;
  font_url?: string;
  text_color?: string;
  word_highlight_color?: string;
  outline_color?: string;
  outline_weight?: number;
  vertical_pos?: number;
  vertical_align?: 'top' | 'center' | 'bottom';
  text_align?: 'left' | 'center' | 'right';
  words_per_line?: 'multiple' | 'single';
  text_case?: 'none' | 'uppercase' | 'lowercase';
  enable_background_box?: boolean;
  bg_color?: string;
  highlight_animate?: boolean;
}
  // [key: string]: any;
export interface EpisodePublishedPlatform {
  platform: 'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'twitter' | string;
  language?: string;
  channel_id?: string;
  channel_name?: string;
  account_id?: string;
  url: string;
  video_id?: string;
  published_at: string;
  views?: number;
  likes?: number;
  comments_count?: number;
  shares?: number;
}

export interface Episode {
  id: string;
  number: number;
  episode_number?: number;
  title: string;
  synopsis?: string;
  screenplay?: string;
  script?: string;
  scene_core?: string;
  conflict_escalation?: string;
  cliffhanger_hook?: string;
  duration?: string; // duration in minute string
  duration_seconds?: number;
  scenes_count: string;
  status: string;
  scenes?: Scene[];
  cover_image?: string;
  thumbnail_url?: string;
  dubbing_settings?: DubbingSettings;
  caption_settings?: CaptionSettings;
  caption_languages?: string[];
  dubbing_languages?: string[];
  characters?: Character[] | string[];
  locations?: LocationAsset[] | string[];
  props?: PropAsset[] | string[];
  video_url?: string;
  video_urls?: Record<string, string>;
  render_versions?: RenderVersionEntity[];
  published_urls?: Record<string, string>;
  published_platforms?: EpisodePublishedPlatform[];
  created_at?: string;
  updated_at?: string;
}

export interface PublishMetadataResponse {
  titles: string[];
  selected_title?: string;
  description: string;
  hashtags: string[];
}

export interface PublishResultPayload {
  type: 'publish' | 'schedule';
  data?: unknown;
  platforms: string[];
  published_urls?: Record<string, string>;
  scheduled_time?: string;
}

export interface Series {
  id: string;
  title: string;
  genre: string;
  synopsis?: string;
  visual_style?: string;
  visual_style_prompt?: string;
  target_audience?: string;
  country?: string;
  language?: string;
  ratio?: string;
  cover_image?: string;
  viral_hook?: string;
  master_plan?: any;
  characters?: Character[];
  locations?: any[];
  props?: any[];
  episode_count: number;
  published_episode_count?: number;
  episodes_count?: number;
  total_episodes?: number;
  episode_duration?: number;
  target_duration_seconds?: number;
  status: 'DRAFT' | 'ACTIVE' | 'PUBLISHED' | 'ARCHIVED';
  created_at?: string;
  updated_at?: string;
}

export interface ScriptItem {
  series_id: string;
  episode_number: number;
  title: string;
  hook?: string;
  cliffhanger?: string;
  screenplay?: string;
  scenes: Scene[];
  locations?: LocationAsset[];
  props?: PropAsset[];
  status: 'draft' | 'in_progress' | 'done';
}

export interface SupervisionResult {
  passed: boolean;
  score: number;
  suggestions: string[];
  safety_verified: boolean;
  consistency_score: number;
}

export interface StoryboardFrame {
  id: string;
  scene_id: string;
  frame_index: number;
  duration_seconds: number;
  prompt: string;
  image_url?: string;
}

export interface SeriesOutline {
  series_id: string;
  title: string;
  genre: string;
  visual_style?: string;
  visual_style_prompt?: string;
  total_episodes: number;
  synopsis: string;
  episodes: Array<{
    episode_number: number;
    title: string;
    hook: string;
    cliffhanger: string;
  }>;
}

export interface CompositorPayload {
  series_id: string;
  episode_id: string;
  tracks: Array<{
    id: string;
    type: 'video' | 'audio' | 'subtitle';
    clips: Array<{
      id: string;
      start_time: number;
      duration: number;
      asset_url: string;
    }>;
  }>;
}

export interface RenderJob {
  job_id: string;
  series_id: string;
  episode_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  output_url: string | null;
  error?: string | null;
}

export interface RenderStatusResponse {
  job_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  output_url: string | null;
  error: string | null;
}

export interface ParityCheckResult {
  ssim: number;
  passed: boolean;
  diff_image_url?: string;
}

export interface TtsRequest {
  text: string;
  voice_Id: string;
  emotion_tag: string;
  intensity_level: number;
  pitch?: number;
  pacing?: number;
}

export interface WordTiming {
  word: string;
  start_time_ms: number;
  end_time_ms: number;
}

export interface TtsResponse {
  audio_url: string;
  duration_ms: number;
  word_timings: WordTiming[];
}

export interface KaraokeStyle {
  preset: 'pop' | 'bounce' | 'fade' | 'slide';
  emoji_sentiment: boolean;
  bass_sync: boolean;
  text_color?: string;
  font_size_px?: number;
  vertical_pos_pct?: number;
  outline_weight_px?: number;
  auto_highlight?: boolean;
  language?: string;
}

export interface SpatialAudioConfig {
  track_pans: Record<string, number>;
  reverb_profile: 'studio' | 'penthouse' | 'hall' | 'outdoor';
  auto_ducking: boolean;
}

export interface CliffhangerJob {
  transition_type: 'glitch' | 'flash';
  zoom_keyframe: boolean;
  stinger_wav_url: string;
  cta_text: string;
  progress?: number;
  status?: 'queued' | 'processing' | 'completed';
}

export interface Command {
  type: string;
  target_module: string;
  payload: any;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  commands?: Command[];
  attachments?: string[];
}

export interface CopilotAlert {
  id: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  canvas_position: { x: number; y: number };
  code?: string;
  suggested_action?: string;
}

export interface CostGuardrails {
  max_budget_usd: number;
  current_spend_usd: number;
  low_res_proxy_mode: boolean;
}

export interface PatchEvent {
  user_id: string;
  session_id: string;
  series_id: string;
  commands: Command[];
  timestamp: number;
}

export interface CollaboratorSession {
  user_id: string;
  name: string;
  avatar_url?: string;
  color?: string;
  joined_at: number;
}

export interface PublishJob {
  id: string;
  series_id: string;
  episode_id: string;
  platforms: ('tiktok' | 'youtube' | 'instagram' | 'facebook' | 'douyin')[];
  status: 'queued' | 'publishing' | 'success' | 'failed';
  published_urls: Record<string, string>;
  caption?: string;
  hashtags?: string[];
  cover_url?: string;
  created_at: string;
}

export interface SubscriptionTier {
  tier: 'free' | 'creator' | 'studio' | 'enterprise';
  credit_balance: number;
  credit_quota: number;
  features: string[];
  monthly_price_usd: number;
}

export interface MarketplaceTemplate {
  id: string;
  title: string;
  genre: string;
  description: string;
  preview_url: string;
  price: number;
  author: string;
  rating: number;
  downloads_count: number;
}

export interface VirtualActor {
  id: string;
  name: string;
  gender: string;
  style: string;
  thumbnail_url: string;
  sample_video_url: string;
  daily_rate_usd: number;
  rating: number;
  languages: string[];
}

export interface PaywallRecommendation {
  episode_id: string;
  episode_number: number;
  suggested_paywall_type: 'coins' | 'subscription' | 'ad_unlock';
  confidence_score: number;
  predicted_retention_rate: number;
  reasoning: string;
}

export type StepStatus = 'idle' | 'running' | 'done' | 'error';

export interface PipelineStep {
  id: string;
  label: string;
  icon: string;
  status: StepStatus;
}

export interface SceneRenderStatus {
  scene_index: number;
  bg_status: StepStatus;
  end_frame_status?: StepStatus;
  video_status: StepStatus;
  voiceover_status: StepStatus;
  bgm_status: StepStatus;
  caption_status: StepStatus;
  storyboard_url?: string;
  end_frame_url?: string;
  video_url?: string;
  voiceover_url?: string;
  bgm_url?: string;
}

export interface VoicePreset {
  id: string;
  name: string;
  gender: 'male' | 'female' | 'neutral' | string;
  language?: string;
  description?: string;
  audio_sample_url?: string;
}

export interface SocialConnection {
  _id?: string;
  platform: 'youtube' | 'tiktok' | 'facebook';
  channel_dd: string;
  channel_name: string;
  isActive: boolean;
}

export interface PlatformComment {
  id: string;
  platform: string;
  author: string;
  author_avatar?: string;
  text: string;
  likes: number;
  timestamp: string;
  reply_count?: number;
}

export interface SentimentAnalysisResult {
  sentiment: string;
  positive_ratio: number;
  top_reaction_tropes: string[];
  audience_complaints: string[];
  script_suggestions: string[];
  retention_forecast: number;
}

export interface Asset {
  id: string;
  user_id?: string;
  name: string;
  type: 'image' | 'video' | 'audio' | 'text' | 'render';
  ext: string;
  size: string;
  size_bytes?: number;
  category_label: string;
  category_color: string;
  thumbnail?: string;
  icon?: string;
  aspect?: string;
  is_video?: boolean;
  is_audio?: boolean;
  created_at?: string;
}

export interface PlatformAccount {
  id: string; 
  provider: "youtube" | "facebook" | "tiktok" | "instagram" | "threads"; 
  channel_id: string; 
  channel_name: string; 
  channel_avatar?: string; 
  handle?: string;
  access_token?: string;
  refresh_token?: string;
  connected_at: string; 
  status: string;
  expires_at?: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatar: string;
  role?: string;
  tier?: string;
  credits?: number;
  theme?: 'dark' | 'light' | string;
  language?: string;
  two_factor_enabled?: boolean;
  connected_channels?: PlatformAccount[];
}


export type DownloadStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface DownloadItem {
  id: string;
  type: 'export';
  name: string;
  status: DownloadStatus;
  progress: number;
  format: string;
  size?: number;
  created_at: number;
  completed_at?: number;
  url?: string;
  thumbnail_url?: string;
  downloaded?: boolean;
  error?: string;
}

export interface GeneratedAsset {
  id: string;
  url: string;
  text: string;
  type: 'voiceover' | 'sfx' | 'music';
  created_at: number;
}

export type ActiveTab = 'uploads' | 'pexels' | 'text' | 'audio' | 'elements' | 'assistant' | 'captions' | 'assets' | 'images' | 'videos' | 'music' | 'effects' | 'voiceovers' | 'sfx' | 'transitions';
export type EditorMode = 'editor' | 'agent' | 'playground';

export interface AssetJobItem {
  id: string;
  name: string;
  type: 'character' | 'wardrobe' | 'location' | 'prop' | 'storyboard' | 'video' | 'voice' | 'subtitle' | 'render' | 'bgm' | 'sfx' | string;
  status: 'pending' | 'completed' | 'failed';
  url?: string;
  thumbnail?: string;
  scene_index?: number;
  shot_number?: number;
  metadata?: Record<string, any>;
  created_at?: string;
}

export interface PipelineJobStepProgress {
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  progress: number;
  message?: string;
  started_at?: string;
  completed_at?: string;
  assets?: AssetJobItem[];
}

export interface PipelineJobEntity {
  id: string;
  user_id: string;
  series_id: string;
  episode_id: string;
  session_id?: string;
  type: 'full_pipeline' | 'step_b1' | 'step_b2' | 'step_b3' | 'step_b4' | 'step_b5' | 'step_b6' | 'render' | string;
  title: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  current_step: string;
  step_progress?: Record<string, PipelineJobStepProgress>;
  outputs?: Record<string, any>;
  logs: Array<{ timestamp: string; level: 'info' | 'warn' | 'error'; message: string }>;
  error?: string | null;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}







