import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tell, Move } from '../../src/core/story.js';
import { read, asSourceText } from '../../src/core/readBack.js';
import { run, emptyProcess } from '../../src/core/pipeline.js';
import { fromBpmn } from '../../src/core/fromBpmn.js';
import { scene, toSvg, toPdf } from '../../src/core/render.js';
import { toStored, fromStored } from '../../src/core/storyFormat.js';
import { Language } from '../../src/core/language.js';
import { Node, ProcessIR, levels } from '../../src/core/ir.js';

// Job 390: a step that runs for each item, one after another or at the same time (BPMN multi-instance).
const story = (order: 'sequential' | 'parallel' = 'sequential', extra: Partial<Extract<Move, { move: 'task' }>> = {}): Move[] => [
  { move: 'start', text: 'Rechnung eingegangen', role: 'Buchhaltung', subtype: '' },
  { move: 'task', text: 'Position prüfen', role: 'Buchhaltung', each: 'Rechnungsposition', eachOrder: order, ...extra },
  { move: 'end', text: 'Rechnung geprüft', subtype: '' }
];
const inner: Move[] = [
  { move: 'task', text: 'Gutachten anfordern', role: 'Gutachter', each: 'Gutachter', eachOrder: 'parallel' },
  { move: 'end', text: 'Gutachten da', subtype: '' }
];

const play = async (moves: Move[], language: Language = 'de') => {
  const g = tell(moves, language);
  const e = await run({ ir: { ...emptyProcess('P', g.ir.name, language), story: moves }, ops: g.ops });
  return { g, e };
};
const step = (ir: ProcessIR, name: string) =>
  levels(ir).flatMap((l) => l.nodes).find((n) => n.name === name && n.kind === 'step') as Extract<Node, { kind: 'step' }>;
const lines = (g: ReturnType<typeof tell>) => g.storyText.map((l) => l.text);

test('390 AK1 the step carries forEach and the story text names it, DE and EN', async () => {
  const { g, e } = await play(story());
  assert.deepEqual(g.errors, []);
  assert.deepEqual(step(e.ir, 'Position prüfen').forEach, { item: 'Rechnungsposition' });
  assert.ok(lines(g).includes('[@Buchhaltung] soll [Position prüfen], FÜR JEDE [Rechnungsposition], NACHEINANDER.'));
  const p = tell(story('parallel'), 'en');
  assert.deepEqual(step(p.ir, 'Position prüfen').forEach, { item: 'Rechnungsposition', parallel: true });
  assert.ok(lines(p).includes('[@Buchhaltung] shall [Position prüfen], FOR EACH [Rechnungsposition], IN PARALLEL.'));
  assert.equal(e.ok, true, JSON.stringify(e.issues));
  // Without eachOrder: one after another.
  const plain = tell([story()[0], { move: 'task', text: 'X', role: 'Buchhaltung', each: 'Stück' }]);
  assert.deepEqual(step(plain.ir, 'X').forEach, { item: 'Stück' });
});

test('390 AK1 with all extras, with a subprocess and inside a subprocess', async () => {
  const moves = story('parallel', { system: 'SAP', documentName: 'Rechnung', deadline: '3 Tage', subprocess: inner });
  const { g, e } = await play(moves);
  assert.deepEqual(g.errors, []);
  assert.ok(lines(g).includes('[@Buchhaltung] soll [Position prüfen] in [#SAP] mit [+Rechnung], Frist [!3 Tage], FÜR JEDE [Rechnungsposition], GLEICHZEITIG, MIT TEILABLAUF.'));
  const s = step(e.ir, 'Position prüfen');
  assert.ok(s.subprocess);
  assert.deepEqual(s.forEach, { item: 'Rechnungsposition', parallel: true });
  assert.deepEqual(step(e.ir, 'Gutachten anfordern').forEach, { item: 'Gutachter', parallel: true });
  assert.equal(e.ok, true, JSON.stringify(e.issues));
});

