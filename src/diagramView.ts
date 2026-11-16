/**
 * SPDX-FileCopyrightText: 2026 hotochan123
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
// Geometry of the diagram area: pure, without Vue and without DOM (tests/client/diagramView.test.ts).
// Layout "diagram area" of the design handover, variant 4.

export type Rect = { x: number; y: number; w: number; h: number };
export type Scroll = { left: number; top: number };

/** Width of the story column: 540, 440 while the sidebar is open on a window below 1600. */
export const storyWidth = (windowWidth: number, sidebarOpen: boolean): number =>
	sidebarOpen && windowWidth < 1600 ? 440 : 540;

/** Readable zoom when the whole diagram does not fit: tablet 70 %, phone 85 %, from 1600 100 %, else 85 %. */
export const standardZoom = (windowWidth: number, stacked: boolean, phone = false): number =>
	phone ? 0.85 : stacked ? 0.7 : windowWidth >= 1600 ? 1 : 0.85;

/** Factor at which the whole diagram fits into the area. */
export const fitScale = (area: { w: number; h: number }, diagram: { w: number; h: number }): number =>
	Math.max(0.01, Math.min(area.w / Math.max(diagram.w, 1), area.h / Math.max(diagram.h, 1)));

/** Below 50 % only shapes are left, no words: then the readable standard zoom instead. */
export const FIT_MIN = 0.5;

export type StartZoom = { fit: boolean; scale: number };

/** Zoom without a choice of the user: fitted while that gives at least 50 %, never above 100 %. */
export function startZoom(o: { windowWidth: number; stacked: boolean; fit: number; phone?: boolean }): StartZoom {
	if (o.fit >= FIT_MIN) return { fit: true, scale: Math.min(o.fit, 1) };
	return { fit: false, scale: standardZoom(o.windowWidth, o.stacked, o.phone) };
}

/** Zoom steps of − and +. */
const LEVELS = [0.5, 0.7, 0.85, 1, 1.25, 1.5, 2, 3];

export function nextLevel(now: number, direction: '+' | '-'): number {
	return direction === '+'
		? LEVELS.find((s) => s > now + 0.01) ?? LEVELS[LEVELS.length - 1]
		: [...LEVELS].reverse().find((s) => s < now - 0.01) ?? LEVELS[0];
}

/** One arrow key pans this far (px); with Shift a share of the visible area. */
export const KEY_STEP = 60;
const KEY_PAGE = 0.8;

export type DiagramKey = { pan: { dx: number; dy: number } } | { zoom: '+' | '-' } | { fit: true } | { show: true };

/**
 * What a key on the focused diagram area does (job 423): arrows pan, + and − zoom, 0 fits,
 * Enter shows the chosen line's shapes. With Ctrl, ⌘ or Alt nothing: the browser's own keys stay.
 */
export function diagramKey(e: { key: string; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }, view: { w: number; h: number }): DiagramKey | null {
	if (e.ctrlKey || e.metaKey || e.altKey) return null;
	const sx = e.shiftKey ? Math.round(view.w * KEY_PAGE) : KEY_STEP;
	const sy = e.shiftKey ? Math.round(view.h * KEY_PAGE) : KEY_STEP;
	switch (e.key) {
		case 'ArrowLeft': return { pan: { dx: -sx, dy: 0 } };
		case 'ArrowRight': return { pan: { dx: sx, dy: 0 } };
		case 'ArrowUp': return { pan: { dx: 0, dy: -sy } };
		case 'ArrowDown': return { pan: { dx: 0, dy: sy } };
		case '+': case '=': return { zoom: '+' };
		case '-': case '−': return { zoom: '-' };
		case '0': return { fit: true };
		case 'Enter': return { show: true };
		default: return null;
	}
}

/** Largest zoom: the top step of +. */
export const ZOOM_MAX = LEVELS[LEVELS.length - 1];

export type ZoomBounds = { min: number; max: number };

/** Bounds of a gesture zoom: those of − and +, below 50 % only as far as Fit goes. */
export const zoomBounds = (fit: number): ZoomBounds => ({ min: Math.min(LEVELS[0], fit), max: ZOOM_MAX });

export const clampZoom = (scale: number, b: ZoomBounds): number => Math.min(b.max, Math.max(b.min, scale));

/**
 * Zoom after one wheel event with Ctrl (or a trackpad pinch, which browsers send that way):
 * a negative deltaY zooms in. deltaMode 1 counts lines (16 px), 2 pages (400 px); one event
 * changes the zoom by at most a factor of 2.
 */
