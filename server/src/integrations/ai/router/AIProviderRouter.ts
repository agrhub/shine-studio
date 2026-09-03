import axios from 'axios';
import { geminiClient, GEMINI_SUPPORTED_VOICES } from '../gemini/GeminiClient.js';
import { flowAdapter } from '../flow/FlowAdapter.js';
import { getDatabaseProvider } from '@/database/index.js';
import { AIAccountStatus, AIAccountType } from '~/types.js';
import { Logger } from '@/utils/logger.js';
import { EnvConfig } from '@/config/env.js';
import type { StudioSystemConfig } from '@/types.js';

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
    if (options.type === 'IMAGE') {
      try {
        const flowAccounts = await db.getFlowAccounts('ACTIVE');

        if (flowAccounts && flowAccounts.length > 0) {
          // Select the account with the most credits
          const bestAccount = [...flowAccounts].sort((a, b) => (b.credits_remaining || 0) - (a.credits_remaining || 0))[0];
          
          if (bestAccount && bestAccount.session_token) {
            Logger.info(`[AIProviderRouter] Prioritizing Google Flow Pool for Image (${options.model}) (Account: ${bestAccount.email}, Credits: ${bestAccount.credits_remaining})`);
            
            const flowAccountAdapterParam = {
              id: bestAccount.id,
              email: bestAccount.email,
              flow_st: bestAccount.session_token,
              flow_at: bestAccount.access_token,
              project_id: bestAccount.project_id,
              status: AIAccountStatus.READY,
              credits: bestAccount.credits_remaining,
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

        if (flowAccounts && flowAccounts.length > 0) {
          const bestAccount = [...flowAccounts].sort((a, b) => (b.credits_remaining || 0) - (a.credits_remaining || 0))[0];
          
          if (bestAccount && bestAccount.session_token) {
            Logger.info(`[AIProviderRouter] Prioritizing Google Flow Pool for Video (${options.model}) (Account: ${bestAccount.email})`);
            
            const flowAccountAdapterParam = {
              id: bestAccount.id,
              email: bestAccount.email,
              flow_st: bestAccount.session_token,
              flow_at: bestAccount.access_token,
              project_id: bestAccount.project_id,
              status: AIAccountStatus.READY,
              credits: bestAccount.credits_remaining,
              account_type: AIAccountType.GOOGLE_FLOW,
              is_active: true,
            };

            const flowResult: any = await flowAdapter.generateVideo(
              flowAccountAdapterParam as any,
              options.prompt,
              String(options.model),
              {
                aspectRatio: options.aspectRatio === '1:1' ? '1:1' : options.aspectRatio === '16:9' ? '16:9' : '9:16',
                characterReferences: options.imageEnd ? [] : (options.characterReferences || []),//ingore reference images if start + end frame are provided
                imageStart: options.imageStart,
                imageEnd: options.imageEnd,
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
        }
      } catch (flowErr: any) {
        Logger.warn(`[AIProviderRouter] Flow video generation failed (${flowErr.message}), falling back to GeminiClient.`);
      }

      // Fallback to GeminiClient
      Logger.info(`[AIProviderRouter] Generating Video via GeminiClient (${options.model})`);
      const videoResult: any = await geminiClient.generateVideo(options.prompt, options.model, {
        aspectRatio: options.aspectRatio === '1:1' ? '1:1' : options.aspectRatio === '16:9' ? '16:9' : '9:16',
        characterReferences: options.imageEnd ? [] : (options.characterReferences || []),//ingore reference images if start + end frame are provided
        imageStart: options.imageStart,
        imageEnd: options.imageEnd,
      });

      return {
        provider: 'Gemini (Veo)',
        url: videoResult?.videoUrl || (typeof videoResult === 'string' ? videoResult : ''),
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

    // Text Generation: GeminiClient with FlowAdapter Fallback on Resource Exhausted (409/429)
    try {
      const text = await geminiClient.generateText({
        prompt: options.prompt,
        model: options.model,
        jsonMode: options.jsonMode,
        systemInstruction: options.systemInstruction,
      });

      return {
        provider: 'Gemini',
        data: text,
      };
    } catch (geminiErr: any) {
      const errMsg = String(geminiErr?.message || '');
      const isResourceExhausted =
        geminiErr?.status === 429 ||
        geminiErr?.status === 409 ||
        geminiErr?.code === 429 ||
        geminiErr?.code === 409 ||
        errMsg.includes('429') ||
        errMsg.includes('409') ||
        errMsg.includes('RESOURCE_EXHAUSTED') ||
        errMsg.includes('Resource exhausted') ||
        errMsg.includes('Quota exceeded') ||
        errMsg.includes('quota');

      if (isResourceExhausted) {
        Logger.warn(`[AIProviderRouter] GeminiClient hit Resource Exhausted (${errMsg}). Attempting FlowAdapter fallback...`);
        const flowText = await this.tryFlowTextFallback(options);
        if (flowText) {
          return {
            provider: 'Google Flow (gemini-3-flash-preview)',
            data: flowText,
          };
        }
      }
      throw geminiErr;
    }
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
          const flowAccountAdapterParam = {
            id: account.id,
            email: account.email,
            flow_st: account.session_token,
            flow_at: account.access_token,
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

  async generateText(prompt: string, options?: { model?: string; systemInstruction?: string }): Promise<string> {
    const db = await getDatabaseProvider();
    const studioConfig = (await db.getSystemSetting<StudioSystemConfig>('studio_config')) || {};
    const targetModel = options?.model || studioConfig?.gemini?.textModel || EnvConfig.geminiModelText;
    const res = await this.routeGeneration({
      prompt,
      type: 'TEXT',
      model: targetModel,
      systemInstruction: options?.systemInstruction,
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

    // 2. Try markdown fenced codeblock
    const codeBlockMatch = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch && codeBlockMatch[1]) {
      const candidate = codeBlockMatch[1].trim();
      try {
        JSON.parse(candidate);
        return candidate;
      } catch {}
    }

    // 3. Robust Bracket Balancing to find exact outermost JSON object or array
    const firstBrace = str.indexOf('{');
    const firstBracket = str.indexOf('[');
    if (firstBrace === -1 && firstBracket === -1) return str;

    const isObject = firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket);
    const startIdx = isObject ? firstBrace : firstBracket;
    const openChar = isObject ? '{' : '[';
    const closeChar = isObject ? '}' : ']';

    let depth = 0;
    let inString = false;
    let escape = false;
    let endIdx = -1;

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
            endIdx = i;
            break;
          }
        }
      }
    }

    if (endIdx !== -1) {
      const extracted = str.substring(startIdx, endIdx + 1).trim();
      try {
        JSON.parse(extracted);
        return extracted;
      } catch {}
    }

    // 4. Fallback to lastIndex boundary
    const lastIdx = isObject ? str.lastIndexOf('}') : str.lastIndexOf(']');
    if (lastIdx > startIdx) {
      return str.substring(startIdx, lastIdx + 1).trim();
    }

    return str;
  }

  private parseJsonWithRepair<T>(rawStr: string): T {
    const extracted = this.extractJsonString(rawStr);
    
    // 1. Direct parse attempt
    try {
      return JSON.parse(extracted) as T;
    } catch {}

    // 2. Progressive Sanitize and Repair markdown artifacts (e.g. "title":_ "...", "title": _"...", "title": **"..."**)
    let repaired = extracted
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/:\s*[_*]+(?=\s*["{\[\d\-tfn])/g, ': ')
      .replace(/:\s*[_*]+"/g, ': "')
      .replace(/"[_*]+(?=[\s,\}\]])/g, '"')
      .replace(/([0-9a-zA-Z\-_]+)[_*]+(?=[\s,\}\]])/g, '$1')
      .replace(/,\s*([}\]])/g, '$1')
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

    // 4. Fallback: throw original JSON.parse error with extracted string for clear debugging
    return JSON.parse(extracted) as T;
  }

  async generateJSON<T>(prompt: string, fallbackData?: T, options?: { model?: string; systemInstruction?: string }): Promise<T> {
    const db = await getDatabaseProvider();
    const studioConfig = (await db.getSystemSetting<StudioSystemConfig>('studio_config')) || {};
    const targetModel = options?.model || studioConfig?.gemini?.textModel || EnvConfig.geminiModelText;
    try {
      const res = await this.routeGeneration({
        prompt,
        type: 'TEXT',
        jsonMode: true,
        model: targetModel,
        systemInstruction: options?.systemInstruction,
      });
      const rawText = String(res.data || '');
      return this.parseJsonWithRepair<T>(rawText);
    } catch (err: any) {
      Logger.error(`[AIProviderRouter] generateJSON error: ${err.message}`);
      if (fallbackData !== undefined) return fallbackData;
      throw err;
    }
  }

  async generateImage(prompt: string, options?: { aspectRatio?: '9:16' | '1:1' | '16:9' | '4:3'; model?: string; systemPrompt?: string; characterReferences?: string[]; imageInputs?: string[] }): Promise<{ url: string; mimeType: string; provider: string; buffer?: Buffer }> {
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

  async generateVideo(prompt: string, options?: { aspectRatio?: '9:16' | '1:1' | '16:9'; model?: string; characterReferences?: string[]; imageInputs?: string[]; backgroundImageId?: string; startFrameUrl?: string; endFrameUrl?: string; imageStart?: string; imageEnd?: string }): Promise<{ url: string; provider: string }> {
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
      imageStart: options?.imageStart,
      imageEnd: options?.imageEnd,
    });
    return {
      url: res.url || '',
      provider: res.provider,
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
