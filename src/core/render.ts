import { ProcessIR, Node, PositionMap, Position } from './ir.js';
import { tx, Language } from './language.js';
import { sizeOf, laneBands, extent, edgePoints, wrap, TASK_CHARS, pagesCaption, SMALL, SMALL_LINE, extraLines, documents, DOC } from './layout.js';

/**
 * Draws the diagram - once as SVG, once as PDF. Both paths go
 * through the same geometry (`scene`), so that the PDF does not look different from
 * the preview. Drawing is done from the IR and positions, not from the XML: the
 * coordinates are already available anyway.
 *
 * Dimensions follow the symbol rulebook (docs/gestaltung/referenz/symbol-regelwerk,
 * REGEL in zeichne.js). Single colour, greys only.
 */

const MARGIN = 40;

type Prim =
  | { t: 'rect'; x: number; y: number; w: number; h: number; r?: number; fill?: string; stroke?: string; sw?: number }
  /** dash: dashed line (BPMN: non-interrupting). */
  | { t: 'circle'; cx: number; cy: number; r: number; fill?: string; stroke?: string; sw?: number; dash?: number[] }
  /** round: round ends and corners (symbols, arrows). dash: dotted (assignment). */
  | { t: 'poly'; pts: Position[]; closed: boolean; fill?: string; stroke?: string; sw?: number; round?: boolean; dash?: number[] }
  | { t: 'text'; x: number; y: number; s: string; size: number; anchor: 'start' | 'middle' | 'end'; fill?: string; red?: number; bold?: boolean };

export type RenderOptions = {
  /** Visible DRAFT mark. Meant for states with open points. */
  draft?: boolean;
  /** Node where the story continues: coloured frame, preview only. */
  here?: string;
  /** Without legend: the reading copy places it itself, at a fixed print size. */
  withoutLegend?: boolean;
};

export type Scene = { prims: Prim[]; width: number; height: number };

/** Colours and strokes from REGEL. */
const F = { line: '#262626', text: '#1a1a1a', gray: '#595959', lane: '#f7f7f7', head: '#ebebeb', white: '#ffffff', separator: '#bfbfbf' };
const S = { normal: 1.5, thick: 3.2, inner: 1.2, flow: 1.25, mark: 1.25, lane: 0.75, pool: 1.25 };
const STROKES = [4, 3];
/** Dotted: dot, spacing 3.5, round cap (assignment). */
const POINTS = [0, 3.5];
const FONT = 12.5;
/** Same as --accent in the UI; the preview replaces the colour via CSS. */
const HERE = '#1a4d8f';

/** All drawing commands in BPMN coordinates: x to the right, y downwards. */
export function scene(ir: ProcessIR, positions: PositionMap, opts: RenderOptions = {}): Scene {
  const ext = extent(positions, ir);
  const dx = MARGIN - ext.x + (ir.lanes.length ? 60 : 0);
  const dy = MARGIN - ext.y;
  const p = (id: string): Position | undefined => {
    const q = positions[id];
    return q && { x: q.x + dx, y: q.y + dy };
  };

  const prims: Prim[] = [];
  let width = ext.w + 2 * MARGIN + (ir.lanes.length ? 160 : 0);
  let height = ext.h + 2 * MARGIN;
  // Without lanes the legend spans across the content.
  let left = MARGIN;
  let boxWidth = width - 2 * MARGIN;
  let below = height - MARGIN;

  // Pool: header 30 wide, with the process name upright inside. Lanes with header 34,
  // every second one slightly grey.
  const bands = laneBands(ir, positions);
  if (bands.length) {
    const above = bands[0].y + dy;
    const boxHeight = bands.reduce((s, b) => s + b.height, 0);
    left = ext.x + dx - 90;
    boxWidth = ext.w + 190;
    below = above + boxHeight;
    prims.push({ t: 'rect', x: left, y: above, w: boxWidth, h: boxHeight, fill: F.white, stroke: F.line, sw: S.pool });
    prims.push({ t: 'rect', x: left, y: above, w: 30, h: boxHeight, fill: F.head, stroke: F.line, sw: S.pool });
    prims.push({ t: 'text', x: left + 19, y: above + boxHeight / 2, s: ir.name, size: 12, anchor: 'middle', red: -90, bold: true });
    bands.forEach((band, i) => {
      const x = left + 30;
      const y = band.y + dy;
      prims.push({ t: 'rect', x, y, w: boxWidth - 30, h: band.height, fill: i % 2 ? F.lane : F.white, stroke: F.line, sw: S.lane });
      prims.push({ t: 'rect', x, y, w: 34, h: band.height, fill: F.head, stroke: F.line, sw: S.lane });
      prims.push({ t: 'text', x: x + 21, y: y + band.height / 2, s: band.lane.name, size: 11.5, anchor: 'middle', red: -90, bold: true });
    });
  }
  // DRAFT sits behind arrows and shapes; it is inserted at the end, once the size is known.
  const draftOn = prims.length;

  for (const e of ir.edges) {
    const pts = edgePoints(ir, e, positions);
    if (!pts) continue;
    const v = pts.map((q) => ({ x: q.x + dx, y: q.y + dy }));
    prims.push({ t: 'poly', pts: v, closed: false, stroke: F.line, sw: S.flow, round: true });
    prims.push(arrowhead(v[v.length - 2], v[v.length - 1]));

    // Rulebook: at the start of the arrow, 8 spacing, grey.
    const caption = e.name ?? e.condition;
    if (caption) {
      const [a, b] = v;
      const vertical = Math.abs(b.x - a.x) < Math.abs(b.y - a.y);
      const leftward = !vertical && b.x < a.x;
      prims.push({
        t: 'text',
        x: vertical ? a.x + 7 : a.x + (leftward ? -8 : 8),
        y: vertical ? (b.y > a.y ? a.y + 15 : a.y - 8) : a.y - 8,
        s: caption,
        size: SMALL,
        anchor: leftward ? 'end' : 'start',
        fill: F.gray
      });
    }
  }

  for (const n of ir.nodes) {
    const q = p(n.id);
    if (!q) continue;
    const b = pagesCaption(ir, n, positions);
    // If an arrow leaves the wait downwards (return path), the name would lie centred on it.
    const downward = n.kind === 'wait' && ir.edges.some((e) => edgePoints(ir, e, positions)?.some((pt) => {
      const raw = positions[n.id];
      return Math.abs(pt.x - (raw.x + 18)) < 1 && Math.abs(pt.y - (raw.y + 36)) < 1;
    }));
    // Draw before the node: captions stay readable.
    if (n.id === opts.here) {
      const s = sizeOf(n);
      prims.push({ t: 'rect', x: q.x - 7, y: q.y - 7, w: s.w + 14, h: s.h + 14, r: 10, stroke: HERE, sw: 2.5 });
    }
    prims.push(...nodes(n, q, downward, ir.language));
    for (const d of documents(n, q)) prims.push(...documentName(d.cx, d.above, q.y + sizeOf(n).h, d.lines));
    // Exception right-aligned next to the circle, question centred above the diamond (box from layout.ts).
    if (b)
      b.lines.forEach((z, i) =>
        prims.push({
          t: 'text',
          x: b.x + dx + (n.kind === 'gateway' ? b.w / 2 : b.w),
          y: b.y + dy + (i + 1) * SMALL_LINE - 3,
          s: z,
          size: SMALL,
          anchor: n.kind === 'gateway' ? 'middle' : 'end'
        })
      );
  }

  // Legend below the diagram, only for symbols that occur in it. Row 60.
  // ponytail: beyond 12 entries simply another row is added; merging families only once that happens.
  const entries = opts.withoutLegend ? [] : legend(ir);
  if (entries.length) {
    // Rulebook: 4 columns. At least 300 per column (90 characters in 2 lines); a narrow
    // draft gets fewer columns instead of shrinking in a wide legend.
    const COLUMNS = Math.max(2, Math.min(4, Math.floor(boxWidth / 300)));
    if (boxWidth < COLUMNS * 300) {
      boxWidth = COLUMNS * 300;
      width = Math.max(width, left + boxWidth + MARGIN);
    }
    const sw = boxWidth / COLUMNS;
    const ly = below + 30;
    prims.push({ t: 'poly', pts: [{ x: left, y: ly - 8 }, { x: left + boxWidth, y: ly - 8 }], closed: false, stroke: F.separator, sw: 0.75 });
    prims.push({ t: 'text', x: left, y: ly + 12, s: tx(ir.language, 'Legende', 'Legend'), size: 12, anchor: 'start', bold: true });
    prims.push(...legendEntries(entries, left, ly + 30, sw, COLUMNS));
    height = ly + 30 + Math.ceil(entries.length / COLUMNS) * 60 + 4;
  } else height = Math.max(height, below + MARGIN);

  if (opts.draft)
    prims.splice(draftOn, 0, {
      t: 'text',
      x: width / 2,
      y: height / 2 + 28,
      s: tx(ir.language, 'ENTWURF', 'DRAFT'),
      size: 84,
      anchor: 'middle',
      fill: '#e3e3e3',
      red: -12,
      bold: true
    });

  return { prims, width, height };
}

