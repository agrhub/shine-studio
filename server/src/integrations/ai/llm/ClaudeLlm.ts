import Anthropic from '@anthropic-ai/sdk';
import { BaseLlm, type LlmRequest, type LlmResponse, type BaseLlmConnection } from '@google/adk';
import type { Content, Part } from '@google/genai';
import { Logger } from '@/utils/logger.js';
import {
  collectTools,
  rawContentPart,
  readRawContent,
  stringifyToolResponse,
  systemInstructionText,
  visibleParts,
} from './adkInterop.js';

type MessageParam = Anthropic.Beta.BetaMessageParam;
type ContentBlockParam = Anthropic.Beta.BetaContentBlockParam;
type ContentBlock = Anthropic.Beta.BetaContentBlock;

const PROVIDER = 'anthropic';
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
type Effort = (typeof EFFORTS)[number];

let client: Anthropic | null = null;
function getClient(): Anthropic {
  // Credentials resolve from the environment (ANTHROPIC_API_KEY, ...).
  if (!client) client = new Anthropic();
  return client;
}

function effortFromEnv(): Effort {
  const value = String(process.env.CLAUDE_CHAT_EFFORT || 'medium').toLowerCase();
  return (EFFORTS as readonly string[]).includes(value) ? (value as Effort) : 'medium';
}

/** ADK contents → Anthropic messages. Assistant turns produced by this adapter are replayed verbatim. */
export function toClaudeMessages(contents: Content[]): MessageParam[] {
  const messages: MessageParam[] = [];
  // tool_use ids of the latest assistant turn, used when ADK drops a response id
  let pendingToolIds: Array<{ id: string; name: string }> = [];

  for (const content of contents) {
    if (content.role === 'model') {
      const raw = readRawContent(content, PROVIDER) as ContentBlock[] | undefined;
      let blocks: ContentBlockParam[];
      if (Array.isArray(raw) && raw.length > 0) {
        // Unchanged replay keeps thinking/fallback blocks valid (preserved thinking).
        blocks = raw as unknown as ContentBlockParam[];
      } else {
        blocks = [];
        visibleParts(content).forEach((part, i) => {
          if (part.text && !part.thought) blocks.push({ type: 'text', text: part.text });
          if (part.functionCall?.name) {
            blocks.push({
              type: 'tool_use',
              id: part.functionCall.id || `toolu_shine_${messages.length}_${i}`,
              name: part.functionCall.name,
              input: (part.functionCall.args as Record<string, unknown>) || {},
            });
          }
        });
      }
      pendingToolIds = blocks
        .filter((b: any) => b.type === 'tool_use')
        .map((b: any) => ({ id: b.id as string, name: b.name as string }));
      if (blocks.length) messages.push({ role: 'assistant', content: blocks });
      continue;
    }

    // user (or ADK "For context:" turns from other agents)
    const toolResults: ContentBlockParam[] = [];
    const others: ContentBlockParam[] = [];
    for (const part of visibleParts(content)) {
      if (part.functionResponse) {
        const match =
          (part.functionResponse.id && pendingToolIds.find((t) => t.id === part.functionResponse!.id)) ||
          pendingToolIds.find((t) => t.name === part.functionResponse!.name);
        if (!match) continue; // orphan response: no tool_use to attach to
        pendingToolIds = pendingToolIds.filter((t) => t !== match);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: match.id,
          content: stringifyToolResponse(part.functionResponse.response),
        });
      } else if (part.text && !part.thought) {
        others.push({ type: 'text', text: part.text });
      } else if (part.inlineData?.data && /^image\/(png|jpeg|gif|webp)$/.test(part.inlineData.mimeType || '')) {
        others.push({
          type: 'image',
          source: { type: 'base64', media_type: part.inlineData.mimeType as 'image/png', data: part.inlineData.data },
        });
      }
    }
    // tool_result blocks must come first in the user turn
    const blocks = [...toolResults, ...others];
    if (blocks.length) messages.push({ role: 'user', content: blocks });
  }

  if (messages.length && messages[0].role !== 'user') {
    messages.unshift({ role: 'user', content: [{ type: 'text', text: 'Continue.' }] });
  }
  return messages;
}

