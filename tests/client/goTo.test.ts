// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
// Job 402: "continue at" stays with the step it was told to, after changing a line, editing the text
// and accepting a proposal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tell, replaceMove, read, type Move, type Approval, type Language } from '../../src/core/index.js';
import { changeLine, textMoves, textFrom, textChecker } from '../../src/workbench.js';
import { validLines, labelOf, applyProposal, checkProposal } from '../../src/approval.js';

const T = (text: string): Move => ({ move: 'task', text, role: 'Team' });
/** The node ID of the reachable target `name` (the `nth` of that name) at the end of `moves`. */
const target = (moves: Move[], name: string, nth = 0, opts = {}): string => tell(moves, 'de', opts).targets.filter((z) => z.name === name)[nth].id;
const nameOf = (moves: Move[], id: string, opts = {}): string | undefined => tell(moves, 'de', opts).ir.nodes.find((n) => n.id === id)?.name;
const goTos = (moves: Move[]): string[] => moves.flatMap((z) => (z.move === 'goTo' ? [z.target] : []));

// "it depends" with "Buchen" on the yes path; the no path continues at "Buchen".
const BASE: Move[] = [
	{ move: 'start', text: 'Anfrage kommt', role: 'Team' },
	T('Prüfen'),
	{ move: 'decision', question: 'Passt es?', yes: 'ja', no: 'nein' },
	T('Buchen'),
	{ move: 'end', text: 'Gebucht' },
	T('Nachfragen'),
];
const DEPENDS: Move[] = [...BASE, { move: 'goTo', target: target(BASE, 'Buchen') }];
const FIRST_MOVE = { move: 'decision', subtype: 'first', yes: 'Zusage', no: 'Frist', yesKind: 'message', noKind: 'time' } as Move;

test('402 AK1 "it depends" changed to "what comes first": continue at still leads to "Buchen"', () => {
	const r = changeLine(DEPENDS, 2, FIRST_MOVE, 'de');
	assert.ok('moves' in r);
	const g = tell(r.moves, 'de');
	assert.deepEqual(g.errors, []);
	assert.equal(nameOf(r.moves, goTos(r.moves)[0]), 'Buchen');
	assert.ok(g.storyText.some((l) => l.text === 'WEITER BEI [Buchen].'));
});

test('402 AK2 "what comes first" changed to "it depends": no error, still "Buchen", never an internal ID', () => {
	const first = BASE.map((z, j) => (j === 2 ? FIRST_MOVE : z));
	const story = [...first, { move: 'goTo', target: target(first, 'Buchen') } as Move];
	assert.deepEqual(tell(story, 'de').errors, []);
	const r = changeLine(story, 2, BASE[2], 'de');
	assert.ok('moves' in r);
	const g = tell(r.moves, 'de');
	assert.deepEqual(g.errors, []);
	assert.equal(nameOf(r.moves, goTos(r.moves)[0]), 'Buchen');
	// Before job 402 the old ID stayed and now named another node: the arrow went somewhere else silently.
	const plain = story.map((z, j) => (j === 2 ? BASE[2] : z));
	assert.notEqual(nameOf(plain, goTos(plain)[0]), 'Buchen');
});

test('402 AK3 the target renamed follows; a target gone is named, not its ID', () => {
	const r = changeLine(DEPENDS, 3, T('Buchung anlegen'), 'de');
	assert.ok('moves' in r);
	assert.deepEqual(tell(r.moves, 'de').errors, []);
	assert.ok(tell(r.moves, 'de').storyText.some((l) => l.text === 'WEITER BEI [Buchung anlegen].'));
	// The target's move becomes a branch, which creates no step: the error names "Buchen", not its ID.
	const gone = replaceMove(DEPENDS, 3, { move: 'decision', question: 'Wirklich?', yes: 'ja', no: 'nein' } as Move, 'de');
	assert.deepEqual(tell(gone, 'de').errors, ['Bei „Buchen“ kann es von hier aus nicht weitergehen']);
});

// Two steps "Buchen", one on each path; the no path continues at the second one.
const TWO_BASE: Move[] = [
	{ move: 'start', text: 'Anfrage kommt', role: 'Team' },
	T('Prüfen'),
	{ move: 'decision', question: 'Passt es?', yes: 'ja', no: 'nein' },
	T('Buchen'),
	{ move: 'end', text: 'Gebucht' },
	T('Buchen'),
	T('Nachfragen'),
];
const TWO: Move[] = [...TWO_BASE, { move: 'goTo', target: target(TWO_BASE, 'Buchen', 1) }];
const SECOND = goTos(TWO)[0];

