import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../../src/core/pipeline.js';
import { toSvg, toPdf, renderBoth } from '../../src/core/render.js';
import { baseProcess, changeOps } from './fixtures.js';

const full = async () => {
  const first = await run({ ir: baseProcess(), ops: [] });
  return run({ ir: first.ir, ops: changeOps, positions: first.positions });
};

test('SVG contains tasks, lanes and conditions in plain text', async () => {
  const res = await full();
  const svg = toSvg(res.ir, res.positions);

  assert.match(svg, /^<svg /);
  assert.match(svg, /Buchhaltung/);
  assert.match(svg, /Rechnung/);
  assert.match(svg, /Zahlung abgelehnt/);
  // The condition on the branch must be readable, otherwise the picture is worthless.
  assert.match(svg, />ja</);
  assert.match(svg, />nein</);
});

test('SVG has a shape for every node and a line for every edge', async () => {
  const res = await full();
  const svg = toSvg(res.ir, res.positions);

  const shapes = (svg.match(/<(rect|circle|polygon)/g) ?? []).length;
  const drawnLines = (svg.match(/<polyline/g) ?? []).length;
  assert.ok(shapes >= res.ir.nodes.length, `nur ${shapes} Formen für ${res.ir.nodes.length} Knoten`);
  assert.ok(drawnLines >= res.ir.edges.length, `nur ${drawnLines} Linien für ${res.ir.edges.length} Kanten`);
});

test('special characters in the name do not break the SVG', async () => {
  const ir = baseProcess();
  const nodes = ir.nodes.find((n) => n.id === 'Task_pruefen')!;
  nodes.name = 'Rechnung <prüfen> & freigeben';
  const res = await run({ ir, ops: [] });

  // The wrapping spreads the name over several <text> elements, hence piece by piece.
  const svg = toSvg(res.ir, res.positions);
  assert.match(svg, /&lt;prüfen&gt;/);
  assert.match(svg, /&amp;/);
  assert.doesNotMatch(svg, /<prüfen>/);
});

test('PDF is a real PDF file', async () => {
  const res = await full();
  const pdf = await toPdf(res.ir, res.positions);
  assert.equal(Buffer.from(pdf.slice(0, 5)).toString(), '%PDF-');
  assert.ok(pdf.length > 1000, `PDF ist nur ${pdf.length} Bytes groß`);
});

test('an open point draws the ENTWURF mark, a clean state does not', async () => {
  const clean = await run({ ir: baseProcess(), ops: [] });
  assert.equal(clean.readingCopy, true);
  assert.doesNotMatch(toSvg(clean.ir, clean.positions, { draft: !clean.readingCopy }), /ENTWURF/);

  const open = await run({
    ir: baseProcess(),
    ops: [
      {
        op: 'addOpenPoint',
        point: {
          id: 'Offen_1',
          elementId: 'Task_zahlen',
          assumption: 'zwei Tage',
          question: 'Bis wann?'
        }
      }
    ]
  });
  assert.equal(open.readingCopy, false);

  const both = await renderBoth(open.ir, open.positions, open.readingCopy);
  assert.match(both.svg, /ENTWURF/);
  assert.equal(Buffer.from(both.pdf.slice(0, 5)).toString(), '%PDF-');
});

test('PDF survives characters Helvetica does not know', async () => {
  const { tell } = await import('../../src/core/story.js');
  const { emptyProcess } = await import('../../src/core/pipeline.js');
  const g = tell([
    { move: 'start', text: 'Antrag → Prüfung 🚀', role: 'Отдел' },
    { move: 'task', text: 'Señal ąę ≥ 5000 €', role: 'Отдел' },
    { move: 'end', text: 'Fertig ✓' }
  ]);
  const r = await run({ ir: emptyProcess('P', 'Prozess'), ops: g.ops });
  const pdf = await toPdf(r.ir, r.positions);
  assert.equal(Buffer.from(pdf.slice(0, 5)).toString(), '%PDF-');
});

