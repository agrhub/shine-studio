import type { Content, Part, Schema } from '@google/genai';
import type { LlmRequest } from '@google/adk';

/**
 * Provider-neutral helpers shared by the non-Gemini ADK adapters (ClaudeLlm,
 * OpenAILlm). ADK speaks Gemini types (Content / Part / Schema); these helpers
 * translate the parts every provider needs.
 */

/** Gemini `Schema` (Type enum in UPPERCASE) → plain JSON Schema. */
export function geminiSchemaToJsonSchema(schema: Schema | Record<string, any> | undefined): Record<string, any> {
  if (!schema || typeof schema !== 'object') return { type: 'object', properties: {} };
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (value === undefined || value === null) continue;
    switch (key) {
      case 'type':
        out.type = String(value).toLowerCase();
        break;
      case 'properties':
        out.properties = Object.fromEntries(
          Object.entries(value as Record<string, any>).map(([k, v]) => [k, geminiSchemaToJsonSchema(v)])
        );
        break;
      case 'items':
        out.items = geminiSchemaToJsonSchema(value as Schema);
        break;
      case 'anyOf':
        out.anyOf = (value as Schema[]).map((s) => geminiSchemaToJsonSchema(s));
        break;
      case 'nullable':
      case 'propertyOrdering':
      case 'example':
        break; // Gemini-only keywords
      default:
        out[key] = value;
    }
  }
  if (out.type === 'object' && !out.properties) out.properties = {};
  return out;
}

export interface NeutralTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

/** Function declarations ADK attached to the request, as JSON-Schema tools. */
export function collectTools(llmRequest: LlmRequest): NeutralTool[] {
  const tools: NeutralTool[] = [];
  for (const tool of llmRequest.config?.tools ?? []) {
    for (const fn of (tool as any).functionDeclarations ?? []) {
      if (!fn?.name) continue;
      tools.push({
        name: fn.name,
        description: fn.description || '',
        parameters: fn.parametersJsonSchema
          ? (fn.parametersJsonSchema as Record<string, any>)
          : geminiSchemaToJsonSchema(fn.parameters),
      });
    }
  }
  return tools;
}

/** System instruction as plain text (ADK may give a string, Content, Part or Part[]). */
export function systemInstructionText(llmRequest: LlmRequest): string {
  const si: any = llmRequest.config?.systemInstruction;
  if (!si) return '';
  if (typeof si === 'string') return si;
  const parts: any[] = Array.isArray(si) ? si : si.parts ?? [si];
  return parts
    .map((p) => (typeof p === 'string' ? p : p?.text || ''))
    .filter(Boolean)
    .join('\n\n');
}

// ─── Raw provider content round-trip ────────────────────────────────────────
// Some providers require the assistant turn to be sent back byte-for-byte
// (Claude: thinking blocks, fallback blocks, tool_use ids). The adapter stores
// the provider's raw content in a hidden `thought` part; ADK keeps an agent's
// own parts in session history, and the chatbot never displays `thought`
// parts with empty text. On the next request the adapter replays the raw
// content instead of re-deriving it from the Gemini parts.
// Always append it AFTER the visible parts: ADK's history builder skips any
// event whose first part has empty text.

const RAW_PREFIX = 'shine-raw:';

export function rawContentPart(provider: string, raw: unknown): Part {
  const payload = Buffer.from(JSON.stringify({ provider, raw }), 'utf8').toString('base64');
  return { thought: true, text: '', thoughtSignature: RAW_PREFIX + payload };
}

export function readRawContent(content: Content, provider: string): unknown | undefined {
  for (const part of content.parts ?? []) {
    const sig = part.thought ? part.thoughtSignature : undefined;
    if (typeof sig !== 'string' || !sig.startsWith(RAW_PREFIX)) continue;
    try {
      const decoded = JSON.parse(Buffer.from(sig.slice(RAW_PREFIX.length), 'base64').toString('utf8'));
      if (decoded?.provider === provider) return decoded.raw;
    } catch {
      /* not ours */
    }
  }
  return undefined;
}

/** Parts that carry user-visible or tool data (skips hidden raw-content parts). */
export function visibleParts(content: Content): Part[] {
  return (content.parts ?? []).filter((p) => !(p.thought && typeof p.thoughtSignature === 'string' && p.thoughtSignature.startsWith(RAW_PREFIX)));
}

export function stringifyToolResponse(response: unknown): string {
  if (typeof response === 'string') return response;
  try {
    return JSON.stringify(response ?? {});
  } catch {
    return String(response);
  }
}
