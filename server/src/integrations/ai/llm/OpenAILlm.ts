import OpenAI from 'openai';
import { BaseLlm, type LlmRequest, type LlmResponse, type BaseLlmConnection } from '@google/adk';
import type { Content, Part } from '@google/genai';
import { Logger } from '@/utils/logger.js';
import { collectTools, stringifyToolResponse, systemInstructionText, visibleParts } from './adkInterop.js';

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

let client: OpenAI | null = null;
function getClient(): OpenAI {
  // Reads OPENAI_API_KEY (and OPENAI_BASE_URL) from the environment.
  if (!client) client = new OpenAI();
  return client;
}

/** ADK contents → OpenAI chat messages. */
export function toOpenAIMessages(system: string, contents: Content[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  if (system) messages.push({ role: 'system', content: system });
  let pendingCalls: Array<{ id: string; name: string }> = [];

  for (const content of contents) {
    const parts = visibleParts(content);
    if (content.role === 'model') {
      const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('');
      const toolCalls = parts
        .filter((p) => p.functionCall?.name)
        .map((p, i) => ({
          id: p.functionCall!.id || `call_shine_${messages.length}_${i}`,
          type: 'function' as const,
          function: { name: p.functionCall!.name!, arguments: JSON.stringify(p.functionCall!.args || {}) },
        }));
      pendingCalls = toolCalls.map((c) => ({ id: c.id, name: c.function.name }));
      if (!text && toolCalls.length === 0) continue;
      messages.push({ role: 'assistant', content: text || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });
      continue;
    }

    for (const part of parts) {
      if (!part.functionResponse) continue;
      const match =
        (part.functionResponse.id && pendingCalls.find((c) => c.id === part.functionResponse!.id)) ||
        pendingCalls.find((c) => c.name === part.functionResponse!.name);
      if (!match) continue;
      pendingCalls = pendingCalls.filter((c) => c !== match);
      messages.push({ role: 'tool', tool_call_id: match.id, content: stringifyToolResponse(part.functionResponse.response) });
    }
    const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('\n');
    if (text) messages.push({ role: 'user', content: text });
  }
  return messages;
}

/**
 * ADK model adapter for OpenAI chat models (`gpt-*`, `o<N>*` ids) via the
 * Chat Completions API with function calling.
 */
export class OpenAILlm extends BaseLlm {
  // ADK matches the whole model name (it wraps patterns as ^(?:...)$).
  static override readonly supportedModels = [/gpt-.+/, /o\d.*/, /chatgpt-.+/];

  async *generateContentAsync(llmRequest: LlmRequest, _stream = false, abortSignal?: AbortSignal): AsyncGenerator<LlmResponse, void> {
    const tools = collectTools(llmRequest).map((t) => ({
      type: 'function' as const,
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));

    try {
      const completion = await getClient().chat.completions.create(
        {
          model: this.model,
          messages: toOpenAIMessages(systemInstructionText(llmRequest), llmRequest.contents),
          ...(tools.length ? { tools } : {}),
        },
        { signal: abortSignal }
      );

      const message = completion.choices[0]?.message;
      const parts: Part[] = [];
      if (message?.content) parts.push({ text: message.content });
      for (const call of message?.tool_calls ?? []) {
        if (call.type !== 'function') continue;
        let args: Record<string, unknown> = {};
        try {
          args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          Logger.warn(`[OpenAILlm] Unparseable arguments for tool ${call.function.name}`);
        }
        parts.push({ functionCall: { id: call.id, name: call.function.name, args } });
      }
      if (message?.refusal && parts.length === 0) parts.push({ text: message.refusal });

      yield {
        content: { role: 'model', parts },
        turnComplete: true,
        usageMetadata: {
          promptTokenCount: completion.usage?.prompt_tokens,
          candidatesTokenCount: completion.usage?.completion_tokens,
          totalTokenCount: completion.usage?.total_tokens,
        },
      };
    } catch (err) {
      let errorCode = 'OPENAI_ERROR';
      if (err instanceof OpenAI.AuthenticationError) errorCode = 'AUTHENTICATION_ERROR';
      else if (err instanceof OpenAI.RateLimitError) errorCode = 'RATE_LIMITED';
      else if (err instanceof OpenAI.APIError) errorCode = `HTTP_${err.status}`;
      const errorMessage = err instanceof Error ? err.message : String(err);
      Logger.error(`[OpenAILlm] ${this.model} request failed (${errorCode}): ${errorMessage}`);
      yield { errorCode, errorMessage, turnComplete: true };
    }
  }

  async connect(_llmRequest: LlmRequest): Promise<BaseLlmConnection> {
    throw new Error('Live (bidirectional) sessions are not supported for OpenAI models');
  }
}
