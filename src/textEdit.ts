/**
 * SPDX-FileCopyrightText: 2026 hotochan123
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
// Edit as text: the story text is read back in the browser (core: read()), also in a worker (textChecker.worker.ts).
import { tx, read, asSourceText, sameMoves } from './core/index.js';
import type { Move, Line, Language } from './core/index.js';

/** Content of the editor: the story text with indentation, as read() reads it back. */
export const textFrom = (storyText: Line[]): string => asSourceText(storyText);

export type TextResult = { moves: Move[]; number: number; errors: string[]; line?: number };

/**
 * Text -> moves. On an error no moves (the old state stays). The process name
 * is not in the text: it comes from the previous start move.
 */
export function textMoves(text: string, old: Move[], language: Language): TextResult {
	// The old moves tell which of two steps of the same name an unchanged "continue at" leads to (job 402).
	const r = read(text, language, old);
	if (r.errors.length) return { moves: [], number: r.moves.length, errors: r.errors, ...(r.line !== undefined && { line: r.line }) };
	return { moves: withProcess(r.moves, old), number: r.moves.length, errors: [] };
}

/** Process name of the old start move onto the new moves (it is not in the story text). */
export function withProcess(moves: Move[], old: Move[]): Move[] {
	const process = old[0]?.move === 'start' ? old[0].process : undefined;
	if (!process || moves[0]?.move !== 'start') return moves;
	return [{ ...moves[0], process }, ...moves.slice(1)];
}

/**
 * "Done" in the editor: does the checked text tell the same story as before (job 412)? The same
 * moves as read from the start text of the editor (so spaces, indentation and empty lines read()
 * ignores do not count), or the same moves as when it was opened. Then "Done" only closes it.
 */
export function sameStory(moves: Move[], startMoves: Move[] | undefined, previous: Move[]): boolean {
	return (startMoves !== undefined && sameMoves(moves, startMoves)) || sameMoves(moves, previous);
}

/** What textChecker needs from a worker (Web Worker in the browser, a dummy in the test). */
export type CheckerWorker = {
	postMessage(m: { num: number; text: string; language: Language; previous: Move[] }): void;
	terminate(): void;
	onmessage: ((e: { data: { num: number; result: TextResult } }) => void) | null;
	onerror: ((e: unknown) => void) | null;
};

/**
 * Checking while typing without freezing the page: read() replays line by line and takes
 * seconds for 200 lines. The work is done in a worker; if none starts or it fails,
 * the page calculates itself (synchronously, as before). Result without process name (withProcess).
 */
export function textChecker(language: Language, newWorker?: () => CheckerWorker, previous: Move[] = []) {
	let w: CheckerWorker | null = null;
	let num = 0;
	const open = new Map<number, { text: string; done: (r: TextResult) => void }>();
	const itself = (text: string) => textMoves(text, previous, language);
	const from = () => {
		w?.terminate();
		w = null;
		for (const { text, done } of open.values()) done(itself(text));
		open.clear();
	};
	try {
		w = newWorker?.() ?? null;
	} catch {
		w = null;
	}
	if (w) {
		w.onmessage = (e) => {
			const o = open.get(e.data.num);
			open.delete(e.data.num);
			o?.done(e.data.result);
		};
		w.onerror = from;
	}
	return {
		get inWorker() { return w !== null; },
		check(text: string): Promise<TextResult> {
			if (!w) return Promise.resolve(itself(text));
			const mine = ++num;
			return new Promise((done) => {
				open.set(mine, { text, done });
				w!.postMessage({ num: mine, text, language, previous });
			});
		},
		end() {
			w?.terminate();
			w = null;
			open.clear();
		},
	};
}

/** Checking while typing: number of recognized moves or the first error with line. */
export function checkText(text: string, language: Language): { number: number; errors: string[]; line?: number } {
	const { number, errors, line } = textMoves(text, [], language);
	return { number, errors, ...(line !== undefined && { line }) };
}
/** Pattern of the writing aid in the diagram language (only these does the core read back). */
export const helpPattern = (language: Language): string[] => [
	tx(language, 'ES BEGINNT: [Auslöser] bei [@Stelle].', 'IT STARTS: [trigger] at [@role].'),
	tx(language, '[@Stelle] soll [Schritt] in [#System], Frist [!3 Tage].', '[@role] shall [step] in [#system], deadline [!3 days].'),
	tx(language, 'WARTEN AUF [Antwort]  ·  WARTEN AUF [!3 Tage]  ·  WARTEN BIS [Lager voll]', 'WAIT FOR [reply]  ·  WAIT FOR [!3 days]  ·  WAIT UNTIL [stock full]'),
	tx(language, 'WARTEN AUF SIGNAL [Lieferstopp ausgerufen]  ·  SIGNAL SENDEN [Lieferstopp ausgerufen]', 'WAIT FOR SIGNAL [delivery stop declared]  ·  SEND SIGNAL [delivery stop declared]'),
	tx(language, 'WENN [?Frage]  ·  → ja:  ·  → …:  ·  SONST → nein:', 'IF [?question]  ·  → yes:  ·  → …:  ·  ELSE → no:'),
	tx(language, 'GLEICHZEITIG:  ·  – erster Strang:  ·  – zweiter Strang:  ·  – dritter Strang: …', 'IN PARALLEL:  ·  – first branch:  ·  – second branch:  ·  – third branch: …'),
	tx(language, 'FALLS [Abweichung]:', 'IN CASE OF [deviation]:'),
	tx(language, 'ZUSAMMEN.  ·  WEITER BEI [Schritt].', 'MERGE.  ·  CONTINUE AT [step].'),
	tx(language, 'WEITER AUF DEM WEG „Frage“ → ja:', 'BACK ON THE PATH “question” → yes:'),
	tx(language, 'ENDE: [Zustand].  ·  ENDE mit Signal: [Zustand].', 'END: [state].  ·  END with a signal: [state].'),
	tx(language, '[@Stelle] soll [Schritt], MIT TEILABLAUF.  ·  am Ende: TEILABLAUF [Schritt]:  ·  ES BEGINNT.', '[@role] shall [step], WITH SUBPROCESS.  ·  at the end: SUBPROCESS [step]:  ·  IT STARTS.'),
];
