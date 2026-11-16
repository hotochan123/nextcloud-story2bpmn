// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
// Job 432: the approval state counts only as far as Nextcloud's comments confirm it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Move, Approval } from '../../src/core/index.js';
import { sha256, approvalCode, storyJson } from '../../src/core/index.js';
import {
	confirmApproval, parseApproved, requestedOf, approvedComment, askComment, approved, approveSteps, pills, can, requested,
} from '../../src/approval.js';
import type { Comment } from '../../src/approval.js';
import { copyState, fileXml, loadStory } from '../../src/workbench.js';

const V2: Move[] = [
	{ move: 'start', text: 'Rechnung geht ein', role: 'Buchhaltung' },
	{ move: 'task', text: 'Rechnung prüfen', role: 'Buchhaltung', system: 'ERP' },
	{ move: 'end', text: 'Bezahlt' },
] as Move[];
const PETRA = { uid: 'petra', name: 'Petra Lehmann' };
const JONAS = { uid: 'jonas', name: 'Jonas Weber' };
const BOB = { uid: 'bob', name: 'Bob' };
const NOW = '2026-11-14T10:00:00.000Z';

const valid = (extra: Partial<Approval> = {}, by = PETRA, number = 2): Approval => ({
	state: 'valid', owner: PETRA, author: JONAS, decided: [], tag: true,
	valid: { number, date: '2026-09-03T10:00:00.000Z', by, language: 'de', moves: V2 },
	...extra,
});
let next = 1;
const c = (actor: { uid: string; name: string }, message: string, mentions: { uid: string; name: string }[] = []): Comment =>
	({ id: String(next++), message, actorId: actor.uid, actorName: actor.name, date: NOW, mentions });
const ask = (by = JONAS, owner = PETRA) => c(by, askComment(owner.uid, 'Rechnung', '', 'de'), [{ uid: owner.uid, name: 'Petra (server)' }]);
const approval = (by = PETRA, n = 2, moves = V2, language: 'de' | 'en' = 'de') => c({ ...by, name: by.name + ' (server)' }, approvedComment(JONAS.uid, n, language, approvalCode(n, language, moves)));

test('432 AK1 sha256 is SHA-256 of the UTF-8 text', () => {
	for (const s of ['', 'abc', 'Ä„Müller & Söhne“ <50 € 😀 \\ / "', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'y'.repeat(100000)])
		assert.equal(sha256(s), createHash('sha256').update(s, 'utf8').digest('hex'))
})

test('432 AK1 the check code survives saving and reading the file, and matches the PHP side', async () => {
	const xml = readFileSync('tests/core/fixtures/approved-v3.bpmn', 'utf8')
	const g = await loadStory(xml, 'de')
	assert.ok(!('errors' in g))
	if ('errors' in g) return
	const v = g.approval!.valid!
	// tests/Unit/Service/ApprovalCheckTest.php expects the same code for this file.
	assert.equal(approvalCode(v.number, v.language, v.moves), '1b9227723fa6df9a')
	assert.equal(approvalCode(3, g.language, g.moves), '1b9227723fa6df9a')
	// What the file holds as story text is what the code covers.
	assert.ok(xml.includes('bpmnc:geschichte='))
	const again = await loadStory((await fileXml(g.moves, g.language, g.approval))!, 'de')
	if ('errors' in again) assert.fail('reread')
	assert.equal(approvalCode(again.approval!.valid!.number, again.approval!.valid!.language, again.approval!.valid!.moves), '1b9227723fa6df9a')
	assert.equal(storyJson(again.moves), storyJson(g.moves))
})

test('432 AK2 a forged valid version without comments counts as a draft', () => {
	const forged = valid({ owner: BOB }, { uid: 'alice', name: 'Alice Chefin' }, 9)
	const r = confirmApproval(forged, [c(BOB, 'Sieht gut aus')])
	assert.equal(r.unconfirmed, true)
	assert.equal(r.approval!.state, 'draft')
	assert.equal(r.approval!.valid, undefined)
	assert.equal(r.approval!.owner, undefined)
	const base = { done: true, issues: 0, moves: V2, language: 'de' as const }
	assert.deepEqual(pills({ ...base, approval: r.approval }), [{ kind: 'done' }])
	const rights = can({ approval: r.approval, me: BOB, ready: true, canSave: true, hasFile: true, moves: V2, language: 'de' })
	assert.equal(rights.approve, false)
	assert.equal(rights.decide, false)
	assert.equal(copyState(r.approval, V2, 'de').valid, undefined)
	// Raw, the file would have given bob everything.
	assert.equal(can({ approval: forged, me: BOB, ready: true, canSave: true, hasFile: true, moves: [], language: 'de' }).decide, true)
})

