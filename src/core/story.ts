import { Op, ProcessIR, Node, EventKind, EndKind, ForEach, incoming, outgoing, nodeById, prefixed, isAnytime } from './ir.js';
import { applyOps } from './apply.js';
import { emptyProcess } from './pipeline.js';
import { Language, tx } from './language.js';
export { stillLeads, NOT_ON_OPEN, splice, replaceMove, BRANCHES, pathCount, removeBranch, deletePath, addPaths, tellOpen, reopenPath, reopenLegacyGoTos, INSERTABLE, insertBefore, addException, addTrigger } from './storyEdit.js';

/**
 * The process description as a story: move by move, and after each move
 * this module says which moves are possible next. What is offered
 * is always valid - the structure comes from the choice, not from guessing.
 *
 * A "thread" is an open arrow end: from here it has to go on. After
 * a decision there are several threads; they are told one after another.
 * A thread ends with "end", "continue at <existing task>" or
 * "runs together again". Only when all paths of a branch are done
 * is it merged - so nobody has to know the merge point
 * before it exists.
 *
 * No AI call: the role is chosen directly. System and deadline of a task
 * are optional fields in the task move and end up in the diagram via setDetails.
 */

export type Move =
  /** process: name of the pool; empty = default name ("Prozess" / "Process"). */
  /** subtype: empty = plain start, otherwise message or point in time (ADR 0005). */
  | { move: 'start'; text: string; role: string; process?: string; subtype?: EventKind | '' }
  /** Another trigger of the same process, told right after the trigger (any number of them): its own kind
   *  and role; all triggers run together before what comes first. At most one trigger begins plainly. */
  | { move: 'orStart'; text: string; role: string; subtype?: EventKind | '' }
  /** system, documentName, deadline: optional, empty = not given. They end up in the additional details.
   *  documentName: several separated by commas. */
  /** subprocess: the moves of the flow behind the task (it begins without a start move); present, even empty = subprocess. */
  /** each: the task runs once per item, e.g. "Rechnungsposition"; eachOrder: one after another (default) or all at once. */
  | { move: 'task'; text: string; role: string; system?: string; documentName?: string; deadline?: string; subprocess?: Move[]; each?: string; eachOrder?: 'sequential' | 'parallel' }
  /** subtype 'first': no check but waiting - the path whose event occurs first continues.
   *  yes/no are then the two events, yesKind/noKind their kind; question is omitted. */
  /** more: labels of the paths between yes (first) and no (last, the otherwise path of a check); moreKinds their kinds with 'first'. */
  | { move: 'decision'; question?: string; yes: string; no: string; more?: string[]; subtype?: '' | 'first'; yesKind?: EventKind; noKind?: EventKind; moreKinds?: (EventKind | '')[] }
  /** branches: number of branches, missing = 2. */
  | { move: 'concurrent'; branches?: number }
  /** Waiting: for a message, or for a duration / until a date. */
  | { move: 'wait'; text: string; subtype: EventKind }
  /** A signal (notice to everyone) goes out on the way. role: who gives it (the lane); empty = the current lane. */
  | { move: 'sendSignal'; text: string; role?: string }
  /** subtype 'deadline': deadline expired (timer), 'message': a message interrupts; otherwise error.
   *  keepsRunning 'yes': the task keeps running, the path is added (not for an error). */
  | { move: 'exceptionPath'; text: string; subtype?: 'error' | 'deadline' | 'message'; keepsRunning?: '' | 'yes' }
  | { move: 'merge' }
  /** subtype 'message': a message is sent; 'cancel': everything ends, including what runs alongside. */
  | { move: 'end'; text: string; subtype?: EndKind | '' }
  | { move: 'goTo'; target: string }
  /** Something that can come at any time during the main flow, or while a subprocess runs (BPMN event subprocess). text: what comes,
   *  subtype: by what, keepsRunning 'yes': the process keeps running alongside, otherwise everything stops.
   *  subprocess: the moves of its flow (it begins with that trigger, without a start move). Told after the
   *  main flow; where it stands among the moves changes nothing. */
  | { move: 'anytime'; text: string; subtype: EventKind; keepsRunning?: '' | 'yes'; subprocess?: Move[] }
  /** Tell another open path first: to = position in StoryState.open, starting at 1. */
  | { move: 'switchTo'; to: number }
  /** A path not told yet, added to a branch after the story went on (job 395): it ends here for now,
   *  as an end "still open" with an open point, until it is told (tellOpen). */
  /** joins: the path is still open but runs on into the merge of its branch (it was the only one to reach it,
   *  job 400): a placeholder step "Noch offen" before the merge, so what comes after the merge stays reachable. */
  | { move: 'openPath'; joins?: true };

type Thread = {
  /** Which path this is, stable across moves: 'r' main path, '<move>.<n>' path n of the
   *  branch told in that move, '<move>+' the continuation after its merge. */
  key: string;
  origin: string;
  laneId: string;
  /** Heading for the question: where are we right now? */
  title: string;
  /** Name of the path we are on ("„Betrag über 5000 €?“ → ja"). Missing on the main path. */
  path?: string;
  condition?: string;
  otherwise?: boolean;
  /** Last task on this thread - an exception can hang off it. */
  task?: string;
  /** Open branches, innermost last. */
  splits: string[];
  /** Heading of the path in the story text ("SONST nein:"), before its first line. */
  head?: string;
  /** Indentation in the story text. Not splits.length: after an exception
   *  the normal path remains the main line, only the exception path is indented. */
  depth: number;
};

/**
 * One line of story text: signal word at the start, every object in square
 * brackets, the character inside gives the kind (see CONTEXT.md, story text):
 * [task] [@role] [#system] [+document] [!deadline] [?question].
 */
/** move: index of the move the line comes from; missing for path headings. */
/** sub: index of the task move whose subprocess the line belongs to; move then counts in that subprocess.
 *  any: inside that subprocess, index of the move of what can come at any time whose flow has the line; move then counts in that flow. */
export type Line = { depth: number; text: string; move?: number; sub?: number; any?: number };

/** A subprocess as told: its state (IDs of its own level) and the prefix of its IDs in the whole diagram. */
export type Sub = { id: string; state: StoryState };

/** inner: tell the flow behind a task: it begins plainly (no trigger), named like the task. */
/** inner.trigger: the flow of something that can come at any time: it begins with that event, not plainly. */
/** legacyGoTo: only for opening working files of 0.1.0 (job 438): a "continue at" that fails only because it leads
 *  into or out of a branch of "in parallel" (job 411) is accepted as 0.1.0 did and noted in StoryState.legacyGoTos.
 *  Main level only; never for telling in the UI. */
/** goToMove: only for opening working files (job 439): per "continue at" move, the move whose task or end is its
 *  target, used instead of the stored ID (IDs shift when lines are left out). Main level only. */
export type TellOptions = { inner?: { name: string; trigger?: { subtype: EventKind; keepsRunning?: boolean } }; legacyGoTo?: boolean; goToMove?: Record<number, number> };

