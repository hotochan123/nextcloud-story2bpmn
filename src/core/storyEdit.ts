import { ProcessIR, nodeById, incoming } from './ir.js';
import { Language, tx } from './language.js';
import { tell, shownTarget, MAX_PATHS, k, descends, branchName } from './story.js';
import { endless } from './validate.js';
import type { Move, StoryState, TellOptions } from './story.js';

/**
 * Editing a told story: operations that take the list of moves and return a changed one
 * (insert, replace, add or delete paths, reopen, splice). Each replays the result with
 * tell() and refuses what would not be valid. Telling itself stays in story.ts.
 * story.ts imports this module back (re-exports); neither side uses the other at module level.
 */

/** Refusal: the "continue at" of move j still leads into what would go; `line` is the move to jump to (job 414). */
export function stillLeads(j: number, ir: ProcessIR, nodes: (string | undefined)[], id: string, language?: Language): { error: string; line: number } {
  const t = (de: string, en: string) => tx(language, de, en);
  const to = shownTarget(ir, nodes, id, t);
  return { error: t(`Zeile ${j + 1} führt noch zu ${to} – dort zuerst ändern`, `Line ${j + 1} still leads to ${to} – change it there first`), line: j };
}

/** Old index of the move that landed at `k` (`index`: per old move its new index), or undefined. */
const indexOfNew = (index: (number | undefined)[], k: number): number | undefined => {
  const j = index.indexOf(k);
  return j < 0 ? undefined : j;
};

/**
 * Refusal when deleting leaves a part of the flow from which no end can be reached any more (job 452):
 * `out` is the story after deleting, `back(k)` the old index of its move k (undefined: a move that is new).
 * What was without an end already before does not count. `line`: the first "continue at" that leads
 * back into that part (old index). None: undefined.
 */
export function noEnd(old: StoryState, out: Move[], back: (k: number) => number | undefined, language?: Language, opts: TellOptions = {}): { error: string; line?: number } | undefined {
  const t = (de: string, en: string) => tx(language, de, en);
  const next = tell(out, language, opts);
  const lost = endless(next.ir, next.tips);
  if (!lost.size) return undefined;
  const before = new Set([...endless(old.ir, old.tips)].map((id) => old.moveOf[id]));
  const fresh = [...lost].some((id) => {
    const k = next.moveOf[id];
    if (k === undefined) return false;
    const j = back(k);
    return j === undefined || !before.has(j);
  });
  if (!fresh) return undefined;
  for (const [k, m] of out.entries()) {
    const j = back(k);
    if (m.move !== 'goTo' || j === undefined || !lost.has(m.target)) continue;
    const to = shownTarget(next.ir, next.nodes, m.target, t);
    return {
      error: t(`Danach käme der Ablauf nie zu einem Ende: Zeile ${j + 1} führt zurück zu ${to} – dort zuerst ändern`, `Afterwards the flow would never reach an end: line ${j + 1} leads back to ${to} – change it there first`),
      line: j
    };
  }
  return { error: t('Danach käme der Ablauf nie zu einem Ende', 'Afterwards the flow would never reach an end') };
}

/** Refusal for the first "continue at" that stays but leads into a move that goes; none: undefined. */
function leadsIntoDropped(moves: Move[], old: StoryState, dropped: (j: number) => boolean, language?: Language): { error: string; line: number } | undefined {
  for (const [j, m] of moves.entries()) {
    if (m.move !== 'goTo' || dropped(j)) continue;
    const from = old.nodes.indexOf(m.target);
    if (from >= 0 && dropped(from)) return stillLeads(j, old.ir, old.nodes, m.target, language);
  }
  return undefined;
}

/**
 * Like Array.splice on the moves: from `startAt`, `path` moves are replaced by `added`.
 * The node IDs count on, so all later ones shift -
 * "continue at" is rewritten to the new ID via the move that created the target.
 * If the target is gone, its name stays as the target; the
 * replay then reports "Bei „…“ kann es von hier aus nicht weitergehen".
 */
export function splice(moves: Move[], startAt: number, path: number, added: Move[], language?: Language, opts: TellOptions = {}): Move[] {
  const old = tell(moves, language, opts);
  const from = moves.map((z) => (z.move === 'goTo' ? old.nodes.indexOf(z.target) : -1));
  const result = [...moves];
  result.splice(startAt, path, ...added);
  from.splice(startAt, path, ...added.map(() => -1));
  // ponytail: one replay per goTo move, O(n²); for stories with hundreds of moves pass it through once.
  for (const [j, z] of result.entries()) {
    if (z.move !== 'goTo' || from[j] < 0) continue;
    if (from[j] >= startAt && from[j] < startAt + path) {
      result[j] = { ...z, target: nodeById(old.ir, z.target)?.name || z.target };
      continue;
    }
    const source = from[j] >= startAt + path ? from[j] - path + added.length : from[j];
    const id = tell(result.slice(0, j), language, opts).nodes[source];
    if (id) result[j] = { ...z, target: id };
  }
  return result;
}

/**
 * Move `i` replaced by `move`. A change can create more or fewer nodes (e.g. "what comes first" ↔
 * "it depends"), so all later node IDs shift: "continue at" is rewritten like in splice, via the
 * move that created its target. A target created by move `i` itself goes to the node the new move
 * creates; if it creates none, the target's name stays and the replay names it in its error.
 */
export function replaceMove(moves: Move[], i: number, move: Move, language?: Language, opts: TellOptions = {}): Move[] {
  const old = tell(moves, language, opts);
  const result = moves.map((z, j) => (j === i ? move : z));
  for (const [j, z] of result.entries()) {
    if (j === i || z.move !== 'goTo') continue;
    const from = old.nodes.indexOf(z.target);
    if (from < 0) continue;
    const id = tell(result.slice(0, j), language, opts).nodes[from];
    result[j] = { ...z, target: id ?? (nodeById(old.ir, z.target)?.name || z.target) };
  }
  return result;
}

/** Moves that open paths and can be deleted together with all but one of them. */
export const BRANCHES: Move['move'][] = ['decision', 'concurrent', 'exceptionPath'];

/** Number of paths the branch move opens (0: no branch). Exception: 0 = exception path, 1 = normal path. */
export function pathCount(z: Move | undefined): number {
  if (z?.move === 'decision') return (Array.isArray(z.more) ? z.more.length : 0) + 2;
  if (z?.move === 'concurrent') return z.branches ?? 2;
  if (z?.move === 'exceptionPath') return 2;
  return 0;
}

/**
 * Deletes the branch told in move `at` and keeps its path `keep` (0 = yes / first branch /
 * exception path, last = otherwise path / last branch / normal path). The kept path moves into
 * the path before; the other paths go with all their moves and their branches. The kept path's
 * merge of this branch goes too. If the kept path did not run into the merge, what comes after
 * the merge goes as well - nothing leads there any more.
 * With "whichever comes first" the kept path's waiting stays as a wait.
 * Refused when "continue at" from elsewhere leads into what goes.
 * `opts`: as for tell(), on the level of a subprocess or of something that can come at any time.
 */
