import { tell, Line, Move, TellOptions, branchHead, MAX_PATHS } from './story.js';
import type { EventKind, Node, ProcessIR } from './ir.js';
import { isAnytime } from './ir.js';
import { Language } from './language.js';

/**
 * Story text -> moves (glossary: story text). Each line becomes a move and is replayed
 * immediately; so the story itself decides which path one is on.
 * Indentation is ignored - it follows from the moves.
 *
 * Path headings ("→ ja:", "SONST → nein:", "– zweiter Strang:") are not moves.
 * They say which open path comes next (otherwise a "switchTo"), and later supply
 * the labels of the paths of a decision: in the text they appear only
 * where the path begins. Until then the move carries a placeholder.
 */
/** Longest line of a story text that is read back (characters, without indentation). */
export const MAX_LINE = 500;
/** Most non-empty lines of a story text that is read back. */
export const MAX_LINES = 1000;

export function read(text: string, language: Language = 'de', previous?: Move[]): { moves: Move[]; errors: string[]; line?: number } {
  const t = (de: string, en: string) => (language === 'en' ? en : de);
  const lines = text.split(/\r?\n/);
  // Limits before any pattern runs (security audit 2026-11): a long line or a huge text must not stall the page.
  if (lines.filter((l) => l.trim()).length > MAX_LINES)
    return { moves: [], errors: [t(`Der Text ist zu lang (höchstens ${MAX_LINES} Zeilen)`, `The text is too long (${MAX_LINES} lines at most)`)] };
  const long = lines.findIndex((l) => l.trim().length > MAX_LINE);
  if (long >= 0)
    return { moves: [], errors: [t(`Zeile ${long + 1}: Die Zeile ist zu lang (höchstens ${MAX_LINE} Zeichen)`, `Line ${long + 1}: The line is too long (${MAX_LINE} characters at most)`)], line: long + 1 };
  // After the main flow comes one section per thing that can come at any time, then one per subprocess,
  // headed by its signal word and the task name; a JEDERZEIT section after a subprocess section belongs to
  // that subprocess (what can come at any time while it runs, job 397).
  const section = new RegExp(`^${t('TEILABLAUF', 'SUBPROCESS')} \\[([^\\]]+)\\]:$`, 'u');
  // Heading of something that can come at any time: "JEDERZEIT mit Nachricht: [Kunde storniert]:".
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const KINDS: [string, EventKind][] = [[t(' mit Nachricht', ' with a message'), 'message'], [t(' zum Zeitpunkt', ' at a point in time'), 'time'], [t(' sobald', ' once'), 'condition'], [t(' mit Signal', ' with a signal'), 'signal']];
  const anytime = new RegExp(`^${t('JEDERZEIT', 'AT ANY TIME')}(${KINDS.map(([w]) => esc(w)).join('|')}): \\[([^\\]]+)\\](${esc(t(', Ablauf läuft weiter', ', flow continues'))})?:$`, 'u');
  const starts = lines.flatMap((l, i) => (section.test(l.trim()) || anytime.test(l.trim()) ? [i] : []));
  const main = readLevel(lines.slice(0, starts[0] ?? lines.length), 0, language, {}, hintOf(previous, language));
  if (main.errors.length) return main;
  const { moves } = main;
  const taken = new Set<number>();
  /** The task move of the last subprocess section; its moves get what comes at any time after it. */
  let within: number | undefined;
  /** The same level in `previous` (the story before the edit), for "continue at" between steps of the same name. */
  let previousWithin: Move[] | undefined;
  const seen = new Map<string, number>();
  /** The move of `among` that a section stands for: the k-th that `pick` finds, counted per `key`. */
  const before = (among: Move[] | undefined, key: string, pick: (z: Move) => boolean): Move | undefined => {
    const k = seen.get(key) ?? 0;
    seen.set(key, k + 1);
    return among?.filter(pick)[k];
  };
  for (const [j, at] of starts.entries()) {
    const num = at + 1;
    const body = lines.slice(at + 1, starts[j + 1] ?? lines.length);
    // Its first line is `ES BEGINNT.`; it may be missing.
    const first = body.findIndex((l) => l.trim());
    const plain = first >= 0 && new RegExp(`^${t('ES BEGINNT', 'IT STARTS')}\\.?$`, 'u').test(body[first].trim());
    const from = plain ? first + 1 : 0;
    const any = lines[at].trim().match(anytime);
    if (any) {
      const subtype = KINDS.find(([w]) => w === any[1])![1];
      const keepsRunning = any[3] ? 'yes' as const : '' as const;
      const inner = { inner: { name: any[2], trigger: { subtype, keepsRunning: !!any[3] } } };
      const was = before(within === undefined ? previous : previousWithin, `${within ?? ''}|any|${any[2]}`, (z) => z.move === 'anytime' && z.text === any[2]);
      const r = readLevel(body.slice(from), at + 1 + from, language, inner, hintOf((was as { subprocess?: Move[] } | undefined)?.subprocess, language, inner));
      if (r.errors.length) return { moves, errors: r.errors, ...(r.line !== undefined && { line: r.line }) };
      const z: Move = { move: 'anytime', text: any[2], subtype, keepsRunning, subprocess: r.moves };
      if (within === undefined) moves.push(z);
      else (moves[within] as Extract<Move, { move: 'task' }>).subprocess!.push(z);
      const e = tell(moves, language).errors;
      if (e.length) return { moves, errors: [t(`Zeile ${num}: ${e[0]}`, `Line ${num}: ${e[0]}`)], line: num };
      continue;
    }
    const name = lines[at].trim().match(section)![1];
    // The first task of that name told WITH SUBPROCESS whose section has not come yet.
    const i = moves.findIndex((z, n) => z.move === 'task' && z.subprocess !== undefined && z.text === name && !taken.has(n));
    if (i < 0) return { moves, errors: [t(`Zeile ${num}: Kein Schritt „${name}“ mit TEILABLAUF, zu dem dieser Abschnitt gehört`, `Line ${num}: No step “${name}” WITH SUBPROCESS that this section belongs to`)], line: num };
    taken.add(i);
    within = i;
    previousWithin = (before(previous, `sub|${name}`, (z) => z.move === 'task' && z.subprocess !== undefined && z.text === name) as { subprocess?: Move[] } | undefined)?.subprocess;
    const r = readLevel(body.slice(from), at + 1 + from, language, { inner: { name } }, hintOf(previousWithin, language, { inner: { name } }));
    if (r.errors.length) return { moves, errors: r.errors, ...(r.line !== undefined && { line: r.line }) };
    (moves[i] as Extract<Move, { move: 'task' }>).subprocess = r.moves;
  }
  return { moves, errors: [] };
}