/** Kinds of a waiting or triggering event, in the order the forms offer them. */
export const EVENT_KINDS: EventKind[] = ['message', 'time', 'condition', 'signal'];
/** Kinds an end may have by default ('' = plain); beside a running step "cancel" comes on top. */
export const END_KINDS: ('' | EndKind)[] = ['', 'message', 'signal'];
/** Kinds a further trigger may have by default ('' = plain). */
export const START_KINDS: ('' | EventKind)[] = ['', ...EVENT_KINDS];
/** Kind of an event in the story text: " mit Nachricht", " zum Zeitpunkt", " sobald", " mit Signal". */
const howWord = (subtype: EventKind | undefined, t: (de: string, en: string) => string): string =>
  subtype === 'message' ? t(' mit Nachricht', ' with a message') : subtype === 'time' ? t(' zum Zeitpunkt', ' at a point in time') : subtype === 'condition' ? t(' sobald', ' once') : subtype === 'signal' ? t(' mit Signal', ' with a signal') : '';
/** Heading of the section of something that can come at any time. */
export const anytimeHead = (z: { text: string; subtype: EventKind; keepsRunning?: string }, language?: Language): string => {
  const t = (de: string, en: string) => tx(language, de, en);
  return `${t('JEDERZEIT', 'AT ANY TIME')}${howWord(z.subtype, t)}: [${k(z.text)}]${z.keepsRunning === 'yes' ? t(', Ablauf läuft weiter', ', flow continues') : ''}:`;
};

export type Target = { id: string; name: string };

export type StoryState = {
  ops: Op[];
  ir: ProcessIR;
  /** The next question, or undefined when done. */
  question?: string;
  options: Move['move'][];
  /** Existing nodes for "continue at". */
  targets: Target[];
  roles: string[];
  /** Suggestion for the role of the next task. */
  role?: string;
  /** Name of the path we are currently on; missing on the main path. */
  path?: string;
  /** Paths still to come afterwards - in this order. */
  open: string[];
  /** Node where the story continues (for the marker in the diagram). */
  here?: string;
  /** Heading per thread, the current one first - for restoring the order when reading back. */
  heads?: (string | undefined)[];
  /** Heading and indentation of the next line in the story text. */
  next?: { head?: string; depth: number };
  done: boolean;
  errors: string[];
  /** The story as marked-up text, one line per move plus path headings. */
  storyText: Line[];
  /** Which kinds of end are possible here; 'cancel' only where something runs alongside. */
  endKinds: ('' | EndKind)[];
  /** Which kinds a further trigger may have here: the plain one only while no trigger begins plainly. */
  startKinds: ('' | EventKind)[];
  /** Per move the task or end it created - target for "continue at". */
  nodes: (string | undefined)[];
  /** Per node the move (0-based) that created it: links story lines and diagram shapes. */
  moveOf: Record<string, number>;
  /** Per task move with a subprocess: how far it is told. Main level, and on a subprocess level per move of what can come at any time. */
  subs?: Record<number, Sub>;
  /** Which path told which move - for deleting a branch with its paths. */
  trace: Trace;
  /** Moves of branches ("it depends", "in parallel") of this level where no path has a step: told, but not in the diagram (job 419). */
  bare?: number[];
  /** With TellOptions.legacyGoTo: the "continue at" moves accepted only as 0.1.0 did (job 438). */
  legacyGoTos?: number[];
  /** Moves of this level where an error came up, in order (job 439); missing without errors. */
  refused?: number[];
};

/** Paths of a story (keys as in Thread.key). */
export type Trace = {
  /** Per move the path it was told on; missing when no path was open (or outside the flow). */
  owner: (string | undefined)[];
  /** Per path the path it branched off from. */
  parent: Record<string, string>;
  /** Per merge move the move of the branch it closes. */
  closes: (number | undefined)[];
  /** Per switchTo move the path it pulled forward. */
  switched: (string | undefined)[];
  /** Open paths at the end, the current one first. */
  keys: string[];
};

/** Does path `key` stem from `root` (itself included)? `root` may also be a test on each key on the way up. */
export function descends(trace: Pick<Trace, 'parent'>, key: string | undefined, root: string | ((k: string) => boolean)): boolean {
  const hit = typeof root === 'string' ? (k: string) => k === root : root;
  for (let k = key; k !== undefined; k = trace.parent[k]) if (hit(k)) return true;
  return false;
}

/** Do two lists of moves say the same (same moves, same fields, same order)? */
export const sameMoves = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Most paths of one branch: a file with thousands would make the diagram unreadable and slow. */
export const MAX_PATHS = 20;

const ORDINAL = {
  de: ['erster', 'zweiter', 'dritter', 'vierter', 'fünfter', 'sechster', 'siebter', 'achter', 'neunter', 'zehnter'],
  en: ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth']
};
/** Name of branch j (from 0) of "in parallel": "dritter Strang" / "third branch", from the 11th with a number. */
export const branchName = (j: number, language?: Language): string =>
  language === 'en' ? (ORDINAL.en[j] ? `${ORDINAL.en[j]} branch` : `branch ${j + 1}`) : ORDINAL.de[j] ? `${ORDINAL.de[j]} Strang` : `${j + 1}. Strang`;
/** Heading of branch j in the story text. */
export const branchHead = (j: number, language?: Language): string => `– ${branchName(j, language)}:`;

// Square brackets in a name would break the markup.
// ponytail: simply removed; mask them only when reading back (text -> moves).
export const k = (s: string) => s.replace(/[[\]]/g, '').trim();

/** Most moves a story may have, counted over all its levels (replaying more stalls the page; security audit 2026-11). */
export const MAX_STORY_MOVES = 500;

/** Number of moves of a story over all its levels (subprocesses, what can come at any time); also for moves from a foreign file. */
export function countMoves(moves: unknown): number {
  if (!Array.isArray(moves)) return 0;
  let n = 0;
  for (const z of moves) n += 1 + countMoves((z as { subprocess?: unknown } | null)?.subprocess);
  return n;
}

