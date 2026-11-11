/**
 * SPDX-FileCopyrightText: 2026 hotochan123
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
// Fixed texts of the interface, all via the Nextcloud translation (English source).
// Every t() call with a fixed text, so the translation tools find it.
// What someone types is never translated; the story itself comes from the core.
import { t } from '@nextcloud/l10n'

export const optionText = () => ({
	start: t('story2bpmn', 'Tell the trigger'),
	task: t('story2bpmn', 'Then someone does something'),
	wait: t('story2bpmn', 'There is a wait …'),
	decision: t('story2bpmn', 'It depends (either – or)'),
	concurrent: t('story2bpmn', 'Two things happen at the same time'),
	exceptionPath: t('story2bpmn', 'Something can go wrong here'),
	merge: t('story2bpmn', 'This path is done – merges with the others'),
	end: t('story2bpmn', 'This is the end'),
	goTo: t('story2bpmn', 'Continue at / back to …'),
})

export const helpText = () => ({
	start: t('story2bpmn', 'What starts the process, and with whom.'),
	task: t('story2bpmn', 'An activity: who does what.'),
	end: t('story2bpmn', 'This path ends here.'),
	wait: t('story2bpmn', 'The process stops until something arrives, time passes or something holds.'),
	decision: t('story2bpmn', 'From here there are two paths; exactly one is taken.'),
	concurrent: t('story2bpmn', 'Two branches run side by side; it continues once both are done.'),
	exceptionPath: t('story2bpmn', 'Something can interrupt the last step – it gets its own path.'),
	merge: t('story2bpmn', 'The path returns to the flow where it branched off.'),
	goTo: t('story2bpmn', 'The path jumps to an existing step – e.g. for a loop.'),
})

/** Label and example per field; "first" is the decision on what happens first. */
export const fieldText = () => ({
	start: {
		process: [t('story2bpmn', 'What is the process called?'), t('story2bpmn', 'Invoice receipt')],
		text: [t('story2bpmn', 'What triggers the process?'), t('story2bpmn', 'An invoice arrives')],
		subtype: [t('story2bpmn', 'What starts it?'), ''],
		role: [t('story2bpmn', 'Who receives it?'), t('story2bpmn', 'Accounting')],
	},
	task: {
		text: [t('story2bpmn', 'What is done?'), t('story2bpmn', 'Check invoice')],
		role: [t('story2bpmn', 'Who does it?'), t('story2bpmn', 'Accounting')],
		system: [t('story2bpmn', 'In which system?'), t('story2bpmn', 'SAP')],
		documentName: [t('story2bpmn', 'Which document does the step need or produce?'), t('story2bpmn', 'Delivery note, invoice')],
		deadline: [t('story2bpmn', 'By when?'), t('story2bpmn', '3 working days')],
	},
	wait: {
		text: [t('story2bpmn', 'What is the wait for?'), t('story2bpmn', 'Reply from supplier / 3 days')],
		subtype: [t('story2bpmn', 'What is it?'), ''],
	},
	decision: {
		subtype: [t('story2bpmn', 'How is it decided?'), ''],
		question: [t('story2bpmn', 'What does it depend on?'), t('story2bpmn', 'Amount over €5000?')],
		yes: [t('story2bpmn', 'First path'), t('story2bpmn', 'yes')],
		no: [t('story2bpmn', 'Otherwise'), t('story2bpmn', 'no')],
	},
	first: {
		subtype: [t('story2bpmn', 'How is it decided?'), ''],
		yes: [t('story2bpmn', 'What can happen?'), t('story2bpmn', 'Payment arrives')],
		yesKind: [t('story2bpmn', 'What is it?'), ''],
		no: [t('story2bpmn', 'Or what?'), t('story2bpmn', '14 days have passed')],
		noKind: [t('story2bpmn', 'What is it?'), ''],
	},
	exceptionPath: {
		text: [t('story2bpmn', 'What can happen?'), t('story2bpmn', 'Amount is wrong / after 3 days')],
		subtype: [t('story2bpmn', 'What kind of deviation is it?'), ''],
		keepsRunning: [t('story2bpmn', 'Does the step continue meanwhile?'), ''],
	},
	end: {
		text: [t('story2bpmn', 'How does it end? (a state)'), t('story2bpmn', 'Invoice paid')],
		subtype: [t('story2bpmn', 'What happens at the end?'), ''],
	},
	goTo: {
		target: [t('story2bpmn', 'At which step does it continue?'), ''],
	},
})

/** Choice values per move and field; '' = plain kind. */
export const kindText = () => {
	const event = {
		message: t('story2bpmn', 'For a message (reply, delivery, documents)'),
		time: t('story2bpmn', 'For some time or until a date'),
		condition: t('story2bpmn', 'Until something holds (e.g. stock refilled)'),
	}
	return {
		start: {
			'': t('story2bpmn', 'Simply – it begins'),
			message: t('story2bpmn', 'A message arrives (letter, mail, application)'),
			time: t('story2bpmn', 'At a point in time (e.g. first of each month)'),
			condition: t('story2bpmn', 'Once something holds (e.g. stock nearly empty)'),
		},
		wait: event,
		decision: { '': t('story2bpmn', 'Something is checked (yes / no)'), first: t('story2bpmn', 'It depends on what comes first') },
		yesKind: event,
		noKind: event,
		exceptionPath: {
			errors: t('story2bpmn', 'Something goes wrong'),
			deadline: t('story2bpmn', 'A deadline expires'),
			message: t('story2bpmn', 'A message comes in between (cancellation, query)'),
		},
		keepsRunning: { '': t('story2bpmn', 'No, it is stopped'), yes: t('story2bpmn', 'Yes, it continues (e.g. reminder)') },
		end: {
			'': t('story2bpmn', 'Simply – done'),
			message: t('story2bpmn', 'A message is sent (notice, confirmation)'),
			cancel: t('story2bpmn', 'Stop everything – including what runs in parallel'),
		},
	}
}

/** Object kinds in the story text (color key, screen reader). */
export const objectText = () => ({
	task: t('story2bpmn', 'Step'),
	role: t('story2bpmn', 'Role'),
	system: t('story2bpmn', 'System'),
	document: t('story2bpmn', 'Document'),
	deadline: t('story2bpmn', 'Deadline'),
	question: t('story2bpmn', 'Decision'),
})

/** Confirmation after publishing. Without escaping and without DOMPurify: Vue inserts the text
 *  escaped via {{ }} itself (never v-html), otherwise "Einkauf & Lager <x>" would turn into
 *  "Einkauf &amp; Lager ". */
export const storedText = (path) => t('story2bpmn', 'Reading copy filed: {path}', { path: String(path ?? '').replace(/^\//, '') }, undefined, { escape: false, sanitize: false })
