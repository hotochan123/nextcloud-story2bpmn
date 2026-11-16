// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
// Job 449: "Edit as text" numbers its lines like the story, and messages name those numbers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Move, Approval } from '../../src/core/index.js';
import { tell } from '../../src/core/index.js';
import { checkProposal, validLines, labelOf } from '../../src/approval.js';
import { textFrom, textMoves, storyNumbers, editorNumbers, withoutLine } from '../../src/workbench.js';

const DECISION: Move[] = [
	{ move: 'start', text: 'Rechnung eingegangen', role: 'Buchhaltung' },
	{ move: 'task', text: 'Rechnung prüfen', role: 'Buchhaltung' },
	{ move: 'decision', yes: 'ja', no: 'nein', text: 'Rechnung korrekt' },
	{ move: 'task', text: 'Rechnung buchen', role: 'Buchhaltung' },
	{ move: 'end', text: 'Gebucht' },
	{ move: 'task', text: 'Rechnung zurückweisen', role: 'Buchhaltung' },
	{ move: 'end', text: 'Abgelehnt' },
] as Move[];

test('449 AK1 the text as opened shows the numbers of the story, also for what can come at any time told in the middle', () => {
	const moves: Move[] = [
		{ move: 'start', text: 'Antrag geht ein', role: 'Vertrieb' },
		{ move: 'anytime', text: 'Storno', subtype: 'time', keepsRunning: '', subprocess: [{ move: 'end', text: 'Storniert' }] },
		{ move: 'task', text: 'Bescheid senden', role: 'Vertrieb' },
		{ move: 'end', text: 'Erledigt' },
	] as Move[];
	const g = tell(moves, 'de');
	const text = textFrom(g.storyText);
	const start = { text, numbers: storyNumbers(g.storyText) };
	// The story numbers the JEDERZEIT heading 2 (told second) though it stands after the flow.
	assert.deepEqual(start.numbers, [1, 3, 4, 2, null, 1]);
	assert.deepEqual(editorNumbers(text, start, null, 'de'), start.numbers);
	// Changed, the numbers the story has once it is applied (what can come at any time after the flow).
	const changed = text.replace('Bescheid senden', 'Bescheid schicken');
	const r = textMoves(changed, moves, 'de');
	assert.deepEqual(r.errors, []);
	assert.deepEqual(editorNumbers(changed, start, { text: changed, numbers: r.numbers }, 'de'), [1, 2, 3, 4, null, 1]);
	assert.deepEqual(storyNumbers(tell(r.moves, 'de').storyText), [1, 2, 3, 4, null, 1]);
	// Typed on since the last check: counted from the text at once.
	assert.deepEqual(editorNumbers(changed + '\nENDE: [X].', start, { text: changed, numbers: r.numbers }, 'de'), [1, 2, 3, 4, null, 1, 2]);
});

test('449 AK3 the editor shows the message without its "Line n: "', () => {
	assert.equal(withoutLine('Zeile 5: „ENDEE: [x].“ nicht verstanden'), '„ENDEE: [x].“ nicht verstanden');
	assert.equal(withoutLine('Line 12: “x” not understood'), '“x” not understood');
	assert.equal(withoutLine('„→ vielleicht:“ – diesen Weg gibt es hier nicht'), '„→ vielleicht:“ – diesen Weg gibt es hier nicht');
});

test('449 AK4 a proposal that does not read back names the move number of its line, not the text line', async () => {
	const a = {
		state: 'valid', decided: [], tag: true,
		valid: { number: 1, date: '2026-11-11T14:10:00.000Z', by: { uid: 'petra', name: 'Petra' }, language: 'de', moves: DECISION },
	} as unknown as Approval;
	// "ENDE: [Gebucht]." is move 5 and text line 6 (below "→ ja:").
	const lines = validLines(a);
	assert.equal(lines.findIndex((l) => l.includes('Gebucht')), 5);
	const p = { version: 1, line: 5, label: labelOf(lines[5]), kind: 'change' as const, text: 'ENDEE: [Gebucht].' };
	const errors = await checkProposal(a, p);
	assert.equal(errors.length, 1);
	assert.match(errors[0], /^Zeile 5: /);
});

test('449 AK6 nothing in the coloured layer changes the advance of a glyph', () => {
	const css = readFileSync('src/workshop.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
	const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));
	const layer = rules.filter((r) => r.selector.split(',').some((s) => /\.color \.\S+/.test(s.trim())));
	assert.ok(layer.length >= 4);
	for (const r of layer) {
		for (const d of r.body.split(';').map((x) => x.trim()).filter(Boolean)) {
			const [prop, value] = [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()];
			if (/^(font-weight|font-size|letter-spacing|word-spacing|font-family|font-stretch)$/.test(prop)) assert.fail(`${r.selector}: ${d}`);
			if (prop === 'font') assert.equal(value, 'inherit', r.selector);
			if (/^(padding|margin|border)(-(left|right|inline.*))?$/.test(prop)) assert.match(value, /^0(px)?$/, `${r.selector}: ${d}`);
		}
	}
	// The field and the layer: the instance font, not mono.
	assert.match(css, /\.editor \{[^}]*font: 400 14px\/24px var\(--f-text\)/);
});
