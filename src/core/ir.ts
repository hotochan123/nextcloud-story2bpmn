import type { Language } from './language.js';
import type { Approval } from './approval.js';

export type Lane = { id: string; name: string };

/** What makes an event occur (ADR 0005): a message arrives, or a time is reached. */
/** condition: a condition occurs (BPMN Conditional), e.g. "Lager unter Mindestbestand". */
/** signal: a notice to everyone (BPMN Signal), e.g. "Lieferstopp ausgerufen"; same name = same signal. */
export type EventKind = 'message' | 'time' | 'condition' | 'signal';
export type EndKind = 'message' | 'cancel' | 'signal';

/** Business extra details on a task. All optional. */
export type Details = {
  system?: string;
  documents?: string[];
  description?: string;
  deadline?: string;
};

export type Node =
  /** subtype: what the process starts with (ADR 0005). Without = plain start. */
  | { id: string; kind: 'start'; name: string; laneId?: string; subtype?: EventKind }
  /** Waiting (catching intermediate event). subtype is missing only in foreign files. */
  | { id: string; kind: 'wait'; name: string; laneId?: string; subtype?: EventKind }
  /** subtype: a message goes out, or everything is cancelled (also what runs in parallel). Without = plain end. */
  | { id: string; kind: 'end'; name: string; laneId?: string; subtype?: EndKind }
  /** Sending on the way (throwing intermediate event): a signal goes out. subtype is missing only in foreign files. */
  | { id: string; kind: 'send'; name: string; laneId?: string; subtype?: 'signal' }
  /** subprocess: the flow behind the task (drawn collapsed, own diagram plane). Its IDs carry the prefix `<step id>_`. */
  /** forEach: the step runs once per item (BPMN multi-instance); parallel = all at once, otherwise one after another. */
  /** anytime: the box is an event subprocess (no arrows): its flow can start at any time during the process. */
  | { id: string; kind: 'step'; name: string; laneId?: string; details?: Details; subprocess?: SubFlow; forEach?: ForEach; anytime?: Anytime }
  | {
      id: string;
      kind: 'gateway';
      name: string;
      laneId?: string;
      /** event: the flow continues on the path whose wait ends first (ADR 0005). */
      gatewayType: 'exclusive' | 'parallel' | 'event';
    }
  | {
      id: string;
      kind: 'exception';
      /** The trigger in plain text: "Zahlung abgelehnt", "nach 3 Tagen". */
      name: string;
      attachedTo: string;
      /** Error (lightning bolt), expired deadline (clock) or incoming message (envelope). */
      trigger: 'error' | 'deadline' | 'message';
      /** The task keeps running, this path is added (BPMN: non-interrupting, dashed). Never for an error. */
      keepsRunning?: boolean;
    };

/** A step that runs per item: what it runs for ("Rechnungsposition"), and whether all at once. */
export type ForEach = { item: string; parallel?: true };

/** What can come at any time (BPMN event subprocess): its trigger, and whether the process keeps running (non-interrupting). */
export type Anytime = { trigger: EventKind; keepsRunning?: true };

/** The flow behind a task (subprocess): one level only, so its nodes never carry a subprocess themselves. */
export type SubFlow = { lanes: Lane[]; nodes: Node[]; edges: Edge[]; openPoints?: OpenPoint[] };

export type Edge = {
  id: string;
  from: string;
  to: string;
  name?: string;
  /** Plain-text condition, e.g. "Betrag über 5000 Euro". No expression language. */
  condition?: string;
  isDefault?: boolean;
};

/**
 * A detail that was missing from the process description and was plausibly
 * filled in by the AI. Stays visibly marked until the author confirms
 * or corrects it. As long as one is open, no reading copy is produced.
 */
export type OpenPoint = {
  id: string;
  /** Node it refers to. If missing, it concerns the whole process. */
  elementId?: string;
  /** What is missing, in glossary terms: "Frist", "Beteiligte Stelle", "Bedingung". */
  field?: string;
  /** What the AI assumed. */
  assumption: string;
  /** What the author is to confirm. */
  question: string;
};

export type ProcessIR = {
  id: string;
  name: string;
  version: number;
  lanes: Lane[];
  nodes: Node[];
  edges: Edge[];
  openPoints?: OpenPoint[];
  /** Language of the fixed texts. If missing, it is German. */
  language?: Language;
  /** The moves the diagram was told from (see story.ts).
   *  They are kept in the working file so the story can be continued later. */
  story?: unknown[];
  /** Approval state (src/core/approval.ts), stored next to the story in the working file. */
  approval?: Approval;
  /** Plain text for the whole process (the story text). Stored in <bpmn:documentation> on the process. */
  description?: string;
};

