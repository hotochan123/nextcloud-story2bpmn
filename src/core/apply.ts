import {
  ProcessIR,
  Op,
  Edge,
  Issue,
  clone,
  nodeById,
  outgoing,
  incoming,
  edgeId,
  isFlowNode
} from './ir.js';
import { tx } from './language.js';

type Result = { ir: ProcessIR; issues: Issue[] };

const fail = (rule: string, message: string, elementId?: string): Issue => ({
  source: 'apply',
  rule,
  elementId,
  message
});

export function applyOps(input: ProcessIR, ops: Op[]): Result {
  const ir = clone(input);
  const issues: Issue[] = [];

  for (const op of ops) {
    const err = applyOne(ir, op);
    if (err) issues.push(err);
  }

  if (issues.length === 0 && ops.length > 0) ir.version = input.version + 1;
  return { ir, issues };
}

function applyOne(ir: ProcessIR, op: Op): Issue | null {
  const t = (de: string, en: string) => tx(ir.language, de, en);
  switch (op.op) {
    case 'addLane': {
      if (ir.lanes.some((l) => l.id === op.id))
        return fail('duplicate-id', t(`Bahn ${op.id} existiert bereits`, `Lane ${op.id} already exists`), op.id);
      ir.lanes.push({ id: op.id, name: op.name });
      return null;
    }

    case 'addOpenPoint': {
      const open = (ir.openPoints ??= []);
      if (open.some((p) => p.id === op.point.id))
        return fail('duplicate-id', t(`Offener Punkt ${op.point.id} existiert bereits`, `Open point ${op.point.id} already exists`), op.point.id);
      if (!op.point.question)
        return fail(
          'empty-question',
          t(`Offener Punkt ${op.point.id} ohne Frage an die/den Ersteller(in)`, `Open point ${op.point.id} has no question for the author`),
          op.point.id
        );
      open.push(op.point);
      return null;
    }

    case 'resolveOpenPoint': {
      const open = ir.openPoints ?? [];
      const idx = open.findIndex((p) => p.id === op.id);
      if (idx < 0) return fail('unknown-element', t(`Offener Punkt ${op.id} existiert nicht`, `Open point ${op.id} does not exist`), op.id);
      open.splice(idx, 1);
      return null;
    }

    case 'addNode': {
      if (nodeById(ir, op.node.id))
        return fail('duplicate-id', t(`ID ${op.node.id} ist bereits vergeben`, `ID ${op.node.id} is already taken`), op.node.id);
      if (op.node.kind === 'exception')
        return fail(
          'wrong-kind',
          t(`Ausnahme-Pfade nur über attachException anlegen`, `Create exception paths only via attachException`),
          op.node.id
        );
      ir.nodes.push(op.node);
      return null;
    }

    case 'insertAfter': {
      const anchor = nodeById(ir, op.afterId);
      if (!anchor) return fail('unknown-element', t(`Knoten ${op.afterId} existiert nicht`, `Node ${op.afterId} does not exist`), op.afterId);
      if (nodeById(ir, op.node.id))
        return fail('duplicate-id', t(`ID ${op.node.id} ist bereits vergeben`, `ID ${op.node.id} is already taken`), op.node.id);

      const out = outgoing(ir, op.afterId);
      if (out.length > 1)
        return fail(
          'ambiguous-insert',
          t(`${op.afterId} hat ${out.length} ausgehende Kanten. Nutze insertBetween und benenne die Zielkante.`, `${op.afterId} has ${out.length} outgoing edges. Use insertBetween and name the target edge.`),
          op.afterId
        );

      ir.nodes.push(op.node);
      if (out.length === 1) {
        const successor = out[0].to;
        out[0].to = op.node.id;
        ir.edges.push({ id: edgeId(ir, op.node.id, successor), from: op.node.id, to: successor });
      } else {
        ir.edges.push({ id: edgeId(ir, op.afterId, op.node.id), from: op.afterId, to: op.node.id });
      }
      return null;
    }

    case 'insertBetween': {
      const edge = ir.edges.find((e) => e.from === op.fromId && e.to === op.toId);
      if (!edge)
        return fail(
          'unknown-edge',
          t(`Es gibt keine Kante von ${op.fromId} nach ${op.toId}`, `There is no edge from ${op.fromId} to ${op.toId}`),
          op.fromId
        );
      if (nodeById(ir, op.node.id))
        return fail('duplicate-id', t(`ID ${op.node.id} ist bereits vergeben`, `ID ${op.node.id} is already taken`), op.node.id);

      ir.nodes.push(op.node);
      const successor = edge.to;
      edge.to = op.node.id;
      ir.edges.push({ id: edgeId(ir, op.node.id, successor), from: op.node.id, to: successor });
      return null;
    }

    case 'replaceNode': {
      const idx = ir.nodes.findIndex((n) => n.id === op.id);
      if (idx < 0) return fail('unknown-element', t(`Knoten ${op.id} existiert nicht`, `Node ${op.id} does not exist`), op.id);
      if (op.node.id !== op.id)
        return fail(
          'id-change',
          t(`replaceNode darf die ID nicht ändern (${op.id} -> ${op.node.id})`, `replaceNode must not change the ID (${op.id} -> ${op.node.id})`),
          op.id
        );
      ir.nodes[idx] = op.node;
      return null;
    }

    case 'deleteNode': {
      const node = nodeById(ir, op.id);
      if (!node) return fail('unknown-element', t(`Knoten ${op.id} existiert nicht`, `Node ${op.id} does not exist`), op.id);

      const ins = incoming(ir, op.id);
      const outs = outgoing(ir, op.id);

      if (op.rewire === 'connect') {
        if (ins.length !== 1 || outs.length !== 1)
          return fail(
            'ambiguous-delete',
            t(`${op.id} hat ${ins.length} eingehende und ${outs.length} ausgehende Kanten. ` +
              `rewire:"connect" verlangt genau eine von jeder. Gib explizit an, welcher Zweig bestehen bleibt.`, `${op.id} has ${ins.length} incoming and ${outs.length} outgoing edges. ` +
              `rewire:"connect" needs exactly one of each. State explicitly which branch remains.`),
            op.id
          );
        ins[0].to = outs[0].to;
        ir.edges = ir.edges.filter((e) => e !== outs[0]);
      } else {
        ir.edges = ir.edges.filter((e) => e.from !== op.id && e.to !== op.id);
      }

      ir.nodes = ir.nodes.filter(
        (n) => n.id !== op.id && !(n.kind === 'exception' && n.attachedTo === op.id)
      );
      return null;
    }

    case 'addBranch': {
      const gw = nodeById(ir, op.gatewayId);
      if (!gw) return fail('unknown-element', t(`Gateway ${op.gatewayId} existiert nicht`, `Gateway ${op.gatewayId} does not exist`), op.gatewayId);
      if (gw.kind !== 'gateway')
        return fail('not-a-gateway', t(`${op.gatewayId} ist keine Entscheidung`, `${op.gatewayId} is not a decision`), op.gatewayId);
      if (!nodeById(ir, op.joinAt))
        return fail('unknown-element', t(`Join-Ziel ${op.joinAt} existiert nicht`, `Join target ${op.joinAt} does not exist`), op.joinAt);
      if (gw.gatewayType === 'exclusive' && !op.condition)
        return fail(
          'missing-condition',
          t(`Zweig an der Entscheidung ${op.gatewayId} braucht eine Bedingung im Klartext`, `Branch at decision ${op.gatewayId} needs a plain-text condition`),
          op.gatewayId
        );
      if (op.nodes.length === 0)
        return fail('empty-branch', t(`Zweig an ${op.gatewayId} enthält keine Knoten`, `Branch at ${op.gatewayId} contains no nodes`), op.gatewayId);

      for (const n of op.nodes) {
        if (nodeById(ir, n.id))
          return fail('duplicate-id', t(`ID ${n.id} ist bereits vergeben`, `ID ${n.id} is already taken`), n.id);
      }

      ir.nodes.push(...op.nodes);
      const chain = [op.gatewayId, ...op.nodes.map((n) => n.id), op.joinAt];
      for (let i = 0; i < chain.length - 1; i++) {
        // Only the first edge of the branch carries the condition - and that
        // only if there is one. See the note on connect: a key
        // with the value undefined is not the same as a missing one.
        const condition = i === 0 ? op.condition : undefined;
        ir.edges.push({
          id: edgeId(ir, chain[i], chain[i + 1]),
          from: chain[i],
          to: chain[i + 1],
          ...(condition !== undefined ? { name: condition, condition: condition } : {})
        });
      }
      return null;
    }

    case 'attachException': {
      const host = nodeById(ir, op.nodeId);
      if (!host) return fail('unknown-element', t(`Knoten ${op.nodeId} existiert nicht`, `Node ${op.nodeId} does not exist`), op.nodeId);
      if (op.event.kind !== 'exception')
        return fail('wrong-kind', t(`attachException erwartet einen Ausnahme-Pfad`, `attachException expects an exception path`), op.event.id);
      if (host.kind !== 'step')
        return fail(
          'invalid-host',
          t(`Ausnahme-Pfade hängen nur an Schritten, ${op.nodeId} ist ${host.kind}`, `Exception paths attach only to steps, ${op.nodeId} is ${host.kind}`),
          op.nodeId
        );
      if (nodeById(ir, op.event.id))
        return fail('duplicate-id', t(`ID ${op.event.id} ist bereits vergeben`, `ID ${op.event.id} is already taken`), op.event.id);

      ir.nodes.push({ ...op.event, attachedTo: op.nodeId });
      return null;
    }

    case 'setDetails': {
      const node = nodeById(ir, op.nodeId);
      if (!node) return fail('unknown-element', t(`Knoten ${op.nodeId} existiert nicht`, `Node ${op.nodeId} does not exist`), op.nodeId);
      if (node.kind !== 'step')
        return fail(
          'wrong-kind',
          t(`Zusatzangaben gibt es nur an Schritten, ${op.nodeId} ist ${node.kind}`, `Details exist only on steps, ${op.nodeId} is ${node.kind}`),
          op.nodeId
        );
      node.details = { ...node.details, ...op.details };
      return null;
    }

    case 'setLane': {
      const node = nodeById(ir, op.nodeId);
      if (!node) return fail('unknown-element', t(`Knoten ${op.nodeId} existiert nicht`, `Node ${op.nodeId} does not exist`), op.nodeId);
      if (!ir.lanes.some((l) => l.id === op.laneId))
        return fail('unknown-lane', t(`Bahn ${op.laneId} ist nicht definiert`, `Lane ${op.laneId} is not defined`), op.nodeId);
      // Exception paths hang on the task and inherit its lane - a separate
      // assignment would be contradictory.
      if (node.kind === 'exception')
        return fail(
          'wrong-kind',
          t(`Ausnahme-Pfade gehören zur Bahn ihres Schritts, ${op.nodeId} braucht keine`, `Exception paths belong to their step's lane, ${op.nodeId} needs none`),
          op.nodeId
        );
      node.laneId = op.laneId;
      return null;
    }

    case 'rename': {
      const node = nodeById(ir, op.id);
      if (!node) return fail('unknown-element', t(`Knoten ${op.id} existiert nicht`, `Node ${op.id} does not exist`), op.id);
      node.name = op.name;
      return null;
    }

    case 'connect': {
      if (!nodeById(ir, op.fromId))
        return fail('unknown-element', t(`Knoten ${op.fromId} existiert nicht`, `Node ${op.fromId} does not exist`), op.fromId);
      if (!nodeById(ir, op.toId))
        return fail('unknown-element', t(`Knoten ${op.toId} existiert nicht`, `Node ${op.toId} does not exist`), op.toId);
      if (ir.edges.some((e) => e.from === op.fromId && e.to === op.toId))
        return fail('duplicate-edge', t(`Kante ${op.fromId} -> ${op.toId} existiert bereits`, `Edge ${op.fromId} -> ${op.toId} already exists`), op.fromId);

      // Only set what exists. A key with the value undefined is
      // something different from a missing key - on comparison and on
      // re-reading, exactly that breaks.
      const name = op.name ?? op.condition;
      const edge: Edge = {
        id: edgeId(ir, op.fromId, op.toId),
        from: op.fromId,
        to: op.toId,
        ...(name !== undefined ? { name } : {}),
        ...(op.condition !== undefined ? { condition: op.condition } : {})
      };
      ir.edges.push(edge);

      // Set the default path right when drawing. Otherwise a
      // second setEdge is mandatory - and if it is left out, the branch has no condition.
      if (op.isDefault) {
        for (const other of outgoing(ir, op.fromId)) delete other.isDefault;
        edge.isDefault = true;
        delete edge.condition;
      }
      return null;
    }

    case 'setEdge': {
      const edge = ir.edges.find((e) => e.from === op.fromId && e.to === op.toId);
      if (!edge)
        return fail('unknown-edge', t(`Es gibt keine Kante von ${op.fromId} nach ${op.toId}`, `There is no edge from ${op.fromId} to ${op.toId}`), op.fromId);

      if (op.name !== undefined) edge.name = op.name;
      if (op.condition !== undefined) {
        edge.condition = op.condition;
        if (op.name === undefined) edge.name = op.condition;
      }
      if (op.isDefault) {
        for (const other of outgoing(ir, op.fromId)) delete other.isDefault;
        edge.isDefault = true;
        delete edge.condition;
      }
      return null;
    }
  }
}

export function terminalNodes(ir: ProcessIR): string[] {
  return ir.nodes
    .filter(isFlowNode)
    .filter((n) => outgoing(ir, n.id).length === 0)
    .map((n) => n.id);
}
