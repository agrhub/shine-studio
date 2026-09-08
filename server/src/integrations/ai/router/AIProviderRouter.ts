import axios from 'axios';
import { geminiClient, GEMINI_SUPPORTED_VOICES } from '../gemini/GeminiClient.js';
import { flowAdapter } from '../flow/FlowAdapter.js';
import { antigravityClient } from '../antigravity/AntigravityClient.js';
import { antigravityOAuthService } from '../antigravity/AntigravityOAuthService.js';
import { getDatabaseProvider } from '@/database/index.js';
import { AIAccountStatus, AIAccountType, IAIAccount } from '~/types.js';
import { Logger } from '@/utils/logger.js';
import { EnvConfig } from '@/config/env.js';
import type { StudioSystemConfig } from '@/types.js';
import { flowServiceClient } from '../flow/FlowServiceClient.js';

export interface RouteGenerationOptions {
  userTier?: 'FREE' | 'PRO' | 'ENTERPRISE';
  mode?: 'DRAFT_STORYBOARD' | 'COMMERCIAL_EXPORT';
  prompt: string;
  type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'VOICE' | 'MUSIC';
  aspectRatio?: '9:16' | '1:1' | '16:9' | '4:3';
  model?: string;
  jsonMode?: boolean;
  systemInstruction?: string;
  characterReferences?: string[];
  imageInputs?: string[];
  imageStart?: string;
  imageEnd?: string;
  extraOptions?: any;
}

