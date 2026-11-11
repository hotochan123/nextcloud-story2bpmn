import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tell, splice, asText, Move } from '../../src/core/story.js';
import { run, emptyProcess } from '../../src/core/pipeline.js';
import { fromBpmn } from '../../src/core/fromBpmn.js';
import { toSvg, toPdf } from '../../src/core/render.js';

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

test('story with exception loop and decision gives valid BPMN', async () => {
  const g = tell(invoice);
  assert.deepEqual(g.errors, []);
  assert.equal(g.done, true);
  const r = await run({ ir: emptyProcess('P', 'Prozess'), ops: g.ops });
  assert.deepEqual(r.issues, []);
  assert.equal(r.ok, true);
});

test('after every move the options fit', () => {
  assert.deepEqual(tell([]).options, ['start']);
  const afterTask = tell(invoice.slice(0, 2));
  assert.ok(afterTask.options.includes('exceptionPath'));
  assert.ok(!afterTask.options.includes('merge'));
  // On the exception path: going back to "Rechnung prüfen" is offered.
  const inExceptionPath = tell(invoice.slice(0, 4));
  assert.ok(inExceptionPath.targets.some((z) => z.id === 'Schritt_2'));
  assert.ok(inExceptionPath.options.includes('merge'));
});

test('simultaneous strands run through a parallel join', async () => {
  const g = tell([
    { move: 'start', text: 'Neuer Mitarbeiter', role: 'Personal' },
    { move: 'concurrent' },
    { move: 'task', text: 'Vertrag erstellen', role: 'Personal' },
    { move: 'merge' },
    { move: 'task', text: 'Laptop bestellen', role: 'IT' },
    { move: 'merge' },
    { move: 'end', text: 'Eingestellt' }
  ]);
  assert.deepEqual(g.errors, []);
  const r = await run({ ir: emptyProcess('P', 'Prozess'), ops: g.ops });
  assert.deepEqual(r.issues, []);
  assert.ok(r.ir.nodes.some((n) => n.kind === 'gateway' && n.gatewayType === 'parallel' && n.id.startsWith('Zusammen')));
});

test('a loop back does not make the diagram wider', async () => {
  const r = await run({ ir: emptyProcess('P', 'Prozess'), ops: tell(invoice).ops });
  // Longest path forward: 8 nodes, measured ~1500 px. Without backward-arrow
  // detection the cycle ran up to the guard and the picture became many times wider.
  const boxWidth = Math.max(...Object.values(r.positions).map((p) => p.x));
  assert.ok(boxWidth < 1700, `zu breit: ${boxWidth}`);
});

test('working file: lanes lie gaplessly in one pool and come back when read in', async () => {
  const { fromBpmn } = await import('../../src/core/fromBpmn.js');
  const r = await run({ ir: emptyProcess('P', 'Rechnung'), ops: tell(invoice).ops });
  assert.ok(r.xml);
  assert.match(r.xml!, /<bpmn:participant id="P_pool" name="Rechnung" processRef="P"/);

  const bounds = (id: string) => {
    const m = new RegExp(String.raw`bpmnElement="${id}"[^>]*>\s*<dc:Bounds x="(-?\d+)" y="(-?\d+)" width="(\d+)" height="(\d+)"`).exec(r.xml!);
    assert.ok(m, `keine Form für ${id}`);
    return m!.slice(1).map(Number);
  };
  const [, y1, , h1] = bounds('Bahn_1');
  const [, y2, , h2] = bounds('Bahn_2');
  const [px, py, , ph] = bounds('P_pool');
  assert.equal(y1 + h1, y2, 'Lücke zwischen den Bahnen');
  assert.equal(py, y1);
  assert.equal(py + ph, y2 + h2);
  assert.equal(px + 30, bounds('Bahn_1')[0], 'Bahn beginnt rechts vom Pool-Kopf');

  const back = await fromBpmn(r.xml!);
  assert.deepEqual(back.ir.lanes, r.ir.lanes);
  assert.deepEqual(back.ir.nodes.length, r.ir.nodes.length);
});

