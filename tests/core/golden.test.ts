import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { replay, loadStory, textFrom } from '../../src/workbench.js';
import { Move } from '../../src/core/story.js';
import { Language } from '../../src/core/language.js';
import { fromStored } from '../../src/core/storyFormat.js';

// Golden master of job 379: every intermediate state of two example stories, captured before the code
// was renamed to English. The output (BPMN XML with the stored story, SVG preview, story text, the
// offered moves) must stay byte for byte the same. GOLDEN_WRITE=1 rewrites the fixture (never after the
// rename: the fixture holds the old output; only its labels were translated with the code).
const DIR = 'tests/core/fixtures/';
const GOLDEN = DIR + 'golden.json';
const FILES = ['legacy-working-file.bpmn', 'legacy-invoice.bpmn'];

const entities = (s: string) => s.replace(/&#34;|&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const storedStory = (xml: string): unknown[] => JSON.parse(entities(xml.match(/bpmnc:geschichte="([^"]*)"/)![1]));

async function capture(): Promise<Record<string, unknown>> {
	const out: Record<string, unknown> = {};
	for (const file of FILES) {
		const moves = fromStored(storedStory(readFileSync(DIR + file, 'utf8'))) as Move[];
		for (const language of ['de', 'en'] as Language[]) {
			for (let i = 1; i <= moves.length; i++) {
				const a = await replay(moves.slice(0, i), language);
				out[`${file}/${language}/${i}`] = { question: a.question, options: a.options, open: a.open, done: a.done, errors: a.errors, text: textFrom(a.storyText), xml: a.xml, svg: a.svg };
			}
		}
	}
	return out;
}

test('379 golden: example stories render exactly as before the English rename', async () => {
	const now = JSON.parse(JSON.stringify(await capture()));
	if (process.env.GOLDEN_WRITE === '1') writeFileSync(GOLDEN, JSON.stringify(now, null, 1));
	const before = JSON.parse(readFileSync(GOLDEN, 'utf8'));
	assert.deepEqual(Object.keys(now), Object.keys(before));
	for (const k of Object.keys(before)) assert.deepEqual(now[k], before[k], k);
});

for (const file of FILES) {
	test(`379 AK4 ${file}, saved before the rename, loads, continues and keeps the stored story format`, async () => {
		const xml = readFileSync(DIR + file, 'utf8');
		const stored = storedStory(xml);
		const g = await loadStory(xml, 'de');
		assert.ok('moves' in g, JSON.stringify(g));
		assert.equal(g.changed, false);
		const a = await replay(g.moves, g.language);
		assert.deepEqual(storedStory(a.xml!), stored);
		const goTo = await replay(g.moves.slice(0, -1), g.language);
		assert.deepEqual(storedStory(goTo.xml!), stored.slice(0, -1));
	});
}
