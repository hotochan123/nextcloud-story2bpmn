// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tell } from '../../src/core/index.js';
import { exampleMoves, exampleHint } from '../../src/example.js';
import { replay, loadStory, fileXml, textFrom, textMoves, diagramLanguage, unsaved } from '../../src/workbench.js';
import { fitScale, FIT_MIN } from '../../src/diagramView.js';

for (const language of ['de', 'en'] as const) {
	test(`396 AK2 the example (${language}) survives saving, opening and the story text`, async () => {
		const moves = exampleMoves(language);
		const view = await replay(moves, language);
		assert.equal(view.done, true);
		assert.ok(view.xml);
		const back = await loadStory(view.xml!, language === 'de' ? 'en' : 'de');
		assert.ok(!('errors' in back), JSON.stringify(back));
		if ('errors' in back) return;
		assert.deepEqual(back.moves, moves);
		assert.equal(back.language, language);
		assert.equal(back.changed, false);
		assert.equal(unsaved(back.moves, moves, back.language, language), false);
		// The file written with an approval state carries the same story.
		const xml = await fileXml(moves, language, null);
		const again = await loadStory(xml!, language);
		assert.ok(!('errors' in again) && again.moves.length === moves.length);
		// Story text read back: the same story.
		const r = textMoves(textFrom(view.storyText), moves, language);
		assert.deepEqual(r.errors, []);
		assert.deepEqual(tell(r.moves, language).storyText, tell(moves, language).storyText);
	});

	// The diagram area of a 1512 × 900 laptop window (MacBook 14"), measured in the browser (870 × 635) minus its padding.
	test(`396 AK3 the example (${language}) fits a laptop screen with its words`, async () => {
		const view = await replay(exampleMoves(language), language);
		const box = view.svg.match(/viewBox="([\d.\- ]+)"/);
		assert.ok(box, 'viewBox');
		const [, , w, h] = box![1].trim().split(/\s+/).map(Number);
		const fit = fitScale({ w: 850, h: 615 }, { w, h });
		assert.ok(fit >= FIT_MIN, `fit ${fit.toFixed(2)} for ${w}×${h}`);
	});
}

test('396 AK4 the example follows the account language', () => {
	const name = (account: string | undefined) => {
		const first = exampleMoves(diagramLanguage(account))[0];
		return first.move === 'start' ? first.process : undefined;
	};
	assert.equal(name('de_DE'), 'Rechnungsfreigabe');
	assert.equal(name('de'), 'Rechnungsfreigabe');
	assert.equal(name('fr'), 'Invoice approval');
	assert.equal(name(undefined), 'Invoice approval');
});

test('396 AK6 the note above the story: only for the example with lines, on the main level', () => {
	assert.equal(exampleHint({ example: true, moves: 15, sub: false, phone: false }), 'wide');
	assert.equal(exampleHint({ example: true, moves: 15, sub: false, phone: true }), 'phone');
	assert.equal(exampleHint({ example: false, moves: 15, sub: false, phone: false }), null);
	// "Start over" empties the story: the note goes with it.
	assert.equal(exampleHint({ example: true, moves: 0, sub: false, phone: false }), null);
	assert.equal(exampleHint({ example: true, moves: 15, sub: true, phone: false }), null);
});
