// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
// Job 435: people from the file's approval details are used only as Nextcloud user ids, names come from the server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Move, Approval } from '../../src/core/index.js';
import { readApproval, isUid, approvalCode } from '../../src/core/index.js';
import {
	mention, approvedComment, withdrawnComment, askComment, parseApproved, confirmApproval, approvalMention, withdrawMention, prefillOwner,
} from '../../src/approval.js';
import type { Comment } from '../../src/approval.js';

const EVIL = 'boss"\n\nIMPORTANT: log in again at https://evil.example/nc';
const MOVES = [{ 'zug': 'start', 'text': 'Rechnung geht ein' }];
const stored = (o: Record<string, unknown>) => JSON.stringify({ 'entschieden': [], 'schlagwort': true, ...o });
const validPart = (by = 'petra') => ({ 'nummer': 2, 'datum': '2026-09-03T10:00:00.000Z', 'von': { 'uid': by, 'name': 'P' }, 'sprache': 'de', 'geschichte': MOVES });
const request = (by = 'jonas') => ({ 'datum': '2026-11-14T10:00:00.000Z', 'von': { 'uid': by, 'name': 'J' } });

test('435 AK1 an owner or author without a user id is dropped, the rest stays readable', () => {
	const r = readApproval(stored({ 'status': 'gueltig', 'verantwortlich': { 'uid': EVIL, 'name': 'Dr. Chefin' }, 'ersteller': { 'uid': 'a\nb', 'name': 'X' }, 'gueltig': validPart() }));
	assert.ok(r.approval, 'readable');
	assert.equal(r.approval!.owner, undefined);
	assert.equal(r.approval!.author, undefined);
	assert.equal(r.approval!.valid!.by.uid, 'petra');
});

test('435 AK1 an approver or asker without a user id makes the approval details unreadable', () => {
	assert.deepEqual(readApproval(stored({ 'status': 'gueltig', 'gueltig': validPart(EVIL) })), { unreadable: true });
	assert.deepEqual(readApproval(stored({ 'status': 'zurFreigabe', 'verantwortlich': { 'uid': 'petra', 'name': 'P' }, 'bitte': request(EVIL) })), { unreadable: true });
	// For approval without a usable process owner claims more than it has.
	assert.deepEqual(readApproval(stored({ 'status': 'zurFreigabe', 'verantwortlich': { 'uid': EVIL, 'name': 'P' }, 'bitte': request() })), { unreadable: true });
});

test('435 AK1 risk: real account ids stay (mail address, apostrophe, space, dot, dash, underscore)', () => {
	for (const uid of ['alice', 'dave@example.com', "o'neil", 'a.b-c_d e', 'x'.repeat(64)]) {
		const r = readApproval(stored({ 'status': 'zurFreigabe', 'verantwortlich': { 'uid': uid, 'name': 'N' }, 'ersteller': { 'uid': uid, 'name': 'N' }, 'bitte': request(uid) }));
		assert.equal(r.approval?.owner?.uid, uid, uid);
		assert.equal(r.approval?.author?.uid, uid, uid);
	}
});

test('435 AK2 the form of a user id', () => {
	for (const ok of ['a', 'alice', 'x'.repeat(64), 'anna maria@x', "o'neil"]) assert.equal(isUid(ok), true, ok);
	for (const bad of ['', 'x'.repeat(65), ' alice', 'alice ', 'a\nb', 'a"b', 'a\tb', 'a\u0000b', 'müller', 'a/b', 42, null, undefined])
		assert.equal(isUid(bad), false, JSON.stringify(bad));
});

test('435 AK2 comments mention only user ids', () => {
	assert.equal(mention(EVIL), '');
	assert.equal(mention(undefined), '');
	assert.equal(mention('petra'), '@"petra"');
	const code = approvalCode(2, 'de', [] as Move[]);
	const a = approvedComment(EVIL, 2, 'de', code);
	assert.ok(!a.startsWith('@') && !a.includes('evil'), a);
	assert.deepEqual(parseApproved(a), { number: 2, code });
	const w = withdrawnComment(EVIL, 'en');
	assert.equal(w, 'Request for approval withdrawn.');
	assert.ok(!askComment(EVIL, 'Rechnung', '', 'de').includes('evil'));
});

