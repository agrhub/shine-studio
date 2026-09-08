import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import type { Request } from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function loadEnv() {
  const envPaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env'),
    path.resolve(process.cwd(), '../../.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../../../.env'),
    path.resolve(__dirname, '../../../../.env'),
  ];

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath, override: false });
    }
  }

  // Robustly resolve and sanitize GOOGLE_APPLICATION_CREDENTIALS
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const rawPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const candidatePaths = [
      rawPath,
      path.resolve(process.cwd(), rawPath),
      path.resolve(process.cwd(), '../', rawPath),
      path.resolve(process.cwd(), '../../', rawPath),
      path.resolve(__dirname, '../../', rawPath),
      path.resolve(__dirname, '../../../', rawPath),
      path.resolve(__dirname, '../../../../', rawPath),
    ];

    let foundPath: string | undefined;
    for (const p of candidatePaths) {
      if (p && fs.existsSync(p) && fs.statSync(p).isFile()) {
        foundPath = path.resolve(p);
        break;
      }
    }

    if (foundPath) {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = foundPath;
    } else {
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    }
  }
}

// Execute immediately upon import
loadEnv();

export const storageConfig = {
  get provider() {
    return (process.env.STORAGE_PROVIDER || process.env.S3_PROVIDER || '').toLowerCase();
  },
  get bucket() {
    return (
      process.env.S3_BUCKET_NAME ||
      process.env.S3_BUCKET ||
      process.env.R2_BUCKET_NAME ||
      process.env.B2_BUCKET_NAME ||
      process.env.B2_BUCKET ||
      ''
    );
  },
  get accessKeyId() {
    return (
      process.env.S3_ACCESS_KEY ||
      process.env.AWS_ACCESS_KEY_ID ||
      process.env.R2_ACCESS_KEY_ID ||
      process.env.B2_APPLICATION_KEY_ID ||
      process.env.B2_KEY_ID ||
      ''
    );
  },
  get secretAccessKey() {
    return (
      process.env.S3_SECRET_KEY ||
      process.env.AWS_SECRET_ACCESS_KEY ||
      process.env.R2_SECRET_ACCESS_KEY ||
      process.env.B2_APPLICATION_KEY ||
      process.env.B2_APP_KEY ||
      ''
    );
  },
  get accountId() {
    return process.env.S3_ACCOUNT_ID || process.env.R2_ACCOUNT_ID || '';
  },
  get cdn() {
    return process.env.S3_PUBLIC_DOMAIN || process.env.R2_PUBLIC_DOMAIN || '';
  },
  get region() {
    return (
      process.env.S3_REGION ||
      process.env.AWS_REGION ||
      process.env.R2_REGION ||
      process.env.B2_REGION ||
      'us-east-005'
    );
  },
  get endpoint() {
    return (
      process.env.S3_ENDPOINT ||
      process.env.R2_ENDPOINT_URL ||
      process.env.B2_ENDPOINT ||
      ''
    );
  },
};

export const config = {
  s3: storageConfig,
};

export function isStorageConfigured(): boolean {
  const { bucket, accessKeyId, secretAccessKey } = config.s3;
  return !!(bucket && accessKeyId && secretAccessKey);
}

