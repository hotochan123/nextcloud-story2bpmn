// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { draftKey, draftStep, makeDraft, offerOf, restoredFile, draftStore, localStore, browserStore, draftTime } from '../../src/draft.js';
import { exampleMoves } from '../../src/example.js';
import { unsaved } from '../../src/workbench.js';
import type { Move } from '../../src/core/index.js';

const moves: Move[] = [
	{ move: 'start', text: 'Antrag geht ein', role: 'Büro', process: 'Antrag' },
	{ move: 'task', text: 'Antrag prüfen', role: 'Büro' },
];
const file = { id: 42, etag: 'e-open', hash: 'h-open', name: 'Antrag.bpmn' };

/** localStorage as a Map. */
function fakeLocal() {
	const m = new Map<string, string>();
	return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}
/** indexedDB whose open fails (Safari private window, blocked storage). */
const failingIdb = { open: () => { const r: Record<string, unknown> = {}; setTimeout(() => (r.onerror as () => void)?.()); return r; } } as unknown as IDBFactory;

test('399 AK1 the key is per account and per file, "new" without a file, none without an account', () => {
	assert.equal(draftKey('alice', 42), 'story2bpmn:draft:alice:42');
	assert.equal(draftKey('alice', null), 'story2bpmn:draft:alice:new');
	assert.notEqual(draftKey('alice', 42), draftKey('bob', 42));
	assert.equal(draftKey(null, 42), null);
	assert.equal(draftKey(undefined, null), null);
});

test('399 AK1 a kept state holds moves, language, file id, its state when opened and the level', () => {
	const d = makeDraft({ moves, language: 'de', file, level: 1, any: 0 }, new Date('2026-11-13T10:00:00Z'));
	assert.deepEqual(d, { v: 1, time: '2026-11-13T10:00:00.000Z', moves, language: 'de', fileId: 42, etag: 'e-open', hash: 'h-open', level: 1, any: 0 });
	assert.notEqual(d.moves, moves, 'moves are copied');
	const n = makeDraft({ moves, language: 'en', file: null });
	assert.equal(n.fileId, null);
	assert.equal('etag' in n || 'level' in n, false);
});

test('399 AK1 the unchanged example is not unsaved (nothing kept), a changed one is', () => {
	const ex = exampleMoves('de');
	// The example comes in through setState as the saved state.
	assert.equal(unsaved(ex, ex, 'de', 'de'), false);
	assert.equal(unsaved(ex.slice(0, -1), ex, 'de', 'de'), true);
});

test('399 AK2 offered only when moves or language differ from the state opened', () => {
	const d = makeDraft({ moves, language: 'de', file });
	assert.equal(offerOf(d, { moves, language: 'de' }), null);
	assert.deepEqual(offerOf(d, { moves: moves.slice(0, 1), language: 'de' }), d);
	assert.deepEqual(offerOf(d, { moves: [], language: 'de' }), d);
	assert.deepEqual(offerOf(d, { moves, language: 'en' }), d);
	// Unreadable or empty records are never offered.
	assert.equal(offerOf(null, { moves: [], language: 'de' }), null);
	assert.equal(offerOf({ v: 2, moves, language: 'de', time: 'x' }, { moves: [], language: 'de' }), null);
	assert.equal(offerOf({ v: 1, moves: 'x', language: 'de', time: 'x' }, { moves: [], language: 'de' }), null);
	assert.equal(offerOf(makeDraft({ moves: [], language: 'de' }), { moves, language: 'de' }), null);
});

test('399 AK2 conflict case: the restored file keeps etag and hash of when the state was kept', () => {
	const d = makeDraft({ moves, language: 'de', file });
	// Meanwhile the file was changed elsewhere: opening it now gives a new etag and hash.
	const now = { ...file, etag: 'e-new', hash: 'h-new' };
	const r = restoredFile(now, d);
	assert.equal(r.etag, 'e-open');
	assert.equal(r.hash, 'h-open');
	assert.equal(r.name, 'Antrag.bpmn');
	// The server writes only if both still match (FileController): with these it answers 409.
	assert.notEqual(r.etag, now.etag);
	// A state of another file never changes the open one.
	assert.equal(restoredFile({ ...now, id: 7 }, d).etag, 'e-new');
});

