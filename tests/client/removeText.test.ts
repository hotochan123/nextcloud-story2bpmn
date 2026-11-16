// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
// Job 452: the armed "Delete" of a step with a flow behind it says how many moves its flow takes along.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const texts: string = '../../src/texts.js';
const { removeText } = await import(texts) as { removeText: (z: unknown, withException: boolean) => string };
const flow = [{ move: 'task', text: 'A', role: 'R' }, { move: 'task', text: 'B', role: 'R', subprocess: [{ move: 'task', text: 'C', role: 'R' }] }, { move: 'end', text: 'E' }];

test('452 AK7 a step with a flow names its moves; with an exception too; without a flow as before', () => {
	// The flow counts over all its levels: A, B, C (inside B) and E.
	assert.equal(removeText({ move: 'task', text: 'X', role: 'R', subprocess: flow }, false), 'Really? The step and its flow (4 moves) go');
	assert.equal(removeText({ move: 'task', text: 'X', role: 'R', subprocess: flow.slice(0, 1) }, false), 'Really? The step and its flow (1 move) go');
	assert.equal(removeText({ move: 'task', text: 'X', role: 'R', subprocess: flow }, true), 'Really? The step, its exception and its flow (4 moves) go');
	assert.equal(removeText({ move: 'task', text: 'X', role: 'R' }, false), 'Really delete?');
	assert.equal(removeText({ move: 'task', text: 'X', role: 'R', subprocess: [] }, true), 'Delete the exception too?');
	assert.equal(removeText({ move: 'wait', text: 'X' }, false), 'Really delete?');
});

test('452 AK7 the German texts of the step with its flow', () => {
	for (const language of ['de', 'de_DE']) {
		const json = JSON.parse(readFileSync(`l10n/${language}.json`, 'utf8')).translations;
		assert.deepEqual(json['_Really? The step and its flow (%n move) go_::_Really? The step and its flow (%n moves) go_'], ['Wirklich? Der Schritt und sein Ablauf (%n Zug) fallen weg', 'Wirklich? Der Schritt und sein Ablauf (%n Züge) fallen weg']);
	}
});
