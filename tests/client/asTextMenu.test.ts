// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
// Job 453: "Edit as text" in the menu of every line opens the editor with the caret on that line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Move } from '../../src/core/index.js';
import { asTextTarget, menuGroups } from '../../src/lineMenu.js';
import { lineCaret, replay, textFrom } from '../../src/workbench.js';

test('453 AK1 "Edit as text" is the last item of the first group', () => {
	assert.deepEqual(menuGroups(['edit', 'before', 'remove', 'asText']), [['edit', 'before', 'asText'], ['remove']]);
	assert.deepEqual(menuGroups(['tell', 'before', 'asText']), [['before', 'asText'], ['tell']]);
	assert.deepEqual(menuGroups(['edit', 'addException', 'remove', 'subprocess', 'propose', 'asText']), [['edit', 'addException', 'propose', 'asText'], ['subprocess'], ['remove']]);
	// A line with nothing to edit (a merge) still has it in the first group.
	assert.deepEqual(menuGroups(['reopen', 'asText']), [['asText'], ['reopen']]);
});

test('453 AK2 lineCaret: start of the line after its indentation, 0 outside', () => {
	const text = 'Start\n  Schritt A\n  WENN x\n\nEnde';
	assert.equal(lineCaret(text, 0), 0);
	assert.equal(lineCaret(text, 1), 8);
	assert.equal(text.slice(lineCaret(text, 1), lineCaret(text, 1) + 7), 'Schritt');
	assert.equal(lineCaret(text, 2), 20);
	assert.equal(lineCaret(text, 3), 27, 'an empty line: its start');
	assert.equal(lineCaret(text, 4), 28);
	assert.equal(lineCaret(text, 5), 0);
	assert.equal(lineCaret(text, -1), 0);
	assert.equal(lineCaret(text, 1.5), 0);
});

test('453 AK4 the main level opens right there, a subprocess level goes to the main level', () => {
	const st = [{ text: 'a' }, { text: 'b' }, { text: 'c' }];
	assert.deepEqual(asTextTarget({ lineOffset: 0, lines: st, storyText: st }, 2), { line: 2, here: true });
	assert.deepEqual(asTextTarget({ sub: { name: 'x' }, lineOffset: 1, lines: st.slice(1), storyText: st }, 1), { line: 2, here: false });
	// Without the same objects: counted from the offset.
	assert.deepEqual(asTextTarget({ sub: { name: 'x' }, lineOffset: 1, lines: [{ text: 'b' }], storyText: st }, 0), { line: 1, here: false });
});

// Risk: a story with a subprocess and two flows of what can come at any time, one inside the subprocess.
const flow = (text: string): Move[] => [{ move: 'task', text, role: 'Team' }, { move: 'end', text: `${text} fertig` }];
const anytime = (text: string, sub: Move[]): Move => ({ move: 'anytime', text, subtype: 'message', keepsRunning: '', subprocess: sub });
const STORY: Move[] = [
	{ move: 'start', text: 'Antrag geht ein', role: 'Vertrieb' },
	{ move: 'task', text: 'Antrag prüfen', role: 'Vertrieb', subprocess: [...flow('Sichten'), anytime('Rückzug innen', flow('Abbrechen'))] },
	{ move: 'decision', question: 'Vollständig?', yes: 'ja', no: 'nein' },
	{ move: 'task', text: 'Bescheiden', role: 'Vertrieb' },
	{ move: 'end', text: 'Erledigt' },
	{ move: 'task', text: 'Nachfordern', role: 'Vertrieb' },
	{ move: 'end', text: 'Abgelehnt' },
	anytime('Kunde ruft an', flow('Auskunft geben')),
	anytime('Kunde zieht zurück', flow('Antrag schließen')),
];

test('453 risk: on every level the caret line is the line clicked, also between the flows of the main level', async () => {
	const levels: [number?, number?][] = [[], [1], [7], [8], [1, 2]];
	let checked = 0;
	for (const [level, any] of levels) {
		const v = await replay(STORY, 'de', level, any);
		const text = textFrom(v.storyText).split('\n');
		v.lines.forEach((l, at) => {
			if (l.move === undefined) return;
			const { line, here } = asTextTarget(v, at);
			assert.equal(here, level === undefined, `level ${level}`);
			assert.equal(v.storyText[line], l, `level ${level}/${any} line ${at}`);
			assert.equal(text[line].trim(), l.text);
			checked++;
		});
	}
	assert.ok(checked >= 15, String(checked));
});
