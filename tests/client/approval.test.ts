// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
// Job 385: approval through Nextcloud, the pure logic of src/approval.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Move, Approval } from '../../src/core/index.js';
import { tell } from '../../src/core/index.js';
import {
	pills, can, isValidState, changedSinceValid, requested, withdrawn, approved, decided,
	compareLines, diffCounts, storyLines, validLines, proposalText, parseProposal, openProposals, labelOf,
	applyToText, applyProposal, checkProposal, runSteps, versionOf, mention, askComment, validLineOf,
	reviewLabel, validLabel, tagName, changeWithdraws, approvalAction, shareOffer, editShareRequest, readShare, shareRole, rightsOf, overwriteApproval,
	decisionButtons,
} from '../../src/approval.js';
import { copyState, fileXml, loadStory } from '../../src/workbench.js';
import { ownerCompares, currentLines } from '../../src/approval.js';

// Valid version 2 of the invoice process (design handoff 1d) and the state with three changes.
const V2: Move[] = [
	{ move: 'start', text: 'Rechnung geht ein', role: 'Buchhaltung' },
	{ move: 'task', text: 'Rechnung prüfen', role: 'Buchhaltung', system: 'ERP', deadline: '3 Arbeitstage' },
	{ move: 'task', text: 'Zahlung genehmigen', role: 'Leitung' },
	{ move: 'task', text: 'Rechnung bezahlen', role: 'Buchhaltung' },
	{ move: 'end', text: 'Bezahlt' },
] as Move[];
const V3: Move[] = [
	V2[0],
	{ move: 'task', text: 'Rechnung sachlich prüfen', role: 'Buchhaltung', system: 'ERP' },
	{ move: 'task', text: 'Rechnung rechnerisch prüfen', role: 'Buchhaltung', system: 'ERP', deadline: '3 Arbeitstage' },
	{ move: 'task', text: 'Zahlung genehmigen', role: 'Leitung', deadline: '2 Arbeitstage' },
	V2[3],
	V2[4],
] as Move[];

const PETRA = { uid: 'petra', name: 'Petra Lehmann' };
const JONAS = { uid: 'jonas', name: 'Jonas Weber' };
const SAM = { uid: 'sam', name: 'Sam Öztürk' };
const NOW = '2026-11-11T14:10:00.000Z';

const valid = (moves: Move[] = V2, extra: Partial<Approval> = {}): Approval => ({
	state: 'valid', owner: PETRA, author: JONAS, decided: [], tag: true,
	valid: { number: 2, date: '2026-09-03T10:00:00.000Z', by: PETRA, language: 'de', moves },
	...extra,
});

test('385 AK2 status pills: at most two, state first', () => {
	const base = { done: true, issues: 0, moves: V2, language: 'de' as const }
	assert.deepEqual(pills({ ...base, done: false }), [{ kind: 'draft' }])
	assert.deepEqual(pills({ ...base }), [{ kind: 'done' }])
	assert.deepEqual(pills({ ...base, issues: 2 }), [{ kind: 'open', count: 2 }])
	const review = requested(null, PETRA, JONAS, NOW, true)
	assert.deepEqual(pills({ ...base, approval: review }), [{ kind: 'review', owner: 'Petra Lehmann' }])
	assert.deepEqual(pills({ ...base, approval: valid() }), [{ kind: 'valid', number: 2 }])
	assert.deepEqual(pills({ ...base, approval: valid(), proposals: 2 }), [{ kind: 'valid', number: 2 }, { kind: 'proposals', count: 2 }])
	assert.deepEqual(pills({ ...base, moves: V3, approval: valid(), proposals: 2 }), [{ kind: 'valid', number: 2 }, { kind: 'changed', number: 2 }])
	assert.deepEqual(pills({ ...base, moves: V3, issues: 1, approval: valid() }), [{ kind: 'valid', number: 2 }, { kind: 'open', count: 1 }])
	for (const p of [pills({ ...base, moves: V3, approval: valid(), proposals: 4 })]) assert.ok(p.length <= 2)
})

test('385 AK2 valid state: same moves and language as the valid version', () => {
	assert.ok(isValidState(valid(), V2, 'de'))
	assert.ok(!isValidState(valid(), V2, 'en'))
	assert.ok(!isValidState(valid(), V3, 'de'))
	assert.ok(changedSinceValid(valid(), V3, 'de'))
	assert.ok(!changedSinceValid(null, V3, 'de'))
})

