/**
 * SPDX-FileCopyrightText: 2026 hotochan123
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
// Nextcloud's own interfaces that approval uses (docs/adr/0006-approval-through-nextcloud.md):
// comments, file versions and tags over WebDAV, user search and shares over OCS. All requests run
// with the account's session, so its file permissions decide; nothing here needs the app's server.
import axios from '@nextcloud/axios'
import { getCurrentUser } from '@nextcloud/auth'
import { generateOcsUrl, generateRemoteUrl, generateUrl } from '@nextcloud/router'
import { readShare } from './approval.ts'

const DAV = (path) => generateRemoteUrl('dav') + path
const enc = (s) => encodeURIComponent(String(s))
const XML_HEAD = '<?xml version="1.0" encoding="utf-8"?>'
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The signed-in account as { uid, name }, null without one. */
export function me() {
	const u = getCurrentUser()
	return u ? { uid: u.uid, name: u.displayName || u.uid } : null
}

/** <d:response> elements of a multistatus answer, each as { href, props: { localName: text } }. */
function responses(xml) {
	const doc = new DOMParser().parseFromString(xml, 'application/xml')
	return [...doc.getElementsByTagNameNS('DAV:', 'response')].map((r) => {
		const props = {}
		for (const ps of r.getElementsByTagNameNS('DAV:', 'propstat')) {
			const status = ps.getElementsByTagNameNS('DAV:', 'status')[0]?.textContent ?? ''
			if (!/ 200 /.test(status)) continue
			const prop = ps.getElementsByTagNameNS('DAV:', 'prop')[0]
			for (const el of prop?.children ?? []) props[el.localName] = el.textContent ?? ''
		}
		return { href: decodeURIComponent(r.getElementsByTagNameNS('DAV:', 'href')[0]?.textContent ?? ''), props }
	})
}

// ---------- Comments ----------

const OC = 'http://owncloud.org/ns'
const PAGE = 200
/** The newest comments read: what confirms an approval must be among them (src/approval.ts confirmApproval). */
const MAX_COMMENTS = 1000

/** The accounts a comment mentions (`oc:mentions`) as { uid, name }, with Nextcloud's display names. */
function mentionsOf(xml) {
	const doc = new DOMParser().parseFromString(xml, 'application/xml')
	const out = new Map()
	for (const r of doc.getElementsByTagNameNS('DAV:', 'response')) {
		const id = r.getElementsByTagNameNS(OC, 'id')[0]?.textContent ?? ''
		const list = [...r.getElementsByTagNameNS(OC, 'mention')]
			.filter((m) => /^users?$/.test(m.getElementsByTagNameNS(OC, 'mentionType')[0]?.textContent ?? 'user'))
			.map((m) => ({ uid: m.getElementsByTagNameNS(OC, 'mentionId')[0]?.textContent ?? '', name: m.getElementsByTagNameNS(OC, 'mentionDisplayName')[0]?.textContent ?? '' }))
			.filter((m) => m.uid)
		if (id) out.set(id, list)
	}
	return out
}

/** Comments of a file (newest first, at most 1000) as { id, message, actorId, actorName, date, mentions }. */
export async function comments(fileId) {
	const all = []
	for (let offset = 0; offset < MAX_COMMENTS; offset += PAGE) {
		const body = XML_HEAD + '<oc:filter-comments xmlns:oc="http://owncloud.org/ns"><oc:limit>' + PAGE + '</oc:limit><oc:offset>' + offset + '</oc:offset></oc:filter-comments>'
		const r = await axios({ method: 'REPORT', url: DAV('/comments/files/' + enc(fileId)), data: body, headers: { 'Content-Type': 'application/xml' } })
		const page = responses(r.data).filter((x) => x.props.id)
		const mentions = mentionsOf(r.data)
		all.push(...page
			.filter((x) => (x.props.verb || 'comment') === 'comment' && (x.props.actorType || 'users') === 'users')
			.map((x) => ({ id: x.props.id, message: x.props.message ?? '', actorId: x.props.actorId ?? '', actorName: x.props.actorDisplayName || x.props.actorId || '', date: x.props.creationDateTime ?? '', mentions: mentions.get(x.props.id) ?? [] })))
		if (page.length < PAGE) break
	}
	return all
}

/** Writes a comment on a file; mentions (`@"uid"`) notify the account. */
export async function comment(fileId, message) {
	await axios.post(DAV('/comments/files/' + enc(fileId)), { actorType: 'users', verb: 'comment', message, objectType: 'files' })
}

// ---------- Versions ----------

/** Versions of a file as { id, mtime, label, author }; the id is the version's timestamp. */
export async function versions(fileId) {
	const user = me()
	if (!user) throw new Error('not logged in')
	const body = XML_HEAD + '<d:propfind xmlns:d="DAV:" xmlns:nc="http://nextcloud.org/ns"><d:prop><d:getlastmodified/><nc:version-label/><nc:version-author/></d:prop></d:propfind>'
	const r = await axios({ method: 'PROPFIND', url: DAV('/versions/' + enc(user.uid) + '/versions/' + enc(fileId)), data: body, headers: { Depth: '1', 'Content-Type': 'application/xml' } })
	return responses(r.data)
		.map((x) => ({ id: x.href.replace(/\/$/, '').split('/').pop(), props: x.props }))
		.filter((x) => /^\d+$/.test(x.id) && x.id !== String(fileId))
		.map((x) => ({
			id: x.id,
			mtime: x.props.getlastmodified ? Math.round(Date.parse(x.props.getlastmodified) / 1000) : Number(x.id),
			label: x.props['version-label'] ?? '',
			author: x.props['version-author'] ?? '',
		}))
}