test('432 AK3 a confirmed approval: names from the server, rights for the process owner', () => {
	const r = confirmApproval(valid({}, { uid: 'petra', name: 'Name aus der Datei' }), (() => { const q = ask(); return [approval(), q] })())
	assert.equal(r.unconfirmed, false)
	assert.equal(r.approval!.state, 'valid')
	assert.equal(r.approval!.valid!.by.name, 'Petra Lehmann (server)')
	assert.equal(r.approval!.owner!.name, 'Petra (server)')
	assert.equal(can({ approval: r.approval, me: PETRA, ready: true, canSave: true, hasFile: true, moves: V2, language: 'de' }).decide, true)
	assert.equal(copyState(r.approval, V2, 'de').valid!.by, 'Petra Lehmann (server)')
	assert.deepEqual(pills({ done: true, issues: 0, moves: V2, language: 'de', approval: r.approval }), [{ kind: 'valid', number: 2 }])
})

test('432 AK4 what does not confirm', () => {
	const a = valid()
	const cases: [string, Comment[]][] = [
		['other moves', [ask(), approval(PETRA, 2, [...V2.slice(0, 2), { move: 'end', text: 'Anders' } as Move])]],
		['other language', [ask(), approval(PETRA, 2, V2, 'en')]],
		['other number', [ask(), approval(PETRA, 3)]],
		['approval by another account', [ask(), approval(BOB)]],
		['request only by the approver', [ask(PETRA, PETRA), approval()]],
		['request after the approval', (() => { const ap = approval(); return [ap, ask()] })()],
		['no request', [approval()]],
		['other form', [ask(), c(PETRA, 'Freigegeben!')]],
	]
	for (const [name, comments] of cases) {
		const r = confirmApproval(a, comments)
		assert.equal(r.approval!.valid, undefined, name)
		assert.equal(r.unconfirmed, true, name)
	}
	// "For approval" with a request older than the approval: the valid version stays, the request is gone.
	const old = ask()
	const ap = approval()
	const review = { ...requested(valid(), PETRA, JONAS, NOW, true) }
	const r = confirmApproval(review, [ap, old])
	assert.equal(r.approval!.state, 'valid')
	assert.equal(r.approval!.request, undefined)
	assert.equal(r.unconfirmed, true)
	// A newer request: for approval, asked by the account that wrote it.
	const fresh = ask()
	const r2 = confirmApproval(review, [fresh, ap, old])
	assert.equal(r2.approval!.state, 'review')
	assert.equal(r2.approval!.request!.by.name, 'Jonas Weber')
	assert.equal(r2.unconfirmed, false)
	// The owner named only by herself does not count.
	const self = confirmApproval({ ...valid(), valid: undefined, state: 'draft', owner: BOB }, [ask(BOB, BOB)])
	assert.equal(self.approval!.owner, undefined)
	assert.equal(self.unconfirmed, true)
	assert.deepEqual(confirmApproval(null, []), { approval: null, unconfirmed: false })
})

test('432 AK5 approval comments read back, German and English', () => {
	const de = approvedComment('jonas', 3, 'de', '0123456789abcdef')
	assert.equal(de, '@"jonas" Als Gültige Version 3 freigegeben.\nPrüfkennung: 0123456789abcdef')
	assert.deepEqual(parseApproved(de), { number: 3, code: '0123456789abcdef' })
	assert.deepEqual(parseApproved(approvedComment(undefined, 12, 'en', 'ffffffffffffffff')), { number: 12, code: 'ffffffffffffffff' })
	assert.deepEqual(parseApproved('Approved as valid version 1.\r\nCheck code: 0123456789abcdef'), { number: 1, code: '0123456789abcdef' })
	for (const m of ['Als Gültige Version 3 freigegeben.', 'x Als Gültige Version 3 freigegeben.\nPrüfkennung: 0123456789abcdef', 'Als Gültige Version 3 freigegeben.\nPrüfkennung: 0123', 42, 'A'.repeat(3000)])
		assert.equal(parseApproved(m), null, String(m).slice(0, 40))
	assert.equal(requestedOf(askComment('petra', 'P', 'note', 'de')), 'petra')
	assert.equal(requestedOf(askComment('petra', 'P', '', 'en')), 'petra')
	assert.equal(requestedOf('@"petra" hallo'), null)
})

test('432 AK6 approving: number given, previous only from the confirmed version, comment before the reading copy', () => {
	const confirmed = confirmApproval(valid(), [ask(), approval()]).approval!
	const a = approved({ ...valid({ state: 'review' }), valid: confirmed.valid }, PETRA, V2, 'de', NOW, 5)
	assert.equal(a.valid!.number, 5)
	assert.deepEqual(a.valid!.previous, { number: 2, date: '2026-09-03T10:00:00.000Z' })
	const b = approved({ ...valid({ state: 'review' }), valid: undefined }, PETRA, V2, 'de', NOW, 3)
	assert.equal(b.valid!.number, 3)
	assert.equal(b.valid!.previous, undefined)
	const step = (name: string) => ({ name, run: async () => {} })
	assert.deepEqual(approveSteps({ pdf: step('pdf'), version: step('version'), comment: step('comment') }).map((s) => s.name), ['version', 'comment', 'pdf'])
})
