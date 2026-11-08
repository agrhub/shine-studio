/**
 * Agent Callbacks - ported from vibe-mongo-admin
 * Provides rate limiting, tool logging hooks for the ADK LlmAgent.
 */

import { aiUsageGuard, AiLimitError } from '@/services/ai/AiUsageGuard.js';

/**
 * Before-model callback for every ADK LlmAgent call: enforces the same per-user
 * daily caps / credits / global budget as the rest of the app (AiUsageGuard).
 * Returning an LlmResponse short-circuits the model call with a readable message.
 * Matches SingleBeforeModelCallback signature: (params: { context, request }) => LlmResponse | undefined
 */
export const rateLimitCallback = async (_params: { context: any; request: any }): Promise<any> => {
  try {
    await aiUsageGuard.assertAllowed('TEXT');
    await aiUsageGuard.record('TEXT');
    return undefined; // Proceed normally
  } catch (err) {
    if (err instanceof AiLimitError) {
      return { content: { role: 'model', parts: [{ text: `⚠️ ${err.message}` }] } };
    }
    throw err;
  }
};

/**
 * Before tool callback — log tool invocation.
 * Matches SingleBeforeToolCallback signature: (params: { tool, args, context }) => any
 */
export const beforeTool = async (params: { tool: any; args: Record<string, any>; context: any }): Promise<any> => {
  const { tool, args } = params;
  console.log(`[Tool] ▶ ${tool.name}(${JSON.stringify(args).substring(0, 120)})`);
  return undefined;
};

/**
 * After tool callback — log tool result and surface errors.
 * Matches SingleAfterToolCallback signature: (params: { tool, args, context, toolResponse }) => any
 */
export const afterTool = async (params: { tool: any; args: Record<string, any>; context: any; response: Record<string, unknown> }): Promise<any> => {
  const { tool, response } = params;
  if (response?.error || response?.success === false) {
    console.error(`[Tool] ✗ ${tool.name} FAILED:`, response.error || 'Unknown error');
  } else {
    console.log(`[Tool] ✓ ${tool.name} → OK`);
  }
  return undefined;
};
