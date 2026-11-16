import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tell, insertBefore, addException, addTrigger, tellOpen, Move, StoryState } from '../../src/core/story.js';
import { read, asSourceText } from '../../src/core/readBack.js';

const start: Move = { move: 'start', text: 'Rechnung geht ein', role: 'Buchhaltung' };
const task = (text: string): Move => ({ move: 'task', text, role: 'Buchhaltung' });
const end = (text: string): Move => ({ move: 'end', text });
const merge: Move = { move: 'merge' };
const decision = (question: string): Move => ({ move: 'decision', question, yes: 'ja', no: 'nein' });
const exception: Move = { move: 'exceptionPath', text: 'Fehler' };

/** Lines of the story text as "depth|text". */
const lines = (s: StoryState) => s.storyText.map((l) => `${l.depth}|${l.text}`);

function ok(r: { moves: Move[] } | { error: string }): Move[] {
  assert.ok('moves' in r, 'error' in r ? r.error : '');
  assert.deepEqual(tell(r.moves, 'de').errors, []);
  return r.moves;
}

/** The story text reads back into the same story. */
function readsBack(moves: Move[]) {
  const s = tell(moves, 'de');
  const r = read(asSourceText(s.storyText), 'de');
  assert.deepEqual(r.errors, []);
  assert.deepEqual(lines(tell(r.moves, 'de')), lines(s));
}

const PLAIN: Move[] = [start, task('Prüfen'), task('Buchen'), end('Gebucht')];
// Both paths run together again, then the story goes on.
const CHECK: Move[] = [start, task('Prüfen'), decision('Über 5000 €?'), task('Freigeben'), merge, task('Nachfragen'), merge, task('Zahlen'), end('Bezahlt')];

test('AK2 a decision before line 2 takes what follows into its first path, the other path is still open', () => {
  const out = ok(insertBefore(PLAIN, 1, decision('Neu?'), 'de'));
  const s = tell(out, 'de');
  assert.equal(s.done, true);
  assert.deepEqual(lines(s), ['0|ES BEGINNT: [Rechnung geht ein] bei [@Buchhaltung].', '0|WENN [?Neu]', '0|→ ja:', '1|[@Buchhaltung] soll [Prüfen].', '1|[@Buchhaltung] soll [Buchen].', '1|ENDE: [Gebucht].', '0|SONST → nein:', '1|NOCH OFFEN.']);
  assert.equal(s.ir.openPoints?.length, 1);
  readsBack(out);
});

test('AK2 "what comes first" and "in parallel" with three branches get a placeholder for each further path', () => {
  const first: Move = { move: 'decision', subtype: 'first', yes: 'Antwort', no: 'Frist', yesKind: 'message', noKind: 'time' };
  const a = tell(ok(insertBefore(PLAIN, 2, first, 'de')), 'de');
  assert.equal(lines(a).filter((l) => l.endsWith('NOCH OFFEN.')).length, 1);
  assert.ok(lines(a).includes('1|[@Buchhaltung] soll [Buchen].'));
  const out = ok(insertBefore(PLAIN, 2, { move: 'concurrent', branches: 3 }, 'de'));
  const c = tell(out, 'de');
  assert.equal(lines(c).filter((l) => l.endsWith('NOCH OFFEN.')).length, 2);
  assert.equal(c.ir.openPoints?.length, 2);
  readsBack(out);
});

test('AK3 a decision inside a path that merges is closed before that merge; the outer branch stays as it was', () => {
  const out = ok(insertBefore(CHECK, 3, decision('Eilig?'), 'de'));
  const s = tell(out, 'de');
  assert.ok(lines(s).includes('2|NOCH OFFEN, DANN ZUSAMMEN.'));
  // The old merge still closes the outer branch, and what comes after it stands as before.
  const old = tell(CHECK, 'de');
  assert.deepEqual(lines(s).slice(-2), lines(old).slice(-2));
  assert.equal(s.trace.closes.filter((b) => b === 2).length, 2);
  readsBack(out);
});

test('AK3 "in parallel" before a path that ends with "continue at": closed before it, the target stays', () => {
  const base: Move[] = [start, task('Prüfen'), task('Nachfordern')];
  const target = tell(base, 'de').nodes[1]!;
  const moves: Move[] = [...base, { move: 'goTo', target }];
  assert.deepEqual(tell(moves, 'de').errors, []);
  const out = ok(insertBefore(moves, 2, { move: 'concurrent' }, 'de'));
  const s = tell(out, 'de');
  const goTo = out.at(-1) as { move: string; target: string };
  assert.equal(goTo.move, 'goTo');
  assert.equal(s.ir.nodes.find((n) => n.id === goTo.target)?.name, 'Prüfen');
  assert.ok(lines(s).includes('1|NOCH OFFEN, DANN ZUSAMMEN.'));
  assert.equal(lines(s).at(-1), '0|WEITER BEI [Prüfen].');
});

test('AK4 "continue at" after the insertion keeps its target and pulling forward pulls the same path', () => {
  const base: Move[] = [start, task('Prüfen'), decision('Vollständig?')];
  const target = tell(base, 'de').nodes[1]!;
  // On "ja" first pull "nein" forward, then tell "ja" on.
  const moves: Move[] = [...base, { move: 'switchTo', to: 1 }, task('Nachfordern'), { move: 'goTo', target }, task('Buchen'), end('Gebucht')];
  assert.deepEqual(tell(moves, 'de').errors, []);
  const out = ok(insertBefore(moves, 6, decision('Eilig?'), 'de'));
  const s = tell(out, 'de');
  const goTo = out.find((m) => m.move === 'goTo') as { target: string };
  assert.equal(s.ir.nodes.find((n) => n.id === goTo.target)?.name, 'Prüfen');
  assert.ok(lines(s).includes('2|[@Buchhaltung] soll [Buchen].'));
  // A decision before the line pulled forward: the pulled path is still "nein".
  const out2 = ok(insertBefore(moves, 4, decision('Eilig?'), 'de'));
  assert.ok(lines(tell(out2, 'de')).some((l) => /nein/.test(l)));
  assert.equal(tell(out2, 'de').done, true);
});

