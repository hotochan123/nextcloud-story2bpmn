import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Move } from '../../src/core/index.js';
import { sameMoves } from '../../src/core/index.js';
import { roleUses, renameRole, roleChange, workbench, changeLine, atLevel, replay, textFrom, textMoves } from '../../src/workbench.js';

// Job 454: rename a role everywhere from the edit form of a step (or merge it into another one).
const anyFlow: Move[] = [{ move: 'task', text: 'Abbruch melden', role: 'Team A' }, { move: 'end', text: 'Abgebrochen' }];
const story = (): Move[] => [
	{ move: 'start', text: 'Antrag geht ein', role: 'Team A' },
	{ move: 'task', text: 'Antrag prüfen', role: 'team a' },
	{ move: 'task', text: 'Antrag freigeben', role: 'Team B', subprocess: [{ move: 'task', text: 'Unterlagen sichten', role: ' Team A ' }, { move: 'sendSignal', text: 'Freigabe erteilt' }, { move: 'end', text: 'Gesichtet' }] },
	{ move: 'end', text: 'Erledigt' },
];

test('454 AK1 roleUses counts the roles of the whole story, case ignored, subprocesses included', () => {
	const u = roleUses(story());
	assert.deepEqual(u.get('team a'), { name: 'Team A', count: 3 });
	assert.deepEqual(u.get('team b'), { name: 'Team B', count: 1 });
	assert.equal(u.size, 2, 'a signal without a role of its own counts for none');
});

test('454 AK2 renameRole renames every move of the role, also inside a subprocess and a flow at any time', () => {
	const withAny: Move[] = [...story().slice(0, 3), { move: 'anytime', text: 'Kunde zieht zurück', subtype: 'message', keepsRunning: '', subprocess: anyFlow } as Move, { move: 'end', text: 'Erledigt' }];
	const before = structuredClone(withAny);
	const out = renameRole(withAny, 'Team A', 'Kasse');
	assert.deepEqual(withAny, before, 'input unchanged');
	assert.notEqual(out, withAny);
	const r = (z: Move) => (z as { role?: string }).role;
	assert.equal(r(out[0]), 'Kasse');
	assert.equal(r(out[1]), 'Kasse');
	assert.equal(r(out[2]), 'Team B');
	const sub = (out[2] as { subprocess: Move[] }).subprocess;
	assert.equal(r(sub[0]), 'Kasse');
	assert.deepEqual(sub[1], { move: 'sendSignal', text: 'Freigabe erteilt' });
	assert.equal(r((out[3] as { subprocess: Move[] }).subprocess[0]), 'Kasse');
	assert.equal((out[0] as { text: string }).text, 'Antrag geht ein');
});

test('454 AK3 roleChange asks only when the role changed and is on two moves or more', () => {
	const u = roleUses(story());
	const task = (role: string): Move => ({ move: 'task', text: 'Antrag prüfen', role });
	assert.equal(roleChange({ role: 'Team A' }, task('Team A'), u), null, 'unchanged');
	assert.equal(roleChange({ role: 'Team B' }, task('Kasse'), u), null, 'the old role is on one move only');
	assert.deepEqual(roleChange({ role: 'Team A' }, task('Kasse'), u), { from: 'Team A', to: 'Kasse', count: 3, merge: null });
	assert.deepEqual(roleChange({ role: 'Team A' }, task('team b'), u), { from: 'Team A', to: 'team b', count: 3, merge: 'Team B' });
	assert.deepEqual(roleChange({ role: 'team a' }, task('Team A'), u), { from: 'team a', to: 'Team A', count: 3, merge: null }, 'spelling only');
	assert.equal(roleChange({ role: 'Team A' }, { move: 'end', text: 'Erledigt' }, u), null, 'no role field');
	assert.equal(roleChange({}, task('Kasse'), u), null, 'no role before');
});

const plain = (): Move[] => [
	{ move: 'start', text: 'Antrag geht ein', role: 'Team A' },
	{ move: 'task', text: 'Antrag prüfen', role: 'Team A' },
	{ move: 'task', text: 'Antrag freigeben', role: 'Team B' },
	{ move: 'end', text: 'Erledigt' },
];

test('454 AK4 everywhere: merging Team A into Team B leaves one lane, undo brings both back', async () => {
	const w = workbench('de');
	await w.set(plain());
	assert.equal(w.view!.lanes, 2);
	const r = changeLine(w.moves, 1, { move: 'task', text: 'Antrag prüfen', role: 'Team B' }, 'de');
	assert.ok(!('error' in r));
	assert.deepEqual(await w.set(renameRole(atLevel(w.moves, w.level, r.moves, w.any), 'Team A', 'Team B')), { ok: true });
	assert.equal(w.view!.lanes, 1);
	assert.ok(!w.view!.storyText.some((l) => l.text.includes('Team A')));
	assert.deepEqual(await w.undo(), { ok: true });
	assert.equal(w.view!.lanes, 2);
	assert.ok(sameMoves(w.moves, plain()));
});

test('454 AK4 everywhere from a subprocess level renames the role in the main flow too, one undo', async () => {
	const w = workbench('de');
	await w.set(story());
	await w.show(2);
	const level = w.view!.levelMoves;
	const r = changeLine(level, 0, { move: 'task', text: 'Unterlagen sichten', role: 'Kasse' }, 'de', { inner: { name: 'Antrag freigeben' } });
	assert.ok(!('error' in r));
	assert.deepEqual(await w.set(renameRole(atLevel(w.moves, w.level, r.moves, w.any), 'Team A', 'Kasse')), { ok: true });
	assert.equal(w.view!.level, 2, 'the level shown stays');
	assert.deepEqual(roleUses(w.moves).get('kasse')?.count, 3);
	assert.equal(roleUses(w.moves).get('team a'), undefined);
	await w.undo();
	assert.ok(sameMoves(w.moves, story()));
	assert.equal(w.view!.level, 2);
});

test('454 risk: a renamed role with an umlaut reads back from the text as the same moves', async () => {
	const moves = renameRole(plain(), 'Team A', 'Prüfstelle Ü');
	const v = await replay(moves, 'de');
	const back = textMoves(textFrom(v.storyText), moves, 'de');
	assert.deepEqual(back.errors, []);
	const roles = (list: Move[]) => list.map((z) => (z as { role?: string }).role);
	assert.deepEqual(roles(back.moves), roles(moves));
	assert.deepEqual(roles(back.moves).slice(0, 2), ["Prüfstelle Ü", "Prüfstelle Ü"]);
});

test('454 risk: merging keeps a "continue at" in the merged lane valid', async () => {
	const moves: Move[] = [
		{ move: 'start', text: 'Antrag geht ein', role: 'Team A' },
		{ move: 'task', text: 'Antrag prüfen', role: 'Team A' },
		{ move: 'decision', question: 'Vollständig', yes: 'ja', no: 'nein' } as Move,
		{ move: 'task', text: 'Antrag freigeben', role: 'Team B' },
		{ move: 'end', text: 'Erledigt' },
		{ move: 'task', text: 'Nachfordern', role: 'Team B' },
	];
	const v = await replay(moves, 'de');
	const target = v.targets.find((t) => t.name === 'Antrag prüfen');
	assert.ok(target);
	const all = [...moves, { move: 'goTo', target: target.id } as Move];
	const merged = renameRole(all, 'Team A', 'Team B');
	const after = await replay(merged, 'de');
	assert.deepEqual(after.errors, []);
	assert.equal(after.lanes, 1);
	assert.equal(after.done, true);
});