export function wheelZoom(scale: number, deltaY: number, deltaMode: number, b: ZoomBounds): number {
	const px = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 400 : 1);
	const factor = Math.min(2, Math.max(0.5, Math.exp(-px * 0.01)));
	return clampZoom(scale * factor, b);
}

type Point = { x: number; y: number };

/**
 * Scroll position after a zoom from `from` to `to` that keeps the content point that lay under
 * `start` (view px relative to the area, at the scroll `scroll`) under `now` (default: `start`).
 * `pad` = padding of the sheet around the diagram. Never below 0; the browser clamps the far end.
 */
export function anchorScroll(o: { start: Point; now?: Point; scroll: Scroll; from: number; to: number; pad: number }): Scroll {
	const now = o.now ?? o.start;
	const axis = (s: number, scroll: number, n: number): number => Math.max(0, ((scroll + s - o.pad) / o.from) * o.to + o.pad - n);
	return { left: axis(o.start.x, o.scroll.left, now.x), top: axis(o.start.y, o.scroll.top, now.y) };
}

/**
 * Height of the diagram band on a tablet (stacked): as high as the diagram at the tablet
 * zoom plus the padding, at most 55 % of the window, at least 200 px (less only if 55 % is less).
 */
export function bandHeight(diagramHeight: number, windowHeight: number, padding = 20): number {
	const cap = Math.floor(windowHeight * 0.55);
	return Math.min(cap, Math.max(200, Math.ceil(diagramHeight * 0.7 + padding)));
}

const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Scroll position that brings `shape` (content px) fully into the view with `margin`, moving
 * only as far as needed. `map` (view px, e.g. the overview in the bottom-right corner) is kept
 * free: a shape that would lie under it is pushed up or to the left, whichever moves less.
 * `max` clamps to the scroll range.
 */
export function followScroll(shape: Rect, view: { w: number; h: number }, scroll: Scroll, map?: Rect, margin = 24, max?: Scroll): Scroll {
	const axis = (start: number, size: number, now: number, room: number): number => {
		if (start - margin < now) return start - margin;
		if (start + size + margin > now + room) return Math.min(start - margin, start + size + margin - room);
		return now;
	};
	let left = axis(shape.x, shape.w, scroll.left, view.w);
	let top = axis(shape.y, shape.h, scroll.top, view.h);
	if (map) {
		const inView = { x: shape.x - left, y: shape.y - top, w: shape.w, h: shape.h };
		const free = { x: map.x - margin, y: map.y - margin, w: map.w + 2 * margin, h: map.h + 2 * margin };
		if (overlaps(inView, free)) {
			const pushLeft = inView.x + inView.w + margin - map.x;
			const pushUp = inView.y + inView.h + margin - map.y;
			// Only pushes that keep the start of the shape in view.
			const canLeft = inView.x - pushLeft >= 0;
			const canUp = inView.y - pushUp >= 0;
			if (canUp && (!canLeft || pushUp <= pushLeft)) top += pushUp;
			else if (canLeft) left += pushLeft;
			else top += pushUp;
		}
	}
	if (max) {
		left = Math.min(left, max.left);
		top = Math.min(top, max.top);
	}
	return { left: Math.max(0, Math.round(left)), top: Math.max(0, Math.round(top)) };
}

/** Size of the overview: the diagram scaled into at most 200 × 130 px. */
export function overviewSize(diagram: { w: number; h: number }, box = { w: 200, h: 130 }): { w: number; h: number; scale: number } {
	const scale = Math.min(box.w / Math.max(diagram.w, 1), box.h / Math.max(diagram.h, 1));
	return { w: Math.round(diagram.w * scale), h: Math.round(diagram.h * scale), scale };
}

/** Key of the overview state in localStorage. */
export const OVERVIEW_KEY = 'story2bpmn.overview';

/** Download (PDF/SVG) is possible once the whole process has a diagram, also on a subprocess level that is still empty. */
export const canDownload = (view: { xml?: string } | null | undefined, busy = false): boolean => !busy && !!view?.xml;

/**
 * May the open working file leave as a copy ("Save as", Publish, PDF/SVG download)? Not when it is reached
 * through a share that forbids downloads (the server's `canDownload`); a new story, the example and an
 * answer without the field may.
 */
export const copyAllowed = (file: { canDownload?: boolean } | null | undefined): boolean => !file || file.canDownload !== false;