test('story text: signal words, marked objects, only side paths are indented', () => {
  const lines = tell(invoice).storyText.map((l) => '  '.repeat(l.depth) + l.text);
  assert.deepEqual(lines, [
    'ES BEGINNT: [Rechnung geht ein] bei [@Buchhaltung].',
    '[@Buchhaltung] soll [Rechnung prüfen].',
    'FALLS [Betrag falsch]:',
    '  [@Buchhaltung] soll [Rückfrage beim Lieferanten].',
    '  WEITER BEI [Rechnung prüfen].',
    // The normal path after the exception is the main line again.
    'WENN [?Betrag über 5000 €]',
    '→ ja:',
    '  [@Führungskraft] soll [Zahlung freigeben].',
    '  ZUSAMMEN.',
    'SONST → nein:',
    '  ZUSAMMEN.',
    '[@Buchhaltung] soll [Zahlung anweisen].',
    'ENDE: [Bezahlt].'
  ]);
});

test('story text: a rejected move leaves no line', () => {
  const g = tell([{ move: 'start', text: 'Los', role: 'A' }, { move: 'merge' }]);
  assert.equal(g.errors.length, 1);
  assert.deepEqual(g.storyText.map((l) => l.text), ['ES BEGINNT: [Los] bei [@A].']);
});

test('English: signal words, questions, pool and ENTWURF; typed text stays', async () => {
  const g = tell(invoice, 'en');
  assert.deepEqual(g.storyText.map((l) => '  '.repeat(l.depth) + l.text), [
    'IT STARTS: [Rechnung geht ein] at [@Buchhaltung].',
    '[@Buchhaltung] shall [Rechnung prüfen].',
    'IN CASE OF [Betrag falsch]:',
    '  [@Buchhaltung] shall [Rückfrage beim Lieferanten].',
    '  CONTINUE AT [Rechnung prüfen].',
    'IF [?Betrag über 5000 €]',
    '→ ja:',
    '  [@Führungskraft] shall [Zahlung freigeben].',
    '  MERGE.',
    'ELSE → nein:',
    '  MERGE.',
    '[@Buchhaltung] shall [Zahlung anweisen].',
    'END: [Bezahlt].'
  ]);
  assert.equal(g.ir.name, 'Process');
  assert.equal(tell([], 'en').question, 'How does the process start, and with whom?');
  assert.deepEqual(tell([{ move: 'start', text: 'Go', role: 'A' }, { move: 'merge' }], 'en').errors, [
    'Nothing has branched here that could merge'
  ]);

  // The language travels along in the working file and comes back when read in.
  const r = await run({ ir: emptyProcess('P', 'Process', 'en'), ops: g.ops });
  assert.match(r.xml!, /xml:lang="en"/);
  assert.equal((await fromBpmn(r.xml!)).ir.language, 'en');
  const svg = toSvg(r.ir, r.positions, { draft: true });
  assert.match(svg, />DRAFT</);
  // Legend only with symbols that appear in the diagram.
  assert.match(svg, />Legend</);
  assert.match(svg, />Step</);
  assert.doesNotMatch(svg, />In parallel</);
});

