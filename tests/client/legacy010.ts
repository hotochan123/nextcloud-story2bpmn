// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
// Job 439: the core of tag v0.1.0, for building working files as 0.1.0 saved them (not a test file itself).
// The core is taken with `git archive v0.1.0` into a temporary folder that links the shared node_modules.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SHIFTED } from './legacyRetarget.moves.js';
import { tell, type Move } from '../../src/core/index.js';

/** What the tests use of the 0.1.0 core (its types are not checked: the folder is outside the project). */
export type Core010 = {
	tell: (moves: unknown[], language: string) => { errors: string[]; done: boolean; nodes: (string | undefined)[]; options: string[]; targets: { id: string; name: string }[]; open: string[]; ir: { name?: string }; ops: unknown[] };
	run: (input: unknown) => Promise<{ xml: string }>;
	emptyProcess: (id: string, name: string | undefined, language: string) => Record<string, unknown>;
};

/** Why the 0.1.0 core is missing (no git, no tag), or undefined when it is there. */
export function missing010(): string | undefined {
	try {
		execFileSync('git', ['rev-parse', '--verify', '-q', 'v0.1.0^{commit}'], { stdio: 'ignore' });
		return undefined;
	} catch {
		return 'tag v0.1.0 not in this repository';
	}
}

let loaded: Promise<Core010> | undefined;
/** The core of v0.1.0, extracted once per test run. */
export function core010(): Promise<Core010> {
	loaded ??= (async () => {
		const dir = mkdtempSync(join(tmpdir(), 's2b-v010-'));
		const tar = execFileSync('git', ['archive', 'v0.1.0', 'src/core']);
		execFileSync('tar', ['-x', '-C', dir], { input: tar });
		symlinkSync(realpathSync('node_modules'), join(dir, 'node_modules'));
		return (await import(pathToFileURL(join(dir, 'src/core/index.ts')).href)) as Core010;
	})();
	return loaded;
}

/** The working file 0.1.0 wrote for these moves (as its workbench did on Save). */
export async function save010(core: Core010, moves: unknown[], language = 'de'): Promise<string> {
	const g = core.tell(moves, language);
	if (g.errors.length) throw new Error(`0.1.0 refuses: ${g.errors.join('; ')}`);
	return (await core.run({ ir: { ...core.emptyProcess('P', g.ir.name, language), story: moves }, ops: g.ops })).xml;
}

