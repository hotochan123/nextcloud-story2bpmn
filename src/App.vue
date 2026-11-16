<!--
  SPDX-FileCopyrightText: 2026 hotochan123
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<template>
	<NcContent app-name="story2bpmn">
		<NcAppContent>
			<div ref="workshop" class="story2bpmn-workshop" :class="workshopClass" :style="workshopStyle">
				<header class="head">
					<div class="head-inner">
						<!-- Soothing head (job 447): the file name as rubric (on a subprocess level the way back), the process name as title, the state as chips. -->
						<div class="process">
							<LevelCrumbs v-if="!phone && view && view.sub"
								class="head-crumbs"
								:sub="view.sub"
								:busy="busy"
								@up="levelUp"
								@top="openLevel()" />
							<p v-else class="file so-rubric" :title="file ? file.path : ''">
								{{ file ? fileDisplay : t('story2bpmn', 'Not saved yet') }}
								<span v-if="unsavedAll" class="unsaved">
									<span class="point" aria-hidden="true" />{{ t('story2bpmn', 'Unsaved changes') }}
								</span>
							</p>
							<div class="title-row">
								<h1 class="name">
									{{ !phone && view && view.sub ? view.sub.name : name }}
								</h1>
								<span v-for="(p, i) in status"
									:key="i"
									class="so-chip"
									:class="p.className">{{ p.text }}</span>
								<span v-if="reviewWith" class="pill-note">{{ reviewWith }}</span>
							</div>
							<span class="hint-saved" role="status">{{ confirmation }}</span>
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
								class="button quiet phone-keep"
								:disabled="locked || !view?.xml"
								@click="save">
								<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M7 3v5h8V3M7 21v-7h10v7" /></svg>
								<span>{{ t('story2bpmn', 'Save') }}</span>
								<span v-if="phone && unsavedAll"
									class="save-point"
									role="img"
									:aria-label="t('story2bpmn', 'Unsaved changes')" />
							</button>
							<button v-if="copies"
								type="button"
								class="button quiet"
								:disabled="locked || !view?.xml"
								@click="saveAs">
								<span>{{ t('story2bpmn', 'Save as …') }}</span>
							</button>
							<button v-if="file"
								type="button"
								class="button quiet"
								:aria-pressed="sidebarOpen ? 'true' : 'false'"
								@click="toggleSidebar">
								<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" /></svg>
								<span>{{ t('story2bpmn', 'Proposals') }}</span>
								<span v-if="proposals.length" class="so-chip so-chip--count">{{ proposals.length }}</span>
							</button>
							<button v-if="phone"
								type="button"
								class="button quiet icon phone-keep head-more"
								:aria-label="t('story2bpmn', 'More actions')"
								:aria-expanded="headMenu ? 'true' : 'false'"
								:disabled="!view"
								@click="headMenu = !headMenu">
								<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="19" cy="12" r="1.3" fill="currentColor" /></svg>
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
						<div>
							<strong v-if="m.title">{{ m.title }}</strong>{{ m.title ? ' ' : '' }}{{ m.text }}
							<button v-if="m.retry"
								type="button"
								class="button retry"
								:disabled="locked"
								@click="retry">
								{{ t('story2bpmn', 'Try again') }}
							</button>
						</div>
						<button type="button"
							class="button quiet icon to"
							:aria-label="t('story2bpmn', 'Dismiss')"
							@click="messages = messages.filter((x) => x !== m)">
							<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
						</button>
					</div>
				</div>
				<LevelCrumbs v-if="phone && view && view.sub"
					:sub="view.sub"
					:busy="busy"
					@up="levelUp"
					@top="openLevel()" />
				<main v-if="view"
					ref="workbench"
					class="workbench"
					:class="{ stacked, 'with-sidebar': storyColumn === 440, phone, ['pane-' + ps.pane]: phone }"
					:style="workbenchStyle"
					:aria-busy="busy ? 'true' : 'false'">
					<StoryCard :key="cardKey"
						ref="story"
						:view="view"
						:moves="view.levelMoves"
						:language="language"
						:busy="busy || publishing"
						:change="changeLevel"
						:change-all="change"
						:back="back"
						:can-back="canBack"
						:chosen-line="chosen"
						:approval="trusted"
						:notice="notice"
						:compare="compare"
						:proposals="proposals"
						:can-propose="rights.propose"
						:propose="propose"
						:phone="phone"
						:fresh="phone ? ps.fresh : null"
						:example-hint="exampleNote"
						:draft-note="draftNote"
						@restore-draft="restoreDraft"
						@discard-draft="discardDraft"
						@example="openExample"
						@moved="moved"
						@show="showLine"
						@sheet="storySheet = $event"
						@text-mode="textMode = $event"
			@text-draft="textDraft = $event"
						@compare="compare = $event"
						@withdraw="withdrawNow"
						@open="openLevel"
						@as-text="asTextAt"
						@back="levelUp"
						@choose="chooseInStory" />
					<DiagramCard :key="cardKey"
						ref="diagram"
						:view="view"
						:busy="locked || publishing"
						:result="publishResult"
						:chosen="chosen"
						:pan-request="panRequest"
						:stacked="stacked"
						:window-width="windowWidth"
						:window-height="windowHeight"
						:rights="rights"
						:copies="copies"
						:next-number="(approval?.valid?.number ?? 0) + 1"
						:marked="diffMoves"
						:phone="phone"
						:shown="!phone || ps.pane === 'diagram'"
						:chosen-text="chosenText"
						@to-line="toLine"
						@follow="follow = $event"
						@ask="openAsk"
						@approve="dialog = { subtype: 'approve' }"
						@choose="chosen = $event"
						@open="openLevel"
						@publish="publish"
						@download="download" />
				</main>
				<template v-if="phone && view">
					<!-- Phone, story shown: the result of publishing or a download would sit in the hidden diagram card. -->
					<div v-if="publishResult && ps.pane === 'story' && !storySheet && !textMode"
						class="phone-note"
						:class="{ error: publishResult.subtype === 'error' }"
						:role="publishResult.subtype === 'error' ? 'alert' : 'status'">
						<span>{{ publishResult.text }}</span>
						<button type="button" @click="publishResult = null">
							{{ t('story2bpmn', 'Close') }}
						</button>
					</div>
					<div v-else-if="ps.grown && ps.pane === 'story' && !storySheet && !textMode" class="phone-note" role="status">
						<span>{{ freshName ? t('story2bpmn', 'New in the diagram: “{name}”', { name: freshName }, undefined, { escape: false, sanitize: false }) : t('story2bpmn', 'The diagram has grown.') }}</span>
						<button type="button" @click="setPane('diagram')">
							{{ t('story2bpmn', 'View') }}
						</button>
					</div>
					<div v-if="ps.pane === 'diagram' && storySheet" class="phone-note peek" role="status">
						<span>{{ t('story2bpmn', 'Move in progress') }}</span>
						<button type="button" @click="setPane('story')">
							{{ t('story2bpmn', 'Continue') }}
						</button>
					</div>
					<PhoneBar v-if="!textMode && !keyboard"
						:pane="ps.pane"
						:rail="rail"
						:grown="ps.grown"
						:busy="locked || publishing"
						:can-undo="canBack"
						:can-tell="!view.done"
						@pane="setPane"
						@undo="$refs.story?.undo()"
						@next="$refs.story?.openSheet()" />
					<BottomSheet v-if="headMenu"
						class="head-sheet"
						:title="t('story2bpmn', 'More actions')"
						@close="headMenu = false">
						<p class="sheet-file">
							{{ file ? fileDisplay : t('story2bpmn', 'Not saved yet') }}
						</p>
						<p class="sheet-group">
							{{ t('story2bpmn', 'Process') }}
						</p>
						<button v-if="copies"
							type="button"
							class="sheet-item"
							:disabled="locked || !view.xml"
							@click="menuDo(saveAs)">
							{{ t('story2bpmn', 'Save as …') }}
						</button>
						<button type="button" class="sheet-item" :disabled="locked" @click="menuDo(added)">
							{{ t('story2bpmn', 'New') }}
						</button>
						<button type="button" class="sheet-item" :disabled="locked" @click="menuDo(open)">
							{{ t('story2bpmn', 'Open …') }}
						</button>
						<button type="button" class="sheet-item" :disabled="locked" @click="menuDo(openExample)">
							{{ t('story2bpmn', 'Open example') }}
						</button>
						<label class="sheet-item sheet-language">
							<span>{{ t('story2bpmn', 'Diagram language') }}</span>
							<select class="language"
								:value="language"
								:disabled="locked"
								@change="switchLanguage($event)">
								<option value="de" long="de">Deutsch</option>
								<option value="en" long="en">English</option>
							</select>
						</label>
						<template v-if="!view.sub">
							<p class="sheet-group">
								{{ t('story2bpmn', 'Edit') }}
							</p>
							<button type="button"
								class="sheet-item"
								:disabled="busy || compare"
								@click="menuDo(() => { setPane('story'); $refs.story?.toggleText() })">
								{{ t('story2bpmn', 'Edit as text') }}
							</button>
						</template>
						<template v-if="!view.sub">
							<p class="sheet-group">
								{{ t('story2bpmn', 'Publish') }}
							</p>
							<p v-if="!copies" class="sheet-why">
								{{ t('story2bpmn', 'The share does not allow downloads: Save as, Publish and Download are not available.') }}
							</p>
							<button v-if="copies"
								type="button"
								class="sheet-item"
								:disabled="busy || publishing || !view.done"
								:aria-describedby="view.done ? undefined : 'story2bpmn-sheet-publish-why'"
								@click="menuDo(publish)">
								{{ t('story2bpmn', 'Publish') }}
							</button>
							<p v-if="copies && !view.done" id="story2bpmn-sheet-publish-why" class="sheet-why">
								{{ t('story2bpmn', 'Publish once every path is told to its end.') }}
							</p>
							<button v-if="copies"
								type="button"
								class="sheet-item"
								:disabled="busy || !view.svg"
								@click="menuDo(() => download('pdf'))">
								{{ view.readingCopy ? t('story2bpmn', 'Download PDF') : t('story2bpmn', 'Download PDF (DRAFT)') }}
							</button>
							<button v-if="copies"
								type="button"
								class="sheet-item"
								:disabled="busy || !view.svg"
								@click="menuDo(() => download('svg'))">
								{{ view.readingCopy ? t('story2bpmn', 'Download SVG') : t('story2bpmn', 'Download SVG (DRAFT)') }}
							</button>
						</template>
						<template v-if="file || rights.ask || rights.approve">
							<p class="sheet-group">
								{{ t('story2bpmn', 'Approval') }}
							</p>
							<button v-if="rights.ask && !view.sub"
								type="button"
								class="sheet-item"
								:disabled="busy"
								@click="menuDo(openAsk)">
								{{ t('story2bpmn', 'Ask for approval …') }}
							</button>
							<button v-if="rights.approve && !view.sub"
								type="button"
								class="sheet-item"
								:disabled="busy"
								@click="menuDo(() => { dialog = { subtype: 'approve' } })">
								{{ t('story2bpmn', 'Approve as valid version {number}', { number: (approval?.valid?.number ?? 0) + 1 }) }}
							</button>
							<button v-if="file" type="button" class="sheet-item" @click="menuDo(toggleSidebar)">
								{{ proposals.length ? t('story2bpmn', 'Proposals ({count})', { count: proposals.length }) : t('story2bpmn', 'Proposals') }}
							</button>
						</template>
					</BottomSheet>
				</template>
			</div>
			<NcDialog v-if="dialog?.subtype === 'conflict'"
				:name="t('story2bpmn', 'File changed elsewhere')"
				:message="t('story2bpmn', 'The file was changed elsewhere since you opened it. Overwrite it with this story, or save the story under a new name?')"
				:buttons="conflictButtons"
				@closing="dialog = null" />
			<ApprovalDialog v-if="dialog?.subtype === 'ask'"
				:file-id="file ? file.id : 0"
				:file-path="file ? file.path : ''"
				:approval="approval"
				:counts="counts"
				:rows="askRows"
				:language="language"
				@send="ask"
				@close="dialog = null" />
			<NcDialog v-if="dialog?.subtype === 'approve'"
				:name="t('story2bpmn', 'Approve as valid version {number}?', { number: (approval?.valid?.number ?? 0) + 1 })"
				:message="approveMessage"
				:buttons="approveButtons"
				@closing="dialog = null" />
			<NcDialog v-if="dialog?.subtype === 'withdraw'"
				:name="t('story2bpmn', 'Withdraw the request for approval?')"
				:message="t('story2bpmn', 'This state is waiting for approval. Changing it withdraws the request; the process owner is told when you save.')"
				:buttons="withdrawButtons"
				@closing="closeWithdraw" />
			<NcDialog v-if="dialog?.subtype === 'discard'"
				:name="t('story2bpmn', 'Discard unsaved changes?')"
				:message="t('story2bpmn', 'The story has changes that are not saved in a file yet.')"
				:buttons="discardButtons"
				@closing="dialog = null" />
			<NcDialog v-if="dialog?.subtype === 'name'"
				:name="t('story2bpmn', 'Save as')"
				:buttons="nameButtons"
				@closing="closeName">
				<NcTextField v-model="dialog.name"
					class="dateiname"
					:label="t('story2bpmn', 'File name')"
					:error="!!dialog.errors"
					:helper-text="dialog.errors"
					@keydown.enter.prevent="saveName(true)" />
			</NcDialog>
		</NcAppContent>
		<ApprovalSidebar v-if="file && sidebarOpen"
			:file="file"
			:phone="phone"
			:approval="trusted"
			:proposals="proposals"
			:comments="fileComments"
			:process-name="name"
			:changed-lines="diff.filter((d) => d.kind !== 'same').length"
			:can-decide="rights.decide"
			:busy="locked"
			:unsaved="unsavedAll"
			:changed="changed"
			:refresh="sidebarRefresh"
			@decide="decide"
			@choose-line="chooseValidLine"
			@compare="compare = true"
			@close="sidebarOpen = false" />
	</NcContent>
