import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tell, moveOffered, moveEnds, moveTargets, moveSteps, pathLabel, Move, TellOptions } from '../../src/core/story.js';
import type { MoveTarget } from '../../src/core/storyEdit.js';

// Job 457: "Move …" on a line: the line (and the lines after it, up to a chosen one) goes elsewhere.
const start: Move = { move: 'start', text: 'Antrag geht ein', role: 'Amt' };
const task = (text: string): Move => ({ move: 'task', text, role: 'Amt' });
const end = (text: string): Move => ({ move: 'end', text });
const merge: Move = { move: 'merge' };
const check: Move = { move: 'decision', question: 'Vollständig?', yes: 'ja', no: 'nein' };
const FITS = 'Dorthin lässt sich das nicht verschieben; ändern Sie zuerst die Wege um diese Zeilen';

const state = (moves: Move[], opts: TellOptions = {}) => tell(moves, 'de', opts);
const names = (moves: Move[]) => moves.map((m) => ('text' in m ? m.text : m.move === 'goTo' ? `goTo` : m.move));
/** The target of the lines i to e that matches `pick`. */
function target(moves: Move[], i: number, e: number, pick: (x: MoveTarget) => boolean, opts: TellOptions = {}): MoveTarget {
	const all = moveTargets(moves, i, e, state(moves, opts));
	const x = all.find(pick);
	assert.ok(x, `Ziel fehlt: ${JSON.stringify(all)}`);
	return x!;
}
function moved(moves: Move[], i: number, e: number, pick: (x: MoveTarget) => boolean, opts: TellOptions = {}): Move[] {
	assert.deepEqual(state(moves, opts).errors, [], 'Ausgangsgeschichte gültig');
	const r = moveSteps(moves, i, e, target(moves, i, e, pick, opts).pos, 'de', opts);
	assert.ok('moves' in r, 'error' in r ? r.error : '');
	assert.deepEqual(state(r.moves, opts).errors, []);
	assert.deepEqual(r.moves[r.at], moves[i], '`at` zeigt auf die Zeile');
	return r.moves;
}
function refused(moves: Move[], i: number, e: number, pos: number): { error: string; line?: number } {
	const copy = structuredClone(moves);
	const r = moveSteps(moves, i, e, pos, 'de');
	assert.ok('error' in r, 'abgelehnt');
	assert.deepEqual(moves, copy, 'Eingabe unverändert');
	return r;
}
const after = (n: number) => (x: MoveTarget) => x.after === n;
const pathStart = (at: number, n: number) => (x: MoveTarget) => x.path?.at === at && x.path.n === n;
const text = (moves: Move[]) => state(moves).storyText.map((l) => `${l.depth}|${l.text}`);

const LINE: Move[] = [start, task('A'), task('B'), task('C'), task('D'), end('Fertig')];

test('AK1 on the main path: one line behind a later one, two lines to the start', () => {
	assert.deepEqual(names(moved(LINE, 2, 2, after(4))), ['Antrag geht ein', 'A', 'C', 'D', 'B', 'Fertig']);
	assert.deepEqual(moveEnds(LINE, 2, state(LINE)), [2, 3, 4, 5]);
	assert.deepEqual(names(moved(LINE, 2, 3, after(0))), ['Antrag geht ein', 'B', 'C', 'A', 'D', 'Fertig']);
	// Moving a line right behind the line before it changes nothing: not a target.
	assert.ok(!moveTargets(LINE, 2, 2, state(LINE)).some((x) => x.after === 1 || x.pos === 2 || x.pos === 3));
});

// A, check: yes: X, merge; no: Y, merge; then Z, end.
const CHECK: Move[] = [start, task('A'), check, task('X'), merge, task('Y'), merge, task('Z'), end('Fertig')];

test('AK2 into a path of a check: to the start of path "nein", and from after the merge behind a step on a path', () => {
	const a = moved(CHECK, 1, 1, pathStart(2, 1));
	assert.deepEqual(names(a), ['Antrag geht ein', 'decision', 'X', 'merge', 'A', 'Y', 'merge', 'Z', 'Fertig']);
	const s = state(a);
	assert.equal(s.trace.owner[4], '1.1', 'A liegt auf dem Nein-Weg');
	const ir = s.ir;
	const nodeA = ir.nodes.find((n) => n.name === 'A')!;
	const gateway = ir.edges.find((e) => e.to === nodeA.id)!;
	assert.equal(ir.nodes.find((n) => n.id === gateway.from)?.kind, 'gateway');
	assert.equal(pathLabel(CHECK, 2, 1, 'de'), 'nein');
	const z = moved(CHECK, 7, 7, after(3));
	assert.deepEqual(names(z), ['Antrag geht ein', 'A', 'decision', 'X', 'Z', 'merge', 'Y', 'merge', 'Fertig']);
	assert.deepEqual(text(z).slice(3, 7), ['0|→ ja:', '1|[@Amt] soll [X].', '1|[@Amt] soll [Z].', '1|ZUSAMMENFÜHREN.']);
});

