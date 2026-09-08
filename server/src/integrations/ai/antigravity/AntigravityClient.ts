import axios from 'axios';
import crypto from 'crypto';
import { EnvConfig } from '@/config/env.js';
import type { AntigravityAccountEntity } from '@/types.js';
import { antigravityOAuthService } from './AntigravityOAuthService.js';
import { Logger } from '@/utils/logger.js';

export interface AntigravityGenerateOptions {
  model?: string;
  systemInstruction?: string;
  systemPrompt?: string;
  jsonMode?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
  generationConfig?: Record<string, any>;
  _isRetry?: boolean;
  account?: AntigravityAccountEntity;
}

export class AntigravityClient {
  private static readonly AGENT_ENDPOINT = 'https://daily-cloudcode-pa.sandbox.googleapis.com';
  private static readonly IDENTITY_PROFILE =
    'You are Antigravity, a powerful agentic AI coding assistant designed by the Google Deepmind team working on Advanced Agentic Coding.\n' +
    'You are pair programming with a USER to solve their coding task. The task may require creating a new codebase, modifying or debugging an existing codebase, or simply answering a question.';

  private account?: AntigravityAccountEntity;

  constructor(account?: AntigravityAccountEntity) {
    this.account = account;
  }

  private generateRequestId(): string {
    return crypto.randomUUID();
  }

