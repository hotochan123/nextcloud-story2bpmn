import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tell, splice, Move } from '../../src/core/story.js';
import { read, asSourceText } from '../../src/core/readBack.js';
import { run, emptyProcess } from '../../src/core/pipeline.js';
import { fromBpmn } from '../../src/core/fromBpmn.js';
import { toStored, fromStored } from '../../src/core/storyFormat.js';
import { sizeOf } from '../../src/core/layout.js';
import { Language } from '../../src/core/language.js';
import { EventKind, nodeById } from '../../src/core/ir.js';

// Job 392: two (or more) equal triggers - "it can also start differently".
const post: Move = { move: 'start', text: 'Antrag per Post', role: 'Poststelle' };
const portal = (subtype: EventKind | '' = 'message', role = 'Portal', text = 'Antrag im Portal'): Move => ({ move: 'orStart', text, role, subtype });
const rest: Move[] = [{ move: 'task', text: 'Antrag prüfen', role: 'Sachbearbeitung' }, { move: 'end', text: 'Antrag geprüft' }];

const play = async (moves: Move[], language: Language = 'de') => {
  const g = tell(moves, language);
  const e = await run({ ir: { ...emptyProcess('P', g.ir.name, language), story: moves }, ops: g.ops });
  return { g, e };
};
const starts = (moves: Move[]) => tell(moves).ir.nodes.filter((n) => n.kind === 'start');

test('392 AK1 two triggers: a start each in its lane, merging before the first step; reading copy possible', async () => {
  const { g, e } = await play([post, portal(), ...rest]);
  assert.deepEqual(g.errors, []);
  const s = g.ir.nodes.filter((n) => n.kind === 'start');
  assert.equal(s.length, 2);
  const lane = (id: string) => g.ir.lanes.find((l) => l.id === (nodeById(g.ir, id) as { laneId?: string }).laneId)?.name;
  assert.deepEqual(s.map((n) => lane(n.id)), ['Poststelle', 'Portal']);
  assert.equal(s[1].kind === 'start' && s[1].subtype, 'message');
  const gw = g.ir.nodes.find((n) => n.kind === 'gateway')!;
  assert.equal(gw.kind === 'gateway' && gw.gatewayType, 'exclusive');
  assert.deepEqual(g.ir.edges.filter((x) => x.to === gw.id).map((x) => x.from).sort(), s.map((n) => n.id).sort());
  const out = g.ir.edges.filter((x) => x.from === gw.id);
  assert.equal(out.length, 1);
  assert.equal(nodeById(g.ir, out[0].to)?.name, 'Antrag prüfen');
  assert.ok(e.ok, JSON.stringify(e.issues));
  assert.equal(e.readingCopy, true);
});

test('392 AK2 any number of triggers: three starts on the same merge', async () => {
  const { g, e } = await play([post, portal(), portal('time', 'Poststelle', 'Monatsanfang'), ...rest]);
  assert.deepEqual(g.errors, []);
  const gws = g.ir.nodes.filter((n) => n.kind === 'gateway');
  assert.equal(gws.length, 1);
  assert.equal(g.ir.edges.filter((x) => x.to === gws[0].id).length, 3);
  assert.ok(e.ok, JSON.stringify(e.issues));
});

test('392 AK3 offered right after the trigger only, never inside; errors where it does not fit', () => {
  assert.ok(tell([post]).options.includes('orStart'));
  assert.ok(tell([post, portal()]).options.includes('orStart'));
  // What can come at any time stands outside the flow: it does not end the triggers.
  assert.ok(tell([post, { move: 'anytime', text: 'Rückzug', subtype: 'message', subprocess: [] }]).options.includes('orStart'));
  assert.ok(!tell([post, rest[0]]).options.includes('orStart'));
  assert.ok(!tell([], 'de', { inner: { name: 'X' } }).options.includes('orStart'));
  assert.equal(tell([portal()]).errors[0], 'Zuerst den Auslöser erzählen');
  assert.equal(tell([post, rest[0], portal()]).errors[0], 'Ein weiterer Auslöser steht direkt nach dem Auslöser');
  assert.equal(tell([portal()], 'de', { inner: { name: 'X' } }).errors[0], 'Ein Teilablauf beginnt einfach, ohne Auslöser');
  assert.equal(tell([post, portal('message', 'Portal', ' ')]).errors[0], 'Ein Auslöser braucht, was ihn auslöst');
  assert.equal(tell([post, { ...portal(), subtype: 'error' } as unknown as Move]).errors[0], 'Wodurch beginnt es?');
  assert.equal(tell([post, portal('')]).errors[0], 'Nur ein Auslöser kann einfach beginnen; wählen Sie eine Art');
  // The first trigger with a kind: one further trigger may begin plainly, a second one not.
  const first: Move = { ...post, subtype: 'time' };
  assert.deepEqual(tell([first, portal('')]).errors, []);
  assert.ok(tell([first, portal(''), portal('', 'X', 'Y')]).errors.length);
  assert.equal(tell([post, portal()], 'en').errors.length, 0);
  assert.equal(tell([post, portal('')], 'en').errors[0], 'Only one trigger can begin plainly; choose a kind');
});