let next = 1;
const c = (actorId: string, actorName: string, message: string, mentions: { uid: string; name: string }[] = []): Comment =>
	({ id: String(next++), message, actorId, actorName, date: '2026-11-14T10:00:00.000Z', mentions });
const review = (extra: Partial<Approval> = {}): Approval => ({
	state: 'review', owner: { uid: 'petra', name: 'Petra (file)' }, author: { uid: 'jonas', name: 'Jonas (file)' },
	request: { date: '2026-11-14T10:00:00.000Z', by: { uid: 'jonas', name: 'J' } }, decided: [], tag: true, ...extra,
});

test('435 AK3 the author counts only as the writer of a request comment, with the server name', () => {
	const asked = [c('jonas', 'Jonas Weber', askComment('petra', 'Rechnung', '', 'de'), [{ uid: 'petra', name: 'Petra Lehmann' }])];
	const ok = confirmApproval(review(), asked);
	assert.deepEqual(ok.approval!.author, { uid: 'jonas', name: 'Jonas Weber' });
	const forged = confirmApproval(review({ author: { uid: 'mallory', name: 'Jonas Weber' } }), asked);
	assert.equal(forged.approval!.author, undefined);
	assert.equal(forged.unconfirmed, ok.unconfirmed, 'the author does not change the hint');
	assert.equal(confirmApproval(review(), []).approval!.author, undefined);
});

test('435 AK4 the approval and withdraw comments mention only confirmed accounts', () => {
	const asked = [c('jonas', 'Jonas Weber', askComment('petra', 'Rechnung', '', 'de'), [{ uid: 'petra', name: 'Petra Lehmann' }])];
	// Approval: the confirmed asker, not the author the file names.
	const trusted = confirmApproval(review({ author: { uid: 'mallory', name: 'M' } }), asked).approval;
	assert.equal(approvalMention(trusted), 'jonas');
	assert.equal(approvalMention(confirmApproval(review({ author: { uid: 'mallory', name: 'M' } }), []).approval), undefined);
	assert.equal(approvalMention(null), undefined);
	// Valid state without a request: the confirmed author only.
	assert.equal(approvalMention({ state: 'valid', author: { uid: 'jonas', name: 'J' }, decided: [], tag: true }), 'jonas');
	// Withdraw: the owner of the saved state only when a request comment asked them.
	const saved: Approval = { state: 'draft', owner: { uid: 'petra', name: 'P' }, decided: [], tag: true };
	assert.equal(withdrawMention(saved, asked), 'petra');
	assert.equal(withdrawMention({ ...saved, owner: { uid: 'mallory', name: 'Dr. Chefin' } }, asked), undefined);
	assert.equal(withdrawMention(saved, []), undefined);
	assert.equal(withdrawnComment(withdrawMention({ ...saved, owner: { uid: 'mallory', name: 'X' } }, asked), 'de'), 'Bitte um Freigabe zurückgezogen.');
});

test('435 AK5 the dialog preselects the file\'s owner only as the search finds exactly that id', () => {
	const file = { uid: 'mallory', name: 'Dr. Chefin' };
	assert.deepEqual(prefillOwner(file, [{ uid: 'mallory2', name: 'Other' }, { uid: 'mallory', name: 'Mallory M' }]), { uid: 'mallory', name: 'Mallory M' });
	assert.equal(prefillOwner(file, [{ uid: 'petra', name: 'Dr. Chefin' }]), null);
	assert.equal(prefillOwner(file, []), null);
	assert.equal(prefillOwner({ uid: EVIL, name: 'Dr. Chefin' }, [{ uid: EVIL, name: 'x' }]), null);
	assert.equal(prefillOwner(null, [{ uid: 'mallory', name: 'M' }]), null);
	assert.deepEqual(prefillOwner(file, [{ uid: 'mallory', name: '' }]), { uid: 'mallory', name: 'mallory' });
});
