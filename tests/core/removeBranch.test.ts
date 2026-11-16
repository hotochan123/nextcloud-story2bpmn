import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tell, removeBranch, Move, TellOptions } from '../../src/core/story.js';

const start: Move = { move: 'start', text: 'Rechnung geht ein', role: 'Buchhaltung' };
const task = (text: string): Move => ({ move: 'task', text, role: 'Buchhaltung' });
const end = (text: string, subtype: '' | 'cancel' = ''): Move => ({ move: 'end', text, ...(subtype && { subtype }) });
const decision = (question: string): Move => ({ move: 'decision', question, yes: 'ja', no: 'nein' });

/** Removes and checks that the rest replays without errors. */
function removed(moves: Move[], at: number, keep: number): Move[] {
  assert.deepEqual(tell(moves, 'de').errors, [], 'Ausgangsgeschichte gültig');
  const r = removeBranch(moves, at, keep, 'de');
  assert.ok('moves' in r, 'error' in r ? r.error : '');
  assert.deepEqual(tell(r.moves, 'de').errors, []);
  return r.moves;
}

// Both paths run together again, then the story goes on.
const BOTH_MERGE: Move[] = [start, task('Prüfen'), decision('Über 5000 €?'), task('Freigeben'), { move: 'merge' }, { move: 'merge' }, end('Bezahlt')];

test('decision, both paths merge: kept path moves into the path before', () => {
  assert.deepEqual(removed(BOTH_MERGE, 2, 0), [start, task('Prüfen'), task('Freigeben'), end('Bezahlt')]);
  assert.deepEqual(removed(BOTH_MERGE, 2, 1), [start, task('Prüfen'), end('Bezahlt')]);
});

test('decision, only the deleted path merges: what comes after the merge goes too', () => {
  const moves: Move[] = [start, decision('Vollständig?'), task('Buchen'), end('Gebucht'), { move: 'merge' }, task('Nachfordern'), end('Nachgefordert')];
  assert.deepEqual(removed(moves, 1, 0), [start, task('Buchen'), end('Gebucht')]);
  assert.deepEqual(removed(moves, 1, 1), [start, task('Nachfordern'), end('Nachgefordert')]);
});

test('branches inside the deleted path go with it', () => {
  const moves: Move[] = [
    start,
    decision('Vollständig?'),
    task('Buchen'), end('Gebucht'),
    decision('Lieferant bekannt?'), task('Anrufen'), end('Geklärt'), end('Abgelehnt'),
  ];
  assert.deepEqual(removed(moves, 1, 0), [start, task('Buchen'), end('Gebucht')]);
  // The inner decision is kept along with its paths.
  assert.deepEqual(removed(moves, 1, 1), [start, decision('Lieferant bekannt?'), task('Anrufen'), end('Geklärt'), end('Abgelehnt')]);
});

test('whichever comes first: the kept waiting stays as a wait', () => {
  const moves: Move[] = [
    start,
    { move: 'decision', subtype: 'first', yes: 'Zahlung geht ein', yesKind: 'message', no: '14 Tage', noKind: 'time' },
    task('Buchen'), end('Bezahlt'),
    task('Mahnen'), end('Gemahnt'),
  ];
  assert.deepEqual(removed(moves, 1, 1), [start, { move: 'wait', text: '14 Tage', subtype: 'time' }, task('Mahnen'), end('Gemahnt')]);
  assert.deepEqual(removed(moves, 1, 0), [start, { move: 'wait', text: 'Zahlung geht ein', subtype: 'message' }, task('Buchen'), end('Bezahlt')]);
});

test('concurrent: "stop everything" without anything alongside becomes a plain end', () => {
  const moves: Move[] = [start, { move: 'concurrent' }, task('Prüfen'), end('Abgebrochen', 'cancel'), task('Ablegen'), end('Abgelegt')];
  assert.deepEqual(removed(moves, 1, 0), [start, task('Prüfen'), end('Abgebrochen')]);
  assert.deepEqual(removed(moves, 1, 1), [start, task('Ablegen'), end('Abgelegt')]);
});

