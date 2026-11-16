/**
 * SPDX-FileCopyrightText: 2026 hotochan123
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
// The working file: opening, file names, unsaved changes, publishing and saving (tests/client/workbench.test.ts).
import { tell, run, emptyProcess, renderBoth, fromBpmn, LANGUAGES, asSourceText, levels, sameMoves, countMoves, MAX_STORY_MOVES, reopenLegacyGoTos, retargetGoTos, dropRefused, moveLine } from './core/index.js';
import type { Move, Language, ProcessIR, Approval, ReadingCopyState } from './core/index.js';
import { isValidState } from './approval.js';

/** Replays a story in the core: the story state `g` and the diagram `e` (`extra` goes into the IR, e.g. the approval state). */
export async function played(moves: Move[], language: Language, extra: Partial<ProcessIR> = {}) {
	const g = tell(moves, language);
	const e = await run({ ir: { ...emptyProcess('P', g.ir.name, language), story: moves, ...extra }, ops: g.ops });
	return { g, e };
}


/**
 * What two diagrams must have in common so that nothing was added from outside: the kind and name of every
 * shape but the unnamed branches and merge points. Not their IDs or the number of flows (job 440): 0.1.0 made
 * its merge points differently, so an unchanged file of 0.1.0 differs there from the replay.
 */
const fingerprint = (ir: ProcessIR): string =>
	JSON.stringify(levels(ir).flatMap((l) => l.nodes).filter((k) => k.kind !== 'gateway' || (k.name ?? '') !== '').map((k) => k.kind + '|' + (k.name ?? '')).sort());

/** `approval`: the approval state of the file; `approvalUnreadable`: it had one that could not be read.
 *  `reopened`: lines (from 1) of a 0.1.0 file whose "continue at" into a branch of "in parallel" became a path
 *  still open (job 438); `moves` are then the repaired ones, `stored` the moves of the file (saved only on Save).
 *  `dropped`: moves of the file the core refuses, left out on opening (job 439), each with its line (from 1, in
 *  the file) and its text; `reopened` then counts lines of the repaired story.
 *  `retargeted`: lines (from 1) whose "continue at" got the ID its step has now (job 440, 0.1.0 counted IDs
 *  differently), nothing left out; beside `reopened` when the file needs both (job 442), never a line of both.
 *  Never an empty list. */
export type Dropped = { line: number; text: string };
export type Loaded = { moves: Move[]; language: Language; changed: boolean; approval?: Approval; approvalUnreadable?: boolean; reopened?: number[]; dropped?: Dropped[]; retargeted?: number[]; stored?: Move[] } | { errors: 'no-story' | 'unreadable' | 'too-long' };

/**
 * Reads a working file: the story is continued from the moves in the file, not from the graph.
 * `changed`: the replay differs from the diagram in the file, so the file was edited in a
 * modeler, and those changes are missing after the next save.
 */
