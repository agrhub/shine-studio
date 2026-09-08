/**
 * Centralized Type Definitions for Shine Server
 * Strict schema with 100% snake_case field names and non-null fields to catch errors at compile-time.
 */

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
  created_at: string;
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
  | CharacterSeriesEntity
  | CharacterWardrobeVariant
  | LocationAsset
  | PropAsset
  | SceneEntity
  | EpisodeEntity;

export interface CustomizeAssetParams {
  series_id: string;
  episode_id?: string;
  asset_type: CustomizableAssetType;
  asset_id: string;
  variant_id?: string;
  custom_prompt: string;
  use_reference_image?: boolean;
  reference_image_url?: string;
  // aspect_ratio?: string;
  user_id: string;
  start_frame_url?: string;
}

export interface CustomizeAssetResult {
  image_url: string;
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
  name: string;
  clothing_and_accessories: string;
  image_url?: string;
  prompt?: string;
  versions?: AssetVersion[];
  associated_scenes?: number[];
  category?: string;
}

export interface CharacterSceneCostumes {
  character_id?: string;
  variant_id: string;
  character: string;
  wardrobe: string;
}

/**
 * Series-level Master Character Entity (Single Source of Truth for entire series)
 */
export interface CharacterSeriesEntity {
  id: string;
  series_id: string;
  name: string;
  role: 'protagonist' | 'antagonist' | 'supporting' | 'supporter' | 'lead' | 'extra' | string;
  age: number;
  gender: string;
  nationality: string;
  voice_id: string;
  identity: string;
  traits: string;
  visual_traits: string;
  physical_characteristics: string;
  appearance: string;
  clothing_and_accessories: string;
  frame_description: string;
  wardrobe_variants: CharacterWardrobeVariant[];
  speech_style: string;
  avatar?: string | null;
  prompt?: string;
  versions?: AssetVersion[];
  lora_model?: string;
  description: string;
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
  holder?: string;
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
  dialogue?: SceneDialogue[];
  duration_seconds: number;
  linked_asset_ids: string[];
  image_url?: string;
  video_url?: string;
  status: 'draft' | 'image_ready' | 'video_ready';
  scene_context?: string;
  // prop_details?: string;
  end_frame_prompt?: string;
  transition_effect?: string;
  video_effect?: string;
  storyboard_end_frame_url?: string;
}

export interface SceneReferenceAssets {
  characters: string[];
  locations: string[];
  props: string[];
}

export interface TimelineCaptionWord {
  text: string;
  from: number; // ms relative to start of cue
  to: number;   // ms relative to start of cue
  isKeyWord?: boolean;
}

export interface SceneCaptionWord {
  word: string;
  start: number; // s (seconds in scene/video)
  end: number;   // s (seconds in scene/video)
  punctuated_word: string;
  confidence: number;
}

export interface SceneCaptionData {
  id: string;
  character?: string;
  text: string;
  duration_ms?: number;
  duration_us?: number;
  from_us?: number;
  end_ms: number;
  start_ms: number;
  to_us?: number;
  words?: TimelineCaptionWord[];//using for timeline data later
}

export interface SceneDialogue {
  character: string;
  emotion?: string;
  line: string;
  speech_tone?: string;
  speed?: number;
}

export interface SceneEffect {
  effect_key: `vignette` | `retro70s` | `filmStripPro` | `sepia` | `tvScanlines` | `glitch` | `rgbGlitch` | `shine` | `bloomFilter` | `glowFilter` | `oldFilmFilter` | `crtFilter` | `motionBlur` | `cameraMove` | `fastZoom` | `shockwaveFilter` | '';
  intensity: number;
}

