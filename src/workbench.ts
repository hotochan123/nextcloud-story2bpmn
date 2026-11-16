/**
 * SPDX-FileCopyrightText: 2026 hotochan123
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
// State logic of the interface: pure, without Vue and without DOM (tests/client/workbench.test.ts).
// The state is the list of moves; every change replays it in the core.
import { MAX_PATHS, tell, stillLeads, splice, replaceMove, removeBranch, deletePath, addPaths, tellOpen, reopenPath, insertBefore, addException, addTrigger, INSERTABLE, pathCount as branchPaths, BRANCHES, preview, levels, hasSubprocess, subIR, descends, sameMoves, NOT_ON_OPEN } from './core/index.js';
import type { Move, Line, Target, Issue, Language, ProcessIR, Band, TellOptions, StoryState } from './core/index.js';
import type { EventKind } from './core/ir.js';
import { played } from './workingFile.js';

// The form, the parts of a line and the keys live in their own modules; re-exported so imports stay.
export { fields, signalFields, morePaths, branchCount, pathCount, addPath, removePath, switchKind, forEachSwitched, prefill, requiredEmpty, moveFromForm } from './moveForm.js';
export type { FieldKind, Field } from './moveForm.js';
export { signalLine, lineParts, textParts } from './lineParts.js';
export type { Part } from './lineParts.js';
export { digitKey, keyEnv, storyKeys } from './storyKeys.js';
export type { KeyEnv } from './storyKeys.js';
export { played, loadStory, fileSuggestion, outputName, unsaved, outputs, copyState, fileXml, saveThenPublish } from './workingFile.js';
export type { Loaded, Outputs, SaveResult, PublishResult } from './workingFile.js';
export { textFrom, textMoves, withProcess, sameStory, textChecker, checkText, helpPattern } from './textEdit.js';
export type { TextResult, CheckerWorker } from './textEdit.js';

export type MoveKind = Move['move'];

/** What the interface shows after a replay. */
export type View = {
	/** The moves of the whole story. */
	moves: Move[];
	/** The moves of the level shown: the main flow, or the flow behind task move `level`. */
	levelMoves: Move[];
	/** Index of the task move whose subprocess is shown; missing on the main level. */
	level?: number;
	/** Inside that subprocess: index of the move of what can come at any time whose flow is shown (job 397). */
	any?: number;
	/** On a subprocess level: its task, the lane of the task and the name of the level above (breadcrumbs, back).
	 *  trigger: the level is the flow of something that can come at any time (it starts with that event).
	 *  within: that comes at any time while this subprocess runs (its task's name); then `process` is it too. */
	sub?: { name: string; lane?: string; process: string; trigger?: { subtype: EventKind; keepsRunning: boolean }; within?: string; main?: string };
	/** Lines of the level shown (the story card lists them); storyText is the whole story text. */
	lines: Line[];
	/** Index of the first line of `lines` within storyText. */
	lineOffset: number;
	/** The main flow is told to its end (on a subprocess level `done` is that flow's). */
	complete: boolean;
	/** Subprocesses not told to their end and paths still open of the main flow: open points of the whole story. */
	untold: number;
	/** Per move of the level shown with a flow behind it whether it is told to its end (main level and subprocess level). */
	subs: Record<number, { told: boolean; moves: number }>;
	/** Moves of the level shown whose branch has no step on any path: told, but not in the diagram (job 419). */
	bare: number[];
	question?: string;
	options: MoveKind[];
	targets: Target[];
	roles: string[];
	role?: string;
	path?: string;
	open: string[];
	next?: { head?: string; depth: number };
	done: boolean;
	errors: string[];
	storyText: Line[];
	endKinds: string[];
	/** Kinds a further trigger may have here (the plain one only while no trigger begins plainly). */
	startKinds: string[];
	/** Names of the signals already in this story: suggestions for a new signal (only this file). */
	signals: string[];
	svg: string;
	/** Lane and pool headers in SVG coordinates, for the standing names of the preview. */
	bands: Band[];
	pool?: { name: string; x: number; y: number; h: number };
	/** Node where the story continues (data-node in the SVG). */
	here?: string;
	issues: Issue[];
	nodes: number;
	lanes: number;
	readingCopy: boolean;
	/** The working file (BPMN with the story); missing as long as there is no diagram. */
	xml?: string;
};

