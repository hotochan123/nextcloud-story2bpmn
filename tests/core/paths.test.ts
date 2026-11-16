// Job 389: more than two paths at "it depends", "in parallel" and "what comes first".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tell, Move } from '../../src/core/story.js';
import { read, asSourceText } from '../../src/core/readBack.js';
import { run, emptyProcess } from '../../src/core/pipeline.js';
import { toStored, fromStored } from '../../src/core/storyFormat.js';
import { fromBpmn } from '../../src/core/fromBpmn.js';
import { measureOne } from '../../src/core/readability.js';
import type { Language } from '../../src/core/language.js';

const amount: Move[] = [
  { move: 'start', text: 'Rechnung geht ein', role: 'Buchhaltung' },
  { move: 'decision', question: 'Betrag?', yes: 'bis 1000 €', more: ['bis 5000 €'], no: 'über 5000 €' },
  { move: 'task', text: 'Direkt buchen', role: 'Buchhaltung' },
  { move: 'merge' },
  { move: 'task', text: 'Teamleitung gibt frei', role: 'Teamleitung' },
  { move: 'merge' },
  { move: 'task', text: 'Geschäftsführung gibt frei', role: 'Geschäftsführung' },
  { move: 'merge' },
  { move: 'end', text: 'Rechnung gebucht' }
];

const valid = async (moves: Move[], language?: Language) => {
  const g = tell(moves, language);
  assert.deepEqual(g.errors, []);
  const r = await run({ ir: { ...emptyProcess('P', g.ir.name, language), story: moves }, ops: g.ops });
  assert.deepEqual(r.issues, []);
  assert.equal(r.ok, true);
  return { g, r };
};

/** Story text → moves → story text: the same text, and the same moves where given. */
const roundTrip = (moves: Move[], language: Language = 'de') => {
  const text = asSourceText(tell(moves, language).storyText);
  const back = read(text, language);
  assert.deepEqual(back.errors, [], text);
  assert.equal(asSourceText(tell(back.moves, language).storyText), text);
  return { text, back };
};

test('389 AK1 a decision with three paths: one exclusive diamond, two conditions and a default path', async () => {
  const { g, r } = await valid(amount);
  const out = r.ir.edges.filter((e) => e.from === 'Wenn_2');
  assert.equal(out.length, 3);
  assert.deepEqual(out.filter((e) => e.condition).map((e) => e.condition), ['bis 1000 €', 'bis 5000 €']);
  assert.equal(out.filter((e) => e.isDefault).length, 1);
  assert.equal(out.find((e) => e.isDefault)!.name, 'über 5000 €');
  const joins = r.ir.nodes.filter((n) => n.kind === 'gateway' && n.id.startsWith('Zusammen'));
  assert.equal(joins.length, 1);
  assert.equal(r.ir.edges.filter((e) => e.to === joins[0].id).length, 3);
  assert.deepEqual(g.storyText.slice(1, 3).map((l) => l.text), ['WENN [?Betrag]', '→ bis 1000 €:']);
  assert.ok(g.storyText.some((l) => l.text === '→ bis 5000 €:'));
  assert.ok(g.storyText.some((l) => l.text === 'SONST → über 5000 €:'));
  // Before the first path is told: the other two are open, in their order.
  assert.deepEqual(tell(amount.slice(0, 2)).open, ['„Betrag?“ → bis 5000 €', '„Betrag?“ → über 5000 €']);
});

test('389 AK2 in parallel with four branches, a join with four entries; wrong counts are refused', async () => {
  const moves: Move[] = [
    { move: 'start', text: 'Neuer Mitarbeiter', role: 'Personal' },
    { move: 'concurrent', branches: 4 },
    ...['Vertrag', 'Laptop', 'Zugang', 'Schulung'].flatMap((x): Move[] => [{ move: 'task', text: x, role: 'Personal' }, { move: 'merge' }]),
    { move: 'end', text: 'Eingestellt' }
  ];
  const { g, r } = await valid(moves);
  const heads = g.storyText.filter((l) => l.text.startsWith('– ')).map((l) => l.text);
  assert.deepEqual(heads, ['– erster Strang:', '– zweiter Strang:', '– dritter Strang:', '– vierter Strang:']);
  assert.equal(r.ir.edges.filter((e) => e.from === 'Gleichzeitig_2').length, 4);
  const join = r.ir.nodes.find((n) => n.kind === 'gateway' && n.gatewayType === 'parallel' && n.id.startsWith('Zusammen'))!;
  assert.equal(r.ir.edges.filter((e) => e.to === join.id).length, 4);
  assert.deepEqual(tell(moves.slice(0, 2), 'en').open, ['In parallel, second branch', 'In parallel, third branch', 'In parallel, fourth branch']);
  for (const branches of [1, 2.5, 0])
    assert.deepEqual(tell([moves[0], { move: 'concurrent', branches }]).errors, ['Gleichzeitig braucht mindestens zwei Stränge']);
  // From the eleventh with a number.
  const eleven = tell([moves[0], { move: 'concurrent', branches: 12 }], 'en');
  assert.deepEqual(eleven.errors, []);
  assert.equal(eleven.heads?.at(-1), '– branch 12:');
  assert.equal(tell([moves[0], { move: 'concurrent', branches: 11 }]).heads?.at(-1), '– 11. Strang:');
});

