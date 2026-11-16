import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tell, reopenPath, tellOpen, Move, TellOptions, StoryState } from '../../src/core/story.js';
import { read, asSourceText } from '../../src/core/readBack.js';
import { toStored, fromStored } from '../../src/core/storyFormat.js';
import { run, emptyProcess } from '../../src/core/pipeline.js';

const start: Move = { move: 'start', text: 'Rechnung geht ein', role: 'Buchhaltung' };
const task = (text: string): Move => ({ move: 'task', text, role: 'Buchhaltung' });
const end = (text: string): Move => ({ move: 'end', text });
const merge: Move = { move: 'merge' };
const open: Move = { move: 'openPath' };
const joins: Move = { move: 'openPath', joins: true };
const decision = (question: string, more?: string[]): Move => ({ move: 'decision', question, yes: 'ja', no: 'nein', ...(more && { more }) });

const lines = (s: StoryState) => s.storyText.map((l) => `${l.depth}|${l.text}`);
/** Lines without the one of move `at`: what stays the same around a reopened line. */
const around = (s: StoryState, at: number) => s.storyText.filter((l) => l.move !== at || l.sub !== undefined).map((l) => `${l.depth}|${l.text}`);

function reopened(moves: Move[], at: number, opts: TellOptions = {}): Move[] {
  assert.deepEqual(tell(moves, 'de', opts).errors, [], 'Ausgangsgeschichte gültig');
  const r = reopenPath(moves, at, 'de', opts);
  assert.ok('moves' in r, 'error' in r ? r.error : '');
  const s = tell(r.moves, 'de', opts);
  assert.deepEqual(s.errors, []);
  assert.deepEqual(around(s, at), around(tell(moves, 'de', opts), at), 'alles um die Zeile bleibt');
  assert.equal(s.ir.openPoints?.length ?? 0, (tell(moves, 'de', opts).ir.openPoints?.length ?? 0) + 1, 'ein offener Punkt mehr');
  return r.moves;
}

async function valid(moves: Move[]) {
  const g = tell(moves, 'de');
  const e = await run({ ir: { ...emptyProcess('P', g.ir.name, 'de'), story: moves }, ops: g.ops });
  assert.equal(e.ok, true, JSON.stringify(e.issues));
  assert.ok(e.xml?.includes('bpmn:'), 'BPMN-Export');
  assert.equal(e.readingCopy, false, 'Leseexemplar mit ENTWURF');
}

test('AK1 an end on a path of a branch becomes "still open"; before and after stay', async () => {
  const moves: Move[] = [start, decision('Vollständig?'), task('Buchen'), end('Gebucht'), task('Nachfordern'), end('Abgelehnt')];
  const out = reopened(moves, 3);
  assert.deepEqual(out, [start, decision('Vollständig?'), task('Buchen'), open, task('Nachfordern'), end('Abgelehnt')]);
  assert.ok(lines(tell(out, 'de')).includes('1|NOCH OFFEN.'));
  await valid(out);
  // The last end of the story too: the story is open again.
  const last = reopened(moves, 5);
  assert.equal(last.at(-1)?.move, 'openPath');
  // And told again with tellOpen: back to the old story.
  const r = tellOpen(out, 3, end('Gebucht'), 'de');
  assert.ok('moves' in r);
  assert.deepEqual(r.moves, moves);
});

test('AK2 "continue at" reopened; later "continue at" keeps its target; an end someone continues at is refused', () => {
  // The yes path jumps back to the check (a merge point goes in before it); later, the no path jumps there too.
  const base: Move[] = [start, task('Prüfen'), decision('Fehlt etwas?'), task('Nachfordern')];
  const check = tell(base, 'de').nodes[1]!;
  const moves: Move[] = [...base, { move: 'goTo', target: check }, task('Buchen'), { move: 'goTo', target: check }];
  const out = reopened(moves, 4);
  assert.equal(out[4].move, 'openPath');
  const s = tell(out, 'de');
  const jump = out[6] as { move: 'goTo'; target: string };
  assert.equal(s.ir.nodes.find((n) => n.id === jump.target)?.name, 'Prüfen');
  // An end that another line continues at.
  const ends: Move[] = [start, decision('Ok?'), end('Fertig'), task('Nacharbeiten')];
  const done = tell(ends, 'de').nodes[2]!;
  const withJump = [...ends, { move: 'goTo', target: done } as Move];
  assert.deepEqual(tell(withJump, 'de').errors, []);
  const r = reopenPath(withJump, 2, 'de');
  assert.ok('error' in r);
  assert.equal(r.error, 'Zeile 5 führt noch zu „Fertig“ – dort zuerst ändern');
});

