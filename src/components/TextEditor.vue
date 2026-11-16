<!--
  SPDX-FileCopyrightText: 2026 hotochan123
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<template>
	<div class="text-editor" :class="{ full: phone }">
		<!-- Phone: full screen, Cancel and Done at the top, the status line right above the keyboard. -->
		<div v-if="phone" class="editor-head">
			<button type="button" class="button quiet" data-cancel :class="{ armed }" @click="requestCancel()">
				{{ cancelText }}
			</button>
			<p class="label">
				{{ t('story2bpmn', 'Story text') }}
			</p>
			<button type="button"
				class="button main"
				:disabled="busy || !applicable"
				@click="apply">
				{{ t('story2bpmn', 'Done') }}
			</button>
		</div>
		<div v-else class="subhead editor-subhead">
			<span class="so-rubric label">{{ t('story2bpmn', 'Story text') }}</span>
			<span v-if="status.errors.length" class="so-chip so-chip--danger">{{ t('story2bpmn', 'Not taken over') }}</span>
		</div>
		<div ref="frame" class="editor">
			<div class="gutter" aria-hidden="true"><span v-for="(num, i) in numbers" :key="i" :class="{ err: i + 1 === missingLine }">{{ num ?? '' }}</span></div>
			<div class="fieldWrap">
				<pre class="color" aria-hidden="true"><span v-for="(z, i) in lines"
					:key="i"
					class="tz"
					:class="{ missing: i + 1 === missingLine }"><template v-for="(part, j) in textParts(z)" :key="j"><span v-if="part.subtype === 'sw'" class="sw">{{ part.text }}</span><span v-else-if="part.subtype === 'o'" :class="['o', 'o-' + part.object]"><template v-for="(b, k) in bracketed(part.text)" :key="k"><span v-if="b.mark" class="br">{{ b.text }}</span><template v-else>{{ b.text }}</template></template></span><template v-else>{{ part.text }}</template></template>{{ z ? '' : ' ' }}</span></pre>
				<textarea ref="field"
					v-model="text"
					wrap="off"
					spellcheck="false"
					autocapitalize="off"
					autocomplete="off"
					:aria-label="t('story2bpmn', 'Story text, one line per move')"
					:aria-invalid="status.errors.length ? 'true' : undefined"
					aria-describedby="story2bpmn-text-status story2bpmn-text-hint"
					@input="changed"
					@scroll="hold"
					@keyup="showCursor"
					@click="showCursor"
					@keydown.esc.prevent="requestCancel()" />
			</div>
		</div>
		<div v-if="status.errors.length"
			id="story2bpmn-text-status"
			class="t-status so-notice so-notice--danger"
			role="alert">
			<svg class="so-glyph" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="m9 9 6 6M15 9l-6 6" fill="none" stroke="currentColor" stroke-width="1.6" /></svg>
			<div>
				<span class="so-notice__tag"><b>{{ t('story2bpmn', 'Not taken over:') }}</b><template v-if="errorNumber !== null">{{ ' ' }}<template v-for="(f, k) in figures(t('story2bpmn', 'Line {number}', { number: errorNumber }))" :key="k"><span v-if="f.num" class="so-num">{{ f.text }}</span><template v-else>{{ f.text }}</template></template></template></span>
				<p>{{ errorText }}</p>
			</div>
		</div>
		<p v-else
			id="story2bpmn-text-status"
			class="t-status ok"
			role="status">
			<template v-if="checking">
				<span>{{ t('story2bpmn', 'Checking …') }}</span>
			</template>
			<template v-else-if="status.checked">
				<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
				<span>{{ n('story2bpmn', '%n move recognised.', '%n moves recognised.', status.number) }}</span>
			</template>
		</p>
		<p class="t-live" aria-live="polite">{{ armed ? cancelText : '' }}</p>
		<p id="story2bpmn-text-hint" class="hint">
			{{ t('story2bpmn', 'One line per move. Signal words in capitals, names in square brackets. Indentation does not matter. Simple steps also work without brackets: “Accounting shall check invoice.”') }}
		</p>
		<details class="writingAid" :open="!phone">
			<summary>{{ t('story2bpmn', 'Writing guide') }}</summary>
			<table class="so-table">
				<tbody>
					<tr v-for="(m, i) in pattern" :key="i">
						<td class="pattern">
							<template v-for="(alt, k) in m.split('  ·  ')" :key="k">
								<span v-if="k" class="alt-sep" aria-hidden="true"> · </span><span class="alt"><StoryParts :parts="lineParts(alt)" /></span>
							</template>
						</td>
						<td class="so-text-muted">
							{{ explanation[i] }}
						</td>
					</tr>
				</tbody>
			</table>
		</details>
		<div v-if="!phone" class="buttons">
			<button type="button"
				class="button main"
				:disabled="busy || !applicable"
				@click="apply">
				{{ t('story2bpmn', 'Apply') }}
			</button>
			<button type="button" class="button quiet" data-cancel :class="{ armed }" @click="requestCancel()">
				{{ cancelText }}
			</button>
		</div>
	</div>
