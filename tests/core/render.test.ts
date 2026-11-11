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
