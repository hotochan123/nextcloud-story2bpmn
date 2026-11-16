// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
// Job 436: a huge working file is refused before replaying, proposals read back through the given worker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Move, Approval } from '../../src/core/index.js';
import { applyProposal, checkProposal, acceptProposal, validLines, labelOf } from '../../src/approval.js';
import { fileXml, loadStory, textMoves } from '../../src/workbench.js';
import type { TextResult } from '../../src/workbench.js';
import { toStored } from '../../src/core/storyFormat.js';

const STORY: Move[] = [
	{ move: 'start', text: 'Rechnung geht ein', role: 'Buchhaltung' },
	{ move: 'task', text: 'Rechnung prüfen', role: 'Buchhaltung' },
	{ move: 'task', text: 'Zahlung genehmigen', role: 'Leitung' },
	{ move: 'end', text: 'Bezahlt' },
] as Move[];

test('436 AK6 a working file with 2000 moves is refused as too long, quickly; a normal one loads', async () => {
	const xml = (await fileXml(STORY, 'de'))!;
	const ok = await loadStory(xml, 'de');
	assert.ok(!('errors' in ok));
	// The stored format of the file (German keys) with 2000 task moves.
	const big = toStored([STORY[0], ...Array.from({ length: 2000 }, (_, i) => ({ move: 'task', text: `S${i}`, role: 'A' }))]);
	const attr = JSON.stringify(big).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
	const huge = xml.replace(/bpmnc:geschichte="[^"]*"/, () => `bpmnc:geschichte="${attr}"`);
	assert.notEqual(huge, xml);
	const t0 = performance.now();
	const r = await loadStory(huge, 'de');
	const ms = performance.now() - t0;
	assert.deepEqual(r, { errors: 'too-long' });
	assert.ok(ms < 500, `took ${ms} ms`);
});

const approval = (moves: Move[]): Approval => ({
	state: 'valid', decided: [], tag: true,
	valid: { number: 1, date: '2026-11-11T14:10:00.000Z', by: { uid: 'petra', name: 'Petra' }, language: 'de', moves },
}) as Approval;

test('436 AK7 accepting and checking a proposal read back through the given function, with the same result', async () => {
	const a = approval(STORY);
	const n = 3;
	const p = { version: 1, line: n, label: labelOf(validLines(a)[n - 1]), kind: 'change' as const, text: '[@Leitung] soll [Zahlung freigeben].' };
	const calls: string[] = [];
	const spy = async (text: string, old: Move[], language: 'de' | 'en'): Promise<TextResult> => {
		calls.push(text);
		return textMoves(text, old, language);
	};
	const plain = await applyProposal(STORY, 'de', a, p);
	const viaWorker = await applyProposal(STORY, 'de', a, p, spy);
	assert.equal(calls.length, 1);
	assert.deepEqual(viaWorker, plain);
	assert.ok(viaWorker.ok);
	assert.deepEqual(await checkProposal(a, p, spy), []);
	assert.equal(calls.length, 2);
	// A crafted proposal line (the audit's documents list) is refused, fast.
	const crafted = { ...p, text: '[@a] soll [b] mit ' + '[+x], '.repeat(40) + '!' };
	const t0 = performance.now();
	const bad = await checkProposal(a, crafted, spy);
	assert.ok(performance.now() - t0 < 200);
	assert.ok(bad.length > 0);
});

test('436 round 1: a change made while a proposal is read back is not overwritten', async () => {
	const a = approval(STORY);
	const n = 3;
	const p = { version: 1, line: n, label: labelOf(validLines(a)[n - 1]), kind: 'change' as const, text: '[@Leitung] soll [Zahlung freigeben].' };
	const file = { id: 1 };
	// The page state; the card change below edits the moves in place, as the workbench does.
	const state = { file: file as unknown, moves: structuredClone(STORY), language: 'de' as const };
	const slow = (change: () => void) => async (text: string, old: Move[], language: 'de' | 'en'): Promise<TextResult> => {
		await new Promise((r) => setTimeout(r, 20));
		change();
		return textMoves(text, old, language);
	};
	// Unchanged meanwhile: the proposal is applied.
	const ok = await acceptProposal(() => state, a, p, slow(() => {}));
	assert.ok(ok.ok);
	// The story changed in place meanwhile: nothing to apply.
	const edited = await acceptProposal(() => state, a, p, slow(() => { (state.moves[1] as { text: string }).text = 'Rechnung genau prüfen'; }));
	assert.deepEqual(edited, { ok: false, errors: ['changed'] });
	// Another file opened meanwhile.
	state.moves = structuredClone(STORY);
	const other = await acceptProposal(() => state, a, p, slow(() => { state.file = { id: 2 }; }));
	assert.deepEqual(other, { ok: false, errors: ['changed'] });
});
