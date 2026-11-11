import { ProcessIR, Node, FlowNode, PositionMap, Position, isFlowNode } from './ir.js';
import { measureOne } from './readability.js';
import { Language, tx } from './language.js';

export const SIZE: Record<string, { w: number; h: number }> = {
  start: { w: 36, h: 36 },
  end: { w: 36, h: 36 },
  exception: { w: 36, h: 36 },
  wait: { w: 36, h: 36 },
  // 140 instead of 120: at 18 characters and font size 12 the text touched the sides
  // (measured ~6.2px per character, so ~112px in a 120px box). Wider
  // plus tighter wrapping, so that even a long word with punctuation fits.
  step: { w: 140, h: 80 },
  gateway: { w: 50, h: 50 }
};

/**
 * Wrapping of a task name. Lives HERE and not in the renderer, because the
 * box height depends on it: if height and wrapping are computed separately, the
 * text overflows as soon as one of them changes. That was exactly the bug.
 */
// Rulebook: 19 characters per line, font size 12.5; from the 4th line the box grows by 15 per line.
export const TASK_CHARS = 19;
const LINE = 15;

export function wrap(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const w of text.split(/\s+/)) {
    if (cur && (cur + ' ' + w).length > maxChars) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * On the block path a task carries a whole sentence ("who, with what, by when").
 * Long names are the normal case here, not the exception - so the
 * box grows along instead of cutting the text off or letting it overflow.
 * All callers call sizeOf(n) with the whole node and get this
 * without any change of their own.
 */
export const sizeOf = (n: Node) => {
  const s = SIZE[n.kind];
  if (n.kind !== 'step') return s;
  const lines = wrap(n.name ?? '', TASK_CHARS).length;
  // Grey lines (system, deadline) under the name; spacing 4, 11 padding at top and bottom.
  // ponytail: measured with the longer English word, so the height does not depend on the language.
  const k = extraLines(n, 'en').length;
  return { w: s.w, h: Math.max(s.h + Math.max(0, lines - 3) * LINE, Math.ceil(lines * LINE + (k ? 4 + k * 12.5 : 0) + 22)) };
};

/** System and deadline of a task, as grey lines in the box. */
export function extraLines(n: Node, language?: Language): string[] {
  if (n.kind !== 'step' || !n.details) return [];
  const { system, deadline } = n.details;
  return [system, deadline && `${tx(language, 'Frist', 'Deadline')}: ${deadline}`]
    .filter((z): z is string => !!z?.trim())
    .flatMap((z) => wrap(z, 22));
}

/**
 * Documents of a task: sheet 30 x 38 (rulebook), 16 below the task,
 * side by side from the left, 84 wide each; caption 14 below, 14 characters per line.
 * box covers assignment, sheet and caption: arrows avoid it, the lane grows with it.
 * ponytail: from three documents on, the row sticks out to the right beyond the task.
 */
export const DOC = { w: 30, h: 38, fold: 9, gap: 16 };
export function documents(n: Node, q: Position) {
  if (n.kind !== 'step' || !n.details?.documents?.length) return [];
  const below = q.y + sizeOf(n).h;
  return n.details.documents.map((name, i) => {
    const cx = q.x + 28 + i * 84;
    const lines = wrap(name, 14);
    const w = Math.max(DOC.w, ...lines.map((z) => z.length * SMALL * 0.56));
    const h = DOC.gap + DOC.h + 14 + (lines.length - 1) * SMALL_LINE + 3;
    return { cx, above: below + DOC.gap, lines, box: { x: cx - w / 2, y: below + 2, w, h: h - 2 } };
  });
}
/** Space the documents need below the task. */
const underTask = (n: Node) => Math.max(0, ...documents(n, { x: 0, y: 0 }).map((d) => d.box.y + d.box.h - sizeOf(n).h));

const COL = 190;
/** Minimum distance between two boxes in the same lane and column. */
const ROW = 110;
/** Minimum height of a lane. Tall boxes push it open, see layout(). */
const LANE_H = 220;
const X0 = 160;
const Y0 = 80;

/**
 * Assigns positions to all nodes. Nodes that are in `previous`
 * keep their coordinates unchanged - only new nodes are laid out.
 * That is why the diagram does not jump on a change.
 */
export function layout(ir: ProcessIR, previous: PositionMap = {}): PositionMap {
  const rank = ranks(ir);
  const laneIndex = new Map(ir.lanes.map((l, i) => [l.id, i]));

  // What is reached only via an exception path goes down in the column.
  // Otherwise it lands on the main line and the normal path has to dodge.
  const fromExceptionPath = (n: Node) =>
    ir.edges.some((e) => e.to === n.id && ir.nodes.find((x) => x.id === e.from)?.kind === 'exception');
  const flow = ir.nodes.filter(isFlowNode).sort((a, b) => Number(fromExceptionPath(a)) - Number(fromExceptionPath(b)));

  const byRank = new Map<number, FlowNode[]>();
  for (const n of flow) {
    const r = rank.get(n.id) ?? 0;
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r)!.push(n);
  }

  // Stack lanes one after another instead of a fixed grid: a task with a long
  // name is taller than 80px, and with a fixed LANE_H it sticks into the neighbouring lane.
  // The height per lane depends on the tallest box in it, times the
  // number of slots lying on top of each other.
  const heightPerLane = new Map<number, number>();
  const slotsPerLane = new Map<number, number>();
  for (const nodes of byRank.values()) {
    const perLane = new Map<number, number>();
    for (const n of nodes) {
      const lane = laneIndex.get(n.laneId ?? '') ?? 0;
      perLane.set(lane, (perLane.get(lane) ?? 0) + 1);
      heightPerLane.set(lane, Math.max(heightPerLane.get(lane) ?? 0, sizeOf(n).h + underTask(n)));
    }
    for (const [lane, count] of perLane)
      slotsPerLane.set(lane, Math.max(slotsPerLane.get(lane) ?? 1, count));
  }

  const laneTop = new Map<number, number>();
  const laneTask = new Map<number, number>();
  let y = Y0;
  for (let lane = 0; lane < Math.max(ir.lanes.length, 1); lane++) {
    const frameBox = heightPerLane.get(lane) ?? SIZE.step.h;
    const task = Math.max(ROW, frameBox + 30);
    const slots = slotsPerLane.get(lane) ?? 1;
    laneTop.set(lane, y);
    laneTask.set(lane, task);
    y += Math.max(LANE_H, slots * task + 80);
  }

  // Nodes per lane and column; the order within is the slot from the top.
  const groups = new Map<string, { lane: number; r: number; nodes: FlowNode[] }>();
  for (const [r, nodes] of byRank)
    for (const n of nodes) {
      const lane = laneIndex.get(n.laneId ?? '') ?? 0;
      const key = `${lane}:${r}`;
      if (!groups.has(key)) groups.set(key, { lane, r, nodes: [] });
      groups.get(key)!.nodes.push(n);
    }

  const place = (): PositionMap => {
    const positions: PositionMap = {};
    for (const id of Object.keys(previous)) {
      if (ir.nodes.some((n) => n.id === id)) positions[id] = { ...previous[id] };
    }
    for (const { lane, r, nodes } of groups.values())
      nodes.forEach((n, slot) => {
        // A node that keeps its position still occupies its slot.
        // Otherwise the layout puts a new node right on top of it - and that
        // only shows in the drawn image, never in the XML file.
        if (positions[n.id]) return;
        const size = sizeOf(n);
        const centerY = (laneTop.get(lane) ?? Y0) + slot * (laneTask.get(lane) ?? ROW) + 40;
        positions[n.id] = { x: X0 + r * COL - size.w / 2, y: centerY - size.h / 2 };
      });

    for (const n of ir.nodes) {
      if (n.kind !== 'exception' || positions[n.id]) continue;
      const host = positions[n.attachedTo];
      const hostNode = ir.nodes.find((x) => x.id === n.attachedTo);
      if (!host || !hostNode) continue;
      const hs = sizeOf(hostNode);
      // If the target lies higher up, the exception sits on the top edge. Otherwise
      // its arrow has to go through or around its own task.
      const target = ir.edges.find((e) => e.from === n.id);
      const zp = target && positions[target.to];
      const above = zp !== undefined && zp.y + 40 < host.y;
      positions[n.id] = { x: host.x + hs.w - 18 - 25, y: above ? host.y - 18 : host.y + hs.h - 18 };
    }
    return positions;
  };

  // Order within a group: try all variants, the one with
  // the best readability score stays. Only groups with no old positions at all -
  // otherwise what should stay put jumps around when refining.
  // ponytail: exhaustive search per group (max. 5 nodes = 120 variants). One evaluation
  // costs ~edges^2 (measured 44 ms at 65 edges), so the budget is set so that
  // the worst case takes ~1 s. Counted, not timed: otherwise
  // the result depends on machine load. If that is not enough: add barycenter ordering first.
  const open = [...groups.values()].filter((g) => g.nodes.length > 1 && g.nodes.length <= 5 && g.nodes.every((n) => !previous[n.id]));
  let best = place();
  if (open.length) {
    let bestW = value(ir, best);
    let budget = Math.floor(90_000 / Math.max(1, ir.edges.length ** 2));
    for (let round = 0; round < 2; round++)
      for (const g of open) {
        let bestOrder = g.nodes;
        for (const order of permutations(g.nodes)) {
          if (budget-- <= 0) break;
          g.nodes = order;
          const p = place();
          const w = value(ir, p);
          if (w < bestW - 1e-9) (best = p), (bestW = w), (bestOrder = order);
        }
        g.nodes = bestOrder;
      }
  }
  return best;
}

