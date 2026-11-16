import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tell, deletePath, Move, TellOptions } from '../../src/core/story.js';

const start: Move = { move: 'start', text: 'Rechnung geht ein', role: 'Buchhaltung' };
const task = (text: string): Move => ({ move: 'task', text, role: 'Buchhaltung' });
const end = (text: string, subtype: '' | 'cancel' = ''): Move => ({ move: 'end', text, ...(subtype && { subtype }) });
const merge: Move = { move: 'merge' };
const three: Move = { move: 'decision', question: 'Vollständig?', yes: 'ja', more: ['teils'], no: 'nein' };

/** Deletes and checks that the rest replays without errors. */
function deleted(moves: Move[], at: number, path: number, opts: TellOptions = {}): Move[] {
  assert.deepEqual(tell(moves, 'de', opts).errors, [], 'Ausgangsgeschichte gültig');
  const r = deletePath(moves, at, path, 'de', opts);
  assert.ok('moves' in r, 'error' in r ? r.error : '');
  assert.deepEqual(tell(r.moves, 'de', opts).errors, []);
  return r.moves;
}
const refused = (moves: Move[], at: number, path: number): string => {
  const r = deletePath(moves, at, path, 'de');
  assert.ok('error' in r, 'abgelehnt');
  return r.error;
};

const ALL_MERGE: Move[] = [start, three, task('Buchen'), merge, task('Teilbuchen'), merge, merge, end('Fertig')];

test('AK1 check with three paths: one path goes, the labels move up, the continuation stays', () => {
  assert.deepEqual(deleted(ALL_MERGE, 1, 0), [start, { move: 'decision', question: 'Vollständig?', yes: 'teils', no: 'nein' }, task('Teilbuchen'), merge, merge, end('Fertig')]);
  assert.deepEqual(deleted(ALL_MERGE, 1, 1), [start, { move: 'decision', question: 'Vollständig?', yes: 'ja', no: 'nein' }, task('Buchen'), merge, merge, end('Fertig')]);
  // Four paths: the middle one goes, the others keep their order.
  const four: Move[] = [start, { ...three, more: ['teils', 'später'] } as Move, task('A'), merge, task('B'), merge, task('C'), merge, merge, end('Fertig')];
  assert.deepEqual(deleted(four, 1, 1)[1], { ...three, more: ['später'] });
});

test('AK1 the otherwise path of a check, a wrong number, two paths, no branch: refused', () => {
  assert.equal(refused(ALL_MERGE, 1, 2), 'Diesen Weg gibt es hier nicht');
  assert.equal(refused(ALL_MERGE, 1, 3), 'Diesen Weg gibt es hier nicht');
  assert.equal(refused(ALL_MERGE, 1, -1), 'Diesen Weg gibt es hier nicht');
  const two: Move[] = [start, { move: 'decision', question: 'q', yes: 'ja', no: 'nein' }, merge, merge, end('x')];
  assert.equal(refused(two, 1, 0), 'Diesen Weg gibt es hier nicht');
  assert.equal(refused(ALL_MERGE, 2, 0), 'Hier verzweigt sich nichts');
  const exception: Move[] = [start, task('Prüfen'), { move: 'exceptionPath', text: 'Fehler' }, end('Abgebrochen'), end('Fertig')];
  assert.equal(refused(exception, 2, 0), 'Hier verzweigt sich nichts');
});

test('AK2 only the deleted path ran into the merge: what comes after it goes too', () => {
  const moves: Move[] = [start, three, task('Buchen'), end('Gebucht'), task('Teilbuchen'), merge, task('Nachfordern'), end('Nachgefordert'), task('Ablegen'), end('Abgelegt')];
  assert.deepEqual(deleted(moves, 1, 1), [start, { ...three, more: undefined, yes: 'ja', no: 'nein' }].map((m) => JSON.parse(JSON.stringify(m))).concat([task('Buchen'), end('Gebucht'), task('Nachfordern'), end('Nachgefordert')]));
  // Another path still merges: the continuation stays.
  assert.deepEqual(deleted(moves, 1, 0).slice(-2), [task('Ablegen'), end('Abgelegt')]);
});

test('AK2 a branch inside the deleted path goes with it, one in another path stays', () => {
  const inner: Move = { move: 'decision', question: 'Lieferant bekannt?', yes: 'ja', no: 'nein' };
  const moves: Move[] = [
    start, three,
    inner, task('Anrufen'), end('Geklärt'), end('Abgelehnt'),
    inner, task('Mahnen'), end('Gemahnt'), end('Offen'),
    task('Nachfordern'), end('Nachgefordert'),
  ];
  const r = deleted(moves, 1, 0);
  assert.deepEqual(r.slice(2), [inner, task('Mahnen'), end('Gemahnt'), end('Offen'), task('Nachfordern'), end('Nachgefordert')]);
  assert.deepEqual(deleted(moves, 1, 1).slice(2), [inner, task('Anrufen'), end('Geklärt'), end('Abgelehnt'), task('Nachfordern'), end('Nachgefordert')]);
});