test('385 AK3 comparison with valid version 2: 1 new, 2 changed; only changes filters', () => {
	const d = compareLines(storyLines(V2, 'de'), storyLines(V3, 'de'))
	assert.deepEqual(diffCounts(d), { new: 1, changed: 2, removed: 0 })
	const changed = d.filter((x) => x.kind === 'changed')
	assert.match((changed[0] as { old: string }).old, /Rechnung prüfen/)
	assert.match(changed[0].kind === 'changed' ? changed[0].text : '', /Rechnung sachlich prüfen/)
	assert.match((changed[1] as { old: string }).old, /\[@Leitung\] soll \[Zahlung genehmigen\]\.$/)
	assert.equal(d.filter((x) => x.kind !== 'same').length, 3)
	// Removed lines: a line taken out.
	const r = compareLines(['a', 'b', 'c'], ['a', 'c'])
	assert.deepEqual(r.map((x) => x.kind), ['same', 'removed', 'same'])
	assert.deepEqual(compareLines(['a'], ['a', 'b']).map((x) => x.kind), ['same', 'new'])
	// Indentation does not count.
	assert.deepEqual(compareLines(['  a'], ['a']).map((x) => x.kind), ['same'])
})

test('385 AK4 a proposal comment round trip, German and English', () => {
	for (const language of ['de', 'en'] as const) {
		for (const kind of ['change', 'insert', 'remove', 'remark'] as const) {
			const p = { version: 3, line: 3, label: 'Rechnung rechnerisch prüfen', kind, ...(kind === 'change' || kind === 'insert' ? { text: '[@Buchhaltung] soll [Rechnung rechnerisch prüfen], Frist [!2 Arbeitstage].' } : {}), why: 'Nach der Teilung reichen 3 Tage nicht.\nZweite Zeile.' }
			assert.deepEqual(parseProposal(proposalText(p, language)), p, `${language} ${kind}`)
		}
	}
	assert.equal(proposalText({ version: 3, line: 3, label: 'Rechnung rechnerisch prüfen', kind: 'change', text: 'x' }, 'de').split('\n')[0], 'Vorschlag zu Gültige Version 3, Zeile 3 [Rechnung rechnerisch prüfen]')
	assert.equal(parseProposal('Just a remark'), null)
	assert.equal(parseProposal('Vorschlag zu Gültige Version 3, Zeile 3 [x]\nArt: Zeile ändern'), null, 'change without new wording')
	assert.equal(parseProposal('Vorschlag zu Gültige Version 3, Zeile 3 [x]\nArt: irgendwas'), null)
	assert.equal(parseProposal(42), null)
	assert.equal(labelOf('[@Buchhaltung] soll [Rechnung prüfen].'), 'Rechnung prüfen')
	assert.equal(labelOf('WENN [?Betrag über 5000 €]'), 'Betrag über 5000 €')
	assert.equal(labelOf('ZUSAMMEN.'), '')
})

test('385 AK4 open proposals: version, line and label must match, decided ones drop out', () => {
	const a = valid()
	const lines = validLines(a)
	const label = labelOf(lines[1])
	const ok = proposalText({ version: 2, line: 2, label, kind: 'remark', why: 'Frist?' }, 'de')
	const comments = [
		{ id: '1', message: ok, actorId: 'sam', actorName: 'Sam', date: NOW },
		{ id: '2', message: proposalText({ version: 1, line: 2, label, kind: 'remark', why: 'alt' }, 'de'), actorId: 'sam', actorName: 'Sam', date: NOW },
		{ id: '3', message: proposalText({ version: 2, line: 99, label, kind: 'remark', why: 'x' }, 'de'), actorId: 'sam', actorName: 'Sam', date: NOW },
		{ id: '4', message: proposalText({ version: 2, line: 2, label: 'Gefälscht', kind: 'remark', why: 'x' }, 'de'), actorId: 'sam', actorName: 'Sam', date: NOW },
		{ id: '5', message: 'Gute Arbeit!', actorId: 'sam', actorName: 'Sam', date: NOW },
		{ id: '6', message: ok, actorId: 'lea', actorName: 'Lea', date: NOW },
	]
	assert.deepEqual(openProposals(comments, a).map((p) => p.id), ['1', '6'])
	assert.deepEqual(openProposals(comments, decided(a, '6')).map((p) => p.id), ['1'])
	assert.deepEqual(openProposals(comments, null), [])
})

