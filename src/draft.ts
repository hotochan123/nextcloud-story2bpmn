/**
 * SPDX-FileCopyrightText: 2026 hotochan123
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
// The unsaved state in the browser (job 399): every change of a story that is not saved yet is kept
// in IndexedDB (fallback localStorage), per account and per working file or "new". Reloading or
// closing the tab then loses nothing; the next opening offers the state back. Nothing is ever
// written into the file from here. Pure, without Vue and without DOM (tests/client/draft.test.ts).
import type { Move } from './core/index.js';
import { sameMoves } from './core/index.js';
import type { Language } from './core/language.js';

/** What is kept of an unsaved state. etag/hash: the state of the file when it was opened. */
export type Draft = {
	v: 1;
	time: string;
	moves: Move[];
	language: Language;
	fileId: number | null;
	etag?: string;
	hash?: string;
	level?: number;
	any?: number;
	/** Text typed in "Edit as text" and not applied yet (job 406). */
	text?: string;
};

/** Key of the kept state; null without an account (then nothing is kept). */
export const draftKey = (uid: string | null | undefined, fileId: number | null | undefined): string | null =>
	uid ? `story2bpmn:draft:${uid}:${fileId ?? 'new'}` : null;

type FileState = { id: number; etag?: string; hash?: string } | null | undefined;

/** The record of a state; moves are copied plainly (no proxies into the store). */
export function makeDraft(s: { moves: Move[]; language: Language; file?: FileState; level?: number; any?: number; text?: string | null }, now = new Date()): Draft {
	return {
		v: 1,
		time: now.toISOString(),
		moves: JSON.parse(JSON.stringify(s.moves)),
		language: s.language,
		fileId: s.file?.id ?? null,
		...(s.file ? { etag: s.file.etag, hash: s.file.hash } : {}),
		...(s.level !== undefined ? { level: s.level } : {}),
		...(s.any !== undefined ? { any: s.any } : {}),
		...(typeof s.text === 'string' ? { text: s.text } : {}),
	};
}

const isDraft = (d: unknown): d is Draft => {
	const x = d as Draft | null;
	return !!x && x.v === 1 && Array.isArray(x.moves) && (x.language === 'de' || x.language === 'en') && typeof x.time === 'string';
};

/** The kept state worth offering: readable and different from the state just opened (moves or language), or one with typed text (job 406). */
export function offerOf(d: unknown, opened: { moves: Move[]; language: Language }): Draft | null {
	if (!isDraft(d)) return null;
	if (typeof d.text === 'string' && d.text) return d;
	if (!d.moves.length) return null;
	if (sameMoves(d.moves, opened.moves) && d.language === opened.language) return null;
	return d;
}

/**
 * What a change does to the kept state (job 401). While the note "Unsaved state found" stands for
 * this key, looking around changes nothing; the first real change (unsaved) closes the note and its
 * new state replaces the one found, so new work is kept from then on and Restore cannot replace it.
 */
export function draftStep(s: { ready: boolean; key: string | null; offerKey?: string | null; unsaved: boolean; written: boolean }): { close: boolean; act: 'put' | 'remove' | null } {
	if (!s.ready || !s.key) return { close: false, act: null };
	if (s.offerKey === s.key) return s.unsaved ? { close: true, act: 'put' } : { close: false, act: null };
	if (s.unsaved) return { close: false, act: 'put' };
	return { close: false, act: s.written ? 'remove' : null };
}

/**
 * The open file after restoring: with the etag and hash it had when the state was kept, so saving
 * warns when the file was changed elsewhere meanwhile (the server answers 409).
 */
export function restoredFile<F extends { id: number; etag?: string; hash?: string }>(file: F, d: Draft): F {
	if (d.fileId !== file.id) return file;
	return { ...file, etag: d.etag, hash: d.hash };
}

/** Date and time of a kept state in the account's locale. */
export function draftTime(iso: string, locale?: string): string {
	const d = new Date(iso);
	try {
		return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
	} catch {
		return d.toLocaleString();
	}
}

/** Where kept states live. Every operation resolves, also when the browser has no storage. */
export type DraftStore = {
	get(key: string): Promise<unknown>;
	put(key: string, d: Draft): Promise<void>;
	remove(key: string): Promise<void>;
};

type Local = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function localStore(ls: Local): DraftStore {
	return {
		async get(key) {
			try {
				const s = ls.getItem(key);
				return s ? JSON.parse(s) : null;
			} catch {
				return null;
			}
		},
		async put(key, d) {
			try {
				ls.setItem(key, JSON.stringify(d));
			} catch {
				// Quota or a private window: nothing kept, everything works as before.
			}
		},
		async remove(key) {
			try {
				ls.removeItem(key);
			} catch {
				// as above
			}
		},
	};
}

const noStore: DraftStore = { get: async () => null, put: async () => {}, remove: async () => {} };

const DB = 'story2bpmn';
const STORE = 'drafts';

/** IndexedDB database story2bpmn, object store drafts (values as JSON text). Rejects when it cannot be opened. */
function openDb(idb: IDBFactory): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const r = idb.open(DB, 1);
		r.onupgradeneeded = () => {
			if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE);
		};
		r.onsuccess = () => resolve(r.result);
		r.onerror = () => reject(r.error);
		r.onblocked = () => reject(new Error('blocked'));
	});
}

function idbStore(db: IDBDatabase): DraftStore {
	const run = <T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest): Promise<T> =>
		new Promise((resolve, reject) => {
			const tr = db.transaction(STORE, mode);
			const req = f(tr.objectStore(STORE));
			tr.oncomplete = () => resolve(req.result as T);
			tr.onerror = () => reject(tr.error);
			tr.onabort = () => reject(tr.error);
		});
	return {
		async get(key) {
			const s = await run<string | undefined>('readonly', (o) => o.get(key));
			return typeof s === 'string' ? JSON.parse(s) : null;
		},
		async put(key, d) {
			await run('readwrite', (o) => o.put(JSON.stringify(d), key));
		},
		async remove(key) {
			await run('readwrite', (o) => o.delete(key));
		},
	};
}

/**
 * The store of this browser: IndexedDB, else localStorage, else none. Opened on first use; the
 * operations run in the order they were asked for, and none throws.
 */
export function draftStore(env: { indexedDB?: IDBFactory | null; localStorage?: Local | null }): DraftStore {
	let local: DraftStore = noStore;
	try {
		if (env.localStorage) local = localStore(env.localStorage);
	} catch {
		local = noStore;
	}
	let chosen: Promise<DraftStore> | undefined;
	const pick = () => (chosen ??= (async () => {
		try {
			if (!env.indexedDB) return local;
			return idbStore(await openDb(env.indexedDB));
		} catch {
			return local;
		}
	})());
	let queue: Promise<unknown> = Promise.resolve();
	const later = <T>(f: (s: DraftStore) => Promise<T>, fallback: T): Promise<T> => {
		const p = queue.then(() => pick()).then(f).catch(() => fallback);
		queue = p;
		return p;
	};
	return {
		get: (key) => later((s) => s.get(key), null),
		put: (key, d) => later((s) => s.put(key, d), undefined),
		remove: (key) => later((s) => s.remove(key), undefined),
	};
}

/** The store of the page; reading window.indexedDB / window.localStorage can throw (blocked storage). */
export function browserStore(w: { indexedDB?: IDBFactory; localStorage?: Storage }): DraftStore {
	const read = <T>(f: () => T): T | null => {
		try {
			return f() ?? null;
		} catch {
			return null;
		}
	};
	return draftStore({ indexedDB: read(() => w.indexedDB), localStorage: read(() => w.localStorage) });
}
