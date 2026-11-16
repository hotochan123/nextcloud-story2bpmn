import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { tell, splice, Move } from '../../src/core/story.js';
import { read, asSourceText } from '../../src/core/readBack.js';
import { run, emptyProcess } from '../../src/core/pipeline.js';
import { fromBpmn } from '../../src/core/fromBpmn.js';
import { toSvg, toPdf } from '../../src/core/render.js';
import { toStored, fromStored } from '../../src/core/storyFormat.js';
import { parse } from '../../src/core/toBpmn.js';
import { Language } from '../../src/core/language.js';
import { Node, levels } from '../../src/core/ir.js';

// Job 387: a task with a flow of its own behind it (subprocess), told in the same working file.
const behind: Move[] = [
  { move: 'task', text: 'Ware kommissionieren', role: 'Lager' },
  { move: 'task', text: 'Paket packen', role: 'Packerei' },
  { move: 'end', text: 'Ware versandt' }
];
const story = (sub: Move[] = behind): Move[] => [
  { move: 'start', text: 'Bestellung eingegangen', role: 'Vertrieb' },
  { move: 'task', text: 'Bestellung prüfen', role: 'Vertrieb' },
  { move: 'task', text: 'Ware versenden', role: 'Lager', subprocess: sub },
  { move: 'task', text: 'Rechnung schreiben', role: 'Buchhaltung' },
  { move: 'end', text: 'Bestellung erledigt' }
];

const play = async (moves: Move[], language: Language = 'de') => {
  const g = tell(moves, language);
  const e = await run({ ir: { ...emptyProcess('P', g.ir.name, language), story: moves }, ops: g.ops });
  return { g, e };
};
const step = (nodes: Node[], name: string) => nodes.find((n) => n.name === name && n.kind === 'step') as Extract<Node, { kind: 'step' }>;

/** All texts drawn in a PDF (pdf-lib writes them as hex strings into flate streams). */
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

test('387 AK1 the task carries the flow behind it, with prefixed IDs and a plain start', async () => {
  const { g, e } = await play(story());
  assert.deepEqual(g.errors, []);
  assert.equal(g.done, true);
  const s = step(e.ir.nodes, 'Ware versenden');
  assert.ok(s.subprocess, 'subprocess on the task');
  assert.ok(s.subprocess.nodes.every((n) => n.id.startsWith(`${s.id}_`)));
  assert.deepEqual(s.subprocess.lanes.map((l) => l.name), ['Lager', 'Packerei']);
  const start = s.subprocess.nodes.find((n) => n.kind === 'start')!;
  assert.equal(start.name, 'Ware versenden');
  assert.equal(start.laneId, s.subprocess.lanes[0].id, 'lane of the start from its first task');
  assert.equal(e.ok, true, JSON.stringify(e.issues));
  assert.equal(e.readingCopy, true);
  assert.equal(g.subs?.[2].id, s.id);
  assert.equal(g.subs?.[2].state.done, true);
});

test('387 AK1 an untold or half told subprocess is an open point: no reading copy', async () => {
  for (const sub of [[], behind.slice(0, 2)]) {
    const { g, e } = await play(story(sub));
    assert.deepEqual(g.errors, []);
    assert.equal(g.done, true, 'the main flow is complete');
    assert.equal(e.readingCopy, false);
    assert.equal(e.ir.openPoints?.length, 1);
    assert.equal(e.ir.openPoints?.[0].elementId, step(e.ir.nodes, 'Ware versenden').id);
  }
});

test('387 AK1 no trigger and no subprocess inside a subprocess', () => {
  const start = tell(story([{ move: 'start', text: 'x', role: 'Lager' }, ...behind]), 'de');
  assert.match(start.errors[0], /„Ware versenden“: Ein Teilablauf beginnt einfach/);
  const nested = tell(story([{ move: 'task', text: 'Tiefer', role: 'Lager', subprocess: [] }, ...behind]), 'de');
  assert.match(nested.errors[0], /Ein Teilablauf hat keinen eigenen Teilablauf/);
  const odd = tell(story([42 as unknown as Move]), 'de');
  assert.match(odd.errors[0], /nicht lesbar/);
});

