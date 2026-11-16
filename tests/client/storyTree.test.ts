// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { replay, textMoves, lineParts } from '../../src/workbench.js';
import { storyTree, type TreeRow } from '../../src/storyTree.js';
import { menuGroups } from '../../src/lineMenu.js';
import type { Move } from '../../src/core/index.js';

// Job 448: Soothing 2 – the story as a tree, sentence parts, filler words, menu groups.

const complaint = readFileSync('tests/client/fixtures/reklamation.txt', 'utf8');

async function rowsOf(text: string, language: 'de' | 'en' = 'de') {
	const r = textMoves(text, [], language);
	assert.deepEqual(r.errors, []);
	const v = await replay(r.moves, language);
	return { moves: r.moves, lines: v.lines };
}

/** The tree row of move m, and of the n-th heading after move m. */
function at(lines: { move?: number }[], tree: TreeRow[], m: number, heading = 0): TreeRow {
	let i = lines.findIndex((l) => l.move === m);
	assert.ok(i >= 0, `move ${m}`);
	for (let n = 0; n < heading; i++) if (tree[i + 1].head) n++;
	return tree[i];
}

test('448 AK1 the tree of "Reklamation": stems, branches and nothing beside the number', async () => {
	const { moves, lines } = await rowsOf(complaint);
	assert.equal(moves.length, 31);
	const tree = storyTree(lines, null);
	const rails = (m: number, h = 0) => at(lines, tree, m, h).rails;
	for (const m of [3, 9, 13]) assert.deepEqual(rails(m), [], `move ${m}`);
	assert.deepEqual(rails(3, 1), ['t']);
	assert.deepEqual(rails(4), ['v']);
	assert.deepEqual(rails(5), ['v']);
	assert.deepEqual(rails(5, 1), ['e']);
	for (const m of [6, 7, 8]) assert.deepEqual(rails(m), ['_']);
	assert.deepEqual(rails(15), ['t']);
	assert.deepEqual(rails(16), ['e']);
	assert.deepEqual(rails(17, 1), ['t']);
	assert.deepEqual(rails(18), ['v']);
	assert.deepEqual(rails(18, 1), ['v', 't']);
	for (const m of [19, 20, 21]) assert.deepEqual(rails(m), ['v', 'v']);
	assert.deepEqual(rails(21, 1), ['v', 'e']);
	for (const m of [22, 23, 24, 25]) assert.deepEqual(rails(m), ['v', '_']);
	assert.deepEqual(rails(26), ['v']);
	assert.deepEqual(rails(27), ['v']);
	assert.deepEqual(rails(27, 1), ['e']);
	for (const m of [28, 29, 30]) assert.deepEqual(rails(m), ['_']);
	// Headings have no move (so no number); they sit one level deeper than their branch line
	const heads = tree.filter((r) => r.head);
	assert.equal(heads.length, 6);
	lines.forEach((l, i) => assert.equal(tree[i].head, l.move === undefined));
	assert.equal(at(lines, tree, 17, 1).depth, 1);
});

test('448 AK2 path names: "ja", the question before later answers, strands, whichever comes first', async () => {
	const { lines } = await rowsOf(complaint);
	const tree = storyTree(lines, null);
	assert.deepEqual(at(lines, tree, 17, 1).label, { kind: 'answer', answer: 'ja' });
	assert.deepEqual(at(lines, tree, 27, 1).label, { kind: 'answer', answer: 'nein', question: 'Mangel bestätigt?' });
	assert.deepEqual(at(lines, tree, 21, 1).label, { kind: 'answer', answer: 'nein', question: 'Reparatur möglich?' });

	const parallel = await rowsOf(['ES BEGINNT: [Auftrag kommt] bei [@Vertrieb].', 'GLEICHZEITIG:', '– erster Strang:', '  [@Lager] soll [Packen].', '  ZUSAMMENFÜHREN.',
		'– zweiter Strang:', '  [@Buchhaltung] soll [Rechnen].', '  ZUSAMMENFÜHREN.', '– dritter Strang:', '  [@Vertrieb] soll [Melden].', '  ZUSAMMENFÜHREN.', 'ENDE: [fertig].'].join('\n'));
	const p = storyTree(parallel.lines, null);
	assert.deepEqual(p.filter((r) => r.head).map((r) => r.label), [1, 2, 3].map((number) => ({ kind: 'strand', number })));
	assert.deepEqual(p.filter((r) => r.head).map((r) => r.rails), [['t'], ['t'], ['e']]);

	const first = await rowsOf(['ES BEGINNT: [Bestellung] bei [@Einkauf].', 'WAS ZUERST PASSIERT:', '→ [Zahlung geht ein]:', '  ENDE: [bezahlt].', '→ [!14 Tage]:', '  ENDE: [verfallen].'].join('\n'));
	const f = storyTree(first.lines, null).filter((r) => r.head).map((r) => r.label);
	assert.deepEqual(f, [{ kind: 'text', text: '[Zahlung geht ein]' }, { kind: 'text', text: '[!14 Tage]' }]);
});

