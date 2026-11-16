import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tell, splice, Move } from '../../src/core/story.js';
import { validateIR } from '../../src/core/validate.js';
import { toBpmn } from '../../src/core/toBpmn.js';
import { layout } from '../../src/core/layout.js';
import type { ProcessIR } from '../../src/core/ir.js';

const start: Move = { move: 'start', text: 'Antrag geht ein', role: 'Team' };
const task = (text: string): Move => ({ move: 'task', text, role: 'Team' });
const merge: Move = { move: 'merge' };
const done: Move = { move: 'end', text: 'Fertig' };
const size: Move = { move: 'decision', question: 'Größe?', yes: 'klein', more: ['mittel'], no: 'groß' };

/** Tells the moves without errors and returns the edges from the branch node to its merge. */
function told(moves: Move[]) {
  const s = tell(moves, 'de');
  assert.deepEqual(s.errors, []);
  return s;
}
const toMerge = (ir: ProcessIR, from: string) => ir.edges.filter((e) => e.from === from && ir.nodes.find((n) => n.id === e.to)?.id.startsWith('Zusammen_'));

test('AK1 two empty paths of a check share one arrow named after both', () => {
  const s = told([start, size, merge, merge, task('Chef'), merge, done]);
  const split = s.ir.nodes.find((n) => n.kind === 'gateway' && n.name === 'Größe?')!;
  const arrows = toMerge(s.ir, split.id);
  assert.equal(arrows.length, 1);
  assert.equal(arrows[0].name, 'klein / mittel');
  assert.equal(arrows[0].condition, 'klein / mittel');
  assert.ok(!arrows[0].isDefault);
  const chef = s.ir.edges.find((e) => e.from === split.id && s.ir.nodes.find((n) => n.id === e.to)?.name === 'Chef')!;
  assert.equal(chef.isDefault, true);
  assert.equal(chef.name, 'groß');
  assert.deepEqual(validateIR(s.ir), []);
});

test('AK2 with the otherwise path among the empty ones the shared arrow is the default path', () => {
  const s = told([start, size, task('Chef'), merge, merge, merge, done]);
  const split = s.ir.nodes.find((n) => n.name === 'Größe?')!;
  const [arrow] = toMerge(s.ir, split.id);
  assert.equal(toMerge(s.ir, split.id).length, 1);
  assert.equal(arrow.name, 'mittel / groß');
  assert.equal(arrow.isDefault, true);
  assert.equal(arrow.condition, undefined);
  assert.deepEqual(validateIR(s.ir), []);
});

test('AK3 two empty strands of "at the same time" share one arrow without a name', () => {
  const s = told([start, { move: 'concurrent', branches: 3 }, merge, task('Prüfen'), merge, merge, done]);
  const split = s.ir.nodes.find((n) => n.kind === 'gateway' && n.gatewayType === 'parallel' && !n.id.startsWith('Zusammen_'))!;
  const arrows = toMerge(s.ir, split.id);
  assert.equal(arrows.length, 1);
  assert.equal(arrows[0].name, undefined);
  assert.deepEqual(validateIR(s.ir), []);
});

test('AK4 four paths with two empty ones, and empty paths inside an inner branch', () => {
  const four: Move = { move: 'decision', question: 'Art?', yes: 'A', more: ['B', 'C'], no: 'D' };
  const s = told([start, four, merge, task('Für B'), merge, merge, task('Für D'), merge, done]);
  const split = s.ir.nodes.find((n) => n.name === 'Art?')!;
  assert.deepEqual(toMerge(s.ir, split.id).map((e) => e.name), ['A / C']);
  const inner: Move = { move: 'decision', question: 'Eilig?', yes: 'ja', more: ['bald'], no: 'nein' };
  const n = told([start, size, inner, merge, merge, task('Warten'), merge, task('Klein fertig'), merge, task('Mittel'), merge, task('Chef'), merge, done]);
  const innerSplit = n.ir.nodes.find((x) => x.name === 'Eilig?')!;
  assert.deepEqual(toMerge(n.ir, innerSplit.id).map((e) => e.name), ['ja / bald']);
  assert.deepEqual(validateIR(n.ir), []);
});

test('AK5 all paths empty: no refusal any more (job 419), and no internal edge message', () => {
  const two: Move = { move: 'decision', question: 'Eilig?', yes: 'ja', no: 'nein' };
  assert.deepEqual(tell([start, two, merge, merge, done], 'de').errors, []);
  assert.deepEqual(tell([start, two, merge, merge, done], 'en').errors, []);
  assert.deepEqual(tell([start, { move: 'concurrent' }, merge, merge, done], 'de').errors, []);
});

test('AK6 deleting the only step of a path leaves an empty path that shares the arrow', () => {
  const moves: Move[] = [start, size, merge, task('Prüfen'), merge, task('Chef'), merge, done];
  told(moves);
  // remove() of the workbench is splice(moves, i, 1, []); change() takes it when tell() has no errors.
  const out = splice(moves, 3, 1, [], 'de');
  const s = told(out);
  const split = s.ir.nodes.find((n) => n.name === 'Größe?')!;
  assert.deepEqual(toMerge(s.ir, split.id).map((e) => e.name), ['klein / mittel']);
  // The last step of the branch goes: every path is empty, which is allowed since job 419.
  const two: Move[] = [start, { move: 'decision', question: 'Eilig?', yes: 'ja', no: 'nein' }, merge, task('Chef'), merge, done];
  told(two);
  assert.deepEqual(told(splice(two, 3, 1, [], 'de')).bare, [1]);
});

test('AK7 the BPMN file has one sequence flow named "klein / mittel" from the branch to the merge', async () => {
  const s = told([start, size, merge, merge, task('Chef'), merge, done]);
  const { xml } = await toBpmn(s.ir, layout(s.ir));
  const split = s.ir.nodes.find((n) => n.name === 'Größe?')!.id;
  const flows = [...xml.matchAll(/<bpmn:sequenceFlow [^>]*>/g)].map((m) => m[0]).filter((f) => f.includes(`sourceRef="${split}"`) && /targetRef="Zusammen_/.test(f));
  assert.equal(flows.length, 1);
  assert.match(flows[0], /name="klein \/ mittel"/);
});

test('Risk: continue at a step after the merge leads back to that step', () => {
  const head: Move[] = [start, size, merge, merge, task('Chef'), merge, task('Buchen'), { move: 'decision', question: 'Ok?', yes: 'ja', no: 'nein' }, end('Gebucht')];
  const buchen = tell(head, 'de').ir.nodes.find((n) => n.name === 'Buchen')!.id;
  const s = told([...head, { move: 'goTo', target: buchen }]);
  const ok = s.ir.nodes.find((n) => n.name === 'Ok?')!.id;
  const back = s.ir.edges.find((e) => e.from === ok && e.name === 'nein')!;
  assert.ok(back.to === buchen || s.ir.edges.some((e) => e.from === back.to && e.to === buchen));
  assert.equal(s.ir.nodes.filter((n) => n.name === 'Buchen').length, 1);
});

function end(text: string): Move {
  return { move: 'end', text };
}