/** Small seeded random numbers (mulberry32): the same stories in every run. */
export function random(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let x = Math.imul(a ^ (a >>> 15), 1 | a);
		x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
		return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * A story told only with moves the 0.1.0 interface offered at each point (its options, targets and
 * open paths), with branches more often than steps so that branches nest. Up to `max` moves. `few` (job 440):
 * steps, waits and ends only named "Prüfen" or "Fertig", so that a "continue at" often has a twin of its target,
 * and "continue at" offered three times as often. `first` (job 441): "what comes first" offered as well wherever a
 * decision is, its paths named like the waits, so that a path and a wait can share a name. `strands` (job 442): the
 * story begins with both repairs, in random order and with random names: "in parallel" with a decision whose yes
 * continues at a step in one of its branches (job 438), and the pattern of job 440 (SHIFTED, 0.1.0 counted the IDs
 * after it differently) followed by steps and a decision that continues at one of them; then random moves with
 * "in parallel" twice and "continue at" four times as often (half of them into what came after the last "in
 * parallel"), up to where main is done (0.1.0 keeps an extra path open after the pattern, job 439).
 */
export function randomStory010(core: Core010, seed: number, max = 30, few = false, first = false, strands = false): unknown[] {
	const r = random(seed);
	const pick = <T>(xs: T[]): T => xs[Math.floor(r() * xs.length)];
	const moves: unknown[] = [{ move: 'start', text: 'Antrag', role: 'Team' }];
	let n = 0;
	const shifted = strands;
	if (strands) {
		const T = (text: string) => ({ move: 'task', text, role: pick(['Team', 'Chef']) });
		// "continue at" a step or end of one of these names that the 0.1.0 interface offered and took.
		const goTo = (names: string[]) => {
			const t = core.tell(moves, 'de').targets.filter((x) => names.includes(x.name) && !core.tell([...moves, { move: 'goTo', target: x.id }], 'de').errors.length);
			moves.push(t.length ? { move: 'goTo', target: pick(t).id } : { move: 'end', text: 'Fertig' });
		};
		const strand = () => moves.push({ move: 'concurrent' }, T('A1'), ...(r() < 0.5 ? [T('A2')] : []), { move: 'merge' }, T('B'), ...(r() < 0.5 ? [T('B2')] : []), { move: 'merge' });
		const pattern = () => moves.push(...SHIFTED.slice(1, 13), T('T1'), ...(r() < 0.5 ? [T('T2')] : []));
		const strands = ['A1', 'A2', 'B', 'B2'];
		const after = ['Prüfen', 'T1', 'T2'];
		if (r() < 0.5) {
			// Strand before the pattern: its "continue at" comes before the shift, the later one after it.
			strand();
			moves.push({ move: 'decision', question: 'Z', yes: 'ja', no: 'nein' });
			goTo(strands);
			pattern();
		} else pattern(), strand();
		// Half the stories end here with a decision that continues at a step after the shift or in a branch; the
		// others go on with random moves.
		if (r() < 0.5) {
			moves.push({ move: 'decision', question: 'R', yes: 'ja', no: 'nein' });
			if (r() < 0.5) moves.push({ move: 'end', text: pick(['Fertig', 'E']) });
			else goTo([...after, ...strands]);
			goTo(r() < 0.5 ? after : strands);
		}
		const bad = core.tell(moves, 'de').errors;
		if (bad.length) throw new Error(`seed ${seed}: 0.1.0 refuses the beginning: ${bad.join('; ')}`);
	}
	for (let tries = 0; moves.length < max && tries < max * 4; tries++) {
		const s = core.tell(moves, 'de');
		if (s.done) break;
		// After the pattern 0.1.0 keeps an extra path open that main has not (job 439 drops what is told on it):
		// the story stops where main is done, so that the lines stay and their "continue at" can be checked.
		// Each "continue at" is replayed by main at the node the move of its target makes (0.1.0 counted differently).
		const goToMove = Object.fromEntries(moves.flatMap((z, j) => ((z as { move: string }).move === 'goTo' ? [[j, s.nodes.indexOf((z as { target: string }).target)]] : [])));
		if (shifted && tell(moves as Move[], 'de', { legacyGoTo: true, goToMove }).done) break;
		const offered: unknown[] = [];
		// The nodes made since the last "in parallel": their targets are the ones inside or right after its branches.
		const since = s.nodes.slice(moves.map((z) => (z as { move: string }).move).lastIndexOf('concurrent') + 1);
		const late = strands && moves.some((z) => (z as { move: string }).move === 'concurrent') ? s.targets.filter((x) => since.includes(x.id)) : [];
		for (const o of s.options) {
			n++;
			const name = (other: string) => (few ? pick(['Prüfen', 'Fertig']) : other);
			if (o === 'task') offered.push({ move: 'task', text: few ? name('') : pick(['Prüfen', 'Buchen', 'Ablegen', `S${n}`]), role: pick(['Team', 'Chef']) }, { move: 'task', text: name(`S${n}`), role: 'Team' });
			if (o === 'decision') offered.push({ move: 'decision', question: `Q${n}`, yes: 'ja', no: 'nein' }, { move: 'decision', question: `R${n}`, yes: 'ja', no: 'nein' });
			if (o === 'decision' && first) offered.push({ move: 'decision', subtype: 'first', yes: name(`W${n}`), no: name(`W${n + 1}`), yesKind: pick(['message', 'time']), noKind: pick(['message', 'time']) });
			if (o === 'concurrent') offered.push({ move: 'concurrent' });
			if (o === 'concurrent' && strands) offered.push({ move: 'concurrent' });
			if (o === 'merge') offered.push({ move: 'merge' }, { move: 'merge' }, { move: 'merge' });
			if (o === 'end') offered.push({ move: 'end', text: few ? name('') : pick(['Fertig', 'Abgebrochen', `E${n}`]) }, { move: 'end', text: 'Fertig' });
			if (o === 'wait') offered.push({ move: 'wait', text: name(`W${n}`), subtype: 'message' });
			if (o === 'goTo' && s.targets.length) for (let k = few ? 3 : strands ? 4 : 1; k > 0; k--) offered.push({ move: 'goTo', target: pick(s.targets).id });
			if (o === 'goTo' && late.length) for (let k = 4; k > 0; k--) offered.push({ move: 'goTo', target: pick(late).id });
		}
		if (s.open.length) offered.push({ move: 'switchTo', to: 1 + Math.floor(r() * s.open.length) });
		if (!offered.length) break;
		const z = pick(offered);
		if (!core.tell([...moves, z], 'de').errors.length) moves.push(z);
	}
	return moves;
}

/**
 * AK3 of job 439, AK6 of job 440: random 0.1.0 stories (seeds from..to) saved by the 0.1.0 core, opened by main.
 * Returns what went wrong (not opened, not replaying, "changed outside" for an unchanged file, a "continue at"
 * now at another node than the one the same move made in 0.1.0) and how many were repaired. `few`: stories
 * with few names that repeat (randomStory010); `first`: with "what comes first" (randomStory010). `twins`: stories
 * with a path of "what comes first" named like a wait.
 */
export async function openRandom010(from: number, to: number, few = false, first = false, strands = false) {
	const { loadStory } = await import('../../src/workbench.js');
	const core = await core010();
	const wrong: string[] = [];
	let dropped = 0;
	let retargeted = 0;
	let goTos = 0;
	let twins = 0;
	let both = 0;
	let reopened = 0;
	for (let seed = from; seed <= to; seed++) {
		const moves = randomStory010(core, seed, strands ? 36 : 30, few, first, strands) as { move: string; target?: string; text?: string; subtype?: string; yes?: string; no?: string }[];
		const waits = new Set(moves.filter((z) => z.move === 'wait').map((z) => z.text));
		if (moves.some((z) => z.subtype === 'first' && (waits.has(z.yes) || waits.has(z.no)))) twins++;
		const xml = await save010(core, moves);
		const g = await loadStory(xml, 'de');
		if ('errors' in g) {
			wrong.push(`seed ${seed}: ${g.errors}`);
			continue;
		}
		const s = tell(g.moves, 'de');
		if (s.errors.length) wrong.push(`seed ${seed}: ${s.errors.join('; ')}`);
		if (g.changed) wrong.push(`seed ${seed}: "changed outside"`);
		if (g.dropped && !g.dropped.length) wrong.push(`seed ${seed}: a note on dropped lines without a line`);
		if (g.dropped) dropped++;
		if (g.retargeted) retargeted++;
		if (g.reopened) reopened++;
		if (g.reopened && g.retargeted) both++;
		if ((g.reopened && !g.reopened.length) || (g.retargeted && !g.retargeted.length)) wrong.push(`seed ${seed}: a note without a line`);
		// Each "continue at" that stayed leads to the node of the move that made its target in 0.1.0.
		const before = core.tell(moves, 'de').nodes;
		const left = moves.map((_, j) => j).filter((j) => !g.dropped?.some((d) => d.line === j + 1));
		const at = new Map(left.map((j, p) => [j, p]));
		for (const [p, j] of left.entries()) {
			const now = g.moves[p] as { move: string; target?: string };
			// A "continue at" reopened (job 438) is named in the note, by its line in the repaired story.
			if (moves[j].move === 'goTo' && now.move === 'openPath') {
				goTos++;
				if (!g.reopened?.includes(p + 1)) wrong.push(`seed ${seed}: line ${j + 1} still open but not named`);
				continue;
			}
			if (moves[j].move !== 'goTo' || now.move !== 'goTo') continue;
			goTos++;
			const by = before.indexOf(moves[j].target);
			const q = at.get(by);
			const want = q === undefined ? undefined : s.nodes[q];
			if (!want || want !== now.target) wrong.push(`seed ${seed}: line ${j + 1} continued at the node of line ${by + 1}, now at ${now.target}`);
		}
	}
	return { wrong, dropped, retargeted, reopened, both, goTos, twins };
}