/**
 * Same weights as in path selection, see cost(). A crooked main path
 * weighs as much as an arrow through a box: requirement of the business side,
 * rather two crossings than the rejection path on the centre line.
 */
function value(ir: ProcessIR, p: PositionMap): number {
  const m = measureOne(ir, p);
  return m.throughBox * 100 + m.mainPathCrooked * 100 + m.overlaid * 40 + m.crossings * 20 + m.bends * 3;
}

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest]));
}

/** Longest path from the start - stable and cycle-safe. */
function ranks(ir: ProcessIR): Map<string, number> {
  const rank = new Map<string, number>();
  const starts = ir.nodes.filter((n) => n.kind === 'start').map((n) => n.id);
  const seeds = starts.length ? starts : ir.nodes.filter(isFlowNode).slice(0, 1).map((n) => n.id);

  for (const s of seeds) rank.set(s, 0);

  // Backward arrows (loops, "back to ...") do not count. Otherwise
  // each round pushes the cycle one column further until the guard kicks in -
  // the diagram then becomes absurdly wide.
  const back = new Set<string>();
  const onStack = new Set<string>();
  const visited = new Set<string>();
  const deep = (id: string): void => {
    visited.add(id);
    onStack.add(id);
    const goTo = [
      ...ir.edges.filter((e) => e.from === id).map((e) => ({ to: e.to, edge: e.id })),
      ...ir.nodes.filter((b) => b.kind === 'exception' && b.attachedTo === id).map((b) => ({ to: b.id, edge: '' }))
    ];
    for (const w of goTo) {
      if (onStack.has(w.to)) back.add(w.edge);
      else if (!visited.has(w.to)) deep(w.to);
    }
    onStack.delete(id);
  };
  for (const s of seeds) deep(s);

  let changed = true;
  let guard = 0;
  while (changed && guard++ < ir.nodes.length + 5) {
    changed = false;

    // An exception path inherits the rank of its task. It hangs on the border instead of
    // on an edge - without this line everything reachable only through it
    // ends up in column 0 and thus on top of the start.
    for (const b of ir.nodes) {
      if (b.kind !== 'exception') continue;
      const host = rank.get(b.attachedTo);
      if (host !== undefined && (rank.get(b.id) ?? -1) < host) {
        rank.set(b.id, host);
        changed = true;
      }
    }

    for (const e of ir.edges) {
      if (back.has(e.id)) continue;
      const from = rank.get(e.from);
      if (from === undefined) continue;
      const want = from + 1;
      if ((rank.get(e.to) ?? -1) < want) {
        rank.set(e.to, want);
        changed = true;
      }
    }
  }

  for (const n of ir.nodes.filter(isFlowNode)) if (!rank.has(n.id)) rank.set(n.id, 0);
  return rank;
}

