/**
 * SPDX-FileCopyrightText: 2026 hotochan123
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
// The armed state of every two-step button ("Really delete?", "Really discard?", and any later
// one): the first press arms it, the second does the thing. An armed button returns to normal on its own
// (job 413): after `ms`, at a press anywhere else (mouse, finger, pen) and at Esc. Safari sets no
// focus on a click, so a blur alone never disarmed there. Pure, without Vue
// (tests/client/armed.test.ts); the document is passed in.

/** What may be pressed while armed without disarming: the armed button(s). */
type Inside = { contains(node: unknown): boolean } | ArrayLike<{ contains(node: unknown): boolean }> | null;

/** The part of `document` the helper needs. */
type Doc = {
	addEventListener(type: string, fn: (e: never) => void, capture: boolean): void;
	removeEventListener(type: string, fn: (e: never) => void, capture: boolean): void;
};

type Key = { key: string; preventDefault?(): void; stopPropagation?(): void };

export type Arm<K> = {
	/** The armed key, or false. */
	readonly armed: K | false;
	/** Arms `key`; presses on `inside` keep it armed. Restarts the clock. */
	arm(key: K, inside?: Inside): void;
	/** Back to normal; `onChange(false)` when something was armed. */
	disarm(): void;
	/** A press on `target`: disarms unless it is on the armed button. */
	pointerDown(target: unknown): void;
	/** Esc while armed: disarms and returns true (the key does nothing else). */
	keyDown(e: Key): boolean;
	/** Unmount: clock and listeners away, no `onChange`. */
	end(): void;
};

const within = (inside: Inside, target: unknown): boolean => {
	if (!inside) return false;
	if ('contains' in inside && typeof inside.contains === 'function') return inside.contains(target);
	return Array.from(inside as ArrayLike<{ contains(node: unknown): boolean }>).some((el) => el.contains(target));
};

export function createArm<K>(opts: { ms?: number; onChange?: (key: K | false) => void; doc?: Doc | null } = {}): Arm<K> {
	const ms = opts.ms ?? 4000;
	const doc = opts.doc === undefined ? (globalThis as { document?: Doc }).document ?? null : opts.doc;
	let armed: K | false = false;
	let inside: Inside = null;
	let clock: ReturnType<typeof setTimeout> | null = null;
	let listening = false;

	const onPointer = (e: { target: unknown }) => api.pointerDown(e.target);
	const onKey = (e: Key) => {
		if (api.keyDown(e)) {
			e.preventDefault?.();
			e.stopPropagation?.();
		}
	};
	const listen = (on: boolean) => {
		if (!doc || listening === on) return;
		listening = on;
		const method = on ? 'addEventListener' : 'removeEventListener';
		doc[method]('pointerdown', onPointer as (e: never) => void, true);
		doc[method]('keydown', onKey as (e: never) => void, true);
	};
	const stop = () => {
		if (clock !== null) clearTimeout(clock);
		clock = null;
		listen(false);
	};

	const api: Arm<K> = {
		get armed() {
			return armed;
		},
		arm(key, at = null) {
			stop();
			armed = key;
			inside = at;
			clock = setTimeout(() => api.disarm(), ms);
			listen(true);
			opts.onChange?.(key);
		},
		disarm() {
			stop();
			inside = null;
			if (armed === false) return;
			armed = false;
			opts.onChange?.(false);
		},
		pointerDown(target) {
			if (armed !== false && !within(inside, target)) api.disarm();
		},
		keyDown(e) {
			if (armed === false || e.key !== 'Escape') return false;
			api.disarm();
			return true;
		},
		end() {
			stop();
			armed = false;
			inside = null;
		},
	};
	return api;
}
