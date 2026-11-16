import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { tell, Move } from '../../src/core/story.js';
import { read, asSourceText, newWords } from '../../src/core/readBack.js';
import { run, emptyProcess } from '../../src/core/pipeline.js';
import { toPdf } from '../../src/core/render.js';
import { moveLine } from '../../src/core/storyEdit.js';
import { Language } from '../../src/core/language.js';
import { helpPattern } from '../../src/textEdit.js';
import { replay, loadStory } from '../../src/workbench.js';

// Job 444: clearer signal words (`AUSNAHME`, `ZUSAMMENFÜHREN`, `WIEDER AUF DEM`, `JE`; English `EXCEPTION`).
// The story text shows only the new words; reading back understands the old ones too.
const story: Move[] = [
  { move: 'start', text: 'Rechnung geht ein', role: 'Buchhaltung' },
  { move: 'task', text: 'Position prüfen', role: 'Buchhaltung', each: 'Rechnungsposition', eachOrder: 'sequential' },
  { move: 'exceptionPath', text: 'Betrag falsch' },
  { move: 'task', text: 'Rückfrage', role: 'Buchhaltung' },
  { move: 'goTo', target: 'Schritt_2' },
  { move: 'task', text: 'Antrag bearbeiten', role: 'Buchhaltung' },
  { move: 'exceptionPath', text: 'Antrag zurückgezogen', subtype: 'message' },
  { move: 'end', text: 'Zurückgezogen' },
  { move: 'task', text: 'Antrag prüfen', role: 'Buchhaltung' },
  { move: 'exceptionPath', text: 'nach 2 Tagen', subtype: 'deadline', keepsRunning: 'yes' },
  { move: 'task', text: 'Erinnern', role: 'Buchhaltung' },
  { move: 'switchTo', to: 1 },
  { move: 'task', text: 'Antrag ablegen', role: 'Buchhaltung' },
  { move: 'switchTo', to: 1 },
  { move: 'end', text: 'Erinnert' },
  { move: 'decision', question: 'Betrag über 5000 €?', yes: 'ja', no: 'nein' },
  { move: 'task', text: 'Zahlung freigeben', role: 'Führungskraft' },
  { move: 'switchTo', to: 1 },
  { move: 'decision', question: 'Vollständig?', yes: 'ja', no: 'nein' },
  { move: 'openPath', joins: true },
  { move: 'end', text: 'Abgelehnt' },
  { move: 'merge' },
  { move: 'merge' },
  { move: 'task', text: 'Zahlung anweisen', role: 'Buchhaltung' },
  { move: 'end', text: 'Bezahlt' }
];
// Reading back a postponed exception path that keeps the step running fails before this job already
// ("there is no such path here", a backlog bug), so the read-back tests leave those moves out.
const readable: Move[] = [...story.slice(0, 9), ...story.slice(15)];
const text = (moves: Move[], language: Language) => asSourceText(tell(moves, language).storyText);
const plain = (moves: Move[], language: Language) => tell(moves, language).storyText.map((l) => l.text);

/** The same story text with the words before job 444. */
const oldWords = (s: string, language: Language) =>
  s.split('\n').map((l) => {
    const lead = l.slice(0, l.length - l.trimStart().length);
    let b = l.trim();
    if (language === 'en') b = b.replace(/^EXCEPTION /, 'IN CASE OF ').replace(/^BACK ON THE PATH Exception “/, 'BACK ON THE PATH In case of “');
    else b = b.replace(/^AUSNAHME /, 'FALLS ').replace(/^(NOCH OFFEN, DANN )?ZUSAMMENFÜHREN\.$/, '$1ZUSAMMEN.')
      .replace(/^WIEDER AUF DEM WEG Ausnahme „/, 'WEITER AUF DEM WEG Falls „').replace(/^WIEDER AUF DEM /, 'WEITER AUF DEM ')
      .replace(/\], JE \[/, '], FÜR JEDE [');
    return lead + b;
  }).join('\n');

test('444 AK1 the German story text has the new words only', () => {
  const g = tell(story, 'de');
  assert.deepEqual(g.errors, []);
  const lines = plain(story, 'de');
  for (const l of [
    '[@Buchhaltung] soll [Position prüfen], JE [Rechnungsposition], NACHEINANDER.',
    'AUSNAHME [Betrag falsch]:',
    'AUSNAHME NACHRICHT [Antrag zurückgezogen]:',
    'AUSNAHME [!nach 2 Tagen], Schritt läuft weiter:',
    'WIEDER AUF DEM WEG Ausnahme „nach 2 Tagen“:',
    'WIEDER AUF DEM HAUPTWEG:',
    'NOCH OFFEN, DANN ZUSAMMENFÜHREN.',
    'ZUSAMMENFÜHREN.',
    'WIEDER AUF DEM WEG „Betrag über 5000 €?“ → ja:'
  ]) assert.ok(lines.includes(l), l);
  assert.ok(!lines.some((l) => /^(FALLS|WEITER AUF DEM)\b|^ZUSAMMEN\.$|FÜR JEDE|Falls „/.test(l)), lines.join('\n'));
});

