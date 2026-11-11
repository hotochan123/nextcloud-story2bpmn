import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../src/core/pipeline.js';
import { sizeOf, wrap, TASK_CHARS } from '../../src/core/layout.js';
import { ProcessIR, PositionMap } from '../../src/core/ir.js';
import { baseProcess, changeOps } from './fixtures.js';

/**
 * Finds nodes whose boxes overlap. This shows up neither in the XML file nor in
 * the linter - only in the drawn picture. There was no test for it, and that is
 * exactly why the clarification case sat on top of the start.
 */
function overlaps(ir: ProcessIR, positions: PositionMap): string[] {
  const boxes = ir.nodes
    .filter((n) => positions[n.id])
    .map((n) => ({ id: n.id, ...positions[n.id], ...sizeOf(n) }));

  const hits: string[] = [];
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      // Exception paths deliberately sit on the edge of their task.
      const exceptionPath = ir.nodes.find(
        (n) =>
          n.kind === 'exception' &&
          ((n.id === a.id && n.attachedTo === b.id) || (n.id === b.id && n.attachedTo === a.id))
      );
      if (exceptionPath) continue;

      const x = a.x < b.x + b.w && b.x < a.x + a.w;
      const y = a.y < b.y + b.h && b.y < a.y + a.h;
      if (x && y) hits.push(`${a.id} ⟂ ${b.id}`);
    }
  return hits;
}

test('a freshly laid-out diagram has no overlapping nodes', async () => {
  const res = await run({ ir: baseProcess(), ops: changeOps });
  assert.deepEqual(overlaps(res.ir, res.positions), []);
});

/**
 * KNOWN LIMIT, recorded on purpose: if a node is inserted in the middle of the chain,
 * the successor keeps its old column - and the new node wants exactly that spot.
 * "The diagram never jumps" and "nothing overlaps" cannot both hold at this point.
 *
 * The test records WHAT holds, not what would be nice: the overlap only affects
 * nodes from the insertion point on. If it fails, someone changed the trade-off -
 * then the test has to change too.
 */
test('inserting step by step into the middle can overlap - only there', async () => {
  const first = await run({ ir: baseProcess(), ops: [] });
  const res = await run({ ir: first.ir, ops: changeOps, positions: first.positions });

  const hits = overlaps(res.ir, res.positions);
  const untouched = ['Start_1', 'Task_pruefen'];
  for (const t of hits)
    for (const id of untouched)
      assert.ok(!t.includes(id), `${id} liegt vor der Einfügestelle und darf nicht betroffen sein`);
});

/**
 * The building-block path writes whole sentences into the task name ("who, with what,
 * by when"). With a fixed box height the text spilled out at the top and bottom -
 * visible only in the picture, not in the XML file. What is checked is the promise,
 * not the looks: the wrapped text fits into the box.
 */
test('a long task name fits into its box', async () => {
  const lang =
    'Die Buchhaltung prüft die Rechnung formal und rechnerisch in SAP, innerhalb von drei Arbeitstagen.';
  const ir: ProcessIR = {
    id: 'P',
    name: 'P',
    version: 0,
    lanes: [{ id: 'Lane_buha', name: 'Buchhaltung' }],
    nodes: [
      { id: 'Start_1', kind: 'start', name: 'Rechnung', laneId: 'Lane_buha' },
      { id: 'Task_lang', kind: 'step', name: lang, laneId: 'Lane_buha' },
      { id: 'End_1', kind: 'end', name: 'Bezahlt', laneId: 'Lane_buha' }
    ],
    edges: [
      { id: 'e1', from: 'Start_1', to: 'Task_lang' },
      { id: 'e2', from: 'Task_lang', to: 'End_1' }
    ]
  };

  const res = await run({ ir, ops: [] });
  assert.equal(res.ok, true, JSON.stringify(res.issues, null, 2));

  const frameBox = sizeOf(res.ir.nodes.find((n) => n.id === 'Task_lang')!);
  const lines = wrap(lang, TASK_CHARS).length;
  assert.ok(lines > 5, `Testdaten zu kurz: nur ${lines} Zeilen`);
  // 14px per line, see layout.ts. Without padding it would be exactly flush.
  assert.ok(
    frameBox.h >= lines * 14,
    `Kasten ${frameBox.h}px zu niedrig für ${lines} Zeilen (${lines * 14}px Text)`
  );
  assert.deepEqual(overlaps(res.ir, res.positions), []);
});

/** Two tall boxes in different lanes must not touch. */
test('tall boxes push the lanes apart', async () => {
  const lang = (who: string) =>
    `${who} prüft die Rechnung formal und rechnerisch in SAP, innerhalb von drei Arbeitstagen.`;
  const ir: ProcessIR = {
    id: 'P',
    name: 'P',
    version: 0,
    lanes: [
      { id: 'Lane_a', name: 'Buchhaltung' },
      { id: 'Lane_b', name: 'Leitung' }
    ],
    nodes: [
      { id: 'Start_1', kind: 'start', name: 'Rechnung', laneId: 'Lane_a' },
      { id: 'Task_a', kind: 'step', name: lang('Die Buchhaltung'), laneId: 'Lane_a' },
      { id: 'Task_b', kind: 'step', name: lang('Die Leitung'), laneId: 'Lane_b' },
      { id: 'End_1', kind: 'end', name: 'Bezahlt', laneId: 'Lane_b' }
    ],
    edges: [
      { id: 'e1', from: 'Start_1', to: 'Task_a' },
      { id: 'e2', from: 'Task_a', to: 'Task_b' },
      { id: 'e3', from: 'Task_b', to: 'End_1' }
    ]
  };

  const res = await run({ ir, ops: [] });
  assert.equal(res.ok, true, JSON.stringify(res.issues, null, 2));
  assert.deepEqual(overlaps(res.ir, res.positions), []);
});

test('a task reachable only via the exception path stands to the right of its trigger', async () => {
  const res = await run({ ir: baseProcess(), ops: changeOps });
  const numbers = res.positions['Task_zahlen'];
  const clarification = res.positions['Task_klaerfall'];
  assert.ok(clarification.x > numbers.x, `Klärfall steht bei ${clarification.x}, Zahlung bei ${numbers.x}`);
});
