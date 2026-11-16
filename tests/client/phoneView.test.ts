import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPhone, isRail, phoneAfterResize, phoneStart, afterMove, showPane, keyboardOpen, keyboardInset, sheetActions } from '../../src/phoneView.js';
import { lineActions } from '../../src/workbench.js';
import { standardZoom, startZoom } from '../../src/diagramView.js';
import type { Move } from '../../src/core/story.js';

test('394 AK1 phone below 700 px width or 500 px height; rail when held sideways', () => {
	assert.equal(isPhone(390, 844), true);
	assert.equal(isPhone(360, 780), true);
	assert.equal(isPhone(844, 390), true);
	assert.equal(isPhone(699, 1000), true);
	assert.equal(isPhone(820, 1180), false);
	assert.equal(isPhone(1366, 768), false);
	assert.equal(isPhone(700, 800), false);
	assert.equal(isPhone(1280, 500), false);
	assert.equal(isRail(844, 390), true);
	assert.equal(isRail(390, 844), false);
	assert.equal(isRail(1366, 768), false);
});

test('394 risk: the on-screen keyboard does not turn a tablet held sideways into a phone', () => {
	// Galaxy Tab sideways, keyboard opens while typing: only the height shrinks.
	assert.equal(phoneAfterResize({ was: false, width: 1280, height: 420, lastWidth: 1280, typing: true }), false);
	// Without a focused field the same size is a phone.
	assert.equal(phoneAfterResize({ was: false, width: 1280, height: 420, lastWidth: 1280, typing: false }), true);
	// Turning the device changes the width: decided anew.
	assert.equal(phoneAfterResize({ was: false, width: 390, height: 600, lastWidth: 1280, typing: true }), true);
});

test('394 AK2 after a move the story stays, point and NEW mark; the diagram clears the point', () => {
	let s = phoneStart();
	assert.deepEqual(s, { pane: 'story', grown: false, fresh: null });
	s = afterMove(s, 4);
	assert.deepEqual(s, { pane: 'story', grown: true, fresh: 4 });
	s = showPane(s, 'diagram');
	assert.deepEqual(s, { pane: 'diagram', grown: false, fresh: 4 });
	// A move told while the diagram is shown (nothing to point at)
	assert.deepEqual(afterMove(s, 5), { pane: 'diagram', grown: false, fresh: null });
	s = showPane(s, 'story');
	assert.equal(s.pane, 'story');
	// Undo, delete, text editor: mark and point go
	assert.deepEqual(afterMove({ pane: 'story', grown: true, fresh: 2 }, null), { pane: 'story', grown: false, fresh: null });
	// Nothing in the state depends on the window: turning the device keeps the pane (App keeps the state).
});

test('394 AK2 keyboard open and the height it covers', () => {
	assert.equal(keyboardOpen(844, 844), false);
	assert.equal(keyboardOpen(844, 500), true);
	assert.equal(keyboardOpen(844, undefined), false);
	assert.equal(keyboardInset(844, { height: 500, offsetTop: 0 }), 344);
	assert.equal(keyboardInset(844, { height: 500, offsetTop: 20 }), 324);
	assert.equal(keyboardInset(844, { height: 900, offsetTop: 0 }), 0);
	assert.equal(keyboardInset(844, null), 0);
});

test('394 AK2 zoom on a phone: 85 % when fitting would be below 50 %', () => {
	assert.equal(standardZoom(390, false, true), 0.85);
	assert.equal(standardZoom(1920, false, true), 0.85);
	assert.deepEqual(startZoom({ windowWidth: 390, stacked: false, fit: 0.26, phone: true }), { fit: false, scale: 0.85 });
	assert.deepEqual(startZoom({ windowWidth: 390, stacked: false, fit: 0.7, phone: true }), { fit: true, scale: 0.7 });
});

test('394 AK3 the ⋯ sheet of a line: the actions of today, proposal, show; never "after"', () => {
	const task: Move = { move: 'task', text: 'Check invoice', role: 'Accounting' };
	const start: Move = { move: 'start', text: 'Invoice arrives', role: 'Accounting' };
	const merge: Move = { move: 'merge' };
	for (const [m, i] of [[task, 1], [start, 0], [merge, 3]] as [Move, number][]) {
		for (const inner of [false, true]) {
			assert.deepEqual(sheetActions(m, i, inner, false), [...lineActions(m, i, inner), 'asText', 'show']);
			assert.deepEqual(sheetActions(m, i, inner, true), [...lineActions(m, i, inner), 'propose', 'asText', 'show']);
			assert.ok(!(sheetActions(m, i, inner, true) as string[]).includes('after'));
		}
	}
	assert.deepEqual(sheetActions(task, 1, false, false), ['edit', 'before', 'addException', 'remove', 'subprocess', 'asText', 'show']);
	// Job 408: a step with an exception gets no second one
	assert.deepEqual(sheetActions(task, 1, false, false, true), ['edit', 'before', 'remove', 'subprocess', 'asText', 'show']);
});