export function removeBranch(moves: Move[], at: number, keep: number, language?: Language, opts: TellOptions = {}): { moves: Move[] } | { error: string; line?: number } {
  const t = (de: string, en: string) => tx(language, de, en);
  const z = moves[at];
  if (!z || !BRANCHES.includes(z.move)) return { error: t('Hier verzweigt sich nichts', 'Nothing branches here') };
  const count = pathCount(z);
  if (!Number.isInteger(keep) || keep < 0 || keep >= count) return { error: t('Diesen Weg gibt es hier nicht', 'There is no such path here') };
  const old = tell(moves, language, opts);
  const { owner, parent, closes, switched } = old.trace;
  /** Does path `key` stem from `root` (itself included)? */
  const below = (key: string | undefined, root: string): boolean => descends(old.trace, key, root);
  const kept = `${at}.${keep}`;
  const gone = Array.from({ length: count }, (_, j) => `${at}.${j}`).filter((g) => g !== kept);
  const keptMerges = closes.some((b, j) => b === at && below(owner[j], kept));
  if (!keptMerges) gone.push(`${at}+`);
  const goes = (j: number) =>
    j === at ||
    gone.some((g) => below(owner[j], g)) ||
    (closes[j] === at && below(owner[j], kept)) ||
    (switched[j] !== undefined && gone.some((g) => below(switched[j], g)));
  // A surrounding branch whose every merge goes leads nowhere after it any more: what comes after
  // its merge goes too, until nothing more changes.
  let dropped = moves.map((_, j) => goes(j));
  for (let more = true; more; ) {
    more = false;
    for (const key of Object.keys(parent)) {
      const b = Number(key.match(/^(\d+)\+$/)?.[1] ?? NaN);
      if (Number.isNaN(b) || b === at || gone.includes(key)) continue;
      const merging = closes.flatMap((c, j) => (c === b ? [j] : []));
      if (merging.length && merging.every((j) => dropped[j])) {
        gone.push(key);
        more = true;
      }
    }
    if (more) dropped = moves.map((_, j) => goes(j));
  }
  const drop = (j: number) => dropped[j];

  // "continue at" into what goes would leave its path without an arrow.
  const leads = leadsIntoDropped(moves, old, drop, language);
  if (leads) return leads;

  const out: Move[] = [];
  const index: (number | undefined)[] = [];
  /** Key of an old path in the new story: the kept path and its continuation become the path before. */
  const newKey = (key: string): string | undefined => {
    if (key === 'r') return key;
    const [, b, rest] = key.match(/^(\d+)(.*)$/)!;
    if (+b === at) return newKey(owner[at] ?? 'r');
    return index[+b] === undefined ? undefined : `${index[+b]}${rest}`;
  };
  for (const [j, m] of moves.entries()) {
    if (j === at && z.move === 'decision' && z.subtype === 'first') {
      // The waiting the kept path began with.
      const labels = [z.yes, ...(z.more ?? []), z.no];
      const kinds = [z.yesKind, ...(z.more ?? []).map((_, n) => z.moreKinds?.[n]), z.noKind];
      index[j] = out.length;
      out.push({ move: 'wait', text: labels[keep], subtype: kinds[keep] || 'message' });
      continue;
    }
    if (drop(j)) continue;
    if (m.move === 'goTo') {
      const from = old.nodes.indexOf(m.target);
      const id = from >= 0 && index[from] !== undefined ? tell(out, language, opts).nodes[index[from]!] : undefined;
      index[j] = out.length;
      out.push(id ? { ...m, target: id } : m);
      continue;
    }
    if (m.move === 'switchTo') {
      const key = switched[j] && newKey(switched[j]!);
      const to = key ? tell(out, language, opts).trace.keys.indexOf(key) : -1;
      // Already the current path (it was the kept one): nothing to pull forward.
      if (to < 1) continue;
      index[j] = out.length;
      out.push({ move: 'switchTo', to });
      continue;
    }
    index[j] = out.length;
    out.push(m);
    // "Stop everything" without anything alongside any more becomes a plain end.
    if (m.move === 'end' && m.subtype === 'cancel') {
      const before = tell(out.slice(0, -1), language, opts).errors.length;
      if (tell(out, language, opts).errors.length > before) out[out.length - 1] = { move: 'end', text: m.text };
    }
  }
  // A few shapes cannot be told without the branch (two arrows between the same shapes, e.g. a
  // "continue at" that now starts where the target already hangs): refuse instead of breaking the story.
  const check = tell(out, language, opts).errors;
  if (check.length)
    return { error: t('Ohne diese Verzweigung passt die Geschichte nicht mehr zusammen; ändern Sie zuerst die Wege um sie herum', 'Without this branch the story no longer fits together; change the paths around it first') };
  const loop = noEnd(old, out, (k) => indexOfNew(index, k), language, opts);
  return loop ?? { moves: out };
}


/**
 * Deletes path `path` of the branch told in move `at` (a decision or "in parallel" with three paths
 * or more) and keeps the others: the branch move loses that path, every move told on it goes with
 * its branches, and so does pulling it forward. If no other path runs into the merge of this branch
 * any more, what comes after the merge goes too (only the deleted path reached it), and so on outwards.
 * The otherwise path of a check stays. Refused when "continue at" from elsewhere leads into what goes,
 * or when the rest does not replay. `opts`: as for tell().
 */
export function deletePath(moves: Move[], at: number, path: number, language?: Language, opts: TellOptions = {}): { moves: Move[] } | { error: string; line?: number } {
  const t = (de: string, en: string) => tx(language, de, en);
  const z = moves[at];
  if (!z || (z.move !== 'decision' && z.move !== 'concurrent')) return { error: t('Hier verzweigt sich nichts', 'Nothing branches here') };
  const count = pathCount(z);
  const check = z.move === 'decision' && z.subtype !== 'first';
  if (!Number.isInteger(path) || path < 0 || path >= count || count < 3 || (check && path === count - 1))
    return { error: t('Diesen Weg gibt es hier nicht', 'There is no such path here') };
  const old = tell(moves, language, opts);
  const { owner, parent, closes, switched } = old.trace;
  /** Does path `key` stem from `root` (itself included)? */
  const below = (key: string | undefined, root: string): boolean => descends(old.trace, key, root);
  const gone = [`${at}.${path}`];
  // Pulling forward goes with the path it pulls, not with the path that was current then: that
  // one may go while the pulled path stays (it is counted anew below).
  const goes = (j: number) => (switched[j] !== undefined ? gone.some((g) => below(switched[j], g)) : gone.some((g) => below(owner[j], g)));
  // A branch whose every merge goes leads nowhere after it any more: what comes after its merge goes
  // too - this branch first (only the deleted path merged), then the ones around it.
  let dropped = moves.map((_, j) => goes(j));
  for (let more = true; more; ) {
    more = false;
    for (const key of Object.keys(parent)) {
      const b = Number(key.match(/^(\d+)\+$/)?.[1] ?? NaN);
      if (Number.isNaN(b) || gone.includes(key)) continue;
      const merging = closes.flatMap((c, j) => (c === b ? [j] : []));
      if (merging.length && merging.every((j) => dropped[j])) {
        gone.push(key);
        more = true;
      }
    }
    if (more) dropped = moves.map((_, j) => goes(j));
  }

  const leads = leadsIntoDropped(moves, old, (j) => dropped[j], language);
  if (leads) return leads;

  let fewer: Move;
  if (z.move === 'concurrent') fewer = { ...z, branches: count - 1 };
  else {
    const without = <T,>(list: T[]): T[] => list.filter((_, j) => j !== path);
    const labels = without([z.yes, ...(z.more ?? []), z.no]);
    const { more: _m, moreKinds: _k, yesKind: _y, noKind: _n, ...rest } = z;
    fewer = { ...rest, yes: labels[0], no: labels[labels.length - 1], ...(labels.length > 2 && { more: labels.slice(1, -1) }) };
    if (z.subtype === 'first') {
      const kinds = without([z.yesKind, ...(z.more ?? []).map((_, n) => z.moreKinds?.[n]), z.noKind]);
      const middle = kinds.slice(1, -1);
      fewer = {
        ...fewer,
        ...(kinds[0] && { yesKind: kinds[0] }),
        ...(middle.some(Boolean) && { moreKinds: middle.map((k) => k ?? '') }),
        ...(kinds[kinds.length - 1] && { noKind: kinds[kinds.length - 1] })
      } as Move;
    }
  }

  const out: Move[] = [];
  const index: (number | undefined)[] = [];
  /** Key of an old path in the new story: paths of this branch after the deleted one move up by one. */
  const newKey = (key: string): string | undefined => {
    if (key === 'r') return key;
    const [, b, rest] = key.match(/^(\d+)(.*)$/)!;
    if (index[+b] === undefined) return undefined;
    const n = +b === at ? rest.match(/^\.(\d+)$/) : null;
    return n && +n[1] > path ? `${index[+b]}.${+n[1] - 1}` : `${index[+b]}${rest}`;
  };
  for (const [j, m] of moves.entries()) {
    if (dropped[j]) continue;
    index[j] = out.length;
    if (j === at) {
      out.push(fewer);
      continue;
    }
    if (m.move === 'goTo') {
      const from = old.nodes.indexOf(m.target);
      const id = from >= 0 && index[from] !== undefined ? tell(out, language, opts).nodes[index[from]!] : undefined;
      out.push(id ? { ...m, target: id } : m);
      continue;
    }
    if (m.move === 'switchTo') {
      const key = switched[j] && newKey(switched[j]!);
      const to = key ? tell(out, language, opts).trace.keys.indexOf(key) : -1;
      // Already the current path: nothing to pull forward.
      if (to < 1) {
        index[j] = undefined;
        continue;
      }
      out.push({ move: 'switchTo', to });
      continue;
    }
    out.push(m);
  }
  if (tell(out, language, opts).errors.length)
    return { error: t('Ohne diesen Weg passt die Geschichte nicht mehr zusammen; ändern Sie zuerst die Wege um ihn herum', 'Without this path the story no longer fits together; change the paths around it first') };
  const loop = noEnd(old, out, (k) => indexOfNew(index, k), language, opts);
  return loop ?? { moves: out };
}

