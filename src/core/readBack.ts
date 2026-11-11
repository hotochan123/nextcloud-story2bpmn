import { tell, Line, Move } from './story.js';
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
export function read(text: string, language: Language = 'de'): { moves: Move[]; errors: string[]; line?: number } {
  const t = (de: string, en: string) => (language === 'en' ? en : de);
  const moves: Move[] = [];
  const room = (i: number, slot: 'yes' | 'no') => `§${i}.${slot}§`;
  const SLOT = /§(\d+)\.(yes|no)§/;
  const W = {
    start: t('ES BEGINNT', 'IT STARTS'), at: t('bei', 'at'), shall: t('soll', 'shall'), withWord: t('mit', 'with'), deadline: t('Frist', 'deadline'),
    waitFor: t('WARTEN AUF', 'WAIT FOR'), waitUntil: t('WARTEN BIS', 'WAIT UNTIL'), decision: t('WENN', 'IF'),
    first: t('WAS ZUERST PASSIERT', 'WHAT COMES FIRST'), concurrent: t('GLEICHZEITIG', 'IN PARALLEL'),
    ifCase: t('FALLS', 'IN CASE OF'), message: t('NACHRICHT', 'MESSAGE'), runs: t(', Schritt läuft weiter', ', step continues'),
    merge: t('ZUSAMMEN', 'MERGE'), end: t('ENDE', 'END'), continueAt: t('WEITER BEI', 'CONTINUE AT'),
    otherwise: t('SONST', 'ELSE'), once: t('SOBALD', 'ONCE'), strand1: t('– erster Strang:', '– first branch:'),
    strand2: t('– zweiter Strang:', '– second branch:'), continueOn: t('WEITER AUF DEM', 'BACK ON THE'),
    withMessage: t(' mit Nachricht', ' with a message'), pointInTime: t(' zum Zeitpunkt', ' at a point in time'),
    onceSmall: t(' sobald', ' once'), cancel: t(', alles abbrechen', ', stop everything')
  };
  const rx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const R = (...parts: string[]) => new RegExp(`^${parts.join('')}$`, 'u');

  // Content lines: [pattern, move from it]. First with brackets (unambiguous), without brackets only where it stays unambiguous.
  const fileContent: [RegExp, (m: RegExpMatchArray) => Move | 'first'][] = [
    [R(rx(W.start), `(${rx(W.withMessage)}|${rx(W.pointInTime)}|${rx(W.onceSmall)})?: \\[(.+?)\\] ${rx(W.at)} \\[@(.+?)\\]\\.?`),
      (m) => ({ move: 'start', text: m[2], role: m[3], subtype: m[1] === W.withMessage ? 'message' : m[1] === W.pointInTime ? 'time' : m[1] === W.onceSmall ? 'condition' : '' })],
    [R(`\\[@(.+?)\\] ${rx(W.shall)} \\[(.+?)\\](?: in \\[#(.+?)\\])?(?: ${rx(W.withWord)} (\\[\\+.+?\\](?:, \\[\\+.+?\\])*))?(?:, ${rx(W.deadline)} \\[!(.+?)\\])?\\.?`),
      (m) => ({ move: 'task', text: m[2], role: m[1], ...(m[3] && { system: m[3] }),
        ...(m[4] && { documentName: [...m[4].matchAll(/\[\+(.+?)\]/g)].map((d) => d[1]).join(', ') }), ...(m[5] && { deadline: m[5] }) })],
    [R(rx(W.waitFor), ' \\[?(!?)([^\\]]+?)\\]?\\.?'), (m) => ({ move: 'wait', text: m[2], subtype: m[1] ? 'time' : 'message' })],
    [R(rx(W.waitUntil), ' \\[?([^\\]]+?)\\]?\\.?'), (m) => ({ move: 'wait', text: m[1], subtype: 'condition' })],
    [R(rx(W.decision), ' \\[?\\??([^\\]]+?)\\??\\]?\\??:?'),
      (m) => ({ move: 'decision', question: `${m[1]}?`, yes: room(moves.length, 'yes'), no: room(moves.length, 'no') })],
    [R(rx(W.first), ':?'), () => 'first'],
    [R(rx(W.concurrent), ':?'), () => ({ move: 'concurrent' })],
    [R(rx(W.ifCase), `( ${rx(W.message)})? \\[?(!?)([^\\]]+?)\\]?(${rx(W.runs)})?:?`),
      (m) => ({ move: 'exceptionPath', text: m[3], subtype: m[2] ? 'deadline' : m[1] ? 'message' : 'error', keepsRunning: m[4] ? 'yes' : '' })],
    [R(rx(W.merge), '\\.?'), () => ({ move: 'merge' })],
    [R(rx(W.end), `(${rx(W.withMessage)}|${rx(W.cancel)})?: \\[?([^\\]]+?)\\]?\\.?`),
      (m) => ({ move: 'end', text: m[2], subtype: m[1] === W.withMessage ? 'message' : m[1] === W.cancel ? 'cancel' : '' })],
    [R(rx(W.continueAt), ' \\[?([^\\]]+?)\\]?\\.?'), (m) => ({ move: 'goTo', target: m[1] })],
    // Without brackets, last: "Buchhaltung soll Rechnung buchen."
    [R(`([^[\\]]+?) ${rx(W.shall)} ([^[\\]]+?)\\.?`), (m) => ({ move: 'task', text: m[2], role: m[1] })]
  ];

  const lines = text.split(/\r?\n/);
  // line: for the marker in the editor, without splitting up the text.
  const errors = (num: number, what: string) => ({ moves, errors: [t(`Zeile ${num}: ${what}`, `Line ${num}: ${what}`)], line: num });

  for (const [i, raw] of lines.entries()) {
    const line = raw.trim().replace(/^-(?= (erster|zweiter|first|second) )/, '–');
    if (!line) continue;
    const num = i + 1;
    const state = tell(moves, language);

    // Path heading?
    const head =
      line.match(R(`${rx(W.otherwise)} → (.+):`)) ? 'otherwise'
      : line.match(R(`→ (?:${rx(W.once)} )?\\[.+\\]:`)) ? 'first'
      : line.match(R('→ (.+):')) ? 'yes'
      : line === W.strand1 || line === W.strand2 || line.startsWith(W.continueOn + ' ') ? 'fixed'
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
        const slot = p[2] as 'yes' | 'no';
        const zm = line.match(R(`→ (${rx(W.once)} )?\\[(!?)(.+)\\]:`));
        if (zm) {
          z[slot] = zm[3];
          z[slot === 'yes' ? 'yesKind' : 'noKind'] = zm[1] ? 'condition' : zm[2] ? 'time' : 'message';
        } else z[slot] = line.replace(R(`(?:${rx(W.otherwise)} )?→ (.+):`), '$1');
      }
      if (to > 0) moves.push({ move: 'switchTo', to });
      continue;
    }

    // Content
    const hits = fileContent.map(([r, f]) => [line.match(r), f] as const).find(([m]) => m);
    if (!hits) return errors(num, t(`„${line}“ nicht verstanden`, `“${line}” not understood`));
    let move = hits[1](hits[0]!);
    if (move === 'first') move = { move: 'decision', subtype: 'first', yes: room(moves.length, 'yes'), no: room(moves.length, 'no') };
    // "continue at": name -> node. The first match; names are rarely duplicated.
    if (move.move === 'goTo') {
      const name = move.target;
      const target = state.targets.find((z) => z.name === name);
      if (!target) return errors(num, t(`Bei „${name}“ kann es von hier aus nicht weitergehen`, `Cannot continue at “${name}” from here`));
      move = { move: 'goTo', target: target.id };
    }
    moves.push(move);
    const added = tell(moves, language);
    if (added.errors.length) {
      moves.pop();
      return errors(num, added.errors[0]);
    }
  }

  // Paths without their own heading: decision with yes / no; "what comes first" does not work without.
  for (const z of moves)
    if (z.move === 'decision')
      for (const slot of ['yes', 'no'] as const)
        if (SLOT.test(z[slot])) {
          if (z.subtype === 'first') return { moves, errors: [t('Bei „was zuerst passiert“ braucht jeder Weg eine Überschrift (→ [...]:)', 'With “what comes first” every path needs a heading (→ [...]:)')] };
          z[slot] = slot === 'yes' ? t('ja', 'yes') : t('nein', 'no');
        }
  return { moves, errors: [] };
}

/** Story text with markers and indentation - as read() reads it back. */
export const asSourceText = (lines: Line[]): string => lines.map((z) => '  '.repeat(z.depth) + z.text).join('\n');
