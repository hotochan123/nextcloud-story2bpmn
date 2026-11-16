import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Move } from '../../src/core/index.js';
import {
	replay, workbench, fields, prefill, moveFromForm, replace, before, remove, atLevel, withSubprocess, lineActions, lineParts,
	loadStory, fileXml, targetsUntil, change,
} from '../../src/workbench.js';
import { applyProposal, validLines, proposalAt } from '../../src/approval.js';
import type { Approval } from '../../src/core/index.js';

// Job 387: the client side of a subprocess - form switch, levels, changes on a level.
const behind: Move[] = [
	{ move: 'task', text: 'Ware kommissionieren', role: 'Lager' },
	{ move: 'task', text: 'Paket packen', role: 'Lager' },
	{ move: 'end', text: 'Ware versandt' },
];
const story = (sub: Move[] = behind): Move[] => [
	{ move: 'start', text: 'Bestellung eingegangen', role: 'Vertrieb' },
	{ move: 'task', text: 'Ware versenden', role: 'Lager', subprocess: sub },
	{ move: 'end', text: 'Bestellung erledigt' },
];
const inner = { inner: { name: 'Ware versenden' } };

test('387 AK5 the task form asks whether a flow stands behind it, not on a subprocess level', () => {
	assert.ok(fields('task').some((f) => f.key === 'subprocess' && f.values?.join() === ',yes'));
	assert.ok(!fields('task', {}, undefined, true).some((f) => f.key === 'subprocess'));
	assert.equal(prefill('task', {}, 'de').subprocess, '');
	assert.equal(prefill('task', { ...story()[1] } as never, 'de').subprocess, 'yes');
	assert.deepEqual(moveFromForm('task', { text: 'a', role: 'b', subprocess: 'yes' }), { move: 'task', text: 'a', role: 'b', subprocess: [] });
	assert.deepEqual(moveFromForm('task', { text: 'a', role: 'b', subprocess: '' }), { move: 'task', text: 'a', role: 'b' });
});

test('387 AK5 changing the task keeps the flow behind it; "No" removes it', () => {
	const moves = story();
	const kept = replace(moves, 1, moveFromForm('task', { text: 'Ware schicken', role: 'Lager', subprocess: 'yes' }));
	assert.deepEqual((kept[1] as { subprocess?: Move[] }).subprocess, behind);
	assert.equal((kept[1] as { text: string }).text, 'Ware schicken');
	const gone = replace(moves, 1, moveFromForm('task', { text: 'Ware versenden', role: 'Lager', subprocess: '' }));
	assert.equal('subprocess' in gone[1], false);
	assert.deepEqual(withSubprocess([...gone], 1)[1], { move: 'task', text: 'Ware versenden', role: 'Lager', subprocess: [] });
	assert.deepEqual(withSubprocess(moves, 1), moves, 'one that has a flow keeps it');
});

test('387 AK5 replay at a level shows the question, lines and diagram of that subprocess', async () => {
	const half = story(behind.slice(0, 1));
	const main = await replay(half, 'de');
	assert.equal(main.level, undefined);
	assert.equal(main.levelMoves, half);
	assert.deepEqual(main.subs, { 1: { told: false, moves: 1 } });
	assert.ok(main.lines.every((l) => l.sub === undefined));
	assert.equal(main.readingCopy, false, 'half told: open point');
	const sub = await replay(half, 'de', 1);
	assert.equal(sub.level, 1);
	assert.deepEqual(sub.sub, { name: 'Ware versenden', lane: 'Lager', process: 'Prozess' });
	assert.deepEqual(sub.levelMoves, behind.slice(0, 1));
	assert.equal(sub.moves, half, 'the whole story stays');
	assert.deepEqual(sub.lines.map((l) => l.text), ['ES BEGINNT.', '[@Lager] soll [Ware kommissionieren].']);
	assert.equal(sub.storyText[sub.lineOffset].text, 'ES BEGINNT.');
	assert.match(sub.question ?? '', /Ware kommissionieren/);
	assert.ok(!sub.options.includes('start'));
	assert.match(sub.svg, /data-move="1"/);
	assert.doesNotMatch(sub.svg, />Bestellung eingegangen</, 'only the subprocess is drawn');
	assert.match(sub.svg, />Ware versenden</, 'pool named after the task');
	assert.equal(sub.nodes, 2);
	assert.ok(sub.here?.startsWith('Schritt_'), String(sub.here));
	// No subprocess at that move: the main level.
	assert.equal((await replay(half, 'de', 0)).level, undefined);
});

test('387 AK5 a change on a level replaces only the flow behind that task', async () => {
	const wb = workbench('de');
	assert.equal((await wb.set(story([]))).ok, true);
	assert.equal((await wb.show(1)).ok, true);
	assert.equal(wb.level, 1);
	for (const m of behind) assert.equal((await wb.setLevel([...wb.view!.levelMoves, m])).ok, true);
	assert.deepEqual(wb.moves, story());
	assert.equal(wb.view!.level, 1, 'the level stays');
	assert.equal(wb.view!.done, true);
	assert.equal(wb.view!.readingCopy, true);
	// A move the subprocess cannot take is rejected; nothing changes.
	const r = await wb.setLevel([{ move: 'start', text: 'x', role: 'y' }]);
	assert.equal(r.ok, false);
	assert.deepEqual(wb.moves, story());
	await wb.show();
	assert.equal(wb.view!.level, undefined);
	// Removing the task: back on the main level.
	await wb.show(1);
	await wb.set(remove(wb.moves, 1, 'de'));
	assert.equal(wb.view!.level, undefined);
});

