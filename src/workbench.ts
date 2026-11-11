/**
 * SPDX-FileCopyrightText: 2026 hotochan123
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
// State logic of the interface: pure, without Vue and without DOM (tests/client/workbench.test.ts).
// The state is the list of moves; every change replays it in the core.
import { tell, splice, run, emptyProcess, toSvg, renderBoth, tx, fromBpmn, LANGUAGES, read, asSourceText } from './core/index.js';
import type { Move, Line, Target, Issue, Language, ProcessIR } from './core/index.js';

export type MoveKind = Move['move'];

/** What the interface shows after a replay. */
export type View = {
	moves: Move[];
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
	svg: string;
	issues: Issue[];
	nodes: number;
	lanes: number;
	readingCopy: boolean;
	/** The working file (BPMN with the story); missing as long as there is no diagram. */
	xml?: string;
};

/** Diagram language from the account language: German for de*, otherwise English. */
export const diagramLanguage = (language: string | undefined): Language => (/^de\b|^de[_-]/i.test(language ?? '') ? 'de' : 'en');

export async function replay(moves: Move[], language: Language): Promise<View> {
	const g = tell(moves, language);
	const e = await run({ ir: { ...emptyProcess('P', g.ir.name, language), story: moves }, ops: g.ops });
	// Preview: role where the story continues, marked; DRAFT as long as no reading copy is possible.
	const svg = e.ir.nodes.length ? toSvg(e.ir, e.positions, { draft: !e.readingCopy, here: g.here }) : '';
	return {
		moves,
		question: g.question,
		options: g.options,
		targets: g.targets,
		roles: g.roles,
		role: g.role,
		path: g.path,
		open: g.open,
		next: g.next,
		done: g.done,
		errors: g.errors,
		storyText: g.storyText,
		endKinds: g.endKinds,
		svg,
		// On the way the diagram is necessarily incomplete: show the check only at the end.
		issues: g.done ? e.issues : [],
		nodes: e.ir.nodes.length,
		lanes: e.ir.lanes.length,
		readingCopy: e.readingCopy,
		xml: e.ir.nodes.length ? e.xml : undefined,
	};
}

/** New moves count only if they replay without errors; otherwise the old state stays. */
export function change(old: Move[], added: Move[], language: Language): { moves: Move[]; rejected?: string[] } {
	const errors = tell(added, language).errors;
	return errors.length ? { moves: old, rejected: errors } : { moves: added };
}

export const append = (moves: Move[], move: Move): Move[] => [...moves, move];
export const replace = (moves: Move[], i: number, move: Move): Move[] => moves.map((old, j) => (j === i ? move : old));
/** New move before move i; "continue at" is rewritten to the new IDs. */
export const before = (moves: Move[], i: number, move: Move, language: Language): Move[] => splice(moves, i, 0, [move], language);
export const remove = (moves: Move[], i: number, language: Language): Move[] => splice(moves, i, 1, [], language);
export const undo = (moves: Move[]): Move[] => moves.slice(0, -1);
/** Tell open path i (from 0, as in View.open) now; the core counts from 1. */
export const switchTo = (moves: Move[], i: number): Move[] => [...moves, { move: 'switchTo', to: i + 1 }];

const WITHOUT_FIELDS: MoveKind[] = ['concurrent', 'merge', 'switchTo'];
export const hasFields = (subtype: MoveKind): boolean => !WITHOUT_FIELDS.includes(subtype);

export type Action = 'edit' | 'before' | 'remove';
/** What the menu offers on a line. Deleting only for tasks and waiting:
 *  anything else would redistribute the paths behind it. */
export function lineActions(move: Move, index: number): Action[] {
	const a: Action[] = [];
	if (hasFields(move.move)) a.push('edit');
	if (index > 0) a.push('before');
	if (move.move === 'task' || move.move === 'wait') a.push('remove');
	return a;
}