</template>

<script>
import { n, t } from '@nextcloud/l10n'
import { editorNumbers, helpPattern, lineCaret, lineParts, sameStory, textChecker, textParts, withoutLine } from '../workbench.ts'
import { figures } from '../headChips.ts'
import StoryParts from './StoryParts.vue'
import { cancelStep, textChanged } from '../textDiscard.ts'
import { createArm } from '../armed.ts'
import { newWorker } from '../checkerWorker.ts'

export default {
	name: 'TextEditor',
	components: { StoryParts },
	props: {
		/** Story text when opened */
		start: { type: String, required: true },
		/** The numbers the story shows on the lines of `start` (storyNumbers), or null (job 449). */
		startNumbers: { type: Array, default: null },
		language: { type: String, required: true },
		/** The moves when opened: an unchanged "continue at" keeps which of two steps of the same name it leads to. */
		previous: { type: Array, default: () => [] },
		busy: { type: Boolean, default: false },
		/** Phone view: full screen. */
		phone: { type: Boolean, default: false },
		/** Text to show instead of `start` (a restored typed text, job 406); it counts as changed. */
		initial: { type: String, default: null },
		/** The text line the caret starts on ("Edit as text" of a line, job 453), or null; ignored with `initial`. */
		cursorLine: { type: Number, default: null },
	},
	// edited: the typed text while it differs from `start`, else null (job 406).
	emits: ['apply', 'cancel', 'edited'],
	data() {
		return {
			text: this.initial ?? this.start,
			// "Cancel" clicked once with a changed text: the next press discards it.
			armed: false,
			// checked: false until the first check is in; for exactly this text.
			status: { checked: false, text: null, number: 0, errors: [], line: 0, moves: [], numbers: [] },
			clock: null,
			checking: false,
		}
	},
	computed: {
		lines() {
			return this.text.split('\n')
		},
		edited() {
			return textChanged(this.text, this.start)
		},
		cancelText() {
			return this.armed ? t('story2bpmn', 'Really discard?') : t('story2bpmn', 'Cancel')
		},
		/** The number column: the numbers the story shows, headings without (job 449). */
		numbers() {
			return editorNumbers(this.text, this.startNumbers ? { text: this.start, numbers: this.startNumbers } : null, this.status, this.language)
		},
		/** The number of the line not taken over, as the story shows it; null without one. */
		errorNumber() {
			if (!this.status.errors.length || !this.status.line || this.status.text !== this.text) return null
			return this.status.numbers?.[this.status.line - 1] ?? null
		},
		/** The messages without their "Line n: " (the number stands in the tag). */
		errorText() {
			return this.status.errors.map(withoutLine).join(' · ')
		},
		missingLine() {
			return this.status.errors.length ? this.status.line : 0
		},
		pattern() {
			return helpPattern(this.language)
		},
		explanation() {
			return [
				t('story2bpmn', 'The start'),
				t('story2bpmn', 'A step; system and deadline optional'),
				t('story2bpmn', 'Wait for a message, a time or a condition'),
				t('story2bpmn', 'Wait for a signal or give one (a notice to everyone)'),
				t('story2bpmn', 'Either – or, with path headings'),
				t('story2bpmn', 'Two or more branches side by side'),
				t('story2bpmn', 'Exception at the step before'),
				t('story2bpmn', 'Merge the path or jump back'),
				t('story2bpmn', 'Continue a postponed path'),
				t('story2bpmn', 'The path ends here'),
			]
		},
		/** Only a text checked as error-free with at least one move: never silently delete everything. */
		applicable() {
			return this.status.checked && this.status.text === this.text && !this.status.errors.length && this.status.number > 0
		},
	},
	watch: {
		edited: {
			handler(v) {
				if (!v) this.armer?.disarm()
				this.$emit('edited', v ? this.text : null)
			},
			immediate: true,
		},
		text(v) {
			if (this.edited) this.$emit('edited', v)
		},
	},
	created() {
		// A plain copy: the worker cannot take a Vue proxy.
		this.plainPrevious = JSON.parse(JSON.stringify(this.previous))
		this.checker = textChecker(this.language, newWorker, this.plainPrevious)
		// The moves of the start text: "Done" with the same story only closes (job 412). Not reactive.
		this.startMoves = undefined
		// The armed Cancel button ("Really discard?"); `armed` mirrors it for the template.
		this.armer = createArm({ onChange: (k) => { this.armed = k } })
	},
	mounted() {
		// Opened with a restored text: the start text is checked once on its own.
		if (this.initial !== null && this.initial !== this.start) {
			this.checker.check(this.start).then((r) => {
				if (!r.errors.length) this.startMoves = r.moves
			})
		}
		this.check()
		this.$refs.field.focus()
		// Opened from the menu of a line: the caret stands at the start of that line, the line in view (job 453).
		if (this.initial === null && this.cursorLine !== null) {
			const at = lineCaret(this.text, this.cursorLine)
			this.$refs.field.setSelectionRange(at, at)
			this.$refs.frame.scrollLeft = 0
			this.showCursor()
			// The card around may still be scrolled down as the story list was: bring the line into the window too
			// (centred: a sticky card head would cover a line scrolled just to the top).
			this.$refs.frame.querySelectorAll('.gutter span')[this.cursorLine]?.scrollIntoView?.({ block: 'center', inline: 'nearest' })
		}
	},
	beforeUnmount() {
		clearTimeout(this.clock)
		this.checker.end()
		this.armer.end()
	},
	methods: {
		t,
		n,
		textParts,
		lineParts,
		figures,
		/** A sentence part of the text with its brackets and sign apart: they are shown quietly. */
		bracketed(text) {
			const m = text.match(/^(\[[@#+!?]?)([\s\S]*?)(\]?)$/)
			if (!m) return [{ text, mark: false }]
			return [{ text: m[1], mark: true }, { text: m[2], mark: false }, { text: m[3], mark: true }].filter((b) => b.text)
		},
		/** The text field never scrolls itself (otherwise it drifts against the color layer); the frame scrolls. */
		hold(e) {
			e.target.scrollTop = 0
			e.target.scrollLeft = 0
		},
		/** The frame scrolls so that the line with the cursor is fully visible (the text field itself never scrolls). */
		showCursor() {
			const field = this.$refs.field
			const frame = this.$refs.frame
			if (!field || !frame) return
			const line = field.value.slice(0, field.selectionEnd).split('\n').length - 1
			const style = getComputedStyle(field)
			const boxHeight = parseFloat(style.lineHeight) || 24
			const above = field.offsetTop + parseFloat(style.paddingTop) + line * boxHeight
			if (above < frame.scrollTop) frame.scrollTop = above - 4
			else if (above + boxHeight > frame.scrollTop + frame.clientHeight) frame.scrollTop = above + boxHeight - frame.clientHeight + 4
		},
		changed() {
			this.armer.disarm()
			this.$nextTick(this.showCursor)
			clearTimeout(this.clock)
			this.checking = true
			this.clock = setTimeout(this.check, 300)
		},
		async check() {
			clearTimeout(this.clock)
			const text = this.text
			this.checking = true
			const r = await this.checker.check(text)
			// Kept even when typed on in the meantime: the first check is the one of the start text.
			if (text === this.start && !r.errors.length) this.startMoves = r.moves
			// Typed on in the meantime: this result is outdated.
			if (text !== this.text) return
			this.checking = false
			this.status = { checked: true, text, number: r.number, errors: r.errors, line: r.line ?? 0, moves: r.moves, numbers: r.numbers ?? [] }
		},
		/** Esc, "Cancel", "Edit as text": a changed text is only discarded on the second press (job 406). `by`: the outside button pressed ("Edit as text"), it keeps the armed state too. */
		requestCancel(by = null) {
			if (cancelStep(this.armed, this.edited) === 'arm') {
				// Returns to normal after 4 s, at a press elsewhere and at Esc (job 413); the Cancel buttons keep it.
				this.armer.arm(true, [...this.$el.querySelectorAll('[data-cancel]'), ...(by ? [by] : [])])
				return
			}
			this.armer.disarm()
			this.$emit('cancel')
		},
		/** The moves of the check of exactly this text are taken over (button blocked otherwise). */
		apply() {
			if (!this.applicable) {
				this.$refs.field.focus()
				return
			}
			this.armer.disarm()
			// The same story as before: nothing changes, "Done" only closes (job 412).
			if (sameStory(this.status.moves, this.startMoves, this.plainPrevious)) return this.$emit('cancel')
			this.$emit('apply', this.status.moves)
		},
		/** Error from outside (e.g. rejected by the replay): show it, the editor stays open. */
		showError(errors) {
			this.status = { checked: true, text: this.text, number: 0, errors, line: 0, moves: [], numbers: [] }
			this.$refs.field.focus()
		},
	},
}
</script>