test('process name, system and deadline: in the diagram and in the story text; empty fields do not count', async () => {
  const g = tell([
    { move: 'start', text: 'Rechnung geht ein', role: 'Buchhaltung', process: ' Rechnungseingang ' },
    { move: 'task', text: 'Rechnung prüfen', role: 'Buchhaltung', system: 'SAP', deadline: '3 Tage' },
    { move: 'exceptionPath', text: 'nach 3 Tagen', subtype: 'deadline' },
    { move: 'end', text: 'Gemahnt' },
    { move: 'task', text: 'Zahlung anweisen', role: 'Buchhaltung', system: '', deadline: '  ' },
    { move: 'end', text: 'Bezahlt' }
  ]);
  assert.deepEqual(g.errors, []);
  assert.equal(g.ir.name, 'Rechnungseingang');
  assert.deepEqual(g.storyText.map((l) => l.text), [
    'ES BEGINNT: [Rechnung geht ein] bei [@Buchhaltung].',
    '[@Buchhaltung] soll [Rechnung prüfen] in [#SAP], Frist [!3 Tage].',
    'FALLS [!nach 3 Tagen]:',
    'ENDE: [Gemahnt].',
    '[@Buchhaltung] soll [Zahlung anweisen].',
    'ENDE: [Bezahlt].'
  ]);
  const tasks = g.ir.nodes.filter((n) => n.kind === 'step') as { details?: unknown }[];
  assert.deepEqual(tasks.map((s) => s.details), [{ system: 'SAP', deadline: '3 Tage' }, undefined]);

  // Without a name the default stays; a deadline exception becomes a timer in the file.
  assert.equal(tell([{ move: 'start', text: 'Los', role: 'A', process: '' }]).ir.name, 'Prozess');
  const r = await run({ ir: emptyProcess('P', g.ir.name), ops: g.ops });
  assert.equal(r.ok, true);
  assert.match(r.xml!, /timerEventDefinition/);
  assert.match(r.xml!, /name="Rechnungseingang"/);
  assert.equal(
    tell([{ move: 'start', text: 'Go', role: 'A' }, { move: 'task', text: 'Check', role: 'A', deadline: '2 days' }], 'en').storyText[1].text,
    '[@A] shall [Check], deadline [!2 days].'
  );
});

test('inserting a task afterwards: "weiter bei" still points to the same task', () => {
  const added = splice(invoice, 1, 0, [{ move: 'task', text: 'Rechnung scannen', role: 'Poststelle' }]);
  const g = tell(added);
  assert.deepEqual(g.errors, []);
  assert.equal(g.done, true);
  const goTo = added.find((z) => z.move === 'goTo') as { target: string };
  assert.equal(g.ir.nodes.find((n) => n.id === goTo.target)?.name, 'Rechnung prüfen');
  // Lines know their move - the UI uses that to change a line.
  assert.deepEqual(g.storyText.slice(0, 3).map((z) => z.move), [0, 1, 2]);
  assert.match(g.storyText[1].text, /Rechnung scannen/);
});

test('the moves are in the working file and come back when read in', async () => {
  const g = tell(invoice);
  const r = await run({ ir: { ...emptyProcess('P', 'Prozess'), story: invoice }, ops: g.ops });
  assert.match(r.xml!, /bpmnc:geschichte=/);
  const { ir } = await fromBpmn(r.xml!);
  assert.deepEqual(ir.story, invoice);
});

test('deleting a task: later "weiter bei" shift along, a deleted target reports itself', () => {
  // "Rückfrage" (move 3) gone: the exception leads straight back to "Rechnung prüfen".
  const without = splice(invoice, 3, 1, []);
  const g = tell(without);
  assert.deepEqual(g.errors, []);
  assert.equal(g.done, true);
  // "Rechnung prüfen" (move 1) gone: the loop has no target any more.
  const broken = tell(splice(invoice, 1, 1, []));
  assert.ok(broken.errors.some((f) => f.includes('Rechnung prüfen')), broken.errors.join('|'));
});

test('story text as plain text: in the file on the process and as the second PDF page', async () => {
  const g = tell(invoice);
  const text = asText(g.storyText);
  assert.match(text, /^ES BEGINNT: Rechnung geht ein bei Buchhaltung\.$/m);
  assert.match(text, /^WENN Betrag über 5000 €\?$/m);
  assert.match(text, /^  Buchhaltung soll Rückfrage beim Lieferanten\.$/m);
  const r = await run({ ir: { ...emptyProcess('P', 'Prozess'), description: text }, ops: g.ops });
  const { ir } = await fromBpmn(r.xml!);
  assert.equal(ir.description, text);
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.load(await toPdf(r.ir, r.positions));
  assert.equal(pdf.getPageCount(), 2);
});

