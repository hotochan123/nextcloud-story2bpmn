// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
// Job 439: lines the core refuses are left out on opening (dropRefused), named with moveLine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tell, dropRefused, moveLine, MAX_DROP_ROUNDS, type Move } from '../../src/core/index.js';

const T = (text: string, more: Partial<Extract<Move, { move: 'task' }>> = {}): Move => ({ move: 'task', text, role: 'Team', ...more });
const S: Move = { move: 'start', text: 'Antrag', role: 'Team' };
const drop = (moves: Move[]) => dropRefused(moves, 'de', tell(moves, 'de').ir);
const ok = (moves: Move[]) => {
	const r = drop(moves);
	if ('error' in r) throw new Error(r.error);
	assert.deepEqual(tell(r.moves, 'de').errors, []);
	return r;
};

test('439 refused: the moves where an error came up, missing without errors', () => {
	assert.equal(tell([S, T('A'), { move: 'end', text: 'E' }], 'de').refused, undefined);
	assert.deepEqual(tell([S, T('A'), { move: 'merge' }, T('B'), { move: 'merge' }], 'de').refused, [2, 4]);
	assert.deepEqual(tell([S, { move: 'end', text: 'E' }, { move: 'end', text: 'X' }], 'de').refused, [2]);
});

test('439 AK4 an end after the end, a merge without a branch, a switch to a path that is not there are dropped', () => {
	const done: Move[] = [S, T('A'), { move: 'end', text: 'Fertig' }];
	assert.deepEqual(ok([...done, { move: 'end', text: 'X' }]), { moves: done, dropped: [3] });
	assert.deepEqual(ok([S, T('A'), { move: 'merge' }, T('B'), { move: 'end', text: 'E' }]), { moves: [S, T('A'), T('B'), { move: 'end', text: 'E' }], dropped: [2] });
	assert.deepEqual(ok([S, { move: 'switchTo', to: 3 }, T('A'), { move: 'end', text: 'E' }]).dropped, [1]);
});

test('439 AK4 once the story has ended every later line goes, in one round', () => {
	const r = ok([S, { move: 'end', text: 'Fertig' }, T('A'), { move: 'decision', question: 'Q', yes: 'ja', no: 'nein' }, { move: 'end', text: 'X' }]);
	assert.deepEqual(r.dropped, [2, 3, 4]);
	assert.equal(tell(r.moves, 'de').done, true);
});

test('439 AK4 refused: the trigger, a subprocess, nothing to drop', () => {
	assert.ok('error' in drop([{ move: 'end', text: 'E' }, T('A')]));
	assert.ok('error' in drop([S, T('Teil', { subprocess: [{ move: 'merge' }] }), { move: 'end', text: 'E' }]));
	assert.ok('error' in drop([S, T('A'), { move: 'end', text: 'E' }]));
	assert.ok(MAX_DROP_ROUNDS >= 1);
});

test('439 AK4 lines after the end go too, though the core names only its first error', () => {
	// After the refused merges the core no longer says "already ended" for X; no path is open for it all the same.
	const r = ok([S, T('A'), { move: 'merge' }, { move: 'merge' }, T('B'), { move: 'end', text: 'E' }, { move: 'end', text: 'X' }]);
	assert.deepEqual(r.dropped, [2, 3, 6]);
});

test('439 a "continue at" keeps its step when a line before its target is left out', () => {
	// In the diagram of the file B has the fourth step ID (an extra step took one); replayed now it has the third.
	const moves: Move[] = [S, T('A'), { move: 'merge' }, T('B'), { move: 'decision', question: 'Nochmal', yes: 'ja', no: 'nein' }, { move: 'goTo', target: 'Schritt_4' }, { move: 'end', text: 'E' }];
	const file = tell([S, T('A'), T('Extra'), T('B')], 'de').ir;
	assert.equal(file.nodes.find((n) => n.id === 'Schritt_4')?.name, 'B');
	const r = dropRefused(moves, 'de', file);
	assert.ok(!('error' in r));
	assert.deepEqual(r.dropped, [2]);
	const s = tell(r.moves, 'de');
	assert.deepEqual(s.errors, []);
	const to = (r.moves[4] as Extract<Move, { move: 'goTo' }>).target;
	assert.equal(s.ir.nodes.find((n) => n.id === to)?.name, 'B');
});

