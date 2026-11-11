import { Op, ProcessIR, Node, EventKind, EndKind, incoming, nodeById } from './ir.js';
import { applyOps } from './apply.js';
import { emptyProcess } from './pipeline.js';
import { Language, tx } from './language.js';

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
  /** system, documentName, deadline: optional, empty = not given. They end up in the additional details.
   *  documentName: several separated by commas. */
  | { move: 'task'; text: string; role: string; system?: string; documentName?: string; deadline?: string }
  /** subtype 'first': no check but waiting - the path whose event occurs first continues.
   *  yes/no are then the two events, yesKind/noKind their kind; question is omitted. */
  | { move: 'decision'; question?: string; yes: string; no: string; subtype?: '' | 'first'; yesKind?: EventKind; noKind?: EventKind }
  | { move: 'concurrent' }
  /** Waiting: for a message, or for a duration / until a date. */
  | { move: 'wait'; text: string; subtype: EventKind }
  /** subtype 'deadline': deadline expired (timer), 'message': a message interrupts; otherwise error.
   *  keepsRunning 'yes': the task keeps running, the path is added (not for an error). */
  | { move: 'exceptionPath'; text: string; subtype?: 'error' | 'deadline' | 'message'; keepsRunning?: '' | 'yes' }
  | { move: 'merge' }
  /** subtype 'message': a message is sent; 'cancel': everything ends, including what runs alongside. */
  | { move: 'end'; text: string; subtype?: EndKind | '' }
  | { move: 'goTo'; target: string }
  /** Tell another open path first: to = position in StoryState.open, starting at 1. */
  | { move: 'switchTo'; to: number };

type Thread = {
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
export type Line = { depth: number; text: string; move?: number };

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
  /** Per move the task or end it created - target for "continue at". */
  nodes: (string | undefined)[];
};

// Square brackets in a name would break the markup.
// ponytail: simply removed; mask them only when reading back (text -> moves).
const k = (s: string) => s.replace(/[[\]]/g, '').trim();

