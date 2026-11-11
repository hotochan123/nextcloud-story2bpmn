import { toStored } from './storyFormat.js';
import { BpmnModdle } from 'bpmn-moddle';
import type { Language } from './language.js';
import { ProcessIR, Node, Details, OpenPoint, PositionMap, isFlowNode } from './ir.js';
import { sizeOf, laneBands, extent, edgePoints } from './layout.js';

const TYPE: Record<string, string> = {
  start: 'bpmn:StartEvent',
  end: 'bpmn:EndEvent',
  step: 'bpmn:Task',
  exception: 'bpmn:BoundaryEvent',
  wait: 'bpmn:IntermediateCatchEvent'
};

export function createModdle() {
  return new BpmnModdle();
}

/**
 * Reads XML back into a moddle tree. Important: what gets linted is always the
 * parsed XML, not the freshly built object tree - only then are $parent
 * and all references set as in a real file.
 */
export async function parse(xml: string): Promise<any> {
  const { rootElement } = await createModdle().fromXML(xml);
  return rootElement;
}

export type BuildResult = { definitions: any; xml: string };

export const STORY_NS = 'urn:bpmn-core:geschichte';

export async function toBpmn(ir: ProcessIR, positions: PositionMap): Promise<BuildResult> {
  const moddle = createModdle();
  const c = (type: string, props: any = {}) => moddle.create(type, props);

  const elements = new Map<string, any>();

  const openFor = (id: string) => (ir.openPoints ?? []).filter((p) => p.elementId === id);

  for (const n of ir.nodes) {
    elements.set(n.id, buildNode(c, n, openFor(n.id), ir.language));
  }

  // Resolve references after all elements exist.
  for (const n of ir.nodes) {
    if (n.kind !== 'exception') continue;
    elements.get(n.id).attachedToRef = elements.get(n.attachedTo);
  }

  const flows = ir.edges.map((e) => {
    const flow = c('bpmn:SequenceFlow', {
      id: e.id,
      name: e.name,
      sourceRef: elements.get(e.from),
      targetRef: elements.get(e.to)
    });
    if (e.condition) {
      flow.conditionExpression = c('bpmn:FormalExpression', { body: e.condition });
    }
    return flow;
  });

  // Without bpmn:incoming/bpmn:outgoing on the elements every reader -
  // linter and modeler alike - takes the tasks to be unconnected.
  for (const e of ir.edges) {
    const flow = flows.find((f) => f.id === e.id);
    const src = elements.get(e.from);
    const tgt = elements.get(e.to);
    if (src) src.outgoing = [...(src.outgoing ?? []), flow];
    if (tgt) tgt.incoming = [...(tgt.incoming ?? []), flow];
    if (e.isDefault && src) src.default = flow;
  }

  const flowElements = [...ir.nodes.map((n) => elements.get(n.id)), ...flows];

  const process = c('bpmn:Process', {
    id: ir.id,
    name: ir.name,
    isExecutable: false,
    flowElements
  });

  // Open points without an element concern the whole process.
  const processOpen = (ir.openPoints ?? []).filter((p) => !p.elementId);
  const processText = documentationText(ir.description ? { description: ir.description } : undefined, processOpen, ir.language);
  if (processText) process.documentation = [c('bpmn:Documentation', { text: processText })];

  if (ir.lanes.length) {
    const laneSet = c('bpmn:LaneSet', {
      id: `${ir.id}_lanes`,
      lanes: ir.lanes.map((lane) =>
        c('bpmn:Lane', {
          id: lane.id,
          name: lane.name,
          flowNodeRef: ir.nodes
            .filter((n) => isFlowNode(n) && n.laneId === lane.id)
            .map((n) => elements.get(n.id))
        })
      )
    });
    process.laneSets = [laneSet];
  }

  // A pool around the lanes. Optional per the standard, but many tools
  // (ADONIS, Signavio, bpmn.io) show lanes only inside a pool.
  const pool = ir.lanes.length
    ? c('bpmn:Participant', { id: `${ir.id}_pool`, name: ir.name, processRef: process })
    : undefined;
  const collaboration = pool
    ? c('bpmn:Collaboration', { id: `${ir.id}_collaboration`, participants: [pool] })
    : undefined;

  const plane = c('bpmndi:BPMNPlane', {
    id: `${ir.id}_plane`,
    bpmnElement: collaboration ?? process,
    planeElement: [
      ...diPool(c, ir, positions, pool),
      ...diLanes(c, ir, positions, process),
      ...ir.nodes.map((n) => diShape(c, n, positions, elements)),
      ...ir.edges.map((e) => diEdge(c, e, ir, positions, flows))
    ].filter(Boolean)
  });

  const definitions = c('bpmn:Definitions', {
    id: `Definitions_${ir.id}`,
    targetNamespace: 'http://bpmn.io/schema/bpmn',
    exporter: 'bpmn-core',
    exporterVersion: String(ir.version),
    rootElements: collaboration ? [collaboration, process] : [process],
    diagrams: [c('bpmndi:BPMNDiagram', { id: `${ir.id}_diagram`, plane })]
  });
  // Standard XML attribute, every modeler leaves it alone. fromBpmn reads it back.
  if (ir.language) definitions.$attrs['xml:lang'] = ir.language;
  // Own attribute in its own namespace: modelers leave it alone and do not show it.
  if (ir.story)
    Object.assign(definitions.$attrs, { 'xmlns:bpmnc': STORY_NS, 'bpmnc:geschichte': JSON.stringify(toStored(ir.story)) });

  const { xml } = await moddle.toXML(definitions, { format: true });
  return { definitions, xml };
}