test('444 AK2 the English story text says EXCEPTION, never IN CASE OF', () => {
  const lines = plain(story, 'en');
  for (const l of ['EXCEPTION [Betrag falsch]:', 'EXCEPTION MESSAGE [Antrag zurückgezogen]:', 'EXCEPTION [!nach 2 Tagen], step continues:', 'BACK ON THE PATH Exception “nach 2 Tagen”:'])
    assert.ok(lines.includes(l), l);
  assert.ok(!lines.some((l) => /IN CASE OF|In case of/.test(l)), lines.join('\n'));
  // The other English words stay.
  assert.ok(lines.includes('MERGE.') && lines.includes('BACK ON THE MAIN PATH:') && lines.includes('STILL OPEN, THEN MERGE.'));
});

for (const language of ['de', 'en'] as Language[]) {
  test(`444 AK3 read back with new and with old words gives the same moves (${language})`, () => {
    const now = text(readable, language);
    const before = oldWords(now, language);
    assert.notEqual(before, now);
    const a = read(now, language, readable);
    const b = read(before, language, readable);
    assert.deepEqual(a.errors, []);
    assert.deepEqual(b.errors, []);
    assert.deepEqual(b.moves, a.moves);
    assert.equal(text(a.moves, language), now);
    // Without the moves before, too (a story typed from scratch).
    assert.deepEqual(read(before, language).moves, read(now, language).moves);
    // Old and new words mixed in one text.
    const mixed = now.split('\n').map((l, i) => (i % 2 ? oldWords(l, language) : l)).join('\n');
    assert.deepEqual(read(mixed, language, readable).moves, a.moves);
  });
}

test('444 AK3 old words inside a subprocess section', () => {
  const moves: Move[] = [
    { move: 'start', text: 'Antrag geht ein', role: 'A' },
    { move: 'task', text: 'Prüfen', role: 'A', subprocess: [
      { move: 'task', text: 'Unterlagen sichten', role: 'A', each: 'Unterlage', eachOrder: 'parallel' },
      { move: 'exceptionPath', text: 'Unterlage fehlt' },
      { move: 'end', text: 'Unvollständig' },
      { move: 'decision', question: 'Passt?', yes: 'ja', no: 'nein' },
      { move: 'merge' },
      { move: 'merge' },
      { move: 'end', text: 'Geprüft' }
    ] },
    { move: 'end', text: 'Fertig' }
  ];
  const now = text(moves, 'de');
  assert.match(now, /TEILABLAUF \[Prüfen\]:/);
  assert.match(now, /\nAUSNAHME \[Unterlage fehlt\]:/);
  // Indented below its heading, as a person may type it.
  const old = oldWords(now, 'de').split('\n');
  const from = old.indexOf('TEILABLAUF [Prüfen]:') + 1;
  const r = read(old.map((l, i) => (i >= from ? '  ' + l : l)).join('\n'), 'de');
  assert.deepEqual(r.errors, []);
  assert.equal(text(r.moves, 'de'), now);
});

test('444 AK4 an error after an old FALLS line names the right line', () => {
  const now = text(readable, 'de').split('\n');
  const bad = [...now.slice(0, 4), 'Das ist kein Zug', ...now.slice(4)];
  const a = read(bad.join('\n'), 'de', readable);
  const b = read(oldWords(bad.join('\n'), 'de'), 'de', readable);
  assert.equal(a.line, 5);
  assert.equal(b.line, 5);
  assert.deepEqual(b.errors, a.errors);
});

