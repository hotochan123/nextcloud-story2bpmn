/**
 * SPDX-FileCopyrightText: 2026 hotochan123
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
// The text worker (textChecker.worker.ts) for the page: the editor checks in it while typing, and
// accepting or checking a proposal reads the story text back in it, so a long text never stalls the page.
import { textChecker } from './textEdit.js';
import type { TextResult } from './textEdit.js';
import type { Language, Move } from './core/index.js';

/** Web Worker for the check; without a worker (e.g. forbidden by a policy) the page calculates itself. */
export const newWorker = () => new Worker(new URL('./textChecker.worker.ts', import.meta.url), { type: 'module' });

/** One read-back in a worker of its own (textMoves); `old` is copied, the worker cannot take a Vue proxy. */
export async function readInWorker(text: string, old: Move[], language: Language): Promise<TextResult> {
	const checker = textChecker(language, newWorker, JSON.parse(JSON.stringify(old)));
	try {
		return await checker.check(text);
	} finally {
		checker.end();
	}
}
