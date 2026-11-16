/**
 * SPDX-FileCopyrightText: 2026 hotochan123
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
// The form of a move: its fields, prefill, required fields and the move built from it (pure, no Vue).
import { MAX_PATHS, tx, EVENT_KINDS, END_KINDS, START_KINDS } from './core/index.js';
import type { Move, Language } from './core/index.js';

type MoveKind = Move['move'];

export type FieldKind = 'text' | 'choice' | 'role' | 'target';
export type Field = { key: string; subtype: FieldKind; optional: boolean; values?: string[] };

const T = (key: string, optional = false): Field => ({ key, subtype: 'text', optional });
const A = (key: string, values: string[]): Field => ({ key, subtype: 'choice', optional: false, values });

const FIELDS: Record<string, Field[]> = {
	start: [T('process', true), T('text'), A('subtype', ['', ...EVENT_KINDS]), { key: 'role', subtype: 'role', optional: false }],
	task: [T('text'), { key: 'role', subtype: 'role', optional: false }, T('system', true), T('documentName', true), T('deadline', true), A('subprocess', ['', 'yes']), A('forEach', ['', 'yes']), T('each'), A('eachOrder', ['sequential', 'parallel'])],
	wait: [T('text'), A('subtype', EVENT_KINDS)],
	decision: [A('subtype', ['', 'first']), T('question'), T('yes'), T('no')],
	first: [A('subtype', ['', 'first']), T('yes'), A('yesKind', EVENT_KINDS), T('no'), A('noKind', EVENT_KINDS)],
	exceptionPath: [T('text'), A('subtype', ['error', 'deadline', 'message']), A('keepsRunning', ['', 'yes'])],
	end: [T('text'), A('subtype', ['', 'message', 'signal', 'cancel'])],
	sendSignal: [T('text'), { key: 'role', subtype: 'role', optional: false }],
	goTo: [{ key: 'target', subtype: 'target', optional: false }],
	anytime: [T('text'), A('subtype', EVENT_KINDS), A('keepsRunning', ['', 'yes'])],
	orStart: [T('text'), A('subtype', ['', ...EVENT_KINDS]), { key: 'role', subtype: 'role', optional: false }],
};

type Values = Record<string, string | undefined>;

/**
 * Fields of the form for a move. "What happens first" is a kind of decision
 * with its own fields; for an error the task never keeps running, so the exception
 * does not ask for it. End offers only the kinds that work at this point (plus the
 * current value when changing).
 */
export function fields(subtype: MoveKind, values: Values = {}, endKinds: string[] = END_KINDS, inner = false, startKinds: string[] = START_KINDS): Field[] {
	const first = subtype === 'decision' && values.subtype === 'first';
	let list = FIELDS[first ? 'first' : subtype] ?? [];
	// The further paths sit between the first path and the last one.
	if (subtype === 'decision') {
		const more = Array.from({ length: morePaths(values) }, (_, j) => (first ? [T(`more${j}`), A(`more${j}Kind`, EVENT_KINDS)] : [T(`more${j}`)])).flat();
		const at = list.findIndex((f) => f.key === 'no');
		list = [...list.slice(0, at), ...more, ...list.slice(at)];
	}
	return list
		.filter((f) => f.key !== 'keepsRunning' || subtype !== 'exceptionPath' || (values.subtype ?? 'error') !== 'error')
		// One level only: a task inside a subprocess has no flow behind it.
		.filter((f) => f.key !== 'subprocess' || !inner)
		// What the step runs for and how: only when it runs for each item.
		.filter((f) => (f.key !== 'each' && f.key !== 'eachOrder') || values.forEach === 'yes')
		.map((f) => (subtype === 'end' && f.key === 'subtype'
			? { ...f, values: f.values!.filter((w) => w === (values.subtype ?? '') || endKinds.includes(w)) }
			: f))
		// A further trigger: only the kinds that work here (one plain trigger at most), plus its current kind.
		.map((f) => (subtype === 'orStart' && f.key === 'subtype'
			? { ...f, values: f.values!.filter((w) => w === values.subtype || startKinds.includes(w)) }
			: f));
}

/** Fields of the form that take the name of a signal (they get the names already used as suggestions). */
export function signalFields(subtype: MoveKind, values: Values): string[] {
	if (subtype === 'sendSignal') return ['text'];
	if (subtype === 'decision' && values.subtype === 'first') return ['yes', ...Array.from({ length: morePaths(values) }, (_, j) => `more${j}`), 'no'].filter((k) => values[`${k}Kind`] === 'signal');
	return ['start', 'orStart', 'wait', 'end', 'anytime'].includes(subtype) && values.subtype === 'signal' ? ['text'] : [];
}

/** Number of further paths in the form values (keys more0, more1 …, each with moreNKind for "what comes first"). */
export function morePaths(values: Values): number {
	let n = 0;
	while (`more${n}` in values) n++;
	return n;
}

/** Number of branches of "in parallel" in the form values. */
export const branchCount = (values: Values): number => Math.max(2, Number(values.branches) || 2);

/** Paths of the branch in the form: first, the further ones, the last (decision); branches (in parallel). */
export const pathCount = (subtype: MoveKind, values: Values): number => (subtype === 'concurrent' ? branchCount(values) : 2 + morePaths(values));

