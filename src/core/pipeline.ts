import { ProcessIR, Op, Issue, PositionMap, nodeById, incoming, outgoing } from './ir.js';
import { applyOps } from './apply.js';
import { validateIR } from './validate.js';
import { layout } from './layout.js';
import { toBpmn, parse } from './toBpmn.js';
import { lint } from './lint.js';
import type { Language } from './language.js';

export type PipelineInput = {
  ir: ProcessIR;
  ops: Op[];
  positions?: PositionMap;
};

export type PipelineResult = {
  ok: boolean;
  stage: 'ai' | 'apply' | 'validate' | 'lint' | 'done';
  ir: ProcessIR;
  positions: PositionMap;
  xml?: string;
  issues: Issue[];
  /**
   * May a reading copy be produced from this state? Only if the diagram
   * is valid AND no open point is left open. The working file
   * is produced even with open points - the reading copy is not.
   */
  readingCopy: boolean;
};

const readingCopyAllowed = (ok: boolean, ir: ProcessIR): boolean =>
  ok && (ir.openPoints ?? []).length === 0;

/**
 * One pass through the deterministic core. Stops at the first
 * stage that reports errors - so the caller always gets the root-cause
 * error message instead of an avalanche of follow-up errors.
 */
export async function run(input: PipelineInput): Promise<PipelineResult> {
  const { ir: applied, issues: applyIssues } = applyOps(input.ir, input.ops);
  if (applyIssues.length)
    return {
      ok: false,
      stage: 'apply',
      ir: input.ir,
      positions: input.positions ?? {},
      issues: applyIssues,
      readingCopy: false
    };

  inferLanes(applied);

  const irIssues = validateIR(applied);
  const positions = layout(applied, input.positions ?? {});
  if (irIssues.length)
    return {
      ok: false,
      stage: 'validate',
      ir: applied,
      positions,
      // A story in draft has loose ends and fails here. The working file
      // is still produced: only with it can the story be continued later.
      xml: await toBpmn(applied, positions).then((r) => r.xml, () => undefined),
      issues: irIssues,
      readingCopy: false
    };

  const { xml } = await toBpmn(applied, positions);

  const lintIssues = await lint(await parse(xml));
  if (lintIssues.length)
    return {
      ok: false,
      stage: 'lint',
      ir: applied,
      positions,
      xml,
      issues: lintIssues,
      readingCopy: false
    };

  return {
    ok: true,
    stage: 'done',
    ir: applied,
    positions,
    xml,
    issues: [],
    readingCopy: readingCopyAllowed(true, applied)
  };
}

/**
 * Fills in the lane where it follows unambiguously from the neighbourhood.
 * Start and end otherwise regularly slip through without a lane - in every
 * model tested so far. This is not guessing: only if ALL neighbours are in the same
 * lane is it adopted. Anything ambiguous is left alone and shows up
 * in validation as missing-lane.
 */
function inferLanes(ir: ProcessIR): void {
  if (!ir.lanes.length) return;

  const lanesFrom = (ids: string[]): string[] => [
    ...new Set(
      ids
        .map((id) => nodeById(ir, id))
        .filter((x) => x !== undefined && x.kind !== 'exception' && x.laneId)
        .map((x) => (x as { laneId: string }).laneId)
    )
  ];

  for (const n of ir.nodes) {
    if (n.kind === 'exception' || n.laneId) continue;

    // Predecessors first: a decision belongs to the role that makes
    // it, not the one it hands over to. Otherwise every branch into a
    // different lane would be ambiguous.
    const front = lanesFrom(incoming(ir, n.id).map((e) => e.from));
    if (front.length === 1) {
      n.laneId = front[0];
      continue;
    }

    const all = lanesFrom([
      ...incoming(ir, n.id).map((e) => e.from),
      ...outgoing(ir, n.id).map((e) => e.to)
    ]);
    if (all.length === 1) n.laneId = all[0];
  }
}

export const emptyProcess = (id: string, name: string, language?: Language): ProcessIR => ({
  id,
  name,
  version: 0,
  lanes: [],
  nodes: [],
  edges: [],
  // No key with undefined - on comparison after re-reading this breaks.
  ...(language ? { language } : {})
});
