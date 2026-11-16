<!--
  SPDX-FileCopyrightText: 2026 hotochan123
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<template>
	<section class="card diagram-card" aria-labelledby="story2bpmn-h-diagram">
		<div class="card-head">
			<h2 id="story2bpmn-h-diagram">
				{{ view.sub?.trigger ? t('story2bpmn', 'Diagram · at any time') : view.sub ? t('story2bpmn', 'Diagram · subprocess') : t('story2bpmn', 'Diagram') }}
			</h2>
			<span class="number"><template v-for="(f, i) in figures(view.svg ? state : '')" :key="i"><b v-if="f.num" class="so-num">{{ f.text }}</b><template v-else>{{ f.text }}</template></template></span>
			<div class="right">
				<!-- Phone (view C2, job 450): Follow, zoom and Fit here too; publishing and approval in the ⋯ sheet of the header. -->
				<!-- Without a diagram Follow and the zoom group are hidden but keep their room: the head does not jump with the first move. -->
				<button type="button"
					class="button quiet follow"
					:class="{ unshown: !view.svg }"
					:disabled="!view.svg"
					:aria-pressed="follow ? 'true' : 'false'"
					:title="t('story2bpmn', 'The diagram moves to the chosen line and to each new move')"
					@click="toggleFollow">
					<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /></svg>
					<span>{{ t('story2bpmn', 'Follow') }}</span>
				</button>
				<div class="zoom"
					:class="{ unshown: !view.svg }"
					role="group"
					:aria-label="t('story2bpmn', 'Zoom')">
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
						class="button fit"
						:disabled="!view.svg"
						:title="t('story2bpmn', 'Fit')"
						:aria-label="t('story2bpmn', 'Fit')"
						:aria-pressed="fitted ? 'true' : 'false'"
						@click="task('fit')">
						<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" /></svg>
						<span class="fit-text">{{ t('story2bpmn', 'Fit') }}</span>
					</button>
				</div>
				<!-- Tapping a box with a plus chooses its line; then it opens from here (finger and pen have no double click). -->
				<button v-if="openable"
					type="button"
					class="button open-sub"
					:disabled="busy"
					@click="$emit('open', chosen)">
					<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4z" /><path d="M12 8v8M8 12h8" /></svg>
					<span>{{ t('story2bpmn', 'Open the flow behind it') }}</span>
				</button>
				<template v-if="!phone && !view.sub">
					<span v-if="copies" class="publish-wrap">
						<button type="button"
							class="button"
							:class="!view.done ? 'quiet' : rights.approve ? '' : 'main'"
							:aria-disabled="busy || !view.done ? 'true' : 'false'"
							:aria-describedby="view.done ? undefined : 'story2bpmn-publish-why'"
							:title="view.done ? undefined : t('story2bpmn', 'Publish once every path is told to its end.')"
							@click="publish">
							<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M12 18v-6M9 15l3-3 3 3" /></svg>
							<span>{{ t('story2bpmn', 'Publish') }}</span>
						</button>
					</span>
					<button v-if="rights.ask"
						type="button"
						class="button"
						:disabled="busy"
						@click="$emit('ask')">
						<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 20 4l-4 16-4-6z" /></svg>
						<span>{{ t('story2bpmn', 'Ask for approval …') }}</span>
					</button>
					<button v-if="rights.approve"
						type="button"
						class="button main"
						:disabled="busy"
						@click="$emit('approve')">
						<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
						<span>{{ t('story2bpmn', 'Approve as valid version {number}', { number: nextNumber }) }}</span>
					</button>
				</template>
				<!-- Desktop and tablet: a visible download button; on a subprocess level it loads the whole process (the same files). -->
				<NcActions v-if="!phone && copies"
					class="download-menu"
					:menu-name="view.sub ? t('story2bpmn', 'Download the whole process') : t('story2bpmn', 'Download')"
					:disabled="!downloadable">
					<template #icon>
						<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
					</template>
					<NcActionButton class="s2b-download-item" :disabled="!downloadable" @click="$emit('download', 'pdf')">
						{{ draft ? t('story2bpmn', 'Download PDF (DRAFT)') : t('story2bpmn', 'Download PDF') }}
					</NcActionButton>
					<NcActionButton class="s2b-download-item" :disabled="!downloadable" @click="$emit('download', 'svg')">
						{{ draft ? t('story2bpmn', 'Download SVG (DRAFT)') : t('story2bpmn', 'Download SVG') }}
					</NcActionButton>
				</NcActions>
			</div>
			<!-- The reason why Publish is locked: its own line under the buttons, visible without hovering, also when they wrap (job 423). -->
			<p v-if="!phone && copies && !view.sub && !view.done" id="story2bpmn-publish-why" class="publish-why">
				{{ t('story2bpmn', 'Not every path has an end yet.') }}
			</p>
			<!-- A share that forbids downloads (job 434): no copy leaves the file, and the reason stands where the buttons were. -->
			<p v-if="!phone && !copies" class="publish-why">
				{{ t('story2bpmn', 'The share does not allow downloads: Save as, Publish and Download are not available.') }}
			</p>
		</div>

		<!-- Result here: next to the button that started it. -->
		<p class="publish-result" role="status" aria-live="polite">
			<span v-if="result && result.subtype === 'ok'" class="ok">{{ result.text }}</span>
		</p>
		<p class="publish-result" role="alert">
			<span v-if="result && result.subtype === 'error'" class="error">{{ result.text }}</span>
		</p>

		<div v-if="view.issues && view.issues.length" class="messages issues" aria-live="polite">
			<div v-for="(i, k) in view.issues"
				:key="k"
				class="message open"
				role="status">
				<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 2.5 20h19z" /><path d="M12 10v4.5M12 17.2v.01" /></svg>
				<div><strong>{{ i.rule }}</strong> {{ i.message }}</div>
			</div>
		</div>

		<div class="area" :style="stacked && view.svg ? { height: band + 'px' } : null">
			<!-- Keyboard (job 423): Tab reaches the area; arrows pan, + and − zoom, 0 fits, Enter shows the chosen line. -->
			<div ref="mat"
				class="mat"
				tabindex="0"
				role="group"
				:aria-label="t('story2bpmn', 'Diagram')"
				aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown + - 0 Enter"
				@scroll="scrolled"
				@touchstart.passive="touchStart"
				@touchend.passive="touchEnd"
				@touchcancel.passive="touchEnd"
				@keydown="keyHand"
				@pointerdown="dragStart"
				@click="clickShape"
				@dblclick="openShape">
				<!-- The SVG comes from the core (render.ts), texts in it are escaped. -->
				<div v-if="view.svg"
					ref="sheet"
					class="sheet"
					v-html="view.svg" />
				<div v-else class="sheet empty">
					<div class="empty-sheet">
						<strong>{{ t('story2bpmn', 'No diagram yet') }}</strong>
						<!-- What the app is for: only here, on the empty start of a process, no longer in the head (job 447). -->
						<span v-if="!view.sub && !view.moves?.length" class="about">{{ t('story2bpmn', 'Tell a process step by step and get a BPMN diagram. For documentation, not for execution.') }}</span>
						{{ t('story2bpmn', 'It appears with the first move and grows with every line of the story.') }}
					</div>
				</div>
			</div>
			<!-- Pool and lane names stay at the left edge while panning sideways. -->
			<div v-if="names" class="names" :style="{ width: names.width }" aria-hidden="true">
				<div class="names-inner" :style="{ transform: 'translateY(' + (-scroll.top) + 'px)' }">
					<span v-if="names.pool" class="pool-name" :style="names.pool">{{ view.pool.name }}</span>
					<span v-for="(l, i) in names.lanes"
						:key="i"
						class="lane-name"
						:style="l.style">{{ l.name }}</span>
				</div>
			</div>
			<div v-if="view.svg && !whole" ref="map" class="overview">
				<button type="button"
					class="button quiet overview-toggle"
					:aria-expanded="overviewOpen ? 'true' : 'false'"
					@click="toggleOverview">
					<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path :d="overviewOpen ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'" /></svg>
					<span>{{ t('story2bpmn', 'Overview') }}</span>
				</button>
				<div v-if="overviewOpen"
					class="overview-map"
					:style="{ width: map.w + 'px', height: map.h + 'px' }"
					@click="mapClick">
					<img :src="mapImage" alt="" draggable="false">
					<span class="overview-window" :style="mapWindow" />
				</div>
			</div>
			<!-- Phone: a tapped shape shows its line; only "To the line" goes back to the story (two steps). -->
			<div v-if="phone && chosen !== null && chosenText" class="chosen-line" role="status">
				<span class="chosen-num">{{ chosen + 1 }}</span>
				<span class="chosen-text">{{ chosenText }}</span>
				<button type="button" class="button main" @click="$emit('to-line')">
					{{ t('story2bpmn', 'To the line') }}
				</button>
			</div>
		</div>
	</section>