/** Nodes "continue at" can lead to (as targets() in story.ts) named `name`, in the order of the IR. */
const named = (ir: ProcessIR, name: string): Node[] =>
  ir.nodes.filter((n) => !n.id.startsWith('Offen_') && ((n.kind === 'step' && !isAnytime(n)) || n.kind === 'wait' || n.kind === 'send' || n.kind === 'end') && n.name === name);

/**
 * What the story before the edit says about "continue at" on one level: per name, the place of the
 * target of its 1st, 2nd, … CONTINUE AT [name] among the nodes of that name (-1: none). The text
 * cannot tell two steps of the same name apart; this way an unchanged line keeps its target.
 */
type Hint = Map<string, number[]>;
function hintOf(moves: Move[] | undefined, language: Language, opts: TellOptions = {}): Hint | undefined {
  if (!moves?.some((z) => z.move === 'goTo')) return undefined;
  const { ir } = tell(moves, language, opts);
  const hint: Hint = new Map();
  for (const z of moves) {
    if (z.move !== 'goTo') continue;
    const node = ir.nodes.find((n) => n.id === z.target);
    const name = node?.name ?? z.target;
    hint.set(name, [...(hint.get(name) ?? []), node ? named(ir, name).indexOf(node) : -1]);
  }
  return hint;
}

