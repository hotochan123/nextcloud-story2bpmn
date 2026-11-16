// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tell, Move } from '../../src/core/story.js';
import { read, lineNumbers, asSourceText } from '../../src/core/readBack.js';
import { Language } from '../../src/core/language.js';
import { exampleMoves } from '../../src/example.js';

// Job 449: the lines of the story text are numbered like the story (moves, headings without a number).

// What can come at any time stands after the flow of its level, as read() puts it (told in the middle, the
// story numbers it in the order it was told: tests/client/textNumbers.test.ts).
const sub: Move[] = [
  { move: 'start', text: 'Antrag geht ein', role: 'Vertrieb' },
  {
    move: 'task', text: 'Antrag prüfen', role: 'Vertrieb', subprocess: [
      { move: 'task', text: 'Unterlagen sichten', role: 'Prüfer' },
      { move: 'end', text: 'Geprüft' },
      { move: 'anytime', text: 'Kunde zieht zurück', subtype: 'message', keepsRunning: '', subprocess: [{ move: 'task', text: 'Prüfung abbrechen', role: 'Prüfer' }, { move: 'end', text: 'Abgebrochen' }] },
    ],
  },
  { move: 'task', text: 'Bescheid senden', role: 'Vertrieb' },
  { move: 'end', text: 'Erledigt' },
  { move: 'anytime', text: 'Storno', subtype: 'time', keepsRunning: '', subprocess: [{ move: 'end', text: 'Storniert' }] },
];
const decision: Move[] = [
  { move: 'start', text: 'Rechnung eingegangen', role: 'Buchhaltung' },
  { move: 'task', text: 'Rechnung prüfen', role: 'Buchhaltung' },
  { move: 'decision', yes: 'ja', no: 'nein', text: 'Rechnung korrekt' } as Move,
  { move: 'task', text: 'Rechnung buchen', role: 'Buchhaltung' },
  { move: 'end', text: 'Gebucht' },
  { move: 'task', text: 'Rechnung zurückweisen', role: 'Buchhaltung' },
  { move: 'end', text: 'Abgelehnt' },
];
// The normal path told before the path of an exception: a "switch to" move without a line of its own (job 446).
const deferred: Move[] = [
  { move: 'start', text: 'Antrag geht ein', role: 'Sachbearbeitung' },
  { move: 'task', text: 'Antrag prüfen', role: 'Sachbearbeitung' },
  { move: 'exceptionPath', text: 'Antrag unvollständig' },
  { move: 'switchTo', to: 1 },
  { move: 'task', text: 'Bescheid schicken', role: 'Sachbearbeitung' },
  { move: 'end', text: 'Beschieden' },
  { move: 'end', text: 'Abgelehnt' },
];
const parallel = ['ES BEGINNT: [x] bei [@A].', 'GLEICHZEITIG:', '- erster Strang:', '  [@A] soll [Eins].', '  ENDE: [a].', '- zweiter Strang:', '  ENDE: [b].'].join('\n');
const reklamation = readFileSync('tests/client/fixtures/reklamation.txt', 'utf8').trimEnd();

/** The stories of the test as moves: told ones, and ones typed as text. */
function stories(): [string, Move[], Language][] {
  const typed = (text: string): Move[] => {
    const r = read(text);
    assert.deepEqual(r.errors, []);
    return r.moves;
  };
  return [
    ['example de', exampleMoves('de'), 'de'],
    ['example en', exampleMoves('en'), 'en'],
    ['decision', decision, 'de'],
    ['parallel', typed(parallel), 'de'],
    ['reklamation', typed(reklamation), 'de'],
    ['subprocess and at any time', sub, 'de'],
    ['other path first', deferred, 'de'],
  ];
}
const shown = (moves: Move[], language: Language) => {
  const g = tell(moves, language);
  assert.deepEqual(g.errors, []);
  return { text: asSourceText(g.storyText), numbers: g.storyText.map((l) => (l.move === undefined ? null : l.move + 1)) };
};

test('449 AK1 read() numbers each line of the story text as the story shows it', () => {
  for (const [name, moves, language] of stories()) {
    const { text, numbers } = shown(moves, language);
    const r = read(text, language, moves);
    assert.deepEqual(r.errors, [], name);
    assert.deepEqual(r.numbers, numbers, name);
  }
});