test('392 AK4 startKinds: without the plain kind once a trigger begins plainly', () => {
  assert.deepEqual(tell([post]).startKinds, ['message', 'time', 'condition', 'signal']);
  assert.deepEqual(tell([{ ...post, subtype: 'message' }]).startKinds, ['', 'message', 'time', 'condition', 'signal']);
  assert.deepEqual(tell([{ ...post, subtype: 'message' }, portal('')]).startKinds, ['message', 'time', 'condition', 'signal']);
  assert.deepEqual(tell([]).startKinds, ['', 'message', 'time', 'condition', 'signal']);
});

test('392 AK5 story text DE/EN and read back; a misplaced line names its line', () => {
  const moves: Move[] = [post, portal(), portal('condition', 'Lager', 'Bestand leer'), portal('signal', 'Portal', 'Lieferstopp'), portal('time', 'Poststelle', 'Monatsanfang'), ...rest];
  const de = tell(moves, 'de').storyText.map((l) => l.text);
  assert.equal(de[1], 'ODER ES BEGINNT mit Nachricht: [Antrag im Portal] bei [@Portal].');
  assert.equal(de[2], 'ODER ES BEGINNT sobald: [Bestand leer] bei [@Lager].');
  assert.equal(tell(moves, 'en').storyText[1].text, 'OR IT STARTS with a message: [Antrag im Portal] at [@Portal].');
  assert.equal(tell(moves, 'de').storyText[1].move, 1);
  for (const language of ['de', 'en'] as Language[]) {
    const back = read(asSourceText(tell(moves, language).storyText), language);
    assert.deepEqual(back.errors, []);
    assert.deepEqual(tell(back.moves, language).ops, tell(moves, language).ops);
    assert.deepEqual(back.moves[1], portal());
  }
  const wrong = read('ES BEGINNT: [A] bei [@B].\n[@B] soll [C].\nODER ES BEGINNT mit Nachricht: [D] bei [@E].', 'de');
  assert.equal(wrong.line, 3);
  assert.match(wrong.errors[0], /^Zeile 3: Ein weiterer Auslöser/);
});

test('392 AK6 working file: stored as oderStart, two start events, loads back unchanged', async () => {
  const moves = [post, portal(), ...rest];
  const stored = toStored(moves) as Record<string, unknown>[];
  assert.deepEqual(stored[1], Object.fromEntries([['zug', 'oderStart'], ['text', 'Antrag im Portal'], ['stelle', 'Portal'], ['art', 'nachricht']]));
  assert.deepEqual(fromStored(stored), moves);
  const { e } = await play(moves);
  assert.equal((e.xml!.match(/<bpmn:startEvent /g) ?? []).length, 2);
  assert.equal((e.xml!.match(/<bpmn:messageEventDefinition /g) ?? []).length, 1);
  const back = await fromBpmn(e.xml!);
  assert.deepEqual(back.ir.story, moves);
  assert.equal(back.ir.nodes.filter((n) => n.kind === 'start').length, 2);
});

test('392 AK7 layout: triggers in one lane and in two lanes do not overlap, the merge right of them', async () => {
  for (const moves of [[post, portal('message', 'Poststelle'), ...rest], [post, portal(), portal('time', 'Poststelle', 'Monatsanfang'), ...rest]]) {
    const { g, e } = await play(moves);
    const boxes = g.ir.nodes.filter((n) => n.kind !== 'exception').map((n) => ({ id: n.id, kind: n.kind, ...e.positions[n.id], ...sizeOf(n) }));
    for (const a of boxes)
      for (const b of boxes)
        if (a.id < b.id) assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${a.id} overlaps ${b.id}`);
    const gw = boxes.find((b) => b.kind === 'gateway')!;
    for (const s of boxes.filter((b) => b.kind === 'start')) assert.ok(s.x + s.w <= gw.x);
  }
});

test('392 risk: two plain triggers from a hand-written file are a story error, not a lint error', () => {
  assert.ok(tell([post, { move: 'orStart', text: 'B', role: 'C' } as Move]).errors.length);
  // Removing the first trigger leaves a further trigger first: an error, no start without arrows.
  assert.equal(tell([portal(), ...rest]).errors[0], 'Zuerst den Auslöser erzählen');
});

test('392 risk: removing a further trigger keeps "continue at" on its step', () => {
  const moves: Move[] = [post, portal(), rest[0], { move: 'decision', question: 'Vollständig?', yes: 'ja', no: 'nein' }, { move: 'end', text: 'Fertig' }];
  const g = tell(moves);
  const target = g.nodes[2]!;
  const loop = [...moves, { move: 'goTo', target } as Move];
  assert.deepEqual(tell(loop).errors, []);
  const without = splice(loop, 1, 1, []);
  assert.deepEqual(tell(without).errors, []);
  const goTo = without.at(-1) as Extract<Move, { move: 'goTo' }>;
  assert.equal(nodeById(tell(without).ir, goTo.target)?.name, 'Antrag prüfen');
});

test('392 risk: a story without a further trigger keeps its node ids', () => {
  assert.deepEqual(starts([post, ...rest]).map((n) => n.id), ['Start_1']);
  assert.deepEqual(tell([post, ...rest]).ir.nodes.map((n) => n.id), ['Start_1', 'Schritt_2', 'Ende_3']);
});
