import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../src/core/pipeline.js';
import { applyOps } from '../../src/core/apply.js';
import { validateIR } from '../../src/core/validate.js';
import { layout } from '../../src/core/layout.js';
import { toPromptFeedback } from '../../src/core/lint.js';
import { baseProcess, changeOps, unknownLaneOps } from './fixtures.js';

test('base process gives valid BPMN', async () => {
  const res = await run({ ir: baseProcess(), ops: [] });
  assert.equal(res.issues.length, 0, JSON.stringify(res.issues, null, 2));
  assert.equal(res.ok, true);
  assert.match(res.xml!, /bpmn:task/i);
  assert.doesNotMatch(res.xml!, /zeebe:/);
});

test('extra details end up as plain text in the diagram', async () => {
  const res = await run({ ir: baseProcess(), ops: [] });
  assert.match(res.xml!, /System: SAP/);
  assert.match(res.xml!, /Dokumente: Rechnung/);
  assert.match(res.xml!, /Frist: innerhalb von 3 Arbeitstagen/);
});

test('a change runs through the whole pipeline', async () => {
  const first = await run({ ir: baseProcess(), ops: [] });
  const res = await run({ ir: first.ir, ops: changeOps, positions: first.positions });
  assert.equal(res.ok, true, JSON.stringify(res.issues, null, 2));
  assert.equal(res.ir.version, 2);
  assert.ok(res.ir.nodes.some((n) => n.id === 'Task_freigabe'));
  assert.match(res.xml!, /Zahlung abgelehnt/);
});

test('unchanged nodes keep their position', async () => {
  const first = await run({ ir: baseProcess(), ops: [] });
  const second = await run({ ir: first.ir, ops: changeOps, positions: first.positions });

  for (const id of ['Start_1', 'Task_pruefen', 'Task_zahlen', 'End_1']) {
    assert.deepEqual(second.positions[id], first.positions[id], `${id} ist verrutscht`);
  }
  assert.ok(second.positions['Task_freigabe'], 'neuer Knoten hat keine Position');
});

test('an invented lane is caught before the XML is generated', async () => {
  const res = await run({ ir: baseProcess(), ops: unknownLaneOps });
  assert.equal(res.ok, false);
  assert.equal(res.stage, 'validate');
  const rules = res.issues.map((i) => i.rule);
  assert.ok(rules.includes('unknown-lane'), JSON.stringify(rules));
  assert.match(toPromptFeedback(res.issues), /Lane_einkauf/);
});

test('ambiguous deletion is rejected instead of guessed', () => {
  const ir = baseProcess();
  const withGw = applyOps(ir, [changeOps[0], changeOps[1]]).ir;
  const { issues } = applyOps(withGw, [{ op: 'deleteNode', id: 'Gateway_betrag', rewire: 'connect' }]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].rule, 'ambiguous-delete');
});

test('a branch at the decision without a condition is noticed', () => {
  const ir = applyOps(baseProcess(), [changeOps[0], changeOps[1]]).ir;
  const issues = validateIR(ir);
  assert.ok(issues.some((i) => i.rule === 'missing-condition'), JSON.stringify(issues));
});

test('an unreachable node is detected', () => {
  const ir = baseProcess();
  ir.nodes.push({ id: 'Task_waise', kind: 'step', name: 'Waise', laneId: 'Lane_buha' });
  const issues = validateIR(ir);
  assert.ok(issues.some((i) => i.rule === 'unreachable'));
});

test('an exception path attaches only to tasks', () => {
  const { issues } = applyOps(baseProcess(), [
    {
      op: 'attachException',
      nodeId: 'Start_1',
      event: {
        id: 'Exception_x',
        kind: 'exception',
        name: 'geht nicht',
        attachedTo: 'Start_1',
        trigger: 'deadline'
      }
    }
  ]);
  assert.equal(issues[0].rule, 'invalid-host');
});

test('layout is deterministic', () => {
  const ir = baseProcess();
  assert.deepEqual(layout(ir), layout(ir));
});

test('setLane assigns an existing node to a lane', () => {
  const ir = baseProcess();
  const { ir: added, issues } = applyOps(ir, [
    { op: 'setLane', nodeId: 'Task_zahlen', laneId: 'Lane_fk' }
  ]);
  assert.deepEqual(issues, []);
  const n = added.nodes.find((x) => x.id === 'Task_zahlen')!;
  assert.equal(n.kind !== 'exception' && n.laneId, 'Lane_fk');
});

test('setLane rejects an unknown lane and an unknown node', () => {
  const a = applyOps(baseProcess(), [
    { op: 'setLane', nodeId: 'Task_zahlen', laneId: 'Lane_gibtsnicht' }
  ]);
  assert.equal(a.issues[0].rule, 'unknown-lane');

  const b = applyOps(baseProcess(), [{ op: 'setLane', nodeId: 'Task_weg', laneId: 'Lane_fk' }]);
  assert.equal(b.issues[0].rule, 'unknown-element');
});

test('setLane rejects exception paths - they inherit the lane of their task', () => {
  const withExceptionPath = applyOps(baseProcess(), [changeOps[3]]).ir;
  const { issues } = applyOps(withExceptionPath, [
    { op: 'setLane', nodeId: 'Exception_abgelehnt', laneId: 'Lane_fk' }
  ]);
  assert.equal(issues[0].rule, 'wrong-kind');
});
