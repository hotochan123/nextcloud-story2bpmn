// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
// Job 417: one line count for proposals, the number left of the line (its move), not the text line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Move, Approval } from '../../src/core/index.js';
import {
	validLines, validStory, validIndexOf, proposalAt, currentIndexOf, proposalText, openProposals,
	applyProposal, checkProposal, decisionComment, quoteOf, storyLines,
} from '../../src/approval.js';

const T = (text: string): Move => ({ move: 'task', text, role: 'Team' } as Move);
// Lines: 0 start, 1 check, 2 the question, 3 the heading of the yes path (no move), 4 book, 5 end,
// 6 the heading of the no path (no move), 7 ask back, 8 an end with the same name as line 5.
const STORY: Move[] = [
	{ move: 'start', text: 'Anfrage kommt', role: 'Team' } as Move,
	T('Prüfen'),
	{ move: 'decision', question: 'Passt es?', yes: 'ja', no: 'nein' } as Move,
	T('Buchen'),
	{ move: 'end', text: 'Fertig' } as Move,
	T('Nachfragen'),
	{ move: 'end', text: 'Fertig' } as Move,
];
const valid = (moves: Move[] = STORY): Approval => ({
	state: 'valid', owner: { uid: 'p', name: 'P' }, author: { uid: 'j', name: 'J' }, decided: [], tag: true,
	valid: { number: 1, date: '2026-11-13T10:00:00.000Z', by: { uid: 'p', name: 'P' }, language: 'de', moves },
});
const at = (a: Approval, text: string, nth = 0) => validLines(a).map((l, i) => [l.trim(), i] as const).filter(([l]) => l === text)[nth][1];

test('417 AK1 the number of a proposal is the move number shown left, headings of paths do not count', () => {
	const a = valid();
	const i = at(a, '[@Team] soll [Nachfragen].');
	assert.equal(i, 7, 'text line 8 behind two path headings');
	assert.deepEqual(proposalAt(a, i), { line: 6, label: 'Nachfragen' });
	assert.equal(validStory(a)[i].move! + 1, 6);
	// A heading without a move takes no proposal.
	assert.equal(proposalAt(a, 3), null);
	const head = proposalText({ version: 1, ...proposalAt(a, i)!, kind: 'remark', why: 'x' }, 'de').split('\n')[0];
	assert.equal(head, 'Vorschlag zu Gültige Version 1, Zeile 6 [Nachfragen]');
});

test('417 AK2 open proposals are found by move number and label', () => {
	const a = valid();
	const msg = (line: number, label: string, version = 1) => proposalText({ version, line, label, kind: 'remark', why: 'x' }, 'de');
	const c = (id: string, message: string) => ({ id, message, actorId: 's', actorName: 'S', date: '2026-11-13T11:00:00.000Z' });
	const comments = [c('1', msg(6, 'Nachfragen')), c('2', msg(8, 'Nachfragen')), c('3', msg(6, 'Buchen')), c('4', msg(6, 'Nachfragen', 2)), c('5', msg(7, 'Fertig'))];
	assert.deepEqual(openProposals(comments, a).map((p) => p.id), ['1', '5']);
	assert.equal(validIndexOf(a, { line: 6, label: 'Nachfragen' }), 7);
	assert.equal(validIndexOf(a, { line: 99, label: 'Nachfragen' }), null);
});

test('417 AK3 two equal lines: mark and accepting hit the move of the proposal, not the first equal line', async () => {
	const a = valid();
	const second = at(a, 'ENDE: [Fertig].', 1);
	const ref = proposalAt(a, second)!;
	assert.deepEqual(ref, { line: 7, label: 'Fertig' });
	const vi = validIndexOf(a, ref)!;
	assert.equal(vi, second);
	assert.equal(currentIndexOf(storyLines(STORY, 'de'), validLines(a), vi), second, 'the mark sits at the second end');
	const p = { version: 1, ...ref, kind: 'change' as const, text: 'ENDE: [Abgesagt].' };
	assert.deepEqual(await checkProposal(a, p), []);
	const r = await applyProposal(STORY, 'de', a, p);
	assert.ok(r.ok);
	if (!r.ok) return;
	assert.equal((r.moves[4] as { text: string }).text, 'Fertig', 'first end unchanged');
	assert.equal((r.moves[6] as { text: string }).text, 'Abgesagt');
	// The first end gets its own number.
	assert.deepEqual(proposalAt(a, at(a, 'ENDE: [Fertig].')), { line: 5, label: 'Fertig' });
});

test('417 AK4 accepting finds the line of the proposal after a line was inserted before it', async () => {
	const a = valid();
	const ref = proposalAt(a, at(a, 'ENDE: [Fertig].', 1))!;
	const moved = [STORY[0], T('Eingang erfassen'), ...STORY.slice(1)];
	const r = await applyProposal(moved, 'de', a, { version: 1, ...ref, kind: 'change', text: 'ENDE: [Abgesagt].' });
	assert.ok(r.ok);
	if (!r.ok) return;
	assert.equal((r.moves[5] as { text: string }).text, 'Fertig');
	assert.equal((r.moves[7] as { text: string }).text, 'Abgesagt');
});

test('417 AK5 decision comments name number and text', () => {
	assert.equal(decisionComment('accepted', 5, 'Ware prüfen', 'de'), 'Angenommen: Vorschlag zu Zeile 5 („Ware prüfen“).');
	assert.equal(decisionComment('rejected', 5, 'Ware prüfen', 'de'), 'Abgelehnt: Vorschlag zu Zeile 5 („Ware prüfen“).');
	assert.equal(decisionComment('done', 2, 'Ware prüfen', 'de'), 'Erledigt: Bemerkung zu Zeile 2 („Ware prüfen“).');
	assert.equal(decisionComment('accepted', 5, 'Check goods', 'en'), 'Accepted: proposal on line 5 ("Check goods").');
	assert.equal(decisionComment('rejected', 5, 'Check goods', 'en'), 'Rejected: proposal on line 5 ("Check goods").');
	assert.equal(decisionComment('done', 5, 'Check goods', 'en'), 'Done: remark on line 5 ("Check goods").');
	// Empty label: the line itself without brackets.
	assert.equal(quoteOf('', '    ZUSAMMEN.'), 'ZUSAMMEN.');
	assert.equal(quoteOf('', '[@Team] soll [Prüfen].'), 'Team soll Prüfen.');
	assert.equal(quoteOf('Ware prüfen', 'egal'), 'Ware prüfen');
	const long = quoteOf('x'.repeat(80), '');
	assert.equal(long.length, 60);
	assert.ok(long.endsWith('…'));
});

test('417 risk: a move inside a subprocess is found by its own number', async () => {
	const inner: Move[] = [T('Paket packen'), T('Paket senden')];
	const story: Move[] = [STORY[0], { move: 'task', text: 'Versand', role: 'Team', subprocess: inner } as Move, { move: 'end', text: 'Fertig' } as Move];
	const a = valid(story);
	const i = at(a, '[@Team] soll [Paket senden].');
	const ref = proposalAt(a, i)!;
	assert.deepEqual(ref, { line: 2, label: 'Paket senden' });
	assert.equal(validIndexOf(a, ref), i);
	const r = await applyProposal(story, 'de', a, { version: 1, ...ref, kind: 'change', text: '[@Team] soll [Paket schicken].' });
	assert.ok(r.ok);
	if (!r.ok) return;
	assert.equal(((r.moves[1] as { subprocess: Move[] }).subprocess[1] as { text: string }).text, 'Paket schicken');
});