/** Diagram language from the account language: German for de*, otherwise English. */
export const diagramLanguage = (language: string | undefined): Language => (/^de\b|^de[_-]/i.test(language ?? '') ? 'de' : 'en');

/**
 * The view of a state. `level`: show the flow behind task move `level` (its story, question and
 * diagram); without, or when that move has no subprocess, the main level. `moves` are always the
 * moves of the whole story.
 */
export async function replay(moves: Move[], language: Language, level?: number, anyAt?: number): Promise<View> {
	const { g, e } = await played(moves, language);
	const sub = level === undefined ? undefined : g.subs?.[level];
	const step = sub && e.ir.nodes.find((n) => n.id === sub.id);
	const outer = step && hasSubprocess(step) ? { sub, step } : undefined;
	// What can come at any time while that subprocess runs (job 397): one level further down.
	const nestedSub = outer && anyAt !== undefined && moves[level!]?.move === 'task' ? outer.sub.state.subs?.[anyAt] : undefined;
	const nestedStep = nestedSub && outer!.step.subprocess.nodes.find((n) => n.id === `${outer!.sub.id}_${nestedSub.id}`);
	const deep = nestedStep && hasSubprocess(nestedStep) ? { sub: nestedSub!, step: nestedStep } : undefined;
	const inner = deep ?? outer;
	const outerMoves = outer ? ((moves[level!] as { subprocess?: Move[] }).subprocess ?? []) : moves;
	// The level shown: its story state, its diagram, IDs of its shapes in the whole diagram.
	const s: StoryState = inner ? inner.sub.state : g;
	const shown: ProcessIR = deep ? subIR(subIR(e.ir, outer!.step), deep.step) : outer ? subIR(e.ir, outer.step) : e.ir;
	const prefix = deep ? `${outer!.sub.id}_${deep.sub.id}_` : outer ? `${outer.sub.id}_` : '';
	const id = (x: string) => prefix + x;
	const moveOf = Object.fromEntries(Object.entries(s.moveOf).map(([k, v]) => [id(k), v]));
	// Preview: role where the story continues, marked; DRAFT as long as no reading copy is possible.
	// Without legend (it is in the reading copy); each shape carries its move number.
	const p = shown.nodes.length ? preview(shown, e.positions, { draft: !e.readingCopy, here: s.here && id(s.here), withoutLegend: true, moves: moveOf }) : undefined;
	// A subprocess level lists its lines without the section heading (the breadcrumbs name it). The heading of
	// what can come at any time is a line of the main level, so its level begins right with its lines.
	const any = deep ? outerMoves[anyAt!] : outer ? moves[level!] : undefined;
	const trigger = any?.move === 'anytime' ? { subtype: any.subtype, keepsRunning: any.keepsRunning === 'yes' } : undefined;
	const skip = trigger ? 0 : 1;
	const mine = (l: Line) => (deep ? l.sub === level && l.any === anyAt : outer ? l.sub === level && l.any === undefined : l.sub === undefined);
	const lineOffset = inner ? g.storyText.findIndex(mine) + skip : 0;
	const lines = g.storyText.filter(mine).slice(inner ? skip : 0);
	const told = (all: Move[], x: Record<number, { state: StoryState }> | undefined) => Object.fromEntries(Object.entries(x ?? {}).map(([i, y]) => [i, { told: y.state.done && !y.state.ir.openPoints?.length && ((all[Number(i)] as { subprocess?: Move[] }).subprocess?.length ?? 0) > 0, moves: (all[Number(i)] as { subprocess?: Move[] }).subprocess?.length ?? 0 }]));
	const mainSubs = told(moves, g.subs);
	// A subprocess level lists its flows too: what can come at any time while it runs.
	const subs = deep || trigger ? {} : outer ? told(outerMoves, outer.sub.state.subs) : mainSubs;
	const laneOf = (level: ProcessIR, laneId?: string) => level.lanes.find((l) => l.id === laneId)?.name;
	return {
		moves,
		levelMoves: deep ? ((outerMoves[anyAt!] as { subprocess?: Move[] }).subprocess ?? []) : outerMoves,
		...(deep
			? { level, any: anyAt, sub: { name: deep.step.name, lane: laneOf(subIR(e.ir, outer!.step), deep.step.laneId), process: outer!.step.name, ...(trigger && { trigger }), within: outer!.step.name, main: g.ir.name } }
			: outer ? { level, sub: { name: outer.step.name, lane: laneOf(e.ir, outer.step.laneId), process: g.ir.name, ...(trigger && { trigger }) } } : {}),
		lines,
		lineOffset,
		subs,
		bare: s.bare ?? [],
		complete: g.done,
		// Paths still open of the main flow count too (job 395); those inside a subprocess make its task untold.
		untold: Object.values(mainSubs).filter((x) => !x.told).length + moves.filter((m) => m.move === 'openPath').length,
		question: s.question,
		options: s.options,
		targets: s.targets,
		roles: s.roles,
		role: s.role,
		path: s.path,
		open: s.open,
		next: s.next,
		done: s.done,
		errors: g.errors,
		storyText: g.storyText,
		endKinds: s.endKinds,
		startKinds: s.startKinds,
		signals: signalNames(e.ir),
		svg: p?.svg ?? '',
		bands: p?.lanes ?? [],
		pool: p?.pool,
		here: s.here && id(s.here),
		// On the way the diagram is necessarily incomplete: show the check only at the end.
		issues: g.done ? e.issues : [],
		nodes: shown.nodes.length,
		lanes: shown.lanes.length,
		readingCopy: e.readingCopy,
		xml: e.ir.nodes.length ? e.xml : undefined,
	};
}

