// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
// Job 442: a 0.1.0 file that needs both repairs, a "continue at" into a branch of "in parallel" (job 438) and the
// pattern after which 0.1.0 counted its IDs differently (job 440). The fixtures were written by the core of tag
// v0.1.0 (tests/client/legacy010.ts, save010) from the scenarios of the release review 0.2.0, finding 1:
// "before": start, in parallel [A1] / [B], Z? yes → continue at [A1], no → SHIFTED lines 2–12, [T1], [T2],
// R? yes → end [E], no → continue at [T2]. "after": SHIFTED lines 1–12, in parallel [A1] [A2] / [B], [T1], [T2],
// R? yes → continue at [T2], no → continue at [A2].
// Job 443: "seed1139", randomStory010(core010, 1139, 36, few, first, strands) saved by save010: it needs both repairs and
// was opened as "changed outside" while the diagram was compared with a replay of the stored, not the rewritten targets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadStory } from '../../src/workbench.js';
import { tell, fromBpmn, type Move } from '../../src/core/index.js';
import { validateIR } from '../../src/core/validate.js';
import { missing010, core010, openRandom010 } from './legacy010.js';

const fixture = (name: string) => readFileSync(`tests/core/fixtures/legacy-0.1.0-shifted-strand-${name}.bpmn`, 'utf8');

const opened = async (name: string) => {
	const xml = fixture(name);
	const stored = (await fromBpmn(xml)).ir.story as Move[];
	const g = await loadStory(xml, 'de');
	if ('errors' in g) throw new Error(`not opened: ${g.errors}`);
	const s = tell(g.moves, g.language);
	const at = (line: number) => s.ir.nodes.find((n) => n.id === (g.moves[line - 1] as { target?: string }).target)?.name;
	return { g, stored, s, at };
};

for (const [name, strand, shifted, step] of [['before', 8, 24, 'T2'], ['after', 23, 22, 'T2']] as const) {
	test(`442 AK1/AK2 strand ${name} the pattern: line ${strand} still open, line ${shifted} leads to ${step} again, both named`, async () => {
		const { g, stored, s, at } = await opened(name);
		assert.equal(stored[strand - 1].move, 'goTo');
		assert.deepEqual(g.moves[strand - 1], { move: 'openPath' });
		assert.deepEqual(g.reopened, [strand]);
		assert.ok(g.retargeted?.includes(shifted), `retargeted ${JSON.stringify(g.retargeted)}`);
		assert.equal(at(shifted), step);
		assert.equal(g.changed, false);
		assert.equal(g.dropped, undefined);
		assert.deepEqual(g.stored, stored);
		assert.equal(g.moves.length, stored.length);
		assert.deepEqual(s.errors, []);
		assert.deepEqual(validateIR(s.ir), []);
	});
}

test('442 AK3 both fixtures: each "continue at" left leads to the node of the move that made its target in 0.1.0', { skip: missing010(), timeout: 120_000 }, async () => {
	const core = await core010();
	for (const name of ['before', 'after']) {
		const { g, stored, s } = await opened(name);
		const before = core.tell(stored, 'de').nodes;
		let goTos = 0;
		for (const [j, z] of stored.entries()) {
			const now = g.moves[j] as { move: string; target?: string };
			if (z.move !== 'goTo' || now.move !== 'goTo') continue;
			goTos++;
			const by = before.indexOf(z.target);
			assert.ok(by >= 0 && by < j, `${name} line ${j + 1}: no move made ${z.target} in 0.1.0`);
			assert.equal(now.target, s.nodes[by], `${name} line ${j + 1}: at ${now.target}, the move of line ${by + 1} made ${s.nodes[by]}`);
		}
		assert.equal(goTos, 1, name);
	}
});

test('442 AK4 random 0.1.0 stories with the shifted pattern and "continue at" into branches 1–80: each "continue at" keeps the node of its move', { skip: missing010(), timeout: 300_000 }, async () => {
	const r = await openRandom010(1, 80, false, false, true);
	assert.deepEqual(r.wrong, []);
	assert.ok(r.both >= 10, `only ${r.both} files reopened and retargeted (${r.reopened} reopened, ${r.retargeted} retargeted)`);
	assert.ok(r.goTos >= 100, `only ${r.goTos} "continue at"`);
});

test('443 AK1 seed 1139 (both repairs): not "changed outside", line 10 still open, line 26 leads to the node of its move', { skip: missing010(), timeout: 120_000 }, async () => {
	const { g, stored, s } = await opened('seed1139');
	assert.equal(g.changed, false);
	assert.deepEqual(g.reopened, [10]);
	assert.deepEqual(g.retargeted, [26]);
	assert.equal(g.dropped, undefined);
	assert.deepEqual(s.errors, []);
	const core = await core010();
	const by = core.tell(stored, 'de').nodes.indexOf((stored[25] as { target?: string }).target);
	assert.ok(by >= 0 && by < 25);
	assert.equal((g.moves[25] as { target?: string }).target, s.nodes[by]);
});

test('443 AK2 seed 1139 with a step renamed outside Story2BPMN: "changed outside"', async () => {
	const xml = fixture('seed1139');
	assert.ok(xml.includes('name="T1"'));
	const g = await loadStory(xml.replace('name="T1"', 'name="T1 außen"'), 'de');
	if ('errors' in g) throw new Error(`not opened: ${g.errors}`);
	assert.equal(g.changed, true);
	assert.deepEqual(g.reopened, [10]);
});

test('443 AK3 random 0.1.0 stories with few names, "what comes first" and both repairs 1101–1175: not "changed outside", each "continue at" keeps the node of its move', { skip: missing010(), timeout: 300_000 }, async () => {
	const r = await openRandom010(1101, 1175, true, true, true);
	assert.deepEqual(r.wrong, []);
	assert.ok(r.both >= 10, `only ${r.both} files reopened and retargeted`);
});
