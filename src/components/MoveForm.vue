<!--
  SPDX-FileCopyrightText: 2026 hotochan123
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<template>
	<form class="form" novalidate @submit.prevent="submit" @keydown.esc.stop="escape">
		<p class="title">
			{{ title }}
		</p>
		<!-- Only here or everywhere (job 454): instead of the fields, until a choice or "Back". -->
		<div v-if="ask"
			class="role-ask"
			role="group"
			:aria-labelledby="id('ask')">
			<p :id="id('ask')">
				{{ t('story2bpmn', 'Change role “{from}” to “{to}”:', { from: ask.from, to: ask.to }) }}
			</p>
			<p v-if="ask.merge" class="field-help">
				{{ t('story2bpmn', '“{from}” and “{to}” become one role.', { from: ask.from, to: ask.merge }) }}
			</p>
			<div class="buttons role-ask-buttons">
				<button ref="onlyHere"
					type="button"
					class="button main"
					:disabled="busy"
					@click="answer(false)">
					{{ t('story2bpmn', 'Only here') }}
				</button>
				<button type="button"
					class="button"
					:disabled="busy"
					@click="answer(true)">
					{{ n('story2bpmn', 'Everywhere (%n step)', 'Everywhere (%n steps)', ask.count) }}
				</button>
				<button type="button"
					class="button quiet"
					@click="unask">
					{{ t('story2bpmn', 'Back') }}
				</button>
			</div>
		</div>
		<template v-else>
			<div class="fields">
				<div v-for="f in list"
					:key="f.key"
					class="field"
					:class="{ half: f.optional }">
					<label :for="id(f.key)">{{ caption(f.key) }}<span v-if="f.optional" class="opt">{{ t('story2bpmn', 'optional') }}</span></label>
					<template v-if="f.subtype === 'choice'">
						<select :id="id(f.key)"
							v-model="values[f.key]"
							:name="f.key"
							:aria-invalid="isMissing(f.key) ? 'true' : null"
							:aria-describedby="isMissing(f.key) ? id(f.key) + '-e' : null"
							@change="kindSwitched(f.key)">
							<option v-for="w in f.values" :key="w" :value="w">
								{{ choiceText(f.key, w) }}
							</option>
						</select>
						<span v-if="isMissing(f.key)" :id="id(f.key) + '-e'" class="missingText">{{ t('story2bpmn', 'Please choose.') }}</span>
					</template>
					<select v-else-if="f.subtype === 'target'"
						:id="id(f.key)"
						v-model="values.target"
						name="target">
						<option v-for="z in targets" :key="z.id" :value="z.id">
							{{ z.name || z.id }}
						</option>
					</select>
					<template v-else-if="f.subtype === 'role' && roles.length">
						<select :id="id(f.key)"
							v-model="values.role"
							name="role"
							@change="roleSwitched">
							<option v-for="s in roles" :key="s" :value="s">
								{{ s }}
							</option>
							<option value="">
								{{ t('story2bpmn', '+ New role …') }}
							</option>
						</select>
						<input v-if="values.role === ''"
							:id="id('newRole')"
							v-model="values.newRole"
							type="text"
							name="newRole"
							autocomplete="off"
							:aria-label="t('story2bpmn', 'Name of the new role')"
							:placeholder="t('story2bpmn', 'Name of the new role')"
							:aria-invalid="isMissing('newRole') ? 'true' : null"
							:aria-describedby="isMissing('newRole') ? id('newRole') + '-e' : null">
						<span v-if="isMissing('newRole')" :id="id('newRole') + '-e'" class="missingText">{{ t('story2bpmn', 'Please fill in.') }}</span>
					</template>
					<template v-else-if="isMore(f.key)">
						<div class="path-row">
							<input :id="id(f.key)"
								v-model="values[f.key]"
								type="text"
								:name="f.key"
								autocomplete="off"
								:placeholder="example(f.key)"
								:list="suggested.includes(f.key) && signals.length ? id('signals') : null"
								aria-required="true"
								:aria-invalid="isMissing(f.key) ? 'true' : null"
								:aria-describedby="isMissing(f.key) ? id(f.key) + '-e' : null">
							<button v-if="growable && !minPaths"
								type="button"
								class="button quiet icon"
								:aria-label="t('story2bpmn', 'Remove path')"
								:title="t('story2bpmn', 'Remove path')"
								@click="dropPath(Number(f.key.slice(4)))">
								<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
							</button>
						</div>
						<span v-if="isMissing(f.key)" :id="id(f.key) + '-e'" class="missingText">{{ t('story2bpmn', 'Please fill in.') }}</span>
					</template>
					<template v-else>
						<input :id="id(f.key)"
							v-model="values[f.key]"
							type="text"
							:name="f.key"
							autocomplete="off"
							:placeholder="example(f.key)"
							:list="suggested.includes(f.key) && signals.length ? id('signals') : null"
							:aria-required="f.optional ? null : 'true'"
							:aria-invalid="isMissing(f.key) ? 'true' : null"
							:aria-describedby="isMissing(f.key) ? id(f.key) + '-e' : null">
						<span v-if="isMissing(f.key)" :id="id(f.key) + '-e'" class="missingText">{{ t('story2bpmn', 'Please fill in.') }}</span>
					</template>
					<!-- After the whole v-if chain: a hint between its branches would break it. -->
					<small v-if="f.key === 'subprocess' && values.subprocess === 'yes'" class="field-help">{{ t('story2bpmn', 'The step becomes a subprocess: a box with a plus. Tell the flow behind it now or later; until then it is an open point.') }}</small>
					<small v-else-if="f.key === 'subprocess' && told" class="field-help warn" role="alert">{{ n('story2bpmn', 'The flow told behind it (%n move) will be removed.', 'The flow told behind it (%n moves) will be removed.', told) }}</small>
					<small v-else-if="f.key === 'eachOrder'" class="field-help">{{ t('story2bpmn', 'The step gets three bars: lying = one after another, standing = at the same time.') }}</small>
				</div>
			</div>
			<ol v-if="kind === 'concurrent'" class="branch-list" :aria-label="t('story2bpmn', 'Branches')">
				<li v-for="j in branches" :key="j">
					<span>{{ t('story2bpmn', 'Branch {number}', { number: j }) }}</span>
					<button v-if="growable && j === branches && j > Math.max(2, minPaths)"
						type="button"
						class="button quiet icon"
						:aria-label="t('story2bpmn', 'Remove path')"
						:title="t('story2bpmn', 'Remove path')"
						@click="dropPath(j - 1)">
						<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
					</button>
				</li>
			</ol>
			<template v-if="branching">
				<button v-if="growable"
					ref="add"
					type="button"
					class="button add-path"
					:disabled="paths >= maxPaths || (minPaths > 0 && switched)"
					@click="addPath">
					{{ t('story2bpmn', 'Add another path') }}
				</button>
				<p v-else class="field-help">
					{{ t('story2bpmn', 'More paths only as long as nothing is told after it.') }}
				</p>
				<!-- After the v-if/v-else pair: between them it would break it. -->
				<p v-if="growable && minPaths > 0 && switched" class="field-help">
					{{ t('story2bpmn', 'Change the kind first, then add paths.') }}
				</p>
			</template>
			<datalist v-if="suggested.length && signals.length" :id="id('signals')">
				<option v-for="s in signals" :key="s" :value="s" />
			</datalist>
			<div class="buttons">
				<button type="submit" class="button main" :disabled="busy">
					{{ t('story2bpmn', 'Apply') }}
				</button>
				<button v-if="cancelable"
					type="button"
					class="button quiet"
					@click="$emit('cancel')">
					{{ t('story2bpmn', 'Cancel') }}
				</button>
			</div>
		</template>
	</form>
