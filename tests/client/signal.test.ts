import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Move } from '../../src/core/index.js';
import { replay, ranks, fields, moveFromForm, lineActions, lineParts, textParts, signalLine, signalFields, signalNames } from '../../src/workbench.js';
import { tell } from '../../src/core/index.js';

// Job 384: the signal in the interface.
const story: Move[] = [
	{ move: 'start', text: 'Preise freigegeben', role: 'Vertrieb', subtype: 'signal' },
	{ move: 'task', text: 'Angebot schreiben', role: 'Vertrieb' },
	{ move: 'sendSignal', text: 'Lieferstopp ausgerufen', role: 'Qualität' },
	{ move: 'wait', text: 'Lieferstopp ausgerufen ', subtype: 'signal' },
];

test('384 AK1 the move "give a notice to everyone" is needed less often; forms offer the signal', async () => {
	const v = await replay(story.slice(0, 2), 'de');
	const r = ranks(v.options, 2);
	assert.ok(r.rare.includes('sendSignal'));
	assert.ok(!r.frequent.includes('sendSignal'));
	assert.deepEqual(fields('sendSignal').map((f) => f.key), ['text', 'role']);
	for (const [kind, key] of [['wait', 'subtype'], ['start', 'subtype'], ['end', 'subtype']] as const)
		assert.ok(fields(kind).find((f) => f.key === key)!.values!.includes('signal'), kind);
	const first = fields('decision', { subtype: 'first' });
	assert.ok(first.find((f) => f.key === 'yesKind')!.values!.includes('signal'));
	assert.ok(v.endKinds.includes('signal'));
	assert.deepEqual(moveFromForm('sendSignal', { text: ' Stopp ', role: 'Qualität' }), { move: 'sendSignal', text: 'Stopp', role: 'Qualität' });
	assert.deepEqual(lineActions(story[2], 2), ['edit', 'before', 'remove']);
});

test('384 AK7 story lines: the signal object, empty when awaited, filled when given', () => {
	const g = tell([...story, { move: 'decision', subtype: 'first', yes: 'Freigabe', yesKind: 'signal', no: '2 Tage', noKind: 'time' }, { move: 'end', text: 'Gemeldet', subtype: 'signal' }, { move: 'end', text: 'Zu spät' }], 'de');
	assert.deepEqual(g.errors, []);
	const signal = (text: string) => lineParts(text).filter((p) => p.object === 'signal').map((p) => `${p.text}:${p.filled}`);
	const got = g.storyText.map((l) => signal(l.text)).filter((x) => x.length).flat();
	assert.deepEqual(got, [
		'Preise freigegeben:false',
		'Lieferstopp ausgerufen:true',
		'Lieferstopp ausgerufen:false',
		'Freigabe:false',
		'Gemeldet:true',
	]);
	// The role on a signal line keeps its colour; other lines have no signal.
	assert.deepEqual(lineParts('SIGNAL SENDEN [Stopp] bei [@QS].').map((p) => p.object).filter(Boolean), ['signal', 'role']);
	assert.equal(signalLine('[@Vertrieb] soll [Angebot schreiben].'), undefined);
	assert.equal(signalLine('ENDE mit Nachricht: [X].'), undefined);
	assert.equal(signalLine('END with a signal: [X].'), 'filled');
	assert.equal(signalLine('  WAIT FOR SIGNAL [X].'), 'empty');
	// The editor layer keeps every character.
	const layer = textParts('  → SIGNAL [Freigabe]:');
	assert.equal(layer.map((p) => p.text).join(''), '  → SIGNAL [Freigabe]:');
	assert.equal(layer.find((p) => p.subtype === 'o')!.object, 'signal');
});

test('384 AK7 suggestions: the signal names of this story, each once', async () => {
	const v = await replay(story, 'de');
	assert.deepEqual(v.signals, ['Lieferstopp ausgerufen', 'Preise freigegeben']);
	assert.deepEqual(signalNames(tell(story.slice(0, 2)).ir), ['Preise freigegeben']);
	assert.deepEqual((await replay(story.slice(0, 2).map((m, i) => (i ? m : { ...m, subtype: '' })) as Move[], 'de')).signals, []);
	assert.deepEqual(signalFields('sendSignal', {}), ['text']);
	assert.deepEqual(signalFields('wait', { subtype: 'signal' }), ['text']);
	assert.deepEqual(signalFields('wait', { subtype: 'message' }), []);
	assert.deepEqual(signalFields('decision', { subtype: 'first', yesKind: 'time', noKind: 'signal' }), ['no']);
	assert.deepEqual(signalFields('task', {}), []);
});

test('384 AK7 colour key shows "Signal" only when the story has one; triangle in the story card', () => {
	const card = readFileSync('src/components/StoryCard.vue', 'utf8');
	assert.match(card, /keyObjects\(\) \{[\s\S]*?this\.view\.signals\?\.length/);
	assert.match(card, /<svg v-if="part\.object === 'signal'" class="tri"/);
	const form = readFileSync('src/components/MoveForm.vue', 'utf8');
	assert.match(form, /<datalist /);
});