test('399 AK3 put, get and remove (Discard) through localStorage', async () => {
	const ls = fakeLocal();
	const s = draftStore({ indexedDB: null, localStorage: ls });
	const d = makeDraft({ moves, language: 'de', file });
	await s.put('k', d);
	assert.deepEqual(await s.get('k'), d);
	await s.remove('k');
	assert.equal(await s.get('k'), null);
	assert.equal(ls.m.size, 0);
});

test('399 AK4 fallback: IndexedDB missing or failing to open keeps the state in localStorage', async () => {
	for (const indexedDB of [undefined, failingIdb]) {
		const ls = fakeLocal();
		const s = draftStore({ indexedDB, localStorage: ls });
		await s.put('story2bpmn:draft:alice:new', makeDraft({ moves, language: 'de' }));
		assert.equal(ls.m.size, 1);
		assert.deepEqual((await s.get('story2bpmn:draft:alice:new') as { moves: Move[] }).moves, moves);
	}
});

test('399 AK4 without any storage, or when it throws, nothing fails', async () => {
	const throwing = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => { throw new Error('x'); } };
	for (const s of [draftStore({}), draftStore({ indexedDB: failingIdb, localStorage: throwing }), localStore(throwing)]) {
		await s.put('k', makeDraft({ moves, language: 'de' }));
		assert.equal(await s.get('k'), null);
		await s.remove('k');
	}
	// Reading window.localStorage itself can throw (storage blocked).
	const w = Object.defineProperty({}, 'localStorage', { get: () => { throw new Error('SecurityError'); } });
	const s = browserStore(w);
	await s.put('k', makeDraft({ moves, language: 'de' }));
	assert.equal(await s.get('k'), null);
});

test('399 AK3 operations run in the order asked: a remove after a put leaves nothing', async () => {
	const ls = fakeLocal();
	const s = draftStore({ indexedDB: failingIdb, localStorage: ls });
	s.put('k', makeDraft({ moves, language: 'de' }));
	await s.remove('k');
	assert.equal(await s.get('k'), null);
});

test('399 the time of the note follows the locale', () => {
	const iso = '2026-11-13T15:04:00Z';
	assert.match(draftTime(iso, 'de-DE'), /13\.11\.2026/);
	assert.match(draftTime(iso, 'en-US'), /Nov 13, 2026/);
	assert.ok(draftTime(iso, 'not a locale!!').length > 0);
});

