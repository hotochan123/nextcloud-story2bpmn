// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// API scenarios of the Story2BPMN integration run (dev/it/run.sh starts the Nextcloud and passes its
// address, the passwords and the container name in the environment): open, save with the etag check
// and save as, on working files in the accounts' own Files. Each check prints one line; the end is
// "==== <ok> ok / <failed> fehlgeschlagen ====" followed by " - <label>" per failure.
import http from 'node:http'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const BASE = process.env.STORY2BPMN_IT_URL
const PASS = process.env.STORY2BPMN_IT_PASS
const ADMIN_PASS = process.env.STORY2BPMN_IT_ADMIN_PASS
if (!BASE || !PASS || !ADMIN_PASS) {
	console.error('Error: STORY2BPMN_IT_URL, STORY2BPMN_IT_PASS and STORY2BPMN_IT_ADMIN_PASS are required')
	process.exit(2)
}
const API = '/index.php/apps/story2bpmn/api/files'

let ok = 0
const failed = []
function check(label, cond, detail = '') {
	if (cond) {
		ok++
		console.log(`ok   ${label}`)
	} else {
		failed.push(label)
		console.log(`FAIL ${label}${detail ? ` (${detail})` : ''}`)
	}
}

// node:http instead of fetch: fetch (undici) overwrites the Host header, and Nextcloud only trusts
// "localhost" (trusted_domains of the throwaway instance).
function request(method, path, { user, json, raw, headers = {} } = {}) {
	const url = new URL(path, BASE)
	const payload = json !== undefined ? JSON.stringify(json) : raw
	const h = { Host: 'localhost', 'OCS-APIRequest': 'true', Accept: 'application/json', ...headers }
	if (user) h.Authorization = 'Basic ' + Buffer.from(`${user}:${user === 'admin' ? ADMIN_PASS : PASS}`).toString('base64')
	if (payload !== undefined) {
		h['Content-Type'] ??= json !== undefined ? 'application/json' : 'application/octet-stream'
		h['Content-Length'] = Buffer.byteLength(payload)
	}
	return new Promise((resolve, reject) => {
		const req = http.request(url, { method, headers: h }, (res) => {
			const chunks = []
			res.on('data', (c) => chunks.push(c))
			res.on('end', () => {
				const text = Buffer.concat(chunks).toString('utf8')
				let data = null
				try { data = JSON.parse(text) } catch { /* XML or HTML */ }
				resolve({ status: res.statusCode, headers: res.headers, text, data })
			})
		})
		req.on('error', reject)
		req.setTimeout(60000, () => req.destroy(new Error(`timeout ${method} ${path}`)))
		if (payload !== undefined) req.write(payload)
		req.end()
	})
}
const api = (method, path, user, json) => request(method, API + path, { user, json })
const dav = (method, user, path, opts = {}) => request(method, `/remote.php/dav/files/${user}/${path}`, { user, ...opts })

async function fileId(user, path) {
	const r = await dav('PROPFIND', user, path, {
		raw: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><oc:fileid/></d:prop></d:propfind>',
		headers: { Depth: '0', 'Content-Type': 'application/xml' },
	})
	const m = r.text.match(/<oc:fileid>(\d+)<\/oc:fileid>/)
	if (!m) throw new Error(`no fileid for ${user}:${path} (HTTP ${r.status})`)
	return Number(m[1])
}

const XML = (name) => `<?xml version="1.0" encoding="UTF-8"?>\n<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D"><bpmn:process id="P" name="${name}"/></bpmn:definitions>\n`
const sha256 = (s) => createHash('sha256').update(s).digest('hex')