/**
 * Gives the branch told in move `at` (a decision or "in parallel") more paths after the story went on:
 * `move` is the same kind of move with k more paths. They come right before the otherwise path of a
 * check, otherwise at the end. Wherever a new path comes up while the story is told again, it gets an
 * `openPath` (still open); one that only comes up after the last move stays the open path the story
 * goes on with. Everything told stays as it was: "continue at" keeps its target, pulling forward pulls
 * the same path. `opts`: as for tell().
 */
export function addPaths(moves: Move[], at: number, move: Move, language?: Language, opts: TellOptions = {}): { moves: Move[] } | { error: string } {
  const t = (de: string, en: string) => tx(language, de, en);
  const refuse = { error: t('Der Weg lässt sich hier nicht hinzufügen', 'The path cannot be added here') };
  const z = moves[at];
  if (!z || (z.move !== 'decision' && z.move !== 'concurrent') || move.move !== z.move) return refuse;
  const first = (m: Move) => m.move === 'decision' && m.subtype === 'first';
  if (first(z) !== first(move)) return refuse;
  const before = pathCount(z);
  const k = pathCount(move) - before;
  if (pathCount(move) > MAX_PATHS) return { error: t(`Höchstens ${MAX_PATHS} Wege`, `At most ${MAX_PATHS} paths`) };
  if (!Number.isInteger(k) || k < 1) return refuse;
  const old = tell(moves, language, opts);
  if (old.errors.length) return refuse;
  const { switched } = old.trace;
  // Position of the first new path: before the otherwise path of a check, else after the last.
  const p = z.move === 'decision' && !first(z) ? before - 1 : before;
  const fresh = new Set(Array.from({ length: k }, (_, n) => `${at}.${p + n}`));
  const index: number[] = [];
  /** Key of an old path in the new story (move numbers shift by the placeholders, the otherwise path by k). */
  const newKey = (key: string): string | undefined => {
    if (key === 'r') return key;
    const [, b, rest] = key.match(/^(\d+)(.*)$/)!;
    if (index[+b] === undefined) return undefined;
    const n = +b === at ? rest.match(/^\.(\d+)$/) : null;
    return n && +n[1] >= p ? `${index[+b]}.${+n[1] + k}` : `${index[+b]}${rest}`;
  };
  const out: Move[] = [];
  for (let j = 0; j < at; j++) {
    index[j] = j;
    out.push(moves[j]);
  }
  index[at] = at;
  out.push(move);
  let pending = k;
  for (let j = at + 1; j < moves.length; j++) {
    // A new path whose turn it is gets its placeholder before the move that belongs to the next path.
    while (pending && fresh.has(tell(out, language, opts).trace.keys[0])) {
      out.push({ move: 'openPath' });
      pending--;
    }
    const m = moves[j];
    index[j] = out.length;
    if (m.move === 'goTo') {
      const from = old.nodes.indexOf(m.target);
      const id = from >= 0 ? tell(out, language, opts).nodes[index[from]] : undefined;
      out.push(id ? { ...m, target: id } : m);
      continue;
    }
    if (m.move === 'switchTo') {
      const key = switched[j] && newKey(switched[j]!);
      const to = key ? tell(out, language, opts).trace.keys.indexOf(key) : -1;
      if (to < 1) return refuse;
      out.push({ move: 'switchTo', to });
      continue;
    }
    out.push(m);
  }
  if (tell(out, language, opts).errors.length) return refuse;
  return { moves: out };
}

/** Moves that cannot be told on a path still open: they belong to the beginning or outside the flow. */
export const NOT_ON_OPEN: Move['move'][] = ['start', 'orStart', 'anytime', 'switchTo', 'openPath'];

/**
 * Tells `move` on the path still open at move `at` (an openPath). An end, a merge or "continue at"
 * takes its place (the path is told); a branch goes before it with one more placeholder per further
 * path; any other move goes before it. Refused when what comes after would be told differently
 * (other lines, or another number of open paths at the end). `at` of the result: the placeholder the
 * telling goes on at, null when the path is told to its end.
 */
export function tellOpen(moves: Move[], at: number, move: Move, language?: Language, opts: TellOptions = {}): { moves: Move[]; at: number | null } | { error: string } {
  const t = (de: string, en: string) => tx(language, de, en);
  if (moves[at]?.move !== 'openPath') return { error: t('Hier ist kein Weg mehr offen', 'No path is open here any more') };
  if (NOT_ON_OPEN.includes(move.move)) return { error: t('Dieser Zug geht hier nicht', 'This move does not work here') };
  const old = tell(moves, language, opts);
  const line = (s: StoryState, i: number) => s.storyText.findIndex((l) => l.move === i && l.sub === undefined);
  const tail = (s: StoryState, i: number) => s.storyText.slice(line(s, i) + 1).map((l) => `${l.depth}|${l.text}`).join('\n');
  const was = tail(old, at);
  const open: Move = { move: 'openPath' };
  const closing = move.move === 'end' || move.move === 'goTo' || move.move === 'merge';
  const plain = closing ? [move] : [move, ...Array.from({ length: Math.max(pathCount(move) - 1, 0) }, () => open)];
  // A branch before a placeholder that runs on into a merge (job 400): each of its paths gets such a
  // placeholder of its own, so they merge in the new branch and the old placeholder runs on into the old
  // merge. Where that cannot be told (an exception path alongside), the plain placeholders.
  const joining: Move = { move: 'openPath', joins: true };
  const tries = !closing && (moves[at] as { joins?: true }).joins && BRANCHES.includes(move.move)
    ? [[move, ...Array.from({ length: pathCount(move) }, () => joining)], plain]
    : [plain];
  let result: { moves: Move[]; at: number | null } | { error: string } = { error: '' };
  for (const added of tries) {
    result = place(added);
    if ('moves' in result) break;
  }
  return result;

  function place(added: Move[]): { moves: Move[]; at: number | null } | { error: string } {
    let out = splice(moves, at, closing ? 1 : 0, added, language, opts);
    /** The last move of what was told here: the placeholder, or what took its place. */
    const last = at + added.length - (closing ? 1 : 0);
    let next: number | null = closing ? null : at + 1;
    let extra = -1;
    let s = tell(out, language, opts);
    /** The continuation a merge here opens; it was not there before when the other paths all ended. */
    const continuation = move.move === 'merge' && s.trace.closes[at] !== undefined ? `${s.trace.closes[at]}+` : undefined;
    let fresh = continuation !== undefined && !s.errors.length && s.trace.keys.length > old.trace.keys.length;
    if (fresh) {
      // It stays open where its turn comes, before the move that belongs to the next path; when its turn
      // comes only after the last move, it is simply the path the story goes on with.
      for (let j = at + 1; j < out.length; j++)
        if (tell(out.slice(0, j), language, opts).trace.keys[0] === continuation) {
          out = splice(out, j, 0, [open], language, opts);
          next = extra = j;
          s = tell(out, language, opts);
          fresh = false;
          break;
        }
    }
    if (s.errors.length) return { error: s.errors[0] };
    const now = { ...s, storyText: s.storyText.filter((l) => l.move !== extra || l.sub !== undefined) };
    const keys = s.trace.keys.length - (fresh && s.trace.keys.includes(continuation!) ? 1 : 0);
    if (line(now, last) < 0 || tail(now, last) !== was || keys !== old.trace.keys.length)
      return { error: t('Das würde verschieben, was danach erzählt ist', 'That would shift what is told after it') };
    return { moves: out, at: next };
  }
}

/**
 * Reopens the path that move `at` closes (a merge, "continue at" or an end, job 400): the move becomes a
 * placeholder still open, to be told again with tellOpen; the moves before it and everything after it stay.
 * A merge that no other path reaches any more becomes a placeholder that runs on into the merge
 * (`joins`), so what comes after it stays reachable. Refused when "continue at" leads to this end, or
 * when what comes after would be told differently. `opts`: as for tell().
 */
