import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Move } from '../../src/core/index.js';
import { replay, fields, prefill, moveFromForm, remove, lineActions, signalFields, ranks, loadStory } from '../../src/workbench.js';

// Job 392: the client side of "it can also start differently".
const post: Move = { move: 'start', text: 'Antrag per Post', role: 'Poststelle' };
const portal: Move = { move: 'orStart', text: 'Antrag im Portal', role: 'Portal', subtype: 'message' };

test('392 AK4 the form asks what, by what and with whom; only the kinds that fit, the first preselected', () => {
	assert.deepEqual(fields('orStart').map((f) => f.key), ['text', 'subtype', 'role']);
	const kinds = ['message', 'time', 'condition', 'signal'];
	assert.deepEqual(fields('orStart', {}, undefined, false, kinds).find((f) => f.key === 'subtype')!.values, kinds);
	// Changing a further trigger that begins plainly keeps its kind on offer.
	assert.deepEqual(fields('orStart', { subtype: '' }, undefined, false, kinds).find((f) => f.key === 'subtype')!.values, ['', ...kinds]);
	assert.equal(prefill('orStart', {}, 'de', undefined, kinds).subtype, 'message');
	assert.equal(prefill('orStart', {}, 'de').subtype, '');
	assert.deepEqual(moveFromForm('orStart', { text: ' Antrag im Portal ', subtype: 'message', role: 'Portal' }), { move: 'orStart', text: 'Antrag im Portal', subtype: 'message', role: 'Portal' });
	assert.deepEqual(signalFields('orStart', { subtype: 'signal' }), ['text']);
});

test('392 AK8 the view offers it as a rare move with startKinds; line menu edit and remove', async () => {
	const v = await replay([post], 'de');
	assert.ok(v.options.includes('orStart'));
	assert.ok(ranks(v.options, 1).rare.includes('orStart'));
	assert.deepEqual(v.startKinds, ['message', 'time', 'condition', 'signal']);
	assert.deepEqual(lineActions(portal, 1), ['edit', 'remove']);
	const w = await replay([post, portal, { move: 'task', text: 'Antrag prüfen', role: 'Sachbearbeitung' }, { move: 'end', text: 'Fertig' }], 'de');
	assert.deepEqual(w.errors, []);
	assert.ok(w.complete);
	assert.ok(w.readingCopy);
	assert.equal(w.storyText[1].text, 'ODER ES BEGINNT mit Nachricht: [Antrag im Portal] bei [@Portal].');
	assert.deepEqual(remove([post, portal], 1, 'de'), [post]);
	// AK6: the working file loads back as told, nothing changed outside.
	const back = await loadStory(w.xml!, 'en');
	assert.ok(!('errors' in back));
	assert.equal(back.changed, false);
	assert.equal(back.moves[1].move, 'orStart');
});