test('448 AK3 the chosen line colours its way up to its question, the stroke at its branch', async () => {
	const { lines } = await rowsOf(complaint);
	const hotRows = (tree: TreeRow[]) => tree.map((r, i) => ({ i, hot: r.hot.map((h, k) => (h ? k : -1)).filter((k) => k >= 0), tick: r.tick })).filter((x) => x.hot.length || x.tick !== null);
	const tree = storyTree(lines, 23);
	const yes = lines.findIndex((l) => l.move === 17) + 1;
	const yesDeep = lines.findIndex((l) => l.move === 18) + 1;
	const noDeep = lines.findIndex((l) => l.move === 21) + 1;
	const to = lines.findIndex((l) => l.move === 23);
	const hot = hotRows(tree);
	for (let i = yes; i <= to; i++) assert.ok(tree[i].hot[0], `row ${i} level 0`);
	for (let i = yesDeep; i <= noDeep; i++) assert.ok(tree[i].hot[1], `row ${i} level 1`);
	// Below the last branch no stem is drawn on that level: nothing to colour
	for (let i = noDeep + 1; i <= to; i++) assert.equal(tree[i].hot[1], false);
	assert.equal(tree[yes].tick, 0);
	assert.equal(tree[noDeep].tick, 1);
	assert.equal(tree[yesDeep].tick, null);
	assert.ok(hot.every((x) => x.i >= yes && x.i <= to), JSON.stringify(hot));
	assert.deepEqual(hotRows(storyTree(lines, 9)), []);
	assert.deepEqual(hotRows(storyTree(lines, null)), []);
	// An exception: its first move only the stem, the chosen one stem and stroke
	const e = storyTree(lines, 16);
	const r15 = lines.findIndex((l) => l.move === 15);
	assert.deepEqual([e[r15].hot, e[r15].tick, e[r15 + 1].hot, e[r15 + 1].tick], [[true], null, [true], 0]);
	assert.deepEqual(hotRows(e).map((x) => x.i), [r15, r15 + 1]);
});

test('448 what can come at any time is set off by a line above its first line', async () => {
	const moves: Move[] = [{ move: 'start', text: 'Antrag kommt', role: 'Amt' }, { move: 'task', text: 'Prüfen', role: 'Amt' }, { move: 'end', text: 'fertig' },
		{ move: 'anytime', subtype: 'message', text: 'Antrag zurückgezogen' } as Move];
	const v = await replay(moves, 'de');
	const tree = storyTree(v.lines, null, (m) => moves[m]?.move === 'anytime');
	const i = v.lines.findIndex((l) => l.move === 3);
	assert.ok(i > 0);
	assert.deepEqual(tree.map((r) => r.section), v.lines.map((_, j) => j === i));
});

test('448 the marker of NextLine takes part in the tree', () => {
	const tree = storyTree([{ depth: 0, text: 'WENN [?Betrag hoch]', move: 1 }, { depth: 0, text: '→ ja:' }, { depth: 1, text: 'x', move: 2 }, { depth: 0, text: 'SONST → nein:' }, { depth: 1, text: '', here: true }], null);
	assert.deepEqual(tree.map((r) => r.rails), [[], ['t'], ['v'], ['e'], ['_']]);
	assert.equal(tree[4].head, false);
});

