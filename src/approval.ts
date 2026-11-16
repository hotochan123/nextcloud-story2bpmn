/**
 * SPDX-FileCopyrightText: 2026 hotochan123
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
// Approval through Nextcloud (docs/adr/0006-approval-through-nextcloud.md): pure logic without Vue
// and without requests (tests/client/approval.test.ts). The approval state lives in the working
// file (core: src/core/approval.ts); proposals are Nextcloud comments in a fixed form; a valid
// version is a named Nextcloud file version.
import { tell, asSourceText, tx, emptyApproval, sameMoves, shortDate, approvalCode, isUid } from './core/index.js';
import type { Approval, Person, Language, Move, Line } from './core/index.js';
import { textMoves } from './textEdit.js';
import type { TextResult } from './textEdit.js';

export type { Approval, Person };


/** Is the state exactly the valid version (same moves, same language)? */
export const isValidState = (a: Approval | null | undefined, moves: Move[], language: Language): boolean =>
	!!a?.valid && a.valid.language === language && sameMoves(a.valid.moves, moves);

/** A valid version exists and the state differs from it. */
export const changedSinceValid = (a: Approval | null | undefined, moves: Move[], language: Language): boolean =>
	!!a?.valid && !isValidState(a, moves, language);

export const isOwner = (a: Approval | null | undefined, me: Person | null | undefined): boolean =>
	!!a?.owner && !!me && a.owner.uid === me.uid;

/** The process owner opens a state waiting for approval that has a valid version: the comparison is on. */
export const ownerCompares = (a: Approval | null | undefined, me: Person | null | undefined): boolean =>
	!!(a?.state === 'review' && a.valid && isOwner(a, me));

/** F3: a change to a state waiting for approval withdraws the request; the process owner is not asked. */
export const changeWithdraws = (a: Approval | null | undefined, me: Person | null | undefined): boolean =>
	a?.state === 'review' && !isOwner(a, me)

// ---------- Status in the head: at most two pills ----------

export type Pill =
	| { kind: 'draft' } | { kind: 'done' } | { kind: 'open'; count: number }
	| { kind: 'review'; owner: string } | { kind: 'valid'; number: number }
	| { kind: 'changed'; number: number } | { kind: 'proposals'; count: number };

/**
 * First pill: the state (for approval, valid, else draft / fully told); second, the first that applies:
 * open points, changed since the valid version, undecided proposals.
 */
export function pills(o: { approval?: Approval | null; done: boolean; issues: number; moves: Move[]; language: Language; proposals?: number }): Pill[] {
	const a = o.approval
	const out: Pill[] = []
	if (a?.state === 'review' && a.owner) out.push({ kind: 'review', owner: a.owner.name || a.owner.uid })
	else if (a?.valid) out.push({ kind: 'valid', number: a.valid.number })
	else out.push(o.done && !o.issues ? { kind: 'done' } : { kind: 'draft' })
	if (o.done && o.issues) out.push({ kind: 'open', count: o.issues })
	else if (a?.valid && changedSinceValid(a, o.moves, o.language)) out.push({ kind: 'changed', number: a.valid.number })
	else if (o.proposals) out.push({ kind: 'proposals', count: o.proposals })
	// Before any approval "open points" replaces the state pill, as before.
	if (!a?.valid && a?.state !== 'review' && out[1]?.kind === 'open') return [out[1]]
	return out
}

// ---------- What may be done ----------

export type Can = { ask: boolean; approve: boolean; propose: boolean; decide: boolean };

/** `ready`: fully told without open points. `canSave`: the account may change the file. */
export function can(o: { approval?: Approval | null; me?: Person | null; ready: boolean; canSave: boolean; hasFile: boolean; moves: Move[]; language: Language }): Can {
	const a = o.approval
	const differs = !isValidState(a, o.moves, o.language)
	const owner = isOwner(a, o.me)
	return {
		ask: o.ready && o.canSave && a?.state !== 'review' && differs,
		approve: o.hasFile && owner && o.canSave && o.ready && differs,
		propose: o.hasFile && !!a?.valid && !owner,
		decide: o.hasFile && owner && o.canSave,
	}
}

// ---------- Changes of the approval state ----------

