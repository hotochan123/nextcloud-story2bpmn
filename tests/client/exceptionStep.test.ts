import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tell } from '../../src/core/index.js';
import type { Move } from '../../src/core/index.js';
import { before, beforeAt, remove, removeStep, stepOf, exceptionOf } from '../../src/workbench.js';

// Job 405: an exception ("IN CASE OF …") stays on the step it was told under.
const start: Move = { move: 'start', text: 'Antrag', role: 'Amt' };
const task = (text: string): Move => ({ move: 'task', text, role: 'Amt' });
const end = (text: string): Move => ({ move: 'end', text });
const exc = (text: string, extra: Partial<Extract<Move, { move: 'exceptionPath' }>> = {}): Move => ({ move: 'exceptionPath', text, ...extra });

const story = (): Move[] => [start, task('A0'), task('Prüfen'), exc('Fehler'), end('Abbruch'), end('Fertig')];

/** Name of the step the (only) exception hangs on, or undefined. */
function hangsOn(moves: Move[], opts = {}): string | undefined {
	const ir = tell(moves, 'de', opts).ir;
	const e = ir.nodes.find((n) => n.kind === 'exception');
	return e?.kind === 'exception' ? ir.nodes.find((n) => n.id === e.attachedTo)?.name : undefined;
}

test('405 AK1 deleting the step of an exception deletes the exception with its path', () => {
	const moves = story();
	assert.equal(exceptionOf(moves, 2, 'de'), 3);
	assert.equal(stepOf(moves, 3, 'de'), 2);
	const r = removeStep(moves, 2, 'de');
	assert.ok('moves' in r);
	assert.deepEqual(r.moves, [start, task('A0'), end('Fertig')]);
	assert.deepEqual(tell(r.moves, 'de').errors, []);
	assert.equal(hangsOn(r.moves), undefined);
	// Before the fix: the plain delete hung the exception on "A0".
	assert.equal(hangsOn(remove(moves, 2, 'de')), 'A0');
});

test('405 AK2 a step before the exception line goes before the step with the exception', () => {
	const moves = story();
	const out = before(moves, 3, task('Neu'), 'de');
	assert.deepEqual(out, [start, task('A0'), task('Neu'), task('Prüfen'), exc('Fehler'), end('Abbruch'), end('Fertig')]);
	assert.deepEqual(tell(out, 'de').errors, []);
	assert.equal(hangsOn(out), 'Prüfen');
	// The new line (marked NEW on a phone) is the inserted step, not the step with the exception.
	assert.equal(beforeAt(moves, 3, 'de'), 2);
	assert.deepEqual(out[beforeAt(moves, 3, 'de')], task('Neu'));
	assert.equal(beforeAt(moves, 2, 'de'), 2);
	assert.equal(beforeAt(moves, 5, 'de'), 5);
	// Other lines as before.
	assert.deepEqual(before(moves, 2, task('Neu'), 'de'), [start, task('A0'), task('Neu'), task('Prüfen'), exc('Fehler'), end('Abbruch'), end('Fertig')]);
	assert.deepEqual(before(moves, 5, task('Neu'), 'de'), [start, task('A0'), task('Prüfen'), exc('Fehler'), end('Abbruch'), task('Neu'), end('Fertig')]);
});

test('405 AK3 a step without an exception is deleted as before', () => {
	const moves = story();
	assert.equal(exceptionOf(moves, 1, 'de'), -1);
	assert.equal(exceptionOf(moves, 0, 'de'), -1);
	assert.deepEqual(removeStep(moves, 1, 'de'), { moves: remove(moves, 1, 'de') });
	assert.equal(hangsOn(remove(moves, 1, 'de')), 'Prüfen');
});

test('405 AK4 the same in the flow behind a task', () => {
	const inner = { inner: { name: 'Ware versenden' } };
	const behind: Move[] = [task('Packen'), task('Prüfen'), exc('Fehler'), end('Abbruch'), end('Fertig')];
	assert.deepEqual(tell(behind, 'de', inner).errors, []);
	const r = removeStep(behind, 1, 'de', inner);
	assert.ok('moves' in r);
	assert.deepEqual(r.moves, [task('Packen'), end('Fertig')]);
	const out = before(behind, 2, task('Neu'), 'de', inner);
	assert.deepEqual(out.slice(0, 3), [task('Packen'), task('Neu'), task('Prüfen')]);
	assert.equal(hangsOn(out, inner), 'Prüfen');
});

test('405 AK5 refused when "continue at" from elsewhere leads into the exception path', () => {
	const base: Move[] = [start, { move: 'decision', question: 'Vollständig?', yes: 'ja', no: 'nein' }, task('Prüfen'), exc('Fehler'), task('Korrektur'), end('Korrigiert'), end('Fertig')];
	const id = tell(base, 'de').nodes[4]!;
	const moves: Move[] = [...base, { move: 'goTo', target: id }];
	assert.deepEqual(tell(moves, 'de').errors, []);
	const r = removeStep(moves, 2, 'de');
	assert.deepEqual(r, { error: 'Zeile 8 führt noch zu „Korrektur“ – dort zuerst ändern', line: 7 });
});

test('405 risk: an exception where the step keeps running, and a step first on a path', () => {
	const running: Move[] = [start, task('Prüfen'), exc('Frist', { subtype: 'deadline', keepsRunning: 'yes' }), task('Erinnern'), end('Erinnert'), end('Fertig')];
	assert.deepEqual(tell(running, 'de').errors, []);
	const r = removeStep(running, 1, 'de');
	assert.ok('moves' in r);
	assert.deepEqual(r.moves, [start, end('Fertig')]);
	// First step on the yes path of a decision: the merge stays whole.
	const onPath: Move[] = [start, { move: 'decision', question: 'Groß?', yes: 'ja', no: 'nein' }, task('Prüfen'), exc('Fehler'), end('Abbruch'), task('Ok'), { move: 'merge' }, task('Chef'), { move: 'merge' }, end('Fertig')];
	assert.deepEqual(tell(onPath, 'de').errors, []);
	const p = removeStep(onPath, 2, 'de');
	assert.ok('moves' in p);
	assert.deepEqual(tell(p.moves, 'de').errors, []);
	assert.equal(p.moves.some((m) => m.move === 'exceptionPath'), false);
	assert.deepEqual(before(onPath, 3, task('Neu'), 'de').slice(2, 4), [task('Neu'), task('Prüfen')]);
});

test('405 AK6 an exception without a step before it: one plain message, no "already ended"', () => {
	const moves: Move[] = [start, exc('Fehler'), end('Abbruch'), end('Fertig')];
	assert.deepEqual(tell(moves, 'de').errors, ['Vor „FALLS Fehler“ steht kein Schritt, an dem die Ausnahme hängen kann']);
	assert.deepEqual(tell(moves, 'en').errors, ['There is no step right before “IN CASE OF Fehler” for the exception to attach to']);
	// Without an earlier error a move after the end still says so.
	assert.deepEqual(tell([start, end('Fertig'), task('Noch')], 'de').errors, ['Die Geschichte ist schon zu Ende']);
	assert.deepEqual(tell([start, end('Fertig'), task('Noch')], 'en').errors, ['The story has already ended']);
});