test('start kind message and time: file there and back, symbols, legend, story text', async () => {
  for (const [subtype, def, word] of [
    ['message', 'bpmn:messageEventDefinition', 'Start mit Nachricht'],
    ['time', 'bpmn:timerEventDefinition', 'Start zum Zeitpunkt']
  ] as const) {
    const g = tell([
      { move: 'start', text: 'Antrag geht ein', role: 'Poststelle', subtype },
      { move: 'task', text: 'Antrag prüfen', role: 'Poststelle' },
      { move: 'end', text: 'Geprüft' }
    ]);
    assert.deepEqual(g.errors, []);
    assert.match(g.storyText[0].text, subtype === 'message' ? /^ES BEGINNT mit Nachricht: / : /^ES BEGINNT zum Zeitpunkt: /);
    const r = await run({ ir: emptyProcess('P', 'Antrag'), ops: g.ops });
    assert.deepEqual(r.issues, []);
    assert.match(r.xml!, new RegExp(`<${def} `));
    const back = await fromBpmn(r.xml!);
    assert.equal((back.ir.nodes.find((n) => n.kind === 'start') as any).subtype, subtype);
    const svg = toSvg(r.ir, r.positions);
    assert.match(svg, new RegExp(`>${word}<`));
    assert.doesNotMatch(svg, />Start</);
  }
  // Empty kind = plain start, as before.
  const simple = tell([{ move: 'start', text: 'Los', role: 'A', subtype: '' }]);
  assert.equal((simple.ir.nodes[0] as any).subtype, undefined);
  assert.equal(simple.storyText[0].text, 'ES BEGINNT: [Los] bei [@A].');
});

test('waiting for message and time: valid BPMN, read back, target for weiter bei, deletable', async () => {
  const moves: Move[] = [
    { move: 'start', text: 'Bestellung geht ein', role: 'Einkauf' },
    { move: 'task', text: 'Angebot anfragen', role: 'Einkauf' },
    { move: 'wait', text: 'Angebot des Lieferanten', subtype: 'message' },
    { move: 'decision', question: 'Angebot passt?', yes: 'ja', no: 'nein' },
    { move: 'task', text: 'Bestellen', role: 'Einkauf' },
    { move: 'end', text: 'Bestellt' },
    { move: 'wait', text: '3 Tage', subtype: 'time' },
    { move: 'goTo', target: 'Warten_3' }
  ];
  const g = tell(moves);
  assert.deepEqual(g.errors, []);
  assert.equal(g.done, true);
  assert.deepEqual(g.storyText.map((l) => l.text).filter((s) => s.includes('WARTEN')), [
    'WARTEN AUF [Angebot des Lieferanten].',
    'WARTEN AUF [!3 Tage].'
  ]);
  assert.ok(tell(moves.slice(0, 2)).options.includes('wait'));

  const r = await run({ ir: emptyProcess('P', 'Einkauf'), ops: g.ops });
  assert.deepEqual(r.issues, []);
  assert.match(r.xml!, /<bpmn:intermediateCatchEvent id="Warten_3" name="Angebot des Lieferanten">[\s\S]*?<bpmn:messageEventDefinition /);
  assert.match(r.xml!, /<bpmn:timerEventDefinition /);
  const back = await fromBpmn(r.xml!);
  assert.deepEqual(
    back.ir.nodes.filter((n) => n.kind === 'wait').map((n) => [n.id, (n as any).subtype]),
    [['Warten_3', 'message'], ['Warten_7', 'time']]
  );
  const svg = toSvg(r.ir, r.positions);
  assert.match(svg, />Warten auf Nachricht</);
  assert.match(svg, />Warten auf Zeit</);

  // Delete a wait like a task: the rest replays, only the line is missing.
  const without = tell(splice(moves, 6, 1, []));
  assert.ok(!without.storyText.some((l) => l.text.includes('3 Tage')));
});