test('too wide for A3: diagram on two A3 pages, then the story text', async () => {
  const { tell } = await import('../../src/core/story.js');
  const { asSourceText } = await import('../../src/core/readBack.js');
  const { emptyProcess } = await import('../../src/core/pipeline.js');
  const g = tell([
    { move: 'start', text: 'Los', role: 'Team' },
    ...Array.from({ length: 14 }, (_, i) => ({ move: 'task' as const, text: `Schritt ${i + 1}`, role: 'Team' })),
    { move: 'end', text: 'Fertig' }
  ]);
  const r = await run({ ir: emptyProcess('P', 'Lang'), ops: g.ops });
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.load(await toPdf(r.ir, r.positions, { told: asSourceText(g.storyText) }));
  assert.deepEqual(pdf.getPages().map((s) => [s.getWidth(), s.getHeight()]), [[1191, 842], [1191, 842], [595, 842]]);
});

test('document sits below the task in the lane, system and deadline in grey inside the task', async () => {
  const ir = baseProcess();
  const task = ir.nodes.find((n) => n.id === 'Task_pruefen')! as any;
  task.details = { system: 'SAP', deadline: '2 Tage', documents: ['Lieferschein'] };
  const res = await run({ ir, ops: [] });
  const svg = toSvg(res.ir, res.positions);
  assert.match(svg, />SAP</);
  assert.match(svg, />Frist: 2 Tage</);
  assert.match(svg, />Lieferschein</);
  assert.match(svg, /stroke-dasharray="0 3.5"/);
  assert.match(svg, />Dokument</, 'Legendeneintrag fehlt');
  // The lane grows around the document: the label stays in its lane.
  const { laneBands, documents } = await import('../../src/core/layout.js');
  const d = documents(task, res.positions[task.id])[0];
  const lane = laneBands(res.ir, res.positions).find((b) => b.lane.id === task.laneId)!;
  assert.ok(d.box.y + d.box.h <= lane.y + lane.height, 'Dokument ragt aus der Bahn');
});

// --- 383: story line ↔ shape (data-move), lane bands for the standing names ---------

import { readFileSync } from 'node:fs';
import { tell, emptyProcess } from '../../src/core/index.js';
import { preview, scene } from '../../src/core/render.js';
import { textMoves } from '../../src/workbench.js';
import type { Move } from '../../src/core/index.js';

const README: Move[] = [
  { move: 'start', text: 'Rechnung geht ein', role: 'Buchhaltung' },
  { move: 'task', text: 'Rechnung prüfen', role: 'Buchhaltung' },
  { move: 'decision', question: 'Betrag über 5000 €?', yes: 'ja', no: 'nein' },
  { move: 'task', text: 'Zahlung freigeben', role: 'Führungskraft' },
  { move: 'merge' },
  { move: 'merge' },
  { move: 'end', text: 'Bezahlt' }
];
const LONG = readFileSync('tests/core/fixtures/reklamation.txt', 'utf8');

const told = async (moves: Move[]) => {
  const g = tell(moves, 'de');
  const e = await run({ ir: { ...emptyProcess('P', g.ir.name, 'de'), story: moves }, ops: g.ops });
  return { g, e };
};

for (const [name, moves] of [['README', () => README], ['Reklamation', () => textMoves(LONG, [], 'de').moves]] as const) {
  test(`383 AK2 ${name}: every node in exactly one <g data-move>, without option no groups`, async () => {
    const ms = moves();
    assert.ok(ms.length > 5);
    const { g, e } = await told(ms);
    const { svg } = preview(e.ir, e.positions, { moves: g.moveOf, withoutLegend: true, here: g.here });
    const groups = [...svg.matchAll(/<g data-move="(\d+)" data-node="([^"]+)">/g)];
    assert.equal(groups.length, e.ir.nodes.length);
    assert.deepEqual(new Set(groups.map((m) => m[2])), new Set(e.ir.nodes.map((n) => n.id)));
    for (const m of groups) assert.ok(Number(m[1]) >= 1 && Number(m[1]) <= ms.length, m[0]);
    assert.equal((svg.match(/<g /g) ?? []).length, (svg.match(/<\/g>/g) ?? []).length);
    assert.doesNotMatch(toSvg(e.ir, e.positions), /data-move/);
  });
}