/**
 * Extra details end up as plain text in <bpmn:documentation>. That way they are visible in
 * every modeler and survive saving and opening.
 * ponytail: on re-reading exactly these lines have to be read
 * back; if that gets too shaky, switch to own extension attributes.
 */
export function documentationText(d?: Details, open: OpenPoint[] = [], language?: Language): string {
  const v = PREAMBLE[language === 'en' ? 'en' : 'de'];
  const lines: string[] = [];
  if (d?.description) lines.push(d.description);
  if (d?.system) lines.push(`${v.system}${d.system}`);
  if (d?.documents?.length) lines.push(`${v.documents}${d.documents.join(', ')}`);
  if (d?.deadline) lines.push(`${v.deadline}${d.deadline}`);
  for (const p of open)
    lines.push(`${v.open}${p.question}${p.assumption ? ` (${v.accepted}${p.assumption})` : ''}`);
  return lines.join('\n');
}

/** Preamble of the lines in <bpmn:documentation>. fromBpmn recognises both languages. */
export const PREAMBLE = {
  de: { system: 'System: ', documents: 'Dokumente: ', deadline: 'Frist: ', open: 'OFFEN: ', accepted: 'angenommen: ' },
  en: { system: 'System: ', documents: 'Documents: ', deadline: 'Deadline: ', open: 'OPEN: ', accepted: 'assumed: ' }
};

function buildNode(c: (t: string, p?: any) => any, n: Node, open: OpenPoint[] = [], language?: Language): any {
  const el = baseNode(c, n);
  const text = documentationText(n.kind === 'step' ? n.details : undefined, open, language);
  if (text) el.documentation = [c('bpmn:Documentation', { text })];
  return el;
}

