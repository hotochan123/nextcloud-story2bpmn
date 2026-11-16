import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Move } from '../../src/core/index.js';
import { read } from '../../src/core/index.js';
import {
	workbench, changeLine, replay, loadStory, fileXml, textFrom, textMoves, targetsUntil,
	fields, prefill, requiredEmpty, moveFromForm, switchBranch, branchMove, pathCount, BRANCH_KINDS,
} from '../../src/workbench.js';
import { formFor } from '../../src/lineMenu.js';

// Job 451: the kind of a branch switched in its edit form (checked, what comes first, in parallel).
const CHECK: Move = { move: 'decision', question: 'Betrag?', yes: 'klein', more: ['mittel'], no: 'groß' };
const STORY: Move[] = [
	{ move: 'start', text: 'Rechnung geht ein', role: 'Buchhaltung' },
	CHECK,
	{ move: 'task', text: 'Sofort zahlen', role: 'Buchhaltung' },
	{ move: 'merge' },
	{ move: 'task', text: 'Prüfen', role: 'Buchhaltung' },
	{ move: 'merge' },
	{ move: 'task', text: 'Freigeben', role: 'Chef' },
	{ move: 'merge' },
	{ move: 'task', text: 'Archivieren', role: 'Buchhaltung' },
	{ move: 'end', text: 'Fertig' },
];
const FIRST: Move = { move: 'decision', subtype: 'first', yes: 'klein', yesKind: 'message', more: ['mittel'], moreKinds: ['time'], no: 'groß', noKind: 'signal' };
const PARALLEL: Move = { move: 'concurrent', branches: 3 };

/** The form values of the edit form of move z, as MoveForm.vue opens them. */
const opened = (z: Move) => {
	const v = prefill(z.move, { ...z } as never, 'de');
	if (z.move === 'concurrent') v.subtype = 'concurrent';
	return v;
};
/** The form switched from kind `from` to kind `to`. */
const switched = (v: Record<string, string | undefined>, to: string, original = v) => switchBranch({ ...v, subtype: to }, v.subtype ?? '', 'de', original);

test('451 AK1 the edit form of a branch can switch its kind; other lines cannot', () => {
	assert.equal(formFor('edit', STORY, 1, 'de')!.switchable, true);
	const p = [STORY[0], PARALLEL, ...STORY.slice(2)];
	assert.equal(formFor('edit', p, 1, 'de')!.switchable, true);
	assert.equal(formFor('edit', STORY, 2, 'de')!.switchable, undefined);
	assert.equal(formFor('addPath', STORY, 1, 'de')!.switchable, undefined);
	assert.deepEqual(BRANCH_KINDS, ['', 'first', 'concurrent']);
	const f = fields('decision', opened(CHECK), undefined, false, undefined, true);
	assert.deepEqual([f[0].key, f[0].values], ['subtype', ['', 'first', 'concurrent']]);
	assert.deepEqual(fields('concurrent', opened(PARALLEL), undefined, false, undefined, true).map((x) => [x.key, x.values]), [['subtype', ['', 'first', 'concurrent']]]);
	// A new decision keeps its two kinds.
	assert.deepEqual(fields('decision', prefill('decision', {}, 'de'))[0].values, ['', 'first']);
	assert.equal(branchMove('decision', { subtype: 'concurrent' }, true), 'concurrent');
	assert.equal(branchMove('concurrent', { subtype: 'first' }, true), 'decision');
	assert.equal(branchMove('decision', { subtype: 'concurrent' }, false), 'decision');
});

