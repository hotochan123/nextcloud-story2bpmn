import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tell, joinAllFrom, joinAllOffered, insertBefore, Move, TellOptions } from '../../src/core/story.js';
import { nodeById } from '../../src/core/ir.js';

// Job 456: "From here on for all paths" on a line of a path of a branch.
const start: Move = { move: 'start', text: 'Antrag geht ein', role: 'Amt' };
const task = (text: string): Move => ({ move: 'task', text, role: 'Amt' });
const end = (text: string): Move => ({ move: 'end', text });
const merge: Move = { move: 'merge' };
const open: Move = { move: 'openPath' };
const joins: Move = { move: 'openPath', joins: true };
const check: Move = { move: 'decision', question: 'Vollständig?', yes: 'nein', no: 'ja' };
const three: Move = { move: 'decision', question: 'Art?', yes: 'a', more: ['b'], no: 'c' };
const FITS = 'Ab hier für alle Wege passt hier nicht; ändern Sie zuerst die Wege um diese Zeile';
const AFTER = 'Nach dem Zusammenführen ist schon erzählt, wie es weitergeht – das passt hier nicht';

function joined(moves: Move[], i: number, opts: TellOptions = {}): Move[] {
	assert.deepEqual(tell(moves, 'de', opts).errors, [], 'Ausgangsgeschichte gültig');
	assert.ok(joinAllOffered(moves, i, tell(moves, 'de', opts).trace), 'angeboten');
	const r = joinAllFrom(moves, i, 'de', opts);
	assert.ok('moves' in r, 'error' in r ? r.error : '');
	assert.deepEqual(tell(r.moves, 'de', opts).errors, []);
	assert.deepEqual(r.moves[r.at], moves[i], '`at` zeigt auf die Zeile');
	return r.moves;
}
function refused(moves: Move[], i: number): { error: string; line?: number } {
	const copy = structuredClone(moves);
	const r = joinAllFrom(moves, i, 'de');
	assert.ok('error' in r, 'abgelehnt');
	assert.deepEqual(moves, copy, 'Eingabe unverändert');
	return r;
}
const text = (moves: Move[]) => tell(moves, 'de').storyText.map((l) => `${l.depth}|${l.text}`);

test('AK1 the example of the backlog line: the path merges, the rest applies to both paths', () => {
	// "+ Insert before" on the end leaves the "ja" path still open (job 408).
	const told: Move[] = [start, task('Antrag prüfen'), task('Unterlagen anfordern'), task('Antrag bescheiden'), end('Erledigt')];
	const r = insertBefore(told, 2, check, 'de');
	assert.ok('moves' in r, 'error' in r ? r.error : '');
	assert.deepEqual(r.moves, [start, task('Antrag prüfen'), check, task('Unterlagen anfordern'), task('Antrag bescheiden'), end('Erledigt'), open]);
	const out = joined(r.moves, 4);
	assert.deepEqual(out, [start, task('Antrag prüfen'), check, task('Unterlagen anfordern'), merge, joins, task('Antrag bescheiden'), end('Erledigt')]);
	const lines = text(out);
	assert.ok(lines.includes('1|ZUSAMMENFÜHREN.') && lines.includes('1|NOCH OFFEN, DANN ZUSAMMENFÜHREN.'));
	assert.deepEqual(lines.slice(-2), ['0|[@Amt] soll [Antrag bescheiden].', '0|ENDE: [Erledigt].']);
	const ir = tell(out, 'de').ir;
	const step = ir.nodes.find((n) => n.name === 'Antrag bescheiden')!;
	const into = ir.edges.filter((e) => e.to === step.id).map((e) => nodeById(ir, e.from)!);
	assert.equal(into.length, 1);
	assert.equal(into[0].kind, 'gateway');
	assert.equal(ir.edges.filter((e) => e.to === into[0].id).length, 2, 'beide Wege laufen ins Zusammen');
	assert.equal(ir.nodes.filter((n) => n.kind === 'end').length, 1);
});