  private getHeaders(token: string): Record<string, string> {
    const host = AntigravityClient.AGENT_ENDPOINT.replace('https://', '');
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Host: host,
      'User-Agent': 'antigravity/1.13.3 windows/amd64',
      'Accept-Encoding': 'gzip',
    };
  }

  /**
   * Normalizes incoming application models to valid Antigravity endpoint models.
   * Supported models on daily-cloudcode-pa.sandbox.googleapis.com:
   * - 'gemini-3-flash' (Fast default flagship)
   * - 'gemini-3.6-flash-high' (Agentic CoT)
   * - 'gemini-3.1-pro-low' / 'gemini-pro-agent' (Deep Reasoning)
   * - 'gemini-3.1-flash-lite' (High-speed lite)
   * - 'gemini-2.5-flash' (Standard fallback)
   */
  public static normalizeModel(modelId?: string): string {
    if (!modelId) return 'gemini-3.7-flash';

    const clean = modelId.toLowerCase().trim();

    if (
      clean === 'gemini-3.7-flash' ||
      clean === 'gemini-3-flash' ||
      clean === 'gemini-3.6-flash-high' ||
      clean === 'gemini-3.1-pro-low' ||
      clean === 'gemini-pro-agent' ||
      clean === 'gemini-3.1-flash-lite' ||
      clean === 'gemini-2.5-flash'
    ) {
      return clean;
    }

    if (clean.includes('3.7')) {
      return 'gemini-3.7-flash';
    }

    if (clean.includes('high') || clean.includes('3.6')) {
      return 'gemini-3.6-flash-high';
    }

    if (clean.includes('pro') || clean.includes('thinking') || clean.includes('reasoning')) {
      return 'gemini-3.1-pro-low';
    }

    if (clean.includes('lite') || clean.includes('3.1')) {
      return 'gemini-3.1-flash-lite';
    }

    if (clean.includes('2.5')) {
      return 'gemini-2.5-flash';
    }

    // Modern default for gemini-3, 3.5, 3.7 or unmapped models
    return 'gemini-3.7-flash';
  }

  /**
   * Generates text content strictly for Text / JSON tasks.
   */
  public async generateContent(
    prompt: string | any[],
    options: AntigravityGenerateOptions = {}
  ): Promise<{ text: string }> {
    const account = options.account || this.account || (await antigravityOAuthService.getAvailableAccount());
    if (!account) {
      throw new Error('No active Antigravity accounts available in the account pool.');
    }

    const token = await antigravityOAuthService.refreshAccessToken(account);
    const headers = this.getHeaders(token);
    const url = `${AntigravityClient.AGENT_ENDPOINT}/v1internal:generateContent`;

    const rawModel = options.model || EnvConfig.geminiModelAgent || EnvConfig.geminiModelText;
    const modelId = EnvConfig.antigravityModel;//AntigravityClient.normalizeModel(rawModel);
    let projectId = await antigravityOAuthService.discoverProjectId(account, token);
    if (!projectId || !projectId.trim()) {
      projectId = 'aicode-consumers';
    }

    // Ensure appropriate system instruction based on jsonMode vs conversation
    let systemPromptText = options.systemInstruction || options.systemPrompt || '';
    if (options.jsonMode) {
      const jsonSystemInstruction =
        'You are an automated high-precision JSON API engine. You MUST respond ONLY with a valid, parseable JSON object or array. ' +
        'Do NOT include any introductory greetings, conversational commentary, code blocks, or markdown explanations. ' +
        'Your entire output must start with "{" or "[" and end with "}" or "].';
      systemPromptText = systemPromptText.trim()
        ? `${jsonSystemInstruction}\n\nTask Instructions:\n${systemPromptText.trim()}`
        : jsonSystemInstruction;
    } else {
      const identityMarker = 'You are Antigravity';
      if (!systemPromptText.includes(identityMarker)) {
        systemPromptText = systemPromptText.trim()
          ? `${AntigravityClient.IDENTITY_PROFILE}\n\n${systemPromptText.trim()}`
          : AntigravityClient.IDENTITY_PROFILE;
      }
    }

    let parts: any[] = [];
    if (Array.isArray(prompt)) {
      parts = prompt.map((p) => (typeof p === 'string' ? { text: p } : p));
    } else {
      parts = [{ text: String(prompt) }];
    }

    const generationConfig: Record<string, any> = {
      temperature: options.temperature !== undefined ? options.temperature : (options.jsonMode ? 0.2 : 0.7),
      topP: 0.85,
      topK: 50,
      maxOutputTokens: options.maxOutputTokens || 65535,
      ...(options.generationConfig || {}),
    };

    if (options.jsonMode) {
      generationConfig.responseMimeType = 'application/json';
    }

    const payload: any = {
      requestId: this.generateRequestId(),
      request: {
        contents: [
          {
            role: 'user',
            parts,
          },
        ],
        generationConfig,
      },
      model: EnvConfig.antigravityModel,
      userAgent: 'antigravity/1.13.3 windows/amd64',
      requestType: 'agent',
      project: projectId,
    };

    if (systemPromptText.trim()) {
      payload.request.systemInstruction = {
        parts: [{ text: systemPromptText.trim() }],
      };
    }

    try {
      const response = await axios.post(url, payload, { headers, timeout: 60000 });
      const candidates = response.data.response?.candidates || [];
      if (candidates.length === 0) {
        throw new Error('No candidates returned from Antigravity API');
      }

      const content = candidates[0].content;
      if (!content || !content.parts || content.parts.length === 0) {
        throw new Error('Malformed content in Antigravity API response');
      }

      const outputText = content.parts.map((p: any) => p.text || '').join('');
      await antigravityOAuthService.recordUsage(account.id);
      return { text: outputText };
    } catch (error: any) {
      const status = error.response?.status;
      const errMsg = error.response?.data?.error?.message || error.message;

      // Handle 404 Project ID / Model recovery
      if (status === 404 && !options._isRetry) {
        Logger.warn(
          `[AntigravityClient] 404 for model ${modelId} (project: ${projectId}). Retrying with fallback model/project for ${account.email}...`,
          'AntigravityClient'
        );
        try {
          return await this.generateContent(prompt, {
            ...options,
            model: EnvConfig.antigravityModel,
            account: { ...account, project_id: 'aicode-consumers' },
            _isRetry: true,
          });
        } catch (retryErr: any) {
          Logger.error(`[AntigravityClient] Fallback retry failed: ${retryErr.message}`, 'AntigravityClient');
        }
      }

      // Handle Rate Limit / Resource Exhausted (429)
      if (status === 429 || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota')) {
        Logger.warn(
          `[AntigravityClient] Account ${account.email} rate-limited (429). Marking cooldown and rotating...`,
          'AntigravityClient'
        );
        await antigravityOAuthService.markAccountRateLimited(account.id, 90);

        if (!options._isRetry) {
          // Attempt retry with another account from the pool
          const nextAccount = await antigravityOAuthService.getAvailableAccount();
          if (nextAccount && nextAccount.id !== account.id) {
            Logger.info(
              `[AntigravityClient] Rotating to account ${nextAccount.email}...`,
              'AntigravityClient'
            );
            return await this.generateContent(prompt, {
              ...options,
              account: nextAccount,
              _isRetry: true,
            });
          }
        }
      }

      Logger.error(`[AntigravityClient] generateContent failed (${status}): ${errMsg}`, 'AntigravityClient');
      throw error;
    }
  }

  /**
   * Generates text string directly.
   */
  public async generateText(options: {
    model?: string;
    prompt: string;
    systemInstruction?: string;
    jsonMode?: boolean;
    temperature?: number;
    account?: AntigravityAccountEntity;
  }): Promise<string> {
    const res = await this.generateContent(options.prompt, {
      model: options.model,
      systemInstruction: options.systemInstruction,
      jsonMode: options.jsonMode,
      temperature: options.temperature,
      account: options.account,
    });
    return res.text;
  }

  /**
   * Generates and parses typed JSON strictly.
   */
  public async generateJSON<T = any>(options: {
    model?: string;
    prompt: string;
    systemInstruction?: string;
    schema?: any;
    account?: AntigravityAccountEntity;
  }): Promise<T> {
    const systemInstruction = options.systemInstruction
      ? `${options.systemInstruction}\nReturn purely valid JSON with no markdown wrapping.`
      : 'You are an expert JSON generator. Output valid JSON only, without markdown code fences.';

    const raw = await this.generateText({
      model: options.model,
      prompt: options.prompt,
      systemInstruction,
      jsonMode: true,
      account: options.account,
    });

    try {
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
      return JSON.parse(cleaned) as T;
    } catch (parseErr: any) {
      Logger.error(`[AntigravityClient] Failed to parse JSON: ${raw.slice(0, 200)}...`, 'AntigravityClient');
      throw new Error(`Antigravity JSON parsing failed: ${parseErr.message}`);
    }
  }

  /**
   * Streaming generateContent strictly for Text.
   */
  public async streamGenerateContent(
    prompt: string | any[],
    onChunk: (chunk: string) => void,
    options: AntigravityGenerateOptions = {}
  ): Promise<string> {
    // Standard endpoint returns full candidates. We deliver the chunk immediately to consumer.
    const res = await this.generateContent(prompt, options);
    if (res.text) {
      onChunk(res.text);
    }
    return res.text;
  }
}

export const antigravityClient = new AntigravityClient();