export function laneBands(ir: ProcessIR, positions: PositionMap) {
  const raw = ir.lanes.map((lane, i) => {
    const members = ir.nodes.filter((n) => isFlowNode(n) && n.laneId === lane.id);
    const ys = members.map((n) => positions[n.id]?.y ?? Y0 + i * LANE_H);
    const bottoms = members.map((n) => (positions[n.id]?.y ?? 0) + sizeOf(n).h + underTask(n));
    const top = ys.length ? Math.min(...ys) - 40 : Y0 + i * LANE_H - 40;
    const bottom = bottoms.length ? Math.max(...bottoms) + 40 : top + LANE_H;
    return { lane, top, bottom: Math.max(bottom, top + 120) };
  });
  // Lanes lie flush against each other, as in every modelling tool: the
  // border sits midway between the end of one and the start of the next.
  for (let i = 1; i < raw.length; i++) {
    // Integer, otherwise file and image round the border differently and a 1 px gap opens.
    const limit = Math.round((raw[i - 1].bottom + raw[i].top) / 2);
    raw[i - 1].bottom = raw[i].top = limit;
  }
  return raw.map((b) => ({ lane: b.lane, y: b.top, height: b.bottom - b.top }));
}

/**
 * The course of an arrow. Lives here and not in the transformer, because two
 * sides need it: the BPMN file and the drawn reading copy. Two copies
 * of the same path finding drift apart, and then the file shows something
 * different from the PDF.
 */
