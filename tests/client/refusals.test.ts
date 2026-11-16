// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
// Job 414: refusals name the line to change (as numbered on the left of the story) and visible names, never an internal ID.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tell, removeBranch, deletePath, reopenPath, type Move, type Language } from '../../src/core/index.js';
import { removeStep, remove } from '../../src/workbench.js';

const T = (text: string): Move => ({ move: 'task', text, role: 'Team' });
const exc = (text: string): Move => ({ move: 'exceptionPath', text });
/** ID of the reachable target `name` (the `nth` of that name) at the end of `moves`. */
const target = (moves: Move[], name: string, nth = 0, opts = {}): string => tell(moves, 'de', opts).targets.filter((z) => z.name === name)[nth].id;
const INTERNAL = /[A-Za-zÄÖÜäöüß]+_\d+/;

// Start, "Prüfen", it depends, "Buchen", end, "Nachfragen", continue at "Buchen" (line 7).
const BASE: Move[] = [
	{ move: 'start', text: 'Anfrage kommt', role: 'Team' },
	T('Prüfen'),
	{ move: 'decision', question: 'Passt es?', yes: 'ja', no: 'nein' },
	T('Buchen'),
	{ move: 'end', text: 'Gebucht' },
	T('Nachfragen'),
];
const STORY: Move[] = [...BASE, { move: 'goTo', target: target(BASE, 'Buchen') }];

test('414 AK1 deleting a step a "continue at" leads to names that line', () => {
	assert.deepEqual(tell(STORY, 'de').errors, []);
	assert.deepEqual(removeStep(STORY, 3, 'de'), { error: 'Zeile 7 führt noch zu „Buchen“ – dort zuerst ändern', line: 6 });
	assert.deepEqual(removeStep(STORY, 3, 'en'), { error: 'Line 7 still leads to “Buchen” – change it there first', line: 6 });
	// Nothing leads to "Nachfragen": deleted as before (its "continue at" goes on from "Passt es?").
	assert.deepEqual(removeStep(STORY, 5, 'de'), { moves: remove(STORY, 5, 'de') });
});

test('414 AK2 a step with an exception is refused the same way; one on its own exception path goes along', () => {
	const head: Move[] = [{ move: 'start', text: 'Antrag', role: 'Team' }, T('Prüfen'), exc('Fehler'), T('Korrektur')];
	const id = tell(head, 'de').nodes[1]!;
	// The normal path loops back to "Prüfen" (line 8).
	const back: Move[] = [...head, { move: 'end', text: 'Abbruch' }, { move: 'decision', question: 'Gut?', yes: 'ja', no: 'nein' }, { move: 'end', text: 'OK' }, { move: 'goTo', target: id }];
	assert.deepEqual(tell(back, 'de').errors, []);
	assert.deepEqual(removeStep(back, 1, 'de'), { error: 'Zeile 8 führt noch zu „Prüfen“ – dort zuerst ändern', line: 7 });
	// The exception path itself loops back: it goes with the step.
	const own: Move[] = [...head, { move: 'goTo', target: id }, { move: 'end', text: 'OK' }];
	assert.deepEqual(tell(own, 'de').errors, []);
	assert.deepEqual(removeStep(own, 1, 'de'), { moves: [head[0], { move: 'end', text: 'OK' }] });
});

test('414 risk: two steps of the same name, the "continue at" leads to the second one', () => {
	const base: Move[] = [{ move: 'start', text: 'Start', role: 'Team' }, T('Prüfen'), { move: 'decision', question: 'Gut?', yes: 'ja', no: 'nein' }, T('Prüfen'), { move: 'end', text: 'Fertig' }, T('Nacharbeit')];
	const moves: Move[] = [...base, { move: 'goTo', target: target(base, 'Prüfen', 1) }];
	assert.deepEqual(tell(moves, 'de').errors, []);
	// The first "Prüfen" goes: nothing leads to it.
	assert.ok('moves' in removeStep(moves, 1, 'de'));
	assert.deepEqual(removeStep(moves, 3, 'de'), { error: 'Zeile 7 führt noch zu „Prüfen“ – dort zuerst ändern', line: 6 });
});

test('414 risk: on the level of a subprocess the line counts on that level', () => {
	const inner = { inner: { name: 'Ware versenden' } };
	const base: Move[] = [T('Packen'), { move: 'decision', question: 'Heil?', yes: 'ja', no: 'nein' }, T('Senden'), { move: 'end', text: 'Gesendet' }, T('Ersetzen')];
	const moves: Move[] = [...base, { move: 'goTo', target: target(base, 'Senden', 0, inner) }];
	assert.deepEqual(tell(moves, 'de', inner).errors, []);
	assert.deepEqual(removeStep(moves, 2, 'de', inner), { error: 'Zeile 6 führt noch zu „Senden“ – dort zuerst ändern', line: 5 });
});

