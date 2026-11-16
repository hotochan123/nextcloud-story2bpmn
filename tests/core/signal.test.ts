import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tell, Move } from '../../src/core/story.js';
import { read, asSourceText } from '../../src/core/readBack.js';
import { run, emptyProcess } from '../../src/core/pipeline.js';
import { fromBpmn } from '../../src/core/fromBpmn.js';
import { toSvg } from '../../src/core/render.js';
import { toStored, fromStored } from '../../src/core/storyFormat.js';
import { Language } from '../../src/core/language.js';
import { ProcessIR } from '../../src/core/ir.js';

// Job 384: the signal, a notice to everyone, as trigger, wait, path of "what comes first", sending and end.
const story: Move[] = [
  { move: 'start', text: 'Preise freigegeben', role: 'Vertrieb', subtype: 'signal' },
  { move: 'task', text: 'Angebot schreiben', role: 'Vertrieb' },
  { move: 'sendSignal', text: 'Angebot raus', role: '' },
  { move: 'sendSignal', text: 'Lieferstopp ausgerufen', role: 'Qualität' },
  { move: 'wait', text: 'Lieferstopp aufgehoben', subtype: 'signal' },
  { move: 'decision', subtype: 'first', yes: 'Lieferstopp ausgerufen', yesKind: 'signal', no: '3 Tage', noKind: 'time' },
  { move: 'end', text: 'Bestellung storniert', subtype: 'signal' },
  { move: 'end', text: 'Abgewartet' }
];

const TEXT: Record<Language, string[]> = {
  de: [
    'ES BEGINNT mit Signal: [Preise freigegeben] bei [@Vertrieb].',
    '[@Vertrieb] soll [Angebot schreiben].',
    'SIGNAL SENDEN [Angebot raus].',
    'SIGNAL SENDEN [Lieferstopp ausgerufen] bei [@Qualität].',
    'WARTEN AUF SIGNAL [Lieferstopp aufgehoben].',
    'WAS ZUERST PASSIERT:',
    '→ SIGNAL [Lieferstopp ausgerufen]:',
    'ENDE mit Signal: [Bestellung storniert].',
    '→ [!3 Tage]:',
    'ENDE: [Abgewartet].'
  ],
  en: [
    'IT STARTS with a signal: [Preise freigegeben] at [@Vertrieb].',
    '[@Vertrieb] shall [Angebot schreiben].',
    'SEND SIGNAL [Angebot raus].',
    'SEND SIGNAL [Lieferstopp ausgerufen] at [@Qualität].',
    'WAIT FOR SIGNAL [Lieferstopp aufgehoben].',
    'WHAT COMES FIRST:',
    '→ SIGNAL [Lieferstopp ausgerufen]:',
    'END with a signal: [Bestellung storniert].',
    '→ [!3 Tage]:',
    'END: [Abgewartet].'
  ]
};

test('384 AK1 options: send a signal wherever a path is open, end with a signal', () => {
  const g = tell(story.slice(0, 2));
  assert.ok(g.options.includes('sendSignal'));
  // Last but "at any time" (job 391), which comes after it.
  assert.deepEqual(g.options.slice(-2), ['sendSignal', 'anytime']);
  assert.ok(g.endKinds.includes('signal'));
  // Send leaves no step behind: no exception can hang off it.
  assert.ok(!tell(story.slice(0, 3)).options.includes('exceptionPath'));
});

for (const language of ['de', 'en'] as Language[]) {
  test(`384 AK2 story text of every signal move (${language})`, () => {
    const g = tell(story, language);
    assert.deepEqual(g.errors, []);
    assert.equal(g.done, true);
    assert.deepEqual(g.storyText.map((l) => l.text), TEXT[language]);
  });

  test(`384 AK3 read back gives the same story (${language})`, () => {
    const g = tell(story, language);
    const back = read(asSourceText(g.storyText), language);
    assert.deepEqual(back.errors, []);
    assert.deepEqual(tell(back.moves, language).storyText, g.storyText);
    assert.deepEqual(back.moves.filter((m) => m.move === 'sendSignal').map((m) => (m as any).role), [undefined, 'Qualität']);
  });
}

test('384 AK3 send without a role stays in the current lane', () => {
  const back = read(['ES BEGINNT: [Mangel gemeldet] bei [@Qualität].', 'SIGNAL SENDEN [Lieferstopp ausgerufen].', 'ENDE: [Gemeldet].'].join('\n'));
  assert.deepEqual(back.errors, []);
  const g = tell(back.moves);
  const send = g.ir.nodes.find((n) => n.kind === 'send')!;
  assert.equal(g.ir.lanes.find((l) => l.id === (send as any).laneId)?.name, 'Qualität');
  assert.equal(g.ir.lanes.length, 1);
});

test('384 AK4 BPMN: one bpmn:signal per name, signalRef, throw event, back from the file', async () => {
  const g = tell(story);
  const r = await run({ ir: emptyProcess('P', 'Bestellung'), ops: g.ops });
  assert.deepEqual(r.issues, []);
  const xml = r.xml!;
  const signals = [...xml.matchAll(/<bpmn:signal id="([^"]+)" name="([^"]+)"/g)].map((m) => m[2]);
  assert.deepEqual(signals.sort(), ['Angebot raus', 'Bestellung storniert', 'Lieferstopp aufgehoben', 'Lieferstopp ausgerufen', 'Preise freigegeben']);
  assert.equal(xml.match(/<bpmn:signalEventDefinition [^>]*signalRef="Signaldefinition_\d+"/g)?.length, 6);
  assert.equal(xml.match(/<bpmn:intermediateThrowEvent /g)?.length, 2);
  const back = await fromBpmn(xml);
  const kinds = (ir: ProcessIR) => ir.nodes.filter((n) => (n as any).subtype === 'signal').map((n) => `${n.kind}:${n.name}`).sort();
  assert.deepEqual(kinds(back.ir), kinds(r.ir));
  assert.equal(kinds(r.ir).length, 6);
});