test('448 AK4 filler words are muted parts, whole words only', () => {
	const parts = lineParts('[@Lager] soll [Ware sichten] in [#ERP] mit [+Beleg], Frist [!2 Tage].');
	assert.deepEqual(parts.filter((p) => p.subtype === 'filler').map((p) => p.text), ['soll', 'in', 'mit']);
	assert.equal(parts.map((p) => p.text).join(''), 'Lager soll Ware sichten in ERP mit Beleg, Frist 2 Tage.');
	assert.deepEqual(lineParts('[@Lager] shall [Pack] in [#ERP] with [+Note].').filter((p) => p.subtype === 'filler').map((p) => p.text), ['shall', 'in', 'with']);
	assert.deepEqual(lineParts('IT STARTS: [Order] at [@Sales].').filter((p) => p.subtype === 'filler').map((p) => p.text), ['at']);
	// Inside a word, inside brackets and in signal words nothing is split
	assert.deepEqual(lineParts('[Inhalt bei Mindestbestand] Mittag inbegriffen').filter((p) => p.subtype === 'filler'), []);
	assert.deepEqual(lineParts('IN PARALLEL:').filter((p) => p.subtype === 'filler'), []);
});

test('448 AK7 the line menu in groups: edit, structure, delete', () => {
	assert.deepEqual(menuGroups(['edit', 'before', 'addException', 'remove', 'subprocess']), [['edit', 'before', 'addException'], ['subprocess'], ['remove']]);
	assert.deepEqual(menuGroups(['edit', 'before', 'addPath', 'keep:0', 'keep:1']), [['edit', 'before'], ['addPath', 'keep:0', 'keep:1']]);
	assert.deepEqual(menuGroups(['tell', 'before']), [['before'], ['tell']]);
	assert.deepEqual(menuGroups(['edit', 'propose']), [['edit', 'propose']]);
	assert.deepEqual(menuGroups([]), []);
});

test('448 AK4 sentence parts in the mixed form: three tints, frames for system and document, no colours of their own', () => {
	const css = readFileSync('src/workshop.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
	const rule = (sel: string) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1].split(',').map((s) => s.trim()).includes(`.story2bpmn-workshop ${sel}`)).map((m) => m[2]).join(';');
	assert.match(rule('.o-task'), /background: var\(--so-info-tint\); color: var\(--so-info-text\)/);
	assert.match(rule('.o-role'), /background: var\(--so-success-tint\); color: var\(--so-success-text\)/);
	assert.match(rule('.o-question'), /background: var\(--so-warn-tint\); color: var\(--so-warn-text\)/);
	for (const k of ['.o-system', '.o-document']) {
		assert.match(rule(k), /border-color: var\(--border\)/, k);
		assert.doesNotMatch(rule(k), /background/, k);
	}
	assert.match(rule('.filler'), /color: var\(--muted\)/);
	// Document and deadline carry their mark, the figures of a deadline in mono
	const parts = readFileSync('src/components/StoryParts.vue', 'utf8');
	assert.match(parts, /part\.object === 'document'" class="mark"/);
	assert.match(parts, /part\.object === 'deadline'" class="mark"/);
	assert.match(parts, /figures\(part\.text\)/);
	// Without fills (forced colours) role and system show their sign
	assert.match(css, /@media \(forced-colors: active\) \{[^@]*\.o-role::before \{ content: "@"; \}[^@]*\.o-system::before \{ content: "#"; \}/);
});

test('448 round 1: a path heading does not take the class of the app head (.head draws its rule)', () => {
	for (const f of ['src/components/StoryCard.vue', 'src/components/NextLine.vue']) {
		const src = readFileSync(f, 'utf8');
		assert.doesNotMatch(src, /class="line head"|\bhead: tree\.lines/, f);
	}
	assert.match(readFileSync('src/components/StoryCard.vue', 'utf8'), /'path-head': tree\.lines\[i\]\.head/);
});
