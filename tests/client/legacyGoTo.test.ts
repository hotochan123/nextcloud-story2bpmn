// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
// Job 438: working files of 0.1.0 with "continue at" into a branch of "in parallel" open again.
// The two fixtures were written by the core of tag v0.1.0 (tell + run of that tag, the moves below).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadStory, fileXml, unsaved } from '../../src/workbench.js';
import { tell, fromBpmn, type Move } from '../../src/core/index.js';

const fixture = (name: string) => readFileSync(`tests/core/fixtures/${name}`, 'utf8');
// Start; in parallel [TA] / [TB], merge; [TC]; ok? yes → end, else → continue at [TA].
const A = 'legacy-0.1.0-goto-strand.bpmn';
// ... ok? yes → continue at the end [EA] inside the first branch; else [TD]; again? no → end, yes → continue at [TD].
const B = 'legacy-0.1.0-goto-strand-end.bpmn';

const opened = async (name: string) => {
	const xml = fixture(name);
	const stored = (await fromBpmn(xml)).ir.story as Move[];
	const g = await loadStory(xml, 'en');
	if ('errors' in g) throw new Error(`not opened: ${g.errors}`);
	return { g, stored };
};

test('438 AK1 a 0.1.0 file looping back into a branch opens: that line still open, the rest as in the file', async () => {
	const { g, stored } = await opened(A);
	assert.equal(stored.at(-1)?.move, 'goTo');
	assert.deepEqual(tell(stored, 'de').errors.length > 0, true);
	assert.deepEqual(g.moves.slice(0, -1), stored.slice(0, -1));
	assert.deepEqual(g.moves.at(-1), { move: 'openPath' });
	assert.deepEqual(g.reopened, [stored.length]);
	assert.equal(g.changed, false);
	assert.equal(g.language, 'de');
	const s = tell(g.moves, g.language);
	assert.deepEqual(s.errors, []);
	assert.equal(s.storyText.at(-1)?.text, 'NOCH OFFEN.');
});

test('438 AK2 continue at an end inside a branch opens, a later "continue at" keeps its step', async () => {
	const { g, stored } = await opened(B);
	const i = stored.findIndex((m) => m.move === 'goTo');
	assert.deepEqual(g.reopened, [i + 1]);
	assert.deepEqual(g.moves[i], { move: 'openPath' });
	assert.equal(g.changed, false);
	const s = tell(g.moves, g.language);
	assert.deepEqual(s.errors, []);
	const last = g.moves.at(-1) as Extract<Move, { move: 'goTo' }>;
	assert.equal(last.move, 'goTo');
	// The ID moved on (the placeholder takes one), the step stays TD.
	assert.notEqual(last.target, (stored.at(-1) as Extract<Move, { move: 'goTo' }>).target);
	assert.equal(s.ir.nodes.find((n) => n.id === last.target)?.name, 'TD');
	assert.equal(s.storyText.at(-1)?.text, 'WEITER BEI [TD].');
});

test('438 AK4 (changed by job 439) a line refused for another reason is left out and named; a refused trigger stays unreadable', async () => {
	const xml = fixture(A).replace('&#34;ziel&#34;:&#34;Schritt_3&#34;', '&#34;ziel&#34;:&#34;Schritt_99&#34;');
	assert.notEqual(xml, fixture(A));
	const { stored } = await opened(A);
	const g = await loadStory(xml, 'de');
	assert.ok(!('errors' in g));
	assert.deepEqual(g.dropped, [{ line: stored.length, text: 'WEITER BEI …' }]);
	assert.deepEqual(g.moves, stored.slice(0, -1));
	assert.equal(g.reopened, undefined);
	const broken = fixture(A).replace('&#34;zug&#34;:&#34;start&#34;,&#34;text&#34;:&#34;S&#34;', '&#34;zug&#34;:&#34;ende&#34;,&#34;text&#34;:&#34;S&#34;');
	assert.notEqual(broken, fixture(A));
	assert.deepEqual(await loadStory(broken, 'de'), { errors: 'unreadable' });
});

test('438 AK5 the note names the lines and no internal name', async () => {
	const texts: string = '../../src/texts.js';
	const { reopenedText } = await import(texts) as { reopenedText: (lines: number[]) => string };
	const one = reopenedText([10]);
	assert.match(one, /^Line 10: /);
	assert.match(one, /still open/);
	const two = reopenedText([7, 12]);
	assert.match(two, /^Lines 7, 12: /);
	const { g } = await opened(B);
	assert.doesNotMatch(reopenedText(g.reopened!), /[A-Za-z]+_\d+/);
});

test('438 AK6 saved only on Save: the repaired state is unsaved, once saved it opens without a note', async () => {
	const { g, stored } = await opened(A);
	assert.deepEqual(g.stored, stored);
	assert.equal(unsaved(g.moves, g.stored!, g.language, g.language), true);
	const again = await loadStory((await fileXml(g.moves, g.language))!, 'de');
	assert.ok(!('errors' in again));
	assert.equal(again.reopened, undefined);
	assert.deepEqual(again.moves, g.moves);
	assert.equal(again.changed, false);
});

test('438 a readable file has no note', async () => {
	const g = await loadStory(fixture('legacy-working-file.bpmn'), 'de');
	assert.ok(!('errors' in g));
	assert.equal(g.reopened, undefined);
	assert.equal(g.stored, undefined);
});