export function tell(moves: Move[], language?: Language, opts: TellOptions = {}): StoryState {
  const t = (de: string, en: string) => tx(language, de, en);
  const inner = opts.inner;
  // The pool name comes with the start move; the IR is created earlier, though.
  const initial = moves[0];
  const process = inner ? inner.name : (initial?.move === 'start' && initial.process?.trim()) || t('Prozess', 'Process');
  let ir = emptyProcess('P', process, language);
  const ops: Op[] = [];
  const errors: string[] = [];
  let threads: Thread[] = [];
  const parked = new Map<string, Thread[]>();
  const merges = new Set<string>();
  /** Exceptions where the task keeps running. Their path runs alongside the normal one
   *  and must end - merging or going back would mean the flow continues twice. */
  const alongside = new Set<string>();
  const storyText: Line[] = [];
  /** Indentation of the line with which a branch was told. */
  const splitDepth = new Map<string, number>();
  const nodes: (string | undefined)[] = [];
  const moveOf: Record<string, number> = {};
  const trace: Trace = { owner: [], parent: {}, closes: [], switched: [], keys: [] };
  /** Move in which a branch (gateway or exception node) was told. */
  const splitMove = new Map<string, number>();
  const branch = (from: Thread, key: string): string => ((trace.parent[key] = from.key), key);
  let current = -1;
  let num = 0;
  const newId = (subtype: string) => `${subtype}_${++num}`;

  const tu = (...added: Op[]): boolean => {
    const r = applyOps(ir, added);
    if (r.issues.length) {
      errors.push(...r.issues.map((i) => i.message));
      return false;
    }
    ir = r.ir;
    ops.push(...added);
    for (const o of added) {
      const created = 'node' in o ? [o.node] : o.op === 'attachException' ? [o.event] : o.op === 'addBranch' ? o.nodes : [];
      for (const c of created) if (!(c.id in moveOf)) moveOf[c.id] = current;
    }
    return true;
  };

  const lane = (role: string): string => {
    const name = role.trim() || t('Unbekannt', 'Unknown');
    const da = ir.lanes.find((l) => l.name.toLowerCase() === name.toLowerCase());
    if (da) return da.id;
    const id = `Bahn_${ir.lanes.length + 1}`;
    tu({ op: 'addLane', id, name });
    return id;
  };

  const connect = (f: Thread, to: string): boolean =>
    tu({
      op: 'connect',
      fromId: f.origin,
      toId: to,
      ...(f.otherwise
        ? { isDefault: true, ...(f.condition ? { name: f.condition } : {}) }
        : f.condition
          ? { condition: f.condition }
          : {})
    });

  const name = (id: string) => nodeById(ir, id)?.name || id;
  const laneFrom = (id: string) => (nodeById(ir, id) as { laneId?: string } | undefined)?.laneId ?? '';

  /** Merges parked paths as soon as no active thread is left in the branch. */
  /** Is something still running alongside this thread: a concurrent branch or a task that keeps running? */
  const besideRun = (f: Thread): boolean =>
    f.splits.some((s) => alongside.has(s) || (nodeById(ir, s) as any)?.gatewayType === 'parallel');

  /** Branches of "in parallel" a path lies in, outermost first (job 411): its key and the keys it
   *  branched off from, as far as they are branches of "in parallel". After a merge the continuation
   *  ('<move>+') hangs below the path the branch was told on, so it is outside those branches again. */
  const strandOf = (key: string | undefined): string => {
    const chain: string[] = [];
    for (let at = key; at && at !== 'r'; at = trace.parent[at]) {
      const m = /^(\d+)\.\d+$/.exec(at);
      if (m && moves[Number(m[1])]?.move === 'concurrent') chain.unshift(at);
    }
    return chain.join('/');
  };
  /** "Continue at" stays within the branch of "in parallel" it is on: only targets in the same branches. */
  const sameStrand = (f: Thread): ((id: string) => boolean) => {
    const here = strandOf(f.key);
    return (id) => strandOf(trace.owner[moveOf[id]]) === here;
  };

  /** Path before the branch - valid again after the merge. */
  const splitPath = new Map<string, string | undefined>();
  /** Thread the branch was told on: where the story goes on when no path of it has a step (job 419). */
  const splitFrom = new Map<string, Thread>();
  /** Moves of branches where no path has a step: they stay in the story, the diagram leaves them out (job 419). */
  const bare: number[] = [];
  const legacyGoTos: number[] = [];

  const checkMerge = (): void => {
    // A branch waits while a path of it still runs, or while a branch inside it is parked too: that
    // one's continuation comes back into it (job 421, a branch in the last path of another one).
    // Repeated until nothing merges, so the order in which the branches were parked does not matter.
    const waits = (split: string): boolean =>
      threads.some((f) => f.splits.includes(split)) ||
      [...parked].some(([other, ws]) => other !== split && ws.some((w) => w.splits.includes(split)));
    for (let again = true; again; ) {
      again = false;
      for (const [split, paths] of [...parked]) {
        if (!parked.has(split) || waits(split)) continue;
        again = true;
        parked.delete(split);
        const rest = paths[0].splits.slice(0, paths[0].splits.indexOf(split));
        const depth = splitDepth.get(split) ?? 0;
        const b = splitMove.get(split) ?? -1;
        const key = `${b}+`;
        trace.parent[key] = trace.owner[b] ?? 'r';
        if (paths.length === 1) {
          threads.unshift({ ...paths[0], key, splits: rest, depth, head: undefined, path: splitPath.get(split) });
          continue;
        }
        const nodes = nodeById(ir, split);
        const parallel = nodes?.kind === 'gateway' && nodes.gatewayType === 'parallel';
        // Paths without a step of their own still start at the branch itself: they share one arrow
        // to the merge, named after all of them ("klein / mittel"); with the otherwise path among
        // them it is the default path.
        const groups = new Map<string, Thread[]>();
        for (const w of paths) groups.set(w.origin, [...(groups.get(w.origin) ?? []), w]);
        const order = (w: Thread) => (w.key.startsWith(`${b}.`) ? Number(w.key.slice(`${b}.`.length)) : Infinity);
        const shared = (group: Thread[]): Thread => {
          const sorted = [...group].sort((x, y) => order(x) - order(y));
          const names = sorted.map((w) => w.condition?.trim()).filter((c): c is string => !!c);
          return { ...sorted[0], condition: names.length ? names.join(' / ') : undefined, otherwise: sorted.some((w) => w.otherwise) };
        };
        const merged = t('Die Wege sind wieder zusammen. Wie geht es weiter?', 'The paths have merged. What happens next?');
        if (groups.size === 1 && nodes?.kind === 'gateway') {
          // No path that merges has a step of its own (job 419): a merge with one way in is no clean BPMN.
          const before = splitFrom.get(split);
          if (before && !outgoing(ir, split).length) {
            // No path leaves the branch at all: it stays in the story, the diagram goes straight on from before it.
            if (!tu({ op: 'deleteNode', id: split, rewire: 'orphan' })) continue;
            delete moveOf[split];
            bare.push(b);
            threads.unshift({ key, origin: before.origin, laneId: before.laneId, condition: before.condition, otherwise: before.otherwise, path: splitPath.get(split), title: merged, splits: rest, depth });
            continue;
          }
          // The other paths end or continue elsewhere: the empty ones go on from the branch with one arrow.
          threads.unshift({ ...shared(paths), key, task: undefined, splits: rest, depth, head: undefined, path: splitPath.get(split), title: merged });
          continue;
        }
        const id = newId('Zusammen');
        // Merge where the branch was made - otherwise the arrows cross foreign lanes.
        const laneId = laneFrom(nodes?.kind === 'exception' ? nodes.attachedTo : split) || paths[0].laneId;
        tu({
          op: 'addNode',
          node: { id, kind: 'gateway', name: '', gatewayType: parallel ? 'parallel' : 'exclusive', laneId }
        });
        merges.add(id);
        for (const group of groups.values()) connect(group.length === 1 ? group[0] : shared(group), id);
        threads.unshift({ key, origin: id, laneId, path: splitPath.get(split), title: merged, splits: rest, depth });
      }
    }
  };

  const subs: Record<number, Sub> = {};

  // A subprocess begins plainly (BPMN wants a blank start there), named like its task (every element
  // needs a name); its lane follows from the first move (inferLanes). No move creates it.
  // The flow of something that can come at any time begins with its event instead.
  if (inner) {
    const id = newId('Start');
    tu({ op: 'addNode', node: { id, kind: 'start', name: inner.name, ...(inner.trigger && { subtype: inner.trigger.subtype }) } });
    delete moveOf[id];
    storyText.push({ depth: 0, text: t('ES BEGINNT.', 'IT STARTS.') });
    threads = [{ key: 'r', origin: id, laneId: '', title: t(`„${inner.name}“ – was passiert als Erstes?`, `“${inner.name}” – what happens first?`), splits: [], depth: 0 }];
  }

  /** Where several triggers run together (exclusive merge), once a further trigger is told. */
  let startMerge: string | undefined;
  /** Only triggers told so far (what can come at any time stands outside the flow): a further trigger fits. */
  // A branch without any step leaves no shape (job 419), so the moves count too, not only the shapes.
  let flowTold = false;
  const onlyStarts = () => !flowTold && ir.nodes.every((n) => n.kind === 'start' || n.id === startMerge || isAnytime(n));
  const plainStart = () => ir.nodes.some((n) => n.kind === 'start' && !n.subtype);
  const startKinds = (): ('' | EventKind)[] => (plainStart() ? [...EVENT_KINDS] : [...START_KINDS]);

  /** Moves of things that can come at any time: their boxes come after the main flow (position-independent). */
  const anytimes: { i: number; z: Extract<Move, { move: 'anytime' }>; state: StoryState }[] = [];

  // A story above the limit is not replayed at all (a level counts what lies within it; the main flow counts everything).
  const tooMany = countMoves(moves) > MAX_STORY_MOVES;
  if (tooMany) errors.push(t(`Die Geschichte hat mehr als ${MAX_STORY_MOVES} Züge – mehr kann Story2BPMN nicht verarbeiten`, `The story has more than ${MAX_STORY_MOVES} moves – Story2BPMN cannot handle more`));
  const refused: number[] = [];
  let seen = 0;
  for (const [i, z] of (tooMany ? [] : moves).entries()) {
    if (errors.length > seen) refused.push(i - 1);
    seen = errors.length;
    current = i;
    if (z.move !== 'start' && z.move !== 'orStart' && z.move !== 'anytime') flowTold = true;
    if (z.move === 'anytime') {
      // Also while a subprocess runs (job 397), but not inside the flow of something that comes at any time.
      if (inner?.trigger) {
        errors.push(t('Jederzeit geht nicht im Ablauf von etwas, das jederzeit kommt', 'At any time does not work inside the flow of something that comes at any time'));
        continue;
      }
      if (!ir.nodes.length) {
        errors.push(t('Zuerst den Auslöser erzählen', 'Tell the trigger first'));
        continue;
      }
      if (typeof z.text !== 'string' || !k(z.text)) {
        errors.push(t('Jederzeit braucht, was kommen kann', 'At any time needs what can come'));
        continue;
      }
      if (!EVENT_KINDS.includes(z.subtype)) {
        errors.push(t('Wodurch kommt es?', 'By what does it come?'));
        continue;
      }
      if (z.keepsRunning !== undefined && z.keepsRunning !== '' && z.keepsRunning !== 'yes') {
        errors.push(t('Läuft der Ablauf weiter?', 'Does the flow continue?'));
        continue;
      }
      const list = z.subprocess ?? [];
      if (!Array.isArray(list) || !list.every((m) => m && typeof m === 'object' && typeof (m as { move?: unknown }).move === 'string')) {
        errors.push(t(`Der Ablauf bei „${z.text}“ ist nicht lesbar`, `The flow for “${z.text}” cannot be read`));
        continue;
      }
      const state = tell(list, language, { inner: { name: z.text.trim(), trigger: { subtype: z.subtype, keepsRunning: z.keepsRunning === 'yes' } } });
      if (state.errors.length) {
        errors.push(...state.errors.map((e) => `„${z.text}“: ${e}`));
        continue;
      }
      anytimes.push({ i, z, state });
      continue;
    }
    if (z.move === 'start' && inner) {
      errors.push(t('Ein Teilablauf beginnt einfach, ohne Auslöser', 'A subprocess begins plainly, without a trigger'));
      continue;
    }
    if (z.move === 'start') {
      if (ir.nodes.length) {
        errors.push(t('Der Auslöser steht nur ganz am Anfang', 'The trigger comes only at the very beginning'));
        continue;
      }
      const id = newId('Start');
      const laneId = lane(z.role);
      const subtype = z.subtype || undefined;
      const how = subtype === 'message' ? t(' mit Nachricht', ' with a message') : subtype === 'time' ? t(' zum Zeitpunkt', ' at a point in time') : subtype === 'condition' ? t(' sobald', ' once') : subtype === 'signal' ? t(' mit Signal', ' with a signal') : '';
      if (tu({ op: 'addNode', node: { id, kind: 'start', name: z.text, laneId, ...(subtype && { subtype }) } }))
        storyText.push({ depth: 0, move: i, text: t(`ES BEGINNT${how}: [${k(z.text)}] bei [@${k(z.role)}].`, `IT STARTS${how}: [${k(z.text)}] at [@${k(z.role)}].`) });
      trace.owner[i] = 'r';
      threads = [{ key: 'r', origin: id, laneId, title: t(`„${z.text}“ – was passiert als Erstes?`, `“${z.text}” – what happens first?`), splits: [], depth: 0 }];
      continue;
    }

    if (z.move === 'orStart') {
      if (inner) {
        errors.push(t('Ein Teilablauf beginnt einfach, ohne Auslöser', 'A subprocess begins plainly, without a trigger'));
        continue;
      }
      if (!ir.nodes.length) {
        errors.push(t('Zuerst den Auslöser erzählen', 'Tell the trigger first'));
        continue;
      }
      if (!onlyStarts() || !threads[0]) {
        errors.push(t('Ein weiterer Auslöser steht direkt nach dem Auslöser', 'Another trigger comes right after the trigger'));
        continue;
      }
      if (typeof z.text !== 'string' || !k(z.text)) {
        errors.push(t('Ein Auslöser braucht, was ihn auslöst', 'A trigger needs what triggers it'));
        continue;
      }
      const subtype = z.subtype || undefined;
      if (subtype !== undefined && !EVENT_KINDS.includes(subtype)) {
        errors.push(t('Wodurch beginnt es?', 'What starts it?'));
        continue;
      }
      // bpmnlint (single-blank-start-event): only one plain start, otherwise no reading copy.
      if (!subtype && plainStart()) {
        errors.push(t('Nur ein Auslöser kann einfach beginnen; wählen Sie eine Art', 'Only one trigger can begin plainly; choose a kind'));
        continue;
      }
      const f = threads[0];
      const role = typeof z.role === 'string' ? z.role : '';
      const id = newId('Start');
      const laneId = lane(role);
      const merge = startMerge ?? newId('Zusammen');
      const added: Op[] = [{ op: 'addNode', node: { id, kind: 'start', name: z.text, laneId, ...(subtype && { subtype }) } }];
      // The first further trigger: the triggers run together in the lane of the first one.
      if (!startMerge) added.push({ op: 'addNode', node: { id: merge, kind: 'gateway', name: '', gatewayType: 'exclusive', laneId: f.laneId } }, { op: 'connect', fromId: f.origin, toId: merge });
      added.push({ op: 'connect', fromId: id, toId: merge });
      if (!tu(...added)) continue;
      trace.owner[i] = f.key;
      startMerge = merge;
      merges.add(merge);
      storyText.push({ depth: 0, move: i, text: t(`ODER ES BEGINNT${howWord(subtype, t)}: [${k(z.text)}] bei [@${k(role)}].`, `OR IT STARTS${howWord(subtype, t)}: [${k(z.text)}] at [@${k(role)}].`) });
      threads = [{ ...f, origin: merge }];
      continue;
    }

    const f = threads[0];
    if (f) trace.owner[i] = f.key;
    if (!f) {
      // After an earlier error the story ending too soon is only its consequence: name the cause alone.
      if (!ir.nodes.length) errors.push(t('Zuerst den Auslöser erzählen', 'Tell the trigger first'));
      else if (!errors.length) errors.push(t('Die Geschichte ist schon zu Ende', 'The story has already ended'));
      continue;
    }
    // Call only after a successful move, and before the threads are rebuilt.
    const write = (text: string) => {
      if (f.head) storyText.push({ depth: Math.max(f.depth - 1, 0), text: f.head });
      f.head = undefined;
      storyText.push({ depth: f.depth, text, move: i });
    };

    switch (z.move) {
      case 'task': {
        const id = newId('Schritt');
        const laneId = lane(z.role);
        const system = z.system?.trim();
        const deadline = z.deadline?.trim();
        // ponytail: a comma separates documents; a document name with a comma gets split (as in the working file).
        const documents = (z.documentName ?? '').split(',').map((d) => d.trim()).filter(Boolean);
        const details = { ...(system ? { system } : {}), ...(documents.length ? { documents } : {}), ...(deadline ? { deadline: deadline } : {}) };
        let forEach: ForEach | undefined;
        if (z.each !== undefined) {
          if (typeof z.each !== 'string' || !k(z.each)) {
            errors.push(t('Für jedes Stück braucht, wofür es gilt', 'For each needs what it applies to'));
            break;
          }
          if (z.eachOrder !== undefined && z.eachOrder !== 'sequential' && z.eachOrder !== 'parallel') {
            errors.push(t('Nacheinander oder gleichzeitig?', 'One after another or at the same time?'));
            break;
          }
          forEach = { item: z.each.trim(), ...(z.eachOrder === 'parallel' && { parallel: true as const }) };
        }
        let sub: StoryState | undefined;
        if (z.subprocess !== undefined) {
          if (inner) {
            errors.push(t('Ein Teilablauf hat keinen eigenen Teilablauf', 'A subprocess has no subprocess of its own'));
            break;
          }
          if (!Array.isArray(z.subprocess) || !z.subprocess.every((m) => m && typeof m === 'object' && typeof (m as { move?: unknown }).move === 'string')) {
            errors.push(t(`Der Ablauf hinter „${z.text}“ ist nicht lesbar`, `The flow behind “${z.text}” cannot be read`));
            break;
          }
          sub = tell(z.subprocess, language, { inner: { name: z.text } });
          if (sub.errors.length) {
            errors.push(...sub.errors.map((e) => `„${z.text}“: ${e}`));
            break;
          }
        }
        // ponytail: a task without lane yet (the role is new) gets it from lane() above, so laneId is always set.
        const node: Node = { id, kind: 'step', name: z.text, laneId, ...(sub && { subprocess: prefixed(sub.ir, id) }), ...(forEach && { forEach }) };
        // A path still open inside it (job 395) is an open point of the task, too: no reading copy.
        // Not told to the end yet: an open point, so no reading copy without DRAFT (T7).
        const open = sub && (!z.subprocess!.length || !sub.done || !!sub.ir.openPoints?.length)
          ? [{ op: 'addOpenPoint' as const, point: { id: `Offen_${id}`, elementId: id, field: t('Teilablauf', 'Subprocess'), assumption: '', question: t(`Den Ablauf hinter „${z.text}“ zu Ende erzählen`, `Finish telling the flow behind “${z.text}”`) } }]
          : [];
        if (
          tu({ op: 'addNode', node }, ...open) &&
          connect(f, id) &&
          (!Object.keys(details).length ? true : tu({ op: 'setDetails', nodeId: id, details }))
        ) {
          const extra =
            (system ? ` in [#${k(system)}]` : '') +
            (documents.length ? ` ${t('mit', 'with')} ${documents.map((d) => `[+${k(d)}]`).join(', ')}` : '') +
            (deadline ? t(`, Frist [!${k(deadline)}]`, `, deadline [!${k(deadline)}]`) : '') +
            (forEach ? `, ${t('FÜR JEDE', 'FOR EACH')} [${k(forEach.item)}], ${forEach.parallel ? t('GLEICHZEITIG', 'IN PARALLEL') : t('NACHEINANDER', 'IN SEQUENCE')}` : '') +
            (sub ? t(', MIT TEILABLAUF', ', WITH SUBPROCESS') : '');
          if (sub) subs[i] = { id, state: sub };
          nodes[i] = id;
          write(t(`[@${k(z.role)}] soll [${k(z.text)}]${extra}.`, `[@${k(z.role)}] shall [${k(z.text)}]${extra}.`));
          threads[0] = { key: f.key, origin: id, laneId, task: id, path: f.path, title: t(`Nach „${z.text}“ – wie geht es weiter?`, `After “${z.text}” – what happens next?`), splits: f.splits, depth: f.depth };
        }
        break;
      }

      case 'wait': {
        const id = newId('Warten');
        const subtype = z.subtype || 'message';
        if (!tu({ op: 'addNode', node: { id, kind: 'wait', name: z.text, laneId: f.laneId, subtype } }) || !connect(f, id)) break;
        nodes[i] = id;
        // Time carries the deadline marker like the expired deadline; the message has no marker.
        write(subtype === 'condition' ? `${t('WARTEN BIS', 'WAIT UNTIL')} [${k(z.text)}].` : subtype === 'signal' ? `${t('WARTEN AUF SIGNAL', 'WAIT FOR SIGNAL')} [${k(z.text)}].` : `${t('WARTEN AUF', 'WAIT FOR')} [${subtype === 'time' ? '!' : ''}${k(z.text)}].`);
        threads[0] = { key: f.key, origin: id, laneId: f.laneId, path: f.path, title: t(`Nach dem Warten auf „${z.text}“ – wie geht es weiter?`, `After waiting for “${z.text}” – what happens next?`), splits: f.splits, depth: f.depth };
        break;
      }

      case 'sendSignal': {
        const id = newId('Signal');
        // Who gives it decides the lane; without a role it stays in the current lane.
        const laneId = z.role?.trim() ? lane(z.role) : f.laneId;
        if (!tu({ op: 'addNode', node: { id, kind: 'send', name: z.text, laneId, subtype: 'signal' } }) || !connect(f, id)) break;
        nodes[i] = id;
        // The role only when it differs from the current lane: then the line reads back into the same lane.
        const at = laneId !== f.laneId ? ` ${t('bei', 'at')} [@${k(z.role ?? '')}]` : '';
        write(`${t('SIGNAL SENDEN', 'SEND SIGNAL')} [${k(z.text)}]${at}.`);
        threads[0] = { key: f.key, origin: id, laneId, path: f.path, title: t(`Nach dem Signal „${z.text}“ – wie geht es weiter?`, `After the signal “${z.text}” – what happens next?`), splits: f.splits, depth: f.depth };
        break;
      }

      case 'decision': {
        const id = newId('Wenn');
        const more = z.more ?? [];
        if (!Array.isArray(more) || more.length + 2 > MAX_PATHS) {
          errors.push(t(`Höchstens ${MAX_PATHS} Wege`, `At most ${MAX_PATHS} paths`));
          break;
        }
        const labels = [z.yes, ...more, z.no];
        if (!labels.every((l) => typeof l === 'string' && l.trim())) {
          errors.push(t('Jeder Weg einer Entscheidung braucht eine Beschriftung', 'Every path of a decision needs a label'));
          break;
        }
        const first = z.subtype === 'first';
        if (!tu({ op: 'addNode', node: { id, kind: 'gateway', name: first ? '' : z.question ?? '', gatewayType: first ? 'event' : 'exclusive', laneId: f.laneId } }) || !connect(f, id))
          break;
        splitDepth.set(id, f.depth);
        splitPath.set(id, f.path);
        splitFrom.set(id, f);
        splitMove.set(id, i);
        const splits = [...f.splits, id];
        if (first) {
          // Every path begins with its waiting; that is also its label.
          const kinds = [z.yesKind, ...more.map((_, j) => z.moreKinds?.[j]), z.noKind];
          const paths: Thread[] = [];
          for (const [j, text] of labels.entries()) {
            const w = newId('Warten');
            const subtype = kinds[j] || 'message';
            if (!tu({ op: 'addNode', node: { id: w, kind: 'wait', name: text, laneId: f.laneId, subtype } }, { op: 'connect', fromId: id, toId: w })) break;
            paths.push({ key: branch(f, `${i}.${j}`), head: `→ ${subtype === 'condition' ? t('SOBALD ', 'ONCE ') : subtype === 'signal' ? 'SIGNAL ' : ''}[${subtype === 'time' ? '!' : ''}${k(text)}]:`, origin: w, laneId: f.laneId, path: t(`Wenn zuerst „${text}“`, `If “${text}” comes first`), title: t('Was passiert dann?', 'What happens then?'), splits, depth: f.depth + 1 });
          }
          if (paths.length < labels.length) break;
          write(t('WAS ZUERST PASSIERT:', 'WHAT COMES FIRST:'));
          threads.splice(0, 1, ...paths);
          break;
        }
        // The ? is already in the marker; the display appends it again.
        write(`${t('WENN', 'IF')} [?${k(z.question ?? '').replace(/\?+$/, '')}]`);
        threads.splice(
          0,
          1,
          ...labels.map((label, j): Thread => {
            const otherwise = j === labels.length - 1;
            return { key: branch(f, `${i}.${j}`), head: `${otherwise ? `${t('SONST', 'ELSE')} ` : ''}→ ${k(label)}:`, origin: id, laneId: f.laneId, condition: label, ...(otherwise && { otherwise: true }), path: `„${z.question}“ → ${label}`, title: t('Was passiert dann?', 'What happens then?'), splits, depth: f.depth + 1 };
          })
        );
        break;
      }

      case 'concurrent': {
        const count = z.branches ?? 2;
        if (!Number.isInteger(count) || count < 2) {
          errors.push(t('Gleichzeitig braucht mindestens zwei Stränge', 'In parallel needs at least two branches'));
          break;
        }
        if (count > MAX_PATHS) {
          errors.push(t(`Höchstens ${MAX_PATHS} Wege`, `At most ${MAX_PATHS} paths`));
          break;
        }
        const id = newId('Gleichzeitig');
        if (!tu({ op: 'addNode', node: { id, kind: 'gateway', name: '', gatewayType: 'parallel', laneId: f.laneId } }) || !connect(f, id))
          break;
        write(t('GLEICHZEITIG:', 'IN PARALLEL:'));
        splitDepth.set(id, f.depth);
        splitPath.set(id, f.path);
        splitFrom.set(id, f);
        splitMove.set(id, i);
        const splits = [...f.splits, id];
        threads.splice(
          0,
          1,
          ...Array.from({ length: count }, (_, j): Thread => ({ key: branch(f, `${i}.${j}`), head: branchHead(j, language), origin: id, laneId: f.laneId, path: t(`Gleichzeitig, ${branchName(j, language)}`, `In parallel, ${branchName(j, language)}`), title: t('Was passiert?', 'What happens?'), splits, depth: f.depth + 1 }))
        );
        break;
      }

      case 'exceptionPath': {
        if (!f.task) {
          const what = typeof z.text === 'string' ? k(z.text) : '';
          errors.push(t(`Vor „FALLS ${what}“ steht kein Schritt, an dem die Ausnahme hängen kann`, `There is no step right before “IN CASE OF ${what}” for the exception to attach to`));
          break;
        }
        const id = newId('Ausnahme');
        const trigger = z.subtype === 'deadline' || z.subtype === 'message' ? z.subtype : 'error';
        const goTo = z.keepsRunning === 'yes' && trigger !== 'error';
        const event: Node = { id, kind: 'exception', name: z.text, attachedTo: f.task, trigger, ...(goTo && { keepsRunning: true }) };
        if (!tu({ op: 'attachException', nodeId: f.task, event })) break;
        // An expired deadline carries the deadline marker so it can be told apart from the error.
        // Message named explicitly: otherwise the text could not be read back unambiguously (like an error).
        write(`${t('FALLS', 'IN CASE OF')}${trigger === 'message' ? t(' NACHRICHT', ' MESSAGE') : ''} [${trigger === 'deadline' ? '!' : ''}${k(z.text)}]${goTo ? t(', Schritt läuft weiter', ', step continues') : ''}:`);
        splitDepth.set(id, f.depth);
        splitPath.set(id, f.path);
        splitFrom.set(id, f);
        splitMove.set(id, i);
        if (goTo) alongside.add(id);
        // Tell the exception path first, then continue the normal path.
        threads.splice(
          0,
          1,
          { key: branch(f, `${i}.0`), origin: id, laneId: f.laneId, path: t(`Falls „${z.text}“`, `In case of “${z.text}”`), title: t('Was passiert dann?', 'What happens then?'), splits: [...f.splits, id], depth: f.depth + 1 },
          // If the task keeps running, there is nothing to merge: the normal path stays as it was.
          { ...f, key: branch(f, `${i}.1`), task: undefined, title: t(`Zurück zum normalen Weg nach „${name(f.task)}“ – wie geht es weiter?`, `Back to the normal path after “${name(f.task)}” – what happens next?`), splits: goTo ? f.splits : [...f.splits, id] }
        );
        break;
      }

      case 'end': {
        const id = newId('Ende');
        const subtype = z.subtype || undefined;
        if (subtype === 'cancel' && !besideRun(f)) {
          errors.push(t('„Alles abbrechen“ geht nur, wo gleichzeitig noch etwas anderes läuft', '“Stop everything” only works where something else runs at the same time'));
          break;
        }
        if (tu({ op: 'addNode', node: { id, kind: 'end', name: z.text, laneId: f.laneId, ...(subtype && { subtype }) } }) && connect(f, id)) {
          nodes[i] = id;
          const how = subtype === 'message' ? t(' mit Nachricht', ' with a message') : subtype === 'signal' ? t(' mit Signal', ' with a signal') : subtype === 'cancel' ? t(', alles abbrechen', ', stop everything') : '';
          write(`${t('ENDE', 'END')}${how}: [${k(z.text)}].`);
          threads.shift();
          checkMerge();
        }
        break;
      }

      case 'openPath': {
        // Ends the path for now; never a target of "continue at" (its ID prefix, see targets()).
        const id = newId('Offen');
        const open = { op: 'addOpenPoint' as const, point: { id: `Offen_${id}`, elementId: id, field: t('Weg', 'Path'), assumption: '', question: t('Zu Ende erzählen, was auf diesem Weg passiert', 'Finish telling what happens on this path') } };
        if (z.joins) {
          // Still open, but runs on into the merge: a placeholder step, then the merge as for "merge".
          const split = f.splits.at(-1);
          if (!split || alongside.has(split)) {
            errors.push(t('Hier ist nichts verzweigt, das zusammenlaufen könnte', 'Nothing has branched here that could merge'));
            break;
          }
          if (!tu({ op: 'addNode', node: { id, kind: 'step', name: t('Noch offen', 'Still open'), laneId: f.laneId } }, open) || !connect(f, id)) break;
          nodes[i] = id;
          trace.closes[i] = splitMove.get(split);
          write(t('NOCH OFFEN, DANN ZUSAMMEN.', 'STILL OPEN, THEN MERGE.'));
          threads.shift();
          parked.set(split, [...(parked.get(split) ?? []), { ...f, origin: id, condition: undefined, otherwise: undefined, task: undefined }]);
          checkMerge();
          break;
        }
        if (tu({ op: 'addNode', node: { id, kind: 'end', name: t('Noch offen', 'Still open'), laneId: f.laneId } }, open) && connect(f, id)) {
          nodes[i] = id;
          write(t('NOCH OFFEN.', 'STILL OPEN.'));
          threads.shift();
          checkMerge();
        }
        break;
      }

      case 'switchTo': {
        // ponytail: position in the list, not name - names can be duplicated. If an
        // earlier move changes the number of open paths, the position points elsewhere.
        if (!Number.isInteger(z.to) || z.to < 1 || z.to >= threads.length) {
          errors.push(t('Diesen offenen Weg gibt es hier nicht', 'There is no such open path here'));
          break;
        }
        const [added] = threads.splice(z.to, 1);
        trace.switched[i] = added.key;
        // Already begun? Then add a heading when resuming - otherwise the
        // continuation in the story text reads like part of the path before.
        const old = f.head ? f : { ...f, head: f.path ? t(`WEITER AUF DEM WEG ${f.path}:`, `BACK ON THE PATH ${f.path}:`) : t('WEITER AUF DEM HAUPTWEG:', 'BACK ON THE MAIN PATH:') };
        threads.splice(0, 1, added, old);
        break;
      }

      case 'merge': {
        const split = f.splits.at(-1);
        if (split && alongside.has(split)) {
          errors.push(t('Dieser Weg läuft neben dem Schritt her und muss mit einem Ende aufhören', 'This path runs alongside the step and must finish with an end'));
          break;
        }
        if (!split) {
          errors.push(t('Hier ist nichts verzweigt, das zusammenlaufen könnte', 'Nothing has branched here that could merge'));
          break;
        }
        trace.closes[i] = splitMove.get(split);
        write(t('ZUSAMMEN.', 'MERGE.'));
        threads.shift();
        parked.set(split, [...(parked.get(split) ?? []), f]);
        checkMerge();
        break;
      }

      case 'goTo': {
        // Opening a file: the target is what the given move created in this replay (job 439).
        const by = opts.goToMove?.[i];
        const goal = (by !== undefined && by < i && nodes[by]) || z.target;
        const hit = (zz: Target) => zz.id === goal;
        const strict = targets(ir, f, sameStrand(f)).some(hit);
        // Opening a 0.1.0 file: a target only the branch rule of job 411 refuses is taken as then.
        const legacy = !strict && !!opts.legacyGoTo && targets(ir, f, () => true).some(hit);
        if (f.splits.some((s) => alongside.has(s)) || (!strict && !legacy)) {
          const to = shownTarget(ir, nodes, goal, t);
          errors.push(t(`Bei ${to} kann es von hier aus nicht weitergehen`, `Cannot continue at ${to} from here`));
          break;
        }
        const target = nodeById(ir, goal)!;
        let to = goal;
        if (target.kind !== 'end') {
          // A task has exactly one entry. Whoever joins it comes via a
          // merge point in front - otherwise it is formally not clean BPMN.
          const one = incoming(ir, goal);
          if (one.length === 1 && merges.has(one[0].from)) to = one[0].from;
          else if (one.length === 1) {
            to = newId('Zusammen');
            if (!tu({ op: 'insertBetween', fromId: one[0].from, toId: goal, node: { id: to, kind: 'gateway', name: '', gatewayType: 'exclusive', laneId: laneFrom(goal) } }))
              break;
            merges.add(to);
          }
        }
        if (connect(f, to)) {
          if (legacy) legacyGoTos.push(i);
          write(`${t('WEITER BEI', 'CONTINUE AT')} [${k(name(goal))}].`);
          threads.shift();
          checkMerge();
        }
        break;
      }
    }
  }

  if (errors.length > seen && !tooMany) refused.push(moves.length - 1);

  // After the main flow and its sections of what can come at any time, one section per subprocess, in the
  // order of its tasks (T3); what can come at any time while it runs ends its section. So every JEDERZEIT
  // heading belongs to the TEILABLAUF heading before it, or to the main flow when none came yet (job 397).
  const subText: Line[] = [];
  for (const [i, s] of Object.entries(subs)) {
    const z = moves[Number(i)] as Extract<Move, { move: 'task' }>;
    subText.push({ depth: 0, sub: Number(i), text: `${t('TEILABLAUF', 'SUBPROCESS')} [${k(z.text)}]:` });
    for (const l of s.state.storyText) subText.push({ ...l, sub: Number(i), ...(l.sub !== undefined && { any: l.sub }) });
  }
  // Then one box and one section per thing that can come at any time, in the order of their moves.
  // Numbered on their own: wherever such a move is in the list, the IDs of the main flow stay the same.
  for (const [j, { i, z, state }] of anytimes.entries()) {
    current = i;
    const id = `Jederzeit_${j + 1}`;
    // The lane of the role that handles it first, if the main flow has it; else the lane of the trigger.
    const first = state.ir.lanes[0]?.name.toLowerCase();
    const laneId = ir.lanes.find((l) => l.name.toLowerCase() === first)?.id ?? (ir.nodes.find((n) => n.kind === 'start') as { laneId?: string } | undefined)?.laneId ?? ir.lanes[0]?.id;
    const anytime = { trigger: z.subtype, ...(z.keepsRunning === 'yes' && { keepsRunning: true as const }) };
    const node: Node = { id, kind: 'step', name: z.text.trim(), ...(laneId && { laneId }), subprocess: prefixed(state.ir, id), anytime };
    const open = !(z.subprocess ?? []).length || !state.done || !!state.ir.openPoints?.length
      ? [{ op: 'addOpenPoint' as const, point: { id: `Offen_${id}`, elementId: id, field: t('Jederzeit', 'At any time'), assumption: '', question: t(`Zu Ende erzählen, was bei „${z.text}“ passiert`, `Finish telling what happens on “${z.text}”`) } }]
      : [];
    if (!tu({ op: 'addNode', node }, ...open)) continue;
    subs[i] = { id, state };
    storyText.push({ depth: 0, move: i, text: anytimeHead(z, language) });
    for (const l of state.storyText) storyText.push({ ...l, sub: i });
  }
  storyText.push(...subText);
  const told = { ...(Object.keys(subs).length ? { subs } : {}), ...(bare.length ? { bare } : {}), ...(legacyGoTos.length ? { legacyGoTos } : {}), ...(refused.length ? { refused } : {}) };

  const roles = ir.lanes.map((l) => l.name);
  trace.keys = threads.map((o) => o.key);
  const f = threads[0];
  if (!ir.nodes.length)
    return { ops, ir, question: t('Womit fängt der Prozess an, und bei wem?', 'How does the process start, and with whom?'), options: ['start'], targets: [], roles, open: [], done: false, errors, storyText, nodes, moveOf, trace, endKinds: [], startKinds: startKinds() };
  if (!f) return { ops, ir, options: [], targets: [], roles, open: [], done: true, errors, storyText, nodes, moveOf, trace, endKinds: [], startKinds: startKinds(), ...told };

  const options: Move['move'][] = ['task', 'wait', 'decision', 'concurrent'];
  if (f.task) options.push('exceptionPath');
  if (f.splits.length && !alongside.has(f.splits.at(-1)!)) options.push('merge');
  options.push('end');
  const zz = f.splits.some((s) => alongside.has(s)) ? [] : targets(ir, f, sameStrand(f));
  if (zz.length) options.push('goTo');
  // Last, so the keys of the other options stay as they were.
  options.push('sendSignal');
  if (!inner?.trigger) options.push('anytime');
  if (!inner && onlyStarts()) options.push('orStart');
  return {
    ops,
    ir,
    question: f.title,
    options,
    targets: zz,
    roles,
    role: ir.lanes.find((l) => l.id === f.laneId)?.name,
    path: f.path,
    open: threads.slice(1).map((o) => o.path ?? t(`Normaler Weg nach „${name(o.origin)}“`, `Normal path after “${name(o.origin)}”`)),
    here: f.origin,
    next: { head: f.head, depth: f.depth },
    heads: threads.map((o) => o.head),
    done: false,
    errors,
    storyText,
    nodes,
    moveOf,
    trace,
    endKinds: besideRun(f) ? [...END_KINDS, 'cancel'] : [...END_KINDS],
    startKinds: startKinds(),
    ...told
  };
}

