// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// API scenarios of the Story2BPMN integration run (dev/it/run.sh starts the Nextcloud and passes its
// address, the passwords and the container name in the environment): open, save with the etag check
// and save as, on working files in the accounts' own Files. Each check prints one line; the end is
// "==== <ok> ok / <failed> fehlgeschlagen ====" followed by " - <label>" per failure.
import http from 'node:http'
import { createHash } from 'node:crypto'

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

	// CSRF: a browser session without request token may not write
	const csrf = await request('PUT', `${API}/${id}`, { user: 'alice', json: { content: '<x/>', etag: '', force: true }, headers: { 'OCS-APIRequest': '' } })
	check('PUT without OCS header or request token: refused, unchanged', csrf.status >= 400 && (await dav('GET', 'alice', 'Processes/Order%20intake.bpmn')).text === XML('mine'), `HTTP ${csrf.status}`)
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