function baseNode(c: (t: string, p?: any) => any, n: Node): any {
  if (n.kind === 'gateway') {
    const type = { parallel: 'bpmn:ParallelGateway', event: 'bpmn:EventBasedGateway', exclusive: 'bpmn:ExclusiveGateway' }[n.gatewayType];
    return c(type, { id: n.id, name: n.name || undefined });
  }

  if (n.kind === 'step') return c('bpmn:Task', { id: n.id, name: n.name });

  if ((n.kind === 'start' || n.kind === 'wait') && n.subtype) {
    const event = c(TYPE[n.kind], { id: n.id, name: n.name || undefined });
    event.eventDefinitions = [
      n.subtype === 'time'
        ? c('bpmn:TimerEventDefinition', { id: `${n.id}_timer` })
        : n.subtype === 'condition'
          ? // Required field condition: the condition in plain text, like the conditions on the arrow.
            c('bpmn:ConditionalEventDefinition', { id: `${n.id}_cond`, condition: c('bpmn:FormalExpression', { body: n.name }) })
          : c('bpmn:MessageEventDefinition', { id: `${n.id}_msg` })
    ];
    return event;
  }

  if (n.kind === 'end' && n.subtype) {
    const event = c('bpmn:EndEvent', { id: n.id, name: n.name || undefined });
    event.eventDefinitions = [
      n.subtype === 'cancel'
        ? c('bpmn:TerminateEventDefinition', { id: `${n.id}_term` })
        : c('bpmn:MessageEventDefinition', { id: `${n.id}_msg` })
    ];
    return event;
  }

  if (n.kind === 'exception') {
    const event = c('bpmn:BoundaryEvent', {
      id: n.id,
      name: n.name || undefined,
      cancelActivity: !n.keepsRunning
    });
    event.eventDefinitions = [
      n.trigger === 'deadline'
        ? c('bpmn:TimerEventDefinition', { id: `${n.id}_timer` })
        : n.trigger === 'message'
          ? c('bpmn:MessageEventDefinition', { id: `${n.id}_msg` })
          : c('bpmn:ErrorEventDefinition', { id: `${n.id}_err` })
    ];
    return event;
  }

  return c(TYPE[n.kind], { id: n.id, name: n.name || undefined });
}

function diShape(c: any, n: Node, positions: PositionMap, elements: Map<string, any>) {
  const p = positions[n.id];
  if (!p) return null;
  const s = sizeOf(n);
  const shape = c('bpmndi:BPMNShape', {
    id: `${n.id}_di`,
    bpmnElement: elements.get(n.id),
    bounds: c('dc:Bounds', { x: round(p.x), y: round(p.y), width: s.w, height: s.h })
  });
  if (n.kind === 'gateway') shape.isMarkerVisible = true;
  return shape;
}

function diLanes(c: any, ir: ProcessIR, positions: PositionMap, process: any) {
  if (!ir.lanes.length) return [];
  const ext = extent(positions, ir);
  return laneBands(ir, positions).map((band) =>
    c('bpmndi:BPMNShape', {
      id: `${band.lane.id}_di`,
      bpmnElement: { id: band.lane.id, $type: 'bpmn:Lane' },
      isHorizontal: true,
      bounds: c('dc:Bounds', {
        x: round(ext.x - 60),
        y: round(band.y),
        width: round(ext.w + 160),
        height: round(band.height)
      })
    })
  );
}

/** The pool encloses all lanes and has a 30 px wide header on the left with the name. */
function diPool(c: any, ir: ProcessIR, positions: PositionMap, pool: any) {
  if (!pool) return [];
  const ext = extent(positions, ir);
  const bands = laneBands(ir, positions);
  const above = bands[0].y;
  const below = bands[bands.length - 1].y + bands[bands.length - 1].height;
  return [
    c('bpmndi:BPMNShape', {
      id: `${pool.id}_di`,
      bpmnElement: pool,
      isHorizontal: true,
      bounds: c('dc:Bounds', {
        x: round(ext.x - 90),
        y: round(above),
        width: round(ext.w + 190),
        height: round(below - above)
      })
    })
  ];
}

function diEdge(c: any, e: any, ir: ProcessIR, positions: PositionMap, flows: any[]) {
  const points = edgePoints(ir, e, positions);
  if (!points) return null;

  return c('bpmndi:BPMNEdge', {
    id: `${e.id}_di`,
    bpmnElement: flows.find((f) => f.id === e.id),
    waypoint: points.map((p) => c('dc:Point', { x: round(p.x), y: round(p.y) }))
  });
}

const round = (v: number) => Math.round(v);
