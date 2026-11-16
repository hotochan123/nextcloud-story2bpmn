import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { tell, Move } from '../../src/core/story.js';
import { read, asSourceText } from '../../src/core/readBack.js';
import { run, emptyProcess } from '../../src/core/pipeline.js';
import { fromBpmn } from '../../src/core/fromBpmn.js';
import { toSvg, toPdf } from '../../src/core/render.js';
import { toStored, fromStored } from '../../src/core/storyFormat.js';
import { Language } from '../../src/core/language.js';
import { Node, levels, subIR, SubStep } from '../../src/core/ir.js';

// Job 397: something that can come at any time while a subprocess runs (event subprocess inside a subprocess).
type Anytime = Extract<Move, { move: 'anytime' }>;
const any = (flow: Move[] = [{ move: 'task', text: 'Prüfung abbrechen', role: 'Prüfer' }, { move: 'end', text: 'Abgebrochen' }], extra: Partial<Anytime> = {}): Move =>
  ({ move: 'anytime', text: 'Kunde zieht zurück', subtype: 'message', keepsRunning: '', subprocess: flow, ...extra });
const subFlow = (extra: Move[] = []): Move[] => [{ move: 'task', text: 'Unterlagen sichten', role: 'Prüfer' }, ...extra, { move: 'end', text: 'Geprüft' }];
const story = (inSub: Move[] = [any()], mainAny: Move[] = []): Move[] => [
  { move: 'start', text: 'Antrag geht ein', role: 'Vertrieb' },
  { move: 'task', text: 'Antrag prüfen', role: 'Vertrieb', subprocess: subFlow(inSub) },
  ...mainAny,
  { move: 'task', text: 'Bescheid senden', role: 'Vertrieb' },
  { move: 'end', text: 'Erledigt' }
];
const play = async (moves: Move[], language: Language = 'de') => {
  const g = tell(moves, language);
  const e = await run({ ir: { ...emptyProcess('P', g.ir.name, language), story: moves }, ops: g.ops });
  return { g, e };
};
const step = (nodes: Node[], id: string) => nodes.find((n) => n.id === id) as SubStep;

function pdfTexts(pdf: Uint8Array): string[] {
  let out = '';
  for (const m of Buffer.from(pdf).toString('latin1').matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    try {
      out += inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1');
    } catch {
      out += m[1];
    }
  }
  return [...out.matchAll(/<([0-9A-Fa-f]+)> Tj/g)].map((m) => Buffer.from(m[1], 'hex').toString('latin1'));
}

test('397 AK1 offered in a subprocess, not inside the flow of something that comes at any time', () => {
  const s = tell([{ move: 'start', text: 'S', role: 'A' }, { move: 'task', text: 'T', role: 'A', subprocess: [{ move: 'task', text: 'U', role: 'A' }] }]).subs![1].state;
  assert.equal(s.options.at(-1), 'anytime');
  const g = tell(story());
  const flow = g.subs![1].state.subs![1].state;
  assert.ok(!flow.options.includes('anytime'));
  const nested = tell(story([any([{ move: 'anytime', text: 'X', subtype: 'message' }])]));
  assert.ok(nested.errors.some((e) => e.includes('Jederzeit geht nicht im Ablauf von etwas, das jederzeit kommt')), nested.errors.join());
  const en = tell(story([any([{ move: 'anytime', text: 'X', subtype: 'message' }])]), 'en');
  assert.ok(en.errors.some((e) => e.includes('At any time does not work inside the flow of something that comes at any time')));
  assert.ok(tell(story([any([{ move: 'task', text: 'Y', role: 'A', subprocess: [] }])])).errors.length, 'no subprocess inside its flow');
});

test('397 AK2 the box lies in the subprocess, interrupting or not; IDs of the main flow stay', async () => {
  const without = await play(story([]));
  for (const keepsRunning of ['', 'yes'] as const) {
    const { g, e } = await play(story([any(undefined, { keepsRunning })]));
    assert.deepEqual(g.errors, []);
    assert.equal(e.ok, true, JSON.stringify(e.issues));
    const task = step(e.ir.nodes, 'Schritt_2');
    const b = step(task.subprocess.nodes, 'Schritt_2_Jederzeit_1');
    assert.deepEqual(b.anytime, { trigger: 'message', ...(keepsRunning && { keepsRunning: true }) });
    assert.ok(!task.subprocess.edges.some((x) => x.from === b.id || x.to === b.id), 'no arrows');
    assert.deepEqual(e.ir.nodes.map((n) => n.id), without.e.ir.nodes.map((n) => n.id));
    assert.deepEqual(task.subprocess.nodes.filter((n) => n.id !== b.id).map((n) => n.id), step(without.e.ir.nodes, 'Schritt_2').subprocess.nodes.map((n) => n.id));
    assert.ok(levels(e.ir).some((l) => l.id === b.id), 'its flow is a level of its own');
    assert.ok(e.positions[b.id] && e.positions[`${b.id}_Start_1`], 'laid out');
    assert.ok(b.subprocess.nodes.every((n) => n.id.startsWith('Schritt_2_Jederzeit_1_')), 'its flow carries the whole prefix');
  }
});