</template>

<script>
import { n, t } from '@nextcloud/l10n'
import { nextTick } from 'vue'
import NcActions from '@nextcloud/vue/components/NcActions'
import NcActionButton from '@nextcloud/vue/components/NcActionButton'
import { anchorScroll, bandHeight, canDownload, clampZoom, diagramKey, fitScale, followScroll, nextLevel, overviewSize, startZoom, wheelZoom, zoomBounds, OVERVIEW_KEY } from '../diagramView.ts'
import { figures } from '../headChips.ts'

/** Padding of the sheet around the SVG (CSS .sheet). */
const PAD = 10
/** Width of pool header plus lane header in the SVG (render.ts). */
const HEADS = 64
/** Phone: width of the strip of standing lane names. */
const PHONE_NAMES = 24
/** A touch that moved more than this (px) pans and chooses no shape. */
const TAP_SLOP = 4
/** A click this soon (ms) after a pinch belongs to it and chooses no shape. */
const PINCH_CLICK = 500

const storedOverview = () => {
	try {
		return window.localStorage?.getItem(OVERVIEW_KEY) !== 'closed'
	} catch {
		return true
	}
}

export default {
	name: 'DiagrammKarte',
	components: { NcActions, NcActionButton },
	props: {
		view: { type: Object, required: true },
		busy: { type: Boolean, default: false },
		/** Result of the last output ({ subtype: 'ok' | 'error', text }) or null. */
		result: { type: Object, default: null },
		/** Chosen line: move index (0-based) or null. */
		chosen: { type: Number, default: null },
		/** Grows when a line was chosen in the story: then the diagram follows. */
		panRequest: { type: Number, default: 0 },
		/** Narrow screen (tablet upright): diagram as a band above the story. */
		stacked: { type: Boolean, default: false },
		windowWidth: { type: Number, default: 1366 },
		windowHeight: { type: Number, default: 768 },
		/** What approval allows ({ ask, approve, … } of approval.ts can()). */
		rights: { type: Object, default: () => ({}) },
		/** May the open file leave as a copy (Publish, PDF/SVG)? False on a share that forbids downloads. */
		copies: { type: Boolean, default: true },
		nextNumber: { type: Number, default: 1 },
		/** Move indices whose shapes are framed as changed since the valid version (comparison). */
		marked: { type: Array, default: () => [] },
		/** Phone view (App.vue): one view at a time, the controls in the bar. */
		phone: { type: Boolean, default: false },
		/** The card is shown (phone: hidden while the story is shown; it measures 0 × 0 then). */
		shown: { type: Boolean, default: true },
		/** Text of the story line of the chosen move (phone). */
		chosenText: { type: String, default: '' },
	},
	emits: ['publish', 'download', 'choose', 'ask', 'approve', 'open', 'to-line', 'follow'],
	data() {
		return {
			// null: zoom of startZoom(); else the user's choice ('fit' or a factor)
			choice: null,
			scale: 1,
			fitted: false,
			follow: true,
			// Panned by hand since the last choice: following waits for the next one.
			hand: false,
			// Phone: folded at the start; folding there is not stored.
			overviewOpen: this.phone ? false : storedOverview(),
			// A pan that came while the card was hidden (phone): done once it is shown.
			pending: null,
			scroll: { left: 0, top: 0 },
			room: { w: 0, h: 0 },
			natural: { w: 0, h: 0 },
		}
	},
	computed: {
		/** The chosen line has a flow behind it (main level, or what can come at any time on a subprocess level). */
		openable() {
			return !this.view.sub?.trigger && this.chosen !== null && !!this.view.subs?.[this.chosen]
		},
		state() {
			return n('story2bpmn', '%n node', '%n nodes', this.view.nodes) + ' · ' + n('story2bpmn', '%n lane', '%n lanes', this.view.lanes)
		},
		draft() {
			return !this.view.readingCopy
		},
		/** The whole process has a diagram (also on a subprocess level that is still empty). */
		downloadable() {
			return canDownload(this.view, this.busy)
		},
		percent() {
			return this.view.svg && this.natural.w ? Math.round(this.scale * 100) + ' %' : '–'
		},
		band() {
			return bandHeight(this.natural.h, this.windowHeight, 2 * PAD)
		},
		/** The whole diagram is in view: no panning, no overview. */
		whole() {
			return this.natural.w * this.scale + 2 * PAD <= this.room.w + 1 && this.natural.h * this.scale + 2 * PAD <= this.room.h + 1
		},
		map() {
			return overviewSize(this.natural)
		},
		mapImage() {
			return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(this.view.svg)
		},
		mapWindow() {
			const k = this.map.scale / this.scale
			const w = Math.min(this.map.w, this.room.w * k)
			const h = Math.min(this.map.h, this.room.h * k)
			return {
				width: w + 'px',
				height: h + 'px',
				transform: `translate(${Math.max(0, (this.scroll.left - PAD) * k)}px, ${Math.max(0, (this.scroll.top - PAD) * k)}px)`,
			}
		},
		names() {
			const pool = this.view.pool
			if (!this.view.svg || !pool || !this.view.bands?.length) return null
			if (this.scroll.left <= PAD + pool.x * this.scale) return null
			const k = this.scale
			// Phone: a 24 px strip with the lane names upright, without the pool name.
			if (this.phone) {
				return {
					width: PHONE_NAMES + 'px',
					pool: null,
					lanes: this.view.bands.map((b) => ({
						name: b.name,
						style: { top: PAD + b.y * k + 'px', height: b.h * k + 'px', left: 0, width: PHONE_NAMES + 'px', fontSize: '11px' },
					})),
				}
			}
			const w = HEADS * k
			return {
				width: w + 'px',
				pool: { top: PAD + pool.y * k + 'px', height: pool.h * k + 'px', width: 30 * k + 'px', fontSize: 12 * k + 'px' },
				lanes: this.view.bands.map((b) => ({
					name: b.name,
					style: { top: PAD + b.y * k + 'px', height: b.h * k + 'px', left: 30 * k + 'px', width: w - 30 * k + 'px', fontSize: 11.5 * k + 'px' },
				})),
			}
		},
	},
	watch: {
		'view.svg'(now, old) {
			// A new move: the diagram follows to where the story continues.
			nextTick(() => {
				this.layout()
				this.markChosen()
				if (now && now !== old) {
					this.hand = false
					// Hidden (phone, story shown): follow once the diagram is shown.
					if (!this.shown) this.pending = 'here'
					else this.panHere()
				}
			})
		},
		shown(v) {
			if (!v) return
			nextTick(() => {
				this.layout()
				this.markChosen()
				const p = this.pending
				this.pending = null
				if (p === 'here') this.panHere()
				else if (p === 'chosen' && this.chosen !== null) this.panTo(`g[data-move="${this.chosen + 1}"]`)
			})
		},
		phone(v) {
			if (v) this.overviewOpen = false
			nextTick(this.layout)
		},
		chosen() {
			nextTick(this.markChosen)
		},
		marked() {
			nextTick(this.markChosen)
		},
		panRequest() {
			this.hand = false
			if (!this.shown) {
				this.pending = 'chosen'
				return
			}
			nextTick(() => {
				this.layout()
				if (this.chosen !== null) this.panTo(`g[data-move="${this.chosen + 1}"]`)
			})
		},
		stacked() {
			nextTick(this.layout)
		},
		windowWidth() {
			nextTick(this.layout)
		},
		windowHeight() {
			nextTick(this.layout)
		},
	},
	mounted() {
		// The card is rebuilt with each state and level: the bar of the phone view shows its follow state.
		this.$emit('follow', this.follow)
		this.ro = new ResizeObserver(() => this.layout())
		this.ro.observe(this.$refs.mat)
		// Not passive: a pinch on the area zooms the diagram, not the page.
		const mat = this.$refs.mat
		mat.addEventListener('wheel', this.wheel, { passive: false })
		mat.addEventListener('touchmove', this.touchMove, { passive: false })
		mat.addEventListener('gesturestart', this.gestureStart)
		mat.addEventListener('gesturechange', this.gestureChange)
		mat.addEventListener('gestureend', this.gestureEnd)
		nextTick(() => {
			this.layout()
			this.markChosen()
		})
	},
	beforeUnmount() {
		this.ro?.disconnect()
		this.dragEnd()
		const mat = this.$refs.mat
		if (mat) {
			mat.removeEventListener('wheel', this.wheel)
			mat.removeEventListener('touchmove', this.touchMove)
			mat.removeEventListener('gesturestart', this.gestureStart)
			mat.removeEventListener('gesturechange', this.gestureChange)
			mat.removeEventListener('gestureend', this.gestureEnd)
		}
		if (this.pinchFrame) cancelAnimationFrame(this.pinchFrame)
	},
	methods: {
		figures,
		t,
		svg() {
			return this.$refs.sheet?.querySelector('svg')
		},
		/** Measures the area and the SVG, then sets the zoom (the user's or the start zoom). */
		layout() {
			const mat = this.$refs.mat
			const svg = this.svg()
			if (!mat) return
			// Hidden (phone): nothing to measure; the zoom stays until it is shown again.
			if (!mat.clientWidth && !mat.clientHeight) return
			this.room = { w: mat.clientWidth, h: mat.clientHeight }
			if (!svg) {
				this.natural = { w: 0, h: 0 }
				return
			}
			const box = svg.viewBox.baseVal
			this.natural = { w: box?.width || 1, h: box?.height || 1 }
			const fit = fitScale({ w: this.room.w - 2 * PAD, h: this.room.h - 2 * PAD }, this.natural)
			if (this.choice === null) {
				const s = startZoom({ windowWidth: this.windowWidth, stacked: this.stacked, fit, phone: this.phone })
				this.scale = s.scale
				this.fitted = s.fit
			} else if (this.choice === 'fit') {
				this.scale = fit
				this.fitted = true
			} else {
				this.scale = this.choice
				this.fitted = false
			}
			svg.style.width = this.natural.w * this.scale + 'px'
			svg.style.height = this.natural.h * this.scale + 'px'
		},
		task(r) {
			if (!this.svg()) return
			this.choice = r === 'fit' ? 'fit' : nextLevel(this.scale, r)
			this.layout()
		},
		toggleFollow() {
			this.follow = !this.follow
			if (this.follow) this.hand = false
			this.$emit('follow', this.follow)
		},
		panHere() {
			this.panTo(this.view.here ? `g[data-node="${CSS.escape(this.view.here)}"]` : this.lastShape())
		},
		toggleOverview() {
			this.overviewOpen = !this.overviewOpen
			if (this.phone) return
			try {
				window.localStorage?.setItem(OVERVIEW_KEY, this.overviewOpen ? 'open' : 'closed')
			} catch {
				// private mode: the state lives until the page is left
			}
		},
		scrolled() {
			const mat = this.$refs.mat
			this.scroll = { left: mat.scrollLeft, top: mat.scrollTop }
		},
		byHand() {
			this.hand = true
		},
		/** Point of the area (view px, inside its border) under a client position. */
		areaPoint(x, y) {
			const mat = this.$refs.mat
			const r = mat.getBoundingClientRect()
			return { x: x - r.left - mat.clientLeft, y: y - r.top - mat.clientTop }
		},
		/** Zoom of a gesture: through the app zoom, then the scroll that keeps the anchor in place. */
		zoomAt(to, start, scroll, from, now) {
			const mat = this.$refs.mat
			this.hand = true
			this.choice = to
			this.layout()
			const s = anchorScroll({ start, now, scroll, from, to: this.scale, pad: PAD })
			mat.scrollLeft = s.left
			mat.scrollTop = s.top
			this.scrolled()
		},
		bounds() {
			return zoomBounds(fitScale({ w: this.room.w - 2 * PAD, h: this.room.h - 2 * PAD }, this.natural))
		},
		/** Ctrl or ⌘ with the wheel, and a trackpad pinch (sent as a wheel with ctrlKey): zoom under the pointer. */
		wheel(e) {
			this.hand = true
			if (!(e.ctrlKey || e.metaKey) || !this.svg()) return
			e.preventDefault()
			// Safari: its gesture events zoom already.
			if (this.gesture) return
			const mat = this.$refs.mat
			const p = this.areaPoint(e.clientX, e.clientY)
			const from = this.scale
			this.zoomAt(wheelZoom(from, e.deltaY, e.deltaMode, this.bounds()), p, { left: mat.scrollLeft, top: mat.scrollTop }, from)
		},
		touchStart(e) {
			this.hand = true
			// A device with touch events pinches through them (Safari on iPad/iPhone sends gesture events as well).
			this.touchSeen = true
			if (e.touches.length === 2 && this.svg()) {
				const [a, b] = e.touches
				const mat = this.$refs.mat
				this.pinch = {
					dist: Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)),
					mid: this.areaPoint((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2),
					scale: this.scale,
					scroll: { left: mat.scrollLeft, top: mat.scrollTop },
					bounds: this.bounds(),
				}
				this.pinchedAt = Date.now()
			} else if (e.touches.length !== 2) this.pinch = null
		},
		/** Two fingers: the diagram zooms around the point between them and pans with them. */
		touchMove(e) {
			const p = this.pinch
			if (!p || e.touches.length !== 2) return
			e.preventDefault()
			const [a, b] = e.touches
			this.pinchTouch = {
				dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
				mid: this.areaPoint((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2),
			}
			this.pinchedAt = Date.now()
			if (this.pinchFrame) return
			this.pinchFrame = requestAnimationFrame(() => {
				this.pinchFrame = null
				const q = this.pinch
				const t0 = this.pinchTouch
				if (!q || !t0) return
				this.zoomAt(clampZoom(q.scale * t0.dist / q.dist, q.bounds), q.mid, q.scroll, q.scale, t0.mid)
			})
		},
		touchEnd(e) {
			if (this.pinch && e.touches.length < 2) {
				this.pinch = null
				this.pinchedAt = Date.now()
			}
		},
		/** Safari (Mac trackpad, no touch events there): its own pinch events. */
		gestureStart(e) {
			if (!this.svg()) return
			e.preventDefault()
			// Touch pinch zooms already: one zoom per pinch, else the anchors fight.
			if (this.touchSeen || this.pinch) return
			const mat = this.$refs.mat
			this.gesture = { scale: this.scale, at: this.areaPoint(e.clientX, e.clientY), scroll: { left: mat.scrollLeft, top: mat.scrollTop }, bounds: this.bounds() }
		},
		gestureChange(e) {
			const g = this.gesture
			if (!g) return
			e.preventDefault()
			this.zoomAt(clampZoom(g.scale * e.scale, g.bounds), g.at, g.scroll, g.scale)
		},
		gestureEnd(e) {
			if (!this.gesture) return
			e.preventDefault()
			this.gesture = null
			this.pinchedAt = Date.now()
		},
		/** Keys on the focused area (job 423); PageUp, PageDown, Home and End pan natively. */
		keyHand(e) {
			const mat = this.$refs.mat
			if (!mat || e.target !== mat) return
			const a = diagramKey(e, { w: mat.clientWidth, h: mat.clientHeight })
			if (!a) {
				if (['PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) this.hand = true
				return
			}
			if ('show' in a) {
				if (this.chosen === null) return
				e.preventDefault()
				this.hand = false
				this.panTo(`g[data-move="${this.chosen + 1}"]`, true)
				return
			}
			e.preventDefault()
			if ('pan' in a) {
				this.hand = true
				mat.scrollBy(a.pan.dx, a.pan.dy)
			} else if ('fit' in a) this.task('fit')
			else if (this.svg()) {
				// Around the middle of what is in view.
				const from = this.scale
				this.zoomAt(nextLevel(from, a.zoom), { x: mat.clientWidth / 2, y: mat.clientHeight / 2 }, { left: mat.scrollLeft, top: mat.scrollTop }, from)
			}
		},
		/** Mouse: dragging pans the area (finger and pen pan natively). */
		dragStart(e) {
			// Finger and pen: remember where the touch began; a pan of more than a few pixels is no tap.
			if (e.pointerType !== 'mouse') {
				this.touch = { x: e.clientX, y: e.clientY }
				return
			}
			if (e.button !== 0) return
			this.hand = true
			const mat = this.$refs.mat
			this.drag = { x: e.clientX, y: e.clientY, left: mat.scrollLeft, top: mat.scrollTop, moved: false }
			window.addEventListener('pointermove', this.dragMove)
			window.addEventListener('pointerup', this.dragEnd)
		},
		dragMove(e) {
			const d = this.drag
			if (!d) return
			const dx = e.clientX - d.x
			const dy = e.clientY - d.y
			if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true
			if (d.moved) this.$refs.mat?.scrollTo(d.left - dx, d.top - dy)
		},
		dragEnd() {
			window.removeEventListener('pointermove', this.dragMove)
			window.removeEventListener('pointerup', this.dragEnd)
			// The click after a drag does not choose a shape.
			this.dragged = this.drag?.moved ?? false
			this.drag = null
		},
		/** Tapping a shape chooses its line in the story. */
		clickShape(e) {
			if (this.dragged) {
				this.dragged = false
				return
			}
			if (this.pinch || Date.now() - (this.pinchedAt ?? 0) < PINCH_CLICK) {
				this.touch = null
				return
			}
			const t0 = this.touch
			this.touch = null
			if (t0 && Math.hypot(e.clientX - t0.x, e.clientY - t0.y) > TAP_SLOP) return
			const g = e.target?.closest?.('g[data-move]')
			if (g && this.$refs.sheet?.contains(g)) this.$emit('choose', Number(g.dataset.move) - 1)
		},
		/** Double click on a box with a plus opens the flow behind it. */
		openShape(e) {
			const g = e.target?.closest?.('g[data-move]')
			if (!g || !this.$refs.sheet?.contains(g) || this.view.sub?.trigger) return
			const m = Number(g.dataset.move) - 1
			if (this.view.subs?.[m]) this.$emit('open', m)
		},
		mapClick(e) {
			const mat = this.$refs.mat
			const rect = e.currentTarget.getBoundingClientRect()
			const k = this.scale / this.map.scale
			this.hand = true
			mat.scrollTo({
				left: PAD + (e.clientX - rect.left) * k - this.room.w / 2,
				top: PAD + (e.clientY - rect.top) * k - this.room.h / 2,
			})
		},
		lastShape() {
			const all = this.$refs.sheet?.querySelectorAll('g[data-move]') ?? []
			let best = null
			for (const g of all) if (!best || Number(g.dataset.move) >= Number(best.dataset.move)) best = g
			return best
		},
		/** Frame around the shapes of the chosen line (inside the SVG, so it zooms with it). */
		markChosen() {
			const sheet = this.$refs.sheet
			if (!sheet) return
			sheet.querySelectorAll('.chosen-frame').forEach((r) => r.remove())
			sheet.querySelectorAll('g.chosen').forEach((g) => g.classList.remove('chosen'))
			sheet.querySelectorAll('.diff-frame').forEach((r) => r.remove())
			// Comparison: new and changed shapes framed (only here, never in the reading copy).
			for (const m of this.marked) {
				for (const g of sheet.querySelectorAll(`g[data-move="${m + 1}"]`)) {
					const b = g.getBBox?.()
					if (!b) continue
					const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
					r.setAttribute('class', 'diff-frame')
					r.setAttribute('x', b.x - 4)
					r.setAttribute('y', b.y - 4)
					r.setAttribute('width', b.width + 8)
					r.setAttribute('height', b.height + 8)
					r.setAttribute('rx', 6)
					g.appendChild(r)
				}
			}
			if (this.chosen === null) return
			for (const g of sheet.querySelectorAll(`g[data-move="${this.chosen + 1}"]`)) {
				const b = g.getBBox?.()
				if (!b) continue
				const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
				r.setAttribute('class', 'chosen-frame')
				r.setAttribute('x', b.x - 6)
				r.setAttribute('y', b.y - 6)
				r.setAttribute('width', b.width + 12)
				r.setAttribute('height', b.height + 12)
				r.setAttribute('rx', 8)
				g.classList.add('chosen')
				g.appendChild(r)
			}
		},
		/** Following: pans so that the shape(s) are fully in view and not under the overview; force: also with Follow off (Enter). */
		panTo(target, force = false) {
			if (!force && (!this.follow || this.hand)) return
			const mat = this.$refs.mat
			const sheet = this.$refs.sheet
			if (!mat || !sheet || this.whole) return
			const shapes = typeof target === 'string' ? [...sheet.querySelectorAll(target)] : target ? [target] : []
			if (!shapes.length) return
			const k = this.scale
			let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
			for (const g of shapes) {
				const b = g.getBBox()
				x1 = Math.min(x1, b.x)
				y1 = Math.min(y1, b.y)
				x2 = Math.max(x2, b.x + b.width)
				y2 = Math.max(y2, b.y + b.height)
			}
			const shape = { x: PAD + x1 * k, y: PAD + y1 * k, w: (x2 - x1) * k, h: (y2 - y1) * k }
			let map
			const m = this.$refs.map
			if (m) {
				const a = mat.getBoundingClientRect()
				const r = m.getBoundingClientRect()
				map = { x: r.left - a.left, y: r.top - a.top, w: r.width, h: r.height }
			}
			// Standing names cover the left edge.
			const names = this.view.bands?.length ? (this.phone ? PHONE_NAMES : HEADS * k) : 0
			const to = followScroll(
				{ ...shape, x: shape.x - names, w: shape.w + names },
				{ w: mat.clientWidth, h: mat.clientHeight },
				{ left: mat.scrollLeft, top: mat.scrollTop },
				map,
				24,
				{ left: mat.scrollWidth - mat.clientWidth, top: mat.scrollHeight - mat.clientHeight },
			)
			const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
			mat.scrollTo({ ...to, behavior: smooth ? 'smooth' : 'auto' })
		},
		publish() {
			if (this.busy || !this.view.done) return
			this.$emit('publish')
		},
	},
}
</script>
