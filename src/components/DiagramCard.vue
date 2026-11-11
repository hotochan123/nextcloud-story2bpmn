<!--
  SPDX-FileCopyrightText: 2026 hotochan123
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<template>
	<section class="card" aria-labelledby="story2bpmn-h-diagram">
		<div class="card-head">
			<h2 id="story2bpmn-h-diagram">
				{{ t('story2bpmn', 'Diagram') }}
			</h2>
			<span class="number">{{ view.svg ? state : '' }}</span>
			<div class="right">
				<div class="zoom" role="group" :aria-label="t('story2bpmn', 'Zoom')">
					<button type="button"
						class="button icon"
						:disabled="!view.svg"
						:aria-label="t('story2bpmn', 'Zoom out')"
						:title="t('story2bpmn', 'Zoom out')"
						@click="task('-')">
						<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12" /></svg>
					</button>
					<output aria-live="polite">{{ percent }}</output>
					<button type="button"
						class="button icon"
						:disabled="!view.svg"
						:aria-label="t('story2bpmn', 'Zoom in')"
						:title="t('story2bpmn', 'Zoom in')"
						@click="task('+')">
						<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12" /></svg>
					</button>
					<button type="button"
						class="button"
						:disabled="!view.svg"
						:title="t('story2bpmn', 'Fit')"
						:aria-pressed="zoom === 'fit' ? 'true' : 'false'"
						@click="task('fit')">
						<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" /></svg>
						<span class="fit-text">{{ t('story2bpmn', 'Fit') }}</span>
					</button>
				</div>
			</div>
		</div>

		<div v-if="view.issues && view.issues.length" class="messages" aria-live="polite">
			<div v-for="(i, k) in view.issues"
				:key="k"
				class="message open"
				role="status">
				<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 2.5 20h19z" /><path d="M12 10v4.5M12 17.2v.01" /></svg>
				<div><strong>{{ i.rule }}</strong> {{ i.message }}</div>
			</div>
		</div>

		<div class="mat">
			<!-- The SVG comes from the core (render.ts), texts in it are escaped. -->
			<div v-if="view.svg"
				ref="sheet"
				class="sheet"
				:class="{ fit: zoom === 'fit' }"
				v-html="view.svg" />
			<div v-else class="sheet fit">
				<div class="empty-sheet">
					<strong>{{ t('story2bpmn', 'No diagram yet') }}</strong>
					{{ t('story2bpmn', 'It appears with the first move and grows with every line of the story.') }}
				</div>
			</div>
		</div>

		<div v-if="view.svg" class="publish" :class="{ ready: view.done }">
			<div class="publish-head">
				<h3>{{ t('story2bpmn', 'Publish') }}</h3>
				<p>{{ t('story2bpmn', 'The reading copy (PDF) goes next to the working file in Files; an existing one becomes its new version.') }}</p>
			</div>
			<div class="publish-buttons">
				<button type="button"
					class="button"
					:class="view.done && !publishingReason ? 'main' : 'quiet'"
					:disabled="busy || !view.done || !!publishingReason"
					@click="$emit('publish')">
					<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M12 18v-6M9 15l3-3 3 3" /></svg>
					<span>{{ t('story2bpmn', 'Publish') }}</span>
				</button>
				<button type="button"
					class="button quiet"
					:disabled="busy || !view.done"
					@click="$emit('download', 'pdf')">
					<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
					<span>{{ t('story2bpmn', 'Download PDF') }}</span>
				</button>
				<button type="button"
					class="button quiet"
					:disabled="busy || !view.done"
					@click="$emit('download', 'svg')">
					<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
					<span>{{ t('story2bpmn', 'Download SVG') }}</span>
				</button>
			</div>
			<p class="publish-state" :class="{ open: view.done && !view.readingCopy }">
				{{ outputState }}
			</p>
			<!-- Result here and not only in the header: when stacked, the header is out of view above. -->
			<div ref="resultBox">
				<p class="publish-result" role="status" aria-live="polite">
					<span v-if="result && result.subtype === 'ok'" class="ok">{{ result.text }}</span>
				</p>
				<p class="publish-result" role="alert">
					<span v-if="result && result.subtype === 'error'" class="error">{{ result.text }}</span>
				</p>
			</div>
		</div>
	</section>
</template>

<script>
import { n, t } from '@nextcloud/l10n'
import { nextTick } from 'vue'

// Zoom: "fit" fits the width, otherwise a factor of the natural size of the SVG.
const LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]

export default {
	name: 'DiagrammKarte',
	props: {
		view: { type: Object, required: true },
		busy: { type: Boolean, default: false },
		/** Why publishing is blocked although the story is finished (e.g. unsaved); otherwise empty. */
		publishingReason: { type: String, default: '' },
		/** Result of the last output ({ subtype: 'ok' | 'error', text }) or null. */
		result: { type: Object, default: null },
	},
	emits: ['publish', 'download'],
	data() {
		return { zoom: 'fit', percent: '–' }
	},
	computed: {
		/** State of the outputs in one sentence: blocked with reason, with DRAFT, or ready. */
		outputState() {
			const a = this.view
			if (!a.done) return t('story2bpmn', 'Available once the story is fully told.')
			const parts = []
			if (this.publishingReason) parts.push(this.publishingReason)
			parts.push(a.readingCopy ? t('story2bpmn', 'Ready.') : t('story2bpmn', 'With open points: PDF and SVG carry the DRAFT mark.'))
			return parts.join(' ')
		},
		state() {
			return n('story2bpmn', '%n node', '%n nodes', this.view.nodes) + ' · ' + n('story2bpmn', '%n lane', '%n lanes', this.view.lanes)
		},
	},
	watch: {
		'ansicht.svg'() {
			nextTick(this.apply)
		},
		// Bring a new result into view: if the button is at the bottom edge, it would otherwise lie below.
		result(added) {
			if (added) nextTick(() => this.$refs.resultBox?.scrollIntoView?.({ block: 'nearest' }))
		},
	},
	mounted() {
		this.apply()
		this.ro = new ResizeObserver(() => this.measure())
		this.ro.observe(this.$el)
	},
	beforeUnmount() {
		this.ro?.disconnect()
	},
	methods: {
		t,
		svg() {
			return this.$refs.sheet?.querySelector('svg')
		},
		boxWidth(svg) {
			return svg.viewBox.baseVal?.width || svg.getBBox().width || 1
		},
		apply() {
			const svg = this.svg()
			if (!svg) {
				this.percent = '–'
				return
			}
			svg.style.width = this.zoom === 'fit' ? '' : this.boxWidth(svg) * this.zoom + 'px'
			svg.style.height = this.zoom === 'fit' ? '' : 'auto'
			requestAnimationFrame(this.measure)
		},
		measure() {
			const svg = this.svg()
			this.percent = svg ? Math.round((svg.getBoundingClientRect().width / this.boxWidth(svg)) * 100) + ' %' : '–'
		},
		task(r) {
			const svg = this.svg()
			if (!svg) return
			if (r === 'fit') {
				this.zoom = 'fit'
			} else {
				const now = svg.getBoundingClientRect().width / this.boxWidth(svg)
				this.zoom = r === '+'
					? LEVELS.find((s) => s > now + 0.01) ?? 3
					: [...LEVELS].reverse().find((s) => s < now - 0.01) ?? 0.5
			}
			nextTick(this.apply)
		},
	},
}
</script>
