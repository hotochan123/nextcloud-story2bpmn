<!--
  SPDX-FileCopyrightText: 2026 hotochan123
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<template>
	<NcContent app-name="story2bpmn">
		<NcAppContent>
			<div class="story2bpmn-workshop">
				<header class="head">
					<div class="head-inner">
						<div class="mark">
							<h1>{{ t('story2bpmn', 'Tell a process') }}</h1>
							<p>{{ t('story2bpmn', 'Tell a process step by step and get a BPMN diagram. For documentation, not for execution.') }}</p>
						</div>
						<div class="process">
							<div class="process-text">
								<span class="name">{{ name }}</span>
								<span class="file" :title="file ? file.path : ''">
									{{ file ? fileDisplay : t('story2bpmn', 'Not saved yet') }}
									<span v-if="isUnsaved" class="unsaved">
										<span class="point" aria-hidden="true" />{{ t('story2bpmn', 'Unsaved changes') }}
									</span>
								</span>
								<span class="hint-saved" role="status">{{ confirmation }}</span>
							</div>
							<span class="pill" :class="status.className">{{ status.text }}</span>
						</div>
						<div class="file-buttons werkzeug">
							<select class="language"
								:value="language"
								:aria-label="t('story2bpmn', 'Diagram language')"
								:title="t('story2bpmn', 'Diagram language')"
								:disabled="locked"
								@change="switchLanguage($event)">
								<option value="de" long="de">Deutsch</option>
								<option value="en" long="en">English</option>
							</select>
							<button type="button" class="button quiet" :disabled="locked" @click="added">
								<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M12 11v6M9 14h6" /></svg>
								<span>{{ t('story2bpmn', 'New') }}</span>
							</button>
							<button type="button" class="button quiet" :disabled="locked" @click="open">
								<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
								<span>{{ t('story2bpmn', 'Open …') }}</span>
							</button>
							<button type="button"
								class="button"
								:class="isUnsaved ? 'main' : 'quiet'"
								:disabled="locked || !view?.xml"
								@click="save">
								<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M7 3v5h8V3M7 21v-7h10v7" /></svg>
								<span>{{ t('story2bpmn', 'Save') }}</span>
							</button>
							<button type="button" class="button quiet" :disabled="locked || !view?.xml" @click="saveAs">
								<span>{{ t('story2bpmn', 'Save as …') }}</span>
							</button>
						</div>
					</div>
				</header>
				<div v-if="messages.length" class="messages app-messages" aria-live="polite">
					<div v-for="m in messages"
						:key="m.id"
						class="message"
						:class="m.subtype"
						:role="m.subtype === 'error' ? 'alert' : 'status'">
						<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path :d="m.subtype === 'error' ? 'M12 7.5v5.5M12 16.5v.01' : 'M12 11v5.5M12 7.5v.01'" /></svg>
						<div><strong v-if="m.title">{{ m.title }}</strong>{{ m.title ? ' ' : '' }}{{ m.text }}</div>
						<button type="button"
							class="button quiet icon to"
							:aria-label="t('story2bpmn', 'Dismiss')"
							@click="messages = messages.filter((x) => x !== m)">
							<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
						</button>
					</div>
				</div>
				<main v-if="view" class="workbench" :aria-busy="busy ? 'true' : 'false'">
					<StoryCard :key="cardNum"
						:view="view"
						:moves="view.moves"
						:language="language"
						:busy="busy"
						:change="change" />
					<DiagramCard :view="view"
						:busy="locked"
						:publishing-reason="publishingReason"
						:result="publishResult"
						@publish="publish"
						@download="download" />
				</main>
			</div>
			<NcDialog v-if="dialog?.subtype === 'conflict'"
				:name="t('story2bpmn', 'File changed elsewhere')"
				:message="t('story2bpmn', 'The file was changed elsewhere since you opened it. Overwrite it with this story, or save the story under a new name?')"
				:buttons="conflictButtons"
				@closing="dialog = null" />
			<NcDialog v-if="dialog?.subtype === 'discard'"
				:name="t('story2bpmn', 'Discard unsaved changes?')"
				:message="t('story2bpmn', 'The story has changes that are not saved in a file yet.')"
				:buttons="discardButtons"
				@closing="dialog = null" />
			<NcDialog v-if="dialog?.subtype === 'name'"
				:name="t('story2bpmn', 'Save as')"
				:buttons="nameButtons"
				@closing="dialog = null">
				<NcTextField v-model="dialog.name"
					class="dateiname"
					:label="t('story2bpmn', 'File name')"
					:error="!!dialog.errors"
					:helper-text="dialog.errors"
					@keydown.enter.prevent="saveName(true)" />
			</NcDialog>
		</NcAppContent>
	</NcContent>
</template>