test('397 AK3 a flow not told to its end is an open point at the box and the task; told, a reading copy', async () => {
  for (const flow of [[], [{ move: 'task', text: 'Prüfung abbrechen', role: 'Prüfer' }] as Move[]]) {
    const { e, g } = await play(story([any(flow)]));
    assert.deepEqual(g.errors, []);
    assert.equal(e.readingCopy, false);
    const task = step(e.ir.nodes, 'Schritt_2');
    assert.ok(task.subprocess.openPoints?.some((p) => p.elementId === 'Schritt_2_Jederzeit_1'));
    assert.ok(e.ir.openPoints?.some((p) => p.elementId === 'Schritt_2'));
    assert.deepEqual(e.issues.filter((i) => i.elementId?.startsWith('Schritt_2_Jederzeit_1')), [], 'no messages of its loose ends');
  }
  const told = await play(story());
  assert.equal(told.e.readingCopy, true);
  assert.equal(told.e.ok, true);
});

test('397 AK4 story text: main flow, its JEDERZEIT, then each TEILABLAUF with its JEDERZEIT; read back the same', () => {
  const moves = story([any(), any([{ move: 'end', text: 'Beantwortet' }], { text: 'Kunde fragt nach', keepsRunning: 'yes', subtype: 'signal' })],
    [{ move: 'anytime', text: 'Storno', subtype: 'time', subprocess: [{ move: 'end', text: 'Storniert' }] }]);
  const g = tell(moves, 'de');
  assert.deepEqual(g.errors, []);
  const texts = g.storyText.map((l) => l.text);
  const at = (s: string) => texts.indexOf(s);
  assert.ok(at('JEDERZEIT zum Zeitpunkt: [Storno]:') < at('TEILABLAUF [Antrag prüfen]:'));
  assert.ok(at('TEILABLAUF [Antrag prüfen]:') < at('JEDERZEIT mit Nachricht: [Kunde zieht zurück]:'));
  assert.ok(at('JEDERZEIT mit Nachricht: [Kunde zieht zurück]:') < at('JEDERZEIT mit Signal: [Kunde fragt nach], Ablauf läuft weiter:'));
  const head = g.storyText.find((l) => l.text === 'JEDERZEIT mit Nachricht: [Kunde zieht zurück]:')!;
  assert.equal(head.sub, 1);
  assert.equal(head.any, undefined, 'the heading is a line of the subprocess');
  const inner = g.storyText.find((l) => l.text === '[@Prüfer] soll [Prüfung abbrechen].')!;
  assert.equal(inner.sub, 1);
  assert.equal(inner.any, head.move);
  for (const language of ['de', 'en'] as Language[]) {
    const text = asSourceText(tell(moves, language).storyText);
    const r = read(text, language);
    assert.deepEqual(r.errors, [], text);
    const inSub = (r.moves.find((z) => z.move === 'task' && z.subprocess) as Extract<Move, { move: 'task' }>).subprocess!;
    assert.deepEqual(inSub.filter((z) => z.move === 'anytime').map((z) => (z as Anytime).text), ['Kunde zieht zurück', 'Kunde fragt nach'], language);
    assert.deepEqual(r.moves.filter((z) => z.move === 'anytime').map((z) => (z as Anytime).text), ['Storno'], language);
    assert.deepEqual(asSourceText(tell(r.moves, language).storyText), text);
  }
});

test('397 AK4 read back: an error in the flow inside the subprocess names its line', () => {
  const text = asSourceText(tell(story()).storyText);
  const lines = text.split('\n');
  const n = lines.indexOf('ENDE: [Abgebrochen].');
  assert.ok(n > 0);
  lines[n] = 'WEITER BEI [Gibt es nicht].';
  const r = read(lines.join('\n'));
  assert.ok(r.errors.length);
  assert.equal(r.line, n + 1);
});

test('397 AK5 BPMN: event subprocess inside the subprocess with its own plane; read back the same', async () => {
  for (const keepsRunning of ['', 'yes'] as const) {
    const { e } = await play(story([any(undefined, { keepsRunning })]));
    assert.equal(e.ok, true, JSON.stringify(e.issues));
    const xml = e.xml!;
    assert.match(xml, /<bpmn:subProcess id="Schritt_2" name="Antrag prüfen">[^]*<bpmn:subProcess id="Schritt_2_Jederzeit_1" name="Kunde zieht zurück" triggeredByEvent="true">[^]*<\/bpmn:subProcess>[^]*<\/bpmn:subProcess>/);
    assert.equal(/isInterrupting="false"/.test(xml), keepsRunning === 'yes');
    assert.match(xml, /<bpmndi:BPMNPlane id="Schritt_2_Jederzeit_1_plane" bpmnElement="Schritt_2_Jederzeit_1">/);
    const back = await fromBpmn(xml);
    assert.deepEqual(back.ir.nodes, e.ir.nodes);
    for (const id of Object.keys(e.positions)) if (id.startsWith('Schritt_2_Jederzeit_1')) assert.deepEqual(back.positions[id], e.positions[id], id);
    const again = await run({ ir: back.ir, ops: [], positions: back.positions });
    assert.equal(again.ok, true, JSON.stringify(again.issues));
  }
});

