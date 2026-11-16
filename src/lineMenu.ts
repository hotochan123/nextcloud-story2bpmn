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
	/** The edit form of a branch: its kind can be switched (job 451). */
	switchable?: boolean;
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
			...((z.move === 'decision' || z.move === 'concurrent') && { switchable: true }),
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

/**
 * "Edit as text" from the line menu (job 453): the line of the editor's text (one per entry of the whole
 * story text, `at` = index of the line on the level shown) and whether the editor opens right here; on a
 * subprocess level the app goes to the main level first (the editor holds the whole story).
 */
export function asTextTarget(view: { sub?: unknown; lineOffset: number; lines: object[]; storyText?: object[] }, at: number): { line: number; here: boolean } {
	// The lines of a level are entries of the whole story text, not always one block of it
	// (the flows of what can come at any time sit between the headings of the main level).
	const found = view.lines[at] ? view.storyText?.indexOf(view.lines[at]) ?? -1 : -1;
	return { line: found >= 0 ? found : view.lineOffset + at, here: !view.sub };
}

/** Groups of the line menu (job 448): edit, structure, delete; hairlines between them, empty groups dropped. */
export function menuGroups(actions: string[]): string[][] {
	const editing = ['edit', 'before', 'addException', 'addTrigger', 'propose', 'asText'];
	const groups = [
		actions.filter((a) => editing.includes(a)),
		actions.filter((a) => !editing.includes(a) && a !== 'remove'),
		actions.filter((a) => a === 'remove'),
	];
	return groups.filter((g) => g.length);
}

/** "Move path up" / "Move path down" on the heading of a path (job 455). */
export type PathAction = 'pathUp' | 'pathDown';

/**
 * What the menu of a path heading offers (`path` from its story line): the paths of a branch move up and
 * down among each other; the otherwise path of a check stays the last one, so it gets nothing, and a
 * check with two paths offers nothing at all.
 */
export function pathActions(moves: Move[], path?: { at: number; n: number }): PathAction[] {
	const z = path ? moves[path.at] : undefined;
	if (!path || !z || (z.move !== 'decision' && z.move !== 'concurrent')) return [];
	const count = z.move === 'concurrent' ? z.branches ?? 2 : 2 + (z.more?.length ?? 0);
	// The last path that can move: the one before the otherwise path of a check.
	const last = z.move === 'decision' && z.subtype !== 'first' ? count - 2 : count - 1;
	if (path.n > last || last < 1) return [];
	return [...(path.n > 0 ? ['pathUp' as const] : []), ...(path.n < last ? ['pathDown' as const] : [])];
}

/** Menu key of a path heading (the line menu of a move uses the move's index). */
export const pathKey = (path: { at: number; n: number }): string => `p${path.at}.${path.n}`;
