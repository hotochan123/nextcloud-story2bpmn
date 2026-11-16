// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
// Job 436: crafted story text and huge stories do not stall the page (linear patterns, limits).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tell, Move, countMoves, MAX_STORY_MOVES } from '../../src/core/story.js';
import { read, MAX_LINE, MAX_LINES } from '../../src/core/readBack.js';

/** Milliseconds `f` takes. */
const timed = (f: () => unknown): number => {
	const t0 = performance.now();
	f();
	return performance.now() - t0;
};

test('436 AK1 the documents list of a task line reads in linear time (40 documents and a stray end)', () => {
	const line = '[@a] soll [b] mit ' + '[+x], '.repeat(40) + '!';
	let r: ReturnType<typeof read> | undefined;
	const ms = timed(() => (r = read('ES BEGINNT: [Los] bei [@a].\n' + line)));
	assert.ok(ms < 100, `took ${ms} ms`);
	assert.equal(r!.errors.length, 1);
	// A well-formed list still reads.
	const ok = read('ES BEGINNT: [Los] bei [@a].\n[@a] soll [b] mit [+x], [+y].');
	assert.deepEqual(ok.errors, []);
	assert.equal((ok.moves[1] as Extract<Move, { move: 'task' }>).documentName, 'x, y');
});

test('436 AK2 each bracketed part stays fast on a crafted line of 450 characters', () => {
	const pad = (head: string, unit: string, tail: string) => head + unit.repeat(Math.floor((450 - head.length - tail.length) / unit.length)) + tail;
	const lines = [
		pad('ES BEGINNT: [', 'a] bei [@', '!'),
		pad('ODER ES BEGINNT: [', 'a] bei [@', '!'),
		pad('[@', 'a] soll [', '!'),
		pad('[@a] soll [b] in [#', 'x] in [#', '!'),
		pad('[@a] soll [b], Frist [!', 'x], Frist [!', '!'),
		pad('[@a] soll [b], FÜR JEDE [', 'x], FÜR JEDE [', '!'),
		pad('SIGNAL SENDEN [s] bei [@', 'x] bei [@', '!'),
		pad('JEDERZEIT mit Nachricht: [', 'x]: [', '!'),
		pad('TEILABLAUF [', 'x]: [', '!'),
		pad('', 'a soll ', '!'),
	];
	for (const line of lines) {
		assert.ok(line.length <= MAX_LINE);
		const ms = timed(() => read('ES BEGINNT: [Los] bei [@a].\n' + line));
		assert.ok(ms < 100, `${line.slice(0, 30)}… took ${ms} ms`);
	}
});

test('436 AK3 a line longer than 500 characters is refused with its line number, 500 pass the length check', () => {
	for (const [language, word] of [['de', 'zu lang'], ['en', 'too long']] as const) {
		const start = language === 'de' ? 'ES BEGINNT: [Los] bei [@a].' : 'IT STARTS: [Go] at [@a].';
		const end = language === 'de' ? 'ENDE: [x].' : 'END: [x].';
		const long = `[@a] ${language === 'de' ? 'soll' : 'shall'} [${'b'.repeat(MAX_LINE)}].`;
		const r = read(`${start}\n  ${long}\n${end}`, language);
		assert.equal(r.line, 2);
		assert.match(r.errors[0], new RegExp(word));
		const fits = `[@a] ${language === 'de' ? 'soll' : 'shall'} [${'b'.repeat(MAX_LINE - 20)}].`.padEnd(MAX_LINE, ' ').trimEnd();
		const ok = read(`${start}\n${'b'.repeat(0)}${fits}\n${end}`, language);
		assert.deepEqual(ok.errors, [], language);
		// Exactly 500 characters are not too long.
		const r500 = read(`${start}\n${'x'.repeat(MAX_LINE)}`, language);
		assert.doesNotMatch(r500.errors[0], new RegExp(word));
	}
});

test('436 AK4 a text of more than 1000 lines is refused at once', () => {
	const text = 'ES BEGINNT: [Los] bei [@a].\n' + Array.from({ length: MAX_LINES }, (_, i) => `[@a] soll [s${i}].`).join('\n\n');
	let r: ReturnType<typeof read> | undefined;
	const ms = timed(() => (r = read(text)));
	assert.ok(ms < 100, `took ${ms} ms`);
	assert.match(r!.errors[0], /Text ist zu lang \(höchstens 1000 Zeilen\)/);
	assert.match(read(text, 'en').errors[0], /text is too long/);
});

const tasks = (n: number): Move[] => Array.from({ length: n }, (_, i) => ({ move: 'task', text: `S${i}`, role: 'A' }) as Move);

test('436 AK5 tell refuses a story of more than 500 moves over all levels, 500 still replay', () => {
	assert.equal(MAX_STORY_MOVES, 500);
	const start: Move = { move: 'start', text: 'Los', role: 'A' } as Move;
	const sub: Move = { move: 'task', text: 'Mit Ablauf', role: 'A', subprocess: [{ move: 'task', text: 'innen', role: 'B' } as Move, ...tasks(9)] } as Move;
	// 1 + 489 + 1 (+10 inside) = 501
	const over = [start, ...tasks(489), sub];
	assert.equal(countMoves(over), 501);
	let g: ReturnType<typeof tell> | undefined;
	const ms = timed(() => (g = tell(over, 'de')));
	assert.ok(ms < 100, `took ${ms} ms`);
	assert.match(g!.errors[0], /mehr als 500 Züge/);
	assert.match(tell(over, 'en').errors[0], /more than 500 moves/);
	const fits = [start, ...tasks(499)];
	assert.equal(countMoves(fits), 500);
	assert.deepEqual(tell(fits, 'de').errors, []);
});

test('436 countMoves takes foreign data without throwing', () => {
	assert.equal(countMoves(undefined), 0);
	assert.equal(countMoves([null, 1, { subprocess: 'x' }, { subprocess: [{}] }]), 5);
});

test('436 Risk: a task name with square brackets is written without them, so the line reads back', () => {
	const moves = [{ move: 'start', text: 'Los', role: 'A' }, { move: 'task', text: 'Prüfen [neu]', role: 'A]', system: '[ERP]' }] as Move[];
	const text = tell(moves, 'de').storyText.map((l) => l.text).join('\n');
	const r = read(text, 'de');
	assert.deepEqual(r.errors, []);
	assert.equal((r.moves[1] as Extract<Move, { move: 'task' }>).text, 'Prüfen neu');
});
