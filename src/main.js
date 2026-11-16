/**
 * SPDX-FileCopyrightText: 2026 hotochan123
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { createApp } from 'vue'
import App from './App.vue'
import './css/soothing/tokens.css'
import './css/soothing/components.css'
import './workshop.css'
import { registerFonts } from './fonts.js'

registerFonts()
createApp(App).mount('#story2bpmn-app')
