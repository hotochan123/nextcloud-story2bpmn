/**
 * SPDX-FileCopyrightText: 2026 hotochan123
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { createAppConfig } from '@nextcloud/vite-config'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const SOOTHING_TOKENS = /src\/css\/soothing\/tokens\.css$/
const FONT_LICENSE = new URL('./src/css/soothing/fonts/LICENSE-IBMPlexMono.txt', import.meta.url)

/**
 * The Soothing mono (IBM Plex Mono, src/css/soothing/fonts/) ships as files in js/fonts/ and loads from the app
 * itself (font-src 'self'). The relative url() of tokens.css would not point at them from the built stylesheet, so
 * its @font-face rules are dropped here (the file stays an unchanged copy of Soothing) and src/fonts.js registers
 * the same faces with the bundle's runtime URLs (as in folder_retention).
 */
function soothingFonts() {
	return {
		name: 'story2bpmn-soothing-fonts',
		enforce: 'pre',
		transform(code, id) {
			if (SOOTHING_TOKENS.test(id.split('?')[0])) {
				return { code: code.replace(/@font-face\s*\{[^}]*\}/g, ''), map: null }
			}
			return null
		},
		generateBundle() {
			// the SIL Open Font License travels with the font files
			this.emitFile({ type: 'asset', fileName: 'js/fonts/LICENSE-IBMPlexMono.txt', source: readFileSync(FONT_LICENSE) })
		},
	}
}

export default createAppConfig({
	main: resolve(join('src', 'main.js')),
	// file action "Open in Story2BPMN" in the Files app (lib/Listener/FilesScriptListener.php)
	files: resolve(join('src', 'files.js')),
}, {
	appName: 'story2bpmn',
	nodePolyfills: false,
	// next to the bundles: js/ is what the release archive ships
	assetFileNames: (info) => /\.woff2$/.test(info.names?.[0] ?? '') ? 'js/fonts/[name]-[hash][extname]' : undefined,
	config: {
		plugins: [soothingFonts()],
		resolve: { dedupe: ['vue'] },
		build: {
			cssCodeSplit: false,
			// never as a data: URI – one cached file per weight
			assetsInlineLimit: (file) => (/\.woff2$/.test(file) ? false : undefined),
		},
		// Pruefer des Erzaehltexts (TextEditor.vue) als Modul-Worker neben das Bundle in js/ (assets/ ist nicht im Paket vorgesehen)
		worker: { format: 'es', rollupOptions: { output: { entryFileNames: 'js/[name]-[hash].mjs' } } },
	},
})