test('AK3 whichever comes first: every path can go, the others keep label and kind', () => {
  const first: Move = { move: 'decision', subtype: 'first', yes: 'Zahlung', yesKind: 'message', more: ['Anruf'], moreKinds: ['signal'], no: '14 Tage', noKind: 'time' };
  const moves: Move[] = [start, first, task('Buchen'), end('Bezahlt'), task('Klären'), end('Geklärt'), task('Mahnen'), end('Gemahnt')];
  assert.deepEqual(deleted(moves, 1, 0), [start, { move: 'decision', subtype: 'first', yes: 'Anruf', yesKind: 'signal', no: '14 Tage', noKind: 'time' }, task('Klären'), end('Geklärt'), task('Mahnen'), end('Gemahnt')]);
  assert.deepEqual(deleted(moves, 1, 1), [start, { move: 'decision', subtype: 'first', yes: 'Zahlung', yesKind: 'message', no: '14 Tage', noKind: 'time' }, task('Buchen'), end('Bezahlt'), task('Mahnen'), end('Gemahnt')]);
  assert.deepEqual(deleted(moves, 1, 2), [start, { move: 'decision', subtype: 'first', yes: 'Zahlung', yesKind: 'message', no: 'Anruf', noKind: 'signal' }, task('Buchen'), end('Bezahlt'), task('Klären'), end('Geklärt')]);
});

test('AK4 in parallel with three branches: the middle one goes, the third becomes the second', () => {
  const moves: Move[] = [start, { move: 'concurrent', branches: 3 }, task('Prüfen'), merge, task('Buchen'), merge, task('Ablegen'), end('Abgebrochen', 'cancel'), end('Fertig')];
  const r = deleted(moves, 1, 1);
  assert.deepEqual(r, [start, { move: 'concurrent', branches: 2 }, task('Prüfen'), merge, task('Ablegen'), end('Abgebrochen', 'cancel'), end('Fertig')]);
  const text = tell(r, 'de').storyText.map((l) => l.text);
  assert.ok(text.indexOf('– zweiter Strang:') >= 0 && text.indexOf('– zweiter Strang:') < text.findIndex((l) => l.includes('Ablegen')));
  assert.ok(!text.includes('– dritter Strang:'));
});

// a: A, end; pulls c forward; c: C, end; b: B, end; otherwise: S, continue at C.
const pull = (): Move[] => {
  const moves: Move[] = [start, { ...three, yes: 'a', more: ['b', 'c'], no: 'sonst' } as Move, task('A'), end('EA'), { move: 'switchTo', to: 1 }, task('C'), end('EC'), task('B'), end('EB'), task('S')];
  return [...moves, { move: 'goTo', target: tell(moves, 'de').nodes[5]! }];
};

test('AK5 "continue at" keeps its target, pulling forward is counted anew', () => {
  const moves = pull();
  const r = deleted(moves, 1, 0);
  assert.deepEqual(r.slice(0, 8), [start, { ...three, yes: 'b', more: ['c'], no: 'sonst' }, { move: 'switchTo', to: 1 }, task('C'), end('EC'), task('B'), end('EB'), task('S')]);
  const s = tell(r, 'de');
  assert.equal(r[8].move === 'goTo' && r[8].target, s.nodes[3], 'continues at C');
  // Deleting the path pulled forward... it is the target of "continue at": refused with line and name.
  assert.equal(refused(moves, 1, 2), 'Zeile 11 führt noch zu „C“ – dort zuerst ändern');
  // Deleting b: the pulled path is the current one afterwards; pulling forward goes.
  const rb = deleted(moves, 1, 1);
  assert.ok(!rb.some((m) => m.move === 'switchTo'));
  assert.ok(rb.some((m) => m.move === 'task' && m.text === 'C'));
});

test('AK6 on a subprocess level and in the flow of something at any time', () => {
  const flow: Move[] = [three, task('Buchen'), merge, task('Teilbuchen'), merge, merge, end('Geprüft')];
  for (const opts of [{ inner: { name: 'Prüfen' } }, { inner: { name: 'Storno', trigger: { subtype: 'message' as const, keepsRunning: false } } }]) {
    assert.deepEqual(deleted(flow, 0, 1, opts), [{ ...three, more: undefined }, task('Buchen'), merge, merge, end('Geprüft')].map((m) => JSON.parse(JSON.stringify(m))));
  }
});

test('round 1: pulling forward stays when the path current at that moment goes', () => {
  // a: A, end; pull d (to:2); d: X; b: Y; c: Z; otherwise e: W.
  const check: Move = { ...three, yes: 'a', more: ['b', 'c', 'd'], no: 'e' } as Move;
  const story = (to: number): Move[] => [start, check, task('A'), end('EA'), { move: 'switchTo', to }, task('X'), end('EX'), task('Y'), end('EY'), task('Z'), end('EZ'), task('W'), end('EW')];
  const headOf = (moves: Move[], name: string): string | undefined => {
    const lines = tell(moves, 'de').storyText;
    const at = lines.findIndex((l) => l.text.includes(`[${name}]`));
    return lines.slice(0, at).reverse().find((l) => l.text.includes('→'))?.text;
  };
  // d pulled forward while b was current; deleting b keeps X on d.
  const r = deleted(story(2), 1, 1);
  assert.deepEqual(r[1], { ...three, yes: 'a', more: ['c', 'd'], no: 'e' });
  assert.match(headOf(r, 'X')!, /→ d:/);
  assert.match(headOf(r, 'Z')!, /→ c:/);
  // The otherwise path pulled forward: X stays on it.
  const r3 = deleted(story(3), 1, 1);
  assert.match(headOf(r3, 'X')!, /SONST → e:/);
  assert.match(headOf(r3, 'Z')!, /→ c:/);
});
