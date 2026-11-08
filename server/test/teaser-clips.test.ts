import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

process.env.JWT_SECRET = 'test_jwt_secret_that_is_definitely_longer_than_32_chars';

const { analyzeSilence, snapToSilence } = await import('../src/services/media/SilenceDetectionService.js');
const { sanitizeSegments, TEASER_LIMITS } = await import('../src/services/TeaserClipService.js');
const { resolveFfmpegPath } = await import('../src/services/media/ffmpegPath.js');

test('sanitizeSegments clamps, drops invalid/overlapping and caps the count', () => {
  const raw = [
    { start: 20, duration: 20, title: 'A', score: 9 },                 // 20–40
    { start: 25, duration: 20, title: 'overlaps A' },                 // dropped
    { start: -3, duration: 12, title: 'negative start → 0', score: 42 }, // 0–12
    { start: 60, duration: 100, title: 'clamped to episode end' },    // 60–90
    { start: 'x', duration: 10 },                                     // invalid
    { start: 45, duration: 3, title: 'too short' },                   // < min length
    { start: 200, duration: 10, title: 'beyond episode' },            // outside
  ];
  const out = sanitizeSegments(raw, 90, 5);
  assert.deepEqual(out.map((s) => s.title), ['A', 'negative start → 0', 'clamped to episode end']);
  assert.equal(out[1].start, 0);
  assert.equal(out[1].score, 10, 'score clamped to 0-10');
  assert.equal(out[2].duration, Math.min(30, TEASER_LIMITS.maxSec), 'clamped to episode end and max length');
  assert.equal(sanitizeSegments({ segments: raw }, 90, 1).length, 1, 'accepts {segments} and caps count');
  assert.deepEqual(sanitizeSegments('garbage', 90, 3), []);
});

test('snapToSilence moves cuts into the nearest pause within the window', () => {
  const silences = [{ start: 9.6, end: 10.4 }, { start: 30, end: 31 }];
  assert.equal(snapToSilence(10, silences), 10, 'inside a pause → its midpoint');
  assert.equal(snapToSilence(11.2, silences), 10, 'near a pause → snapped');
  assert.equal(snapToSilence(20, silences), 20, 'no pause within window → unchanged');
});

test('analyzeSilence finds real pauses with FFmpeg', { timeout: 60_000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shine-silence-test-'));
  const file = path.join(dir, 'speech.wav');
  // 2s tone, 1s silence, 2s tone, 1s silence, 1s tone  (total 7s)
  execFileSync(resolveFfmpegPath(), [
    '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=7',
    '-af', "volume=enable='between(t,2,3)+between(t,5,6)':volume=0",
    '-y', file,
  ]);

  const result = await analyzeSilence(file, { noiseDb: -40, minSilenceSec: 0.5 });
  assert.ok(Math.abs(result.duration - 7) < 0.1, `duration ${result.duration}`);
  assert.equal(result.silences.length, 2, JSON.stringify(result.silences));
  assert.ok(Math.abs(result.silences[0].start - 2) < 0.15 && Math.abs(result.silences[0].end - 3) < 0.15);
  assert.ok(Math.abs(result.silences[1].start - 5) < 0.15 && Math.abs(result.silences[1].end - 6) < 0.15);
  assert.equal(result.active.length, 3);
  fs.rmSync(dir, { recursive: true, force: true });
});
