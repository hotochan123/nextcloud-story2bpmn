import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tell, addPaths, tellOpen, MAX_PATHS, Move, TellOptions, StoryState } from '../../src/core/story.js';
import { read, asSourceText } from '../../src/core/readBack.js';
import { toStored, fromStored } from '../../src/core/storyFormat.js';
import { run } from '../../src/core/pipeline.js';
import { emptyProcess } from '../../src/core/pipeline.js';

const start: Move = { move: 'start', text: 'Rechnung geht ein', role: 'Buchhaltung' };
const task = (text: string): Move => ({ move: 'task', text, role: 'Buchhaltung' });
const end = (text: string): Move => ({ move: 'end', text });
const merge: Move = { move: 'merge' };
const open: Move = { move: 'openPath' };
const decision = (question: string, more?: string[]): Move => ({ move: 'decision', question, yes: 'ja', no: 'nein', ...(more && { more }) });

/** Lines of the story text as "depth|text", without the move numbers. */
const lines = (s: StoryState) => s.storyText.map((l) => `${l.depth}|${l.text}`);

function added(moves: Move[], at: number, move: Move, opts: TellOptions = {}): Move[] {
  assert.deepEqual(tell(moves, 'de', opts).errors, [], 'Ausgangsgeschichte gültig');
  const r = addPaths(moves, at, move, 'de', opts);
  assert.ok('moves' in r, 'error' in r ? r.error : '');
  assert.deepEqual(tell(r.moves, 'de', opts).errors, []);
  return r.moves;
}

// Both paths run together again, then the story goes on.
const CHECK: Move[] = [start, task('Prüfen'), decision('Über 5000 €?'), task('Freigeben'), merge, merge, task('Zahlen'), end('Bezahlt')];

test('AK1 openPath ends the path as "still open" with an open point and a line of its own', () => {
  const s = tell([start, decision('Vollständig?'), end('Gebucht'), open], 'de');
  assert.deepEqual(s.errors, []);
  assert.equal(s.done, true);
  const node = s.ir.nodes.find((n) => n.id.startsWith('Offen_'));
  assert.equal(node?.kind, 'end');
  assert.equal(node?.name, 'Noch offen');
  assert.equal(s.ir.openPoints?.length, 1);
  assert.equal(s.ir.openPoints?.[0].elementId, node!.id);
  assert.match(s.ir.openPoints![0].question, /Zu Ende erzählen, was auf diesem Weg passiert/);
  assert.ok(lines(s).includes('1|NOCH OFFEN.'));
  const en = tell([start, decision('Complete?'), end('Booked'), open], 'en');
  assert.ok(lines(en).includes('1|STILL OPEN.'));
  assert.equal(en.ir.nodes.find((n) => n.id.startsWith('Offen_'))?.name, 'Still open');
});

test('AK1 openPath is no target of "continue at", and without a path it is an error', () => {
  const s = tell([start, decision('Vollständig?'), open, task('Nachfordern')], 'de');
  assert.ok(!s.targets.some((t) => t.id.startsWith('Offen_')));
  assert.ok(s.targets.some((t) => t.name === 'Nachfordern'));
  assert.ok(!s.options.includes('openPath'));
  assert.notDeepEqual(tell([start, end('Fertig'), open], 'de').errors, []);
  assert.notDeepEqual(tell([open], 'de').errors, []);
});

test('AK1 a story with a path still open gives no reading copy (DRAFT)', async () => {
  const moves = [start, decision('Vollständig?'), end('Gebucht'), open];
  const g = tell(moves, 'de');
  const e = await run({ ir: { ...emptyProcess('P', g.ir.name, 'de'), story: moves }, ops: g.ops });
  assert.equal(e.readingCopy, false);
});

test('AK2 check: the new path comes right before the otherwise path, everything told stays', () => {
  const out = added(CHECK, 2, decision('Über 5000 €?', ['unklar']));
  assert.deepEqual(out, [start, task('Prüfen'), decision('Über 5000 €?', ['unklar']), task('Freigeben'), merge, open, merge, task('Zahlen'), end('Bezahlt')]);
  const before = lines(tell(CHECK, 'de'));
  const after = lines(tell(out, 'de'));
  assert.deepEqual(after.filter((l) => !/unklar|NOCH OFFEN/.test(l)), before);
  assert.ok(after.indexOf('0|→ unklar:') > 0 && after.indexOf('0|→ unklar:') < after.indexOf('0|SONST → nein:'));
});