export function reopenPath(moves: Move[], at: number, language?: Language, opts: TellOptions = {}): { moves: Move[] } | { error: string; line?: number } {
  const t = (de: string, en: string) => tx(language, de, en);
  const z = moves[at];
  if (!z || (z.move !== 'merge' && z.move !== 'goTo' && z.move !== 'end')) return { error: t('Hier endet kein Weg', 'No path ends here') };
  const old = tell(moves, language, opts);
  const end = z.move === 'end' ? old.nodes[at] : undefined;
  if (end)
    for (const [j, m] of moves.entries())
      if (m.move === 'goTo' && m.target === end) {
        return stillLeads(j, old.ir, old.nodes, end, language);
      }
  const b = old.trace.closes[at];
  const others = z.move === 'merge' && b !== undefined && old.trace.closes.some((c, j) => j !== at && c === b);
  const open: Move = z.move === 'merge' && !others ? { move: 'openPath', joins: true } : { move: 'openPath' };
  const out = splice(moves, at, 1, [open], language, opts);
  const s = tell(out, language, opts);
  const line = (st: StoryState) => st.storyText.findIndex((l) => l.move === at && l.sub === undefined);
  const tail = (st: StoryState) => st.storyText.slice(line(st) + 1).map((l) => `${l.depth}|${l.text}`).join('\n');
  if (s.errors.length || old.errors.length || line(s) < 0 || tail(s) !== tail(old) || s.trace.keys.length !== old.trace.keys.length)
    return { error: t('Dieser Weg lässt sich hier nicht wieder öffnen', 'This path cannot be reopened here') };
  return { moves: out };
}

/** Moves "+ Insert before" can put in the middle of a story: they let what comes after go on. */
export const INSERTABLE: Move['move'][] = ['task', 'wait', 'sendSignal', 'decision', 'concurrent'];

/**
 * Puts `move` before move `i` (job 408); before an exception line it goes before the step the exception
 * hangs on. A task, a wait or a signal simply goes in. A branch (a decision or "in parallel") takes what
 * comes after into its first path; each further path gets a placeholder still open where its turn comes
 * (as addPaths). Where an old move on the first path would now close the new branch instead of its own,
 * or no longer fits there (e.g. "continue at" out of a branch of "in parallel"), the new branch is closed
 * right before it: a merge, its further paths as placeholders that run on into that merge.
 * `opts`: as for tell().
 */
export function insertBefore(moves: Move[], i: number, move: Move, language?: Language, opts: TellOptions = {}): { moves: Move[] } | { error: string } {
  const t = (de: string, en: string) => tx(language, de, en);
  if (!INSERTABLE.includes(move.move) || i < 0 || i >= moves.length) return { error: t('Dieser Zug geht hier nicht', 'This move does not work here') };
  let p = i;
  if (moves[i].move === 'exceptionPath') {
    // The step the exception hangs on (as beforeAt in the workbench).
    const had = new Set(tell(moves.slice(0, i), language, opts).ir.nodes.map((n) => n.id));
    const s = tell(moves.slice(0, i + 1), language, opts);
    const node = s.ir.nodes.find((n) => n.kind === 'exception' && !had.has(n.id));
    const step = node?.kind === 'exception' ? s.nodes.indexOf(node.attachedTo) : -1;
    if (step >= 0) p = step;
  }
  if (!BRANCHES.includes(move.move)) {
    const out = splice(moves, p, 0, [move], language, opts);
    const errors = tell(out, language, opts).errors;
    return errors.length ? { error: errors[0] } : { moves: out };
  }
  const count = pathCount(move);
  return insertBranch(moves, p, move, Array.from({ length: count - 1 }, (_, n) => `${p}.${n + 1}`), `${p}.0`, language, opts);
}

/**
 * Gives the task of move `j` an exception (job 408): `move` (an exceptionPath) right after it, its path
 * still open; the normal path goes on with what was told after the task. Refused on a move that is no
 * task or whose task has an exception already. `opts`: as for tell().
 */
export function addException(moves: Move[], j: number, move: Move, language?: Language, opts: TellOptions = {}): { moves: Move[] } | { error: string } {
  const t = (de: string, en: string) => tx(language, de, en);
  if (moves[j]?.move !== 'task' || move.move !== 'exceptionPath') return { error: t('Hier kann keine Ausnahme hängen', 'No exception can attach here') };
  const s = tell(moves, language, opts);
  const task = s.nodes[j];
  if (!task || s.ir.nodes.some((n) => n.kind === 'exception' && n.attachedTo === task))
    return { error: t('Dieser Schritt hat schon eine Ausnahme', 'This step has an exception already') };
  return insertBranch(moves, j + 1, move, [`${j + 1}.0`], `${j + 1}.1`, language, opts);
}

/**
 * One more trigger of the same process (job 408): `move` (an orStart) right after the trigger and the
 * further triggers told so far. Refused with the reason of the replay (e.g. a second plain trigger).
 * Only on the main level. `opts`: as for tell().
 */
export function addTrigger(moves: Move[], move: Move, language?: Language, opts: TellOptions = {}): { moves: Move[] } | { error: string } {
  const t = (de: string, en: string) => tx(language, de, en);
  if (opts.inner || moves[0]?.move !== 'start' || move.move !== 'orStart') return { error: t('Dieser Zug geht hier nicht', 'This move does not work here') };
  let p = 1;
  while (moves[p]?.move === 'orStart') p++;
  const out = splice(moves, p, 0, [move], language, opts);
  const errors = tell(out, language, opts).errors;
  return errors.length ? { error: errors[0] } : { moves: out };
}

/**
 * Inserts the branch `move` at `p` and tells the moves from `p` on again on its path `carrier`. Each path
 * of `fresh` gets a placeholder still open where its turn comes; once the branch had to be closed (see
 * insertBefore), the placeholders run on into its merge. Refused when anything told afterwards would be
 * told differently: a merge closing another branch, "continue at" with another target, other open paths.
 */
function insertBranch(moves: Move[], p: number, move: Move, fresh: string[], carrier: string, language?: Language, opts: TellOptions = {}): { moves: Move[] } | { error: string } {
  const t = (de: string, en: string) => tx(language, de, en);
  const refuse = { error: t('Das würde verschieben, was danach erzählt ist', 'That would shift what is told after it') };
  const old = tell(moves, language, opts);
  if (old.errors.length) return refuse;
  const { switched, owner } = old.trace;
  const pending = new Set(fresh);
  let closed = false;
  const index: number[] = [];
  const out: Move[] = [];
  for (let j = 0; j < p; j++) {
    index[j] = j;
    out.push(moves[j]);
  }
  out.push(move);
  /** Key of an old path in the new story: move numbers from p on shift; the path the branch went into goes on on its carrier. */
  const newKey = (key: string): string | undefined => {
    if (key === owner[p] && p < moves.length) return closed ? `${p}+` : carrier;
    if (key === 'r') return key;
    const [, b, rest] = key.match(/^(\d+)(.*)$/)!;
    return index[+b] === undefined ? undefined : `${index[+b]}${rest}`;
  };
  /** Does path `key` stem from a path of the new branch? */
  const inBranch = (s: StoryState, key: string | undefined): boolean => descends(s.trace, key, (k) => k.startsWith(`${p}.`));
  const placeholders = () => {
    while (pending.size) {
      const key = tell(out, language, opts).trace.keys[0];
      if (!key || !pending.has(key)) return;
      out.push(closed ? { move: 'openPath', joins: true } : { move: 'openPath' });
      pending.delete(key);
    }
  };
  for (let j = p; j < moves.length; j++) {
    placeholders();
    let m = moves[j];
    if (m.move === 'goTo') {
      const from = old.nodes.indexOf(m.target);
      const id = from >= 0 && index[from] !== undefined ? tell(out, language, opts).nodes[index[from]] : undefined;
      if (id) m = { ...m, target: id };
    }
    if (m.move === 'switchTo') {
      const key = switched[j] && newKey(switched[j]!);
      const to = key ? tell(out, language, opts).trace.keys.indexOf(key) : -1;
      if (to < 1) return refuse;
      m = { move: 'switchTo', to };
    }
    if (!closed) {
      const before = tell(out, language, opts);
      const s = tell([...out, m], language, opts);
      const wrong = s.errors.length > before.errors.length || (old.trace.closes[j] !== undefined && s.trace.closes[out.length] === p);
      if (wrong && inBranch(before, before.trace.keys[0])) {
        out.push({ move: 'merge' });
        closed = true;
        placeholders();
      }
    }
    index[j] = out.length;
    out.push(m);
  }
  placeholders();
  const s = tell(out, language, opts);
  if (s.errors.length) return refuse;
  for (const [j, b] of old.trace.closes.entries()) if (b !== undefined && s.trace.closes[index[j]] !== index[b]) return refuse;
  if (s.trace.keys.length !== old.trace.keys.length + pending.size) return refuse;
  return { moves: out };
}

