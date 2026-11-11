<!--
  SPDX-FileCopyrightText: 2026 hotochan123
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<template>
	<section class="card" aria-labelledby="story2bpmn-h-story">
		<div class="card-head">
			<h2 id="story2bpmn-h-story">
				{{ t('story2bpmn', 'Story') }}
			</h2>
			<span class="number">{{ moves.length ? n('story2bpmn', '%n move', '%n moves', moves.length) : '' }}</span>
			<div class="right werkzeug">
				<button type="button"
					class="button quiet"
					:disabled="busy || textMode || !moves.length"
					:title="t('story2bpmn', 'Undo the last move')"
					@click="undo">
					<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
					<span>{{ t('story2bpmn', 'Undo') }}</span>
				</button>
				<button ref="asText"
					type="button"
					class="button quiet as-text"
					:aria-pressed="textMode ? 'true' : 'false'"
					:disabled="busy"
					@click="toggleText">
					<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 10h10M4 14h16M4 18h8" /></svg>
					<span>{{ t('story2bpmn', 'Edit as text') }}</span>
				</button>
				<button type="button"
					class="button quiet"
					:class="{ armed: newArmed }"
					:disabled="busy || textMode || !moves.length"
					@click="startOver"
					@blur="newArmed = false">
					{{ newArmed ? t('story2bpmn', 'Really discard everything?') : t('story2bpmn', 'Start over') }}
				</button>
			</div>
		</div>

		<div v-if="messages.length" class="messages" aria-live="polite">
			<div v-for="m in messages"
				:key="m.id"
				class="message error"
				role="alert">
				<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></svg>
				<div><strong v-if="m.title">{{ m.title }} </strong>{{ m.text }}</div>
				<button type="button"
					class="button quiet icon to"
					:aria-label="t('story2bpmn', 'Dismiss')"
					@click="messages = messages.filter((x) => x !== m)">
					<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
				</button>
			</div>
		</div>

		<div v-if="moves.length" v-show="!textMode" class="key" aria-hidden="true">
			<span>{{ t('story2bpmn', 'Colours:') }}</span>
			<span v-for="(name, a) in objects" :key="a" :class="['o', 'o-' + a]">{{ name }}</span>
		</div>

		<TextEditor v-if="textMode"
			ref="editor"
			:start="textStart"
			:language="language"
			:busy="busy"
			@apply="textApply"
			@cancel="textTo" />

		<ol v-show="!textMode" class="course">
			<li v-for="(l, i) in view.storyText"
				:key="i"
				class="line"
				:class="{ marked: marked(l) }">
				<span class="num">{{ l.move !== undefined ? l.move + 1 : '' }}</span>
				<span class="txt" :class="{ deep: l.depth > 0 }" :style="{ '--t': l.depth }">
					<template v-for="(part, j) in lineParts(l.text)" :key="j">
						<b v-if="part.subtype === 'sw'" class="sw">{{ part.text }}</b>
						<span v-else-if="part.subtype === 'o'" :class="['o', 'o-' + part.object]" :title="objects[part.object]"><span class="sr">{{ objects[part.object] }}: </span>{{ part.text }}</span>
						<template v-else>{{ part.text }}</template>
					</template>
				</span>
				<span>
					<button v-if="l.move !== undefined && moves[l.move]"
						type="button"
						class="button more"
						:aria-expanded="menu === l.move ? 'true' : 'false'"
						:aria-label="t('story2bpmn', 'Edit line {number}', { number: l.move + 1 })"
						:title="t('story2bpmn', 'Edit line')"
						:data-menu="l.move"
						@click="toggleMenu(l.move)">
						<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="19" cy="12" r="1.3" fill="currentColor" /></svg>
					</button>
				</span>
				<div v-if="l.move !== undefined && menu === l.move" class="line-actions" :style="{ '--t': l.depth }">
					<button v-for="a in lineActions(moves[l.move], l.move)"
						:key="a"
						type="button"
						class="button"
						:class="{ armed: a === 'remove' && deleteArmed }"
						:disabled="busy"
						@click="action(a, l.move)">
						{{ actionText(a) }}
					</button>
				</div>
				<MoveForm v-if="form && form.place !== 'added' && form.index === l.move && l.move !== undefined"
					:key="formKey"
					v-bind="formProps"
					@apply="apply"
					@cancel="cancel" />
			</li>
			<template v-if="view.next && moves.length">
				<li v-if="view.next.head" class="line">
					<span class="num" />
					<span class="txt" :class="{ deep: view.next.depth > 1 }" :style="{ '--t': Math.max(view.next.depth - 1, 0) }">
						<template v-for="(part, j) in lineParts(view.next.head)" :key="j">
							<b v-if="part.subtype === 'sw'" class="sw">{{ part.text }}</b>
							<span v-else-if="part.subtype === 'o'" :class="['o', 'o-' + part.object]">{{ part.text }}</span>
							<template v-else>{{ part.text }}</template>
						</template>
					</span>
					<span />
				</li>
				<li class="line here-line" aria-current="step">
					<span class="num" />
					<span class="txt" :style="{ '--t': view.next.depth }">
						<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>{{ t('story2bpmn', 'continue here') }}
					</span>
					<span />
				</li>
			</template>
		</ol>

		<div v-show="!textMode" ref="move" class="move">
			<div v-if="view.done" class="done-box">
				<span class="check"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></span>
				<div>
					<p class="question">
						{{ t('story2bpmn', 'Done, every path has been told to its end.') }}
					</p>
					<p>{{ t('story2bpmn', 'Read the story once more: is every path right, is a step missing? Use ⋯ on any line to change, insert or delete.') }}</p>
				</div>
			</div>
			<template v-else>
				<div class="move-head">
					<p class="label">
						{{ t('story2bpmn', 'Next move') }}
					</p>
					<span v-if="view.path" class="path">{{ t('story2bpmn', 'On the path') }} <span class="path-pill">{{ view.path }}</span></span>
				</div>
				<h3 id="story2bpmn-question" class="question">
					{{ view.question }}
				</h3>
				<div v-if="rank.frequent.length"
					class="options frequent"
					role="group"
					aria-labelledby="story2bpmn-question">
					<button v-for="o in rank.frequent"
						:key="o"
						type="button"
						class="option"
						:aria-pressed="chosen === o ? 'true' : 'false'"
						:aria-keyshortcuts="String(row.indexOf(o) + 1)"
						:disabled="busy"
						:data-o="o"
						@click="choose(o)">
						<kbd aria-hidden="true">{{ row.indexOf(o) + 1 }}</kbd>
						<span class="o-text">{{ options[o] }}<small>{{ helps[o] }}</small></span>
					</button>
				</div>
				<MoveForm v-if="form && form.place === 'added' && frequentKind(form.subtype)"
					:key="formKey"
					v-bind="formProps"
					@apply="apply"
					@cancel="cancel" />
				<template v-if="rank.rare.length">
					<p id="story2bpmn-rank-rare" class="rank-title">
						{{ t('story2bpmn', 'Needed less often') }}
					</p>
					<div class="options rare" role="group" aria-labelledby="story2bpmn-rank-rare">
						<button v-for="o in rank.rare"
							:key="o"
							type="button"
							class="option"
							:aria-pressed="chosen === o ? 'true' : 'false'"
							:aria-keyshortcuts="String(row.indexOf(o) + 1)"
							:aria-describedby="'story2bpmn-help-' + o"
							:disabled="busy"
							:data-o="o"
							@click="choose(o)"
							@mouseenter="helpLive = helps[o]"
							@focus="helpLive = helps[o]">
							<kbd aria-hidden="true">{{ row.indexOf(o) + 1 }}</kbd>
							<span class="o-text">{{ options[o] }}</span>
							<span :id="'story2bpmn-help-' + o" class="sr">{{ helps[o] }}</span>
						</button>
					</div>
					<p class="help-live" aria-hidden="true">
						{{ helpLive || hint }}
					</p>
				</template>
				<MoveForm v-if="form && form.place === 'added' && !frequentKind(form.subtype)"
					:key="formKey"
					v-bind="formProps"
					@apply="apply"
					@cancel="cancel" />
				<div v-if="view.open && view.open.length" class="open-paths">
					<p class="label">
						{{ t('story2bpmn', 'Still open afterwards') }}
					</p>
					<p>{{ t('story2bpmn', 'Comes up once this path has been told to its end.') }}</p>
					<ul>
						<li v-for="(w, i) in view.open" :key="i">
							<button type="button"
								class="path-button"
								:disabled="busy"
								@click="set(switchTo(moves, i))">
								<span class="path-pill">{{ w }}</span>
								<span class="before">{{ t('story2bpmn', 'Tell now') }}<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></span>
							</button>
						</li>
					</ul>
				</div>
				<p v-if="!rank.rare.length" class="move-hint">
					{{ hint }}
				</p>
				<span class="sr">{{ t('story2bpmn', 'Keys 1–9 pick an option.') }}</span>
			</template>
		</div>
	</section>