test('AK3 what comes first: the new path is the last one, with its kind', () => {
  const first: Move = { move: 'decision', subtype: 'first', yes: 'Zahlung', yesKind: 'message', no: '3 Tage', noKind: 'time' };
  const moves: Move[] = [start, first, task('Buchen'), merge, task('Mahnen'), merge, end('Erledigt')];
  const bigger: Move = { move: 'decision', subtype: 'first', yes: 'Zahlung', yesKind: 'message', more: ['3 Tage'], moreKinds: ['time'], no: 'Storno', noKind: 'signal' };
  const out = added(moves, 1, bigger);
  assert.deepEqual(out, [start, bigger, task('Buchen'), merge, task('Mahnen'), merge, open, end('Erledigt')]);
  const s = tell(out, 'de');
  assert.ok(s.ir.nodes.some((n) => n.kind === 'wait' && n.name === 'Storno' && (n as { subtype?: string }).subtype === 'signal'));
});

test('AK3 in parallel: one branch more at the end', () => {
  const moves: Move[] = [start, { move: 'concurrent' }, task('Liefern'), merge, task('Rechnen'), merge, end('Fertig')];
  const out = added(moves, 1, { move: 'concurrent', branches: 3 });
  assert.deepEqual(out, [start, { move: 'concurrent', branches: 3 }, task('Liefern'), merge, task('Rechnen'), merge, open, end('Fertig')]);
});

test('AK4 two paths at once, a nested branch in an old path', () => {
  const moves: Move[] = [start, decision('Vollständig?'), decision('Bekannt?'), task('Buchen'), merge, task('Anlegen'), merge, merge, task('Nachfordern'), merge, end('Fertig')];
  const out = added(moves, 1, decision('Vollständig?', ['teils', 'unklar']));
  assert.deepEqual(out, [start, decision('Vollständig?', ['teils', 'unklar']), decision('Bekannt?'), task('Buchen'), merge, task('Anlegen'), merge, merge, open, open, task('Nachfordern'), merge, end('Fertig')]);
});

test('AK4 "continue at" behind the branch keeps its target although the IDs shift', () => {
  const first: Move = { move: 'decision', subtype: 'first', yes: 'Zahlung', no: 'Frist' };
  const moves0: Move[] = [start, task('Prüfen'), first, task('Buchen'), end('Gebucht'), task('Mahnen')];
  const target = tell(moves0, 'de').nodes[1]!;
  const moves: Move[] = [...moves0, { move: 'goTo', target }];
  const out = added(moves, 2, { move: 'decision', subtype: 'first', yes: 'Zahlung', more: ['Frist'], no: 'Storno' });
  const s = tell(out, 'de');
  const goTo = out.find((m) => m.move === 'goTo') as { target: string };
  assert.equal(s.ir.nodes.find((n) => n.id === goTo.target)?.name, 'Prüfen');
  assert.equal(out.at(-1)?.move, 'goTo');
  // The new path comes up only after the last move: no placeholder, the story goes on with it.
  assert.ok(!out.some((m) => m.move === 'openPath'));
  assert.equal(s.done, false);
  assert.match(s.path ?? '', /Storno/);
});

test('AK4 pulling forward pulls the same path', () => {
  // The otherwise path is told first, then "ja"; the new path comes up last.
  const moves: Move[] = [start, decision('Vollständig?'), { move: 'switchTo', to: 1 }, task('Nachfordern'), end('Abgelehnt'), task('Buchen'), end('Gebucht')];
  const out = added(moves, 1, decision('Vollständig?', ['teils']));
  // "nein" is now path 3 of 3: pulled forward with to = 2.
  assert.deepEqual(out, [start, decision('Vollständig?', ['teils']), { move: 'switchTo', to: 2 }, task('Nachfordern'), end('Abgelehnt'), task('Buchen'), end('Gebucht')]);
  const s = tell(out, 'de');
  assert.equal(s.done, false);
  assert.match(s.path ?? '', /teils/);
  // Pulled forward inside a branch with a placeholder before it: the otherwise path is still the one pulled.
  const inner: Move[] = [start, decision('A?'), decision('B?'), end('1'), { move: 'switchTo', to: 1 }, task('Sonst'), end('3'), end('2')];
  const out2 = added(inner, 2, decision('B?', ['halb']));
  const l = lines(tell(out2, 'de'));
  assert.deepEqual(l.filter((x) => !/halb|NOCH OFFEN/.test(x)), lines(tell(inner, 'de')));
  assert.deepEqual(out2.slice(4, 6), [open, { move: 'switchTo', to: 1 }]);
});

