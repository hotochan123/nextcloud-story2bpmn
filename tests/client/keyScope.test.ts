// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyEnv, storyKeys, type KeyEnv } from '../../src/workbench.js';

const none: KeyEnv = { modal: false, sheet: false, ownSheet: false, sidebar: false, otherCard: false };

/** A fake element: `closest('.card')` gives `card`, `contains` knows its children. */
function el(opts: { card?: unknown; children?: unknown[]; visible?: boolean } = {}) {
	return {
		closest: (sel: string) => (sel === '.card' ? opts.card ?? null : null),
		contains: (n: unknown) => (opts.children ?? []).includes(n),
		...(opts.visible === undefined ? {} : { checkVisibility: () => opts.visible! }),
	};
}

/** A fake document with masks, sheets, a sidebar and the focused element. */
function doc(o: { masks?: unknown[]; sheets?: unknown[]; sidebar?: boolean; active?: unknown }) {
	return {
		querySelectorAll: (sel: string) => (sel === '.modal-mask' ? o.masks ?? [] : sel === '.bottom-sheet' ? o.sheets ?? [] : []) as never,
		querySelector: (sel: string) => (sel === '#app-sidebar-vue' && o.sidebar ? {} : null),
		activeElement: (o.active ?? null) as never,
	};
}

test('nothing open, focus on body or in the story: 1-9 choose, Esc is the story\'s (job 420)', () => {
	assert.deepEqual(storyKeys(none), { digits: true, escape: 'story' });
	const root = {};
	assert.deepEqual(keyEnv(doc({ active: el() }), root), none);
	assert.equal(keyEnv(doc({ active: el({ card: root }) }), root).otherCard, false);
	assert.equal(keyEnv(doc({}), root).otherCard, false);
});

test('an open dialog keeps 1-9 and Esc: the form below stays open (job 420)', () => {
	assert.deepEqual(storyKeys({ ...none, modal: true }), { digits: false, escape: 'none' });
	const root = {};
	assert.equal(keyEnv(doc({ masks: [el({ visible: true })] }), root).modal, true);
	// A mask without checkVisibility (older Safari) counts as open: the cautious side.
	assert.equal(keyEnv(doc({ masks: [el()] }), root).modal, true);
	// A hidden mask does not.
	assert.equal(keyEnv(doc({ masks: [el({ visible: false })] }), root).modal, false);
	// Dialog wins over everything else.
	assert.deepEqual(storyKeys({ ...none, modal: true, sheet: true, ownSheet: true }), { digits: false, escape: 'none' });
});

test('focus in the diagram card: 1-9 and Esc do nothing in the story (job 420)', () => {
	const root = {};
	const diagram = {};
	const env = keyEnv(doc({ active: el({ card: diagram }) }), root);
	assert.equal(env.otherCard, true);
	assert.deepEqual(storyKeys(env), { digits: false, escape: 'none' });
});

test('a sheet from below keeps 1-9; Esc closes only the story\'s own ⋯ sheet (job 420)', () => {
	const own = {};
	const head = {};
	const root = el({ children: [own] });
	const mine = keyEnv(doc({ sheets: [own] }), root);
	assert.deepEqual([mine.sheet, mine.ownSheet], [true, true]);
	assert.deepEqual(storyKeys(mine), { digits: false, escape: 'sheet' });
	const theirs = keyEnv(doc({ sheets: [head] }), root);
	assert.deepEqual([theirs.sheet, theirs.ownSheet], [true, false]);
	assert.deepEqual(storyKeys(theirs), { digits: false, escape: 'none' });
	// The move sheet of the phone is no `.bottom-sheet`: nothing found, the digits choose.
	assert.deepEqual(storyKeys(keyEnv(doc({}), root)), { digits: true, escape: 'story' });
});

test('an open sidebar keeps 1-9, Esc still closes the form (job 420)', () => {
	const env = keyEnv(doc({ sidebar: true }), {});
	assert.equal(env.sidebar, true);
	assert.deepEqual(storyKeys(env), { digits: false, escape: 'story' });
});

test('focus on the diagram area (after a click into it) leaves 1-9 to the story; its buttons keep them (job 423 AK2)', () => {
	const root = {};
	const diagramCard = {};
	const area = { closest: (sel: string) => (sel === '.mat' ? {} : sel === '.card' ? diagramCard : null), contains: () => false };
	assert.equal(keyEnv(doc({ active: area }), root).otherCard, false);
	assert.deepEqual(storyKeys(keyEnv(doc({ active: area }), root)), { digits: true, escape: 'story' });
	assert.equal(keyEnv(doc({ active: el({ card: diagramCard }) }), root).otherCard, true);
});
