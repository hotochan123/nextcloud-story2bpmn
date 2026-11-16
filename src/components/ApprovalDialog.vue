<!--
  SPDX-FileCopyrightText: 2026 hotochan123
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<template>
	<NcDialog :name="t('story2bpmn', 'Ask for approval')"
		:buttons="buttons"
		size="normal"
		@closing="$emit('close')">
		<div class="story2bpmn-ask">
			<p>
				{{ t('story2bpmn', 'The saved state of today is put forward for approval.') }}
				<template v-if="counts">
					{{ t('story2bpmn', 'Compared with valid version {number}: {new} new, {changed} changed, {removed} removed.', { number: counts.number, new: counts.new, changed: counts.changed, removed: counts.removed }) }}
				</template>
			</p>
			<label class="field-label" for="story2bpmn-ask-owner">{{ t('story2bpmn', 'Process owner') }}</label>
			<NcSelect v-model="owner"
				input-id="story2bpmn-ask-owner"
				:options="found"
				label="name"
				:filterable="false"
				:loading="searching"
				:placeholder="t('story2bpmn', 'Search for a person')"
				:aria-label-combobox="t('story2bpmn', 'Process owner')"
				@search="search" />
			<div v-if="offer !== 'none'" class="field-hint warn">
				<p>{{ hint }}</p>
				<NcButton v-if="offer === 'button'"
					class="share-button"
					variant="secondary"
					:disabled="sharing"
					@click="share">
					{{ sharing ? t('story2bpmn', 'Sharing …') : t('story2bpmn', 'Share with edit rights') }}
				</NcButton>
				<p v-if="shareError" class="share-error" role="alert">
					{{ shareError }}
				</p>
			</div>
			<label class="field-label" for="story2bpmn-ask-note">{{ t('story2bpmn', 'Message (optional)') }}</label>
			<textarea id="story2bpmn-ask-note"
				v-model="note"
				class="note"
				rows="3"
				maxlength="1000" />
			<NcCheckboxRadioSwitch v-model="tag">
				{{ t('story2bpmn', 'Also show the state as a tag in Files') }}
			</NcCheckboxRadioSwitch>
			<ol class="what-happens">
				<li>{{ t('story2bpmn', 'Nextcloud names this state as the version “For approval” with the date of today.') }}</li>
				<li>{{ t('story2bpmn', 'A comment on the working file mentions the process owner; Nextcloud notifies them.') }}</li>
				<li>{{ t('story2bpmn', 'Changing the story afterwards withdraws the request.') }}</li>
			</ol>
		</div>
	</NcDialog>
</template>

<script>
import { t } from '@nextcloud/l10n'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcCheckboxRadioSwitch from '@nextcloud/vue/components/NcCheckboxRadioSwitch'
import NcDialog from '@nextcloud/vue/components/NcDialog'
import NcSelect from '@nextcloud/vue/components/NcSelect'
import { findUsers, shares, fileRights, shareForEdit } from '../nextcloudApi.js'
import { shareOffer, editShareRequest, rightsOf, prefillOwner } from '../approval.ts'
import { isUid } from '../core/index.js'