const FREQUENT: MoveKind[] = ['start', 'task', 'end'];
/** Frequent ones as large tiles, the rest compact below. Without moves the
 *  start form is already open, so the button for it would be redundant. Keys 1-9: frequent, then rare. */
export function ranks(options: MoveKind[], moveCount: number): { frequent: MoveKind[]; rare: MoveKind[] } {
	const o = moveCount ? options : options.filter((x) => x !== 'start');
	return { frequent: FREQUENT.filter((x) => o.includes(x)), rare: o.filter((x) => !FREQUENT.includes(x)) };
}

export type FieldKind = 'text' | 'choice' | 'role' | 'target';
export type Field = { key: string; subtype: FieldKind; optional: boolean; values?: string[] };

const T = (key: string, optional = false): Field => ({ key, subtype: 'text', optional });
const A = (key: string, values: string[]): Field => ({ key, subtype: 'choice', optional: false, values });
const EVENT = ['message', 'time', 'condition'];

const FIELDS: Record<string, Field[]> = {
	start: [T('process', true), T('text'), A('subtype', ['', ...EVENT]), { key: 'role', subtype: 'role', optional: false }],
	task: [T('text'), { key: 'role', subtype: 'role', optional: false }, T('system', true), T('documentName', true), T('deadline', true)],
	wait: [T('text'), A('subtype', EVENT)],
	decision: [A('subtype', ['', 'first']), T('question'), T('yes'), T('no')],
	first: [A('subtype', ['', 'first']), T('yes'), A('yesKind', EVENT), T('no'), A('noKind', EVENT)],
	exceptionPath: [T('text'), A('subtype', ['error', 'deadline', 'message']), A('keepsRunning', ['', 'yes'])],
	end: [T('text'), A('subtype', ['', 'message', 'cancel'])],
	goTo: [{ key: 'target', subtype: 'target', optional: false }],
};

type Values = Record<string, string | undefined>;

/**
 * Fields of the form for a move. "What happens first" is a kind of decision
 * with its own fields; for an error the task never keeps running, so the exception
 * does not ask for it. End offers only the kinds that work at this point (plus the
 * current value when changing).
 */
export function fields(subtype: MoveKind, values: Values = {}, endKinds: string[] = ['', 'message']): Field[] {
	const list = FIELDS[subtype === 'decision' && values.subtype === 'first' ? 'first' : subtype] ?? [];
	return list
		.filter((f) => f.key !== 'keepsRunning' || (values.subtype ?? 'error') !== 'error')
		.map((f) => (subtype === 'end' && f.key === 'subtype'
			? { ...f, values: f.values!.filter((w) => w === (values.subtype ?? '') || endKinds.includes(w)) }
			: f));
}

/** Prefill of a new form: role as last time, paths of a check with yes/no. */
export function prefill(subtype: MoveKind, values: Values, language: Language, role?: string): Values {
	const v: Values = {};
	for (const f of fields(subtype, values)) {
		if (f.subtype === 'choice') v[f.key] = f.values![0];
		else if (f.subtype === 'role') v[f.key] = role ?? '';
		else v[f.key] = '';
	}
	if (subtype === 'decision' && values.subtype !== 'first') {
		v.yes = tx(language, 'ja', 'yes');
		v.no = tx(language, 'nein', 'no');
	}
	return { ...v, ...values };
}

/** Empty required fields. A new role (choice empty, field newRole present) must have a name. */
export function requiredEmpty(subtype: MoveKind, values: Values): string[] {
	const empty: string[] = [];
	for (const f of fields(subtype, values)) {
		if (f.optional || f.subtype === 'choice') continue;
		if (f.subtype === 'role' && !(values.role ?? '').trim() && 'newRole' in values) {
			if (!(values.newRole ?? '').trim()) empty.push('newRole');
			continue;
		}
		if (!(values[f.key] ?? '').trim()) empty.push(f.key);
	}
	return empty;
}

