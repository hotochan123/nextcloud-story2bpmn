/**
 * SPDX-FileCopyrightText: 2026 hotochan123
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
// The paths of the story as a tree (job 448, Soothing 2): pure, without Vue and without DOM.
// Every question has a stem from below its line down to its last path (└); every path is a
// branch (├ / └) with its name. The chosen line colours its way up to its question.
import { lineParts } from './lineParts.js';

/** One rail of a row on one level: branch (├), last branch (└), stem passing by (│), nothing. */
export type Rail = 't' | 'e' | 'v' | '_';

/** A row of the story card: a line of the level shown, or the heading / marker of NextLine. */
export type TreeInput = { depth: number; text: string; move?: number; here?: boolean };

/** The name of a path heading: an answer (with its question after the first path), a strand, or the heading text. */
export type PathLabel =
	| { kind: 'answer'; answer: string; question?: string }
	| { kind: 'strand'; number: number }
	| { kind: 'text'; text: string };

export type TreeRow = {
	/** Shown depth: a path heading stands one level deeper than its branch line. */
	depth: number;
	rails: Rail[];
	/** Per level: the stem of the chosen line's way is coloured. */
	hot: boolean[];
	/** Level whose branch stroke (─) is coloured, or null. */
	tick: number | null;
	head: boolean;
	label?: PathLabel;
	/** The first line of what can come at any time: set off by a line above it. */
	section: boolean;
};

/** A path heading of the story text: no move, begins with an arrow or a strand dash. */
export const isHead = (r: TreeInput): boolean => r.move === undefined && !r.here && /^((SONST|ELSE) )?→ |^– /.test(r.text);

/** The answer of a path heading: "→ ja:" → "ja", "SONST → nein:" → "nein". */
const stripped = (text: string): string => text.replace(/^((SONST|ELSE) )?→ /, '').replace(/^– /, '').replace(/:$/, '').trim();

/**
 * The tree of the rows. `chosen`: move index of the chosen line, or null. `anytime(move)`:
 * whether that move is something that can come at any time.
 */
export function storyTree(rows: TreeInput[], chosen: number | null, anytime: (move: number) => boolean = () => false): TreeRow[] {
	const head = rows.map(isHead);
	const depth = rows.map((r, i) => (head[i] ? r.depth + 1 : r.depth));
	const out: TreeRow[] = rows.map((r, i) => ({
		depth: depth[i],
		rails: Array.from({ length: depth[i] }, (): Rail => '_'),
		hot: Array.from({ length: depth[i] }, () => false),
		tick: null,
		head: head[i],
		section: r.move !== undefined && anytime(r.move) && !(i > 0 && rows[i - 1].move !== undefined && anytime(rows[i - 1].move!)),
	}));
	// Each owner (a line that is no heading, followed by deeper rows) opens a block on its level.
	rows.forEach((r, q) => {
		if (head[q]) return;
		const k = depth[q];
		let end = q + 1;
		while (end < rows.length && depth[end] > k) end++;
		if (end === q + 1) return;
		const block = Array.from({ length: end - q - 1 }, (_, x) => q + 1 + x);
		const heads = block.filter((i) => head[i] && depth[i] === k + 1);
		const starts = heads.length ? heads : block.filter((i) => depth[i] === k + 1);
		if (!starts.length) return;
		const first = starts[0];
		const last = starts[starts.length - 1];
		for (const i of block) {
			if (out[i].rails.length <= k) continue;
			out[i].rails[k] = i === last ? 'e' : starts.includes(i) ? 't' : i > first && i < last ? 'v' : '_';
		}
		// Path names: an answer of a question, a strand of "in parallel", else the heading text.
		const question = lineParts(r.text).find((p) => p.subtype === 'o' && p.object === 'question')?.text;
		heads.forEach((i, n) => {
			const text = rows[i].text;
			if (/^– /.test(text)) out[i].label = { kind: 'strand', number: n + 1 };
			else if (question) out[i].label = { kind: 'answer', answer: stripped(text), ...(n > 0 && { question }) };
			else out[i].label = { kind: 'text', text: stripped(text) };
		});
	});
	// The way of the chosen line: on each level the stem from its owner down to it, the stroke at its branch.
	const at = chosen === null ? -1 : rows.findIndex((r) => r.move === chosen);
	if (at >= 0) {
		for (let k = 0; k < out[at].rails.length; k++) {
			let j = at;
			while (j >= 0 && !(out[j].rails[k] === 't' || out[j].rails[k] === 'e')) j--;
			if (j < 0) continue;
			let q = j - 1;
			while (q >= 0 && !(depth[q] === k && !head[q])) q--;
			for (let i = q + 1; i <= at; i++) if (out[i].rails.length > k && out[i].rails[k] !== '_') out[i].hot[k] = true;
			out[j].tick = k;
		}
	}
	return out;
}
