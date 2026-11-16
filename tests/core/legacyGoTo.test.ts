// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
// Job 438: "continue at" into a branch of "in parallel" from 0.1.0 files, accepted only with legacyGoTo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tell, reopenLegacyGoTos, type Move } from '../../src/core/index.js';

const T = (text: string): Move => ({ move: 'task', text, role: 'Team' });
const idOf = (moves: Move[], name: string): string => tell(moves, 'de', { legacyGoTo: true }).ir.nodes.find((n) => n.name === name)!.id;

const HEAD: Move[] = [
	{ move: 'start', text: 'S', role: 'Team' },
	{ move: 'concurrent' },
	T('TA'),
	{ move: 'merge' },
	T('TB'),
	{ move: 'merge' },
	T('TC'),
	{ move: 'decision', question: 'ok?', yes: 'ja', no: 'nein' },
	{ move: 'end', text: 'Fertig' },
];
const INTO: Move[] = [...HEAD, { move: 'goTo', target: idOf(HEAD, 'TA') }];

test('438 AK3 without legacyGoTo a jump into a branch stays refused; with it accepted and noted', () => {
	assert.match(tell(INTO, 'de').errors[0] ?? '', /TA/);
	const s = tell(INTO, 'de', { legacyGoTo: true });
	assert.deepEqual(s.errors, []);
	assert.deepEqual(s.legacyGoTos, [9]);
	assert.equal(s.done, true);
	// A valid jump is not noted.
	assert.equal(tell(HEAD, 'de', { legacyGoTo: true }).legacyGoTos, undefined);
	// The UI offers no such target, legacyGoTo or not.
	assert.deepEqual(tell(HEAD, 'de', { legacyGoTo: true }).targets.map((z) => z.name), ['TC']);
});

test('438 AK3 legacyGoTo keeps every other refusal: unknown target, path running alongside', () => {
	assert.match(tell([...HEAD, { move: 'goTo', target: 'Schritt_99' }], 'de', { legacyGoTo: true }).errors[0] ?? '', /weitergehen/);
	const beside: Move[] = [
		{ move: 'start', text: 'S', role: 'Team' },
		T('TA'),
		{ move: 'exceptionPath', text: 'Frist', subtype: 'deadline', keepsRunning: 'yes' },
	];
	const s = tell([...beside, { move: 'goTo', target: idOf(beside, 'TA') }], 'de', { legacyGoTo: true });
	assert.match(s.errors[0] ?? '', /weitergehen/);
	assert.equal(s.legacyGoTos, undefined);
});

test('438 AK3 legacyGoTo is not passed into a subprocess', () => {
	const inner = { name: 'Teil' };
	const subHead = HEAD.slice(1);
	const id = tell(subHead, 'de', { inner }).ir.nodes.find((n) => n.name === 'TA')!.id;
	const sub: Move[] = [...subHead, { move: 'goTo', target: id }];
	// On its own level with the option the jump is taken: the target is right, only the option is missing below.
	assert.deepEqual(tell(sub, 'de', { inner, legacyGoTo: true }).errors, []);
	const s = tell([{ move: 'start', text: 'S', role: 'Team' }, { ...T('Teil'), subprocess: sub } as Move, { move: 'end', text: 'E' }], 'de', { legacyGoTo: true });
	assert.match(s.errors.join(' '), /TA/);
});

test('438 reopenLegacyGoTos: the jump becomes a path still open, the rest stays', () => {
	const r = reopenLegacyGoTos(INTO, 'de');
	assert.ok(!('error' in r));
	assert.deepEqual(r.lines, [10]);
	assert.deepEqual(r.moves, [...HEAD, { move: 'openPath' }]);
	const s = tell(r.moves, 'de');
	assert.deepEqual(s.errors, []);
	assert.equal(s.storyText.at(-1)?.text, 'NOCH OFFEN.');
	assert.equal(s.ir.openPoints?.length, 1);
});

test('438 reopenLegacyGoTos refuses a story without such a jump or with other errors', () => {
	assert.ok('error' in reopenLegacyGoTos(HEAD, 'de'));
	assert.ok('error' in reopenLegacyGoTos([...HEAD, { move: 'goTo', target: 'Schritt_99' }], 'de'));
});

test('438 risk: a later "continue at" keeps its step when the IDs shift (the jump made a merge point before)', () => {
	// Jump into the branch on "ja" (0.1.0 puts a merge point before TA), then a loop to TD on the other path.
	const head: Move[] = [...HEAD.slice(0, 8)];
	const a: Move[] = [...head, { move: 'goTo', target: idOf(head, 'TA') }, T('TD'), { move: 'decision', question: 'nochmal?', yes: 'nein', no: 'ja' }, { move: 'end', text: 'E2' }];
	const moves: Move[] = [...a, { move: 'goTo', target: idOf(a, 'TD') }];
	assert.deepEqual(tell(moves, 'de', { legacyGoTo: true }).errors, []);
	const r = reopenLegacyGoTos(moves, 'de');
	assert.ok(!('error' in r));
	const s = tell(r.moves, 'de');
	assert.deepEqual(s.errors, []);
	const last = r.moves.at(-1) as Extract<Move, { move: 'goTo' }>;
	assert.equal(s.ir.nodes.find((n) => n.id === last.target)?.name, 'TD');
	assert.equal(s.storyText.at(-1)?.text, 'WEITER BEI [TD].');
});

test('438 risk: 500 moves with many such jumps open quickly', () => {
	const moves: Move[] = [{ move: 'start', text: 'S', role: 'Team' }];
	for (let b = 0; moves.length < 490; b++) {
		moves.push({ move: 'concurrent' }, T(`A${b}`), { move: 'merge' }, T(`B${b}`), { move: 'merge' }, { move: 'decision', question: `ok ${b}?`, yes: 'ja', no: 'nein' });
		moves.push({ move: 'goTo', target: idOf(moves, `A${b}`) });
	}
	moves.push({ move: 'end', text: 'E' });
	assert.ok(moves.length <= 500);
	const t0 = performance.now();
	const r = reopenLegacyGoTos(moves, 'de');
	const ms = performance.now() - t0;
	assert.ok(!('error' in r));
	assert.equal(r.lines.length, 70);
	assert.ok(ms < 2000, `${ms} ms`);
});