test('390 AK1 an empty item or an unknown order is an error of the story', () => {
  for (const each of ['', '  ', '[]'])
    assert.deepEqual(tell(story('sequential', { each })).errors, ['Für jedes Stück braucht, wofür es gilt']);
  assert.deepEqual(tell(story('sequential', { each: 5 as unknown as string }), 'en').errors, ['For each needs what it applies to']);
  assert.deepEqual(tell(story('sideways' as 'parallel')).errors, ['Nacheinander oder gleichzeitig?']);
});

test('390 AK2 the story text reads back to the same moves, DE and EN', () => {
  const cases: Move[][] = [
    story(),
    story('parallel'),
    story('parallel', { system: 'SAP', documentName: 'Rechnung, Lieferschein', deadline: '3 Tage' }),
    story('sequential', { subprocess: inner }),
    // A name that looks like the signal words: still read back to the same moves.
    story('sequential', { text: 'FÜR JEDE Zeile prüfen', each: 'Position, NACHEINANDER' })
  ];
  for (const language of ['de', 'en'] as const)
    for (const moves of cases) {
      const g = tell(moves, language);
      assert.deepEqual(g.errors, []);
      const r = read(asSourceText(g.storyText), language);
      assert.deepEqual(r.errors, [], asSourceText(g.storyText));
      assert.deepEqual(r.moves, moves, asSourceText(g.storyText));
    }
});

test('390 AK3 stored as fuerJede / reihenfolge and back', () => {
  const moves = story('parallel', { subprocess: inner });
  const stored = toStored(moves) as Record<string, unknown>[];
  assert.equal(stored[1]['fuerJede'], 'Rechnungsposition');
  assert.equal(stored[1].reihenfolge, 'gleichzeitig');
  assert.equal((stored[1].teilablauf as Record<string, unknown>[])[0].reihenfolge, 'gleichzeitig');
  assert.equal((toStored(story()) as Record<string, unknown>[])[1].reihenfolge, 'nacheinander');
  assert.deepEqual(fromStored(stored), moves);
});

test('390 AK4 BPMN: multi-instance with isSequential and the item line, read back', async () => {
  // isSequential false is the BPMN default, so moddle leaves it out.
  for (const [order, sequential] of [['sequential', ' isSequential="true"'], ['parallel', '']] as const) {
    const { e } = await play(story(order, order === 'parallel' ? { subprocess: inner } : {}));
    assert.equal(e.ok, true, JSON.stringify(e.issues));
    const xml = e.xml!;
    assert.match(xml, new RegExp(`<bpmn:multiInstanceLoopCharacteristics id="[^"]+_each"${sequential} />`));
    assert.match(xml, /Für jede: Rechnungsposition/);
    const back = await fromBpmn(xml);
    assert.deepEqual(step(back.ir, 'Position prüfen').forEach, step(e.ir, 'Position prüfen').forEach);
    assert.equal(step(back.ir, 'Position prüfen').details, undefined, 'the item line is no description');
    if (order === 'parallel') assert.deepEqual(step(back.ir, 'Gutachten anfordern').forEach, { item: 'Gutachter', parallel: true });
  }
});

const foreign = (loop: string, doc = '') => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" id="d" targetNamespace="x">
  <bpmn:process id="P" name="Fremd">
    <bpmn:startEvent id="s" />
    <bpmn:task id="t" name="Prüfen">${doc}${loop}</bpmn:task>
    <bpmn:endEvent id="e" />
    <bpmn:sequenceFlow id="f1" sourceRef="s" targetRef="t" />
    <bpmn:sequenceFlow id="f2" sourceRef="t" targetRef="e" />
  </bpmn:process>