</template>

<script>
import { getCanonicalLocale, getLanguage, n, t } from '@nextcloud/l10n'
import { markRaw, shallowRef } from 'vue'
import NcAppContent from '@nextcloud/vue/components/NcAppContent'
import NcContent from '@nextcloud/vue/components/NcContent'
import NcDialog from '@nextcloud/vue/components/NcDialog'
import NcTextField from '@nextcloud/vue/components/NcTextField'
import StoryCard from './components/StoryCard.vue'
import ApprovalDialog from './components/ApprovalDialog.vue'
import ApprovalSidebar from './components/ApprovalSidebar.vue'
import DiagramCard from './components/DiagramCard.vue'
import PhoneBar from './components/PhoneBar.vue'
import BottomSheet from './components/BottomSheet.vue'
import LevelCrumbs from './components/LevelCrumbs.vue'
import { headChips } from './headChips.ts'
import { outputs, outputName, fileSuggestion, diagramLanguage, loadStory, unsaved, workbench, carry, saveThenPublish, copyState, fileXml, lineParts } from './workbench.ts'
import { afterMove, isRail, keyboardInset, keyboardOpen, phoneAfterResize, phoneStart, showPane } from './phoneView.ts'
import {
	pills, can, isOwner, changeWithdraws, isValidState, changedSinceValid, requested, approved, withdrawn, decided, runSteps, versionOf,
	reviewLabel, validLabel, tagName, askComment, approvedComment, withdrawnComment, decisionComment, proposalText,
	openProposals, acceptProposal, checkProposal, compareLines, diffCounts, diffRows, validLines, approvalAction, overwriteApproval,
	validIndexOf, currentIndexOf, quoteOf, ownerCompares, currentLines, confirmApproval, approveSteps,
	approvalMention, withdrawMention,
} from './approval.ts'
import { approvalCode, MAX_STORY_MOVES } from './core/index.js'
import { readInWorker } from './checkerWorker.ts'
import { comments, comment, versions, nameVersion, setTags, me } from './nextcloudApi.js'
import { reopenedText, droppedText, retargetedText, storedText } from './texts.js'
import { canDownload, copyAllowed, storyWidth } from './diagramView.ts'
import { exampleMoves, exampleHint } from './example.ts'
import { browserStore, draftKey, draftStep, draftTime, makeDraft, offerOf, restoredFile } from './draft.ts'
import { fileFromUrl, publish, download, load, put, setUrl, save, chooseFile, chooseFolder } from './fileApi.js'