test('AK4 a branch as the last move: no placeholder; refused beyond MAX_PATHS or for fewer paths', () => {
  const out = added([start, decision('Vollständig?')], 1, decision('Vollständig?', ['teils']));
  assert.deepEqual(out, [start, decision('Vollständig?', ['teils'])]);
  const many = Array.from({ length: MAX_PATHS - 1 }, (_, j) => `w${j}`);
  assert.ok('error' in addPaths(CHECK, 2, decision('Über 5000 €?', many), 'de'));
  assert.ok('error' in addPaths(CHECK, 2, decision('Über 5000 €?'), 'de'));
  assert.ok('error' in addPaths(CHECK, 1, decision('Über 5000 €?', ['x']), 'de'));
  assert.ok('error' in addPaths(CHECK, 2, { move: 'decision', subtype: 'first', yes: 'a', more: ['b'], no: 'c' }, 'de'));
});

const WITH_OPEN = (): Move[] => added(CHECK, 2, decision('Über 5000 €?', ['unklar']));

function told(moves: Move[], at: number, move: Move): { moves: Move[]; at: number | null } {
  const r = tellOpen(moves, at, move, 'de');
  assert.ok('moves' in r, 'error' in r ? r.error : '');
  assert.deepEqual(tell(r.moves, 'de').errors, []);
  return r;
}

test('AK5 tellOpen: a step goes before the placeholder, a merge takes its place', () => {
  const moves = WITH_OPEN();
  const at = moves.findIndex((m) => m.move === 'openPath');
  const a = told(moves, at, task('Klären'));
  assert.equal(a.at, at + 1);
  assert.deepEqual(a.moves.slice(at, at + 2), [task('Klären'), open]);
  const b = told(a.moves, a.at!, merge);
  assert.equal(b.at, null);
  assert.deepEqual(b.moves, [start, task('Prüfen'), decision('Über 5000 €?', ['unklar']), task('Freigeben'), merge, task('Klären'), merge, merge, task('Zahlen'), end('Bezahlt')]);
  assert.equal(tell(b.moves, 'de').ir.openPoints?.length ?? 0, 0);
});

test('AK5 tellOpen: an end and "continue at" take the place of the placeholder', () => {
  const moves = WITH_OPEN();
  const at = moves.findIndex((m) => m.move === 'openPath');
  assert.deepEqual(told(moves, at, end('Abgelehnt')).moves[at], end('Abgelehnt'));
  const target = tell(moves.slice(0, at), 'de').targets.find((t) => t.name === 'Prüfen')!.id;
  const g = told(moves, at, { move: 'goTo', target });
  assert.equal(g.at, null);
  assert.equal(g.moves[at].move, 'goTo');
});

test('AK5 tellOpen: a branch brings one placeholder per further path', () => {
  const moves = WITH_OPEN();
  const at = moves.findIndex((m) => m.move === 'openPath');
  const r = told(moves, at, decision('Rückfrage?', ['vielleicht']));
  assert.equal(r.at, at + 1);
  assert.deepEqual(r.moves.slice(at, at + 4), [decision('Rückfrage?', ['vielleicht']), open, open, open]);
});

test('AK5 tellOpen: a merge without a continuation so far leaves the continuation open', () => {
  const moves: Move[] = [start, decision('Vollständig?'), end('Gebucht'), end('Abgelehnt')];
  const out = added(moves, 1, decision('Vollständig?', ['teils']));
  assert.deepEqual(out, [start, decision('Vollständig?', ['teils']), end('Gebucht'), open, end('Abgelehnt')]);
  const r = told(out, 3, merge);
  // The continuation comes up only after the last move: the story goes on with it.
  assert.deepEqual(r.moves, [start, decision('Vollständig?', ['teils']), end('Gebucht'), merge, end('Abgelehnt')]);
  assert.equal(r.at, null);
  assert.equal(tell(r.moves, 'de').done, false);
});

