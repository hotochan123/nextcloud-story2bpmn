/**
 * SPDX-FileCopyrightText: 2026 hotochan123
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { createAppConfig } from '@nextcloud/vite-config'
import { join, resolve } from 'node:path'

export default createAppConfig({
	main: resolve(join('src', 'main.js')),
	// file action "Open in Story2BPMN" in the Files app (lib/Listener/FilesScriptListener.php)
	files: resolve(join('src', 'files.js')),
}, {
	appName: 'story2bpmn',
	nodePolyfills: false,
	config: {
		resolve: { dedupe: ['vue'] },
		build: { cssCodeSplit: false },
		// Pruefer des Erzaehltexts (TextEditor.vue) als Modul-Worker neben das Bundle in js/ (assets/ ist nicht im Paket vorgesehen)
		worker: { format: 'es', rollupOptions: { output: { entryFileNames: 'js/[name]-[hash].mjs' } } },
	},
})