/**
 * Opening a working file of 0.1.0 (job 438): its "continue at" into or out of a branch of "in parallel"
 * is refused since job 411. Each such move becomes a path still open (as reopenPath does); everything
 * else stays. The node IDs of the moves after it count differently now (the old move may have made a
 * merge point, the placeholder takes an ID), so every other "continue at" is rewritten via the move
 * that created its target, as splice does, but read from the replay as 0.1.0 told it.
 * `lines`: the reopened moves, counted from 1 as in the story. Main level only (0.1.0 had no others).
 */
export function reopenLegacyGoTos(moves: Move[], language?: Language): { moves: Move[]; lines: number[] } | { error: string } {
  const t = (de: string, en: string) => tx(language, de, en);
  const refused = { error: t('Die Geschichte lässt sich nicht abspielen', 'The story cannot be replayed') };
  const old = tell(moves, language, { legacyGoTo: true });
  const reopened = old.legacyGoTos ?? [];
  if (old.errors.length || !reopened.length) return refused;
  const result: Move[] = moves.map((z, i) => (reopened.includes(i) ? { move: 'openPath' } : z));
  for (const [j, z] of result.entries()) {
    if (z.move !== 'goTo') continue;
    const from = old.nodes.indexOf(z.target);
    if (from < 0) continue;
    const id = tell(result.slice(0, j), language).nodes[from];
    if (!id) return refused;
    result[j] = { ...z, target: id };
  }
  if (tell(result, language).errors.length) return refused;
  return { moves: result, lines: reopened.map((i) => i + 1) };
}

/** Most rounds of dropRefused (each drops one refused move, or the tail after the end): a foreign file stays fast. */
export const MAX_DROP_ROUNDS = 20;

/** The node kind a move of the main flow creates under its own text, for matching a "continue at" with the file's diagram. */
const createdKind = (z: Move): string | undefined =>
  z.move === 'task' ? 'step' : z.move === 'wait' ? 'wait' : z.move === 'sendSignal' ? 'send' : z.move === 'end' ? 'end' : undefined;

/**
 * Per "continue at" move of a stored story: the move that created its target, read from the diagram in the
 * file (job 439). The core numbers its IDs one after another, so the k-th node of a kind and name (by the
 * number in its ID) belongs to the k-th move creating such a node. Undefined where that does not add up.
 */
function goToSources(moves: Move[], file: ProcessIR): Map<number, number> {
  const num = (id: string) => Number(/_(\d+)$/.exec(id)?.[1] ?? NaN);
  const key = (kind: string, name: string) => `${kind}|${k(name)}`;
  // The waiting that begins a path of "what comes first" is made by the decision, not by a move "wait" (job 441),
  // and was never a target in 0.1.0: counting it would put the ranks of the waits out of step with their moves.
  const firstPath = (id: string) =>
    incoming(file, id).some((e) => {
      const g = nodeById(file, e.from);
      return g?.kind === 'gateway' && g.gatewayType === 'event';
    });
  const nodesOf = new Map<string, string[]>();
  for (const n of file.nodes) {
    if (!['step', 'wait', 'send', 'end'].includes(n.kind) || !Number.isFinite(num(n.id))) continue;
    if (n.kind === 'wait' && firstPath(n.id)) continue;
    const kk = key(n.kind, n.name ?? '');
    nodesOf.set(kk, [...(nodesOf.get(kk) ?? []), n.id]);
  }
  for (const ids of nodesOf.values()) ids.sort((a, b) => num(a) - num(b));
  const movesOf = new Map<string, number[]>();
  for (const [i, z] of moves.entries()) {
    const kind = createdKind(z);
    if (!kind || typeof (z as { text?: unknown }).text !== 'string') continue;
    const kk = key(kind, (z as { text: string }).text);
    movesOf.set(kk, [...(movesOf.get(kk) ?? []), i]);
  }
  const sources = new Map<number, number>();
  for (const [j, z] of moves.entries()) {
    if (z.move !== 'goTo') continue;
    const n = nodeById(file, z.target);
    if (!n) continue;
    const kk = key(n.kind, n.name ?? '');
    const ids = nodesOf.get(kk) ?? [];
    const ms = movesOf.get(kk) ?? [];
    const rank = ids.indexOf(z.target);
    if (rank < 0 || ids.length !== ms.length || ms[rank] >= j) continue;
    sources.set(j, ms[rank]);
  }
  return sources;
}

/**
 * Opening a working file (job 440): every "continue at" leads to what the move of its target creates in this
 * replay, read from the diagram in the file (goToSources). 0.1.0 numbered its nodes differently after the extra
 * merge (job 439), so a stored ID may name another step now without any error. `lines`: the "continue at"
 * moves whose ID was rewritten, counted from 1. A move without a clear source keeps its ID; the caller checks
 * that the result replays. Main level only (0.1.0 had no others).
 */
export function retargetGoTos(moves: Move[], language: Language | undefined, file: ProcessIR): { moves: Move[]; lines: number[] } {
  const sources = goToSources(moves, file);
  if (!sources.size) return { moves, lines: [] };
  // legacyGoTo (job 442): a 0.1.0 "continue at" into a branch of "in parallel" must not stop the replay, or the
  // targets after it would be lost; whether the result plays is checked by the caller (strictly, or by reopening).
  const s = tell(moves, language, { goToMove: Object.fromEntries(sources), legacyGoTo: true });
  const lines: number[] = [];
  const result = moves.map((z, j) => {
    const q = sources.get(j);
    const id = q === undefined ? undefined : s.nodes[q];
    if (z.move !== 'goTo' || !id || id === z.target) return z;
    lines.push(j + 1);
    return { ...z, target: id };
  });
  return { moves: lines.length ? result : moves, lines };
}

/**
 * Opening a working file whose story the core refuses in places (job 439; e.g. 0.1.0 left an extra path open
 * after a branch in the last path of another one, and the line told on it is refused since job 421): drops
 * the refused moves of the main flow and replays the rest. Once the story has ended, every
 * later move but "at any time" goes with it. Every "continue at" gets the ID its target has now (matched with
 * the diagram of the file, see goToSources), in the same replay. A round drops every move refused in its replay; at most
 * MAX_DROP_ROUNDS rounds. `dropped`: indices of the dropped moves in `moves`. Error when
 * the trigger is refused, a move inside a subprocess or "at any time", after MAX_DROP_ROUNDS rounds, or when
 * nothing is left to drop. Moves accepted only with legacyGoTo (job 438) stay for reopenLegacyGoTos.
 */
export function dropRefused(moves: Move[], language: Language | undefined, file: ProcessIR): { moves: Move[]; dropped: number[] } | { error: string } {
  const t = (de: string, en: string) => tx(language, de, en);
  const refused = { error: t('Die Geschichte lässt sich nicht abspielen', 'The story cannot be replayed') };
  const sources = goToSources(moves, file);
  let kept = moves.map((z, i) => ({ i, z }));
  for (let round = 0; ; round++) {
    // One replay per round: each "continue at" leads to what the move of its target creates in this very
    // replay (TellOptions.goToMove), so IDs shifted by a dropped line are followed without replaying again.
    const pos = new Map(kept.map((m, p) => [m.i, p]));
    const goToMove: Record<number, number> = {};
    for (const [p, m] of kept.entries()) {
      const q = sources.has(m.i) ? pos.get(sources.get(m.i)!) : undefined;
      if (q !== undefined && q < p) goToMove[p] = q;
    }
    const s = tell(kept.map((m) => m.z), language, { legacyGoTo: true, goToMove });
    kept = kept.map((m, p) => {
      const id = goToMove[p] === undefined ? undefined : s.nodes[goToMove[p]];
      return m.z.move === 'goTo' && id && id !== m.z.target ? { i: m.i, z: { ...m.z, target: id } } : m;
    });
    if (!s.errors.length) {
      const result = kept.map((m) => m.z);
      const left = new Set(kept.map((m) => m.i));
      return JSON.stringify(result) === JSON.stringify(moves) ? refused : { moves: result, dropped: moves.map((_, i) => i).filter((i) => !left.has(i)) };
    }
    // A refused move changes nothing in tell(), so every move refused in this replay goes at once (one
    // replay of a long story takes a while); what they still refuse comes up in the next round.
    const e = s.refused?.[0];
    if (round >= MAX_DROP_ROUNDS || e === undefined || e <= 0) return refused;
    // Moves with no path open: the story had ended, they cannot play (the core names only the first).
    const out = new Set(s.refused);
    for (let p = e; p < kept.length; p++) if (s.trace.owner[p] === undefined && kept[p].z.move !== 'anytime') out.add(p);
    for (const p of out) {
      const z = kept[p]?.z;
      if (!z || z.move === 'start' || z.move === 'orStart' || z.move === 'anytime' || (z.move === 'task' && z.subprocess !== undefined)) return refused;
    }
    kept = kept.filter((_, p) => !out.has(p));
  }
}