test('451 AK2 every switch keeps the number of paths; names stay where both kinds have them', () => {
	const check = opened(CHECK);
	// checked → what comes first: names stay, the kinds are empty and required, the question goes.
	const f = switched(check, 'first');
	assert.equal(pathCount('decision', f), 3);
	assert.deepEqual([f.yes, f.more0, f.no, f.yesKind, f.more0Kind, f.noKind, 'question' in f], ['klein', 'mittel', 'groß', '', '', '', false]);
	assert.deepEqual(requiredEmpty('decision', f), ['yesKind', 'more0Kind', 'noKind']);
	assert.deepEqual(fields('decision', f).find((x) => x.key === 'yesKind')!.values![0], '');
	// checked → in parallel: three branches, nothing to fill in.
	const p = switched(check, 'concurrent');
	assert.deepEqual(p, { subtype: 'concurrent', branches: '3' });
	assert.equal(branchMove('decision', p, true), 'concurrent');
	assert.deepEqual(moveFromForm('decision', p), PARALLEL);
	assert.deepEqual(requiredEmpty('concurrent', p), []);
	// back to the kind it opened with: the values it opened with.
	assert.deepEqual(switched(f, '', check), check);
	assert.deepEqual(switched(p, '', check), check);
	// what comes first → checked: names stay, the kinds go, the question is required.
	const first = opened(FIRST);
	const c = switched(first, '');
	assert.deepEqual([c.yes, c.more0, c.no, c.question, 'yesKind' in c, 'more0Kind' in c], ['klein', 'mittel', 'groß', '', false, false]);
	assert.deepEqual(requiredEmpty('decision', c), ['question']);
	// what comes first → in parallel.
	assert.deepEqual(switched(first, 'concurrent'), { subtype: 'concurrent', branches: '3' });
	// in parallel → checked: yes / no as for a new check, the path between and the question to fill in.
	const par = opened(PARALLEL);
	const pc = switched(par, '');
	assert.deepEqual([pc.yes, pc.more0, pc.no, pc.question], ['ja', '', 'nein', '']);
	assert.deepEqual(requiredEmpty('decision', pc), ['question', 'more0']);
	// in parallel → what comes first: every name and kind to fill in.
	const pf = switched(par, 'first');
	assert.equal(pathCount('decision', pf), 3);
	assert.deepEqual(requiredEmpty('decision', pf), ['yes', 'yesKind', 'more0', 'more0Kind', 'no', 'noKind']);
	// Two branches give a check with two paths.
	assert.deepEqual(switched(opened({ move: 'concurrent' }), ''), { subtype: '', question: '', yes: 'ja', no: 'nein' });
	// From a check to in parallel with two paths: no branch count.
	assert.deepEqual(switched(opened({ move: 'decision', question: 'Q', yes: 'a', no: 'b' }), 'concurrent'), { subtype: 'concurrent' });
});

/** Moves on the three paths, in their order, from the replay (every path keeps what is told on it). */
const told = (moves: Move[]) => moves.filter((m) => m.move === 'task').map((m) => (m as { text: string }).text);

for (const [name, move] of [['in parallel', PARALLEL], ['what comes first', FIRST]] as const) {
	test(`451 AK3 AK6 checked → ${name}: one change, the paths keep their steps, undo brings the check back, file and text read back`, async () => {
		const w = workbench('de');
		assert.equal((await w.set(STORY)).ok, true);
		const r = changeLine(w.moves, 1, move, 'de');
		assert.ok('moves' in r, 'error' in r ? r.error : '');
		assert.equal((await w.set(r.moves)).ok, true);
		assert.deepEqual(w.view!.errors, []);
		assert.deepEqual(w.moves[1], move);
		assert.deepEqual(told(w.moves), told(STORY));
		assert.equal(w.history.length, 1);
		// File and text give the same story.
		const xml = await fileXml(w.moves, 'de');
		const back = await loadStory(xml!, 'de');
		assert.ok('moves' in back);
		assert.deepEqual(back.moves, w.moves);
		const text = textFrom(w.view!.storyText);
		const again = textMoves(text, w.moves, 'de');
		assert.deepEqual(again.errors, []);
		assert.equal(textFrom((await replay(again.moves, 'de')).storyText), text);
		// Undo: the check with its names.
		assert.equal((await w.undo()).ok, true);
		assert.deepEqual(w.moves, STORY);
	});
}

test('451 AK3 in parallel → checked and what comes first → in parallel also work', async () => {
	const p = changeLine(STORY, 1, PARALLEL, 'de');
	assert.ok('moves' in p);
	const c = changeLine(p.moves, 1, { move: 'decision', question: 'Q', yes: 'ja', more: ['m'], no: 'nein' }, 'de');
	assert.ok('moves' in c);
	assert.deepEqual((await replay(c.moves, 'de')).errors, []);
	const f = changeLine(STORY, 1, FIRST, 'de');
	assert.ok('moves' in f);
	const fp = changeLine(f.moves, 1, PARALLEL, 'de');
	assert.ok('moves' in fp);
	assert.deepEqual((await replay(fp.moves, 'de')).errors, []);
	assert.deepEqual(told(fp.moves), told(STORY));
});