type Entry = { chars: (x: number, y: number) => Prim[]; word: string; text: string };

/** Entries in a grid from (left, top): symbol field 44 x 36, term 11.5 bold, text 10.5 grey, row 60. */
function legendEntries(entries: Entry[], left: number, above: number, sw: number, columns: number): Prim[] {
  return entries.flatMap((e, i) => {
    const x = left + (i % columns) * sw;
    const y = above + Math.floor(i / columns) * 60;
    return [
      ...e.chars(x + 22, y + 16),
      { t: 'text' as const, x: x + 54, y: y + 9, s: e.word, size: 11.5, anchor: 'start' as const, bold: true },
      ...wrap(e.text, Math.floor((sw - 66) / 5.3)).map((s, j) => ({ t: 'text' as const, x: x + 54, y: y + 24 + j * 13, s, size: 10.5, anchor: 'start' as const, fill: F.gray }))
    ];
  });
}

/** Shrink shapes (legend). Stroke widths stay, as in the rulebook. */
function scale(prims: Prim[], k: number, c: Position): Prim[] {
  const X = (v: number) => c.x + (v - c.x) * k;
  const Y = (v: number) => c.y + (v - c.y) * k;
  return prims.map((p) =>
    p.t === 'rect' ? { ...p, x: X(p.x), y: Y(p.y), w: p.w * k, h: p.h * k, r: p.r && p.r * k }
    : p.t === 'circle' ? { ...p, cx: X(p.cx), cy: Y(p.cy), r: p.r * k }
    : p.t === 'poly' ? { ...p, pts: p.pts.map((q) => ({ x: X(q.x), y: Y(q.y) })) }
    : { ...p, x: X(p.x), y: Y(p.y), size: p.size * k }
  );
}

/**
 * For laypeople: what each symbol is called (terms as in the story text) and what
 * it means, at most 90 characters. Symbols via nodes(), so that they look exactly
 * as in the diagram. Order by shape family: start, task,
 * diamond, wait/exception, end, lane, arrow.
 */
