import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { TtlMap } from '../src/utils/TtlMap.js';

test('entries expire after the TTL', () => {
  mock.timers.enable({ apis: ['Date'], now: 0 });
  try {
    const m = new TtlMap<string, number>(10_000);
    m.set('a', 1);
    mock.timers.tick(9_999);
    assert.equal(m.get('a'), 1);
    assert.equal(m.has('a'), true);
    mock.timers.tick(1);
    assert.equal(m.has('a'), false);
    assert.equal(m.get('a'), undefined);
    assert.equal(m.size, 0);
  } finally {
    mock.timers.reset();
  }
});

test('set refreshes the TTL and expired entries are swept on writes', () => {
  mock.timers.enable({ apis: ['Date'], now: 0 });
  try {
    const m = new TtlMap<string, number>(10_000);
    m.set('a', 1);
    m.set('b', 2);
    mock.timers.tick(8_000);
    m.set('a', 3); // refreshed; 'b' is now the oldest
    mock.timers.tick(3_000);
    m.set('c', 4); // sweep drops 'b' without anyone reading it
    assert.deepEqual([...m.keys()].sort(), ['a', 'c']);
    assert.equal(m.get('a'), 3);
  } finally {
    mock.timers.reset();
  }
});

test('oldest entries are dropped beyond maxSize', () => {
  const m = new TtlMap<number, number>(60_000, 3);
  for (let i = 0; i < 5; i++) m.set(i, i);
  assert.deepEqual([...m.keys()], [2, 3, 4]);
  m.set(2, 20); // re-set moves it to the newest position
  m.set(5, 5);
  assert.deepEqual([...m.keys()], [4, 2, 5]);
});
