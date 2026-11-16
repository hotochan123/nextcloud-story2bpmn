/**
 * SPDX-FileCopyrightText: 2026 hotochan123
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
// The line menu of the story: which form a line action opens and where a new trigger lands (pure, no Vue).
// Titles stay in the component: they go through t().
import { withNewPath, targetsUntil } from './workbench.js';
import type { Move, Language, Target, TellOptions } from './core/index.js';

type MoveKind = Move['move'];

/** The form a line action opens, without its title. */
export type LineForm = {
	subtype: MoveKind;
	place: 'replace' | 'before' | 'exception' | 'trigger';
	index: number;
	start: Partial<Move> & Record<string, unknown>;
	focus?: string;
	paths?: number;
	targets?: Target[];
};

const more = (z: Move): number => (z.move === 'decision' ? z.more?.length ?? 0 : 0);
const branches = (z: Move): number => (z.move === 'concurrent' ? z.branches ?? 2 : 2);

/**
 * The form of line action `action` at move i; `kind` is the kind chosen in "What comes before?"
 * (action 'before'). Null: the action opens no form.
 */
export function formFor(action: string, moves: Move[], i: number, language: Language, opts: TellOptions = {}, kind?: MoveKind): LineForm | null {
	const z = moves[i];
	if (action === 'before') {
		if (!kind) return null;
		// Suggestion for a step: the role of the task before which it is inserted.
		return { subtype: kind, place: 'before', index: i, start: kind === 'task' && z && 'role' in z && z.role ? { role: z.role } : {} };
	}
	if (action === 'addException') return { subtype: 'exceptionPath', place: 'exception', index: i, start: {} };
	if (action === 'addTrigger') return { subtype: 'orStart', place: 'trigger', index: i, start: {} };
	if (!z) return null;
	if (action === 'addPath') {
		// The form of the line with one empty path more (also after the story went on: it stays open).
		const { start, focus } = withNewPath(z);
		return { subtype: z.move, place: 'replace', index: i, start, focus, paths: z.move === 'concurrent' ? branches(z) : 2 + more(z) };
	}
	if (action === 'edit') {
		return {
			subtype: z.move,
			place: 'replace',
			index: i,
			start: { ...z },
			// Not the core's path count: an exception path counts 0 here.
			paths: z.move === 'concurrent' ? branches(z) : z.move === 'decision' ? 2 + more(z) : 0,
			// "continue at": the targets that were possible at exactly this point.
			targets: z.move === 'goTo' ? targetsUntil(moves, i, language, opts) : undefined,
		};
	}
	return null;
}

/** Where a new trigger stands: after the triggers told so far. */
export function triggerIndex(moves: Move[]): number {
	let at = 1;
	while (moves[at]?.move === 'orStart') at++;
	return at;
}