/** Move from the values of the form: texts trimmed, empty optional fields dropped. */
export function moveFromForm(subtype: MoveKind, values: Values): Move {
	const z: Record<string, string> = { move: subtype };
	for (const f of fields(subtype, values)) {
		let w = (values[f.key] ?? '').trim();
		if (f.subtype === 'role' && !w) w = (values.newRole ?? '').trim();
		if (f.optional && !w) continue;
		z[f.key] = w;
	}
	return z as unknown as Move;
}

/** Targets for "continue at" that were possible at move i (when changing in the middle of the story). */
export const targetsUntil = (moves: Move[], i: number, language: Language): Target[] => tell(moves.slice(0, i), language).targets;

/** Keys 1-9 choose an option, not with Ctrl/Meta/Alt and not in an input field. */
export function digitKey(e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; target?: unknown }): number | null {
	if (!/^[1-9]$/.test(e.key) || e.ctrlKey || e.metaKey || e.altKey) return null;
	const tag = String((e.target as { tagName?: string } | null)?.tagName ?? '').toLowerCase();
	if (['input', 'select', 'textarea'].includes(tag)) return null;
	if ((e.target as { isContentEditable?: boolean } | null)?.isContentEditable) return null;
	return Number(e.key) - 1;
}

export type Part = { subtype: 'text' | 'sw' | 'o'; text: string; object?: string };
const OBJECT: Record<string, string> = { '@': 'role', '#': 'system', '+': 'document', '!': 'deadline', '?': 'question' };
/**
 * One line of story text in parts: signal word at the start (UPPERCASE), objects in square
 * brackets with the kind from the leading character. The interface inserts the parts only as text.
 */
