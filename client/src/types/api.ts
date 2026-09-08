export interface ApiResponse<T = unknown> {
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

export interface AssetVersion {
  id: string;
  image_url: string;
  url?: string;
  video_url?: string;
  audio_url?: string;
  voiceover_url?: string;
  bgm_url?: string;
  prompt?: string;
  negative_prompt?: string;
  created_at?: string;
  is_selected?: boolean;
  aspect_ratio?: string;
  model?: string;
  metadata?: Record<string, unknown>;
}

export type CustomizableAssetType =
  | 'character'
  | 'wardrobe'
  | 'location'
  | 'prop'
  | 'scene_frame'
  | 'scene_video'
  | 'voiceover'
  | 'bgm'
  | 'episode_bgm';

export type CustomizableAsset =
  | Character
  | CharacterWardrobeVariant
  | LocationAsset
  | PropAsset
  | Scene
  | Episode;

export interface CustomizeAssetParams {
  series_id: string;
  episode_id?: string;
  asset_type: CustomizableAssetType;
  asset_id: string;
  variant_id?: string;
  custom_prompt: string;
  use_reference_image?: boolean;
  reference_image_url?: string;
  start_frame_url?: string;
  scene_id?: string,
  end_frame_url?: string,
  action?: string,
  scene_data?: Scene | null,
}

export interface CustomizeVideoParams {
  series_id: string;
  episode_id?: string;
  start_frame_url?: string;
  scene_id?: string,
  end_frame_url?: string,
  action?: string,
  custom_prompt: string;
  scene_data?: Scene | null,
}

export interface CustomizeAssetResult {
  image_url: string;
  prompt: string;
  version: AssetVersion;
  asset: CustomizableAsset;
}

export interface CustomizeVideoResult {
  video_url: string;
  prompt: string;
  version: AssetVersion;
  asset: CustomizableAsset;
}

export interface SelectAssetVersionParams {
  series_id: string;
  episode_id?: string;
  asset_type: CustomizableAssetType;
  asset_id: string;
  variant_id?: string;
  version_id: string;
}

export interface SelectAssetVersionResult {
  success: boolean;
  active_image_url: string;
  asset: CustomizableAsset;
}

export interface CharacterWardrobeVariant {
  variant_id: string;
  id?: string; // alias for variant_id for compatibility
  name: string;
  clothing_and_accessories: string;
  image_url?: string;
  prompt?: string;
  versions?: AssetVersion[];
  associated_scenes?: number[];
  category?: string;
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
  prompt?: string;
  versions?: AssetVersion[];
  lora_model?: string;
  description?: string;
  frame_description?: string;//A character sheet with a head and shoulders shot showing the characters face on the left and a full body shot of the character on the right wearing the same clothing and accessories against a seamless white background.
  wardrobe_variants?: CharacterWardrobeVariant[];
  created_at?: string;
}

export interface LocationAsset {
  id: string;
  series_id?: string;
  name: string;
  physical_characteristics: string;
  time_of_day?: string;
  image_url?: string;
  prompt?: string;
  versions?: AssetVersion[];
  frame_description?: string;
  status?: 'draft' | 'ready';
  created_at?: string;
}

export interface PropAsset {
  id: string;
  series_id?: string;
  name: string;
  physical_characteristics: string;
  image_url?: string;
  prompt?: string;
  versions?: AssetVersion[];
  frame_description?: string;
  owner?: string;
  status?: 'draft' | 'ready';
  created_at?: string;
}

export interface ShotFrame {
  id: string;
  index: number;
  title: string;
  frame_visual: string;
  prompt?: string;
  versions?: AssetVersion[];
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

export interface CaptionWord {
  word?: string;
  start?: number;
  end?: number;
  punctuated_word?: string;
  confidence?: number;
  score?: number;
  from?: number;
  to?: number;
  text?: string;
  isKeyWord?: boolean;
}

export interface CaptionsData {
  id?: string;
  character?: string;
  start_ms?: number; 
  end_ms?: number; 
  text: string;
  duration_ms?: number;
  duration_us?: number;
  from_us?: number;
  to_us?: number;
  words?: CaptionWord[];
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
  image_url?: string;
  storyboard_frame_url?: string;
  storyboard_end_frame_url?: string;
  prompt?: string;
  versions?: AssetVersion[];
  end_frame_versions?: AssetVersion[];
  video_versions?: AssetVersion[];
  voice_versions?: AssetVersion[];
  bgm_versions?: AssetVersion[];
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
  frame_visual?: string; // alias for frame_description or visual_prompt
  voice_duration_us?: number;
  voice_start_us?: number;
  captions_data?: CaptionsData[];
  words?: CaptionWord[];
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
  dialogue: SceneDialogue[];
  voiceover_url?: string;
  voice_duration_us?: number;
  voice_duration_ms?: number;
  voice_start_us?: number;
  captions_data: CaptionsData[];
  words: CaptionWord[];
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
  words?: CaptionWord[];
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

export interface EpisodeTopCountry {
  country: string;
  country_code: string;
  percentage: number;
}

export interface EpisodeAnalyticsSummary {
  episode_id: string;
  series_id: string;
  total_views: number;
  total_likes: number;
  total_comments: number;
  total_shares: number;
  estimated_revenue: number;
  retention_rate_pct?: number;
  top_countries: EpisodeTopCountry[];
  synced_at: string;
}

export interface EpisodeCommentItem {
  id: string;
  episode_id: string;
  platform: 'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'web' | string;
  author_name: string;
  author_avatar?: string;
  comment_text: string;
  likes: number;
  published_at: string;
  sentiment?: 'positive' | 'negative' | 'neutral' | 'mixed';
  topics?: string[];
}

export interface CharacterAudienceReaction {
  character_name: string;
  sentiment_score: number; // -100 to 100
  feedback_summary: string;
  audience_tags: string[]; // e.g. ["fan_favorite", "unjustified_villain", "boring"]
}

export interface SentimentDistribution {
  positive_pct: number;
  neutral_pct: number;
  negative_pct: number;
  dominant_emotion: string;
}

export interface PacingRetentionCritique {
  drop_off_risk_scenes: string[];
  highlight_scenes: string[];
  pacing_rating: 'too_slow' | 'balanced' | 'rushed';
  verdict: string;
}

export interface PaywallOptimizationAdvice {
  recommended_cliffhanger_type: string;
  hook_placement_second: number;
  reasoning: string;
}

export interface EpisodeAudienceInsight {
  episode_id: string;
  series_id: string;
  analyzed_at: string;
  sample_comments_count: number;
  sentiment_distribution: SentimentDistribution;
  character_reception: CharacterAudienceReaction[];
  pacing_and_retention_critique: PacingRetentionCritique;
  plot_flaws_and_questions: string[];
  audience_theories_and_desires: string[];
  recommendations_for_next_episodes: string[];
  paywall_optimization_advice?: PaywallOptimizationAdvice;
}

export interface ApplyAudienceFeedbackResult {
  success: boolean;
  targetEpisode: Episode | null;
  appliedDirectives: string[];
  message: string;
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
  bgm_url?: string;
  bgm_versions?: AssetVersion[];
  render_versions?: RenderVersionEntity[];
  published_urls?: Record<string, string>;
  published_platforms?: EpisodePublishedPlatform[];
  analytics_summary?: EpisodeAnalyticsSummary;
  audience_insight?: EpisodeAudienceInsight;
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
  master_plan?: MasterPlanOutput | Record<string, unknown>;
  characters?: Character[];
  locations?: LocationAsset[];
  props?: PropAsset[];
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

// ─── OMNI FLASH VIDEO MODEL INTERFACES ──────────────────────────────────────
export interface GeminiOmniVideoPreferences {
  aspectRatio?: '9:16' | '16:9' | '1:1' | '4:3' | '3:4';
  durationSeconds?: number; //<= 10s
  resolution?: '360p' | '480p' | '720p' | '1080p';
  generateAudio?: boolean;
  personGeneration?: 'dont_allow' | 'allow_adult';
}

export interface GeminiOmniVideoOptions {
  modelId?: string;
  startFrame?: string;
  endFrame?: string;
  referenceImages?: string[];
  preferences?: GeminiOmniVideoPreferences;
  async?: boolean;
}

export interface GeminiOmniVideoResult {
  url?: string;
  mimeType?: string;
  jobId?: string;
  status?: string;
}

export interface FlowOmniVideoOptions {
  aspectRatio?: 'VIDEO_ASPECT_RATIO_PORTRAIT' | 'VIDEO_ASPECT_RATIO_LANDSCAPE' | '9:16' | '16:9' | '1:1';
  durationSeconds?: 5 | 10;
  referenceImages: string[];
  userPaygateTier?: string;
  resolution?: string;
  async?: boolean;
}

export interface FlowOmniVideoResult {
  jobId?: string;
  status?: string;
  url?: string;
}

export interface StoryCore {
  core_attraction: string;
  psychological_pleasure: string;
  gold_finger_rule: string;
}

export interface ActStructure {
  act_number: number;
  name: string;
  episode_range: string;
  function: string;
  core_question: string;
  act_climax: string;
}

export interface MajorReversal {
  reversal_index: number;
  episode_number: number;
  setup_hook: string;
  reversal_event: string;
  audience_impact: string;
}

export interface PaywallHook {
  percentage: string;
  episode_number: number;
  type: 'First Climax' | 'Life-Death Crisis' | 'Mid-Season Twist' | 'Late Reversal' | 'Grand Finale';
  hook_description: string;
  ad_hook_30s_prompt: string;
}

export interface EpisodeSkeleton {
  episode_number: number;
  title: string;
  synopsis: string;
  scene_core: string;
  conflict_escalation: string;
  cliffhanger_hook: string;
  phase: string;
  scene_count: number;
  duration_seconds?: number;
}

export interface MasterPlanOutput {
  series_id: string;
  seriesId?: string;
  title: string;
  genre: string;
  visual_style: string;
  visualStyle?: string;
  visual_style_prompt: string;
  visualStylePrompt?: string;
  country: string;
  ratio: "9:16" | "16:9" | "4:3" | "1:1" | string;
  total_episodes: number;
  totalEpisodes?: number;
  total_duration_seconds?: number;
  totalDurationSeconds?: number;
  episode_duration?: number;
  language: string;
  setting_context?: {
    era: string;
    location: string;
    cultural_atmosphere: string;
  };
  story_core: StoryCore;
  synopsis: string;
  hidden_line: string;
  target_audience: string;
  viral_hook: string;
  estimated_retention: string;
  characters: Character[];
  locations?: LocationAsset[];
  props?: PropAsset[];
  three_acts: ActStructure[];
  major_reversals: MajorReversal[];
  paywall_hooks: PaywallHook[];
  episodes: EpisodeSkeleton[];
}

export interface GenerateSceneVideoResult {
  assetId: string;
  url: string;
  s3Key: string;
  bgmUrl: string;
  voiceoverUrl: string;
  voiceId?: string;
  voiceStartUs: number;
  voiceDurationUs: number;
  captionsData: CaptionsData[];
  videoPrompt: string;
  duration: number;
  motion: string;
  cameraMovement: string;
  sizeBytes: number;
  provider?: string;
  synthId?: Record<string, unknown>;
  synthIdHeaders?: Record<string, string>;
  status: string;
  version?: AssetVersion;
}

export interface DialogueVoiceSynthesisResult {
  s3_key: string;
  url: string;
  audio_url: string;
  size_bytes: number;
  mime_type: string;
  voice_id: string;
  voice_name: string;
  language: string;
  text: string;
  cues: CaptionsData[];
  start_us: number;
  end_us: number;
  start_ms: number;
  end_ms: number;
  duration_us: number;
  duration_ms: number;
  words?: CaptionWord[];
}

