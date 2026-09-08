import axios from 'axios';
import { GoogleGenAI, FileState } from '@google/genai';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { Logger } from '@/utils/logger.js';
import { EnvConfig } from '@/config/env.js';
import { emailService } from '~/services/EmailService.js';
import { StorageFactory } from '@/services/storage/StorageFactory.js';
import { EntityNormalizer } from '@/utils/EntityNormalizer.js';
import type { GeminiOmniVideoPreferences, GeminiOmniVideoOptions, GeminiOmniVideoResult } from '@/types.js';

export type { GeminiOmniVideoPreferences, GeminiOmniVideoOptions, GeminiOmniVideoResult };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface GeminiVoiceMetadata {
  id: string;
  name: string;
  language: string;
  gender: 'male' | 'female' | 'neutral';
  provider: string;
  description: string;
  audioSampleUrl: string;
}

export const GEMINI_SUPPORTED_VOICES: GeminiVoiceMetadata[] = [
  { id: 'Zephyr', name: 'Zephyr', language: 'auto', gender: 'neutral', provider: 'gemini', description: 'Bright, Higher Pitch', audioSampleUrl: 'https://gstatic.com/aistudio/voices/samples/Zephyr.wav' },
  { id: 'Puck', name: 'Puck', language: 'auto', gender: 'neutral', provider: 'gemini', description: 'Upbeat, Middle Pitch', audioSampleUrl: 'https://gstatic.com/aistudio/voices/samples/Puck.wav' },
  { id: 'Charon', name: 'Charon', language: 'auto', gender: 'neutral', provider: 'gemini', description: 'Informative, Lower Pitch', audioSampleUrl: 'https://gstatic.com/aistudio/voices/samples/Charon.wav' },
  { id: 'Kore', name: 'Kore', language: 'auto', gender: 'female', provider: 'gemini', description: 'Firm, Middle Pitch', audioSampleUrl: 'https://gstatic.com/aistudio/voices/samples/Kore.wav' },
  { id: 'Fenrir', name: 'Fenrir', language: 'auto', gender: 'male', provider: 'gemini', description: 'Excitable, Lower-Middle Pitch', audioSampleUrl: 'https://gstatic.com/aistudio/voices/samples/Fenrir.wav' },
  { id: 'Leda', name: 'Leda', language: 'auto', gender: 'female', provider: 'gemini', description: 'Youthful, Higher Pitch', audioSampleUrl: 'https://gstatic.com/aistudio/voices/samples/Leda.wav' },
  { id: 'Orus', name: 'Orus', language: 'auto', gender: 'male', provider: 'gemini', description: 'Firm, Lower-Middle Pitch', audioSampleUrl: 'https://gstatic.com/aistudio/voices/samples/Orus.wav' },
  { id: 'Aoede', name: 'Aoede', language: 'auto', gender: 'female', provider: 'gemini', description: 'Breezy, Middle Pitch', audioSampleUrl: 'https://gstatic.com/aistudio/voices/samples/Aoede.wav' },
  { id: 'Callirrhoe', name: 'Callirrhoe', language: 'auto', gender: 'female', provider: 'gemini', description: 'Easy-going, Middle Pitch', audioSampleUrl: 'https://gstatic.com/aistudio/voices/samples/Callirrhoe.wav' },
  { id: 'Autonoe', name: 'Autonoe', language: 'auto', gender: 'female', provider: 'gemini', description: 'Bright, Middle Pitch', audioSampleUrl: 'https://gstatic.com/aistudio/voices/samples/Autonoe.wav' },
  { id: 'Enceladus', name: 'Enceladus', language: 'auto', gender: 'male', provider: 'gemini', description: 'Breathy, Lower Pitch', audioSampleUrl: 'https://gstatic.com/aistudio/voices/samples/Enceladus.wav' },
  { id: 'Iapetus', name: 'Iapetus', language: 'auto', gender: 'male', provider: 'gemini', description: 'Clear, Lower-Middle Pitch', audioSampleUrl: 'https://gstatic.com/aistudio/voices/samples/Iapetus.wav' },
  { id: 'Umbriel', name: 'Umbriel', language: 'auto', gender: 'neutral', provider: 'gemini', description: 'Easy-going, Lower-Middle Pitch', audioSampleUrl: 'https://gstatic.com/aistudio/voices/samples/Umbriel.wav' },
  { id: 'Algieba', name: 'Algieba', language: 'auto', gender: 'female', provider: 'gemini', description: 'Smooth, Lower Pitch', audioSampleUrl: 'https://gstatic.com/aistudio/voices/samples/Algieba.wav' },
  { id: 'Despina', name: 'Despina', language: 'auto', gender: 'female', provider: 'gemini', description: 'Smooth, Middle Pitch', audioSampleUrl: 'https://gstatic.com/aistudio/voices/samples/Despina.wav' },
  { id: 'Erinome', name: 'Erinome', language: 'auto', gender: 'female', provider: 'gemini', description: 'Clear, Middle Pitch', audioSampleUrl: 'https://gstatic.com/aistudio/voices/samples/Erinome.wav' },
  { id: 'Algenib', name: 'Algenib', language: 'auto', gender: 'male', provider: 'gemini', description: 'Gravelly, Lower Pitch', audioSampleUrl: 'https://gstatic.com/aistudio/voices/samples/Algenib.wav' },
  { id: 'Rasalgethi', name: 'Rasalgethi', language: 'auto', gender: 'male', provider: 'gemini', description: 'Informative, Middle Pitch', audioSampleUrl: 'https://gstatic.com/aistudio/voices/samples/Rasalgethi.wav' },
  { id: 'Laomedeia', name: 'Laomedeia', language: 'auto', gender: 'female', provider: 'gemini', description: 'Upbeat, Higher Pitch', audioSampleUrl: 'https://gstatic.com/aistudio/voices/samples/Laomedeia.wav' },
  { id: 'Achernar', name: 'Achernar', language: 'auto', gender: 'male', provider: 'gemini', description: 'Soft, Higher Pitch', audioSampleUrl: 'https://gstatic.com/aistudio/voices/samples/Achernar.wav' },
  { id: 'Alnilam', name: 'Alnilam', language: 'auto', gender: 'neutral', provider: 'gemini', description: 'Firm, Lower-Middle Pitch', audioSampleUrl: 'https://gstatic.com/aistudio/voices/samples/Alnilam.wav' },
  { id: 'Schedar', name: 'Schedar', language: 'auto', gender: 'female', provider: 'gemini', description: 'Even, Lower-Middle Pitch', audioSampleUrl: 'https://gstatic.com/aistudio/voices/samples/Schedar.wav' },
  { id: 'Gacrux', name: 'Gacrux', language: 'auto', gender: 'male', provider: 'gemini', description: 'Mature, Middle Pitch', audioSampleUrl: 'https://gstatic.com/aistudio/voices/samples/Gacrux.wav' },
  { id: 'Pulcherrima', name: 'Pulcherrima', language: 'auto', gender: 'female', provider: 'gemini', description: 'Forward, Middle Pitch', audioSampleUrl: 'https://gstatic.com/aistudio/voices/samples/Pulcherrima.wav' },
  { id: 'Achird', name: 'Achird', language: 'auto', gender: 'female', provider: 'gemini', description: 'Friendly, Lower-Middle Pitch', audioSampleUrl: 'https://gstatic.com/aistudio/voices/samples/Achird.wav' },
  { id: 'Zubenelgenubi', name: 'Zubenelgenubi', language: 'auto', gender: 'male', provider: 'gemini', description: 'Casual, Lower-Middle Pitch', audioSampleUrl: 'https://gstatic.com/aistudio/voices/samples/Zubenelgenubi.wav' },
  { id: 'Vindemiatrix', name: 'Vindemiatrix', language: 'auto', gender: 'female', provider: 'gemini', description: 'Gentle, Middle Pitch', audioSampleUrl: 'https://gstatic.com/aistudio/voices/samples/Vindemiatrix.wav' },
  { id: 'Sadachbia', name: 'Sadachbia', language: 'auto', gender: 'neutral', provider: 'gemini', description: 'Lively, Lower Pitch', audioSampleUrl: 'https://gstatic.com/aistudio/voices/samples/Sadachbia.wav' },
  { id: 'Sadaltager', name: 'Sadaltager', language: 'auto', gender: 'male', provider: 'gemini', description: 'Knowledgeable, Middle Pitch', audioSampleUrl: 'https://gstatic.com/aistudio/voices/samples/Sadaltager.wav' },
  { id: 'Sulafat', name: 'Sulafat', language: 'auto', gender: 'male', provider: 'gemini', description: 'Warm, Middle Pitch', audioSampleUrl: 'https://gstatic.com/aistudio/voices/samples/Sulafat.wav' },
];

