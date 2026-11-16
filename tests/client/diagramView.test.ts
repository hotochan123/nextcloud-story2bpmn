import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anchorScroll, clampZoom, diagramKey, KEY_STEP, wheelZoom, zoomBounds, ZOOM_MAX, storyWidth, startZoom, standardZoom, fitScale, bandHeight, followScroll, nextLevel, overviewSize } from '../../src/diagramView.js';

test('383 AK5 startZoom: fitted from 50 %, else the readable standard zoom', () => {
	assert.deepEqual(startZoom({ windowWidth: 1366, stacked: false, fit: 0.6 }), { fit: true, scale: 0.6 });
	assert.deepEqual(startZoom({ windowWidth: 1366, stacked: false, fit: 0.5 }), { fit: true, scale: 0.5 });
	assert.deepEqual(startZoom({ windowWidth: 1366, stacked: false, fit: 0.4 }), { fit: false, scale: 0.85 });
	assert.deepEqual(startZoom({ windowWidth: 1920, stacked: false, fit: 0.4 }), { fit: false, scale: 1 });
	assert.deepEqual(startZoom({ windowWidth: 820, stacked: true, fit: 0.4 }), { fit: false, scale: 0.7 });
	// A short process is never blown up beyond 100 %.
	assert.deepEqual(startZoom({ windowWidth: 1920, stacked: false, fit: 1.4 }), { fit: true, scale: 1 });
	assert.equal(standardZoom(1599, false), 0.85);
	assert.equal(standardZoom(1600, false), 1);
	// Long example of the handover (3506 × 1698) on 1366: 764 × 563 area, fitting would give 18 %.
	assert.ok(fitScale({ w: 744, h: 543 }, { w: 3506, h: 1698 }) < 0.5);
});

test('383 AK6 story width and tablet band', () => {
	assert.equal(storyWidth(1366, true), 440);
	assert.equal(storyWidth(1920, true), 540);
	assert.equal(storyWidth(1366, false), 540);
	assert.equal(storyWidth(1599, true), 440);
	assert.equal(storyWidth(1600, true), 540);
	// Five lanes (≈ 1450 high): capped at 55 % of 1180.
	assert.equal(bandHeight(1450, 1180), 649);
	// Two short lanes: as high as they are at 70 %, plus padding.
	assert.equal(bandHeight(400, 1180), 300);
	// Tiny diagram: at least 200.
	assert.equal(bandHeight(100, 1180), 200);
	// Very low window: the 55 % cap wins over the minimum.
	assert.equal(bandHeight(1450, 300), 165);
});

test('383 AK7 followScroll: only as far as needed, overview corner stays free', () => {
	const view = { w: 800, h: 500 };
	// Already in view: nothing moves.
	assert.deepEqual(followScroll({ x: 100, y: 100, w: 140, h: 80 }, view, { left: 0, top: 0 }), { left: 0, top: 0 });
	// Right outside: minimal scroll with 24 px margin.
	assert.deepEqual(followScroll({ x: 1000, y: 100, w: 140, h: 80 }, view, { left: 0, top: 0 }), { left: 1000 + 140 + 24 - 800, top: 0 });
	// Left outside.
	assert.deepEqual(followScroll({ x: 300, y: 100, w: 140, h: 80 }, view, { left: 600, top: 0 }), { left: 276, top: 0 });
	// Under the overview (bottom right, 200 × 130 at 590/360): pushed so it does not cut the map.
	const map = { x: 590, y: 360, w: 200, h: 130 };
	const to = followScroll({ x: 650, y: 380, w: 140, h: 80 }, view, { left: 0, top: 0 }, map);
	const inView = { x: 650 - to.left, y: 380 - to.top, w: 140, h: 80 };
	const cuts = inView.x < map.x + map.w && map.x < inView.x + inView.w && inView.y < map.y + map.h && map.y < inView.y + inView.h;
	assert.equal(cuts, false);
	assert.ok(inView.x >= 0 && inView.y >= 0 && inView.x + inView.w <= view.w && inView.y + inView.h <= view.h);
	// Clamped to the scroll range and never negative.
	assert.deepEqual(followScroll({ x: 1000, y: 0, w: 140, h: 80 }, view, { left: 0, top: 0 }, undefined, 24, { left: 100, top: 0 }), { left: 100, top: 0 });
	assert.deepEqual(followScroll({ x: 5, y: 5, w: 10, h: 10 }, view, { left: 50, top: 50 }), { left: 0, top: 0 });
});

test('383 zoom steps include 70 and 85 %, overview fits 200 × 130', () => {
	assert.equal(nextLevel(0.7, '+'), 0.85);
	assert.equal(nextLevel(0.85, '+'), 1);
	assert.equal(nextLevel(0.85, '-'), 0.7);
	assert.equal(nextLevel(0.5, '-'), 0.5);
	assert.equal(nextLevel(3, '+'), 3);
	const o = overviewSize({ w: 3506, h: 1698 });
	assert.ok(o.w <= 200 && o.h <= 130 && (o.w === 200 || o.h === 130));
});