test('385 AK5 accepting: change, insert after, remove; a moved line is found by its text', async () => {
	const a = valid()
	const lines = validLines(a)
	const n = 3 // the line of the approval task (role Leitung)
	const label = labelOf(lines[n - 1])
	const change = { version: 2, line: n, label, kind: 'change' as const, text: '[@Leitung] soll [Zahlung genehmigen], Frist [!2 Arbeitstage].' }
	const r = await applyProposal(V2, 'de', a, change)
	assert.ok(r.ok)
	assert.equal((r.ok && r.moves[2] as { deadline?: string })?.deadline, '2 Arbeitstage')
	const ins = await applyProposal(V2, 'de', a, { ...change, kind: 'insert', text: '[@Leitung] soll [Zahlung buchen].' })
	assert.ok(ins.ok && ins.moves.length === V2.length + 1 && (ins.moves[3] as { text?: string }).text === 'Zahlung buchen')
	const rem = await applyProposal(V2, 'de', a, { ...change, kind: 'remove', text: undefined })
	assert.ok(rem.ok && rem.moves.length === V2.length - 1)
	// The current state has a new line in front: line 3 of version 2 is now line 4.
	const moved = [V2[0], { move: 'task', text: 'Eingang erfassen', role: 'Buchhaltung' }, ...V2.slice(1)] as Move[]
	const m = await applyProposal(moved, 'de', a, change)
	assert.ok(m.ok && (m.moves[3] as { deadline?: string }).deadline === '2 Arbeitstage' && (m.moves[1] as { text?: string }).text === 'Eingang erfassen')
	// Indentation of the old line is kept.
	assert.deepEqual(applyToText(['a', '  b', 'c'], ['a', 'b', 'c'], 1, { version: 2, line: 2, label: '', kind: 'change', text: 'B' }), ['a', '  B', 'c'])
})

test('385 AK5 a proposal that no longer fits changes nothing', async () => {
	const a = valid()
	const label = labelOf(validLines(a)[2])
	// The line is gone from the current state.
	const gone = V2.filter((_, i) => i !== 2)
	assert.deepEqual(await applyProposal(gone, 'de', a, { version: 2, line: 3, label, kind: 'change', text: '[@Leitung] soll [X].' }), { ok: false, errors: ['no-line'] })
	// The new wording does not read back.
	const bad = await applyProposal(V2, 'de', a, { version: 2, line: 3, label, kind: 'change', text: 'quatsch ohne Sinn' })
	assert.equal(bad.ok, false)
	assert.deepEqual((await checkProposal(a, { version: 2, line: 3, label, kind: 'change', text: 'quatsch ohne Sinn' })).length > 0, true)
	assert.deepEqual(await checkProposal(a, { version: 2, line: 3, label, kind: 'change', text: '[@Leitung] soll [Zahlung genehmigen], Frist [!2 Tage].' }), [])
	assert.deepEqual(await checkProposal(a, { version: 2, line: 3, label, kind: 'remark', why: 'x' }), [])
	assert.deepEqual(await checkProposal(a, { version: 2, line: 3, label, kind: 'insert', text: ' ' }), ['empty'])
})

test('385 AK6 who may do what: ask, approve, propose, decide', () => {
	const base = { me: JONAS, ready: true, canSave: true, hasFile: true, moves: V3, language: 'de' as const }
	assert.deepEqual(can({ ...base, approval: null }), { ask: true, approve: false, propose: false, decide: false })
	assert.equal(can({ ...base, ready: false, approval: null }).ask, false, 'open points or unfinished')
	assert.equal(can({ ...base, canSave: false, approval: null }).ask, false)
	const review = requested(valid(), PETRA, JONAS, NOW, true)
	assert.equal(can({ ...base, approval: review }).ask, false, 'already asked')
	assert.equal(can({ ...base, approval: review }).approve, false, 'only the process owner')
	assert.deepEqual(can({ ...base, me: PETRA, approval: review }), { ask: false, approve: true, propose: false, decide: true })
	assert.equal(can({ ...base, me: PETRA, approval: review, canSave: false }).approve, false, 'owner without the right to edit')
	assert.equal(can({ ...base, me: PETRA, moves: V2, approval: valid() }).approve, false, 'nothing changed since the valid version')
	assert.equal(can({ ...base, me: PETRA, approval: valid() }).approve, true, 'accepted proposals without a request (F1)')
	assert.deepEqual(can({ ...base, me: SAM, canSave: false, approval: valid() }), { ask: false, approve: false, propose: true, decide: false })
	assert.equal(can({ ...base, me: SAM, approval: { ...valid(), valid: undefined, state: 'draft' } }).propose, false, 'no proposals on a draft')
})