/** Anthropic response → ADK Content (visible parts + hidden raw replay part). */
export function fromClaudeContent(blocks: ContentBlock[]): Content {
  const parts: Part[] = [];
  for (const block of blocks) {
    if (block.type === 'text' && block.text) parts.push({ text: block.text });
    if (block.type === 'tool_use') {
      parts.push({ functionCall: { id: block.id, name: block.name, args: (block.input as Record<string, unknown>) || {} } });
    }
  }
  if (parts.length === 0) parts.push({ text: '…' }); // e.g. a thinking-only turn
  // The raw part must NOT be first: ADK drops events whose first part has empty text.
  parts.push(rawContentPart(PROVIDER, blocks));
  return { role: 'model', parts };
}

/**
 * ADK model adapter for Claude (`claude-*` model ids). Lets the existing ADK
 * agents and tools run on Claude by translating Gemini-shaped requests to the
 * Messages API.
 */
export class ClaudeLlm extends BaseLlm {
  // ADK matches the whole model name (it wraps patterns as ^(?:...)$).
  static override readonly supportedModels = [/claude-.+/];

  async *generateContentAsync(llmRequest: LlmRequest, stream = false, abortSignal?: AbortSignal): AsyncGenerator<LlmResponse, void> {
    const tools = collectTools(llmRequest).map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Beta.BetaTool['input_schema'],
    }));
    const system = systemInstructionText(llmRequest);

    try {
      const messageStream = getClient().beta.messages.stream(
        {
          model: this.model,
          max_tokens: 64000,
          // Thinking is always on for Claude Opus 5.5; effort controls depth/cost.
          output_config: { effort: effortFromEnv() },
          // Cache the stable prefix (tools + system prompt) across turns.
          cache_control: { type: 'ephemeral' },
          // On a safety decline, the API re-runs the request on a fallback model.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          ...(system ? { system } : {}),
          ...(tools.length ? { tools } : {}),
          messages: toClaudeMessages(llmRequest.contents),
        },
        { signal: abortSignal }
      );

      if (stream) {
        for await (const event of messageStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta' && event.delta.text) {
            yield { content: { role: 'model', parts: [{ text: event.delta.text }] }, partial: true };
          }
        }
      }

      const message = await messageStream.finalMessage();
      if (message.stop_reason === 'refusal') {
        yield {
          content: { role: 'model', parts: [{ text: 'Sorry, I can’t help with that request.' }] },
          turnComplete: true,
          errorCode: 'REFUSAL',
          errorMessage: message.stop_details?.explanation || 'Request declined',
        };
        return;
      }

      yield {
        content: fromClaudeContent(message.content),
        turnComplete: true,
        usageMetadata: {
          promptTokenCount:
            (message.usage.input_tokens || 0) +
            (message.usage.cache_read_input_tokens || 0) +
            (message.usage.cache_creation_input_tokens || 0),
          candidatesTokenCount: message.usage.output_tokens || 0,
          totalTokenCount:
            (message.usage.input_tokens || 0) +
            (message.usage.cache_read_input_tokens || 0) +
            (message.usage.cache_creation_input_tokens || 0) +
            (message.usage.output_tokens || 0),
        },
      };
    } catch (err) {
      let errorCode = 'CLAUDE_ERROR';
      if (err instanceof Anthropic.AuthenticationError) errorCode = 'AUTHENTICATION_ERROR';
      else if (err instanceof Anthropic.RateLimitError) errorCode = 'RATE_LIMITED';
      else if (err instanceof Anthropic.BadRequestError) errorCode = 'BAD_REQUEST';
      else if (err instanceof Anthropic.APIError) errorCode = `HTTP_${err.status}`;
      const errorMessage = err instanceof Error ? err.message : String(err);
      Logger.error(`[ClaudeLlm] ${this.model} request failed (${errorCode}): ${errorMessage}`);
      yield { errorCode, errorMessage, turnComplete: true };
    }
  }

  async connect(_llmRequest: LlmRequest): Promise<BaseLlmConnection> {
    throw new Error('Live (bidirectional) sessions are not supported for Claude models');
  }
}