test('418 AK2 zoomBounds: 50 % down, below only as far as Fit, up to 300 %', () => {
	assert.equal(zoomBounds(0.3).min, 0.3);
	assert.equal(zoomBounds(0.8).min, 0.5);
	assert.equal(zoomBounds(0.8).max, 3);
	assert.equal(ZOOM_MAX, 3);
	assert.equal(clampZoom(5, zoomBounds(1)), 3);
	assert.equal(clampZoom(0.1, zoomBounds(1)), 0.5);
	assert.equal(clampZoom(1.3, zoomBounds(1)), 1.3);
});

test('418 AK1 wheelZoom: forward zooms in, back zooms out, within the bounds', () => {
	const b = zoomBounds(0.8);
	assert.ok(wheelZoom(1, -100, 0, b) > 1);
	assert.ok(wheelZoom(1, 100, 0, b) < 1);
	assert.ok(Math.abs(wheelZoom(1, -3, 1, b) - wheelZoom(1, -48, 0, b)) < 1e-9, 'a line counts 16 px');
	assert.ok(Math.abs(wheelZoom(1, -1, 2, b) - wheelZoom(1, -400, 0, b)) < 1e-9, 'a page counts 400 px');
	assert.equal(wheelZoom(1, -100000, 0, b), 2, 'at most twice per event');
	assert.equal(wheelZoom(1, 100000, 0, b), 0.5);
	assert.equal(wheelZoom(2.9, -500, 0, b), 3);
	assert.equal(wheelZoom(0.55, 500, 0, b), 0.5);
	assert.equal(wheelZoom(0.3, 500, 0, zoomBounds(0.3)), 0.3);
});

test('418 AK3 anchorScroll keeps the point under the anchor', () => {
	const back = (s: { left: number; top: number }, p: { x: number; y: number }, k: number) => ({ x: (s.left + p.x - 10) / k, y: (s.top + p.y - 10) / k });
	for (const [from, to] of [[1, 2], [2, 0.5], [0.85, 1.37]]) {
		const start = { x: 300, y: 200 };
		const scroll = { left: 1400, top: 900 };
		const before = back(scroll, start, from);
		const s = anchorScroll({ start, scroll, from, to, pad: 10 });
		const after = back(s, start, to);
		assert.ok(Math.abs(after.x - before.x) * to <= 0.5 && Math.abs(after.y - before.y) * to <= 0.5, `${from} → ${to}`);
		const now = { x: 260, y: 230 };
		const m = anchorScroll({ start, now, scroll, from, to, pad: 10 });
		const moved = back(m, now, to);
		assert.ok(Math.abs(moved.x - before.x) * to <= 0.5 && Math.abs(moved.y - before.y) * to <= 0.5, `${from} → ${to} with the fingers moved`);
	}
	const s = anchorScroll({ start: { x: 50, y: 50 }, scroll: { left: 0, top: 0 }, from: 2, to: 0.5, pad: 10 });
	assert.deepEqual(s, { left: 0, top: 0 });
});

test('423 AK1 diagramKey: arrows pan, + and − zoom, 0 fits, Enter shows; browser keys stay', () => {
	const v = { w: 500, h: 300 };
	assert.equal(KEY_STEP, 60);
	assert.deepEqual(diagramKey({ key: 'ArrowLeft' }, v), { pan: { dx: -60, dy: 0 } });
	assert.deepEqual(diagramKey({ key: 'ArrowRight' }, v), { pan: { dx: 60, dy: 0 } });
	assert.deepEqual(diagramKey({ key: 'ArrowUp' }, v), { pan: { dx: 0, dy: -60 } });
	assert.deepEqual(diagramKey({ key: 'ArrowDown' }, v), { pan: { dx: 0, dy: 60 } });
	// Shift: 80 % of what is in view
	assert.deepEqual(diagramKey({ key: 'ArrowRight', shiftKey: true }, v), { pan: { dx: 400, dy: 0 } });
	assert.deepEqual(diagramKey({ key: 'ArrowUp', shiftKey: true }, v), { pan: { dx: 0, dy: -240 } });
	// German layout and numpad send '+', US layout '=' without Shift
	for (const key of ['+', '=']) assert.deepEqual(diagramKey({ key }, v), { zoom: '+' });
	for (const key of ['-', '−']) assert.deepEqual(diagramKey({ key }, v), { zoom: '-' });
	assert.deepEqual(diagramKey({ key: '0' }, v), { fit: true });
	assert.deepEqual(diagramKey({ key: 'Enter' }, v), { show: true });
	// Ctrl + / ⌘ − / Alt: the browser's zoom, never the app's
	for (const mod of ['ctrlKey', 'metaKey', 'altKey']) {
		for (const key of ['+', '-', '0', 'ArrowLeft', 'Enter']) assert.equal(diagramKey({ key, [mod]: true }, v), null, `${mod} ${key}`);
	}
	for (const key of ['1', 'a', 'Tab', 'Escape', ' ', 'PageDown', 'Home']) assert.equal(diagramKey({ key }, v), null, key);
});
