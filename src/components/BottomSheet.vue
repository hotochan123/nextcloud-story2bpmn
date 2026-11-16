<!--
  SPDX-FileCopyrightText: 2026 hotochan123
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<template>
	<!-- Phone view: a sheet from below, over the bar; not modal, the story above stays usable. -->
	<section class="bottom-sheet"
		role="dialog"
		:aria-label="title"
		@keydown.esc.stop="closable && $emit('close')">
		<div class="sheet-head">
			<span class="grip" aria-hidden="true" />
			<h3>{{ title }}</h3>
			<button v-if="closable"
				type="button"
				class="button quiet icon sheet-close"
				:aria-label="t('story2bpmn', 'Close')"
				@click="$emit('close')">
				<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
			</button>
		</div>
		<div class="sheet-body">
			<slot />
		</div>
	</section>
</template>

<script>
import { t } from '@nextcloud/l10n'
import { nextTick } from 'vue'

export default {
	name: 'BottomSheet',
	props: {
		title: { type: String, required: true },
		closable: { type: Boolean, default: true },
		/** Move the focus into the sheet when it opens (and back when it closes). */
		focus: { type: Boolean, default: true },
	},
	emits: ['close'],
	mounted() {
		if (!this.focus) return
		this.before = document.activeElement
		nextTick(() => this.$el.querySelector('.sheet-body :is(button, input, select, textarea):not(:disabled)')?.focus?.())
	},
	beforeUnmount() {
		const b = this.before
		if (b && b.isConnected && this.$el.contains(document.activeElement)) nextTick(() => b.focus?.())
	},
	methods: { t },
}
</script>
