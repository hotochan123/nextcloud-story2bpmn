<!--
  SPDX-FileCopyrightText: 2026 hotochan123
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<template>
	<template v-for="(part, j) in parts" :key="j">
		<b v-if="part.subtype === 'sw'" class="sw">{{ part.text }}</b>
		<span v-else-if="part.subtype === 'filler'" class="filler">{{ part.text }}</span>
		<span v-else-if="part.subtype === 'o'" :class="['o', 'o-' + part.object]" :title="names?.[part.object]"><svg v-if="part.object === 'signal'" class="tri" viewBox="0 0 10 9" aria-hidden="true"><polygon points="5,1 9,8 1,8" :class="{ filled: part.filled }" /></svg><svg v-else-if="part.object === 'document'" class="mark" viewBox="0 0 11 14" aria-hidden="true"><path d="M1 .75h6l3.25 3.25v9.25H1z M7 .75V4h3.25" /></svg><svg v-else-if="part.object === 'deadline'" class="mark" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5.9" /><path d="M7 3.6V7l2.4 1.6" /></svg><span v-if="names" class="sr">{{ part.sub ? t('story2bpmn', 'Subprocess') : names[part.object] }}: </span><template v-if="part.object === 'deadline'"><template v-for="(f, k) in figures(part.text)" :key="k"><span v-if="f.num" class="so-num">{{ f.text }}</span><template v-else>{{ f.text }}</template></template></template><template v-else>{{ part.text }}</template><svg v-if="part.sub" class="plus" viewBox="0 0 10 10" aria-hidden="true"><rect x="0.5" y="0.5" width="9" height="9" /><path d="M5 2.5v5M2.5 5h5" /></svg></span>
		<template v-else>{{ part.text }}</template>
	</template>
</template>

<script>
import { t } from '@nextcloud/l10n'
import { figures } from '../headChips.ts'

/** The parts of a story line (src/lineParts.ts) in the look of Soothing 2 (job 448); only text, never markup. */
export default {
	name: 'StoryParts',
	props: {
		/** Part[] of lineParts() */
		parts: { type: Array, required: true },
		/** Names of the part kinds (texts.js objectText): title and screen-reader prefix; without, none. */
		names: { type: Object, default: null },
	},
	methods: { t, figures },
}
</script>