export function edgePoints(
  ir: ProcessIR,
  e: { id: string; from: string; to: string },
  positions: PositionMap
): Position[] | null {
  let c = pathCache.get(positions);
  if (!c || c.ir !== ir) {
    c = { ir, paths: allPaths(ir, positions) };
    pathCache.set(positions, c);
  }
  return c.paths.get(e.id) ?? null;
}

// File and image query each edge individually, but path selection needs all of them
// at once. So compute once per positions object and remember.
const pathCache = new WeakMap<PositionMap, { ir: ProcessIR; paths: Map<string, Position[]> }>();

type Box = { x: number; y: number; w: number; h: number };
export type Seg = [Position, Position];

/**
 * Each edge gets several path variants; the cheapest one is taken
 * relative to the arrows already laid. Cost: path through a box >>
 * crossing > lying on top > bend > length. Two passes, so that
 * the first edges also see the later ones.
 * ponytail: greedy, no global optimum; raise the number of passes if needed.
 */
function allPaths(ir: ProcessIR, positions: PositionMap): Map<string, Position[]> {
  const box = (id: string): Box | undefined => {
    const n = ir.nodes.find((x) => x.id === id);
    const p = positions[id];
    return n && p ? { x: p.x, y: p.y, ...sizeOf(n) } : undefined;
  };
  const boxes = ir.nodes
    .filter((n) => n.kind !== 'exception' && positions[n.id])
    .flatMap((n) => [{ id: n.id, b: box(n.id)! }, ...documents(n, positions[n.id]).map((d, i) => ({ id: `${n.id}:dok${i}`, b: d.box }))]);
  const all = boxes.map((k) => k.b);
  const above = Math.min(...all.map((b) => b.y)) - 25;
  const below = Math.max(...all.map((b) => b.y + b.h)) + 25;

  const variants = new Map<string, Position[][]>();
  for (const e of ir.edges) {
    const from = ir.nodes.find((n) => n.id === e.from);
    const f = box(e.from), t = box(e.to);
    if (!from || !f || !t) continue;
    variants.set(e.id, candidates(from.kind === 'exception' ? exceptionPathPage(ir, from, positions) : undefined, f, t, above, below));
  }

  // Simplest edges first: a straight line should not lose just because
  // a detour arrow stood before it in the list and took its exit.
  const alone = (id: string) => {
    const e = ir.edges.find((x) => x.id === id)!;
    return Math.min(...(variants.get(id) ?? []).map((v) => cost(v, [], boxes, e.from, e.to)));
  };
  const row = [...ir.edges].sort((a, b) => alone(a.id) - alone(b.id));

  const paths = new Map<string, Position[]>();
  for (let round = 0; round < 2; round++)
    for (const e of row) {
      const vs = variants.get(e.id);
      if (!vs) continue;
      paths.delete(e.id);
      // Arrows to the same target may bundle. From the same source they may not:
      // otherwise "ja" and "nein" share an exit and the caption is ambiguous.
      const other = ir.edges
        .filter((o) => o.id !== e.id && paths.has(o.id) && o.to !== e.to)
        .flatMap((o) => segments(paths.get(o.id)!));
      let best = vs[0], bestK = Infinity;
      for (const v of vs) {
        const k = cost(v, other, boxes, e.from, e.to);
        if (k < bestK - 1e-9) (best = v), (bestK = k);
      }
      paths.set(e.id, best);
    }
  return paths;
}

/** Font size of the caption on start, end, exception. render.ts draws with it. */
export const SMALL = 10.5;
/** Line spacing of the small caption. */
export const SMALL_LINE = 12.5;

/**
 * Where the caption of an exception or decision sits. Exception: left of the
 * centre axis, right-aligned. Arrows leave both vertically through the
 * centre - centred below, the text would lie right on the arrow.
 * - Exception: next to the circle, on the outer side of the task.
 * - Decision: centred above the diamond (rulebook).
 * Here and not in the renderer, because the measurement needs the same box.
 * ponytail: width estimated (0.56 x font size per character); real
 * text width only once a font is embedded.
 */
