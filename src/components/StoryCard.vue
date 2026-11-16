<!--
  SPDX-FileCopyrightText: 2026 hotochan123
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<template>
	<section class="card" aria-labelledby="story2bpmn-h-story">
		<div class="card-head">
			<h2 id="story2bpmn-h-story">
				{{ view.sub?.trigger ? t('story2bpmn', 'Story · at any time') : view.sub ? t('story2bpmn', 'Story · subprocess') : t('story2bpmn', 'Story') }}
			</h2>
			<span class="number">{{ moves.length ? n('story2bpmn', '%n move', '%n moves', moves.length) : '' }}</span>
			<div class="right werkzeug story-tools">
				<button type="button"
					class="button quiet"
					:disabled="busy || textMode || !canBack"
					:title="t('story2bpmn', 'Undo the last change')"
					@click="undo">
					<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
					<span>{{ t('story2bpmn', 'Undo') }}</span>
				</button>
				<button v-if="!view.sub"
					ref="asText"
					type="button"
					class="button quiet as-text"
					:aria-pressed="textMode ? 'true' : 'false'"
					:disabled="busy || compareOn"
					@click="toggleText">
					<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 10h10M4 14h16M4 18h8" /></svg>
					<span>{{ t('story2bpmn', 'Edit as text') }}</span>
				</button>
			</div>
		</div>

		<div v-if="messages.length" class="messages" aria-live="polite">
			<div v-for="m in messages"
				:key="m.id"
				class="message error"
				role="alert">
				<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></svg>
				<div v-if="m.line !== undefined">
					<strong v-if="m.title">{{ m.title }} </strong><button type="button"
						class="jump"
						:aria-label="t('story2bpmn', 'Go to line {number}: {text}', { number: m.line + 1, text: m.text }, undefined, { escape: false, sanitize: false })"
						@click="jumpTo(m.line)">{{ m.text }}</button>
				</div>
				<div v-else><strong v-if="m.title">{{ m.title }} </strong>{{ m.text }}</div>
				<button type="button"
					class="button quiet icon to"
					:aria-label="t('story2bpmn', 'Dismiss')"
					@click="messages = messages.filter((x) => x !== m)">
					<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
				</button>
			</div>
		</div>

		<div v-if="view.sub" class="message info sub-note" role="note">
			<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.5v.01" /></svg>
			<div v-if="view.sub.within">
				{{ t('story2bpmn', 'What happens when “{name}” comes. It can come at any time while “{sub}” runs.', { name: view.sub.name, sub: view.sub.within }, undefined, { escape: false, sanitize: false }) }}
			</div>
			<div v-else-if="view.sub.trigger">
				{{ t('story2bpmn', 'What happens when “{name}” comes. It can come at any time during the whole flow.', { name: view.sub.name }, undefined, { escape: false, sanitize: false }) }}
			</div>
			<div v-else>
				{{ t('story2bpmn', 'The flow behind “{name}”. It begins plainly; a subprocess has no trigger.', { name: view.sub.name }, undefined, { escape: false, sanitize: false }) }}
			</div>
		</div>

		<div v-if="exampleHint" class="message info example-note" role="note">
			<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.5v.01" /></svg>
			<div>
				{{ exampleHint === 'phone' ? t('story2bpmn', 'Example – change whatever you like. For a process of your own: ⋯ → New.') : t('story2bpmn', 'Example – change whatever you like. For a process of your own: New.') }}
			</div>
		</div>

		<div v-if="draftNote && !textMode" class="message info draft-note" role="status">
			<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
			<div>
				<p><strong>{{ t('story2bpmn', 'Unsaved state from {time} found.', { time: draftNote.time }) }}</strong></p>
				<div class="notice-actions">
					<button type="button"
						class="button small main"
						:disabled="busy"
						@click="$emit('restore-draft')">
						{{ t('story2bpmn', 'Restore') }}
					</button>
					<button type="button"
						class="button small"
						:disabled="busy"
						@click="$emit('discard-draft')">
						{{ t('story2bpmn', 'Discard') }}
					</button>
				</div>
			</div>
		</div>

		<div v-if="notice && !textMode" class="message approval-notice" :class="'notice-' + notice.kind" role="status">
			<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path v-if="notice.kind === 'valid'" d="m5 12.5 4.5 4.5L19 7.5" /><path v-else-if="notice.kind === 'review'" d="M4 12 20 4l-4 16-4-6z" /><g v-else><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.5v.01" /></g></svg>
			<div>
				<template v-if="notice.kind === 'review'">
					<p><strong>{{ t('story2bpmn', 'Waiting for approval by {name} since {date}.', { name: notice.owner, date: day(notice.date) }) }}</strong></p>
					<p v-if="notice.forOwner">
						{{ t('story2bpmn', '{name} asks you to approve this state. Compare it with the valid version, then approve it on the right.', { name: notice.by }) }}
					</p>
					<p v-else>
						{{ t('story2bpmn', 'Nextcloud named this state as a version. Changing it now withdraws the request.') }}
					</p>
				</template>
				<template v-else-if="notice.kind === 'changed'">
					<p><strong>{{ n('story2bpmn', 'Changed since valid version {number}: %n line.', 'Changed since valid version {number}: %n lines.', notice.lines, { number: notice.number }) }}</strong></p>
					<p>{{ t('story2bpmn', 'Changes to a valid version count as a proposal. They become valid once the process owner approves them.') }}</p>
				</template>
				<template v-else-if="notice.kind === 'unconfirmed'">
					<p v-if="notice.failed">
						<strong>{{ t('story2bpmn', 'The approval could not be checked with Nextcloud. The file counts as a draft for now.') }}</strong>
					</p>
					<p v-else>
						<strong>{{ t('story2bpmn', 'The approval details in this file are not confirmed by Nextcloud. The file counts as a draft.') }}</strong>
					</p>
				</template>
				<template v-else>
					<p><strong>{{ t('story2bpmn', 'Valid version {number}, approved on {date} by {name}.', { number: notice.number, date: day(notice.date), name: notice.by }) }}</strong></p>
					<p v-if="canPropose">
						{{ t('story2bpmn', 'Changes only as a proposal: ⋯ on a line.') }}
					</p>
				</template>
				<div class="notice-actions">
					<button v-if="notice.kind === 'review' && notice.mine"
						type="button"
						class="button small"
						:disabled="busy"
						@click="$emit('withdraw')">
						{{ t('story2bpmn', 'Withdraw request') }}
					</button>
					<button v-if="(notice.kind === 'changed' || (notice.kind === 'review' && notice.canCompare)) && !compareOn"
						type="button"
						class="button small"
						:disabled="textMode"
						@click="$emit('compare', true)">
						{{ t('story2bpmn', 'Compare') }}
					</button>
				</div>
			</div>
		</div>

		<section v-if="compareOn" class="compare" :aria-label="t('story2bpmn', 'Comparison with valid version {number}', { number: approval.valid.number })">
			<div class="compare-head">
				<h3>{{ t('story2bpmn', 'Comparison with valid version {number}', { number: approval.valid.number }) }}</h3>
				<button type="button" class="button quiet small" @click="$emit('compare', false)">
					{{ t('story2bpmn', 'Close comparison') }}
				</button>
			</div>
			<div class="tabs" role="tablist">
				<button type="button"
					role="tab"
					class="button quiet small"
					:aria-selected="compareAll ? 'false' : 'true'"
					@click="compareAll = false">
					{{ t('story2bpmn', 'Only changes ({count})', { count: changes.length }) }}
				</button>
				<button type="button"
					role="tab"
					class="button quiet small"
					:aria-selected="compareAll ? 'true' : 'false'"
					@click="compareAll = true">
					{{ t('story2bpmn', 'All lines') }}
				</button>
			</div>
			<ol class="diff">
				<li v-for="(d, i) in shownDiff" :key="i" :class="'diff-' + d.kind">
					<span class="diff-word">{{ diffWord(d.kind) }}</span>
					<span class="diff-text">
						<component :is="d.kind === 'removed' ? 's' : 'span'">
							<template v-for="(part, j) in lineParts((d.kind === 'removed' ? d.old : d.text).trim())" :key="j">
								<b v-if="part.subtype === 'sw'" class="sw">{{ part.text }}</b>
								<span v-else-if="part.subtype === 'o'" :class="['o', 'o-' + part.object]">{{ part.text }}</span>
								<template v-else>{{ part.text }}</template>
							</template>
						</component>
						<span v-if="d.kind === 'changed'" class="diff-old">{{ t('story2bpmn', 'Before:') }} {{ d.old.trim() }}</span>
					</span>
				</li>
				<li v-if="!shownDiff.length" class="diff-same">
					<span class="diff-text">{{ t('story2bpmn', 'No changes.') }}</span>
				</li>
			</ol>
			<p class="diff-legend">
				{{ t('story2bpmn', 'Green: new. Yellow: changed, the old wording below. Red and struck through: removed. Each change also carries a word. The diagram frames new and changed shapes.') }}
			</p>
		</section>

		<div v-if="moves.length" v-show="!textMode && !compareOn" class="key" aria-hidden="true">
			<span>{{ t('story2bpmn', 'Colours:') }}</span>
			<span v-for="(name, a) in keyObjects" :key="a" :class="['o', 'o-' + a]">{{ name }}</span>
		</div>

		<TextEditor v-if="textMode"
			ref="editor"
			:start="textStart"
			:initial="textInitial"
			:previous="textPrevious"
			:language="language"
			:busy="busy"
			:phone="phone"
			@apply="textApply"
			@edited="$emit('text-draft', $event)"
			@cancel="textTo" />

		<ol v-show="!textMode && !compareOn" class="course">
			<template v-for="(l, i) in view.lines" :key="i">
			<!-- What can come at any time is told after the main flow: the marker stays above it. -->
			<NextLine v-if="i === nextAt" :next="panel.next" />
			<li class="line"
				:class="{ marked: marked(l), chosen: l.move !== undefined && l.move === chosenLine, choosable: l.move !== undefined, fresh: l.move !== undefined && l.move === fresh, flash: l.move !== undefined && l.move === flashLine }"
				:data-line="l.move"
				@click="lineClick($event, l)">
				<span class="num">
					<button v-if="l.move !== undefined"
						type="button"
						class="num-button"
						:aria-pressed="l.move === chosenLine ? 'true' : 'false'"
						:aria-label="t('story2bpmn', 'Show line {number} in the diagram', { number: l.move + 1 })"
						@click.stop="$emit('choose', l.move)">{{ l.move + 1 }}</button>
				</span>
				<span class="txt" :class="{ deep: l.depth > 0 }" :style="{ '--t': l.depth }">
					<template v-for="(part, j) in lineParts(l.text)" :key="j">
						<b v-if="part.subtype === 'sw'" class="sw">{{ part.text }}</b>
						<span v-else-if="part.subtype === 'o'" :class="['o', 'o-' + part.object]" :title="objects[part.object]"><svg v-if="part.object === 'signal'" class="tri" viewBox="0 0 10 9" aria-hidden="true"><polygon points="5,1 9,8 1,8" :class="{ filled: part.filled }" /></svg><span class="sr">{{ part.sub ? t('story2bpmn', 'Subprocess') : objects[part.object] }}: </span>{{ part.text }}<svg v-if="part.sub" class="plus" viewBox="0 0 10 10" aria-hidden="true"><rect x="0.5" y="0.5" width="9" height="9" /><path d="M5 2.5v5M2.5 5h5" /></svg></span>
						<template v-else>{{ part.text }}</template>
					</template>
					<span v-if="l.move !== undefined && view.bare?.includes(l.move)" class="bare-note">{{ t('story2bpmn', 'No path has a step yet – the branch appears in the diagram once one is added') }}</span>
					<span v-if="l.move !== undefined && l.move === fresh" class="new-tag">{{ t('story2bpmn', 'New') }}</span>
					<span v-if="proposalTags[view.lineOffset + i]" class="vtag">{{ proposalTags[view.lineOffset + i] === 'remark' ? t('story2bpmn', 'Remark') : t('story2bpmn', 'Proposal') }}</span>
					<template v-if="!view.sub?.trigger && l.move !== undefined && view.subs[l.move]">
						<span v-if="!view.subs[l.move].told" class="sub-open">{{ t('story2bpmn', 'not told yet') }}</span>
						<button type="button"
							class="button quiet small open-sub"
							:disabled="busy"
							@click.stop="$emit('open', l.move)">
							<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4z" /><path d="M12 8v8M8 12h8" /></svg>
							<span>{{ t('story2bpmn', 'Open the flow behind it') }}</span>
						</button>
					</template>
				</span>
				<span>
					<button v-if="l.move !== undefined && moves[l.move]"
						type="button"
						class="button more"
						:aria-expanded="menu === l.move ? 'true' : 'false'"
						:aria-label="t('story2bpmn', 'Edit line {number}', { number: l.move + 1 })"
						:title="t('story2bpmn', 'Edit line')"
						:data-menu="l.move"
						@click="toggleMenu(l.move)">
						<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="19" cy="12" r="1.3" fill="currentColor" /></svg>
					</button>
				</span>
				<!-- Phone: a chosen line offers the way to its shape and its ⋯ sheet. -->
				<div v-if="phone && l.move !== undefined && l.move === chosenLine && moves[l.move]" class="line-actions line-tap" :style="{ '--t': l.depth }">
					<button type="button" class="button" @click="$emit('show', l.move)">
						<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h18M15 6l6 6-6 6" /></svg>
						<span>{{ t('story2bpmn', 'Show in the diagram') }}</span>
					</button>
					<button type="button" class="button quiet" :data-more="l.move" @click="toggleMenu(l.move)">
						{{ t('story2bpmn', 'More') }}
					</button>
				</div>
				<div v-if="!phone && l.move !== undefined && menu === l.move" class="line-actions" :style="{ '--t': l.depth }">
					<button v-for="a in actionsOf(l.move)"
						:key="a"
						type="button"
						class="button"
						:class="{ armed: deleteArmed === a }"
						:disabled="busy"
						@click="action(a, l.move, $event)">
						{{ actionText(a, l.move) }}
					</button>
					<button v-if="canPropose && validLine(view.lineOffset + i) !== null"
						type="button"
						class="button"
						:disabled="busy"
						@click="openProposal(view.lineOffset + i)">
						{{ t('story2bpmn', 'Make a proposal') }}
					</button>
				</div>
				<!-- "+ Insert before": the same choice as "What happens next?", only what fits here (job 408). -->
				<div v-if="!phone && choosing !== null && choosing === l.move" class="before-choice move-form" :style="{ '--t': l.depth }">
					<p :id="'story2bpmn-before-' + i" class="label">
						{{ t('story2bpmn', 'What comes before?') }}
					</p>
					<div class="options rare" role="group" :aria-labelledby="'story2bpmn-before-' + i">
						<button v-for="(o, j) in beforeChoices"
							:key="o"
							type="button"
							class="option"
							:aria-keyshortcuts="String(j + 1)"
							:disabled="busy"
							:data-o="o"
							@click="chooseBefore(o)">
							<kbd aria-hidden="true">{{ j + 1 }}</kbd>
							<span class="o-text">{{ options[o] }}</span>
						</button>
					</div>
					<div class="row">
						<button type="button" class="button quiet" @click="cancelChoice">
							{{ t('story2bpmn', 'Cancel') }}
						</button>
					</div>
				</div>
				<form v-if="proposal && proposal.index === view.lineOffset + i"
					class="proposal-form"
					:style="{ '--t': l.depth }"
					@submit.prevent="sendProposal">
					<p class="label">
						{{ t('story2bpmn', 'Proposal on line {line} · valid version {number}', { line: proposal.line, number: approval.valid.number }) }}
					</p>
					<label :for="'story2bpmn-pk-' + i">{{ t('story2bpmn', 'Kind') }}</label>
					<select :id="'story2bpmn-pk-' + i" v-model="proposal.kind">
						<option value="change">{{ t('story2bpmn', 'Change line') }}</option>
						<option value="insert">{{ t('story2bpmn', 'Insert after') }}</option>
						<option value="remove">{{ t('story2bpmn', 'Remove line') }}</option>
						<option value="remark">{{ t('story2bpmn', 'Remark only') }}</option>
					</select>
					<template v-if="proposal.kind === 'change' || proposal.kind === 'insert'">
						<label :for="'story2bpmn-pt-' + i">{{ t('story2bpmn', 'New wording') }}</label>
						<input :id="'story2bpmn-pt-' + i"
							v-model="proposal.text"
							class="mono"
							type="text"
							maxlength="500">
						<small>{{ t('story2bpmn', 'Written as story text, so the process owner can take it over with one click.') }}</small>
					</template>
					<label :for="'story2bpmn-pw-' + i">{{ proposal.kind === 'remark' ? t('story2bpmn', 'Remark') : t('story2bpmn', 'Why? (optional)') }}</label>
					<textarea :id="'story2bpmn-pw-' + i" v-model="proposal.why" rows="2" maxlength="1000" />
					<p class="label">
						{{ t('story2bpmn', 'Goes to the working file as this comment') }}
					</p>
					<pre class="raw">{{ proposalPreview }}</pre>
					<p v-if="proposal.error" class="form-error" role="alert">
						{{ proposal.error }}
					</p>
					<div class="row">
						<button type="submit" class="button main" :disabled="busy || proposal.sending">
							{{ t('story2bpmn', 'Send proposal') }}
						</button>
						<button type="button" class="button quiet" @click="proposal = null">
							{{ t('story2bpmn', 'Cancel') }}
						</button>
					</div>
				</form>
				<MoveForm v-if="!phone && form && form.place !== 'added' && form.index === l.move && l.move !== undefined"
					:key="formKey"
					v-bind="formProps"
					@apply="apply"
					@cancel="cancel" />
			</li>
			</template>
			<NextLine v-if="nextAt === view.lines.length" :next="panel.next" />
		</ol>

		<!-- Phone: the next move (and a changed or inserted line) is told in a sheet from below. -->
		<div v-show="!textMode && !compareOn && (!asSheet || sheetShown)"
			ref="move"
			class="move"
			:class="{ 'as-sheet': asSheet }"
			:role="asSheet ? 'dialog' : undefined"
			:aria-label="asSheet ? sheetTitle : undefined">
			<div v-if="asSheet" class="sheet-head">
				<span class="grip" aria-hidden="true" />
				<h3>{{ sheetTitle }}</h3>
				<button v-if="sheetClosable"
					type="button"
					class="button quiet icon sheet-close"
					:aria-label="t('story2bpmn', 'Close')"
					@click="closeSheet">
					<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
				</button>
			</div>
			<!-- Nothing told yet: above the form, without scrolling, the example process shows what a told story looks like (job 396). -->
			<div v-if="!moves.length && !view.sub" class="example-start">
				<button type="button" class="button quiet" :disabled="busy" @click="$emit('example')">
					{{ t('story2bpmn', 'See an example') }}
				</button>
			</div>
			<div v-if="phone && choosing !== null && !form" class="before-choice">
				<div class="options rare" role="group" :aria-label="t('story2bpmn', 'What comes before?')">
					<button v-for="(o, j) in beforeChoices"
						:key="o"
						type="button"
						class="option"
						:aria-keyshortcuts="String(j + 1)"
						:disabled="busy"
						:data-o="o"
						@click="chooseBefore(o)">
						<kbd aria-hidden="true">{{ j + 1 }}</kbd>
						<span class="o-text">{{ options[o] }}</span>
					</button>
				</div>
				<div class="row">
					<button type="button" class="button quiet" @click="cancelChoice">
						{{ t('story2bpmn', 'Cancel') }}
					</button>
				</div>
			</div>
			<MoveForm v-else-if="phone && form"
				:key="formKey"
				v-bind="formProps"
				@apply="apply"
				@cancel="cancel" />
			<div v-else-if="panelDone && view.sub" class="done-box">
				<span class="check"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></span>
				<div>
					<p class="question">
						{{ stillOpen.length ? t('story2bpmn', 'Told to its end, except the paths still open.') : untold.length ? t('story2bpmn', 'Told to its end, except the flows still open.') : view.sub.trigger ? t('story2bpmn', 'Told to its end.') : t('story2bpmn', 'Subprocess told to its end.') }}
					</p>
					<!-- What can come at any time while the subprocess runs, not told yet: the subprocess is not done (job 397). -->
					<p v-for="name in untold" :key="name" class="sub-open">
						{{ t('story2bpmn', 'Still open: the flow behind “{name}”.', { name }, undefined, { escape: false, sanitize: false }) }}
					</p>
					<ul v-if="stillOpen.length" class="still-open">
						<li v-for="o in stillOpen" :key="o.index">
							<button type="button"
								class="path-button"
								:disabled="busy"
								@click="tellAt(o.index)">
								<span class="path-pill">{{ t('story2bpmn', 'Still open: {path}', { path: o.path }, undefined, { escape: false, sanitize: false }) }}</span>
								<span class="before">{{ t('story2bpmn', 'Tell now') }}<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></span>
							</button>
						</li>
					</ul>
					<p v-if="view.sub.within">
						{{ view.sub.trigger?.keepsRunning ? t('story2bpmn', 'The subprocess keeps running alongside.') : t('story2bpmn', 'The subprocess stops; in the main flow it continues after “{name}”.', { name: view.sub.within }, undefined, { escape: false, sanitize: false }) }}
					</p>
					<p v-else-if="view.sub.trigger">
						{{ view.sub.trigger.keepsRunning ? t('story2bpmn', 'The main flow keeps running alongside.') : t('story2bpmn', 'Everything else in the main flow stops.') }}
					</p>
					<p v-else>
						{{ t('story2bpmn', 'In the main flow it continues after “{name}”.', { name: view.sub.name }, undefined, { escape: false, sanitize: false }) }}
					</p>
					<div class="row">
						<button type="button" class="button" :disabled="busy" @click="$emit('back')">
							<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
							<span>{{ t('story2bpmn', 'Back to “{name}”', { name: view.sub.process }, undefined, { escape: false, sanitize: false }) }}</span>
						</button>
						<!-- A subprocess told to its end still takes what can come at any time while it runs (job 397). -->
						<button v-if="!view.sub.trigger"
							type="button"
							class="button"
							:aria-pressed="chosen === 'anytime' ? 'true' : 'false'"
							:disabled="busy"
							@click="choose('anytime')">
							<span>{{ t('story2bpmn', 'Something that can come at any time') }}</span>
						</button>
					</div>
					<MoveForm v-if="!view.sub.trigger && form && form.place === 'added' && form.subtype === 'anytime'"
						:key="formKey"
						v-bind="formProps"
						@apply="apply"
						@cancel="cancel" />
				</div>
			</div>
			<div v-else-if="panelDone" class="done-box">
				<span class="check"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></span>
				<div>
					<p class="question">
						{{ stillOpen.length ? t('story2bpmn', 'Told to its end, except the paths still open.') : t('story2bpmn', 'Done, every path has been told to its end.') }}
					</p>
					<ul v-if="stillOpen.length" class="still-open">
						<li v-for="o in stillOpen" :key="o.index">
							<button type="button"
								class="path-button"
								:disabled="busy"
								@click="tellAt(o.index)">
								<span class="path-pill">{{ t('story2bpmn', 'Still open: {path}', { path: o.path }, undefined, { escape: false, sanitize: false }) }}</span>
								<span class="before">{{ t('story2bpmn', 'Tell now') }}<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></span>
							</button>
						</li>
					</ul>
					<p>{{ t('story2bpmn', 'Read the story once more: is every path right, is a step missing? Use ⋯ on any line to change, insert or delete.') }}</p>
					<p v-for="name in untold" :key="name" class="sub-open">
						{{ t('story2bpmn', 'Still open: the flow behind “{name}”.', { name }, undefined, { escape: false, sanitize: false }) }}
					</p>
					<div class="row">
						<button type="button"
							class="button"
							:aria-pressed="chosen === 'anytime' ? 'true' : 'false'"
							:disabled="busy"
							@click="choose('anytime')">
							<span>{{ t('story2bpmn', 'Something that can come at any time') }}</span>
						</button>
					</div>
					<MoveForm v-if="form && form.place === 'added' && form.subtype === 'anytime'"
						:key="formKey"
						v-bind="formProps"
						@apply="apply"
						@cancel="cancel" />
				</div>
			</div>
			<template v-else>
				<div class="move-head">
					<p class="label">
						{{ t('story2bpmn', 'Next move') }}
					</p>
					<span v-if="panel.path" class="path">{{ t('story2bpmn', 'On the path') }} <span class="path-pill">{{ panel.path }}</span></span>
					<button v-if="openAt !== null"
						type="button"
						class="button quiet stop-here"
						:disabled="busy"
						@click="stopHere">
						{{ t('story2bpmn', 'Stop telling here') }}
					</button>
				</div>
				<h3 id="story2bpmn-question" class="question">
					{{ panel.question }}
				</h3>
				<div v-if="rank.frequent.length"
					class="options frequent"
					role="group"
					aria-labelledby="story2bpmn-question">
					<button v-for="o in rank.frequent"
						:key="o"
						type="button"
						class="option"
						:aria-pressed="chosen === o ? 'true' : 'false'"
						:aria-keyshortcuts="String(row.indexOf(o) + 1)"
						:disabled="busy"
						:data-o="o"
						@click="choose(o)">
						<kbd aria-hidden="true">{{ row.indexOf(o) + 1 }}</kbd>
						<span class="o-text">{{ options[o] }}<small>{{ helps[o] }}</small></span>
					</button>
				</div>
				<MoveForm v-if="form && form.place === 'added' && frequentKind(form.subtype)"
					:key="formKey"
					v-bind="formProps"
					@apply="apply"
					@cancel="cancel" />
				<template v-if="rank.rare.length">
					<p id="story2bpmn-rank-rare" class="rank-title">
						{{ t('story2bpmn', 'Needed less often') }}
					</p>
					<div class="options rare" role="group" aria-labelledby="story2bpmn-rank-rare">
						<button v-for="o in rank.rare"
							:key="o"
							type="button"
							class="option"
							:aria-pressed="chosen === o ? 'true' : 'false'"
							:aria-keyshortcuts="String(row.indexOf(o) + 1)"
							:aria-describedby="'story2bpmn-help-' + o"
							:disabled="busy"
							:data-o="o"
							@click="choose(o)"
							@mouseenter="helpLive = helps[o]"
							@focus="helpLive = helps[o]">
							<kbd aria-hidden="true">{{ row.indexOf(o) + 1 }}</kbd>
							<span class="o-text">{{ options[o] }}</span>
							<span :id="'story2bpmn-help-' + o" class="sr">{{ helps[o] }}</span>
						</button>
					</div>
					<p class="help-live" aria-hidden="true">
						{{ helpLive || hint }}
					</p>
				</template>
				<MoveForm v-if="form && form.place === 'added' && !frequentKind(form.subtype)"
					:key="formKey"
					v-bind="formProps"
					@apply="apply"
					@cancel="cancel" />
				<div v-if="panel.open && panel.open.length" class="open-paths">
					<p class="label">
						{{ t('story2bpmn', 'Still open afterwards') }}
					</p>
					<p>{{ t('story2bpmn', 'Comes up once this path has been told to its end.') }}</p>
					<ul>
						<li v-for="(w, i) in panel.open" :key="i">
							<button type="button"
								class="path-button"
								:disabled="busy"
								@click="set(switchTo(moves, i))">
								<span class="path-pill">{{ w }}</span>
								<span class="before">{{ t('story2bpmn', 'Tell now') }}<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></span>
							</button>
						</li>
					</ul>
				</div>
				<p v-if="!rank.rare.length" class="move-hint">
					{{ hint }}
				</p>
				<span class="sr">{{ t('story2bpmn', 'Keys 1–9 pick an option.') }}</span>
			</template>
		</div>

		<BottomSheet v-if="phone && menu !== null && moves[menu]"
			:title="t('story2bpmn', 'Line {number}', { number: menu + 1 })"
			@close="closeMenu">
			<button v-for="a in menuActions"
				:key="a"
				type="button"
				class="sheet-item"
				:class="{ armed: deleteArmed === a }"
				:disabled="busy && a !== 'show'"
				@click="sheetAction(a, $event)">
				{{ a === 'show' ? t('story2bpmn', 'Show in the diagram') : a === 'propose' ? t('story2bpmn', 'Make a proposal') : actionText(a, menu) }}
			</button>
		</BottomSheet>
	</section>