test('AK5 tellOpen: refused for moves that do not belong there, and where no path is open', () => {
  const moves = WITH_OPEN();
  const at = moves.findIndex((m) => m.move === 'openPath');
  assert.ok('error' in tellOpen(moves, at, { move: 'switchTo', to: 1 }, 'de'));
  assert.ok('error' in tellOpen(moves, at, { move: 'anytime', text: 'Storno', subtype: 'message' }, 'de'));
  assert.ok('error' in tellOpen(moves, 1, task('X'), 'de'));
});

test('AK6 read back: the story text with NOCH OFFEN / STILL OPEN gives the same moves', () => {
  for (const language of ['de', 'en'] as const) {
    const yes = language === 'de' ? 'ja' : 'yes';
    const no = language === 'de' ? 'nein' : 'no';
    const moves: Move[] = [start, { move: 'decision', question: 'Über 5000 €?', yes, more: ['unklar'], no }, task('Freigeben'), merge, open, merge, end('Bezahlt')];
    const s = tell(moves, language);
    assert.deepEqual(s.errors, []);
    const r = read(asSourceText(s.storyText), language);
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.moves.map((m) => m.move), moves.map((m) => m.move));
    assert.deepEqual(lines(tell(r.moves, language)), lines(s));
  }
});

test('AK6 stored format: openPath is kept as "offen" and comes back', () => {
  const moves: Move[] = [start, decision('Vollständig?'), end('Gebucht'), open];
  const stored = toStored(moves) as Record<string, unknown>[];
  assert.equal(stored[3]['zug'], 'offen');
  assert.deepEqual(fromStored(stored), moves);
});

test('AK7 on a subprocess level and in the flow of something at any time', () => {
  for (const opts of [{ inner: { name: 'Prüfen' } }, { inner: { name: 'Storno', trigger: { subtype: 'message' as const } } }] satisfies TellOptions[]) {
    const moves: Move[] = [task('Lesen'), decision('Ok?'), end('Gut'), end('Schlecht')];
    const out = added(moves, 1, decision('Ok?', ['halb']), opts);
    assert.deepEqual(out, [task('Lesen'), decision('Ok?', ['halb']), end('Gut'), open, end('Schlecht')]);
    const r = tellOpen(out, 3, task('Nacharbeiten'), 'de', opts);
    assert.ok('moves' in r);
    assert.deepEqual(r.moves.slice(3, 5), [task('Nacharbeiten'), open]);
  }
});

test('Risk: a merge on an open path whose other paths end does not swallow later moves', () => {
  // A path is open, the story goes on afterwards on another path: telling a merge there would
  // open a continuation that swallows the moves of the outer otherwise path - refused unless kept open.
  const moves: Move[] = [start, decision('A?'), decision('B?'), end('1'), end('2'), task('Sonst'), end('3')];
  const out = added(moves, 2, decision('B?', ['halb']));
  const at = out.findIndex((m) => m.move === 'openPath');
  const r = told(out, at, merge);
  // Kept consistent: the continuation stays open behind the merge, the outer path keeps its moves.
  assert.deepEqual(r.moves.slice(at, at + 3), [merge, end('2'), open]);
  assert.equal(r.at, at + 2);
  assert.deepEqual(r.moves.slice(-2), [task('Sonst'), end('3')]);
});

test('AK5 tellOpen: a move that would not tell there is refused with the reason, nothing changes', () => {
  const moves = WITH_OPEN();
  const at = moves.findIndex((m) => m.move === 'openPath');
  // "Stop everything" where nothing runs alongside: the replay fails, tellOpen refuses with its message.
  const r = tellOpen(moves, at, { move: 'end', text: 'Abbruch', subtype: 'cancel' }, 'de');
  assert.ok('error' in r);
  assert.match(r.error, /Alles abbrechen/);
  // A merge on a path that runs alongside a step (exception, step keeps running) cannot merge.
  const along: Move[] = [start, task('Liefern'), { move: 'exceptionPath', text: '3 Tage', subtype: 'deadline', keepsRunning: 'yes' }, open, task('Abrechnen'), end('Fertig')];
  assert.deepEqual(tell(along, 'de').errors, []);
  const m = tellOpen(along, 3, merge, 'de');
  assert.ok('error' in m);
  assert.match(m.error, /muss mit einem Ende aufhören/);
});