export const GEMINI_MALE_VOICES = GEMINI_SUPPORTED_VOICES.filter(v => v.gender === 'male').map(v => v.id);
export const GEMINI_FEMALE_VOICES = GEMINI_SUPPORTED_VOICES.filter(v => v.gender === 'female').map(v => v.id);
export const GEMINI_NEUTRAL_VOICES = GEMINI_SUPPORTED_VOICES.filter(v => v.gender === 'neutral').map(v => v.id);

export class GeminiClient {
  private apiKey?: string;
  private serviceAccount?: string | Record<string, any>;
  private googleGenAI?: GoogleGenAI;

  private static instance?: GeminiClient;
  private static lastCallTimestamp = 0;
  private static queueLock: Promise<void> = Promise.resolve();
  private static lastAlertTimestamps = new Map<string, number>();

  public static getInstance(): GeminiClient {
    if (!GeminiClient.instance) {
      GeminiClient.instance = new GeminiClient();
    }
    return GeminiClient.instance;
  }

  public static async applyCooldown(cooldownMs: number = EnvConfig.geminiCooldownMs): Promise<void> {
    const nextLock = GeminiClient.queueLock.then(async () => {
      const now = Date.now();
      const elapsed = now - GeminiClient.lastCallTimestamp;
      if (elapsed < cooldownMs) {
        const waitTime = cooldownMs - elapsed;
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
      GeminiClient.lastCallTimestamp = Date.now();
    });
    GeminiClient.queueLock = nextLock.catch(() => {});
    await nextLock;
  }

  public static sendThrottledAlert(service: string, message: string, stack?: string) {
    const now = Date.now();
    const last = GeminiClient.lastAlertTimestamps.get(service) || 0;
    // Throttled: at most 1 email alert per 5 minutes per service category
    if (now - last > 5 * 60 * 1000) {
      GeminiClient.lastAlertTimestamps.set(service, now);
      emailService.sendAdminSystemAlert(`Gemini ${service}`, message, stack).catch(console.error);
    }
  }

  public static async executeWithRetry<T>(
    operationName: string,
    fn: () => Promise<T>,
    maxRetries: number = 3,
    initialBackoffMs: number = 2000
  ): Promise<T> {
    let attempt = 0;
    while (true) {
      attempt++;
      await GeminiClient.applyCooldown();
      try {
        return await fn();
      } catch (err: any) {
        const causeDetail = err?.cause ? ` (Cause: ${err.cause.message || err.cause.code || err.cause})` : '';
        const errMsg = String(err?.message || err?.statusText || '') + causeDetail;
        const isRateLimit =
          err?.status === 429 ||
          err?.code === 429 ||
          errMsg.includes('429') ||
          errMsg.includes('RESOURCE_EXHAUSTED') ||
          errMsg.includes('Resource exhausted') ||
          errMsg.includes('rate limit') ||
          errMsg.includes('Quota exceeded') ||
          errMsg.includes('quota');

        const isNetworkError =
          errMsg.includes('fetch failed') ||
          errMsg.includes('ECONNRESET') ||
          errMsg.includes('ETIMEDOUT') ||
          errMsg.includes('ENOTFOUND') ||
          errMsg.includes('EAI_AGAIN') ||
          errMsg.includes('UND_ERR') ||
          err?.cause?.code === 'ECONNRESET' ||
          err?.cause?.code === 'ETIMEDOUT' ||
          err?.cause?.code === 'ENOTFOUND' ||
          err?.status === 502 ||
          err?.status === 503 ||
          err?.status === 504;

        const isRetryable = isRateLimit || isNetworkError;

        if (isRetryable && attempt <= maxRetries) {
          const jitter = Math.floor(Math.random() * 500);
          const backoff = initialBackoffMs * Math.pow(2, attempt - 1) + jitter;
          Logger.warn(
            `[GeminiClient] ${isRateLimit ? 'Rate limit' : 'Network/transient error'} hit on ${operationName} (Attempt ${attempt}/${maxRetries}): ${errMsg}. Backing off for ${backoff}ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, backoff));
          continue;
        }

        if (attempt > maxRetries || !isRetryable) {
          Logger.error(`[GeminiClient] ${operationName} failed: ${errMsg}`);
          GeminiClient.sendThrottledAlert(operationName, errMsg, err?.stack);
        }
        throw err;
      }
    }
  }

  constructor(options?: { apiKey?: string; serviceAccount?: string | Record<string, any>; keyFilename?: string }) {
    this.apiKey = options?.apiKey || EnvConfig.geminiApiKey || process.env.GEMINI_API_KEY;

    let saCandidate: string | Record<string, any> | undefined =
      options?.serviceAccount || options?.keyFilename || process.env.GOOGLE_APPLICATION_CREDENTIALS;

    if (typeof saCandidate === 'string') {
      const candidatePaths = [
        saCandidate,
        path.resolve(process.cwd(), saCandidate),
        path.resolve(process.cwd(), '../', saCandidate),
        path.resolve(__dirname, '../../../', saCandidate),
        path.resolve(__dirname, '../../../../', saCandidate),
      ];
      const found = candidatePaths.find((p) => p && fs.existsSync(p) && fs.statSync(p).isFile());
      saCandidate = found ? path.resolve(found) : undefined;
    }

    this.serviceAccount = saCandidate;

    if (this.serviceAccount && (typeof this.serviceAccount === 'object' || (typeof this.serviceAccount === 'string' && fs.existsSync(this.serviceAccount)))) {
      this.setupServiceAccount(this.serviceAccount);
    } else if (this.apiKey) {
      this.googleGenAI = new GoogleGenAI({ apiKey: this.apiKey });
    } else if (GeminiClient.detectADC()) {
      this.setupADC();
    }
  }

  private setupServiceAccount(serviceAccount: string | Record<string, any>) {
    let projectId: string | undefined = EnvConfig.gcpProjectId || process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
    let location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

    if (typeof serviceAccount === 'string' && fs.existsSync(serviceAccount)) {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(serviceAccount);
      try {
        const content = JSON.parse(fs.readFileSync(serviceAccount, 'utf8'));
        if (content.project_id) projectId = content.project_id;
      } catch (e) {}
    } else if (typeof serviceAccount === 'object' && serviceAccount !== null) {
      projectId = (serviceAccount as any).project_id;
      try {
        const tempPath = path.join(os.tmpdir(), `gcp_sa_${Date.now()}.json`);
        fs.writeFileSync(tempPath, JSON.stringify(serviceAccount, null, 2));
        process.env.GOOGLE_APPLICATION_CREDENTIALS = tempPath;
      } catch (e) {}
    }

    if (projectId) {
      try {
        this.googleGenAI = new GoogleGenAI({ vertexai: true, project: projectId, location });
        Logger.info(`[GeminiClient] Initialized GoogleGenAI with Service Account for project ${projectId}`);
      } catch (e: any) {
        Logger.warn(`[GeminiClient] Failed to initialize GoogleGenAI with Service Account: ${e.message}`);
      }
    }
  }

  private setupADC() {
    const projectId = EnvConfig.gcpProjectId || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID;
    const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
    if (projectId) {
      try {
        this.googleGenAI = new GoogleGenAI({ vertexai: true, project: projectId, location });
        Logger.info(`[GeminiClient] Initialized GoogleGenAI with Application Default Credentials for project ${projectId}`);
      } catch (e: any) {
        Logger.warn(`[GeminiClient] Failed to initialize GoogleGenAI with ADC: ${e.message}`);
      }
    }
  }

  private static detectADC(): boolean {
    let credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (credPath && fs.existsSync(credPath)) return true;
    return !!(process.env.K_SERVICE || process.env.GAE_SERVICE || process.env.CLOUD_RUN_JOB);
  }

  public static resolveLocationForModel(modelId?: string, configuredLocation?: string): string {
    const model = (modelId || '').toLowerCase();
    if (model.includes('2.5') || model.includes('gemini-2.5')) {
      const envLoc = process.env.GOOGLE_CLOUD_LOCATION || process.env.GCP_LOCATION;
      return envLoc && envLoc !== 'global' ? envLoc : 'us-central1';
    }
    if (model.includes('3.1') || model.includes('3.0') || model.includes('veo') || model.includes('lyria') || model.includes('narwhal')) {
      return 'global';
    }
    if (configuredLocation) return configuredLocation;
    const envLoc = process.env.GOOGLE_CLOUD_LOCATION || process.env.GCP_LOCATION;
    return envLoc || 'global';
  }

  public async listVoices(language?: string): Promise<GeminiVoiceMetadata[]> {
    if (!language || language === 'auto' || language === 'all') {
      return GEMINI_SUPPORTED_VOICES;
    }
    const target = language.toLowerCase();
    return GEMINI_SUPPORTED_VOICES.filter((v) => v.language.toLowerCase().startsWith(target) || v.language === 'auto');
  }

  private clientCache: Map<string, GoogleGenAI> = new Map();

  private getClient(modelId?: string): GoogleGenAI {
    const apiKey = this.apiKey || EnvConfig.geminiApiKey || process.env.GEMINI_API_KEY;
    if (apiKey) {
      if (!this.clientCache.has('apikey')) {
        this.clientCache.set('apikey', new GoogleGenAI({ apiKey }));
      }
      return this.clientCache.get('apikey')!;
    }

    const projectId = EnvConfig.gcpProjectId || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID;
    const location = GeminiClient.resolveLocationForModel(modelId);
    const cacheKey = `vertex_${projectId}_${location}`;
    if (!this.clientCache.has(cacheKey)) {
      if (projectId) {
        this.clientCache.set(cacheKey, new GoogleGenAI({ vertexai: true, project: projectId, location }));
        Logger.info(`[GeminiClient] Initialized GoogleGenAI client for model "${modelId || 'default'}" at location "${location}" (project: ${projectId})`);
      } else if (this.googleGenAI) {
        return this.googleGenAI;
      } else {
        this.clientCache.set(cacheKey, new GoogleGenAI({}));
      }
    }

    return this.clientCache.get(cacheKey) || this.googleGenAI || new GoogleGenAI({});
  }

  public async generateText(options: { model?: string; prompt: string; systemInstruction?: string; jsonMode?: boolean; grounding?: boolean; tools?: any[]; temperature?: number }): Promise<string> {
    try {
      const res = await this.generateContent(options.prompt, options.model || EnvConfig.geminiModelText, {
        systemPrompt: options.systemInstruction,
        grounding: options.grounding,
        tools: options.tools,
        temperature: options.temperature,
        generationConfig: options.jsonMode && !options.grounding ? { responseMimeType: 'application/json' } : undefined,
      });
      return res.text;
    } catch (err: any) {
      const errMsg = String(err?.message || '');
      const isExhaustedOrNetwork =
        err?.status === 429 ||
        err?.status === 409 ||
        err?.code === 429 ||
        errMsg.includes('429') ||
        errMsg.includes('409') ||
        errMsg.includes('RESOURCE_EXHAUSTED') ||
        errMsg.includes('Resource exhausted') ||
        errMsg.includes('Quota exceeded') ||
        errMsg.includes('quota') ||
        errMsg.includes('fetch failed') ||
        errMsg.includes('ECONNRESET') ||
        errMsg.includes('ETIMEDOUT') ||
        errMsg.includes('ENOTFOUND');

      if (isExhaustedOrNetwork) {
        try {
          const { antigravityClient } = await import('@/integrations/ai/antigravity/AntigravityClient.js');
          const { getDatabaseProvider } = await import('@/database/index.js');
          const db = await getDatabaseProvider();
          const agAccounts = await db.getAntigravityAccounts('ACTIVE');
          if (agAccounts && agAccounts.length > 0) {
            Logger.warn(`[GeminiClient] Gemini call failed (${errMsg}). Offloading Text generation to Antigravity pool...`, 'GeminiClient');
            return await antigravityClient.generateText({
              prompt: options.prompt,
              model: options.model,
              systemInstruction: options.systemInstruction,
              jsonMode: options.jsonMode,
              temperature: options.temperature,
            });
          }
        } catch (agErr: any) {
          Logger.warn(`[GeminiClient] Antigravity offload failed: ${agErr.message}. Preserving original error.`, 'GeminiClient');
        }
      }
      throw err;
    }
  }

  public async generateContentStream(options: { model?: string; contents: any[]; config?: any }): Promise<any> {
    await GeminiClient.applyCooldown();
    const client = this.getClient(options.model);
    return await (client as any).models.generateContentStream({
      model: options.model || EnvConfig.geminiModelAgent || EnvConfig.geminiModelText,
      contents: options.contents,
      config: options.config,
    });
  }

  public async generateContent(prompt: string | any[], modelId: string = EnvConfig.geminiModelText, options: any = {}) {
    return await GeminiClient.executeWithRetry('generateContent', async () => {
      const client = this.getClient(modelId);

      let contents: any[];
      if (Array.isArray(prompt) && prompt.length > 0 && typeof prompt[0] === 'object' && ('role' in prompt[0] || 'parts' in prompt[0])) {
        contents = prompt;
      } else {
        const parts: any[] = Array.isArray(prompt) ? prompt : [{ text: String(prompt) }];

        if (options.image) {
          parts.push({
            inlineData: {
              data: Buffer.isBuffer(options.image) ? options.image.toString('base64') : options.image,
              mimeType: options.mimeType || 'image/png',
            },
          });
        }

        contents = [{ role: 'user', parts }];
      }

      // Safeguard: Ensure contents is never empty or containing only empty parts
      const hasValidContent = contents.some((c: any) => {
        if (!c) return false;
        if (typeof c === 'string') return c.trim().length > 0;
        if (Array.isArray(c.parts)) {
          return c.parts.some((p: any) => {
            if (!p) return false;
            if (typeof p.text === 'string') return p.text.trim().length > 0;
            if (p.inlineData?.data) return p.inlineData.data.length > 0;
            if (p.fileData?.fileUri) return p.fileData.fileUri.length > 0;
            return true;
          });
        }
        return true;
      });

      if (!hasValidContent) {
        throw new Error(`[GeminiClient] Model input cannot be empty: Payload passed to generateContent (${modelId}) has no valid text or media parts.`);
      }

      const response = await (client as any).models.generateContent({
        model: modelId,
        contents,
        config: {
          systemInstruction: options.systemPrompt ? { parts: [{ text: options.systemPrompt }] } : undefined,
          tools: options.grounding ? [{ googleSearch: {} }] : options.tools,
          maxOutputTokens: options.maxTokens || 8192,
          temperature: options.temperature ?? 0.7,
          ...options.generationConfig,
          thinkingConfig: options.thinkingConfig,
        },
      });

      return {
        text: response.text || response.candidates?.[0]?.content?.parts?.[0]?.text || '',
        usage: response.usageMetadata,
        candidates: response.candidates,
        rawResponse: response,
      };
    });
  }

  // Helper to resolve images for Veo API structure
  public async resolveToVeoImage(input: any): Promise<{
    imageBytes: string,
    mediaBytes: string,
    mimeType: string,
  } | undefined> {
    if (!input) return undefined;
    if (typeof input !== 'string') return input; // Already resolved or object

    try {
      let buffer: Buffer;
      let mimeType = 'image/png';

      if (input.startsWith('https://') || input.startsWith('http://')) {
        const response = await axios.get(input, { responseType: 'arraybuffer' });
        buffer = Buffer.from(response.data);
        mimeType = String(response.headers['content-type'] || 'image/png');
      } else if (input.startsWith('data:')) {
        const parts = input.split(',');
        mimeType = parts[0].split(':')[1].split(';')[0];
        buffer = Buffer.from(parts[1], 'base64');
      } else {
        const fileRes = await StorageFactory.getFileBuffer(input);
        buffer = fileRes.buffer;
        if (fileRes.mimeType) {
          mimeType = fileRes.mimeType;
        } else if (input.endsWith('.jpg') || input.endsWith('.jpeg')) {
          mimeType = 'image/jpeg';
        } else if (input.endsWith('.webp')) {
          mimeType = 'image/webp';
        } else if (input.endsWith('.mp4')) {
          mimeType = 'video/mp4';
        }
      }

      if (!buffer || buffer.length === 0) {
        Logger.warn(`[GeminiClient] resolveToVeoImage: empty buffer for ${input}`);
        return undefined;
      }

      const base64Data = buffer.toString('base64');
      return {
        imageBytes: base64Data,
        mediaBytes: base64Data,
        mimeType,
      };
    } catch (err: any) {
      Logger.warn(`[GeminiClient] Failed to resolve reference media: ${err.message}`);
      return undefined;
    }
  }

  /**
   * Adaptive Image Extractor:
   * Delegates to EntityNormalizer.extractImageFromResponse for unified handling across providers
   */
  public extractImageFromGeminiResponse(response: any): { url: string; mimeType: string; buffer?: Buffer } | null {
    return EntityNormalizer.extractImageFromResponse(response);
  }

  /**
   * Adaptive Video Extractor:
   * Delegates to EntityNormalizer.extractVideoFromResponse for unified handling across providers
   */
  public extractVideoFromGeminiResponse(response: any): { url: string; mimeType: string; buffer?: Buffer } | null {
    return EntityNormalizer.extractVideoFromResponse(response);
  }

  public async generateImage(
    promptOrOptions: string | { prompt: string; model?: string; aspectRatio?: '1:1' | '9:16' | '16:9'; imageInputs?: string[]; characterReferences?: string[]; referenceImages?: string[]; characterImages?: string[]; image?: string; imageStart?: string; parameters?: any },
    modelId?: string,
    options: any = {}
  ): Promise<{ url: string; mimeType: string } | null> {
    try {
      const isStringPrompt = typeof promptOrOptions === 'string';
      const prompt = isStringPrompt ? promptOrOptions : promptOrOptions.prompt;
      const opts = isStringPrompt ? options : { ...promptOrOptions, ...options };
      const selectedModel = (isStringPrompt ? modelId : promptOrOptions.model) || EnvConfig.geminiModelImage;

      // If an old imagen-* model is requested, migrate to gemini-3.1-flash-image
      const targetModel = selectedModel.startsWith('imagen-') ? (EnvConfig.geminiModelImage || 'gemini-3.1-flash-image') : selectedModel;
      const client = this.getClient(targetModel);

      // 1. Collect all potential reference images (up to 4 supported by Gemini API)
      const rawImages = [
        ...(opts.imageInputs || []),
        ...(opts.referenceImages || []),
        ...(opts.characterReferences || []),
        ...(opts.characterImages || []),
        opts.image,
        opts.imageStart,
      ].filter(Boolean);

      const uniqueImages = [...new Set(rawImages)].slice(0, 4);
      const resolvedImages: Array<{ inlineData: { data: string; mimeType: string } }> = [];

      if (uniqueImages.length > 0) {
        Logger.info(`[GeminiClient] Resolving ${uniqueImages.length} reference images for image generation...`);
        for (const img of uniqueImages) {
          const resolved = await this.resolveToVeoImage(img);
          if (resolved?.mediaBytes) {
            resolvedImages.push({
              inlineData: {
                data: resolved.mediaBytes,
                mimeType: resolved.mimeType || 'image/png',
              },
            });
          }
        }
        Logger.info(`[GeminiClient] Successfully resolved ${resolvedImages.length} reference images.`);
      }

      let imageResult: { url: string; mimeType: string } | null = null;

      // 2. Multimodal Image Generation via Gemini generateContent API
      try {
        Logger.info(`[GeminiClient] Using generateContent() for image generation (${targetModel}) with ${resolvedImages.length} reference images`);

        const parts: any[] = [
          ...resolvedImages,
          ...(Array.isArray(prompt) ? prompt : [{ text: String(prompt) }]),
        ];

        const response = await GeminiClient.executeWithRetry('generateContent:IMAGE', async () => {
          return await client.models.generateContent({
            model: targetModel,
            contents: [{ role: 'user', parts }],
            config: { responseModalities: ['IMAGE'] },
          });
        });

        imageResult = this.extractImageFromGeminiResponse(response);

        if (imageResult) {
          return imageResult;
        }

        const responseParts = response?.candidates?.[0]?.content?.parts || [];
        const textMsg = responseParts.map((p: any) => p.text).filter(Boolean).join(' ');
        throw new Error(`No image data in Gemini response (received text: "${textMsg.slice(0, 150)}")`);
      } catch (contentErr: any) {
        throw contentErr;
      }
    } catch (error: any) {
      Logger.error(`[GeminiClient] generateImage failed: ${error.message}`);
      return null;
    }
  }

  public async generateVideo(prompt: string, modelId: string = EnvConfig.geminiModelVideo, options: any = {}): Promise<{ url?: string; mimeType?: string; sceneId?: string; statusUrl?: string; jobId?: string; status?: string } | null> {
    // Dispatch to dedicated generateOmniVideo when model is omni
    if (modelId && modelId.toLowerCase().includes('omni')) {
      return this.generateOmniVideo(prompt, {
        modelId,
        startFrame: options.imageStart || options.image,
        endFrame: options.imageEnd,
        referenceImages: options.characterImages || options.characterReferences || options.referenceImages,
        preferences: {
          aspectRatio: options.aspectRatio,
          durationSeconds: Number(options.durationSeconds) > 10 ? 10 : Number(options.durationSeconds),
          resolution: options.resolution,
          generateAudio: options.generateAudio,
          personGeneration: options.personGeneration,
        },
        async: options.async,
      });
    }

    try {
      const client = this.getClient(modelId);
      const genConfig: any = {};
      if (options.aspectRatio) genConfig.aspectRatio = options.aspectRatio;
      if (options.resolution) genConfig.resolution = options.resolution;
      // Normalize duration: Google Veo strictly supports 4, 6, or 8 seconds as numbers
      const rawDuration = Number(options.durationSeconds || options.duration) || 6;
      const normalizedDuration = rawDuration <= 4 ? 4 : rawDuration >= 8 ? 8 : 6;
      genConfig.durationSeconds = normalizedDuration;

      // RESOLVE ALL IMAGES UPFRONT
      const resolvedOptions = { ...options };
      Logger.info(`Starting image resolution for video generation...`, 'GeminiClient');
      
      if (options.imageStart || options.image) {
        Logger.info(`Resolving imageStart/image: ${options.imageStart || options.image}`, 'GeminiClient');
        resolvedOptions.imageStart = await this.resolveToVeoImage(options.imageStart || options.image);
        resolvedOptions.image = resolvedOptions.imageStart;
        if(!resolvedOptions.imageStart){
          throw new Error('Failed to resolve start frame');
        }
      }

      if (options.imageEnd) {
        Logger.info(`Resolving imageEnd: ${options.imageEnd}`, 'GeminiClient');
        resolvedOptions.imageEnd = await this.resolveToVeoImage(options.imageEnd);
        if(!resolvedOptions.imageEnd){
          throw new Error('Failed to resolve end frame');
        }
      }

      const charRefs = options.characterImages || options.characterReferences || [];
      Logger.info(`[GeminiClient] Found ${charRefs.length} character references to resolve.`, 'GeminiClient');
      if (Array.isArray(charRefs) && charRefs.length > 0) {
        const resolvedChars = await Promise.all(charRefs.map(async (img, idx) => {
          Logger.info(`[GeminiClient] Resolving character image [${idx}]: ${img}`, 'GeminiClient');
          return await this.resolveToVeoImage(img);
        }));
        resolvedOptions.characterImages = resolvedChars.filter(img => !!img);
        resolvedOptions.characterReferences = resolvedOptions.characterImages;
        Logger.info(`[GeminiClient] Successfully resolved ${resolvedOptions.characterImages.length} character images.`, 'GeminiClient');
      }

      // Interpolation (lastFrame)
      if (resolvedOptions.imageEnd) {
        genConfig.lastFrame = {
          imageBytes: resolvedOptions.imageEnd.imageBytes || resolvedOptions.imageEnd.mediaBytes,
          mimeType: resolvedOptions.imageEnd.mimeType || 'image/png',
        };
      }

      // Reference Images (R2V) - Only if not using I2V interpolation (lastFrame)
      if (!genConfig.lastFrame && resolvedOptions.characterImages && Array.isArray(resolvedOptions.characterImages) && resolvedOptions.characterImages.length > 0) {
        genConfig.referenceImages = resolvedOptions.characterImages.map((img: any) => ({
          image: {
            imageBytes: img.imageBytes || img.mediaBytes,
            mimeType: img.mimeType || 'image/png',
          },
          referenceType: 'asset',
        }));
      }

      // Build modern source parameter required by Google GenAI SDK
      const sourceInput: any = { prompt };
      const startImage = resolvedOptions.imageStart || resolvedOptions.image;
      if (startImage && (!genConfig.referenceImages || genConfig.referenceImages.length === 0)) {
        sourceInput.image = {
          imageBytes: startImage.imageBytes || startImage.mediaBytes,
          mimeType: startImage.mimeType || 'image/png',
        };
      }

      const generateParams: any = {
        model: modelId,
        source: sourceInput,
      };

      if (Object.keys(genConfig).length > 0) generateParams.config = genConfig;

      let operation: any = await GeminiClient.executeWithRetry('generateVideo', async () => {
        return await (client as any).models.generateVideos(generateParams);
      });

      if (options.async) {
        return { jobId: operation.name, status: 'pending' };
      }

      const maxPolls = 60;
      let pollCount = 0;
      while (!operation.done && pollCount < maxPolls) {
        await new Promise((resolve) => setTimeout(resolve, 10000));
        operation = await (client as any).operations.getVideosOperation({ operation });
        pollCount++;
      }

      if (!operation.done) throw new Error('Video generation timed out after 10 minutes');

      if (operation.error) {
        const errorMsg = (operation.error as any).message || JSON.stringify(operation.error);
        Logger.error(`[GeminiClient] Veo operation failed: ${errorMsg}`);
        throw new Error(`Veo video generation error: ${errorMsg}`);
      }

      const extractedVideo = EntityNormalizer.extractVideoFromResponse(operation?.response || operation);
      if (extractedVideo) {
        return {
          url: extractedVideo.url,
          mimeType: extractedVideo.mimeType || 'video/mp4',
        };
      }
      throw new Error('No video URI or bytes in Veo response');
    } catch (error: any) {
      Logger.error(`[GeminiClient] generateVideo failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Dedicated Omni Video Generation (gemini-omni-1.1-flash)
   * Supports prompt tags (<FIRST_FRAME>, <LAST_FRAME>, <IMAGE_REF_0>, ...)
   * and preferences (aspectRatio, durationSeconds, generateAudio, resolution)
   * Reference: https://ai.google.dev/gemini-api/docs/omni
   */
  public async generateOmniVideo(
    prompt: string,
    options: GeminiOmniVideoOptions = {}
  ): Promise<GeminiOmniVideoResult | null> {
    try {
      const modelId = options.modelId || 'gemini-omni-1.1-flash';
      const client = this.getClient(modelId);

      const prefs = options.preferences || {};
      const genConfig: any = {
        aspectRatio: prefs.aspectRatio || '9:16',
        durationSeconds: String(prefs.durationSeconds || 10),
        generateAudio: prefs.generateAudio !== false,
        resolution: prefs.resolution || '720p',
      };
      if (prefs.personGeneration) {
        genConfig.personGeneration = prefs.personGeneration;
      }

      // Resolve Start Frame (<FIRST_FRAME>)
      let resolvedStartFrame: any = null;
      if (options.startFrame) {
        resolvedStartFrame = await this.resolveToVeoImage(options.startFrame);
      }

      // Resolve End Frame (<LAST_FRAME>)
      let resolvedEndFrame: any = null;
      if (options.endFrame) {
        resolvedEndFrame = await this.resolveToVeoImage(options.endFrame);
        genConfig.lastFrame = resolvedEndFrame;
      }

      // Resolve Reference Images (<IMAGE_REF_0>, <IMAGE_REF_1>, ...)
      const resolvedReferences: any[] = [];
      if (Array.isArray(options.referenceImages) && options.referenceImages.length > 0) {
        for (let i = 0; i < options.referenceImages.length; i++) {
          const resolved = await this.resolveToVeoImage(options.referenceImages[i]);
          if (resolved) {
            resolvedReferences.push({
              image: resolved,
              referenceType: 'asset',
              tag: `<IMAGE_REF_${i}>`,
            });
          }
        }
      }
      if (resolvedReferences.length > 0) {
        genConfig.referenceImages = resolvedReferences;
      }

      // Assemble tags in prompt if not present
      let taggedPrompt = prompt;
      if (resolvedStartFrame && !taggedPrompt.includes('<FIRST_FRAME>')) {
        taggedPrompt = `<FIRST_FRAME> ${taggedPrompt}`;
      }
      if (resolvedEndFrame && !taggedPrompt.includes('<LAST_FRAME>')) {
        taggedPrompt = `${taggedPrompt} transitioning to <LAST_FRAME>`;
      }
      if (resolvedReferences.length > 0 && !taggedPrompt.includes('<IMAGE_REF_')) {
        const tags = resolvedReferences.map((r) => r.tag).join(', ');
        taggedPrompt = `${taggedPrompt} [Character References: ${tags}]`;
      }

      Logger.info(`[GeminiClient.generateOmniVideo] Model: ${modelId}, Prompt: ${taggedPrompt}`, 'GeminiClient');

      const generateParams: any = {
        model: modelId,
        prompt: taggedPrompt,
        config: genConfig,
      };
      if (resolvedStartFrame) {
        generateParams.image = resolvedStartFrame;
      }

      let operation: any = await GeminiClient.executeWithRetry('generateOmniVideo', async () => {
        return await (client as any).models.generateVideos(generateParams);
      });

      if (options.async) {
        return { jobId: operation.name, status: 'pending' };
      }

      const maxPolls = 60;
      let pollCount = 0;
      while (!operation.done && pollCount < maxPolls) {
        await new Promise((resolve) => setTimeout(resolve, 10000));
        operation = await (client as any).operations.getVideosOperation({ operation });
        pollCount++;
      }

      if (!operation.done) throw new Error('Omni video generation timed out after 10 minutes');

      const extractedVideo = EntityNormalizer.extractVideoFromResponse(operation?.response || operation);
      if (extractedVideo) {
        return {
          url: extractedVideo.url,
          mimeType: extractedVideo.mimeType || 'video/mp4',
        };
      }
      throw new Error('No video URI or bytes in Gemini Omni response');
    } catch (error: any) {
      Logger.error(`[GeminiClient] generateOmniVideo failed: ${error.message}`);
      return null;
    }
  }

  public async generateAudio(text: string, voiceId: string = 'Puck', modelId: string = EnvConfig.geminiModelVoice, options: any = {}): Promise<{ url: string; mimeType: string; durationSeconds: number }> {
    try {
      const client = this.getClient(modelId);
      let speechConfig: any;
      let finalText = text;

      if (options.multiSpeaker && options.multiSpeaker.enabled && Array.isArray(options.multiSpeaker.speakers) && options.multiSpeaker.speakers.length > 0) {
        const speakers = options.multiSpeaker.speakers;
        const speakerNames = speakers.map((_: any, i: number) => `Speaker ${i + 1}`);
        const intro = `TTS the following conversation between ${speakerNames.join(' and ')}:`;
        const lines = text.split('\n').filter((l) => l.trim().length > 0);
        const mappedLines = lines.map((line, idx) => {
          const sName = speakerNames[idx % speakerNames.length];
          return `${sName}: ${line.trim()}`;
        });
        finalText = [intro, ...mappedLines].join('\n');
        speechConfig = {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: speakers.map((s: any, idx: number) => ({
              speaker: `Speaker ${idx + 1}`,
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: s.voice_id || s.voiceId || voiceId },
              },
            })),
          },
        };
      } else {
        speechConfig = {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voiceId,
            },
          },
        };

        const styleInstructions: string[] = [];
        if (options.emotion) {
          styleInstructions.push(options.emotion);
        }
        if (options.speech_tone) {
          styleInstructions.push(options.speech_tone);
        }
        if (options.speed && options.speed !== 1.0) {
          styleInstructions.push(options.speed > 1.0 ? `fast tempo (${options.speed}x)` : `slow tempo (${options.speed}x)`);
        }
        if (options.pitch && options.pitch !== 0) {
          styleInstructions.push(options.pitch > 0 ? `high pitch (+${options.pitch})` : `low pitch (${options.pitch})`);
        }
        if (styleInstructions.length > 0) {
          finalText = `(Tone: ${styleInstructions.join(', ')})\n${text}`;
        }
      }

      let response: any = await GeminiClient.executeWithRetry('generateAudio', async () => {
        return await (client as any).models.generateContent({
          model: modelId,
          contents: [{ role: 'user', parts: [{ text: finalText }] }],
          config: { responseModalities: ['AUDIO'], speechConfig },
        });
      });

      let candidate = response?.candidates?.[0];
      let parts = candidate?.content?.parts || [];
      let audioPart = parts.find((p: any) => p?.inlineData?.data || p?.inline_data?.data);
      let base64 = audioPart?.inlineData?.data || audioPart?.inline_data?.data;
      let mimeType = audioPart?.inlineData?.mimeType || audioPart?.inline_data?.mimeType || 'audio/L16;rate=24000';

      // Fallback: If styled prompt produced no audio (e.g. finishReason OTHER/SAFETY), retry once with clean dialogue text
      if (!base64 && finalText !== text) {
        Logger.warn(`[GeminiClient] generateAudio: Styled prompt produced no audio (finishReason: ${candidate?.finishReason}). Retrying with plain dialogue text...`);
        response = await GeminiClient.executeWithRetry('generateAudio-clean-fallback', async () => {
          return await (client as any).models.generateContent({
            model: modelId,
            contents: [{ role: 'user', parts: [{ text }] }],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: voiceId },
                },
              },
            },
          });
        });
        candidate = response?.candidates?.[0];
        parts = candidate?.content?.parts || [];
        audioPart = parts.find((p: any) => p?.inlineData?.data || p?.inline_data?.data);
        base64 = audioPart?.inlineData?.data || audioPart?.inline_data?.data;
        mimeType = audioPart?.inlineData?.mimeType || audioPart?.inline_data?.mimeType || 'audio/L16;rate=24000';
      }

      if (!base64) {
        Logger.error(`[GeminiClient] generateAudio failed: finishReason=${candidate?.finishReason}, partsCount=${parts.length}, candidate=${JSON.stringify(candidate)}`);
        throw new Error('No audio data returned from Gemini TTS API');
      }

      let durationSeconds = 0;

      // PCM → WAV conversion
      if (mimeType.toLowerCase().includes('l16') || mimeType.toLowerCase().includes('pcm')) {
        try {
          const audioBuffer = Buffer.from(base64, 'base64');
          const sampleRate = 24000;
          const numChannels = 1;
          durationSeconds = Math.round((audioBuffer.length / (sampleRate * numChannels * 2)) * 100) / 100;

          const wavBuffer = Buffer.allocUnsafe(44 + audioBuffer.length);
          wavBuffer.write('RIFF', 0);
          wavBuffer.writeUInt32LE(36 + audioBuffer.length, 4);
          wavBuffer.write('WAVE', 8);
          wavBuffer.write('fmt ', 12);
          wavBuffer.writeUInt32LE(16, 16);
          wavBuffer.writeUInt16LE(1, 20);
          wavBuffer.writeUInt16LE(numChannels, 22);
          wavBuffer.writeUInt32LE(sampleRate, 24);
          wavBuffer.writeUInt32LE(sampleRate * numChannels * 2, 28);
          wavBuffer.writeUInt16LE(numChannels * 2, 32);
          wavBuffer.writeUInt16LE(16, 34);
          wavBuffer.write('data', 36);
          wavBuffer.writeUInt32LE(audioBuffer.length, 40);
          audioBuffer.copy(wavBuffer, 44);
          base64 = wavBuffer.toString('base64');
          mimeType = 'audio/wav';
        } catch (e: any) {
          Logger.warn(`[GeminiClient] Failed to add WAV header: ${e.message}`);
        }
      }

      return { url: `data:${mimeType};base64,${base64}`, mimeType, durationSeconds };
    } catch (error: any) {
      Logger.error(`[GeminiClient] generateAudio failed: ${error.message}`);
      throw error;
    }
  }

  public async generateMusic(prompt: string, modelId: string = EnvConfig.geminiModelMusic, options: any = {}): Promise<{ url: string; mimeType: string }> {
    try {
      const client = this.getClient(modelId);
      const isVertex = !!(client as any).project || !!(client as any).vertexai;

      if (isVertex) {
        Logger.info(`[GeminiClient] Using Vertex Interactions API for music generation: ${modelId}`);
        const interaction = await (client as any).interactions.create({
          model: modelId,
          input: prompt,
        });

        let generatedAudio = interaction.outputAudio || interaction.output_audio;
        if (!generatedAudio && Array.isArray(interaction.outputs)) {
          const audioOutput = interaction.outputs.find((out: any) => out.data && (out.mime_type?.startsWith('audio/') || out.mimeType?.startsWith('audio/')));
          if (audioOutput) {
            generatedAudio = {
              data: audioOutput.data,
              mime_type: audioOutput.mime_type || audioOutput.mimeType || 'audio/mp3',
            };
          }
        }

        if (!generatedAudio) {
          throw new Error('No audio data returned from Lyria via interactions');
        }

        return {
          url: `data:${generatedAudio.mime_type || 'audio/mp3'};base64,${generatedAudio.data}`,
          mimeType: generatedAudio.mime_type || 'audio/mp3',
        };
      } else {
        Logger.info(`[GeminiClient] Using Gemini/AI Studio generateContent API for music generation: ${modelId}`);
        const response = await (client as any).models.generateContent({
          model: modelId,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: 'Puck',
                },
              },
            },
          },
        });

        const part = response.candidates?.[0]?.content?.parts?.[0];
        const base64 = part?.inlineData?.data;
        const mimeType = part?.inlineData?.mimeType || 'audio/mp3';

        if (!base64) {
          throw new Error('No audio data returned from Lyria via generateContent');
        }

        return {
          url: `data:${mimeType};base64,${base64}`,
          mimeType,
        };
      }
    } catch (error: any) {
      Logger.error(`[GeminiClient] generateMusic failed: ${error.message}`);
      throw error;
    }
  }

  public async connectLive(config: {
    model?: string;
    systemInstruction?: string;
    generationConfig?: any;
    contextWindowCompression?: any;
    sessionResumption?: any;
    tools?: any[];
    callbacks: {
      onopen?: (session?: any) => void | Promise<void>;
      onmessage?: (msg: any) => void;
      onerror?: (err: any) => void;
      onclose?: (event: any) => void;
    };
  }) {
    const model = config.model || EnvConfig.geminiModelVoice;
    const client = this.getClient(model);

    try {
      const session = await (client as any).live.connect({
        model: model,
        config: {
          systemInstruction: config.systemInstruction,
          responseModalities: config.generationConfig?.responseModalities,
          speechConfig: config.generationConfig?.speechConfig,
          tools: config.tools,
          enableAffectiveDialog: true,
          contextWindowCompression: config.contextWindowCompression,
          sessionResumption: config.sessionResumption,
          realtimeInputConfig: {
            automaticActivityDetection: {
              disabled: true,
            },
          },
        },
        callbacks: config.callbacks,
      });

      return { session };
    } catch (error: any) {
      Logger.error(`[GeminiClient] Live connection failed: ${error.message}`);
      throw error;
    }
  }

  public async uploadFile(filePath: string, mimeType: string, displayName?: string) {
    const client = this.getClient();
    return await (client as any).files.upload({
      file: filePath,
      config: { mimeType, displayName: displayName || filePath.split('/').pop() },
    });
  }

  public async waitForFileActive(fileIdOrUri: string) {
    const client = this.getClient();
    const fileName = fileIdOrUri.includes('/') ? (fileIdOrUri.startsWith('http') ? `files/${fileIdOrUri.split('/').pop()}` : fileIdOrUri) : `files/${fileIdOrUri}`;
    let file = await (client as any).files.get({ name: fileName });
    while (file.state === FileState.PROCESSING) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      file = await (client as any).files.get({ name: fileName });
    }
    if (file.state === FileState.FAILED) throw new Error('Gemini File API processing failed');
    return file;
  }

  public async deleteFile(fileIdOrUri: string) {
    const client = this.getClient();
    const fileName = fileIdOrUri.includes('/') ? (fileIdOrUri.startsWith('http') ? `files/${fileIdOrUri.split('/').pop()}` : fileIdOrUri) : `files/${fileIdOrUri}`;
    await (client as any).files.delete({ name: fileName });
    return true;
  }
}

export const geminiClient = GeminiClient.getInstance();
