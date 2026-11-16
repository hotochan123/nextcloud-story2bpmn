<!--
  SPDX-FileCopyrightText: 2026 hotochan123
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<template>
	<NcAppSidebar :name="processName || file.name"
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
		<!-- The tab carries the number of open proposals (view B1); NcAppSidebarTab has no slot for a chip. -->
		<NcAppSidebarTab id="story2bpmn-proposals" :name="proposals.length ? t('story2bpmn', 'Proposals ({count})', { count: proposals.length }) : t('story2bpmn', 'Proposals')" :order="1">
			<template #icon>
				<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" /></svg>
			</template>
			<!-- View B1 (job 450): register entries with a state chip, open ones first, then the decided ones. -->
			<div class="side-content story2bpmn-workshop">
				<p v-if="!approval || !approval.valid" class="quiet-text">
					{{ t('story2bpmn', 'Proposals refer to a valid version. There is none yet.') }}
				</p>
				<p v-else-if="!proposals.length" class="quiet-text">
					{{ t('story2bpmn', 'No open proposals on valid version {number}.', { number: approval.valid.number }) }}
				</p>
				<div v-if="proposals.length || decidedList.length" class="register">
					<article v-for="p in proposals"
						:key="p.id"
						class="proposal entry"
						:aria-current="current === p.id ? 'true' : undefined">
						<p class="line1 who">
							<span class="so-chip so-chip--open">{{ t('story2bpmn', 'Undecided') }}</span>
							<span class="so-rubric">{{ t('story2bpmn', 'Line') }} <b class="so-num">{{ p.line }}</b> · {{ p.actorName }} · <span class="so-num">{{ when(p.date) }}</span></span>
						</p>
						<p class="ref">
							{{ kindText(p.kind) }}
						</p>
						<p v-if="p.text" class="new-text so-user-text">
							{{ p.text }}
						</p>
						<p v-if="p.why" class="why so-user-text">
							{{ p.why }}
						</p>
						<div class="row">
							<button type="button" class="button quiet small" @click="goTo(p)">
								{{ t('story2bpmn', 'Go to line') }}
							</button>
							<template v-if="canDecide">
								<button v-for="b in buttonsOf(p)"
									:key="b.key"
									type="button"
									class="button small"
									:class="{ quiet: b.kind === 'rejected' && !b.armed, armed: b.armed }"
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
					<article v-for="p in decidedList"
						:key="p.id"
						class="decided-proposal entry">
						<p class="line1">
							<span class="so-chip" :class="p.decision === 'rejected' ? 'so-chip--danger' : 'so-chip--closed'">{{ decisionText(p.decision) }}</span>
							<span class="so-rubric">{{ t('story2bpmn', 'Line') }} <b class="so-num">{{ p.line }}</b> · {{ p.actorName }} · <span class="so-num">{{ when(p.date) }}</span></span>
						</p>
						<p v-if="p.text || p.why" class="quote so-user-text">
							{{ p.text || p.why }}
						</p>
					</article>
				</div>
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
				<div v-else class="register">
					<div class="entry current-state">
						<p class="line1">
							<span v-if="approval && approval.valid && changed" class="so-chip so-chip--closed">{{ t('story2bpmn', 'Draft') }}</span>
							<span class="so-rubric">{{ t('story2bpmn', 'Current state') }}</span>
						</p>
						<p v-if="approval && approval.valid">
							{{ changed ? n('story2bpmn', 'Changes against version {number}: %n line', 'Changes against version {number}: %n lines', changedLines, { number: approval.valid.number }) : t('story2bpmn', 'same as version {number}', { number: approval.valid.number }) }}
						</p>
						<div v-if="changed" class="row">
							<button type="button"
								class="button quiet small"
								@click="$emit('compare')">
								{{ t('story2bpmn', 'Compare') }}
							</button>
						</div>
					</div>
					<div v-for="v in named" :key="v.id" class="entry version">
						<p class="line1">
							<span class="so-chip" :class="'so-chip--' + versionChip(v.label, approval?.valid?.number)">{{ v.label }}</span>
							<span class="so-rubric so-num">{{ when(v.mtime * 1000) }}</span>
						</p>
					</div>
					<p v-if="unnamed" class="quiet-text entry">
						{{ n('story2bpmn', '%n state without a name (saved automatically; Nextcloud cleans these up)', '%n states without a name (saved automatically; Nextcloud cleans these up)', unnamed) }}
					</p>
				</div>
			</div>
		</NcAppSidebarTab>
		<NcAppSidebarTab id="story2bpmn-approvals" :name="t('story2bpmn', 'Approvals')" :order="3">
			<template #icon>
				<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
			</template>
			<div class="side-content story2bpmn-workshop">
				<p v-if="!history.length" class="quiet-text">
					{{ t('story2bpmn', 'No request for approval yet.') }}
				</p>
				<div v-else class="register">
					<div v-for="h in history" :key="h.id" class="entry history" :class="'history-' + h.kind">
						<template v-if="h.kind === 'request'">
							<p class="line1">
								<span class="so-chip" :class="h.open ? 'so-chip--open' : 'so-chip--plain'">{{ h.open ? t('story2bpmn', 'Waiting') : t('story2bpmn', 'Asked') }}</span>
								<span class="so-rubric">{{ t('story2bpmn', 'asked') }} <span class="so-num">{{ when(h.date) }}</span> · {{ h.by }}</span>
							</p>
							<p>{{ t('story2bpmn', 'Asked {name} for approval', { name: h.owner }, undefined, { escape: false, sanitize: false }) }}</p>
							<p v-if="h.note" class="quote so-user-text">
								{{ h.note }}
							</p>
						</template>
						<template v-else>
							<p class="line1">
								<span class="so-chip so-chip--closed">{{ t('story2bpmn', 'Granted') }}</span>
								<span class="so-rubric"><span class="so-num">{{ when(h.date) }}</span> · {{ h.by }}</span>
							</p>
							<p>{{ t('story2bpmn', 'Version {number} approved', { number: h.number }) }}</p>
						</template>
					</div>
				</div>
				<p class="so-rubric shared-head">
					{{ t('story2bpmn', 'Shared with') }}
				</p>
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
import { decisionButtons, shareRole, decidedProposals, approvalHistory, versionChip } from '../approval.ts'

