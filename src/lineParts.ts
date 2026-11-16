/**
 * SPDX-FileCopyrightText: 2026 hotochan123
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
// Story lines in parts: signal word, objects in square brackets, signal marks (pure, no Vue).

/** filled: for a signal, whether it is given (send, end) or awaited (trigger, wait, path). */
/** sub: the task of a subprocess (its label shows a plus). */
export type Part = { subtype: 'text' | 'sw' | 'o' | 'filler'; text: string; object?: string; filled?: boolean; sub?: boolean };

/** Is this story line a signal: awaited ('empty') or given ('filled')? Known from its signal word. */
export function signalLine(text: string): 'empty' | 'filled' | undefined {
	const s = text.trim();
	if (/^(SIGNAL SENDEN|SEND SIGNAL) |^(ENDE mit Signal|END with a signal):/.test(s)) return 'filled';
	if (/^(WARTEN AUF SIGNAL|WAIT FOR SIGNAL) |^→ SIGNAL \[|^(ES BEGINNT mit Signal|IT STARTS with a signal):/.test(s)) return 'empty';
	return undefined;
}

/** The first object of a signal line is the signal, not a step. */
function markSignal(parts: Part[], text: string): Part[] {
	const kind = signalLine(text);
	const first = kind ? parts.find((p) => p.subtype === 'o') : undefined;
	if (first) Object.assign(first, { object: 'signal', filled: kind === 'filled' });
	// What a step runs for: the object right after "JE" / "FOR EACH" is no step ("FÜR JEDE": the old German word).
	parts.forEach((p, i) => {
		const before = parts[i - 1];
		if (p.subtype === 'o' && before?.subtype === 'text' && /, (JE|FÜR JEDE|FOR EACH) $/.test(before.text)) p.object = 'item';
	});
	// A task with a flow behind it: its label carries the plus (not colour alone).
	if (/, (MIT TEILABLAUF|WITH SUBPROCESS)\.?$/.test(text.trim())) {
		const task = parts.find((p) => p.subtype === 'o' && p.object === 'task');
		if (task) task.sub = true;
	}
	return parts;
}
const OBJECT: Record<string, string> = { '@': 'role', '#': 'system', '+': 'document', '!': 'deadline', '?': 'question' };

/** The text after the signal word: objects in square brackets and the text between them; `shown` gives the text of an object part. */
function brackets(parts: Part[], rest: string, shown: (m: RegExpExecArray) => string): void {
	const re = /\[([@#+!?]?)([^\]]*)\]/g;
	let pos = 0;
	for (let m; (m = re.exec(rest));) {
		if (m.index > pos) parts.push({ subtype: 'text', text: rest.slice(pos, m.index) });
		parts.push({ subtype: 'o', text: shown(m), object: OBJECT[m[1]] ?? 'task' });
		pos = m.index + m[0].length;
	}
	if (pos < rest.length) parts.push({ subtype: 'text', text: rest.slice(pos) });
}

/**
 * One line of story text in parts: signal word at the start (UPPERCASE), objects in square
 * brackets with the kind from the leading character. The interface inserts the parts only as text.
 */
export function lineParts(text: string): Part[] {
	const parts: Part[] = [];
	let rest = text;
	const sw = rest.match(/^([A-ZÄÖÜ][A-ZÄÖÜ ]+)(?=[:. ]|$)/);
	if (sw) {
		parts.push({ subtype: 'sw', text: sw[1] });
		rest = rest.slice(sw[1].length);
	}
	brackets(parts, rest, (m) => m[2] + (m[1] === '?' ? '?' : ''));
	return fillers(markSignal(parts, text));
}

/** Filler words between the parts of a line, shown muted (job 448): whole words only. */
const FILLER = /(?<![\p{L}\p{N}])(soll|in|mit|bei|shall|with|at)(?![\p{L}\p{N}])/gu;

/** Splits the filler words out of the text parts. */
function fillers(parts: Part[]): Part[] {
	return parts.flatMap((p) => {
		if (p.subtype !== 'text') return [p];
		const out: Part[] = [];
		let pos = 0;
		for (const m of p.text.matchAll(FILLER)) {
			if (m.index! > pos) out.push({ subtype: 'text', text: p.text.slice(pos, m.index) });
			out.push({ subtype: 'filler', text: m[0] });
			pos = m.index! + m[0].length;
		}
		if (pos < p.text.length) out.push({ subtype: 'text', text: p.text.slice(pos) });
		return out;
	});
}

/**
 * One line of the editor in parts for the colored layer under the text field. Unlike
 * lineParts every character stays (indentation, brackets, @#+!?): the layer must lie
 * exactly under the text in the text field.
 */
export function textParts(line: string): Part[] {
	const parts: Part[] = [];
	const front = line.match(/^\s*/)![0];
	if (front) parts.push({ subtype: 'text', text: front });
	let rest = line.slice(front.length);
	const sw = rest.match(/^([A-ZÄÖÜ][A-ZÄÖÜ ]*[A-ZÄÖÜ])(?=[:. ]|$)/);
	if (sw) {
		parts.push({ subtype: 'sw', text: sw[1] });
		rest = rest.slice(sw[1].length);
	}
	brackets(parts, rest, (m) => m[0]);
	return markSignal(parts, line);
}
