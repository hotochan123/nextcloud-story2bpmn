import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { replay, loadStory, textFrom } from '../../src/workbench.js';
import { Move } from '../../src/core/story.js';
import { Language } from '../../src/core/language.js';
import { fromStored } from '../../src/core/storyFormat.js';
import { tell, run, emptyProcess, toSvg } from '../../src/core/index.js';

// Since job 383 the preview has no legend and groups each node's shapes (data-move); the SVG of the
// fixture is the drawing of the core with the options the preview had in job 379, so the core stays checked
// byte for byte. The new preview options are tested in render.test.ts and workbench.test.ts.
async function drawing(moves: Move[], language: Language): Promise<string> {
	const g = tell(moves, language);
	const e = await run({ ir: { ...emptyProcess('P', g.ir.name, language), story: moves }, ops: g.ops });
	return e.ir.nodes.length ? toSvg(e.ir, e.positions, { draft: !e.readingCopy, here: g.here }) : '';
}

// Golden master of job 379: every intermediate state of two example stories, captured before the code
// was renamed to English. The output (BPMN XML with the stored story, SVG preview, story text, the
// offered moves) must stay byte for byte the same. GOLDEN_WRITE=1 rewrites the fixture (never after the
// rename: the fixture holds the old output; only its labels were translated with the code).
// Job 382 changed four states by hand: in legacy-working-file.bpmn steps 10 and 11 an arrow left
// "Ware auf Lager?" upwards right through the question, which now sits above left of the diamond.
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
				// Job 391 added "at any time" as the last option of the main flow, job 392 "it can also start differently" after the trigger; the rest stays as captured.
				out[`${file}/${language}/${i}`] = { question: a.question, options: a.options.filter((o) => o !== 'anytime' && o !== 'orStart'), open: a.open, done: a.done, errors: a.errors, text: textFrom(a.storyText), xml: a.xml, svg: await drawing(moves.slice(0, i), language) };
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
