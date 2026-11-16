<!--
  SPDX-FileCopyrightText: 2026 hotochan123
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<template>
	<nav class="crumbs"
		:class="{ deep: !!sub.within }"
		:aria-label="t('story2bpmn', 'Breadcrumbs')">
		<button type="button"
			class="button quiet icon"
			:disabled="busy"
			:aria-label="t('story2bpmn', 'Back to “{name}”', { name: sub.process }, undefined, { escape: false, sanitize: false })"
			@click="$emit('up')">
			<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
		</button>
		<!-- What can come at any time inside a subprocess: main flow › subprocess › its flow (job 397). -->
		<template v-if="sub.within">
			<a href="#" @click.prevent="$emit('top')">{{ sub.main }}</a>
			<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
			<a href="#" @click.prevent="$emit('up')">{{ sub.within }}</a>
		</template>
		<a v-else href="#" @click.prevent="$emit('top')">{{ sub.process }}</a>
		<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
		<span class="here" aria-current="page">
			<span class="o o-task">{{ sub.name }}<svg class="plus" viewBox="0 0 10 10" aria-hidden="true"><rect x="0.5" y="0.5" width="9" height="9" /><path d="M5 2.5v5M2.5 5h5" /></svg></span>
			{{ sub.within ? t('story2bpmn', '· At any time') : t('story2bpmn', '· Subprocess') }}<template v-if="sub.lane">, {{ t('story2bpmn', 'lane {lane}', { lane: sub.lane }, undefined, { escape: false, sanitize: false }) }}</template>
		</span>
	</nav>
</template>

<script>
import { t } from '@nextcloud/l10n'

/** Way back from a subprocess level (job 387): in the head on desktop and tablet (job 447), its own row on a phone. */
export default {
	name: 'LevelCrumbs',
	props: {
		/** View.sub of the level shown */
		sub: { type: Object, required: true },
		busy: { type: Boolean, default: false },
	},
	emits: ['up', 'top'],
	methods: { t },
}
</script>
