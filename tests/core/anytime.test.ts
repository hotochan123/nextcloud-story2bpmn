import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { tell, splice, Move } from '../../src/core/story.js';
import { read, asSourceText } from '../../src/core/readBack.js';
import { run, emptyProcess } from '../../src/core/pipeline.js';
import { fromBpmn } from '../../src/core/fromBpmn.js';
import { toSvg, toPdf } from '../../src/core/render.js';
import { toStored, fromStored } from '../../src/core/storyFormat.js';
import { layout, sizeOf } from '../../src/core/layout.js';
import { Language } from '../../src/core/language.js';
import { Node, EventKind } from '../../src/core/ir.js';

// Job 391: something that can come at any time during the main flow (BPMN event subprocess).
const cancel = (flow: Move[] = [{ move: 'task', text: 'Stornierung bestätigen', role: 'Kundendienst' }, { move: 'end', text: 'Auftrag storniert' }], extra: Partial<Extract<Move, { move: 'anytime' }>> = {}): Move =>
  ({ move: 'anytime', text: 'Kunde storniert', subtype: 'message', keepsRunning: '', subprocess: flow, ...extra });
const main: Move[] = [
  { move: 'start', text: 'Auftrag geht ein', role: 'Vertrieb' },
  { move: 'task', text: 'Auftrag prüfen', role: 'Vertrieb' },
  { move: 'task', text: 'Ware liefern', role: 'Lager' },
  { move: 'end', text: 'Auftrag erledigt' }
];
const story = (a: Move = cancel(), at = 2): Move[] => [...main.slice(0, at), a, ...main.slice(at)];

const play = async (moves: Move[], language: Language = 'de') => {
  const g = tell(moves, language);
  const e = await run({ ir: { ...emptyProcess('P', g.ir.name, language), story: moves }, ops: g.ops });
  return { g, e };
};
const box = (nodes: Node[]) => nodes.find((n) => n.kind === 'step' && n.anytime) as Extract<Node, { kind: 'step' }>;

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

test('391 AK1 a box without arrows whose flow begins with the trigger; IDs do not depend on where the move stands', async () => {
  const { g, e } = await play(story());
  assert.deepEqual(g.errors, []);
  assert.equal(g.done, true);
  const b = box(e.ir.nodes);
  assert.equal(b.id, 'Jederzeit_1');
  assert.deepEqual(b.anytime, { trigger: 'message' });
  assert.ok(!e.ir.edges.some((x) => x.from === b.id || x.to === b.id), 'no arrows');
  const start = b.subprocess!.nodes.find((n) => n.kind === 'start')!;
  assert.equal(start.kind === 'start' && start.subtype, 'message');
  assert.equal(start.name, 'Kunde storniert');
  assert.equal(b.laneId, e.ir.lanes.find((l) => l.name === 'Vertrieb')!.id, 'role not in the main flow: lane of the trigger');
  assert.equal(e.ok, true, JSON.stringify(e.issues));
  assert.equal(e.readingCopy, true);
  for (const at of [1, 3, 4]) {
    const o = await play(story(cancel(), at));
    assert.deepEqual(o.g.errors, []);
    assert.deepEqual(o.e.ir.nodes.map((n) => n.id), e.ir.nodes.map((n) => n.id), `at ${at}`);
    assert.deepEqual(o.g.storyText.map((l) => l.text), g.storyText.map((l) => l.text), `at ${at}`);
  }
});

test('391 AK1 the box sits in the lane of the role that handles it first, when the main flow has that lane', async () => {
  const { e } = await play(story(cancel([{ move: 'task', text: 'Lieferung stoppen', role: 'Lager' }, { move: 'end', text: 'Gestoppt' }])));
  assert.equal(box(e.ir.nodes).laneId, e.ir.lanes.find((l) => l.name === 'Lager')!.id);
});