test('AK3 a merge with other paths into the same merge: plain placeholder, the continuation stays', async () => {
  const moves: Move[] = [start, decision('Betrag?', ['mittel']), task('Freigeben'), merge, task('Prüfen'), merge, merge, task('Zahlen'), end('Bezahlt')];
  const out = reopened(moves, 3);
  assert.deepEqual(out[3], open);
  assert.deepEqual(out.slice(4), moves.slice(4));
  await valid(out);
  // With only one other path left, the continuation runs on just as well.
  const two: Move[] = [start, decision('Betrag?'), task('Freigeben'), merge, merge, task('Zahlen'), end('Bezahlt')];
  const out2 = reopened(two, 4);
  assert.deepEqual(out2[4], open);
  assert.ok(lines(tell(out2, 'de')).includes('0|[@Buchhaltung] soll [Zahlen].'));
});

test('AK4 no path leads to the merge any more: the placeholder runs on into it, nothing goes', async () => {
  const moves: Move[] = [start, decision('Vollständig?'), task('Buchen'), merge, end('Abgelehnt'), task('Ablegen'), end('Erledigt')];
  const out = reopened(moves, 3);
  assert.deepEqual(out, [start, decision('Vollständig?'), task('Buchen'), joins, end('Abgelehnt'), task('Ablegen'), end('Erledigt')]);
  const s = tell(out, 'de');
  assert.ok(lines(s).includes('1|NOCH OFFEN, DANN ZUSAMMEN.'));
  const step = s.ir.nodes.find((n) => n.id.startsWith('Offen_'));
  assert.equal(step?.kind, 'step');
  assert.equal(step?.name, 'Noch offen');
  assert.equal(s.ir.openPoints?.[0].elementId, step!.id);
  assert.ok(!s.targets.some((t) => t.id === step!.id), 'kein Ziel für Weiter bei');
  assert.ok(s.ir.nodes.some((n) => n.name === 'Ablegen'));
  await valid(out);
  const en = tell(out, 'en');
  assert.ok(lines(en).includes('1|STILL OPEN, THEN MERGE.'));
  // Told again: a merge brings back the old story, a step goes before it, an end would cut off "Ablegen".
  const back = tellOpen(out, 3, merge, 'de');
  assert.ok('moves' in back);
  assert.deepEqual(back.moves, moves);
  const before = tellOpen(out, 3, task('Prüfen'), 'de');
  assert.ok('moves' in before);
  assert.deepEqual(before.moves.slice(3, 5), [task('Prüfen'), joins]);
  assert.equal(before.at, 4);
  assert.ok('error' in tellOpen(out, 3, end('Gebucht'), 'de'));
  // Reopening the placeholder's own line is no move that closes a path.
  assert.ok('error' in reopenPath(out, 3, 'de'));
});

test('AK4 an inner merge whose continuation runs into an outer merge stays as it was', () => {
  const moves: Move[] = [start, decision('A?'), decision('B?'), task('X'), merge, end('B-nein'), task('Y'), merge, merge, end('Fertig')];
  const out = reopened(moves, 4);
  assert.deepEqual(out[4], joins);
  assert.deepEqual(out.slice(5), moves.slice(5));
});

