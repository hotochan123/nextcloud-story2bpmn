<!--
  SPDX-FileCopyrightText: 2026 hotochan123
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<template>
	<span v-if="row && row.rails.length" class="rails" aria-hidden="true">
		<span v-for="(r, k) in row.rails"
			:key="k"
			:class="['rail', 'rail-' + r, { hot: row.hot[k], tick: row.tick === k }]"
			:style="{ '--k': k }" />
	</span>
</template>

<script>
/** The stems and branches of one story row (src/storyTree.ts, job 448); drawn lines only, no text. */
export default {
	name: 'StoryRails',
	props: {
		/** TreeRow of storyTree(), or null */
		row: { type: Object, default: null },
	},
}
</script>