test('385 AK6 changes of the approval state: ask, approve, withdraw', () => {
	const r = requested(null, PETRA, JONAS, NOW, false)
	assert.deepEqual(r, { state: 'review', owner: PETRA, author: JONAS, request: { date: NOW, by: JONAS }, decided: [], tag: false })
	const a = approved(r, PETRA, V3, 'de', NOW)
	assert.equal(a.state, 'valid')
	assert.equal(a.request, undefined)
	assert.deepEqual(a.valid, { number: 1, date: NOW, by: PETRA, language: 'de', moves: V3 })
	const b = approved(requested(a, PETRA, SAM, NOW, true), PETRA, V2, 'de', '2026-12-01T00:00:00.000Z')
	assert.equal(b.valid!.number, 2)
	assert.deepEqual(b.valid!.previous, { number: 1, date: NOW })
	assert.equal(b.author!.uid, 'jonas', 'the first author stays')
	assert.equal(withdrawn(requested(null, PETRA, JONAS, NOW, true)).state, 'draft')
	assert.equal(withdrawn(requested(a, PETRA, JONAS, NOW, true)).state, 'valid')
	assert.equal(withdrawn(requested(a, PETRA, JONAS, NOW, true)).request, undefined)
})

test('385 AK6 steps: run in order, a failure stays for "Try again", done ones are not repeated', async () => {
	const calls: string[] = []
	let fail = true
	const steps = [
		{ name: 'version', run: async () => { calls.push('version') } },
		{ name: 'comment', run: async () => { calls.push('comment'); if (fail) throw new Error('down') } },
		{ name: 'pdf', run: async () => { calls.push('pdf') } },
	]
	const done = new Set<string>()
	const r1 = await runSteps(steps, done)
	assert.deepEqual(r1.failed.map((f) => f.name), ['comment'])
	assert.deepEqual(calls, ['version', 'comment', 'pdf'])
	fail = false
	const r2 = await runSteps(steps, done)
	assert.deepEqual(r2.failed, [])
	assert.deepEqual(calls, ['version', 'comment', 'pdf', 'comment'])
})

test('385 risk: the label goes to the version of the save, never a later one', () => {
	const v = [{ id: '1700000000', mtime: 1700000000 }, { id: '1700000500', mtime: 1700000500 }]
	assert.equal(versionOf(v, 1700000000), '1700000000')
	assert.equal(versionOf(v, 1699999999), null)
})

test('385 AK6 texts for Nextcloud: labels, tags, mention', () => {
	assert.equal(reviewLabel(NOW, 'de'), 'Zur Freigabe 11.11.2026')
	assert.equal(reviewLabel(NOW, 'en'), 'For approval 11/11/2026')
	assert.equal(validLabel(3, 'de'), 'Gültige Version 3')
	assert.equal(validLabel(3, 'en'), 'Valid version 3')
	assert.equal(tagName('valid', 'de'), 'Gültig')
	assert.equal(tagName('review', 'en'), 'For approval')
	assert.equal(mention('anna maria@x'), '@"anna maria@x"')
	assert.match(askComment('petra', 'Rechnung', 'Bitte bis 20.11.', 'de'), /^@"petra" Bitte um Freigabe von „Rechnung“\.\n\nBitte bis 20\.11\.$/)
})

test('385 AK7 a proposal is offered only on lines that are in the valid version', () => {
	const a = valid()
	const cur = storyLines(V3, 'de')
	assert.equal(validLineOf(a, cur[0], 0), 0)
	assert.equal(validLineOf(a, cur[1], 1), null, 'changed line')
})

