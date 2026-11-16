// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
// Job 440 AK6: random 0.1.0 stories with few names that repeat, so that a "continue at" has twins of its target.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missing010, openRandom010 } from './legacy010.js';

test('440 AK6 random 0.1.0 stories with few names 1–75: "continue at" keeps the node of its move, not "changed outside"', { skip: missing010(), timeout: 300_000 }, async () => {
	const r = await openRandom010(1, 75, true);
	assert.deepEqual(r.wrong, []);
	// Seed 35 has a "continue at" whose stored ID names no step in main any more: rewritten, not idle.
	assert.ok(r.retargeted >= 1, `only ${r.retargeted} retargeted`);
	assert.ok(r.goTos >= 40, `only ${r.goTos} "continue at"`);
});