test('exception path: the normal path stays, the loop back goes', () => {
  const moves: Move[] = [
    start,
    task('Rechnung prüfen'),
    { move: 'exceptionPath', text: 'Betrag falsch' },
    task('Rückfrage'),
    { move: 'goTo', target: 'Schritt_2' },
    decision('Über 5000 €?'), task('Freigeben'), { move: 'merge' }, { move: 'merge' },
    task('Anweisen'), end('Bezahlt'),
  ];
  const r = removed(moves, 2, 1);
  assert.deepEqual(r, [start, task('Rechnung prüfen'), decision('Über 5000 €?'), task('Freigeben'), { move: 'merge' }, { move: 'merge' }, task('Anweisen'), end('Bezahlt')]);
});

test('"continue at" into the deleted path refuses, naming the line', () => {
  const moves: Move[] = [start, decision('Vollständig?'), task('Buchen'), end('Gebucht'), task('Nachfordern'), { move: 'goTo', target: 'Schritt_3' }];
  assert.deepEqual(tell(moves, 'de').errors, []);
  // The no path continues at "Buchen" on the yes path.
  const r = removeBranch(moves, 1, 1, 'de');
  assert.deepEqual(r, { error: 'Zeile 6 führt noch zu „Buchen“ – dort zuerst ändern', line: 5 });
  // Keeping the yes path takes the jump with the no path.
  assert.deepEqual(removed(moves, 1, 0), [start, task('Buchen'), end('Gebucht')]);
});

test('"continue at" outside keeps its target although the IDs shift', () => {
  const moves: Move[] = [
    start,
    task('Prüfen'),
    decision('Vollständig?'), task('Nachfordern'), { move: 'merge' }, { move: 'merge' },
    decision('Freigegeben?'), end('Bezahlt'), { move: 'goTo', target: 'Schritt_2' },
  ];
  const r = removed(moves, 2, 1);
  const jump = r.at(-1) as { move: 'goTo'; target: string };
  assert.equal(tell(r, 'de').ir.nodes.find((n) => n.id === jump.target)?.name, 'Prüfen');
});

test('pulling paths forward is renumbered or dropped', () => {
  const moves: Move[] = [
    start,
    decision('Vollständig?'),
    decision('Bekannt?'), task('Buchen'),
    // Open: the "nein" of "Bekannt?", then the "nein" of "Vollständig?".
    { move: 'switchTo', to: 2 },
    task('Nachfordern'), end('Nachgefordert'),
    end('Gebucht'),
    end('Unbekannt'),
  ];
  // Without "Bekannt?" only the "nein" of "Vollständig?" is still open: it is now position 1.
  assert.deepEqual(removed(moves, 2, 0), [start, decision('Vollständig?'), task('Buchen'), { move: 'switchTo', to: 1 }, task('Nachfordern'), end('Nachgefordert'), end('Gebucht')]);
  // Pulled forward was the deleted path: the switch goes with it.
  assert.deepEqual(removed(moves, 1, 0), [start, decision('Bekannt?'), task('Buchen'), end('Gebucht'), end('Unbekannt')]);
});

test('not a branch: refused', () => {
  assert.deepEqual(removeBranch(BOTH_MERGE, 1, 0, 'de'), { error: 'Hier verzweigt sich nichts' });
});

// Job 393: any number of paths, subprocess level, at any time.

const three: Move = { move: 'decision', question: 'Betrag?', yes: 'klein', more: ['mittel'], no: 'groß' };

test('AK1 decision with three paths, all merge: each path can be kept', () => {
  const moves: Move[] = [start, three, task('Buchen'), { move: 'merge' }, task('Prüfen'), { move: 'merge' }, task('Freigeben'), { move: 'merge' }, end('Bezahlt')];
  assert.deepEqual(removed(moves, 1, 0), [start, task('Buchen'), end('Bezahlt')]);
  assert.deepEqual(removed(moves, 1, 1), [start, task('Prüfen'), end('Bezahlt')]);
  assert.deepEqual(removed(moves, 1, 2), [start, task('Freigeben'), end('Bezahlt')]);
});

