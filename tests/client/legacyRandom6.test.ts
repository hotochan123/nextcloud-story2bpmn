// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
// Job 441 AK4: random 0.1.0 stories with few names and "what comes first", whose paths share names with the waits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missing010, openRandom010, core010, save010, random } from './legacy010.js';

test('441 AK4 random 0.1.0 stories with "what comes first" 1–75: "continue at" keeps the node of its move, not "changed outside"', { skip: missing010(), timeout: 300_000 }, async () => {
	const r = await openRandom010(1, 75, true, true);
	assert.deepEqual(r.wrong, []);
	assert.ok(r.twins >= 1, `only ${r.twins} stories with a path named like a wait`);
	assert.ok(r.goTos >= 40, `only ${r.goTos} "continue at"`);
});

test('441 AK4 the shifted pattern with waits and "what comes first" of the same names (0.1.0 core, 40 variants): each "continue at" leads to its wait', { skip: missing010(), timeout: 120_000 }, async () => {
	const { loadStory } = await import('../../src/workbench.js');
	const { tell } = await import('../../src/core/index.js');
	const { SHIFTED } = await import('./legacyRetarget.moves.js');
	const core = await core010();
	const wrong: string[] = [];
	let retargeted = 0;
	for (let seed = 1; seed <= 40; seed++) {
		const r = random(seed);
		const pick = <T>(xs: T[]): T => xs[Math.floor(r() * xs.length)];
		const names = ['Zahlung', 'Unterlagen'];
		const moves: { move: string; target?: string }[] = SHIFTED.slice(0, 12);
		for (let w = 1 + Math.floor(r() * 3); w > 0; w--) moves.push({ move: 'wait', text: pick(names), subtype: pick(['message', 'time']) } as never);
		moves.push({ move: 'decision', subtype: 'first', yes: pick(names), no: pick(['14 Tage', ...names]), yesKind: 'message', noKind: 'time' } as never, { move: 'end', text: 'Bezahlt' } as never, { move: 'task', text: 'Mahnen', role: 'Buchhaltung' } as never);
		const before = core.tell(moves, 'de');
		const waits = before.targets.filter((x) => x.id.startsWith('Warten_'));
		const target = pick(waits).id;
		moves.push({ move: 'goTo', target });
		const by = before.nodes.indexOf(target);
		const g = await loadStory(await save010(core, moves), 'de');
		if ('errors' in g) {
			wrong.push(`seed ${seed}: ${g.errors}`);
			continue;
		}
		const s = tell(g.moves, 'de');
		if (s.errors.length || g.changed || g.dropped || g.reopened) wrong.push(`seed ${seed}: ${JSON.stringify({ errors: s.errors, changed: g.changed, dropped: g.dropped, reopened: g.reopened })}`);
		if (g.retargeted) retargeted++;
		const now = (g.moves.at(-1) as { target?: string }).target;
		if (now !== s.nodes[by]) wrong.push(`seed ${seed}: "continue at" the wait of line ${by + 1} now at ${now}, not ${s.nodes[by]}`);
	}
	assert.deepEqual(wrong, []);
	assert.ok(retargeted >= 10, `only ${retargeted} retargeted`);
});
