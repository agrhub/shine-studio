import { test } from 'node:test';
import assert from 'node:assert/strict';
// Pure editor module (no imports), tested here because the client has no test runner.
import { trimClipAtTime, separatedAudioClip } from '../../client/src/components/editor/timeline/clip-edits.js';

const S = 1_000_000;
const video = {
  id: 'v1',
  type: 'Video',
  name: 'Scene 3',
  src: 'https://cdn/scene3.mp4',
  volume: 0.8,
  timing: {
    display: { from: 10 * S, to: 20 * S },
    trim: { from: 2 * S, to: 12 * S },
    duration: 10 * S,
    playbackRate: 1,
  },
};

test('keep left ends the clip at the playhead and trims the source to match', () => {
  const r = trimClipAtTime(video, 14 * S, 'left')!;
  assert.deepEqual(r.timing.display, { from: 10 * S, to: 14 * S });
  assert.deepEqual(r.timing.trim, { from: 2 * S, to: 6 * S });
  assert.equal(r.timing.duration, 4 * S);
});

test('keep right starts the clip at the playhead and skips that much source', () => {
  const r = trimClipAtTime(video, 14 * S, 'right')!;
  assert.deepEqual(r.timing.display, { from: 14 * S, to: 20 * S });
  assert.deepEqual(r.timing.trim, { from: 6 * S, to: 12 * S });
  assert.equal(r.timing.duration, 6 * S);
});

test('playback rate scales the source offset', () => {
  const fast = { ...video, timing: { ...video.timing, playbackRate: 2 } };
  assert.deepEqual(trimClipAtTime(fast, 13 * S, 'right')!.timing.trim, { from: 8 * S, to: 12 * S });
});

test('nothing happens outside the clip, on its edges, or when it is locked', () => {
  assert.equal(trimClipAtTime(video, 5 * S, 'left'), null);
  assert.equal(trimClipAtTime(video, 10 * S, 'left'), null);
  assert.equal(trimClipAtTime(video, 20 * S, 'right'), null);
  assert.equal(trimClipAtTime({ ...video, locked: true }, 14 * S, 'left'), null);
});

test('legacy clips with top-level display/trim are handled', () => {
  const legacy = { id: 'a', type: 'Audio', display: { from: 0, to: 4 * S }, trim: { from: 0, to: 4 * S } };
  assert.deepEqual(trimClipAtTime(legacy, 1 * S, 'left')!.timing.display, { from: 0, to: 1 * S });
});

test('separate audio copies source, placement, trim and volume of a video', () => {
  const audio = separatedAudioClip(video)!;
  assert.equal(audio.type, 'Audio');
  assert.equal(audio.src, video.src);
  assert.equal(audio.volume, 0.8);
  assert.equal(audio.name, 'Scene 3 (audio)');
  assert.deepEqual(audio.timing.display, video.timing.display);
  assert.deepEqual(audio.timing.trim, video.timing.trim);
  assert.equal(audio.metadata.separatedFrom, 'v1');
});

test('only unlocked videos with a source can be separated', () => {
  assert.equal(separatedAudioClip({ ...video, type: 'Image' }), null);
  assert.equal(separatedAudioClip({ ...video, src: '' }), null);
  assert.equal(separatedAudioClip({ ...video, locked: true }), null);
});