export class AIProviderRouter {
  private textRequestCounter = 0;
  /**
   * Routes AI requests:
   * Uses Google Flow Account pool for Image and Video if available.
   * If Flow generation fails or no Flow accounts are available, falls back to GeminiClient.
   */
  private async routeGeneration(options: RouteGenerationOptions) {
    const isCommercial = options.userTier === 'ENTERPRISE' || options.mode === 'COMMERCIAL_EXPORT';

    if (isCommercial || options.type === 'TEXT') {
      Logger.info(`[AIProviderRouter] Routing request (Type: ${options.type}, Mode: ${options.mode || 'DEFAULT'}, Tier: ${options.userTier || 'FREE'})`);
    }
    
    const db = await getDatabaseProvider();
    let isWorkerOnline = await flowServiceClient.hasActiveWorkers();
    if (!isWorkerOnline) {
      const isServerUp = await flowServiceClient.isWorkerHealthy();
      if (isServerUp) {
        Logger.info('[AIProviderRouter] Flow Worker server is online. Waiting up to 3.5s for connected Flow tab...');
        isWorkerOnline = await flowServiceClient.waitForActiveWorker(3500);
        if (isWorkerOnline) {
          Logger.info('[AIProviderRouter] ✅ Flow tab connected successfully to worker.');
        } else {
          Logger.warn('[AIProviderRouter] ⚠️ Flow Worker server is running, but 0 Google Flow tabs are currently connected (WebSocket inactive).');
        }
      } else {
        Logger.info('[AIProviderRouter] Flow Worker service is offline (localhost:8088 unreachable).');
      }
    }
    if (options.type === 'IMAGE') {
      try {
        const flowAccounts = await db.getFlowAccounts('ACTIVE');
        const bestAccount = flowAccounts && flowAccounts.length > 0
          ? [...flowAccounts].sort((a, b) => (b.credits_remaining || 0) - (a.credits_remaining || 0))[0]
          : null;
        
        if (isWorkerOnline || (bestAccount && bestAccount.session_token)) {
          const accountEmail = isWorkerOnline ? 'flow-worker-fleet' : (bestAccount?.email || 'flow-worker-fleet');
          Logger.info(`[AIProviderRouter] Prioritizing Google Flow Pool for Image (${options.model}) (Account: ${accountEmail}, Worker Online: ${isWorkerOnline})`);
          
          const flowAccountAdapterParam: IAIAccount = {
            id: bestAccount?.id || 'flow-worker',
            email: accountEmail,
            session_token: bestAccount?.session_token || 'flow-worker-session',
            access_token: bestAccount?.access_token,
            project_id: bestAccount?.project_id,
            status: AIAccountStatus.READY,
            credits: bestAccount?.credits_remaining ?? 100,
            account_type: AIAccountType.GOOGLE_FLOW,
            is_active: true,
          };

          const imageInputs = options.imageInputs || (options.characterReferences?.length ? options.characterReferences : []);
          const flowResult: any = await flowAdapter.generateImage(
            flowAccountAdapterParam as any,
            options.prompt,
            String(options.model),
            {
              aspectRatio: options.aspectRatio === '1:1' ? '1:1' : options.aspectRatio === '16:9' ? '16:9' : '9:16',
              imageInputs,
            }
          );

          if (flowResult) {
            if (flowResult.buffer) {
              const base64 = flowResult.buffer.toString('base64');
              const mime = flowResult.mimeType || 'image/png';
              return {
                provider: `Google Flow (${options.model})`,
                url: `data:${mime};base64,${base64}`,
                mimeType: mime,
                buffer: flowResult.buffer,
              };
            }
            if (flowResult.url) {
              return {
                provider: `Google Flow (${options.model})`,
                url: flowResult.url,
                mimeType: flowResult.mimeType || 'image/jpeg',
              };
            }
          }
        }
      } catch (flowErr: any) {
        Logger.warn(`[AIProviderRouter] Flow image generation failed (${flowErr.message}), falling back to Gemini Imagen.`);
      }

      // Fallback to GeminiClient
      Logger.info(`[AIProviderRouter] Generating Image via GeminiClient (${options.model})`);
      const imageResult = await geminiClient.generateImage(
        options.prompt,
        String(options.model),
        {
          aspectRatio: options.aspectRatio || '9:16',
          systemPrompt: options.systemInstruction,
          imageInputs: options.imageInputs,
          characterReferences: options.characterReferences,
        }
      );

      if (!imageResult) {
        throw new Error('All image generation providers (Flow & Gemini) failed to generate an image.');
      }

      return {
        provider: 'Gemini',
        url: imageResult.url,
        mimeType: imageResult.mimeType || 'image/png',
      };
    }

    if (options.type === 'VIDEO') {
      try {
        const flowAccounts = await db.getFlowAccounts('ACTIVE');
        const bestAccount = flowAccounts && flowAccounts.length > 0
          ? [...flowAccounts].sort((a, b) => (b.credits_remaining || 0) - (a.credits_remaining || 0))[0]
          : null;

        if (isWorkerOnline || (bestAccount && bestAccount.session_token)) {
          const accountEmail = isWorkerOnline ? 'flow-worker-fleet' : (bestAccount?.email || 'flow-worker-fleet');
          Logger.info(`[AIProviderRouter] Prioritizing Google Flow Pool for Video (${options.model}) (Account: ${accountEmail}, Worker Online: ${isWorkerOnline})`);
          
          const flowAccountAdapterParam: IAIAccount = {
            id: bestAccount?.id || 'flow-worker',
            email: accountEmail,
            session_token: bestAccount?.session_token || 'flow-worker-session',
            access_token: bestAccount?.access_token,
            project_id: bestAccount?.project_id,
            status: AIAccountStatus.READY,
            credits: bestAccount?.credits_remaining ?? 100,
            account_type: AIAccountType.GOOGLE_FLOW,
            is_active: true,
          };

          const flowResult: any = await flowAdapter.generateVideo(
            flowAccountAdapterParam as any,
            options.prompt,
            String(options.model),
            {
              aspectRatio: options.aspectRatio === '1:1' ? '1:1' : options.aspectRatio === '16:9' ? '16:9' : '9:16',
              characterReferences: options.imageEnd ? [] : (options.characterReferences || []), // ignore reference images if start + end frame are provided
              imageStart: options.imageStart,
              imageEnd: options.imageEnd,
              durationSeconds: options.extraOptions?.duration || options.extraOptions?.durationSeconds || 5,
            }
          );

          if (flowResult) {
            const videoUrl = typeof flowResult === 'string' ? flowResult : (flowResult.url || flowResult.videoUrl);
            return {
              provider: `Google Flow (${options.model})`,
              url: videoUrl,
              data: flowResult,
            };
          }
        }
      } catch (flowErr: any) {
        Logger.warn(`[AIProviderRouter] Flow video generation failed (${flowErr.message}), falling back to GeminiClient.`);
      }

      // Fallback to GeminiClient
      Logger.info(`[AIProviderRouter] Generating Video via GeminiClient (${options.model})`);
      const videoResult: any = await geminiClient.generateVideo(options.prompt, options.model, {
        aspectRatio: options.aspectRatio === '1:1' ? '1:1' : options.aspectRatio === '16:9' ? '16:9' : '9:16',
        characterReferences: options.imageEnd ? [] : (options.characterReferences || []), // ignore reference images if start + end frame are provided
        imageStart: options.imageStart,
        imageEnd: options.imageEnd,
        durationSeconds: options.extraOptions?.duration || options.extraOptions?.durationSeconds,
      });

      const finalUrl = videoResult?.url || videoResult?.videoUrl || (typeof videoResult === 'string' ? videoResult : '');
      return {
        provider: 'Gemini (Veo)',
        url: finalUrl,
        mimeType: videoResult?.mimeType || 'video/mp4',
        data: videoResult,
      };
    }

    if (options.type === 'MUSIC') {
      Logger.info(`[AIProviderRouter] Generating Music AI score for: "${options.prompt.slice(0, 60)}..."`);
      try {
        const musicResult = await geminiClient.generateMusic(options.prompt);
        if (musicResult && musicResult.url) {
          return {
            provider: 'Gemini Lyria Music AI',
            url: musicResult.url,
            mimeType: musicResult.mimeType || 'audio/mp3',
            data: musicResult,
          };
        }
      } catch (err: any) {
        Logger.warn(`[AIProviderRouter] Music generation error: ${err.message}`);
      }

      return {
        provider: 'AI Audio Synthesizer',
        url: '',
        mimeType: 'audio/mp3',
        data: null,
      };
    }

    if (options.type === 'VOICE') {
      Logger.info(`[AIProviderRouter] Generating Voice synthesis for voice "${options.model || 'default'}"`);
      const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
      const isGeminiVoice = GEMINI_SUPPORTED_VOICES.some(
        (v) => v.id.toLowerCase() === (options.model || '').toLowerCase()
      );

      // 1. Try ElevenLabs if configured and voiceId is not a Gemini native preset
      if (elevenLabsKey && options.model && !isGeminiVoice) {
        try {
          const ttsRes = await axios.post(
            `https://api.elevenlabs.io/v1/text-to-speech/${options.model}`,
            {
              text: options.prompt,
              model_id: 'eleven_multilingual_v2',
              voice_settings: { stability: 0.5, similarity_boost: 0.75 },
            },
            {
              headers: {
                'xi-api-key': elevenLabsKey,
                'Content-Type': 'application/json',
              },
              responseType: 'arraybuffer',
            }
          );

          if (ttsRes.data) {
            const base64 = Buffer.from(ttsRes.data).toString('base64');
            return {
              provider: 'ElevenLabs',
              url: `data:audio/mp3;base64,${base64}`,
              mimeType: 'audio/mpeg',
              buffer: Buffer.from(ttsRes.data),
              data: ttsRes.data,
            };
          }
        } catch (elevenErr: any) {
          Logger.warn(`[AIProviderRouter] ElevenLabs failed (${elevenErr.message}), falling back to Gemini Native Audio.`);
        }
      }

      // 2. Fallback / Default to Gemini Native Audio catalog
      try {
        const geminiVoiceId = isGeminiVoice ? options.model : (GEMINI_SUPPORTED_VOICES[0]?.id || 'Puck');
        const audioRes = await geminiClient.generateAudio(options.prompt, geminiVoiceId, undefined, options.extraOptions || options);
        if (audioRes && audioRes.url) {
          return {
            provider: 'Gemini Native Audio',
            url: audioRes.url,
            mimeType: audioRes.mimeType || 'audio/wav',
            data: audioRes,
          };
        }
      } catch (err: any) {
        Logger.warn(`[AIProviderRouter] Gemini voice generation error: ${err.message}`);
      }

      return {
        provider: 'AI Voice Synthesizer',
        url: '',
        mimeType: 'audio/wav',
        data: null,
      };
    }

    // Text Generation: Proactive Load Sharing between Antigravity and GeminiClient
    const agAccount = await antigravityOAuthService.getAvailableAccount();
    const shouldTryAntigravityFirst = !!agAccount && (this.textRequestCounter++ % 2 === 0 || !EnvConfig.geminiApiKey);

    if (shouldTryAntigravityFirst && agAccount) {
      try {
        const agText = await antigravityClient.generateText({
          prompt: options.prompt,
          model: options.model,
          systemInstruction: options.systemInstruction,
          jsonMode: options.jsonMode,
          temperature: options.extraOptions?.temperature,
          account: agAccount,
        });

        if (agText) {
          if (options.jsonMode) {
            try {
              this.parseJsonWithRepair(agText);
              return {
                provider: 'Antigravity (Google Cloud Code)',
                data: agText,
              };
            } catch (jsonErr: any) {
              Logger.warn(`[AIProviderRouter] Antigravity primary response was not valid JSON in jsonMode (${jsonErr.message}). Falling back to GeminiClient...`);
            }
          } else {
            return {
              provider: 'Antigravity (Google Cloud Code)',
              data: agText,
            };
          }
        }
      } catch (agErr: any) {
        Logger.warn(`[AIProviderRouter] Antigravity primary load-share attempt failed (${agErr.message}). Falling back to Gemini...`);
      }
    }

    try {
      const text = await geminiClient.generateText({
        prompt: options.prompt,
        model: options.model,
        jsonMode: options.jsonMode,
        systemInstruction: options.systemInstruction,
        temperature: options.extraOptions?.temperature,
      });

      return {
        provider: 'Gemini',
        data: text,
      };
    } catch (geminiErr: any) {
      const causeMsg = geminiErr?.cause ? ` (Cause: ${geminiErr.cause.message || geminiErr.cause.code || geminiErr.cause})` : '';
      const errMsg = String(geminiErr?.message || '') + causeMsg;

      Logger.warn(`[AIProviderRouter] GeminiClient primary attempt failed (${errMsg}). Attempting Antigravity fallback...`);
      const agText = await this.tryAntigravityTextFallback(options);
      if (agText) {
        return {
          provider: 'Antigravity (Google Cloud Code)',
          data: agText,
        };
      }

      Logger.warn(`[AIProviderRouter] Antigravity fallback unavailable or failed. Attempting FlowAdapter fallback...`);
      const flowText = await this.tryFlowTextFallback(options);
      if (flowText) {
        return {
          provider: 'Google Flow (gemini-3-flash-preview)',
          data: flowText,
        };
      }

      throw geminiErr;
    }
  }