test('391 AK2 offered as the last option on the main level and (job 397) in a subprocess; errors where it does not fit', () => {
  assert.equal(tell(main.slice(0, 2)).options.at(-1), 'anytime');
  assert.ok(!tell([]).options.includes('anytime'));
  assert.deepEqual(tell(story()).options, [], 'done: nothing offered');
  const sub = tell([{ move: 'start', text: 'S', role: 'A' }, { move: 'task', text: 'T', role: 'A', subprocess: [] }]).subs![1].state;
  assert.equal(sub.options.at(-1), 'anytime', 'also inside a subprocess (job 397)');
  assert.ok(!tell(story()).subs![2].state.options.includes('anytime'), 'not inside its own flow');
  assert.ok(tell([cancel()]).errors.length, 'before the trigger');
  assert.deepEqual(tell([main[0], { move: 'task', text: 'T', role: 'A', subprocess: [cancel()] }]).errors, [], 'inside a subprocess (job 397)');
  assert.ok(tell([main[0], cancel([], { text: ' ' })]).errors.length, 'empty text');
  assert.ok(tell([main[0], cancel([], { subtype: 'error' as EventKind })]).errors.length, 'unknown kind');
  assert.ok(tell([main[0], cancel([], { keepsRunning: 'maybe' as '' })]).errors.length, 'unknown keepsRunning');
  assert.ok(tell([main[0], cancel([{ move: 'anytime', text: 'X', subtype: 'message' }])]).errors.length, 'not inside its own flow');
  assert.ok(tell([main[0], cancel([{ move: 'start', text: 'X', role: 'A' }])]).errors.length, 'no start move inside');
});

test('391 AK2 the move leaves question, open paths and the marker of the main flow as they were', () => {
  const before = tell(main.slice(0, 2));
  const after = tell([...main.slice(0, 2), cancel([])]);
  assert.equal(after.question, before.question);
  assert.deepEqual(after.open, before.open);
  assert.equal(after.here, before.here);
});

test('391 AK3 a flow not told to its end is an open point: no reading copy until it is', async () => {
  for (const flow of [[], [{ move: 'task', text: 'Stornierung bestätigen', role: 'Kundendienst' }] as Move[]]) {
    const { e } = await play(story(cancel(flow)));
    assert.equal(e.readingCopy, false);
    assert.ok(e.ir.openPoints?.some((p) => p.elementId === 'Jederzeit_1'));
  }
  assert.equal((await play(story())).e.readingCopy, true);
});

const KINDS: [EventKind, string, string][] = [['message', ' mit Nachricht', ' with a message'], ['time', ' zum Zeitpunkt', ' at a point in time'], ['condition', ' sobald', ' once'], ['signal', ' mit Signal', ' with a signal']];

test('391 AK4 story text: one section after the main flow, before the subprocess sections (job 397), every kind, both languages', () => {
  for (const [subtype, de, en] of KINDS)
    for (const keepsRunning of ['', 'yes'] as const) {
      const a = cancel(undefined, { subtype, keepsRunning });
      const moves: Move[] = [main[0], { move: 'task', text: 'Auftrag prüfen', role: 'Vertrieb', subprocess: [{ move: 'end', text: 'Geprüft' }] }, a, ...main.slice(2)];
      const g = tell(moves, 'de');
      const texts = g.storyText.map((l) => l.text);
      const head = `JEDERZEIT${de}: [Kunde storniert]${keepsRunning ? ', Ablauf läuft weiter' : ''}:`;
      assert.ok(texts.indexOf(head) > 0 && texts.indexOf(head) < texts.indexOf('TEILABLAUF [Auftrag prüfen]:'), head);
      assert.deepEqual(texts.slice(texts.indexOf(head) + 1, texts.indexOf('TEILABLAUF [Auftrag prüfen]:')), ['ES BEGINNT.', '[@Kundendienst] soll [Stornierung bestätigen].', 'ENDE: [Auftrag storniert].']);
      const l = g.storyText.find((x) => x.text === head)!;
      assert.equal(l.move, 2);
      assert.equal(l.sub, undefined, 'the heading is a line of the main level');
      assert.ok(tell(moves, 'en').storyText.some((x) => x.text === `AT ANY TIME${en}: [Kunde storniert]${keepsRunning ? ', flow continues' : ''}:`));
    }
});

test('391 AK4 read back: the text gives the same story, also without IT STARTS', () => {
  for (const language of ['de', 'en'] as Language[])
    for (const [subtype] of KINDS)
      for (const keepsRunning of ['', 'yes'] as const) {
        const moves: Move[] = [main[0], { move: 'task', text: 'Auftrag prüfen', role: 'Vertrieb', subprocess: [{ move: 'end', text: 'Geprüft' }] }, ...main.slice(2), cancel(undefined, { subtype, keepsRunning })];
        const text = asSourceText(tell(moves, language).storyText);
        const r = read(text, language);
        assert.deepEqual(r.errors, [], text);
        assert.deepEqual(asSourceText(tell(r.moves, language).storyText), text);
        const without = text.replace(/\n(ES BEGINNT|IT STARTS)\.(?=\n\[@Kundendienst\])/, '');
        assert.notEqual(without, text);
        assert.deepEqual(asSourceText(tell(read(without, language).moves, language).storyText), text);
      }
});

