/**
 * SPDX-FileCopyrightText: 2026 hotochan123
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { Pill } from './approval.js';

/** A state chip of the head (Soothing `.so-chip`: the class draws the sign ● ■ ▲, the word is the text). */
export type HeadChip =
	| { word: 'draft' | 'done' | 'review'; className: string }
	| { word: 'valid'; number: number; className: string }
	| { word: 'open'; count: number; className: string };

/**
 * The pills of the approval state as chips of the head (job 447): "Valid version n" with "■ Draft" once the story
 * differs from it; the number of proposals is shown in the Proposals button, not as a chip.
 */
export function headChips(pills: Pill[]): HeadChip[] {
	const out: HeadChip[] = [];
	for (const p of pills) {
		if (p.kind === 'draft' || p.kind === 'changed') out.push({ word: 'draft', className: 'so-chip--closed' });
		else if (p.kind === 'done') out.push({ word: 'done', className: 'so-chip--open' });
		else if (p.kind === 'valid') out.push({ word: 'valid', number: p.number, className: 'so-chip--ok' });
		else if (p.kind === 'open') out.push({ word: 'open', count: p.count, className: 'so-chip--warn' });
		else if (p.kind === 'review') out.push({ word: 'review', className: 'so-chip--info' });
	}
	return out;
}

/** A text in parts, its figures marked: Soothing sets figures (counts, percentages) in IBM Plex Mono, words not. */
export function figures(text: string): { text: string; num: boolean }[] {
	return text.split(/(\d+(?:[.,]\d+)?)/).filter((s) => s !== '').map((s) => ({ text: s, num: /^\d/.test(s) }));
}