export function pagesCaption(ir: ProcessIR, n: Node, positions: PositionMap): (Box & { lines: string[] }) | undefined {
  const q = positions[n.id];
  if ((n.kind !== 'exception' && n.kind !== 'gateway') || !n.name || !q) return undefined;
  const lines = wrap(n.name, 22);
  const w = Math.max(...lines.map((z) => z.length)) * SMALL * 0.56;
  const h = lines.length * SMALL_LINE;
  // Question centred above the diamond, last baseline 8 above the tip (+3 descender).
  if (n.kind === 'gateway') return { x: q.x + SIZE.gateway.w / 2 - w / 2, y: q.y - 8 + 3 - h, w, h, lines };
  const middle = q.y + SIZE.exception.h / 2;
  return { x: q.x - 4 - w, y: exceptionPathPage(ir, n, positions) === 'above' ? middle - 3 - h : middle + 3, w, h, lines };
}

function exceptionPathPage(ir: ProcessIR, ex: Node, positions: PositionMap): 'above' | 'below' {
  if (ex.kind !== 'exception') return 'below';
  const host = positions[ex.attachedTo];
  return host && positions[ex.id].y < host.y ? 'above' : 'below';
}

function candidates(exceptionPath: 'above' | 'below' | undefined, f: Box, t: Box, above: number, below: number): Position[][] {
  const fc = { x: f.x + f.w / 2, y: f.y + f.h / 2 };
  const tc = { x: t.x + t.w / 2, y: t.y + t.h / 2 };
  const L = { x: t.x, y: tc.y };
  const tTop = { x: tc.x, y: t.y };
  const tBottom = { x: tc.x, y: t.y + t.h };
  const v: Position[][] = [];

  // An exception has only one exit: away from the task.
  const exits: { p: Position; dir: 'r' | 'o' | 'u' }[] = exceptionPath
    ? [{ p: exceptionPath === 'above' ? { x: fc.x, y: f.y } : { x: fc.x, y: f.y + f.h }, dir: exceptionPath === 'above' ? 'o' : 'u' }]
    : [
        { p: { x: f.x + f.w, y: fc.y }, dir: 'r' },
        { p: { x: fc.x, y: f.y }, dir: 'o' },
        { p: { x: fc.x, y: f.y + f.h }, dir: 'u' }
      ];

  for (const { p: s, dir } of exits) {
    if (dir === 'r') {
      if (Math.abs(s.y - L.y) <= 2 && L.x > s.x) v.push([s, { x: L.x, y: s.y }]);
      if (L.x > s.x + 20)
        for (const mx of [(s.x + L.x) / 2, s.x + 20, s.x + 32, L.x - 20, L.x - 32]) v.push([s, { x: mx, y: s.y }, { x: mx, y: L.y }, L]);
      // Horizontally to above/below the target, then in: one bend.
      if (tc.x > s.x + 10) v.push([s, { x: tc.x, y: s.y }, s.y < t.y ? tTop : tBottom]);
      // Back to the left when another box is in the way above/below:
      // out to the right briefly, then back in the channel above or below everything.
      if (tc.x < s.x)
        for (const k of [...channel(above, -1), ...channel(below, 1)])
          for (const dx of [20, 32, 44])
            v.push([s, { x: s.x + dx, y: s.y }, { x: s.x + dx, y: k }, { x: tc.x, y: k }, k > tc.y ? tBottom : tTop]);
    } else {
      // First vertically, then horizontally into the target from the left.
      if (L.x > s.x + 10) v.push([s, { x: s.x, y: L.y }, L]);
      // Vertically into the target when it lies exactly above/below.
      if (Math.abs(s.x - tc.x) <= 2) v.push([s, dir === 'u' ? tTop : tBottom]);
      // Out vertically, horizontally to above/below the target, vertically in.
      const channels = dir === 'u'
        ? [f.y + f.h + 20, ...channel(below, 1), Math.max(f.y + f.h, t.y + t.h) + 20]
        : [f.y - 20, ...channel(above, -1), Math.min(f.y, t.y) - 20];
      for (const k of channels) {
        const end = k > tc.y ? tBottom : tTop;
        v.push([s, { x: s.x, y: k }, { x: tc.x, y: k }, end]);
        if (L.x > s.x + 10) {
          const mx = L.x - 20;
          v.push([s, { x: s.x, y: k }, { x: mx, y: k }, { x: mx, y: L.y }, L]);
        }
      }
    }
  }
  return v.map(withoutDuplicate);
}