  private async tryAntigravityTextFallback(options: RouteGenerationOptions): Promise<string | null> {
    try {
      const db = await getDatabaseProvider();
      const agAccounts = await db.getAntigravityAccounts('ACTIVE');
      if (!agAccounts || agAccounts.length === 0) return null;

      const text = await antigravityClient.generateText({
        prompt: options.prompt,
        model: options.model,
        systemInstruction: options.systemInstruction,
        jsonMode: options.jsonMode,
      });

      if (text) {
        Logger.info(`[AIProviderRouter] Successfully generated Text via Antigravity pool fallback`);
        return text;
      }
    } catch (err: any) {
      Logger.warn(`[AIProviderRouter] tryAntigravityTextFallback error: ${err.message}`);
    }
    return null;
  }

  private async tryFlowTextFallback(options: RouteGenerationOptions): Promise<string | null> {
    try {
      const db = await getDatabaseProvider();
      const flowAccounts = await db.getFlowAccounts('ACTIVE');
      if (!flowAccounts || flowAccounts.length === 0) return null;

      const sortedAccounts = [...flowAccounts].sort((a, b) => (b.credits_remaining || 0) - (a.credits_remaining || 0));

      for (const account of sortedAccounts) {
        if (!account.session_token) continue;
        try {
          const flowAccountAdapterParam: IAIAccount = {
            id: account.id,
            email: account.email,
            session_token: account.session_token,
            access_token: account.access_token,
            project_id: account.project_id,
            status: AIAccountStatus.READY,
            credits: account.credits_remaining,
            account_type: AIAccountType.GOOGLE_FLOW,
            is_active: true,
          };

          const text = await flowAdapter.generateContent(
            flowAccountAdapterParam as any,
            options.prompt,
            {
              model: 'gemini-3-flash-preview',
              systemInstruction: options.systemInstruction,
              jsonMode: options.jsonMode,
            }
          );

          if (text) {
            Logger.info(`[AIProviderRouter] Successfully generated Text via FlowAdapter fallback (${account.email})`);
            return text;
          }
        } catch (accErr: any) {
          Logger.warn(`[AIProviderRouter] FlowAdapter account ${account.email} failed: ${accErr.message}`);
        }
      }
    } catch (err: any) {
      Logger.warn(`[AIProviderRouter] tryFlowTextFallback error: ${err.message}`);
    }
    return null;
  }

