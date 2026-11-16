// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
// Job 385: the approval state in the working file (src/core/approval.ts) and on the reading copy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tell, run, emptyProcess, fromBpmn, readApproval, toStoredApproval, renderBoth } from '../../src/core/index.js';
import type { Approval, Move } from '../../src/core/index.js';
import { readingCopyTexts } from '../../src/core/render.js';

const MOVES: Move[] = [
  { move: 'start', text: 'Rechnung geht ein', role: 'Buchhaltung' },
  { move: 'task', text: 'Rechnung prüfen', role: 'Buchhaltung' },
  { move: 'end', text: 'Bezahlt' },
];

const APPROVAL: Approval = {
  state: 'review',
  owner: { uid: 'petra', name: 'Petra Lehmann' },
  author: { uid: 'jonas', name: 'Jonas Weber' },
  request: { date: '2026-11-11T14:10:00.000Z', by: { uid: 'jonas', name: 'Jonas Weber' } },
  valid: {
    number: 2,
    date: '2026-09-03T10:00:00.000Z',
    by: { uid: 'petra', name: 'Petra Lehmann' },
    language: 'de',
    moves: MOVES,
    previous: { number: 1, date: '2026-06-12T10:00:00.000Z' },
  },
  decided: ['17', '23'],
  tag: false,
};

async function workingFile(approval?: Approval) {
  const g = tell(MOVES, 'de');
  const e = await run({ ir: { ...emptyProcess('P', g.ir.name, 'de'), story: MOVES, ...(approval ? { approval } : {}) }, ops: g.ops });
  return e.xml!;
}

