import { fromStored } from './storyFormat.js';
import {
  ProcessIR,
  Node,
  Edge,
  Lane,
  Details,
  OpenPoint,
  PositionMap,
  clone
} from './ir.js';
import { readApproval } from './approval.js';
import { parse, PREAMBLE } from './toBpmn.js';
import { LANGUAGES } from './language.js';

const KIND: Record<string, Node['kind']> = {
  'bpmn:StartEvent': 'start',
  'bpmn:EndEvent': 'end',
  'bpmn:Task': 'step',
  'bpmn:SubProcess': 'step',
  'bpmn:BoundaryEvent': 'exception',
  'bpmn:IntermediateCatchEvent': 'wait',
  'bpmn:IntermediateThrowEvent': 'send',
  'bpmn:ExclusiveGateway': 'gateway',
  'bpmn:ParallelGateway': 'gateway',
  'bpmn:EventBasedGateway': 'gateway'
};

/** `approvalUnreadable`: the file has an approval state that could not be read (it is left out of `ir`). */
export type ReadResult = { ir: ProcessIR; positions: PositionMap; approvalUnreadable?: true };

/**
 * Reads a BPMN file back into IR and positions - the reverse direction of
 * toBpmn. Meant for the working file: someone fetches it back and keeps
 * working without the diagram being shuffled anew.
 *
 * What does NOT come back: the IDs of the open points and their "field". Both
 * are not in the file, because the documentation is supposed to stay
 * readable for humans. The IDs are assigned anew - anyone who needs resolveOpenPoint across a
 * re-read step has to switch to own
 * extension attributes first (see the note on documentationText).
 */
export async function fromBpmn(xml: string): Promise<ReadResult> {
  const definitions = await parse(xml);
  const process = (definitions.rootElements ?? []).find((r: any) => r.$type === 'bpmn:Process');
  if (!process) throw new Error('Die Datei enthält keinen bpmn:Process');

  const { nodes, edges, openPoints } = readFlow(process, 'process');

  const processDocs = readDocumentation(process);
  for (const p of processDocs.open)
    openPoints.push({ ...p, id: `Offen_prozess_${openPoints.length}` });

  const ir: ProcessIR = {
    id: process.id,
    name: process.name ?? process.id,
    version: Number(definitions.exporterVersion) || 1,
    lanes: readLanes(process),
    nodes,
    edges,
    openPoints: openPoints.length ? openPoints : undefined,
    language: LANGUAGES.find((s) => s === definitions.$attrs?.['xml:lang']),
    story: readStory(definitions.$attrs?.['bpmnc:geschichte']),
    description: processDocs.details?.description
  };
  const approval = readApproval(definitions.$attrs?.['s2b:freigabe']);
  if (approval.approval) ir.approval = approval.approval;

  // clone drops the undefined keys. Otherwise a read-in IR differs
  // from a hand-written one in nothing but empty fields -
  // and every comparison in a test fails for the wrong reason.
  const deep = (list: Node[]): Node[] => list.flatMap((n) => [n, ...(n.kind === 'step' && n.subprocess ? deep(n.subprocess.nodes) : [])]);
  const all = deep(nodes);
  return { ir: clone(ir), positions: readPositions(definitions, all), ...(approval.unreadable ? { approvalUnreadable: true as const } : {}) };
}

/**
 * Nodes and arrows of one container. `level`: 'process'; 'sub', the flow behind a task (a sub-process in the
 * process); 'inner', the flow of an event sub-process. A sub-process in the process becomes a task with the
 * flow behind it; in a plain sub-process only an event sub-process is read (what can come at any time while
 * it runs). Deeper nothing is read - a sub-process there stays a plain task, so a foreign file nested deeply
 * cannot make reading recurse.
 */
