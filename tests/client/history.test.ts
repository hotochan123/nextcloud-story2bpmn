import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Move } from '../../src/core/index.js';
import { replay, workbench, carry } from '../../src/workbench.js';

// Job 409: undo with a reliable history - each entry keeps its level, the history survives a new workbench.
const flow = (name: string): Move[] => [{ move: 'task', text: name, role: 'Prüfer' }, { move: 'end', text: name + ' fertig' }];
const story = (a = 'A', b = 'B', end = 'Erledigt'): Move[] => [
	{ move: 'start', text: 'Antrag geht ein', role: 'Vertrieb' },
	{ move: 'task', text: 'Teil A', role: 'Vertrieb', subprocess: flow(a) },
	{ move: 'task', text: 'Teil B', role: 'Vertrieb', subprocess: flow(b) },
	{ move: 'end', text: end },
];
const anyFlow: Move[] = [{ move: 'task', text: 'Prüfung abbrechen', role: 'Prüfer' }, { move: 'end', text: 'Abgebrochen' }];
const withAny = (inner: Move[]): Move[] => [
	{ move: 'start', text: 'Antrag geht ein', role: 'Vertrieb' },
	{ move: 'task', text: 'Antrag prüfen', role: 'Vertrieb', subprocess: [...flow('U'), { move: 'anytime', text: 'Kunde zieht zurück', subtype: 'message', keepsRunning: '', subprocess: inner } as Move] },
	{ move: 'end', text: 'Erledigt' },
];

test('409 AK2 undo of a change on the main level shows the main level', async () => {
	const w = workbench('de');
	await w.set(story());
	await w.set(story('A', 'B', 'Fertig'));
	await w.show(1);
	assert.equal(w.view!.level, 1);
	assert.deepEqual(await w.undo(), { ok: true });
	assert.deepEqual(w.moves, story());
	assert.equal(w.view!.level, undefined, 'back on the level of the change');
	assert.equal(w.canUndo, false);
});

test('409 AK2 undo of a change in subprocess A, made while B is shown, goes to A', async () => {
	const w = workbench('de');
	await w.set(story());
	await w.show(1);
	await w.setLevel(flow('A2'));
	assert.deepEqual(w.moves, story('A2'));
	await w.show(2);
	assert.deepEqual(await w.undo(), { ok: true });
	assert.deepEqual(w.moves, story());
	assert.equal(w.view!.level, 1);
	assert.equal(w.view!.sub?.name, 'Teil A');
});

test('409 AK2 undo of a change in the flow at any time goes back into that flow', async () => {
	const w = workbench('de');
	await w.set(withAny(anyFlow.slice(0, 1)));
	await w.show(1, 2);
	await w.setLevel(anyFlow);
	await w.show();
	assert.deepEqual(await w.undo(), { ok: true });
	assert.deepEqual(w.moves, withAny(anyFlow.slice(0, 1)));
	assert.equal(w.view!.level, 1);
	assert.equal(w.view!.any, 2);
});

test('409 AK3 the history survives a language change; undo replays in the new language', async () => {
	const w = workbench('de');
	await w.set(story());
	await w.set(story('A2'));
	await w.set(story('A2', 'B2'));
	const en = await carry(w, w.moves, 'en');
	assert.ok(en);
	assert.equal(en.language, 'en');
	assert.equal(en.canUndo, true);
	assert.equal(en.history.length, 2, 'the language change itself is no entry');
	await en.undo();
	await en.undo();
	assert.deepEqual(en.moves, story());
	assert.equal(en.canUndo, false);
	assert.deepEqual(en.view!.lines.map((l) => l.text), (await replay(story(), 'en')).lines.map((l) => l.text));
	assert.notDeepEqual(en.view!.lines.map((l) => l.text), (await replay(story(), 'de')).lines.map((l) => l.text));
});

test('409 AK4 a restored state or an accepted proposal can be undone, on the level shown before', async () => {
	const w = workbench('de');
	await w.set(story());
	await w.show(2);
	const next = await carry(w, story('A', 'B', 'Angenommen'), 'de');
	assert.ok(next);
	assert.equal(next.canUndo, true);
	assert.deepEqual(await next.undo(), { ok: true });
	assert.deepEqual(next.moves, story());
	assert.equal(next.view!.level, 2);
	// The same state: no entry.
	const same = await carry(w, story(), 'de');
	assert.equal(same!.canUndo, false);
	// Opening, New, the example: nothing to carry.
	assert.equal((await carry(undefined, story(), 'de'))!.canUndo, false);
});

test('409 risk: the level of an entry belongs to its own state, not to the positions of the newer one', async () => {
	const w = workbench('de');
	await w.set(story());
	await w.show(2);
	// The newer state has a move more in front: index 2 is now "Teil A".
	const shifted: Move[] = [story()[0], { move: 'task', text: 'Vorab', role: 'Vertrieb' }, ...story().slice(1)];
	const next = await carry(w, shifted, 'de');
	await next!.show(2);
	assert.equal(next!.view!.sub?.name, 'Teil A');
	await next!.undo();
	assert.deepEqual(next!.moves, story());
	assert.equal(next!.view!.sub?.name, 'Teil B');
});

test('409 risk: undo tapped twice while replaying takes back one change, the history stays whole', async () => {
	const w = workbench('de');
	await w.set(story());
	await w.set(story('A2'));
	await w.set(story('A2', 'B2'));
	const [a, b] = await Promise.all([w.undo(), w.undo()]);
	assert.deepEqual(a, { ok: false, stale: true });
	assert.deepEqual(b, { ok: true });
	assert.deepEqual(w.moves, story('A2'));
	assert.equal(w.history.length, 1);
	await w.undo();
	assert.deepEqual(w.moves, story());
});

test('409 a failed replay carries nothing: the old workbench and its history stay', async () => {
	const w = workbench('de');
	await w.set(story());
	await w.set(story('A2'));
	const bad = await carry(w, [{ move: 'merge' }], 'de');
	assert.equal(bad, undefined);
	assert.equal(w.history.length, 1);
});