const TEXT: Record<Language, string[]> = {
  de: [
    'ES BEGINNT: [Bestellung eingegangen] bei [@Vertrieb].',
    '[@Vertrieb] soll [Bestellung prüfen].',
    '[@Lager] soll [Ware versenden], MIT TEILABLAUF.',
    '[@Buchhaltung] soll [Rechnung schreiben].',
    'ENDE: [Bestellung erledigt].',
    'TEILABLAUF [Ware versenden]:',
    'ES BEGINNT.',
    '[@Lager] soll [Ware kommissionieren].',
    '[@Packerei] soll [Paket packen].',
    'ENDE: [Ware versandt].'
  ],
  en: [
    'IT STARTS: [Bestellung eingegangen] at [@Vertrieb].',
    '[@Vertrieb] shall [Bestellung prüfen].',
    '[@Lager] shall [Ware versenden], WITH SUBPROCESS.',
    '[@Buchhaltung] shall [Rechnung schreiben].',
    'END: [Bestellung erledigt].',
    'SUBPROCESS [Ware versenden]:',
    'IT STARTS.',
    '[@Lager] shall [Ware kommissionieren].',
    '[@Packerei] shall [Paket packen].',
    'END: [Ware versandt].'
  ]
};

test('387 AK2 story text with the section of the subprocess, in both languages, and back', () => {
  for (const language of ['de', 'en'] as Language[]) {
    const g = tell(story(), language);
    assert.deepEqual(g.storyText.map((l) => l.text), TEXT[language], language);
    assert.deepEqual(g.storyText.map((l) => l.sub), [undefined, undefined, undefined, undefined, undefined, 2, 2, 2, 2, 2]);
    assert.deepEqual(g.storyText.filter((l) => l.sub === 2).map((l) => l.move), [undefined, undefined, 0, 1, 2]);
    const r = read(TEXT[language].join('\n'), language);
    assert.deepEqual(r.errors, []);
    assert.deepEqual(tell(r.moves, language).storyText, g.storyText, language);
  }
});

test('387 AK2 two subprocesses of the same name, one untold, continue at inside, read back the same', () => {
  const moves: Move[] = [
    { move: 'start', text: 'Los', role: 'A' },
    { move: 'task', text: 'Prüfen', role: 'A', subprocess: [
      { move: 'task', text: 'Ansehen', role: 'B' },
      { move: 'decision', question: 'Gut?', yes: 'ja', no: 'nein' },
      { move: 'end', text: 'Geprüft' },
      { move: 'goTo', target: 'Schritt_2' }
    ] },
    { move: 'task', text: 'Prüfen', role: 'A', subprocess: [] },
    { move: 'task', text: 'Leer', role: 'A', subprocess: [] },
    { move: 'end', text: 'Fertig' }
  ];
  const g = tell(moves, 'de');
  assert.deepEqual(g.errors, []);
  const text = asSourceText(g.storyText);
  const r = read(text, 'de');
  assert.deepEqual(r.errors, []);
  assert.deepEqual(tell(r.moves, 'de').storyText, g.storyText);
  assert.deepEqual(r.moves[1].move === 'task' && r.moves[1].subprocess?.length, 4);
  assert.deepEqual(r.moves[2].move === 'task' && r.moves[2].subprocess, []);
  // Without `ES BEGINNT.` the section reads the same.
  assert.deepEqual(read(text.replace('ES BEGINNT.\n', ''), 'de').moves, r.moves);
});