function readFlow(container: any, level: 'process' | 'sub' | 'inner'): { nodes: Node[]; edges: Edge[]; openPoints: OpenPoint[] } {
  const flowElements: any[] = container.flowElements ?? [];
  const laneOf = laneAssignment(container);
  const nodes: Node[] = [];
  const openPoints: OpenPoint[] = [];

  for (const el of flowElements) {
    const kind = KIND[el.$type];
    if (!kind) continue;

    const { details, open, each } = readDocumentation(el);
    for (const p of open) openPoints.push({ ...p, id: `Offen_${el.id}_${openPoints.length}`, elementId: el.id });

    const node = buildNode(kind, el, laneOf.get(el.id), details);
    // Per item (multi-instance); a standard loop ("while …") is not part of the story and stays out.
    if (node.kind === 'step' && el.loopCharacteristics?.$type === 'bpmn:MultiInstanceLoopCharacteristics')
      node.forEach = { item: each ?? '', ...(el.loopCharacteristics.isSequential ? {} : { parallel: true as const }) };
    const read = level === 'process' || (level === 'sub' && !!el.triggeredByEvent);
    if (read && el.$type === 'bpmn:SubProcess' && node.kind === 'step') {
      const inner = readFlow(el, el.triggeredByEvent || level === 'sub' ? 'inner' : 'sub');
      node.subprocess = { lanes: readLanes(el), nodes: inner.nodes, edges: inner.edges, ...(inner.openPoints.length ? { openPoints: inner.openPoints } : {}) };
      // An event subprocess: what can come at any time. Its trigger is the kind of its start; a foreign
      // start without one counts as a message, so the box still has a symbol.
      if (el.triggeredByEvent) {
        const start = (el.flowElements ?? []).find((x: any) => x.$type === 'bpmn:StartEvent');
        const trigger = inner.nodes.find((x) => x.kind === 'start' && x.id === start?.id);
        node.anytime = { trigger: (trigger?.kind === 'start' && trigger.subtype) || 'message', ...(start?.isInterrupting === false && { keepsRunning: true as const }) };
      }
    }
    nodes.push(node);
  }

  const edges: Edge[] = flowElements
    .filter((el: any) => el.$type === 'bpmn:SequenceFlow')
    .map((f: any) => ({
      id: f.id,
      from: f.sourceRef?.id,
      to: f.targetRef?.id,
      name: f.name || undefined,
      condition: f.conditionExpression?.body || undefined,
      isDefault: f.sourceRef?.default?.id === f.id ? true : undefined
    }));
  return { nodes, edges, openPoints };
}

/** Broken JSON = no story, no crash: the diagram itself is still readable. */
function readStory(raw: unknown): unknown[] | undefined {
  if (typeof raw !== 'string') return undefined;
  try {
    const z = JSON.parse(raw);
    return Array.isArray(z) ? fromStored(z) : undefined;
  } catch {
    return undefined;
  }
}

function buildNode(kind: Node['kind'], el: any, laneId: string | undefined, details?: Details): Node {
  const name = el.name ?? '';
  if (kind === 'exception') {
    const defs: string[] = (el.eventDefinitions ?? []).map((d: any) => d.$type);
    return {
      id: el.id,
      kind,
      name,
      attachedTo: el.attachedToRef?.id,
      trigger: defs.includes('bpmn:TimerEventDefinition') ? 'deadline' : defs.includes('bpmn:MessageEventDefinition') ? 'message' : 'error',
      ...(el.cancelActivity === false && { keepsRunning: true })
    };
  }
  if (kind === 'gateway')
    return {
      id: el.id,
      kind,
      name,
      laneId,
      gatewayType: el.$type === 'bpmn:ParallelGateway' ? 'parallel' : el.$type === 'bpmn:EventBasedGateway' ? 'event' : 'exclusive'
    };
  if (kind === 'step') return { id: el.id, kind, name, laneId, details };
  if (kind === 'start' || kind === 'wait') {
    const defs: string[] = (el.eventDefinitions ?? []).map((d: any) => d.$type);
    const subtype = defs.includes('bpmn:MessageEventDefinition') ? 'message' : defs.includes('bpmn:TimerEventDefinition') ? 'time' : defs.includes('bpmn:ConditionalEventDefinition') ? 'condition' : defs.includes('bpmn:SignalEventDefinition') ? 'signal' : undefined;
    return { id: el.id, kind, name, laneId, ...(subtype && { subtype }) };
  }
  if (kind === 'send') {
    // A foreign throw event without a signal (e.g. a message) stays a plain throw event.
    const defs: string[] = (el.eventDefinitions ?? []).map((d: any) => d.$type);
    return { id: el.id, kind, name, laneId, ...(defs.includes('bpmn:SignalEventDefinition') && { subtype: 'signal' as const }) };
  }
  if (kind === 'end') {
    const defs: string[] = (el.eventDefinitions ?? []).map((d: any) => d.$type);
    const subtype = defs.includes('bpmn:TerminateEventDefinition') ? 'cancel' : defs.includes('bpmn:MessageEventDefinition') ? 'message' : defs.includes('bpmn:SignalEventDefinition') ? 'signal' : undefined;
    return { id: el.id, kind, name, laneId, ...(subtype && { subtype }) };
  }
  return { id: el.id, kind, name, laneId } as Node;
}