test('397 risk: a foreign file nested deeper stays flat while reading', async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="x">
  <bpmn:process id="P" isExecutable="false">
    <bpmn:startEvent id="S"><bpmn:outgoing>f1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:subProcess id="Sub"><bpmn:incoming>f1</bpmn:incoming><bpmn:outgoing>f2</bpmn:outgoing>
      <bpmn:subProcess id="Plain"><bpmn:subProcess id="Deep" triggeredByEvent="true"><bpmn:startEvent id="DS"/></bpmn:subProcess></bpmn:subProcess>
      <bpmn:subProcess id="Any" triggeredByEvent="true"><bpmn:startEvent id="AS"/>
        <bpmn:subProcess id="Deeper" triggeredByEvent="true"><bpmn:startEvent id="XS"/></bpmn:subProcess>
        <bpmn:subProcess id="Box"><bpmn:startEvent id="BS"/></bpmn:subProcess>
      </bpmn:subProcess>
    </bpmn:subProcess>
    <bpmn:endEvent id="E"><bpmn:incoming>f2</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="f1" sourceRef="S" targetRef="Sub"/>
    <bpmn:sequenceFlow id="f2" sourceRef="Sub" targetRef="E"/>
  </bpmn:process>
</bpmn:definitions>`;
  const back = await fromBpmn(xml);
  const sub = step(back.ir.nodes, 'Sub');
  const plain = sub.subprocess.nodes.find((n) => n.id === 'Plain') as Extract<Node, { kind: 'step' }>;
  assert.ok(!plain.subprocess, 'a subprocess in a subprocess stays a plain task');
  const anyBox = step(sub.subprocess.nodes, 'Any');
  assert.ok(anyBox.anytime);
  for (const id of ['Deeper', 'Box']) {
    const n = anyBox.subprocess.nodes.find((x) => x.id === id) as Extract<Node, { kind: 'step' }>;
    assert.ok(n && !n.subprocess && !n.anytime, `${id} stays a plain task`);
  }
  await run({ ir: back.ir, ops: [], positions: back.positions });
});

test('397 AK6 legend of the subprocess page, a page of its own in the reading copy', async () => {
  const { g, e } = await play(story([any(), any([{ move: 'end', text: 'Beantwortet' }], { text: 'Kunde fragt nach', keepsRunning: 'yes' })]));
  assert.equal(e.ok, true, JSON.stringify(e.issues));
  const task = step(e.ir.nodes, 'Schritt_2');
  const svg = toSvg(subIR(e.ir, task), e.positions, { inSubprocess: true });
  assert.match(svg, />Jederzeit möglich, bricht den Teilablauf ab</);
  assert.match(svg, />Jederzeit möglich, Ablauf läuft weiter</);
  assert.doesNotMatch(svg, />Jederzeit möglich, bricht alles ab</);
  const en = await play(story([any()]), 'en');
  assert.match(toSvg(subIR(en.e.ir, step(en.e.ir.nodes, 'Schritt_2')), en.e.positions, { inSubprocess: true }), />At any time, stops the subprocess</);
  const main = await play([...story([]).slice(0, 2), any(), ...story([]).slice(2)]);
  assert.match(toSvg(main.e.ir, main.e.positions), />Jederzeit möglich, bricht alles ab</, 'main flow as before');
  const { PDFDocument } = await import('pdf-lib');
  const bytes = await toPdf(e.ir, e.positions, { told: asSourceText(g.storyText) });
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 5, 'main flow, subprocess, two flows inside it, story text');
  const texts = pdfTexts(bytes);
  assert.ok(texts.includes('Jederzeit: Kunde zieht zurück') && texts.includes('Jederzeit: Kunde fragt nach'));
  assert.ok(texts.includes('siehe Seite 2') && texts.includes('siehe Seite 3') && texts.includes('siehe Seite 4'));
  assert.equal(texts.filter((x) => /^gehört zu .Antrag prüfen., Seite 2, Bahn Prüfer$/.test(x)).length, 2, texts.filter((x) => x.startsWith('gehört')).join(' | '));
  assert.ok(texts.includes('Jederzeit möglich, bricht den Teilablauf ab'));
});

test('397 AK8 stored moves come back the same', () => {
  const moves = story([any(undefined, { keepsRunning: 'yes', subtype: 'time' })]);
  assert.deepEqual(fromStored(toStored(moves)), moves);
  const stored = toStored(moves) as Record<string, unknown>[];
  assert.match(JSON.stringify(stored[1]), /"zug":"jederzeit"/);
});