test('385 AK8 reading copy state of a draft and of the valid version', () => {
	assert.deepEqual(copyState(null, V2, 'de', 'a.bpmn'), { file: 'a.bpmn' })
	assert.deepEqual(copyState(valid(), V3, 'de'), { lastValid: { number: 2, date: '2026-09-03T10:00:00.000Z' } })
	assert.deepEqual(copyState(valid(), V2, 'de', 'a.bpmn'), { valid: { number: 2, date: '2026-09-03T10:00:00.000Z', by: 'Petra Lehmann' }, file: 'a.bpmn' })
})

test('385 AK1 loadStory returns the approval state; a valid version that does not replay is dropped', async () => {
	const xml = await fileXml(V3, 'de', valid())
	const g = await loadStory(xml!, 'de')
	assert.ok(!('errors' in g))
	assert.deepEqual(!('errors' in g) && g.approval, valid())
	const broken = await fileXml(V3, 'de', valid([{ move: 'goTo', target: 'nirgends' }] as unknown as Move[]))
	const h = await loadStory(broken!, 'de')
	assert.ok(!('errors' in h) && h.approval === undefined && h.approvalUnreadable === true && h.moves.length === V3.length)
})

test('385 AK7 changing a state waiting for approval asks first, not the process owner', () => {
	const review = requested(valid(), PETRA, JONAS, NOW, true)
	assert.equal(changeWithdraws(review, JONAS), true)
	assert.equal(changeWithdraws(review, SAM), true)
	assert.equal(changeWithdraws(review, PETRA), false)
	assert.equal(changeWithdraws(valid(), JONAS), false)
	assert.equal(changeWithdraws(null, JONAS), false)
	// After the confirmation the request is gone: the next change is not asked again.
	assert.equal(changeWithdraws(withdrawn(review), JONAS), false)
})

test('385 AK6 approval action: save first, then the state, then the steps; a conflict stops it', async () => {
	const make = (o: { first?: boolean; write?: boolean }) => {
		const log: string[] = []
		let state: Approval | null = valid()
		const action = approvalAction({
			saveFirst: async () => { log.push('save changes'); return o.first ?? true },
			get: () => state,
			set: (a) => { state = a; log.push('set ' + (a?.state ?? 'none')) },
			next: (before) => requested(before, PETRA, JONAS, NOW, true),
			save: async () => { log.push('write ' + state?.state); return o.write ?? true },
			steps: (a) => [{ name: 'version', run: async () => { log.push('label for ' + a.state) } }],
			run: async (steps) => { for (const s of steps) await s.run() },
		})
		return { action, log, state: () => state }
	}
	const ok = make({})
	assert.equal(await ok.action, 'done')
	assert.deepEqual(ok.log, ['save changes', 'set review', 'write review', 'label for review'])
	assert.equal(ok.state()?.state, 'review')
	// Conflict when saving the changes first: nothing else happens.
	const c1 = make({ first: false })
	assert.equal(await c1.action, 'not-saved')
	assert.deepEqual(c1.log, ['save changes'])
	assert.equal(c1.state()?.state, 'valid')
	// Conflict when writing the new state: the old one comes back, no steps.
	const c2 = make({ write: false })
	assert.equal(await c2.action, 'not-written')
	assert.deepEqual(c2.log, ['save changes', 'set review', 'write review', 'set valid'])
	assert.deepEqual(c2.state(), valid())
})

// Job 388: "Share with edit rights" in the request dialog.
test('shareOffer: the button only when the asking account may reshare and edit, the hint otherwise', () => {
	const full = rightsOf('RGDNVW', 'jonas');
	assert.equal(shareOffer({ owner: PETRA, shareList: [], rights: full }), 'button');
	assert.equal(shareOffer({ owner: PETRA, shareList: [{ uid: 'petra', edit: false, group: false, type: 0 }], rights: full }), 'button');
	assert.equal(shareOffer({ owner: PETRA, shareList: [], rights: rightsOf('GDNVW', 'sam') }), 'hint');
	assert.equal(shareOffer({ owner: PETRA, shareList: [], rights: rightsOf('RG', 'sam') }), 'hint');
	assert.equal(shareOffer({ owner: PETRA, shareList: false, rights: full }), 'hint');
	assert.equal(shareOffer({ owner: PETRA, shareList: [], rights: null }), 'hint');
});

