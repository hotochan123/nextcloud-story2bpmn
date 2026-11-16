import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Move } from '../../src/core/index.js';
import { replay, replace, atLevel, lineActions, workbench, moveFromForm, textFrom, loadStory, untoldFlows } from '../../src/workbench.js';

// Job 397: something that can come at any time while a subprocess runs - its level inside the subprocess level.
const inner: Move[] = [{ move: 'task', text: 'Prüfung abbrechen', role: 'Prüfer' }, { move: 'end', text: 'Abgebrochen' }];
const any = (flow?: Move[], keepsRunning: '' | 'yes' = ''): Move => ({ move: 'anytime', text: 'Kunde zieht zurück', subtype: 'message', keepsRunning, ...(flow && { subprocess: flow }) });
const sub = (a: Move = any(inner)): Move[] => [{ move: 'task', text: 'Unterlagen sichten', role: 'Prüfer' }, { move: 'end', text: 'Geprüft' }, a];
const story = (a?: Move): Move[] => [
	{ move: 'start', text: 'Antrag geht ein', role: 'Vertrieb' },
	{ move: 'task', text: 'Antrag prüfen', role: 'Vertrieb', subprocess: sub(a) },
	{ move: 'end', text: 'Erledigt' },
];

test('397 AK7 the subprocess level offers it, lists its heading and whether its flow is told', async () => {
	const s = await replay(story(any(inner.slice(0, 1))), 'de', 1);
	const open = await replay([story()[0], { move: 'task', text: 'Antrag prüfen', role: 'Vertrieb', subprocess: [{ move: 'task', text: 'U', role: 'Prüfer' }] }], 'de', 1);
	assert.equal(open.options.at(-1), 'anytime');
	assert.deepEqual(s.subs, { 2: { told: false, moves: 1 } });
	assert.ok(s.lines.some((l) => l.text === 'JEDERZEIT mit Nachricht: [Kunde zieht zurück]:' && l.move === 2));
	assert.ok(!s.lines.some((l) => l.text === '[@Prüfer] soll [Prüfung abbrechen].'), 'its flow is a level of its own');
	assert.equal(s.untold, 1, 'the subprocess counts as untold');
	assert.deepEqual(lineActions(sub()[2], 2, true), ['edit', 'subprocess', 'remove']);
});

test('397 AK7 replay of the flow inside the subprocess: lines, question, diagram, breadcrumbs', async () => {
	const v = await replay(story(any(inner.slice(0, 1))), 'de', 1, 2);
	assert.equal(v.level, 1);
	assert.equal(v.any, 2);
	assert.deepEqual(v.sub, { name: 'Kunde zieht zurück', lane: 'Prüfer', process: 'Antrag prüfen', trigger: { subtype: 'message', keepsRunning: false }, within: 'Antrag prüfen', main: 'Prozess' });
	assert.deepEqual(v.levelMoves, inner.slice(0, 1));
	assert.deepEqual(v.lines.map((l) => l.text), ['ES BEGINNT.', '[@Prüfer] soll [Prüfung abbrechen].']);
	assert.equal(v.storyText[v.lineOffset].text, 'ES BEGINNT.');
	assert.ok(!v.options.includes('anytime'));
	assert.deepEqual(v.subs, {});
	assert.ok(v.svg.includes('Prüfung abbrechen'), 'its diagram');
	assert.ok(v.here?.startsWith('Schritt_2_Jederzeit_1_'), String(v.here));
});

test('397 AK7 changes on that level change only its flow; undo goes back there', async () => {
	assert.deepEqual(atLevel(story(any(inner.slice(0, 1))), 1, inner, 2), story());
	assert.deepEqual(atLevel(story(), 1, [], 0), story(), 'not what can come at any time: nothing changes');
	const wb = workbench('de');
	await wb.set(story(any(inner.slice(0, 1))));
	await wb.show(1, 2);
	assert.equal(wb.any, 2);
	await wb.setLevel(inner);
	assert.deepEqual(wb.moves, story());
	assert.equal(wb.view!.any, 2, 'stays on its level');
	assert.equal(wb.view!.done, true);
	await wb.undo();
	assert.deepEqual(wb.moves, story(any(inner.slice(0, 1))));
	assert.equal(wb.view!.any, 2);
	await wb.show(1);
	assert.equal(wb.view!.any, undefined);
	// Changing its heading on the subprocess level keeps its flow.
	const changed = replace(sub(), 2, moveFromForm('anytime', { text: 'Kunde fragt nach', subtype: 'time', keepsRunning: 'yes' }));
	assert.deepEqual((changed[2] as { subprocess?: Move[] }).subprocess, inner);
	// Changing the task of the subprocess on the main level keeps what is told behind it.
	const task = replace(story(), 1, moveFromForm('task', { text: 'Antrag genau prüfen', role: 'Vertrieb', subprocess: 'yes' }));
	assert.deepEqual((task[1] as { subprocess?: Move[] }).subprocess, sub());
});

test('397 AK7 the form answer "No" stops the subprocess there', async () => {
	// texts.js has no type declarations: loaded through a path the type check does not follow.
	const path = '../../src/texts.js';
	const { kindText } = (await import(path)) as { kindText: () => Record<string, Record<string, string>> };
	const k = kindText();
	assert.equal(k['anytime:keepsRunning:sub'][''], 'No, it stops the subprocess');
	assert.equal(k['anytime:keepsRunning'][''], 'No, everything stops');
});

test('397 AK8 the working file keeps it: saved and opened again the same story', async () => {
	const v = await replay(story(), 'de');
	assert.equal(v.readingCopy, true);
	const loaded = await loadStory(v.xml!, 'en');
	assert.ok(!('errors' in loaded), JSON.stringify(loaded));
	assert.deepEqual((loaded as { moves: Move[] }).moves, story());
	assert.equal((loaded as { changed: boolean }).changed, false);
	assert.ok(textFrom(v.storyText).includes('TEILABLAUF [Antrag prüfen]:\nES BEGINNT.\n[@Prüfer] soll [Unterlagen sichten].'));
});

test('397 round 2: a subprocess told to its end still takes what can come at any time', async () => {
	const wb = workbench('de');
	await wb.set(story(undefined).map((z, j) => (j === 1 ? { ...z, subprocess: sub().slice(0, 2) } as Move : z)));
	await wb.show(1);
	assert.equal(wb.view!.done, true, 'the subprocess is told to its end');
	assert.deepEqual(wb.view!.options, []);
	await wb.setLevel([...wb.view!.levelMoves, any()]);
	assert.deepEqual(wb.view!.errors, []);
	assert.deepEqual(wb.view!.subs, { 2: { told: false, moves: 0 } }, 'its flow is still to tell');
	await wb.show(1, 2);
	assert.equal(wb.view!.sub!.within, 'Antrag prüfen');
	assert.ok((wb.view!.options as string[]).includes('task'));
});

test('397 round 3: a subprocess with an untold flow of what can come at any time names it as still open', async () => {
	const s = await replay(story(any([])), 'de', 1);
	assert.equal(s.done, true, 'its own flow is told to its end');
	assert.deepEqual(untoldFlows(s), ['Kunde zieht zurück']);
	assert.deepEqual(untoldFlows(await replay(story(), 'de', 1)), [], 'all told');
	assert.deepEqual(untoldFlows(await replay(story(any([])), 'de', 1, 2)), [], 'none inside its flow');
	assert.deepEqual(untoldFlows(await replay(story(any([])), 'de')), ['Antrag prüfen'], 'main level as before');
});
