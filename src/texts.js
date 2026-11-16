/**
 * SPDX-FileCopyrightText: 2026 hotochan123
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
// Fixed texts of the interface, all via the Nextcloud translation (English source).
// Every t() call with a fixed text, so the translation tools find it.
// What someone types is never translated; the story itself comes from the core.
import { n, t } from '@nextcloud/l10n'
import { branchName, countMoves } from './core/story.ts'

export const optionText = () => ({
	start: t('story2bpmn', 'Tell the trigger'),
	task: t('story2bpmn', 'Then someone does something'),
	wait: t('story2bpmn', 'There is a wait …'),
	decision: t('story2bpmn', 'It depends (either – or)'),
	concurrent: t('story2bpmn', 'Several things happen at the same time'),
	exceptionPath: t('story2bpmn', 'Something can go wrong here'),
	merge: t('story2bpmn', 'This path is done – merges with the others'),
	end: t('story2bpmn', 'This is the end'),
	goTo: t('story2bpmn', 'Continue at / back to …'),
	sendSignal: t('story2bpmn', 'Give a notice to everyone'),
	anytime: t('story2bpmn', 'Something can come at any time'),
	orStart: t('story2bpmn', 'It can also start differently'),
})

export const helpText = () => ({
	start: t('story2bpmn', 'What starts the process, and with whom.'),
	task: t('story2bpmn', 'An activity: who does what.'),
	end: t('story2bpmn', 'This path ends here.'),
	wait: t('story2bpmn', 'The process stops until something arrives, time passes, something holds or a signal comes.'),
	decision: t('story2bpmn', 'From here there are two or more paths; exactly one is taken.'),
	concurrent: t('story2bpmn', 'Two or more branches run side by side; it continues once all are done. Only some needed (e.g. stock, invoice or both)? Ask a question in each branch.'),
	exceptionPath: t('story2bpmn', 'Something can interrupt the last step – it gets its own path.'),
	merge: t('story2bpmn', 'The path returns to the flow where it branched off.'),
	goTo: t('story2bpmn', 'The path jumps to an existing step – e.g. for a loop.'),
	sendSignal: t('story2bpmn', 'Send a signal: whoever waits for it continues.'),
	anytime: t('story2bpmn', 'It can come during the whole flow, whatever step it is at – e.g. the customer cancels. Told after the main flow.'),
	orStart: t('story2bpmn', 'Another trigger that starts the same process – e.g. by mail or through the portal.'),
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
		subprocess: [t('story2bpmn', 'Is there a flow of its own behind it?'), ''],
		forEach: [t('story2bpmn', 'For each item separately?'), ''],
		each: [t('story2bpmn', 'For each: …'), t('story2bpmn', 'invoice item')],
		eachOrder: [t('story2bpmn', 'How?'), ''],
	},
	wait: {
		text: [t('story2bpmn', 'What is the wait for?'), t('story2bpmn', 'Reply from supplier / 3 days')],
		subtype: [t('story2bpmn', 'What is it?'), ''],
	},
	decision: {
		subtype: [t('story2bpmn', 'How is it decided?'), ''],
		question: [t('story2bpmn', 'What does it depend on?'), t('story2bpmn', 'Amount over €5000?')],
		yes: [t('story2bpmn', 'First path'), t('story2bpmn', 'yes')],
		more: [t('story2bpmn', 'Further path'), t('story2bpmn', 'up to €5000')],
		no: [t('story2bpmn', 'Otherwise'), t('story2bpmn', 'no')],
	},
	first: {
		subtype: [t('story2bpmn', 'How is it decided?'), ''],
		yes: [t('story2bpmn', 'What can happen?'), t('story2bpmn', 'Payment arrives')],
		yesKind: [t('story2bpmn', 'What is it?'), ''],
		more: [t('story2bpmn', 'Or what else?'), t('story2bpmn', 'Reminder arrives')],
		moreKind: [t('story2bpmn', 'What is it?'), ''],
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
	anytime: {
		text: [t('story2bpmn', 'What can come at any time?'), t('story2bpmn', 'Customer cancels')],
		subtype: [t('story2bpmn', 'By what?'), ''],
		keepsRunning: [t('story2bpmn', 'Does the flow continue?'), ''],
	},
	orStart: {
		text: [t('story2bpmn', 'What else triggers the process?'), t('story2bpmn', 'An application arrives through the portal')],
		subtype: [t('story2bpmn', 'What starts it?'), ''],
		role: [t('story2bpmn', 'Who receives it?'), t('story2bpmn', 'Accounting')],
	},
	sendSignal: {
		text: [t('story2bpmn', 'Which signal? (name what happened)'), t('story2bpmn', 'Delivery stop declared')],
		role: [t('story2bpmn', 'Who gives it?'), t('story2bpmn', 'Quality assurance')],
	},
})

/** Choice values per move and field; '' = plain kind. */
export const kindText = () => {
	const event = {
		message: t('story2bpmn', 'For a message (reply, delivery, documents)'),
		time: t('story2bpmn', 'For some time or until a date'),
		condition: t('story2bpmn', 'Until something holds (e.g. stock refilled)'),
		signal: t('story2bpmn', 'For a signal (a notice to everyone)'),
	}
	const start = {
		'': t('story2bpmn', 'Simply – it begins'),
		message: t('story2bpmn', 'A message arrives (letter, mail, application)'),
		time: t('story2bpmn', 'At a point in time (e.g. first of each month)'),
		condition: t('story2bpmn', 'Once something holds (e.g. stock nearly empty)'),
		signal: t('story2bpmn', 'A signal comes (a notice to everyone)'),
	}
	return {
		start,
		// A further trigger has the same kinds as the trigger.
		orStart: start,
		wait: event,
		decision: { '': t('story2bpmn', 'Something is checked (yes / no)'), first: t('story2bpmn', 'It depends on what comes first') },
		// The kind of a branch in its edit form (job 451).
		branch: { '': t('story2bpmn', 'Something is checked (yes / no)'), first: t('story2bpmn', 'It depends on what comes first'), concurrent: t('story2bpmn', 'Several things happen at the same time') },
		yesKind: event,
		moreKind: event,
		noKind: event,
		exceptionPath: {
			error: t('story2bpmn', 'Something goes wrong'),
			deadline: t('story2bpmn', 'A deadline expires'),
			message: t('story2bpmn', 'A message comes in between (cancellation, query)'),
		},
		keepsRunning: { '': t('story2bpmn', 'No, it is stopped'), yes: t('story2bpmn', 'Yes, it continues (e.g. reminder)') },
		anytime: {
			message: t('story2bpmn', 'A message arrives (letter, mail, call)'),
			time: t('story2bpmn', 'At a point in time (e.g. end of the month)'),
			condition: t('story2bpmn', 'Once something holds (e.g. stock empty)'),
			signal: t('story2bpmn', 'A signal comes (a notice to everyone)'),
		},
		'anytime:keepsRunning': { '': t('story2bpmn', 'No, everything stops'), yes: t('story2bpmn', 'Yes, it runs alongside (e.g. a query)') },
		// While a subprocess runs, "No" stops only that subprocess (job 397).
		'anytime:keepsRunning:sub': { '': t('story2bpmn', 'No, it stops the subprocess'), yes: t('story2bpmn', 'Yes, it runs alongside (e.g. a query)') },
		subprocess: { '': t('story2bpmn', 'No'), yes: t('story2bpmn', 'Yes, told here') },
		forEach: { '': t('story2bpmn', 'No'), yes: t('story2bpmn', 'Yes') },
		eachOrder: { sequential: t('story2bpmn', 'One after another'), parallel: t('story2bpmn', 'At the same time, all at once') },
		end: {
			'': t('story2bpmn', 'Simply – done'),
			message: t('story2bpmn', 'A message is sent (notice, confirmation)'),
			signal: t('story2bpmn', 'With a signal (a notice to everyone)'),
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
	signal: t('story2bpmn', 'Signal'),
	item: t('story2bpmn', 'Item'),
})

/** Confirmation after publishing. Without escaping and without DOMPurify: Vue inserts the text
 *  escaped via {{ }} itself (never v-html), otherwise "Einkauf & Lager <x>" would turn into
 *  "Einkauf &amp; Lager ". */
/** Note after opening a 0.1.0 file whose "continue at" into a branch of "in parallel" became a path still open (job 438). */
export const reopenedText = (lines) => n('story2bpmn', 'Line {lines}: “CONTINUE AT” led into a branch of “IN PARALLEL”, which is no longer possible. The line is now still open – tell it again there. The file changes only when you save.', 'Lines {lines}: “CONTINUE AT” led into a branch of “IN PARALLEL”, which is no longer possible. The lines are now still open – tell them again there. The file changes only when you save.', lines.length, { lines: lines.join(', ') })

/** Note after opening a 0.1.0 file whose "continue at" got the ID its step has now (job 440; lines from 1). */
export const retargetedText = (lines) => n('story2bpmn', 'Line {lines}: “CONTINUE AT” leads to the same step as in Story2BPMN 0.1.0 again (the file counted its steps differently). The file changes only when you save.', 'Lines {lines}: “CONTINUE AT” leads to the same step as in Story2BPMN 0.1.0 again (the file counted its steps differently). The file changes only when you save.', lines.length, { lines: lines.join(', ') })

/** Most lines the note on dropped lines names; the rest is counted. */
export const DROPPED_NAMED = 10

/**
 * Note after opening a file whose story the core refuses in places (job 439): the lines left out, each with
 * its number in the file and its text. Without escaping: Vue inserts it via {{ }} (see above), never v-html.
 */
export const droppedText = (dropped) => {
	const named = dropped.slice(0, DROPPED_NAMED).map((d) => `${d.line} (“${d.text}”)`).join(', ')
	const rest = dropped.length - DROPPED_NAMED
	const lines = rest > 0 ? t('story2bpmn', '{lines} and {n} more', { lines: named, n: rest }, undefined, { escape: false, sanitize: false }) : named
	return n('story2bpmn', 'Line {lines} no longer fits into the story and was left out (Story2BPMN 0.1.0 left one path too many open after merging). Check the end of the story. The file changes only when you save.', 'Lines {lines} no longer fit into the story and were left out (Story2BPMN 0.1.0 left one path too many open after merging). Check the end of the story. The file changes only when you save.', dropped.length, { lines }, { escape: false, sanitize: false })
}

export const storedText = (path) => t('story2bpmn', 'Reading copy filed: {path}', { path: String(path ?? '').replace(/^\//, '') }, undefined, { escape: false, sanitize: false })

/** Name of path j of branch move z as in the story: its label, or the branch in the diagram language. */
const pathName = (z, j, language) => z?.move === 'concurrent' ? branchName(j, language) : z?.move === 'decision' ? [z.yes, ...(z.more ?? []), z.no][j] ?? '' : ''

/**
 * Button text in the line menu for keeping path j of branch move z (job 393). The path is named as
 * in the story (its label, or the branch in the diagram language), the rest follows the account language.
 */
export const keepText = (z, j, language) => {
	if (z?.move === 'exceptionPath') return t('story2bpmn', 'Delete exception path')
	const path = pathName(z, j, language)
	return t('story2bpmn', 'Keep only “{path}”', { path }, undefined, { escape: false, sanitize: false })
}

/** Button text in the line menu for deleting path j of branch move z alone (job 398); named as in keepText. */
export const dropText = (z, j, language) => {
	const path = pathName(z, j, language)
	return t('story2bpmn', 'Delete this path: {path}', { path }, undefined, { escape: false, sanitize: false })
}

/**
 * Text of the armed "Delete" of move z (second click). A step with a flow behind it says how many
 * moves its flow takes along (job 452); `withException`: the step has an exception, which goes too.
 */
export const removeText = (z, withException) => {
	const flow = z?.move === 'task' && Array.isArray(z.subprocess) ? countMoves(z.subprocess) : 0
	if (flow && withException) return n('story2bpmn', 'Really? The step, its exception and its flow (%n move) go', 'Really? The step, its exception and its flow (%n moves) go', flow)
	if (flow) return n('story2bpmn', 'Really? The step and its flow (%n move) go', 'Really? The step and its flow (%n moves) go', flow)
	return withException ? t('story2bpmn', 'Delete the exception too?') : t('story2bpmn', 'Really delete?')
}
