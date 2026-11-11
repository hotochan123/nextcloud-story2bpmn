<!--
  SPDX-FileCopyrightText: 2026 hotochan123
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<template>
	<form class="form" novalidate @submit.prevent="submit" @keydown.esc.stop="cancelable && $emit('cancel')">
		<p class="title">
			{{ title }}
		</p>
		<div class="fields">
			<div v-for="f in list"
				:key="f.key"
				class="field"
				:class="{ half: f.optional }">
				<label :for="id(f.key)">{{ caption(f.key) }}<span v-if="f.optional" class="opt">{{ t('story2bpmn', 'optional') }}</span></label>
				<select v-if="f.subtype === 'choice'"
					:id="id(f.key)"
					v-model="values[f.key]"
					:name="f.key"
					@change="kindSwitched(f.key)">
					<option v-for="w in f.values" :key="w" :value="w">
						{{ choiceText(f.key, w) }}
					</option>
				</select>
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
				<template v-else>
					<input :id="id(f.key)"
						v-model="values[f.key]"
						type="text"
						:name="f.key"
						autocomplete="off"
						:placeholder="example(f.key)"
						:aria-required="f.optional ? null : 'true'"
						:aria-invalid="isMissing(f.key) ? 'true' : null"
						:aria-describedby="isMissing(f.key) ? id(f.key) + '-e' : null">
					<span v-if="isMissing(f.key)" :id="id(f.key) + '-e'" class="missingText">{{ t('story2bpmn', 'Please fill in.') }}</span>
				</template>
			</div>
		</div>
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
	</form>
</template>

<script>
import { t } from '@nextcloud/l10n'
import { nextTick } from 'vue'
import { fields, requiredEmpty, prefill, moveFromForm } from '../workbench.ts'
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
		endKinds: { type: Array, default: () => ['', 'message'] },
		language: { type: String, required: true },
		cancelable: { type: Boolean, default: true },
		busy: { type: Boolean, default: false },
	},
	emits: ['apply', 'cancel'],
	data() {
		return {
			num: ++counter,
			values: this.beginning(),
			missingKeys: [],
		}
	},
	computed: {
		list() {
			return fields(this.subtype, this.values, this.endKinds)
		},
		texts() {
			const f = fieldText()
			return f[this.subtype === 'decision' && this.values.subtype === 'first' ? 'first' : this.subtype] ?? {}
		},
	},
	mounted() {
		this.$el.querySelector('input, select')?.focus()
	},
	methods: {
		t,
		beginning() {
			const w = prefill(this.subtype, { ...this.start }, this.language, this.role)
			// Known roles to choose from; an unknown one (or none) means: type a new role.
			if (this.roles.length) {
				if (!this.roles.includes(w.role ?? '')) w.newRole = w.role ?? ''
				if (!this.roles.includes(w.role ?? '')) w.role = ''
				w.newRole ??= ''
			}
			if (this.subtype === 'goTo' && !w.target) w.target = this.targets[0]?.id ?? ''
			return w
		},
		id(key) {
			return `story2bpmn-f${this.num}-${key}`
		},
		caption(key) {
			return this.texts[key]?.[0] ?? key
		},
		example(key) {
			const b = this.texts[key]?.[1]
			return b ? t('story2bpmn', 'e.g. {example}', { example: b }) : ''
		},
		choiceText(key, value) {
			const a = kindText()
			return (key === 'subtype' ? a[this.subtype] : a[key])?.[value] ?? value
		},
		isMissing(key) {
			return this.missingKeys.includes(key)
		},
		kindSwitched(key) {
			// Other kind of decision: new fields, typed paths do not fit the other kind.
			if (key === 'subtype' && this.subtype === 'decision') {
				const subtype = this.values.subtype
				this.values = prefill('decision', { subtype }, this.language)
				this.missingKeys = []
			}
		},
		roleSwitched() {
			if (this.values.role === '') nextTick(() => document.getElementById(this.id('newRole'))?.focus())
		},
		submit() {
			this.missingKeys = requiredEmpty(this.subtype, this.values)
			if (this.missingKeys.length) {
				nextTick(() => this.$el.querySelector('[aria-invalid="true"]')?.focus())
				return
			}
			this.$emit('apply', moveFromForm(this.subtype, this.values))
		},
	},
}
</script>
