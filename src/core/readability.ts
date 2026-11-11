import { ProcessIR, PositionMap } from './ir.js';
import { edgePoints, sizeOf, segments, crosses, liesOn, inBox, pagesCaption } from './layout.js';

/**
 * Counts what makes a diagram hard to read. Every layout change is thereby
 * measured instead of judged by feel.
 * - crossings: two arrows cross
 * - bends: changes of direction, over all arrows
 * - throughBox: an arrow runs through a foreign node
 * - overlaid: two arrows lie on top of each other for a stretch (unless they have
 *   the same target - that is intended bundling)
 * - mainPathCrooked: decisions whose first branch ("ja", or the one told
 *   first) does not continue straight to the right. BPMN convention: the
 *   good case runs straight, deviations branch off.
 * - throughCaption: an arrow runs through the caption of an exception or decision
 *   (even its own)
 */
export type Readability = { crossings: number; bends: number; throughBox: number; overlaid: number; mainPathCrooked: number; throughCaption: number };

export function measureOne(ir: ProcessIR, positions: PositionMap): Readability {
  const paths = ir.edges.flatMap((e) => {
    const p = edgePoints(ir, e, positions);
    return p ? [{ e, p, segs: segments(p) }] : [];
  });
  const m: Readability = { crossings: 0, bends: 0, throughBox: 0, overlaid: 0, mainPathCrooked: 0, throughCaption: 0 };

  for (const n of ir.nodes) {
    // Parallel strands are equal in rank, only decisions have a main path.
    if (n.kind !== 'gateway' || n.gatewayType === 'parallel') continue;
    const out = paths.filter((w) => w.e.from === n.id);
    const initial = out.find((w) => !w.e.isDefault);
    if (out.length > 1 && initial && initial.p.length > 2) m.mainPathCrooked++;
  }

  const signs = ir.nodes.flatMap((n) => pagesCaption(ir, n, positions) ?? []);
  for (const [i, w] of paths.entries()) {
    for (const b of signs) if (w.segs.some(([a, c]) => inBox(a, c, b))) m.throughCaption++;
    m.bends += w.p.length - 2;
    for (const v of paths.slice(i + 1)) {
      const bundle = v.e.to === w.e.to;
      for (const s of w.segs)
        for (const t of v.segs) {
          if (crosses(s, t)) m.crossings++;
          else if (!bundle && liesOn(s, t)) m.overlaid++;
        }
    }
    for (const n of ir.nodes) {
      const q = positions[n.id];
      if (n.kind === 'exception' || !q || n.id === w.e.from || n.id === w.e.to) continue;
      const b = { ...q, ...sizeOf(n) };
      if (w.segs.some(([a, c]) => inBox(a, c, b))) m.throughBox++;
    }
  }
  return m;
}
