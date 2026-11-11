<!--
  SPDX-FileCopyrightText: 2026 hotochan123
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<template>
	<div class="text-editor">
		<p class="label">
			{{ t('story2bpmn', 'Story text') }}
		</p>
		<div ref="frame" class="editor">
			<div class="gutter" aria-hidden="true"><span v-for="(_, i) in lines" :key="i" :class="{ red: i + 1 === missingLine }">{{ i + 1 }}</span></div>
			<div class="fieldWrap">
				<pre class="color" aria-hidden="true"><span v-for="(z, i) in lines"
					:key="i"
					class="tz"
					:class="{ missing: i + 1 === missingLine }"><template v-for="(part, j) in textParts(z)" :key="j"><b v-if="part.subtype === 'sw'" class="sw">{{ part.text }}</b><span v-else-if="part.subtype === 'o'" :class="['o', 'o-' + part.object]">{{ part.text }}</span><template v-else>{{ part.text }}</template></template>{{ z ? '' : ' ' }}</span></pre>
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
					@keydown.esc.prevent="$emit('cancel')" />
			</div>
		</div>
		<p id="story2bpmn-text-status"
			class="t-status"
			:class="status.errors.length ? 'error' : 'ok'"
			:role="status.errors.length ? 'alert' : 'status'">
			<template v-if="status.errors.length">
				<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></svg>
				<span>{{ status.errors.join(' · ') }}</span>
			</template>
			<template v-else-if="checking">
				<span>{{ t('story2bpmn', 'Checking …') }}</span>
			</template>
			<template v-else-if="status.checked">
				<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
				<span>{{ n('story2bpmn', '%n move recognised.', '%n moves recognised.', status.number) }}</span>
			</template>
		</p>
		<p id="story2bpmn-text-hint" class="hint">
			{{ t('story2bpmn', 'One line per move. Signal words in capitals, names in square brackets. Indentation does not matter. Simple steps also work without brackets: “Accounting shall check invoice.”') }}
		</p>
		<details class="writingAid" open>
			<summary>{{ t('story2bpmn', 'Writing guide') }}</summary>
			<dl>
				<template v-for="(m, i) in pattern" :key="i">
					<dt>{{ m }}</dt>
					<dd>{{ explanation[i] }}</dd>
				</template>
			</dl>
		</details>
		<div class="buttons">
			<button type="button"
				class="button main"
				:disabled="busy || !applicable"
				@click="apply">
				{{ t('story2bpmn', 'Apply') }}
			</button>
			<button type="button" class="button quiet" @click="$emit('cancel')">
				{{ t('story2bpmn', 'Cancel') }}
			</button>
		</div>
	</div>
</template>

<script>
import { n, t } from '@nextcloud/l10n'
import { helpPattern, textChecker, textParts } from '../workbench.ts'

/** Web Worker for the check; without a worker (e.g. forbidden by a policy) the page calculates itself. */
const newWorker = () => new Worker(new URL('../textChecker.worker.ts', import.meta.url), { type: 'module' })

export default {
	name: 'TextEditor',
	props: {
		/** Story text when opened */
		start: { type: String, required: true },
		language: { type: String, required: true },
		busy: { type: Boolean, default: false },
	},
	emits: ['apply', 'cancel'],
	data() {
		return {
			text: this.start,
			// checked: false until the first check is in; for exactly this text.
			status: { checked: false, text: null, number: 0, errors: [], line: 0, moves: [] },
			clock: null,
			checking: false,
		}
	},
	computed: {
		lines() {
			return this.text.split('\n')
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
				t('story2bpmn', 'Either – or, with path headings'),
				t('story2bpmn', 'Two branches side by side'),
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
	created() {
		this.checker = textChecker(this.language, newWorker)
	},
	mounted() {
		this.check()
		this.$refs.field.focus()
	},
	beforeUnmount() {
		clearTimeout(this.clock)
		this.checker.end()
	},
	methods: {
		t,
		n,
		textParts,
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
			// Typed on in the meantime: this result is outdated.
			if (text !== this.text) return
			this.checking = false
			this.status = { checked: true, text, number: r.number, errors: r.errors, line: r.line ?? 0, moves: r.moves }
		},
		/** The moves of the check of exactly this text are taken over (button blocked otherwise). */
		apply() {
			if (!this.applicable) {
				this.$refs.field.focus()
				return
			}
			this.$emit('apply', this.status.moves)
		},
		/** Error from outside (e.g. rejected by the replay): show it, the editor stays open. */
		showError(errors) {
			this.status = { checked: true, text: this.text, number: 0, errors, line: 0, moves: [] }
			this.$refs.field.focus()
		},
	},
}
</script>