test('384 AK4 risk: a foreign throw event without a signal loads as a plain throw event', async () => {
  const r = await run({ ir: emptyProcess('P', 'X'), ops: tell(story.slice(0, 4)).ops });
  const xml = r.xml!.replace(/<bpmn:signalEventDefinition id="Signal_3_signal"[^>]*\/>/, '<bpmn:messageEventDefinition id="m1"/>');
  assert.notEqual(xml, r.xml);
  const back = await fromBpmn(xml);
  const send = back.ir.nodes.filter((n) => n.kind === 'send');
  assert.equal(send.length, 2);
  assert.deepEqual(send.map((n) => (n as any).subtype), [undefined, 'signal']);
  assert.ok(toSvg(back.ir, back.positions).includes('<svg'));
});

test('384 AK5 stored format: sendSignal and signal in German', () => {
  const stored = toStored([story[3], story[4], story[5]]) as any[];
  assert.equal(stored[0]['zug'], 'signalSenden');
  assert.equal(stored[1]['art'], 'signal');
  assert.equal(stored[2]['jaArt'], 'signal');
  assert.deepEqual(fromStored(stored), [story[3], story[4], story[5]]);
});

test('384 AK6 symbols and legend: empty triangle waits, filled one gives', async () => {
  const r = await run({ ir: emptyProcess('P', 'Bestellung'), ops: tell(story).ops });
  const svg = toSvg(r.ir, r.positions);
  for (const word of ['Start mit Signal', 'Warten auf Signal', 'Signal senden', 'Ende mit Signal']) assert.match(svg, new RegExp(`>${word}<`));
  // Triangles: polygon with 3 points; filled with the line colour, empty without fill.
  // Signal triangles are 16 wide (diagram) or 12 (legend, 75 %); arrowheads are narrower.
  const width = (pts: string) => { const x = pts.trim().split(/\s+/).map((q) => Number(q.split(',')[0])); return Math.round(Math.max(...x) - Math.min(...x)); };
  const tri = [...svg.matchAll(/<polygon points="([^"]+)"([^>]*)>/g)].filter((m) => m[1].trim().split(/\s+/).length === 3 && [16, 12].includes(width(m[1])));
  const filled = tri.filter((m) => /fill="#262626"/.test(m[2])).length;
  const empty = tri.length - filled;
  // Diagram: start + 2 waits empty, 2 sends + end filled; legend: start, wait empty, send, end filled.
  assert.equal(empty, 3 + 2);
  assert.equal(filled, 3 + 2);
  const plain = await run({ ir: emptyProcess('P', 'X'), ops: tell([{ move: 'start', text: 'A', role: 'B' }, { move: 'end', text: 'C' }]).ops });
  assert.doesNotMatch(toSvg(plain.ir, plain.positions), /Signal/);
});

test('384 AK6 more than 12 legend entries: the signal family becomes one entry', async () => {
  const big: Move[] = [
    { move: 'start', text: 'Preise freigegeben', role: 'Vertrieb', subtype: 'signal' },
    { move: 'task', text: 'Prüfen', role: 'Vertrieb', documentName: 'Liste' },
    { move: 'exceptionPath', text: 'Fehler' },
    { move: 'end', text: 'Abgebrochen', subtype: 'message' },
    { move: 'decision', question: 'Gut?', yes: 'ja', no: 'nein' },
    { move: 'wait', text: 'Antwort', subtype: 'message' },
    { move: 'wait', text: '2 Tage', subtype: 'time' },
    { move: 'sendSignal', text: 'Lieferstopp ausgerufen' },
    { move: 'concurrent' },
    { move: 'end', text: 'Fertig' },
    { move: 'end', text: 'Gemeldet', subtype: 'signal' },
    { move: 'wait', text: 'Lieferstopp aufgehoben', subtype: 'signal' },
    { move: 'end', text: 'Nein' }
  ];
  const g = tell(big);
  assert.deepEqual(g.errors, []);
  const r = await run({ ir: emptyProcess('P', 'X'), ops: g.ops });
  const svg = toSvg(r.ir, r.positions);
  assert.match(svg, />Signal</);
  assert.doesNotMatch(svg, />Warten auf Signal</);
  assert.doesNotMatch(svg, />Signal senden</);
  // Without the family it would be more than 12 entries.
  const entries = [...svg.matchAll(/font-size="11.5"[^>]*font-weight="bold"[^>]*>([^<]+)</g)].map((m) => m[1]);
  assert.ok(entries.length <= 12, entries.join(', '));
});

test('384 risk: markup in a signal name is escaped in SVG and BPMN', async () => {
  const g = tell([
    { move: 'start', text: 'A', role: 'B' },
    { move: 'sendSignal', text: 'Preise <neu> & ok]' },
    { move: 'end', text: 'C' }
  ]);
  assert.deepEqual(g.errors, []);
  assert.ok(g.storyText.some((l) => l.text === 'SIGNAL SENDEN [Preise <neu> & ok].'));
  const r = await run({ ir: emptyProcess('P', 'X'), ops: g.ops });
  assert.doesNotMatch(toSvg(r.ir, r.positions), /<neu>/);
  assert.match(r.xml!, /<bpmn:signal id="Signaldefinition_1" name="Preise &#60;neu&#62; &#38; ok\]" \/>/);
});