export function requested(a: Approval | null | undefined, owner: Person, me: Person, now: string, tag: boolean): Approval {
	const b = a ? structuredClone(a) : emptyApproval()
	return { ...b, state: 'review', owner, author: b.author ?? me, request: { date: now, by: me }, tag }
}

/** The request goes back: valid again if there is a valid version, else draft. */
export function withdrawn(a: Approval): Approval {
	const { request: _gone, ...b } = structuredClone(a)
	return { ...b, state: b.valid ? 'valid' : 'draft' }
}

/**
 * The state after approving. `a` is the base: the file's approval state with its valid version as
 * Nextcloud confirms it (confirmApproval), so `previous` names only a confirmed version. `number`: the
 * new number, by default the next one; App.vue passes the one after the number in the file, so no
 * number is given twice.
 */
export function approved(a: Approval, me: Person, moves: Move[], language: Language, now: string, number?: number): Approval {
	const b = structuredClone(a)
	const { request: _gone, ...rest } = b
	const old = b.valid
	return {
		...rest,
		state: 'valid',
		valid: {
			number: number ?? (old?.number ?? 0) + 1,
			date: now,
			by: me,
			language,
			moves: structuredClone(moves),
			...(old ? { previous: { number: old.number, date: old.date } } : {}),
		},
	}
}

/**
 * "Overwrite" in the conflict dialog: only the story of the browser replaces the file; the approval
 * state comes from the file on the server (the process owner may have approved or decided proposals
 * meanwhile). A state there that waits for approval is withdrawn like any change by someone other
 * than the process owner (F3); `withdraw` says the process owner is to be told.
 */
export function overwriteApproval(server: Approval | null | undefined, me: Person | null | undefined): { approval: Approval | null; withdraw: boolean } {
	if (!server) return { approval: null, withdraw: false }
	if (changeWithdraws(server, me)) return { approval: withdrawn(server), withdraw: true }
	return { approval: structuredClone(server), withdraw: false }
}

export const decided = (a: Approval, id: string): Approval => ({ ...structuredClone(a), decided: [...new Set([...a.decided, id])] })

// ---------- Texts that go to Nextcloud (diagram language) ----------

export const reviewLabel = (now: string, language: Language) => tx(language, 'Zur Freigabe ', 'For approval ') + shortDate(now, language)
export const validLabel = (n: number, language: Language) => tx(language, `Gültige Version ${n}`, `Valid version ${n}`)
export const tagName = (state: 'review' | 'valid', language: Language) =>
	state === 'review' ? tx(language, 'Zur Freigabe', 'For approval') : tx(language, 'Gültig', 'Valid')

/** Mention of an account in a comment; Nextcloud reads `@"uid"` for any user id. Nothing for a value that is no user id. */
export const mention = (uid: string | undefined) => (isUid(uid) ? '@"' + uid + '"' : '')

export const askComment = (owner: string, process: string, note: string, language: Language) =>
	`${mention(owner)} ${tx(language, `Bitte um Freigabe von „${process}“.`, `Please approve "${process}".`)}${note.trim() ? '\n\n' + note.trim() : ''}`
/** The approval comment; its second line, the check code (approvalCode), ties it to exactly the approved state. */
export const approvedComment = (author: string | undefined, n: number, language: Language, code: string) =>
	`${mention(author) ? mention(author) + ' ' : ''}${tx(language, `Als Gültige Version ${n} freigegeben.`, `Approved as valid version ${n}.`)}\n${tx(language, 'Prüfkennung: ', 'Check code: ')}${code}`
export const withdrawnComment = (owner: string | undefined, language: Language) =>
	`${mention(owner) ? mention(owner) + ' ' : ''}${tx(language, 'Bitte um Freigabe zurückgezogen.', 'Request for approval withdrawn.')}`
export type Decision = 'accepted' | 'rejected' | 'done'
export type DecisionButton = { kind: Decision; key: string; armed: boolean; disabled: boolean }

/**
 * The decision buttons of one proposal (job 416): a remark only gets "Done", a change gets "Accept" and
 * "Reject", which are two-step (`armed` = the key of the button pressed once). All of them write the
 * working file, so they are locked while there are unsaved changes (nothing is saved along silently)
 * and while something is being written.
 */
