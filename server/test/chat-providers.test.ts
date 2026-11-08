import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';

process.env.JWT_SECRET = 'test_jwt_secret_that_is_definitely_longer_than_32_chars';

// ─── Local mock APIs (no network, no billing) ───────────────────────────────
const anthropicRequests: Array<{ body: any; headers: http.IncomingHttpHeaders }> = [];
const openaiRequests: any[] = [];
let anthropicScript: Array<() => any[]> = [];
let openaiScript: Array<() => any> = [];

function sse(events: Array<[string, any]>): string {
  return events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');
}

/** Builds a Messages API SSE stream for the given content blocks. */
function anthropicStream(blocks: any[], stopReason: string): string {
  const events: Array<[string, any]> = [
    ['message_start', { type: 'message_start', message: { id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 12, output_tokens: 0 } } }],
  ];
  blocks.forEach((block, index) => {
    if (block.type === 'text') {
      events.push(['content_block_start', { type: 'content_block_start', index, content_block: { type: 'text', text: '' } }]);
      events.push(['content_block_delta', { type: 'content_block_delta', index, delta: { type: 'text_delta', text: block.text } }]);
    } else if (block.type === 'thinking') {
      events.push(['content_block_start', { type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '', signature: '' } }]);
      events.push(['content_block_delta', { type: 'content_block_delta', index, delta: { type: 'signature_delta', signature: block.signature } }]);
    } else if (block.type === 'tool_use') {
      events.push(['content_block_start', { type: 'content_block_start', index, content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} } }]);
      events.push(['content_block_delta', { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) } }]);
    }
    events.push(['content_block_stop', { type: 'content_block_stop', index }]);
  });
  events.push(['message_delta', { type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 7 } }]);
  events.push(['message_stop', { type: 'message_stop' }]);
  return sse(events);
}

let server: http.Server;
before(async () => {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.post('/v1/messages', (req, res) => {
    anthropicRequests.push({ body: req.body, headers: req.headers });
    const next = anthropicScript.shift();
    assert.ok(next, 'unexpected extra Anthropic request');
    const [blocks, stopReason] = next!();
    res.setHeader('content-type', 'text/event-stream');
    res.end(anthropicStream(blocks, stopReason));
  });
  app.post('/v1/chat/completions', (req, res) => {
    openaiRequests.push(req.body);
    const next = openaiScript.shift();
    assert.ok(next, 'unexpected extra OpenAI request');
    res.json(next!());
  });
  server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.ANTHROPIC_BASE_URL = base;
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_BASE_URL = `${base}/v1`;
});
after(() => server?.close());

async function runAgent(model: string, messages: string[]): Promise<string[]> {
  const { InMemoryRunner, LlmAgent, FunctionTool, StreamingMode, isFinalResponse } = await import('@google/adk');
  const { Type, createUserContent } = await import('@google/genai');
  const { registerChatModelAdapters } = await import('../src/integrations/ai/llm/chatModels.js');
  registerChatModelAdapters();

  const agent = new LlmAgent({
    name: 'weather_agent',
    model,
    instruction: 'You answer weather questions using the get_weather tool.',
    tools: [
      new FunctionTool({
        name: 'get_weather',
        description: 'Get the forecast for a city',
        parameters: { type: Type.OBJECT, properties: { city: { type: Type.STRING, description: 'City name' } }, required: ['city'] },
        execute: async (args: any) => ({ city: args.city, forecast: 'sunny' }),
      }),
    ],
  });
  const runner = new InMemoryRunner({ agent, appName: `test_${model}` });
  await runner.sessionService.createSession({ appName: `test_${model}`, userId: 'u1', sessionId: 's1' });

  const finals: string[] = [];
  for (const message of messages) {
    let text = '';
    for await (const event of runner.runAsync({
      userId: 'u1',
      sessionId: 's1',
      newMessage: createUserContent(message),
      runConfig: { streamingMode: StreamingMode.SSE },
    })) {
      if (isFinalResponse(event) && !(event as any).partial) {
        text += (event.content?.parts ?? []).map((p: any) => (p.thought ? '' : p.text || '')).join('');
      }
    }
    finals.push(text);
  }
  return finals;
}