/**
 * A move as its line in the story (job 439: the note names the lines dropped on opening). Same wording as
 * tell(); `name`: the shown name of the target of "continue at". Start, other triggers and "at any time" are
 * named by their text.
 */
export function moveLine(z: Move, language?: Language, name?: string): string {
  const t = (de: string, en: string) => tx(language, de, en);
  const text = typeof (z as { text?: unknown }).text === 'string' ? k((z as { text: string }).text) : '';
  switch (z.move) {
    case 'task': {
      const system = z.system?.trim();
      const deadline = z.deadline?.trim();
      const documents = (z.documentName ?? '').split(',').map((d) => d.trim()).filter(Boolean);
      const each = typeof z.each === 'string' && k(z.each) ? `, ${t('JE', 'FOR EACH')} [${k(z.each)}], ${z.eachOrder === 'parallel' ? t('GLEICHZEITIG', 'IN PARALLEL') : t('NACHEINANDER', 'IN SEQUENCE')}` : '';
      const extra =
        (system ? ` in [#${k(system)}]` : '') +
        (documents.length ? ` ${t('mit', 'with')} ${documents.map((d) => `[+${k(d)}]`).join(', ')}` : '') +
        (deadline ? t(`, Frist [!${k(deadline)}]`, `, deadline [!${k(deadline)}]`) : '') +
        each +
        (z.subprocess !== undefined ? t(', MIT TEILABLAUF', ', WITH SUBPROCESS') : '');
      return t(`[@${k(z.role ?? '')}] soll [${text}]${extra}.`, `[@${k(z.role ?? '')}] shall [${text}]${extra}.`);
    }
    case 'wait': {
      const subtype = z.subtype || 'message';
      return subtype === 'condition' ? `${t('WARTEN BIS', 'WAIT UNTIL')} [${text}].` : subtype === 'signal' ? `${t('WARTEN AUF SIGNAL', 'WAIT FOR SIGNAL')} [${text}].` : `${t('WARTEN AUF', 'WAIT FOR')} [${subtype === 'time' ? '!' : ''}${text}].`;
    }
    case 'sendSignal':
      return `${t('SIGNAL SENDEN', 'SEND SIGNAL')} [${text}].`;
    case 'decision':
      return z.subtype === 'first' ? t('WAS ZUERST PASSIERT:', 'WHAT COMES FIRST:') : `${t('WENN', 'IF')} [?${k(z.question ?? '').replace(/\?+$/, '')}]`;
    case 'concurrent':
      return t('GLEICHZEITIG:', 'IN PARALLEL:');
    case 'exceptionPath': {
      const trigger = z.subtype === 'deadline' || z.subtype === 'message' ? z.subtype : 'error';
      const goTo = z.keepsRunning === 'yes' && trigger !== 'error';
      return `${t('AUSNAHME', 'EXCEPTION')}${trigger === 'message' ? t(' NACHRICHT', ' MESSAGE') : ''} [${trigger === 'deadline' ? '!' : ''}${text}]${goTo ? t(', Schritt läuft weiter', ', step continues') : ''}:`;
    }
    case 'merge':
      return t('ZUSAMMENFÜHREN.', 'MERGE.');
    case 'end': {
      const how = z.subtype === 'message' ? t(' mit Nachricht', ' with a message') : z.subtype === 'signal' ? t(' mit Signal', ' with a signal') : z.subtype === 'cancel' ? t(', alles abbrechen', ', stop everything') : '';
      return `${t('ENDE', 'END')}${how}: [${text}].`;
    }
    case 'goTo':
      return k(name ?? '') ? `${t('WEITER BEI', 'CONTINUE AT')} [${k(name ?? '')}].` : t('WEITER BEI …', 'CONTINUE AT …');
    case 'openPath':
      return z.joins ? t('NOCH OFFEN, DANN ZUSAMMENFÜHREN.', 'STILL OPEN, THEN MERGE.') : t('NOCH OFFEN.', 'STILL OPEN.');
    case 'switchTo':
      return t('(einen anderen offenen Weg zuerst erzählen)', '(tell another open path first)');
    default:
      return text;
  }
}

/**
 * Swaps path `path` and path `path + 1` of the branch told in move `at` (a check, "what comes first" or
 * "in parallel", job 455): the labels (and kinds) of the two paths trade places in the branch move, and
 * so do the moves told on them, so that the story tells them in the new order. The flow stays the same:
 * every step keeps its condition, "continue at" keeps its target. The otherwise path of a check stays
 * the last one. Refused when the moves of the two paths do not lie each in one block right after each
 * other (a path not told yet, pulling forward on one of them), or when a "continue at" would then lead
 * to something told only later. `opts`: as for tell().
 */
export function swapPaths(moves: Move[], at: number, path: number, language?: Language, opts: TellOptions = {}): { moves: Move[] } | { error: string } {
  const t = (de: string, en: string) => tx(language, de, en);
  const z = moves[at];
  if (!z || (z.move !== 'decision' && z.move !== 'concurrent')) return { error: t('Hier verzweigt sich nichts', 'Nothing branches here') };
  const count = pathCount(z);
  const check = z.move === 'decision' && z.subtype !== 'first';
  if (!Number.isInteger(path) || path < 0 || path + 1 >= count || (check && path + 1 === count - 1))
    return { error: t('Diesen Weg gibt es hier nicht', 'There is no such path here') };
  const refuse = { error: t('Diese Wege lassen sich hier nicht tauschen; erzählen Sie zuerst beide Wege zu Ende', 'These paths cannot be swapped here; tell both paths to their end first') };
  const old = tell(moves, language, opts);
  if (old.errors.length) return refuse;
  const { owner, switched } = old.trace;
  const a = `${at}.${path}`;
  const b = `${at}.${path + 1}`;
  const on = (key: string | undefined, root: string) => descends(old.trace, key, root);
  const inA = moves.flatMap((_, j) => (j > at && on(owner[j], a) ? [j] : []));
  const inB = moves.flatMap((_, j) => (j > at && on(owner[j], b) ? [j] : []));
  const piece = (list: number[]) => list.length > 0 && list.every((j, n) => n === 0 || j === list[n - 1] + 1);
  if (!piece(inA) || !piece(inB) || inA[inA.length - 1] + 1 !== inB[0]) return refuse;
  // Pulling forward one of the two paths (or on them) depends on the order they are told in.
  if (moves.some((m, j) => m.move === 'switchTo' && (on(switched[j], a) || on(switched[j], b) || on(owner[j], a) || on(owner[j], b)))) return refuse;

  let swapped: Move;
  if (z.move === 'concurrent') swapped = z;
  else {
    const trade = <T,>(list: T[]): T[] => list.map((x, j) => (j === path ? list[path + 1] : j === path + 1 ? list[path] : x));
    const labels = trade([z.yes, ...(z.more ?? []), z.no]);
    // Same fields in the same order as before (swapping twice gives the very move back).
    const d: Record<string, unknown> = { ...z, yes: labels[0], no: labels[labels.length - 1] };
    if (labels.length > 2) d.more = labels.slice(1, -1);
    if (z.subtype === 'first') {
      const kinds = trade([z.yesKind, ...(z.more ?? []).map((_, n) => z.moreKinds?.[n]), z.noKind]);
      const middle = kinds.slice(1, -1);
      const set = (key: string, v: unknown) => (v ? (d[key] = v) : delete d[key]);
      set('yesKind', kinds[0]);
      set('noKind', kinds[kinds.length - 1]);
      set('moreKinds', middle.some(Boolean) ? middle.map((k) => k ?? '') : undefined);
    }
    swapped = d as Move;
  }

  // New order of the old moves: path b's moves first, then path a's.
  const order = [...moves.keys()].filter((j) => !inA.includes(j) && !inB.includes(j));
  const p = order.indexOf(inA[0] - 1) + 1;
  order.splice(p, 0, ...inB, ...inA);
  const index: number[] = [];
  order.forEach((j, k) => (index[j] = k));
  const out: Move[] = [];
  for (const j of order) {
    const m = moves[j];
    if (j === at) {
      out.push(swapped);
      continue;
    }
    if (m.move === 'goTo') {
      const from = old.nodes.indexOf(m.target);
      if (from >= 0) {
        // A target told only later (it moved behind the "continue at") cannot be reached from here.
        const id = index[from] < out.length ? tell(out, language, opts).nodes[index[from]] : undefined;
        if (!id) return refuse;
        out.push({ ...m, target: id });
        continue;
      }
    }
    out.push(m);
  }
  const next = tell(out, language, opts);
  if (next.errors.length) return refuse;
  // Each move lies on the path it had, under its new number; the open points stay as they were.
  const onNew = (j: number, root: string) => descends(next.trace, next.trace.owner[index[j]], root);
  if (!inA.every((j) => onNew(j, b)) || !inB.every((j) => onNew(j, a))) return refuse;
  if (next.trace.keys.length !== old.trace.keys.length || (next.ir.openPoints?.length ?? 0) !== (old.ir.openPoints?.length ?? 0)) return refuse;
  return { moves: out };
}