test('414 AK3 deleting a branch, a path or reopening an end gives the line too', () => {
	const r = removeBranch(STORY, 2, 1, 'de');
	assert.deepEqual(r, { error: 'Zeile 7 führt noch zu „Buchen“ – dort zuerst ändern', line: 6 });
	const ended: Move[] = [...BASE.slice(0, 5), { move: 'goTo', target: target(BASE.slice(0, 5), 'Gebucht') }];
	assert.deepEqual(tell(ended, 'de').errors, []);
	assert.deepEqual(reopenPath(ended, 4, 'de'), { error: 'Zeile 6 führt noch zu „Gebucht“ – dort zuerst ändern', line: 5 });
});

/** The story with a nameless end (as a file could bring it) that a "continue at" leads to. */
function nameless(): Move[] {
	const base: Move[] = [{ move: 'start', text: 'Anfrage kommt', role: 'Team' }, T('Prüfen'), { move: 'decision', question: 'Passt es?', yes: 'ja', no: 'nein' }, T('Buchen'), { move: 'end', text: '' }, T('Nachfragen')];
	const id = tell(base, 'de').nodes[4]!;
	return [...base, { move: 'goTo', target: id }];
}

test('414 AK4 a target without a name is named by its line', () => {
	const moves = nameless();
	assert.deepEqual(tell(moves, 'de').errors, []);
	assert.deepEqual(reopenPath(moves, 4, 'de'), { error: 'Zeile 7 führt noch zu Zeile 5 – dort zuerst ändern', line: 6 });
	assert.deepEqual(reopenPath(moves, 4, 'en'), { error: 'Line 7 still leads to line 5 – change it there first', line: 6 });
});

test('414 AK4 a nameless step a "continue at" leads to is named by its line', () => {
	const base: Move[] = [{ move: 'start', text: 'Anfrage kommt', role: 'Team' }, T('Prüfen'), { move: 'decision', question: 'Passt es?', yes: 'ja', no: 'nein' }, T(''), { move: 'end', text: 'Gebucht' }, T('Nachfragen')];
	const moves: Move[] = [...base, { move: 'goTo', target: tell(base, 'de').nodes[3]! }];
	assert.deepEqual(tell(moves, 'de').errors, []);
	assert.deepEqual(removeStep(moves, 3, 'de'), { error: 'Zeile 7 führt noch zu Zeile 4 – dort zuerst ändern', line: 6 });
});

test('414 AK5 no refusal names an internal ID', () => {
	const unnamed: Move[] = [{ move: 'start', text: 'Anfrage kommt', role: 'Team' }, T('Prüfen'), { move: 'decision', question: 'Passt es?', yes: 'ja', no: 'nein' }, T(''), { move: 'end', text: 'Gebucht' }, T('Nachfragen')];
	const unnamedStory: Move[] = [...unnamed, { move: 'goTo', target: tell(unnamed, 'de').nodes[3]! }];
	const three: Move[] = [{ move: 'start', text: 'S', role: 'Team' }, { move: 'decision', question: 'Welcher?', yes: 'A', no: 'C', more: ['B'] }, T('A1'), { move: 'end', text: 'EA' }, T('B1'), { move: 'end', text: 'EB' }, T('C1')];
	const threeStory: Move[] = [...three, { move: 'goTo', target: target(three, 'B1') }];
	for (const language of ['de', 'en'] as Language[]) {
		const texts: string[] = [];
		const add = (r: unknown) => { if (r && typeof r === 'object' && 'error' in r) texts.push(String((r as { error: string }).error)); };
		add(removeStep(STORY, 3, language));
		add(removeStep(unnamedStory, 3, language));
		add(removeBranch(STORY, 2, 1, language));
		add(removeBranch(unnamedStory, 2, 0, language));
		add(deletePath(threeStory, 1, 1, language));
		add(reopenPath(nameless(), 4, language));
		// The replay of a "continue at" whose target went: named by what is left of it, never by its ID.
		texts.push(...tell(remove(STORY, 3, language), language).errors);
		texts.push(...tell(remove(unnamedStory, 3, language), language).errors);
		texts.push(...tell([...BASE, { move: 'goTo', target: 'Schritt_99' }], language).errors);
		assert.ok(texts.length >= 8, `${language}: only ${texts.length} refusals`);
		for (const text of texts) assert.doesNotMatch(text, INTERNAL, text);
	}
	assert.deepEqual(tell([...BASE, { move: 'goTo', target: 'Schritt_99' }], 'de').errors, ['Bei einem Schritt, den es nicht mehr gibt kann es von hier aus nicht weitergehen']);
});