test('shareOffer: nothing when the person can edit already, owns the file, or nothing is known yet', () => {
	const full = rightsOf('RGDNVW', 'jonas');
	assert.equal(shareOffer({ owner: PETRA, shareList: [{ uid: 'petra', edit: true, group: false, type: 0 }], rights: full }), 'none');
	assert.equal(shareOffer({ owner: PETRA, shareList: [{ uid: 'buchhaltung', edit: true, group: true, type: 1 }], rights: full }), 'none');
	assert.equal(shareOffer({ owner: PETRA, shareList: false, rights: rightsOf('GDNVW', 'petra') }), 'none');
	assert.equal(shareOffer({ owner: null, shareList: [], rights: full }), 'none');
	assert.equal(shareOffer({ owner: PETRA, shareList: null, rights: full }), 'none');
	// someone else's edit share does not count for Petra
	assert.equal(shareOffer({ owner: PETRA, shareList: [{ uid: 'sam', edit: true, group: false, type: 0 }], rights: full }), 'button');
});

test('editShareRequest: raise a read-only share of exactly this person, keep its other rights; else a new share', () => {
	assert.deepEqual(editShareRequest([{ id: '7', uid: 'petra', edit: false, group: false, type: 0, permissions: 17 }], 'petra'), { method: 'PUT', id: '7', permissions: 19 });
	assert.deepEqual(editShareRequest([{ id: '7', uid: 'petra', edit: false, group: false, type: 0, permissions: 1 }], 'petra'), { method: 'PUT', id: '7', permissions: 3 });
	assert.deepEqual(editShareRequest([], 'petra'), { method: 'POST', permissions: 3 });
	assert.deepEqual(editShareRequest([{ id: '8', uid: 'petra', edit: false, group: true, type: 1, permissions: 1 }], 'petra'), { method: 'POST', permissions: 3 });
	assert.deepEqual(editShareRequest([{ id: '9', uid: 'sam', edit: false, group: false, type: 0, permissions: 1 }], 'petra'), { method: 'POST', permissions: 3 });
});

// Job 407: "Overwrite" in the conflict dialog keeps the approval state of the file on the server.
const serverValid = (): Approval => valid(V2, {
	decided: ['c1'],
	valid: { number: 2, date: '2026-11-12T09:00:00.000Z', by: PETRA, language: 'de', moves: V2, previous: { number: 1, date: '2026-09-03T10:00:00.000Z' } },
})

test('407 AK1 overwrite keeps the valid version and the decided proposals of the server', () => {
	const r = overwriteApproval(serverValid(), JONAS)
	assert.deepEqual(r, { approval: serverValid(), withdraw: false })
})

test('407 AK2 a state waiting for approval on the server is withdrawn, except for the process owner', () => {
	const review = requested(serverValid(), PETRA, JONAS, NOW, true)
	const a = overwriteApproval(review, JONAS)
	assert.equal(a.withdraw, true)
	assert.deepEqual(a.approval, withdrawn(review))
	assert.equal(a.approval!.state, 'valid')
	assert.equal(a.approval!.request, undefined)
	assert.equal(overwriteApproval(requested(null, PETRA, JONAS, NOW, true), SAM).approval!.state, 'draft')
	assert.deepEqual(overwriteApproval(review, PETRA), { approval: review, withdraw: false })
})

test('407 AK3 no approval details on the server: none are written', () => {
	assert.deepEqual(overwriteApproval(undefined, JONAS), { approval: null, withdraw: false })
	assert.deepEqual(overwriteApproval(null, JONAS), { approval: null, withdraw: false })
})

test('407 AK4 the overwritten file has the story of the browser and the approval state of the server', async () => {
	const xml = await fileXml(V3, 'de', overwriteApproval(serverValid(), JONAS).approval)
	const g = await loadStory(xml!, 'de')
	assert.ok(!('errors' in g))
	if ('errors' in g) return
	assert.deepEqual(g.moves, V3)
	assert.deepEqual(g.approval, serverValid())
})

