import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Move } from '../../src/core/index.js';
import { read } from '../../src/core/index.js';
import { replay, fields, prefill, moveFromForm, replace, remove, atLevel, lineActions, signalFields, textFrom, loadStory, change } from '../../src/workbench.js';

// Job 391: the client side of something that can come at any time - form, line menu, its level.
const flow: Move[] = [
	{ move: 'task', text: 'Stornierung bestätigen', role: 'Kundendienst' },
	{ move: 'end', text: 'Auftrag storniert' },
];
const anytime = (sub?: Move[]): Move => ({ move: 'anytime', text: 'Kunde storniert', subtype: 'message', keepsRunning: '', ...(sub && { subprocess: sub }) });
const story = (sub: Move[] | undefined = flow): Move[] => [
	{ move: 'start', text: 'Auftrag geht ein', role: 'Vertrieb' },
	{ move: 'task', text: 'Auftrag prüfen', role: 'Vertrieb' },
	{ move: 'end', text: 'Auftrag erledigt' },
	anytime(sub),
];

test('391 AK9 the form asks what, by what and whether the flow continues; message preselected', () => {
	assert.deepEqual(fields('anytime').map((f) => f.key), ['text', 'subtype', 'keepsRunning']);
	const v = prefill('anytime', {}, 'de');
	assert.equal(v.subtype, 'message');
	assert.equal(v.keepsRunning, '');
	assert.deepEqual(fields('anytime', { subtype: 'time' }).find((f) => f.key === 'subtype')!.values, ['message', 'time', 'condition', 'signal']);
	assert.deepEqual(moveFromForm('anytime', { text: ' Kunde storniert ', subtype: 'message', keepsRunning: 'yes' }), { move: 'anytime', text: 'Kunde storniert', subtype: 'message', keepsRunning: 'yes' });
	assert.deepEqual(signalFields('anytime', { subtype: 'signal' }), ['text']);
	// The exception still hides the question for an error.
	assert.ok(!fields('exceptionPath', { subtype: 'error' }).some((f) => f.key === 'keepsRunning'));
});

test('391 AK9 the heading line offers edit, open its flow and delete; changing it keeps its flow', () => {
	const moves = story();
	assert.deepEqual(lineActions(moves[3], 3), ['edit', 'subprocess', 'remove']);
	const changed = replace(moves, 3, moveFromForm('anytime', { text: 'Kunde zieht zurück', subtype: 'time', keepsRunning: 'yes' }));
	assert.deepEqual((changed[3] as { subprocess?: Move[] }).subprocess, flow);
	assert.equal((changed[3] as { text: string }).text, 'Kunde zieht zurück');
});

test('391 AK9 replay at its level shows its flow; the main level shows its heading below the main flow', async () => {
	const main = await replay(story(flow.slice(0, 1)), 'de');
	assert.deepEqual(main.subs, { 3: { told: false, moves: 1 } });
	assert.equal(main.untold, 1);
	assert.equal(main.lines.at(-1)!.text, 'JEDERZEIT mit Nachricht: [Kunde storniert]:');
	assert.equal(main.lines.at(-1)!.move, 3);
	assert.ok(main.svg.includes('stroke-dasharray="2 2.5"'), 'the box in the preview');
	const level = await replay(story(flow.slice(0, 1)), 'de', 3);
	assert.equal(level.level, 3);
	assert.deepEqual(level.sub, { name: 'Kunde storniert', lane: 'Vertrieb', process: 'Prozess', trigger: { subtype: 'message', keepsRunning: false } });
	assert.deepEqual(level.levelMoves, flow.slice(0, 1));
	assert.deepEqual(level.lines.map((l) => l.text), ['ES BEGINNT.', '[@Kundendienst] soll [Stornierung bestätigen].']);
	assert.ok(!level.options.includes('anytime'));
	assert.equal(level.storyText[level.lineOffset].text, 'ES BEGINNT.');
	// Telling on at its level changes only its flow.
	const all = atLevel(story(flow.slice(0, 1)), 3, flow);
	assert.deepEqual(all, story());
	const done = await replay(all, 'de', 3);
	assert.equal(done.done, true);
	assert.equal(done.readingCopy, true);
});

test('391 AK9 deleting the move removes box and section', async () => {
	const moves = remove(story(), 3, 'de');
	assert.equal(moves.length, 3);
	const v = await replay(moves, 'de');
	assert.ok(!v.storyText.some((l) => l.text.startsWith('JEDERZEIT')));
	assert.ok(!v.svg.includes('stroke-dasharray="2 2.5"'));
});

test('391 AK10 the whole text read back changes nothing; the working file keeps it', async () => {
	const v = await replay(story(), 'de');
	const r = read(textFrom(v.storyText), 'de');
	assert.deepEqual(r.errors, []);
	// Read back, the plain start carries an empty kind; the story itself is the same.
	assert.equal(textFrom((await replay(change(story(), r.moves, 'de').moves, 'de')).storyText), textFrom(v.storyText));
	assert.deepEqual({ ...r.moves.at(-1), subprocess: undefined }, { ...story().at(-1), subprocess: undefined });
	const back = await loadStory(v.xml!, 'de');
	assert.ok('moves' in back);
	assert.equal(textFrom((await replay(back.moves, 'de')).storyText), textFrom(v.storyText));
});