  // ─── High-Level Convenience Methods ───────────────────────────────────────────

  async generateText(
    promptOrOptions: string | { prompt: string; model?: string; systemInstruction?: string; jsonMode?: boolean; temperature?: number; [key: string]: any },
    legacyOptions?: { model?: string; systemInstruction?: string; jsonMode?: boolean; temperature?: number; [key: string]: any }
  ): Promise<string> {
    let prompt = '';
    let opts: { model?: string; systemInstruction?: string; jsonMode?: boolean; temperature?: number; [key: string]: any } = {};

    if (typeof promptOrOptions === 'string') {
      prompt = promptOrOptions;
      opts = legacyOptions || {};
    } else if (promptOrOptions && typeof promptOrOptions === 'object') {
      prompt = promptOrOptions.prompt || '';
      opts = promptOrOptions;
    }

    const db = await getDatabaseProvider();
    const studioConfig = (await db.getSystemSetting<StudioSystemConfig>('studio_config')) || {};
    const targetModel = opts.model || studioConfig?.gemini?.textModel || EnvConfig.geminiModelText;

    const res = await this.routeGeneration({
      prompt,
      type: 'TEXT',
      model: targetModel,
      jsonMode: opts.jsonMode,
      systemInstruction: opts.systemInstruction,
      extraOptions: { temperature: opts.temperature },
    });
    return String(res.data || '');
  }