function legend(ir: ProcessIR): Entry[] {
  const t = (de: string, en: string) => tx(ir.language, de, en);
  const has = (f: (n: Node) => boolean) => ir.nodes.some(f);
  // Symbol centred on (x, y), at 75 % (diamond 68 %).
  const form = (n: Partial<Node>, k = 0.75) => (x: number, y: number) => {
    const s = sizeOf(n as Node);
    return scale(nodes({ name: '', ...n } as Node, { x: x - s.w / 2, y: y - s.h / 2 }), k, { x, y });
  };
  const diamond = (n: Partial<Node>) => form(n, 0.68);
  const all: [boolean, Entry][] = [
    [has((n) => n.kind === 'start' && !n.subtype), {
      chars: form({ kind: 'start' }),
      word: t('Start', 'Start'),
      text: t('Hier beginnt der Ablauf, mit dem Auslöser.', 'Where the process begins: the trigger.')
    }],
    [has((n) => n.kind === 'start' && n.subtype === 'message'), {
      chars: form({ kind: 'start', subtype: 'message' }),
      word: t('Start mit Nachricht', 'Start with a message'),
      text: t('Der Ablauf beginnt, wenn etwas ankommt: Brief, Mail, Antrag, Anruf.', 'The process begins when something arrives: letter, mail, application, call.')
    }],
    [has((n) => n.kind === 'start' && n.subtype === 'time'), {
      chars: form({ kind: 'start', subtype: 'time' }),
      word: t('Start zum Zeitpunkt', 'Start at a point in time'),
      text: t('Der Ablauf beginnt zu einer Zeit, z. B. jeden Monatsersten.', 'The process begins at a set time, e.g. on the first of each month.')
    }],
    [has((n) => n.kind === 'start' && n.subtype === 'condition'), {
      chars: form({ kind: 'start', subtype: 'condition' }),
      word: t('Start, sobald ein Zustand eintritt', 'Start once a condition holds'),
      text: t('Der Ablauf beginnt, sobald etwas zutrifft, z. B. Lager unter Mindestbestand.', 'The process begins once something holds, e.g. stock below minimum.')
    }],
    [has((n) => n.kind === 'step'), {
      chars: (x, y) => [{ t: 'rect', x: x - 21, y: y - 14, w: 42, h: 28, r: 6, fill: F.white, stroke: F.line, sw: S.normal }],
      word: t('Schritt', 'Step'),
      text: t('Eine Tätigkeit. Die Bahn sagt, wer sie erledigt.', 'An activity. The lane shows who does it.')
    }],
    [has((n) => n.kind === 'gateway' && n.gatewayType === 'exclusive'), {
      chars: diamond({ kind: 'gateway', gatewayType: 'exclusive' }),
      word: t('Entscheidung', 'Decision'),
      text: t('Mit Frage: genau ein Weg geht weiter. Ohne Frage: Wege laufen zusammen.', 'With a question: exactly one path continues. Without: paths merge.')
    }],
    [has((n) => n.kind === 'gateway' && n.gatewayType === 'event'), {
      chars: diamond({ kind: 'gateway', gatewayType: 'event' }),
      word: t('Was zuerst passiert', 'What comes first'),
      text: t('Es wird gewartet. Weiter geht der Weg, dessen Ereignis zuerst eintritt.', 'There is a wait. The path whose event happens first continues.')
    }],
    [has((n) => n.kind === 'gateway' && n.gatewayType === 'parallel'), {
      chars: diamond({ kind: 'gateway', gatewayType: 'parallel' }),
      word: t('Gleichzeitig', 'In parallel'),
      text: t('Alle Wege laufen gleichzeitig los. Laufen sie zusammen, wird auf alle gewartet.', 'All paths start at the same time. Where they merge, all are awaited.')
    }],
    [has((n) => n.kind === 'wait' && n.subtype === 'message'), {
      chars: form({ kind: 'wait', subtype: 'message' }),
      word: t('Warten auf Nachricht', 'Wait for a message'),
      text: t('Es geht erst weiter, wenn etwas ankommt: Antwort, Lieferung, Unterlagen.', 'Continues only when something arrives: reply, delivery, documents.')
    }],
    [has((n) => n.kind === 'wait' && n.subtype === 'time'), {
      chars: form({ kind: 'wait', subtype: 'time' }),
      word: t('Warten auf Zeit', 'Wait for time'),
      text: t('Es geht erst nach einer Zeit weiter oder zu einem Termin.', 'Continues only after some time or at a set date.')
    }],
    [has((n) => n.kind === 'wait' && n.subtype === 'condition'), {
      chars: form({ kind: 'wait', subtype: 'condition' }),
      word: t('Warten auf Zustand', 'Wait for a condition'),
      text: t('Es geht erst weiter, wenn etwas zutrifft: z. B. Lager wieder voll.', 'Continues only once something holds: e.g. stock refilled.')
    }],
    [has((n) => n.kind === 'exception' && n.trigger === 'error'), {
      chars: form({ kind: 'exception', trigger: 'error' }),
      word: t('Ausnahme', 'Exception'),
      text: t('Am Schritt geht etwas schief; dann geht es auf diesem Weg weiter.', 'Something goes wrong at the step; then this path is taken.')
    }],
    [has((n) => n.kind === 'exception' && n.trigger === 'deadline' && !n.keepsRunning), {
      chars: form({ kind: 'exception', trigger: 'deadline' }),
      word: t('Frist abgelaufen', 'Deadline passed'),
      text: t('Der Schritt dauert zu lange; dann geht es auf diesem Weg weiter.', 'The step takes too long; then this path is taken.')
    }],
    [has((n) => n.kind === 'exception' && n.trigger === 'message' && !n.keepsRunning), {
      chars: form({ kind: 'exception', trigger: 'message' }),
      word: t('Nachricht dazwischen', 'Message in between'),
      text: t('Während des Schritts kommt etwas an; er bricht ab, es geht hier weiter.', 'Something arrives during the step; it stops, this path is taken.')
    }],
    [has((n) => n.kind === 'exception' && n.trigger === 'deadline' && !!n.keepsRunning), {
      chars: form({ kind: 'exception', trigger: 'deadline', keepsRunning: true }),
      word: t('Frist, Schritt läuft weiter', 'Deadline, step continues'),
      text: t('Gestrichelt: Der Schritt läuft weiter, dieser Weg kommt dazu (z. B. Erinnerung).', 'Dashed: the step continues, this path is added (e.g. reminder).')
    }],
    [has((n) => n.kind === 'exception' && n.trigger === 'message' && !!n.keepsRunning), {
      chars: form({ kind: 'exception', trigger: 'message', keepsRunning: true }),
      word: t('Nachricht, Schritt läuft weiter', 'Message, step continues'),
      text: t('Gestrichelt: Der Schritt läuft weiter, dieser Weg kommt dazu (z. B. Rückfrage).', 'Dashed: the step continues, this path is added (e.g. query).')
    }],
    [has((n) => n.kind === 'end' && !n.subtype), {
      chars: form({ kind: 'end' }),
      word: t('Ende', 'End'),
      text: t('Hier ist der Ablauf zu Ende.', 'The process ends here.')
    }],
    [has((n) => n.kind === 'end' && n.subtype === 'message'), {
      chars: form({ kind: 'end', subtype: 'message' }),
      word: t('Ende mit Nachricht', 'End with a message'),
      text: t('Zum Schluss geht etwas raus: Bescheid, Bestätigung, Antwort.', 'Something is sent at the end: notice, confirmation, reply.')
    }],
    [has((n) => n.kind === 'end' && n.subtype === 'cancel'), {
      chars: form({ kind: 'end', subtype: 'cancel' }),
      word: t('Alles abbrechen', 'Stop everything'),
      text: t('Hier endet alles, auch was gleichzeitig noch läuft.', 'Everything ends here, including what still runs in parallel.')
    }],
    [ir.lanes.length > 0, {
      chars: (x, y) => [
        { t: 'rect', x: x - 21, y: y - 13, w: 42, h: 26, fill: F.lane, stroke: F.line, sw: S.lane },
        { t: 'rect', x: x - 21, y: y - 13, w: 8, h: 26, fill: F.head, stroke: F.line, sw: S.lane }
      ],
      word: t('Bahn', 'Lane'),
      text: t('Ein Streifen je beteiligter Stelle: wer welche Schritte erledigt.', 'One strip per party involved: who does which steps.')
    }],
    [ir.edges.length > 0, {
      chars: (x, y) => {
        const a = { x: x - 21, y };
        const b = { x: x + 21, y };
        return [{ t: 'poly', pts: [a, b], closed: false, stroke: F.line, sw: S.flow }, arrowhead(a, b)];
      },
      word: t('Pfeil', 'Arrow'),
      text: t('Die Reihenfolge: als Nächstes kommt, worauf der Pfeil zeigt.', 'The order: next comes what the arrow points to.')
    }],
    [has((n) => n.kind === 'step' && !!n.details?.documents?.length), {
      chars: (x, y) => scale(documentName(x, y - 19, y - 19, []), 0.75, { x, y }),
      word: t('Dokument', 'Document'),
      text: t('Eine Unterlage, die ein Schritt braucht oder erzeugt. Die gepunktete Linie zeigt, welcher.', 'A document a step needs or produces. The dotted line shows which step.')
    }]
  ];
  return all.filter(([yes]) => yes).map(([, e]) => e);
}