/** "Add another path": an empty further path before the last one, or one more branch. `last`: for "what
 *  comes first" after the story went on, the new path is the last one (the old last one moves before it). */
export function addPath(subtype: MoveKind, values: Values, last = false): Values {
	if (pathCount(subtype, values) >= MAX_PATHS) return values;
	if (subtype === 'concurrent') return { ...values, branches: String(branchCount(values) + 1) };
	const n = morePaths(values);
	if (last && values.subtype === 'first') return { ...values, [`more${n}`]: values.no ?? '', [`more${n}Kind`]: values.noKind || EVENT_KINDS[0], no: '', noKind: EVENT_KINDS[0] };
	return { ...values, [`more${n}`]: '', ...(values.subtype === 'first' && { [`more${n}Kind`]: EVENT_KINDS[0] }) };
}

/** "Remove path": further path j (from 0); for in parallel the last branch (they have no names). Never below two. */
export function removePath(subtype: MoveKind, values: Values, j: number): Values {
	if (subtype === 'concurrent') {
		const n = branchCount(values) - 1;
		const v = { ...values };
		if (n > 2) v.branches = String(n);
		else delete v.branches;
		return v;
	}
	const n = morePaths(values);
	if (j < 0 || j >= n) return values;
	const v = { ...values };
	for (let k = j; k < n - 1; k++) {
		v[`more${k}`] = v[`more${k + 1}`];
		v[`more${k}Kind`] = v[`more${k + 1}Kind`];
	}
	delete v[`more${n - 1}`];
	delete v[`more${n - 1}Kind`];
	return v;
}

/**
 * Other kind of decision (checked ↔ what comes first): new empty fields, the typed paths do not fit
 * the other kind, but the number of paths stays. Otherwise the moves told after it would land in other paths.
 */
export function switchKind(values: Values, language: Language): Values {
	let v = prefill('decision', { subtype: values.subtype }, language);
	for (let j = morePaths(values); j > 0; j--) v = addPath('decision', v);
	return v;
}

/** "For each item" switched on: the item empty, the order one after another, so the choice is never blank. */
export function forEachSwitched(values: Values): Values {
	return values.forEach === 'yes' ? { ...values, each: values.each ?? '', eachOrder: values.eachOrder || 'sequential' } : values;
}

/** A move's lists as form values: more[j] → moreJ, moreKinds[j] → moreJKind, branches as text. */
function flatten(values: Values): Values {
	const raw = values as Record<string, unknown>;
	if (!Array.isArray(raw.more) && !Array.isArray(raw.moreKinds) && typeof raw.branches !== 'number') return values;
	const { more, moreKinds, branches, ...rest } = raw;
	const v: Values = { ...(rest as Values) };
	if (Array.isArray(more))
		more.forEach((m, j) => {
			v[`more${j}`] = String(m ?? '');
			if (values.subtype === 'first') v[`more${j}Kind`] = String((Array.isArray(moreKinds) && moreKinds[j]) || EVENT_KINDS[0]);
		});
	if (typeof branches === 'number' && branches > 2) v.branches = String(branches);
	return v;
}

/** Prefill of a new form: role as last time, paths of a check with yes/no. */
/** startKinds: the kinds a further trigger may have here; the first one is preselected. */
export function prefill(subtype: MoveKind, values: Values, language: Language, role?: string, startKinds?: string[]): Values {
	values = flatten(values);
	// The moves behind a task are no form value: the form only says whether there is a flow behind it.
	if ('subprocess' in values) values = { ...values, subprocess: (values as Record<string, unknown>).subprocess === 'yes' || Array.isArray((values as Record<string, unknown>).subprocess) ? 'yes' : '' };
	// A task told for each item: the switch is on, the order is one after another unless told otherwise.
	if (subtype === 'task' && 'each' in values && !('forEach' in values)) values = { ...values, forEach: values.each !== undefined ? 'yes' : '', eachOrder: values.eachOrder || 'sequential' };
	const v: Values = {};
	for (const f of fields(subtype, values, undefined, false, startKinds)) {
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
	const z: Record<string, unknown> = { move: subtype };
	if (subtype === 'concurrent' && branchCount(values) > 2) z.branches = branchCount(values);
	const more: string[] = [];
	const kinds: string[] = [];
	for (const f of fields(subtype, values)) {
		const m = /^more(\d+)(Kind)?$/.exec(f.key);
		if (m) {
			(m[2] ? kinds : more)[Number(m[1])] = (values[f.key] ?? '').trim();
			continue;
		}
		// "Yes, there is a flow behind it": an empty one (replace() keeps one already told).
		if (f.key === 'subprocess') {
			if (values.subprocess === 'yes') z.subprocess = [];
			continue;
		}
		// The switch itself is no part of the move: each and eachOrder are there only when it is on.
		if (f.key === 'forEach') continue;
		if (f.key === 'eachOrder') {
			z.eachOrder = values.eachOrder || 'sequential';
			continue;
		}
		let w = (values[f.key] ?? '').trim();
		if (f.subtype === 'role' && !w) w = (values.newRole ?? '').trim();
		if (f.optional && !w) continue;
		z[f.key] = w;
	}
	if (more.length) z.more = more;
	if (kinds.length) z.moreKinds = kinds;
	return z as unknown as Move;
}