test('AK4 "stop everything" beside "in parallel" reopened stays valid', async () => {
  const moves: Move[] = [start, { move: 'concurrent' }, task('A'), merge, task('B'), { move: 'end', text: 'Storno', subtype: 'cancel' }, end('Fertig')];
  const out = reopened(moves, 5);
  assert.deepEqual(out[5], open);
  await valid(out);
});

test('AK5 on a subprocess level and in the flow of something at any time', () => {
  for (const opts of [{ inner: { name: 'Prüfen' } }, { inner: { name: 'Storno', trigger: { subtype: 'message' as const } } }] satisfies TellOptions[]) {
    const moves: Move[] = [task('Lesen'), decision('Ok?'), task('Gut'), merge, end('Schlecht'), end('Fertig')];
    const out = reopened(moves, 3, opts);
    assert.deepEqual(out[3], joins);
    const out2 = reopened(moves, 4, opts);
    assert.deepEqual(out2[4], open);
  }
});

test('AK6 read back and stored format: the placeholder that runs into the merge comes back', () => {
  for (const language of ['de', 'en'] as const) {
    const moves: Move[] = [start, decision(language === 'de' ? 'Vollständig?' : 'Complete?'), task('Buchen'), joins, end('Abgelehnt'), task('Ablegen'), end('Erledigt')];
    const s = tell(moves, language);
    assert.deepEqual(s.errors, []);
    const r = read(asSourceText(s.storyText), language);
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.moves.map((m) => m.move), moves.map((m) => m.move));
    assert.deepEqual((r.moves[3] as { joins?: boolean }).joins, true);
    assert.deepEqual(lines(tell(r.moves, language)), lines(s));
    const stored = toStored(moves) as Record<string, unknown>[];
    assert.equal(stored[3]['zug'], 'offen');
    assert.equal(stored[3]['zusammen'], true);
    assert.deepEqual(fromStored(stored), moves);
  }
});

test('reopenPath refuses lines that close no path', () => {
  const moves: Move[] = [start, task('Buchen'), end('Fertig')];
  for (const at of [0, 1, 9]) assert.ok('error' in reopenPath(moves, at, 'de'));
  assert.equal((reopenPath(moves, 1, 'en') as { error: string }).error, 'No path ends here');
});

test('Round 1: a branch told before a placeholder that runs on into a merge keeps the old merge', () => {
  const moves: Move[] = [start, decision('Vollständig?'), task('Buchen'), merge, end('Abgelehnt'), task('Ablegen'), end('Erledigt')];
  const out = reopened(moves, 3);
  for (const branch of [decision('Neu?'), decision('Was?', ['halb']), { move: 'concurrent' } as Move, { move: 'exceptionPath', text: 'Fehler', subtype: 'error' } as Move]) {
    const r = tellOpen(out, 3, branch, 'de');
    assert.ok('moves' in r, `${branch.move}: ${'error' in r ? r.error : ''}`);
    const s = tell(r.moves, 'de');
    assert.deepEqual(s.errors, []);
    assert.equal(r.at, 4);
    // Each new path is still open and runs into the new merge; the old placeholder runs on into the old one.
    const k: number = branch.move === 'decision' ? 2 + (branch.more?.length ?? 0) : 2;
    assert.deepEqual(r.moves.slice(3, 4 + k + 1), [branch, ...Array.from({ length: k }, (): Move => joins), joins]);
    assert.deepEqual(r.moves.slice(4 + k + 1), moves.slice(4));
    assert.ok(lines(s).includes('0|[@Buchhaltung] soll [Ablegen].'));
  }
  // An exception path alongside cannot merge: it gets a plain placeholder, the normal path runs on as before.
  const alongside = tellOpen(reopened([start, decision('Vollständig?'), task('Buchen'), merge, end('Abgelehnt'), task('Ablegen'), end('Erledigt')], 3), 3, { move: 'exceptionPath', text: 'Frist', subtype: 'deadline', keepsRunning: 'yes' } as Move, 'de');
  assert.ok('moves' in alongside, 'error' in alongside ? alongside.error : '');
  assert.deepEqual(tell(alongside.moves, 'de').errors, []);
});
