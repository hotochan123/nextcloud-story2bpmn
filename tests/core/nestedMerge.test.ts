import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tell, insertBefore, Move } from '../../src/core/story.js';
import { validateIR } from '../../src/core/validate.js';
import type { ProcessIR } from '../../src/core/ir.js';

// Job 421: a branch told in the last path of another one, both closed with "merge": the outer
// branch waits for the inner one's continuation instead of merging with its first path alone.
const start: Move = { move: 'start', text: 'Antrag geht ein', role: 'Team' };
const task = (text: string): Move => ({ move: 'task', text, role: 'Team' });
const merge: Move = { move: 'merge' };
const end = (text: string): Move => ({ move: 'end', text });
const urgent: Move = { move: 'decision', question: 'Eilig?', yes: 'ja', no: 'nein' };
const big: Move = { move: 'decision', question: 'Groß?', yes: 'ja', no: 'nein' };
const both: Move = { move: 'concurrent', branches: 2 };

const named = (ir: ProcessIR, name: string) => ir.nodes.find((n) => n.name === name)!;
const merges = (ir: ProcessIR) => ir.nodes.filter((n) => n.id.startsWith('Zusammen_'));
const into = (ir: ProcessIR, id: string) => ir.edges.filter((e) => e.to === id).map((e) => e.from).sort();

function finished(moves: Move[], language: 'de' | 'en' = 'de') {
  const s = tell(moves, language);
  assert.deepEqual(s.errors, []);
  assert.deepEqual(validateIR(s.ir), []);
  assert.equal(s.done, true);
  return s;
}

const inner = [start, urgent, task('Schnell'), merge, big, task('Chef'), merge, task('Selbst'), merge];
const story = [...inner, merge, task('Ablegen'), end('Fertig')];

test('AK1 after the inner merge one path is open, merging again closes the outer branch with all its paths', () => {
  for (const language of ['de', 'en'] as const) {
    const open = tell(inner, language);
    assert.deepEqual(open.errors, []);
    assert.equal(open.trace.keys.length, 1);
    assert.ok(open.options.includes('merge'));
    assert.equal(open.done, false);

    const s = finished(story, language);
    const ms = merges(s.ir);
    assert.equal(ms.length, 2);
    const chef = named(s.ir, 'Chef').id;
    const selbst = named(s.ir, 'Selbst').id;
    const schnell = named(s.ir, 'Schnell').id;
    const innerMerge = ms.find((m) => into(s.ir, m.id).includes(chef))!;
    assert.deepEqual(into(s.ir, innerMerge.id), [chef, selbst].sort());
    const outerMerge = ms.find((m) => m !== innerMerge)!;
    assert.deepEqual(into(s.ir, outerMerge.id), [innerMerge.id, schnell].sort());
    assert.deepEqual(into(s.ir, named(s.ir, 'Ablegen').id), [outerMerge.id]);
  }
});

test('AK2 "in parallel" outside or inside, and three paths outside, merge the same way', () => {
  const variants: Move[][] = [
    [start, both, task('Schnell'), merge, big, task('Chef'), merge, task('Selbst'), merge, merge, task('Ablegen'), end('Fertig')],
    [start, urgent, task('Schnell'), merge, both, task('Chef'), merge, task('Selbst'), merge, merge, task('Ablegen'), end('Fertig')],
    [start, { move: 'decision', question: 'Größe?', yes: 'klein', more: ['mittel'], no: 'groß' }, task('Klein'), merge, task('Mittel'), merge, big, task('Chef'), merge, task('Selbst'), merge, merge, task('Ablegen'), end('Fertig')]
  ];
  for (const moves of variants) {
    const s = finished(moves);
    const ablegen = named(s.ir, 'Ablegen').id;
    const outerMerge = into(s.ir, ablegen)[0];
    assert.ok(outerMerge.startsWith('Zusammen_'));
    assert.equal(into(s.ir, outerMerge).length, moves.length === 14 ? 3 : 2);
  }
});

test('AK3 an inner branch whose last path ends: the outer branch still waits for the continuation', () => {
  const s = finished([start, urgent, task('Schnell'), merge, big, task('Chef'), merge, end('Abgelehnt'), merge, task('Ablegen'), end('Fertig')]);
  const outerMerge = into(s.ir, named(s.ir, 'Ablegen').id)[0];
  assert.deepEqual(into(s.ir, outerMerge), [named(s.ir, 'Chef').id, named(s.ir, 'Schnell').id].sort());
});

test('AK4 "+ before" inserts a branch in the last inner path and before the inner branch', () => {
  const check: Move = { move: 'decision', question: 'Vollständig?', yes: 'ja', no: 'nein' };
  for (const at of [4, 5, 7]) {
    const r = insertBefore(story, at, check, 'de');
    assert.ok('moves' in r, `insertBefore at ${at}: ${'error' in r ? r.error : ''}`);
    const s = tell(r.moves, 'de');
    assert.deepEqual(s.errors, []);
    assert.deepEqual(validateIR(s.ir), []);
  }
});

test('Risk: the story as it was saved before the fix (extra merge on the path left open) replays to a valid diagram', () => {
  // Before job 421 the outer branch merged with "Schnell" alone; this move list was the way to go on.
  finished(story);
});
