import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Move } from '../../src/core/index.js';
import { workbench, swapPath, replay, loadStory, fileXml, textFrom, textMoves } from '../../src/workbench.js';
import { pathActions, pathKey } from '../../src/lineMenu.js';
import { sheetActions } from '../../src/phoneView.js';

// Job 455: "Move path up" / "Move path down" on the heading of a path.
const start: Move = { move: 'start', text: 'Rechnung geht ein', role: 'Buchhaltung' };
const task = (text: string): Move => ({ move: 'task', text, role: 'Buchhaltung' });
const merge: Move = { move: 'merge' };
const CHECK: Move = { move: 'decision', question: 'Betrag?', yes: 'klein', more: ['mittel'], no: 'groß' };
const STORY: Move[] = [start, CHECK, task('Sofort zahlen'), merge, task('Prüfen'), merge, task('Freigeben'), merge, task('Archivieren'), { move: 'end', text: 'Fertig' }];
const PARALLEL: Move[] = [start, { move: 'concurrent', branches: 3 }, task('Eins'), merge, task('Zwei'), merge, task('Drei'), merge, { move: 'end', text: 'Fertig' }];

test('AK7 the menu of a path heading: first and last path, the otherwise path, two paths of a check', () => {
	const at = (moves: Move[], n: number) => pathActions(moves, { at: 1, n });
	// Check with three paths: only the first two can move, and only with each other.
	assert.deepEqual(at(STORY, 0), ['pathDown']);
	assert.deepEqual(at(STORY, 1), ['pathUp']);
	assert.deepEqual(at(STORY, 2), []);
	// A check with two paths: nothing.
	const two: Move[] = [start, { move: 'decision', question: 'q', yes: 'ja', no: 'nein' }];
	assert.deepEqual(at(two, 0), []);
	assert.deepEqual(at(two, 1), []);
	// "In parallel" and "what comes first": every path, the last one up too.
	assert.deepEqual(at(PARALLEL, 0), ['pathDown']);
	assert.deepEqual(at(PARALLEL, 1), ['pathUp', 'pathDown']);
	assert.deepEqual(at(PARALLEL, 2), ['pathUp']);
	const first: Move[] = [start, { move: 'decision', subtype: 'first', yes: 'a', yesKind: 'message', no: 'b', noKind: 'time' }];
	assert.deepEqual(at(first, 0), ['pathDown']);
	assert.deepEqual(at(first, 1), ['pathUp']);
	// No heading, no branch: nothing.
	assert.deepEqual(pathActions(STORY, undefined), []);
	assert.deepEqual(pathActions(STORY, { at: 2, n: 0 }), []);
	assert.equal(pathKey({ at: 1, n: 2 }), 'p1.2');
	// The ⋯ of a move line is unchanged by it.
	assert.ok(!sheetActions(CHECK, 1, false, false).some((a) => String(a).startsWith('path')));
});

test('AK7 the headings shown carry their path; a swap is one change and undo brings the order back', async () => {
	const w = workbench('de');
	assert.equal((await w.set(STORY)).ok, true);
	const heads = w.view!.lines.filter((l) => l.path);
	assert.deepEqual(heads.map((l) => pathKey(l.path!)), ['p1.0', 'p1.1', 'p1.2']);
	const r = swapPath(w.moves, 1, 0, 'de');
	assert.ok('moves' in r, 'error' in r ? r.error : '');
	assert.equal((await w.setLevel(r.moves)).ok, true);
	assert.deepEqual(w.view!.errors, []);
	assert.deepEqual(w.moves[1], { ...CHECK, yes: 'mittel', more: ['klein'] });
	assert.equal(w.history.length, 1);
	assert.equal((await w.undo()).ok, true);
	assert.deepEqual(w.moves, STORY);
});

test('AK7 on the level of a flow behind a step only that flow changes', async () => {
	const behind: Move[] = [task('Lesen'), CHECK, task('A'), merge, task('B'), merge, merge, { move: 'end', text: 'Gelesen' }];
	const story: Move[] = [start, { ...task('Klären'), subprocess: behind } as Move, { move: 'end', text: 'Fertig' }];
	const w = workbench('de');
	assert.equal((await w.set(story)).ok, true);
	assert.equal((await w.show(1)).ok, true);
	const heads = w.view!.lines.filter((l) => l.path);
	assert.deepEqual(heads.map((l) => pathKey(l.path!)), ['p1.0', 'p1.1', 'p1.2']);
	assert.deepEqual(pathActions(w.view!.levelMoves, heads[1].path), ['pathUp']);
	const r = swapPath(w.view!.levelMoves, 1, 0, 'de', { inner: { name: 'Klären' } });
	assert.ok('moves' in r, 'error' in r ? r.error : '');
	assert.equal((await w.setLevel(r.moves)).ok, true);
	assert.deepEqual(w.view!.errors, []);
	assert.equal(w.level, 1);
	assert.deepEqual(w.moves[0], start);
	assert.deepEqual(w.moves[2], story[2]);
	assert.deepEqual((w.moves[1] as { subprocess: Move[] }).subprocess.slice(2, 6), [task('B'), merge, task('A'), merge]);
	assert.equal((await w.undo()).ok, true);
	assert.deepEqual(w.moves, story);
});

for (const [name, story, path] of [['check', STORY, 0], ['in parallel', PARALLEL, 1]] as const) {
	test(`AK8 after swapping (${name}): file and text give the same story`, async () => {
		const r = swapPath(story as Move[], 1, path, 'de');
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
