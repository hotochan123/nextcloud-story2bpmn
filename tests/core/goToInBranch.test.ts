// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
// Job 411: "continue at" inside a branch of "in parallel" loops back within that branch only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tell, read, asSourceText, run, emptyProcess, insertBefore, type Move } from '../../src/core/index.js';
import { validateIR } from '../../src/core/validate.js';

const T = (text: string): Move => ({ move: 'task', text, role: 'Lager' });
const names = (moves: Move[]): string[] => tell(moves, 'de').targets.map((z) => z.name);
const idOf = (moves: Move[], name: string): string => tell(moves, 'de').ir.nodes.find((n) => n.name === name)!.id;

// Before "in parallel": "Auftrag annehmen"; first branch: "Ware prüfen", then "ok?".
const HEAD: Move[] = [
	{ move: 'start', text: 'Auftrag kommt', role: 'Lager' },
	T('Auftrag annehmen'),
	{ move: 'concurrent' },
	T('Ware prüfen'),
	{ move: 'decision', question: 'ok?', yes: 'ja', no: 'nein' },
	{ move: 'merge' },
];
// The second branch is told after the first: put a step of it before the loop for AK1.
const OTHER_FIRST: Move[] = [
	{ move: 'start', text: 'Auftrag kommt', role: 'Lager' },
	T('Auftrag annehmen'),
	{ move: 'concurrent' },
	T('Ware prüfen'),
	{ move: 'switchTo', to: 1 },
	T('Rechnung schreiben'),
	{ move: 'switchTo', to: 1 },
	{ move: 'decision', question: 'ok?', yes: 'ja', no: 'nein' },
	{ move: 'merge' },
];
const story = (): Move[] => [
	...HEAD,
	{ move: 'goTo', target: idOf(HEAD, 'Ware prüfen') },
	{ move: 'merge' },
	T('Rechnung schreiben'),
	{ move: 'merge' },
	{ move: 'end', text: 'Erledigt' },
];

test('411 AK1 on the no path of a branch: continue at offers its own step, not the step before nor the other branch', () => {
	const s = tell(OTHER_FIRST, 'de');
	assert.deepEqual(s.errors, []);
	assert.match(s.path ?? '', /nein/);
	assert.ok(s.options.includes('goTo'));
	assert.deepEqual(names(OTHER_FIRST), ['Ware prüfen']);
});

test('411 AK2 a loop inside a branch: no errors, clean IR with parallel split and join, a merge before the target', async () => {
	const moves = story();
	const s = tell(moves, 'de');
	assert.deepEqual(s.errors, []);
	assert.ok(s.done);
	assert.deepEqual(validateIR(s.ir), []);
	const gw = (type: string) => s.ir.nodes.filter((n) => n.kind === 'gateway' && n.gatewayType === type);
	assert.equal(gw('parallel').length, 2);
	const target = idOf(moves, 'Ware prüfen');
	const into = s.ir.edges.filter((e) => e.to === target);
	assert.equal(into.length, 1);
	const merge = s.ir.nodes.find((n) => n.id === into[0].from)!;
	assert.equal(merge.kind === 'gateway' && merge.gatewayType, 'exclusive');
	assert.equal(s.ir.edges.filter((e) => e.to === merge.id).length, 2);
	const e = await run({ ir: { ...emptyProcess('P', s.ir.name, 'de'), story: moves }, ops: s.ops });
	assert.ok(e.ok, JSON.stringify(e.issues));
	assert.match(e.xml ?? '', /parallelGateway/);
});

test('411 AK3 continue at the step itself right after it; targets outside the branch are refused', () => {
	const branch: Move[] = [...HEAD.slice(0, 4)];
	assert.deepEqual(names(branch), ['Ware prüfen']);
	const self = tell([...branch, { move: 'goTo', target: idOf(branch, 'Ware prüfen') }], 'de');
	assert.deepEqual(self.errors, []);
	const before = tell([...HEAD, { move: 'goTo', target: idOf(HEAD, 'Auftrag annehmen') }], 'de');
	assert.match(before.errors[0] ?? '', /Auftrag annehmen/);
	const other: Move[] = [
		...HEAD.slice(0, 3),
		{ move: 'switchTo', to: 1 },
		T('Rechnung schreiben'),
		{ move: 'switchTo', to: 1 },
		T('Ware prüfen'),
	];
	const across = tell([...other, { move: 'goTo', target: idOf(other, 'Rechnung schreiben') }], 'de');
	assert.match(across.errors[0] ?? '', /Rechnung schreiben/);
});

