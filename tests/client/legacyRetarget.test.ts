// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
// Job 440: a "continue at" of a 0.1.0 file leads to its step again when main counts the node IDs differently.
// The fixtures were written by the core of tag v0.1.0 (tests/client/legacy010.ts, save010) from SHIFTED plus a
// "continue at" to the second step (stored with the ID that main gives the first step), to the first step
// (stored with an ID that is no step in main) and to the first end (its ID comes before the shift).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadStory, fileXml, unsaved, played } from '../../src/workbench.js';
import { tell, fromBpmn, type Move } from '../../src/core/index.js';
import { validateIR } from '../../src/core/validate.js';
import { missing010, core010, save010 } from './legacy010.js';
import { SHIFTED } from './legacyRetarget.moves.js';

const fixture = (name: string) => readFileSync(`tests/core/fixtures/legacy-0.1.0-shifted-goto-${name}.bpmn`, 'utf8');

/** Opens the xml; the name of the step its last "continue at" leads to now. */
const opened = async (xml: string) => {
	const stored = (await fromBpmn(xml)).ir.story as Move[];
	const g = await loadStory(xml, 'de');
	if ('errors' in g) throw new Error(`not opened: ${g.errors}`);
	const s = tell(g.moves, g.language);
	const last = g.moves.at(-1) as { move: string; target?: string };
	return { g, stored, s, at: s.ir.nodes.find((n) => n.id === last.target)?.name };
};

for (const [name, step] of [['freigeben', 'Freigeben'], ['pruefen', 'Prüfen']]) {
	test(`440 AK1/AK2 "continue at" ${step}: leads to ${step} again, line 17 named, not "changed outside"`, async () => {
		const { g, stored, s, at } = await opened(fixture(name));
		assert.equal(stored.length, 17);
		assert.equal(at, step);
		assert.deepEqual(g.retargeted, [17]);
		assert.equal(g.changed, false);
		assert.equal(g.dropped, undefined);
		assert.equal(g.reopened, undefined);
		assert.deepEqual(g.stored, stored);
		assert.deepEqual(g.moves.slice(0, -1), stored.slice(0, -1));
		assert.deepEqual(s.errors, []);
		assert.equal(s.done, true);
		assert.deepEqual(validateIR(s.ir), []);
	});
}

test('440 AK3 "continue at" an end before the shift: unchanged, no note, not "changed outside"', async () => {
	const { g, stored, at } = await opened(fixture('end'));
	assert.equal(at, 'Abgelehnt');
	assert.deepEqual(g.moves, stored);
	assert.equal(g.retargeted, undefined);
	assert.equal(g.stored, undefined);
	assert.equal(g.changed, false);
});

test('440 AK3 "continue at" each end (0.1.0 core): same end, no note, not "changed outside"', { skip: missing010(), timeout: 120_000 }, async () => {
	const core = await core010();
	const ends = core.tell(SHIFTED, 'de').targets.filter((x) => x.id.startsWith('Ende_'));
	assert.deepEqual(ends.map((x) => x.name), ['Abgelehnt', 'Info A', 'Info B']);
	for (const x of ends) {
		const { g, at } = await opened(await save010(core, [...SHIFTED, { move: 'goTo', target: x.id }]));
		assert.equal(at, x.name);
		assert.equal(g.retargeted, undefined);
		assert.equal(g.changed, false);
	}
});

test('440 AK4 the note names the lines, singular and plural, no internal name', async () => {
	const texts: string = '../../src/texts.js';
	const { retargetedText } = await import(texts) as { retargetedText: (lines: number[]) => string };
	assert.match(retargetedText([17]), /^Line 17: /);
	assert.match(retargetedText([3, 17]), /^Lines 3, 17: /);
	for (const s of [retargetedText([17]), retargetedText([3, 17])]) assert.doesNotMatch(s, /[A-Za-z]+_\d+/);
});

test('440 AK5 saved only on Save: unsaved before, once saved it opens without a note', async () => {
	const { g } = await opened(fixture('freigeben'));
	assert.equal(unsaved(g.moves, g.stored!, g.language, g.language), true);
	const again = await loadStory((await fileXml(g.moves, g.language))!, 'de');
	assert.ok(!('errors' in again));
	assert.equal(again.retargeted, undefined);
	assert.equal(again.stored, undefined);
	assert.deepEqual(again.moves, g.moves);
	assert.equal(again.changed, false);
});

