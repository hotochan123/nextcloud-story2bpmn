// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cancelStep, textChanged } from '../../src/textDiscard.js';

test('406 AK1 an unchanged text closes at once, a changed one asks first', () => {
	const start = 'START Antrag geht ein\n';
	assert.equal(textChanged(start, start), false);
	assert.equal(cancelStep(false, textChanged(start, start)), 'close');
	const typed = start + 'Büro prüft Antrag.';
	assert.equal(textChanged(typed, start), true);
	assert.equal(cancelStep(false, true), 'arm');
	assert.equal(cancelStep(true, true), 'close');
});

test('406 AK1 typing back to the text when opened is unchanged again', () => {
	const start = 'START Antrag geht ein';
	let text = start + 'x';
	assert.equal(textChanged(text, start), true);
	text = text.slice(0, -1);
	assert.equal(textChanged(text, start), false);
	assert.equal(cancelStep(false, textChanged(text, start)), 'close');
});
