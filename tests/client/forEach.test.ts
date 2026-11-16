import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Move } from '../../src/core/index.js';
import { fields, prefill, moveFromForm, requiredEmpty, lineParts, textParts, loadStory, fileXml, forEachSwitched } from '../../src/workbench.js';
import { tell } from '../../src/core/story.js';

// Job 390: the client side of "for each item" - form switch, its fields, the item in the story text.
const task: Move = { move: 'task', text: 'Position prüfen', role: 'Buchhaltung', each: 'Rechnungsposition', eachOrder: 'parallel' };
const story: Move[] = [
	{ move: 'start', text: 'Rechnung eingegangen', role: 'Buchhaltung' },
	task,
	{ move: 'end', text: 'Rechnung geprüft' },
];
const keys = (values: Record<string, string | undefined>, inner = false) => fields('task', values, undefined, inner).map((f) => f.key);

test('390 AK6 the switch shows what for and how only when it is on, also on a subprocess level', () => {
	assert.deepEqual(keys({}).slice(-1), ['forEach']);
	assert.ok(!keys({ forEach: '' }).includes('each'));
	assert.deepEqual(keys({ forEach: 'yes' }).slice(-3), ['forEach', 'each', 'eachOrder']);
	assert.deepEqual(keys({ forEach: 'yes' }, true).slice(-4), ['deadline', 'forEach', 'each', 'eachOrder']);
	const order = fields('task', { forEach: 'yes' }).find((f) => f.key === 'eachOrder')!;
	assert.deepEqual(order.values, ['sequential', 'parallel']);
});

test('390 AK6 an empty item is missing; form and move round trip; switching off removes it', () => {
	const fresh = prefill('task', { forEach: 'yes' }, 'de', 'Buchhaltung');
	assert.equal(fresh.eachOrder, 'sequential');
	assert.deepEqual(requiredEmpty('task', { ...fresh, text: 'X' }), ['each']);
	assert.deepEqual(requiredEmpty('task', { ...fresh, text: 'X', each: 'Stück' }), []);
	const v = prefill('task', { ...task } as never, 'de');
	assert.equal(v.forEach, 'yes');
	assert.equal(v.each, 'Rechnungsposition');
	assert.equal(v.eachOrder, 'parallel');
	assert.deepEqual(moveFromForm('task', v), task);
	assert.equal(prefill('task', { move: 'task', text: 'X', role: 'B', each: 'Stück' } as never, 'de').eachOrder, 'sequential');
	const off = moveFromForm('task', { ...v, forEach: '' });
	assert.deepEqual(off, { move: 'task', text: 'Position prüfen', role: 'Buchhaltung' });
	assert.equal(prefill('task', { move: 'task', text: 'X', role: 'B' } as never, 'de').forEach, '');
	assert.deepEqual(moveFromForm('task', { ...v, each: '  Gutachter ' }), { ...task, each: 'Gutachter' });
});

test('390 round 1: switching it on in a new form preselects one after another, and the move is told', () => {
	for (const start of [{}, { move: 'task', text: 'X', role: 'B' }]) {
		const v = forEachSwitched({ ...prefill('task', start as never, 'de', 'B'), text: 'X', forEach: 'yes' });
		assert.equal(v.eachOrder, 'sequential');
		assert.equal(v.each, '');
		const z = moveFromForm('task', { ...v, each: 'Stück' });
		assert.equal((z as { eachOrder?: string }).eachOrder, 'sequential');
		assert.deepEqual(tell([{ move: 'start', text: 'S', role: 'B' }, z]).errors, []);
	}
	// No preselection in the values: moveFromForm still writes one after another.
	assert.equal((moveFromForm('task', { text: 'X', role: 'B', forEach: 'yes', each: 'Stück' }) as { eachOrder?: string }).eachOrder, 'sequential');
	assert.equal(forEachSwitched({ forEach: '', text: 'X' }).eachOrder, undefined);
});

test('390 AK7 the item after FÜR JEDE / FOR EACH is an item, the step stays a step', () => {
	for (const line of ['[@Buchhaltung] soll [Position prüfen], FÜR JEDE [Rechnungsposition], NACHEINANDER.', '[@A] shall [Check], FOR EACH [invoice item], IN PARALLEL, WITH SUBPROCESS.']) {
		for (const parts of [lineParts(line), textParts(line)]) {
			const objects = parts.filter((p) => p.subtype === 'o').map((p) => p.object);
			assert.deepEqual(objects, ['role', 'task', 'item'], line);
		}
	}
	assert.equal(lineParts('[@A] shall [Check], FOR EACH [x], IN PARALLEL, WITH SUBPROCESS.').find((p) => p.object === 'task')?.sub, true);
});

test('390 AK4 a working file of the app with "for each" opens unchanged', async () => {
	const xml = await fileXml(story, 'de');
	const g = await loadStory(xml!, 'de');
	assert.ok(!('errors' in g));
	if ('errors' in g) return;
	assert.equal(g.changed, false);
	assert.deepEqual(g.moves, story);
});
