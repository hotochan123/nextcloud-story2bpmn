// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
// Job 439: 0.1.0 files with the extra path left open after a branch in the last path of another one open again.
// The fixtures were written by the core of tag v0.1.0 (tests/client/legacy010.ts, save010), stories below.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadStory, fileXml, unsaved } from '../../src/workbench.js';
import { tell, fromBpmn, type Move } from '../../src/core/index.js';
import { validateIR } from '../../src/core/validate.js';

const fixture = (name: string) => readFileSync(`tests/core/fixtures/${name}`, 'utf8');
// A check whose otherwise path holds a second check with an end on one path; both merge; a step, an end,
// and the extra end X that 0.1.0 still asked for.
const END = 'legacy-0.1.0-extra-end.bpmn';
// A check whose otherwise path holds a second check, all paths merging without an end; a step, an end, end X.
const MERGES = 'legacy-0.1.0-extra-merges.bpmn';
// The same with "in parallel" outside and the check in its second branch; a step, an end, end X.
const PARALLEL = 'legacy-0.1.0-extra-parallel.bpmn';

const opened = async (name: string) => {
	const xml = fixture(name);
	const stored = (await fromBpmn(xml)).ir.story as Move[];
	const g = await loadStory(xml, 'en');
	if ('errors' in g) throw new Error(`not opened: ${g.errors}`);
	return { g, stored };
};

for (const name of [END, MERGES, PARALLEL]) {
	test(`439 AK1/AK2 ${name}: the extra end is left out and named, the rest as in the file`, async () => {
		const { g, stored } = await opened(name);
		assert.ok(tell(stored, 'de').errors.length > 0);
		assert.deepEqual(g.dropped, [{ line: stored.length, text: 'ENDE: [X].' }]);
		assert.deepEqual(g.moves, stored.slice(0, -1));
		assert.equal(g.reopened, undefined);
		assert.equal(g.changed, false);
		assert.equal(g.language, 'de');
		const s = tell(g.moves, g.language);
		assert.deepEqual(s.errors, []);
		assert.equal(s.done, true);
		assert.deepEqual(validateIR(s.ir), []);
	});
}

test('439 AK6 the note names number and text of each line, at most 10, no internal name', async () => {
	const texts: string = '../../src/texts.js';
	const { droppedText, DROPPED_NAMED } = await import(texts) as { droppedText: (d: { line: number; text: string }[]) => string; DROPPED_NAMED: number };
	const one = droppedText([{ line: 14, text: 'ENDE: [X].' }]);
	assert.match(one, /^Line 14 \(“ENDE: \[X\]\.”\) no longer fits/);
	const two = droppedText([{ line: 7, text: 'ZUSAMMEN.' }, { line: 9, text: 'ENDE: [X].' }]);
	assert.match(two, /^Lines 7 \(“ZUSAMMEN\.”\), 9 \(“ENDE: \[X\]\.”\) no longer fit/);
	const many = droppedText(Array.from({ length: 13 }, (_, i) => ({ line: i + 1, text: 'ZUSAMMEN.' })));
	assert.equal(DROPPED_NAMED, 10);
	assert.match(many, /10 \(“ZUSAMMEN\.”\) and 3 more no longer fit/);
	assert.doesNotMatch(many, /11 \(/);
	// Markup from a foreign file stays text: Vue shows the note via {{ }}, the text is not escaped twice.
	assert.match(droppedText([{ line: 3, text: 'ENDE: [<b>&</b>].' }]), /ENDE: \[<b>&<\/b>\]/);
	const { g } = await opened(END);
	assert.doesNotMatch(droppedText(g.dropped!), /[A-Za-z]+_\d+/);
});

test('439 AK7 saved only on Save: the repaired state is unsaved, once saved it opens without a note', async () => {
	const { g, stored } = await opened(MERGES);
	assert.deepEqual(g.stored, stored);
	assert.equal(unsaved(g.moves, g.stored!, g.language, g.language), true);
	const again = await loadStory((await fileXml(g.moves, g.language))!, 'de');
	assert.ok(!('errors' in again));
	assert.equal(again.dropped, undefined);
	assert.equal(again.stored, undefined);
	assert.deepEqual(again.moves, g.moves);
	assert.equal(again.changed, false);
});

test('439 AK7 a readable file has no dropped lines', async () => {
	const g = await loadStory(fixture('legacy-working-file.bpmn'), 'de');
	assert.ok(!('errors' in g));
	assert.equal(g.dropped, undefined);
});
