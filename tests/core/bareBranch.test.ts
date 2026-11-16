import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tell, splice, addPaths, Move } from '../../src/core/story.js';
import { validateIR } from '../../src/core/validate.js';
import type { ProcessIR } from '../../src/core/ir.js';

// Job 419: a branch where no path has a step stays in the story, the diagram goes straight on.
const start: Move = { move: 'start', text: 'Antrag geht ein', role: 'Team' };
const task = (text: string): Move => ({ move: 'task', text, role: 'Team' });
const merge: Move = { move: 'merge' };
const end = (text: string): Move => ({ move: 'end', text });
const urgent: Move = { move: 'decision', question: 'Eilig?', yes: 'ja', no: 'nein' };

function told(moves: Move[], language: 'de' | 'en' = 'de') {
  const s = tell(moves, language);
  assert.deepEqual(s.errors, []);
  assert.deepEqual(validateIR(s.ir), []);
  return s;
}
const named = (ir: ProcessIR, name: string) => ir.nodes.find((n) => n.name === name)!;
const merges = (ir: ProcessIR) => ir.nodes.filter((n) => n.id.startsWith('Zusammen_'));
const gateways = (ir: ProcessIR) => ir.nodes.filter((n) => n.kind === 'gateway');

test('AK1 a check whose paths all go straight to the merge: no gateway, a straight arrow, the move is bare', () => {
  for (const language of ['de', 'en'] as const) {
    const s = told([start, urgent, merge, merge, task('Chef'), end('Fertig')], language);
    assert.equal(gateways(s.ir).length, 0);
    assert.equal(merges(s.ir).length, 0);
    const chef = named(s.ir, 'Chef');
    const from = s.ir.edges.filter((e) => e.to === chef.id);
    assert.equal(from.length, 1);
    assert.equal(s.ir.nodes.find((n) => n.id === from[0].from)?.kind, 'start');
    assert.equal(from[0].condition, undefined);
    assert.deepEqual(s.bare, [1]);
  }
});

test('AK1 "in parallel" with two and three empty strands is left out the same way', () => {
  for (const branches of [2, 3]) {
    const s = told([start, { move: 'concurrent', branches }, ...Array(branches).fill(merge), task('Buchen'), end('Fertig')]);
    assert.equal(gateways(s.ir).length, 0);
    assert.deepEqual(s.bare, [1]);
  }
  // A story without such a branch has no bare moves.
  assert.equal(told([start, task('Prüfen'), end('Fertig')]).bare, undefined);
});

test('AK1 the story text keeps the branch as told', () => {
  const s = told([start, urgent, merge, merge, task('Chef'), end('Fertig')]);
  assert.deepEqual(s.storyText.map((l) => l.text.split(' ')[0]), ['ES', 'WENN', '→', 'ZUSAMMENFÜHREN.', 'SONST', 'ZUSAMMENFÜHREN.', '[@Team]', 'ENDE:']);
});

// The inner branch sits on the first path: a branch in the last path of another one merges wrongly
// for a reason of its own (backlog line "Verschachtelte Verzweigung im letzten Weg").
test('AK2 an empty branch right at the start of a path keeps that path\'s label', () => {
  const size: Move = { move: 'decision', question: 'Größe?', yes: 'klein', no: 'groß' };
  const s = told([start, size, urgent, merge, merge, task('Chef'), merge, task('Selbst'), merge, end('Fertig')]);
  const outer = named(s.ir, 'Größe?');
  assert.ok(!s.ir.nodes.some((n) => n.name === 'Eilig?'));
  const toChef = s.ir.edges.find((e) => e.to === named(s.ir, 'Chef').id)!;
  assert.equal(toChef.from, outer.id);
  assert.equal(toChef.condition, 'klein');
  assert.ok(!toChef.isDefault);
  const toSelf = s.ir.edges.find((e) => e.to === named(s.ir, 'Selbst').id)!;
  assert.equal(toSelf.isDefault, true);
  assert.deepEqual(s.bare, [2]);
});