test('439 AK5 moveLine says what tell() writes for the line, in German and English', () => {
	for (const language of ['de', 'en'] as const) {
		const moves: Move[] = [
			S,
			T('Prüfen', { system: 'SAP', documentName: 'Antrag, Beleg', deadline: '3 Tage' }),
			T('Buchen', { each: 'Position', eachOrder: 'parallel' }),
			{ move: 'wait', text: '2 Tage', subtype: 'time' },
			{ move: 'wait', text: 'Antwort', subtype: 'message' },
			{ move: 'sendSignal', text: 'Alarm' },
			{ move: 'decision', question: 'Passt es?', yes: 'ja', no: 'nein' },
			{ move: 'concurrent' },
			T('A'),
			{ move: 'merge' },
			T('B'),
			{ move: 'merge' },
			{ move: 'end', text: 'Gut', subtype: 'message' },
			T('Nachfragen'),
			{ move: 'goTo', target: 'Schritt_2' },
		];
		const s = tell(moves, language);
		assert.deepEqual(s.errors, []);
		const named = (id: string) => s.ir.nodes.find((n) => n.id === id)?.name;
		let seen = 0;
		for (const l of s.storyText) {
			if (l.move === undefined || l.sub !== undefined || l.move === 0) continue;
			const z = moves[l.move];
			assert.equal(moveLine(z, language, z.move === 'goTo' ? named(z.target) : undefined), l.text, `move ${l.move}`);
			seen++;
		}
		assert.ok(seen >= 14);
	}
});

for (const every of [24, 2]) {
	test(`439 AK9 500 moves with every ${every}th a refused merge are opened quickly`, () => {
		const moves: Move[] = [S];
		for (let i = 1; moves.length < 499; i++) moves.push(i % every === 0 ? { move: 'merge' } : T(`S${i}`));
		moves.push({ move: 'end', text: 'E' });
		const merges = moves.filter((m) => m.move === 'merge').length;
		assert.ok(merges >= 20);
		const t0 = performance.now();
		const r = drop(moves);
		const ms = performance.now() - t0;
		assert.ok(!('error' in r));
		assert.equal(r.dropped.length, merges);
		assert.ok(ms < 3000, `took ${ms} ms`);
	});
}

test('439 review 1: 160 loops whose IDs shifted in the file open quickly, each "continue at" at its step', () => {
	// N loops "Ai; IF Qi: yes → CONTINUE AT [Ai]"; IDs taken from one replay that resolves targets by move.
	const N = 160;
	const story = (extra: boolean) => {
		const moves: Move[] = [S, ...(extra ? [T('Extra')] : [])];
		const goToMove: Record<number, number> = {};
		for (let i = 0; i < N; i++) {
			const at = moves.length;
			moves.push(T(`A${i}`), { move: 'decision', question: `Q${i}`, yes: 'ja', no: 'nein' }, { move: 'goTo', target: '' });
			goToMove[at + 2] = at;
		}
		moves.push({ move: 'end', text: 'E' });
		const s = tell(moves, 'de', { goToMove });
		return { moves: moves.map((z, j) => (z.move === 'goTo' ? { ...z, target: s.nodes[goToMove[j]]! } : z)), ir: s.ir };
	};
	const file = story(true);
	assert.deepEqual(tell(file.moves, 'de').errors, []);
	// The stored story lacks the extra step (its line is left out here as a refused merge): every ID is one off.
	const stored: Move[] = [S, { move: 'merge' }, ...file.moves.slice(2)];
	const t0 = performance.now();
	const r = dropRefused(stored, 'de', file.ir);
	const ms = performance.now() - t0;
	assert.ok(!('error' in r));
	assert.deepEqual(r.dropped, [1]);
	assert.ok(ms < 3000, `took ${ms} ms`);
	const s = tell(r.moves, 'de');
	assert.deepEqual(s.errors, []);
	const named = (id: string) => s.ir.nodes.find((n) => n.id === id)?.name;
	const jumps = r.moves.map((z, j) => [z, j] as const).filter(([z]) => z.move === 'goTo');
	assert.equal(jumps.length, N);
	for (const [z, j] of jumps) assert.equal(named((z as Extract<Move, { move: 'goTo' }>).target), (r.moves[j - 2] as Extract<Move, { move: 'task' }>).text);
});
