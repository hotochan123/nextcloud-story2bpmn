import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tell, Move } from '../../src/core/story.js';
import { run, emptyProcess } from '../../src/core/pipeline.js';
import { measureOne } from '../../src/core/readability.js';

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
