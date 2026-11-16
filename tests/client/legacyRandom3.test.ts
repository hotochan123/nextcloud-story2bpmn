// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
// Job 439 AK3, part 3 of 4 (300 stories, split so the test files run side by side): 0.1.0 files open in main.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missing010, openRandom010 } from './legacy010.js';

test('439 AK3 random 0.1.0 stories 151–225 open and replay, "continue at" keeps its step', { skip: missing010(), timeout: 300_000 }, async () => {
	const r = await openRandom010(151, 225);
	assert.deepEqual(r.wrong, []);
});