export default {
	name: 'ApprovalDialog',
	components: { NcButton, NcCheckboxRadioSwitch, NcDialog, NcSelect },
	props: {
		fileId: { type: Number, required: true },
		filePath: { type: String, default: '' },
		approval: { type: Object, default: null },
		/** { number, new, changed, removed } against the valid version, or null. */
		counts: { type: Object, default: null },
		language: { type: String, required: true },
	},
	emits: ['send', 'close'],
	data() {
		return {
			// Preselected only once the account search confirms the file's process owner (mounted).
			owner: null,
			found: [],
			searching: false,
			note: '',
			tag: this.approval ? this.approval.tag !== false : true,
			// null: not loaded; false: not readable; else the shares of the file
			shareList: null,
			// null: unknown; else { canShare, canEdit, ownerId } of the requesting account
			rights: null,
			sharing: false,
			shareError: '',
			searchNum: 0,
		}
	},
	computed: {
		buttons() {
			return [
				{ label: t('story2bpmn', 'Cancel'), variant: 'tertiary' },
				{ label: t('story2bpmn', 'Send request'), variant: 'primary', disabled: !this.owner, callback: () => this.send() },
			]
		},
		/** 'none', 'hint' or 'button': can the chosen person change the file (as far as the shares tell)? */
		offer() {
			return shareOffer({ owner: this.owner, shareList: this.shareList, rights: this.rights })
		},
		hint() {
			if (this.offer === 'none') return ''
			return t('story2bpmn', '{name} may not have the right to edit yet. Share the file with them in Files so they can approve it.', { name: this.owner.name })
		},
	},
	watch: {
		owner() {
			this.shareError = ''
		},
	},
	async mounted() {
		this.prefill()
		const [s, r] = await Promise.allSettled([
			this.filePath ? shares(this.filePath) : Promise.reject(new Error('no path')),
			this.filePath ? fileRights(this.filePath) : Promise.reject(new Error('no path')),
		])
		this.rights = r.status === 'fulfilled' ? rightsOf(r.value.permissions, r.value.ownerId) : null
		this.shareList = s.status === 'fulfilled' ? s.value : false
	},
	methods: {
		t,
		/** The file's process owner, preselected with the server's name when the search finds exactly that id. */
		async prefill() {
			const o = this.approval?.owner
			if (!o || !isUid(o.uid)) return
			const num = this.searchNum
			try {
				const hit = prefillOwner(o, await findUsers(o.uid, this.fileId))
				// The person searched or chose meanwhile: their choice stays.
				if (!hit || this.owner || num !== this.searchNum) return
				this.found = [hit]
				this.owner = hit
			} catch {
				// No preselection without the server's word.
			}
		},
		async search(text) {
			const num = ++this.searchNum
			if (!text.trim()) return
			this.searching = true
			try {
				const r = await findUsers(text.trim(), this.fileId)
				if (num === this.searchNum) this.found = r
			} catch {
				if (num === this.searchNum) this.found = []
			} finally {
				if (num === this.searchNum) this.searching = false
			}
		},
		/** Shares the working file with the chosen person with the right to edit; only on this click. */
		async share() {
			if (this.sharing || !this.owner || !Array.isArray(this.shareList)) return
			const owner = this.owner
			this.sharing = true
			this.shareError = ''
			try {
				await shareForEdit(this.filePath, owner.uid, editShareRequest(this.shareList, owner.uid))
				this.shareList = await shares(this.filePath)
			} catch (e) {
				if (this.owner?.uid === owner.uid) {
					this.shareError = t('story2bpmn', 'Sharing did not work: {message}', { message: e?.message || t('story2bpmn', 'The request could not be carried out.') }, undefined, { escape: false })
				}
			} finally {
				this.sharing = false
			}
		},
		send() {
			if (!this.owner) return false
			this.$emit('send', { owner: { uid: this.owner.uid, name: this.owner.name }, note: this.note, tag: this.tag })
		},
	},
}
</script>

<style scoped>
.story2bpmn-ask { display: grid; gap: 8px; padding-bottom: 8px; }
.story2bpmn-ask p { margin: 0; }
.field-label { font-weight: 600; margin-top: 6px; }
.field-hint.warn { color: var(--color-warning-text, #8a5a00); font-size: 13.5px; display: grid; gap: 6px; justify-items: start; }
.share-error { color: var(--color-error-text, #b00020); }
@media (pointer: coarse) { .share-button { min-height: 44px; } }
.note { width: 100%; min-height: 72px; font: inherit; }
.what-happens { margin: 4px 0 0 18px; padding: 0; color: var(--color-text-maxcontrast); font-size: 13.5px; }
</style>