</template>

<script>
import { t, n } from '@nextcloud/l10n'
import { nextTick } from 'vue'
import { fields, roleChange, requiredEmpty, prefill, moveFromForm, signalFields, addPath, removePath, pathCount, branchCount, switchKind, switchBranch, branchMove, forEachSwitched } from '../moveForm.ts'
import { MAX_PATHS, END_KINDS, START_KINDS } from '../core/story.ts'
import { kindText, fieldText } from '../texts.js'

let counter = 0

export default {
	name: 'ZugFormular',
	props: {
		subtype: { type: String, required: true },
		start: { type: Object, default: () => ({}) },
		title: { type: String, required: true },
		targets: { type: Array, default: () => [] },
		roles: { type: Array, default: () => [] },
		role: { type: String, default: undefined },
		endKinds: { type: Array, default: () => [...END_KINDS] },
		/** Kinds a further trigger may have here (StoryState.startKinds). */
		startKinds: { type: Array, default: () => [...START_KINDS] },
		/** Signal names of this story, suggested in the fields that name a signal. */
		signals: { type: Array, default: () => [] },
		language: { type: String, required: true },
		/** On a subprocess level: a task there has no flow behind it. */
		inner: { type: Boolean, default: false },
		/** On the level of a subprocess (not inside the flow of something that comes at any time): "No" stops only it. */
		inSubprocess: { type: Boolean, default: false },
		/** Moves told behind the task being changed (the form warns before they are removed). */
		told: { type: Number, default: 0 },
		cancelable: { type: Boolean, default: true },
		/** Paths can be added or removed: a new move, or the last one of its level (job 389). */
		growable: { type: Boolean, default: true },
		/** Paths the branch had before, when something is told after it (job 395): they stay, new ones
		 *  can be added (as still open), and for "what comes first" a new path comes last. 0: not so. */
		minPaths: { type: Number, default: 0 },
		/** Key of the field that gets the focus first (the new path); else the first field. */
		focus: { type: String, default: '' },
		busy: { type: Boolean, default: false },
		/** The edit form of a branch: its kind (checked, what comes first, in parallel) can be switched (job 451). */
		switchable: { type: Boolean, default: false },
		/** Roles of the whole story (roleUses, job 454): the edit form asks "only here or everywhere?"
		 *  when the role changes; null: never asks. */
		roleUses: { type: Map, default: null },
	},
	emits: ['apply', 'cancel'],
	data() {
		return {
			num: ++counter,
			values: this.beginning(),
			missingKeys: [],
			// The edit form of a branch: the values it opened with and the kind shown before the last switch (job 451).
			opened: null,
			kindBefore: '',
			// The question "only here or everywhere?" with the move it is about, or null (job 454).
			ask: null,
		}
	},
	computed: {
		/** The move the form tells: the edit form of a branch can be switched to in parallel and back. */
		kind() {
			return branchMove(this.subtype, this.values, this.switchable)
		},
		/** The edit form of a branch shows another kind than it opened with. */
		switched() {
			return this.switchable && (this.values.subtype ?? '') !== (this.opened?.subtype ?? '')
		},
		list() {
			return fields(this.kind, this.values, this.endKinds, this.inner, this.startKinds, this.switchable)
		},
		suggested() {
			return signalFields(this.kind, this.values)
		},
		/** A move whose paths can grow: decision (both kinds) and in parallel. */
		branching() {
			return this.kind === 'decision' || this.kind === 'concurrent'
		},
		paths() {
			return pathCount(this.kind, this.values)
		},
		branches() {
			return branchCount(this.values)
		},
		maxPaths() {
			return MAX_PATHS
		},
		texts() {
			const f = fieldText()
			return f[this.kind === 'decision' && this.values.subtype === 'first' ? 'first' : this.kind] ?? {}
		},
	},
	created() {
		if (!this.switchable) return
		this.opened = { ...this.values }
		this.kindBefore = this.values.subtype ?? ''
	},
	mounted() {
		const first = this.focus ? document.getElementById(this.id(this.focus)) : null
		;(first ?? this.$el.querySelector('input, select') ?? this.$el.querySelector('button[type="submit"]'))?.focus()
	},
	methods: {
		t,
		n,
		beginning() {
			const w = prefill(this.subtype, { ...this.start }, this.language, this.role, this.startKinds)
			// Known roles to choose from; an unknown one (or none) means: type a new role.
			if (this.roles.length) {
				if (!this.roles.includes(w.role ?? '')) w.newRole = w.role ?? ''
				if (!this.roles.includes(w.role ?? '')) w.role = ''
				w.newRole ??= ''
			}
			if (this.subtype === 'goTo' && !w.target) w.target = this.targets[0]?.id ?? ''
			// In parallel carries its kind in the edit form of a branch like a decision does.
			if (this.switchable && this.subtype === 'concurrent') w.subtype = 'concurrent'
			return w
		},
		id(key) {
			return `story2bpmn-f${this.num}-${key}`
		},
		caption(key) {
			if (this.switchable && key === 'subtype') return t('story2bpmn', 'What kind of branch?')
			return this.texts[this.plain(key)]?.[0] ?? key
		},
		/** more0, more1Kind … share the texts of more, moreKind. */
		plain(key) {
			return key.replace(/^more\d+/, 'more')
		},
		isMore(key) {
			return /^more\d+$/.test(key)
		},
		addPath() {
			const before = this.paths
			this.values = addPath(this.kind, this.values, this.minPaths > 0)
			if (this.kind === 'concurrent' || this.paths === before) return
			// After the story went on, the new path of "what comes first" is the last one.
			if (this.minPaths > 0 && this.values.subtype === 'first') return nextTick(() => document.getElementById(this.id('no'))?.focus())
			// The new path is the last further one; its field gets the focus.
			nextTick(() => document.getElementById(this.id(`more${this.paths - 3}`))?.focus())
		},
		dropPath(j) {
			this.values = removePath(this.kind, this.values, j)
			this.missingKeys = []
			nextTick(() => (document.getElementById(this.id(`more${j}`)) ?? this.$refs.add)?.focus())
		},
		example(key) {
			const b = this.texts[this.plain(key)]?.[1]
			return b ? t('story2bpmn', 'e.g. {example}', { example: b }) : ''
		},
		choiceText(key, value) {
			const a = kindText()
			if (this.switchable && key === 'subtype') return a.branch[value] ?? value
			// An event kind still to choose after a switch to "what comes first" (job 451).
			if (value === '' && /Kind$/.test(key)) return t('story2bpmn', 'Please choose …')
			// "move:field" first: the same field can read differently in another move (keepsRunning).
			const within = this.inSubprocess ? a[`${this.kind}:${this.plain(key)}:sub`] : undefined
			return (key === 'subtype' ? a[this.kind] : within ?? a[`${this.kind}:${this.plain(key)}`] ?? a[this.plain(key)])?.[value] ?? value
		},
		isMissing(key) {
			return this.missingKeys.includes(key)
		},
		kindSwitched(key) {
			// The edit form of a branch: another kind keeps the paths and, where they fit, their names (job 451).
			if (key === 'subtype' && this.switchable) {
				this.values = switchBranch(this.values, this.kindBefore, this.language, this.opened)
				this.kindBefore = this.values.subtype ?? ''
				this.missingKeys = []
			} else if (key === 'subtype' && this.subtype === 'decision') {
				// A new decision of the other kind: new fields, typed paths do not fit the other kind.
				this.values = switchKind(this.values, this.language)
				this.missingKeys = []
			}
			if (key === 'forEach') this.values = forEachSwitched(this.values)
		},
		roleSwitched() {
			if (this.values.role === '') nextTick(() => document.getElementById(this.id('newRole'))?.focus())
		},
		submit() {
			this.missingKeys = requiredEmpty(this.kind, this.values)
			if (this.missingKeys.length) {
				nextTick(() => this.$el.querySelector('[aria-invalid="true"]')?.focus())
				return
			}
			const move = moveFromForm(this.kind, this.values)
			const ask = this.roleUses ? roleChange(this.start, move, this.roleUses) : null
			if (ask) {
				this.ask = { ...ask, move }
				nextTick(() => this.$refs.onlyHere?.focus())
				return
			}
			this.$emit('apply', move)
		},
		/** "Only here" or "Everywhere": the move, with the role to rename in the whole story (job 454). */
		answer(everywhere) {
			const { move, from, to } = this.ask
			this.$emit('apply', move, everywhere ? { from, to } : null)
		},
		/** Back from the question to the fields, the values kept. */
		unask() {
			this.ask = null
			nextTick(() => this.$el.querySelector('button[type="submit"]')?.focus())
		},
		escape() {
			if (this.ask) return this.unask()
			if (this.cancelable) this.$emit('cancel')
		},
	},
}
</script>