/** Lines that "From here on for all paths" is not offered on: they close or open a path, or lie outside the flow. */
const NOT_JOINABLE: Move['move'][] = ['merge', 'openPath', 'switchTo', 'exceptionPath', 'start', 'orStart', 'anytime'];

/**
 * The path of a branch that move `i` lies on (job 456): the first key `<b>.<n>` above its owner; the
 * continuation of a branch inside it (`<x>+`) is skipped. Undefined on the main path and where that path
 * belongs to an exception (the exception path or the normal path beside it).
 */
function branchPathOf(moves: Move[], trace: StoryState['trace'], i: number): { key: string; b: number } | undefined {
  for (let key = trace.owner[i]; key !== undefined && key !== 'r'; key = trace.parent[key]) {
    const m = /^(\d+)\.\d+$/.exec(key);
    if (!m) continue;
    const b = Number(m[1]);
    const z = moves[b];
    return z?.move === 'decision' || z?.move === 'concurrent' ? { key, b } : undefined;
  }
  return undefined;
}

/**
 * Does the line menu of move `i` offer "From here on for all paths" (job 456)? Only from the trace of
 * the story as told now, without replaying it: a line on a path of a check, "what comes first" or
 * "in parallel" that is not the first line of that path, and not a merge, a path still open or pulling forward.
 */
export function joinAllOffered(moves: Move[], i: number, trace: StoryState['trace']): boolean {
  const z = moves[i];
  if (!z || NOT_JOINABLE.includes(z.move)) return false;
  const p = branchPathOf(moves, trace, i);
  if (!p) return false;
  for (let j = p.b + 1; j < i; j++) if (descends(trace, trace.owner[j], p.key)) return true;
  return false;
}

/**
 * "From here on for all paths" (job 456): the path of move `i` merges right before it, and move `i` with
 * everything told after it on that path comes after the merge of the branch, for all its paths. The other
 * paths keep what is told on them: one that merges already stays, one that ends in a path still open
 * (or is not told yet) becomes a placeholder that runs on into the merge. Refused when another path ends
 * on its own (an end, "continue at"), when the path of `i` ends on its own and something is told after
 * the merge already, when a "continue at" would lead into the moved part from before it, or when the
 * result does not replay. `at`: the new index of move `i`. `opts`: as for tell().
 */
export function joinAllFrom(moves: Move[], i: number, language?: Language, opts: TellOptions = {}): { moves: Move[]; at: number } | { error: string; line?: number } {
  const t = (de: string, en: string) => tx(language, de, en);
  const fits = { error: t('Ab hier für alle Wege passt hier nicht; ändern Sie zuerst die Wege um diese Zeile', 'From here on for all paths does not fit here; change the paths around this line first') };
  const old = tell(moves, language, opts);
  if (old.errors.length || !joinAllOffered(moves, i, old.trace)) return fits;
  const { owner, closes, keys } = old.trace;
  const { key: P, b } = branchPathOf(moves, old.trace, i)!;
  const on = (j: number, root: string) => descends(old.trace, owner[j], root);
  // Pulling forward counts open paths by their position: that changes with the new order.
  if (moves.some((m, j) => j > b && m.move === 'switchTo')) return fits;
  const rest = moves.flatMap((_, j) => (j >= i && on(j, P) ? [j] : []));
  if (rest.some((j, n) => j !== i + n)) return fits;
  // The path's own merge into the branch (a merge, or a placeholder that runs on into it) is its last move.
  const own = rest.find((j) => closes[j] === b);
  if (own !== undefined && own !== rest[rest.length - 1]) return fits;
  const moved = own === undefined ? rest : rest.slice(0, -1);
  const cont = `${b}+`;
  if (own === undefined && moves.some((_, j) => on(j, cont)))
    return { error: t('Nach dem Zusammenführen ist schon erzählt, wie es weitergeht – das passt hier nicht', 'What happens after the merge is told already – that does not fit here') };

  const joins: Move = { move: 'openPath', joins: true };
  /** Paths of the branch not told to their end yet: they get a placeholder once their moves are told. */
  const pending = new Map<string, number[]>();
  /** A path still open at its end becomes a placeholder that runs on into the merge. */
  const convert = new Set<number>();
  for (let n = 0; n < pathCount(moves[b]); n++) {
    const Q = `${b}.${n}`;
    if (Q === P) continue;
    const qs = moves.flatMap((_, j) => (j > b && on(j, Q) ? [j] : []));
    if (qs.some((j) => closes[j] === b)) continue;
    if (keys.includes(Q)) {
      pending.set(Q, qs);
      continue;
    }
    const last = qs[qs.length - 1];
    if (last !== undefined && moves[last].move === 'openPath' && !(moves[last] as { joins?: true }).joins && owner[last] === Q) {
      convert.add(last);
      continue;
    }
    if (last === undefined) return fits;
    return { error: t(`Ein anderer Weg dieser Verzweigung endet schon für sich (Zeile ${last + 1}) – dort zuerst ändern`, `Another path of this branch already ends on its own (line ${last + 1}) – change it there first`), line: last };
  }

  const index: (number | undefined)[] = [];
  const out: Move[] = [];
  for (let j = 0; j < i; j++) {
    index[j] = j;
    out.push(moves[j]);
  }
  // A placeholder of its own path stays one: the path is still open before the merge.
  out.push(own !== undefined && moves[own].move === 'openPath' ? joins : { move: 'merge' });
  const movedSet = new Set(moved);
  let placed = false;
  let refusal: { error: string; line?: number } | undefined;
  const push = (j: number): boolean => {
    let m = convert.has(j) ? joins : moves[j];
    if (m.move === 'goTo') {
      const from = old.nodes.indexOf(m.target);
      if (from >= 0) {
        const id = index[from] !== undefined ? tell(out, language, opts).nodes[index[from]!] : undefined;
        if (!id) {
          refusal = movedSet.has(from)
            ? { error: t(`Zeile ${j + 1} führt in den Teil, der für alle Wege gelten soll – dort zuerst ändern`, `Line ${j + 1} leads into the part that is to apply to all paths – change it there first`), line: j }
            : fits;
          return false;
        }
        m = { ...m, target: id };
      }
    }
    index[j] = out.length;
    out.push(m);
    return true;
  };
  /** Placeholders of paths whose turn it is, and the moved part once the continuation of the branch is current. */
  const fill = (): boolean => {
    for (;;) {
      const cur = tell(out, language, opts).trace.keys[0];
      const waiting = cur !== undefined ? pending.get(cur) : undefined;
      if (waiting && waiting.every((j) => index[j] !== undefined)) {
        out.push(joins);
        pending.delete(cur!);
        continue;
      }
      if (!placed && cur === cont) {
        placed = true;
        for (const j of moved) if (!push(j)) return false;
        continue;
      }
      return true;
    }
  };
  for (let j = i; j < moves.length; j++) {
    if (j <= rest[rest.length - 1]) continue;
    if (!fill() || !push(j)) return refusal ?? fits;
  }
  if (!fill()) return refusal ?? fits;
  if (!placed || pending.size) return fits;

  const next = tell(out, language, opts);
  if (next.errors.length) return fits;
  if (!moved.every((j) => descends(next.trace, next.trace.owner[index[j]!], cont))) return fits;
  if (moves.some((_, j) => j !== own && index[j] === undefined)) return fits;
  const loop = noEnd(old, out, (k) => indexOfNew(index, k), language, opts);
  return loop ?? { moves: out, at: index[i]! };
}

/** Lines "Move …" is offered on (job 457): steps, waiting, signals and branches with all their paths. */
const MOVABLE: Move['move'][] = ['task', 'wait', 'sendSignal', 'decision', 'concurrent'];

/** The path a line is shown on: the continuation after a merge (`<x>+`) stands on the path of its branch. */
function shownPath(trace: StoryState['trace'], key: string | undefined): string | undefined {
  let k = key;
  while (k !== undefined && k.endsWith('+')) k = trace.parent[k];
  return k;
}

