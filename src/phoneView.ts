/**
 * SPDX-FileCopyrightText: 2026 hotochan123
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
// Phone view (job 394, design handover schmal-2026-11, switch A): one view at a time, story or
// diagram, switched in a bar at the bottom (at the left edge when held sideways).
// Pure, without Vue and without DOM (tests/client/phoneView.test.ts).
import { lineActions } from './workbench.js';
import type { Move } from './core/story.js';

/** Below this width the story does not fit next to the diagram, below this height the band leaves too little room. */
const PHONE_WIDTH = 700;
const PHONE_HEIGHT = 500;

/** A phone: narrower than 700 px or lower than 500 px. A tablet upright (820 × 1180) stays with the band. */
export const isPhone = (width: number, height: number): boolean => width < PHONE_WIDTH || height < PHONE_HEIGHT;

/** Held sideways: the bar becomes a rail at the left edge. */
export const isRail = (width: number, height: number): boolean => isPhone(width, height) && width > height;

/**
 * Phone or not after a resize. While a text field has the focus and only the height changed, the
 * on-screen keyboard took the height: the layout stays as it was (a tablet held sideways does not
 * become a phone because the keyboard opened).
 */
export function phoneAfterResize(o: { was: boolean; width: number; height: number; lastWidth: number; typing: boolean }): boolean {
	if (o.typing && o.width === o.lastWidth) return o.was;
	return isPhone(o.width, o.height);
}

export type Pane = 'story' | 'diagram';

/**
 * pane: the view shown; grown: the diagram got a new shape while the story was shown (point at the
 * segment and the hint "View"); fresh: move index of the line marked NEW, or null.
 */
export type PhoneState = { pane: Pane; grown: boolean; fresh: number | null };

export const phoneStart = (): PhoneState => ({ pane: 'story', grown: false, fresh: null });

/**
 * After a change of the story. `index`: the move that was told, inserted or changed; null for undo,
 * delete, start over or the text editor (they clear the mark). Nothing switches by itself.
 */
export function afterMove(s: PhoneState, index: number | null): PhoneState {
	if (index === null) return { ...s, grown: false, fresh: null };
	if (s.pane === 'diagram') return { ...s, grown: false, fresh: null };
	return { ...s, grown: true, fresh: index };
}

/** Switching to the diagram clears point and hint; the NEW mark stays until the next change. */
export function showPane(s: PhoneState, pane: Pane): PhoneState {
	return pane === 'diagram' ? { ...s, pane, grown: false } : { ...s, pane };
}

/** The on-screen keyboard is open when the visible part is less than three quarters of the window. */
export const keyboardOpen = (innerHeight: number, visualHeight: number | undefined): boolean =>
	visualHeight !== undefined && visualHeight < innerHeight * 0.75;

/** Height the keyboard covers at the bottom of the window (the status line of the text editor stands above it). */
export function keyboardInset(innerHeight: number, visual?: { height: number; offsetTop: number } | null): number {
	if (!visual) return 0;
	return Math.max(0, Math.round(innerHeight - visual.height - visual.offsetTop));
}

export type SheetAction = ReturnType<typeof lineActions>[number] | 'propose' | 'show';

/**
 * Actions of the ⋯ sheet of a line: the same as the line menu on a wide screen (lineActions),
 * "Make a proposal" where a valid version allows it, and "Show in the diagram". No "insert after".
 */
export function sheetActions(move: Move, index: number, inner: boolean, canPropose: boolean, hasException = false): SheetAction[] {
	return [...lineActions(move, index, inner, hasException), ...(canPropose ? ['propose' as const] : []), 'show'];
}