export function lineParts(text: string): Part[] {
	const parts: Part[] = [];
	let rest = text;
	const sw = rest.match(/^([A-ZÄÖÜ][A-ZÄÖÜ ]+)(?=[:. ]|$)/);
	if (sw) {
		parts.push({ subtype: 'sw', text: sw[1] });
		rest = rest.slice(sw[1].length);
	}
	const re = /\[([@#+!?]?)([^\]]*)\]/g;
	let pos = 0;
	for (let m; (m = re.exec(rest));) {
		if (m.index > pos) parts.push({ subtype: 'text', text: rest.slice(pos, m.index) });
		parts.push({ subtype: 'o', text: m[2] + (m[1] === '?' ? '?' : ''), object: OBJECT[m[1]] ?? 'task' });
		pos = m.index + m[0].length;
	}
	if (pos < rest.length) parts.push({ subtype: 'text', text: rest.slice(pos) });
	return parts;
}

export type Result = { ok: true } | { ok: false; rejected: string[] } | { ok: false; stale: true };

/**
 * The state of the page. Changes are played in order; if the result of an
 * older replay arrives after a newer one, it is discarded.
 */
export function workbench(language: Language, play: (z: Move[], s: Language) => Promise<View> = replay) {
	let moves: Move[] = [];
	let view: View | undefined;
	let num = 0;
	return {
		get moves() { return moves; },
		get view() { return view; },
		language,
		async set(added: Move[]): Promise<Result> {
			const r = change(moves, added, language);
			if (r.rejected) return { ok: false, rejected: r.rejected };
			const mine = ++num;
			const a = await play(r.moves, language);
			if (mine !== num) return { ok: false, stale: true };
			moves = r.moves;
			view = a;
			return { ok: true };
		},
	};
}
export type Workbench = ReturnType<typeof workbench>;

// Working file: opening, file name, unsaved changes.

/** What two diagrams must have in common so that nothing was added from outside (like dev/legacy/server.ts). */
const fingerprint = (ir: ProcessIR): string => JSON.stringify([ir.nodes.map((k) => k.id + '|' + k.name).sort(), ir.edges.length]);

export type Loaded = { moves: Move[]; language: Language; changed: boolean } | { errors: 'no-story' | 'unreadable' };

/**
 * Reads a working file: the story is continued from the moves in the file, not from the graph.
 * `changed`: the replay differs from the diagram in the file, so the file was edited in a
 * modeler, and those changes are missing after the next save.
 */
export async function loadStory(xml: string, fallbackLanguage: Language): Promise<Loaded> {
	let ir: ProcessIR;
	try {
		ir = (await fromBpmn(xml)).ir;
	} catch {
		return { errors: 'unreadable' };
	}
	if (!ir.story?.length) return { errors: 'no-story' };
	const language = LANGUAGES.find((s) => s === ir.language) ?? fallbackLanguage;
	const moves = ir.story as Move[];
	// The moves come from a foreign file: what the core cannot replay is unreadable.
	try {
		if (!moves.every((z) => z && typeof z === 'object' && typeof (z as { move?: unknown }).move === 'string')) return { errors: 'unreadable' };
		const g = tell(moves, language);
		if (g.errors.length) return { errors: 'unreadable' };
		const after = (await run({ ir: emptyProcess('P', ir.name, language), ops: g.ops })).ir;
		return { moves, language, changed: fingerprint(after) !== fingerprint(ir) };
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
	JSON.stringify(moves) !== JSON.stringify(saved) || (moves.length > 0 && language !== savedLanguage);

// Publishing: reading copy (PDF) and image (SVG) like renderBoth() of the core.

export type Outputs = { pdf: Uint8Array; svg: string; draft: boolean };

/**
 * PDF and SVG of a state. DRAFT appears in them as long as the core allows no reading copy
 * (open points, check messages); from page 2 of the PDF the story text. The marker "story
 * continues here" of the preview is missing. Without a diagram an error.
 */
export async function outputs(moves: Move[], language: Language): Promise<Outputs> {
	const g = tell(moves, language);
	const e = await run({ ir: { ...emptyProcess('P', g.ir.name, language), story: moves }, ops: g.ops });
	if (!e.ir.nodes.length) throw new Error('no diagram');
	const { svg, pdf } = await renderBoth(e.ir, e.positions, e.readingCopy, asSourceText(g.storyText));
	return { pdf, svg, draft: !e.readingCopy };
}

// Edit as text: the story text is read back in the browser (core: read()).

/** Content of the editor: the story text with indentation, as read() reads it back. */
export const textFrom = (storyText: Line[]): string => asSourceText(storyText);

export type TextResult = { moves: Move[]; number: number; errors: string[]; line?: number };

/**
 * Text -> moves. On an error no moves (the old state stays). The process name
 * is not in the text: it comes from the previous start move.
 */
export function textMoves(text: string, old: Move[], language: Language): TextResult {
	const r = read(text, language);
	if (r.errors.length) return { moves: [], number: r.moves.length, errors: r.errors, ...(r.line !== undefined && { line: r.line }) };
	return { moves: withProcess(r.moves, old), number: r.moves.length, errors: [] };
}

/** Process name of the old start move onto the new moves (it is not in the story text). */
export function withProcess(moves: Move[], old: Move[]): Move[] {
	const process = old[0]?.move === 'start' ? old[0].process : undefined;
	if (!process || moves[0]?.move !== 'start') return moves;
	return [{ ...moves[0], process }, ...moves.slice(1)];
}

/** What textChecker needs from a worker (Web Worker in the browser, a dummy in the test). */
export type CheckerWorker = {
	postMessage(m: { num: number; text: string; language: Language }): void;
	terminate(): void;
	onmessage: ((e: { data: { num: number; result: TextResult } }) => void) | null;
	onerror: ((e: unknown) => void) | null;
};

/**
 * Checking while typing without freezing the page: read() replays line by line and takes
 * seconds for 200 lines. The work is done in a worker; if none starts or it fails,
 * the page calculates itself (synchronously, as before). Result without process name (withProcess).
 */
export function textChecker(language: Language, newWorker?: () => CheckerWorker) {
	let w: CheckerWorker | null = null;
	let num = 0;
	const open = new Map<number, { text: string; done: (r: TextResult) => void }>();
	const itself = (text: string) => textMoves(text, [], language);
	const from = () => {
		w?.terminate();
		w = null;
		for (const { text, done } of open.values()) done(itself(text));
		open.clear();
	};
	try {
		w = newWorker?.() ?? null;
	} catch {
		w = null;
	}
	if (w) {
		w.onmessage = (e) => {
			const o = open.get(e.data.num);
			open.delete(e.data.num);
			o?.done(e.data.result);
		};
		w.onerror = from;
	}
	return {
		get inWorker() { return w !== null; },
		check(text: string): Promise<TextResult> {
			if (!w) return Promise.resolve(itself(text));
			const mine = ++num;
			return new Promise((done) => {
				open.set(mine, { text, done });
				w!.postMessage({ num: mine, text, language });
			});
		},
		end() {
			w?.terminate();
			w = null;
			open.clear();
		},
	};
}

/** Checking while typing: number of recognized moves or the first error with line. */
export function checkText(text: string, language: Language): { number: number; errors: string[]; line?: number } {
	const { number, errors, line } = textMoves(text, [], language);
	return { number, errors, ...(line !== undefined && { line }) };
}

/**
 * One line of the editor in parts for the colored layer under the text field. Unlike
 * lineParts every character stays (indentation, brackets, @#+!?): the layer must lie
 * exactly under the text in the text field.
 */
export function textParts(line: string): Part[] {
	const parts: Part[] = [];
	const front = line.match(/^\s*/)![0];
	if (front) parts.push({ subtype: 'text', text: front });
	let rest = line.slice(front.length);
	const sw = rest.match(/^([A-ZÄÖÜ][A-ZÄÖÜ ]*[A-ZÄÖÜ])(?=[:. ]|$)/);
	if (sw) {
		parts.push({ subtype: 'sw', text: sw[1] });
		rest = rest.slice(sw[1].length);
	}
	const re = /\[([@#+!?]?)([^\]]*)\]/g;
	let pos = 0;
	for (let m; (m = re.exec(rest));) {
		if (m.index > pos) parts.push({ subtype: 'text', text: rest.slice(pos, m.index) });
		parts.push({ subtype: 'o', text: m[0], object: OBJECT[m[1]] ?? 'task' });
		pos = m.index + m[0].length;
	}
	if (pos < rest.length) parts.push({ subtype: 'text', text: rest.slice(pos) });
	return parts;
}

/** Pattern of the writing aid in the diagram language (only these does the core read back). */
export const helpPattern = (language: Language): string[] => [
	tx(language, 'ES BEGINNT: [Auslöser] bei [@Stelle].', 'IT STARTS: [trigger] at [@role].'),
	tx(language, '[@Stelle] soll [Schritt] in [#System], Frist [!3 Tage].', '[@role] shall [step] in [#system], deadline [!3 days].'),
	tx(language, 'WARTEN AUF [Antwort]  ·  WARTEN AUF [!3 Tage]  ·  WARTEN BIS [Lager voll]', 'WAIT FOR [reply]  ·  WAIT FOR [!3 days]  ·  WAIT UNTIL [stock full]'),
	tx(language, 'WENN [?Frage]  ·  → ja:  ·  SONST → nein:', 'IF [?question]  ·  → yes:  ·  ELSE → no:'),
	tx(language, 'GLEICHZEITIG:  ·  – erster Strang:  ·  – zweiter Strang:', 'IN PARALLEL:  ·  – first branch:  ·  – second branch:'),
	tx(language, 'FALLS [Abweichung]:', 'IN CASE OF [deviation]:'),
	tx(language, 'ZUSAMMEN.  ·  WEITER BEI [Schritt].', 'MERGE.  ·  CONTINUE AT [step].'),
	tx(language, 'WEITER AUF DEM WEG „Frage“ → ja:', 'BACK ON THE PATH “question” → yes:'),
	tx(language, 'ENDE: [Zustand].', 'END: [state].'),
];