  private extractJsonString(text: string): string {
    const str = text.trim();
    if (!str) return '{}';

    // 1. Try parsing directly if it's already pure JSON
    try {
      JSON.parse(str);
      return str;
    } catch {}

    // 2. Try markdown fenced codeblock(s)
    const codeBlockMatches = [...str.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)];
    for (const match of codeBlockMatches) {
      const candidate = match[1]?.trim();
      if (!candidate) continue;
      try {
        JSON.parse(candidate);
        return candidate;
      } catch {}
      // If candidate has outermost brackets, return it for repair
      if (candidate.startsWith('{') || candidate.startsWith('[')) {
        return candidate;
      }
    }

    // 3. Robust Bracket Balancing to find outermost JSON object or array
    const firstBrace = str.indexOf('{');
    const firstBracket = str.indexOf('[');

    const candidates: string[] = [];

    const balanceBracket = (startIdx: number, openChar: string, closeChar: string): string | null => {
      let depth = 0;
      let inString = false;
      let escape = false;
      for (let i = startIdx; i < str.length; i++) {
        const char = str[i];
        if (escape) {
          escape = false;
          continue;
        }
        if (char === '\\' && inString) {
          escape = true;
          continue;
        }
        if (char === '"') {
          inString = !inString;
          continue;
        }
        if (!inString) {
          if (char === openChar) {
            depth++;
          } else if (char === closeChar) {
            depth--;
            if (depth === 0) {
              return str.substring(startIdx, i + 1).trim();
            }
          }
        }
      }
      return null;
    };

