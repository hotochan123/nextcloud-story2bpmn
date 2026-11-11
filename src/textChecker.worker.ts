/**
 * SPDX-FileCopyrightText: 2026 hotochan123
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
// Checks the story text beside the page (textChecker in workbench.ts): read() can take seconds for long texts.
import { textMoves } from './workbench.ts';
import type { Language } from './core/index.js';

self.onmessage = (e: MessageEvent<{ num: number; text: string; language: Language }>) => {
	const { num, text, language } = e.data;
	self.postMessage({ num, result: textMoves(text, [], language) });
};