test('399 AK6 nothing is written into the file from the kept state', () => {
	const src = readFileSync('src/draft.ts', 'utf8');
	assert.doesNotMatch(src, /fileApi|axios|\bsave\(|\bput\(\s*\w+Id/);
	const app = readFileSync('src/App.vue', 'utf8');
	const part = app.slice(app.indexOf('// ---------- Unsaved state in the browser'), app.indexOf('discardDraft() {') + 200);
	assert.ok(part.length > 500);
	assert.doesNotMatch(part, /this\.(save|write|saveAs|saveName)\(|\bsave\(this|\bput\(d\.folderId/);
});

const key = 'story2bpmn:draft:alice:42';
const base = { ready: true, key, written: false };

test('401 AK1 while the note stands, the first change closes it and keeps the new state', () => {
	assert.deepEqual(draftStep({ ...base, offerKey: key, unsaved: true }), { close: true, act: 'put' });
	assert.deepEqual(draftStep({ ...base, offerKey: key, unsaved: true, written: true }), { close: true, act: 'put' });
});

test('401 AK2 while the note stands, looking around without a change closes nothing', () => {
	assert.deepEqual(draftStep({ ...base, offerKey: key, unsaved: false }), { close: false, act: null });
	assert.deepEqual(draftStep({ ...base, offerKey: key, unsaved: false, written: true }), { close: false, act: null });
});

test('401 AK3 without a note (or with the note of another file) everything stays as in job 399', () => {
	assert.deepEqual(draftStep({ ...base, unsaved: true }), { close: false, act: 'put' });
	assert.deepEqual(draftStep({ ...base, unsaved: false, written: true }), { close: false, act: 'remove' });
	assert.deepEqual(draftStep({ ...base, unsaved: false }), { close: false, act: null });
	assert.deepEqual(draftStep({ ...base, offerKey: 'story2bpmn:draft:alice:7', unsaved: true }), { close: false, act: 'put' });
	assert.deepEqual(draftStep({ ...base, offerKey: null, unsaved: true }), { close: false, act: 'put' });
	assert.deepEqual(draftStep({ ...base, ready: false, offerKey: key, unsaved: true }), { close: false, act: null });
	assert.deepEqual(draftStep({ ...base, key: null, offerKey: null, unsaved: true }), { close: false, act: null });
});

test('401 AK4 telling on replaces the state found; the next reload offers the new work', async () => {
	const ls = fakeLocal();
	const store = localStore(ls);
	const opened = { moves, language: 'de' as const };
	const found = makeDraft({ moves: [...moves, { move: 'task', text: 'Alt', role: 'Büro' }], language: 'de', file }, new Date('2026-11-13T10:00:00Z'));
	await store.put(key, found);
	const offer = offerOf(await store.get(key), opened);
	assert.ok(offer);
	// The person tells on instead of choosing: one new move on the opened state.
	const now: Move[] = [...moves, { move: 'task', text: 'Neu', role: 'Büro' }];
	const step = draftStep({ ready: true, key, offerKey: key, unsaved: unsaved(now, moves, 'de', 'de'), written: false });
	assert.deepEqual(step, { close: true, act: 'put' });
	await store.put(key, makeDraft({ moves: now, language: 'de', file }, new Date('2026-11-13T11:00:00Z')));
	const kept = await store.get(key) as { moves: Move[]; time: string };
	assert.deepEqual(kept.moves, now);
	assert.equal(kept.time, '2026-11-13T11:00:00.000Z');
	const again = offerOf(kept, opened);
	assert.deepEqual(again?.moves, now);
});

test('401 AK5 App.vue keeps through draftStep and closes the note on the first change', () => {
	const app = readFileSync('src/App.vue', 'utf8');
	const part = app.slice(app.indexOf('keepDraft() {'), app.indexOf('forgetDraft(key) {'));
	assert.match(part, /draftStep\(/);
	assert.match(part, /if \(step\.close\) this\.draftOffer = null/);
	assert.doesNotMatch(part, /this\.draftOffer\?\.key === key\) return/);
	// Restoring clears the offer before its own change, so it does not count as telling on.
	const restore = app.slice(app.indexOf('async restoreDraft() {'), app.indexOf('discardDraft() {'));
	assert.ok(restore.indexOf('this.draftOffer = null') < restore.indexOf('this.setState('));
});

test('406 AK2 a kept state holds the typed text, and is offered for it even with the same moves', () => {
	const d = makeDraft({ moves, language: 'de', file, text: 'START Antrag geht ein\nBüro prüft.' });
	assert.equal(d.text, 'START Antrag geht ein\nBüro prüft.');
	assert.deepEqual(offerOf(d, { moves, language: 'de' }), d);
	// Text typed into an empty story is offered too.
	const e = makeDraft({ moves: [], language: 'de', text: 'START Neu' });
	assert.deepEqual(offerOf(e, { moves: [], language: 'de' }), e);
	// Without typed text: as before.
	const n = makeDraft({ moves, language: 'de', file, text: null });
	assert.equal('text' in n, false);
	assert.equal(offerOf(n, { moves, language: 'de' }), null);
	assert.equal(offerOf(makeDraft({ moves: [], language: 'de', text: '' }), { moves: [], language: 'de' }), null);
});