test('407 AK5 the result shares no objects with the server state', () => {
	const server = serverValid()
	const r = overwriteApproval(server, JONAS).approval!
	r.decided.push('c2')
	r.valid!.moves.length = 0
	assert.deepEqual(server, serverValid())
	const review = requested(serverValid(), PETRA, JONAS, NOW, true)
	const w = overwriteApproval(review, JONAS).approval!
	w.valid!.number = 9
	assert.equal(review.valid!.number, 2)
})

test('416 AK1 decision buttons: two-step accept/reject, locked while unsaved or busy', () => {
	const o = { id: '7', kind: 'change', unsaved: false, busy: false, armed: false as string | false };
	assert.deepEqual(decisionButtons(o), [
		{ kind: 'accepted', key: '7:accepted', armed: false, disabled: false },
		{ kind: 'rejected', key: '7:rejected', armed: false, disabled: false },
	]);
	assert.deepEqual(decisionButtons({ ...o, armed: '7:accepted' }).map((b) => b.armed), [true, false]);
	assert.deepEqual(decisionButtons({ ...o, armed: '7:rejected' }).map((b) => b.armed), [false, true]);
	// The armed key of another proposal arms nothing here.
	assert.deepEqual(decisionButtons({ ...o, armed: '8:accepted' }).map((b) => b.armed), [false, false]);
	// Unsaved changes or writing: everything locked, nothing armed.
	for (const lock of [{ unsaved: true }, { busy: true }]) {
		const bs = decisionButtons({ ...o, ...lock, armed: '7:accepted' });
		assert.ok(bs.every((b) => b.disabled && !b.armed));
	}
	// A remark: only "Done", never armed, locked as well while unsaved.
	assert.deepEqual(decisionButtons({ ...o, kind: 'remark', armed: '7:done' }), [{ kind: 'done', key: '7:done', armed: false, disabled: false }]);
	assert.equal(decisionButtons({ ...o, kind: 'remark', unsaved: true })[0].disabled, true);
	for (const kind of ['insert', 'remove']) assert.deepEqual(decisionButtons({ ...o, kind }).map((b) => b.kind), ['accepted', 'rejected']);
});

test('428 AK2 ownerCompares: only the process owner of a state waiting for approval with a valid version', () => {
	const review = requested(valid(), PETRA, JONAS, NOW, true);
	assert.equal(ownerCompares(review, PETRA), true);
	assert.equal(ownerCompares(review, JONAS), false);
	assert.equal(ownerCompares(review, null), false);
	assert.equal(ownerCompares({ ...review, valid: undefined }, PETRA), false);
	assert.equal(ownerCompares(valid(), PETRA), false);
	assert.equal(ownerCompares(null, PETRA), false);
});

test('428 AK2 currentLines: the story text shown, indented two spaces per depth; none without moves', () => {
	assert.deepEqual(currentLines(null), []);
	assert.deepEqual(currentLines(undefined), []);
	assert.deepEqual(currentLines({ moves: [], storyText: [] }), []);
	const moves = [
		{ move: 'start', text: 'Anfrage kommt', role: 'Team' },
		{ move: 'task', text: 'Prüfen', role: 'Team' },
		{ move: 'decision', question: 'Passt es?', yes: 'ja', no: 'nein' },
		{ move: 'task', text: 'Buchen', role: 'Team' },
		{ move: 'end', text: 'Fertig' },
		{ move: 'task', text: 'Nachfragen', role: 'Team' },
		{ move: 'end', text: 'Fertig' },
	] as Move[];
	const view = { moves, storyText: tell(moves, 'de').storyText };
	const lines = currentLines(view);
	assert.deepEqual(lines, storyLines(moves, 'de'));
	assert.equal(lines.length, view.storyText.length);
	view.storyText.forEach((l, i) => assert.equal(lines[i], '  '.repeat(l.depth) + l.text));
	assert.ok(view.storyText.some((l) => l.depth > 0), 'the branch indents its paths');
});

// Job 437: "Share with edit rights" reaches only the person; links, mail and federated shares never count.
const ocs = (share_type: unknown, share_with: string, permissions: number, id = '2') => ({ id, share_type, share_with, share_with_displayname: share_with, permissions });

