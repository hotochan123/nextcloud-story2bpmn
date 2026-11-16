import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tell, swapPaths, sameMoves, Move, TellOptions } from '../../src/core/story.js';
import { nodeById } from '../../src/core/ir.js';
import type { ProcessIR } from '../../src/core/ir.js';

const start: Move = { move: 'start', text: 'Rechnung geht ein', role: 'Buchhaltung' };
const task = (text: string): Move => ({ move: 'task', text, role: 'Buchhaltung' });
const end = (text: string): Move => ({ move: 'end', text });
const merge: Move = { move: 'merge' };
const three: Move = { move: 'decision', question: 'Vollständig?', yes: 'ja', more: ['vielleicht'], no: 'nein' };
const REFUSED = 'Diese Wege lassen sich hier nicht tauschen; erzählen Sie zuerst beide Wege zu Ende';

/** The flow without IDs: every arrow as "kind name → kind name | condition". */
function flow(ir: ProcessIR): string[] {
	const name = (id: string) => {
		const n = nodeById(ir, id)!;
		return `${n.kind}:${n.name}`;
	};
	return ir.edges.map((e) => `${name(e.from)} → ${name(e.to)} | ${e.condition ?? e.name ?? ''}${e.isDefault ? ' (sonst)' : ''}`).sort();
}
function swapped(moves: Move[], at: number, path: number, opts: TellOptions = {}): Move[] {
	assert.deepEqual(tell(moves, 'de', opts).errors, [], 'Ausgangsgeschichte gültig');
	const r = swapPaths(moves, at, path, 'de', opts);
	assert.ok('moves' in r, 'error' in r ? r.error : '');
	assert.deepEqual(tell(r.moves, 'de', opts).errors, []);
	assert.equal(r.moves.length, moves.length, 'keine Züge verloren');
	return r.moves;
}
const refused = (moves: Move[], at: number, path: number): string => {
	const r = swapPaths(moves, at, path, 'de');
	assert.ok('error' in r, 'abgelehnt');
	return r.error;
};
/** Story text without line numbers: one string per line. */
const text = (moves: Move[], opts: TellOptions = {}) => tell(moves, 'de', opts).storyText.map((l) => l.text);

const CHECK: Move[] = [start, three, task('Buchen'), merge, task('Nachfragen'), task('Warten'), merge, task('Mahnen'), merge, task('Ablegen'), end('Fertig')];

test('AK1 check with three paths: the first two trade places with their steps, the flow stays', () => {
	const out = swapped(CHECK, 1, 0);
	assert.deepEqual(out, [start, { ...three, yes: 'vielleicht', more: ['ja'] }, task('Nachfragen'), task('Warten'), merge, task('Buchen'), merge, task('Mahnen'), merge, task('Ablegen'), end('Fertig')]);
	const before = tell(CHECK, 'de');
	const after = tell(out, 'de');
	assert.deepEqual(flow(after.ir), flow(before.ir));
	// The outgoing arrows of the gateway in the new order.
	const gateway = after.ir.nodes.find((n) => n.kind === 'gateway' && after.moveOf[n.id] === 1);
	assert.ok(gateway, 'gateway of move 1');
	assert.deepEqual(after.ir.edges.filter((e) => e.from === gateway.id).map((e) => e.condition ?? e.name), ['vielleicht', 'ja', 'nein']);
	// Each heading is followed by its own steps.
	const t = text(out);
	const at = (lines: string[], head: string) => lines.slice(lines.findIndex((l) => l.includes(head)) + 1, lines.findIndex((l) => l.includes(head)) + 3);
	assert.deepEqual(at(t, 'vielleicht'), at(text(CHECK), 'vielleicht'));
	assert.deepEqual(at(t, '→ ja'), at(text(CHECK), '→ ja'));
});

