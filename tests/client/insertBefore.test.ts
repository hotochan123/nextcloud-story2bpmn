import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tell } from '../../src/core/index.js';
import type { Move } from '../../src/core/index.js';
import { beforeOptions, lineActions, applyTarget, insertAt, exceptionAt, triggerAdded, exceptionOf, workbench } from '../../src/workbench.js';
import { sheetActions } from '../../src/phoneView.js';

const start: Move = { move: 'start', text: 'Invoice arrives', role: 'Accounting' };
const task = (text: string): Move => ({ move: 'task', text, role: 'Accounting' });
const end = (text: string): Move => ({ move: 'end', text });
const PLAIN: Move[] = [start, task('Check'), task('Book'), end('Booked')];

test('AK1 "+ Insert before" offers what fits and lets the rest go on, never what closes a path', () => {
	assert.deepEqual(beforeOptions(PLAIN, 2, 'en'), ['task', 'wait', 'sendSignal', 'decision', 'concurrent']);
	// Inside a branch of "in parallel" the same (no "continue at" there anyway).
	const par: Move[] = [start, { move: 'concurrent' }, task('A'), end('A done'), task('B'), end('B done')];
	assert.deepEqual(tell(par, 'en').errors, []);
	const o = beforeOptions(par, 2, 'en');
	assert.deepEqual(o, ['task', 'wait', 'sendSignal', 'decision', 'concurrent']);
	for (const x of ['end', 'goTo', 'merge', 'exceptionPath', 'anytime', 'orStart', 'start', 'openPath', 'switchTo']) assert.ok(!(o as string[]).includes(x), x);
	// On a subprocess level, before its first move.
	assert.deepEqual(beforeOptions([task('A'), end('E')], 0, 'en', { inner: { name: 'Check' } }), ['task', 'wait', 'sendSignal', 'decision', 'concurrent']);
});

test('AK5 AK6 the menu: "Add an exception" on a step without one, "Another trigger" on the first trigger only', () => {
	assert.deepEqual(lineActions(start, 0), ['edit', 'addTrigger']);
	assert.ok(!lineActions(start, 0, true).includes('addTrigger'));
	assert.ok(!lineActions({ move: 'orStart', text: 'Mail', role: 'A', subtype: 'message' }, 1).includes('addTrigger'));
	assert.ok(lineActions(task('Check'), 1).includes('addException'));
	assert.ok(lineActions(task('Check'), 1, true).includes('addException'));
	const withExc = exceptionAt(PLAIN, 1, { move: 'exceptionPath', text: 'Error' }, 'en');
	assert.ok('moves' in withExc);
	const has = exceptionOf(withExc.moves, 1, 'en') >= 0;
	assert.ok(has);
	assert.ok(!lineActions(withExc.moves[1], 1, false, has).includes('addException'));
	assert.ok(!sheetActions(withExc.moves[1], 1, false, false, has).includes('addException'));
	assert.ok(!lineActions({ move: 'wait', text: 'x', subtype: 'time' }, 2).includes('addException'));
});

test('AK1 the forms of the new places go to their line', () => {
	assert.equal(applyTarget('exception', false), 'exception');
	assert.equal(applyTarget('trigger', true), 'trigger');
	assert.equal(applyTarget('before', true), 'before');
	assert.equal(applyTarget('added', true), 'tellOpen');
});

test('AK7 each insertion is one change that undo takes back', async () => {
	const wb = workbench('en');
	assert.deepEqual(await wb.set(PLAIN), { ok: true });
	const steps: ((m: Move[]) => { moves: Move[] } | { error: string })[] = [
		(m) => insertAt(m, 1, { move: 'decision', question: 'New?', yes: 'yes', no: 'no' }, 'en'),
		(m) => exceptionAt(m, m.findIndex((z) => z.move === 'task'), { move: 'exceptionPath', text: 'Error' }, 'en'),
		(m) => triggerAdded(m, { move: 'orStart', text: 'Mail', role: 'Accounting', subtype: 'message' }, 'en'),
	];
	const states: Move[][] = [wb.moves];
	for (const step of steps) {
		const r = step(wb.moves);
		assert.ok('moves' in r, 'error' in r ? r.error : '');
		assert.deepEqual(await wb.set(r.moves), { ok: true });
		states.push(wb.moves);
	}
	assert.ok(wb.view!.storyText.some((l) => l.text === 'STILL OPEN.'));
	for (let n = states.length - 2; n >= 0; n--) {
		assert.deepEqual(await wb.undo(), { ok: true });
		assert.deepEqual(wb.moves, states[n]);
	}
});