export interface SceneEntity {
  id: string;
  index: number;
  scene_number: number;
  shot_number: number;
  title: string;
  heading: string;
  // location_id?: string;
  // location_name?: string;
  location: string;
  time_of_day: string;
  description: string;
  frame_description: string;
  duration_seconds: number;
  // shots?: ShotFrame[];
  image_url?: string;
  storyboard_frame_url?: string;
  storyboard_end_frame_url?: string;
  prompt?: string;
  versions?: AssetVersion[];
  end_frame_versions?: AssetVersion[];
  video_versions?: AssetVersion[];
  video_url?: string;
  voiceover_url?: string;
  voice_versions?: AssetVersion[];
  bgm_url?: string;
  bgm_versions?: AssetVersion[];
  status: 'draft' | 'image_ready' | 'video_ready' | string;
  dialogue: SceneDialogue[];
  reference_assets: SceneReferenceAssets;
  action: string;
  lighting_mood: string;
  bgm_mood?: string;
  camera_movement: string;
  character_costumes: CharacterSceneCostumes[];
  visual_prompt: string;
  end_frame_prompt: string;
  // scene_core?: string;
  // conflict_escalation?: string;
  // cliffhanger_hook?: string;
  scene_context: string;
  prop_details: string;
  transition_effect: `fade` | `wipeLeft` | `wipeRight` | `cube`
    | `CrossZoom` | `SimpleZoom` | `DreamyZoom` | `glitchMemories` | `GlitchDisplace`
    | `dreamy` | `Swirl` | `waterDrop` | `ripple` | `wind` | `LinearBlur` | `Mosaic` | `pixelize`
    | `circleopen` | `windowslice` | `doorway` | `burn` | `InvertedPageCurl` | '';
  effects: SceneEffect[];
  video_effect: `vignette` | `retro70s` | `filmStripPro` | `sepia`
    | `tvScanlines` | `glitch` | `rgbGlitch` | `shine` | `bloomFilter`
    | `glowFilter` | `oldFilmFilter` | `crtFilter` | `motionBlur`
    | `cameraMove` | `fastZoom` | `shockwaveFilter` | '';
  sfx_cues?: string[];
  captions_data?: SceneCaptionData[];
  words?: SceneCaptionWord[];
  translations?: Record<string, {
    dialogue?: SceneDialogue[];
    voiceover_url?: string;
    voice_duration_us?: number;
    voice_duration_ms?: number;
    voice_start_us?: number;
    captions_data?: SceneCaptionData[];
    words?: SceneCaptionWord[];
  }>;
  voice_duration_us?: number;
  voice_start_us?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ChatMessageEntity {
  id: string;
  user_id: string;
  session_id: string;
  scope: 'global' | 'series' | 'wizard';
  series_id?: string;
  episode_id?: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: any[];
  suggestions?: Array<{ label: string; prompt: string }>;
  created_at: string;
  timestamp: number;
}

export interface SeriesEntity {
  id: string;
  user_id: string;
  title: string;
  genre: string;
  synopsis: string;
  description?: string;
  visual_style: string;
  visual_style_prompt?: string;
  target_audience: string;
  episode_count: number;
  published_episode_count?: number;
  episode_duration: number;
  country: string;
  language: string;
  ratio: "9:16" | "16:9" | "4:3" | "1:1";
  viral_hook: string;
  cover_image?: string;
  master_plan: MasterPlanOutput;
  characters: CharacterSeriesEntity[];
  locations: LocationAsset[];
  props: PropAsset[];
  status: 'DRAFT' | 'ACTIVE' | 'PUBLISHED' | 'ARCHIVED' | 'DELETING';
  created_at?: string;
  updated_at?: string;
}

// export interface EpisodeRenderVersion {
//   version_id: string;
//   version_number: number;
//   rendered_at: string;
//   status: 'RENDER' | 'READY_TO_PUBLISH' | 'PUBLISHED';
//   video_url: string;
//   video_urls_by_lang: Record<string, string>;
//   languages: string[];
//   duration?: number;
//   notes?: string;
// }

export interface EpisodeReferenceAssets {
  character_ids?: string[];
  location_ids?: string[];
  prop_ids?: string[];
}

export interface DubbingSettings {
  voice_name?: string;
  voice_id?: string;
  language?: string;
  speed?: number;
  pitch?: number;
  volume?: number;
  languages?: string[];
  primary_language?: string;
  enable_bubbing?: boolean;
  auto_ducking?: boolean;
  voice_preset?: string;
  voice_intensity?: number;
  voice_pacing?: number;
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

export interface EpisodeRenderVersion {
  id?: string;
  version_id?: string;
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
  status?: string;
}

export interface RenderedVersionItem {
  id: string;
  episode_id: string;
  episode_number: number;
  episode_title: string;
  language: string;
  voice: string;
  subtitles: string[];
  resolution: string;
  video_url: string;
  thumbnail_url: string;
  duration: number;
  file_size: string;
  rendered_at: string;
  status: string;
}

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
  estimated_revenue?: number;
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

export interface EpisodePublicMetricsInput {
  videoUrl?: string;
  title: string;
  seriesTitle?: string;
  platform?: string;
}

export interface EpisodePublicMetricsResult {
  views: number;
  likes: number;
  commentsCount: number;
  shares: number;
  topCountries: EpisodeTopCountry[];
}

export interface EpisodeCommentsHarvestInput {
  videoUrl?: string;
  title: string;
  seriesTitle?: string;
  platform?: string;
  limit?: number;
}

export interface HarvestedRawComment {
  authorName: string;
  commentText: string;
  likes: number;
  platform: string;
  publishedAt: string;
}

export interface EpisodeHarvestResult {
  summary: EpisodeAnalyticsSummary;
  comments: EpisodeCommentItem[];
}

export interface AnalyzeEpisodeFeedbackParams {
  episode: EpisodeEntity;
  comments: EpisodeCommentItem[];
  metrics: EpisodeAnalyticsSummary;
  series?: SeriesEntity | null;
}

export interface ApplyAudienceFeedbackInput {
  episodeId: string;
  customInstruction?: string;
}

export interface ApplyAudienceFeedbackResult {
  success: boolean;
  targetEpisode: EpisodeEntity | null;
  appliedDirectives: string[];
  message: string;
}

export interface EpisodeEntity {
  id: string;
  series_id: string;
  episode_number: number;
  title: string;
  synopsis: string;
  screenplay?: string;
  scene_core?: string;
  conflict_escalation?: string;
  cliffhanger_hook?: string;
  phase?: string;
  reference_assets?: EpisodeReferenceAssets;
  scenes: SceneEntity[];
  script?: string;
  cover_image?: string;
  duration: number;
  duration_seconds?: number;
  status: 'DRAFT' | 'RENDER' | 'READY_TO_PUBLISH' | 'PUBLISHED' | 'ARCHIVED';
  dubbing_settings?: DubbingSettings;
  caption_settings?: CaptionSettings;
  caption_languages?: string[];
  dubbing_languages?: string[];
  video_url?: string;
  video_urls?: Record<string, string>;
  bgm_url?: string;
  bgm_versions?: AssetVersion[];
  render_versions?: EpisodeRenderVersion[];
  published_urls?: Record<string, string>;
  published_platforms?: EpisodePublishedPlatform[];
  analytics_summary?: EpisodeAnalyticsSummary;
  audience_insight?: EpisodeAudienceInsight;
  locations?: LocationAsset[];
  props?: PropAsset[];
  characters?: CharacterSeriesEntity[];
  created_at?: string;
  updated_at?: string;
}

export interface PlatformSettings {
  publishing: {
    youtube: {
      enabled: boolean,
      clientId: string,
      clientSecret: string,
      redirectUrl: string,
      scopes: string[],
    },
    tiktok: {
      enabled: boolean,
      clientKey: string,
      clientSecret: string,
      redirectUrl: string,
      scopes: string[],
    },
    facebook: {
      enabled: boolean,
      appId: string,
      appSecret: string,
      redirectUrl: string,
      scopes: string[],
    },
  },
  sso: {
    google: {
      enabled: boolean,
      clientId: string,
      clientSecret: string,
      redirectUrl: string,
    },
    facebook: {
      enabled: boolean,
      appId: string,
      appSecret: string,
      redirectUrl: string,
    },
    tiktok: {
      enabled: boolean,
      clientId: string,
      clientSecret: string,
      redirectUrl: string,
    },
    github: {
      enabled: boolean,
      clientId: string,
      clientSecret: string,
      redirectUrl: string,
    }
  },
};

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

export interface UserEntity {
  id: string;
  email: string;
  password_hash?: string;
  name: string;
  avatar?: string;
  role: 'admin' | 'owner' | 'creator' | 'user' | string;
  api_key?: string;
  api_key_rotated_at?: string;
  two_factor_enabled?: boolean;
  integrations?: { 
    id: string; 
    name: string; 
    icon: string; 
    connected: boolean 
  }[];
  connected_channels?: PlatformAccount[];
  tier: 'FREE' | 'PRO' | 'ENTERPRISE';
  credits: number;
  status?: 'active' | 'locked' | 'suspended';
  is_active?: boolean;
  phone?: string;
  last_login_at?: string;
  theme?: string;
  language?: string;
  created_at?: string;
}

export interface StorageSystemConfig {
  provider?: string;
  bucketName?: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  accountId?: string;
  publicDomain?: string;
}

export interface StudioSystemConfig {
  s3?: StorageSystemConfig;
  storage?: StorageSystemConfig;
  gemini?: {
    textModel?: string;
    imageModel?: string;
    videoModel?: string;
    apiKey?: string;
    agentModel: string,
    audioModel: string,
    enableThinking: boolean,
    maxTokens: number,
    musicModel: string,
    temperature: number,
  };
  captcha?: {
    enabled?: boolean;
    baseUrl?: string;
    apiKey?: string;
    method?: string;
  };
  cloudRun?: {
    region?: string;
    renderUrl?: string;
    serviceName?: string;
  };
  creditRates?: {
    bgmMusic?: number;
    characterAnchors?: number;
    cliffhangerHook?: number;
    sceneImage?: number;
    scriptGeneration?: number;
    subtitleTranslate?: number;
    videoGeneration?: number;
    videoRender?: number;
    voiceoverTts?: number;
  };
  deepgram?: {
    apiKey?: string;
    model?: string;
    url?: string;
  };
  elevenlabs?: {
    apiKey?: string;
    model?: string;
    url?: string;
  };
  email?: {
    enabled?: boolean;
    host?: string;
    password?: string;
    senderEmail?: string;
    senderName?: string;
    smtpHost?: string;
    smtpPort?: number;
    ssl?: boolean;
  };
  freesound?: {
    apiKey?: string;
    clientId?: string;
    endpoint?: string;
  };
  gcs?: {
    bucketName?: string;
    enabled?: boolean;
    keyFilename?: string;
    projectId?: string;
    publicDomain?: string;
  };
  grafana?: {
    apiKey?: string;
    mcpEndpoint?: string;
    url?: string;
  };
  notifications?: {
    discordWebhook?: string;
    emailAlerts?: boolean;
    slackWebhook?: string;
  };
  parallel?: {
    apiKey?: string;
    endpoint?: string;
  };
  pexels?: {
    apiKey?: string;
    endpoint?: string;
  };
  pixabay?: {
    apiKey?: string;
    endpoint?: string;
  };
  pubsub?: {
    projectId?: string;
    subscriptionRender?: string;
    topicRender?: string;
  };
}

export interface SystemSettingEntity {
  key: string;
  value: any;
  updated_at?: string;
}

// export interface SystemSettings {
//   captcha: {
//     apiKey: string,
//     baseUrl: string,
//     method: "capsolver" | "capmonster" | "2captcha" | "anti-captcha" | "anticaptcha" | "anti-captcha"
//   },
//   cloudrun: {
//     region: string,
//     renderUrl: string,
//     serviceName: string
//   },
//   creditRates: {
//     bgmMusic: number,
//     characterAnchors: number,
//     cliffhangerHook: number,
//     sceneImage: number,
//     scriptGeneration: number,
//     subtitleTranslate: number,
//     videoGeneration: number,
//     videoRender: number,
//     voiceoverTts: number
//   },
//   deepgram: {
//     apiKey: string,
//     model: string,
//     url: string
//   },
//   elevenlabs: {
//     apiKey: string,
//     model: string,
//     url: string
//   },
//   email: {
//     enabled: boolean,
//     host: string,
//     password: string,
//     senderEmail: string,
//     senderName: string,
//     smtpHost: string,
//     smtpPort: number,
//     ssl: boolean,
//   },
//   freesound: {
//     apiKey: string,
//     clientId: string,
//     endpoint: string,
//   },
//   gcs: {
//     bucketName: string,
//     enabled: boolean,
//     keyFilename: string,
//     projectId: string,
//     publicDomain: string,
//   },
//   gemini: {
//     agentModel: string,
//     audioModel: string,
//     enableThinking: boolean,
//     imageModel: string,
//     maxTokens: number,
//     musicModel: string,
//     temperature: number,
//     textModel: string,
//     videoModel: string,
//   },
//   grafana: {
//     apiKey: string,
//     mcpEndpoint: string,
//     url: string,
//   },
//   notifications: {
//     discordWebhook: string,
//     emailAlerts: boolean,
//     slackWebhook: string
//   },
//   parallel: {
//     apiKey: string,
//     endpoint: string
//   },
//   pexels: {
//     apiKey: string,
//     endpoint: string
//   },
//   pixabay: {
//     apiKey: string,
//     endpoint: string
//   },
//   pubsub: {
//     projectId: string,
//     subscriptionRender: string,
//     topicRender: string
//   },
//   s3: {
//     accessKeyId: string,
//     accountId: string,
//     bucketName: string,
//     enabled: boolean,
//     endpoint: string,
//     provider: string,
//     publicDomain: string,
//     region: string,
//     secretAccessKey: string
//   }
// }

export interface ApiKeyEntity {
  id: string;
  user_id: string;
  key_prefix: string;
  key_hash: string;
  name: string;
  created_at?: string;
  last_used_at?: string;
}

export interface GenerationLogEntity {
  id: string;
  user_id: string;
  type: string;
  prompt: string;
  result_url?: string;
  credits_used: number;
  status: string;
  created_at?: string;
}

export enum SocialPlatform {
  YOUTUBE = 'youtube',
  FACEBOOK = 'facebook',
  TIKTOK = 'tiktok',
}

export interface SocialAccountEntity {
  id?: string;
  user_id: string;
  platform: SocialPlatform | string;
  channel_id: string;
  channel_name: string;
  channel_avatar_url?: string;
  access_token: string;
  refresh_token?: string;
  token_expires_at?: string | Date;
  scopes?: string[];
  is_active?: boolean;
  created_at?: string | Date;
  updated_at?: string | Date;
}

export enum AIModelType {
  TEXT = 'text',
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  MUSIC = 'music',
  VOICE = 'voice',
}

export enum AIAccountStatus {
  READY = 'READY',
  UNAUTHORIZED = 'UNAUTHORIZED',
  ERROR = 'ERROR',
  ACTIVE = 'ACTIVE',
}

export enum AIAccountType {
  GOOGLE_FLOW = 'google-flow',
  GOOGLE_VERTEX = 'google-vertex',
  API_KEY = 'api-key',
  ANTIGRAVITY = 'antigravity',
  STANDARD = 'standard',
  OPENAI = 'openai',
  CUSTOM = 'custom',
  GOOGLE_CLOUD = 'google-cloud',
}

export interface IAIAccount {
  id?: string;
  email: string;
  name?: string;
  avatar_url?: string;
  account_type: string;
  status: AIAccountStatus | string;
  session_token?: string;
  access_token?: string;
  token_expires_at?: Date;
  project_id?: string;
  credits?: number;
  error_message?: string;
  last_fingerprint?: Map<string, string>;
  service_keys?: Map<string, string>;
  is_active: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface FlowAccountEntity {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  session_token: string;
  access_token?: string;
  project_id?: string;
  status: string;
  credits_remaining: number;
  last_synced_at?: string;
}

export interface AntigravityAccountEntity {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  avatar_url?: string;
  access_token?: string;
  refresh_token: string;
  expires_at?: number;
  token_expires_at?: Date | string;
  project_id?: string;
  tier?: string;
  is_paid?: boolean;
  status: 'ACTIVE' | 'READY' | 'UNAUTHORIZED' | 'ERROR' | 'RATE_LIMITED' | 'REVOKED' | string;
  error_message?: string;
  quotas?: Record<string, { used: number; limit: number }>;
  available_models?: Array<{ id: string; displayName?: string; remainingFraction?: number; percentage?: number; resetTime?: string; category?: string }>;
  rate_limit_reset_at?: number;
  request_count?: number;
  last_used_at?: string;
  last_synced_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface TimelineSnapshotEntity {
  id: string;
  episode_id: string;
  version_number: number;
  label: string;
  author_id: string;
  author_name: string;
  author_avatar?: string;
  change_summary?: string;
  timeline_data: string;
  created_at?: string;
}

export interface CreditTransactionEntity {
  id: string;
  user_id: string;
  activity: string;
  details?: string;
  amount: number;
  balance_after: number;
  status: 'Success' | 'Failed';
  created_at?: string;
}

export interface AssetEntity {
  id: string;
  user_id?: string;
  name: string;
  type: 'image' | 'video' | 'audio' | 'voice' | 'bgm' | 'text' | 'render' | 'scene_image' | 'scene_end_image' | 'scene_video' | 'character_sheet' | 'character_avatar' | 'location_image' | 'prop_image' | string;
  ext?: string;
  size?: string;
  size_bytes?: number;
  category_label?: string;
  category_color?: string;
  s3_key?: string;
  url: string;
  thumbnail?: string;
  series_id?: string;
  episode_id?: string;
  scene_id?: string;
  character_id?: string;
  prompt?: string;
  provider?: string;
  aspect?: string;
  version?: number;
  is_active?: boolean;
  is_video?: boolean;
  is_audio?: boolean;
  synth_id_verified?: boolean;
  synth_id_hash?: string;
  synth_id_metadata?: any;
  metadata?: any;
  created_at?: string;
}

export interface WorkerHeartbeatEntity {
  worker_id: string;
  worker_name: string;
  service_name: 'shine-render-worker' | 'demucs-worker' | string;
  region: string;
  status: 'ONLINE' | 'BUSY' | 'IDLE' | 'OFFLINE';
  cpu_usage_pct?: number;
  memory_usage_mb?: number;
  active_jobs_count?: number;
  completed_jobs_count?: number;
  failed_jobs_count?: number;
  last_heartbeat: string;
  metadata?: any;
}

export interface WorkerJobEntity {
  job_id: string;
  worker_id?: string;
  worker_name?: string;
  service_name: string;
  series_id?: string;
  series_title?: string;
  episode_id?: string;
  progress: number;
  status: 'QUEUED' | 'RENDERING' | 'COMPOSITING' | 'COMPLETED' | 'FAILED';
  download_url?: string;
  output_url?: string;
  error?: string;
  render_time_ms?: number;
  file_size?: number;
  submitted_at: string;
  updated_at: string;
}

export interface TrackedRenderJob {
  remoteJobId: string;
  pipelineJobId: string;
  seriesId: string;
  episodeId: string;
  workerUrl: string;
  storageKey: string;
  combKey: string;
  combLabel: string;
  projectData: IProject | Record<string, unknown>;
  options: Record<string, unknown>;
  retryCount: number;
  lastProgressPct: number;
  lastActivityTime: number;
}

export interface RenderJobPayload {
  jobId: string;
  seriesId: string;
  episodeId: string;
  sceneIndex?: number;
  timelineData: IProject | Record<string, unknown>;
  aspectRatio?: string;
  fps?: number;
  resolution?: string;
  outputFormat?: string;
  callbackUrl?: string;
  submittedAt: string;
}

export interface CloudRunClusterStatus {
  serviceName: string;
  region: string;
  renderUrl: string;
  status: 'ONLINE' | 'STANDBY' | 'DEGRADED';
  activeWorkers: number;
  maxConcurrency: number;
  queueDepth: number;
  systemLoad: {
    cpuCores: number;
    freeMemoryMb: number;
    totalMemoryMb: number;
  };
}

export interface RenderProgressEvent {
  jobId: string;
  episodeId?: string;
  status: 'queued' | 'rendering' | 'compositing' | 'completed' | 'failed';
  progressPercent: number;
  downloadUrl?: string;
  outputUrl?: string;
  s3Key?: string;
  error?: string;
  renderTimeMs?: number;
  fileSize?: number;
  timestamp: string;
}

export interface CompositorClip {
  id: string;
  startTime: number;
  duration: number;
  assetUrl: string;
  type?: 'Video' | 'Image' | 'Audio' | 'Caption';
  volume?: number;
  text?: string;
  languageCode?: string;
}

export interface CompositorTrack {
  id: string;
  name?: string;
  type?: 'Video' | 'Audio' | 'Caption' | string;
  languageCode?: string;
  muted?: boolean;
  visible?: boolean;
  clips: CompositorClip[];
}

export interface CompositorPayload {
  series_id: string;
  episode_id: string;
  dubbing_languages?: string[];
  caption_languages?: string[];
  resolution?: string;
  fps?: number;
  format?: string;
  tracks?: CompositorTrack[];
  timeline_state?: Record<string, unknown>;
}

export interface CompositorJobPayload {
  series_id: string;
  episode_id: string;
  pipeline_job_id?: string;
  language?: string;
  aspect_ratio?: '9:16' | '16:9' | '1:1';
  include_subtitles?: boolean;
  resolution?: '720p' | '1080p' | '4k';
  burn_subtitles?: boolean;
  fps?: number;
}

export interface RenderJobState {
  jobId: string;
  seriesId: string;
  episodeId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  outputUrl: string | null;
  outputsByLang?: Record<string, string>;
  error?: string | null;
}

export interface PipelineJobLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

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
  progress: number; // 0 - 100
  current_step: string;
  step_progress?: Record<string, PipelineJobStepProgress>;
  outputs?: Record<string, any>;
  metadata?: Record<string, any>;
  logs: PipelineJobLog[];
  error?: string | null;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface ClusterMetricsSummary {
  active_instances: number;
  gpu_load_pct: number;
  active_jobs_count: number;
  queued_jobs_count: number;
  completed_jobs_count: number;
  failed_jobs_count: number;
  monthly_cost_usd: number;
  monthly_budget_cap: number;
  service_name: string;
  region: string;
  status: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
  workers: WorkerHeartbeatEntity[];
  active_jobs: WorkerJobEntity[];
}

export interface StorySkeletonInput {
  title: string;
  genre: string;
  visual_style?: string;
  visual_style_prompt?: string;
  synopsis: string;
  total_episodes?: number;
  episode_duration_seconds?: number;
  country?: string;
  language?: string;
  ratio?: string;
  viral_topic?: string;
  reference_assets?: any[];
}

// export interface CharacterPersona {
//   name: string;
//   role: 'protagonist' | 'antagonist' | 'supporter';
//   gender?: 'male' | 'female' | 'neutral';
//   age?: number;
//   nationality?: string;
//   voice_id?: string;
//   identity: string;
//   appearance?: string; // Facial features, physical build, age appearance matching target country
//   visual_traits?: string;
//   physical_characteristics?: string;
//   description?: string;
//   costume_style?: string; // Signature cultural/regional wardrobe, styling, and signature accessories
//   traits: string;
//   circumstance: string;
//   action: string;
//   ending: string;
//   avatar?: string | null;
//   lora_anchor?: string;
//   speech_style?: string;
//   empathy_elements?: string;
// }

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

export interface StoryCore {
  core_attraction: string;
  psychological_pleasure: string;
  gold_finger_rule: string;
}

// export interface LocationPersona {
//   id?: string;
//   name: string;
//   physical_characteristics: string;
//   time_of_day?: string;
//   image_url?: string;
// }

// export interface PropPersona {
//   id?: string;
//   name: string;
//   physical_characteristics: string;
//   image_url?: string;
// }

export interface MasterPlanOutput {
  series_id: string;
  title: string;
  genre: string;
  visual_style: string;
  visual_style_prompt: string;
  country: string;
  ratio: "9:16" | "16:9" | "4:3" | "1:1" | string;
  total_episodes: number;
  total_duration_seconds?: number;
  language: string;
  setting_context?: {
    era: string; // e.g. Modern 2026, Cyberpunk, 1990s retro
    location: string; // e.g. High-tech metropolis, bustling apartment complex, corporate towers
    cultural_atmosphere: string; // Local lifestyle, social classes, architecture and visual aesthetic
  };
  story_core: StoryCore;
  synopsis: string;
  hidden_line: string;
  target_audience: string;
  viral_hook: string;
  estimated_retention: string;
  characters: CharacterSeriesEntity[];
  locations?: LocationAsset[];
  props?: PropAsset[];
  three_acts: ActStructure[];
  major_reversals: MajorReversal[];
  paywall_hooks: PaywallHook[];
  episodes: EpisodeSkeleton[];
}

export interface IProjectSettings {
  width: number;
  height: number;
  fps: number;
  duration: number;
  backgroundColor?: string;
  artboardColor?: string;
  format?: string;
  videoCodec?: string;
  bitrate?: number;
  audio?: boolean;
  audioCodec?: string;
  audioSampleRate?: number;
  prioritizeSpeed?: boolean;
  [key: string]: any;
}

export interface ITrack {
  id: string;
  name: string;
  type: string;
  clipIds: string[];
  accepts?: string[];
  static?: boolean;
  muted?: boolean;
  visible?: boolean;
  languageCode?: string;
  config?: any;
  [key: string]: any;
}

export interface IProject {
  settings: IProjectSettings;
  tracks: ITrack[];
  clips: Record<string, any>;
  // [key: string]: any;
}

export interface TimelineSnapshotVersion {
  version_id: string;
  version_number: number;
  author?: { userId?: string; name?: string; avatar?: string };
  change_summary?: string;
  created_at: string;
  timeline_data: IProject;
}

export interface TimelineSnapshotHistoryItem {
  version_id: string;
  version_number: number;
  label?: string;
  author?: {
    userId?: string;
    name?: string;
    avatar?: string;
  };
  change_summary?: string;
  created_at: string;
}

export interface RestoreTimelineResult {
  success: boolean;
  restored_from_version_id: string;
  new_version_id: string;
  new_version_number: number;
  active_timeline: IProject;
  created_at: string;
}



export interface TimelineDimensions {
  width: number;
  height: number;
  fps: number;
}

export interface SupervisionResult {
  score: number;
  pacing_score: number;
  hook_strength_score: number;
  consistency_score: number;
  issues: string[];
  suggestions: string[];
}

export interface ComplianceDimension {
  label: string;
  score: number;
  status: string;
  safe: boolean;
  notes?: string;
}

export interface DeepResearch {
  country: string;
  copyright_findings: string;
  regulatory_findings: string;
  cultural_findings: string;
  grounded_sources?: { title: string; url: string }[];
}

export interface ComplianceVerificationResult {
  overall_score: number;
  is_compliant: boolean;
  market_research?: {
    country: string;
    copyright_findings: string;
    regulatory_findings: string;
    cultural_findings: string;
    grounded_sources?: { title: string; url: string }[];
  };
  categories: {
    violence: ComplianceDimension;
    adult_content: ComplianceDimension;
    cultural_sensitivity: ComplianceDimension;
    copyright_ip: ComplianceDimension;
  };
  copyright_checks: Array<{
    label: string;
    status: string;
    safe: boolean;
  }>;
  identified_issues: string[];
  recommendations: string[];
}


export interface TrendTopic {
  id?: string;
  topic: string;
  viralScore: number;
  platform: string;
  region: string;
  tropes: string[];
  description?: string;
  competitorHook?: string;
  hashtagVelocity?: string;
  language?: string;
}

export interface TrendTopicOutput {
  id: string;
  topic: string;
  description?: string;
  trope: string;
  hashtag_velocity: string;
  competitor_hook: string;
  country: string;
  engagement_score: number;
  genre: string;
}

export interface ViralTrendItem extends TrendTopicOutput {
  target_episodes?: number;
  duration_seconds?: number;
  category?: string;
  created_at?: string;
}

export interface ViralTrendPaginationResult {
  items: ViralTrendItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  country: string;
  updatedAt: string;
  fromCache?: boolean;
}

export type ScriptShot = SceneEntity;
export type ScriptScene = SceneEntity;

export interface ScriptSceneGroup {
  scene_number: number;
  heading: string;
  location: string;
  time_of_day: string;
  lighting_mood?: string;
  shots: ScriptShot[];
}

export interface ScriptItem {
  episode: string;
  episode_number: number;
  title: string;
  synopsis: string;
  screenplay?: string;
  scene_core?: string;
  conflict_escalation?: string;
  cliffhanger_hook?: string;
  total_duration_seconds: number;
  scenes: SceneEntity[];
  scene_groups?: ScriptSceneGroup[];
  characters?: CharacterSeriesEntity[];
  locations?: LocationAsset[];
  props?: PropAsset[];
}

export interface ScriptAgentInput {
  series_id?: string;
  episode_number: number;
  title?: string;
  genre?: string;
  visual_style?: string;
  visual_style_prompt?: string;
  synopsis?: string;
  scene_core?: string;
  conflict_escalation?: string;
  cliffhanger_hook?: string;
  characters?: CharacterSeriesEntity[];
  locations?: LocationAsset[];
  props?: PropAsset[];
  story_core?: {
    core_attraction?: string;
    psychological_pleasure?: string;
    gold_finger_rule?: string;
  };
  country?: string;
  language?: string;
  ratio?: string;
  target_duration_seconds?: number;
}

export interface RefinePlanInput {
  currentPlan: MasterPlanOutput;
  userInstruction: string;
}

export interface RefinePlanOutput {
  updatedPlan: MasterPlanOutput;
  explanation: string;
}

export interface FullScriptPipelineRequest {
  title: string;
  genre: string;
  visual_style?: string;
  synopsis: string;
  episode_number?: number;
  total_episodes?: number;
}

export interface FullScriptPipelineResponse {
  outline: MasterPlanOutput;
  adaptation: AdaptationOutput;
  scriptItem: ScriptItem;
  supervision: SupervisionResult;
}

export interface AdaptationInput {
  synopsis: string;
  targetEpisodeCount: number;
  pacingStyle: 'aggressive_hook' | 'slow_burn' | 'climax_twist';
}

export interface AdaptationOutput {
  targetEpisodeCount: number;
  pacingStyle: string;
  actBreakdown: {
    act1: { range: string; focus: string };
    act2: { range: string; focus: string };
    act3: { range: string; focus: string };
  };
  keyClimaxEpisodes: number[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  toolCalls?: Array<{
    name: string;
    args: Record<string, unknown>;
    status: 'running' | 'success' | 'error';
    result?: unknown;
    retries?: number;
  }>;
  suggestions?: Array<{ label: string; prompt: string }>;
}

export interface EpisodeChatSession {
  sessionId: string;
  userId: string;
  seriesId: string;
  episodeId: string;
  messages: ChatMessage[];
  lastActive: number;
  masterPlan?: MasterPlanOutput;
  contextData?: Record<string, unknown>;
}

export interface StoryboardPanel {
  id: string;
  scene_index: number;
  shot_number: number;
  prompt: string;
  camera_movement: string;
  lighting_style: string;
  character_anchors: string[];
  image_url?: string;
  duration_seconds: number;
}

export interface CreateSeriesParams {
  id?: string;
  user_id?: string;
  title: string;
  genre: string;
  synopsis?: string;
  visual_style?: string;
  visual_style_prompt?: string;
  target_audience?: string;
  country?: string;
  language?: string;
  ratio?: "9:16" | "16:9" | "4:3" | "1:1" | string;
  episode_count?: number;
  master_plan: MasterPlanOutput;
  characters?: CharacterSeriesEntity[];
  locations?: LocationAsset[];
  props?: PropAsset[];
  pre_generate_ep1?: boolean;
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
  captionsData: SceneCaptionData[];
  videoPrompt: string;
  duration: number;
  motion: string;
  cameraMovement: string;
  sizeBytes: number;
  provider?: string;
  synthId?: SynthIDMetadata | Record<string, unknown>;
  synthIdHeaders?: Record<string, string>;
  status: string;
  version?: AssetVersion;
}

export interface VideoRenderJob {
  jobId: string;
  seriesId: string;
  episodeId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress: number;
  videoUrl?: string;
  ssimParityScore?: number;
  errorMessage?: string;
}

export interface GenerateSceneImageParams {
  user_id: string;
  series_id: string;
  episode_id: string;
  scene_id: string;
  scene_index?: number;
  custom_prompt?: string;
  // aspect_ratio?: string;
  // style?: string;
  // characters?: string[];
  // scene_data?: Partial<SceneEntity>;
  // type?: string;
  is_end_frame?: boolean;
}

export interface GenerateSceneVideoParams {
  user_id?: string;
  series_id?: string;
  episode_id?: string;
  scene_id?: string;
  duration?: number;
  motion?: string;
  camera_movement?: string;
  prompt?: string;
  aspect_ratio?: string;
  start_frame_url?: string;
  end_frame_url?: string;
  character_image_ids?: string | string[];
  language?: string;
  scene_data?: Partial<SceneEntity>;
}

export interface TTSRequest {
  text: string;
  voiceId: string;
  language?: string;
  speed?: number;
  emotion?: string;
  speech_tone?: string;
}

export interface ScreenplayAssetsResult {
  characters: string[];
  locations: string[];
  props: string[];
}

export interface SfxCandidate {
  id: string | number;
  title: string;
  url: string;
  duration: number;
  tags?: string[];
  provider: 'freesound' | 'pixabay' | 'flexclip' | 'parallel';
}

export interface PlatformMetricItem {
  platform: string;
  channelName: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  estimatedRevenue: number;
  retentionRatePct: number;
  lastUpdated: string;
}

export interface DspSeparationResult {
  bgmUrl: string;
  speechStartUs: number;
  speechEndUs: number;
  speechDurationUs: number;
  hasSpeechActivity: boolean;
}

export interface StemSeparationResult {
  bgmUrl: string;
  vocalsUrl?: string;
  source: 'demucs-cloud-run';
}

export interface ViralTrendEntity {
  id?: string;
  cache_key: string;
  country: string;
  language: string;
  items: ViralTrendItem[];
  updated_at: Date | string;
}

export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  vi: 'Vietnamese (Tiếng Việt)',
  zh: 'Simplified Chinese (简体中文)',
  'zh-cn': 'Simplified Chinese (简体中文)',
  'zh-tw': 'Traditional Chinese (繁體中文)',
  jp: 'Japanese (日本語)',
  ja: 'Japanese (日本語)',
  es: 'Spanish (Español)',
  fr: 'French (Français)',
  de: 'German (Deutsch)',
  ko: 'Korean (한국어)',
  th: 'Thai (ไทย)',
  id: 'Indonesian (Bahasa Indonesia)',
};

export const MAX_TRENDS = 20;

// export interface DeepgramWord {
//   word: string;
//   start: number;      // Seconds (float, 0-based in the media)
//   end: number;        // Seconds (float, 0-based in the media)
//   confidence?: number;
//   punctuated_word?: string;
// }

// export interface CaptionCue {
//   id: string;
//   text: string;
//   startMs: number;    // Milliseconds from start of video/scene (0-based in the video)
//   endMs: number;      // Milliseconds from start of video/scene
//   fromUs: number;     // Microseconds in the video
//   toUs: number;       // Microseconds in the video
//   durationUs?: number;
//   words: CaptionWord[];
// }

export interface SceneAudioPipelineResult {
  videoUrl: string;
  bgmUrl: string;
  voiceoverUrl: string;
  voiceId: string;
  voiceStartUs: number;
  voiceDurationUs: number;
  speechOnsetDetected: boolean;
  words: SceneCaptionWord[];
  captionsData: SceneCaptionData[];
}

// ─── OMNI FLASH VIDEO MODEL INTERFACES ──────────────────────────────────────
export interface GeminiOmniVideoPreferences {
  aspectRatio?: '9:16' | '16:9' | '1:1' | '4:3' | '3:4';
  durationSeconds?: number;// <= 10s
  resolution?: '360p' | '480p' | '720p' | '1080p';
  generateAudio?: boolean;
  personGeneration?: 'dont_allow' | 'allow_adult';
}

export interface GeminiOmniVideoOptions {
  modelId?: string; // defaults to 'gemini-omni-1.1-flash'
  startFrame?: string; // maps to <FIRST_FRAME>
  endFrame?: string; // maps to <LAST_FRAME>
  referenceImages?: string[]; // maps to <IMAGE_REF_0>, <IMAGE_REF_1>, etc.
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
  durationSeconds?: number;
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

export interface SynthIDMetadata {
  origin: string;
  watermark_version: string;
  provider: 'Gemini' | string;
  asset_type: 'image' | 'video' | 'audio' | 'music' | 'cover' | string;
  model: string;
  timestamp: string;
  series_id?: string;
  episode_id?: string;
  scene_id?: string;
  synth_id_hash: string;
  signature: string;
  verified: boolean;
  // [key: string]: unknown;
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
  cues: SceneCaptionData[];
  start_us: number;
  end_us: number;
  start_ms: number;
  end_ms: number;
  duration_us: number;
  duration_ms: number;
  words?: SceneCaptionWord[];
}