test('Claude adapter: tool loop through ADK, thinking + tool_use replayed unchanged across turns', async () => {
  const turn1Blocks = [
    { type: 'thinking', thinking: '', signature: 'sig-opaque-123' },
    { type: 'tool_use', id: 'toolu_01ABC', name: 'get_weather', input: { city: 'Hanoi' } },
  ];
  anthropicScript = [
    () => [turn1Blocks, 'tool_use'],
    () => [[{ type: 'text', text: 'It is sunny in Hanoi.' }], 'end_turn'],
    () => [[{ type: 'text', text: 'You are welcome!' }], 'end_turn'],
  ];

  const finals = await runAgent('claude-opus-5-5', ['Weather in Hanoi?', 'Thanks']);
  assert.equal(finals[0], 'It is sunny in Hanoi.');
  assert.equal(finals[1], 'You are welcome!');
  assert.equal(anthropicRequests.length, 3);

  const [first, second, third] = anthropicRequests;
  // Request shape
  assert.equal(first.body.model, 'claude-opus-5-5');
  assert.equal(first.body.fallbacks, 'default');
  assert.match(String(first.headers['anthropic-beta']), /server-side-fallback-2026-07-01/);
  assert.deepEqual(first.body.cache_control, { type: 'ephemeral' });
  assert.equal(first.body.output_config.effort, 'medium');
  assert.match(first.body.system, /get_weather tool/);
  const tool = first.body.tools.find((t: any) => t.name === 'get_weather');
  assert.deepEqual(tool.input_schema, {
    type: 'object',
    properties: { city: { type: 'string', description: 'City name' } },
    required: ['city'],
  });

  // Turn 1, after the tool ran: assistant blocks replayed byte-for-byte + matching tool_result
  const m2 = second.body.messages;
  assert.equal(m2[0].role, 'user');
  assert.deepEqual(m2[1], { role: 'assistant', content: turn1Blocks });
  assert.equal(m2[2].role, 'user');
  assert.equal(m2[2].content[0].type, 'tool_result');
  assert.equal(m2[2].content[0].tool_use_id, 'toolu_01ABC');
  assert.deepEqual(JSON.parse(m2[2].content[0].content), { city: 'Hanoi', forecast: 'sunny' });

  // Turn 2 (new user message): earlier history is still identical (append-only)
  const m3 = third.body.messages;
  assert.deepEqual(m3.slice(0, 3), m2.slice(0, 3));
  assert.deepEqual(m3[3], { role: 'assistant', content: [{ type: 'text', text: 'It is sunny in Hanoi.' }] });
  assert.equal(m3[4].role, 'user');
});

test('OpenAI adapter: tool calls and tool results round-trip through ADK', async () => {
  openaiScript = [
    () => ({
      id: 'cmpl_1', object: 'chat.completion', created: 0, model: 'gpt-5',
      choices: [{ index: 0, finish_reason: 'tool_calls', message: { role: 'assistant', content: null, refusal: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Hue"}' } }] } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }),
    () => ({
      id: 'cmpl_2', object: 'chat.completion', created: 0, model: 'gpt-5',
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'Sunny in Hue.', refusal: null } }],
      usage: { prompt_tokens: 20, completion_tokens: 4, total_tokens: 24 },
    }),
  ];

  const finals = await runAgent('gpt-5', ['Weather in Hue?']);
  assert.equal(finals[0], 'Sunny in Hue.');
  const second = openaiRequests[1];
  assert.equal(second.messages[0].role, 'system');
  const assistant = second.messages.find((m: any) => m.role === 'assistant');
  assert.equal(assistant.tool_calls[0].id, 'call_1');
  const toolMsg = second.messages.find((m: any) => m.role === 'tool');
  assert.equal(toolMsg.tool_call_id, 'call_1');
  assert.deepEqual(JSON.parse(toolMsg.content), { city: 'Hue', forecast: 'sunny' });
  assert.equal(openaiRequests[0].tools[0].function.parameters.type, 'object');
});

test('resolveChatModel only offers providers with credentials', async () => {
  const { listChatModels, resolveChatModel } = await import('../src/integrations/ai/llm/chatModels.js');
  assert.deepEqual(listChatModels().map((m) => m.provider), ['gemini', 'anthropic', 'openai']);
  assert.equal(resolveChatModel('anthropic').id, 'claude-opus-5-5');
  assert.equal(resolveChatModel('not-a-model').provider, 'gemini');
  const saved = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  assert.equal(resolveChatModel('openai').provider, 'gemini', 'unconfigured provider falls back');
  process.env.OPENAI_API_KEY = saved;
});
