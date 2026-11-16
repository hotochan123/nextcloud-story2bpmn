<!--
  SPDX-FileCopyrightText: 2026 hotochan123
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<template>
	<span class="path-name">
		<template v-if="label.kind === 'answer'"><span v-if="label.question" class="filler">{{ label.question }} → </span><b>{{ label.answer }}</b></template>
		<b v-else-if="label.kind === 'strand'">{{ t('story2bpmn', 'Branch {number}', { number: label.number }) }}</b>
		<StoryParts v-else :parts="lineParts(label.text)" />
	</span>
</template>

<script>
import { t } from '@nextcloud/l10n'
import { lineParts } from '../lineParts.ts'
import StoryParts from './StoryParts.vue'

/** The name of a path at its branch (src/storyTree.ts PathLabel, job 448): text only, never markup. */
export default {
	name: 'PathName',
	components: { StoryParts },
	props: {
		label: { type: Object, required: true },
	},
	methods: { t, lineParts },
}
</script>