/** Moves of steps that have an exception hanging on them. */
function withException(state: StoryState): Set<number> {
  const out = new Set<number>();
  for (const n of state.ir.nodes) {
    if (n.kind !== 'exception') continue;
    const j = state.moveOf[n.attachedTo];
    if (j !== undefined) out.add(j);
  }
  return out;
}

/** Last move that goes along with move j: j itself, a branch with every move told on its paths (not after its merge). */
function carriedEnd(moves: Move[], trace: StoryState['trace'], j: number): number {
  const z = moves[j];
  if (z?.move !== 'decision' && z?.move !== 'concurrent') return j;
  const own = (k: string) => k.startsWith(`${j}.`);
  let last = j;
  for (let m = j + 1; m < moves.length; m++) if (descends(trace, trace.owner[m], own)) last = m;
  return last;
}

/** Does the line menu of move `i` offer "Move …" (job 457)? From the story as told now, without replaying it. */
export function moveOffered(moves: Move[], i: number, state: StoryState): boolean {
  const z = moves[i];
  return !!z && MOVABLE.includes(z.move) && !withException(state).has(i);
}

/**
 * Lines up to which a move can take the lines after it along (job 457), first `i` itself: the next lines on
 * the same shown path, as long as they are steps, waiting, signals or branches; an end or "continue at" is the last.
 */
export function moveEnds(moves: Move[], i: number, state: StoryState): number[] {
  if (!moveOffered(moves, i, state)) return [];
  const { trace } = state;
  const exc = withException(state);
  const path = shownPath(trace, trace.owner[i]);
  const out = [i];
  for (let e = i; ; ) {
    const j = carriedEnd(moves, trace, e) + 1;
    const z = moves[j];
    if (!z || shownPath(trace, trace.owner[j]) !== path || exc.has(j)) break;
    if (!MOVABLE.includes(z.move) && z.move !== 'end' && z.move !== 'goTo') break;
    out.push(j);
    e = j;
    if (z.move === 'end' || z.move === 'goTo') break;
  }
  return out;
}

/** A place lines can be moved to: before old move `pos`; behind line `after`, at the start of path `path`, or at the start of the flow. */
export type MoveTarget = { pos: number; after?: number; path?: { at: number; n: number }; start?: true };

/**
 * Places the lines `i` to `e` can be moved to (job 457), in the order of the story: behind a step, a waiting,
 * a signal, a trigger or a branch that merges; at the start of a path told already; at the start of a flow
 * without a trigger. Whether it fits there shows moveSteps.
 */
export function moveTargets(moves: Move[], i: number, e: number, state: StoryState): MoveTarget[] {
  if (!moveEnds(moves, i, state).includes(e)) return [];
  const { trace } = state;
  const exc = withException(state);
  const last = carriedEnd(moves, trace, e);
  const inBlock = (j: number) => j >= i && j <= last;
  const same = (pos: number) => pos >= i && pos <= last + 1;
  const out: MoveTarget[] = [];
  if (moves[0]?.move !== 'start' && !same(0)) out.push({ pos: 0, start: true });
  for (const [n, z] of moves.entries()) {
    if (inBlock(n)) continue;
    const branch = z.move === 'decision' || z.move === 'concurrent';
    let fits = false;
    if (z.move === 'task' || z.move === 'wait' || z.move === 'sendSignal') fits = !exc.has(n);
    else if (z.move === 'start' || z.move === 'orStart') fits = moves[n + 1]?.move !== 'orStart';
    else if (branch) fits = trace.closes.some((b) => b === n);
    const pos = carriedEnd(moves, trace, n) + 1;
    if (fits && !same(pos)) out.push({ pos, after: n });
    if (!branch) continue;
    for (let p = 0; p < pathCount(z); p++) {
      const first = moves.findIndex((_, j) => j > n && descends(trace, trace.owner[j], `${n}.${p}`));
      if (first >= 0 && !inBlock(first) && !same(first)) out.push({ pos: first, path: { at: n, n: p } });
    }
  }
  return out.sort((a, b) => a.pos - b.pos);
}

/** Name of path `n` of the branch in move `b`: the label of a check, the event of "what comes first", the branch of "in parallel". */
export function pathLabel(moves: Move[], b: number, n: number, language?: Language): string {
  const z = moves[b];
  if (z?.move === 'concurrent') return branchName(n, language);
  if (z?.move !== 'decision') return '';
  return [z.yes, ...(z.more ?? []), z.no][n] ?? '';
}

/**
 * "Move …" (job 457): the lines `i` to `e` (a branch with everything told on its paths) go before old move
 * `pos` (one of moveTargets), in their order. "Continue at" keeps its target via the move that creates it.
 * Refused when a "continue at" would then lead to something told only later, when any other line would
 * land on another path or an exception on another step, when no end could be reached any more, or when the
 * result does not replay. `at`: the new index of move `i`. `opts`: as for tell().
 */
export function moveSteps(moves: Move[], i: number, e: number, pos: number, language?: Language, opts: TellOptions = {}): { moves: Move[]; at: number } | { error: string; line?: number } {
  const t = (de: string, en: string) => tx(language, de, en);
  const fits = { error: t('Dorthin lässt sich das nicht verschieben; ändern Sie zuerst die Wege um diese Zeilen', 'This cannot be moved there; change the paths around these lines first') };
  const old = tell(moves, language, opts);
  if (old.errors.length) return fits;
  const target = moveTargets(moves, i, e, old).find((x) => x.pos === pos);
  if (!target) return fits;
  const { trace } = old;
  const last = carriedEnd(moves, trace, e);
  if (moves.slice(i, last + 1).some((m) => m.move === 'switchTo')) return fits;
  // A path that begins in the moved lines but is told on after them would be torn apart.
  const opened = (k: string) => {
    const m = /^(\d+)\.\d+$/.exec(k);
    return !!m && Number(m[1]) >= i && Number(m[1]) <= last;
  };
  if (moves.some((_, j) => j > last && descends(trace, trace.owner[j], opened))) return fits;

  const block = Array.from({ length: last - i + 1 }, (_, n) => i + n);
  const order = [...moves.keys()].filter((j) => j < i || j > last);
  const at = pos >= moves.length ? order.length : order.indexOf(pos);
  order.splice(at, 0, ...block);
  const index: number[] = [];
  order.forEach((j, n) => (index[j] = n));
  const out: Move[] = [];
  for (const j of order) {
    const m = moves[j];
    if (m.move === 'goTo') {
      const from = old.nodes.indexOf(m.target);
      if (from >= 0) {
        if (index[from] >= out.length)
          return { error: t(`Zeile ${j + 1} führt danach zu einem Schritt, der erst später erzählt wird – dort zuerst ändern`, `Line ${j + 1} would then lead to a step told only later – change it there first`), line: j };
        const id = tell(out, language, opts).nodes[index[from]];
        if (!id) return fits;
        out.push({ ...m, target: id });
        continue;
      }
    }
    out.push(m);
  }

  const next = tell(out, language, opts);
  if (next.errors.length || out.length !== moves.length) return fits;
  /** Key of an old path in the new story. */
  const newKey = (key: string | undefined): string | undefined => {
    if (key === undefined || key === 'r') return key;
    const m = /^(\d+)(.*)$/.exec(key);
    return m ? `${index[Number(m[1])]}${m[2]}` : key;
  };
  const moved = shownPath(trace, trace.owner[i]);
  const goal = target.start ? 'r' : target.path ? `${target.path.at}.${target.path.n}` : shownPath(trace, trace.owner[target.after!]) ?? 'r';
  for (const [j] of moves.entries()) {
    const was = shownPath(trace, trace.owner[j]);
    const want = newKey(j >= i && j <= last && was === moved ? goal : was);
    if (shownPath(next.trace, next.trace.owner[index[j]]) !== want) return fits;
  }
  const keys = (list: (string | undefined)[]) => JSON.stringify([...list].sort());
  if (keys(trace.keys.map(newKey)) !== keys(next.trace.keys)) return fits;
  if ((next.ir.openPoints?.length ?? 0) !== (old.ir.openPoints?.length ?? 0)) return fits;
  // Every exception hangs on the step it hung on.
  const hangs = (s: StoryState, map: (j: number) => number) =>
    JSON.stringify(s.ir.nodes.flatMap((n) => (n.kind === 'exception' ? [[map(s.moveOf[n.id]), map(s.moveOf[n.attachedTo])]] : [])).sort());
  if (hangs(old, (j) => index[j]) !== hangs(next, (j) => j)) return fits;
  const loop = noEnd(old, out, (k) => indexOfNew(index, k), language, opts);
  return loop ?? { moves: out, at: index[i] };
}
