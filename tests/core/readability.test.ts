import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tell, Move } from '../../src/core/story.js';
import { run, emptyProcess } from '../../src/core/pipeline.js';
import { measureOne } from '../../src/core/readability.js';
import { complaintStory } from './fixtures.js';

const vacation: Move[] = [
  { move: 'start', text: 'Mitarbeiter möchte Urlaub nehmen', role: 'Mitarbeiter' },
  { move: 'task', text: 'Urlaubsantrag im HR-Portal stellen', role: 'Mitarbeiter' },
  { move: 'task', text: 'Antrag prüfen', role: 'Führungskraft' },
  { move: 'exceptionPath', text: 'Angaben unvollständig' },
  { move: 'task', text: 'Antrag ergänzen', role: 'Mitarbeiter' },
  { move: 'goTo', target: 'Schritt_3' },
  { move: 'decision', question: 'Urlaub genehmigt?', yes: 'ja', no: 'nein' },
  { move: 'concurrent' },
  { move: 'task', text: 'Urlaub im Kalender eintragen', role: 'Personalabteilung' },
  { move: 'merge' },
  { move: 'task', text: 'Vertretung organisieren', role: 'Mitarbeiter' },
  { move: 'merge' },
  { move: 'end', text: 'Urlaub genehmigt' },
  { move: 'task', text: 'Ablehnung begründen', role: 'Führungskraft' },
  { move: 'task', text: 'Neuen Termin wählen', role: 'Mitarbeiter' },
  { move: 'goTo', target: 'Schritt_2' }
];

const invoice: Move[] = [
  { move: 'start', text: 'Rechnung geht ein', role: 'Buchhaltung' },
  { move: 'task', text: 'Rechnung prüfen', role: 'Buchhaltung' },
  { move: 'exceptionPath', text: 'Betrag falsch' },
  { move: 'task', text: 'Rückfrage beim Lieferanten', role: 'Buchhaltung' },
  { move: 'goTo', target: 'Schritt_2' },
  { move: 'decision', question: 'Betrag über 5000 €?', yes: 'ja', no: 'nein' },
  { move: 'task', text: 'Zahlung freigeben', role: 'Führungskraft' },
  { move: 'merge' },
  { move: 'merge' },
  { move: 'task', text: 'Zahlung anweisen', role: 'Buchhaltung' },
  { move: 'end', text: 'Bezahlt' }
];

const measure = async (z: Move[]) => {
  const r = await run({ ir: emptyProcess('P', 'P'), ops: tell(z).ops });
  assert.equal(r.ok, true);
  return measureOne(r.ir, r.positions);
};

// Upper limits = measured state. Before the path choice: vacation 7 crossings,
// 19 bends, 1 arrow through a box, 3 overlapping segments;
// after the path choice 2 crossings, 14 bends; with order search 0 and 12,
// but "nein" on the centre line. Rule: a straight main path comes first, at the cost of
// 2 crossings, 13 bends. Whoever changes the layout may only lower the numbers.
test('vacation example: "ja" runs straight, no arrow through boxes or on top of another', async () => {
  const m = await measure(vacation);
  assert.equal(m.mainPathCrooked, 0);
  assert.equal(m.throughBox, 0);
  assert.equal(m.overlaid, 0);
  assert.equal(m.throughCaption, 0);
  assert.ok(m.crossings <= 2, `Kreuzungen: ${m.crossings}`);
  assert.ok(m.bends <= 13, `Knicke: ${m.bends}`);
});

test('invoice example: no crossings', async () => {
  const m = await measure(invoice);
  // mainPathBent 1: "ja" leads into the lane Fuehrungskraft, straight does not work there.
  assert.deepEqual(
    { ...m, bends: m.bends <= 6 },
    { crossings: 0, throughBox: 0, overlaid: 0, mainPathCrooked: 1, throughCaption: 0, bends: true }
  );
});

// Job 382: the long complaint story (31 moves, 5 lanes). Arrows leave "Mangel bestätigt?" and
// "Reparatur möglich?" upwards; the question used to sit centred above the diamond, right on the line.
test('complaint story: no arrow runs through a question or exception caption', async () => {
  const r = await complaintStory();
  assert.equal(measureOne(r.ir, r.positions).throughCaption, 0);
});

test('no conflict: the question stays centred above the diamond', async () => {
  const { pagesCaption, SIZE } = await import('../../src/core/layout.js');
  for (const moves of [vacation, invoice]) {
    const r = await run({ ir: emptyProcess('P', 'P'), ops: tell(moves).ops });
    const gateways = r.ir.nodes.filter((n) => n.kind === 'gateway' && n.name);
    assert.ok(gateways.length > 0);
    for (const n of gateways) {
      const b = pagesCaption(r.ir, n, r.positions)!;
      const q = r.positions[n.id];
      assert.equal(b.anchor, 'middle', n.name);
      assert.ok(Math.abs(b.x + b.w / 2 - (q.x + SIZE.gateway.w / 2)) < 0.01);
      assert.ok(Math.abs(b.y + b.h - (q.y - 5)) < 0.01);
    }
  }
});

test('a two-line question finds a free place when an arrow leaves the diamond upwards', async () => {
  const { pagesCaption, edgePoints, segments, inBox } = await import('../../src/core/layout.js');
  const { read } = await import('../../src/core/readBack.js');
  const { readFileSync } = await import('node:fs');
  const text = readFileSync(new URL('./fixtures/complaint-story.txt', import.meta.url), 'utf8')
    .replace('[?Mangel bestätigt]', '[?Ist der Mangel wirklich bestätigt]');
  const r = await run({ ir: emptyProcess('P', 'P'), ops: tell(read(text).moves).ops });
  const n = r.ir.nodes.find((x) => x.kind === 'gateway' && x.name?.startsWith('Ist der Mangel'))!;
  const b = pagesCaption(r.ir, n, r.positions)!;
  assert.equal(b.lines.length, 2);
  const hits = r.ir.edges.filter((e) => segments(edgePoints(r.ir, e, r.positions) ?? []).some(([a, c]) => inBox(a, c, b)));
  assert.deepEqual(hits.map((e) => e.id), []);
});