/** Signal names of a diagram, sorted, each once: the same name is the same signal. */
export const signalNames = (ir: ProcessIR): string[] =>
	[...new Set(levels(ir).flatMap((l) => l.nodes).filter((n) => (n as { subtype?: string }).subtype === 'signal').map((n) => n.name.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

/** New moves count only if they replay without errors; otherwise the old state stays. */
export function change(old: Move[], added: Move[], language: Language): { moves: Move[]; rejected?: string[] } {
	const errors = tell(added, language).errors;
	return errors.length ? { moves: old, rejected: errors } : { moves: added };
}

/** Names of the moves of the level shown whose flow behind is not told to its end: tasks with a subprocess and
 *  what can come at any time, on the main level and (job 397) on a subprocess level; none inside such a flow. */
export const untoldFlows = (view: Pick<View, 'sub' | 'subs' | 'levelMoves'>): string[] =>
	view.sub?.trigger ? [] : Object.entries(view.subs ?? {}).filter(([, s]) => !s.told).map(([i]) => (view.levelMoves[Number(i)] as { text?: string } | undefined)?.text ?? '').filter(Boolean);

export const append = (moves: Move[], move: Move): Move[] => [...moves, move];
/** Changing a task keeps the flow told behind it as long as the form still says it has one (the form gives `[]`).
 *  With the language, "continue at" after it is rewritten to the new node IDs (replaceMove, job 402). */
export const replace = (moves: Move[], i: number, move: Move, language?: Language, opts: TellOptions = {}): Move[] =>
	moves[i] ? replaceMove(moves, i, keepSubprocess(moves[i], move), language, opts) : moves;
function keepSubprocess(old: Move, move: Move): Move {
	// Something that can come at any time keeps its flow when its heading changes (the form has no field for it).
	if (move.move === 'anytime' && old.move === 'anytime' && move.subprocess === undefined) return old.subprocess ? { ...move, subprocess: old.subprocess } : move;
	if (move.move !== 'task' || old.move !== 'task' || !Array.isArray(move.subprocess) || move.subprocess.length || !old.subprocess?.length) return move;
	return { ...move, subprocess: old.subprocess };
}
/**
 * New move before move i; "continue at" is rewritten to the new IDs. `opts.inner`: on a subprocess level.
 * Before an exception line it goes before the step the exception hangs on, so the exception stays there.
 */
export const before = (moves: Move[], i: number, move: Move, language: Language, opts: TellOptions = {}): Move[] =>
	splice(moves, beforeAt(moves, i, language, opts), 0, [move], language, opts);
/** What "+ Insert before" offers before move i: what fits there and lets the rest go on (job 408). */
export function beforeOptions(moves: Move[], i: number, language: Language, opts: TellOptions = {}): MoveKind[] {
	const here = tell(moves.slice(0, beforeAt(moves, i, language, opts)), language, opts).options;
	return INSERTABLE.filter((o) => here.includes(o));
}
// insertAt: a move put before move i; a branch takes what follows into its first path, the others still open (job 408).
// exceptionAt: an exception on the step of move j, its path still open (job 408).
// triggerAdded: a further trigger after the triggers (job 408).
export { insertBefore as insertAt, addException as exceptionAt, addTrigger as triggerAdded };
/** Index where `before` puts a new move asked for before move i (the new move's index afterwards). */
export function beforeAt(moves: Move[], i: number, language: Language, opts: TellOptions = {}): number {
	const step = moves[i]?.move === 'exceptionPath' ? stepOf(moves, i, language, opts) : -1;
	return step >= 0 ? step : i;
}
export const remove = (moves: Move[], i: number, language: Language, opts: TellOptions = {}): Move[] => splice(moves, i, 1, [], language, opts);

/** Index of the task move the exception of move e hangs on, or -1. */
export function stepOf(moves: Move[], e: number, language: Language, opts: TellOptions = {}): number {
	if (moves[e]?.move !== 'exceptionPath') return -1;
	// The exception node move e adds: the one the story up to e has and the story before it has not.
	const had = new Set(tell(moves.slice(0, e), language, opts).ir.nodes.map((n) => n.id));
	const s = tell(moves.slice(0, e + 1), language, opts);
	const node = s.ir.nodes.find((n) => n.kind === 'exception' && !had.has(n.id));
	return node?.kind === 'exception' ? s.nodes.indexOf(node.attachedTo) : -1;
}

/** Index of the exception move hanging on the task of move j, or -1. */
export function exceptionOf(moves: Move[], j: number, language: Language, opts: TellOptions = {}): number {
	if (moves[j]?.move !== 'task') return -1;
	for (let e = j + 1; e < moves.length; e++) if (moves[e].move === 'exceptionPath' && stepOf(moves, e, language, opts) === j) return e;
	return -1;
}

/**
 * Deletes step i. A step with an exception takes the exception and its path along (the normal path
 * stays, as with "Delete exception path"); refused like that when something else leads into the path.
 * Refused, with the line to change, when a "continue at" leads to the step itself (job 414); one on
 * the step's own exception path goes along with it.
 */
export function removeStep(moves: Move[], i: number, language: Language, opts: TellOptions = {}): { moves: Move[] } | { error: string; line?: number } {
	const e = exceptionOf(moves, i, language, opts);
	const old = tell(moves, language, opts);
	const id = old.nodes[i];
	/** Is move j told on the exception path of move e (or a path branching off it)? */
	const onException = (j: number): boolean => descends(old.trace, old.trace.owner[j], `${e}.0`);
	if (id !== undefined)
		for (const [j, m] of moves.entries())
			if (j !== i && m.move === 'goTo' && m.target === id && !(e >= 0 && onException(j))) return stillLeads(j, old.ir, old.nodes, id, language);
	if (e < 0) return { moves: remove(moves, i, language, opts) };
	const r = removeBranch(moves, e, 1, language, opts);
	if ('error' in r) return r;
	// The step comes before its exception: its index is unchanged.
	return { moves: remove(r.moves, i, language, opts) };
}
/** The whole story after the moves of the level shown changed: on a subprocess level only its task changes.
 *  `any`: the flow of what can come at any time in that subprocess changed (job 397). */
export function atLevel(all: Move[], level: number | undefined, moves: Move[], any?: number): Move[] {
	if (level === undefined) return moves;
	if (any !== undefined) {
		const own = (all[level] as { subprocess?: Move[] } | undefined)?.subprocess;
		if (all[level]?.move !== 'task' || own?.[any]?.move !== 'anytime') return all;
		return atLevel(all, level, own.map((old, j) => (j === any ? { ...old, subprocess: moves } as Move : old)));
	}
	const z = all[level];
	if (z?.move !== 'task' && z?.move !== 'anytime') return all;
	return all.map((old, j) => (j === level ? { ...z, subprocess: moves } : old));
}
/** A task gets a flow behind it (still untold); one that has one keeps it. */
export const withSubprocess = (moves: Move[], i: number): Move[] =>
	moves.map((z, j) => (j === i && z.move === 'task' && !Array.isArray(z.subprocess) ? { ...z, subprocess: [] } : z));
export const undo = (moves: Move[]): Move[] => moves.slice(0, -1);
/** Tell open path i (from 0, as in View.open) now; the core counts from 1. */
export const switchTo = (moves: Move[], i: number): Move[] => [...moves, { move: 'switchTo', to: i + 1 }];

// In parallel has a form since it can have more than two branches (job 389).
const WITHOUT_FIELDS: MoveKind[] = ['merge', 'switchTo', 'openPath'];
export const hasFields = (subtype: MoveKind): boolean => !WITHOUT_FIELDS.includes(subtype);

/** keep:<n>: delete the branch of this line and keep its path n (from 0; on an exception 1 = the normal path). */
/** addPath: one more path for a branch, also after the story went on; tell: tell a path still open (job 395). */
/** drop:<n>: delete path n of a branch with three paths or more and keep the others (job 398). */
/** reopen: a merge, "continue at" or an end becomes a path still open again (job 400). */
/** addException: an exception on a step, its path still open; addTrigger: a further trigger on the first line (job 408). */
export type Action = 'edit' | 'before' | 'remove' | 'subprocess' | 'addPath' | 'tell' | 'reopen' | 'addException' | 'addTrigger' | `keep:${number}` | `drop:${number}`;
/** What the menu offers on a line. Plain deleting only for tasks, waiting and signals; a branch is
 *  deleted by keeping one of its paths. Merge, "continue at" and pulling forward belong to their
 *  path and go with it. `inner`: a line of a subprocess (no step before the plain start is
 *  impossible there, and no flow behind a task: one level only). */
export function lineActions(move: Move, index: number, inner = false, hasException = false): Action[] {
	const a: Action[] = [];
	if (hasFields(move.move)) a.push('edit');
	// The first trigger of the main flow takes further triggers (job 408).
	if (move.move === 'start' && index === 0 && !inner) a.push('addTrigger');
	// What can come at any time stands outside the main flow: nothing is inserted before it; deleting it
	// takes its flow along, and its flow is opened from its heading.
	if (move.move === 'anytime') return ['edit', 'subprocess', 'remove'];
	// A further trigger stands among the triggers: nothing goes before it; removing it leaves the others.
	if (move.move === 'orStart') return ['edit', 'remove'];
	// A path still open is told from its line; a step can go before it like before any line.
	if (move.move === 'openPath') return ['tell', 'before'];
	if (index > 0 || inner) a.push('before');
	// A step without an exception can get one, its path still open (job 408).
	if (move.move === 'task' && !hasException) a.push('addException');
	// What closes a path can be taken back: the path is open again, nothing else goes (job 400).
	if (move.move === 'merge' || move.move === 'goTo' || move.move === 'end') a.push('reopen');
	if (move.move === 'task' || move.move === 'wait' || move.move === 'sendSignal') a.push('remove');
	if (move.move === 'task' && !inner) a.push('subprocess');
	// The exception path is a side path: deleting it keeps the normal path.
	if ((move.move === 'decision' || move.move === 'concurrent') && branchPaths(move) < MAX_PATHS) a.push('addPath');
	if (move.move === 'exceptionPath') a.push('keep:1');
	else if (BRANCHES.includes(move.move)) for (let j = 0; j < branchPaths(move); j++) a.push(`keep:${j}`);
	// From three paths on one path can go alone; the otherwise path of a check stays.
	const count = branchPaths(move);
	const check = move.move === 'decision' && move.subtype !== 'first';
	if ((move.move === 'decision' || move.move === 'concurrent') && count >= 3) for (let j = 0; j < count - (check ? 1 : 0); j++) a.push(`drop:${j}`);
	return a;
}

/** Path number of a keep action, or null. */
export const keptPath = (a: string): number | null => (/^keep:\d+$/.test(a) ? Number(a.slice(5)) : null);

/** Path number of a drop action, or null. */
export const droppedPath = (a: string): number | null => (/^drop:\d+$/.test(a) ? Number(a.slice(5)) : null);

// dropPath: deletes path `path` of the branch in move i, the other paths stay; error when something else still leads into what goes.
// reopen: reopens the path that move i closes (merge, "continue at", end); error when it cannot be reopened there.
// keepPath: deletes the branch in move i and keeps path `keep`; error when something else still leads into what goes.
export { deletePath as dropPath, reopenPath as reopen, removeBranch as keepPath };

/**
 * Start values of the form "Add another path" on the line of a branch: the move with one empty path more,
 * before the otherwise path of a check, else as the last one; `focus`: the key of its field.
 */
export function withNewPath(move: Move): { start: Move; focus?: string } {
	if (move.move === 'concurrent') return { start: { ...move, branches: (move.branches ?? 2) + 1 } };
	if (move.move !== 'decision') return { start: move };
	const more = move.more ?? [];
	if (move.subtype !== 'first') return { start: { ...move, more: [...more, ''] }, focus: `more${more.length}` };
	const kinds = more.map((_, j) => move.moreKinds?.[j] || 'message');
	return { start: { ...move, more: [...more, move.no], moreKinds: [...kinds, move.noKind || 'message'], no: '', noKind: 'message' }, focus: 'no' };
}

/**
 * A changed line: a branch with more paths than before, while something is told after it, gets them
 * through addPaths (the new ones still open); anything else is replaced as it is.
 */
export function changeLine(moves: Move[], i: number, move: Move, language: Language, opts: TellOptions = {}): { moves: Move[] } | { error: string } {
	const old = moves[i];
	if (i < moves.length - 1 && (old?.move === 'decision' || old?.move === 'concurrent') && branchPaths(move) > branchPaths(old)) return addPaths(moves, i, move, language, opts);
	return { moves: replace(moves, i, move, language, opts) };
}


/** The next move on the path still open at move i: question, path and choices as the story stands there. */
export function hereState(moves: Move[], i: number, language: Language, opts: TellOptions = {}) {
	const s = tell(moves.slice(0, i), language, opts);
	return { question: s.question, options: s.options.filter((o) => !NOT_ON_OPEN.includes(o)), targets: s.targets, role: s.role, path: s.path, open: [] as string[], next: s.next && { depth: s.next.depth }, endKinds: s.endKinds, startKinds: s.startKinds, done: false };
}

// tellHere: tells a move on the path still open at move i (see tellOpen); `at`: where the telling goes on, null = told.
export { tellOpen as tellHere };

/**
 * Where a form's move goes. Only the block "Next move" (place 'added') tells on the path still open while
 * "Tell here" runs; a changed line and a step before a line go to their line.
 */
export function applyTarget(place: 'added' | 'replace' | 'before' | 'exception' | 'trigger', telling: boolean): 'replace' | 'before' | 'exception' | 'trigger' | 'tellOpen' | 'append' {
	if (place !== 'added') return place;
	return telling ? 'tellOpen' : 'append';
}

/** A line action ends "Tell here", except telling a path still open itself. */
export const endsTelling = (a: Action): boolean => a !== 'tell';

/** The paths still open of a level: the move of each and the name of its path. */
export function openPaths(moves: Move[], language: Language, opts: TellOptions = {}): { index: number; path: string }[] {
	return moves.flatMap((m, index) => (m.move === 'openPath' ? [{ index, path: tell(moves.slice(0, index), language, opts).path ?? '' }] : []));
}

/** Moves offered as large tiles (StoryCard.vue too). */
export const FREQUENT: MoveKind[] = ['start', 'task', 'end'];
/** Frequent ones as large tiles, the rest compact below. Without moves the
 *  start form is already open, so the button for it would be redundant. Keys 1-9: frequent, then rare. */
export function ranks(options: MoveKind[], moveCount: number): { frequent: MoveKind[]; rare: MoveKind[] } {
	const o = moveCount ? options : options.filter((x) => x !== 'start');
	return { frequent: FREQUENT.filter((x) => o.includes(x)), rare: o.filter((x) => !FREQUENT.includes(x)) };
}

/** Targets for "continue at" that were possible at move i (when changing in the middle of the story). */
export const targetsUntil = (moves: Move[], i: number, language: Language, opts: TellOptions = {}): Target[] => tell(moves.slice(0, i), language, opts).targets;

export type Result = { ok: true } | { ok: false; rejected: string[] } | { ok: false; stale: true };

/** One entry of the history: the whole story before a change and the level shown when it was made (job 409). */
export type Entry = { moves: Move[]; level?: number; any?: number };

/**
 * The state of the page. Changes are played in order; if the result of an
 * older replay arrives after a newer one, it is discarded. `earlier`: the history it starts with (see `carry`).
 */
export function workbench(language: Language, play: (z: Move[], s: Language, level?: number, any?: number) => Promise<View> = replay, earlier: Entry[] = []) {
	let moves: Move[] = [];
	let view: View | undefined;
	let num = 0;
	/** Earlier states of the whole story, newest last: undo goes back one change, also a deleted path. */
	const history: Entry[] = [...earlier];
	// The level shown stays across changes as long as its task still has a flow behind it.
	// record: keep the state before for undo (not the empty one before opening or the first move),
	// together with the level shown while the change was made.
	const shown = async (all: Move[], level: number | undefined, record = false, any?: number): Promise<Result> => {
		const mine = ++num;
		const before: Entry = { moves, level: view?.level, any: view?.any };
		const a = await play(all, language, level, any);
		if (mine !== num) return { ok: false, stale: true };
		if (record && before.moves.length && !sameMoves(before.moves, all)) history.push(before);
		moves = all;
		view = a;
		return { ok: true };
	};
	return {
		get moves() { return moves; },
		get view() { return view; },
		get level() { return view?.level; },
		get any() { return view?.any; },
		/** A copy of the history, oldest first. */
		get history(): Entry[] { return history.slice(); },
		language,
		/** New moves of the whole story. */
		async set(added: Move[]): Promise<Result> {
			const r = change(moves, added, language);
			if (r.rejected) return { ok: false, rejected: r.rejected };
			return shown(r.moves, view?.level, true, view?.any);
		},
		/** Is there an earlier state to go back to? */
		get canUndo() { return history.length > 0; },
		/** Back to the state before the last change, on the level it was made on; without one nothing changes. */
		async undo(): Promise<Result> {
			const previous = history.at(-1);
			if (!previous) return { ok: true };
			const r = await shown(previous.moves, previous.level, false, previous.any);
			const at = history.lastIndexOf(previous);
			if (r.ok && at >= 0) history.splice(at, 1);
			return r;
		},
		/** New moves of the level shown (on a subprocess level only that flow changes). */
		async setLevel(added: Move[]): Promise<Result> {
			return this.set(atLevel(moves, view?.level, added, view?.any));
		},
		/** Show the flow behind task move `level`, or the main level (undefined); `any`: the flow of what can
		 *  come at any time in that subprocess. Changes nothing. */
		show(level?: number, any?: number): Promise<Result> {
			return shown(moves, level, false, any);
		},
	};
}
export type Workbench = ReturnType<typeof workbench>;

/**
 * A new workbench for `moves` in `language` that keeps the history of `old` (job 409): a language change,
 * a restored unsaved state, an accepted proposal. The state of `old`, when it differs, becomes the newest
 * entry, so undo goes back to it. Undefined when the replay fails (the old workbench stays).
 */
export async function carry(old: Workbench | undefined, moves: Move[], language: Language, play?: (z: Move[], s: Language, level?: number, any?: number) => Promise<View>): Promise<Workbench | undefined> {
	const earlier = old?.history ?? [];
	if (old?.moves.length && !sameMoves(old.moves, moves)) earlier.push({ moves: old.moves, level: old.level, any: old.any });
	const wb = workbench(language, play, earlier);
	const r = await wb.set(moves);
	return r.ok ? wb : undefined;
}