test('AK1 decision with three paths, only deleted paths merge: what follows goes', () => {
  const moves: Move[] = [start, three, task('Buchen'), end('Gebucht'), task('Prüfen'), { move: 'merge' }, { move: 'merge' }, task('Nachfordern'), end('Nachgefordert')];
  assert.deepEqual(removed(moves, 1, 0), [start, task('Buchen'), end('Gebucht')]);
  assert.deepEqual(removed(moves, 1, 1), [start, task('Prüfen'), task('Nachfordern'), end('Nachgefordert')]);
  assert.deepEqual(removed(moves, 1, 2), [start, task('Nachfordern'), end('Nachgefordert')]);
});

test('AK2 a branch on a kept path of three stays, one on a deleted path goes', () => {
  const moves: Move[] = [
    start, three,
    decision('Bekannt?'), task('Anrufen'), end('Geklärt'), end('Abgelehnt'),
    task('Prüfen'), end('Geprüft'),
    end('Groß'),
  ];
  assert.deepEqual(removed(moves, 1, 0), [start, decision('Bekannt?'), task('Anrufen'), end('Geklärt'), end('Abgelehnt')]);
  assert.deepEqual(removed(moves, 1, 1), [start, task('Prüfen'), end('Geprüft')]);
});

test('AK3 whichever comes first with three events keeps the kind of the kept waiting', () => {
  const moves: Move[] = [
    start,
    { move: 'decision', subtype: 'first', yes: 'Zahlung', yesKind: 'message', more: ['Stopp'], moreKinds: ['signal'], no: '14 Tage', noKind: 'time' },
    task('Buchen'), end('Bezahlt'),
    end('Gestoppt'),
    task('Mahnen'), end('Gemahnt'),
  ];
  assert.deepEqual(removed(moves, 1, 1), [start, { move: 'wait', text: 'Stopp', subtype: 'signal' }, end('Gestoppt')]);
  assert.deepEqual(removed(moves, 1, 2), [start, { move: 'wait', text: '14 Tage', subtype: 'time' }, task('Mahnen'), end('Gemahnt')]);
});

test('AK4 in parallel with three branches: kept branch moves forward, stop everything becomes an end', () => {
  const moves: Move[] = [start, { move: 'concurrent', branches: 3 }, task('Prüfen'), { move: 'merge' }, task('Ablegen'), end('Abgebrochen', 'cancel'), task('Melden'), { move: 'merge' }, end('Fertig')];
  assert.deepEqual(removed(moves, 1, 0), [start, task('Prüfen'), end('Fertig')]);
  assert.deepEqual(removed(moves, 1, 1), [start, task('Ablegen'), end('Abgebrochen')]);
  assert.deepEqual(removed(moves, 1, 2), [start, task('Melden'), end('Fertig')]);
});

test('AK5 exception path where the step keeps running: the normal path stays', () => {
  const moves: Move[] = [start, task('Liefern'), { move: 'exceptionPath', text: '3 Tage', subtype: 'deadline', keepsRunning: 'yes' }, task('Erinnern'), end('Erinnert'), task('Abrechnen'), end('Fertig')];
  assert.deepEqual(removed(moves, 2, 1), [start, task('Liefern'), task('Abrechnen'), end('Fertig')]);
});

test('AK8 subprocess level: deleting a branch there works the same', () => {
  const opts: TellOptions = { inner: { name: 'Prüfen' } };
  const flow: Move[] = [three, task('A'), { move: 'merge' }, task('B'), { move: 'merge' }, task('C'), { move: 'merge' }, end('Geprüft')];
  assert.deepEqual(tell(flow, 'de', opts).errors, []);
  const r = removeBranch(flow, 0, 1, 'de', opts);
  assert.ok('moves' in r);
  assert.deepEqual(r.moves, [task('B'), end('Geprüft')]);
  assert.deepEqual(tell(r.moves, 'de', opts).errors, []);
});