test('437 AK1 readShare takes share_type; only user and group shares carry a uid', () => {
	assert.deepEqual(readShare(ocs(0, 'petra', 17)), { id: '2', uid: 'petra', name: 'petra', edit: false, group: false, type: 0, permissions: 17 });
	assert.deepEqual(readShare(ocs('1', 'buchhaltung', 19)), { id: '2', uid: 'buchhaltung', name: 'buchhaltung', edit: true, group: true, type: 1, permissions: 19 });
	// a public link with a password: share_with is a hash, neither uid nor name
	const link = readShare({ id: '3', share_type: 3, share_with: '$2y$10$hash', share_with_displayname: '', permissions: 19 });
	assert.equal(link.uid, '');
	assert.equal(link.name, '');
	assert.equal(link.type, 3);
	assert.equal(readShare(ocs(4, 'dave@example.com', 17)).uid, '');
	assert.equal(readShare(ocs(4, 'dave@example.com', 17)).name, 'dave@example.com');
	assert.equal(readShare(ocs(6, 'bob@host', 17)).uid, '');
	// no share_type at all: unknown, not a user share
	const bare = readShare({ id: '5', share_with: 'petra', permissions: 19 });
	assert.equal(bare.type, -1);
	assert.equal(bare.uid, '');
	assert.equal(readShare(ocs(null, 'petra', 19)).type, -1);
	assert.equal(readShare(ocs('x', 'petra', 19)).type, -1);
});

test('437 AK2 shareOffer: a mail, link or federated share with the owner id does not count as edit right', () => {
	const full = rightsOf('RGDNVW', 'alice');
	const dave = { uid: 'dave@example.com', name: 'Dave' };
	assert.equal(shareOffer({ owner: dave, shareList: [readShare(ocs(4, 'dave@example.com', 19))], rights: full }), 'button');
	assert.equal(shareOffer({ owner: dave, shareList: [readShare(ocs(3, 'dave@example.com', 19))], rights: full }), 'button');
	const bob = { uid: 'bob@host', name: 'Bob' };
	assert.equal(shareOffer({ owner: bob, shareList: [readShare(ocs(6, 'bob@host', 19))], rights: full }), 'button');
	// even a hand-made share object without type does not count
	assert.equal(shareOffer({ owner: dave, shareList: [{ uid: 'dave@example.com', edit: true, group: false }], rights: full }), 'button');
	assert.equal(shareOffer({ owner: dave, shareList: [readShare(ocs(0, 'dave@example.com', 19))], rights: full }), 'none');
	assert.equal(shareOffer({ owner: dave, shareList: [readShare(ocs(1, 'sales', 19))], rights: full }), 'none');
});

test('437 AK3 editShareRequest never raises a mail share, only a user share of the person', () => {
	const mail = readShare(ocs(4, 'dave@example.com', 17, '2'));
	assert.deepEqual(editShareRequest([mail], 'dave@example.com'), { method: 'POST', permissions: 3 });
	assert.deepEqual(editShareRequest([readShare(ocs(6, 'dave@example.com', 17, '4'))], 'dave@example.com'), { method: 'POST', permissions: 3 });
	assert.deepEqual(editShareRequest([mail, readShare(ocs(0, 'dave@example.com', 17, '9'))], 'dave@example.com'), { method: 'PUT', id: '9', permissions: 19 });
});

test('437 AK4 shareRole: process owner only for their user share, links never "can edit"', () => {
	assert.equal(shareRole(readShare(ocs(0, 'dave@example.com', 19)), 'dave@example.com'), 'owner-edit');
	assert.equal(shareRole(readShare(ocs(0, 'dave@example.com', 17)), 'dave@example.com'), 'owner-read');
	assert.equal(shareRole(readShare(ocs(4, 'dave@example.com', 19)), 'dave@example.com'), 'link');
	assert.equal(shareRole(readShare(ocs(3, '$2y$hash', 19)), 'dave@example.com'), 'link');
	assert.equal(shareRole(readShare(ocs(6, 'dave@example.com', 19)), 'dave@example.com'), 'edit');
	assert.equal(shareRole(readShare(ocs(1, 'dave@example.com', 17)), 'dave@example.com'), 'read');
	assert.equal(shareRole(readShare(ocs(0, 'sam', 19)), 'dave@example.com'), 'edit');
	assert.equal(shareRole(readShare(ocs(0, 'sam', 19)), null), 'edit');
});