test('389 AK3 what comes first with three paths: three waits of their kind', async () => {
  const moves: Move[] = [
    { move: 'start', text: 'Rechnung verschickt', role: 'Buchhaltung' },
    { move: 'decision', subtype: 'first', yes: 'Zahlung kommt', yesKind: 'message', more: ['14 Tage'], moreKinds: ['time'], no: 'Mahnstopp', noKind: 'signal' },
    { move: 'end', text: 'Bezahlt' },
    { move: 'end', text: 'Gemahnt' },
    { move: 'end', text: 'Gestoppt' }
  ];
  const { g, r } = await valid(moves);
  const waits = r.ir.edges.filter((e) => e.from === 'Wenn_2').map((e) => r.ir.nodes.find((n) => n.id === e.to)!);
  assert.deepEqual(waits.map((n) => [n.kind, n.name, (n as { subtype?: string }).subtype]), [
    ['wait', 'Zahlung kommt', 'message'], ['wait', '14 Tage', 'time'], ['wait', 'Mahnstopp', 'signal']
  ]);
  assert.deepEqual(g.storyText.filter((l) => l.text.startsWith('→')).map((l) => l.text), ['→ [Zahlung kommt]:', '→ [!14 Tage]:', '→ SIGNAL [Mahnstopp]:']);
  // A missing kind of a further path is a message.
  const plain = tell([moves[0], { move: 'decision', subtype: 'first', yes: 'a', more: ['b'], no: 'c' }]);
  assert.equal((plain.ir.nodes.find((n) => n.name === 'b' && n.kind === 'wait') as { subtype?: string } | undefined)?.subtype, 'message');
});

test('389 AK1 an empty further path and too many paths are refused', () => {
  const s = amount[0];
  assert.deepEqual(tell([s, { move: 'decision', question: 'x?', yes: 'a', more: [' '], no: 'c' }]).errors, ['Jeder Weg einer Entscheidung braucht eine Beschriftung']);
  assert.deepEqual(tell([s, { move: 'decision', question: 'x?', yes: 'a', no: '' }], 'en').errors, ['Every path of a decision needs a label']);
  const many = Array.from({ length: 19 }, (_, i) => `w${i}`);
  assert.deepEqual(tell([s, { move: 'decision', question: 'x?', yes: 'a', more: many, no: 'c' }]).errors, ['Höchstens 20 Wege']);
  assert.deepEqual(tell([s, { move: 'decision', question: 'x?', yes: 'a', more: many.slice(1), no: 'c' }]).errors, []);
  assert.deepEqual(tell([s, { move: 'concurrent', branches: 10000 }]).errors, ['Höchstens 20 Wege']);
});

test('389 AK4 a move with two paths stays as before', () => {
  const two: Move[] = [amount[0], { move: 'decision', question: 'Betrag?', yes: 'ja', no: 'nein' }, { move: 'concurrent' }];
  const same: Move[] = [amount[0], { move: 'decision', question: 'Betrag?', yes: 'ja', more: [], no: 'nein' }, { move: 'concurrent', branches: 2 }];
  assert.deepEqual(tell(same).ops, tell(two).ops);
  assert.deepEqual(tell(same).storyText, tell(two).storyText);
  assert.deepEqual(tell(two).heads, ['– erster Strang:', '– zweiter Strang:', 'SONST → nein:']);
  const stored = JSON.stringify(toStored(two));
  for (const key of ['weitere', 'weitereArten', 'straenge']) assert.ok(!stored.includes(key), key);
});

test('389 AK5 story text with more paths reads back into the same story (DE and EN)', () => {
  for (const language of ['de', 'en'] as const) {
    const { back } = roundTrip(amount, language);
    assert.deepEqual(back.moves[1], { move: 'decision', question: 'Betrag?', yes: 'bis 1000 €', no: 'über 5000 €', more: ['bis 5000 €'] });
    roundTrip([
      { move: 'start', text: 'Neuer Mitarbeiter', role: 'Personal' },
      { move: 'concurrent', branches: 4 },
      ...['Vertrag', 'Laptop', 'Zugang', 'Schulung'].flatMap((x): Move[] => [{ move: 'task', text: x, role: 'Personal' }, { move: 'merge' }]),
      { move: 'end', text: 'Eingestellt' }
    ], language);
    const first = roundTrip([
      amount[0],
      { move: 'decision', subtype: 'first', yes: 'Zahlung', more: ['14 Tage', 'Lager leer'], moreKinds: ['time', 'condition'], no: 'Stopp', noKind: 'signal' },
      { move: 'end', text: 'a' }, { move: 'end', text: 'b' }, { move: 'end', text: 'c' }, { move: 'end', text: 'd' }
    ], language);
    const z = first.back.moves[1] as Extract<Move, { move: 'decision' }>;
    assert.deepEqual([z.more, z.moreKinds, z.noKind], [['14 Tage', 'Lager leer'], ['time', 'condition'], 'signal']);
  }
});