test('AK8 flow of something at any time: the same, also "continue at" keeps its target', () => {
  const opts: TellOptions = { inner: { name: 'Storno', trigger: { subtype: 'message' } } };
  const flow: Move[] = [task('Erfassen'), decision('Bezahlt?'), task('Erstatten'), { move: 'merge' }, { move: 'merge' }, decision('Erneut?'), end('Fertig'), { move: 'goTo', target: 'Schritt_2' }];
  const before = tell(flow, 'de', opts);
  assert.deepEqual(before.errors, []);
  const r = removeBranch(flow, 1, 1, 'de', opts);
  assert.ok('moves' in r);
  const after = tell(r.moves, 'de', opts);
  assert.deepEqual(after.errors, []);
  const jump = r.moves.at(-1) as { move: 'goTo'; target: string };
  assert.equal(after.ir.nodes.find((n) => n.id === jump.target)?.name, 'Erfassen');
});

test('AK6 English refusal names the line', () => {
  const moves: Move[] = [start, decision('Vollständig?'), task('Buchen'), end('Gebucht'), task('Nachfordern'), { move: 'goTo', target: 'Schritt_3' }];
  assert.deepEqual(removeBranch(moves, 1, 1, 'en'), { error: 'Line 6 still leads to “Buchen” – change it there first', line: 5 });
});

test('a path number outside the branch is refused', () => {
  assert.ok('error' in removeBranch(BOTH_MERGE, 2, 2, 'de'));
  assert.ok('error' in removeBranch(BOTH_MERGE, 2, -1, 'de'));
});

test('main-level: a task with a subprocess on a deleted path goes, at any time and triggers stay', () => {
  const moves: Move[] = [
    start, { move: 'orStart', text: 'Anruf', role: 'Buchhaltung', subtype: 'message' },
    decision('Vollständig?'),
    { move: 'task', text: 'Buchen', role: 'Buchhaltung', subprocess: [task('Kontieren'), end('Kontiert')] }, end('Gebucht'),
    task('Nachfordern'), end('Nachgefordert'),
    { move: 'anytime', text: 'Storno', subtype: 'message', subprocess: [task('Stornieren'), end('Storniert')] },
  ];
  const r = removed(moves, 2, 1);
  assert.deepEqual(r, [moves[0], moves[1], task('Nachfordern'), end('Nachgefordert'), moves[7]]);
  assert.equal(tell(r, 'de').subs?.[0], undefined);
});

// Round 2 (fresh review): a surrounding branch that merged only through what goes.
test('a surrounding branch that merged only through the deleted part: what follows it goes too', () => {
  const moves: Move[] = [
    start,
    decision('Vollständig?'),
    decision('Betrag stimmt?'), end('Abgelehnt'), { move: 'merge' }, { move: 'merge' },
    end('Zurückgeschickt'),
    task('Bezahlen'), end('Bezahlt'),
  ];
  // Keeping "ja" of "Betrag stimmt?": its path ends, so the inner merge and with it the only merge of "Vollständig?" go.
  assert.deepEqual(removed(moves, 2, 0), [start, decision("Vollständig?"), end("Abgelehnt"), end("Zurückgeschickt")]);
  // Keeping "nein": the merges stay, nothing after them goes.
  assert.deepEqual(removed(moves, 2, 1), [start, decision("Vollständig?"), { move: "merge" }, end('Zurückgeschickt'), task('Bezahlen'), end('Bezahlt')]);
});

test('a result that cannot be told is refused with a sentence, never returned', () => {
  // "continue at" on the kept path would start where "Bezahlt" already hangs: the same arrow twice.
  const moves: Move[] = [
    start,
    decision('Vollständig?'), end('Bezahlt'),
    decision('Lieferant bekannt?'), { move: 'goTo', target: 'Ende_3' }, end('Unbekannt'),
  ];
  assert.deepEqual(tell(moves, 'de').errors, []);
  const r = removeBranch(moves, 3, 0, 'de');
  assert.ok('error' in r);
  assert.equal(r.error, 'Ohne diese Verzweigung passt die Geschichte nicht mehr zusammen; ändern Sie zuerst die Wege um sie herum');
});