/**
 * Three parallel tracks at the border, so that back arrows do not lie on top of each other.
 * They are offset inwards: the border is 25 px from the outermost box,
 * the lane ends 40 px before it - offset outwards the arrow ran out of the lane.
 */
const channel = (margin: number, direction: 1 | -1) => [0, 1].map((i) => margin - direction * i * 10);

/** Removes zero-length pieces and points in the middle of a straight line. */
function withoutDuplicate(p: Position[]): Position[] {
  const q = p.filter((x, i) => i === 0 || Math.abs(x.x - p[i - 1].x) + Math.abs(x.y - p[i - 1].y) > 0.5);
  return q.filter((x, i) => {
    if (i === 0 || i === q.length - 1) return true;
    const a = q[i - 1], b = q[i + 1];
    return !((Math.abs(a.x - x.x) < 0.5 && Math.abs(b.x - x.x) < 0.5) || (Math.abs(a.y - x.y) < 0.5 && Math.abs(b.y - x.y) < 0.5));
  });
}

export const segments = (p: Position[]): Seg[] => p.slice(1).map((b, i) => [p[i], b]);

function cost(p: Position[], other: Seg[], boxes: { id: string; b: Box }[], origin: string, after: string): number {
  const segs = segments(p);
  let k = (p.length - 2) * 3;
  for (const [a, b] of segs) k += (Math.abs(a.x - b.x) + Math.abs(a.y - b.y)) / 100;
  for (const s of segs)
    for (const o of other) {
      // Arrows lying on top of each other are worse than crossed ones: you can
      // no longer see which goes where.
      if (crosses(s, o)) k += 20;
      else if (liesOn(s, o)) k += 40;
    }
  for (const { id, b } of boxes) {
    // Own source/target: only the first or last piece may touch them.
    const check = id === origin ? segs.slice(1) : id === after ? segs.slice(0, -1) : segs;
    if (id === origin && id === after) continue;
    if (check.some(([a, c]) => inBox(a, c, b))) k += 100;
  }
  return k;
}

const horizontal = (s: Seg) => Math.abs(s[0].y - s[1].y) < 0.5;
const inner = (v: number, a: number, b: number) => v > Math.min(a, b) + 0.5 && v < Math.max(a, b) - 0.5;

export function crosses(s: Seg, t: Seg): boolean {
  if (horizontal(s) === horizontal(t)) return false;
  const [h, v] = horizontal(s) ? [s, t] : [t, s];
  return inner(v[0].x, h[0].x, h[1].x) && inner(h[0].y, v[0].y, v[1].y);
}

/** Parallel and closer than NEAR: no longer recognisable as two arrows in the image. */
const NEAR = 8;
export function liesOn(s: Seg, t: Seg): boolean {
  if (horizontal(s) !== horizontal(t)) return false;
  const ax = horizontal(s) ? 'x' : 'y', qu = horizontal(s) ? 'y' : 'x';
  if (Math.abs(s[0][qu] - t[0][qu]) >= NEAR) return false;
  const lo = Math.max(Math.min(s[0][ax], s[1][ax]), Math.min(t[0][ax], t[1][ax]));
  const hi = Math.min(Math.max(s[0][ax], s[1][ax]), Math.max(t[0][ax], t[1][ax]));
  return hi - lo > -NEAR;
}

export function inBox(a: Position, b: Position, k: Box): boolean {
  const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x), y1 = Math.min(a.y, b.y), y2 = Math.max(a.y, b.y);
  return x1 < k.x + k.w - 2 && x2 > k.x + 2 && y1 < k.y + k.h - 2 && y2 > k.y + 2;
}

export function extent(positions: PositionMap, ir: ProcessIR): Position & { w: number; h: number } {
  const xs = ir.nodes.map((n) => positions[n.id]?.x ?? 0);
  const rs = ir.nodes.map((n) => (positions[n.id]?.x ?? 0) + sizeOf(n).w);
  const ys = ir.nodes.map((n) => positions[n.id]?.y ?? 0);
  const bs = ir.nodes.map((n) => (positions[n.id]?.y ?? 0) + sizeOf(n).h + underTask(n));
  return {
    x: Math.min(...xs, X0),
    y: Math.min(...ys, Y0),
    w: Math.max(...rs, X0) - Math.min(...xs, X0),
    h: Math.max(...bs, Y0) - Math.min(...ys, Y0)
  };
}