/** One level of the story text: the main flow, or the lines of one subprocess (`opts.inner`). `offset`: lines before it.
 *  `hint`: the same level before the edit (hintOf). */
function readLevel(lines: string[], offset: number, language: Language, opts: TellOptions = {}, hint?: Hint): { moves: Move[]; errors: string[]; line?: number } {
  const t = (de: string, en: string) => (language === 'en' ? en : de);
  const moves: Move[] = [];
  const room = (i: number, slot: 'yes' | 'no' | number) => `§${i}.${slot}§`;
  const SLOT = /§(\d+)\.(yes|no|\d+)§/;
  // Headings of the branches of "in parallel", as tell writes them.
  const strands = Array.from({ length: MAX_PATHS }, (_, j) => branchHead(j, language));
  const W = {
    start: t('ES BEGINNT', 'IT STARTS'), orStart: t('ODER ES BEGINNT', 'OR IT STARTS'), at: t('bei', 'at'), shall: t('soll', 'shall'), withWord: t('mit', 'with'), deadline: t('Frist', 'deadline'),
    waitFor: t('WARTEN AUF', 'WAIT FOR'), waitUntil: t('WARTEN BIS', 'WAIT UNTIL'), decision: t('WENN', 'IF'),
    first: t('WAS ZUERST PASSIERT', 'WHAT COMES FIRST'), concurrent: t('GLEICHZEITIG', 'IN PARALLEL'),
    ifCase: t('FALLS', 'IN CASE OF'), message: t('NACHRICHT', 'MESSAGE'), runs: t(', Schritt läuft weiter', ', step continues'),
    merge: t('ZUSAMMEN', 'MERGE'), end: t('ENDE', 'END'), continueAt: t('WEITER BEI', 'CONTINUE AT'), openPath: t('NOCH OFFEN', 'STILL OPEN'), openJoins: t('NOCH OFFEN, DANN ZUSAMMEN', 'STILL OPEN, THEN MERGE'),
    otherwise: t('SONST', 'ELSE'), once: t('SOBALD', 'ONCE'), continueOn: t('WEITER AUF DEM', 'BACK ON THE'),
    withMessage: t(' mit Nachricht', ' with a message'), pointInTime: t(' zum Zeitpunkt', ' at a point in time'),
    onceSmall: t(' sobald', ' once'), cancel: t(', alles abbrechen', ', stop everything'),
    withSignal: t(' mit Signal', ' with a signal'), waitSignal: t('WARTEN AUF SIGNAL', 'WAIT FOR SIGNAL'), sendSignal: t('SIGNAL SENDEN', 'SEND SIGNAL'),
    withSub: t(', MIT TEILABLAUF', ', WITH SUBPROCESS'),
    forEach: t('FÜR JEDE', 'FOR EACH'), inSequence: t('NACHEINANDER', 'IN SEQUENCE'), inParallel: t('GLEICHZEITIG', 'IN PARALLEL')
  };
  const rx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const R = (...parts: string[]) => new RegExp(`^${parts.join('')}$`, 'u');

  // Content lines: [pattern, move from it]. First with brackets (unambiguous), without brackets only where it stays unambiguous.
  const fileContent: [RegExp, (m: RegExpMatchArray) => Move | 'first'][] = [
    [R(rx(W.start), `(${rx(W.withMessage)}|${rx(W.pointInTime)}|${rx(W.onceSmall)}|${rx(W.withSignal)})?: \\[([^\\]]+)\\] ${rx(W.at)} \\[@([^\\]]+)\\]\\.?`),
      (m) => ({ move: 'start', text: m[2], role: m[3], subtype: m[1] === W.withMessage ? 'message' : m[1] === W.pointInTime ? 'time' : m[1] === W.onceSmall ? 'condition' : m[1] === W.withSignal ? 'signal' : '' })],
    [R(rx(W.orStart), `(${rx(W.withMessage)}|${rx(W.pointInTime)}|${rx(W.onceSmall)}|${rx(W.withSignal)})?: \\[([^\\]]+)\\] ${rx(W.at)} \\[@([^\\]]+)\\]\\.?`),
      (m) => ({ move: 'orStart', text: m[2], role: m[3], subtype: m[1] === W.withMessage ? 'message' : m[1] === W.pointInTime ? 'time' : m[1] === W.onceSmall ? 'condition' : m[1] === W.withSignal ? 'signal' : '' })],
    [R(`\\[@([^\\]]+)\\] ${rx(W.shall)} \\[([^\\]]+)\\](?: in \\[#([^\\]]+)\\])?(?: ${rx(W.withWord)} (\\[\\+[^\\]]+\\](?:, \\[\\+[^\\]]+\\])*))?(?:, ${rx(W.deadline)} \\[!([^\\]]+)\\])?(?:, ${rx(W.forEach)} \\[([^\\]]+)\\], (${rx(W.inSequence)}|${rx(W.inParallel)}))?(${rx(W.withSub)})?\\.?`),
      (m) => ({ move: 'task', text: m[2], role: m[1], ...(m[3] && { system: m[3] }),
        ...(m[4] && { documentName: [...m[4].matchAll(/\[\+([^\]]+)\]/g)].map((d) => d[1]).join(', ') }), ...(m[5] && { deadline: m[5] }),
        ...(m[6] && { each: m[6], eachOrder: m[7] === W.inParallel ? 'parallel' : 'sequential' }), ...(m[8] && { subprocess: [] }) })],
    // Before the plain wait: otherwise the signal word would become part of the name of a message.
    [R(rx(W.waitSignal), ' \\[?([^\\]]+?)\\]?\\.?'), (m) => ({ move: 'wait', text: m[1], subtype: 'signal' })],
    [R(rx(W.sendSignal), ` \\[?([^\\]]+?)\\]?(?: ${rx(W.at)} \\[@([^\\]]+)\\])?\\.?`), (m) => ({ move: 'sendSignal', text: m[1], ...(m[2] && { role: m[2] }) })],
    [R(rx(W.waitFor), ' \\[?(!?)([^\\]]+?)\\]?\\.?'), (m) => ({ move: 'wait', text: m[2], subtype: m[1] ? 'time' : 'message' })],
    [R(rx(W.waitUntil), ' \\[?([^\\]]+?)\\]?\\.?'), (m) => ({ move: 'wait', text: m[1], subtype: 'condition' })],
    [R(rx(W.decision), ' \\[?\\??([^\\]]+?)\\??\\]?\\??:?'),
      (m) => ({ move: 'decision', question: `${m[1]}?`, yes: room(moves.length, 'yes'), no: room(moves.length, 'no'), ...extra('decision') })],
    [R(rx(W.first), ':?'), () => 'first'],
    [R(rx(W.concurrent), ':?'), () => {
      const n = count('concurrent');
      return n > 2 ? { move: 'concurrent', branches: n } : { move: 'concurrent' };
    }],
    [R(rx(W.ifCase), `( ${rx(W.message)})? \\[?(!?)([^\\]]+?)\\]?(${rx(W.runs)})?:?`),
      (m) => ({ move: 'exceptionPath', text: m[3], subtype: m[2] ? 'deadline' : m[1] ? 'message' : 'error', keepsRunning: m[4] ? 'yes' : '' })],
    [R(rx(W.merge), '\\.?'), () => ({ move: 'merge' })],
    [R(rx(W.openJoins), '\\.?'), () => ({ move: 'openPath', joins: true })],
    [R(rx(W.openPath), '\\.?'), () => ({ move: 'openPath' })],
    [R(rx(W.end), `(${rx(W.withMessage)}|${rx(W.withSignal)}|${rx(W.cancel)})?: \\[?([^\\]]+?)\\]?\\.?`),
      (m) => ({ move: 'end', text: m[2], subtype: m[1] === W.withMessage ? 'message' : m[1] === W.withSignal ? 'signal' : m[1] === W.cancel ? 'cancel' : '' })],
    [R(rx(W.continueAt), ' \\[?([^\\]]+?)\\]?\\.?'), (m) => ({ move: 'goTo', target: m[1] })],
    // Without brackets, last: "Buchhaltung soll Rechnung buchen."
    [R(`([^[\\]]+?) ${rx(W.shall)} ([^[\\]]+?)\\.?`), (m) => ({ move: 'task', text: m[2], role: m[1] })]
  ];

  // line: for the marker in the editor, without splitting up the text.
  const errors = (n: number, what: string) => {
    const num = offset + n;
    return ({ moves, errors: [t(`Zeile ${num}: ${what}`, `Line ${num}: ${what}`)], line: num });
  };

  /** A hyphen typed instead of the dash of a branch heading. */
  const dash = (l: string) => (l.startsWith('- ') && strands.includes(`–${l.slice(1)}`) ? `–${l.slice(1)}` : l);
  const indent = (l: string) => l.length - l.trimStart().length;
  /** Line being read; count() looks ahead from it. */
  let at = 0;
  /**
   * How many paths the branch of line `at` has: the line does not say, its path headings do. They sit at
   * the indentation of the branch line; deeper lines belong to its paths, "BACK ON THE …" to an earlier one.
   * The first content line at that indentation or further left ends the count.
   */
  const count = (kind: 'decision' | 'first' | 'concurrent'): number => {
    const w = indent(lines[at]);
    let n = 0;
    for (const raw of lines.slice(at + 1)) {
      if (!raw.trim()) continue;
      const d = indent(raw);
      if (d > w) continue;
      if (d < w) break;
      const l = dash(raw.trim());
      if (l.startsWith(W.continueOn + ' ')) continue;
      // The otherwise path may be told before a further one (switched to), so it does not end the count.
      if (kind === 'concurrent' ? strands.includes(l) : R('→ (.+):').test(l) || (kind === 'decision' && R(`${rx(W.otherwise)} → (.+):`).test(l))) {
        n++;
        continue;
      }
      break;
    }
    return Math.min(Math.max(n, 2), MAX_PATHS);
  };
  /** Placeholders of the paths between the first and the last. */
  const extra = (kind: 'decision' | 'first') => {
    const n = count(kind) - 2;
    return n > 0 ? { more: Array.from({ length: n }, (_, j) => room(moves.length, j)) } : {};
  };

  /** How many CONTINUE AT [name] were read so far, per name. */
  const continued = new Map<string, number>();
  for (const [i, raw] of lines.entries()) {
    at = i;
    const line = dash(raw.trim());
    if (!line) continue;
    const num = i + 1;
    const state = tell(moves, language, opts);

    // Path heading?
    const head =
      line.match(R(`${rx(W.otherwise)} → (.+):`)) ? 'otherwise'
      : line.match(R(`→ (?:${rx(W.once)} |SIGNAL )?\\[.+\\]:`)) ? 'first'
      : line.match(R('→ (.+):')) ? 'yes'
      : strands.includes(line) || line.startsWith(W.continueOn + ' ') ? 'fixed'
      : undefined;
    if (head) {
      const heads = state.heads ?? [];
      // First exactly the same heading, then a path whose label is still missing.
      let to = heads.findIndex((k) => k === line);
      if (to < 0 && head !== 'fixed')
        to = heads.findIndex((k) => k !== undefined && SLOT.test(k) && (head === 'otherwise') === k.startsWith(W.otherwise) && (head !== 'first' || k.includes('[')));
      // Continuation of a path whose name has changed in the meantime: the next one begun.
      if (to < 0 && line.startsWith(W.continueOn + ' ')) to = heads.findIndex((k) => k?.startsWith(W.continueOn + ' '));
      if (to < 0) return errors(num, t(`„${line}“ – diesen Weg gibt es hier nicht`, `“${line}” – there is no such path here`));
      const p = heads[to]?.match(SLOT);
      if (p) {
        const z = moves[Number(p[1])] as Extract<Move, { move: 'decision' }>;
        const slot = p[2];
        const zm = line.match(R(`→ (${rx(W.once)} |SIGNAL )?\\[(!?)(.+)\\]:`));
        const label = zm ? zm[3] : line.replace(R(`(?:${rx(W.otherwise)} )?→ (.+):`), '$1');
        const kind = zm && (zm[1] === 'SIGNAL ' ? 'signal' : zm[1] ? 'condition' : zm[2] ? 'time' : 'message');
        if (slot === 'yes' || slot === 'no') {
          z[slot] = label;
          if (kind) z[slot === 'yes' ? 'yesKind' : 'noKind'] = kind;
        } else {
          z.more![Number(slot)] = label;
          if (kind) (z.moreKinds ??= z.more!.map(() => 'message'))[Number(slot)] = kind;
        }
      }
      if (to > 0) moves.push({ move: 'switchTo', to });
      continue;
    }

    // Content
    const hits = fileContent.map(([r, f]) => [line.match(r), f] as const).find(([m]) => m);
    if (!hits) return errors(num, t(`„${line}“ nicht verstanden`, `“${line}” not understood`));
    let move = hits[1](hits[0]!);
    if (move === 'first') move = { move: 'decision', subtype: 'first', yes: room(moves.length, 'yes'), no: room(moves.length, 'no'), ...extra('first') };
    // "continue at": name -> node. Several of that name: the one the same line led to before the edit.
    if (move.move === 'goTo') {
      const name = move.target;
      const m = continued.get(name) ?? 0;
      continued.set(name, m + 1);
      const candidates = state.targets.filter((z) => z.name === name);
      if (!candidates.length) return errors(num, t(`Bei „${name}“ kann es von hier aus nicht weitergehen`, `Cannot continue at “${name}” from here`));
      let target: { id: string } | undefined = candidates[0];
      if (candidates.length > 1) {
        const r = hint?.get(name)?.[m] ?? -1;
        const was = r >= 0 ? named(state.ir, name)[r] : undefined;
        target = was && candidates.find((z) => z.id === was.id);
        if (!target) return errors(num, t(`„${name}“ gibt es mehrmals – bitte die Schritte verschieden benennen`, `“${name}” exists more than once – please give the steps different names`));
      }
      move = { move: 'goTo', target: target.id };
    }
    moves.push(move);
    const added = tell(moves, language, opts);
    if (added.errors.length) {
      moves.pop();
      return errors(num, added.errors[0]);
    }
  }

  // Paths without their own heading: decision with yes / no; "what comes first" does not work without.
  for (const z of moves)
    if (z.move === 'decision') {
      if (z.more?.some((m) => SLOT.test(m))) return { moves, errors: [t('Bei mehr als zwei Wegen braucht jeder Weg eine Überschrift (→ …:)', 'With more than two paths every path needs a heading (→ …:)')] };
      for (const slot of ['yes', 'no'] as const)
        if (SLOT.test(z[slot])) {
          if (z.subtype === 'first') return { moves, errors: [t('Bei „was zuerst passiert“ braucht jeder Weg eine Überschrift (→ [...]:)', 'With “what comes first” every path needs a heading (→ [...]:)')] };
          z[slot] = slot === 'yes' ? t('ja', 'yes') : t('nein', 'no');
        }
    }
  return { moves, errors: [] };
}

/** Story text with markers and indentation - as read() reads it back. */
export const asSourceText = (lines: Line[]): string => lines.map((z) => '  '.repeat(z.depth) + z.text).join('\n');