// --- Symbols in a 16 field, centred on (x, y). filled: filled = trigger. ---

const strokeStyle = { stroke: F.line, sw: S.mark, round: true } as const;
const line = (a: Position, b: Position, sw: number = S.mark): Prim => ({ t: 'poly', pts: [a, b], closed: false, stroke: F.line, sw, round: true });

function brief(x: number, y: number, filled = false): Prim[] {
  const l = x - 8;
  const o = y - 5.5;
  return [
    { t: 'rect', x: l, y: o, w: 16, h: 11, fill: filled ? F.line : undefined, stroke: F.line, sw: S.mark },
    { t: 'poly', pts: [{ x: l, y: o }, { x, y: o + 11 * 0.55 }, { x: l + 16, y: o }], closed: false, ...strokeStyle, stroke: filled ? F.white : F.line }
  ];
}

function clock(x: number, y: number): Prim[] {
  const r = 7.5;
  const strokes = [0, 90, 180, 270].map((g) => {
    const a = (g * Math.PI) / 180;
    return line({ x: x + Math.sin(a) * r * 0.72, y: y - Math.cos(a) * r * 0.72 }, { x: x + Math.sin(a) * r, y: y - Math.cos(a) * r });
  });
  return [
    { t: 'circle', cx: x, cy: y, r, stroke: F.line, sw: S.mark },
    ...strokes,
    { t: 'poly', pts: [{ x, y: y - r * 0.55 }, { x, y }, { x: x + r * 0.42, y: y + r * 0.25 }], closed: false, ...strokeStyle }
  ];
}

/** Condition: sheet 11 x 14 with lines, without dog-ear. */
function sheet(x: number, y: number): Prim[] {
  const l = x - 5.5;
  const o = y - 7;
  return [
    { t: 'rect', x: l, y: o, w: 11, h: 14, stroke: F.line, sw: S.mark },
    ...[0.25, 0.45, 0.65, 0.85].map((f) => line({ x: l + 2.5, y: o + 14 * f }, { x: l + 8.5, y: o + 14 * f }, 1))
  ];
}

function pentagon(x: number, y: number, k: number): Prim {
  const r = 7 * k;
  const pts = [0, 1, 2, 3, 4].map((i) => {
    const a = ((-90 + i * 72) * Math.PI) / 180;
    return { x: x + Math.cos(a) * r, y: y + 0.6 * k + Math.sin(a) * r };
  });
  return { t: 'poly', pts, closed: true, ...strokeStyle };
}

/**
 * Document: sheet 30 x 38 with dog-ear 9, top edge centred on (cx, above), dotted
 * assignment up to the task (origin), caption 14 below the sheet. No arrowhead:
 * whether the task needs or produces it is not in the extra details.
 */
function documentName(cx: number, above: number, origin: number, lines: string[]): Prim[] {
  const l = cx - DOC.w / 2, r = l + DOC.w, u = above + DOC.h, o = DOC.fold;
  return [
    ...(origin < above ? [{ t: 'poly' as const, pts: [{ x: cx, y: origin }, { x: cx, y: above }], closed: false, stroke: F.line, sw: S.normal, round: true, dash: POINTS }] : []),
    { t: 'poly', pts: [{ x: l, y: above }, { x: r - o, y: above }, { x: r, y: above + o }, { x: r, y: u }, { x: l, y: u }], closed: true, fill: F.white, stroke: F.line, sw: S.normal },
    { t: 'poly', pts: [{ x: r - o, y: above }, { x: r - o, y: above + o }, { x: r, y: above + o }], closed: false, stroke: F.line, sw: S.inner, round: true },
    ...lines.map((s, i) => ({ t: 'text' as const, x: cx, y: u + 14 + i * SMALL_LINE, s, size: SMALL, anchor: 'middle' as const }))
  ];
}

