// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
// Job 450 (Soothing 4): the pure parts of the approval sidebar and the comparison in the dialog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Move, Approval } from '../../src/core/index.js';
import { tell } from '../../src/core/index.js';
import {
	decidedProposals, parseDecision, approvalHistory, versionChip, diffRows, compareLines, validLines, currentLines,
	proposalText, labelOf, quoteOf, decisionComment, askComment, approvedComment, decided,
} from '../../src/approval.js';
import type { Comment } from '../../src/approval.js';

const V2: Move[] = [
	{ move: 'start', text: 'Rechnung geht ein', role: 'Buchhaltung' },
	{ move: 'task', text: 'Rechnung prüfen', role: 'Buchhaltung', system: 'ERP' },
	{ move: 'task', text: 'Zahlung genehmigen', role: 'Leitung' },
	{ move: 'end', text: 'Bezahlt' },
] as Move[];
const NOW = '2026-11-14T10:00:00.000Z';
const valid = (extra: Partial<Approval> = {}): Approval => ({
	state: 'valid', owner: { uid: 'bea', name: 'Bea' }, decided: [], tag: true,
	valid: { number: 2, date: NOW, by: { uid: 'bea', name: 'Bea' }, language: 'de', moves: V2 },
	...extra,
});
const c = (id: number, actor: string, message: string, mentions: { uid: string; name: string }[] = []): Comment =>
	({ id: String(id), message, actorId: actor, actorName: actor.toUpperCase(), date: NOW, mentions });

test('450 AK1 decided proposals carry the decision of the matching decision comment', () => {
	const a = valid()
	const lines = validLines(a)
	const p2 = { version: 2, line: 2, label: labelOf(lines[1]), kind: 'change' as const, text: 'x soll y.' }
	const p3 = { version: 2, line: 3, label: labelOf(lines[2]), kind: 'remark' as const, why: 'Frist?' }
	const p1old = { version: 1, line: 2, label: labelOf(lines[1]), kind: 'remark' as const, why: 'alt' }
	const comments = [
		c(1, 'jonas', proposalText(p2, 'de')),
		c(2, 'lena', proposalText(p3, 'de')),
		c(3, 'lena', proposalText(p2, 'en')),
		c(4, 'sam', proposalText(p1old, 'de')),
		c(5, 'bea', decisionComment('rejected', 2, quoteOf(p2.label, lines[1]), 'de')),
		c(6, 'bea', decisionComment('done', 3, quoteOf(p3.label, lines[2]), 'en')),
	]
	const a2 = decided(decided(decided(decided(a, '1'), '2'), '4'), '99')
	const r = decidedProposals(comments, a2)
	assert.deepEqual(r.map((p) => [p.id, p.decision]), [['2', 'done'], ['1', 'rejected']])
	assert.equal(r[1].actorName, 'JONAS')
	// Proposal 3 is open: not in the list. A decision comment written before the proposal does not count.
	const before = [c(10, 'bea', decisionComment('accepted', 2, quoteOf(p2.label, lines[1]), 'de')), c(11, 'jonas', proposalText(p2, 'de'))]
	assert.deepEqual(decidedProposals(before, decided(a, '11')).map((p) => p.decision), [null])
	// A decision on another line or with another quote does not match.
	const other = [c(20, 'jonas', proposalText(p2, 'de')), c(21, 'bea', decisionComment('accepted', 3, quoteOf(p2.label, lines[1]), 'de')), c(22, 'bea', decisionComment('accepted', 2, 'anderes', 'de'))]
	assert.deepEqual(decidedProposals(other, decided(a, '20')).map((p) => p.decision), [null])
	// Two proposals on the same line: each decision is used once, in the order of the decisions
	const twin = [c(30, 'jonas', proposalText(p2, 'de')), c(31, 'lena', proposalText(p2, 'de')),
		c(32, 'bea', decisionComment('rejected', 2, quoteOf(p2.label, lines[1]), 'de')), c(33, 'bea', decisionComment('accepted', 2, quoteOf(p2.label, lines[1]), 'de'))]
	assert.deepEqual(decidedProposals(twin, decided(decided(a, '31'), '30')).map((p) => [p.id, p.decision]), [['31', 'rejected'], ['30', 'accepted']])
	assert.deepEqual(decidedProposals(comments, null), [])
	assert.deepEqual(decidedProposals(comments, { ...a2, valid: undefined }), [])
	assert.deepEqual(parseDecision(decisionComment('accepted', 5, 'Ware prüfen', 'en')), { kind: 'accepted', line: 5, quote: 'Ware prüfen' })
	assert.equal(parseDecision('Angenommen: alles'), null)
	assert.equal(parseDecision(42), null)
})