function readLanes(process: any): Lane[] {
  const sets: any[] = process.laneSets ?? [];
  return sets.flatMap((s) => s.lanes ?? []).map((l: any) => ({ id: l.id, name: l.name ?? l.id }));
}

function laneAssignment(process: any): Map<string, string> {
  const map = new Map<string, string>();
  for (const set of process.laneSets ?? [])
    for (const lane of set.lanes ?? [])
      for (const ref of lane.flowNodeRef ?? []) map.set(ref.id, lane.id);
  return map;
}

/**
 * The reverse direction of documentationText. Every line with a known preamble
 * is read as an extra detail, everything else as description.
 * ponytail: a description that itself starts with "System: " is misread
 * here. If that ever happens, that is the point where the details
 * belong in own extension attributes instead of the running text.
 */
export function readDocumentation(el: any): { details?: Details; open: Omit<OpenPoint, 'id'>[]; each?: string } {
  const text = (el.documentation ?? []).map((d: any) => d.text ?? '').join('\n');
  const open: Omit<OpenPoint, 'id'>[] = [];
  const description: string[] = [];
  const d: Details = {};
  let each: string | undefined;

  for (const line of text.split('\n')) {
    const openMatch = /^(?:OFFEN|OPEN): (.*?)(?: \((?:angenommen|assumed): (.*)\))?$/.exec(line);
    // Both languages, regardless of which one the file is written in.
    const after = (k: 'system' | 'documents' | 'deadline' | 'each') => {
      const v = [PREAMBLE.de[k], PREAMBLE.en[k]].find((x) => line.startsWith(x));
      return v === undefined ? undefined : line.slice(v.length);
    };
    let w: string | undefined;
    if (openMatch) {
      open.push({ question: openMatch[1], assumption: openMatch[2] ?? '' });
    } else if ((w = after('system')) !== undefined) d.system = w;
    else if ((w = after('documents')) !== undefined) d.documents = w.split(', ');
    else if ((w = after('deadline')) !== undefined) d.deadline = w;
    else if ((w = after('each')) !== undefined) each = w;
    else if (line.length) description.push(line);
  }

  if (description.length) d.description = description.join('\n');
  return { details: Object.keys(d).length ? d : undefined, open, ...(each !== undefined && { each }) };
}

function readPositions(definitions: any, nodes: Node[]): PositionMap {
  const ids = new Set(nodes.map((n) => n.id));
  const positions: PositionMap = {};
  for (const diagram of definitions.diagrams ?? [])
    for (const pe of diagram.plane?.planeElement ?? []) {
      // The lane rectangles are in here too. They do not belong in the
      // position memory, the layout computes them itself.
      const id = pe.bpmnElement?.id;
      if (pe.$type !== 'bpmndi:BPMNShape' || !ids.has(id) || !pe.bounds) continue;
      positions[id] = { x: pe.bounds.x, y: pe.bounds.y };
    }
  return positions;
}