test('AK3 a branch moves with everything on its paths; what comes after its merge stays', () => {
	// A, B, check(yes: X, merge; no: Y, merge), Z, C, end: the check moves behind C, Z stays behind B.
	const story: Move[] = [start, task('A'), task('B'), check, task('X'), merge, task('Y'), merge, task('Z'), task('C'), end('Fertig')];
	const r = moved(story, 3, 3, after(9));
	assert.deepEqual(names(r), ['Antrag geht ein', 'A', 'B', 'Z', 'C', 'decision', 'X', 'merge', 'Y', 'merge', 'Fertig']);
	// Back to the start: behind the trigger.
	const back = moved(story, 3, 3, after(0));
	assert.deepEqual(names(back), ['Antrag geht ein', 'decision', 'X', 'merge', 'Y', 'merge', 'A', 'B', 'Z', 'C', 'Fertig']);
	const par: Move[] = [start, task('A'), { move: 'concurrent' }, task('S1'), merge, task('S2'), merge, task('B'), end('Fertig')];
	assert.equal(pathLabel(par, 2, 1, 'de'), 'zweiter Strang');
	const p = moved(par, 2, 2, after(7));
	assert.deepEqual(names(p), ['Antrag geht ein', 'A', 'B', 'concurrent', 'S1', 'merge', 'S2', 'merge', 'Fertig']);
	// Into a strand of "in parallel".
	const q = moved(par, 1, 1, pathStart(2, 1));
	assert.equal(state(q).trace.owner[4], '1.1');
});

test('AK4 what can move and how far the lines along it go', () => {
	const s = state(CHECK);
	for (const j of [0, 4, 6, 8]) assert.equal(moveOffered(CHECK, j, s), false, `Zeile ${j}`);
	for (const j of [1, 2, 3, 5, 7]) assert.equal(moveOffered(CHECK, j, s), true, `Zeile ${j}`);
	assert.deepEqual(moveEnds(CHECK, 3, s), [3], 'hält am Zusammen');
	assert.deepEqual(moveEnds(CHECK, 1, s), [1, 2, 7, 8], 'eine Verzweigung zählt als eine Zeile, ENDE als letzte');
	const open: Move[] = [start, task('A'), check, task('X'), { move: 'openPath' }, task('Y'), end('Nein')];
	assert.deepEqual(moveEnds(open, 3, state(open)), [3], 'hält an „Noch offen“');
	const exc: Move[] = [start, task('A'), task('B'), { move: 'exceptionPath', text: 'Fehler' }, end('Abbruch'), task('C'), end('Fertig')];
	const se = state(exc);
	assert.deepEqual(se.errors, []);
	assert.equal(moveOffered(exc, 2, se), false, 'Schritt mit Ausnahme');
	assert.equal(moveOffered(exc, 3, se), false, 'Ausnahmeweg');
	assert.deepEqual(moveEnds(exc, 1, se), [1], 'hält vor dem Schritt mit Ausnahme');
	const goTo: Move[] = [start, task('A'), check, task('X'), { move: 'goTo', target: state([start, task('A')]).nodes[1]! }, task('Y'), end('Nein')];
	assert.deepEqual(state(goTo).errors, []);
	assert.equal(moveOffered(goTo, 4, state(goTo)), false);
	assert.deepEqual(moveEnds(goTo, 3, state(goTo)), [3, 4], '„Weiter bei“ als letzte');
});

test('AK5 refusals leave the story as it was', () => {
	// The target of a "continue at" would come after it.
	const a = state([start, task('A'), task('B')]).nodes[2]!;
	const story: Move[] = [start, task('A'), task('B'), check, { move: 'goTo', target: a }, task('C'), end('Fertig')];
	assert.deepEqual(state(story).errors, []);
	const behindC = target(story, 2, 2, after(5)).pos;
	const r = refused(story, 2, 2, behindC);
	assert.equal(r.error, 'Zeile 5 führt danach zu einem Schritt, der erst später erzählt wird – dort zuerst ändern');
	assert.equal(r.line, 4);
	// Lines with their end into the middle of a path: what follows there would land on another path.
	const tail: Move[] = [start, task('A'), task('B'), check, task('X'), merge, task('C'), end('Ja'), { move: 'openPath' }];
	const s = state(tail);
	assert.deepEqual(s.errors, []);
	assert.deepEqual(refused(tail, 6, 7, target(tail, 6, 7, after(1)).pos).error, FITS);
	// Not one of the targets.
	assert.equal(refused(LINE, 2, 2, 2).error, FITS);
	assert.equal(refused(LINE, 2, 2, 99).error, FITS);
	assert.equal(refused(LINE, 5, 5, 2).error, FITS, 'ENDE allein nicht');
});

