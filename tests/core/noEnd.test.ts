// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
// Job 452: deleting a path, a branch or a step never leaves a flow from which no end can be reached.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tell, removeBranch, deletePath, type Move } from '../../src/core/index.js';
import { removeStep } from '../../src/workbench.js';

const T = (text: string): Move => ({ move: 'task', text, role: 'Team' });
const id = (moves: Move[], i: number): string => tell(moves, 'de').nodes[i]!;

// Start, check the claim, it depends: yes → decide, end; otherwise no → ask for more, continue at the check (line 7).
const HEAD: Move[] = [
	{ move: 'start', text: 'Antrag kommt', role: 'Team' },
	T('Antrag prüfen'),
	{ move: 'decision', question: 'Vollständig?', yes: 'ja', no: 'nein' },
	T('Bescheiden'),
	{ move: 'end', text: 'Beschieden' },
	T('Nachfordern'),
];
const STORY: Move[] = [...HEAD, { move: 'goTo', target: id(HEAD, 1) }];

test('452 AK1 keeping only the path that loops back is refused with the line that leads back', () => {
	assert.deepEqual(tell(STORY, 'de').errors, []);
	assert.deepEqual(removeBranch(STORY, 2, 1, 'de'), { error: 'Danach käme der Ablauf nie zu einem Ende: Zeile 7 führt zurück zu „Antrag prüfen“ – dort zuerst ändern', line: 6 });
	assert.deepEqual(removeBranch(STORY, 2, 1, 'en'), { error: 'Afterwards the flow would never reach an end: line 7 leads back to “Antrag prüfen” – change it there first', line: 6 });
	// Keeping "ja" goes through as before.
	const r = removeBranch(STORY, 2, 0, 'de');
	assert.ok('moves' in r);
	assert.deepEqual(tell(r.moves, 'de').errors, []);
});

test('452 AK2 deleting the one path of three that reaches the end is refused; another one goes', () => {
	const head: Move[] = [
		{ move: 'start', text: 'Antrag kommt', role: 'Team' },
		T('Antrag prüfen'),
		{ move: 'decision', question: 'Wie?', yes: 'gut', more: ['halb'], no: 'schlecht' },
		T('Bescheiden'),
		{ move: 'end', text: 'Beschieden' },
		T('Nachbessern'),
	];
	const back = id(head, 1);
	const story: Move[] = [...head, { move: 'goTo', target: back }, T('Nachfordern'), { move: 'goTo', target: back }];
	assert.deepEqual(tell(story, 'de').errors, []);
	assert.deepEqual(deletePath(story, 2, 0, 'de'), { error: 'Danach käme der Ablauf nie zu einem Ende: Zeile 7 führt zurück zu „Antrag prüfen“ – dort zuerst ändern', line: 6 });
	const r = deletePath(story, 2, 1, 'de');
	assert.ok('moves' in r);
	assert.deepEqual(tell(r.moves, 'de').errors, []);
});

test('452 AK3 deleting the exception that held the only end is refused, also with its step', () => {
	// "Prüfen" with the exception "Fehler" → end; the normal path goes back to "Antrag" (line 6).
	const head: Move[] = [
		{ move: 'start', text: 'Antrag kommt', role: 'Team' },
		T('Antrag'),
		T('Prüfen'),
		{ move: 'exceptionPath', text: 'Fehler' },
		{ move: 'end', text: 'Abgebrochen' },
	];
	const story: Move[] = [...head, { move: 'goTo', target: id(head, 1) }];
	assert.deepEqual(tell(story, 'de').errors, []);
	const refusal = { error: 'Danach käme der Ablauf nie zu einem Ende: Zeile 6 führt zurück zu „Antrag“ – dort zuerst ändern', line: 5 };
	assert.deepEqual(removeBranch(story, 3, 1, 'de'), refusal);
	assert.deepEqual(removeStep(story, 2, 'de'), refusal);
});

test('452 AK4 a loop into a part with a path still open is no refusal; an old endless story stays deletable', () => {
	// In parallel: the first branch tells the check with its loop, the second branch is still open.
	const head: Move[] = [
		{ move: 'start', text: 'Antrag kommt', role: 'Team' },
		T('Antrag prüfen'),
		{ move: 'concurrent' },
		T('Sichten'),
		{ move: 'decision', question: 'Vollständig?', yes: 'ja', no: 'nein' },
		{ move: 'end', text: 'Fertig' },
		T('Nachfordern'),
	];
	const draft: Move[] = [...head, { move: 'goTo', target: id(head, 3) }];
	assert.deepEqual(tell(draft, 'de').errors, []);
	assert.equal(tell(draft, 'de').done, false);
	// Keeping "nein" leaves the loop "Sichten" → "Nachfordern" → "Sichten", without a way to the end or the open branch.
	assert.ok('error' in removeBranch(draft, 4, 1, 'de'));
	// Deleting "Nachfordern" keeps the loop's way out: no refusal.
	assert.ok('moves' in removeStep(draft, 6, 'de'));

	// A story that loops without an end already (an old file): deleting a step on it is no refusal.
	const loop: Move[] = [...HEAD.slice(0, 2), T('Nachfordern')];
	const endless: Move[] = [...loop, { move: 'goTo', target: id(loop, 1) }];
	assert.ok('moves' in removeStep(endless, 2, 'de'));
});

test('452 AK5 inside a subprocess the loop is refused on its own level', () => {
	const opts = { inner: { name: 'Prüfung' } };
	const head: Move[] = [
		T('Antrag prüfen'),
		{ move: 'decision', question: 'Vollständig?', yes: 'ja', no: 'nein' },
		T('Bescheiden'),
		{ move: 'end', text: 'Beschieden' },
		T('Nachfordern'),
	];
	const inner: Move[] = [...head, { move: 'goTo', target: tell(head, 'de', opts).nodes[0]! }];
	assert.deepEqual(tell(inner, 'de', opts).errors, []);
	const r = removeBranch(inner, 1, 1, 'de', opts);
	assert.ok('error' in r && r.line === 5, JSON.stringify(r));
	assert.ok('moves' in removeBranch(inner, 1, 0, 'de', opts));
});