export const EnvConfig = {
  get isProduction() {
    return process.env.NODE_ENV === 'production';
  },
  get port() {
    return process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
  },
  get jwtSecret() {
    return process.env.JWT_SECRET || 'shine_jwt_secret_key_2026';
  },
  get jwtRefreshSecret() {
    return process.env.REFRESH_SECRET || 'shine_refresh_token_secret_key_2026';
  },
  get dbProvider() {
    return process.env.DB_PROVIDER || 'sqlite';
  },
  get mongoUri() {
    return process.env.MONGODB_URI || 'mongodb://localhost:27017/shine_db';
  },
  get geminiApiKey() {
    return process.env.GEMINI_API_KEY || '';
  },
  get gcpProjectId() {
    return process.env.GCP_PROJECT_ID || '';
  },
  get geminiModelText() {
    return process.env.GEMINI_MODEL_TEXT || 'gemini-3.1-flash-lite';
  },
  get geminiModelImage() {
    return process.env.GEMINI_MODEL_IMAGE || 'gemini-3.1-flash-lite-image';
  },
  get geminiModelVideo() {
    return process.env.GEMINI_MODEL_VIDEO || 'veo-3.1-generate-001';
  },
  get geminiModelVoice() {
    return process.env.GEMINI_MODEL_TTS || 'gemini-3.1-flash-tts-preview';
  },
  get geminiModelMusic() {
    return process.env.GEMINI_MODEL_MUSIC || 'lyria-3-clip-preview';
  },
  get geminiModelAgent() {
    return process.env.GEMINI_MODEL_AGENT || 'gemini-3.1-flash-lite';
  },
  get geminiTemperature() {
    return Number(process.env.GEMINI_TEMPERATURE) || 0.7;
  },
  get geminiCooldownMs() {
    return Number(process.env.GEMINI_COOLDOWN_MS) || 1000;
  },
  get geminiMaxTokens() {
    return Number(process.env.GEMINI_MAX_TOKENS) || 8192;
  },
  get antigravityModel(){
    return process.env.ANTIGRAVITY_MODEL || 'gemini-3.7-flash';
  },
  get smtp() {
    const host = process.env.SMTP_HOST || 'smtp.example.com';
    const port = Number(process.env.SMTP_PORT) || 465;
    const senderEmail = process.env.SMTP_USER || process.env.SENDER_EMAIL || 'antstudio@agrhub.com';
    const senderName = process.env.SMTP_NAME || process.env.SENDER_NAME || 'Shine';
    const password = process.env.SMTP_PASS || process.env.SMTP_PASSWORD || '';
    const ssl = process.env.SMTP_SECURE === 'true' || port === 465;
    const enabled = Boolean(password || process.env.SMTP_HOST);

    return {
      host,
      smtpHost: host,
      port,
      smtpPort: port,
      ssl,
      senderEmail,
      senderName,
      password,
      enabled,
    };
  },
  get captcha() {
    return {
      method: process.env.CAPTCHA_METHOD || 'capsolver',
      apiKey: process.env.CAPTCHA_API_KEY || '',
      baseUrl: process.env.CAPTCHA_BASE_URL || 'https://api.capsolver.com',
    };
  },
  get defaultCreditRates() {
    return {
      scriptGeneration: Number(process.env.RATE_SCRIPT_GENERATION) || 15,
      characterAnchors: Number(process.env.RATE_CHARACTER_ANCHORS) || 10,
      sceneImage: Number(process.env.RATE_SCENE_IMAGE) || 15,
      videoGeneration: Number(process.env.RATE_VIDEO_GENERATION) || 50,
      voiceoverTts: Number(process.env.RATE_VOICEOVER_TTS) || 10,
      bgmMusic: Number(process.env.RATE_BGM_MUSIC) || 10,
      videoRender: Number(process.env.RATE_VIDEO_RENDER) || 30,
      cliffhangerHook: Number(process.env.RATE_CLIFFHANGER_HOOK) || 5,
      subtitleTranslate: Number(process.env.RATE_SUBTITLE_TRANSLATE) || 5,
    };
  },
  get appUrl() {
    return process.env.APP_URL || 'http://localhost:3000';
  },
  get frontendUrl() {
    return process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000';
  },
  get adminEmail() {
    return process.env.ADMIN_EMAIL || 'admin@shinestudio.app';
  },
  get synthIdSecret() {
    return process.env.SYNTHID_SECRET_KEY || 'shine_synthid_google_deepmind_cryptographic_anchor_2026';
  },
  get oauth() {
    return {
      google: {
        enable: false,
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/auth/sso/callback/google',
      },
      youtube: {
        enable: false,
        clientId: process.env.YOUTUBE_CLIENT_ID || '',
        clientSecret: process.env.YOUTUBE_CLIENT_SECRET || '',
        redirectUri: process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:3001/api/auth/oauth/callback/youtube',
      },
      facebook: {
        enable: false,
        clientId: process.env.FACEBOOK_CLIENT_ID || '',
        clientSecret: process.env.FACEBOOK_CLIENT_SECRET || '',
        redirectUri: process.env.FACEBOOK_REDIRECT_URI || 'http://localhost:3001/api/auth/oauth/callback/facebook',
        oauthRedirectUri: process.env.FACEBOOK_OAUTH_REDIRECT_URI || 'http://localhost:3001/api/auth/sso/callback/facebook',
      },
      tiktok: {
        enable: false,
        clientId: process.env.TIKTOK_CLIENT_ID || '',
        clientSecret: process.env.TIKTOK_CLIENT_SECRET || '',
        redirectUri: process.env.TIKTOK_REDIRECT_URI || 'http://localhost:3001/api/auth/oauth/callback/tiktok',
        oauthRedirectUri: process.env.TIKTOK_OAUTH_REDIRECT_URI || 'http://localhost:3001/api/auth/sso/callback/tiktok',
      },
      github: {
        enable: false,
        clientId: process.env.GITHUB_CLIENT_ID || '',
        clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
        redirectUri: process.env.GITHUB_REDIRECT_URI || 'http://localhost:3001/api/auth/sso/callback/github',
      }
    };
  },
  get video() {
    return {
      generateStartEndFrame: process.env.GENERATE_START_END_FRAME === 'true' || false,
    };
  },
  get notifications() {
    return {
      slackWebhook: process.env.SLACK_WEBHOOK_URL || '',
      discordWebhook: process.env.DISCORD_WEBHOOK_URL || '',
      emailAlerts: true,
    };
  },
  get grafana() {
    return {
      url: process.env.GRAFANA_URL || 'https://bronzeholly2284.grafana.net',
      mcpEndpoint: process.env.GRAFANA_MCP_ENDPOINT || 'https://mcp.grafana.com/mcp',
      apiKey: process.env.GRAFANA_API_KEY || '',
    };
  },
  // get elevenlabs() {
  //   return {
  //     url: process.env.ELEVENLABS_URL || 'https://api.elevenlabs.io',
  //     apiKey: process.env.ELEVENLABS_API_KEY || '',
  //     model: process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2',
  //   };
  // },
  get pexels() {
    return {
      url: process.env.PEXELS_URL || 'https://api.pexels.com',
      apiKey: process.env.PEXELS_API_KEY || '',
    };
  },
  get pixabay() {
    return {
      apiKey: process.env.PIXABAY_API_KEY || '',
      endpoint: process.env.PIXABAY_URL || 'https://pixabay.com/api',
    };
  },
  get freesound() {
    return {
      apiKey: process.env.FREESOUND_API_KEY || '',
      clientId: process.env.FREESOUND_CLIENT_ID || '',
      endpoint: process.env.FREESOUND_URL || 'https://freesound.org/apiv2/search/text',
    };
  },
  get parallel() {
    return {
      apiKey: process.env.PARALLEL_API_KEY || '',
      endpoint: process.env.PARALLEL_URL || 'https://search.parallel.ai/mcp',
    };
  },
  get gcs() {
    return {
      bucketName: process.env.GCS_BUCKET_NAME || 'shine-studio-media',
      projectId: process.env.GOOGLE_CLOUD_PROJECT || '',
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
      publicDomain: process.env.GCS_PUBLIC_DOMAIN || '',
    };
  },
  get pubsub() {
    return {
      topicRender: process.env.PUBSUB_TOPIC_RENDER || 'shine-render-jobs',
      subscriptionRender: process.env.PUBSUB_SUBSCRIPTION_RENDER || 'shine-render-sub',
      projectId: process.env.GOOGLE_CLOUD_PROJECT || '',
    };
  },
  get cloudRun() {
    return {
      renderUrl: process.env.CLOUD_RUN_RENDER_URL || '',
      serviceName: process.env.CLOUD_RUN_SERVICE_NAME || 'shine-render-worker',
      region: process.env.CLOUD_RUN_REGION || 'us-central1',
    };
  },
  s3: storageConfig,
  isStorageConfigured,
  getBaseUrl(req: Request): string {
    try {
      const environment = this.isProduction;
      const baseUrl = environment
        ? `https://${req.get('host')}`
        : `${req.protocol}://${req.get('host')}`;
      return baseUrl;
    } catch (err) {
      return '';
    }
    return this.appUrl;
  },
  get generateEndFrame(){
    return Boolean(process.env.GENERATE_START_END_FRAME || false);
  },
};
