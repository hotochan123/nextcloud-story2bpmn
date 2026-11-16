import { test } from 'node:test';
import assert from 'node:assert/strict';
import { descends, sameMoves } from '../../src/core/story.js';
import { shortDate } from '../../src/core/language.js';

const trace = { parent: { '1.0': 'r', '1.1': 'r', '3.0': '1.0', '3.0+': '1.0' } };

test('descends: a path stems from itself, its ancestors and nothing else', () => {
  assert.equal(descends(trace, '1.0', '1.0'), true);
  assert.equal(descends(trace, '3.0', '1.0'), true);
  assert.equal(descends(trace, '3.0', 'r'), true);
  assert.equal(descends(trace, '3.0', '1.1'), false);
  assert.equal(descends(trace, undefined, 'r'), false);
});

test('descends: a test on the keys on the way up', () => {
  assert.equal(descends(trace, '3.0', (k) => k.startsWith('1.')), true);
  assert.equal(descends(trace, '1.1', (k) => k.startsWith('3.')), false);
});

test('sameMoves compares moves field by field and in order', () => {
  assert.equal(sameMoves([{ move: 'task', text: 'A' }], [{ move: 'task', text: 'A' }]), true);
  assert.equal(sameMoves([{ move: 'task', text: 'A' }], [{ move: 'task', text: 'B' }]), false);
  assert.equal(sameMoves([], []), true);
});

test('shortDate: day.month.year in German, day/month/year in English', () => {
  assert.equal(shortDate('2026-11-14T10:00:00Z', 'de'), '14.11.2026');
  assert.equal(shortDate('2026-11-14T10:00:00Z', 'en'), '14/11/2026');
});
