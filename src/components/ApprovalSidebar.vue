<!--
  SPDX-FileCopyrightText: 2026 hotochan123
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<template>
	<NcAppSidebar :name="file.name"
		:subname="subname"
		class="story2bpmn-sidebar"
		:class="{ 'story2bpmn-sidebar-phone': phone }"
		@close="$emit('close')">
		<!-- Phone view: full screen under the Nextcloud header, a back arrow closes it. -->
		<template v-if="phone" #tertiary-actions>
			<button type="button"
				class="story2bpmn-sidebar-back"
				:aria-label="t('story2bpmn', 'Back to the story')"
				@click="$emit('close')">
				<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6" /></svg>
			</button>
		</template>
		<NcAppSidebarTab id="story2bpmn-proposals" :name="t('story2bpmn', 'Proposals')" :order="1">
			<template #icon>
				<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" /></svg>
			</template>
			<div class="side-content story2bpmn-workshop">
				<p v-if="!approval || !approval.valid" class="quiet-text">
					{{ t('story2bpmn', 'Proposals refer to a valid version. There is none yet.') }}
				</p>
				<p v-else-if="!proposals.length" class="quiet-text">
					{{ t('story2bpmn', 'No open proposals on valid version {number}.', { number: approval.valid.number }) }}
				</p>
				<article v-for="p in proposals"
					:key="p.id"
					class="proposal">
					<p class="who">
						<b>{{ p.actorName }}</b> · {{ when(p.date) }}
					</p>
					<p class="ref">
						{{ t('story2bpmn', 'Line {line}', { line: p.line }) }} · {{ kindText(p.kind) }}
					</p>
					<p v-if="p.text" class="new-text">
						{{ p.text }}
					</p>
					<p v-if="p.why" class="why">
						{{ p.why }}
					</p>
					<div class="row">
						<button type="button" class="button quiet small" @click="$emit('choose-line', p)">
							{{ t('story2bpmn', 'Go to line') }}
						</button>
						<template v-if="canDecide">
							<button v-for="b in buttonsOf(p)"
								:key="b.key"
								type="button"
								class="button small"
								:class="{ main: b.kind === 'accepted' && !b.armed, armed: b.armed }"
								:data-decide="b.key"
								:disabled="b.disabled"
								:aria-describedby="unsaved ? 'story2bpmn-unsaved-' + p.id : undefined"
								@click="press(p, b, $event)">
								{{ buttonText(b) }}
							</button>
						</template>
					</div>
					<p v-if="canDecide && unsaved"
						:id="'story2bpmn-unsaved-' + p.id"
						class="hint">
						{{ t('story2bpmn', 'Save or discard your changes first') }}
					</p>
				</article>
				<p v-if="approval && approval.valid" class="quiet-text">
					{{ t('story2bpmn', 'Accepting writes the new wording into the working file. Accepted proposals become valid together with the next approval.') }}
				</p>
			</div>
		</NcAppSidebarTab>
		<NcAppSidebarTab id="story2bpmn-versions" :name="t('story2bpmn', 'Versions')" :order="2">
			<template #icon>
				<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></svg>
			</template>
			<div class="side-content story2bpmn-workshop">
				<p v-if="versionList === false" class="quiet-text">
					{{ t('story2bpmn', 'The versions could not be loaded.') }}
				</p>
				<ul v-else class="list">
					<li>
						<span>{{ t('story2bpmn', 'Current state') }}
							<small>{{ approval && approval.valid ? (changed ? t('story2bpmn', 'changed since version {number}', { number: approval.valid.number }) : t('story2bpmn', 'same as version {number}', { number: approval.valid.number })) : '' }}</small>
						</span>
						<button v-if="changed"
							type="button"
							class="button quiet small"
							@click="$emit('compare')">
							{{ t('story2bpmn', 'Compare') }}
						</button>
					</li>
					<li v-for="v in named" :key="v.id">
						<span><b>{{ v.label }}</b><small>{{ when(v.mtime * 1000) }}</small></span>
					</li>
					<li v-if="unnamed" class="quiet-text">
						{{ n('story2bpmn', '%n state without a name (saved automatically; Nextcloud cleans these up)', '%n states without a name (saved automatically; Nextcloud cleans these up)', unnamed) }}
					</li>
				</ul>
			</div>
		</NcAppSidebarTab>
		<NcAppSidebarTab id="story2bpmn-share" :name="t('story2bpmn', 'Share')" :order="3">
			<template #icon>
				<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4" /></svg>
			</template>
			<div class="side-content story2bpmn-workshop">
				<ul v-if="shareList && shareList.length" class="list">
					<li v-for="(s, i) in shareList" :key="i">
						<span>{{ s.type === 3 ? t('story2bpmn', 'Public link') : s.name }}
							<small>{{ roleText(s) }}</small>
						</span>
					</li>
				</ul>
				<p v-else-if="shareList === false" class="quiet-text">
					{{ t('story2bpmn', 'Only whoever may share the file sees its shares.') }}
				</p>
				<p v-else class="quiet-text">
					{{ t('story2bpmn', 'Not shared yet.') }}
				</p>
				<a class="button" :href="link" target="_blank" rel="noopener">
					{{ t('story2bpmn', 'Share in Files …') }}
				</a>
				<p class="quiet-text">
					{{ t('story2bpmn', 'Share with the process owner with the right to edit, and with the involved parties to read: they can comment and make proposals. In this app "approval" only means declaring a state valid; giving others access is called sharing.') }}
				</p>
				<p class="quiet-text">
					{{ t('story2bpmn', 'Share the folder rather than the single file: then the reading copy lies next to the working file for everyone. With a single shared file it lands in the folder of whoever files it.') }}
				</p>
			</div>
		</NcAppSidebarTab>
	</NcAppSidebar>
