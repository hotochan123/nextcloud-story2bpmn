import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Move } from '../../src/core/index.js';
import { replay, outputs } from '../../src/workbench.js';
import { canDownload, copyAllowed } from '../../src/diagramView.js';

// Job 410: download is visible on desktop and tablet; on a subprocess level it loads the whole process.
const story = (sub: Move[]): Move[] => [
	{ move: 'start', text: 'Bestellung eingegangen', role: 'Vertrieb' },
	{ move: 'task', text: 'Ware versenden', role: 'Lager', subprocess: sub },
	{ move: 'end', text: 'Bestellung erledigt' },
];

test('410 AK5 canDownload: the whole process counts, not the level shown; busy blocks', async () => {
	const main = await replay(story([]), 'de');
	const sub = await replay(story([]), 'de', 1);
	assert.ok(sub.sub, 'subprocess level shown');
	// the decision does not look at the diagram of the level shown
	assert.ok(canDownload({ ...sub, svg: '' } as typeof sub), 'a level without a diagram of its own still downloads the whole process');
	assert.ok(canDownload(main));
	assert.ok(canDownload(sub), 'an empty subprocess level still downloads the whole process');
	assert.equal(canDownload(sub, true), false);
	assert.equal(canDownload(await replay([], 'de')), false, 'no diagram at all');
	assert.equal(canDownload(null), false);
});

test('410 AK2 the subprocess level downloads the same files as the main level', async () => {
	const behind: Move[] = [{ move: 'task', text: 'Paket packen', role: 'Lager' }, { move: 'end', text: 'Ware versandt' }];
	const main = await replay(story(behind), 'de');
	const sub = await replay(story(behind), 'de', 1);
	// App.download() renders view.moves: on every level the moves of the whole story
	assert.deepEqual(sub.moves, main.moves);
	const a = await outputs(main.moves, 'de');
	const b = await outputs(sub.moves, 'de');
	assert.equal(b.svg, a.svg);
	assert.ok(b.svg.includes('Ware versenden') && b.svg.includes('Vertrieb'), 'the main flow, not the subprocess level');
});

test('434 AK8 copyAllowed: only a file whose share forbids downloads keeps its copies in', () => {
	assert.equal(copyAllowed(null), true, 'a new story');
	assert.equal(copyAllowed(undefined), true);
	assert.equal(copyAllowed({}), true, 'an answer without the field');
	assert.equal(copyAllowed({ canDownload: true }), true);
	assert.equal(copyAllowed({ canDownload: false }), false);
});