export async function loadStory(xml: string, fallbackLanguage: Language): Promise<Loaded> {
	let ir: ProcessIR;
	let approvalUnreadable = false;
	try {
		const r = await fromBpmn(xml);
		ir = r.ir;
		approvalUnreadable = !!r.approvalUnreadable;
	} catch {
		return { errors: 'unreadable' };
	}
	if (!ir.story?.length) return { errors: 'no-story' };
	const language = LANGUAGES.find((s) => s === ir.language) ?? fallbackLanguage;
	const moves = ir.story as Move[];
	// Checked before any replay: thousands of moves would stall the page for minutes.
	try {
		if (countMoves(moves) > MAX_STORY_MOVES) return { errors: 'too-long' };
	} catch {
		return { errors: 'unreadable' };
	}
	// The moves come from a foreign file: what the core cannot replay is unreadable.
	try {
		if (!moves.every((z) => z && typeof z === 'object' && typeof (z as { move?: unknown }).move === 'string')) return { errors: 'unreadable' };
		let g = tell(moves, language);
		let told = moves;
		let reopened: number[] | undefined;
		let dropped: Dropped[] | undefined;
		let retargeted: number[] | undefined;
		let rebuilt = true;
		// 0.1.0 numbered nodes differently after its extra merge (job 440): a stored "continue at" may name
		// another step now without any error, so its target is always matched with the diagram of the file.
		// Job 442: the rewritten targets are kept whatever else the file needs, so the repairs below start from them
		// (a target rewritten into a branch of "in parallel" is reopened like any other).
		const r = retargetGoTos(moves, language, ir);
		const base = r.lines.length ? r.moves : moves;
		const again = r.lines.length ? tell(base, language) : g;
		if (!again.errors.length) {
			g = again;
			told = base;
			if (r.lines.length) retargeted = r.lines;
		} else {
			// A file of 0.1.0 may continue into a branch of "in parallel" (refused since job 411): repaired, not unreadable.
			const o = reopenLegacyGoTos(base, language);
			if (!('error' in o)) {
				// Compared with the diagram 0.1.0 made of these moves (their rewritten targets, job 443), so "changed outside" stays true to the file.
				g = tell(base, language, { legacyGoTo: true });
				told = o.moves;
				reopened = o.lines;
				// A line rewritten into a branch and then reopened is named once, as reopened.
				const lines = r.lines.filter((l) => !o.lines.includes(l));
				if (lines.length) retargeted = lines;
			} else {
				// Other lines the core refuses (job 439, e.g. the extra path 0.1.0 left open): left out, the rest plays.
				const d = dropRefused(moves, language, ir);
				if ('error' in d) return { errors: 'unreadable' };
				told = d.moves;
				if (tell(told, language).errors.length) {
					const again = reopenLegacyGoTos(told, language);
					if ('error' in again) return { errors: 'unreadable' };
					told = again.moves;
					reopened = again.lines;
				}
				if (tell(told, language).errors.length) return { errors: 'unreadable' };
				// The diagram of the file cannot be rebuilt once lines are left out or reopened: no "changed outside" then.
				rebuilt = !d.dropped.length && !reopened;
				if (rebuilt) g = tell(told, language);
				if (d.dropped.length)
					dropped = d.dropped.map((i) => {
						const z = moves[i];
						const line = moveLine(z, language, z.move === 'goTo' ? ir.nodes.find((n) => n.id === z.target)?.name : undefined);
						return { line: i + 1, text: line.length > 80 ? line.slice(0, 79) + '…' : line };
					});
				// Only targets rewritten, nothing left out (job 440): their note, not one on dropped lines without a line.
				else if (!reopened) {
					const lines = moves.flatMap((z, i) => (z.move === 'goTo' && told[i]?.move === 'goTo' && (told[i] as { target?: string }).target !== z.target ? [i + 1] : []));
					if (lines.length) retargeted = lines;
				}
				// Reopened too (job 442): the lines matched with the diagram of the file are named beside the reopened ones.
				else if (r.lines.some((l) => !reopened!.includes(l))) retargeted = r.lines.filter((l) => !reopened!.includes(l));
			}
		}
		const changed = rebuilt ? fingerprint((await run({ ir: emptyProcess('P', ir.name, language), ops: g.ops })).ir) !== fingerprint(ir) : false;
		let approval = ir.approval;
		// The valid version must replay too; otherwise the approval state is left out, not the story.
		if (approval?.valid && tell(approval.valid.moves as Move[], approval.valid.language).errors.length) {
			approval = undefined;
			approvalUnreadable = true;
		}
		return { moves: told, language, changed, ...(approval ? { approval } : {}), ...(approvalUnreadable ? { approvalUnreadable } : {}), ...(reopened ? { reopened } : {}), ...(dropped ? { dropped } : {}), ...(retargeted ? { retargeted } : {}), ...(reopened || dropped || retargeted ? { stored: moves } : {}) };
	} catch {
		return { errors: 'unreadable' };
	}
}