export type Op =
  | { op: 'addLane'; id: string; name: string }
  | { op: 'addOpenPoint'; point: OpenPoint }
  | { op: 'resolveOpenPoint'; id: string }
  | { op: 'addNode'; node: Node }
  | { op: 'insertAfter'; afterId: string; node: Node }
  | { op: 'insertBetween'; fromId: string; toId: string; node: Node }
  | { op: 'replaceNode'; id: string; node: Node }
  | { op: 'deleteNode'; id: string; rewire: 'connect' | 'orphan' }
  | { op: 'addBranch'; gatewayId: string; joinAt: string; condition?: string; nodes: Node[] }
  | { op: 'attachException'; nodeId: string; event: Node }
  | { op: 'setDetails'; nodeId: string; details: Details }
  /**
   * Assigns an EXISTING node to a lane. Without this command the lane
   * could only be set on creation - on the block path the nodes already
   * exist, though, and the AI could not express the assignment at all.
   */
  | { op: 'setLane'; nodeId: string; laneId: string }
  | { op: 'rename'; id: string; name: string }
  | {
      op: 'connect';
      fromId: string;
      toId: string;
      condition?: string;
      name?: string;
      isDefault?: boolean;
    }
  | {
      op: 'setEdge';
      fromId: string;
      toId: string;
      condition?: string;
      isDefault?: boolean;
      name?: string;
    };

export type Position = { x: number; y: number };
export type PositionMap = Record<string, Position>;

export type Issue = {
  source: 'apply' | 'ir' | 'lint' | 'ai' | 'block';
  rule: string;
  elementId?: string;
  elementName?: string;
  message: string;
};

export type FlowNode = Exclude<Node, { kind: 'exception' }>;

export const isFlowNode = (n: Node): n is FlowNode => n.kind !== 'exception';

export const nodeById = (ir: ProcessIR, id: string): Node | undefined =>
  ir.nodes.find((n) => n.id === id);

export const outgoing = (ir: ProcessIR, id: string): Edge[] =>
  ir.edges.filter((e) => e.from === id);

export const incoming = (ir: ProcessIR, id: string): Edge[] =>
  ir.edges.filter((e) => e.to === id);

export function edgeId(ir: ProcessIR, from: string, to: string): string {
  const base = `f_${from}__${to}`;
  if (!ir.edges.some((e) => e.id === base)) return base;
  let i = 2;
  while (ir.edges.some((e) => e.id === `${base}_${i}`)) i++;
  return `${base}_${i}`;
}

export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export type SubStep = Extract<Node, { kind: 'step' }> & { subprocess: SubFlow };
export const hasSubprocess = (n: Node): n is SubStep => n.kind === 'step' && !!n.subprocess;
/** A box of something that can come at any time: not part of the sequence flow. */
export const isAnytime = (n: Node): boolean => n.kind === 'step' && !!n.anytime;

/** The flow behind a step as a process of its own (shares the arrays: changes reach the step). */
export const subIR = (parent: ProcessIR, step: SubStep): ProcessIR => ({
  id: step.id,
  name: step.name,
  version: parent.version,
  lanes: step.subprocess.lanes,
  nodes: step.subprocess.nodes,
  edges: step.subprocess.edges,
  ...(step.subprocess.openPoints ? { openPoints: step.subprocess.openPoints } : {}),
  ...(parent.language ? { language: parent.language } : {})
});

/** The levels of a process: the main flow first, then the flow behind each step, in node order; each flow
 *  behind a step is followed by the levels inside it (what can come at any time while a subprocess runs). */
export const levels = (ir: ProcessIR): ProcessIR[] => [ir, ...ir.nodes.filter(hasSubprocess).flatMap((n) => levels(subIR(ir, n)))];

/** IDs of a flow with a prefix, so that main flow and subprocess share one file without clashes. */
export function prefixed(ir: Pick<ProcessIR, 'lanes' | 'nodes' | 'edges' | 'openPoints'>, prefix: string): SubFlow {
  const p = (id: string) => `${prefix}_${id}`;
  return clone({
    lanes: ir.lanes.map((l) => ({ ...l, id: p(l.id) })),
    nodes: ir.nodes.map((n) => ({
      ...n,
      id: p(n.id),
      ...('laneId' in n && n.laneId ? { laneId: p(n.laneId) } : {}),
      ...(n.kind === 'exception' ? { attachedTo: p(n.attachedTo) } : {}),
      // A flow nested in it (what can come at any time in a subprocess) gets the prefix too.
      ...(n.kind === 'step' && n.subprocess ? { subprocess: prefixed(n.subprocess, prefix) } : {})
    })) as Node[],
    edges: ir.edges.map((e) => ({ ...e, id: p(e.id), from: p(e.from), to: p(e.to) })),
    ...(ir.openPoints?.length ? { openPoints: ir.openPoints.map((o) => ({ ...o, id: p(o.id), ...(o.elementId ? { elementId: p(o.elementId) } : {}) })) } : {})
  });
}
