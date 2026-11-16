import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Move, TellOptions } from '../../src/core/index.js';
import { tell, moveOffered } from '../../src/core/index.js';
import { workbench, moveSteps, movableLines, moveChoices, lineActions, replay, loadStory, fileXml, textFrom, textMoves } from '../../src/workbench.js';
import { sheetActions } from '../../src/phoneView.js';
import { menuGroups } from '../../src/lineMenu.js';

// Job 457: "Move …" in the line menu.
const start: Move = { move: 'start', text: 'Antrag geht ein', role: 'Amt' };
const task = (text: string): Move => ({ move: 'task', text, role: 'Amt' });
const end = (text: string): Move => ({ move: 'end', text });
const merge: Move = { move: 'merge' };
const check: Move = { move: 'decision', question: 'Vollständig?', yes: 'ja', no: 'nein' };
const CHECK: Move[] = [start, task('A'), check, task('X'), merge, task('Y'), merge, task('Z'), end('Fertig')];
const BRANCH: Move[] = [start, task('A'), task('B'), check, task('X'), merge, task('Y'), merge, task('Z'), task('C'), end('Fertig')];
const optsOf = (sub: { name: string; trigger?: unknown } | undefined): TellOptions =>
	sub ? ({ inner: { name: sub.name, ...(sub.trigger ? { trigger: sub.trigger } : {}) } } as TellOptions) : {};

test('AK8 the menu offers "Move …" exactly where the core does, desktop and phone, in the structure group', () => {
	const exc: Move[] = [start, task('A'), task('B'), { move: 'exceptionPath', text: 'Fehler' }, end('Abbruch'), task('C'), end('Fertig')];
	for (const story of [CHECK, exc]) {
		const lines = movableLines(story, 'de');
		const s = tell(story, 'de');
		for (const [i, m] of story.entries()) {
			const has = lines.has(i);
			assert.equal(has, moveOffered(story, i, s), `line ${i}`);
			assert.equal(lineActions(m, i, false, false, false, has).includes('move'), has, `line ${i}`);
			assert.equal(sheetActions(m, i, false, false, false, false, has).includes('move'), has, `sheet ${i}`);
		}
	}
	assert.deepEqual([...movableLines(exc, 'de')], [1, 5], 'nicht der Schritt mit Ausnahme');
	assert.ok(!lineActions(CHECK[1], 1).includes('move'), 'off by default');
	const groups = menuGroups([...lineActions(CHECK[1], 1, false, false, false, true), 'asText']);
	assert.ok(groups[1].includes('move') && !groups[0].includes('move'));
});

test('AK8 the form choices: lines along and places, texts in the diagram language', () => {
	const c = moveChoices(CHECK, 1, 1, 'de');
	assert.deepEqual(c.ends.map((x) => x.e), [1, 2, 7, 8]);
	assert.ok(c.places.some((p) => p.path === 'nein'));
	assert.ok(c.places.some((p) => p.after === 3 && p.text?.includes('[X]')));
	// Two checks with paths of the same name: each place names its branch.
	const two: Move[] = [start, task('A'), check, task('X'), merge, task('Y'), merge, { move: 'decision', question: 'Bezahlt?', yes: 'ja', no: 'nein' }, task('V'), merge, task('W'), merge, end('Fertig')];
	const yes = moveChoices(two, 1, 1, 'de').places.filter((p) => p.path === 'ja');
	assert.equal(yes.length, 2);
	assert.deepEqual(yes.map((p) => p.at), [2, 7]);
	assert.notEqual(yes[0].text, yes[1].text);
	assert.ok(yes[1].text?.includes('Bezahlt'));
	const en = moveChoices(CHECK, 1, 1, 'en');
	assert.ok(en.ends[0].text.includes('[A]'));
});

test('AK8 one change on the main level, undo brings the story back', async () => {
	const w = workbench('de');
	assert.equal((await w.set(BRANCH)).ok, true);
	const pos = moveChoices(w.moves, 3, 3, 'de').places.find((p) => p.after === 9)!.pos;
	const r = moveSteps(w.moves, 3, 3, pos, 'de');
	assert.ok('moves' in r, 'error' in r ? r.error : '');
	assert.equal(r.at, 5);
	assert.equal((await w.setLevel(r.moves)).ok, true);
	assert.deepEqual(w.view!.errors, []);
	assert.equal(w.history.length, 1);
	assert.equal((await w.undo()).ok, true);
	assert.deepEqual(w.moves, BRANCH);
});

test('AK8 on the level of a flow behind a step and of "at any time" only that flow changes', async () => {
	const behind: Move[] = [task('Lesen'), task('Prüfen'), end('Gelesen')];
	const flow: Move[] = [task('Stoppen'), task('Melden'), end('Gestoppt')];
	const any: Move = { move: 'anytime', text: 'Kunde zieht zurück', subtype: 'message', subprocess: flow };
	const story: Move[] = [start, { ...task('Klären'), subprocess: behind } as Move, end('Fertig'), any];
	for (const [level, inner] of [[1, behind], [3, flow]] as const) {
		const w = workbench('de');
		assert.equal((await w.set(story)).ok, true);
		assert.equal((await w.show(level)).ok, true);
		assert.deepEqual(w.view!.levelMoves, inner);
		const opts = optsOf(w.view!.sub);
		assert.ok(movableLines(w.view!.levelMoves, 'de', opts).has(1));
		const at = moveChoices(w.view!.levelMoves, 1, 1, 'de', opts).places.find((p) => p.start);
		assert.ok(at, 'an den Anfang');
		const r = moveSteps(w.view!.levelMoves, 1, 1, at!.pos, 'de', opts);
		assert.ok('moves' in r, 'error' in r ? r.error : '');
		assert.equal((await w.setLevel(r.moves)).ok, true);
		assert.deepEqual(w.view!.errors, []);
		assert.deepEqual(w.view!.levelMoves, [inner[1], inner[0], inner[2]]);
		const other = level === 1 ? 3 : 1;
		assert.deepEqual(w.moves[other], story[other], 'the other flow stays');
		assert.equal(w.history.length, 1);
		assert.equal((await w.undo()).ok, true);
		assert.deepEqual(w.moves, story);
	}
});

for (const [name, story, i, after] of [['into a path', CHECK, 7, 3], ['a branch', BRANCH, 3, 9]] as const) {
	test(`AK7 after moving (${name}): file and text give the same story`, async () => {
		const pos = moveChoices(story as Move[], i, i, 'de').places.find((p) => p.after === after)!.pos;
		const r = moveSteps(story as Move[], i, i, pos, 'de');
		assert.ok('moves' in r, 'error' in r ? r.error : '');
		const xml = await fileXml(r.moves, 'de');
		const back = await loadStory(xml!, 'de');
		assert.ok('moves' in back);
		assert.deepEqual(back.moves, r.moves);
		const v = await replay(r.moves, 'de');
		const text = textFrom(v.storyText);
		const again = textMoves(text, r.moves, 'de');
		assert.deepEqual(again.errors, []);
		assert.equal(textFrom((await replay(again.moves, 'de')).storyText), text);
	});
}