test('385 AK1 the approval state is saved in the working file and read back unchanged', async () => {
  const xml = await workingFile(APPROVAL);
  assert.match(xml, /xmlns:s2b="urn:story2bpmn:freigabe"/);
  assert.match(xml, /s2b:freigabe="/);
  const r = await fromBpmn(xml);
  assert.deepEqual(r.ir.approval, APPROVAL);
  assert.equal(r.approvalUnreadable, undefined);
  // The stored keys are German like the story format.
  const stored = toStoredApproval(APPROVAL) as Record<string, any>;
  assert.equal(stored.status, 'zurFreigabe');
  assert.equal(stored['gueltig']['geschichte'][0]['zug'], 'start');
  assert.equal(stored['verantwortlich'].uid, 'petra');
});

test('385 AK1 without the attribute there is no approval state', async () => {
  const r = await fromBpmn(await workingFile());
  assert.equal(r.ir.approval, undefined);
  assert.equal(r.approvalUnreadable, undefined);
  assert.deepEqual(readApproval(undefined), {});
});

test('385 AK1 broken approval data is left out, the story still loads', async () => {
  const good = JSON.stringify(toStoredApproval(APPROVAL));
  const bad = [
    'not json',
    '[]',
    JSON.stringify({ status: 'irgendwas' }),
    JSON.stringify({ status: 'gueltig' }),
    JSON.stringify({ status: 'zurFreigabe' }),
    good.replace('"Petra Lehmann"', JSON.stringify('x'.repeat(201))),
    good.replace('"schlagwort":false', '"schlagwort":"ja"'),
    JSON.stringify({ ...JSON.parse(good), ['entschieden']: Array.from({ length: 1001 }, (_, i) => String(i)) }),
    JSON.stringify({ ...JSON.parse(good), ['gueltig']: { ...JSON.parse(good)['gueltig'], ['geschichte']: Array.from({ length: 2001 }, () => ({ ['zug']: 'schritt' })) } }),
    JSON.stringify({ ...JSON.parse(good), ['gueltig']: { ...JSON.parse(good)['gueltig'], ['nummer']: 0 } }),
    JSON.stringify({ ...JSON.parse(good), ['gueltig']: { ...JSON.parse(good)['gueltig'], ['sprache']: 'fr' } }),
    JSON.stringify({ ...JSON.parse(good), ['bitte']: { ['datum']: 'kein Datum', ['von']: { uid: 'a', name: 'b' } } }),
  ];
  for (const raw of bad) assert.deepEqual(readApproval(raw), { unreadable: true }, raw.slice(0, 80));
  // Too large: refused before parsing.
  assert.deepEqual(readApproval('x'.repeat(1024 * 1024 + 1)), { unreadable: true });

  const xml = (await workingFile(APPROVAL)).replace(/s2b:freigabe="[^"]*"/, 's2b:freigabe="{kaputt"');
  const r = await fromBpmn(xml);
  assert.equal(r.ir.approval, undefined);
  assert.equal(r.approvalUnreadable, true);
  assert.equal((r.ir.story as unknown[]).length, 3);
});

test('385 risk: a foreign file with 1.9 MB of approval data is refused quickly', () => {
  const big = JSON.stringify({ ...toStoredApproval(APPROVAL), filler: 'x'.repeat(1_900_000) });
  const t0 = Date.now();
  assert.deepEqual(readApproval(big), { unreadable: true });
  assert.ok(Date.now() - t0 < 200);
});

test('385 AK8 head and foot of the reading copy name the approval state (DE and EN)', () => {
  const today = '12.11.2026';
  // Without an approval state: the old texts.
  assert.deepEqual(readingCopyTexts('de', undefined, today), { status: 'Stand 12.11.2026', verdict: '', file: 'arbeitsdatei.bpmn' });
  // Draft without a valid version.
  assert.deepEqual(readingCopyTexts('de', { file: 'Rechnung.bpmn' }, today), { status: 'Entwurf · Stand 12.11.2026', verdict: 'Nicht freigegeben.', file: 'Rechnung.bpmn' });
  // Draft while version 2 applies.
  assert.equal(readingCopyTexts('de', { lastValid: { number: 2, date: '2026-09-03T10:00:00Z' } }, today).verdict, 'Nicht freigegeben. Gültig ist Version 2 vom 03.09.2026.');
  // Valid version 3, replacing 2.
  const v = readingCopyTexts('de', { valid: { number: 3, date: '2026-11-11T10:00:00Z', by: 'Petra Lehmann', previous: { number: 2, date: '2026-09-03T10:00:00Z' } }, file: 'Rechnung.bpmn' }, today);
  assert.equal(v.status, 'Gültige Version 3 · freigegeben am 11.11.2026 von Petra Lehmann');
  assert.equal(v.verdict, 'Gültige Version 3 · ersetzt Version 2 vom 03.09.2026.');
  assert.equal(readingCopyTexts('de', { valid: { number: 1, date: '2026-11-11T10:00:00Z', by: 'P' } }, today).verdict, 'Gültige Version 1.');
  // English
  const e = readingCopyTexts('en', { valid: { number: 3, date: '2026-11-11T10:00:00Z', by: 'Petra', previous: { number: 2, date: '2026-09-03T10:00:00Z' } } }, '12/11/2026');
  assert.equal(e.status, 'Valid version 3 · approved on 11/11/2026 by Petra');
  assert.equal(e.verdict, 'Valid version 3 · replaces version 2 of 03/09/2026.');
  assert.equal(readingCopyTexts('en', { lastValid: { number: 2, date: '2026-09-03T10:00:00Z' } }, '').verdict, 'Not approved. Valid is version 2 of 03/09/2026.');
  assert.equal(readingCopyTexts('en', {}, '12/11/2026').status, 'Draft · As of 12/11/2026');
});

test('385 AK8 DRAFT is missing only on a valid version once there is an approval state', async () => {
  const g = tell(MOVES, 'de');
  const e = await run({ ir: { ...emptyProcess('P', g.ir.name, 'de'), story: MOVES }, ops: g.ops });
  assert.equal(e.readingCopy, true);
  const old = await renderBoth(e.ir, e.positions, true);
  assert.doesNotMatch(old.svg, />ENTWURF</, 'without an approval state as before');
  const draft = await renderBoth(e.ir, e.positions, true, undefined, { file: 'a.bpmn' });
  assert.match(draft.svg, />ENTWURF</);
  const valid = await renderBoth(e.ir, e.positions, true, undefined, { valid: { number: 1, date: '2026-11-11T10:00:00Z', by: 'Petra' }, file: 'a.bpmn' });
  assert.doesNotMatch(valid.svg, />ENTWURF</);
  // Open points stay a draft even on a "valid" state.
  const open = await renderBoth(e.ir, e.positions, false, undefined, { valid: { number: 1, date: '2026-11-11T10:00:00Z', by: 'Petra' } });
  assert.match(open.svg, />ENTWURF</);
  const { PDFDocument } = await import('pdf-lib');
  assert.ok((await PDFDocument.load(valid.pdf)).getPageCount() >= 1);
});