test('450 AK2 approval history: requests and approvals newest first, forged ones left out', () => {
	const bea = [{ uid: 'bea', name: 'Bea Kranz' }]
	const comments = [
		c(1, 'anna', askComment('bea', 'Rechnung', '', 'de'), bea),
		c(2, 'bea', approvedComment('anna', 1, 'de', '0123456789abcdef')),
		c(3, 'mallory', approvedComment('anna', 9, 'en', '0123456789abcdef')),
		c(4, 'mallory', askComment('mallory', 'Rechnung', 'selbst', 'de')),
		c(5, 'anna', askComment('bea', 'Rechnung', 'Frist <img src=x onerror=alert(1)> angepasst.\nZweite Zeile', 'de'), bea),
	]
	const review = valid({ state: 'review', request: { date: NOW, by: { uid: 'anna', name: 'Anna' } } })
	const h = approvalHistory(comments, review)
	assert.deepEqual(h.map((e) => [e.kind, e.id]), [['request', '5'], ['approved', '2'], ['request', '1']])
	const [open, granted, old] = h
	assert.ok(open.kind === 'request' && open.open && open.owner === 'Bea Kranz' && open.by === 'ANNA')
	assert.ok(open.kind === 'request' && open.note === 'Frist <img src=x onerror=alert(1)> angepasst.\nZweite Zeile')
	assert.ok(granted.kind === 'approved' && granted.number === 1 && granted.by === 'BEA')
	assert.ok(old.kind === 'request' && !old.open && old.note === '')
	// Not waiting for approval: no request is open.
	assert.ok(approvalHistory(comments, valid()).every((e) => e.kind !== 'request' || !e.open))
	assert.deepEqual(approvalHistory([], null), [])
	// An approval comment by an account nobody asked does not appear.
	assert.deepEqual(approvalHistory([c(1, 'bea', approvedComment('anna', 1, 'de', '0123456789abcdef'))], null), [])
})

test('450 AK3 comparison rows number lines as the story does', () => {
	const a = valid()
	const now: Move[] = [
		V2[0],
		{ move: 'task', text: 'Rechnung prüfen', role: 'Buchhaltung', system: 'ERP', deadline: '5 Arbeitstage' },
		{ move: 'task', text: 'Zahlung im ERP vermerken', role: 'Leitung' },
		V2[3],
	] as Move[]
	const storyText = tell(now, 'de').storyText
	const diff = compareLines(validLines(a), currentLines({ moves: now, storyText }))
	const rows = diffRows(diff, storyText)
	assert.deepEqual(rows.map((r) => [r.kind, r.number]), [['changed', '2'], ['changed', '3']])
	assert.match(rows[0].old!, /Rechnung prüfen/)
	assert.match(rows[0].text, /5 Arbeitstage/)
	const removed = diffRows(compareLines(validLines(a), currentLines({ moves: [V2[0], V2[1], V2[3]], storyText: tell([V2[0], V2[1], V2[3]], 'de').storyText })), tell([V2[0], V2[1], V2[3]], 'de').storyText)
	assert.deepEqual(removed.map((r) => [r.kind, r.number]), [['removed', '–']])
	assert.match(removed[0].text, /Zahlung genehmigen/)
	const added = [V2[0], V2[1], V2[2], { move: 'task', text: 'Zahlen', role: 'Buchhaltung' }, V2[3]] as Move[]
	const st = tell(added, 'de').storyText
	const rowsNew = diffRows(compareLines(validLines(a), currentLines({ moves: added, storyText: st })), st)
	assert.deepEqual(rowsNew.map((r) => [r.kind, r.number]), [['new', '4']])
	assert.equal(diffRows(compareLines(validLines(a), validLines(a)), tell(V2, 'de').storyText).length, 0)
	assert.equal(diffRows(compareLines(validLines(a), validLines(a)), tell(V2, 'de').storyText, true).length, validLines(a).length)
	// A path heading has no number.
	const branch = [V2[0], { move: 'decision', text: 'Betrag hoch', paths: ['ja', 'nein'] }] as unknown as Move[]
	const bt = tell(branch, 'de').storyText
	const heads = diffRows(compareLines([], currentLines({ moves: branch, storyText: bt })), bt)
	const numbers = bt.map((l) => (l.move === undefined ? '' : String(l.move + 1)))
	assert.deepEqual(heads.map((r) => r.number), numbers)
})

test('450 AK4 the chip of a named version follows its label', () => {
	assert.equal(versionChip('Gültige Version 2', 2), 'ok')
	assert.equal(versionChip('Valid version 2', 2), 'ok')
	assert.equal(versionChip('Gültige Version 1', 2), 'plain')
	assert.equal(versionChip('Valid version 3', null), 'plain')
	assert.equal(versionChip('Zur Freigabe 14.11.2026', 2), 'closed')
	assert.equal(versionChip('For approval 11/14/2026', 2), 'closed')
	assert.equal(versionChip('Gültige Version 2 (alt)', 2), 'closed')
})