export function decisionButtons(o: { id: string; kind: string; unsaved: boolean; busy: boolean; armed: string | false }): DecisionButton[] {
	const kinds: Decision[] = o.kind === 'remark' ? ['done'] : ['accepted', 'rejected']
	const disabled = o.unsaved || o.busy
	return kinds.map((kind) => {
		const key = `${o.id}:${kind}`
		return { kind, key, armed: !disabled && kind !== 'done' && o.armed === key, disabled }
	})
}

/** What a decision comment quotes of a line: its label, else the line without brackets; at most 60 characters. */
export function quoteOf(label: string, line: string): string {
	const s = (label.trim() || line.replace(/\[[@#+!?]?([^\]]*)\]/g, '$1')).replace(/\s+/g, ' ').trim()
	return s.length > 60 ? s.slice(0, 59).trimEnd() + '…' : s
}

/** The comment of a decision names number and text of the line (job 417): "Zeile 5 („Ware prüfen“)". */
export function decisionComment(kind: Decision, line: number, text: string, language: Language): string {
	const de = `Zeile ${line} („${text}“)`
	const en = `line ${line} ("${text}")`
	if (kind === 'accepted') return tx(language, `Angenommen: Vorschlag zu ${de}.`, `Accepted: proposal on ${en}.`)
	if (kind === 'rejected') return tx(language, `Abgelehnt: Vorschlag zu ${de}.`, `Rejected: proposal on ${en}.`)
	return tx(language, `Erledigt: Bemerkung zu ${de}.`, `Done: remark on ${en}.`)
}

// ---------- Story text of a state ----------

/** Lines of the story text shown now (with indentation, two spaces per depth), as "Edit as text" shows them; none without moves. */
export const currentLines = (view: { moves: unknown[]; storyText?: Line[] } | null | undefined): string[] =>
	view?.moves.length ? asSourceText(view.storyText ?? []).split('\n') : []

/** Lines of the story text of a state given by its moves. */
export const storyLines = (moves: Move[], language: Language): string[] =>
	moves.length ? currentLines({ moves, storyText: tell(moves, language).storyText }) : []

/** Story text lines of the valid version. */
export const validLines = (a: Approval | null | undefined): string[] =>
	a?.valid ? storyLines(a.valid.moves as Move[], a.valid.language) : []

/** The lines of the valid version's story with their moves (index i is line i of validLines). */
export const validStory = (a: Approval | null | undefined): Line[] =>
	a?.valid && a.valid.moves.length ? tell(a.valid.moves as Move[], a.valid.language).storyText : []

// ---------- Comparison with the valid version ----------

export type DiffLine =
	| { kind: 'same'; text: string; line: number }
	| { kind: 'new'; text: string; line: number }
	| { kind: 'changed'; text: string; old: string; line: number }
	| { kind: 'removed'; old: string };

/**
 * Line by line on the trimmed text (longest common subsequence). Inside one block of removed and new
 * lines they are paired in order as "changed"; what is left over is new or removed. `line`: 1-based
 * line number in the new text.
 */
export function compareLines(before: string[], after: string[]): DiffLine[] {
	const a = before.map((s) => s.trim())
	const b = after.map((s) => s.trim())
	const n = a.length
	const m = b.length
	const L: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
	for (let i = n - 1; i >= 0; i--)
		for (let j = m - 1; j >= 0; j--)
			L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
	const out: DiffLine[] = []
	let i = 0
	let j = 0
	let gone: string[] = []
	let added: { text: string; line: number }[] = []
	const flush = () => {
		const k = Math.min(gone.length, added.length)
		for (let x = 0; x < k; x++) out.push({ kind: 'changed', text: added[x].text, old: gone[x], line: added[x].line })
		for (let x = k; x < gone.length; x++) out.push({ kind: 'removed', old: gone[x] })
		for (let x = k; x < added.length; x++) out.push({ kind: 'new', ...added[x] })
		gone = []
		added = []
	}
	while (i < n || j < m) {
		if (i < n && j < m && a[i] === b[j]) {
			flush()
			out.push({ kind: 'same', text: after[j], line: j + 1 })
			i++
			j++
		} else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) {
			added.push({ text: after[j], line: j + 1 })
			j++
		} else {
			gone.push(before[i])
			i++
		}
	}
	flush()
	return out
}

export const diffCounts = (d: DiffLine[]) => ({
	new: d.filter((x) => x.kind === 'new').length,
	changed: d.filter((x) => x.kind === 'changed').length,
	removed: d.filter((x) => x.kind === 'removed').length,
})

// ---------- Proposals as comments ----------

export type ProposalKind = 'change' | 'insert' | 'remove' | 'remark';
export type Proposal = { version: number; line: number; label: string; kind: ProposalKind; text?: string; why?: string };

const KIND_DE: Record<ProposalKind, string> = { change: 'Zeile ändern', insert: 'Danach einfügen', remove: 'Zeile entfernen', remark: 'Nur Bemerkung' }
const KIND_EN: Record<ProposalKind, string> = { change: 'Change line', insert: 'Insert after', remove: 'Remove line', remark: 'Remark only' }
const KIND_BACK: Record<string, ProposalKind> = Object.fromEntries([
	...Object.entries(KIND_DE).map(([k, v]) => [v.toLowerCase(), k]),
	...Object.entries(KIND_EN).map(([k, v]) => [v.toLowerCase(), k]),
]) as Record<string, ProposalKind>

const MAX_COMMENT = 2000

/** Label of a line: its step or event (the first object without a sign), else the first object at all. */
export function labelOf(line: string): string {
	const plain = line.match(/\[(?![@#+!?])([^\]]*)\]/)
	const any = line.match(/\[[@#+!?]?([^\]]*)\]/)
	return ((plain ?? any)?.[1] ?? '').trim()
}

const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim()

export function proposalText(p: Proposal, language: Language): string {
	const en = language === 'en'
	const lines = [
		en ? `Proposal on valid version ${p.version}, line ${p.line} [${oneLine(p.label)}]` : `Vorschlag zu Gültige Version ${p.version}, Zeile ${p.line} [${oneLine(p.label)}]`,
		(en ? 'Kind: ' : 'Art: ') + (en ? KIND_EN : KIND_DE)[p.kind],
	]
	if ((p.kind === 'change' || p.kind === 'insert') && p.text !== undefined) lines.push((en ? 'New: ' : 'Neu: ') + oneLine(p.text))
	if (p.why?.trim()) lines.push((en ? 'Why: ' : 'Warum: ') + p.why.trim())
	return lines.join('\n')
}

const HEAD = /^(?:Vorschlag zu Gültige Version|Proposal on valid version) (\d{1,6}), (?:Zeile|line) (\d{1,6}) \[([^\]\n]*)\]\s*$/i

/** A comment in the form of proposalText (German or English); null for any other comment. */
export function parseProposal(message: unknown): Proposal | null {
	if (typeof message !== 'string' || message.length > MAX_COMMENT) return null
	const [head, ...rest] = message.replace(/\r\n/g, '\n').split('\n')
	const h = head.trim().match(HEAD)
	if (!h) return null
	let kind: ProposalKind | undefined
	let text: string | undefined
	const why: string[] = []
	let inWhy = false
	for (const raw of rest) {
		const l = raw.trim()
		let m
		if (!inWhy && (m = l.match(/^(?:Art|Kind):\s*(.+)$/i))) kind = KIND_BACK[m[1].trim().toLowerCase()]
		else if (!inWhy && (m = l.match(/^(?:Neu|New):\s*(.*)$/i))) text = m[1].trim()
		else if ((m = l.match(/^(?:Warum|Why):\s*(.*)$/i))) {
			inWhy = true
			why.push(m[1])
		} else if (inWhy) why.push(raw)
	}
	if (!kind) return null
	if ((kind === 'change' || kind === 'insert') && !text) return null
	const p: Proposal = { version: Number(h[1]), line: Number(h[2]), label: h[3].trim(), kind }
	if (kind === 'change' || kind === 'insert') p.text = text
	const w = why.join('\n').trim()
	if (w) p.why = w
	return p
}

/** `mentions`: the accounts the comment mentions, with Nextcloud's display names. */
export type Comment = { id: string; message: string; actorId: string; actorName: string; date: string; mentions?: Person[] };
export type OpenProposal = Proposal & { id: string; actorId: string; actorName: string; date: string };

/**
 * Where a proposal points to in the valid version (job 417): the first line of its story whose move
 * has the number the comment names (the number left of the line, move + 1) and whose label matches.
 * The main level comes first (the lines of subprocess levels follow it in the story text).
 */
export function validIndexOf(a: Approval | null | undefined, p: { line: number; label: string }, story: Line[] = validStory(a)): number | null {
	const i = story.findIndex((l) => l.move === p.line - 1 && labelOf(l.text) === p.label)
	return i < 0 ? null : i
}

/** Number and label a proposal on line `at` of the valid version's story names; null for a line without a move. */
export function proposalAt(a: Approval | null | undefined, at: number): { line: number; label: string } | null {
	const l = validStory(a)[at]
	return l?.move === undefined ? null : { line: l.move + 1, label: labelOf(l.text) }
}

/**
 * Undecided proposals on the valid version: the version number matches and the move with that number
 * carries the label named in the comment.
 */
export function openProposals(comments: Comment[], a: Approval | null | undefined): OpenProposal[] {
	if (!a?.valid) return []
	const story = validStory(a)
	const out: OpenProposal[] = []
	for (const c of comments) {
		const p = parseProposal(c.message)
		if (!p || p.version !== a.valid.number || a.decided.includes(String(c.id))) continue
		if (validIndexOf(a, p, story) === null) continue
		out.push({ ...p, id: String(c.id), actorId: c.actorId, actorName: c.actorName, date: c.date })
	}
	return out
}

/** Index of a story text line in the valid version (the one closest to `near`), or null if it is not there. */
export function validLineOf(a: Approval | null | undefined, text: string, near = 0): number | null {
	return nearest(validLines(a), text, near)
}

/** The current line of line `at` of the valid version: the one with its text closest to `at`, or null. */
export function currentIndexOf(lines: string[], valid: string[], at: number): number | null {
	const old = valid[at]
	return old === undefined ? null : nearest(lines, old, at)
}

/** Index of the line with this (trimmed) text, the one closest to `near` when there are several. */
function nearest(lines: string[], text: string, near: number): number | null {
	const want = text.trim()
	let best: number | null = null
	lines.forEach((l, i) => {
		if (l.trim() === want && (best === null || Math.abs(i - near) < Math.abs(best - near))) best = i
	})
	return best
}

/**
 * The proposal applied to a story text: `at` is its line in the valid version, and the current line is
 * looked up by the text it has there (lines may have moved meanwhile). Null when the line is gone or
 * nothing would change.
 */
export function applyToText(lines: string[], valid: string[], at: number, p: Proposal): string[] | null {
	const i = currentIndexOf(lines, valid, at)
	if (i === null) return null
	const indent = lines[i].match(/^\s*/)![0]
	const out = [...lines]
	if (p.kind === 'change') out[i] = indent + (p.text ?? '').trim()
	else if (p.kind === 'insert') out.splice(i + 1, 0, indent + (p.text ?? '').trim())
	else if (p.kind === 'remove') out.splice(i, 1)
	else return null
	return out
}

export type Applied = { ok: true; moves: Move[] } | { ok: false; errors: string[] };

/** Reads a story text back on the moves before (textMoves); the page passes the text worker (textChecker). */
export type ReadText = (text: string, old: Move[], language: Language) => TextResult | Promise<TextResult>

/** A proposal on the current moves: new moves, or why it does not fit (nothing changes then). */
export async function applyProposal(moves: Move[], language: Language, a: Approval, p: Proposal, readText: ReadText = textMoves): Promise<Applied> {
	const at = validIndexOf(a, p)
	const text = at === null ? null : applyToText(storyLines(moves, language), validLines(a), at, p)
	if (!text) return { ok: false, errors: ['no-line'] }
	const r = await readText(text.join('\n'), moves, language)
	return r.errors.length ? { ok: false, errors: r.errors } : { ok: true, moves: r.moves }
}

/** The state a proposal is accepted on: the open file, its moves and language (read again after the read-back). */
export type Current = { file: unknown; moves: Move[]; language: Language }

/**
 * Accepting a proposal: read back (in the worker, it may take a while) on the state when accepting began.
 * If the file, the story or its language changed meanwhile, the result belongs to the old state:
 * `changed`, and nothing may be replaced or written.
 */
export async function acceptProposal(current: () => Current, a: Approval, p: Proposal, readText: ReadText = textMoves): Promise<Applied> {
	const { file, moves, language } = current()
	const was = JSON.parse(JSON.stringify(moves)) as Move[]
	const r = await applyProposal(moves, language, a, p, readText)
	const after = current()
	if (after.file !== file || after.language !== language || !sameMoves(after.moves, was)) return { ok: false, errors: ['changed'] }
	return r
}

/** Before sending: the proposal must read back on the valid version itself. */
export async function checkProposal(a: Approval, p: Proposal, readText: ReadText = textMoves): Promise<string[]> {
	const v = a.valid
	if (!v) return ['no-valid-version']
	if (p.kind === 'remark') return []
	if ((p.kind === 'change' || p.kind === 'insert') && !p.text?.trim()) return ['empty']
	const r = await applyProposal(v.moves as Move[], v.language, a, p, readText)
	return r.ok ? [] : r.errors
}

// ---------- What Nextcloud confirms of the approval state ----------

const APPROVED = /^(?:@"[^"\n]*" )?(?:Als Gültige Version (\d{1,7}) freigegeben\.|Approved as valid version (\d{1,7})\.)\n(?:Prüfkennung|Check code): ([0-9a-f]{16})$/

/** An approval comment (approvedComment): number and check code; null for any other comment. */
export function parseApproved(message: unknown): { number: number; code: string } | null {
	if (typeof message !== 'string' || message.length > MAX_COMMENT) return null
	const m = message.replace(/\r\n/g, '\n').trim().match(APPROVED)
	return m ? { number: Number(m[1] ?? m[2]), code: m[3] } : null
}

const ASKED = /^@"([^"\n]+)" (?:Bitte um Freigabe von „|Please approve ")/

/** The account a request comment (askComment) asks for approval; null for any other comment. */
export function requestedOf(message: unknown): string | null {
	if (typeof message !== 'string' || message.length > MAX_COMMENT) return null
	return message.match(ASKED)?.[1] ?? null
}

/** Order of comments: Nextcloud numbers them as they are written. */
const order = (c: Comment) => Number(c.id)

export type Confirmed = { approval: Approval | null; unconfirmed: boolean };

/**
 * The approval state as far as Nextcloud confirms it (docs/adr/0006-approval-through-nextcloud.md).
 * Anyone who may edit the working file can change its attribute; a comment carries the account that
 * wrote it (`actorId`, set by the server). So:
 * - the valid version counts only with an approval comment of its approver that names its number and
 *   the check code of exactly its moves and language, written after another account asked the
 *   approver in a request comment;
 * - the process owner counts only when another account asked them in a request comment;
 * - "for approval" counts only with such a request newer than the confirmed approval.
 * - the author counts only as the account that wrote such a request comment (job 435).
 * Names come from the comments (Nextcloud's display names), not from the file. What does not count is
 * left out and `unconfirmed` says so (not for the author); decided proposals and the tag switch stay as in the file.
 */
export function confirmApproval(raw: Approval | null | undefined, comments: Comment[]): Confirmed {
	if (!raw) return { approval: null, unconfirmed: false }
	const requests = comments
		.map((c) => ({ c, uid: requestedOf(c.message) }))
		.filter((r): r is { c: Comment; uid: string } => !!r.uid && !!r.c.actorId && r.uid !== r.c.actorId)
	const askedBefore = (uid: string, before: number) => requests.some((r) => r.uid === uid && order(r.c) < before)
	let valid: Approval['valid']
	let approvedAt = -Infinity
	let approverName = ''
	if (raw.valid) {
		const v = raw.valid
		const code = approvalCode(v.number, v.language, v.moves)
		const proof = comments.find((c) => {
			if (c.actorId !== v.by.uid) return false
			const p = parseApproved(c.message)
			return !!p && p.number === v.number && p.code === code && askedBefore(v.by.uid, order(c))
		})
		if (proof) {
			approverName = proof.actorName || proof.actorId
			valid = { ...structuredClone(v), by: { uid: v.by.uid, name: approverName } }
			approvedAt = order(proof)
		}
	}
	let owner: Person | undefined
	if (raw.owner) {
		const uid = raw.owner.uid
		const asked = requests.filter((r) => r.uid === uid)
		if (asked.length) {
			const named = asked.map((r) => r.c.mentions?.find((m) => m.uid === uid)?.name).find((n) => !!n)
			owner = { uid, name: named || (valid?.by.uid === uid ? approverName : '') || uid }
		}
	}
	let request: Approval['request']
	if (raw.state === 'review' && owner) {
		const newest = requests
			.filter((r) => r.uid === owner!.uid && order(r.c) > approvedAt)
			.sort((x, y) => order(y.c) - order(x.c))[0]
		if (newest) request = { date: newest.c.date || raw.request?.date || '', by: { uid: newest.c.actorId, name: newest.c.actorName || newest.c.actorId } }
	}
	let author: Person | undefined
	if (raw.author) {
		const wrote = requests.find((r) => r.c.actorId === raw.author!.uid)
		if (wrote) author = { uid: wrote.c.actorId, name: wrote.c.actorName || wrote.c.actorId }
	}
	const state = request ? 'review' : valid ? 'valid' : 'draft'
	const { valid: _v, owner: _o, request: _r, author: _a, ...rest } = structuredClone(raw)
	const approval: Approval = { ...rest, state, ...(owner ? { owner } : {}), ...(author ? { author } : {}), ...(request ? { request } : {}), ...(valid ? { valid } : {}) }
	const unconfirmed = (!!raw.valid && !valid) || (!!raw.owner && !owner) || (raw.state === 'review' && !request) || (raw.state === 'valid' && !valid)
	return { approval, unconfirmed }
}

/** Whom the approval comment mentions: the confirmed asker, else the confirmed author; never an id only the file names. */
export const approvalMention = (trusted: Approval | null | undefined): string | undefined =>
	trusted?.request?.by.uid || trusted?.author?.uid || undefined

/** Whom the comment on a withdrawn request mentions: the process owner of the saved state as Nextcloud confirms it. */
export const withdrawMention = (saved: Approval | null | undefined, comments: Comment[]): string | undefined =>
	confirmApproval(saved, comments).approval?.owner?.uid

// ---------- Steps that talk to Nextcloud ----------

export type Step = { name: string; run: () => Promise<unknown> };

/**
 * The Nextcloud steps of approving, in their order: the version is named, then the approval comment
 * is written, and only then the reading copy is filed: the server files it as the valid version's
 * only when that comment is there.
 */
export const approveSteps = (o: { version: Step; comment: Step; pdf: Step }): Step[] => [o.version, o.comment, o.pdf]
export type StepsResult = { failed: { name: string; error: unknown }[] };

/** Runs the steps not done yet, each once; the failed ones stay for "Try again". */
export async function runSteps(steps: Step[], done: Set<string>): Promise<StepsResult> {
	const failed: StepsResult['failed'] = []
	for (const s of steps) {
		if (done.has(s.name)) continue
		try {
			await s.run()
			done.add(s.name)
		} catch (error) {
			failed.push({ name: s.name, error })
		}
	}
	return { failed }
}

/**
 * One approval action (ask, approve) in its fixed order: save unsaved changes first; then write the
 * new approval state into the working file; only when both are saved, the Nextcloud steps run. A
 * conflict or failure at either save stops it, and a state that could not be written is put back.
 */
export async function approvalAction(o: {
	saveFirst: () => Promise<boolean>;
	get: () => Approval | null;
	set: (a: Approval | null) => void;
	next: (before: Approval | null) => Approval;
	save: () => Promise<boolean>;
	steps: (a: Approval) => Step[];
	run: (steps: Step[]) => Promise<void>;
}): Promise<'done' | 'not-saved' | 'not-written'> {
	if (!(await o.saveFirst())) return 'not-saved'
	const before = o.get()
	const next = o.next(before)
	o.set(next)
	if (!(await o.save())) {
		o.set(before)
		return 'not-written'
	}
	await o.run(o.steps(next))
	return 'done'
}

/**
 * The id of the file version that holds the saved state: the version whose id (or modification time)
 * is the file's modification time after that save. No guess: a later save must not get the label.
 */
export function versionOf(versions: { id: string; mtime: number }[], mtime: number): string | null {
	return versions.find((v) => Number(v.id) === mtime || v.mtime === mtime)?.id ?? null
}

// ---------- Sharing from the request dialog ----------

/**
 * The preselected process owner of the request dialog: the file's person only as the account search
 * finds exactly its id, with the server's display name; null otherwise (the file's name never shows).
 */
export function prefillOwner(owner: Person | null | undefined, found: Person[]): Person | null {
	if (!owner || !isUid(owner.uid)) return null
	const hit = found.find((p) => p.uid === owner.uid)
	return hit ? { uid: hit.uid, name: hit.name || hit.uid } : null
}

/** One share of the working file as `shares()` of src/nextcloudApi.js reads it. */
export type Share = { id?: string; uid: string; name?: string; edit: boolean; group: boolean; type?: number; permissions?: number };

/** Nextcloud share types that are an account (0) or a group (1); links, mail, federated and others are not. */
const USER_SHARE = 0
const GROUP_SHARE = 1
/** A public link (3) and a mail share (4, a link sent to an address). */
const LINK_SHARES = [3, 4]

/**
 * One share of the OCS share list as a `Share`. Only user and group shares carry a uid: the
 * `share_with` of a link (password hash), a mail share (address) or a federated share is never
 * taken as an account. A missing or odd `share_type` counts as unknown (-1).
 */
export function readShare(s: Record<string, unknown>): Share {
	const given = s?.share_type
	const raw = Number(given)
	const type = given === undefined || given === null || given === '' || !Number.isInteger(raw) ? -1 : raw
	const permissions = Number(s?.permissions) || 0
	const person = type === USER_SHARE || type === GROUP_SHARE
	return {
		id: String(s?.id ?? ''),
		uid: person ? String(s?.share_with ?? '') : '',
		name: type === 3 ? '' : String(s?.share_with_displayname || s?.share_with || ''),
		edit: (permissions & 2) === 2,
		group: type === GROUP_SHARE,
		type,
		permissions,
	}
}

/** Whether this share is a user share of exactly `uid`. */
const userShareOf = (s: Share, uid: string) => s.type === USER_SHARE && !!uid && s.uid === uid

/**
 * The role a share has in the sidebar's share list: process owner only for a user share of the
 * owner, edit or read for accounts, groups and other recipients, `link` for public and mail links.
 */
export function shareRole(s: Share, ownerUid?: string | null): 'owner-edit' | 'owner-read' | 'edit' | 'read' | 'link' {
	if (LINK_SHARES.includes(Number(s.type))) return 'link'
	if (ownerUid && userShareOf(s, ownerUid)) return s.edit ? 'owner-edit' : 'owner-read'
	return s.edit ? 'edit' : 'read'
}
/** What the requesting account may do with the file (WebDAV `oc:permissions`, `oc:owner-id`). */
export type FileRights = { canShare: boolean; canEdit: boolean; ownerId: string };

/**
 * What the request dialog offers under the chosen process owner: nothing (they can edit, or it is
 * not known yet), the hint only, or the hint with the button "Share with edit rights". The button
 * needs a readable share list and an account that may reshare and edit the file itself.
 */
export function shareOffer(o: { owner?: Person | null; shareList: Share[] | false | null; rights: FileRights | null }): 'none' | 'hint' | 'button' {
	const { owner, shareList, rights } = o
	if (!owner || shareList === null) return 'none'
	if (rights && rights.ownerId && rights.ownerId === owner.uid) return 'none'
	if (Array.isArray(shareList) && shareList.some((s) => s.edit && (s.type === GROUP_SHARE || userShareOf(s, owner.uid)))) return 'none'
	if (Array.isArray(shareList) && rights?.canShare && rights.canEdit) return 'button'
	return 'hint'
}

/**
 * The share request that gives `uid` the right to edit: raise an existing read-only user share of
 * exactly this person (keeping its other rights), else a new user share with read + update (1 | 2).
 */
export function editShareRequest(shareList: Share[], uid: string): { method: 'PUT'; id: string; permissions: number } | { method: 'POST'; permissions: number } {
	const s = shareList.find((x) => userShareOf(x, uid) && !x.edit && x.id)
	if (s) return { method: 'PUT', id: String(s.id), permissions: (Number(s.permissions) || 1) | 2 }
	return { method: 'POST', permissions: 3 }
}

/** `oc:permissions` of WebDAV ("RGDNVW…") as the rights the dialog needs. */
export const rightsOf = (permissions: string, ownerId: string): FileRights =>
	({ canShare: permissions.includes('R'), canEdit: permissions.includes('W'), ownerId })
