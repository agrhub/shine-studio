import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickCaptionKeywords, keywordScore } from '../src/utils/captionKeywords.js';

const picked = (line: string) => {
  const words = line.split(' ');
  const flags = pickCaptionKeywords(words);
  return words.filter((_, i) => flags[i]);
};

test('function words are never emphasised', () => {
  assert.deepEqual(picked('and it was in the'), []);
  assert.deepEqual(picked('tôi và anh đã ở đó'), []);
  assert.equal(keywordScore('the', 1), 0);
});

test('numbers, shouting and strong words win over plain words', () => {
  assert.deepEqual(picked('she paid $500 for this'), ['$500']);
  assert.deepEqual(picked('I said STOP right there'), ['STOP']);
  assert.deepEqual(picked('you will never see me'), ['never']);
  // Vietnamese words are split into syllables; a 6-word line may keep both.
  assert.deepEqual(picked('đừng bao giờ phản bội tôi'), ['phản', 'bội']);
});

test('names mid-line are picked over ordinary words', () => {
  assert.deepEqual(picked('tell Marcus about it'), ['Marcus']);
});

test('at most one keyword per short line, two for long lines', () => {
  assert.equal(picked('wonderful beautiful amazing').length, 1);
  assert.equal(picked('wonderful beautiful amazing incredible fantastic gorgeous').length, 2);
});

test('a lone word is emphasised only for a strong reason', () => {
  assert.deepEqual(pickCaptionKeywords(['walking']), [false]);
  assert.deepEqual(pickCaptionKeywords(['NOW!']), [true]);
  assert.deepEqual(pickCaptionKeywords([]), []);
});

test('the client copy matches this module', async () => {
  const fs = await import('node:fs');
  const strip = (file: string) =>
    fs.readFileSync(new URL(file, import.meta.url), 'utf8').split('\n').filter((l) => !l.includes('Kept identical in')).join('\n');
  assert.equal(strip('../../client/src/utils/caption-keywords.ts'), strip('../src/utils/captionKeywords.ts'));
});
