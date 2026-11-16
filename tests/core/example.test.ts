// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tell, run, emptyProcess } from '../../src/core/index.js';
import { exampleMoves } from '../../src/example.js';

const NAMES = { de: 'Rechnungsfreigabe', en: 'Invoice approval' } as const;

for (const language of ['de', 'en'] as const) {
	test(`396 AK1 the example (${language}) runs through the core without an error and is told to its end`, async () => {
		const moves = exampleMoves(language);
		assert.ok(moves.length >= 12 && moves.length <= 15, `${moves.length} moves`);
		const g = tell(moves, language);
		assert.deepEqual(g.errors, []);
		assert.equal(g.done, true);
		assert.equal(g.ir.name, NAMES[language]);
		const kinds = moves.map((m) => m.move);
		assert.equal(moves[0].move === 'start' && moves[0].subtype, 'message');
		assert.equal(kinds.filter((k) => k === 'decision').length, 1);
		assert.equal(kinds.filter((k) => k === 'concurrent').length, 1);
		assert.equal(moves.filter((m) => m.move === 'exceptionPath' && m.subtype === 'deadline').length, 1);
		assert.equal(kinds.filter((k) => k === 'end').length, 2);
		const r = await run({ ir: emptyProcess('P', g.ir.name, language), ops: g.ops });
		assert.equal(r.ok, true);
		assert.deepEqual(r.issues, []);
		assert.equal(r.readingCopy, true);
		assert.equal(r.ir.lanes.length, 3);
		assert.match(r.xml!, new RegExp(`xml:lang="${language}"`));
	});
}