test('391 AK5 BPMN: event subprocess, interrupting or not, read back without a story', async () => {
  for (const keepsRunning of ['', 'yes'] as const)
    for (const [subtype] of KINDS) {
      const { e } = await play(story(cancel(undefined, { subtype, keepsRunning })));
      assert.equal(e.ok, true, JSON.stringify(e.issues));
      const xml = e.xml!;
      assert.match(xml, /<bpmn:subProcess id="Jederzeit_1" name="Kunde storniert" triggeredByEvent="true">/);
      assert.equal(/isInterrupting="false"/.test(xml), keepsRunning === 'yes');
      const def = { message: 'messageEventDefinition', time: 'timerEventDefinition', condition: 'conditionalEventDefinition', signal: 'signalEventDefinition' }[subtype];
      assert.match(xml, new RegExp(`<bpmn:startEvent id="Jederzeit_1_Start_1"[^]*?<bpmn:${def}`));
      const back = await fromBpmn(xml.replace(/ bpmnc:geschichte="[^"]*"/, ''));
      assert.equal(back.ir.story, undefined);
      const b = box(back.ir.nodes);
      assert.deepEqual(b.anytime, { trigger: subtype, ...(keepsRunning && { keepsRunning: true }) });
      assert.equal(b.subprocess!.nodes.length, box(e.ir.nodes).subprocess!.nodes.length);
      const again = await run({ ir: back.ir, ops: [], positions: back.positions });
      assert.equal(again.ok, true, JSON.stringify(again.issues));
    }
});

test('391 risk: a foreign event subprocess without a typed start and nested in a subprocess reads without crashing', async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="x">
  <bpmn:process id="P" isExecutable="false">
    <bpmn:startEvent id="S"><bpmn:outgoing>f1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:subProcess id="Sub"><bpmn:incoming>f1</bpmn:incoming><bpmn:outgoing>f2</bpmn:outgoing>
      <bpmn:subProcess id="Inner" triggeredByEvent="true"><bpmn:startEvent id="IS"/></bpmn:subProcess>
    </bpmn:subProcess>
    <bpmn:endEvent id="E"><bpmn:incoming>f2</bpmn:incoming></bpmn:endEvent>
    <bpmn:subProcess id="Any" name="Storno" triggeredByEvent="true"><bpmn:startEvent id="AS"/><bpmn:endEvent id="AE"/></bpmn:subProcess>
    <bpmn:sequenceFlow id="f1" sourceRef="S" targetRef="Sub"/>
    <bpmn:sequenceFlow id="f2" sourceRef="Sub" targetRef="E"/>
  </bpmn:process>
</bpmn:definitions>`;
  const back = await fromBpmn(xml);
  const b = box(back.ir.nodes);
  assert.equal(b.id, 'Any');
  assert.deepEqual(b.anytime, { trigger: 'message' }, 'untyped start: counted as a message');
  const sub = back.ir.nodes.find((n) => n.id === 'Sub') as Extract<Node, { kind: 'step' }>;
  const inner = sub.subprocess!.nodes.find((n) => n.id === 'Inner') as Extract<Node, { kind: 'step' }>;
  assert.deepEqual(inner.anytime, { trigger: 'message' }, 'job 397: what can come at any time in a subprocess is read');
  await run({ ir: back.ir, ops: [], positions: back.positions });
});

test('391 AK6 stored moves keep the German format and come back the same', () => {
  const moves = story(cancel(undefined, { keepsRunning: 'yes', subtype: 'time' }));
  const stored = toStored(moves) as Record<string, unknown>[];
  assert.deepEqual(stored[2], JSON.parse('{"zug":"jederzeit","text":"Kunde storniert","art":"zeit","laeuftWeiter":"ja","teilablauf":[{"zug":"schritt","text":"Stornierung bestätigen","stelle":"Kundendienst"},{"zug":"ende","text":"Auftrag storniert"}]}'));
  assert.deepEqual(fromStored(stored), moves);
});

const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('391 AK7 drawing: dotted box with its trigger, inside its lane, over nothing; legend; a page of its own', async () => {
  for (const keepsRunning of ['', 'yes'] as const) {
    const moves = [...story(cancel(undefined, { keepsRunning })), cancel([{ move: 'end', text: 'Beantwortet' }], { text: 'Kunde fragt nach', keepsRunning: 'yes' })];
    const { g, e } = await play(moves);
    assert.equal(e.ok, true, JSON.stringify(e.issues));
    const svg = toSvg(e.ir, e.positions);
    assert.match(svg, /<rect [^>]*stroke-dasharray="2 2.5"/, 'dotted frame');
    const boxes = e.ir.nodes.filter((n) => n.kind === 'step' && n.anytime);
    assert.equal(boxes.length, 2);
    const shapes = e.ir.nodes.filter((n) => n.kind !== 'exception').map((n) => ({ id: n.id, ...e.positions[n.id], ...sizeOf(n) }));
    for (const b of shapes.filter((s) => s.id.startsWith('Jederzeit_')))
      for (const o of shapes.filter((s) => s.id !== b.id)) assert.ok(!overlap(b, o), `${b.id} over ${o.id}`);
    if (keepsRunning) assert.doesNotMatch(svg, />Jederzeit möglich, bricht alles ab</);
    else assert.match(svg, />Jederzeit möglich, bricht alles ab</);
    assert.match(svg, />Jederzeit möglich, Ablauf läuft weiter</);
    assert.doesNotMatch(svg, />Teilablauf</, 'no subprocess entry for the boxes');
    if (keepsRunning) continue;
    const { PDFDocument } = await import('pdf-lib');
    const bytes = await toPdf(e.ir, e.positions, { told: asSourceText(g.storyText) });
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), 4, 'main flow, two flows, story text');
    const texts = pdfTexts(bytes);
    assert.ok(texts.includes('siehe Seite 2') && texts.includes('siehe Seite 3'));
    assert.ok(texts.includes('Jederzeit: Kunde storniert'));
  }
});

test('391 AK7 the box is laid out anew below its lane even with old positions', async () => {
  const { e } = await play(story());
  const moved = { ...e.positions, Jederzeit_1: { x: 0, y: 0 } };
  assert.deepEqual(layout(e.ir, moved).Jederzeit_1, e.positions.Jederzeit_1);
});

test('391 risk: markup in the name stays text in SVG and story text', async () => {
  const { g, e } = await play(story(cancel(undefined, { text: 'Kunde <b>&] storniert' })));
  const svg = toSvg(e.ir, e.positions);
  assert.doesNotMatch(svg, /<b>/);
  assert.ok(g.storyText.some((l) => l.text === 'JEDERZEIT mit Nachricht: [Kunde <b>& storniert]:'));
});

test('391 risk: inserting before and removing moves keeps "continue at" on its step', () => {
  const moves: Move[] = [main[0], { move: 'task', text: 'A', role: 'Vertrieb' }, cancel(), { move: 'task', text: 'B', role: 'Vertrieb' }, { move: 'decision', question: 'Gut?', yes: 'ja', no: 'nein' }, { move: 'end', text: 'Fertig' }, { move: 'goTo', target: tell([main[0], { move: 'task', text: 'A', role: 'Vertrieb' }]).nodes[1]! }];
  assert.deepEqual(tell(moves).errors, []);
  const inserted = splice(moves, 1, 0, [{ move: 'task', text: 'Vorher', role: 'Vertrieb' }]);
  const g = tell(inserted);
  assert.deepEqual(g.errors, []);
  assert.ok(g.storyText.some((l) => l.text === 'WEITER BEI [A].'));
  const removed = splice(moves, 2, 1, []);
  assert.ok(tell(removed).storyText.some((l) => l.text === 'WEITER BEI [A].'));
});

test('391 round 1: the box is never a target of "continue at"; without another target there is no "continue at"', () => {
  const only = tell([main[0], cancel()]);
  assert.ok(!only.targets.some((x) => x.id.startsWith('Jederzeit_')));
  assert.ok(!only.options.includes('goTo'));
  const more = tell([...main.slice(0, 2), cancel(), { move: 'decision', question: 'Gut?', yes: 'ja', no: 'nein' }]);
  assert.ok(more.options.includes('goTo'));
  assert.ok(!more.targets.some((x) => x.id.startsWith('Jederzeit_')));
  assert.ok(tell([...main.slice(0, 2), cancel(), { move: 'goTo', target: 'Jederzeit_1' }]).errors.length);
});