test('AK2 three paths: one merges already, one is not told yet; with a continuation told after the merge', () => {
	const story: Move[] = [start, three, task('A'), task('B'), task('C'), merge, task('X'), merge];
	assert.deepEqual(tell(story, 'de').trace.keys, ['1.2']);
	assert.deepEqual(joined(story, 3), [start, three, task('A'), merge, task('X'), merge, joins, task('B'), task('C')]);
	const full: Move[] = [start, three, task('A'), task('B'), task('C'), merge, task('X'), merge, task('Y'), merge, task('D'), end('E')];
	assert.deepEqual(joined(full, 3), [start, three, task('A'), merge, task('X'), merge, task('Y'), merge, task('B'), task('C'), task('D'), end('E')]);
});

test('AK3 "in parallel" and "what comes first": kinds and names of the paths stay', () => {
	const par: Move[] = [start, { move: 'concurrent' }, task('Eins'), task('Gemeinsam'), end('Fertig'), task('Zwei'), open];
	assert.deepEqual(joined(par, 3), [start, { move: 'concurrent' }, task('Eins'), merge, task('Zwei'), joins, task('Gemeinsam'), end('Fertig')]);
	const first: Move = { move: 'decision', subtype: 'first', yes: 'Zahlung kommt', yesKind: 'message', no: 'Frist vorbei', noKind: 'time' };
	const story: Move[] = [start, first, task('Buchen'), task('Ablegen'), end('Fertig'), task('Mahnen'), merge];
	const out = joined(story, 3);
	assert.deepEqual(out, [start, first, task('Buchen'), merge, task('Mahnen'), merge, task('Ablegen'), end('Fertig')]);
});

test('AK4 a line after a branch inside the path counts for the outer path; where it is not offered', () => {
	const inner: Move = { move: 'decision', question: 'Eilig?', yes: 'ja', no: 'nein' };
	const story: Move[] = [start, check, task('A'), inner, task('Schnell'), merge, task('Normal'), merge, task('B'), end('Fertig'), task('X'), merge];
	assert.deepEqual(joined(story, 8), [start, check, task('A'), inner, task('Schnell'), merge, task('Normal'), merge, merge, task('X'), merge, task('B'), end('Fertig')]);
	// On a path of the inner branch only that branch is changed.
	const nested: Move[] = [start, check, inner, task('S1'), task('S2'), merge, task('N'), merge, end('Fertig'), task('X'), end('Y')];
	assert.deepEqual(joined(nested, 4), [start, check, inner, task('S1'), merge, task('N'), merge, task('S2'), end('Fertig'), task('X'), end('Y')]);
	const offered = (moves: Move[], i: number) => joinAllOffered(moves, i, tell(moves, 'de').trace);
	// The first line of a path, a merge, a path still open, the main path.
	assert.equal(offered(story, 2), false);
	assert.equal(offered(story, 5), false);
	assert.equal(offered([start, check, task('A'), open, task('B'), open], 3), false);
	assert.equal(offered(story, 1), false);
	assert.equal(offered([start, task('A'), task('B'), end('C')], 2), false);
	// On an exception path and on the normal path beside it.
	const exc: Move[] = [start, check, task('A'), { move: 'exceptionPath', text: 'Fehler' }, task('Melden'), end('Abbruch'), task('B'), end('Fertig'), task('X'), merge];
	assert.deepEqual(tell(exc, 'de').errors, []);
	assert.equal(offered(exc, 5), false);
	assert.equal(offered(exc, 7), false);
	assert.equal(offered(exc, 3), false);
});