test('AK2 the otherwise path stays last: refused at it, and a check with two paths cannot swap', () => {
	assert.equal(refused(CHECK, 1, 1), 'Diesen Weg gibt es hier nicht');
	assert.equal(refused(CHECK, 1, 2), 'Diesen Weg gibt es hier nicht');
	assert.equal(refused(CHECK, 1, -1), 'Diesen Weg gibt es hier nicht');
	const two: Move[] = [start, { move: 'decision', question: 'q', yes: 'ja', no: 'nein' }, task('A'), merge, task('B'), merge, end('x')];
	assert.equal(refused(two, 1, 0), 'Diesen Weg gibt es hier nicht');
	assert.equal(refused(CHECK, 2, 0), 'Hier verzweigt sich nichts');
	const exception: Move[] = [start, task('Prüfen'), { move: 'exceptionPath', text: 'Fehler' }, end('Abgebrochen'), end('Fertig')];
	assert.equal(refused(exception, 2, 0), 'Hier verzweigt sich nichts');
});

test('AK3 "what comes first" and "in parallel": names, kinds and steps move along; twice gives the story back', () => {
	const first: Move = { move: 'decision', subtype: 'first', yes: 'Zahlung kommt', yesKind: 'message', no: 'Frist vorbei', noKind: 'time' };
	const story: Move[] = [start, first, task('Buchen'), end('Bezahlt'), task('Mahnen'), end('Gemahnt')];
	const out = swapped(story, 1, 0);
	assert.deepEqual(out, [start, { move: 'decision', subtype: 'first', yes: 'Frist vorbei', yesKind: 'time', no: 'Zahlung kommt', noKind: 'message' }, task('Mahnen'), end('Gemahnt'), task('Buchen'), end('Bezahlt')]);
	assert.deepEqual(flow(tell(out, 'de').ir), flow(tell(story, 'de').ir));
	assert.ok(sameMoves(swapped(out, 1, 0), story));
	// The last path of "what comes first" can move up too.
	const firstThree: Move = { ...first, more: ['Rückfrage'], moreKinds: ['message'] } as Move;
	const s3: Move[] = [start, firstThree, task('A'), end('a'), task('B'), end('b'), task('C'), end('c')];
	const o3 = swapped(s3, 1, 1);
	assert.deepEqual(o3[1], { move: 'decision', subtype: 'first', yes: 'Zahlung kommt', yesKind: 'message', more: ['Frist vorbei'], moreKinds: ['time'], no: 'Rückfrage', noKind: 'message' });
	assert.deepEqual(o3.slice(2), [task('A'), end('a'), task('C'), end('c'), task('B'), end('b')]);

	const par: Move[] = [start, { move: 'concurrent', branches: 3 }, task('Eins'), merge, task('Zwei'), merge, task('Drei'), merge, end('Fertig')];
	const p = swapped(par, 1, 1);
	assert.deepEqual(p, [start, { move: 'concurrent', branches: 3 }, task('Eins'), merge, task('Drei'), merge, task('Zwei'), merge, end('Fertig')]);
	assert.deepEqual(flow(tell(p, 'de').ir), flow(tell(par, 'de').ir));
	assert.ok(sameMoves(swapped(p, 1, 1), par));
});

test('AK4 a nested branch, a path still open and a "continue at" behind the branch', () => {
	const inner: Move = { move: 'decision', question: 'Lieferant bekannt?', yes: 'ja', no: 'nein' };
	const base: Move[] = [start, three, inner, task('Anrufen'), merge, task('Schreiben'), merge, merge, { move: 'openPath' }, task('Mahnen'), merge, task('Ablegen'), end('Fertig')];
	const s = tell(base, 'de');
	assert.deepEqual(s.errors, []);
	// "continue at" on the otherwise path to a step of the first path.
	const target = s.nodes[3]!;
	const story: Move[] = [start, three, inner, task('Anrufen'), merge, task('Schreiben'), merge, merge, { move: 'openPath' }, task('Mahnen'), { move: 'goTo', target }, task('Ablegen'), end('Fertig')];
	const before = tell(story, 'de');
	assert.deepEqual(before.errors, []);
	const out = swapped(story, 1, 0);
	assert.deepEqual(out.slice(2, 9), [{ move: 'openPath' }, inner, task('Anrufen'), merge, task('Schreiben'), merge, merge]);
	const after = tell(out, 'de');
	const goTo = out.find((m) => m.move === 'goTo') as { target: string };
	assert.equal(nodeById(after.ir, goTo.target)?.name, 'Anrufen');
	assert.deepEqual(flow(after.ir), flow(before.ir));
	assert.equal(after.ir.openPoints?.length ?? 0, before.ir.openPoints?.length ?? 0);
});

