import { ProcessIR, Issue, outgoing, incoming, isFlowNode } from './ir.js';
import { tx } from './language.js';

const issue = (rule: string, message: string, elementId?: string, elementName?: string): Issue => ({
  source: 'ir',
  rule,
  elementId,
  elementName,
  message
});

/**
 * Checks the graph for business correctness: start/end present, lanes known,
 * decisions unambiguous, nothing dangling. No technicalities -
 * the diagram is documentation, not an executable definition.
 */
export function validateIR(ir: ProcessIR): Issue[] {
  const t = (de: string, en: string) => tx(ir.language, de, en);
  const issues: Issue[] = [];

  const starts = ir.nodes.filter((n) => n.kind === 'start');
  const ends = ir.nodes.filter((n) => n.kind === 'end');
  if (starts.length === 0) issues.push(issue('no-start', t('Der Prozess hat keinen Start', 'The process has no start')));
  if (ends.length === 0) issues.push(issue('no-end', t('Der Prozess hat kein Ende', 'The process has no end')));

  const ids = new Set(ir.nodes.map((n) => n.id));
  const laneIds = new Set(ir.lanes.map((l) => l.id));

  for (const n of ir.nodes) {
    if (n.kind === 'exception') {
      if (!ids.has(n.attachedTo))
        issues.push(
          issue(
            'dangling-exception',
            t(`Ausnahme-Pfad hängt an unbekanntem Schritt ${n.attachedTo}`, `Exception path is attached to unknown step ${n.attachedTo}`),
            n.id,
            n.name
          )
        );
      if (!n.name)
        issues.push(
          issue('unnamed-exception', t('Ausnahme-Pfad ohne Auslöser im Klartext', 'Exception path without a plain-text trigger'), n.id, n.name)
        );
      // Exception paths are exempt from the reachability check, otherwise
      // a path into nothing only shows up in the linter - with an incomprehensible
      // reason instead of in business terms.
      if (outgoing(ir, n.id).length === 0)
        issues.push(
          issue(
            'exception-without-followup',
            t('Ausnahme-Pfad führt nirgendwohin: der Folgeschritt fehlt', 'Exception path leads nowhere: the next step is missing'),
            n.id,
            n.name
          )
        );
      continue;
    }

    if (n.laneId && !laneIds.has(n.laneId))
      issues.push(issue('unknown-lane', t(`Bahn ${n.laneId} ist nicht definiert`, `Lane ${n.laneId} is not defined`), n.id, n.name));
    if (!n.laneId && ir.lanes.length)
      issues.push(issue('missing-lane', t('Knoten ist keiner Bahn zugeordnet', 'Node is not assigned to a lane'), n.id, n.name));

    if (n.kind === 'start' && incoming(ir, n.id).length > 0)
      issues.push(issue('start-has-incoming', t('Der Start hat eingehende Pfeile', 'The start has incoming arrows'), n.id, n.name));
    if (n.kind === 'end' && outgoing(ir, n.id).length > 0)
      issues.push(issue('end-has-outgoing', t('Das Ende hat ausgehende Pfeile', 'The end has outgoing arrows'), n.id, n.name));

    // BPMN: behind "whichever happens first" every path has a wait, and only this path leads in.
    if (n.kind === 'gateway' && n.gatewayType === 'event')
      for (const e of outgoing(ir, n.id)) {
        const target = ir.nodes.find((m) => m.id === e.to);
        if (target?.kind !== 'wait' || incoming(ir, target.id).length > 1)
          issues.push(issue('event-gateway-target', t('Jeder Weg nach „was zuerst passiert“ beginnt mit einem Warten, das nur von dort erreicht wird', 'Every path after “what comes first” starts with a wait reached only from there'), n.id, n.name));
      }

    if (n.kind === 'gateway' && n.gatewayType === 'exclusive') {
      const outs = outgoing(ir, n.id);
      if (outs.length > 1) {
        const unconditioned = outs.filter((e) => !e.condition && !e.isDefault);
        if (unconditioned.length > 0)
          issues.push(
            issue(
              'missing-condition',
              t(`${unconditioned.length} Zweig(e) ohne Bedingung und ohne Standardweg`, `${unconditioned.length} branch(es) without condition and without default path`),
              n.id,
              n.name
            )
          );
        if (outs.filter((e) => e.isDefault).length > 1)
          issues.push(issue('multiple-defaults', t('Mehr als ein Standardweg', 'More than one default path'), n.id, n.name));
      }
    }
  }

  // Open points are not an error - they belong to the draft. They just must not
  // point at nothing, otherwise the author sees them nowhere.
  for (const p of ir.openPoints ?? []) {
    if (p.elementId && !ids.has(p.elementId))
      issues.push(
        issue(
          'dangling-open-point',
          t(`Offener Punkt hängt an unbekanntem Element ${p.elementId}`, `Open point is attached to unknown element ${p.elementId}`),
          p.id,
          p.question
        )
      );
  }

  for (const e of ir.edges) {
    if (!ids.has(e.from)) issues.push(issue('dangling-edge', t(`Pfeil ${e.id}: Quelle ${e.from} fehlt`, `Arrow ${e.id}: source ${e.from} is missing`), e.id));
    if (!ids.has(e.to)) issues.push(issue('dangling-edge', t(`Pfeil ${e.id}: Ziel ${e.to} fehlt`, `Arrow ${e.id}: target ${e.to} is missing`), e.id));
  }

  const forward = reach(ir, starts.map((s) => s.id), 'forward');
  const backward = reach(ir, ends.map((s) => s.id), 'backward');

  for (const n of ir.nodes.filter(isFlowNode)) {
    if (starts.length && !forward.has(n.id))
      issues.push(issue('unreachable', t('Knoten ist vom Start aus nicht erreichbar', 'Node cannot be reached from the start'), n.id, n.name));
    else if (ends.length && !backward.has(n.id))
      issues.push(issue('dead-end', t('Von hier aus ist kein Ende erreichbar', 'No end can be reached from here'), n.id, n.name));
  }

  return issues;
}

function reach(ir: ProcessIR, seeds: string[], dir: 'forward' | 'backward'): Set<string> {
  const seen = new Set(seeds);
  const queue = [...seeds];
  while (queue.length) {
    const cur = queue.shift()!;
    const next =
      dir === 'forward'
        ? ir.edges.filter((e) => e.from === cur).map((e) => e.to)
        : ir.edges.filter((e) => e.to === cur).map((e) => e.from);

    // Exception paths channel the flow out of their task.
    if (dir === 'forward') {
      for (const b of ir.nodes)
        if (b.kind === 'exception' && b.attachedTo === cur) next.push(b.id);
    } else {
      const self = ir.nodes.find((n) => n.id === cur);
      if (self && self.kind === 'exception') next.push(self.attachedTo);
    }

    for (const id of next) {
      if (!seen.has(id)) {
        seen.add(id);
        queue.push(id);
      }
    }
  }
  return seen;
}