test('what happens first: paths begin with waiting, valid BPMN, read back', async () => {
  const moves: Move[] = [
    { move: 'start', text: 'Auftrag erledigt', role: 'Buchhaltung' },
    { move: 'task', text: 'Rechnung schicken', role: 'Buchhaltung' },
    { move: 'decision', subtype: 'first', yes: 'Zahlung geht ein', yesKind: 'message', no: '14 Tage', noKind: 'time' },
    { move: 'task', text: 'Zahlung verbuchen', role: 'Buchhaltung' },
    { move: 'merge' },
    { move: 'task', text: 'Mahnung schicken', role: 'Buchhaltung' },
    { move: 'merge' },
    { move: 'end', text: 'Erledigt' }
  ];
  const g = tell(moves);
  assert.deepEqual(g.errors, []);
  assert.equal(g.done, true);
  assert.deepEqual(g.storyText.slice(2, 5).map((l) => l.text), ['WAS ZUERST PASSIERT:', '→ [Zahlung geht ein]:', '[@Buchhaltung] soll [Zahlung verbuchen].']);
  assert.ok(g.storyText.some((l) => l.text === '→ [!14 Tage]:'));
  // The waits behind "was zuerst passiert" are no target for "weiter bei".
  const middle = tell(moves.slice(0, 4));
  assert.ok(!middle.targets.some((z) => z.name === '14 Tage' || z.name === 'Zahlung geht ein'));

  const r = await run({ ir: emptyProcess('P', 'Mahnwesen'), ops: g.ops });
  assert.deepEqual(r.issues, []);
  assert.match(r.xml!, /<bpmn:eventBasedGateway id="Wenn_\d+"/);
  const back = await fromBpmn(r.xml!);
  assert.ok(back.ir.nodes.some((n) => n.kind === 'gateway' && n.gatewayType === 'event'));
  assert.deepEqual(back.ir.nodes.filter((n) => n.kind === 'wait').map((n) => (n as any).subtype), ['message', 'time']);
  assert.match(toSvg(r.ir, r.positions), />Was zuerst passiert</);
});

test('exception where the task keeps running: dashed, path must end', async () => {
  const moves: Move[] = [
    { move: 'start', text: 'Antrag geht ein', role: 'Sachbearbeitung' },
    { move: 'task', text: 'Antrag bearbeiten', role: 'Sachbearbeitung' },
    { move: 'exceptionPath', text: 'nach 2 Tagen', subtype: 'deadline', keepsRunning: 'yes' },
    { move: 'task', text: 'Erinnerung schicken', role: 'Teamleitung' },
    { move: 'end', text: 'Erinnert' },
    { move: 'task', text: 'Bescheid schicken', role: 'Sachbearbeitung' },
    { move: 'exceptionPath', text: 'Antrag zurückgezogen', subtype: 'message' },
    { move: 'end', text: 'Zurückgezogen' },
    { move: 'end', text: 'Beschieden' }
  ];
  const g = tell(moves);
  assert.deepEqual(g.errors, []);
  assert.equal(g.done, true);
  assert.ok(g.storyText.some((l) => l.text === 'FALLS [!nach 2 Tagen], Schritt läuft weiter:'));
  assert.ok(g.storyText.some((l) => l.text === 'FALLS NACHRICHT [Antrag zurückgezogen]:'));
  // The side path may neither merge nor jump back - only end.
  const beside = tell(moves.slice(0, 4));
  assert.ok(!beside.options.includes('merge') && !beside.options.includes('goTo'));
  assert.ok(beside.options.includes('end'));
  assert.ok(tell([...moves.slice(0, 4), { move: 'merge' }]).errors.length);
  // On an error nothing continues, even if it is ticked.
  const errors = tell([...moves.slice(0, 2), { move: 'exceptionPath', text: 'kaputt', keepsRunning: 'yes' }]);
  assert.equal((errors.ir.nodes.find((n) => n.kind === 'exception') as any).keepsRunning, undefined);

  const r = await run({ ir: emptyProcess('P', 'Antrag'), ops: g.ops });
  assert.deepEqual(r.issues, []);
  assert.match(r.xml!, /<bpmn:boundaryEvent id="Ausnahme_\d+" name="nach 2 Tagen" cancelActivity="false"/);
  assert.match(r.xml!, /name="Antrag zurückgezogen"[^>]*>[\s\S]*?<bpmn:messageEventDefinition /);
  const back = await fromBpmn(r.xml!);
  assert.deepEqual(
    back.ir.nodes.filter((n) => n.kind === 'exception').map((n) => [(n as any).trigger, (n as any).keepsRunning]),
    [['deadline', true], ['message', undefined]]
  );
  const svg = toSvg(r.ir, r.positions);
  assert.match(svg, /stroke-dasharray/);
  assert.match(svg, />Frist, Schritt läuft weiter</);
  assert.match(svg, />Nachricht dazwischen</);
});