function nodes(n: Node, q: Position, nameRight = false, language?: Language): Prim[] {
  const s = sizeOf(n);
  const m = { x: q.x + s.w / 2, y: q.y + s.h / 2 };

  if (n.kind === 'start' || n.kind === 'end' || n.kind === 'exception' || n.kind === 'wait') {
    const dash = n.kind === 'exception' && n.keepsRunning ? { dash: STROKES } : {};
    const r = s.w / 2;
    const out: Prim[] = [{ t: 'circle', cx: m.x, cy: m.y, r, fill: F.white, stroke: F.line, sw: n.kind === 'end' ? S.thick : S.normal, ...dash }];
    // Intermediate event (wait, exception): double circle, spacing 3.5.
    if (n.kind === 'exception' || n.kind === 'wait') out.push({ t: 'circle', cx: m.x, cy: m.y, r: 14.5, stroke: F.line, sw: S.inner, ...dash });
    const subtype = n.kind === 'exception' ? n.trigger : n.subtype;
    if (subtype === 'deadline' || subtype === 'time') out.push(...clock(m.x, m.y));
    if (subtype === 'condition') out.push(...sheet(m.x, m.y));
    // Empty envelope = something arrives (wait), filled = something goes out (trigger).
    if (subtype === 'message') out.push(...brief(m.x, m.y, n.kind === 'end'));
    if (subtype === 'cancel') out.push({ t: 'circle', cx: m.x, cy: m.y, r: r * 0.55, fill: F.line });
    // Name below, 14 under the shape; scene() captions the exception next to it.
    if (n.name && n.kind !== 'exception')
      wrap(n.name, 18).forEach((z, i) =>
        out.push({ t: 'text', x: nameRight ? m.x + 6 : m.x, y: q.y + s.h + 14 + i * SMALL_LINE, s: z, size: SMALL, anchor: nameRight ? 'start' : 'middle' })
      );
    return out;
  }

  if (n.kind === 'gateway') {
    const h = s.w / 2;
    const out: Prim[] = [
      { t: 'poly', pts: [{ x: m.x, y: m.y - h }, { x: m.x + h, y: m.y }, { x: m.x, y: m.y + h }, { x: m.x - h, y: m.y }], closed: true, fill: F.white, stroke: F.line, sw: S.normal }
    ];
    if (n.gatewayType === 'event')
      // Double circle r 11 / 9 with pentagon: waiting for whichever comes first.
      out.push(
        { t: 'circle', cx: m.x, cy: m.y, r: 11, stroke: F.line, sw: S.inner },
        { t: 'circle', cx: m.x, cy: m.y, r: 9, stroke: F.line, sw: S.inner },
        pentagon(m.x, m.y, 0.72)
      );
    else if (n.gatewayType === 'parallel')
      out.push(line({ x: m.x, y: m.y - 11 }, { x: m.x, y: m.y + 11 }, 2.6), line({ x: m.x - 11, y: m.y }, { x: m.x + 11, y: m.y }, 2.6));
    else out.push(line({ x: m.x - 8, y: m.y - 8 }, { x: m.x + 8, y: m.y + 8 }, 2.6), line({ x: m.x + 8, y: m.y - 8 }, { x: m.x - 8, y: m.y + 8 }, 2.6));
    return out;
  }

  // Task: text 12.5 centred, line spacing 15, below it grey system and deadline (10.5).
  // Wrapping from layout.ts, where the box height depends on it. Name and extras centred together.
  const z = wrap(n.name, TASK_CHARS);
  const k = extraLines(n, language);
  const above = m.y - (z.length * 15 + (k.length ? 4 + k.length * SMALL_LINE : 0)) / 2;
  return [
    { t: 'rect', x: q.x, y: q.y, w: s.w, h: s.h, r: 9, fill: F.white, stroke: F.line, sw: S.normal },
    ...z.map((s, i) => ({ t: 'text' as const, x: m.x, y: above + 12 + i * 15, s, size: FONT, anchor: 'middle' as const })),
    ...k.map((s, i) => ({ t: 'text' as const, x: m.x, y: above + z.length * 15 + 4 + 9.5 + i * SMALL_LINE, s, size: SMALL, anchor: 'middle' as const, fill: F.gray }))
  ];
}

/** Filled arrowhead 9 x 7.2. */
function arrowhead(a: Position, b: Position): Prim {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const l = 9;
  const w = 3.6;
  return {
    t: 'poly',
    pts: [b, { x: b.x - l * ux + w * uy, y: b.y - l * uy - w * ux }, { x: b.x - l * ux - w * uy, y: b.y - l * uy + w * ux }],
    closed: true,
    fill: F.line
  };
}

// --- SVG ---------------------------------------------------------------

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function toSvg(ir: ProcessIR, positions: PositionMap, opts: RenderOptions = {}): string {
  const { prims, width, height } = scene(ir, positions, opts);
  const body = prims.map(svgPrim).join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width)}" height="${Math.round(height)}" viewBox="0 0 ${Math.round(width)} ${Math.round(height)}" font-family="Helvetica, Arial, sans-serif">
  <rect width="100%" height="100%" fill="#ffffff"/>
  ${body}
