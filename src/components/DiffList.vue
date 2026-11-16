<!--
  SPDX-FileCopyrightText: 2026 hotochan123
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<template>
	<!-- The comparison with a valid version as a register (job 450, view B2): number, text, chip with sign and word. -->
	<ol class="diff-list">
		<li v-for="(r, i) in rows" :key="i" class="so-row" :class="'diff-' + r.kind">
			<span class="diff-no so-num">{{ r.number }}</span>
			<span class="diff-text">
				<s v-if="r.kind === 'removed'" class="gone">{{ r.text }}</s>
				<span v-else><StoryParts :parts="lineParts(r.text)" /></span>
				<span v-if="r.kind === 'changed'" class="diff-old">{{ t('story2bpmn', 'Before:') }} {{ plain(r.old) }}</span>
			</span>
			<span v-if="r.kind !== 'same'" class="so-chip" :class="chipClass(r.kind)">{{ word(r.kind) }}</span>
		</li>
		<li v-if="!rows.length" class="so-row diff-none">
			<span class="diff-no" />
			<span class="diff-text">{{ t('story2bpmn', 'No changes.') }}</span>
		</li>
	</ol>
</template>

<script>
import { t } from '@nextcloud/l10n'
import StoryParts from './StoryParts.vue'
import { lineParts } from '../lineParts.ts'

export default {
	name: 'DiffList',
	components: { StoryParts },
	props: {
		/** DiffRow[] of diffRows() (src/approval.ts) */
		rows: { type: Array, required: true },
	},
	methods: {
		t,
		lineParts,
		/** The old wording without the brackets of the sentence parts. */
		plain(text) {
			return text.replace(/\[[@#+!?]?([^\]]*)\]/g, '$1')
		},
		chipClass(kind) {
			return kind === 'new' ? 'so-chip--open' : kind === 'changed' ? 'so-chip--warn' : 'so-chip--danger'
		},
		word(kind) {
			if (kind === 'new') return t('story2bpmn', 'New')
			if (kind === 'changed') return t('story2bpmn', 'Changed')
			return t('story2bpmn', 'Removed')
		},
	},
}
</script>
