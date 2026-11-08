import { LLMRegistry } from '@google/adk';
import { EnvConfig } from '@/config/env.js';
import { ClaudeLlm } from './ClaudeLlm.js';
import { OpenAILlm } from './OpenAILlm.js';

export type ChatProvider = 'gemini' | 'anthropic' | 'openai';

export interface ChatModelOption {
  id: string;
  provider: ChatProvider;
  label: string;
}

let registered = false;
/** Lets ADK resolve `claude-*` and `gpt-*` model ids to our adapters. */
export function registerChatModelAdapters(): void {
  if (registered) return;
  LLMRegistry.register(ClaudeLlm);
  LLMRegistry.register(OpenAILlm);
  registered = true;
}

/** Chat models usable right now (a provider is listed only when its credentials are configured). */
export function listChatModels(): ChatModelOption[] {
  const models: ChatModelOption[] = [
    { id: EnvConfig.geminiModelAgent || EnvConfig.geminiModelText || 'gemini-2.5-pro', provider: 'gemini', label: 'Gemini' },
  ];
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) {
    models.push({ id: process.env.CLAUDE_CHAT_MODEL || 'claude-opus-5-5', provider: 'anthropic', label: 'Claude' });
  }
  if (process.env.OPENAI_API_KEY) {
    models.push({ id: process.env.OPENAI_CHAT_MODEL || 'gpt-5', provider: 'openai', label: 'OpenAI' });
  }
  return models;
}

/**
 * Picks the chat model for a request: the requested one if it is available,
 * else CHATBOT_DEFAULT_MODEL (or a provider name such as "anthropic"), else Gemini.
 */
export function resolveChatModel(requested?: string | null): ChatModelOption {
  const models = listChatModels();
  const pick = (value?: string | null) =>
    value ? models.find((m) => m.id === value || m.provider === value) : undefined;
  return pick(requested) || pick(process.env.CHATBOT_DEFAULT_MODEL) || models[0];
}
