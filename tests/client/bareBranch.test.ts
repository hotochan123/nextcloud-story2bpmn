import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Move } from '../../src/core/index.js';
import { read } from '../../src/core/index.js';
import { replay, loadStory, fileXml, textFrom } from '../../src/workbench.js';

// Job 419: a branch where no path has a step - the client view, the file and the text.
const story: Move[] = [
	{ move: 'start', text: 'Antrag geht ein', role: 'Team' },
	{ move: 'decision', question: 'Eilig?', yes: 'ja', no: 'nein' },
	{ move: 'merge' },
	{ move: 'merge' },
	{ move: 'task', text: 'Chef prüft', role: 'Team' },
	{ move: 'end', text: 'Fertig' },
];

test('419 AK5 the working file keeps the branch: loading replays the moves unchanged, the text reads back', async () => {
	const xml = await fileXml(story, 'de');
	assert.ok(xml);
	const back = await loadStory(xml!, 'de');
	assert.ok('moves' in back);
	assert.deepEqual(back.moves, story);
	assert.equal(back.changed, false);
	const v = await replay(story, 'de');
	const r = read(textFrom(v.storyText), 'de');
	assert.deepEqual(r.errors, []);
	// Reading back fills empty kinds (subtype ''); the story text and the bare branch stay the same.
	const again = await replay(r.moves, 'de');
	assert.equal(textFrom(again.storyText), textFrom(v.storyText));
	assert.deepEqual(again.bare, [1]);
});

test('419 AK6 the view marks the branch line as bare, the diagram has no diamond for it', async () => {
	const v = await replay(story, 'de');
	assert.deepEqual(v.errors, []);
	assert.deepEqual(v.bare, [1]);
	assert.ok(!v.svg.includes('Eilig?'));
	assert.ok(v.svg.includes('Chef prüft'));
	const full = await replay([...story.slice(0, 2), { move: 'task', text: 'Sofort', role: 'Team' }, ...story.slice(2)], 'de');
	assert.deepEqual(full.bare, []);
	assert.ok(full.svg.includes('Eilig?'));
});

test('419 AK6 in a subprocess the bare move counts in the flow behind the task', async () => {
	const moves: Move[] = [
		{ move: 'start', text: 'Bestellung', role: 'Vertrieb' },
		{ move: 'task', text: 'Ware versenden', role: 'Lager', subprocess: [
			{ move: 'concurrent' },
			{ move: 'merge' },
			{ move: 'merge' },
			{ move: 'task', text: 'Paket packen', role: 'Lager' },
			{ move: 'end', text: 'Versandt' },
		] },
		{ move: 'end', text: 'Erledigt' },
	];
	const main = await replay(moves, 'de');
	assert.deepEqual(main.errors, []);
	assert.deepEqual(main.bare, []);
	const sub = await replay(moves, 'de', 1);
	assert.deepEqual(sub.bare, [0]);
	assert.ok(sub.lines.some((l) => l.move === 0));
});
