<!--
  SPDX-FileCopyrightText: 2026 hotochan123
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<template>
	<li v-if="next.head" class="line path-head" :style="{ '--t': tree?.head?.depth ?? next.depth }">
		<StoryRails :row="tree?.head" />
		<span class="num" />
		<span class="txt">
			<PathName v-if="tree?.head?.label" :label="tree.head.label" />
			<StoryParts v-else :parts="lineParts(next.head)" />
		</span>
		<span />
	</li>
	<li class="line here-line" aria-current="step" :style="{ '--t': next.depth }">
		<StoryRails :row="tree?.here" />
		<span class="num" />
		<span class="txt">
			<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>{{ t('story2bpmn', 'continue here') }}
		</span>
		<span />
	</li>
</template>

<script>
import { t } from '@nextcloud/l10n'
import { lineParts } from '../lineParts.ts'
import PathName from './PathName.vue'
import StoryParts from './StoryParts.vue'
import StoryRails from './StoryRails.vue'

/** Where the story continues: the heading of the next path, if any, and the marker "continue here". */
export default {
	name: 'NextLine',
	components: { PathName, StoryParts, StoryRails },
	props: {
		/** View.next: { head?, depth } */
		next: { type: Object, required: true },
		/** Its rows in the tree of the story card: { head, here } (src/storyTree.ts), or null. */
		tree: { type: Object, default: null },
	},
	methods: { t, lineParts },
}
</script>
