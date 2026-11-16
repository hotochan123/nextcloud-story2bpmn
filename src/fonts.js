/**
 * SPDX-FileCopyrightText: 2026 hotochan123
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
/**
 * Soothing mono (IBM Plex Mono 400/500, latin, OFL) for figures: the same faces as the @font-face rules of
 * css/soothing/tokens.css, which the build drops (vite.config.js) because the built stylesheet cannot address files
 * relative to the bundle. The URLs come from the build and follow the app's real location (apps/ or custom_apps/).
 */
import mono400 from './css/soothing/fonts/IBMPlexMono-400.woff2?url'
import mono500 from './css/soothing/fonts/IBMPlexMono-500.woff2?url'

export const FAMILY = 'IBM Plex Mono'
// copied from tokens.css; fonts.test.js keeps both in step
export const UNICODE_RANGE = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD'

export function registerFonts(fonts = globalThis.document?.fonts) {
	if (!fonts || typeof FontFace === 'undefined') {
		return
	}
	for (const [weight, url] of [['400', mono400], ['500', mono500]]) {
		fonts.add(new FontFace(FAMILY, `url("${url}") format("woff2")`, { weight, style: 'normal', display: 'swap', unicodeRange: UNICODE_RANGE }))
	}
}
