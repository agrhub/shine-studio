import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  GmiCloudVideoClient,
  gmiModelFromId,
  extractGmiMediaUrl,
  DEFAULT_GMI_VIDEO_MODEL,
} from '../src/integrations/ai/gmicloud/GmiCloudVideoClient.js';

// ─── Local mock of the GMI Cloud Request Queue API (no network, no billing) ──
const submitted: any[] = [];
let polls: Record<string, any[]> = {};
let server: http.Server;
let baseUrl = '';

before(async () => {
  server = http.createServer((req, res) => {
    const send = (status: number, body: any) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.headers.authorization !== 'Bearer test-key') return send(401, { error: 'unauthorized' });
    if (req.method === 'POST' && req.url === '/requests') {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        const body = JSON.parse(raw);
        submitted.push(body);
        send(200, { request_id: `req_${submitted.length}` });
      });
      return;
    }
    const id = req.url?.split('/').pop() || '';
    const queue = polls[id] || [];
    send(200, queue.length > 1 ? queue.shift() : queue[0]);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => server.close());

const client = (apiKey = 'test-key') => new GmiCloudVideoClient({ apiKey, baseUrl, pollIntervalMs: 5, timeoutMs: 2_000 });

test('gmi: model ids are recognised; other ids are not', () => {
  assert.equal(gmiModelFromId('gmi:kling-v2'), 'kling-v2');
  assert.equal(gmiModelFromId('GMI:'), DEFAULT_GMI_VIDEO_MODEL);
  assert.equal(gmiModelFromId('veo-3.1-generate-001'), null);
  assert.equal(gmiModelFromId(undefined), null);
});

test('media URL is read from current and legacy outcome shapes', () => {
  assert.equal(extractGmiMediaUrl({ media_urls: [{ url: 'https://x/a.mp4' }] }), 'https://x/a.mp4');
  assert.equal(extractGmiMediaUrl({ media_urls: ['https://x/b.mp4'] }), 'https://x/b.mp4');
  assert.equal(extractGmiMediaUrl({ video_url: 'https://x/c.mp4' }), 'https://x/c.mp4');
  assert.equal(extractGmiMediaUrl({}), null);
});

test('submits the prompt and polls until the video is ready', async () => {
  polls = { req_1: [{ status: 'queued' }, { status: 'processing' }, { status: 'success', outcome: { media_urls: [{ url: 'https://cdn/v.mp4' }] } }] };
  const result = await client().generateVideo('a rainy rooftop confession', {
    model: 'seedance-2-0-260128',
    aspectRatio: '9:16',
    durationSeconds: 6,
    imageUrl: 'https://cdn/start.png',
  });
  assert.deepEqual(result, { url: 'https://cdn/v.mp4', model: 'seedance-2-0-260128', requestId: 'req_1' });
  assert.deepEqual(submitted[0], {
    model: 'seedance-2-0-260128',
    payload: { prompt: 'a rainy rooftop confession', aspect_ratio: '9:16', duration: 6, image: 'https://cdn/start.png' },
  });
});

test('a failed request surfaces the provider error', async () => {
  polls = { req_2: [{ status: 'failed', error: 'content policy' }] };
  await assert.rejects(client().generateVideo('x', { imageUrl: 'data:image/png;base64,AAA' }), /failed: content policy/);
  assert.equal(submitted[1].payload.image, undefined, 'non-http frames are not sent');
});

test('rejected submissions and a missing key fail clearly', async () => {
  await assert.rejects(client('wrong-key').generateVideo('x'), /HTTP 401/);
  await assert.rejects(client('').generateVideo('x'), /GMI_API_KEY is empty/);
});

test('a request that never finishes times out', async () => {
  polls = { req_3: [{ status: 'processing' }] };
  const slow = new GmiCloudVideoClient({ apiKey: 'test-key', baseUrl, pollIntervalMs: 5, timeoutMs: 50 });
  await assert.rejects(slow.generateVideo('x'), /timed out/);
});
