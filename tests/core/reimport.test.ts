import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../src/core/pipeline.js';
import { fromBpmn, readDocumentation } from '../../src/core/fromBpmn.js';
import { documentationText } from '../../src/core/toBpmn.js';
import { baseProcess, changeOps } from './fixtures.js';

const rounded = (p: Record<string, { x: number; y: number }>) =>
  Object.fromEntries(
    Object.entries(p).map(([id, v]) => [id, { x: Math.round(v.x), y: Math.round(v.y) }])
  );

test('a simple process survives writing and reading back in', async () => {
  const first = await run({ ir: baseProcess(), ops: [] });
  const { ir } = await fromBpmn(first.xml!);
  assert.deepEqual(ir, first.ir);
});

test('positions come back unchanged', async () => {
  const first = await run({ ir: baseProcess(), ops: [] });
  const { positions } = await fromBpmn(first.xml!);
  assert.deepEqual(positions, rounded(first.positions));
});

test('decision, default path and exception path survive', async () => {
  const first = await run({ ir: baseProcess(), ops: [] });
  const second = await run({ ir: first.ir, ops: changeOps, positions: first.positions });
  assert.equal(second.ok, true, JSON.stringify(second.issues, null, 2));

  const { ir } = await fromBpmn(second.xml!);
  assert.deepEqual(ir, second.ir);

  const exceptionPath = ir.nodes.find((n) => n.id === 'Exception_abgelehnt');
  assert.equal(exceptionPath?.kind === 'exception' && exceptionPath.attachedTo, 'Task_zahlen');
  assert.ok(ir.edges.some((e) => e.from === 'Gateway_betrag' && e.isDefault));
  assert.ok(ir.edges.some((e) => e.condition === 'ja'));
});

test('a state read back in runs through the pipeline again unchanged', async () => {
  const first = await run({ ir: baseProcess(), ops: [] });
  const second = await run({ ir: first.ir, ops: changeOps, positions: first.positions });
  const back = await fromBpmn(second.xml!);

  const third = await run({ ir: back.ir, ops: [], positions: back.positions });
  assert.equal(third.ok, true, JSON.stringify(third.issues, null, 2));
  // Nothing shifted: that is exactly the purpose of reading back in.
  assert.deepEqual(rounded(third.positions), rounded(second.positions));
});

test('open points come back as open points, not as a description', async () => {
  const ir = baseProcess();
  const withOpen = await run({
    ir,
    ops: [
      {
        op: 'addOpenPoint',
        point: {
          id: 'Offen_frist',
          elementId: 'Task_zahlen',
          field: 'Frist',
          assumption: 'zwei Arbeitstage',
          question: 'Bis wann muss die Zahlung angewiesen sein?'
        }
      }
    ]
  });
  assert.equal(withOpen.readingCopy, false);

  const { ir: back } = await fromBpmn(withOpen.xml!);
  assert.equal(back.openPoints?.length, 1);
  const p = back.openPoints![0];
  assert.equal(p.elementId, 'Task_zahlen');
  assert.equal(p.question, 'Bis wann muss die Zahlung angewiesen sein?');
  assert.equal(p.assumption, 'zwei Arbeitstage');

  // The open point must not end up as an extra detail in the task.
  const nodes = back.nodes.find((n) => n.id === 'Task_zahlen');
  assert.equal(nodes?.kind === 'step' && nodes.details?.description, undefined);
  assert.equal(nodes?.kind === 'step' && nodes.details?.system, 'Online-Banking');

  // And the block also applies after reading back in.
  const again = await run({ ir: back, ops: [] });
  assert.equal(again.readingCopy, false);
});

test('extra details: an English preamble is read back the same way', () => {
  const details = { system: 'SAP', documents: ['Invoice', 'Order'], deadline: '3 days' };
  const text = documentationText(details, [{ id: 'o', question: 'Who approves?', assumption: 'Manager' }], 'en');
  assert.match(text, /^Documents: /m);
  assert.deepEqual(readDocumentation({ documentation: [{ text }] }), {
    details,
    open: [{ question: 'Who approves?', assumption: 'Manager' }]
  });
});
