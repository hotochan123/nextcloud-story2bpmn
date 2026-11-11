/**
 * SPDX-FileCopyrightText: 2026 hotochan123
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
// Files app: a click on a .bpmn opens it in Story2BPMN (default action). Loaded as an
// init script via lib/Listener/FilesScriptListener.php.
import { DefaultType, FileType, Permission, registerFileAction } from '@nextcloud/files'
import { t } from '@nextcloud/l10n'
import { generateUrl } from '@nextcloud/router'

const SYMBOL = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M4 5h6v5H4zM14 14h6v5h-6zM7 10v6.5h7M17 14V7.5h-7"/></svg>'

registerFileAction({
	id: 'story2bpmn-open',
	displayName: () => t('story2bpmn', 'Open in Story2BPMN'),
	iconSvgInline: () => SYMBOL,
	enabled: ({ nodes }) => nodes.length === 1
		&& nodes[0].type === FileType.File
		&& /\.bpmn$/i.test(nodes[0].basename)
		&& (nodes[0].permissions & Permission.READ) !== 0,
	async exec({ nodes }) {
		window.location.href = generateUrl('/apps/story2bpmn/') + '?fileId=' + encodeURIComponent(String(nodes[0].fileid))
		return null
	},
	default: DefaultType.DEFAULT,
	order: -50,
})