async function main() {
	const anon = await api('GET', '/1')
	check('without login: 401', anon.status === 401, `HTTP ${anon.status}`)

	await dav('MKCOL', 'alice', 'Processes')
	await dav('MKCOL', 'bob', 'Mine')
	const folder = await fileId('alice', 'Processes')
	const bobFolder = await fileId('bob', 'Mine')

	// save as
	const made = await api('POST', '', 'alice', { folderId: folder, name: 'Order intake', content: XML('Order intake') })
	check('POST creates the file: 201 with .bpmn appended', made.status === 201 && made.data?.name === 'Order intake.bpmn' && made.data?.path === '/Processes/Order intake.bpmn', `HTTP ${made.status} ${made.text.slice(0, 200)}`)
	const id = made.data?.id
	const onDisk = await dav('GET', 'alice', 'Processes/Order%20intake.bpmn')
	check('the new file is in alice\'s Files with the content', onDisk.status === 200 && onDisk.text === XML('Order intake'), `HTTP ${onDisk.status}`)
	const again = await api('POST', '', 'alice', { folderId: folder, name: 'Order intake.bpmn', content: '<other/>' })
	const still = await dav('GET', 'alice', 'Processes/Order%20intake.bpmn')
	check('POST with an existing name: 409 exists, file unchanged', again.status === 409 && again.data?.exists === true && still.text === XML('Order intake'), `HTTP ${again.status}`)
	for (const bad of ['../x.bpmn', 'a/b.bpmn', '.htaccess', '', 'x'.repeat(300)]) {
		const r = await api('POST', '', 'alice', { folderId: folder, name: bad, content: '<x/>' })
		check(`POST with name ${JSON.stringify(bad.slice(0, 20))}: 400`, r.status === 400, `HTTP ${r.status}`)
	}
	const foreignFolder = await api('POST', '', 'alice', { folderId: bobFolder, name: 'sneak', content: '<x/>' })
	check('POST into bob\'s folder id: 404', foreignFolder.status === 404, `HTTP ${foreignFolder.status}`)
	const bobList = await dav('PROPFIND', 'bob', 'Mine', { headers: { Depth: '1' } })
	check('bob\'s folder has no new file', !bobList.text.includes('sneak'), bobList.text.slice(0, 120))

	// open
	const read = await api('GET', `/${id}`, 'alice')
	check('GET returns content, path, etag, hash and canSave', read.status === 200 && read.data?.content === XML('Order intake') && read.data?.canSave === true && typeof read.data?.etag === 'string' && read.data?.hash === sha256(XML('Order intake')), `HTTP ${read.status}`)
	const etag1 = read.data?.etag
	const hash1 = read.data?.hash

	// save
	const saved = await api('PUT', `/${id}`, 'alice', { content: XML('Order intake v2'), etag: etag1, hash: hash1 })
	const reread = await api('GET', `/${id}`, 'alice')
	check('PUT with the current etag: 200, the new etag equals the next GET\'s', saved.status === 200 && saved.data?.etag !== etag1 && saved.data?.etag === reread.data?.etag && saved.data?.hash === sha256(XML('Order intake v2')) && saved.data?.hash === reread.data?.hash && reread.data?.content === XML('Order intake v2'), `HTTP ${saved.status} ${saved.data?.etag} vs ${reread.data?.etag}`)
	const stale = await api('PUT', `/${id}`, 'alice', { content: XML('stale'), etag: etag1, hash: hash1 })
	check('PUT with the old etag: 409 with the current etag, nothing written', stale.status === 409 && stale.data?.etag === saved.data?.etag && (await api('GET', `/${id}`, 'alice')).data?.content === XML('Order intake v2'), `HTTP ${stale.status}`)

	// changed elsewhere (WebDAV) after opening
	const { etag: before, hash: beforeHash } = (await api('GET', `/${id}`, 'alice')).data ?? {}
	const noHash = await api('PUT', `/${id}`, 'alice', { content: XML('no hash'), etag: before })
	check('PUT with the current etag but no hash: 409, nothing written', noHash.status === 409 && (await api('GET', `/${id}`, 'alice')).data?.content === XML('Order intake v2'), `HTTP ${noHash.status}`)
	await dav('PUT', 'alice', 'Processes/Order%20intake.bpmn', { raw: XML('from a modeler') })
	const conflict = await api('PUT', `/${id}`, 'alice', { content: XML('mine'), etag: before, hash: beforeHash })
	const kept = await dav('GET', 'alice', 'Processes/Order%20intake.bpmn')
	check('changed via WebDAV after opening: PUT 409, the outside change stays', conflict.status === 409 && kept.text === XML('from a modeler'), `HTTP ${conflict.status}`)
	const forced = await api('PUT', `/${id}`, 'alice', { content: XML('mine'), etag: before, hash: beforeHash, force: true })
	const now = await dav('GET', 'alice', 'Processes/Order%20intake.bpmn')
	check('PUT with force: 200, overwritten', forced.status === 200 && now.text === XML('mine'), `HTTP ${forced.status}`)

	// another account
	const bobRead = await api('GET', `/${id}`, 'bob')
	const bobWrite = await api('PUT', `/${id}`, 'bob', { content: '<x/>', etag: forced.data?.etag, force: true })
	check('bob reads alice\'s file id: 404 without name or path', bobRead.status === 404 && !bobRead.text.includes('Order') && !bobRead.text.includes('Processes'), `HTTP ${bobRead.status}`)
	check('bob writes alice\'s file id: 404, unchanged', bobWrite.status === 404 && (await dav('GET', 'alice', 'Processes/Order%20intake.bpmn')).text === XML('mine'), `HTTP ${bobWrite.status}`)

	// reading copy next to the working file
	const PDF1 = '%PDF-1.4\n% reading copy one\n%%EOF\n'
	const PDF2 = '%PDF-1.4\n% reading copy two\n%%EOF\n'
	const b64 = (s) => Buffer.from(s, 'latin1').toString('base64')
	const bobCopy = await api('PUT', `/${id}/reading-copy`, 'bob', { content: b64(PDF1) })
	const noPdfYet = await dav('GET', 'alice', 'Processes/Order%20intake.pdf')
	check('bob publishes alice\'s file id: 404, no PDF', bobCopy.status === 404 && noPdfYet.status === 404, `HTTP ${bobCopy.status} / ${noPdfYet.status}`)
	const notPdf = await api('PUT', `/${id}/reading-copy`, 'alice', { content: b64('<html><script>x</script></html>') })
	check('publish of HTML instead of a PDF: 400, no PDF', notPdf.status === 400 && (await dav('GET', 'alice', 'Processes/Order%20intake.pdf')).status === 404, `HTTP ${notPdf.status}`)
	const pub1 = await api('PUT', `/${id}/reading-copy`, 'alice', { content: b64(PDF1) })
	const pdfOnDisk = await dav('GET', 'alice', 'Processes/Order%20intake.pdf')
	check('publish: 200, Order intake.pdf next to the .bpmn with the bytes', pub1.status === 200 && pub1.data?.name === 'Order intake.pdf' && pub1.data?.path === '/Processes/Order intake.pdf' && pub1.data?.replaced === false && pdfOnDisk.status === 200 && pdfOnDisk.text === PDF1, `HTTP ${pub1.status} ${pub1.text.slice(0, 200)}`)
	const pub2 = await api('PUT', `/${id}/reading-copy`, 'alice', { content: b64(PDF2) })
	check('publish again: same file id, replaced, new content', pub2.status === 200 && pub2.data?.replaced === true && pub2.data?.id === pub1.data?.id && pub2.data?.id === await fileId('alice', 'Processes/Order%20intake.pdf') && (await dav('GET', 'alice', 'Processes/Order%20intake.pdf')).text === PDF2, `HTTP ${pub2.status}`)
	check('the working file is untouched by publishing', (await dav('GET', 'alice', 'Processes/Order%20intake.bpmn')).text === XML('mine'))
	const clash = await api('POST', '', 'alice', { folderId: folder, name: 'Clash', content: XML('Clash') })
	await dav('MKCOL', 'alice', 'Processes/Clash.pdf')
	const clashPub = await api('PUT', `/${clash.data?.id}/reading-copy`, 'alice', { content: b64(PDF1) })
	check('publish with a folder of the PDF\'s name in the way: 409', clashPub.status === 409, `HTTP ${clashPub.status}`)

	// shared read-only to bob
	const share = await request('POST', '/ocs/v2.php/apps/files_sharing/api/v1/shares?format=json', {
		user: 'alice', json: { path: '/Processes/Order intake.bpmn', shareType: 0, shareWith: 'bob', permissions: 1 },
	})
	check('share read-only to bob', share.status === 200, `HTTP ${share.status} ${share.text.slice(0, 200)}`)
	const sharedRead = await api('GET', `/${id}`, 'bob')
	check('bob opens the read-only share: 200, canSave false', sharedRead.status === 200 && sharedRead.data?.canSave === false && sharedRead.data?.content === XML('mine'), `HTTP ${sharedRead.status} canSave ${sharedRead.data?.canSave}`)
	const sharedWrite = await api('PUT', `/${id}`, 'bob', { content: '<x/>', etag: sharedRead.data?.etag, hash: sharedRead.data?.hash })
	check('bob saves the read-only share: 403, unchanged', sharedWrite.status === 403 && (await dav('GET', 'alice', 'Processes/Order%20intake.bpmn')).text === XML('mine'), `HTTP ${sharedWrite.status}`)

	// not a working file, too large
	await dav('PUT', 'alice', 'Processes/notes.txt', { raw: 'hello' })
	const txt = await api('GET', `/${await fileId('alice', 'Processes/notes.txt')}`, 'alice')
	check('GET of a .txt file id: 400', txt.status === 400, `HTTP ${txt.status}`)
	const dir = await api('GET', `/${folder}`, 'alice')
	check('GET of a folder id: 400', dir.status === 400, `HTTP ${dir.status}`)
	const big = 'x'.repeat(3 * 1024 * 1024)
	const tooBig = await api('PUT', `/${id}`, 'alice', { content: big, etag: forced.data?.etag, force: true })
	check('PUT of 3 MiB: 413, unchanged', tooBig.status === 413 && (await dav('GET', 'alice', 'Processes/Order%20intake.bpmn')).text === XML('mine'), `HTTP ${tooBig.status}`)
	await dav('PUT', 'alice', 'Processes/huge.bpmn', { raw: big })
	const hugeRead = await api('GET', `/${await fileId('alice', 'Processes/huge.bpmn')}`, 'alice')
	check('GET of a 3 MiB .bpmn: 413', hugeRead.status === 413, `HTTP ${hugeRead.status}`)
	const missing = await api('GET', '/999999', 'alice')
	check('GET of an unknown id: 404', missing.status === 404, `HTTP ${missing.status}`)

	// Job 385: approval through Nextcloud (comments, named versions, draft reading copy)
	await approval(id, b64)
	// Job 432: a valid version counts only as far as Nextcloud's comments confirm it
	await approvalTrust(folder, b64)
	await viewOnly(folder, id, b64)

	// CSRF: a browser session without request token may not write
	const csrf = await request('PUT', `${API}/${id}`, { user: 'alice', json: { content: '<x/>', etag: '', force: true }, headers: { 'OCS-APIRequest': '' } })
	check('PUT without OCS header or request token: refused, unchanged', csrf.status >= 400 && (await dav('GET', 'alice', 'Processes/Order%20intake.bpmn')).text === XML('mine'), `HTTP ${csrf.status}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const occ = (...args) => execFileSync('docker', ['exec', '-u', 'www-data', process.env.STORY2BPMN_IT_CONTAINER, 'php', 'occ', ...args], { encoding: 'utf8' })
const versionsPath = (user, fid) => `/remote.php/dav/versions/${user}/versions/${fid}`
async function versionList(user, fid) {
	const r = await request('PROPFIND', versionsPath(user, fid), {
		user,
		raw: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:nc="http://nextcloud.org/ns"><d:prop><d:getlastmodified/><nc:version-label/></d:prop></d:propfind>',
		headers: { Depth: '1', 'Content-Type': 'application/xml' },
	})
	const out = []
	for (const m of r.text.matchAll(/<d:response>([\s\S]*?)<\/d:response>/g)) {
		const href = m[1].match(/<d:href>([^<]*)<\/d:href>/)?.[1] ?? ''
		const vid = href.replace(/\/$/, '').split('/').pop()
		if (!/^\d+$/.test(vid) || vid === String(fid)) continue
		out.push({ id: vid, label: m[1].match(/<nc:version-label>([^<]*)<\/nc:version-label>/)?.[1] ?? '' })
	}
	return { status: r.status, list: out }
}

async function approval(id, b64) {
	// Draft reading copy beside the valid one: its own name, the valid PDF stays.
	const validPdf = (await dav('GET', 'alice', 'Processes/Order%20intake.pdf')).text
	const draft = await api('PUT', `/${id}/reading-copy`, 'alice', { content: b64('%PDF-1.4\n% draft\n%%EOF\n'), draft: true, language: 'de' })
	check('385 AK9 draft publish: "Order intake (Entwurf).pdf", the valid PDF unchanged', draft.status === 200 && draft.data?.name === 'Order intake (Entwurf).pdf' && (await dav('GET', 'alice', 'Processes/Order%20intake%20(Entwurf).pdf')).status === 200 && (await dav('GET', 'alice', 'Processes/Order%20intake.pdf')).text === validPdf, `HTTP ${draft.status} ${draft.text.slice(0, 160)}`)
	const draftEn = await api('PUT', `/${id}/reading-copy`, 'alice', { content: b64('%PDF-1.4\n% draft\n%%EOF\n'), draft: 'true', language: 'en' })
	check('385 AK9 draft publish in English: "(Draft).pdf"', draftEn.status === 200 && draftEn.data?.name === 'Order intake (Draft).pdf', `HTTP ${draftEn.status}`)

	// Comments: bob reads (share from above) and comments; alice reads the comment.
	const message = 'Vorschlag zu Gültige Version 1, Zeile 2 [Rechnung prüfen]\nArt: Nur Bemerkung\nWarum: <img src=x onerror=alert(1)>'
	const posted = await request('POST', `/remote.php/dav/comments/files/${id}`, { user: 'bob', json: { actorType: 'users', verb: 'comment', message, objectType: 'files' } })
	check('385 AK10 bob (read share) writes a comment on alice\'s working file', posted.status === 201, `HTTP ${posted.status} ${posted.text.slice(0, 160)}`)
	const report = await request('REPORT', `/remote.php/dav/comments/files/${id}`, {
		user: 'alice',
		raw: '<?xml version="1.0"?><oc:filter-comments xmlns:oc="http://owncloud.org/ns"><oc:limit>200</oc:limit><oc:offset>0</oc:offset></oc:filter-comments>',
		headers: { 'Content-Type': 'application/xml' },
	})
	check('385 AK10 alice reads bob\'s proposal comment with its first line', report.status === 207 && report.text.includes('Vorschlag zu Gültige Version 1, Zeile 2 [Rechnung prüfen]') && /<oc:actorId>bob<\/oc:actorId>/.test(report.text), `HTTP ${report.status}`)
	const carol = await request('POST', `/remote.php/dav/comments/files/${id}`, { user: 'carol', json: { actorType: 'users', verb: 'comment', message: 'x', objectType: 'files' } })
	check('385 AK10 carol without access cannot comment', carol.status >= 400, `HTTP ${carol.status}`)

	// Versions: each save makes one; the saved state is the version whose id is the mtime of the save.
	const made = await api('POST', '', 'alice', { folderId: await fileId('alice', 'Processes'), name: 'Versioned', content: XML('v1') })
	const vid = made.data?.id
	let last = made.data
	for (const n of ['v2', 'v3']) {
		await sleep(1200)
		last = (await api('PUT', `/${vid}`, 'alice', { content: XML(n), etag: last.etag, hash: last.hash })).data
	}
	const before = await versionList('alice', vid)
	const current = before.list.find((v) => Number(v.id) === last.mtime)
	check('385 AK10 the saved state is a version named by its mtime', before.status === 207 && !!current && before.list.length >= 3, `HTTP ${before.status} ${JSON.stringify(before.list)} mtime ${last.mtime}`)
	const label = await request('PROPPATCH', `${versionsPath('alice', vid)}/${current?.id}`, {
		user: 'alice',
		raw: '<?xml version="1.0"?><d:propertyupdate xmlns:d="DAV:" xmlns:nc="http://nextcloud.org/ns"><d:set><d:prop><nc:version-label>Gültige Version 1</nc:version-label></d:prop></d:set></d:propertyupdate>',
		headers: { 'Content-Type': 'application/xml' },
	})
	const named = await versionList('alice', vid)
	check('385 AK10 naming the version: "Gültige Version 1"', label.status === 207 && named.list.some((v) => v.id === current?.id && v.label === 'Gültige Version 1'), `HTTP ${label.status} ${JSON.stringify(named.list)}`)

	// Cleaning up: with a retention of 0 days every old version expires, except the named one.
	await sleep(1200)
	await api('PUT', `/${vid}`, 'alice', { content: XML('v4'), etag: last.etag, hash: last.hash })
	try {
		occ('config:system:set', 'versions_retention_obligation', '--value=0, 0')
		occ('versions:expire', 'alice')
	} catch (e) {
		check('385 AK11 occ versions:expire runs', false, String(e.message).slice(0, 160))
	} finally {
		try { occ('config:system:delete', 'versions_retention_obligation') } catch { /* nothing to undo */ }
	}
	const after = await versionList('alice', vid)
	const unnamedOld = before.list.filter((v) => v.id !== current?.id && Number(v.id) < Number(current?.id))
	check('385 AK11 the named version survives the clean-up', after.list.some((v) => v.id === current?.id && v.label === 'Gültige Version 1'), JSON.stringify(after.list))
	check('385 AK11 unnamed older versions were cleaned up (the check is real)', unnamedOld.length > 0 && unnamedOld.every((v) => !after.list.some((a) => a.id === v.id)), `before ${JSON.stringify(before.list)} after ${JSON.stringify(after.list)}`)
}

// A working file that claims valid version 1, approved by `by`; story text without characters XML escapes.
const STORY = '[{"zug":"start","text":"Order arrives"},{"zug":"schritt","text":"Check order"},{"zug":"ende","text":"Done"}]'
const claimed = (by) => {
	const freigabe = { 'status': 'gueltig', 'verantwortlich': { uid: by, name: by }, 'ersteller': { uid: 'bob', name: 'bob' }, 'gueltig': { 'nummer': 1, 'datum': '2026-11-14T10:00:00.000Z', 'von': { uid: by, name: 'Forged Name' }, 'sprache': 'en', 'geschichte': JSON.parse(STORY) }, 'entschieden': [], 'schlagwort': false }
	const attr = (v) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
	return `<?xml version="1.0" encoding="UTF-8"?>\n<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmnc="urn:bpmn-core:geschichte" xmlns:s2b="urn:story2bpmn:freigabe" id="D" xml:lang="en" bpmnc:geschichte="${attr(STORY)}" s2b:freigabe="${attr(JSON.stringify(freigabe))}"><bpmn:process id="P" name="Trust"/></bpmn:definitions>\n`
}
// approvalCode() of src/core/fingerprint.ts
const CODE = sha256(`1\nen\n${STORY}`).slice(0, 16)
const say = (user, fid, message) => request('POST', `/remote.php/dav/comments/files/${fid}`, { user, json: { actorType: 'users', verb: 'comment', message, objectType: 'files' } })

async function approvalTrust(folder, b64) {
	const PDF = b64('%PDF-1.4\n% valid\n%%EOF\n')
	const made = await api('POST', '', 'alice', { folderId: folder, name: 'Trust', content: claimed('alice') })
	const fid = made.data?.id
	const shared = await request('POST', '/ocs/v2.php/apps/files_sharing/api/v1/shares?format=json', {
		user: 'alice', json: { path: '/Processes/Trust.bpmn', shareType: 0, shareWith: 'bob', permissions: 3 },
	})
	check('432 setup: Trust.bpmn shared with bob to edit', made.status === 201 && shared.status === 200, `HTTP ${made.status} / ${shared.status}`)
	const forged = await api('PUT', `/${fid}/reading-copy`, 'alice', { content: PDF, draft: false, language: 'en' })
	check('432 AK7 claimed valid version without comments: 409, no Trust.pdf', forged.status === 409 && (await dav('GET', 'alice', 'Processes/Trust.pdf')).status === 404, `HTTP ${forged.status} ${forged.text.slice(0, 160)}`)
	const draft = await api('PUT', `/${fid}/reading-copy`, 'alice', { content: PDF, draft: true, language: 'en' })
	check('432 AK7 the draft of it is filed: 200 "Trust (Draft).pdf"', draft.status === 200 && draft.data?.name === 'Trust (Draft).pdf', `HTTP ${draft.status}`)
	// bob approves in alice's name: his comment does not confirm "approved by alice"
	await say('bob', fid, '@"alice" Please approve "Trust".')
	await say('bob', fid, `Approved as valid version 1.\nCheck code: ${CODE}`)
	const byBob = await api('PUT', `/${fid}/reading-copy`, 'bob', { content: PDF, draft: false, language: 'en' })
	check('432 AK7 approval comment by bob for a version "approved by alice": 409', byBob.status === 409, `HTTP ${byBob.status}`)
	// alice approves after bob asked her: confirmed
	const own = await say('alice', fid, `@"bob" Approved as valid version 1.\nCheck code: ${CODE}`)
	const confirmed = await api('PUT', `/${fid}/reading-copy`, 'bob', { content: PDF, draft: false, language: 'en' })
	check('432 AK7 request by bob, then approval comment by alice with the check code: 200 "Trust.pdf"', own.status === 201 && confirmed.status === 200 && confirmed.data?.name === 'Trust.pdf', `HTTP ${own.status} / ${confirmed.status} ${confirmed.text.slice(0, 160)}`)
	// The story changed since: the code no longer fits
	const cur = (await api('GET', `/${fid}`, 'alice')).data
	await api('PUT', `/${fid}`, 'alice', { content: claimed('alice').replace('Check order', 'Check the order'), etag: cur?.etag, hash: cur?.hash })
	const changed = await api('PUT', `/${fid}/reading-copy`, 'alice', { content: PDF, draft: false, language: 'en' })
	check('432 AK7 story changed after the approval: 409', changed.status === 409, `HTTP ${changed.status}`)
	// What the client reads: the mention with Nextcloud's display name (src/nextcloudApi.js comments())
	const report = await request('REPORT', `/remote.php/dav/comments/files/${fid}`, {
		user: 'alice',
		raw: '<?xml version="1.0"?><oc:filter-comments xmlns:oc="http://owncloud.org/ns"><oc:limit>200</oc:limit><oc:offset>0</oc:offset></oc:filter-comments>',
		headers: { 'Content-Type': 'application/xml' },
	})
	const mention = report.text.match(/<oc:mention>([\s\S]*?)<\/oc:mention>/)?.[1] ?? ''
	check('432 the comment report names the mentioned account with its display name', /<oc:mentionType>users?<\/oc:mentionType>/.test(mention) && /<oc:mentionId>(alice|bob)<\/oc:mentionId>/.test(mention) && /<oc:mentionDisplayName>IT (alice|bob)<\/oc:mentionDisplayName>/.test(mention) && /<oc:actorType>users<\/oc:actorType>/.test(report.text), mention.slice(0, 300))
	// Asked for approval, not approved yet (no valid version in the file): the plain name as before
	const asked = { 'status': 'zurFreigabe', 'verantwortlich': { uid: 'bob', name: 'bob' }, 'bitte': { 'datum': '2026-11-14T10:00:00.000Z', 'von': { uid: 'alice', name: 'alice' } }, 'entschieden': [], 'schlagwort': false }
	const askedXml = XML('Asked').replace('id="D"', `xmlns:s2b="urn:story2bpmn:freigabe" id="D" s2b:freigabe="${JSON.stringify(asked).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`)
	const askedFile = await api('POST', '', 'alice', { folderId: folder, name: 'Asked', content: askedXml })
	const askedPub = await api('PUT', `/${askedFile.data?.id}/reading-copy`, 'alice', { content: PDF, draft: false, language: 'en' })
	check('432 round 2: for approval without a valid version: 200 "Asked.pdf" as before', askedFile.status === 201 && askedPub.status === 200 && askedPub.data?.name === 'Asked.pdf', `HTTP ${askedFile.status} / ${askedPub.status} ${askedPub.text.slice(0, 160)}`)
	// No approval details at all: the plain name as before
	const plain = await api('POST', '', 'alice', { folderId: folder, name: 'Plain', content: XML('Plain') })
	const plainPub = await api('PUT', `/${plain.data?.id}/reading-copy`, 'alice', { content: PDF, draft: false, language: 'en' })
	check('432 AK7 a file without approval details: 200 "Plain.pdf" as before', plainPub.status === 200 && plainPub.data?.name === 'Plain.pdf', `HTTP ${plainPub.status}`)
	// Entities in a foreign file: refused, never a 500
	const ent = await api('POST', '', 'alice', { folderId: folder, name: 'Entity', content: '<?xml version="1.0"?><!DOCTYPE d [<!ENTITY x "y">]><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:s2b="urn:story2bpmn:freigabe" s2b:freigabe="&x;"/>' })
	const entPub = await api('PUT', `/${ent.data?.id}/reading-copy`, 'alice', { content: PDF, draft: false, language: 'en' })
	check('432 risk: a file with a DOCTYPE: 409, not 500', entPub.status === 409, `HTTP ${ent.status} / ${entPub.status}`)
}

/** Repeats a request for up to 15 s until it answers as expected; the last status. */
async function settled(call, done) {
	let r
	for (let i = 0; i < 30; i++) {
		r = await call()
		if (done(r)) break
		await sleep(500)
	}
	return r.status
}

// Job 434: a share that forbids downloads. Default setting: bob views the file but files no reading copy;
// strict setting (no view without download): bob cannot open it at all, like over WebDAV.
async function viewOnly(folder, plainShared, b64) {
	const PDF = b64('%PDF-1.4\n% view only\n%%EOF\n')
	const noDownload = JSON.stringify([{ scope: 'permissions', key: 'download', value: false }])
	const share = (path) => request('POST', '/ocs/v2.php/apps/files_sharing/api/v1/shares?format=json', {
		user: 'alice', json: { path, shareType: 0, shareWith: 'bob', permissions: 1, attributes: noDownload },
	})
	await dav('MKCOL', 'alice', 'Processes/VO')
	const vo = await fileId('alice', 'Processes/VO')
	const single = await api('POST', '', 'alice', { folderId: folder, name: 'Single', content: XML('Single') })
	const inside = await api('POST', '', 'alice', { folderId: vo, name: 'Inside', content: XML('Inside') })
	const s1 = await share('/Processes/Single.bpmn')
	const s2 = await share('/Processes/VO')
	const attrsOf = (r) => JSON.stringify(r.data?.ocs?.data?.attributes ?? '')
	check('434 setup: Single.bpmn and folder VO shared with bob read-only, download forbidden', single.status === 201 && inside.status === 201 && s1.status === 200 && s2.status === 200 && attrsOf(s1).includes('download'), `HTTP ${single.status}/${inside.status}/${s1.status}/${s2.status} ${attrsOf(s1).slice(0, 120)}`)
	const files = [['Single.bpmn', single.data?.id, 'Processes/Single.pdf', 'Single.pdf'], ['VO/Inside.bpmn', inside.data?.id, 'Processes/VO/Inside.pdf', 'VO/Inside.pdf']]

	const mine = await api('GET', `/${single.data?.id}`, 'alice')
	check('434 AK1 alice opens her own file shared without download: canDownload true', mine.status === 200 && mine.data?.canDownload === true, `HTTP ${mine.status} ${mine.data?.canDownload}`)
	const plain = await api('GET', `/${plainShared}`, 'bob')
	check('434 AK6 bob opens a normal read-only share: canDownload true', plain.status === 200 && plain.data?.canDownload === true, `HTTP ${plain.status} ${plain.data?.canDownload}`)
	for (const [name, fid, alicePdf, bobPdf] of files) {
		const r = await api('GET', `/${fid}`, 'bob')
		check(`434 AK6 default setting: bob opens ${name}: 200 with content, canDownload false`, r.status === 200 && r.data?.content?.includes('<bpmn:process') && r.data?.canDownload === false, `HTTP ${r.status} ${r.data?.canDownload}`)
		for (const draft of [false, true]) {
			const pub = await api('PUT', `/${fid}/reading-copy`, 'bob', { content: PDF, draft, language: 'en' })
			check(`434 AK6 bob files a ${draft ? 'draft ' : ''}reading copy of ${name}: 403`, pub.status === 403, `HTTP ${pub.status} ${pub.text.slice(0, 120)}`)
		}
		// Where a reading copy would land: next to the file for alice, and in bob's view (his root for a single file share).
		const paths = [['alice', alicePdf], ['bob', bobPdf]]
		const found = []
		for (const [user, pdf] of paths) {
			for (const n of [pdf, pdf.replace(/\.pdf$/, ' (Draft).pdf')]) {
				if ((await dav('GET', user, n.split('/').map(encodeURIComponent).join('/'))).status !== 404) found.push(`${user}:${n}`)
			}
		}
		check(`434 AK6 no PDF of ${name} in alice's or bob's files`, !found.length, found.join(', '))
	}

	let strict = false
	try {
		try { occ('config:app:set', 'core', 'shareapi_allow_view_without_download', '--value=no') } catch { occ('config:app:set', 'core', 'shareapi_allow_view_without_download', '--value=false', '--type=boolean') }
		strict = true
		// The web server keeps app settings in its local cache for 3 s (AppConfig::LOCAL_CACHE_TTL): wait until Nextcloud applies it.
		const davStatus = await settled(() => dav('GET', 'bob', 'Single.bpmn'), (r) => r.status === 403)
		check('434 AK7 strict setting: Nextcloud itself refuses bob\'s WebDAV GET (setting active)', davStatus === 403, `HTTP ${davStatus}`)
		for (const [name, fid] of files) {
			const r = await api('GET', `/${fid}`, 'bob')
			check(`434 AK7 strict setting: bob opens ${name}: 403, no content`, r.status === 403 && !r.text.includes('<bpmn:'), `HTTP ${r.status} ${r.text.slice(0, 120)}`)
		}
		const own = await api('GET', `/${single.data?.id}`, 'alice')
		check('434 AK7 strict setting: alice still opens her own file', own.status === 200 && own.data?.canDownload === true, `HTTP ${own.status}`)
	} catch (e) {
		check('434 AK7 strict setting could be set', strict, String(e.message).slice(0, 160))
	} finally {
		try { occ('config:app:delete', 'core', 'shareapi_allow_view_without_download') } catch { /* nothing to undo */ }
	}
	const back = await settled(() => api('GET', `/${single.data?.id}`, 'bob'), (r) => r.status === 200)
	check('434 risk: setting back to default: bob opens Single.bpmn again', back === 200, `HTTP ${back}`)
}

try {
	await main()
} catch (e) {
	console.log(`ABBRUCH ${e.stack || e}`)
	failed.push(`scenarios aborted: ${String(e.message || e).split('\n')[0]}`)
}
console.log(`==== ${ok} ok / ${failed.length} fehlgeschlagen ====`)
for (const f of failed) console.log(` - ${f}`)
process.exit(failed.length ? 1 : 0)
