// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createArm } from '../../src/armed.js';

/** A fake document: listeners by type, `fire` runs them like a capture listener on document. */
function fakeDoc() {
	const on = new Map<string, Set<(e: unknown) => void>>();
	return {
		on,
		addEventListener(type: string, fn: (e: never) => void) {
			if (!on.has(type)) on.set(type, new Set());
			on.get(type)!.add(fn as (e: unknown) => void);
		},
		removeEventListener(type: string, fn: (e: never) => void) {
			on.get(type)?.delete(fn as (e: unknown) => void);
		},
		fire(type: string, e: unknown) {
			for (const fn of [...(on.get(type) ?? [])]) fn(e);
		},
		count() {
			return [...on.values()].reduce((s, x) => s + x.size, 0);
		},
	};
}

/** An element that contains itself and its children. */
const el = (...kids: object[]) => {
	const self = { contains: (n: unknown) => n === self || kids.includes(n as object) };
	return self;
};

test('413 AK1 an armed button returns to normal after 4 s; arming again restarts the 4 s', () => {
	mock.timers.enable({ apis: ['setTimeout'] });
	try {
		const changes: unknown[] = [];
		const a = createArm<string>({ onChange: (k) => changes.push(k), doc: null });
		a.arm('remove');
		mock.timers.tick(3999);
		assert.equal(a.armed, 'remove');
		mock.timers.tick(1);
		assert.equal(a.armed, false);
		assert.deepEqual(changes, ['remove', false]);
		a.arm('remove');
		mock.timers.tick(3000);
		a.arm('remove');
		mock.timers.tick(3000);
		assert.equal(a.armed, 'remove');
		mock.timers.tick(1000);
		assert.equal(a.armed, false);
	} finally {
		mock.timers.reset();
	}
});

test('413 AK2 a press elsewhere disarms, a press on the armed button or inside it does not', () => {
	const doc = fakeDoc();
	let off = 0;
	const a = createArm<string>({ onChange: (k) => { if (k === false) off++; }, doc });
	const icon = {};
	const button = el(icon);
	a.arm('remove', button);
	doc.fire('pointerdown', { target: button });
	doc.fire('pointerdown', { target: icon });
	assert.equal(a.armed, 'remove');
	doc.fire('pointerdown', { target: {} });
	assert.equal(a.armed, false);
	assert.equal(off, 1);
	// Not armed: nothing happens, listeners are gone.
	assert.equal(doc.count(), 0);
	a.pointerDown({});
	assert.equal(off, 1);
	a.disarm();
	assert.equal(off, 1);
	a.end();
});

test('413 AK2 several armed buttons (phone head and bottom row): a press on any keeps it armed', () => {
	const one = el();
	const two = el();
	const a = createArm<boolean>({ doc: null });
	a.arm(true, [one, two]);
	a.pointerDown(two);
	assert.equal(a.armed, true);
	a.pointerDown({});
	assert.equal(a.armed, false);
	// Armed without a button (Esc in the text field): any press disarms.
	a.arm(true);
	a.pointerDown(one);
	assert.equal(a.armed, false);
});

test('413 AK3 Esc while armed disarms and swallows the key; other keys and Esc unarmed do nothing', () => {
	const doc = fakeDoc();
	const a = createArm<string>({ doc });
	assert.equal(a.keyDown({ key: 'Escape' }), false);
	a.arm('keep0');
	assert.equal(a.keyDown({ key: 'Enter' }), false);
	assert.equal(a.armed, 'keep0');
	let prevented = 0;
	let stopped = 0;
	doc.fire('keydown', { key: 'Escape', preventDefault: () => prevented++, stopPropagation: () => stopped++ });
	assert.equal(a.armed, false);
	assert.equal(prevented, 1);
	assert.equal(stopped, 1);
	assert.equal(doc.count(), 0);
});

test('413 AK3 end() stops the clock and the listeners without onChange', () => {
	mock.timers.enable({ apis: ['setTimeout'] });
	try {
		const doc = fakeDoc();
		const changes: unknown[] = [];
		const a = createArm<string>({ onChange: (k) => changes.push(k), doc });
		a.arm('remove');
		assert.equal(doc.count(), 2);
		a.end();
		assert.equal(doc.count(), 0);
		mock.timers.tick(5000);
		assert.deepEqual(changes, ['remove']);
		assert.equal(a.armed, false);
	} finally {
		mock.timers.reset();
	}
});
