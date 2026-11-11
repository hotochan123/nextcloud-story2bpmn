/**
 * SPDX-FileCopyrightText: 2026 hotochan123
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
// Working files in the account's Files: API of the server (lib/Controller/FileController.php) and
// the Nextcloud file picker. The server finds files only by their ID in its own folder.
import axios from '@nextcloud/axios'
import { getFilePickerBuilder } from '@nextcloud/dialogs'
import { t } from '@nextcloud/l10n'
import { generateUrl } from '@nextcloud/router'

const api = (path = '') => generateUrl('/apps/story2bpmn/api/files' + path)

/** Error of the server as { status, message, data }; without a response status 0. */
function errors(e) {
	const r = e?.response
	if (!r) return { status: 0, message: t('story2bpmn', 'Could not reach the server.'), data: {} }
	const data = r.data && typeof r.data === 'object' ? r.data : {}
	return { status: r.status, message: typeof data.message === 'string' ? data.message : t('story2bpmn', 'The request could not be carried out.'), data }
}

async function call(request) {
	try {
		return { ok: true, file: (await request()).data }
	} catch (e) {
		return { ok: false, ...errors(e) }
	}
}

export const load = (id) => call(() => axios.get(api('/' + id)))
// etag and hash (SHA-256 of the content) of the loaded state: the server writes only if both still match.
export const save = (id, content, { etag, hash }, force = false) => call(() => axios.put(api('/' + id), { content, etag, hash, force }))
export const put = (folderId, name, content) => call(() => axios.post(api(), { folderId, name, content }))
// Put the reading copy (PDF bytes) next to the working file; folder and name are decided by the server.
export const publish = (id, pdf) => call(() => axios.put(api('/' + id + '/reading-copy'), { content: base64(pdf) }))

/** Bytes as Base64, in chunks (String.fromCharCode with too many arguments throws). */
export function base64(bytes) {
	let s = ''
	for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
	return btoa(s)
}

/** Download a file generated in the browser. */
export function download(fileContent, name, type) {
	const url = URL.createObjectURL(new Blob([fileContent], { type: type }))
	const a = document.createElement('a')
	a.href = url
	a.download = name
	a.rel = 'noopener'
	document.body.appendChild(a)
	a.click()
	a.remove()
	// Safari needs the address for a moment after the click
	setTimeout(() => URL.revokeObjectURL(url), 30000)
}

const isBpmn = (node) => node.type === 'file' && /\.bpmn$/i.test(node.basename)
const isFolder = (node) => node.type === 'folder'

/** Pick a .bpmn; null if the picker is closed without a choice. */
export async function chooseFile() {
	try {
		const [node] = await getFilePickerBuilder(t('story2bpmn', 'Open working file'))
			.setMultiSelect(false)
			.setFilter((n) => isFolder(n) || isBpmn(n))
			.setCanPick(isBpmn)
			.addButton({ label: t('story2bpmn', 'Open'), variant: 'primary', callback: () => {} })
			.build()
			.pickNodes()
		return node?.fileid ?? null
	} catch {
		return null
	}
}

/** Pick a folder (without a selection, the currently open one); null when closed. */
export async function chooseFolder() {
	try {
		const [node] = await getFilePickerBuilder(t('story2bpmn', 'Choose a folder for the working file'))
			.setMultiSelect(false)
			.setMimeTypeFilter(['httpd/unix-directory'])
			.allowDirectories(true)
			.setCanPick(isFolder)
			.addButton({ label: t('story2bpmn', 'Choose'), variant: 'primary', callback: () => {} })
			.build()
			.pickNodes()
		return node?.fileid ?? null
	} catch {
		return null
	}
}

/** ?fileId=<number> of the address, otherwise null. */
export function fileFromUrl(href = window.location.href) {
	const id = new URL(href).searchParams.get('fileId')
	return id && /^\d+$/.test(id) ? Number(id) : null
}

/** The address shows the open file (reloading opens it again), without a new history entry. */
export function setUrl(id) {
	const url = new URL(window.location.href)
	if (id) url.searchParams.set('fileId', String(id))
	else url.searchParams.delete('fileId')
	window.history.replaceState(window.history.state, '', url)
}
