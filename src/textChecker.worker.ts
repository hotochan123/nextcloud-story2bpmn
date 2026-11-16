/**
 * SPDX-FileCopyrightText: 2026 hotochan123
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
// Checks the story text beside the page (textChecker in textEdit.ts): read() can take seconds for long texts.
import { textMoves } from './textEdit.ts';
import type { Language, Move } from './core/index.js';

self.onmessage = (e: MessageEvent<{ num: number; text: string; language: Language; previous?: Move[] }>) => {
	const { num, text, language, previous } = e.data;
	self.postMessage({ num, result: textMoves(text, previous ?? [], language) });
};