    if (firstBrace !== -1) {
      const objCandidate = balanceBracket(firstBrace, '{', '}');
      if (objCandidate) candidates.push(objCandidate);
    }

    if (firstBracket !== -1) {
      const arrCandidate = balanceBracket(firstBracket, '[', ']');
      if (arrCandidate) candidates.push(arrCandidate);
    }

    // If any candidate parses directly, return it immediately
    for (const cand of candidates) {
      try {
        JSON.parse(cand);
        return cand;
      } catch {}
    }

    // If candidates exist, return the longest candidate for repair
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.length - a.length);
      return candidates[0];
    }

    // 4. Fallback to lastIndex boundary
    const lastBrace = str.lastIndexOf('}');
    const lastBracket = str.lastIndexOf(']');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return str.substring(firstBrace, lastBrace + 1).trim();
    }
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      return str.substring(firstBracket, lastBracket + 1).trim();
    }

    return str;
  }

  private parseJsonWithRepair<T>(rawStr: string, fallbackData?: T): T {
    const extracted = this.extractJsonString(rawStr);

    // 1. Direct parse attempt
    try {
      return JSON.parse(extracted) as T;
    } catch {}

    // 2. Progressive Sanitize and Repair markdown artifacts & syntax flaws
    let repaired = extracted
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/:\s*[_*]+(?=\s*["{\[\d\-tfn])/g, ': ')
      .replace(/:\s*[_*]+"/g, ': "')
      .replace(/"[_*]+(?=[\s,\}\]])/g, '"')
      .replace(/([0-9a-zA-Z\-_]+)[_*]+(?=[\s,\}\]])/g, '$1')
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/([{\s,])([a-zA-Z0-9_-]+)\s*:/g, '$1"$2":')
      .trim();

    try {
      return JSON.parse(repaired) as T;
    } catch {}

    // 3. Try balancing unclosed brackets if truncated
    let openBraces = (repaired.match(/\{/g) || []).length;
    let closeBraces = (repaired.match(/\}/g) || []).length;
    let openBrackets = (repaired.match(/\[/g) || []).length;
    let closeBrackets = (repaired.match(/\]/g) || []).length;

    let balanced = repaired;
    while (closeBrackets < openBrackets) {
      balanced += ']';
      closeBrackets++;
    }
    while (closeBraces < openBraces) {
      balanced += '}';
      closeBraces++;
    }

    try {
      return JSON.parse(balanced) as T;
    } catch {}

    // 4. Return fallbackData if caller provided one
    if (fallbackData !== undefined) {
      return fallbackData;
    }

    // 5. Fallback: throw original JSON.parse error with extracted string for clear debugging
    return JSON.parse(extracted) as T;
  }

  async generateJSON<T>(prompt: string, fallbackData?: T, options?: { model?: string; systemInstruction?: string }): Promise<T> {
    const db = await getDatabaseProvider();
    const studioConfig = (await db.getSystemSetting<StudioSystemConfig>('studio_config')) || {};
    const targetModel = options?.model || studioConfig?.gemini?.textModel || EnvConfig.geminiModelText;

    const baseSysPrompt = options?.systemInstruction?.trim() || '';
    const strictJsonRequirement =
      'CRITICAL REQUIREMENT: Respond ONLY with a valid, raw JSON object or array. ' +
      'Do NOT include markdown code blocks, conversational introductions, greetings, or explanations. ' +
      'Start output directly with { or [ and end with } or ].';
    const systemInstruction = baseSysPrompt
      ? `${strictJsonRequirement}\n\n${baseSysPrompt}`
      : strictJsonRequirement;

    try {
      const res = await this.routeGeneration({
        prompt,
        type: 'TEXT',
        jsonMode: true,
        model: targetModel,
        systemInstruction,
      });
      const rawText = String(res.data || '');
      return this.parseJsonWithRepair<T>(rawText, fallbackData);
    } catch (err: any) {
      // Proactively retry directly with GeminiClient to recover from non-JSON or malformed responses
      try {
        Logger.warn(`[AIProviderRouter] generateJSON parse error (${err.message}). Proactively retrying via GeminiClient...`);
        const geminiText = await geminiClient.generateText({
          prompt,
          model: targetModel,
          jsonMode: true,
          systemInstruction,
        });
        if (geminiText) {
          return this.parseJsonWithRepair<T>(geminiText, fallbackData);
        }
      } catch (retryErr: any) {
        Logger.warn(`[AIProviderRouter] GeminiClient proactive retry also failed: ${retryErr.message}`);
      }

      if (fallbackData !== undefined) {
        Logger.warn(`[AIProviderRouter] generateJSON recovered using fallbackData: ${err.message}`);
        return fallbackData;
      }
      Logger.error(`[AIProviderRouter] generateJSON error: ${err.message}`);
      throw err;
    }
  }

  async generateImage(
    prompt: string,
    options?: {
      aspectRatio?: '9:16' | '1:1' | '16:9' | '4:3';
      model?: string;
      systemPrompt?: string;
      characterReferences?: string[];
      imageInputs?: string[];
    }
  ): Promise<{ url: string; mimeType: string; provider: string; buffer?: Buffer }> {
    const db = await getDatabaseProvider();
    const studioConfig = (await db.getSystemSetting<StudioSystemConfig>('studio_config')) || {};
    const targetModel = options?.model || studioConfig?.gemini?.imageModel || EnvConfig.geminiModelImage;
    const res: any = await this.routeGeneration({
      prompt,
      type: 'IMAGE',
      aspectRatio: options?.aspectRatio || '9:16',
      model: targetModel,
      systemInstruction: options?.systemPrompt,
      characterReferences: options?.characterReferences,
      imageInputs: options?.imageInputs,
    });
    return {
      url: res.url,
      mimeType: res.mimeType || 'image/png',
      provider: res.provider,
      buffer: res.buffer,
    };
  }

  async generateVideo(
    prompt: string,
    options?: {
      aspectRatio?: '9:16' | '1:1' | '16:9';
      model?: string;
      characterReferences?: string[];
      imageInputs?: string[];
      backgroundImageId?: string;
      startFrameUrl?: string;
      endFrameUrl?: string;
      imageStart?: string;
      imageEnd?: string;
      duration?: number;
      extraOptions?: any;
    }
  ): Promise<{ url: string; provider: string; mimeType?: string }> {
    const db = await getDatabaseProvider();
    const studioConfig = (await db.getSystemSetting<StudioSystemConfig>('studio_config')) || {};
    const targetModel = options?.model || studioConfig?.gemini?.videoModel || EnvConfig.geminiModelVideo;
    const res: any = await this.routeGeneration({
      prompt,
      type: 'VIDEO',
      aspectRatio: options?.aspectRatio || '9:16',
      model: targetModel,
      characterReferences: options?.characterReferences,
      imageInputs: options?.imageInputs,
      imageStart: options?.imageStart || options?.startFrameUrl,
      imageEnd: options?.imageEnd || options?.endFrameUrl,
      extraOptions: {
        duration: options?.duration || options?.extraOptions?.duration || 6,
        ...options?.extraOptions,
      },
    });
    return {
      url: res.url || '',
      provider: res.provider,
      mimeType: res.mimeType || 'video/mp4',
    };
  }

  async generateMusic(prompt: string): Promise<{ url: string; mimeType: string; provider: string }> {
    const res: any = await this.routeGeneration({
      prompt,
      type: 'MUSIC',
    });
    return {
      url: res.url || '',
      mimeType: res.mimeType || 'audio/mp3',
      provider: res.provider || 'AI Music Engine',
    };
  }

  async generateAudio(prompt: string, voiceId?: string, options?: any): Promise<{ url: string; mimeType: string; provider: string }> {
    const res: any = await this.routeGeneration({
      prompt,
      type: 'VOICE',
      model: voiceId,
      extraOptions: options,
    });
    return {
      url: res.url || '',
      mimeType: res.mimeType || 'audio/wav',
      provider: res.provider || 'AI Voice Engine',
    };
  }
}

export const aiProviderRouter = new AIProviderRouter();
export const aiClient = aiProviderRouter;