const accountLanguage = () => diagramLanguage(getLanguage())
let messageNum = 0

export default {
	name: 'App',
	components: { NcAppContent, NcContent, NcDialog, NcTextField, StoryCard, DiagramCard, ApprovalDialog, ApprovalSidebar, PhoneBar, BottomSheet, LevelCrumbs },
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
			// Accepting a proposal is being read back (in the text worker).
			deciding: false,
			// The workbench has an earlier state to go back to (not reactive itself).
			canBack: false,
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
			// "Publish" runs (saving first included): no second click, no editing meanwhile
			publishing: false,
			// Chosen line (move index): story line and diagram shape are marked together.
			chosen: null,
			panRequest: 0,
			windowWidth: window.innerWidth,
			windowHeight: window.innerHeight,
			// App narrower than 1024 px (tablet upright): diagram band above the story.
			stacked: false,
			// Height of the workbench down to the window edge (wide layout).
			benchHeight: 0,
			// Stacked: height of the diagram card standing at the top (lines scrolled into view stay below it).
			bandBlock: 0,
			// Sidebar with proposals, versions and shares (story narrows to 440 px below 1600).
			sidebarOpen: false,
			sidebarRefresh: 0,
			// Approval state of the open file (src/core/approval.ts), saved with it; null: none.
			approval: null,
			// The opened file has approval details that could not be read (the server still sees them as a claim).
			approvalUnreadable: false,
			// Comments of the open file (proposals are recognised among them, and they confirm the approval state).
			fileComments: [],
			// Loading those comments: 'pending' | 'ok' | 'failed'; the approval state counts only once they are there.
			commentsState: 'pending',
			// Opened or overwritten: the comparison is set once the comments confirm the approval state.
			compareOnLoad: false,
			// Comparison with the valid version in the story and the preview.
			compare: false,
			// Steps of an approval action still to do ("Try again"): { title, steps, done }.
			pending: null,
			// The request was withdrawn by a change: tell the process owner with the next save.
			withdrawPending: false,
			account: me(),
			// Phone view (job 394): below 700 px width or 500 px height one view at a time.
			phone: false,
			// Phone held sideways: the bar is a rail at the left edge.
			rail: false,
			// Pane shown, point "grown" and the NEW mark (phoneView.ts); survives turning the device.
			ps: phoneStart(),
			// On-screen keyboard open (the bar hides), and the height it covers.
			keyboard: false,
			keyboardHeight: 0,
			// Phone: height of the app from its top down to the window edge.
			phoneHeight: 0,
			// Width at the last measurement (a height change alone while typing is the keyboard).
			lastWidth: window.innerWidth,
			follow: true,
			// The move sheet of the story is open (phone), edit as text runs.
			storySheet: false,
			textMode: false,
			// Text typed in "Edit as text" and not applied yet, or null: it counts as unsaved (job 406).
			textDraft: null,
			headMenu: false,
			// The open process is the example of the start page (job 396): the note above the story.
			example: false,
			// Unsaved state found in the browser (job 399): { ...Draft, key } until restored or discarded.
			draftOffer: null,
		}
	},
	computed: {
		busy() {
			return this.running > 0
		},
		storyColumn() {
			return storyWidth(this.windowWidth, this.sidebarOpen)
		},
		workbenchStyle() {
			return {
				'--story-width': this.storyColumn + 'px',
				'--band-block': this.bandBlock + 'px',
				...(!this.phone && !this.stacked && this.benchHeight ? { height: this.benchHeight + 'px' } : {}),
			}
		},
		locked() {
			return this.busy || this.dialog !== null
		},
		workshopClass() {
			return { phone: this.phone, rail: this.rail, keyboard: this.keyboard }
		},
		workshopStyle() {
			return this.phone ? { '--phone-height': this.phoneHeight + 'px', '--keyboard': this.keyboardHeight + 'px' } : null
		},
		/** Text of the story line of the chosen move (phone: the line under the diagram with "To the line"). */
		chosenText() {
			if (this.chosen === null || !this.view) return ''
			const l = this.view.lines.find((x) => x.move === this.chosen)
			return l ? lineParts(l.text).map((p) => p.text).join('').trim() : ''
		},
		/** Name of the move marked NEW (the hint after a move). */
		freshName() {
			const m = this.ps.fresh === null ? null : this.view?.levelMoves[this.ps.fresh]
			return m?.text || m?.question || ''
		},
		/** Form and menus of the cards belong to one state and one level. */
		cardKey() {
			return `${this.cardNum}-${this.view?.level ?? 'main'}-${this.view?.any ?? ''}`
		},
		name() {
			return this.view?.moves[0]?.process || t('story2bpmn', 'New process')
		},
		fileDisplay() {
			return (this.file?.path || this.file?.name || '').replace(/^\//, '')
		},
		/** Key of the unsaved state kept in the browser for what is open now. */
		draftKeyNow() {
			return draftKey(this.account?.uid, this.file?.id ?? null)
		},
		/** The note "Unsaved state from … found" above the story. */
		draftNote() {
			const d = this.draftOffer
			return d && d.key === this.draftKeyNow ? { time: draftTime(d.time, getCanonicalLocale()) } : null
		},
		exampleNote() {
			return exampleHint({ example: this.example, moves: this.view?.moves.length ?? 0, sub: !!this.view?.sub, phone: this.phone })
		},
		isUnsaved() {
			return !!this.view && unsaved(this.view.moves, this.saved, this.language, this.savedLanguage)
		},
		/** Unsaved moves or typed text: the head shows it, leaving the page and "New"/"Open" ask (job 406). */
		unsavedAll() {
			return this.isUnsaved || this.textDraft !== null
		},
		status() {
			const v = this.view
			// The whole story counts, also on a subprocess level; an untold subprocess is an open point.
			return headChips(pills({ approval: this.trusted, done: !!v?.complete, issues: (v?.issues.length ?? 0) + (v?.untold ?? 0), moves: v?.moves ?? [], language: this.language, proposals: this.proposals.length })).map((c) => {
				if (c.word === 'draft') return { text: t('story2bpmn', 'Draft'), className: c.className }
				if (c.word === 'done') return { text: t('story2bpmn', 'Fully told'), className: c.className }
				if (c.word === 'open') return { text: n('story2bpmn', '%n open point', '%n open points', c.count), className: c.className }
				if (c.word === 'valid') return { text: t('story2bpmn', 'Valid version {number}', { number: c.number }), className: c.className }
				return { text: t('story2bpmn', 'For approval'), className: c.className }
			})
		},
		reviewWith() {
			const o = this.trusted?.state === 'review' ? this.trusted.owner : null
			return o ? t('story2bpmn', 'with {name}', { name: o.name || o.uid }) : ''
		},
		ready() {
			return !!this.view?.complete && !this.view.issues.length && this.view.readingCopy
		},
		rights() {
			return can({ approval: this.trusted, me: this.account, ready: this.ready, canSave: !this.file || !!this.file.canSave, hasFile: !!this.file, moves: this.view?.moves ?? [], language: this.language })
		},
		changed() {
			return changedSinceValid(this.trusted, this.view?.moves ?? [], this.language)
		},
		/**
		 * The approval state as Nextcloud confirms it (confirmApproval): what the app shows and allows.
		 * `approval` stays the state of the file and is written back unchanged.
		 */
		confirmed() {
			if (!this.approval) return { approval: null, unconfirmed: false }
			if (this.commentsState !== 'ok') return { approval: null, unconfirmed: this.commentsState === 'failed' }
			return confirmApproval(this.approval, this.fileComments)
		},
		trusted() {
			return this.confirmed.approval
		},
		proposals() {
			return openProposals(this.fileComments, this.trusted)
		},
		diff() {
			if (!this.trusted?.valid || !this.view) return []
			return compareLines(validLines(this.trusted), currentLines(this.view))
		},
		/** The comparison of the dialog "Ask for approval" (job 450): rows numbered like the story, null without a valid version. */
		askRows() {
			return this.trusted?.valid && this.view ? diffRows(this.diff, this.view.storyText) : null
		},
		counts() {
			return this.trusted?.valid ? { number: this.trusted.valid.number, ...diffCounts(this.diff) } : null
		},
		/** Move indices of new and changed lines: framed in the preview while comparing. */
		diffMoves() {
			if (!this.compare || !this.view) return []
			const st = this.view.storyText
			// Only the lines of the level shown frame shapes of its diagram.
			const here = (l) => l && l.sub === this.view.level && l.any === this.view.any
			return [...new Set(this.diff.filter((d) => d.kind === 'new' || d.kind === 'changed').map((d) => st[d.line - 1]).filter(here).map((l) => l.move).filter((m) => m !== undefined))]
		},
		/** The approval line above the story. */
		notice() {
			const a = this.trusted
			if (!this.view) return null
			const unconfirmed = this.confirmed.unconfirmed ? { kind: 'unconfirmed', failed: this.commentsState === 'failed' } : null
			if (!a) return unconfirmed
			if (a.state === 'review' && a.owner && a.request) {
				return { kind: 'review', owner: a.owner.name || a.owner.uid, date: a.request.date, by: a.request.by.name || a.request.by.uid, mine: !isOwner(a, this.account) && !!this.file?.canSave, forOwner: isOwner(a, this.account), canCompare: !!a.valid }
			}
			if (a.valid && this.changed) return { kind: 'changed', number: a.valid.number, lines: this.diff.filter((d) => d.kind !== 'same').length }
			if (a.valid) return { kind: 'valid', number: a.valid.number, date: a.valid.date, by: a.valid.by.name || a.valid.by.uid, forOwner: isOwner(a, this.account) }
			return unconfirmed
		},
		approveMessage() {
			return t('story2bpmn', 'Nextcloud names this state “Valid version {number}”, the reading copy without DRAFT goes next to the working file, and the author is notified.', { number: (this.approval?.valid?.number ?? 0) + 1 })
		},
		approveButtons() {
			return [
				{ label: t('story2bpmn', 'Cancel'), variant: 'tertiary' },
				{ label: t('story2bpmn', 'Approve'), variant: 'primary', callback: () => { this.$nextTick(() => this.approve()) } },
			]
		},
		withdrawButtons() {
			return [
				{ label: t('story2bpmn', 'Cancel'), variant: 'tertiary', callback: () => { this.dialog?.done?.(false) } },
				{ label: t('story2bpmn', 'Change'), variant: 'primary', callback: () => { this.dialog?.done?.(true) } },
			]
		},
		conflictButtons() {
			return [
				{ label: t('story2bpmn', 'Cancel'), variant: 'tertiary' },
				...(this.copies ? [{ label: t('story2bpmn', 'Save as …'), variant: 'secondary', callback: () => { this.$nextTick(() => this.saveAs()) } }] : []),
				{ label: t('story2bpmn', 'Overwrite'), variant: 'error', callback: () => this.overwrite() },
			]
		},
		/** False while the open file is reached through a share that forbids downloads (job 434). */
		copies() {
			return copyAllowed(this.file)
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
	watch: {
		// Messages above the workbench move it down: measure again.
		messages() {
			this.$nextTick(this.measure)
		},
		view(v) {
			// Undoing the example down to nothing empties it: it is a story of one's own from then on.
			if (this.example && !v?.moves.length) this.example = false
			if (this.chosen !== null && !v?.moves[this.chosen]) this.chosen = null
			if (v) this.$nextTick(this.measure)
			this.keepDraft()
		},
		// Typed text is kept like unsaved moves (job 406).
		textDraft() {
			this.keepDraft()
		},
	},
	created() {
		// Kept states (job 399): not reactive; ready only once the start decided about an offer.
		this.drafts = browserStore(window)
		this.draftsWritten = new Set()
		this.draftsReady = false
	},
	async mounted() {
		window.addEventListener('beforeunload', this.leave)
		window.addEventListener('resize', this.measure)
		window.visualViewport?.addEventListener('resize', this.viewport)
		window.visualViewport?.addEventListener('scroll', this.viewport)
		this.ro = new ResizeObserver(() => this.measure())
		this.ro.observe(this.$refs.workshop)
		this.measure()
		await this.change([])
		const id = fileFromUrl()
		if (id) await this.load(id)
		// An unsaved state of this file (or of a new story on the empty start page) is offered back.
		if (!id || this.file?.id === id) await this.offerDraft()
		this.draftsReady = true
	},
	beforeUnmount() {
		window.removeEventListener('beforeunload', this.leave)
		window.removeEventListener('resize', this.measure)
		window.visualViewport?.removeEventListener('resize', this.viewport)
		window.visualViewport?.removeEventListener('scroll', this.viewport)
		this.ro?.disconnect()
	},
	methods: {
		t,
		/** Window, app width and the room down to the window edge. */
		measure() {
			this.windowWidth = window.innerWidth
			this.windowHeight = window.innerHeight
			const typing = !!document.activeElement?.matches?.('input, textarea, select')
			this.phone = phoneAfterResize({ was: this.phone, width: this.windowWidth, height: this.windowHeight, lastWidth: this.lastWidth, typing })
			this.lastWidth = this.windowWidth
			this.rail = this.phone && isRail(this.windowWidth, this.windowHeight)
			if (!this.phone) this.headMenu = false
			this.viewport()
			const app = this.$refs.workshop
			if (app && this.phone) {
				// The app fills the room from its top down to the window edge; the bar is part of it.
				const box = app.closest('#app-content-vue, #app-content, .app-content')
				const top = app.getBoundingClientRect().top + (box?.scrollTop ?? 0)
				this.phoneHeight = Math.max(240, Math.floor(window.innerHeight - top))
				this.stacked = false
				return
			}
			// With the sidebar the story is 440 px narrow (A7): side by side down to 900 px.
			if (app) this.stacked = app.clientWidth < (this.sidebarOpen && this.storyColumn === 440 ? 900 : 1024)
			const wb = this.$refs.workbench
			if (wb && this.stacked) this.bandBlock = wb.querySelector('.diagram-card')?.offsetHeight ?? 0
			if (wb && !this.stacked) {
				// From the top of the workbench down to the bottom of the scrolling app content (or the window).
				const box = wb.closest('#app-content-vue, #app-content, .app-content')
				const bottom = box ? box.getBoundingClientRect().top + box.clientHeight : window.innerHeight
				const top = wb.getBoundingClientRect().top + (box?.scrollTop ?? 0)
				this.benchHeight = Math.max(420, Math.floor(bottom - top))
			}
		},
		/** On-screen keyboard: open or not, and the height it covers (the text editor's status line stands above it). */
		viewport() {
			const v = window.visualViewport
			this.keyboard = this.phone && keyboardOpen(window.innerHeight, v?.height)
			this.keyboardHeight = this.phone ? keyboardInset(window.innerHeight, v) : 0
		},
		chooseInStory(i) {
			// Phone: tapping a line chooses it (again: unchooses); "Show in the diagram" switches.
			if (this.phone) {
				this.chosen = this.chosen === i ? null : i
				return
			}
			this.chosen = i
			this.panRequest++
		},
		setPane(pane) {
			this.ps = showPane(this.ps, pane)
		},
		/** Phone: "Show in the diagram" of a line: the diagram, panned to its shape and framed. */
		showLine(i) {
			this.chosen = i
			this.setPane('diagram')
			this.$nextTick(() => { this.panRequest++ })
		},
		/** Phone: "To the line" under a chosen shape: back in the story, on that line. */
		toLine() {
			const i = this.chosen
			this.setPane('story')
			this.$nextTick(() => this.$refs.story?.showLine(i))
		},
		/** A change of the story (move index told, inserted or changed; null: undo, delete, text). */
		moved(i) {
			if (this.phone) this.ps = afterMove(this.ps, i)
		},
		menuDo(f) {
			this.headMenu = false
			f()
		},
		/** A change on the level shown (the story card): on a subprocess level only its flow changes. */
		changeLevel(added) {
			return this.change(added, true)
		},
		/** "Edit as text" of a line on a subprocess level: the editor holds the whole story, so the main level first, caret on `line` (job 453). */
		async asTextAt(line) {
			if (this.textDraft !== null) return this.textQuery(() => this.asTextAt(line))
			await this.showLevel()
			if (this.view?.sub) return
			await this.$nextTick()
			this.$refs.story?.openText(null, line)
		},
		/** One level up: from the flow of what can come at any time in a subprocess to that subprocess, else to the main level. */
		levelUp() {
			if (this.textDraft !== null) return this.textQuery(() => this.levelUp())
			return this.view?.any !== undefined ? this.showLevel(this.view.level) : this.openLevel()
		},
		/** Show the flow behind move i of the level shown, or the main level (no argument). Changes nothing.
		 *  On a subprocess level move i is what can come at any time while it runs (job 397). */
		openLevel(i) {
			if (this.textDraft !== null) return this.textQuery(() => this.openLevel(i))
			if (typeof i !== 'number') return this.showLevel()
			if (this.view?.sub && !this.view.sub.trigger && this.view.any === undefined) return this.showLevel(this.view.level, i)
			return this.showLevel(i)
		},
		async showLevel(level, any) {
			if (this.busy) return
			await this.busyWhile(async () => {
				const r = await this.wb.show(level, any)
				if (r.ok) {
					this.view = this.wb.view
					this.chosen = null
					this.ps = afterMove(this.ps, null)
				}
			})
		},
		change(added, onLevel = false) {
			return this.changeBy(() => (onLevel ? this.wb.setLevel(added) : this.wb.set(added)))
		},
		/** Undo: back to the state before the last change. */
		back() {
			return this.changeBy(() => this.wb.undo())
		},
		async changeBy(how) {
			if (!(await this.mayChange())) return { ok: false, cancelled: true }
			return this.busyWhile(async () => {
				const r = await how()
				if (r.ok) {
					this.view = this.wb.view
					this.canBack = this.wb.canUndo
					this.publishResult = null
				}
				return r
			})
		},
		/** Runs `fn` while the app counts as busy; its result or error passes through. */
		async busyWhile(fn) {
			this.running++
			try {
				return await fn()
			} finally {
				this.running--
			}
		},
		/** Reads working file `id` and its story (busy meanwhile): `{ r, g }`, `g` only when the file was read. */
		readWorkingFile(id) {
			return this.busyWhile(async () => {
				const r = await load(id)
				return { r, g: r.ok ? await loadStory(r.file.content, accountLanguage()) : undefined }
			})
		},
		clearErrors() {
			this.messages = this.messages.filter((m) => m.subtype !== 'error')
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
			if (!this.unsavedAll) return goTo()
			// Discarding the unsaved changes discards their kept state too.
			const key = this.draftKeyNow
			this.dialog = { subtype: 'discard', goTo: () => { this.forgetDraft(key); return goTo() } }
		},
		/** Text typed in "Edit as text" would go with the card (another level): asked first; confirmed, it is dropped (job 406). */
		textQuery(goTo) {
			this.dialog = { subtype: 'discard', goTo: () => { this.textDraft = null; return goTo() } }
		},
		// ---------- Unsaved state in the browser (job 399) ----------
		/** After every change: an unsaved state is kept at once; one this tab kept goes once it is saved or undone. */
		keepDraft() {
			const key = this.draftKeyNow
			if (!this.view) return
			// While an offer stands, the first change closes it and replaces the state found (job 401).
			const step = draftStep({ ready: this.draftsReady, key, offerKey: this.draftOffer?.key, unsaved: this.unsavedAll, written: this.draftsWritten.has(key) })
			if (step.close) this.draftOffer = null
			if (step.act === 'put') {
				this.drafts.put(key, makeDraft({ moves: this.view.moves, language: this.language, file: this.file, level: this.view.level, any: this.view.any, text: this.textDraft }))
				this.draftsWritten.add(key)
			} else if (step.act === 'remove') {
				this.forgetDraft(key)
			}
		},
		forgetDraft(key) {
			if (!key) return
			this.draftsWritten.delete(key)
			this.drafts.remove(key)
		},
		/** Offers the kept state of what is open now; one equal to it is dropped silently. */
		async offerDraft() {
			const key = this.draftKeyNow
			if (!key || !this.view) return
			const d = await this.drafts.get(key)
			if (!d || key !== this.draftKeyNow) return
			const o = offerOf(d, { moves: this.view.moves, language: this.language })
			if (o) this.draftOffer = { ...o, key }
			else this.forgetDraft(key)
		},
		/** "Restore": the kept state comes back unsaved; saving warns as usual if the file changed meanwhile. */
		async restoreDraft() {
			const d = this.draftOffer
			if (!d || this.locked || d.key !== this.draftKeyNow) return
			if (!(await this.mayChange())) return
			const file = this.file
			this.draftOffer = null
			if (file) this.file = restoredFile(file, d)
			if (!(await this.setState(d.moves, d.language, true))) {
				this.file = file
				this.draftOffer = d
				return this.report('error', t('story2bpmn', 'The unsaved state could not be restored.'))
			}
			// A typed text comes back in the editor, on the main level (job 406).
			if (typeof d.text === 'string' && d.text) return this.$nextTick(() => this.$refs.story?.openText(d.text))
			if (d.level !== undefined) await this.showLevel(d.level, d.any)
		},
		discardDraft() {
			const d = this.draftOffer
			if (!d) return
			this.draftOffer = null
			this.forgetDraft(d.key)
		},
		/**
		 * New workbench state from moves; the old one stays if the replay fails. `keep`: the saved state stays and so does
		 * the undo history (language change, restore, accepted proposal; the state before becomes an entry, job 409).
		 */
		async setState(moves, language, keep = false) {
			return this.busyWhile(async () => {
				const next = await carry(keep ? this.wb : undefined, moves, language)
				if (!next) return false
				const wb = markRaw(next)
				this.language = language
				this.wb = wb
				this.view = wb.view
				this.canBack = wb.canUndo
				if (!keep) {
					this.saved = moves
					this.savedLanguage = language
				}
				this.publishResult = null
				// Form and menus of the card belong to the old state
				this.cardNum++
				// The new card has no editor open: a typed text is gone with the old one.
				this.textDraft = null
				this.chosen = null
				this.ps = afterMove(this.ps, null)
				return true
			})
		},
		/**
		 * While the state waits for approval, the first change withdraws the request (asked once);
		 * the process owner changes without being asked. Resolves to false when cancelled.
		 */
		async mayChange() {
			const a = this.approval
			if (!changeWithdraws(a, this.account)) return true
			const yes = await new Promise((resolve) => { this.dialog = { subtype: 'withdraw', done: resolve } })
			this.dialog = null
			if (!yes) return false
			this.approval = withdrawn(a)
			this.withdrawPending = true
			return true
		},
		closeWithdraw() {
			this.dialog?.done?.(false)
			this.dialog = null
		},
		/** Replays the same moves in the chosen diagram language; file and saved state stay. `asked`: discarding a typed text was confirmed. */
		async switchLanguage(e, asked = false) {
			const added = e.target.value
			if (added === this.language || this.busy) return
			// A typed text would be lost with the editor: asked first (job 406).
			if (this.textDraft !== null && !asked) {
				e.target.value = this.language
				this.dialog = { subtype: 'discard', goTo: () => this.switchLanguage({ target: { value: added } }, true) }
				return
			}
			if (!(await this.mayChange())) {
				e.target.value = this.language
				return
			}
			if (!(await this.setState(this.view?.moves ?? [], added, true))) {
				e.target.value = this.language
				this.report('error', t('story2bpmn', 'The story could not be shown in this language.'))
			}
		},
		added() {
			this.afterQuery(async () => {
				await this.setState([], accountLanguage())
				this.draftOffer = null
				this.example = false
				this.file = null
				this.forgetApproval()
				this.messages = []
				setUrl(null)
			})
		},
		/** The example process: told to its end, not saved; like "New", unsaved changes are asked about first. */
		openExample() {
			this.afterQuery(async () => {
				const language = accountLanguage()
				if (!(await this.setState(exampleMoves(language), language))) return this.report('error', t('story2bpmn', 'The example could not be opened.'))
				this.example = true
				this.draftOffer = null
				this.file = null
				this.forgetApproval()
				this.messages = []
				setUrl(null)
			})
		},
		async open() {
			const id = await chooseFile()
			if (id) this.afterQuery(() => this.load(id))
		},
		async load(id) {
			const { r, g } = await this.readWorkingFile(id)
			if (!r.ok) return this.report('error', r.message, t('story2bpmn', 'Could not open the file:'))
			if (g.errors === 'too-long') return this.report('error', t('story2bpmn', 'The story in this file is too long: Story2BPMN opens stories of up to {n} moves.', { n: MAX_STORY_MOVES }))
			if (g.errors === 'no-story') return this.report('error', t('story2bpmn', 'The file contains no story. Only working files from Story2BPMN can be continued.'))
			if (g.errors || !(await this.setState(g.moves, g.language))) return this.report('error', t('story2bpmn', 'The story in this file could not be read.'))
			const { content, ...file } = r.file
			this.draftOffer = null
			this.file = file
			this.example = false
			this.forgetApproval()
			this.approval = g.approval ?? null
			this.approvalUnreadable = !!g.approvalUnreadable
			this.messages = []
			if (g.approvalUnreadable) this.report('info', t('story2bpmn', 'The approval details of the file cannot be read and are ignored.'))
			// The process owner looks at a state waiting for approval: comparison open (once the comments confirm it).
			this.compareOnLoad = true
			this.loadComments()
			if (g.changed) this.report('info', t('story2bpmn', 'The file was changed outside Story2BPMN. The story is continued as told; those outside changes are missing from the new diagram.'), t('story2bpmn', 'Note on the opened file:'))
			// A 0.1.0 file repaired on opening (job 438): unsaved until Save, so leaving asks and Save writes it.
			// Lines left out on opening (job 439): the same, one note (a second info would replace the first).
			// A "continue at" matched with its step again (job 440): the same.
			if (g.reopened || g.dropped || g.retargeted) {
				this.saved = g.stored
				const notes = [g.dropped && droppedText(g.dropped), g.reopened && reopenedText(g.reopened), g.retargeted && retargetedText(g.retargeted)].filter(Boolean)
				this.report('info', notes.join(' '), t('story2bpmn', 'Note on the opened file:'))
			}
			setUrl(file.id)
		},
		/** State to save, captured before waiting for the server; the working file carries the approval state. */
		async state(approval = this.approval) {
			const moves = this.view.moves
			const language = this.language
			const xml = approval ? await fileXml(moves, language, approval) : this.view.xml
			return { moves, xml, language, approval }
		},
		savedAs(file, s) {
			// Saved: the kept state of before (a new story, or this file) is no longer needed.
			const before = this.draftKeyNow
			this.file = file
			// The file now holds the approval details of this app, readable.
			this.approvalUnreadable = false
			this.forgetDraft(before)
			this.forgetDraft(this.draftKeyNow)
			this.example = false
			this.saved = s.moves
			this.savedLanguage = s.language
			this.clearErrors()
			setUrl(file.id)
			this.confirm(t('story2bpmn', 'Saved.'))
			if (this.withdrawPending && s.approval?.state !== 'review') {
				this.withdrawPending = false
				// Only an owner Nextcloud's comments confirm is mentioned, never an id only the file names.
				const owner = withdrawMention(s.approval, this.fileComments)
				comment(file.id, withdrawnComment(owner, s.language)).catch(() => this.report('info', t('story2bpmn', 'The process owner could not be told that the request was withdrawn.')))
				this.tags(s.approval)
			}
		},
		forgetApproval() {
			this.approval = null
			this.approvalUnreadable = false
			this.fileComments = []
			this.commentsState = 'pending'
			this.compareOnLoad = false
			this.compare = false
			this.pending = null
			this.withdrawPending = false
			this.sidebarOpen = false
		},
		/** Saves like the Save button; resolves to 'saved' | 'conflict' | 'failed' | 'cancelled'. */
		async save() {
			if (!this.view?.xml) return 'cancelled'
			if (!this.file || !this.file.canSave) {
				if (this.copies) return this.saveAs()
				this.report('error', t('story2bpmn', 'This share does not allow downloads: the process cannot be saved under a new name.'))
				return 'failed'
			}
			return this.write(false)
		},
		/** "Overwrite": the story of the browser, the approval state of the file on the server. */
		async overwrite() {
			const id = this.file?.id
			if (!id) return
			const { r, g } = await this.readWorkingFile(id)
			if (!r.ok) return this.report('error', r.message, t('story2bpmn', 'Could not save:'))
			// Unreadable on the server: there is nothing better to keep than the state in the browser.
			const next = g.errors || g.approvalUnreadable
				? { approval: this.approval, withdraw: this.withdrawPending }
				: overwriteApproval(g.approval, this.account)
			const before = this.withdrawPending
			this.withdrawPending = next.withdraw
			if ((await this.write(true, next.approval)) !== 'saved') {
				this.withdrawPending = before
				return
			}
			this.approval = next.approval
			this.compareOnLoad = true
			this.loadComments()
		},
		async write(force, approval = this.approval) {
			const { r, s } = await this.busyWhile(async () => {
				const s = await this.state(approval)
				return { s, r: await save(this.file.id, s.xml, this.file, force) }
			})
			if (r.ok) {
				this.savedAs(r.file, s)
				return 'saved'
			}
			if (r.status === 409 && !force) {
				this.dialog = { subtype: 'conflict' }
				return 'conflict'
			}
			this.report('error', r.message, t('story2bpmn', 'Could not save:'))
			return 'failed'
		},
		/** Resolves to 'saved' once the name dialog saved, 'cancelled' if folder or name are dropped. */
		async saveAs() {
			if (!this.view?.xml || !this.copies) return 'cancelled'
			const folderId = await chooseFolder()
			if (!folderId) return 'cancelled'
			return new Promise((resolve) => {
				this.dialog = { subtype: 'name', folderId, name: fileSuggestion(this.view.moves[0]?.process), errors: '', done: resolve }
			})
		},
		/** The name dialog closes: after saving the promise of saveAs() is already resolved. */
		closeName() {
			this.dialog?.done?.('cancelled')
			this.dialog = null
		},
		/** Returns false so the dialog stays open on an error. */
		async saveName(close) {
			const d = this.dialog
			if (!d || this.busy) return false
			const { r, s } = await this.busyWhile(async () => {
				// A copy is a new working file: the approval state (named versions, comments) stays with the original.
				const s = await this.state(null)
				return { s, r: await put(d.folderId, d.name, s.xml) }
			})
			if (!r.ok) {
				d.errors = r.status === 409 ? t('story2bpmn', 'A file with this name already exists. Choose another name.') : r.message
				return false
			}
			this.forgetApproval()
			this.savedAs(r.file, s)
			d.done?.('saved')
			if (close) this.dialog = null
			return true
		},
		/** PDF and SVG of the visible state; null (with a message) if they cannot be produced. */
		async create(moves = this.view.moves, language = this.language) {
			return this.busyWhile(async () => {
				try {
					return await outputs(moves, language, copyState(this.trusted, moves, language, this.file?.name))
				} catch {
					const text = t('story2bpmn', 'The reading copy could not be created.')
					this.report('error', text)
					this.publishResult = { subtype: 'error', text }
					return null
				}
			})
		},
		async download(subtype) {
			// The whole story counts: a subprocess level that is still empty downloads the whole process too.
			if (!canDownload(this.view) || !this.copies) return
			this.publishResult = null
			const a = await this.create()
			if (!a) return
			const name = outputName(this.file, this.view.moves[0]?.process, subtype)
			if (subtype === 'pdf') download(a.pdf, name, 'application/pdf')
			else download(a.svg, name, 'image/svg+xml;charset=utf-8')
		},
		/** One click: unsaved changes are saved first; a conflict shows its dialog and files nothing. */
		async publish() {
			if (!this.view?.complete || this.busy || this.publishing || !this.copies) return
			this.publishing = true
			this.publishResult = null
			try {
				await saveThenPublish({
					needsSave: !this.file || this.isUnsaved,
					save: () => this.save(),
					publish: () => this.fileReadingCopy(),
				})
			} finally {
				this.publishing = false
			}
		},
		/** The reading copy of the saved state goes next to the working file. */
		async fileReadingCopy() {
			const id = this.file.id
			const a = await this.create(this.saved, this.savedLanguage)
			if (!a) return false
			const r = await this.busyWhile(() => {
				// While the file claims a valid version (readable or not), only the confirmed one goes under its
				// name; a draft never replaces it. The server decides the same (lib/Service/ApprovalCheck.php).
				const draft = (!!this.approval?.valid || this.approvalUnreadable) && !isValidState(this.trusted, this.saved, this.savedLanguage)
				return publish(id, a.pdf, { draft, language: this.savedLanguage })
			})
			if (!r.ok) {
				this.report('error', r.message, t('story2bpmn', 'Could not publish:'))
				this.publishResult = { subtype: 'error', text: t('story2bpmn', 'Could not publish:') + ' ' + r.message }
				return false
			}
			this.clearErrors()
			const text = storedText(r.file.path || r.file.name)
			this.confirm(text)
			this.publishResult = { subtype: 'ok', text }
			return true
		},
		// ---------- Approval ----------
		toggleSidebar() {
			this.sidebarOpen = !this.sidebarOpen
			if (this.sidebarOpen) {
				this.sidebarRefresh++
				this.loadComments()
			}
			this.$nextTick(this.measure)
		},
		async loadComments() {
			const id = this.file?.id
			if (!id) return
			try {
				const c = await comments(id)
				if (this.file?.id !== id) return
				this.fileComments = c
				this.commentsState = 'ok'
			} catch {
				// Without comments there are no proposals, and the approval state is not confirmed.
				if (this.file?.id !== id) return
				if (this.commentsState !== 'ok') this.commentsState = 'failed'
			}
			if (this.compareOnLoad) {
				this.compareOnLoad = false
				this.compare = ownerCompares(this.trusted, this.account)
			}
		},
		/** "Go to line" of a proposal: the current line it points to is chosen (the one accepting changes, job 417). */
		chooseValidLine(proposal) {
			const valid = this.trusted ? validIndexOf(this.trusted, proposal) : null
			const st = this.view?.storyText ?? []
			const at = valid === null ? null : currentIndexOf(currentLines(this.view), validLines(this.trusted), valid)
			const i = at === null ? undefined : st[at]?.move
			if (i === undefined || st[at].sub !== this.view.level || st[at].any !== this.view.any) return
			if (!this.phone) return this.chooseInStory(i)
			// Phone: the full-screen sidebar closes, the story shows that line.
			this.sidebarOpen = false
			this.chosen = i
			this.toLine()
		},
		openAsk() {
			if (!this.rights.ask || this.locked) return
			this.dialog = { subtype: 'ask' }
		},
		/** Saves unsaved changes first; false when that did not happen. */
		async savedFirst() {
			if (this.file && !this.isUnsaved && this.file.canSave) return true
			return (await this.save()) === 'saved'
		},
		/** Writes the approval state; on failure the old one comes back. */
		async writeApproval(next) {
			const before = this.approval
			this.approval = next
			const r = await this.write(false)
			if (r !== 'saved') this.approval = before
			return r === 'saved'
		},
		/** Label of the version saved last (its modification time is in the server's answer). */
		labelStep(label) {
			const id = this.file.id
			const mtime = this.file.mtime
			return {
				name: 'version',
				run: async () => {
					const v = versionOf(await versions(id), mtime)
					if (!v) throw new Error('no version')
					await nameVersion(id, v, label)
				},
			}
		},
		tags(a) {
			if (!this.file || !a?.tag) return
			const id = this.file.id
			const on = a.state === 'review' ? tagName('review', this.language) : a.state === 'valid' ? tagName('valid', this.language) : ''
			const off = [tagName('review', this.language), tagName('valid', this.language)].filter((x) => x !== on)
			setTags(id, on, off).catch(() => this.report('info', t('story2bpmn', 'The state could not be shown as a tag in Files. Only an administrator may create the tag.')))
		},
		async steps(title, steps) {
			this.pending = { title, steps, done: new Set() }
			await this.retry()
		},
		async retry() {
			const p = this.pending
			if (!p) return
			const r = await this.busyWhile(() => runSteps(p.steps, p.done))
			this.messages = this.messages.filter((m) => !m.retry)
			if (!r.failed.length) {
				this.pending = null
				return
			}
			const names = { version: t('story2bpmn', 'name the version'), comment: t('story2bpmn', 'write the comment'), pdf: t('story2bpmn', 'file the reading copy') }
			this.clearErrors()
			this.messages = [...this.messages, {
				id: ++messageNum,
				subtype: 'error',
				title: p.title,
				text: t('story2bpmn', 'Saved, but Nextcloud could not: {steps}.', { steps: r.failed.map((f) => names[f.name] ?? f.name).join(', ') }),
				retry: true,
			}]
		},
		/** Saving of an approval action: true only when the working file was written. */
		async saveApproval() {
			return (await this.write(false)) === 'saved'
		},
		/** "Send request": save, set the state, name the version, mention the process owner. */
		async ask({ owner, note, tag }) {
			this.dialog = null
			if (!this.account) return
			const language = this.language
			const r = await approvalAction({
				saveFirst: () => this.savedFirst(),
				get: () => this.approval,
				set: (a) => { this.approval = a },
				next: (before) => requested(before, owner, this.account, new Date().toISOString(), tag),
				save: () => this.saveApproval(),
				steps: (next) => {
					const id = this.file.id
					return [
						this.labelStep(reviewLabel(next.request.date, language)),
						{ name: 'comment', run: () => comment(id, askComment(owner.uid, this.name, note ?? '', language)) },
					]
				},
				run: (steps) => this.steps(t('story2bpmn', 'Request for approval:'), steps),
			})
			if (r !== 'done') return
			this.tags(this.approval)
			this.confirm(t('story2bpmn', 'Sent to {name} for approval.', { name: owner.name || owner.uid }))
			this.loadComments()
		},
		/** "Approve as valid version n+1". */
		async approve() {
			if (!this.rights.approve || !this.account) return
			const language = this.language
			// The asker as Nextcloud confirms them, taken before saving the new state ends the request.
			const trusted = this.trusted
			let filed = ''
			let number = 0
			const r = await approvalAction({
				saveFirst: () => this.savedFirst(),
				get: () => this.approval,
				set: (a) => { this.approval = a },
				// The base: the file's state with the valid version Nextcloud confirms; the number continues the file's.
				next: (before) => approved({ ...(before ?? { state: 'draft', decided: [], tag: true }), valid: this.trusted?.valid }, this.account, this.view.moves, language, new Date().toISOString(), (before?.valid?.number ?? 0) + 1),
				save: () => this.saveApproval(),
				steps: (next) => {
					const id = this.file.id
					const moves = this.saved
					const notify = approvalMention(trusted)
					number = next.valid.number
					const code = approvalCode(number, language, next.valid.moves)
					// A share that forbids downloads files no reading copy (the server refuses it, job 434).
					const copies = this.copies
					return approveSteps({
						version: this.labelStep(validLabel(number, language)),
						comment: { name: 'comment', run: () => comment(id, approvedComment(notify, number, language, code)) },
						pdf: {
							name: 'pdf',
							run: async () => {
								const a = await outputs(moves, language, copyState(next, moves, language, this.file?.name))
								const res = await publish(id, a.pdf, { draft: false, language })
								if (!res.ok) throw new Error(res.message)
								filed = res.file.path || res.file.name
							},
						},
					}).filter((step) => copies || step.name !== 'pdf')
				},
				run: (steps) => this.steps(t('story2bpmn', 'Approval:'), steps),
			})
			if (r !== 'done') return
			this.tags(this.approval)
			this.compare = false
			const text = t('story2bpmn', 'Approved as valid version {number}.', { number }) + (filed ? ' ' + storedText(filed) : '')
			this.confirm(text)
			this.publishResult = { subtype: 'ok', text }
			this.loadComments()
		},
		/** "Withdraw request": back to the state before, saved at once. */
		async withdrawNow() {
			const a = this.approval
			if (a?.state !== 'review' || this.locked) return
			this.withdrawPending = true
			if (!(await this.writeApproval(withdrawn(a)))) this.withdrawPending = false
		},
		/** Sends a proposal as a comment; resolves to { ok } or { ok: false, error }. */
		async propose(p) {
			const a = this.trusted
			if (!a?.valid || !this.file) return { ok: false, error: t('story2bpmn', 'There is no valid version to propose a change to.') }
			const errors = await checkProposal(a, p, readInWorker)
			if (errors.length) return { ok: false, error: errors[0] === 'no-line' || errors[0] === 'empty' ? t('story2bpmn', 'The new wording is missing or does not fit this line.') : errors.join(' · ') }
			try {
				await comment(this.file.id, proposalText(p, a.valid.language))
			} catch {
				return { ok: false, error: t('story2bpmn', 'The proposal could not be sent as a comment.') }
			}
			this.confirm(t('story2bpmn', 'Proposal sent.'))
			await this.loadComments()
			return { ok: true }
		},
		/** Accept, reject or close a proposal (process owner only). */
		async decide({ proposal, kind }) {
			const a = this.trusted
			if (!this.rights.decide || !a || !this.approval || this.locked || this.deciding) return
			// Deciding writes the file: unsaved changes are never saved along silently (job 416).
			if (this.unsavedAll) return this.report('error', t('story2bpmn', 'Save or discard your changes first'))
			if (kind === 'accepted') {
				// Read back in the text worker: a crafted proposal must not stall the page.
				const file = this.file
				this.deciding = true
				let r
				try {
					r = await acceptProposal(() => ({ file: this.file, moves: this.view.moves, language: this.language }), a, proposal, readInWorker)
				} finally {
					this.deciding = false
				}
				// Another file opened or the story changed meanwhile: the result belongs to the old state.
				if (!r.ok && r.errors[0] === 'changed') return this.file === file ? this.report('error', t('story2bpmn', 'Save or discard your changes first')) : undefined
				if (!r.ok) return this.report('error', t('story2bpmn', 'The proposal no longer fits the current state. Please take it over by hand.'))
				if (!(await this.setState(r.moves, this.language, true))) return this.report('error', t('story2bpmn', 'The proposal no longer fits the current state. Please take it over by hand.'))
			}
			const at = validIndexOf(a, proposal)
			const quote = quoteOf(proposal.label, at === null ? '' : validLines(a)[at])
			if (!(await this.writeApproval(decided(this.approval, proposal.id)))) return
			// Read the comments once the decision comment is there: the sidebar shows the decision from it (job 450).
			await comment(this.file.id, decisionComment(kind, proposal.line, quote, a.valid?.language ?? this.language)).catch(() => {})
			this.loadComments()
		},
		// Whoever leaves the page with unsaved changes is asked.
		leave(e) {
			if (!this.unsavedAll) return
			e.preventDefault()
			e.returnValue = ''
		},
	},
}
</script>