test('402 AK4 two steps of the same name: the text read back unchanged keeps the second one', () => {
	assert.deepEqual(tell(TWO, 'de').errors, []);
	assert.notEqual(SECOND, target(TWO_BASE, 'Buchen', 0));
	for (const language of ['de', 'en'] as Language[]) {
		const text = textFrom(tell(TWO, language).storyText);
		const r = textMoves(text, TWO, language);
		assert.deepEqual(r.errors, []);
		assert.deepEqual(goTos(r.moves), [SECOND]);
		// Another line changed (renamed): the "continue at" still leads to the second "Buchen".
		const edited = textMoves(text.replace('[Prüfen]', '[Genau prüfen]'), TWO, language);
		assert.deepEqual(edited.errors, []);
		assert.equal(nameOf(edited.moves, goTos(edited.moves)[0]), 'Buchen');
		assert.equal(goTos(edited.moves)[0], SECOND);
	}
});

test('402 AK4 the checker of the editor gets the moves when opened (worker and on the page)', async () => {
	const text = textFrom(tell(TWO, 'de').storyText);
	assert.deepEqual(goTos((await textChecker('de', undefined, TWO).check(text)).moves), [SECOND]);
	const sent: { num: number; previous: Move[] }[] = [];
	const w = { postMessage: (m: { num: number; text: string; language: Language; previous: Move[] }) => { sent.push(m); w.onmessage!({ data: { num: m.num, result: textMoves(m.text, m.previous, m.language) } }); }, terminate() {}, onmessage: null as null | ((e: { data: { num: number; result: ReturnType<typeof textMoves> } }) => void), onerror: null };
	const r = await textChecker('de', () => w, TWO).check(text);
	assert.deepEqual(sent[0].previous, TWO);
	assert.deepEqual(goTos(r.moves), [SECOND]);
});

test('402 AK5 an ambiguous name without the story before is an error with its line', () => {
	for (const language of ['de', 'en'] as Language[]) {
		const text = textFrom(tell(TWO, language).storyText);
		const line = text.split('\n').findIndex((l) => /WEITER BEI|CONTINUE AT/.test(l)) + 1;
		const r = read(text, language);
		assert.equal(r.line, line);
		// Job 449: the message names the number the story shows on that line.
		const num = tell(TWO, language).storyText[line - 1].move! + 1;
		assert.equal(r.errors[0], language === 'de'
			? `Zeile ${num}: „Buchen“ gibt es mehrmals – bitte die Schritte verschieden benennen`
			: `Line ${num}: “Buchen” exists more than once – please give the steps different names`);
		// The story before had no "continue at" there: the same.
		assert.equal(textMoves(text, TWO_BASE, language).line, line);
	}
});

test('402 AK6 accepting a proposal on another line keeps the second "Buchen"', async () => {
	const a: Approval = {
		state: 'valid', owner: { uid: 'p', name: 'P' }, author: { uid: 'j', name: 'J' }, decided: [], tag: true,
		valid: { number: 1, date: '2026-11-13T10:00:00.000Z', by: { uid: 'p', name: 'P' }, language: 'de', moves: TWO },
	};
	const lines = validLines(a);
	const p = { version: 1, line: 2, label: labelOf(lines[1]), kind: 'change' as const, text: '[@Team] soll [Genau prüfen].' };
	assert.deepEqual(await checkProposal(a, p), []);
	const r = await applyProposal(TWO, 'de', a, p);
	assert.ok(r.ok);
	assert.deepEqual(goTos(r.ok ? r.moves : []), [SECOND]);
});

test('402 AK7 in a subprocess: the text read back unchanged keeps the second "Buchen"', () => {
	const inner = { inner: { name: 'Auftrag abwickeln' } };
	const base = TWO_BASE.slice(1);
	const sub = [...base, { move: 'goTo', target: target(base, 'Buchen', 1, inner) } as Move];
	assert.deepEqual(tell(sub, 'de', inner).errors, []);
	const story: Move[] = [TWO_BASE[0], { move: 'task', text: 'Auftrag abwickeln', role: 'Team', subprocess: sub } as Move, { move: 'end', text: 'Fertig' }];
	const text = textFrom(tell(story, 'de').storyText);
	const r = textMoves(text, story, 'de');
	assert.deepEqual(r.errors, []);
	const back = (r.moves[1] as { subprocess?: Move[] }).subprocess ?? [];
	assert.deepEqual(goTos(back), goTos(sub));
	assert.ok(read(text, 'de').errors[0]?.includes('mehrmals'));
});

test('402 risk: changing a line of a long story with several "continue at" stays fast', () => {
	let moves: Move[] = [{ move: 'start', text: 'Los', role: 'Team' }];
	for (let i = 0; i < 40; i++) moves.push(T(`Schritt ${i}`));
	moves.push({ move: 'decision', question: 'Weiter?', yes: 'ja', no: 'nein' }, T('A'), { move: 'end', text: 'E' }, T('B'));
	moves.push({ move: 'goTo', target: target(moves, 'Schritt 3') });
	const t0 = performance.now();
	const r = changeLine(moves, 2, T('Neu'), 'de');
	assert.ok('moves' in r);
	assert.deepEqual(tell(r.moves, 'de').errors, []);
	assert.ok(performance.now() - t0 < 2000);
});