<script>
import { getLanguage, n, t } from '@nextcloud/l10n'
import { markRaw, shallowRef } from 'vue'
import NcAppContent from '@nextcloud/vue/components/NcAppContent'
import NcContent from '@nextcloud/vue/components/NcContent'
import NcDialog from '@nextcloud/vue/components/NcDialog'
import NcTextField from '@nextcloud/vue/components/NcTextField'
import StoryCard from './components/StoryCard.vue'
import DiagramCard from './components/DiagramCard.vue'
import { outputs, outputName, fileSuggestion, diagramLanguage, loadStory, unsaved, workbench } from './workbench.ts'
import { storedText } from './texts.js'
import { fileFromUrl, publish, download, load, put, setUrl, save, chooseFile, chooseFolder } from './fileApi.js'

const accountLanguage = () => diagramLanguage(getLanguage())
let messageNum = 0

export default {
	name: 'App',
	components: { NcAppContent, NcContent, NcDialog, NcTextField, StoryCard, DiagramCard },
	setup() {
		// The core calculates in the browser; saved as a working file in the account's Files.
		return { view: shallowRef(null) }
	},
	data() {
		const language = accountLanguage()
		return {
			language,
			// Language of the loaded or saved state (for "unsaved")
			savedLanguage: language,
			wb: markRaw(workbench(language)),
			running: 0,
			// the open file ({ id, name, path, etag, hash, canSave }) and the moves of its state
			file: null,
			saved: [],
			messages: [],
			dialog: null,
			confirmation: '',
			cardNum: 0,
			// Result of the last output ({ subtype: 'ok' | 'error', text }), shown in the Publish area:
			// on narrow screens the header is out of view.
			publishResult: null,
		}
	},
	computed: {
		busy() {
			return this.running > 0
		},
		locked() {
			return this.busy || this.dialog !== null
		},
		name() {
			return this.view?.moves[0]?.process || t('story2bpmn', 'New process')
		},
		fileDisplay() {
			return (this.file?.path || this.file?.name || '').replace(/^\//, '')
		},
		isUnsaved() {
			return !!this.view && unsaved(this.view.moves, this.saved, this.language, this.savedLanguage)
		},
		/** Publishing needs a saved working file so that PDF and .bpmn match. */
		publishingReason() {
			return this.file && !this.isUnsaved ? '' : t('story2bpmn', 'Save first, then publish.')
		},
		status() {
			const a = this.view
			if (!a?.done) return { text: t('story2bpmn', 'Draft'), className: '' }
			if (a.issues.length) return { text: n('story2bpmn', '%n open point', '%n open points', a.issues.length), className: 'open' }
			return { text: t('story2bpmn', 'Fully told'), className: 'done' }
		},
		conflictButtons() {
			return [
				{ label: t('story2bpmn', 'Cancel'), variant: 'tertiary' },
				{ label: t('story2bpmn', 'Save as …'), variant: 'secondary', callback: () => { this.$nextTick(() => this.saveAs()) } },
				{ label: t('story2bpmn', 'Overwrite'), variant: 'error', callback: () => this.overwrite() },
			]
		},
		discardButtons() {
			const goTo = this.dialog?.goTo
			return [
				{ label: t('story2bpmn', 'Cancel'), variant: 'tertiary' },
				{ label: t('story2bpmn', 'Discard'), variant: 'error', callback: () => { this.$nextTick(() => goTo?.()) } },
			]
		},
		nameButtons() {
			return [
				{ label: t('story2bpmn', 'Cancel'), variant: 'tertiary' },
				{ label: t('story2bpmn', 'Save'), variant: 'primary', callback: () => this.saveName(false) },
			]
		},
	},
	async mounted() {
		window.addEventListener('beforeunload', this.leave)
		await this.change([])
		const id = fileFromUrl()
		if (id) await this.load(id)
	},
	beforeUnmount() {
		window.removeEventListener('beforeunload', this.leave)
	},
	methods: {
		t,
		async change(added) {
			this.running++
			try {
				const r = await this.wb.set(added)
				if (r.ok) {
					this.view = this.wb.view
					this.publishResult = null
				}
				return r
			} finally {
				this.running--
			}
		},
		report(subtype, text, title = '') {
			this.messages = [...this.messages.filter((m) => m.subtype !== subtype), { id: ++messageNum, subtype, text, title }]
		},
		confirm(text) {
			this.confirmation = text
			clearTimeout(this.confirmationTime)
			this.confirmationTime = setTimeout(() => { this.confirmation = '' }, 4000)
		},
		/** Runs `next` only after confirmation if unsaved changes would be lost. */
		afterQuery(goTo) {
			if (this.isUnsaved) this.dialog = { subtype: 'discard', goTo }
			else goTo()
		},
		/** New workbench state from moves; the old one stays if the replay fails. `keep`: the saved state stays (language change). */
		async setState(moves, language, keep = false) {
			const wb = markRaw(workbench(language))
			this.running++
			try {
				const r = await wb.set(moves)
				if (!r.ok) return false
				this.language = language
				this.wb = wb
				this.view = wb.view
				if (!keep) {
					this.saved = moves
					this.savedLanguage = language
				}
				this.publishResult = null
				// Form and menus of the card belong to the old state
				this.cardNum++
				return true
			} finally {
				this.running--
			}
		},
		/** Replays the same moves in the chosen diagram language; file and saved state stay. */
		async switchLanguage(e) {
			const added = e.target.value
			if (added === this.language || this.busy) return
			if (!(await this.setState(this.view?.moves ?? [], added, true))) {
				e.target.value = this.language
				this.report('error', t('story2bpmn', 'The story could not be shown in this language.'))
			}
		},
		added() {
			this.afterQuery(async () => {
				await this.setState([], accountLanguage())
				this.file = null
				this.messages = []
				setUrl(null)
			})
		},
		async open() {
			const id = await chooseFile()
			if (id) this.afterQuery(() => this.load(id))
		},
		async load(id) {
			this.running++
			let r, g
			try {
				r = await load(id)
				if (r.ok) g = await loadStory(r.file.content, accountLanguage())
			} finally {
				this.running--
			}
			if (!r.ok) return this.report('error', r.message, t('story2bpmn', 'Could not open the file:'))
			if (g.errors === 'no-story') return this.report('error', t('story2bpmn', 'The file contains no story. Only working files from Story2BPMN can be continued.'))
			if (g.errors || !(await this.setState(g.moves, g.language))) return this.report('error', t('story2bpmn', 'The story in this file could not be read.'))
			const { content, ...file } = r.file
			this.file = file
			this.messages = []
			if (g.changed) this.report('info', t('story2bpmn', 'The file was changed outside Story2BPMN. The story is continued as told; those outside changes are missing from the new diagram.'), t('story2bpmn', 'Note on the opened file:'))
			setUrl(file.id)
		},
		/** State to save, captured before waiting for the server. */
		state() {
			return { moves: this.view.moves, xml: this.view.xml, language: this.language }
		},
		savedAs(file, s) {
			this.file = file
			this.saved = s.moves
			this.savedLanguage = s.language
			this.messages = this.messages.filter((m) => m.subtype !== 'error')
			setUrl(file.id)
			this.confirm(t('story2bpmn', 'Saved.'))
		},
		async save() {
			if (!this.view?.xml) return
			if (!this.file || !this.file.canSave) return this.saveAs()
			await this.write(false)
		},
		async overwrite() {
			await this.write(true)
		},
		async write(force) {
			const s = this.state()
			this.running++
			let r
			try {
				r = await save(this.file.id, s.xml, this.file, force)
			} finally {
				this.running--
			}
			if (r.ok) return this.savedAs(r.file, s)
			if (r.status === 409 && !force) {
				this.dialog = { subtype: 'conflict' }
				return
			}
			this.report('error', r.message, t('story2bpmn', 'Could not save:'))
		},
		async saveAs() {
			if (!this.view?.xml) return
			const folderId = await chooseFolder()
			if (!folderId) return
			this.dialog = { subtype: 'name', folderId, name: fileSuggestion(this.view.moves[0]?.process), errors: '' }
		},
		/** Returns false so the dialog stays open on an error. */
		async saveName(close) {
			const d = this.dialog
			if (!d || this.busy) return false
			const s = this.state()
			this.running++
			let r
			try {
				r = await put(d.folderId, d.name, s.xml)
			} finally {
				this.running--
			}
			if (!r.ok) {
				d.errors = r.status === 409 ? t('story2bpmn', 'A file with this name already exists. Choose another name.') : r.message
				return false
			}
			this.savedAs(r.file, s)
			if (close) this.dialog = null
			return true
		},
		/** PDF and SVG of the visible state; null (with a message) if they cannot be produced. */
		async create() {
			const moves = this.view.moves
			this.running++
			try {
				return await outputs(moves, this.language)
			} catch {
				const text = t('story2bpmn', 'The reading copy could not be created.')
				this.report('error', text)
				this.publishResult = { subtype: 'error', text }
				return null
			} finally {
				this.running--
			}
		},
		async download(subtype) {
			if (!this.view?.done) return
			this.publishResult = null
			const a = await this.create()
			if (!a) return
			const name = outputName(this.file, this.view.moves[0]?.process, subtype)
			if (subtype === 'pdf') download(a.pdf, name, 'application/pdf')
			else download(a.svg, name, 'image/svg+xml;charset=utf-8')
		},
		async publish() {
			if (!this.view?.done || this.publishingReason) return
			const id = this.file.id
			this.publishResult = null
			const a = await this.create()
			if (!a) return
			this.running++
			let r
			try {
				r = await publish(id, a.pdf)
			} finally {
				this.running--
			}
			if (!r.ok) {
				this.report('error', r.message, t('story2bpmn', 'Could not publish:'))
				this.publishResult = { subtype: 'error', text: t('story2bpmn', 'Could not publish:') + ' ' + r.message }
				return
			}
			this.messages = this.messages.filter((m) => m.subtype !== 'error')
			const text = storedText(r.file.path || r.file.name)
			this.confirm(text)
			this.publishResult = { subtype: 'ok', text }
		},
		// Whoever leaves the page with unsaved changes is asked.
		leave(e) {
			if (!this.isUnsaved) return
			e.preventDefault()
			e.returnValue = ''
		},
	},
}
</script>
