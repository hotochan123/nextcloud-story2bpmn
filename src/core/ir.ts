import type { Language } from './language.js';

export type Lane = { id: string; name: string };

/** What makes an event occur (ADR 0005): a message arrives, or a time is reached. */
/** condition: a condition occurs (BPMN Conditional), e.g. "Lager unter Mindestbestand". */
export type EventKind = 'message' | 'time' | 'condition';
export type EndKind = 'message' | 'cancel';

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
  | { id: string; kind: 'step'; name: string; laneId?: string; details?: Details }
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
