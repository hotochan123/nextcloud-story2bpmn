<!--
  SPDX-FileCopyrightText: 2026 hotochan123
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<template>
	<li v-if="next.head" class="line">
		<span class="num" />
		<span class="txt" :class="{ deep: next.depth > 1 }" :style="{ '--t': Math.max(next.depth - 1, 0) }">
			<template v-for="(part, j) in lineParts(next.head)" :key="j">
				<b v-if="part.subtype === 'sw'" class="sw">{{ part.text }}</b>
				<span v-else-if="part.subtype === 'o'" :class="['o', 'o-' + part.object]"><svg v-if="part.object === 'signal'" class="tri" viewBox="0 0 10 9" aria-hidden="true"><polygon points="5,1 9,8 1,8" :class="{ filled: part.filled }" /></svg>{{ part.text }}</span>
				<template v-else>{{ part.text }}</template>
			</template>
		</span>
		<span />
	</li>
	<li class="line here-line" aria-current="step">
		<span class="num" />
		<span class="txt" :style="{ '--t': next.depth }">
			<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>{{ t('story2bpmn', 'continue here') }}
		</span>
		<span />
	</li>
</template>

<script>
import { t } from '@nextcloud/l10n'
import { lineParts } from '../lineParts.ts'

/** Where the story continues: the heading of the next path, if any, and the marker "continue here". */
export default {
	name: 'NextLine',
	props: {
		/** View.next: { head?, depth } */
		next: { type: Object, required: true },
	},
	methods: { t, lineParts },
}
</script>
