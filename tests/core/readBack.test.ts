import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tell, Move } from '../../src/core/story.js';
import { read, asSourceText } from '../../src/core/readBack.js';
import { Language } from '../../src/core/language.js';

const stories: Record<string, Move[]> = {
  invoice: [
    { move: 'start', text: 'Rechnung geht ein', role: 'Buchhaltung', subtype: 'message' },
    { move: 'task', text: 'Rechnung prüfen', role: 'Buchhaltung', system: 'SAP', documentName: 'Rechnung, Bestellschein', deadline: '3 Arbeitstage' },
    { move: 'exceptionPath', text: 'Betrag falsch' },
    { move: 'task', text: 'Rückfrage beim Lieferanten', role: 'Buchhaltung' },
    { move: 'goTo', target: 'Schritt_2' },
    { move: 'decision', question: 'Betrag über 5000 €?', yes: 'ja', no: 'nein' },
    { move: 'task', text: 'Zahlung freigeben', role: 'Führungskraft' },
    { move: 'merge' },
    { move: 'merge' },
    { move: 'wait', text: 'Zahlungstermin', subtype: 'time' },
    { move: 'task', text: 'Zahlung anweisen', role: 'Buchhaltung' },
    { move: 'end', text: 'Bezahlt' }
  ],
  reminder: [
    { move: 'start', text: 'Monatsende', role: 'Buchhaltung', subtype: 'time' },
    { move: 'task', text: 'Rechnung schicken', role: 'Buchhaltung' },
    { move: 'wait', text: 'Rückmeldung', subtype: 'message' },
    { move: 'decision', subtype: 'first', yes: 'Zahlung geht ein', yesKind: 'message', no: '14 Tage', noKind: 'time' },
    { move: 'task', text: 'Zahlung verbuchen', role: 'Buchhaltung' },
    { move: 'merge' },
    { move: 'task', text: 'Mahnung schicken', role: 'Buchhaltung', documentName: 'Mahnschreiben' },
    { move: 'merge' },
    { move: 'end', text: 'Erledigt' }
  ],
  application: [
    { move: 'start', text: 'Antrag geht ein', role: 'Sachbearbeitung' },
    { move: 'task', text: 'Antrag bearbeiten', role: 'Sachbearbeitung' },
    { move: 'exceptionPath', text: 'nach 2 Tagen', subtype: 'deadline', keepsRunning: 'yes' },
    { move: 'task', text: 'Erinnerung schicken', role: 'Teamleitung' },
    { move: 'end', text: 'Erinnert' },
    { move: 'task', text: 'Bescheid schicken', role: 'Sachbearbeitung' },
    { move: 'exceptionPath', text: 'Antrag zurückgezogen', subtype: 'message' },
    { move: 'end', text: 'Zurückgezogen' },
    { move: 'end', text: 'Beschieden', subtype: 'message' }
  ],
  jobApplication: [
    { move: 'start', text: 'Bewerbung geht ein', role: 'Personal' },
    { move: 'concurrent' },
    { move: 'task', text: 'Unterlagen prüfen', role: 'Personal' },
    { move: 'end', text: 'Abgelehnt', subtype: 'cancel' },
    { move: 'task', text: 'Gespräch planen', role: 'Fachabteilung' },
    { move: 'end', text: 'Eingeladen', subtype: 'message' }
  ],
  warehouse: [
    { move: 'start', text: 'Lager unter Mindestbestand', role: 'Lager', subtype: 'condition' },
    { move: 'task', text: 'Nachbestellen', role: 'Lager' },
    { move: 'wait', text: 'Lieferant hat Ware', subtype: 'condition' },
    { move: 'decision', subtype: 'first', yes: 'Lager wieder voll', yesKind: 'condition', no: '5 Tage', noKind: 'time' },
    { move: 'end', text: 'Aufgefüllt' },
    { move: 'end', text: 'Verspätet' }
  ],
  // First "nein", then back to "ja": switch and continuation heading.
  switchTo: [
    { move: 'start', text: 'Rechnung geht ein', role: 'Buchhaltung' },
    { move: 'decision', question: 'Betrag über 5000 €?', yes: 'ja', no: 'nein' },
    { move: 'task', text: 'Zahlung freigeben', role: 'Führungskraft' },
    { move: 'switchTo', to: 1 },
    { move: 'end', text: 'Abgelehnt' },
    { move: 'task', text: 'Zahlung anweisen', role: 'Buchhaltung' },
    { move: 'end', text: 'Bezahlt' }
  ]
};

for (const language of ['de', 'en'] as Language[])
  for (const [name, moves] of Object.entries(stories))
    test(`round trip ${name} (${language}): moves → story text → moves gives the same diagram`, () => {
      const g = tell(moves, language);
      assert.deepEqual(g.errors, []);
      const text = asSourceText(g.storyText);
      const r = read(text, language);
      assert.deepEqual(r.errors, [], text);
      const h = tell(r.moves, language);
      assert.deepEqual(h.ops, g.ops);
      assert.equal(asSourceText(h.storyText), text);
    });

test('reading back: written by hand, without brackets and indentation', () => {
  const r = read(['ES BEGINNT: [Rechnung geht ein] bei [@Buchhaltung].', 'Buchhaltung soll Rechnung prüfen.', 'WENN Betrag über 5000 €?', '→ ja:', 'Führungskraft soll Zahlung freigeben.', 'ZUSAMMEN.', 'SONST → nein:', 'ZUSAMMEN.', 'ENDE: Bezahlt.'].join('\n'));
  assert.deepEqual(r.errors, []);
  const g = tell(r.moves);
  assert.equal(g.done, true);
  assert.deepEqual(r.moves[2], { move: 'decision', question: 'Betrag über 5000 €?', yes: 'ja', no: 'nein' });
  assert.deepEqual(r.moves[1], { move: 'task', text: 'Rechnung prüfen', role: 'Buchhaltung' });
});

test('reading back: the error names the line', () => {
  assert.match(read('ES BEGINNT: [A] bei [@B].\nirgendwas').errors[0], /^Zeile 2: „irgendwas“ nicht verstanden/);
  // The line also as a number, for the marker in the editor; blank lines count.
  assert.equal(read('ES BEGINNT: [A] bei [@B].\n\nirgendwas').line, 3);
  assert.match(read('ES BEGINNT: [A] bei [@B].\nWEITER BEI [Gibtsnicht].').errors[0], /^Zeile 2: Bei „Gibtsnicht“/);
  assert.match(read('ES BEGINNT: [A] bei [@B].\nZUSAMMEN.').errors[0], /^Zeile 2: Hier ist nichts verzweigt/);
  // Without headings: the decision gets "ja" / "nein".
  const without = read('ES BEGINNT: [A] bei [@B].\nWENN [?X]\nENDE: [Y].\nENDE: [Z].');
  assert.deepEqual(without.errors, []);
  assert.equal((without.moves[1] as any).no, 'nein');
});
