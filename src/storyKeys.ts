/**
 * SPDX-FileCopyrightText: 2026 hotochan123
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
// Keys of the story card: 1-9 choose, Esc closes; read from the page without Vue (job 420).

/** Keys 1-9 choose an option, not with Ctrl/Meta/Alt and not in an input field. */
export function digitKey(e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; target?: unknown }): number | null {
	if (!/^[1-9]$/.test(e.key) || e.ctrlKey || e.metaKey || e.altKey) return null;
	const tag = String((e.target as { tagName?: string } | null)?.tagName ?? '').toLowerCase();
	if (['input', 'select', 'textarea'].includes(tag)) return null;
	if ((e.target as { isContentEditable?: boolean } | null)?.isContentEditable) return null;
	return Number(e.key) - 1;
}

/** What is open around the story card, read from the page (job 420). */
export type KeyEnv = { modal: boolean; sheet: boolean; ownSheet: boolean; sidebar: boolean; otherCard: boolean };

type KeyNode = { closest?(sel: string): unknown; contains?(n: unknown): boolean; checkVisibility?(): boolean } | null;
type KeyDoc = {
	querySelectorAll(sel: string): ArrayLike<KeyNode>;
	querySelector(sel: string): unknown;
	activeElement?: KeyNode;
};

/**
 * A dialog (any visible NcModal mask), a sheet from below (head menu, ⋯ sheet of a line;
 * not the move sheet of the phone, there 1-9 choose), the sidebar, and whether the focus
 * sits in another card than `root` (the diagram area itself does not count, job 423).
 */
export function keyEnv(doc: KeyDoc, root: unknown): KeyEnv {
	const masks = Array.from(doc.querySelectorAll('.modal-mask'));
	const sheets = Array.from(doc.querySelectorAll('.bottom-sheet'));
	const r = root as KeyNode;
	// The diagram area itself keeps no keys of the story: after a click into it 1-9 still choose (job 423).
	const card = doc.activeElement?.closest?.('.mat') ? null : doc.activeElement?.closest?.('.card');
	return {
		modal: masks.some((m) => m?.checkVisibility?.() ?? true),
		sheet: sheets.length > 0,
		ownSheet: sheets.some((s) => !!r?.contains?.(s)),
		sidebar: !!doc.querySelector('#app-sidebar-vue'),
		otherCard: !!card && card !== root,
	};
}

/** Whether 1-9 choose in the story, and what Esc closes there: nothing, its ⋯ sheet, or the story's own form. */
export function storyKeys(env: KeyEnv): { digits: boolean; escape: 'none' | 'sheet' | 'story' } {
	if (env.modal || env.otherCard) return { digits: false, escape: 'none' };
	if (env.sheet) return { digits: false, escape: env.ownSheet ? 'sheet' : 'none' };
	if (env.sidebar) return { digits: false, escape: 'story' };
	return { digits: true, escape: 'story' };
}