test('440 AK7 changed in a modeler is still noticed: a step renamed, added or removed', async () => {
	const xml = (await played([...SHIFTED.slice(0, 13), { move: 'task', text: 'Freigeben', role: 'Chef' }, { move: 'end', text: 'Fertig' }] as Move[], 'de')).e.xml!;
	assert.equal(((await loadStory(xml, 'de')) as { changed: boolean }).changed, false);
	const renamed = xml.replace('name="Freigeben"', 'name="Gründlich freigeben"');
	assert.notEqual(renamed, xml);
	assert.equal(((await loadStory(renamed, 'de')) as { changed: boolean }).changed, true);
	// A task added (a copy of "Freigeben" under another ID and name) or removed (its shape gone) counts too.
	const task = /<bpmn:task id="(Schritt_\d+)" name="Freigeben"[^>]*>[\s\S]*?<\/bpmn:task>/.exec(xml)!;
	const added = xml.replace(task[0], task[0] + task[0].replace(task[1], 'Schritt_99').replace('name="Freigeben"', 'name="Archivieren"'));
	assert.equal(((await loadStory(added, 'de')) as { changed: boolean }).changed, true);
	const removed = xml.replace(task[0], '');
	assert.equal(((await loadStory(removed, 'de')) as { changed: boolean }).changed, true);
});

test('440 risk: a file of main whose "continue at" leads to the second of two steps "Prüfen" keeps it', async () => {
	const moves = [
		{ move: 'start', text: 'Antrag', role: 'Team' },
		{ move: 'task', text: 'Prüfen', role: 'Team' },
		{ move: 'task', text: 'Prüfen', role: 'Chef' },
		{ move: 'decision', question: 'Gut', yes: 'ja', no: 'nein' },
		{ move: 'end', text: 'Fertig' },
	] as Move[];
	const second = tell(moves, 'de').nodes[2]!;
	const story = [...moves, { move: 'goTo', target: second }] as Move[];
	const { g } = await opened((await played(story, 'de')).e.xml!);
	assert.deepEqual(g.moves, story);
	assert.equal(g.retargeted, undefined);
	assert.equal(g.changed, false);
});

// Job 441: the release review 0.2.0 (round 1, finding 1 of the second pass). The fixture was written by the core of
// tag v0.1.0 from the first 12 moves of SHIFTED, two waits, "what comes first" with a path named like the second wait,
// an end, a task and "continue at" that wait (line 14), stored with the ID that main gives the first wait.
const PAYMENT = [
	...SHIFTED.slice(0, 12),
	{ move: 'wait', text: 'Unterlagen', subtype: 'message' },
	{ move: 'wait', text: 'Zahlung', subtype: 'message' },
	{ move: 'decision', subtype: 'first', yes: 'Zahlung', no: '14 Tage', yesKind: 'message', noKind: 'time' },
	{ move: 'end', text: 'Bezahlt' },
	{ move: 'task', text: 'Mahnen', role: 'Buchhaltung' },
] as Move[];

test('441 AK1 "continue at" a wait named like a path of "what comes first": leads to that wait again, line 18 named', async () => {
	const { g, stored, s, at } = await opened(fixture('zahlung'));
	assert.deepEqual(stored.slice(0, -1), PAYMENT);
	assert.equal((stored.at(-1) as { target?: string }).target, 'Warten_10');
	assert.equal(at, 'Zahlung');
	assert.equal((g.moves.at(-1) as { target?: string }).target, s.nodes[13]);
	assert.deepEqual(g.retargeted, [18]);
	assert.equal(g.changed, false);
	assert.equal(g.dropped, undefined);
	assert.equal(g.reopened, undefined);
	assert.deepEqual(s.errors, []);
	assert.equal(s.done, true);
	assert.deepEqual(validateIR(s.ir), []);
});

test('441 AK3 the same story told by main opens unchanged, without a note', async () => {
	const story = [...PAYMENT, { move: 'goTo', target: tell(PAYMENT, 'de').nodes[13]! }] as Move[];
	const { g, at } = await opened((await played(story, 'de')).e.xml!);
	assert.equal(at, 'Zahlung');
	assert.deepEqual(g.moves, story);
	assert.equal(g.retargeted, undefined);
	assert.equal(g.changed, false);
});