test('411 AK4 after the parallel merge the main path offers the step before, but no step of the branches', () => {
	const moves: Move[] = [...HEAD.slice(0, 4), { move: 'merge' }, T('Rechnung schreiben'), { move: 'merge' }, T('Versenden'), { move: 'decision', question: 'Zurück?', yes: 'ja', no: 'nein' }];
	const s = tell(moves, 'de');
	assert.deepEqual(s.errors, []);
	assert.deepEqual(names(moves).sort(), ['Auftrag annehmen', 'Versenden']);
	const into = tell([...moves, { move: 'goTo', target: idOf(moves, 'Ware prüfen') }], 'de');
	assert.match(into.errors[0] ?? '', /Ware prüfen/);
});

test('411 AK5 nested "in parallel": no target across the inner branches, the outer branch keeps its own', () => {
	const inner: Move[] = [...HEAD.slice(0, 4), { move: 'concurrent' }, T('Etikett drucken')];
	assert.deepEqual(names(inner), ['Etikett drucken']);
	const merged: Move[] = [...inner, { move: 'merge' }, T('Foto machen'), { move: 'merge' }, { move: 'decision', question: 'Alles da?', yes: 'ja', no: 'nein' }];
	assert.deepEqual(tell(merged, 'de').errors, []);
	assert.deepEqual(names(merged), ['Ware prüfen']);
});

test('411 AK6 the story text reads WEITER BEI in the branch and reads back to the same moves', () => {
	const moves = story();
	const s = tell(moves, 'de');
	const line = s.storyText.find((l) => l.text === 'WEITER BEI [Ware prüfen].');
	assert.ok(line);
	assert.ok(line.depth >= 2);
	const back = read(asSourceText(s.storyText), 'de', moves);
	assert.deepEqual(back.errors, []);
	// Read back adds empty kinds (subtype ''): compare what they tell, and the target of the loop.
	assert.deepEqual(tell(back.moves, 'de').storyText, s.storyText);
	assert.deepEqual(back.moves.map((z) => z.move), moves.map((z) => z.move));
	assert.deepEqual(back.moves.find((z) => z.move === 'goTo'), moves.find((z) => z.move === 'goTo'));
});

test('411 risk: a branch whose only exit is the loop gets a check message, no crash', async () => {
	const branch: Move[] = [...HEAD.slice(0, 4)];
	const moves: Move[] = [...branch, { move: 'goTo', target: idOf(branch, 'Ware prüfen') }, T('Rechnung schreiben'), { move: 'end', text: 'Erledigt' }];
	const s = tell(moves, 'de');
	assert.deepEqual(s.errors, []);
	assert.ok(validateIR(s.ir).some((i) => i.rule === 'dead-end'));
	const e = await run({ ir: { ...emptyProcess('P', s.ir.name, 'de'), story: moves }, ops: s.ops });
	assert.equal(e.ok, false);
});

test('411 risk: "in parallel" inserted before a loop on its own step keeps the loop inside the new branch', () => {
	const plain: Move[] = [{ move: 'start', text: 'Auftrag kommt', role: 'Lager' }, T('Ware prüfen'), { move: 'decision', question: 'ok?', yes: 'ja', no: 'nein' }, { move: 'end', text: 'Fertig' }];
	const moves: Move[] = [...plain, { move: 'goTo', target: idOf(plain, 'Ware prüfen') }];
	const r = insertBefore(moves, 1, { move: 'concurrent' }, 'de');
	assert.ok('moves' in r, JSON.stringify(r));
	const s = tell(r.moves, 'de');
	assert.deepEqual(s.errors, []);
	assert.ok(r.moves.some((z) => z.move === 'goTo'));
});