test('451 AK3 on a subprocess level only that flow changes, undo brings it back', async () => {
	const flow: Move[] = [
		{ move: 'decision', question: 'Vollständig?', yes: 'ja', no: 'nein' },
		{ move: 'task', text: 'Ablegen', role: 'Buchhaltung' }, { move: 'merge' },
		{ move: 'task', text: 'Nachfragen', role: 'Buchhaltung' }, { move: 'merge' },
		{ move: 'end', text: 'Gut' },
	];
	const all: Move[] = [STORY[0], { move: 'task', text: 'Prüfen', role: 'Buchhaltung', subprocess: flow } as Move, { move: 'end', text: 'Bezahlt' }];
	const w = workbench('de');
	assert.equal((await w.set(all)).ok, true);
	assert.equal((await w.show(1)).ok, true);
	const r = changeLine(w.view!.levelMoves, 0, { move: 'concurrent' }, 'de', { inner: { name: w.view!.sub!.name } });
	assert.ok('moves' in r, 'error' in r ? r.error : '');
	assert.equal((await w.setLevel(r.moves)).ok, true);
	assert.deepEqual(w.view!.errors, []);
	assert.deepEqual((w.moves[1] as { subprocess: Move[] }).subprocess, [{ move: 'concurrent' }, ...flow.slice(1)]);
	assert.deepEqual(w.moves[0], all[0]);
	assert.equal((await w.undo()).ok, true);
	assert.deepEqual(w.moves, all);
});

test('451 AK4 switching the kind and adding a path at once is refused while something follows; on the last line it works', () => {
	const r = changeLine(STORY, 1, { move: 'concurrent', branches: 4 }, 'de');
	assert.ok('error' in r);
	assert.match(r.error, /Art/);
	// Same kind: adding stays as before.
	assert.ok('moves' in changeLine(STORY, 1, { ...CHECK, more: ['mittel', 'neu'] } as Move, 'de'));
	// Nothing told after it: the branch is replaced as it is.
	const last = changeLine([STORY[0], CHECK], 1, { move: 'concurrent', branches: 4 }, 'de');
	assert.deepEqual(last, { moves: [STORY[0], { move: 'concurrent', branches: 4 }] });
});

test('451 AK5 "continue at" out of a path that cannot continue there as in parallel: refused, the story stays', async () => {
	const base: Move[] = [
		{ move: 'start', text: 'Rechnung geht ein', role: 'Buchhaltung' },
		{ move: 'task', text: 'Rechnung prüfen', role: 'Buchhaltung' },
		{ move: 'decision', question: 'Fehler?', yes: 'ja', no: 'nein' },
	];
	const target = targetsUntil([...base, { move: 'task', text: 'Nachfragen', role: 'Buchhaltung' }], 4, 'de').find((z) => z.name === 'Rechnung prüfen');
	assert.ok(target);
	const moves: Move[] = [...base, { move: 'task', text: 'Nachfragen', role: 'Buchhaltung' }, { move: 'goTo', target: target!.id }, { move: 'end', text: 'Fertig' }];
	const w = workbench('de');
	assert.equal((await w.set(moves)).ok, true, 'the loop out of the check works');
	const r = changeLine(w.moves, 2, { move: 'concurrent' }, 'de');
	const res = 'moves' in r ? await w.set(r.moves) : { ok: false, rejected: [r.error] };
	assert.equal(res.ok, false);
	assert.ok('rejected' in res && res.rejected.length > 0);
	assert.deepEqual(w.moves, moves);
	assert.equal(w.history.length, 0);
});

test('451 risk: what comes first when a path begins with a branch or "continue at" gives no crash', async () => {
	const moves: Move[] = [
		STORY[0],
		{ move: 'decision', question: 'Q', yes: 'a', no: 'b' },
		{ move: 'decision', question: 'Q2', yes: 'c', no: 'd' },
		{ move: 'merge' }, { move: 'merge' }, { move: 'merge' },
		{ move: 'end', text: 'Fertig' },
	];
	const r = changeLine(moves, 1, { move: 'decision', subtype: 'first', yes: 'a', yesKind: 'message', no: 'b', noKind: 'time' }, 'de');
	assert.ok('moves' in r);
	const v = await replay(r.moves, 'de');
	assert.ok(Array.isArray(v.errors));
	// Read back from the text: no crash.
	if (!v.errors.length) assert.deepEqual(read(textFrom(v.storyText), 'de').errors, []);
});
