import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tell, run, emptyProcess } from '../../src/core/index.js';
import type { Move } from '../../src/core/index.js';
import { scene, renderBoth } from '../../src/core/render.js';
import { SMALL } from '../../src/core/layout.js';
import { textMoves, loadStory } from '../../src/workbench.js';
import type { Language } from '../../src/core/language.js';

// Job 445: every caption of an event, exception or question keeps 12 px from the lane header.

const told = async (moves: Move[], language: Language = 'de') => {
	const g = tell(moves, language);
	return run({ ir: { ...emptyProcess('P', g.ir.name, language), story: moves }, ops: g.ops });
};

const story = (start: string, role = 'Buchhaltung'): Move[] => [
	{ move: 'start', text: start, role },
	{ move: 'task', text: 'Rechnung prüfen', role },
	{ move: 'decision', question: 'Betrag über 5000 €?', yes: 'ja', no: 'nein' },
	{ move: 'task', text: 'Zahlung freigeben', role: 'Führungskraft' },
	{ move: 'merge' },
	{ move: 'end', text: 'Bezahlt' }
];

const width = (s: string) => s.length * SMALL * 0.56;
const left = (p: any) => (p.anchor === 'middle' ? p.x - width(p.s) / 2 : p.anchor === 'end' ? p.x - width(p.s) : p.x);

/** Lane header end and the left edge of every small caption drawn for a node, in scene coordinates. */
function gaps(ir: any, positions: any) {
	const s = scene(ir, positions, { withoutLegend: true });
	const heads = s.prims.filter((p: any) => p.t === 'rect' && p.w === 34) as any[];
	assert.ok(heads.length >= 1, 'no lane header');
	const headEnd = Math.max(...heads.map((h) => h.x + h.w));
	const captions = s.groups.flatMap((g) => s.prims.slice(g.start, g.end)).filter((p: any) => p.t === 'text' && p.size === SMALL) as any[];
	return { s, headEnd, heads, captions };
}

function assertClear(ir: any, positions: any, name: string) {
	const { headEnd, captions } = gaps(ir, positions);
	assert.ok(captions.length > 0, name);
	for (const c of captions) assert.ok(left(c) >= headEnd + 12 - 0.01, `${name}: „${c.s}“ starts at ${left(c).toFixed(1)}, header ends at ${headEnd}`);
}

test('445 AK1 start caption „Invoice received“ / „Rechnung eingegangen“ keeps 12 px from the lane header', async () => {
	for (const [start, language] of [['Invoice received', 'en'], ['Rechnung eingegangen', 'de']] as const) {
		const r = await told(story(start), language);
		const { captions, headEnd } = gaps(r.ir, r.positions);
		const own = captions.filter((c) => start.startsWith(c.s) || start.endsWith(c.s));
		assert.ok(own.length >= 1, start);
		for (const c of own) assert.ok(left(c) >= headEnd + 12 - 0.01, `${start}: ${left(c)} vs ${headEnd}`);
	}
});

test('445 AK2 every node caption keeps 12 px from the lane header in the example stories', async () => {
	assertClear((await told(story('Rechnung eingegangen'))).ir, (await told(story('Rechnung eingegangen'))).positions, 'README');
	const long = await told(textMoves(readFileSync('tests/core/fixtures/reklamation.txt', 'utf8'), [], 'de').moves);
	assertClear(long.ir, long.positions, 'reklamation');
	const { complaintStory } = await import('./fixtures.js');
	const c = await complaintStory();
	assertClear(c.ir, c.positions, 'complaint');
	for (const file of ['legacy-working-file.bpmn', 'legacy-invoice.bpmn']) {
		const g = await loadStory(readFileSync('tests/core/fixtures/' + file, 'utf8'), 'de');
		assert.ok('moves' in g, file);
		const r = await told(g.moves, g.language);
		assertClear(r.ir, r.positions, file);
	}
});

test('445 AK3 a long German trigger moves the content right, the headers stay and the pool grows', async () => {
	const short = await told(story('Start'));
	const long = await told(story('Reklamationsschreiben des Kunden eingegangen'));
	const a = gaps(short.ir, short.positions), b = gaps(long.ir, long.positions);
	assert.deepEqual(b.heads.map((h) => h.x), a.heads.map((h) => h.x));
	assertClear(long.ir, long.positions, 'long');
	const pool = (s: any) => s.prims.find((p: any) => p.t === 'rect' && p.w > 34 && p.x === s.pool.x && p.h === s.pool.h);
	const startX = (r: any, s: any) => (s.prims.find((p: any) => p.t === 'circle') as any).cx - (r.positions[r.ir.nodes.find((n: any) => n.kind === 'start').id].x + 18);
	const shift = startX(long, b.s) - startX(short, a.s);
	assert.ok(shift > 0, 'content did not move');
	assert.equal(b.s.pool!.x, a.s.pool!.x);
	assert.ok(Math.abs(pool(b.s).w - pool(a.s).w - shift) < 0.01, 'pool did not grow by the shift');
	assert.ok(Math.abs(b.s.width - a.s.width - shift) < 0.01, 'width did not grow by the shift');
	// No node lies in the header: every shape is right of it.
	for (const p of b.s.groups.flatMap((g) => b.s.prims.slice(g.start, g.end)) as any[]) {
		if (p.t === 'circle') assert.ok(p.cx - p.r > b.headEnd);
		if (p.t === 'rect') assert.ok(p.x > b.headEnd);
	}
	// AK6: the reading copy is drawn from the same scene.
	const both = await renderBoth(long.ir, long.positions, true);
	assert.ok(both.pdf.length > 1000);
	assert.match(both.svg, new RegExp(`width="${Math.round(scene(long.ir, long.positions).width)}"`));
});

test('445 AK4 a caption that is already clear changes nothing: start at x 118, pool at x 10', async () => {
	const r = await told(story('Start'));
	const s = scene(r.ir, r.positions, { withoutLegend: true });
	assert.equal(s.pool!.x, 10);
	const start = s.prims.find((p: any) => p.t === 'circle') as any;
	assert.equal(start.cx, 118);
});

test('445 AK5 the BPMN file of a shifted drawing keeps its coordinates', async () => {
	const short = await told(story('Start'));
	const long = await told(story('Reklamationsschreiben des Kunden eingegangen'));
	const bounds = (x: string) => [...x.matchAll(/<dc:Bounds x="([\d.-]+)"/g)].map((m) => m[1]);
	assert.ok(long.xml && short.xml);
	assert.deepEqual(bounds(long.xml!), bounds(short.xml!));
});