test('end with message and abort everything: only next to parallel work, valid BPMN, read back', async () => {
  const moves: Move[] = [
    { move: 'start', text: 'Bewerbung geht ein', role: 'Personal' },
    { move: 'concurrent' },
    { move: 'task', text: 'Unterlagen prüfen', role: 'Personal' },
    { move: 'end', text: 'Abgelehnt', subtype: 'cancel' },
    { move: 'task', text: 'Gespräch planen', role: 'Fachabteilung' },
    { move: 'end', text: 'Eingeladen', subtype: 'message' }
  ];
  const g = tell(moves);
  assert.deepEqual(g.errors, []);
  assert.equal(g.done, true);
  assert.ok(g.storyText.some((l) => l.text === 'ENDE, alles abbrechen: [Abgelehnt].'));
  assert.ok(g.storyText.some((l) => l.text === 'ENDE mit Nachricht: [Eingeladen].'));
  // Abort only where something runs in parallel.
  assert.deepEqual(tell(moves.slice(0, 3)).endKinds, ['', 'message', 'cancel']);
  const alone = [moves[0], { move: 'task', text: 'Prüfen', role: 'Personal' }] as Move[];
  assert.deepEqual(tell(alone).endKinds, ['', 'message']);
  assert.equal(tell([...alone, { move: 'end', text: 'X', subtype: 'cancel' }]).errors.length, 1);

  const r = await run({ ir: emptyProcess('P', 'Bewerbung'), ops: g.ops });
  assert.deepEqual(r.issues, []);
  assert.match(r.xml!, /<bpmn:terminateEventDefinition /);
  const back = await fromBpmn(r.xml!);
  assert.deepEqual(back.ir.nodes.filter((n) => n.kind === 'end').map((n) => (n as any).subtype), ['cancel', 'message']);
  const svg = toSvg(r.ir, r.positions);
  assert.match(svg, />Alles abbrechen</);
  assert.match(svg, />Ende mit Nachricht</);
  assert.doesNotMatch(svg, />Ende</);
});

test('condition on start, wait and what happens first: condition in plain text, read back, legend', async () => {
  const g = tell([
    { move: 'start', text: 'Lager unter Mindestbestand', role: 'Lager', subtype: 'condition' },
    { move: 'task', text: 'Nachbestellen', role: 'Lager' },
    { move: 'wait', text: 'Lieferant hat Ware', subtype: 'condition' },
    { move: 'decision', subtype: 'first', yes: 'Lager wieder voll', yesKind: 'condition', no: '5 Tage', noKind: 'time' },
    { move: 'end', text: 'Aufgefüllt' },
    { move: 'end', text: 'Verspätet' }
  ]);
  assert.deepEqual(g.errors, []);
  const text = g.storyText.map((l) => l.text);
  assert.equal(text[0], 'ES BEGINNT sobald: [Lager unter Mindestbestand] bei [@Lager].');
  assert.ok(text.includes('WARTEN BIS [Lieferant hat Ware].'));
  assert.ok(text.includes('→ SOBALD [Lager wieder voll]:'));
  const r = await run({ ir: emptyProcess('P', 'Lager'), ops: g.ops });
  assert.deepEqual(r.issues, []);
  assert.equal(r.xml!.match(/<bpmn:conditionalEventDefinition /g)?.length, 3);
  assert.match(r.xml!, /<bpmn:condition xsi:type="bpmn:tFormalExpression">Lager unter Mindestbestand<\/bpmn:condition>/);
  const back = await fromBpmn(r.xml!);
  assert.deepEqual(
    back.ir.nodes.filter((n) => (n as any).subtype === 'condition').map((n) => n.name),
    ['Lager unter Mindestbestand', 'Lieferant hat Ware', 'Lager wieder voll']
  );
  const svg = toSvg(r.ir, r.positions);
  assert.match(svg, />Start, sobald ein Zustand eintritt</);
  assert.match(svg, />Warten auf Zustand</);
});

