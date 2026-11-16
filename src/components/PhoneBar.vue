<!--
  SPDX-FileCopyrightText: 2026 hotochan123
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<template>
	<!-- Phone view, switch A of the design handover: the segment in the middle, one action of the open view on each side. -->
	<nav class="phone-bar" :class="{ rail }" :aria-label="t('story2bpmn', 'Views')">
		<div class="bar-side">
			<button v-if="pane === 'story'"
				type="button"
				class="button quiet bar-action"
				:disabled="busy || !canUndo"
				@click="$emit('undo')">
				<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
				<span>{{ t('story2bpmn', 'Undo') }}</span>
			</button>
			<button v-else
				type="button"
				class="button quiet bar-action"
				:class="{ unshown: !hasDiagram }"
				:disabled="!hasDiagram"
				@click="$emit('fit')">
				<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" /></svg>
				<span>{{ t('story2bpmn', 'Fit') }}</span>
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
			<template v-if="pane === 'story'">
				<button v-if="canTell"
					type="button"
					class="button main bar-next"
					:aria-label="t('story2bpmn', 'Next move')"
					:title="t('story2bpmn', 'Next move')"
					:disabled="busy"
					@click="$emit('next')">
					<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
				</button>
			</template>
			<button v-else
				type="button"
				class="button quiet bar-action follow"
				:class="{ unshown: !hasDiagram }"
				:disabled="!hasDiagram"
				:aria-pressed="follow ? 'true' : 'false'"
				@click="$emit('follow')">
				<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /></svg>
				<span>{{ t('story2bpmn', 'Follow') }}</span>
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
		hasDiagram: { type: Boolean, default: false },
		follow: { type: Boolean, default: true },
	},
	emits: ['pane', 'undo', 'next', 'fit', 'follow'],
	methods: { t },
}
</script>