test('383 AK2 the long story reads back in full (31 moves)', () => {
  const r = textMoves(LONG, [], 'de');
  assert.deepEqual(r.errors, []);
  assert.equal(r.moves.length, 31);
});

test('383 AK3 moveOf: start, decision and the merge it triggers', () => {
  const g = tell(README, 'de');
  const kind = (id: string) => g.ir.nodes.find((n) => n.id === id)!;
  const start = g.ir.nodes.find((n) => n.kind === 'start')!;
  assert.equal(g.moveOf[start.id], 0);
  const gws = g.ir.nodes.filter((n) => n.kind === 'gateway');
  // The question's gateway comes from move 2, the merge point from a merge move (4 or 5).
  const split = gws.find((n) => n.name === 'Betrag über 5000 €?')!;
  assert.equal(g.moveOf[split.id], 2);
  const join = gws.find((n) => n !== split)!;
  assert.ok([4, 5].includes(g.moveOf[join.id]), String(g.moveOf[join.id]));
  for (const n of g.ir.nodes) assert.ok(n.id in g.moveOf, kind(n.id).id);
});

test('383 AK4 scene lanes match the lane rectangles of the SVG', async () => {
  const { g, e } = await told(README);
  const s = scene(e.ir, e.positions, { withoutLegend: true });
  assert.equal(s.lanes.length, e.ir.lanes.length);
  assert.ok(s.pool);
  const svg = toSvg(e.ir, e.positions, { withoutLegend: true });
  for (const b of s.lanes) {
    assert.match(svg, new RegExp(`<rect x="[\\d.]+" y="${Math.round(b.y * 10) / 10}" width="[\\d.]+" height="${Math.round(b.h * 10) / 10}"`));
    assert.ok(svg.includes(`>${b.name}<`));
  }
  assert.ok(g.ir.lanes.length >= 2);
});

test('complaint story: questions sit off the lines, the same in scene, SVG and PDF', async () => {
  const { complaintStory } = await import('./fixtures.js');
  const { scene } = await import('../../src/core/render.js');
  const { pagesCaption, edgePoints, segments, inBox } = await import('../../src/core/layout.js');
  const r = await complaintStory();
  const sc = scene(r.ir, r.positions);
  const svg = toSvg(r.ir, r.positions);
  for (const question of ['Mangel bestätigt?', 'Reparatur möglich?']) {
    const n = r.ir.nodes.find((x) => x.kind === 'gateway' && x.name === question)!;
    const b = pagesCaption(r.ir, n, r.positions)!;
    const hits = r.ir.edges.filter((e) => segments(edgePoints(r.ir, e, r.positions) ?? []).some(([a, c]) => inBox(a, c, b)));
    assert.deepEqual(hits.map((e) => e.id), [], question);
    const texts = sc.prims.filter((p: any) => p.t === 'text' && p.s === question) as any[];
    assert.equal(texts.length, 1, question);
    const t = texts[0];
    assert.equal(t.anchor, b.anchor);
    // The drawn text starts, centres or ends on the box edge its anchor names (scene is shifted by a constant).
    const ref = b.anchor === 'start' ? b.x : b.anchor === 'middle' ? b.x + b.w / 2 : b.x + b.w;
    const shift = t.x - ref;
    const other = sc.prims.find((p: any) => p.t === 'text' && p.s === 'Kaufbeleg vorhanden?') as any;
    const k = r.ir.nodes.find((x) => x.name === 'Kaufbeleg vorhanden?')!;
    const kb = pagesCaption(r.ir, k, r.positions)!;
    assert.ok(Math.abs(other.x - (kb.x + kb.w / 2) - shift) < 0.01, 'same shift for every caption');
    const m = [...svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)"[^>]*text-anchor="(\w+)"[^>]*>([^<]*)</g)].filter((z) => z[4] === question);
    assert.equal(m.length, 1, question);
    assert.ok(Math.abs(Number(m[0][1]) - t.x) < 0.1 && Math.abs(Number(m[0][2]) - t.y) < 0.1, question);
    assert.equal(m[0][3], t.anchor);
  }
  const pdf = await toPdf(r.ir, r.positions);
  assert.equal(Buffer.from(pdf.slice(0, 5)).toString(), '%PDF-');
});
