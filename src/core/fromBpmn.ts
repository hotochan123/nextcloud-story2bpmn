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
import { parse, PREAMBLE } from './toBpmn.js';
import { LANGUAGES } from './language.js';

const KIND: Record<string, Node['kind']> = {
  'bpmn:StartEvent': 'start',
  'bpmn:EndEvent': 'end',
  'bpmn:Task': 'step',
  'bpmn:BoundaryEvent': 'exception',
  'bpmn:IntermediateCatchEvent': 'wait',
  'bpmn:ExclusiveGateway': 'gateway',
  'bpmn:ParallelGateway': 'gateway',
  'bpmn:EventBasedGateway': 'gateway'
};

export type ReadResult = { ir: ProcessIR; positions: PositionMap };

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

  const flowElements: any[] = process.flowElements ?? [];
  const laneOf = laneAssignment(process);

  const nodes: Node[] = [];
  const openPoints: OpenPoint[] = [];

  for (const el of flowElements) {
    const kind = KIND[el.$type];
    if (!kind) continue;

    const { details, open } = readDocumentation(el);
    for (const p of open) openPoints.push({ ...p, id: `Offen_${el.id}_${openPoints.length}`, elementId: el.id });

    nodes.push(buildNode(kind, el, laneOf.get(el.id), details));
  }

  const processDocs = readDocumentation(process);
  for (const p of processDocs.open)
    openPoints.push({ ...p, id: `Offen_prozess_${openPoints.length}` });

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

  // clone drops the undefined keys. Otherwise a read-in IR differs
  // from a hand-written one in nothing but empty fields -
  // and every comparison in a test fails for the wrong reason.
  return { ir: clone(ir), positions: readPositions(definitions, nodes) };
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
    const subtype = defs.includes('bpmn:MessageEventDefinition') ? 'message' : defs.includes('bpmn:TimerEventDefinition') ? 'time' : defs.includes('bpmn:ConditionalEventDefinition') ? 'condition' : undefined;
    return { id: el.id, kind, name, laneId, ...(subtype && { subtype }) };
  }
  if (kind === 'end') {
    const defs: string[] = (el.eventDefinitions ?? []).map((d: any) => d.$type);
    const subtype = defs.includes('bpmn:TerminateEventDefinition') ? 'cancel' : defs.includes('bpmn:MessageEventDefinition') ? 'message' : undefined;
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
export function readDocumentation(el: any): { details?: Details; open: Omit<OpenPoint, 'id'>[] } {
  const text = (el.documentation ?? []).map((d: any) => d.text ?? '').join('\n');
  const open: Omit<OpenPoint, 'id'>[] = [];
  const description: string[] = [];
  const d: Details = {};

  for (const line of text.split('\n')) {
    const openMatch = /^(?:OFFEN|OPEN): (.*?)(?: \((?:angenommen|assumed): (.*)\))?$/.exec(line);
    // Both languages, regardless of which one the file is written in.
    const after = (k: 'system' | 'documents' | 'deadline') => {
      const v = [PREAMBLE.de[k], PREAMBLE.en[k]].find((x) => line.startsWith(x));
      return v === undefined ? undefined : line.slice(v.length);
    };
    let w: string | undefined;
    if (openMatch) {
      open.push({ question: openMatch[1], assumption: openMatch[2] ?? '' });
    } else if ((w = after('system')) !== undefined) d.system = w;
    else if ((w = after('documents')) !== undefined) d.documents = w.split(', ');
    else if ((w = after('deadline')) !== undefined) d.deadline = w;
    else if (line.length) description.push(line);
  }

  if (description.length) d.description = description.join('\n');
  return { details: Object.keys(d).length ? d : undefined, open };
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