test('387 AK2 sections that do not fit report their line', () => {
  const base = TEXT.de.slice(0, 5);
  const cases: [string[], number, RegExp][] = [
    [[...base, 'TEILABLAUF [Gibt es nicht]:', 'ES BEGINNT.'], 6, /Kein Schritt „Gibt es nicht“/],
    [[...TEXT.de, 'TEILABLAUF [Ware versenden]:', 'ES BEGINNT.'], 11, /Kein Schritt „Ware versenden“/],
    [[...TEXT.de.slice(0, 7), '[@Lager] soll [Tiefer], MIT TEILABLAUF.'], 8, /Ein Teilablauf hat keinen eigenen Teilablauf/],
    [[...TEXT.de.slice(0, 7), 'Unsinn hier'], 8, /nicht verstanden/]
  ];
  for (const [lines, line, message] of cases) {
    const r = read(lines.join('\n'), 'de');
    assert.equal(r.line, line, lines.at(-1) ?? '');
    assert.match(r.errors[0], message);
    // Job 449: the number of the line in the story; a section heading has none, its message stands alone.
    assert.match(r.errors[0], r.numbers[line - 1] === null ? /^Kein Schritt/ : new RegExp(`^Zeile ${r.numbers[line - 1]}:`));
  }
});

test('387 AK3 the working file: collapsed bpmn:SubProcess with its own plane and lanes, read back the same', async () => {
  const { e } = await play(story());
  const xml = e.xml!;
  const defs = await parse(xml);
  const process = defs.rootElements.find((r: any) => r.$type === 'bpmn:Process');
  const sub = process.flowElements.find((f: any) => f.$type === 'bpmn:SubProcess');
  assert.equal(sub.name, 'Ware versenden');
  assert.equal(sub.flowElements.filter((f: any) => f.$type === 'bpmn:Task').length, 2);
  assert.deepEqual(sub.laneSets[0].lanes.map((l: any) => l.name), ['Lager', 'Packerei']);
  assert.equal(defs.diagrams.length, 2);
  assert.equal(defs.diagrams[1].plane.bpmnElement.id, sub.id);
  const shape = defs.diagrams[0].plane.planeElement.find((p: any) => p.bpmnElement?.id === sub.id);
  assert.equal(shape.isExpanded, false);
  assert.match(xml, /isExpanded="false"/);
  // The stored story keeps the German key, one level down too.
  assert.match(xml, /&#34;teilablauf&#34;:\[\{&#34;zug&#34;:&#34;schritt&#34;|"teilablauf":\[\{"zug":"schritt"/);
  const back = await fromBpmn(xml);
  const a = levels(e.ir);
  const b = levels(back.ir);
  assert.equal(b.length, 2);
  for (const [i, l] of a.entries()) {
    assert.deepEqual(b[i].nodes.map((n) => [n.id, n.kind, n.name]), l.nodes.map((n) => [n.id, n.kind, n.name]));
    assert.deepEqual(b[i].edges.map((x) => [x.from, x.to]), l.edges.map((x) => [x.from, x.to]));
    assert.deepEqual(b[i].lanes, l.lanes);
  }
  for (const n of b.flatMap((l) => l.nodes)) assert.ok(back.positions[n.id] || n.kind === 'exception', n.id);
  assert.deepEqual(back.ir.story, story());
});

test('387 AK3 stored format: subprocess moves map both ways, an old story stays as it was', () => {
  const stored = toStored(story()) as any[];
  assert.equal(stored[2]['teilablauf'][1]['stelle'], 'Packerei');
  assert.equal(stored[2]['teilablauf'][2]['zug'], 'ende');
  assert.deepEqual(fromStored(stored), story());
  const old: Move[] = [{ move: 'start', text: 'a', role: 'b' }, { move: 'end', text: 'c' }];
  assert.deepEqual(fromStored(toStored(old)), old);
});

test('387 AK4 the box has a plus; the PDF has a page per subprocess and names it', async () => {
  const { g, e } = await play(story());
  const svg = toSvg(e.ir, e.positions);
  assert.equal([...svg.matchAll(/<rect [^>]*width="14" height="14"/g)].length, 1, 'the plus in the box');
  assert.match(svg, />Teilablauf</, 'legend entry');
  assert.doesNotMatch(svg, /siehe Seite/);
  const { PDFDocument } = await import('pdf-lib');
  const bytes = await toPdf(e.ir, e.positions, { told: asSourceText(g.storyText) });
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 3);
  const texts = pdfTexts(bytes);
  assert.ok(texts.includes('siehe Seite 2'), 'see page in the box');
  assert.ok(texts.includes('Teilablauf: Ware versenden'));
  // WinAnsi quotes come back as other bytes in latin1.
  assert.ok(texts.some((x) => /^gehört zu .Prozess., Seite 1, Bahn Lager$/.test(x)), 'belongs to');
  assert.ok(texts.includes('Seite 3 erzählt denselben Ablauf in Worten.'));
});