test('449 AK1 path headings, section headings and the plain start of a section have no number', () => {
  const { text } = shown(sub, 'de');
  const r = read(text, 'de', sub);
  const lines = text.split('\n');
  for (const [i, l] of lines.entries()) {
    if (/^(TEILABLAUF \[|ES BEGINNT\.$)/.test(l.trim())) assert.equal(r.numbers[i], null, l);
  }
  const d = shown(decision, 'de');
  const rd = read(d.text);
  d.text.split('\n').forEach((l, i) => { if (/→/.test(l)) assert.equal(rd.numbers[i], null, l); });
  // Each section counts from 1 again, the JEDERZEIT heading of the subprocess is its move 3.
  assert.equal(r.numbers[lines.indexOf('[@Prüfer] soll [Unterlagen sichten].')], 1);
  assert.equal(r.numbers[lines.indexOf('JEDERZEIT mit Nachricht: [Kunde zieht zurück]:')], 3);
  assert.equal(r.numbers[lines.indexOf('[@Prüfer] soll [Prüfung abbrechen].')], 1);
});

test('449 AK2 lineNumbers() from the text alone equals read() without "switch to" moves', () => {
  for (const [name, moves, language] of stories()) {
    if (moves.some((z) => z.move === 'switchTo')) continue;
    const { text, numbers } = shown(moves, language);
    assert.deepEqual(lineNumbers(text, language), numbers, name);
  }
  // Typed with the old signal words and a hyphen for the strand dash.
  assert.deepEqual(lineNumbers(parallel), read(parallel).numbers);
  assert.deepEqual(lineNumbers(reklamation), read(reklamation).numbers);
});

test('449 AK2 lineNumbers() takes less than 5 ms for 200 lines', () => {
  const lines = ['ES BEGINNT: [A] bei [@B].'];
  for (let i = 0; lines.length < 200; i++) lines.push(`[@B] soll [Schritt ${i}].`, 'WENN [?Gut]', '→ ja:', `  [@B] soll [Ja ${i}].`, 'SONST → nein:', `  [@B] soll [Nein ${i}].`, 'ZUSAMMENFÜHREN.');
  const text = lines.slice(0, 200).join('\n');
  lineNumbers(text);
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) lineNumbers(text);
  assert.ok((performance.now() - t0) / 20 < 5);
});

test('449 AK3 an error names the move number of its line; a heading has none; lines after it count on', () => {
  const { text } = shown(decision, 'de');
  const lines = text.split('\n');
  const at = lines.indexOf('  ENDE: [Gebucht].');
  assert.equal(at, 5);
  const typo = [...lines];
  typo[at] = '  ENDEE: [Gebucht].';
  const r = read(typo.join('\n'));
  assert.match(r.errors[0], /^Zeile 5: /);
  assert.equal(r.line, 6);
  assert.deepEqual(r.numbers, [1, 2, 3, null, 4, 5, null, 6, 7]);
  const wrong = [...lines.slice(0, 6), '→ vielleicht:', ...lines.slice(7)];
  const w = read(wrong.join('\n'));
  assert.ok(w.errors.length);
  assert.doesNotMatch(w.errors[0], /^Zeile/);
  assert.equal(w.line, 7);
  assert.equal(w.numbers[6], null);
  assert.deepEqual(w.numbers.slice(7), [6, 7]);
});

test('449 AK3 the number of an error after a "switch to" move is the one of the story', () => {
  const { text, numbers } = shown(deferred, 'de');
  const lines = text.split('\n');
  const at = lines.findIndex((l) => l.includes('Bescheid schicken'));
  assert.equal(numbers[at], 5);
  lines[at] = lines[at].replace('soll', 'sol');
  const r = read(lines.join('\n'), 'de', deferred);
  assert.match(r.errors[0], /^Zeile 5: /);
  assert.equal(r.line, at + 1);
});

test('449 AK3 a too long line names its number from the text', () => {
  const r = read(['ES BEGINNT: [A] bei [@B].', 'WENN [?Gut]', '→ ja:', `[@B] soll [${'x'.repeat(600)}].`].join('\n'));
  assert.match(r.errors[0], /^Zeile 3: /);
  assert.equal(r.line, 4);
});