test('444 risk: words inside brackets and other lines stay as typed', () => {
  assert.equal(newWords('[@FALLS] soll [ZUSAMMEN].', 'de'), '[@FALLS] soll [ZUSAMMEN].');
  assert.equal(newWords('  ZUSAMMEN.', 'de'), '  ZUSAMMENFÜHREN.');
  assert.equal(newWords('ZUSAMMEN mit X.', 'de'), 'ZUSAMMEN mit X.');
  assert.equal(newWords('FALLS [x]:', 'en'), 'FALLS [x]:');
  assert.equal(newWords('IN CASE OF [x]:', 'de'), 'IN CASE OF [x]:');
  assert.equal(newWords('[@A] soll [Für jede Rechnung, FÜR JEDE Zeile].', 'de'), '[@A] soll [Für jede Rechnung, FÜR JEDE Zeile].');
  assert.equal(newWords('WENN [?FALLS es regnet]', 'de'), 'WENN [?FALLS es regnet]');
  // Headings of a postponed path, also with the old name of an exception path.
  assert.equal(newWords('WEITER AUF DEM HAUPTWEG:', 'de'), 'WIEDER AUF DEM HAUPTWEG:');
  assert.equal(newWords('  WEITER AUF DEM WEG Falls „nach 2 Tagen“:', 'de'), '  WIEDER AUF DEM WEG Ausnahme „nach 2 Tagen“:');
  assert.equal(newWords('BACK ON THE PATH In case of “after 2 days”:', 'en'), 'BACK ON THE PATH Exception “after 2 days”:');
  assert.equal(newWords('NOCH OFFEN, DANN ZUSAMMEN', 'de'), 'NOCH OFFEN, DANN ZUSAMMENFÜHREN');
  assert.equal(newWords('[@A] soll [B], FÜR JEDE [Zeile], GLEICHZEITIG.', 'de'), '[@A] soll [B], JE [Zeile], GLEICHZEITIG.');
});

test('444 AK5 the line of a move in the form says the new words', () => {
  assert.equal(moveLine({ move: 'exceptionPath', text: 'Betrag falsch' }, 'de'), 'AUSNAHME [Betrag falsch]:');
  assert.equal(moveLine({ move: 'exceptionPath', text: 'Zurückgezogen', subtype: 'message' }, 'de'), 'AUSNAHME NACHRICHT [Zurückgezogen]:');
  assert.equal(moveLine({ move: 'exceptionPath', text: 'Betrag falsch' }, 'en'), 'EXCEPTION [Betrag falsch]:');
  assert.equal(moveLine({ move: 'merge' }, 'de'), 'ZUSAMMENFÜHREN.');
  assert.equal(moveLine({ move: 'openPath', joins: true }, 'de'), 'NOCH OFFEN, DANN ZUSAMMENFÜHREN.');
  assert.match(moveLine({ move: 'task', text: 'Prüfen', role: 'A', each: 'Zeile', eachOrder: 'sequential' }, 'de'), /, JE \[Zeile\], NACHEINANDER/);
});

test('444 AK6 a working file saved with the old words opens with the same moves and shows the new words', async () => {
  const xml = readFileSync('tests/core/fixtures/legacy-working-file.bpmn', 'utf8');
  assert.match(xml, /FALLS|ZUSAMMEN\.|WEITER AUF DEM/);
  const g = await loadStory(xml, 'de');
  assert.ok('moves' in g, JSON.stringify(g));
  assert.equal(g.changed, false);
  const lines = (await replay(g.moves, g.language)).storyText.map((l) => l.text);
  assert.ok(lines.some((l) => l.startsWith('AUSNAHME ')));
  assert.ok(lines.includes('WIEDER AUF DEM WEG „Ware auf Lager?“ → ja:'));
  assert.ok(!lines.some((l) => /^(FALLS|WEITER AUF DEM)\b|^ZUSAMMEN\.$/.test(l)));
});

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

for (const language of ['de', 'en'] as Language[]) {
  test(`444 AK7 reading copy and writing aid use the new words (${language})`, async () => {
    const g = tell(story, language);
    const e = await run({ ir: { ...emptyProcess('P', g.ir.name, language), story }, ops: g.ops });
    const texts = pdfTexts(await toPdf(e.ir, e.positions, { told: asSourceText(g.storyText) }));
    const help = helpPattern(language).join('\n');
    if (language === 'de') {
      assert.ok(texts.includes('AUSNAHME') && texts.includes('WIEDER AUF DEM WEG'), texts.join(' | '));
      assert.ok(!texts.some((x) => /^(FALLS|WEITER AUF DEM)\b/.test(x)));
      assert.match(help, /AUSNAHME \[Abweichung\]:/);
      assert.match(help, /ZUSAMMENFÜHREN\./);
      assert.match(help, /WIEDER AUF DEM WEG/);
      assert.doesNotMatch(help, /FALLS|WEITER AUF DEM|ZUSAMMEN\. /);
    } else {
      assert.ok(texts.includes('EXCEPTION'), texts.join(' | '));
      assert.ok(!texts.some((x) => x.startsWith('IN CASE OF')));
      assert.match(help, /EXCEPTION \[deviation\]:/);
      assert.doesNotMatch(help, /IN CASE OF/);
    }
  });
}