test('387 risk: IDs stay unique with many tasks on both levels', async () => {
  const many = (n: number, p: string): Move[] => Array.from({ length: n }, (_, i) => ({ move: 'task', text: `${p} ${i}`, role: 'A' }));
  const moves: Move[] = [{ move: 'start', text: 'Los', role: 'A' }, ...many(12, 'Haupt'), { move: 'task', text: 'Mit', role: 'A', subprocess: [...many(12, 'Innen'), { move: 'end', text: 'Innen fertig' }] }, ...many(3, 'Danach'), { move: 'end', text: 'Fertig' }];
  const { e } = await play(moves);
  const ids = levels(e.ir).flatMap((l) => [...l.nodes.map((n) => n.id), ...l.edges.map((x) => x.id), ...l.lanes.map((x) => x.id)]);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(e.ok, true, JSON.stringify(e.issues));
});

test('387 risk: inserting before the task keeps continue at inside its subprocess', () => {
  const moves = story([
    { move: 'task', text: 'Ansehen', role: 'B' },
    { move: 'decision', question: 'Gut?', yes: 'ja', no: 'nein' },
    { move: 'end', text: 'Geprüft' },
    { move: 'goTo', target: 'Schritt_2' }
  ]);
  const more = splice(moves, 1, 0, [{ move: 'task', text: 'Vorher', role: 'Vertrieb' }], 'de');
  assert.deepEqual(tell(more, 'de').errors, []);
  const sub = more[3].move === 'task' ? more[3].subprocess : undefined;
  assert.deepEqual(sub?.[3], { move: 'goTo', target: 'Schritt_2' });
});

test('387 risk: a foreign file nested deeply reads one level, without a crash', async () => {
  const inner = (depth: number): string => depth === 0 ? '<bpmn:task id="T_x" name="Tief"/>'
    : `<bpmn:subProcess id="S_${depth}" name="Ebene ${depth}">${inner(depth - 1)}</bpmn:subProcess>`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="x">
  <bpmn:process id="P" isExecutable="false">${inner(40)}</bpmn:process>
</bpmn:definitions>`;
  const r = await fromBpmn(xml);
  const top = r.ir.nodes[0] as Extract<Node, { kind: 'step' }>;
  assert.equal(top.subprocess?.nodes.length, 1);
  assert.equal((top.subprocess?.nodes[0] as Extract<Node, { kind: 'step' }>).subprocess, undefined);
});

test('387 risk: a task name with brackets or the signal word reads back unambiguously', () => {
  const moves = story();
  (moves[2] as Extract<Move, { move: 'task' }>).text = 'Ware [eilig], MIT TEILABLAUF';
  const g = tell(moves, 'de');
  const r = read(asSourceText(g.storyText), 'de');
  assert.deepEqual(r.errors, []);
  assert.deepEqual(tell(r.moves, 'de').storyText, g.storyText);
});

test('387 AK1 an untold subprocess brings no check messages of its own, only the open point', async () => {
  for (const sub of [[], behind.slice(0, 1)]) {
    const { e } = await play(story(sub));
    assert.deepEqual(e.issues, [], JSON.stringify(e.issues));
    assert.equal(e.ok, true);
    assert.equal(e.readingCopy, false);
  }
  // A told subprocess is checked like the main flow.
  const { e } = await play(story(behind));
  assert.equal(e.ok, true);
});
