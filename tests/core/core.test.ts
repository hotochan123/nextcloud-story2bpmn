import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyProcess, run } from '../../src/core/pipeline.js';
import { applyOps } from '../../src/core/apply.js';
import { baseProcess, scratchOps } from './fixtures.js';

// Core tests from the earlier draft.test.ts - they check the pipeline and ops,
// not the (removed) AI connection.

test('exception path without a following task is caught before the linter', async () => {
  const res = await run({
    ir: emptyProcess('B', 'B'),
    ops: [
      ...scratchOps,
      {
        op: 'attachException',
        nodeId: 'Task_packen',
        event: {
          id: 'Exception_leer',
          kind: 'exception',
          name: 'Ware beschädigt',
          attachedTo: 'Task_packen',
          trigger: 'error'
        }
      }
    ]
  });

  assert.equal(res.ok, false);
  assert.equal(res.stage, 'validate', 'muss vor dem Linter greifen');
  assert.ok(
    res.issues.some((i) => i.rule === 'exception-without-followup'),
    JSON.stringify(res.issues.map((i) => i.rule))
  );
});

test('a missing lane is filled in from an unambiguous neighbourhood', async () => {
  const ops = [...scratchOps];
  ops[2] = { op: 'addNode', node: { id: 'Start_1', kind: 'start', name: 'Bestellung eingegangen' } };
  const res = await run({ ir: emptyProcess('B', 'B'), ops });

  assert.equal(res.ok, true, JSON.stringify(res.issues, null, 2));
  const start = res.ir.nodes.find((n) => n.id === 'Start_1')!;
  assert.equal((start as any).laneId, 'Lane_vertrieb', 'Bahn nicht vom Nachbarn übernommen');
});

test('an open point blocks the reading copy, not the working file', async () => {
  const withOpen = [
    ...scratchOps,
    {
      op: 'addOpenPoint' as const,
      point: {
        id: 'Offen_frist',
        elementId: 'Task_packen',
        field: 'Frist',
        assumption: 'innerhalb von 2 Arbeitstagen',
        question: 'Wie lange darf das Packen dauern?'
      }
    }
  ];
  const res = await run({ ir: emptyProcess('B', 'B'), ops: withOpen });

  assert.equal(res.ok, true, JSON.stringify(res.issues, null, 2));
  assert.ok(res.xml, 'Arbeitsdatei muss trotzdem entstehen');
  assert.equal(res.readingCopy, false, 'Leseexemplar darf nicht erlaubt sein');
  assert.match(res.xml!, /OFFEN: Wie lange darf das Packen dauern\?/);
  assert.match(res.xml!, /angenommen: innerhalb von 2 Arbeitstagen/);
});

test('a resolved point releases the reading copy', async () => {
  const first = await run({
    ir: emptyProcess('B', 'B'),
    ops: [
      ...scratchOps,
      {
        op: 'addOpenPoint',
        point: { id: 'Offen_1', assumption: 'Buchhaltung', question: 'Wer macht das?' }
      }
    ]
  });
  assert.equal(first.readingCopy, false);

  const then = await run({
    ir: first.ir,
    ops: [{ op: 'resolveOpenPoint', id: 'Offen_1' }],
    positions: first.positions
  });
  assert.equal(then.ok, true, JSON.stringify(then.issues, null, 2));
  assert.equal(then.readingCopy, true);
  assert.doesNotMatch(then.xml!, /OFFEN:/);
});

test('an open point pointing nowhere is caught', async () => {
  const res = await run({
    ir: emptyProcess('B', 'B'),
    ops: [
      ...scratchOps,
      {
        op: 'addOpenPoint',
        point: {
          id: 'Offen_x',
          elementId: 'Task_gibtsnicht',
          assumption: 'irgendwas',
          question: 'Wer?'
        }
      }
    ]
  });
  assert.equal(res.ok, false);
  assert.ok(res.issues.some((i) => i.rule === 'dangling-open-point'), JSON.stringify(res.issues));
});

test('an open point without a question is rejected', () => {
  const { issues } = applyOps(baseProcess(), [
    { op: 'addOpenPoint', point: { id: 'Offen_1', assumption: 'x', question: '' } }
  ]);
  assert.equal(issues[0].rule, 'empty-question');
});

