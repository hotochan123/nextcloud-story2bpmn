// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
// Job 427: the form each line action opens (src/lineMenu.ts), pinned value by value, and where a new trigger lands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Move } from '../../src/core/index.js';
import { formFor, triggerIndex } from '../../src/lineMenu.js';
import { targetsUntil } from '../../src/workbench.js';

const T = (text: string): Move => ({ move: 'task', text, role: 'Team' });
const START: Move = { move: 'start', text: 'Request arrives', role: 'Team' };
const DEPENDS: Move = { move: 'decision', question: 'Fits?', yes: 'yes', no: 'no', more: ['maybe'] };
const FIRST: Move = { move: 'decision', subtype: 'first', yes: 'Answer', no: 'Deadline', yesKind: 'message', noKind: 'time' };
const AT_ONCE: Move = { move: 'concurrent', branches: 3 };
const EXC: Move = { move: 'exceptionPath', text: 'Fails', subtype: 'error' };
const MOVES: Move[] = [START, T('Check'), DEPENDS, T('Book'), { move: 'end', text: 'Booked' }, T('Ask'), { move: 'goTo', target: 'x' }];

test('427 addPath: "It depends" gets one empty path more, focus on it', () => {
	assert.deepEqual(formFor('addPath', MOVES, 2, 'en'), { subtype: 'decision', place: 'replace', index: 2, start: { ...DEPENDS, more: ['maybe', ''] }, focus: 'more1', paths: 3 });
});

test('427 addPath: "What happens first" moves the last event into more, focus on no', () => {
	assert.deepEqual(formFor('addPath', [START, FIRST], 1, 'en'), {
		subtype: 'decision', place: 'replace', index: 1,
		start: { ...FIRST, more: ['Deadline'], moreKinds: ['time'], no: '', noKind: 'message' }, focus: 'no', paths: 2,
	});
});

test('427 addPath: concurrent counts its branches, one more in the form', () => {
	assert.deepEqual(formFor('addPath', [START, AT_ONCE], 1, 'en'), { subtype: 'concurrent', place: 'replace', index: 1, start: { move: 'concurrent', branches: 4 }, focus: undefined, paths: 3 });
	assert.equal(formFor('addPath', [START, { move: 'concurrent' }], 1, 'en')!.paths, 2);
});

test('427 edit: task, decision, concurrent and exception path with their path counts', () => {
	assert.deepEqual(formFor('edit', MOVES, 1, 'en'), { subtype: 'task', place: 'replace', index: 1, start: T('Check'), paths: 0, targets: undefined });
	assert.deepEqual(formFor('edit', MOVES, 2, 'en'), { subtype: 'decision', place: 'replace', index: 2, start: DEPENDS, paths: 3, targets: undefined, switchable: true });
	assert.equal(formFor('edit', [START, AT_ONCE], 1, 'en')!.paths, 3);
	// Not the core's path count: an exception path counts 0 here.
	assert.deepEqual(formFor('edit', [START, T('Check'), EXC], 2, 'en'), { subtype: 'exceptionPath', place: 'replace', index: 2, start: EXC, paths: 0, targets: undefined });
});

test('427 edit: the start is a copy, not the move itself', () => {
	const f = formFor('edit', MOVES, 1, 'en')!;
	assert.notEqual(f.start, MOVES[1]);
});

test('427 edit: "continue at" offers the targets possible at exactly that point', () => {
	const f = formFor('edit', MOVES, 6, 'en')!;
	assert.deepEqual(f, { subtype: 'goTo', place: 'replace', index: 6, start: MOVES[6], paths: 0, targets: targetsUntil(MOVES, 6, 'en') });
	assert.ok(f.targets!.length > 0);
	const inner = { inner: { name: 'Sub' } };
	assert.deepEqual(formFor('edit', MOVES, 6, 'de', inner)!.targets, targetsUntil(MOVES, 6, 'de', inner));
});

test('427 addException and addTrigger', () => {
	assert.deepEqual(formFor('addException', MOVES, 1, 'en'), { subtype: 'exceptionPath', place: 'exception', index: 1, start: {} });
	assert.deepEqual(formFor('addTrigger', MOVES, 0, 'en'), { subtype: 'orStart', place: 'trigger', index: 0, start: {} });
});

test('427 before: a step takes the role of the task it goes before; other kinds start empty', () => {
	assert.deepEqual(formFor('before', MOVES, 3, 'en', {}, 'task'), { subtype: 'task', place: 'before', index: 3, start: { role: 'Team' } });
	assert.deepEqual(formFor('before', MOVES, 3, 'en', {}, 'end'), { subtype: 'end', place: 'before', index: 3, start: {} });
	assert.deepEqual(formFor('before', MOVES, 2, 'en', {}, 'task'), { subtype: 'task', place: 'before', index: 2, start: {} });
	assert.equal(formFor('before', MOVES, 3, 'en'), null);
});

test('427 actions without a form: null', () => {
	for (const a of ['remove', 'keep:0', 'drop:1', 'reopen', 'tell', 'subprocess', 'show']) assert.equal(formFor(a, MOVES, 1, 'en'), null, a);
});

test('427 triggerIndex: after the triggers told so far', () => {
	const or = (text: string): Move => ({ move: 'orStart', text, role: 'Team' });
	assert.equal(triggerIndex([START, T('Check')]), 1);
	assert.equal(triggerIndex([START, or('Call'), T('Check')]), 2);
	assert.equal(triggerIndex([START, or('Call'), or('Mail')]), 3);
});