/** Names a version ("Gültige Version 3"); named versions are not cleaned up by Nextcloud. */
export async function nameVersion(fileId, versionId, label) {
	const user = me()
	if (!user) throw new Error('not logged in')
	const body = XML_HEAD + '<d:propertyupdate xmlns:d="DAV:" xmlns:nc="http://nextcloud.org/ns"><d:set><d:prop><nc:version-label>' + esc(label) + '</nc:version-label></d:prop></d:set></d:propertyupdate>'
	await axios({ method: 'PROPPATCH', url: DAV('/versions/' + enc(user.uid) + '/versions/' + enc(fileId) + '/' + enc(versionId)), data: body, headers: { 'Content-Type': 'application/xml' } })
}

// ---------- Tags ----------

async function tagByName(name) {
	const body = XML_HEAD + '<d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><oc:id/><oc:display-name/></d:prop></d:propfind>'
	const r = await axios({ method: 'PROPFIND', url: DAV('/systemtags/'), data: body, headers: { Depth: '1', 'Content-Type': 'application/xml' } })
	return responses(r.data).find((x) => x.props['display-name'] === name)?.props.id ?? null
}

/** The visible, assignable tag of this name; created when missing (that may be reserved for admins). */
async function ensureTag(name) {
	const found = await tagByName(name)
	if (found) return found
	const r = await axios.post(DAV('/systemtags/'), { name, userVisible: true, userAssignable: true, canAssign: true })
	const id = String(r.headers?.['content-location'] ?? '').split('/').pop()
	return id || tagByName(name)
}

/** Puts `on` on the file and takes the tags `off` away (missing ones are fine). */
export async function setTags(fileId, on, off) {
	for (const name of off) {
		const id = await tagByName(name)
		if (id) await axios.delete(DAV('/systemtags-relations/files/' + enc(fileId) + '/' + enc(id))).catch((e) => { if (e?.response?.status !== 404) throw e })
	}
	if (on) {
		const id = await ensureTag(on)
		await axios.put(DAV('/systemtags-relations/files/' + enc(fileId) + '/' + enc(id))).catch((e) => { if (e?.response?.status !== 409) throw e })
	}
}

// ---------- People and shares ----------

/** Accounts for the search field, as { uid, name }. */
export async function findUsers(search, fileId) {
	const r = await axios.get(generateOcsUrl('core/autocomplete/get'), {
		params: { search, itemType: 'files', itemId: String(fileId), 'shareTypes[]': 0, limit: 10 },
	})
	return (r.data?.ocs?.data ?? []).filter((x) => x.source === 'users' || x.source === undefined).map((x) => ({ uid: String(x.id), name: String(x.label || x.id) }))
}

/** Shares of the file (only readable for whoever may reshare it) as `readShare()` of src/approval.ts reads them. */
export async function shares(path) {
	const r = await axios.get(generateOcsUrl('apps/files_sharing/api/v1/shares'), { params: { path, reshares: true } })
	return (r.data?.ocs?.data ?? []).map((s) => readShare(s))
}

/** WebDAV address of a path in the account's Files, each part encoded on its own. */
const filesDav = (uid, path) => DAV('/files/' + enc(uid) + '/' + String(path).split('/').filter(Boolean).map(enc).join('/'))

/** What the account may do with the file: `oc:permissions` ("RGDNVW") and `oc:owner-id`. */
export async function fileRights(path) {
	const user = me()
	if (!user) throw new Error('not logged in')
	const body = XML_HEAD + '<d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><oc:permissions/><oc:owner-id/></d:prop></d:propfind>'
	const r = await axios({ method: 'PROPFIND', url: filesDav(user.uid, path), data: body, headers: { Depth: '0', 'Content-Type': 'application/xml' } })
	const props = responses(r.data)[0]?.props ?? {}
	return { permissions: props.permissions ?? '', ownerId: props['owner-id'] ?? '' }
}

/**
 * Gives `uid` the right to edit the file: a new user share (POST) or a raised existing one (PUT),
 * as `editShareRequest()` of src/approval.ts decides. Throws with Nextcloud's message on failure.
 */
export async function shareForEdit(path, uid, request) {
	const url = generateOcsUrl('apps/files_sharing/api/v1/shares')
	try {
		if (request.method === 'PUT') await axios.put(url + '/' + enc(request.id), { permissions: request.permissions })
		else await axios.post(url, { path, shareType: 0, shareWith: uid, permissions: request.permissions })
	} catch (e) {
		const message = e?.response?.data?.ocs?.meta?.message
		throw new Error(typeof message === 'string' && message ? message : '')
	}
}

/** Address of the file in Files (its sidebar has Nextcloud's own share view). */
export const filesLink = (fileId) => generateUrl('/f/' + enc(fileId))
