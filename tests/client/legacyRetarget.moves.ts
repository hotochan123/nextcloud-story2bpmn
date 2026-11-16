// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
// Job 440: the story of the release review 0.2.0 (round 1, finding 1) without its last line, "continue at".
// 0.1.0 merged the extra path later than main does: every node ID after it is one lower in the file.
import type { Move } from '../../src/core/index.js';

export const SHIFTED: Move[] = [
	{ move: 'start', text: 'Antrag', role: 'Team' },
	{ move: 'decision', question: 'Vollständig', yes: 'ja', no: 'nein' },
	{ move: 'decision', question: 'Eilig', yes: 'ja', no: 'nein' },
	{ move: 'end', text: 'Abgelehnt' },
	{ move: 'merge' },
	{ move: 'merge' },
	{ move: 'decision', question: 'Betrag hoch', yes: 'ja', no: 'nein' },
	{ move: 'merge' },
	{ move: 'decision', question: 'Kunde bekannt', yes: 'ja', no: 'nein' },
	{ move: 'end', text: 'Info A' },
	{ move: 'end', text: 'Info B' },
	{ move: 'merge' },
	{ move: 'task', text: 'Prüfen', role: 'Team' },
	{ move: 'task', text: 'Freigeben', role: 'Chef' },
	{ move: 'decision', question: 'Freigegeben', yes: 'ja', no: 'nein' },
	{ move: 'end', text: 'Fertig' },
] as Move[];