test('AK5 refused: a path not told yet, pulling forward, "continue at" to the path above', () => {
	// The story ends on the first path: the second is not told yet.
	const open: Move[] = [start, { move: 'concurrent', branches: 3 }, task('Eins')];
	assert.equal(refused(open, 1, 0), REFUSED);
	assert.equal(refused(open, 1, 1), REFUSED);
	// Pulling forward the second path before the first is told to its end.
	const pulled: Move[] = [start, { move: 'concurrent', branches: 3 }, task('Eins'), { move: 'switchTo', to: 2 }, task('Zwei'), merge, merge, task('Drei'), merge, end('Fertig')];
	assert.deepEqual(tell(pulled, 'de').errors, []);
	assert.equal(refused(pulled, 1, 0), REFUSED);
	// The lower path leads back to a step of the upper one: after swapping it would come first.
	const s = tell([start, three, task('Buchen'), merge], 'de');
	const back: Move[] = [start, three, task('Buchen'), task('Prüfen'), merge, task('Nachfragen'), { move: 'goTo', target: s.nodes[2]! }, task('Mahnen'), merge, end('Fertig')];
	assert.deepEqual(tell(back, 'de').errors, []);
	const copy = structuredClone(back);
	assert.equal(refused(back, 1, 0), REFUSED);
	assert.deepEqual(back, copy, 'Eingabe unverändert');
});

test('AK6 the first heading of each path names its branch and path, not exception paths or "back on the path"', () => {
	const heads = (moves: Move[], opts: TellOptions = {}) => tell(moves, 'de', opts).storyText.filter((l) => l.move === undefined && l.path).map((l) => `${l.path!.at}.${l.path!.n}`);
	assert.deepEqual(heads(CHECK), ['1.0', '1.1', '1.2']);
	const par: Move[] = [start, { move: 'concurrent', branches: 3 }, task('Eins'), { move: 'switchTo', to: 2 }, task('Zwei'), merge, merge, task('Drei'), merge, end('Fertig')];
	// Told in the order pulled forward: the headings say which path they are.
	assert.deepEqual(heads(par), ['1.0', '1.2', '1.1']);
	// Back on the first path after pulling forward: that heading names no path.
	const back = tell(par, 'de').storyText.filter((l) => l.move === undefined && /WIEDER/.test(l.text));
	assert.ok(back.length > 0 && back.every((l) => !l.path));
	const exception: Move[] = [start, task('Prüfen'), { move: 'exceptionPath', text: 'Fehler' }, end('Abgebrochen'), end('Fertig')];
	assert.deepEqual(heads(exception), []);
	// A flow behind a step: the numbers count on its level.
	const sub: Move[] = [start, { ...task('Klären'), subprocess: [task('Lesen'), three, task('A'), merge, task('B'), merge, merge, end('Fertig')] } as Move, end('Ende')];
	const lines = tell(sub, 'de').storyText.filter((l) => l.sub === 1 && l.path);
	assert.deepEqual(lines.map((l) => `${l.path!.at}.${l.path!.n}`), ['1.0', '1.1', '1.2']);
});

test('Risk: a flow behind a step swaps only that flow', () => {
	const inner = [task('Lesen'), three, task('A'), merge, task('B'), merge, merge, end('Fertig')];
	const opts: TellOptions = { inner: { name: 'Klären' } };
	const out = swapped(inner, 1, 0, opts);
	assert.deepEqual(out.slice(2, 6), [task('B'), merge, task('A'), merge]);
});