export function tell(moves: Move[], language?: Language): StoryState {
  const t = (de: string, en: string) => tx(language, de, en);
  // The pool name comes with the start move; the IR is created earlier, though.
  const initial = moves[0];
  const process = (initial?.move === 'start' && initial.process?.trim()) || t('Prozess', 'Process');
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

  /** Path before the branch - valid again after the merge. */
  const splitPath = new Map<string, string | undefined>();

  const checkMerge = (): void => {
    for (const [split, paths] of [...parked]) {
      if (threads.some((f) => f.splits.includes(split))) continue;
      parked.delete(split);
      const rest = paths[0].splits.slice(0, paths[0].splits.indexOf(split));
      const depth = splitDepth.get(split) ?? 0;
      if (paths.length === 1) {
        threads.unshift({ ...paths[0], splits: rest, depth, head: undefined, path: splitPath.get(split) });
        continue;
      }
      const nodes = nodeById(ir, split);
      const parallel = nodes?.kind === 'gateway' && nodes.gatewayType === 'parallel';
      const id = newId('Zusammen');
      // Merge where the branch was made - otherwise the arrows cross foreign lanes.
      const laneId = laneFrom(nodes?.kind === 'exception' ? nodes.attachedTo : split) || paths[0].laneId;
      tu({
        op: 'addNode',
        node: { id, kind: 'gateway', name: '', gatewayType: parallel ? 'parallel' : 'exclusive', laneId }
      });
      merges.add(id);
      for (const w of paths) connect(w, id);
      threads.unshift({ origin: id, laneId, path: splitPath.get(split), title: t('Die Wege sind wieder zusammen. Wie geht es weiter?', 'The paths have merged. What happens next?'), splits: rest, depth });
    }
  };

  for (const [i, z] of moves.entries()) {
    if (z.move === 'start') {
      if (ir.nodes.length) {
        errors.push(t('Der Auslöser steht nur ganz am Anfang', 'The trigger comes only at the very beginning'));
        continue;
      }
      const id = newId('Start');
      const laneId = lane(z.role);
      const subtype = z.subtype || undefined;
      const how = subtype === 'message' ? t(' mit Nachricht', ' with a message') : subtype === 'time' ? t(' zum Zeitpunkt', ' at a point in time') : subtype === 'condition' ? t(' sobald', ' once') : '';
      if (tu({ op: 'addNode', node: { id, kind: 'start', name: z.text, laneId, ...(subtype && { subtype }) } }))
        storyText.push({ depth: 0, move: i, text: t(`ES BEGINNT${how}: [${k(z.text)}] bei [@${k(z.role)}].`, `IT STARTS${how}: [${k(z.text)}] at [@${k(z.role)}].`) });
      threads = [{ origin: id, laneId, title: t(`„${z.text}“ – was passiert als Erstes?`, `“${z.text}” – what happens first?`), splits: [], depth: 0 }];
      continue;
    }

    const f = threads[0];
    if (!f) {
      errors.push(ir.nodes.length ? t('Die Geschichte ist schon zu Ende', 'The story has already ended') : t('Zuerst den Auslöser erzählen', 'Tell the trigger first'));
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
        if (
          tu({ op: 'addNode', node: { id, kind: 'step', name: z.text, laneId } }) &&
          connect(f, id) &&
          (!Object.keys(details).length ? true : tu({ op: 'setDetails', nodeId: id, details }))
        ) {
          const extra =
            (system ? ` in [#${k(system)}]` : '') +
            (documents.length ? ` ${t('mit', 'with')} ${documents.map((d) => `[+${k(d)}]`).join(', ')}` : '') +
            (deadline ? t(`, Frist [!${k(deadline)}]`, `, deadline [!${k(deadline)}]`) : '');
          nodes[i] = id;
          write(t(`[@${k(z.role)}] soll [${k(z.text)}]${extra}.`, `[@${k(z.role)}] shall [${k(z.text)}]${extra}.`));
          threads[0] = { origin: id, laneId, task: id, path: f.path, title: t(`Nach „${z.text}“ – wie geht es weiter?`, `After “${z.text}” – what happens next?`), splits: f.splits, depth: f.depth };
        }
        break;
      }

      case 'wait': {
        const id = newId('Warten');
        const subtype = z.subtype || 'message';
        if (!tu({ op: 'addNode', node: { id, kind: 'wait', name: z.text, laneId: f.laneId, subtype } }) || !connect(f, id)) break;
        nodes[i] = id;
        // Time carries the deadline marker like the expired deadline; the message has no marker.
        write(subtype === 'condition' ? `${t('WARTEN BIS', 'WAIT UNTIL')} [${k(z.text)}].` : `${t('WARTEN AUF', 'WAIT FOR')} [${subtype === 'time' ? '!' : ''}${k(z.text)}].`);
        threads[0] = { origin: id, laneId: f.laneId, path: f.path, title: t(`Nach dem Warten auf „${z.text}“ – wie geht es weiter?`, `After waiting for “${z.text}” – what happens next?`), splits: f.splits, depth: f.depth };
        break;
      }

      case 'decision': {
        const id = newId('Wenn');
        if (!z.yes.trim() || !z.no.trim()) {
          errors.push(t('Beide Wege einer Entscheidung brauchen eine Beschriftung', 'Both paths of a decision need a label'));
          break;
        }
        const first = z.subtype === 'first';
        if (!tu({ op: 'addNode', node: { id, kind: 'gateway', name: first ? '' : z.question ?? '', gatewayType: first ? 'event' : 'exclusive', laneId: f.laneId } }) || !connect(f, id))
          break;
        splitDepth.set(id, f.depth);
        splitPath.set(id, f.path);
        const splits = [...f.splits, id];
        if (first) {
          // Every path begins with its waiting; that is also its label.
          const paths: Thread[] = [];
          for (const [text, a] of [[z.yes, z.yesKind], [z.no, z.noKind]] as const) {
            const w = newId('Warten');
            const subtype = a || 'message';
            if (!tu({ op: 'addNode', node: { id: w, kind: 'wait', name: text, laneId: f.laneId, subtype } }, { op: 'connect', fromId: id, toId: w })) break;
            paths.push({ head: `→ ${subtype === 'condition' ? t('SOBALD ', 'ONCE ') : ''}[${subtype === 'time' ? '!' : ''}${k(text)}]:`, origin: w, laneId: f.laneId, path: t(`Wenn zuerst „${text}“`, `If “${text}” comes first`), title: t('Was passiert dann?', 'What happens then?'), splits, depth: f.depth + 1 });
          }
          if (paths.length < 2) break;
          write(t('WAS ZUERST PASSIERT:', 'WHAT COMES FIRST:'));
          threads.splice(0, 1, ...paths);
          break;
        }
        // The ? is already in the marker; the display appends it again.
        write(`${t('WENN', 'IF')} [?${k(z.question ?? '').replace(/\?+$/, '')}]`);
        threads.splice(
          0,
          1,
          { head: `→ ${k(z.yes)}:`, origin: id, laneId: f.laneId, condition: z.yes, path: `„${z.question}“ → ${z.yes}`, title: t('Was passiert dann?', 'What happens then?'), splits, depth: f.depth + 1 },
          { head: `${t('SONST', 'ELSE')} → ${k(z.no)}:`, origin: id, laneId: f.laneId, condition: z.no, otherwise: true, path: `„${z.question}“ → ${z.no}`, title: t('Was passiert dann?', 'What happens then?'), splits, depth: f.depth + 1 }
        );
        break;
      }

      case 'concurrent': {
        const id = newId('Gleichzeitig');
        if (!tu({ op: 'addNode', node: { id, kind: 'gateway', name: '', gatewayType: 'parallel', laneId: f.laneId } }) || !connect(f, id))
          break;
        write(t('GLEICHZEITIG:', 'IN PARALLEL:'));
        splitDepth.set(id, f.depth);
        splitPath.set(id, f.path);
        const splits = [...f.splits, id];
        threads.splice(
          0,
          1,
          { head: t('– erster Strang:', '– first branch:'), origin: id, laneId: f.laneId, path: t('Gleichzeitig, erster Strang', 'In parallel, first branch'), title: t('Was passiert?', 'What happens?'), splits, depth: f.depth + 1 },
          { head: t('– zweiter Strang:', '– second branch:'), origin: id, laneId: f.laneId, path: t('Gleichzeitig, zweiter Strang', 'In parallel, second branch'), title: t('Was passiert?', 'What happens?'), splits, depth: f.depth + 1 }
        );
        break;
      }

      case 'exceptionPath': {
        if (!f.task) {
          errors.push(t('Eine Ausnahme braucht einen Schritt, an dem sie hängt', 'An exception needs a step to attach to'));
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
        if (goTo) alongside.add(id);
        // Tell the exception path first, then continue the normal path.
        threads.splice(
          0,
          1,
          { origin: id, laneId: f.laneId, path: t(`Falls „${z.text}“`, `In case of “${z.text}”`), title: t('Was passiert dann?', 'What happens then?'), splits: [...f.splits, id], depth: f.depth + 1 },
          // If the task keeps running, there is nothing to merge: the normal path stays as it was.
          { ...f, task: undefined, title: t(`Zurück zum normalen Weg nach „${name(f.task)}“ – wie geht es weiter?`, `Back to the normal path after “${name(f.task)}” – what happens next?`), splits: goTo ? f.splits : [...f.splits, id] }
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
          const how = subtype === 'message' ? t(' mit Nachricht', ' with a message') : subtype === 'cancel' ? t(', alles abbrechen', ', stop everything') : '';
          write(`${t('ENDE', 'END')}${how}: [${k(z.text)}].`);
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
        write(t('ZUSAMMEN.', 'MERGE.'));
        threads.shift();
        parked.set(split, [...(parked.get(split) ?? []), f]);
        checkMerge();
        break;
      }

      case 'goTo': {
        if (f.splits.some((s) => alongside.has(s)) || !targets(ir, f).some((zz) => zz.id === z.target)) {
          errors.push(t(`Bei „${name(z.target)}“ kann es von hier aus nicht weitergehen`, `Cannot continue at “${name(z.target)}” from here`));
          break;
        }
        const target = nodeById(ir, z.target)!;
        let to = z.target;
        if (target.kind !== 'end') {
          // A task has exactly one entry. Whoever joins it comes via a
          // merge point in front - otherwise it is formally not clean BPMN.
          const one = incoming(ir, z.target);
          if (one.length === 1 && merges.has(one[0].from)) to = one[0].from;
          else if (one.length === 1) {
            to = newId('Zusammen');
            if (!tu({ op: 'insertBetween', fromId: one[0].from, toId: z.target, node: { id: to, kind: 'gateway', name: '', gatewayType: 'exclusive', laneId: laneFrom(z.target) } }))
              break;
            merges.add(to);
          }
        }
        if (connect(f, to)) {
          write(`${t('WEITER BEI', 'CONTINUE AT')} [${k(name(z.target))}].`);
          threads.shift();
          checkMerge();
        }
        break;
      }
    }
  }

  const roles = ir.lanes.map((l) => l.name);
  const f = threads[0];
  if (!ir.nodes.length)
    return { ops, ir, question: t('Womit fängt der Prozess an, und bei wem?', 'How does the process start, and with whom?'), options: ['start'], targets: [], roles, open: [], done: false, errors, storyText, nodes, endKinds: [] };
  if (!f) return { ops, ir, options: [], targets: [], roles, open: [], done: true, errors, storyText, nodes, endKinds: [] };

  const options: Move['move'][] = ['task', 'wait', 'decision', 'concurrent'];
  if (f.task) options.push('exceptionPath');
  if (f.splits.length && !alongside.has(f.splits.at(-1)!)) options.push('merge');
  options.push('end');
  const zz = f.splits.some((s) => alongside.has(s)) ? [] : targets(ir, f);
  if (zz.length) options.push('goTo');
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
    endKinds: besideRun(f) ? ['', 'message', 'cancel'] : ['', 'message']
  };
}

