import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Move, TellOptions } from '../../src/core/index.js';
import { workbench, joinAll, joinableLines, lineActions, replay, loadStory, fileXml, textFrom, textMoves, insertAt } from '../../src/workbench.js';
import { sheetActions } from '../../src/phoneView.js';
import { menuGroups } from '../../src/lineMenu.js';

// Job 456: "From here on for all paths" in the line menu.
const start: Move = { move: 'start', text: 'Antrag geht ein', role: 'Amt' };
const task = (text: string): Move => ({ move: 'task', text, role: 'Amt' });
const end = (text: string): Move => ({ move: 'end', text });
const merge: Move = { move: 'merge' };
const check: Move = { move: 'decision', question: 'Vollständig?', yes: 'nein', no: 'ja' };
const EXAMPLE: Move[] = [start, task('Antrag prüfen'), check, task('Unterlagen anfordern'), task('Antrag bescheiden'), end('Erledigt'), { move: 'openPath' }];
const three: Move = { move: 'decision', question: 'Art?', yes: 'a', more: ['b'], no: 'c' };
const FULL: Move[] = [start, three, task('A'), task('B'), task('C'), merge, task('X'), merge, task('Y'), merge, task('D'), end('E')];
/** The level options as the story card builds them from view.sub. */
const optsOf = (sub: { name: string; trigger?: unknown } | undefined): TellOptions =>
	sub ? ({ inner: { name: sub.name, ...(sub.trigger ? { trigger: sub.trigger } : {}) } } as TellOptions) : {};

test('AK8 the menu offers it exactly where the core does, desktop and phone, in the structure group', () => {
	const lines = joinableLines(EXAMPLE, 'de');
	assert.deepEqual([...lines], [4, 5]);
	for (const [i, m] of EXAMPLE.entries()) {
		const has = lines.has(i);
		assert.equal(lineActions(m, i, false, false, has).includes('joinAll'), has, `line ${i}`);
		assert.equal(sheetActions(m, i, false, false, false, has).includes('joinAll'), has, `sheet ${i}`);
	}
	assert.ok(!lineActions(EXAMPLE[4], 4).includes('joinAll'), 'off by default');
	const groups = menuGroups([...lineActions(EXAMPLE[4], 4, false, false, true), 'asText']);
	assert.ok(groups[1].includes('joinAll') && !groups[0].includes('joinAll'));
});

test('AK8 one change on the main level, undo brings the story back', async () => {
	const w = workbench('de');
	assert.equal((await w.set(EXAMPLE)).ok, true);
	const r = joinAll(w.moves, 4, 'de');
	assert.ok('moves' in r, 'error' in r ? r.error : '');
	assert.equal(r.at, 6);
	assert.equal((await w.setLevel(r.moves)).ok, true);
	assert.deepEqual(w.view!.errors, []);
	assert.equal(w.history.length, 1);
	assert.equal((await w.undo()).ok, true);
	assert.deepEqual(w.moves, EXAMPLE);
});

test('AK8 on the level of a flow behind a step and of "at any time" only that flow changes', async () => {
	const behind: Move[] = [task('Lesen'), check, task('A'), task('B'), end('Gelesen'), { move: 'openPath' }];
	const flow: Move[] = [task('Stoppen'), check, task('S'), task('T'), end('Gestoppt'), { move: 'openPath' }];
	const any: Move = { move: 'anytime', text: 'Kunde zieht zurück', subtype: 'message', subprocess: flow };
	const story: Move[] = [start, { ...task('Klären'), subprocess: behind } as Move, end('Fertig'), any];
	for (const [level, inner] of [[1, behind], [3, flow]] as const) {
		const w = workbench('de');
		assert.equal((await w.set(story)).ok, true);
		assert.equal((await w.show(level)).ok, true);
		assert.deepEqual(w.view!.levelMoves, inner);
		const opts = optsOf(w.view!.sub);
		assert.ok(joinableLines(w.view!.levelMoves, 'de', opts).has(3));
		const r = joinAll(w.view!.levelMoves, 3, 'de', opts);
		assert.ok('moves' in r, 'error' in r ? r.error : '');
		assert.equal((await w.setLevel(r.moves)).ok, true);
		assert.deepEqual(w.view!.errors, []);
		assert.equal(w.level, level);
		assert.deepEqual(w.view!.levelMoves.map((m) => m.move), ['task', 'decision', 'task', 'merge', 'openPath', 'task', 'end']);
		const other = level === 1 ? 3 : 1;
		assert.deepEqual(w.moves[other], story[other], 'the other flow stays');
		assert.deepEqual(w.moves[0], start);
		assert.equal((await w.undo()).ok, true);
		assert.deepEqual(w.moves, story);
	}
});

for (const [name, story, i] of [['example', EXAMPLE, 4], ['three paths', FULL, 3]] as const) {
	test(`AK7 after joining (${name}): file and text give the same story`, async () => {
		const r = joinAll(story as Move[], i, 'de');
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

test('Risk: a long story offers the lines with one replay, quickly', () => {
	let moves: Move[] = [start];
	for (let n = 0; n < 30; n++) moves.push(task(`Schritt ${n}`));
	moves.push(end('Fertig'));
	for (let n = 0; n < 6; n++) {
		const r = insertAt(moves, 1 + n * 5, check, 'de');
		if ('moves' in r) moves = r.moves;
	}
	const t0 = performance.now();
	joinableLines(moves, 'de');
	assert.ok(performance.now() - t0 < 500, 'joinableLines takes < 0.5 s');
});