/** Suggestion for "Save as": the process name without characters that are a problem in file names. */
export function fileSuggestion(process: string | undefined): string {
	// eslint-disable-next-line no-control-regex
	const name = (process ?? '').replace(/[/\\:*?"<>|\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').trim();
	return (name || 'process').slice(0, 190) + '.bpmn';
}

/**
 * Name of an output (reading copy .pdf, image .svg): the name of the open working file with the
 * new extension, without an open file the suggestion from the process name.
 */
export function outputName(file: { name?: string } | null | undefined, process: string | undefined, extension: 'pdf' | 'svg'): string {
	const base = file?.name && /\.bpmn$/i.test(file.name) ? file.name : fileSuggestion(process);
	return base.replace(/\.bpmn$/i, '') + '.' + extension;
}

/**
 * Does the state differ from the last loaded or saved one? Other moves, or a
 * story told in another language (it is in the file). Without languages only
 * the moves count.
 */
export const unsaved = (moves: Move[], saved: Move[], language?: Language, savedLanguage?: Language): boolean =>
	!sameMoves(moves, saved) || (moves.length > 0 && language !== savedLanguage);

// Publishing: reading copy (PDF) and image (SVG) like renderBoth() of the core.

export type Outputs = { pdf: Uint8Array; svg: string; draft: boolean };

/**
 * PDF and SVG of a state. DRAFT appears in them as long as the story is not fully told or
 * the core allows no reading copy (open points, check messages); from page 2 of the PDF the
 * story text. The marker "story continues here" of the preview is missing. Without a diagram
 * an error.
 */
export async function outputs(moves: Move[], language: Language, copy?: ReadingCopyState): Promise<Outputs> {
	const { g, e } = await played(moves, language);
	if (!e.ir.nodes.length) throw new Error('no diagram');
	// An unfinished story is a draft even where the core would allow a reading copy.
	const readingCopy = g.done && e.readingCopy;
	const { svg, pdf } = await renderBoth(e.ir, e.positions, readingCopy, asSourceText(g.storyText), copy);
	return { pdf, svg, draft: !readingCopy || (copy !== undefined && !copy.valid) };
}

/**
 * Head and foot of the reading copy for a state: a valid version only when the state is exactly the
 * valid version (then without DRAFT), else a draft naming the version that applies.
 */
export function copyState(approval: Approval | null | undefined, moves: Move[], language: Language, file?: string): ReadingCopyState {
	const v = approval?.valid;
	const named = file ? { file } : {};
	if (v && isValidState(approval, moves, language))
		return { valid: { number: v.number, date: v.date, by: v.by.name || v.by.uid, ...(v.previous ? { previous: v.previous } : {}) }, ...named };
	return { ...(v ? { lastValid: { number: v.number, date: v.date } } : {}), ...named };
}

/** The working file of a state with its approval state (what Save writes). */
export async function fileXml(moves: Move[], language: Language, approval?: Approval | null): Promise<string | undefined> {
	const { e } = await played(moves, language, approval ? { approval } : {});
	return e.ir.nodes.length ? e.xml : undefined;
}

export type SaveResult = 'saved' | 'conflict' | 'failed' | 'cancelled';
export type PublishResult = SaveResult | 'published' | 'publishFailed';

/**
 * "Publish" in one click: unsaved changes (or no writable file) are saved first, then the
 * reading copy is filed. A conflict, a failed or a cancelled save files nothing.
 */
export async function saveThenPublish(o: {
	needsSave: boolean;
	save: () => Promise<SaveResult>;
	publish: () => Promise<boolean>;
}): Promise<PublishResult> {
	if (o.needsSave) {
		const r = await o.save();
		if (r !== 'saved') return r;
	}
	return (await o.publish()) ? 'published' : 'publishFailed';
}