</svg>
`;
}

function svgPrim(p: Prim): string {
  const stroke = (x: { stroke?: string; sw?: number; fill?: string }) =>
    `fill="${x.fill ?? 'none'}"${x.stroke ? ` stroke="${x.stroke}" stroke-width="${x.sw ?? 1}"` : ''}`;

  if (p.t === 'rect')
    // Frame "the story continues here" (preview only): the UI determines the colour.
    return `<rect x="${round(p.x)}" y="${round(p.y)}" width="${round(p.w)}" height="${round(p.h)}"${p.r ? ` rx="${round(p.r)}"` : ''} ${stroke(p)}${p.stroke === HERE ? ` class="here" style="stroke:var(--accent,${HERE})"` : ''}/>`;
  if (p.t === 'circle') return `<circle cx="${round(p.cx)}" cy="${round(p.cy)}" r="${round(p.r)}" ${stroke(p)}${p.dash ? ` stroke-dasharray="${p.dash.join(' ')}"` : ''}/>`;
  if (p.t === 'poly') {
    const pts = p.pts.map((q) => `${round(q.x)},${round(q.y)}`).join(' ');
    return `<${p.closed ? 'polygon' : 'polyline'} points="${pts}" ${stroke(p)}${p.round ? ' stroke-linecap="round" stroke-linejoin="round"' : ''}${p.dash ? ` stroke-dasharray="${p.dash.join(' ')}"` : ''}/>`;
  }
  const red = p.red ? ` transform="rotate(${p.red} ${round(p.x)} ${round(p.y)})"` : '';
  return `<text x="${round(p.x)}" y="${round(p.y)}" font-size="${p.size}"${p.bold ? ' font-weight="700"' : ''} text-anchor="${p.anchor}" fill="${p.fill ?? F.text}"${red}>${esc(p.s)}</text>`;
}


// --- PDF: reading copy --------------------------------------------------

/**
 * Reading copy following `docs/gestaltung/referenz/leseexemplar` (dimensions in pt):
 * page 1 diagram and legend (A4 landscape, wide diagrams A3 landscape), from page 2
 * the story text (A4 portrait). The diagram comes from the same `scene` as the
 * preview. Font only Helvetica / Helvetica-Bold (WinAnsi).
 */
export type PdfOptions = RenderOptions & {
  /** Story text with markers (`[Schritt]`, `[@Stelle]` ...), two spaces per depth. Otherwise ir.description. */
  told?: string;
};

const PAGE = { a4portrait: [595, 842], a4landscape: [842, 595], a3landscape: [1191, 842] } as const;
const MIN_SCALE = 0.56; // task text 12.5 x 0.56 = 7 pt
const OBJ: Record<string, string> = { '': '#d4ebff', '@': '#ccf3dd', '#': '#f1e0ff', '+': '#ffe1c7', '!': '#ffdddb', '?': '#fbedb8' };

export async function toPdf(ir: ProcessIR, positions: PositionMap, opts: PdfOptions = {}): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb, degrees, LineCapStyle, pushGraphicsState, popGraphicsState, rectangle, clip, endPath } = await import('pdf-lib');
  type Page = import('pdf-lib').PDFPage;
  const t = (de: string, en: string) => tx(ir.language, de, en);

  const doc = await PDFDocument.create();
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  // Helvetica knows only WinAnsi. A foreign character would make drawText throw -
  // and thus the whole move fail. Hence: drop the accent, else substitute.
  // ponytail: Cyrillic, CJK etc. become "?"; if that is needed, embed a TTF (fontkit).
  const can = new Set(normal.getCharacterSet());
  const FALLBACK: Record<string, string> = { '→': '->', '←': '<-', '⇒': '=>', '✓': 'v', '≥': '>=', '≤': '<=' };
  const winAnsi = (s: string) =>
    [...s]
      .map((z) => {
        if (can.has(z.codePointAt(0)!)) return z;
        if (FALLBACK[z]) return FALLBACK[z];
        const base = z.normalize('NFKD').replace(/\p{M}/gu, '');
        return [...base].every((b) => can.has(b.codePointAt(0)!)) && base ? base : '?';
      })
      .join('');
  const col = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  };
  const color = (hex?: string) => (hex ? col(hex) : undefined);
  const boxWidth = (s: string, pt: number, f = false) => (f ? bold : normal).widthOfTextAtSize(winAnsi(s), pt);

  /** Text in page coordinates from the top (like SVG). */
  const write = (page: Page, s: string, x: number, y: number, size: number, o: { bold?: boolean; color?: string; anchor?: 'start' | 'end' } = {}) => {
    const w = winAnsi(s);
    const f = o.bold ? bold : normal;
    page.drawText(w, { x: o.anchor === 'end' ? x - f.widthOfTextAtSize(w, size) : x, y: page.getHeight() - y, size, font: f, color: col(o.color ?? F.text) });
  };
  const strokeStyle = (page: Page, x1: number, y1: number, x2: number, y2: number, sw = 0.5, c = F.separator) =>
    page.drawLine({ start: { x: x1, y: page.getHeight() - y1 }, end: { x: x2, y: page.getHeight() - y2 }, thickness: sw, color: col(c) });
  const area = (page: Page, x: number, y: number, w: number, h: number, c: string) =>
    page.drawRectangle({ x, y: page.getHeight() - y - h, width: w, height: h, color: col(c) });

  /** Drawing commands of the scene onto a page: shifted by (ox, oy), scaled by k (strokes too). */
  const paint = (page: Page, prims: Prim[], ox: number, oy: number, k: number) => {
    const H = page.getHeight();
    const X = (v: number) => ox + v * k;
    const Y = (v: number) => H - (oy + v * k);
    // drawSvgPath flips y itself and also scales the stroke width: path in scene coordinates.
    const path = (d: string, fill?: string, stroke?: string, sw = 0) =>
      page.drawSvgPath(d, { x: ox, y: H - oy, scale: k, color: color(fill), borderColor: color(stroke), borderWidth: stroke ? sw : 0 });
    for (const p of prims) {
      if (p.t === 'rect') {
        const { x, y, w, h } = p;
        const r = Math.min(p.r ?? 0, w / 2, h / 2);
        path(
          r
            ? `M ${x + r} ${y} H ${x + w - r} A ${r} ${r} 0 0 1 ${x + w} ${y + r} V ${y + h - r} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} H ${x + r} A ${r} ${r} 0 0 1 ${x} ${y + h - r} V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`
            : `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`,
          p.fill, p.stroke, p.sw
        );
      } else if (p.t === 'circle')
        page.drawCircle({ x: X(p.cx), y: Y(p.cy), size: p.r * k, color: color(p.fill), borderColor: color(p.stroke), borderWidth: (p.sw ?? 0) * k, borderDashArray: p.dash?.map((d) => d * k) });
      else if (p.t === 'poly') {
        if (p.closed) path(`M ${p.pts.map((q) => `${q.x} ${q.y}`).join(' L ')} Z`, p.fill, p.stroke, p.sw);
        else
          for (let i = 0; i < p.pts.length - 1; i++)
            page.drawLine({
              start: { x: X(p.pts[i].x), y: Y(p.pts[i].y) },
              end: { x: X(p.pts[i + 1].x), y: Y(p.pts[i + 1].y) },
              thickness: (p.sw ?? 1) * k,
              color: col(p.stroke ?? F.line),
              lineCap: p.round ? LineCapStyle.Round : undefined,
              dashArray: p.dash?.map((d) => d * k)
            });
      } else {
        // SVG rotates clockwise, PDF counter-clockwise - hence the sign.
        // Rotation is around the anchor point: a centred text has to move back by half
        // its width ALONG the rotated direction, not simply to the left.
        const s = winAnsi(p.s);
        const f = p.bold ? bold : normal;
        const size = p.size * k;
        const arc = ((p.red ? -p.red : 0) * Math.PI) / 180;
        const half = f.widthOfTextAtSize(s, size) * (p.anchor === 'middle' ? 0.5 : p.anchor === 'end' ? 1 : 0);
        page.drawText(s, {
          x: X(p.x) - Math.cos(arc) * half,
          y: Y(p.y) - Math.sin(arc) * half,
          size,
          font: f,
          color: col(p.fill ?? F.text),
          rotate: degrees((arc * 180) / Math.PI)
        });
      }
    }
  };

  // ---------- Diagram: A4 landscape, A3 landscape, too wide for A3 on two A3 pages side by side ----------
  const RQ = 28;
  const d = scene(ir, positions, { draft: opts.draft, withoutLegend: true });
  const useA3 = PAGE.a3landscape[0] - 2 * RQ;
  // ponytail: even two pages only reach ~4050 wide; beyond that it gets smaller than 0.56. Three pages only once that happens.
  const diagPages = d.width * MIN_SCALE > useA3 ? 2 : 1;
  const [w1, h1] = diagPages === 1 && d.width * MIN_SCALE <= PAGE.a4landscape[0] - 2 * RQ ? PAGE.a4landscape : PAGE.a3landscape;
  const use = w1 - 2 * RQ;
  const entries = legend(ir);
  const LK = 0.9;
  const legHeight = entries.length ? 26 + 30 + Math.ceil(entries.length / 4) * 60 * LK : 0;
  const y0 = RQ + 80;
  // Width determines the scale; a very tall diagram is additionally shrunk so that the legend fits below it.
  const m = Math.min(1, (diagPages * use) / d.width, (h1 - RQ - 24 - y0 - legHeight) / d.height);
  for (let i = 0; i < diagPages; i++) {
    const s = doc.addPage([w1, h1]);
    // Each page shows its strip; what lies beside it is cut off by the frame.
    s.pushOperators(pushGraphicsState(), rectangle(RQ, 0, use, h1), clip(), endPath());
    paint(s, d.prims, RQ - (i * use), y0, m);
    s.pushOperators(popGraphicsState());
    // Legend on every diagram page: each half should be readable on its own.
    if (entries.length) {
      const ly = y0 + d.height * m + 26;
      strokeStyle(s, RQ, ly, w1 - RQ, ly);
      write(s, t('Legende', 'Legend'), RQ, ly + 18, 10, { bold: true });
      paint(s, legendEntries(entries, 0, 0, use / 4 / LK, 4), RQ, ly + 30, LK);
    }
  }
  const page1 = doc.getPage(diagPages - 1);

  // ---------- from page 2: story text ----------
  const [w2, h2] = PAGE.a4portrait;
  const R = 42;
  const PT = 9.5;
  const ZA = 18;
  const X0 = R + 30;
  const INDENT = 16;
  const pages2: Page[] = [];
  let page = page1;
  let y = 0;
  const newPage = () => {
    page = doc.addPage([w2, h2]);
    pages2.push(page);
    y = R + 92;
  };
  // Room up to above the footer; otherwise a new page.
  const room = (need: number) => {
    if (!pages2.length || y + need > h2 - R - 30) newPage();
  };
  const source = opts.told ?? ir.description;
  if (source) {
    source.split('\n').forEach((raw, n) => {
      const depth = Math.floor((raw.length - raw.trimStart().length) / 2);
      room(ZA);
      write(page, String(n + 1), R + 16, y, 7.5, { color: F.gray, anchor: 'end' });
      const beginning = X0 + depth * INDENT;
      let x = beginning;
      const drawnLines = () => {
        for (let s = 1; s <= depth; s++) strokeStyle(page, X0 + s * INDENT - 9, y - 11, X0 + s * INDENT - 9, y + 7, 0.75);
      };
      drawnLines();
      // Long lines: wrap at the piece or word, continue indented.
      const fits = (bw: number) => {
        if (x > beginning && x + bw > w2 - R) {
          y += ZA;
          room(0);
          drawnLines();
          x = beginning + 8;
        }
      };
      for (const st of pieces(raw.trim())) {
        if (st.subtype === 'arrow') {
          // WinAnsi has no →: as a line with an open arrowhead.
          fits(12);
          strokeStyle(page, x + 1, y - 3.2, x + 9, y - 3.2, 0.8, F.text);
          strokeStyle(page, x + 6.5, y - 5.6, x + 9.6, y - 3.2, 0.8, F.text);
          strokeStyle(page, x + 9.6, y - 3.2, x + 6.5, y - 0.8, 0.8, F.text);
          x += 12;
        } else if (st.subtype === 'obj') {
          const bw = boxWidth(st.s, PT);
          fits(bw + 6);
          area(page, x + 0.5, y - 9, bw + 5, 12.5, OBJ[st.o]);
          write(page, st.s, x + 3, y, PT);
          x += bw + 6;
        } else
          for (const word of st.s.split(/(?<= )/)) {
            const bw = boxWidth(word, PT, st.subtype === 'sw');
            fits(bw);
            write(page, word, x, y, PT, { bold: st.subtype === 'sw' });
            x += bw;
          }
      }
      y += ZA;
    });

    // Reading aid: eight signal words in two columns, below them the markers.
    y += 18;
    room(230);
    strokeStyle(page, R, y, w2 - R, y);
    write(page, t('So liest man den Text', 'How to read the text'), R, y + 22, 11, { bold: true });
    const help = ir.language === 'en'
      ? [['IT STARTS', 'How the process begins, and with whom.'], ['IF … ELSE', 'Two paths. Exactly one is taken.'],
         ['IN CASE OF', 'Something can interrupt the step before.'], ['WAIT FOR', 'The process stops until something arrives.'],
         ['CONTINUE AT', 'The path jumps back to a step.'], ['BACK ON THE PATH', 'A postponed path continues here.'],
         ['END', 'This path ends here.'], [t('Einrückung', 'Indent'), 'A side path. Afterwards it continues on the left.']]
      : [['ES BEGINNT', 'So fängt der Ablauf an, und bei wem.'], ['WENN … SONST', 'Zwei Wege. Genau einer wird gegangen.'],
         ['FALLS', 'Am Schritt davor kann etwas dazwischenkommen.'], ['WARTEN AUF', 'Der Ablauf steht, bis etwas ankommt.'],
         ['WEITER BEI', 'Der Weg springt zurück zu einem Schritt.'], ['WEITER AUF DEM WEG', 'Ein zurückgestellter Weg geht hier weiter.'],
         ['ENDE', 'Hier hört dieser Weg auf.'], ['Einrückung', 'Ein Nebenweg. Danach geht es links weiter.']];
    help.forEach(([a, b], i) => {
      const xx = [R, R + 262][i % 2];
      const yy = y + 46 + Math.floor(i / 2) * 30;
      write(page, a, xx, yy, 8.5, { bold: true });
      write(page, b, xx, yy + 12, 8.5, { color: F.gray });
    });
    y += 46 + 4 * 30 + 10;
    write(page, t('Markierungen', 'Markings'), R, y, 8.5, { bold: true });
    let x = R + 70;
    for (const [k, n] of [['', t('Schritt', 'Step')], ['@', t('Stelle', 'Role')], ['#', 'System'], ['+', t('Dokument', 'Document')], ['!', t('Frist', 'Deadline')], ['?', t('Frage', 'Question')]]) {
      const bw = boxWidth(n, 8.5);
      area(page, x, y - 8.5, bw + 6, 11.5, OBJ[k]);
      write(page, n, x + 3, y, 8.5);
      x += bw + 16;
    }
    write(page, t('Im Schwarz-Weiß-Druck bleiben die Töne als helle Flächen sichtbar.', 'In black-and-white print the tones remain visible as light areas.'), R + 70, y + 18, 8, { color: F.gray });
  }

  // ---------- Header and footer on every page, now with the page count known ----------
  const all = doc.getPages();
  const state = new Date().toLocaleDateString(ir.language === 'en' ? 'en-GB' : 'de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const file = t('arbeitsdatei', 'working-file');
  all.forEach((s, i) => {
    const [w, h] = [s.getWidth(), s.getHeight()];
    const diag = i < diagPages;
    const r = diag ? RQ : R;
    const num = t(`Seite ${i + 1} von ${all.length}`, `Page ${i + 1} of ${all.length}`);
    // "LESEEXEMPLAR" letter-spaced (tracking 1.2): characters one by one.
    let x = r;
    for (const z of t('LESEEXEMPLAR', 'READING COPY')) {
      write(s, z, x, r + 12, 7, { bold: true, color: F.gray });
      x += boxWidth(z, 7, true) + 1.2;
    }
    write(s, `${t('Stand', 'As of')} ${state} · ${num}`, w - r, r + 12, 7.5, { color: F.gray, anchor: 'end' });
    write(s, ir.name, r, r + 36, 20, { bold: true });
    const part = diagPages > 1 ? t(` (Teil ${i + 1} von ${diagPages})`, ` (part ${i + 1} of ${diagPages})`) : '';
    write(s, diag ? t('Der Ablauf als Diagramm mit Legende', 'The process as a diagram with legend') + part : t('Der Ablauf in Worten, Zeile für Zeile. Nebenwege sind eingerückt.', 'The process in words, line by line. Side paths are indented.'), r, r + 51, 9, { color: F.gray });
    const textPage = diagPages + 1;
    const hint = !diag ? []
      : i < diagPages - 1 ? [t('Links beim Kreis beginnen und den Pfeilen folgen.', 'Start at the circle on the left and follow the arrows.'), t(`Das Diagramm geht auf Seite ${i + 2} weiter.`, `The diagram continues on page ${i + 2}.`)]
      : [i ? t(`Fortsetzung von Seite ${i}.`, `Continued from page ${i}.`) : t('Links beim Kreis beginnen und den Pfeilen folgen.', 'Start at the circle on the left and follow the arrows.'),
         ...(all.length > diagPages ? [t(`Seite ${textPage} erzählt denselben Ablauf in Worten.`, `Page ${textPage} tells the same process in words.`)] : [])];
    hint.forEach((z, j) => write(s, z, w - r, r + 36 + j * 12, 8.5, { color: F.gray, anchor: 'end' }));
    strokeStyle(s, r, r + 62, w - r, r + 62);
    strokeStyle(s, r, h - r - 14, w - r, h - r - 14);
    write(s, t(`Zum Nachschlagen. Geändert wird nur die Arbeitsdatei ${file}.bpmn, nicht dieses Leseexemplar.`, `For reference. Only the working file ${file}.bpmn is changed, not this reading copy.`), r, h - r, 7, { color: F.gray });
    write(s, `${ir.name} · ${num}`, w - r, h - r, 7, { color: F.gray, anchor: 'end' });
  });

  return doc.save();
}

/** Line into pieces: signal word (bold), object (area behind it), arrow (drawn), text. */
type Piece = { subtype: 'sw' | 'text'; s: string } | { subtype: 'obj'; s: string; o: string } | { subtype: 'arrow' };
function pieces(z: string): Piece[] {
  const out: Piece[] = [];
  const sw = z.match(/^([A-ZÄÖÜ]{2,}(?: [A-ZÄÖÜ]{2,})*)/);
  if (sw) {
    out.push({ subtype: 'sw', s: sw[1] });
    z = z.slice(sw[1].length);
  }
  const re = /\[([@#+!?]?)([^\]]*)\]|→/g;
  let i = 0;
  for (const m of z.matchAll(re)) {
    if (m.index! > i) out.push({ subtype: 'text', s: z.slice(i, m.index) });
    out.push(m[0] === '→' ? { subtype: 'arrow' } : { subtype: 'obj', s: m[2] + (m[1] === '?' ? '?' : ''), o: m[1] });
    i = m.index! + m[0].length;
  }
  if (i < z.length) out.push({ subtype: 'text', s: z.slice(i) });
  return out;
}

/**
 * Both in one call, including the draft mark. `readingCopy` comes from the
 * pipeline: if it is false, DRAFT appears in the image. The PDF is still produced -
 * a blocked reading copy does not mean that nobody may look at the state.
 */
export async function renderBoth(
  ir: ProcessIR,
  positions: PositionMap,
  readingCopy: boolean,
  told?: string
): Promise<{ svg: string; pdf: Uint8Array }> {
  const opts = { draft: !readingCopy };
  return { svg: toSvg(ir, positions, opts), pdf: await toPdf(ir, positions, { ...opts, told }) };
}

const round = (v: number) => Math.round(v * 10) / 10;