test('387 AK5 atLevel, insert and delete on a level use the subprocess rules', () => {
	assert.deepEqual(atLevel(story(), 1, behind.slice(1)), story(behind.slice(1)));
	assert.deepEqual(atLevel(story(), undefined, behind), behind);
	const ins = before(behind, 0, { move: 'task', text: 'Vorher', role: 'Lager' }, 'de', inner);
	assert.equal(ins.length, 4);
	assert.deepEqual(change(story(), atLevel(story(), 1, ins), 'de').rejected, undefined);
	assert.deepEqual(remove(behind, 1, 'de', inner).length, 2);
	assert.ok(targetsUntil(behind, 2, 'de', inner).some((x) => x.name === 'Paket packen'));
});

test('387 AK5 the menu offers the flow behind only for tasks of the main level', () => {
	assert.ok(lineActions(story()[1], 1).includes('subprocess'));
	assert.ok(!lineActions(behind[0], 0, true).includes('subprocess'));
	assert.ok(lineActions(behind[0], 0, true).includes('before'), 'before the first move of a subprocess');
	assert.ok(!lineActions(story()[2], 2).includes('subprocess'));
	const parts = lineParts('[@Lager] soll [Ware versenden], MIT TEILABLAUF.');
	assert.equal(parts.find((p) => p.object === 'task')?.sub, true);
	assert.equal(lineParts('[@Lager] soll [Ware versenden].').find((p) => p.object === 'task')?.sub, undefined);
});

test('387 AK3 a working file of the app opens unchanged, with its subprocess', async () => {
	const xml = await fileXml(story(), 'de');
	const g = await loadStory(xml!, 'en');
	assert.ok(!('errors' in g));
	if ('errors' in g) return;
	assert.equal(g.changed, false);
	assert.deepEqual(g.moves, story());
});

test('387 risk: accepting a proposal on a line of the subprocess section changes that flow', async () => {
	const moves = story();
	const valid: Approval = { state: 'review', decided: [], tag: true, valid: { number: 1, date: '2026-11-12T10:00:00Z', by: { uid: 'a', name: 'A' }, moves, language: 'de' } } as Approval;
	const lines = validLines(valid);
	const at = lines.findIndex((l) => l.includes('Paket packen'));
	assert.ok(at > 4);
	// Job 417: the number is that of the move in the subprocess (left of the line), not the text line.
	const ref = proposalAt(valid, at)!;
	assert.deepEqual(ref, { line: 2, label: 'Paket packen' });
	const r = await applyProposal(moves, 'de', valid, { id: 1, version: 1, ...ref, kind: 'change', text: '[@Lager] soll [Paket schnüren].' } as never);
	assert.equal(r.ok, true);
	if (!r.ok) return;
	const sub = (r.moves[1] as { subprocess?: Move[] }).subprocess!;
	assert.equal((sub[1] as { text: string }).text, 'Paket schnüren');
});

test('387 AK5 the whole story stays the measure: complete and untold also on a subprocess level', async () => {
	const moves: Move[] = [...story()];
	moves.splice(2, 0, { move: 'task', text: 'Rechnung schreiben', role: 'Buchhaltung', subprocess: [] });
	const main = await replay(moves, 'de');
	assert.equal(main.complete, true);
	assert.equal(main.untold, 1);
	const sub = await replay(moves, 'de', 1);
	assert.equal(sub.done, true, 'that flow is told');
	assert.equal(sub.complete, true);
	assert.equal(sub.untold, 1);
	const empty = await replay(moves, 'de', 2);
	assert.equal(empty.done, false);
	assert.equal(empty.complete, true);
});

test('387 round 1: a choice field renders only its select (the hints sit after the v-if chain)', async () => {
	const { readFileSync } = await import('node:fs');
	const { parse } = await import('@vue/compiler-sfc');
	const { descriptor } = parse(readFileSync('src/components/MoveForm.vue', 'utf8'));
	// The children of the field block: the input elements must form one v-if / v-else-if / v-else chain.
	type El = { type: number; tag?: string; props?: { name: string; exp?: { content: string } }[]; children?: El[] };
	const find = (n: El): El | undefined => (n.props?.some((p) => p.name === 'for') && n.tag === 'div' ? n : n.children?.map(find).find(Boolean));
	const field = find(descriptor.template!.ast as unknown as El)!;
	const branch = (e: El) => e.props?.find((p) => p.name === 'if' || p.name === 'else-if' || p.name === 'else')?.name;
	const elements = field.children!.filter((c) => c.type === 1 && c.tag !== 'label');
	const chain = elements.slice(0, elements.findIndex((e) => branch(e) === 'else') + 1).map(branch);
	assert.deepEqual(chain, ['if', 'else-if', 'else-if', 'else-if', 'else'], 'select, target, role, further path (job 389), text input in one chain');
});