/**
 * Like Array.splice on the moves: from `startAt`, `path` moves are replaced by `added`.
 * The node IDs count on, so all later ones shift -
 * "continue at" is rewritten to the new ID via the move that created the target.
 * If the target is gone, its name stays as the target; the
 * replay then reports "Bei „…“ kann es nicht weitergehen".
 */
export function splice(moves: Move[], startAt: number, path: number, added: Move[], language?: Language): Move[] {
  const old = tell(moves, language);
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
    const id = tell(result.slice(0, j), language).nodes[source];
    if (id) result[j] = { ...z, target: id };
  }
  return result;
}

/** Story text without markup, indented with spaces - for PDF and file. */
export const asText = (lines: Line[]): string =>
  lines
    .map((z) => '  '.repeat(z.depth) + z.text.replace(/\[([@#+!?]?)([^\]]*)\]/g, (_, subtype, t) => t + (subtype === '?' ? '?' : '')))
    .join('\n');

/**
 * Where "continue at" may lead: to existing tasks and ends. Not
 * to the start (never has an entry), not to branches (otherwise mixed form),
 * not out of a concurrent branch (it has to run together).
 */
function targets(ir: ProcessIR, f: Thread): Target[] {
  if (f.splits.some((s) => (nodeById(ir, s) as any)?.gatewayType === 'parallel')) return [];
  return ir.nodes
    .filter((n) => n.kind === 'step' || n.kind === 'wait' || n.kind === 'end')
    // Already directly connected: that would be the same arrow twice.
    // A wait after "what comes first" may only be reached from there.
    .filter((n) => !incoming(ir, n.id).some((e) => (nodeById(ir, e.from) as any)?.gatewayType === 'event'))
    .filter((n) => !incoming(ir, n.id).some((e) => e.from === f.origin))
    .map((n) => ({ id: n.id, name: n.name }));
}