export default {
	name: 'ApprovalSidebar',
	components: { NcAppSidebar, NcAppSidebarTab },
	props: {
		file: { type: Object, required: true },
		approval: { type: Object, default: null },
		proposals: { type: Array, default: () => [] },
		/** The file's comments: decided proposals and the approval history are read from them (job 450). */
		comments: { type: Array, default: () => [] },
		/** The process name (title of the sidebar). */
		processName: { type: String, default: '' },
		/** Lines that differ from the valid version. */
		changedLines: { type: Number, default: 0 },
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
		return { versionList: null, shareList: null, armed: false, current: null }
	},
	computed: {
		subname() {
			const o = this.approval?.owner
			if (o) return t('story2bpmn', 'Process owner: {name}', { name: o.name || o.uid }, undefined, { escape: false, sanitize: false })
			const v = this.approval?.valid
			return v ? t('story2bpmn', 'Valid version {number}', { number: v.number }) : t('story2bpmn', 'Not approved yet')
		},
		decidedList() {
			return decidedProposals(this.comments, this.approval)
		},
		history() {
			return approvalHistory(this.comments, this.approval)
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
		versionChip,
		goTo(p) {
			this.current = p.id
			this.$emit('choose-line', p)
		},
		decisionText(d) {
			if (d === 'accepted') return t('story2bpmn', 'Accepted')
			if (d === 'rejected') return t('story2bpmn', 'Rejected')
			if (d === 'done') return t('story2bpmn', 'Done')
			return t('story2bpmn', 'Decided')
		},
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
.register { display: grid; }
.entry { display: grid; gap: 6px; padding: 10px 12px; border-top: 1px solid var(--border); }
.entry:first-child { border-top: 0; }
.entry p { margin: 0; overflow-wrap: anywhere; }
.entry[aria-current="true"] { background: var(--so-accent-tint); box-shadow: inset 2px 0 0 var(--accent); }
.line1 { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
.proposal .ref { font: 400 var(--text-sm)/1.3 var(--font-body); color: var(--muted); }
.proposal .new-text { white-space: pre-wrap; }
.proposal .why, .quote { white-space: pre-wrap; }
.quote { color: var(--muted); }
.row { display: flex; flex-wrap: wrap; gap: 6px; }
.proposal .hint { color: var(--color-text-maxcontrast); font-size: 13px; }
.shared-head { margin: 8px 0 0; }
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.list li { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.list small { display: block; color: var(--color-text-maxcontrast); }
</style>