/** Node IDs as tell() builds them (`Schritt_5`): never shown to the user. */
const INTERNAL_ID = /^[A-Za-zÄÖÜäöüß]+_\d+$/;

/**
 * A "continue at" target as the user sees it, in the dative (after "zu" / "Bei"): its name in quotes;
 * without a name the line of the move that created it; never an internal ID (job 414).
 * `id` may also be a name that splice() left as the target when the target went.
 */
export function shownTarget(ir: ProcessIR, nodes: (string | undefined)[], id: string, t: (de: string, en: string) => string): string {
  const node = nodeById(ir, id);
  if (node?.name?.trim()) return t(`„${node.name}“`, `“${node.name}”`);
  if (node) {
    const k = nodes.indexOf(id);
    return k >= 0 ? t(`Zeile ${k + 1}`, `line ${k + 1}`) : t('einem Schritt ohne Namen', 'a step without a name');
  }
  if (id.trim() && !INTERNAL_ID.test(id)) return t(`„${id}“`, `“${id}”`);
  return t('einem Schritt, den es nicht mehr gibt', 'a step that no longer exists');
}

/** Story text without markup, indented with spaces - for PDF and file. */
export const asText = (lines: Line[]): string =>
  lines
    .map((z) => '  '.repeat(z.depth) + z.text.replace(/\[([@#+!?]?)([^\]]*)\]/g, (_, subtype, t) => t + (subtype === '?' ? '?' : '')))
    .join('\n');

/**
 * Where "continue at" may lead: to existing tasks and ends. Not
 * to the start (never has an entry), not to branches (otherwise mixed form),
 * not into or out of a branch of "in parallel" (it has to run together); within
 * the same branch it may loop back (job 411, `inStrand`).
 */
function targets(ir: ProcessIR, f: Thread, inStrand: (id: string) => boolean): Target[] {
  return ir.nodes
    // Not to what can come at any time: its box has no arrows.
    // Not to a path still open: neither its end nor its placeholder step (job 400).
    .filter((n) => !n.id.startsWith('Offen_'))
    .filter((n) => (n.kind === 'step' && !isAnytime(n)) || n.kind === 'wait' || n.kind === 'send' || n.kind === 'end')
    // Already directly connected: that would be the same arrow twice.
    // A wait after "what comes first" may only be reached from there.
    .filter((n) => !incoming(ir, n.id).some((e) => (nodeById(ir, e.from) as any)?.gatewayType === 'event'))
    .filter((n) => !incoming(ir, n.id).some((e) => e.from === f.origin))
    .filter((n) => inStrand(n.id))
    .map((n) => ({ id: n.id, name: n.name }));
}