test('AK2 an empty branch right at the start of the otherwise path keeps its default', () => {
  // The otherwise path is told first (switchTo), so no path of the outer branch is parked before.
  const size: Move = { move: 'decision', question: 'Größe?', yes: 'klein', no: 'groß' };
  const s = told([start, size, { move: 'switchTo', to: 1 }, urgent, merge, merge, task('Chef'), merge, task('Selbst'), merge, end('Fertig')]);
  const toChef = s.ir.edges.find((e) => e.to === named(s.ir, 'Chef').id)!;
  assert.equal(toChef.from, named(s.ir, 'Größe?').id);
  assert.equal(toChef.isDefault, true);
  assert.equal(toChef.name, 'groß');
  assert.deepEqual(s.bare, [3]);
});

test('AK2 inner and outer branch both empty: both are left out', () => {
  const size: Move = { move: 'decision', question: 'Größe?', yes: 'klein', no: 'groß' };
  const s = told([start, size, urgent, merge, merge, merge, merge, task('Buchen'), end('Fertig')]);
  assert.equal(gateways(s.ir).length, 0);
  assert.deepEqual([...s.bare!].sort(), [1, 2]);
  assert.equal(s.ir.edges.find((e) => e.to === named(s.ir, 'Buchen').id)?.from, s.ir.nodes.find((n) => n.kind === 'start')?.id);
});

test('AK3 one path ends, the others go straight on: one arrow from the branch, no merge', () => {
  const three: Move = { move: 'decision', question: 'Eilig?', yes: 'ja', more: ['vielleicht'], no: 'nein' };
  const s = told([start, three, end('Abgelehnt'), merge, merge, task('Chef'), end('Fertig')]);
  assert.equal(merges(s.ir).length, 0);
  const split = named(s.ir, 'Eilig?');
  const toChef = s.ir.edges.filter((e) => e.to === named(s.ir, 'Chef').id);
  assert.equal(toChef.length, 1);
  assert.equal(toChef[0].from, split.id);
  assert.equal(toChef[0].name, 'vielleicht / nein');
  assert.equal(toChef[0].isDefault, true);
  assert.equal(s.bare, undefined);
  // The same in parallel: one strand ends, the empty ones go on from the gateway.
  const p = told([start, { move: 'concurrent', branches: 3 }, end('Info'), merge, merge, task('Buchen'), end('Fertig')]);
  assert.equal(merges(p.ir).length, 0);
  assert.equal(gateways(p.ir).length, 1);
});

test('AK4 deleting the last step makes the branch bare; a new step brings gateway and merge back', () => {
  const two: Move[] = [start, urgent, merge, task('Chef'), merge, task('Buchen'), end('Fertig')];
  const empty = splice(two, 3, 1, [], 'de');
  const s = told(empty);
  assert.deepEqual(s.bare, [1]);
  assert.equal(gateways(s.ir).length, 0);
  const back = told(splice(empty, 2, 0, [task('Eilig buchen')], 'de'));
  assert.equal(back.bare, undefined);
  assert.ok(back.ir.nodes.some((n) => n.name === 'Eilig?'));
  assert.equal(merges(back.ir).length, 1);
});

test('Risk: adding a path to a bare branch and continuing at a step after it', () => {
  const moves: Move[] = [start, urgent, merge, merge, task('Chef'), end('Fertig')];
  const r = addPaths(moves, 1, { move: 'decision', question: 'Eilig?', yes: 'ja', more: ['bald'], no: 'nein' }, 'de');
  assert.ok('moves' in r);
  const s = tell(r.moves, 'de');
  assert.deepEqual(validateIR(s.ir), []);
  const chef = told(moves).nodes[4]!;
  const loop = told([start, urgent, merge, merge, task('Chef'), { move: 'decision', question: 'Ok?', yes: 'ja', no: 'nein' }, end('Gut'), { move: 'goTo', target: chef }]);
  assert.deepEqual(loop.bare, [1]);
});

test('Round 1: after a bare branch right behind the trigger no further trigger is offered or taken', () => {
  const s = tell([start, urgent, merge, merge], 'de');
  assert.deepEqual(s.errors, []);
  assert.ok(!s.options.includes('orStart'));
  assert.ok(s.options.includes('task'));
  const or: Move = { move: 'orStart', text: 'Antrag im Portal', role: 'Portal', subtype: 'message' };
  assert.deepEqual(tell([start, urgent, merge, merge, or], 'de').errors, ['Ein weiterer Auslöser steht direkt nach dem Auslöser']);
  // Right after the trigger it is still offered and taken.
  assert.ok(tell([start], 'de').options.includes('orStart'));
  assert.deepEqual(told([start, or, task('Prüfen'), end('Fertig')]).errors, []);
});
