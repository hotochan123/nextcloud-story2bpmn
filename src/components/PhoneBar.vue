<!--
  SPDX-FileCopyrightText: 2026 hotochan123
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<template>
	<!-- Phone view (view C1 of Soothing, job 450): "Undo | Story · Diagram"; the round "+" only while there is something to tell. -->
	<nav class="phone-bar" :class="{ rail }" :aria-label="t('story2bpmn', 'Views')">
		<div class="bar-side">
			<button type="button"
				class="button quiet bar-action"
				:disabled="busy || !canUndo"
				@click="$emit('undo')">
				<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
				<span>{{ t('story2bpmn', 'Undo') }}</span>
			</button>
		</div>
		<div class="segment" role="tablist" :aria-label="t('story2bpmn', 'View')">
			<button type="button"
				role="tab"
				class="seg"
				:aria-selected="pane === 'story' ? 'true' : 'false'"
				@click="$emit('pane', 'story')">
				{{ t('story2bpmn', 'Story') }}
			</button>
			<button type="button"
				role="tab"
				class="seg"
				:aria-selected="pane === 'diagram' ? 'true' : 'false'"
				:aria-describedby="grown ? 'story2bpmn-grown' : undefined"
				@click="$emit('pane', 'diagram')">
				{{ t('story2bpmn', 'Diagram') }}
				<span v-if="grown" class="seg-point" aria-hidden="true" />
				<span v-if="grown" id="story2bpmn-grown" class="sr">{{ t('story2bpmn', 'The diagram has grown.') }}</span>
			</button>
		</div>
		<div class="bar-side end">
			<button v-if="pane === 'story' && canTell"
				type="button"
				class="button main bar-next"
				:aria-label="t('story2bpmn', 'Next move')"
				:title="t('story2bpmn', 'Next move')"
				:disabled="busy"
				@click="$emit('next')">
				<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
			</button>
		</div>
	</nav>
</template>

<script>
import { t } from '@nextcloud/l10n'

export default {
	name: 'PhoneBar',
	props: {
		pane: { type: String, required: true },
		rail: { type: Boolean, default: false },
		grown: { type: Boolean, default: false },
		busy: { type: Boolean, default: false },
		canUndo: { type: Boolean, default: false },
		/** Still something to tell (the story is not done): the round "+". */
		canTell: { type: Boolean, default: false },
	},
	emits: ['pane', 'undo', 'next'],
	methods: { t },
}
</script>
