/**
 * SPDX-FileCopyrightText: 2026 hotochan123
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
// The example process of the start page (job 396): a short invoice approval, told to its end.
// Pure data, without Vue and without DOM (tests/core/example.test.ts, tests/client/example.test.ts).
import type { Move } from './core/index.js';
import type { Language } from './core/language.js';

type Words = {
	process: string; accounting: string; manager: string; purchasing: string;
	received: string; check: string; system: string; deadline: string; expired: string;
	giveBack: string; rejected: string; question: string; yes: string; no: string;
	release: string; goods: string; paid: string;
};

const WORDS: Record<Language, Words> = {
	de: {
		process: 'Rechnungsfreigabe', accounting: 'Buchhaltung', manager: 'Führungskraft', purchasing: 'Einkauf',
		received: 'Rechnung geht ein', check: 'Rechnung prüfen', system: 'ERP', deadline: '3 Arbeitstage', expired: 'Frist abgelaufen',
		giveBack: 'Rechnung zurückgeben', rejected: 'Rechnung zurückgewiesen', question: 'Betrag über 5000 €?', yes: 'ja', no: 'nein',
		release: 'Zahlung freigeben', goods: 'Wareneingang bestätigen', paid: 'Zur Zahlung freigegeben',
	},
	en: {
		process: 'Invoice approval', accounting: 'Accounting', manager: 'Manager', purchasing: 'Purchasing',
		received: 'Invoice arrives', check: 'Check invoice', system: 'ERP', deadline: '3 working days', expired: 'Deadline passed',
		giveBack: 'Return invoice', rejected: 'Invoice rejected', question: 'Amount over 5000 €?', yes: 'yes', no: 'no',
		release: 'Approve payment', goods: 'Confirm goods received', paid: 'Released for payment',
	},
};

/**
 * The example in the diagram language: 14 moves, 3 lanes, a message trigger, a deadline, two branches in
 * parallel with a check in the first, and two ends. Eight columns wide, so it fits a laptop window (AK3).
 */
export function exampleMoves(language: Language): Move[] {
	const w = WORDS[language] ?? WORDS.en;
	return [
		{ move: 'start', text: w.received, role: w.accounting, process: w.process, subtype: 'message' },
		{ move: 'task', text: w.check, role: w.accounting, system: w.system, deadline: w.deadline },
		{ move: 'exceptionPath', text: w.expired, subtype: 'deadline' },
		{ move: 'task', text: w.giveBack, role: w.accounting },
		{ move: 'end', text: w.rejected },
		{ move: 'concurrent' },
		{ move: 'decision', question: w.question, yes: w.yes, no: w.no },
		{ move: 'task', text: w.release, role: w.manager },
		{ move: 'merge' },
		{ move: 'merge' },
		{ move: 'merge' },
		{ move: 'task', text: w.goods, role: w.purchasing },
		{ move: 'merge' },
		{ move: 'end', text: w.paid },
	];
}

/** Which note stands above the story: 'phone' (start over through ⋯ → New), 'wide' (the New button), or none. */
export function exampleHint(o: { example: boolean; moves: number; sub: boolean; phone: boolean }): 'phone' | 'wide' | null {
	if (!o.example || !o.moves || o.sub) return null;
	return o.phone ? 'phone' : 'wide';
}