test('389 AK5 nested branches with three paths and switching between paths read back', () => {
  // A three-way decision in the first path of an outer three-way decision; the otherwise path is told early.
  const nested: Move[] = [
    amount[0],
    { move: 'decision', question: 'Betrag?', yes: 'klein', more: ['mittel'], no: 'groß' },
    { move: 'decision', question: 'Lieferant?', yes: 'A', more: ['B'], no: 'andere' },
    { move: 'task', text: 'A buchen', role: 'Buchhaltung' }, { move: 'merge' },
    { move: 'switchTo', to: 1 },
    { move: 'task', text: 'Andere prüfen', role: 'Buchhaltung' }, { move: 'merge' },
    { move: 'task', text: 'B buchen', role: 'Buchhaltung' }, { move: 'merge' },
    { move: 'end', text: 'Klein erledigt' },
    { move: 'switchTo', to: 1 },
    { move: 'end', text: 'Groß erledigt' },
    { move: 'concurrent', branches: 3 },
    { move: 'task', text: 'Prüfen', role: 'Teamleitung' }, { move: 'merge' },
    { move: 'task', text: 'Melden', role: 'Teamleitung' }, { move: 'merge' },
    { move: 'task', text: 'Ablegen', role: 'Teamleitung' }, { move: 'merge' },
    { move: 'end', text: 'Mittel erledigt' }
  ];
  const g = tell(nested);
  assert.deepEqual(g.errors, []);
  assert.equal(g.done, true);
  const { back } = roundTrip(nested);
  assert.deepEqual(back.moves, nested.map((z) => (z.move === 'end' || z.move === 'start' ? { ...z, subtype: '' } : z)));
});

test('389 AK5 a hyphen before a branch heading and a further path without heading', () => {
  const text = ['ES BEGINNT: [x] bei [@A].', 'GLEICHZEITIG:', '- erster Strang:', '  ENDE: [a].', '- zweiter Strang:', '  ENDE: [b].', '- dritter Strang:', '  ENDE: [c].'].join('\n');
  const r = read(text);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.moves[1], { move: 'concurrent', branches: 3 });
  // The count follows from the headings at the indentation of the branch line; without, two paths.
  const flat = read(['ES BEGINNT: [x] bei [@A].', 'WENN [?Betrag]', '→ klein:', 'ENDE: [a].', '→ mittel:', 'ENDE: [b].', 'SONST → groß:', 'ENDE: [c].'].join('\n'));
  assert.equal(flat.errors.length, 1);
  // Job 449: a path heading has no number, the message stands alone; the marker is on line 5.
  assert.match(flat.errors[0], /^„→ mittel:“/);
  assert.equal(flat.line, 5);
});

test('389 AK6 the stored format keeps further paths and branches', async () => {
  const moves: Move[] = [
    amount[0],
    { move: 'decision', subtype: 'first', yes: 'Zahlung', more: ['14 Tage', 'Mahnstopp'], moreKinds: ['time', 'signal'], no: 'Storno' },
    { move: 'concurrent', branches: 3 }
  ];
  const stored = toStored(moves) as Record<string, unknown>[];
  assert.deepEqual(stored[1].weitere, ['14 Tage', 'Mahnstopp']);
  assert.deepEqual(stored[1].weitereArten, ['zeit', 'signal']);
  assert.equal(stored[2].straenge, 3);
  assert.deepEqual(fromStored(stored), moves);
  // A working file with a three-way decision opens with the same moves.
  const { r } = await valid(amount);
  const { ir } = await fromBpmn(r.xml!);
  assert.deepEqual(ir.story, amount);
  assert.deepEqual(tell(ir.story as Move[]).storyText, tell(amount).storyText);
});

test('389 risk: a working file of today with two paths loads unchanged', async () => {
  const xml = readFileSync('tests/core/fixtures/legacy-working-file.bpmn', 'utf8');
  const { ir } = await fromBpmn(xml);
  const moves = ir.story as Move[];
  assert.ok(moves.length > 0);
  assert.deepEqual(tell(moves).errors, []);
  assert.deepEqual(fromStored(toStored(moves)), moves);
});

test('389 risk: five paths in different lanes do not run through boxes', async () => {
  const roles = ['Einkauf', 'Lager', 'Buchhaltung', 'Einkauf', 'Lager'];
  const moves: Move[] = [
    { move: 'start', text: 'Bestellung', role: 'Einkauf' },
    { move: 'decision', question: 'Art?', yes: 'a', more: ['b', 'c', 'd'], no: 'e' },
    ...roles.flatMap((role, i): Move[] => [{ move: 'task', text: `Schritt ${i + 1}`, role }, { move: 'merge' }]),
    { move: 'end', text: 'Fertig' }
  ];
  const { r } = await valid(moves);
  const m = measureOne(r.ir, r.positions);
  assert.equal(m.throughBox, 0);
  const boxes = Object.entries(r.positions);
  // No two shapes on the same spot.
  assert.equal(new Set(boxes.map(([, p]) => `${Math.round(p.x)},${Math.round(p.y)}`)).size, boxes.length);
});