test('AK4 a refused insertion changes nothing and says why', () => {
  const r = insertBefore(PLAIN, 1, end('Schluss'), 'de');
  assert.ok('error' in r);
  assert.ok('error' in insertBefore(PLAIN, 1, { move: 'exceptionPath', text: 'x' }, 'de'));
  assert.ok('error' in insertBefore(PLAIN, 9, task('X'), 'de'));
});

test('AK1 a task, a wait and a signal go in as before; before an exception line before its step', () => {
  const out = ok(insertBefore(PLAIN, 2, { move: 'wait', text: 'Rückruf', subtype: 'message' }, 'de'));
  assert.equal(out[2].move, 'wait');
  const withExc = ok(addException(PLAIN, 1, exception, 'de'));
  const out2 = ok(insertBefore(withExc, 2, task('Vorher'), 'de'));
  assert.equal((out2[1] as { text: string }).text, 'Vorher');
});

test('AK5 an exception on a step: its path still open, the normal path goes on', () => {
  const out = ok(addException(PLAIN, 1, exception, 'de'));
  const s = tell(out, 'de');
  assert.deepEqual(lines(s), ['0|ES BEGINNT: [Rechnung geht ein] bei [@Buchhaltung].', '0|[@Buchhaltung] soll [Prüfen].', '0|FALLS [Fehler]:', '1|NOCH OFFEN.', '0|[@Buchhaltung] soll [Buchen].', '0|ENDE: [Gebucht].']);
  assert.equal(s.done, true);
  readsBack(out);
  // A step with an exception gets no second one.
  assert.ok('error' in addException(out, 1, exception, 'de'));
  assert.ok('error' in addException(PLAIN, 3, exception, 'de'));
});

test('AK5 an exception inside a path that merges: the outer branch is still closed by its merge', () => {
  const out = ok(addException(CHECK, 3, exception, 'de'));
  const s = tell(out, 'de');
  const old = tell(CHECK, 'de');
  assert.deepEqual(lines(s).slice(-2), lines(old).slice(-2));
  assert.equal(s.trace.closes.filter((b) => b === 2).length, 2);
  readsBack(out);
});

test('Risk: an exception where the step keeps running stays a path of its own that ends', () => {
  const out = ok(addException(CHECK, 3, { move: 'exceptionPath', text: 'Frist', subtype: 'deadline', keepsRunning: 'yes' }, 'de'));
  const s = tell(out, 'de');
  assert.ok(lines(s).includes('2|NOCH OFFEN.'));
  assert.ok(!lines(s).includes('2|NOCH OFFEN, DANN ZUSAMMEN.'));
});

test('AK6 a further trigger goes right after the triggers, a second plain one is refused', () => {
  const mail: Move = { move: 'orStart', text: 'Mail kommt', role: 'Buchhaltung', subtype: 'message' };
  const out = ok(addTrigger(PLAIN, mail, 'de'));
  assert.equal(out[1], mail);
  assert.deepEqual(out.slice(2), PLAIN.slice(1));
  const portal: Move = { move: 'orStart', text: 'Portal', role: 'Buchhaltung', subtype: 'signal' };
  const out2 = ok(addTrigger(out, portal, 'de'));
  assert.equal(out2[2], portal);
  readsBack(out2);
  const r = addTrigger(PLAIN, { move: 'orStart', text: 'Anruf', role: 'Buchhaltung' }, 'de');
  assert.ok('error' in r && /einfach beginnen/.test(r.error));
  assert.ok('error' in addTrigger([task('X')], mail, 'de', { inner: { name: 'Teil' } }));
});

test('AK6 "continue at" keeps its target when a trigger is added', () => {
  const base: Move[] = [start, task('Prüfen'), decision('Vollständig?'), end('Gebucht')];
  const target = tell(base, 'de').nodes[1]!;
  const moves: Move[] = [...base, { move: 'goTo', target }];
  const out = ok(addTrigger(moves, { move: 'orStart', text: 'Mail', role: 'Buchhaltung', subtype: 'message' }, 'de'));
  const goTo = out.at(-1) as { target: string };
  assert.equal(tell(out, 'de').ir.nodes.find((n) => n.id === goTo.target)?.name, 'Prüfen');
});

test('AK7 the placeholder of an inserted branch can be told', () => {
  const out = ok(insertBefore(PLAIN, 1, decision('Neu?'), 'de'));
  const at = out.findIndex((m) => m.move === 'openPath');
  const r = tellOpen(out, at, end('Abgelehnt'), 'de');
  assert.ok('moves' in r, 'error' in r ? r.error : '');
  assert.equal(tell(r.moves, 'de').ir.openPoints?.length ?? 0, 0);
});

test('AK2 on a subprocess level', () => {
  const opts = { inner: { name: 'Prüfen' } };
  const moves: Move[] = [task('A'), task('B'), end('Fertig')];
  const r = insertBefore(moves, 1, decision('Neu?'), 'de', opts);
  assert.ok('moves' in r);
  assert.deepEqual(tell(r.moves, 'de', opts).errors, []);
  assert.ok(lines(tell(r.moves, 'de', opts)).includes('1|NOCH OFFEN.'));
});