test('guidance: path, still open paths and the role where it continues', async () => {
  const afterExceptionPath = tell(invoice.slice(0, 3));
  assert.equal(afterExceptionPath.path, 'Falls „Betrag falsch“');
  assert.deepEqual(afterExceptionPath.open, ['Normaler Weg nach „Rechnung prüfen“']);
  assert.equal(afterExceptionPath.here, 'Ausnahme_3');

  const inYesPath = tell(invoice.slice(0, 7));
  assert.equal(inYesPath.path, '„Betrag über 5000 €?“ → ja');
  assert.deepEqual(inYesPath.open, ['„Betrag über 5000 €?“ → nein']);
  assert.equal(inYesPath.question, 'Nach „Zahlung freigeben“ – wie geht es weiter?');

  // New path: the next line gets its heading first.
  const otherwise = tell(invoice.slice(0, 8));
  assert.deepEqual(otherwise.next, { head: 'SONST → nein:', depth: 1 });

  // After merging, main path again, nothing left open.
  const merge = tell(invoice.slice(0, 9));
  assert.equal(merge.path, undefined);
  assert.deepEqual(merge.open, []);
  const r = await run({ ir: emptyProcess('P', 'Prozess'), ops: merge.ops });
  assert.equal(toSvg(r.ir, r.positions, { here: merge.here }).match(/stroke="#1a4d8f"/g)?.length, 1);
  assert.doesNotMatch(toSvg(r.ir, r.positions), /#1a4d8f/);
});

test('switch: bring an open path forward, continuation gets a heading', async () => {
  const moves: Move[] = [
    ...invoice.slice(0, 7),
    { move: 'switchTo', to: 1 },
    { move: 'end', text: 'Abgelehnt' },
    { move: 'merge' },
    { move: 'task', text: 'Zahlung anweisen', role: 'Buchhaltung' },
    { move: 'end', text: 'Bezahlt' }
  ];
  const previously = tell(moves.slice(0, 8));
  assert.equal(previously.path, '„Betrag über 5000 €?“ → nein');
  assert.deepEqual(previously.open, ['„Betrag über 5000 €?“ → ja']);
  assert.deepEqual(previously.next, { head: 'SONST → nein:', depth: 1 });

  const g = tell(moves);
  assert.deepEqual(g.errors, []);
  assert.equal(g.done, true);
  const text = g.storyText.map((l) => l.text);
  assert.deepEqual(text.slice(text.indexOf('SONST → nein:'), text.indexOf('SONST → nein:') + 4), [
    'SONST → nein:',
    'ENDE: [Abgelehnt].',
    'WEITER AUF DEM WEG „Betrag über 5000 €?“ → ja:',
    'ZUSAMMEN.'
  ]);
  const r = await run({ ir: emptyProcess('P', 'Prozess'), ops: g.ops });
  assert.deepEqual(r.issues, []);

  assert.match(tell([...invoice.slice(0, 7), { move: 'switchTo', to: 2 }]).errors[0], /gibt es hier nicht/);
});