</template>

<script>
import { n, t } from '@nextcloud/l10n'
import { nextTick } from 'vue'
import MoveForm from './MoveForm.vue'
import TextEditor from './TextEditor.vue'
import {
	append, before, replace, hasFields, remove, ranks, switchTo, undo,
	lineActions, lineParts, targetsUntil, digitKey, textFrom, withProcess,
} from '../workbench.ts'
import { helpText, objectText, optionText } from '../texts.js'

const FREQUENT = ['start', 'task', 'end']

export default {
	name: 'GeschichteKarte',
	components: { MoveForm, TextEditor },
	props: {
		view: { type: Object, required: true },
		moves: { type: Array, required: true },
		language: { type: String, required: true },
		busy: { type: Boolean, default: false },
		/** (added: Move[]) => Promise<Result> */
		change: { type: Function, required: true },
	},
	data() {
		return {
			// Form: { subtype, place: 'added' | 'replace' | 'before', index?, start, title, targets? }
			mode: null,
			menu: null,
			deleteArmed: false,
			newArmed: false,
			messages: [],
			helpLive: '',
			counter: 0,
			// Edit as text: editor open, content when opening
			textMode: false,
			textStart: '',
		}
	},
	computed: {
		options: optionText,
		helps: helpText,
		objects: objectText,
		hint() {
			return t('story2bpmn', 'Only what is possible at this point is offered. So the diagram is valid at every stage.')
		},
		rank() {
			return ranks(this.view.options ?? [], this.moves.length)
		},
		row() {
			return [...this.rank.frequent, ...this.rank.rare]
		},
		/** Right at the beginning the form for the trigger is open already. */
		form() {
			if (this.mode) return this.mode
			if (!this.moves.length && !this.view.done) return { subtype: 'start', place: 'added', start: {}, title: this.options.start }
			return null
		},
		formKey() {
			return `${this.counter}-${this.form?.place}-${this.form?.subtype}-${this.form?.index ?? ''}`
		},
		formProps() {
			const f = this.form
			return {
				subtype: f.subtype,
				start: f.start,
				title: f.title,
				targets: f.targets ?? this.view.targets ?? [],
				roles: this.view.roles ?? [],
				role: f.place === 'added' ? this.view.role : undefined,
				endKinds: this.view.endKinds ?? ['', 'message'],
				language: this.language,
				cancelable: this.moves.length > 0,
				busy: this.busy,
			}
		},
		chosen() {
			return this.mode?.place === 'added' ? this.mode.subtype : null
		},
	},
	mounted() {
		document.addEventListener('keydown', this.key)
	},
	beforeUnmount() {
		document.removeEventListener('keydown', this.key)
	},
	methods: {
		t,
		n,
		lineParts,
		lineActions,
		switchTo,
		frequentKind: (a) => FREQUENT.includes(a),
		marked(l) {
			return l.move !== undefined && this.mode && this.mode.place !== 'added' && this.mode.index === l.move
		},
		actionText(a) {
			if (a === 'edit') return t('story2bpmn', 'Edit')
			if (a === 'before') return t('story2bpmn', '+ Step before')
			return this.deleteArmed ? t('story2bpmn', 'Really delete?') : t('story2bpmn', 'Delete')
		},
		/** A change to the core; rejected: message, the form stays open. */
		async set(added) {
			const r = await this.change(added)
			if (r.ok) {
				this.messages = (this.view.errors ?? []).map((f, i) => ({ id: `k${i}`, title: '', text: f }))
				this.mode = null
				this.menu = null
				this.deleteArmed = false
				this.newArmed = false
				this.helpLive = ''
				this.counter++
				// The button that had focus was redrawn: move focus to the next choice.
				await nextTick()
				if (!this.$el.contains(document.activeElement)) this.$refs.move?.querySelector('button, input, select')?.focus()
			} else if (r.rejected) {
				this.messages = [{ id: `a${Date.now()}`, title: t('story2bpmn', 'Not applied:'), text: r.rejected.join(' · ') }]
			}
			return r
		},
		choose(subtype) {
			this.menu = null
			if (!hasFields(subtype)) {
				this.mode = null
				return this.set(append(this.moves, { move: subtype }))
			}
			this.counter++
			this.mode = { subtype, place: 'added', start: {}, title: this.options[subtype] }
		},
		toggleMenu(i) {
			this.deleteArmed = false
			this.menu = this.menu === i ? null : i
			if (this.menu !== null) nextTick(() => this.$el.querySelector('.line-actions .button')?.focus())
		},
		action(a, i) {
			if (a === 'remove') {
				// Confirmation without a browser dialog: the first click arms the button, the second deletes.
				if (!this.deleteArmed) {
					this.deleteArmed = true
					return
				}
				return this.set(remove(this.moves, i, this.language))
			}
			this.menu = null
			this.counter++
			const z = this.moves[i]
			if (a === 'edit') {
				this.mode = {
					subtype: z.move,
					place: 'replace',
					index: i,
					start: { ...z },
					title: t('story2bpmn', 'Edit line'),
					// "continue at": the targets that were possible at exactly this point.
					targets: z.move === 'goTo' ? targetsUntil(this.moves, i, this.language) : undefined,
				}
			} else {
				// Suggestion: the role of the task before which it is inserted.
				this.mode = { subtype: 'task', place: 'before', index: i, start: z.role ? { role: z.role } : {}, title: t('story2bpmn', 'New step before') }
			}
		},
		apply(move) {
			const m = this.form
			if (m.place === 'replace') return this.set(replace(this.moves, m.index, move))
			if (m.place === 'before') return this.set(before(this.moves, m.index, move, this.language))
			return this.set(append(this.moves, move))
		},
		cancel() {
			const i = this.mode?.place === 'added' ? null : this.mode?.index
			this.mode = null
			if (i !== null && i !== undefined) nextTick(() => this.$el.querySelector(`[data-menu="${i}"]`)?.focus())
		},
		undo() {
			return this.set(undo(this.moves))
		},
		startOver() {
			if (!this.newArmed) {
				this.newArmed = true
				return
			}
			return this.set([])
		},
		toggleText() {
			if (this.textMode) return this.textTo()
			this.mode = null
			this.menu = null
			this.deleteArmed = false
			this.newArmed = false
			this.textStart = textFrom(this.view.storyText ?? [])
			this.textMode = true
		},
		textTo() {
			this.textMode = false
			nextTick(() => this.$refs.asText?.focus())
		},
		/** Replay the moves of the checked text as a new story; rejected: editor stays open, nothing changes. */
		async textApply(moves) {
			const e = await this.set(withProcess(moves, this.moves))
			if (e.ok) return this.textTo()
			if (e.rejected) {
				this.messages = []
				this.$refs.editor?.showError(e.rejected)
			}
		},
		/** Keys 1-9 choose an option, Esc closes the form. */
		key(e) {
			if (this.textMode) return
			if (e.key === 'Escape' && this.mode && this.moves.length) return this.cancel()
			if (this.busy || this.view.done) return
			const i = digitKey(e)
			const o = i === null ? undefined : this.row[i]
			if (!o) return
			e.preventDefault()
			this.choose(o)
		},
	},
}
</script>
