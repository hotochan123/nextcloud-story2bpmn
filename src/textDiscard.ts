/**
 * SPDX-FileCopyrightText: 2026 hotochan123
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
// "Edit as text" never throws typed text away without asking (job 406). Pure, without Vue
// (tests/client/textDiscard.test.ts).

/** The text in the editor differs from the text it was opened with; typing back to it is unchanged again. */
export const textChanged = (text: string, start: string): boolean => text !== start;

/**
 * Esc, "Cancel" or "Edit as text" while the editor is open: an unchanged text closes at once;
 * a changed one first arms the cancel button ("Really discard?"), the second press closes.
 */
export const cancelStep = (armed: boolean, changed: boolean): 'close' | 'arm' =>
	!changed || armed ? 'close' : 'arm';