test('AK5 lines with their end into a path that loops back: refused, nothing changes', () => {
	const a = state([start, task('A')]).nodes[1]!;
	const story: Move[] = [start, task('A'), check, task('X'), { move: 'goTo', target: a }, task('Y'), end('Fertig')];
	assert.deepEqual(state(story).errors, []);
	// Y with its end to the start of "ja": the path "ja" ends there, "nein" is left without a line.
	const r = refused(story, 5, 6, target(story, 5, 6, pathStart(2, 0)).pos);
	assert.equal(r.error, FITS);
});

test('AK5 no end any more: the only way out of a loop moves away, refused with the "continue at"', () => {
	// Y (yes: P, merge; no: Q, merge), A, X (done: end; again: merge), B, continue at A.
	// X moves into the first path of Y: A, B, continue at A would loop without an end.
	const y: Move = { move: 'decision', question: 'Y?', yes: 'ja', no: 'nein' };
	const x: Move = { move: 'decision', question: 'X?', yes: 'fertig', no: 'weiter' };
	const pre: Move[] = [start, y, task('P'), merge, task('Q'), merge, task('A')];
	const a = state(pre).nodes[6]!;
	const story: Move[] = [...pre, x, end('Raus'), merge, task('B'), { move: 'goTo', target: a }];
	assert.deepEqual(state(story).errors, []);
	const r = refused(story, 7, 7, target(story, 7, 7, pathStart(1, 0)).pos);
	assert.equal(r.error, 'Danach käme der Ablauf nie zu einem Ende: Zeile 12 führt zurück zu „A“ – dort zuerst ändern');
	assert.equal(r.line, 11);
	// Behind B it stays in the loop: fine.
	moved(story, 7, 7, after(10));
});

test('AK6 "continue at" to a moved step still leads to that step', () => {
	// A, B, check: yes: continue at B; no: end. B moves behind A's trigger (before A).
	const b = state([start, task('A'), task('B')]).nodes[2]!;
	const story: Move[] = [start, task('A'), task('B'), check, { move: 'goTo', target: b }, end('Fertig')];
	assert.deepEqual(state(story).errors, []);
	const r = moved(story, 2, 2, after(0));
	const s = state(r);
	const goTo = r.find((m) => m.move === 'goTo') as { target: string };
	assert.equal(s.ir.nodes.find((n) => n.id === goTo.target)?.name, 'B');
});

test('AK8 core: on a flow without a trigger the start is a target', () => {
	const opts: TellOptions = { inner: { name: 'Klären' } };
	const flow: Move[] = [task('A'), task('B'), end('Fertig')];
	assert.deepEqual(names(moved(flow, 1, 1, (x) => !!x.start, opts)), ['B', 'A', 'Fertig']);
});

test('Risk: a long story offers its targets fast', () => {
	const many: Move[] = [start, ...Array.from({ length: 30 }, (_, n) => task(`S${n}`)), end('Fertig')];
	const s = state(many);
	const t0 = Date.now();
	for (let i = 1; i <= 30; i++) moveTargets(many, i, i, s);
	assert.ok(Date.now() - t0 < 500);
});

test('Risk: a check moves into a strand of "in parallel", both merges stay right', () => {
	const story: Move[] = [start, task('A'), check, task('X'), merge, task('Y'), merge, { move: 'concurrent' }, task('S1'), merge, task('S2'), merge, end('Fertig')];
	assert.deepEqual(state(story).errors, []);
	const r = moved(story, 2, 2, pathStart(7, 1));
	assert.deepEqual(names(r), ['Antrag geht ein', 'A', 'concurrent', 'S1', 'merge', 'decision', 'X', 'merge', 'Y', 'merge', 'S2', 'merge', 'Fertig']);
	const s = state(r);
	assert.equal(s.trace.closes.filter((b) => b === 5).length, 2);
	assert.equal(s.trace.closes.filter((b) => b === 2).length, 2);
});

test('Risk: "continue at" out of a strand of "in parallel" is refused, never a broken story', () => {
	const a = state([start, task('A')]).nodes[1]!;
	// A, check: yes: continue at A; no: B, end. Then the check moves into a strand of "in parallel".
	const story: Move[] = [start, task('A'), check, { move: 'goTo', target: a }, task('B'), { move: 'concurrent' }, task('S1'), merge, task('S2'), merge, end('Fertig')];
	assert.deepEqual(state(story).errors, []);
	const all = moveTargets(story, 2, 2, state(story));
	for (const x of all) {
		const r = moveSteps(story, 2, 2, x.pos, 'de');
		if ('moves' in r) assert.deepEqual(state(r.moves).errors, [], JSON.stringify(x));
	}
});