</template>

<script>
import { n, t } from '@nextcloud/l10n'
import NcAppSidebar from '@nextcloud/vue/components/NcAppSidebar'
import NcAppSidebarTab from '@nextcloud/vue/components/NcAppSidebarTab'
import { versions, shares, filesLink } from '../nextcloudApi.js'
import { createArm } from '../armed.ts'
import { decisionButtons, shareRole } from '../approval.ts'

export default {
	name: 'ApprovalSidebar',
	components: { NcAppSidebar, NcAppSidebarTab },
	props: {
		file: { type: Object, required: true },
		approval: { type: Object, default: null },
		proposals: { type: Array, default: () => [] },
		canDecide: { type: Boolean, default: false },
		busy: { type: Boolean, default: false },
		/** Unsaved changes in the story: deciding is locked, nothing is saved along (job 416). */
		unsaved: { type: Boolean, default: false },
		changed: { type: Boolean, default: false },
		/** Grows when the sidebar is opened again: versions and shares are read anew. */
		refresh: { type: Number, default: 0 },
		/** Phone view: full screen. */
		phone: { type: Boolean, default: false },
	},
	emits: ['close', 'decide', 'choose-line', 'compare'],
	data() {
		return { versionList: null, shareList: null, armed: false }
	},
	computed: {
		subname() {
			const v = this.approval?.valid
			return v ? t('story2bpmn', 'Valid version {number}', { number: v.number }) : t('story2bpmn', 'Not approved yet')
		},
		named() {
			return (this.versionList || []).filter((v) => v.label).sort((a, b) => b.mtime - a.mtime)
		},
		unnamed() {
			return (this.versionList || []).filter((v) => !v.label).length
		},
		link() {
			return filesLink(this.file.id)
		},
	},
	watch: {
		// Locked or gone: an armed decision returns to normal (job 416).
		busy(v) {
			if (v) this.armer.disarm()
		},
		unsaved(v) {
			if (v) this.armer.disarm()
		},
		proposals(list) {
			if (this.armed && !list.some((p) => this.armed.startsWith(p.id + ':'))) this.armer.disarm()
		},
		refresh() {
			this.load()
		},
		'file.mtime'() {
			this.load()
		},
	},
	created() {
		// "Accept" and "Reject" are two-step like "Delete" (job 416): the first press arms, the second decides.
		this.armer = createArm({ onChange: (k) => { this.armed = k } })
	},
	mounted() {
		this.load()
	},
	beforeUnmount() {
		this.armer.end()
	},
	methods: {
		t,
		n,
		async load() {
			const id = this.file.id
			const [v, s] = await Promise.allSettled([versions(id), this.file.path ? shares(this.file.path) : Promise.reject(new Error('no path'))])
			if (id !== this.file.id) return
			this.versionList = v.status === 'fulfilled' ? v.value : false
			this.shareList = s.status === 'fulfilled' ? s.value : false
		},
		buttonsOf(p) {
			return decisionButtons({ id: p.id, kind: p.kind, unsaved: this.unsaved, busy: this.busy, armed: this.armed })
		},
		buttonText(b) {
			if (b.kind === 'accepted') return b.armed ? t('story2bpmn', 'Really accept?') : t('story2bpmn', 'Accept')
			if (b.kind === 'rejected') return b.armed ? t('story2bpmn', 'Really reject?') : t('story2bpmn', 'Reject')
			return t('story2bpmn', 'Done')
		},
		/** First press on "Accept"/"Reject" arms it; the second (on the armed button) decides. "Done" decides at once. */
		press(p, b, e) {
			if (b.disabled) return
			if (b.kind !== 'done' && !b.armed) return this.armer.arm(b.key, e?.currentTarget ?? null)
			this.armer.disarm()
			this.$emit('decide', { proposal: p, kind: b.kind })
		},
		when(d) {
			const date = new Date(d)
			return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
		},
		kindText(k) {
			if (k === 'change') return t('story2bpmn', 'Change line')
			if (k === 'insert') return t('story2bpmn', 'Insert after')
			if (k === 'remove') return t('story2bpmn', 'Remove line')
			return t('story2bpmn', 'Remark only')
		},
		roleText(s) {
			const role = shareRole(s, this.approval?.owner?.uid)
			if (role === 'link') return t('story2bpmn', 'Link, not an account')
			if (role === 'owner-edit') return t('story2bpmn', 'Process owner · can edit')
			if (role === 'owner-read') return t('story2bpmn', 'Process owner · can only read')
			return role === 'edit' ? t('story2bpmn', 'can edit') : t('story2bpmn', 'can read and comment')
		},
	},
}
</script>

<style scoped>
.side-content { display: grid; gap: 12px; padding: 10px 4px; min-height: 0; align-content: start; }
.quiet-text { margin: 0; color: var(--color-text-maxcontrast); font-size: 13.5px; }
.proposal { border: 1px solid var(--color-border); border-radius: 10px; padding: 10px 12px; display: grid; gap: 6px; }
.proposal p { margin: 0; overflow-wrap: anywhere; }
.proposal .ref { font: 600 11px/1.3 var(--font-face, monospace); letter-spacing: .06em; text-transform: uppercase; color: var(--color-text-maxcontrast); }
.proposal .new-text { font-family: monospace; font-size: 13px; background: var(--color-background-dark); padding: 6px 8px; border-radius: 6px; white-space: pre-wrap; }
.proposal .why { white-space: pre-wrap; }
.row { display: flex; flex-wrap: wrap; gap: 6px; }
.proposal .hint { color: var(--color-text-maxcontrast); font-size: 13px; }
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.list li { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.list small { display: block; color: var(--color-text-maxcontrast); }

</style>