</template>

<script>
import { n, t } from '@nextcloud/l10n'
import { nextTick } from 'vue'
import BottomSheet from './BottomSheet.vue'
import MoveForm from './MoveForm.vue'
import NextLine from './NextLine.vue'
import TextEditor from './TextEditor.vue'
import {
	append, beforeAt, hasFields, removeStep, exceptionOf, keepPath, keptPath, dropPath, droppedPath, reopen, ranks, switchTo,
	changeLine, hereState, tellHere, openPaths, applyTarget, endsTelling,
	lineActions, lineParts, digitKey, keyEnv, storyKeys, textFrom, withProcess, withSubprocess, beforeOptions, insertAt, exceptionAt, triggerAdded,
	untoldFlows, FREQUENT,
} from '../workbench.ts'
import { END_KINDS, START_KINDS } from '../core/story.ts'
import { compareLines, validLines, validStory, validLineOf, validIndexOf, currentIndexOf, proposalAt, proposalText, currentLines as linesOf } from '../approval.ts'
import { sheetActions } from '../phoneView.ts'
import { createArm } from '../armed.ts'
import { formFor, triggerIndex } from '../lineMenu.ts'
import { dropText, helpText, keepText, objectText, optionText } from '../texts.js'


export default {
	name: 'GeschichteKarte',
	components: { BottomSheet, MoveForm, NextLine, TextEditor },
	props: {
		view: { type: Object, required: true },
		moves: { type: Array, required: true },
		language: { type: String, required: true },
		busy: { type: Boolean, default: false },
		/** (added: Move[]) => Promise<Result> */
		change: { type: Function, required: true },
		/** () => Promise<Result>: back to the state before the last change. */
		back: { type: Function, required: true },
		/** An earlier state exists: undo is possible only then (job 409). */
		canBack: { type: Boolean, default: false },
		/** Chosen line (move index) or null; shown in the diagram too. */
		chosenLine: { type: Number, default: null },
		/** Approval state of the file (src/core/approval.ts) or null. */
		approval: { type: Object, default: null },
		/** The approval line above the story (App.vue notice) or null. */
		notice: { type: Object, default: null },
		/** Comparison with the valid version instead of the lines. */
		compare: { type: Boolean, default: false },
		/** Open proposals (approval.ts openProposals). */
		proposals: { type: Array, default: () => [] },
		canPropose: { type: Boolean, default: false },
		/** (proposal) => Promise<{ ok, error? }> */
		propose: { type: Function, default: null },
		/** Phone view (App.vue): forms and menus as sheets from below. */
		phone: { type: Boolean, default: false },
		/** Move index of the line marked NEW (phone, after a move), or null. */
		fresh: { type: Number, default: null },
		/** Note above the story while the example is open: 'phone', 'wide' or null (src/example.ts). */
		exampleHint: { type: String, default: null },
		/** Unsaved state found in the browser ({ time }, App.vue draftNote, job 399) or null. */
		draftNote: { type: Object, default: null },
	},
	emits: ['example', 'choose', 'compare', 'withdraw', 'open', 'back', 'moved', 'show', 'sheet', 'text-mode', 'restore-draft', 'discard-draft', 'text-draft'],
	data() {
		return {
			// Form: { subtype, place: 'added' | 'replace' | 'before', index?, start, title, targets? }
			mode: null,
			menu: null,
			// Destructive line action clicked once ('remove', 'keep:<n>'), or false.
			deleteArmed: false,
			messages: [],
			helpLive: '',
			counter: 0,
			// Edit as text: editor open, content when opening
			textMode: false,
			textStart: '',
			// A restored typed text (job 406), or null
			textInitial: null,
			textPrevious: [],
			compareAll: false,
			// Open proposal form: { index, line, label, kind, text, why, error, sending }
			proposal: null,
			// Phone: the move sheet was opened with "+".
			sheetOpen: false,
			// Move index of the path still open being told ("Tell here"), or null: the story goes on at its end.
			openAt: null,
			// Move index whose "+ Insert before" shows its choice "What comes before?", or null (job 408).
			choosing: null,
			// Move index lit up for a moment: the line a refusal names (job 414), or null.
			flashLine: null,
		}
	},
	computed: {
		options: optionText,
		helps: helpText,
		objects: objectText,
		/** Colour key: "Signal" only when the story has one. */
		keyObjects() {
			const { signal, item, ...rest } = this.objects
			// Signal and item only when the story has one.
			const items = (this.view.storyText ?? []).some((l) => /, (FÜR JEDE|FOR EACH) \[/.test(l.text))
			return { ...rest, ...(this.view.signals?.length && { signal }), ...(items && { item }) }
		},
		hint() {
			return t('story2bpmn', 'Only what is possible at this point is offered. So the diagram is valid at every stage.')
		},
		/** What the block "Next move" offers: where the story ends, or at the path still open being told. */
		panel() {
			if (this.openAt === null || this.moves[this.openAt]?.move !== 'openPath') return this.view
			return hereState(this.moves, this.openAt, this.language, this.tellOpts)
		},
		/** The story is told to its end and no path still open is being told. */
		panelDone() {
			return this.view.done && this.panel === this.view
		},
		/** Paths still open of the level shown (job 395). */
		stillOpen() {
			return this.moves.some((m) => m.move === 'openPath') ? openPaths(this.moves, this.language, this.tellOpts) : []
		},
		rank() {
			return ranks(this.panel.options ?? [], this.moves.length)
		},
		row() {
			return [...this.rank.frequent, ...this.rank.rare]
		},
		/** Right at the beginning the form for the trigger is open already. */
		form() {
			if (this.mode) return this.mode
			if (!this.moves.length && !this.view.done && this.view.options?.includes('start')) return { subtype: 'start', place: 'added', start: {}, title: this.options.start }
			return null
		},
		formKey() {
			return `${this.counter}-${this.form?.place}-${this.form?.subtype}-${this.form?.index ?? ''}`
		},
		formProps() {
			const f = this.form
			return {
				subtype: f.subtype,
				start: f.start,
				title: f.title,
				targets: f.targets ?? this.panel.targets ?? [],
				roles: this.view.roles ?? [],
				role: f.place === 'added' ? this.panel.role : undefined,
				endKinds: (f.place === 'added' ? this.panel.endKinds : this.view.endKinds) ?? [...END_KINDS],
				startKinds: this.view.startKinds ?? [...START_KINDS],
				signals: this.view.signals ?? [],
				language: this.language,
				inner: !!this.view.sub,
				inSubprocess: !!this.view.sub && !this.view.sub.trigger,
				told: f.start?.subprocess?.length ?? 0,
				cancelable: this.moves.length > 0 || !!this.view.sub,
				// Paths are removed only while nothing is told after the branch; added ones then stay open (job 395).
				growable: f.place !== 'replace' || f.index === this.moves.length - 1 || ['decision', 'concurrent'].includes(f.subtype),
				minPaths: f.place === 'replace' && f.index !== this.moves.length - 1 ? f.paths ?? 0 : 0,
				focus: f.focus ?? '',
				busy: this.busy,
			}
		},
		chosen() {
			return this.mode?.place === 'added' ? this.mode.subtype : null
		},
		/** On a subprocess level the core tells it as one (plain start, no trigger; what can come at any time starts with its trigger). */
		tellOpts() {
			if (!this.view.sub) return {}
			return { inner: { name: this.view.sub.name, ...(this.view.sub.trigger && { trigger: this.view.sub.trigger }) } }
		},
		/** Index in view.lines where the marker "continue here" goes: before what can come at any time. -1: no marker. */
		nextAt() {
			if (this.panel !== this.view) return this.view.lines.findIndex((l) => l.move === this.openAt)
			if (!this.view.next || !(this.moves.length || this.view.sub)) return -1
			const i = this.view.sub?.trigger ? -1 : this.view.lines.findIndex((l) => l.move !== undefined && this.moves[l.move]?.move === 'anytime')
			return i < 0 ? this.view.lines.length : i
		},
		/** Moves of the level shown whose flow behind is not told to its end: tasks of the main level, what can
		 *  come at any time on the main level or while a subprocess runs (job 397). */
		untold() {
			return untoldFlows(this.view)
		},
		compareOn() {
			return this.compare && !!this.approval?.valid
		},
		/** Current story text lines (with indentation). */
		currentLines() {
			return linesOf({ moves: this.moves, storyText: this.view.storyText })
		},
		diff() {
			return this.compareOn ? compareLines(validLines(this.approval), this.currentLines) : []
		},
		changes() {
			return this.diff.filter((d) => d.kind !== 'same')
		},
		shownDiff() {
			return this.compareAll ? this.diff : this.changes
		},
		/** Line index → 'change' | 'remark' …: where an open proposal points to (the line accepting changes, job 417). */
		proposalTags() {
			const out = {}
			if (!this.proposals.length) return out
			const valid = validLines(this.approval)
			const story = validStory(this.approval)
			for (const p of this.proposals) {
				const at = validIndexOf(this.approval, p, story)
				const i = at === null ? null : currentIndexOf(this.currentLines, valid, at)
				if (i !== null && !out[i]) out[i] = p.kind
			}
			return out
		},
		/** Phone: the block "Next move" is a sheet (also for changing a line of a story told to its end). */
		asSheet() {
			return this.phone && (!this.panelDone || (!!this.form && this.form.place !== 'added') || this.choosing !== null)
		},
		sheetShown() {
			// The sheet that cannot be closed (nothing told yet) would cover Restore/Discard: it waits for that decision (job 399).
			if (this.draftNote && !this.sheetClosable) return false
			return this.asSheet && (this.sheetOpen || !!this.form || this.choosing !== null)
		},
		sheetTitle() {
			if (this.form) return this.form.title
			return this.choosing !== null ? t('story2bpmn', 'What comes before?') : t('story2bpmn', 'Next move')
		},
		/** Right at the beginning the trigger has to be told: no closing then. */
		sheetClosable() {
			return this.moves.length > 0 || !!this.view.sub
		},
		/** Phone: the actions of the ⋯ sheet of the line in `menu`. */
		menuActions() {
			const i = this.menu
			if (i === null || !this.moves[i]) return []
			const at = this.view.lines.findIndex((l) => l.move === i)
			return sheetActions(this.moves[i], i, !!this.view.sub, !!this.canPropose && at >= 0 && this.validLine(this.view.lineOffset + at) !== null, this.hasException(i))
		},
		/** What "+ Insert before" offers at the line in `choosing` (job 408). */
		beforeChoices() {
			return this.choosing === null ? [] : beforeOptions(this.moves, this.choosing, this.language, this.tellOpts)
		},
		proposalPreview() {
			const p = this.proposal
			if (!p || !this.approval?.valid) return ''
			return proposalText({ version: this.approval.valid.number, line: p.line, label: p.label, kind: p.kind, text: p.text, why: p.why }, this.approval.valid.language)
		},
	},
	watch: {
		// Chosen in the diagram: bring the line into view.
		chosenLine(i) {
			if (i === null) return
			nextTick(() => this.scrollToLine(i))
		},
		// Phone: the line just told stays in view above the bar.
		fresh(i) {
			if (i !== null) this.showLine(i)
		},
		sheetShown: {
			handler(v) {
				this.$emit('sheet', v)
			},
			immediate: true,
		},
		textMode(v) {
			this.$emit('text-mode', v)
			if (!v) this.$emit('text-draft', null)
		},
		phone(v) {
			if (!v) this.sheetOpen = false
		},
	},
	created() {
		// The armed delete button ("Really delete?"); `deleteArmed` mirrors it for the template.
		this.armer = createArm({ onChange: (k) => { this.deleteArmed = k } })
	},
	mounted() {
		document.addEventListener('keydown', this.key)
	},
	beforeUnmount() {
		document.removeEventListener('keydown', this.key)
		this.armer.end()
		clearTimeout(this.flashTimer)
		// The editor goes with the card: its typed text is no unsaved change any more (job 406).
		if (this.textMode) this.$emit('text-draft', null)
	},
	methods: {
		t,
		n,
		lineParts,
		lineActions,
		switchTo,
		frequentKind: (a) => FREQUENT.includes(a),
		day(iso) {
			const d = new Date(iso)
			return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { dateStyle: 'medium' })
		},
		diffWord(kind) {
			if (kind === 'new') return t('story2bpmn', 'New')
			if (kind === 'changed') return t('story2bpmn', 'Changed')
			if (kind === 'removed') return t('story2bpmn', 'Removed')
			return ''
		},
		/** Index of story line i in the valid version when a proposal can point to it (a line of a move), or null. */
		validLine(i) {
			const l = this.currentLines[i]
			const at = l === undefined ? null : validLineOf(this.approval, l, i)
			return at !== null && proposalAt(this.approval, at) ? at : null
		},
		openProposal(i) {
			const at = this.validLine(i)
			const ref = at === null ? null : proposalAt(this.approval, at)
			if (!ref) return
			const text = validLines(this.approval)[at]
			this.menu = null
			this.mode = null
			// The number is the one left of the line (its move), not the line of the story text (job 417).
			this.proposal = { index: i, line: ref.line, label: ref.label, kind: 'change', text: text.trim(), why: '', error: '', sending: false }
			nextTick(() => this.$el.querySelector('.proposal-form select')?.focus())
		},
		async sendProposal() {
			const p = this.proposal
			if (!p || !this.propose || p.sending) return
			if (p.kind === 'remark' && !p.why.trim()) {
				p.error = t('story2bpmn', 'Write the remark first.')
				return
			}
			p.sending = true
			p.error = ''
			try {
				const r = await this.propose({ version: this.approval.valid.number, line: p.line, label: p.label, kind: p.kind, text: p.text, why: p.why })
				if (r.ok) this.proposal = null
				else p.error = r.error
			} finally {
				if (this.proposal) this.proposal.sending = false
			}
		},
		/** Clicking a line (not its buttons, menu or form) shows its shape in the diagram. */
		lineClick(e, l) {
			if (l.move === undefined || e.target?.closest?.('button, input, select, textarea, a, .line-actions, form, .move-form')) return
			this.$emit('choose', l.move)
		},
		marked(l) {
			if (l.move !== undefined && l.move === this.choosing) return true
			return l.move !== undefined && this.mode && this.mode.place !== 'added' && this.mode.index === l.move
		},
		/** Does the step of move i have an exception already? (Then it gets no second one, job 408.) */
		hasException(i) {
			return this.moves[i]?.move === 'task' && exceptionOf(this.moves, i, this.language, this.tellOpts) >= 0
		},
		/** The actions of the line menu of move i. */
		actionsOf(i) {
			return lineActions(this.moves[i], i, !!this.view.sub, this.hasException(i))
		},
		/** A kind chosen in "What comes before?": its form at the same line. */
		chooseBefore(subtype) {
			const i = this.choosing
			if (i === null) return
			this.choosing = null
			this.counter++
			this.mode = { ...formFor('before', this.moves, i, this.language, this.tellOpts, subtype), title: this.options[subtype] }
		},
		cancelChoice() {
			const i = this.choosing
			this.choosing = null
			if (i !== null) nextTick(() => this.focusMenu(i))
		},
		actionText(a, i) {
			if (a === 'subprocess' && this.moves[i]?.move === 'anytime') return t('story2bpmn', 'Open its flow')
			if (a === 'subprocess') return Array.isArray(this.moves[i]?.subprocess) ? t('story2bpmn', 'Open the flow behind it') : t('story2bpmn', 'Add a flow behind it')
			if (a === 'edit') return t('story2bpmn', 'Edit')
			if (a === 'before') return t('story2bpmn', '+ Insert before')
			if (a === 'addException') return t('story2bpmn', 'Add an exception')
			if (a === 'addTrigger') return t('story2bpmn', 'Another trigger')
			if (a === 'addPath') return t('story2bpmn', 'Add another path')
			if (a === 'tell') return t('story2bpmn', 'Tell here')
			if (a === 'reopen') return t('story2bpmn', 'Reopen path')
			const drop = droppedPath(a)
			if (drop !== null) return dropText(this.moves[i], drop, this.language)
			const keep = keptPath(a)
			if (keep === null) {
				if (this.deleteArmed !== a) return t('story2bpmn', 'Delete')
				// A step with an exception: the second click deletes the exception too.
				return exceptionOf(this.moves, i, this.language, this.tellOpts) >= 0 ? t('story2bpmn', 'Delete the exception too?') : t('story2bpmn', 'Really delete?')
			}
			if (this.deleteArmed === a) {
				// How many moves go, so that deleting a long path is no surprise.
				const r = keepPath(this.moves, i, keep, this.language, this.tellOpts)
				// Refused: the second click says why; no count of moves that would not go.
				if (r.error) return t('story2bpmn', 'Really delete?')
				const count = this.moves.length - r.moves.length
				return n('story2bpmn', 'Really? %n move goes', 'Really? %n moves go', count)
			}
			return keepText(this.moves[i], keep, this.language)
		},
		/** Brings line i into view (phone: after switching back to the story). */
		showLine(i) {
			if (i === null || i === undefined) return
			nextTick(() => this.scrollToLine(i))
		},
		/** Scrolls line i into view (no nextTick: the caller waits for the redraw). */
		scrollToLine(i, block = 'nearest') {
			this.$el.querySelector(`[data-line="${i}"]`)?.scrollIntoView?.({ block })
		},
		/** Focuses the ⋯ button of line i; `more`: the phone's ⋯ first, `preventScroll`: without scrolling. */
		focusMenu(i, { more = false, preventScroll = false } = {}) {
			const el = this.$el.querySelector(more ? `[data-more="${i}"], [data-menu="${i}"]` : `[data-menu="${i}"]`)
			if (preventScroll) el?.focus({ preventScroll: true })
			else el?.focus()
		},
		/** Phone: "+" in the bar opens the move sheet. */
		openSheet() {
			if (this.panelDone || this.textMode) return
			this.menu = null
			this.choosing = null
			this.proposal = null
			this.sheetOpen = true
			nextTick(() => this.$refs.move?.querySelector('.option, .path-button, input, select')?.focus())
		},
		closeSheet() {
			this.mode = null
			this.choosing = null
			this.openAt = null
			this.sheetOpen = false
		},
		closeMenu() {
			const i = this.menu
			this.menu = null
			this.armer.disarm()
			if (i !== null) nextTick(() => this.focusMenu(i, { more: true }))
		},
		sheetAction(a, e) {
			const i = this.menu
			if (a === 'show') {
				this.menu = null
				return this.$emit('show', i)
			}
			if (a === 'propose') {
				const at = this.view.lines.findIndex((l) => l.move === i)
				return this.openProposal(this.view.lineOffset + at)
			}
			return this.action(a, i, e)
		},
		/**
		 * A change to the core; rejected: message, the form stays open. `told`: index of the move
		 * told, inserted or changed (phone: marked NEW), null for undo, delete and the like.
		 */
		async set(added, told = null, via = () => this.change(added)) {
			const r = await via()
			if (r.ok) {
				this.openAt = null
				this.sheetOpen = false
				this.$emit('moved', told)
				this.messages = (this.view.errors ?? []).map((f, i) => ({ id: `k${i}`, title: '', text: f }))
				this.mode = null
				this.choosing = null
				this.menu = null
				this.armer.disarm()
				this.helpLive = ''
				this.counter++
				// The button that had focus was redrawn: move focus to the next choice.
				await nextTick()
				if (!this.$el.contains(document.activeElement)) this.$refs.move?.querySelector('button, input, select')?.focus()
			} else if (r.rejected) {
				this.refuse(r.rejected.join(' · '))
			}
			return r
		},
		choose(subtype) {
			this.menu = null
			this.choosing = null
			if (!hasFields(subtype)) {
				this.mode = null
				if (this.panel !== this.view) return this.tellOpen({ move: subtype })
				return this.set(append(this.moves, { move: subtype }), this.moves.length)
			}
			this.counter++
			this.mode = { subtype, place: 'added', start: {}, title: this.options[subtype] }
		},
		toggleMenu(i) {
			this.armer.disarm()
			this.menu = this.menu === i ? null : i
			if (this.menu !== null) nextTick(() => this.$el.querySelector('.line-actions .button')?.focus())
		},
		/** Result of deleting a branch or one of its paths: applied, or the reason shown at the top. */
		applyOrRefuse(r) {
			if (!r.error) return this.set(r.moves)
			this.armer.disarm()
			this.refuse(r.error, r.line)
			// The line to change first lights up (job 414); the message stays in view, a click on it goes there.
			if (r.line !== undefined) this.flash(r.line)
			// The message stands at the top of the story; on a phone or in a long story that is out of view.
			// Side by side the card head sticks over the top of the card: its height keeps the message below it.
			nextTick(() => {
				const head = this.$el.querySelector('.card-head')
				if (head) this.$el.style.setProperty('--head-block', head.offsetHeight + 'px')
				// Stacked, the sticky diagram band needs 'start'; side by side 'nearest' scrolls only the card, not the page.
				const stacked = !!this.$el.closest?.('.workbench.stacked')
				this.$el.querySelector('.messages')?.scrollIntoView?.({ block: stacked ? 'start' : 'nearest' })
			})
		},
		/** Line i lights up for 2 s; again from the start when it is lit already (job 414). */
		flash(i) {
			clearTimeout(this.flashTimer)
			this.flashLine = null
			nextTick(() => {
				this.flashLine = i
				this.flashTimer = setTimeout(() => { this.flashLine = null }, 2000)
			})
		},
		/** A click on a refusal that names a line: to that line, its ⋯ button focused (job 414). */
		jumpTo(i) {
			this.menu = null
			this.flash(i)
			nextTick(() => {
				this.scrollToLine(i, 'center')
				this.focusMenu(i, { preventScroll: true })
			})
		},
		async action(a, i, e) {
			// Any other line action ends "Tell here": its form or change belongs to its own line.
			if (endsTelling(a)) this.openAt = null
			this.choosing = null
			if (a === 'subprocess') {
				this.menu = null
				if (this.moves[i]?.move === 'task' && !Array.isArray(this.moves[i]?.subprocess)) {
					const r = await this.set(withSubprocess(this.moves, i))
					if (!r.ok) return
				}
				return this.$emit('open', i)
			}
			const keep = keptPath(a)
			if (a === 'remove' || keep !== null) {
				// Confirmation without a browser dialog: the first click arms the button, the second deletes.
				// It returns to normal on its own after 4 s, at a press elsewhere and at Esc (job 413).
				if (this.deleteArmed !== a) {
					this.armer.arm(a, e?.currentTarget ?? null)
					return
				}
				// A step with an exception takes it along; refused when something else leads into its path.
				if (keep === null) return this.applyOrRefuse(removeStep(this.moves, i, this.language, this.tellOpts))
				return this.applyOrRefuse(keepPath(this.moves, i, keep, this.language, this.tellOpts))
			}
			const drop = droppedPath(a)
			// One path of several: no confirmation, undo brings it back (job 398).
			if (drop !== null) return this.applyOrRefuse(dropPath(this.moves, i, drop, this.language, this.tellOpts))
			// The path is open again: no confirmation, nothing goes, undo closes it again (job 400).
			if (a === 'reopen') return this.applyOrRefuse(reopen(this.moves, i, this.language, this.tellOpts))
			this.menu = null
			if (a === 'tell') return this.tellAt(i)
			this.counter++
			if (a === 'addPath') {
				// The form of the line with one empty path more (also after the story went on: it stays open).
				this.mode = { ...formFor(a, this.moves, i, this.language, this.tellOpts), title: t('story2bpmn', 'Add another path') }
			} else if (a === 'edit') {
				this.mode = { ...formFor(a, this.moves, i, this.language, this.tellOpts), title: t('story2bpmn', 'Edit line') }
			} else if (a === 'addException') {
				this.mode = { ...formFor(a, this.moves, i, this.language, this.tellOpts), title: t('story2bpmn', 'Add an exception') }
			} else if (a === 'addTrigger') {
				this.mode = { ...formFor(a, this.moves, i, this.language, this.tellOpts), title: t('story2bpmn', 'Another trigger') }
			} else {
				// "+ Insert before": first the choice what comes before (job 408).
				this.mode = null
				this.choosing = i
				nextTick(() => this.$el.querySelector('.before-choice .option')?.focus())
			}
		},
		async apply(move) {
			const m = this.form
			const target = applyTarget(m.place, this.panel !== this.view)
			if (target === 'tellOpen') return this.tellOpen(move)
			// A change at a line of the story: the core's result and the index of the line told.
			let r = null
			let told = null
			if (target === 'replace') {
				r = changeLine(this.moves, m.index, move, this.language, this.tellOpts)
				told = m.index
			} else if (target === 'before') {
				r = insertAt(this.moves, m.index, move, this.language, this.tellOpts)
				// Before an exception line the move goes before the exception's step: that is the new line.
				told = beforeAt(this.moves, m.index, this.language, this.tellOpts)
			} else if (target === 'exception') {
				r = exceptionAt(this.moves, m.index, move, this.language, this.tellOpts)
				told = m.index + 1
			} else if (target === 'trigger') {
				r = triggerAdded(this.moves, move, this.language, this.tellOpts)
				// The new trigger stands after the triggers told so far.
				told = triggerIndex(this.moves)
			}
			if (r) {
				if (r.error) return this.refused(r.error)
				return this.set(r.moves, told)
			}
			const at = this.moves.length
			const done = await this.set(append(this.moves, move), at)
			// Something that can come at any time: tell its flow right away.
			if (done.ok && move.move === 'anytime') this.$emit('open', at)
			return done
		},
		/** "Tell here": the block "Next move" tells the path still open at move i. */
		tellAt(i) {
			this.menu = null
			this.mode = null
			this.choosing = null
			this.openAt = i
			this.counter++
			if (this.phone) this.sheetOpen = true
			nextTick(() => {
				this.scrollToLine(i)
				this.$refs.move?.querySelector('.option, input, select')?.focus()
			})
		},
		stopHere() {
			const i = this.openAt
			this.openAt = null
			this.mode = null
			this.sheetOpen = false
			if (i !== null) nextTick(() => this.focusMenu(i))
		},
		/** A move told on the path still open; the telling goes on there until the path is told to its end. */
		async tellOpen(move) {
			const i = this.openAt
			const r = tellHere(this.moves, i, move, this.language, this.tellOpts)
			if (r.error) return this.refused(r.error)
			const done = await this.set(r.moves, i)
			if (done.ok && r.at !== null) this.tellAt(r.at)
			return done
		},
		/** The reason a change was not applied, above the story; `line`: the line it names (job 414). */
		refuse(text, line) {
			this.messages = [{ id: `a${Date.now()}`, title: t('story2bpmn', 'Not applied:'), text, ...(line !== undefined && { line }) }]
		},
		/** A change the core refused: its reason above the story, in view. */
		refused(text) {
			this.refuse(text)
			nextTick(() => this.$el.querySelector('.messages')?.scrollIntoView?.({ block: 'nearest' }))
			return { ok: false, rejected: [text] }
		},
		cancel() {
			const i = this.mode?.place === 'added' ? null : this.mode?.index
			this.mode = null
			if (i !== null && i !== undefined) nextTick(() => this.focusMenu(i))
		},
		/** Back to the state before the last change (App, workbench history). */
		undo() {
			return this.set(undefined, null, this.back)
		},
		/** Closed: the editor opens; open: it closes, a changed text only on the second click (job 406). */
		toggleText() {
			if (this.textMode) return this.$refs.editor ? this.$refs.editor.requestCancel(this.$refs.asText) : this.textTo()
			this.openText(null)
		},
		/** Opens the editor; `text`: a restored typed text shown instead of the story text (job 406). */
		openText(text) {
			this.mode = null
			this.choosing = null
			this.menu = null
			this.armer.disarm()
			this.textStart = textFrom(this.view.storyText ?? [])
			this.textPrevious = this.moves
			this.textInitial = text ?? null
			this.textMode = true
		},
		textTo() {
			this.textMode = false
			nextTick(() => this.$refs.asText?.focus())
		},
		/** Replay the moves of the checked text as a new story; rejected: editor stays open, nothing changes. */
		async textApply(moves) {
			const e = await this.set(withProcess(moves, this.moves))
			if (e.ok) return this.textTo()
			if (e.rejected) {
				this.messages = []
				this.$refs.editor?.showError(e.rejected)
			}
		},
		/** Keys 1-9 choose an option, Esc closes the form: only when nothing else is open or has the focus. */
		key(e) {
			if (this.textMode) return
			// Only where one is: a dialog, a sheet, the sidebar or the focus in another card keep the keys (job 420).
			const s = storyKeys(keyEnv(document, this.$el))
			if (e.key === 'Escape') {
				if (s.escape === 'none') return
				if (s.escape === 'sheet') return this.closeMenu()
			} else if (!s.digits) return
			// "What comes before?" is open: Esc closes it, 1-9 choose from it (job 408).
			if (this.choosing !== null && !this.mode) {
				if (e.key === 'Escape') return this.cancelChoice()
				const c = digitKey(e)
				const o = c === null ? undefined : this.beforeChoices[c]
				if (!o || this.busy) return
				e.preventDefault()
				return this.chooseBefore(o)
			}
			if (e.key === 'Escape' && this.phone && this.sheetOpen && !this.mode) {
				this.sheetOpen = false
				return
			}
			if (e.key === 'Escape' && this.mode && (this.moves.length || this.view.sub)) return this.cancel()
			if (e.key === 'Escape' && this.openAt !== null) return this.stopHere()
			if (this.busy || this.panelDone) return
			const i = digitKey(e)
			const o = i === null ? undefined : this.row[i]
			if (!o) return
			e.preventDefault()
			this.choose(o)
		},
	},
}
</script>