</bpmn:definitions>`;

test('390 AK4 foreign files: multi-instance without item line, with cardinality, a standard loop', async () => {
  const t = async (xml: string) => step((await fromBpmn(xml)).ir, 'Prüfen');
  assert.deepEqual((await t(foreign('<bpmn:multiInstanceLoopCharacteristics />'))).forEach, { item: '', parallel: true });
  const camunda = foreign('<bpmn:multiInstanceLoopCharacteristics isSequential="true"><bpmn:loopCardinality xsi:type="bpmn:tFormalExpression">3</bpmn:loopCardinality><bpmn:completionCondition xsi:type="bpmn:tFormalExpression">done</bpmn:completionCondition></bpmn:multiInstanceLoopCharacteristics>', '<bpmn:documentation>For each: reviewer</bpmn:documentation>');
  assert.deepEqual((await t(camunda)).forEach, { item: 'reviewer' });
  assert.equal((await t(foreign('<bpmn:standardLoopCharacteristics />'))).forEach, undefined);
});

/** Two-point lines of a step's group (the bars), as [x1, y1, x2, y2]. */
const barsOf = (ir: ProcessIR, positions: Record<string, { x: number; y: number }>, id: string) => {
  const s = scene(ir, positions);
  const g = s.groups.find((x) => x.node === id)!;
  return s.prims.slice(g.start, g.end).filter((p) => p.t === 'poly' && p.pts.length === 2 && p.sw === 1.25) as Extract<typeof s.prims[number], { t: 'poly' }>[];
};

test('390 AK5 three lying bars one after another, three standing ones at the same time, a grey line', async () => {
  for (const order of ['sequential', 'parallel'] as const) {
    const { e } = await play(story(order));
    const s = step(e.ir, 'Position prüfen');
    const bars = barsOf(e.ir, e.positions, s.id);
    assert.equal(bars.length, 3, order);
    for (const b of bars) {
      const [a, z] = b.pts;
      if (order === 'sequential') assert.ok(a.y === z.y && Math.abs(z.x - a.x) === 12, JSON.stringify(b.pts));
      else assert.ok(a.x === z.x && Math.abs(z.y - a.y) === 12, JSON.stringify(b.pts));
    }
    assert.match(toSvg(e.ir, e.positions), />je Rechnungsposition</);
  }
});

test('390 AK5 with a subprocess: bars left, plus right, no overlap', async () => {
  const { e } = await play(story('parallel', { subprocess: inner }));
  const s = step(e.ir, 'Position prüfen');
  const sc = scene(e.ir, e.positions);
  const g = sc.groups.find((x) => x.node === s.id)!;
  const prims = sc.prims.slice(g.start, g.end);
  const plus = prims.find((p) => p.t === 'rect' && p.w === 14) as Extract<typeof prims[number], { t: 'rect' }>;
  assert.ok(plus, 'plus box');
  const bars = barsOf(e.ir, e.positions, s.id).filter((b) => b.pts[0].x === b.pts[1].x && Math.abs(b.pts[0].y - b.pts[1].y) === 12);
  assert.equal(bars.length, 3);
  const right = Math.max(...bars.map((b) => b.pts[0].x));
  assert.ok(right < plus.x, `bars end ${right} before plus at ${plus.x}`);
  const box = prims.find((p) => p.t === 'rect' && p.w > 14) as Extract<typeof prims[number], { t: 'rect' }>;
  const mid = box.x + box.w / 2;
  assert.ok(Math.abs((Math.min(...bars.map((b) => b.pts[0].x)) - 4 + plus.x + 14) / 2 - mid) < 1.5, 'the pair is centred');
});

test('390 AK5 legend: exactly the kinds that occur', async () => {
  const words = async (moves: Move[]) => {
    const { e } = await play(moves);
    return ['Für jedes Stück, nacheinander', 'Für jedes Stück, gleichzeitig'].filter((w) => toSvg(e.ir, e.positions).includes(`>${w}<`));
  };
  assert.deepEqual(await words(story()), ['Für jedes Stück, nacheinander']);
  assert.deepEqual(await words(story('parallel')), ['Für jedes Stück, gleichzeitig']);
  assert.deepEqual(await words([story()[0], { move: 'task', text: 'X', role: 'B' }, { move: 'end', text: 'Y' }]), []);
});

test('390 risk: markup in the item is escaped in the SVG and the PDF is written', async () => {
  const { e } = await play(story('sequential', { each: '<script>&x' }));
  const svg = toSvg(e.ir, e.positions);
  assert.ok(!svg.includes('<script>'));
  assert.match(svg, /je &lt;script&gt;&amp;x/);
  const pdf = await toPdf(e.ir, e.positions);
  assert.equal(Buffer.from(pdf.slice(0, 5)).toString(), '%PDF-');
});