test('AK5 refusals: another path ends on its own, the merge is followed already, "continue at" into the part, pulling forward', () => {
	const ended: Move[] = [start, check, task('A'), task('B'), end('Fertig'), task('X'), end('Y')];
	const r1 = refused(ended, 3);
	assert.equal(r1.error, 'Ein anderer Weg dieser Verzweigung endet schon für sich (Zeile 7) – dort zuerst ändern');
	assert.equal(r1.line, 6);
	const s = tell([start, task('Vorher'), check, task('A'), task('B'), end('Fertig')], 'de');
	const back: Move[] = [start, task('Vorher'), check, task('A'), task('B'), end('Fertig'), task('X'), { move: 'goTo', target: s.nodes[1]! }];
	assert.deepEqual(tell(back, 'de').errors, []);
	assert.equal(refused(back, 4).line, 7);
	// The path ends on its own, the others merged and the story went on after the merge.
	const after: Move[] = [start, three, task('A'), task('B'), end('Fertig'), task('X'), merge, task('Y'), merge, task('D'), end('E')];
	assert.equal(refused(after, 3).error, AFTER);
	// A later path merges, but a branch on it leads into the part that moves behind it.
	const sub: Move = { move: 'decision', question: 'Rückfrage?', yes: 'ja', no: 'nein' };
	const b = tell([start, check, task('A'), task('B')], 'de').nodes[3]!;
	const into: Move[] = [start, check, task('A'), task('B'), end('E'), task('X'), sub, { move: 'goTo', target: b }, merge, merge];
	assert.deepEqual(tell(into, 'de').errors, []);
	const r3 = refused(into, 3);
	assert.equal(r3.error, 'Zeile 8 führt in den Teil, der für alle Wege gelten soll – dort zuerst ändern');
	assert.equal(r3.line, 7);
	const pulled: Move[] = [start, { move: 'concurrent', branches: 3 }, task('Eins'), task('Zwei'), { move: 'switchTo', to: 2 }, task('Drei'), merge, merge, task('Vier'), merge];
	assert.deepEqual(tell(pulled, 'de').errors, []);
	assert.equal(refused(pulled, 3).error, FITS);
	// Not offered: refused the same way.
	assert.equal(refused(ended, 2).error, FITS);
});

test('AK6 "continue at" in the moved part and on a later path keep their targets', () => {
	const before = tell([start, task('Vorher')], 'de').nodes[1]!;
	const inner: Move = { move: 'decision', question: 'Nochmal?', yes: 'ja', no: 'nein' };
	const inner2: Move = { move: 'decision', question: 'Zurück?', yes: 'ja', no: 'nein' };
	const story: Move[] = [start, task('Vorher'), check, task('A'), task('B'), inner, { move: 'goTo', target: before }, end('F'), task('X'), inner2, { move: 'goTo', target: before }, merge, merge];
	assert.deepEqual(tell(story, 'de').errors, []);
	const out = joined(story, 4);
	assert.deepEqual(out.map((m) => m.move), ['start', 'task', 'decision', 'task', 'merge', 'task', 'decision', 'goTo', 'merge', 'merge', 'task', 'decision', 'goTo', 'end']);
	const s = tell(out, 'de');
	const targets = out.flatMap((m) => (m.move === 'goTo' ? [nodeById(s.ir, m.target)?.name] : []));
	assert.deepEqual(targets, ['Vorher', 'Vorher']);
	// Leading back without an end left on the way: refused (the flow would never end).
	const loop: Move[] = [start, task('Vorher'), check, task('A'), task('B'), { move: 'goTo', target: before }, task('X'), open];
	assert.ok('error' in joinAllFrom(loop, 4, 'de'));
});

test('Risk: on a flow behind a step and in "at any time" only that flow changes', () => {
	const inner: Move[] = [task('Lesen'), check, task('A'), task('B'), end('Fertig'), open];
	const opts: TellOptions = { inner: { name: 'Klären' } };
	assert.deepEqual(joined(inner, 3, opts), [task('Lesen'), check, task('A'), merge, joins, task('B'), end('Fertig')]);
});

test('Risk: "continue at" into a branch of "in parallel" from after its merge is refused, never saved', () => {
	const a = tell([start, { move: 'concurrent' }, task('A')], 'de').nodes[2]!;
	const again: Move = { move: 'decision', question: 'Nochmal?', yes: 'ja', no: 'nein' };
	const story: Move[] = [start, { move: 'concurrent' }, task('A'), task('B'), again, { move: 'goTo', target: a }, end('F'), task('X'), open];
	assert.deepEqual(tell(story, 'de').errors, []);
	const copy = structuredClone(story);
	const r = joinAllFrom(story, 3, 'de');
	assert.ok('error' in r, 'abgelehnt');
	assert.equal(r.error, FITS);
	assert.deepEqual(story, copy);
});
