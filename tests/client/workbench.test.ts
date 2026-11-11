import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tell } from '../../src/core/index.js';
import type { Move } from '../../src/core/index.js';
import {
	replay, change, append, replace, before, remove, undo, switchTo,
	lineActions, ranks, fields, prefill, requiredEmpty, moveFromForm, targetsUntil,
	digitKey, lineParts, workbench, diagramLanguage, type View,
	loadStory, fileSuggestion, unsaved, outputs, outputName,
	textFrom, textMoves, checkText, textParts, helpPattern, textChecker, withProcess, type CheckerWorker,
} from '../../src/workbench.js';

const README: Move[] = [
	{ move: 'start', text: 'Rechnung geht ein', role: 'Buchhaltung' },
	{ move: 'task', text: 'Rechnung prüfen', role: 'Buchhaltung' },
	{ move: 'decision', question: 'Betrag über 5000 €?', yes: 'ja', no: 'nein' },
	{ move: 'task', text: 'Zahlung freigeben', role: 'Führungskraft' },
	{ move: 'merge' },
	{ move: 'merge' },
	{ move: 'end', text: 'Bezahlt' },
];

// Loop: the query jumps back to "Rechnung prüfen".
const LOOP: Move[] = [
	{ move: 'start', text: 'Rechnung geht ein', role: 'Buchhaltung' },
	{ move: 'task', text: 'Eingang erfassen', role: 'Buchhaltung' },
	{ move: 'task', text: 'Rechnung prüfen', role: 'Buchhaltung' },
	{ move: 'exceptionPath', text: 'Betrag falsch', subtype: 'error' },
	{ move: 'task', text: 'Rückfrage', role: 'Buchhaltung' },
];

test('AK1 replay: README story complete with SVG, empty story offers the start', async () => {
	const a = await replay(README, 'de');
	assert.equal(a.done, true);
	assert.match(a.svg, /^<svg /);
	assert.ok(a.nodes > 0);
	assert.ok(a.lanes >= 2);
	assert.deepEqual(a.errors, []);
	const empty = await replay([], 'de');
	assert.equal(empty.svg, '');
	assert.ok(empty.options.includes('start'));
	assert.equal(empty.done, false);
	assert.deepEqual(empty.issues, []);
});

test('AK1 no check messages on the way, preview with ENTWURF', async () => {
	const a = await replay(README.slice(0, 2), 'de');
	assert.equal(a.done, false);
	assert.deepEqual(a.issues, []);
	assert.match(a.svg, /ENTWURF/);
});

test('AK2 change rejects a move with an error and keeps the old state', () => {
	const old = README.slice(0, 2);
	const added = [...old, { move: 'goTo', target: 'gibt_es_nicht' } as Move];
	const r = change(old, added, 'de');
	assert.equal(r.moves, old);
	assert.ok(r.rejected && r.rejected.length > 0);
	const ok = change(old, README.slice(0, 3), 'de');
	assert.equal(ok.rejected, undefined);
	assert.equal(ok.moves.length, 3);
});

test('AK3 append, replace, undo, switch', () => {
	const z = append(README.slice(0, 1), README[1]);
	assert.deepEqual(z, README.slice(0, 2));
	const e = replace(z, 1, { move: 'task', text: 'Anders', role: 'Buchhaltung' });
	assert.equal((e[1] as { text: string }).text, 'Anders');
	assert.equal(z[1], README[1], 'Original bleibt unveraendert');
	assert.deepEqual(undo(README), README.slice(0, -1));
	assert.deepEqual(switchTo([], 0), [{ move: 'switchTo', to: 1 }]);
});

test('AK3 before and remove keep "weiter bei" valid', () => {
	const g = tell(LOOP, 'de');
	const target = g.targets.find((x) => x.name === 'Rechnung prüfen')!;
	const withWord = [...LOOP, { move: 'goTo', target: target.id } as Move];
	assert.deepEqual(tell(withWord, 'de').errors, []);
	const previously = before(withWord, 1, { move: 'task', text: 'Post öffnen', role: 'Buchhaltung' }, 'de');
	assert.equal(previously.length, withWord.length + 1);
	assert.deepEqual(tell(previously, 'de').errors, []);
	const without = remove(withWord, 1, 'de');
	assert.equal(without.length, withWord.length - 1);
	assert.ok(!without.some((z) => z.move === 'task' && z.text === 'Eingang erfassen'));
	assert.deepEqual(tell(without, 'de').errors, []);
	const jump = without.at(-1) as { move: 'goTo'; target: string };
	assert.equal(tell(without, 'de').targets.find((x) => x.id === jump.target)?.name, 'Rechnung prüfen');
});

test('AK4 lineActions', () => {
	assert.deepEqual(lineActions(README[0], 0), ['edit']);
	assert.deepEqual(lineActions(README[1], 1), ['edit', 'before', 'remove']);
	assert.deepEqual(lineActions(README[2], 2), ['edit', 'before']);
	assert.deepEqual(lineActions({ move: 'merge' }, 4), ['before']);
	assert.deepEqual(lineActions({ move: 'wait', text: 'x', subtype: 'time' }, 3), ['edit', 'before', 'remove']);
	assert.deepEqual(lineActions({ move: 'switchTo', to: 1 }, 5), ['before']);
});

test('AK4 ranks: without moves no start button, frequent first', () => {
	assert.deepEqual(ranks(['start'], 0), { frequent: [], rare: [] });
	assert.deepEqual(ranks(['wait', 'task', 'decision', 'end'], 2), { frequent: ['task', 'end'], rare: ['wait', 'decision'] });
});

test('AK4 fields: first, keepsRunning, endKinds', () => {
	assert.deepEqual(fields('decision', {}).map((f) => f.key), ['subtype', 'question', 'yes', 'no']);
	assert.deepEqual(fields('decision', { subtype: 'first' }).map((f) => f.key), ['subtype', 'yes', 'yesKind', 'no', 'noKind']);
	assert.ok(!fields('exceptionPath', { subtype: 'error' }).some((f) => f.key === 'keepsRunning'));
	assert.ok(!fields('exceptionPath', {}).some((f) => f.key === 'keepsRunning'));
	assert.ok(fields('exceptionPath', { subtype: 'deadline' }).some((f) => f.key === 'keepsRunning'));
	assert.deepEqual(fields('end', {}, ['', 'message']).find((f) => f.key === 'subtype')!.values, ['', 'message']);
	assert.deepEqual(fields('end', {}, ['', 'message', 'cancel']).find((f) => f.key === 'subtype')!.values, ['', 'message', 'cancel']);
	assert.deepEqual(fields('end', { subtype: 'cancel' }, ['']).find((f) => f.key === 'subtype')!.values, ['', 'cancel']);
	assert.deepEqual(fields('concurrent', {}), []);
	assert.deepEqual(fields('task', {}).filter((f) => f.optional).map((f) => f.key), ['system', 'documentName', 'deadline']);
});

test('AK4 prefill: ja/nein in the diagram language, role as last time', () => {
	const v = prefill('decision', {}, 'en');
	assert.equal(v.yes, 'yes');
	assert.equal(v.no, 'no');
	assert.equal(prefill('decision', { subtype: 'first' }, 'de').yes, '');
	assert.equal(prefill('task', {}, 'de', 'Buchhaltung').role, 'Buchhaltung');
	assert.equal(prefill('exceptionPath', {}, 'de').subtype, 'error');
	assert.equal(prefill('task', { text: 'A', role: 'X' }, 'de', 'Y').role, 'X');
});

test('AK4 moveFromForm and requiredEmpty', () => {
	assert.deepEqual(requiredEmpty('task', { text: ' ', role: 'B' }), ['text']);
	assert.deepEqual(requiredEmpty('task', { text: 'A', role: '', newRole: '' }), ['newRole']);
	assert.deepEqual(requiredEmpty('task', { text: 'A', role: '' }), ['role']);
	assert.deepEqual(requiredEmpty('task', { text: 'A', role: '', newRole: 'Einkauf' }), []);
	assert.deepEqual(requiredEmpty('start', { text: 'A', role: 'B', process: '' }), []);
	assert.deepEqual(
		moveFromForm('task', { text: ' Prüfen ', role: '', newRole: ' Einkauf ', system: '', deadline: '3 Tage' }),
		{ move: 'task', text: 'Prüfen', role: 'Einkauf', deadline: '3 Tage' },
	);
	assert.deepEqual(
		moveFromForm('decision', { subtype: 'first', yes: 'Zahlung', yesKind: 'message', no: '14 Tage', noKind: 'time', question: 'alt' }),
		{ move: 'decision', subtype: 'first', yes: 'Zahlung', yesKind: 'message', no: '14 Tage', noKind: 'time' },
	);
	assert.deepEqual(moveFromForm('goTo', { target: 'Task_3' }), { move: 'goTo', target: 'Task_3' });
});

test('AK4 targetsUntil: targets at exactly this point', () => {
	assert.deepEqual(targetsUntil(LOOP, 1, 'de').map((z) => z.name).filter((n) => n === 'Rechnung prüfen'), []);
	assert.ok(targetsUntil(LOOP, 5, 'de').some((z) => z.name === 'Rechnung prüfen'));
});

test('AK4 digitKey', () => {
	assert.equal(digitKey({ key: '1' }), 0);
	assert.equal(digitKey({ key: '9', target: { tagName: 'BUTTON' } }), 8);
	assert.equal(digitKey({ key: '0' }), null);
	assert.equal(digitKey({ key: 'a' }), null);
	assert.equal(digitKey({ key: '2', ctrlKey: true }), null);
	assert.equal(digitKey({ key: '2', target: { tagName: 'INPUT' } }), null);
	assert.equal(digitKey({ key: '2', target: { tagName: 'textarea' } }), null);
	assert.equal(digitKey({ key: '2', target: { tagName: 'DIV', isContentEditable: true } }), null);
});

test('diagramLanguage follows the account language', () => {
	assert.equal(diagramLanguage('de'), 'de');
	assert.equal(diagramLanguage('de_DE'), 'de');
	assert.equal(diagramLanguage('en'), 'en');
	assert.equal(diagramLanguage('fr'), 'en');
	assert.equal(diagramLanguage(undefined), 'en');
});

test('lineParts: signal word, object kinds, text', () => {
	assert.deepEqual(lineParts('ES BEGINNT: [Rechnung geht ein] bei [@Buchhaltung].'), [
		{ subtype: 'sw', text: 'ES BEGINNT' },
		{ subtype: 'text', text: ': ' },
		{ subtype: 'o', text: 'Rechnung geht ein', object: 'task' },
		{ subtype: 'text', text: ' bei ' },
		{ subtype: 'o', text: 'Buchhaltung', object: 'role' },
		{ subtype: 'text', text: '.' },
	]);
	assert.deepEqual(lineParts('WENN [?Betrag hoch]'), [
		{ subtype: 'sw', text: 'WENN' }, { subtype: 'text', text: ' ' }, { subtype: 'o', text: 'Betrag hoch?', object: 'question' },
	]);
	assert.deepEqual(lineParts('→ ja:'), [{ subtype: 'text', text: '→ ja:' }]);
});

test('risk: markup in the name stays text, also in the SVG', async () => {
	const evil = '<img src=x onerror=alert(1)>';
	const z: Move[] = [{ move: 'start', text: evil, role: 'Buchhaltung', process: evil }, { move: 'task', text: evil, role: '<b>X</b>' }];
	const a = await replay(z, 'de');
	assert.ok(!a.svg.includes('<img'));
	assert.ok(!a.svg.includes('<b>'));
	for (const l of a.storyText) for (const t of lineParts(l.text)) assert.equal(typeof t.text, 'string');
});

test('AK5 a stale replay does not overwrite a newer one', async () => {
	const wait: Array<() => void> = [];
	const play = (moves: Move[]) => new Promise<View>((ok) => wait.push(() => ok({ moves } as View)));
	const wb = workbench('de', play);
	const first = wb.set(README.slice(0, 1));
	const then = wb.set(README.slice(0, 2));
	wait[1]();
	assert.deepEqual(await then, { ok: true });
	wait[0]();
	assert.deepEqual(await first, { ok: false, stale: true });
	assert.equal(wb.moves.length, 2);
	assert.equal(wb.view?.moves.length, 2);
});

test('AK5 workbench: a rejected change leaves the state alone', async () => {
	const wb = workbench('de');
	assert.deepEqual(await wb.set(README.slice(0, 2)), { ok: true });
	const r = await wb.set([...wb.moves, { move: 'goTo', target: 'nix' } as Move]);
	assert.equal(r.ok, false);
	assert.ok('rejected' in r);
	assert.equal(wb.moves.length, 2);
});

test('risk: 30 moves replay in under a second', async () => {
	const z: Move[] = [{ move: 'start', text: 'Los', role: 'A' }];
	for (let i = 0; i < 28; i++) z.push({ move: 'task', text: `Schritt ${i}`, role: i % 3 ? 'A' : 'B' });
	z.push({ move: 'end', text: 'Fertig' });
	const t0 = performance.now();
	const a = await replay(z, 'de');
	assert.equal(a.done, true);
	assert.ok(performance.now() - t0 < 1000, `${performance.now() - t0} ms`);
});

// Job 375: open and save in Files.

test('375 AK3 replay: xml with the story as soon as there are nodes; without moves no xml', async () => {
	const a = await replay(README.slice(0, 2), 'de');
	assert.match(a.xml ?? '', /bpmnc:geschichte=/);
	assert.match(a.xml ?? '', /xml:lang="de"/);
	assert.equal((await replay([], 'de')).xml, undefined);
});

test('375 AK1 loadStory: a working file gives the same moves and their language, unchanged', async () => {
	const a = await replay(README, 'de');
	const g = await loadStory(a.xml!, 'en');
	assert.ok(!('errors' in g));
	assert.deepEqual(g.moves, README);
	assert.equal(g.language, 'de');
	assert.equal(g.changed, false);
	const en = await replay(README.slice(0, 2), 'en');
	const ge = await loadStory(en.xml!, 'de');
	assert.ok(!('errors' in ge) && ge.language === 'en');
});

test('375 AK1 loadStory: task renamed in the modeler → changed', async () => {
	const a = await replay(README, 'de');
	const xml = a.xml!.replace('name="Rechnung prüfen"', 'name="Rechnung sorgfältig prüfen"');
	assert.notEqual(xml, a.xml);
	const g = await loadStory(xml, 'de');
	assert.ok(!('errors' in g) && g.changed === true);
});

test('375 AK1 loadStory: without a story, broken XML, entities and nonsense in the story → error, no crash', async () => {
	const a = await replay(README, 'de');
	const without = a.xml!.replace(/\sbpmnc:geschichte="[^"]*"/, '');
	assert.deepEqual(await loadStory(without, 'de'), { errors: 'no-story' });
	assert.deepEqual(await loadStory('<bpmn:definitions', 'de'), { errors: 'unreadable' });
	assert.deepEqual(await loadStory('', 'de'), { errors: 'unreadable' });
	const bomb = '<?xml version="1.0"?><!DOCTYPE d [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;"><!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;"><!ENTITY x SYSTEM "file:///etc/passwd">]>'
		+ '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"><bpmn:process id="P" name="&c;&x;"/></bpmn:definitions>';
	const b = await loadStory(bomb, 'de');
	assert.ok('errors' in b);
	const unsinn = a.xml!.replace(/bpmnc:geschichte="[^"]*"/, 'bpmnc:geschichte="[1,null,&quot;x&quot;]"');
	assert.deepEqual(await loadStory(unsinn, 'de'), { errors: 'unreadable' });
	const wrong = a.xml!.replace(/bpmnc:geschichte="[^"]*"/, 'bpmnc:geschichte="[{&quot;zug&quot;:&quot;ende&quot;}]"');
	assert.deepEqual(await loadStory(wrong, 'de'), { errors: 'unreadable' });
});

test('375 AK2 fileSuggestion and unsaved', () => {
	assert.equal(fileSuggestion(' Rechnung / Eingang '), 'Rechnung Eingang.bpmn');
	assert.equal(fileSuggestion('<>'), 'process.bpmn');
	assert.equal(fileSuggestion(undefined), 'process.bpmn');
	assert.equal(fileSuggestion('..versteckt'), 'versteckt.bpmn');
	assert.equal(fileSuggestion('a\nb\tc'), 'a b c.bpmn');
	assert.ok(fileSuggestion('x'.repeat(400)).length <= 200);
	assert.equal(unsaved(README, README.map((z) => ({ ...z }))), false);
	assert.equal(unsaved(README, README.slice(0, -1)), true);
	assert.equal(unsaved([], []), false);
});

// Edit as text (job 374)
const WITH_NAME: Move[] = [{ ...README[0], process: 'Rechnungseingang' } as Move, ...README.slice(1)];

for (const language of ['de', 'en'] as const)
	test(`Text AK1 (${language}): opening the story text and accepting it unchanged gives the same moves`, () => {
		for (const moves of [WITH_NAME, LOOP]) {
			const text = textFrom(tell(moves, language).storyText);
			assert.match(text, /\n {2}/); // indentation stays
			const r = textMoves(text, moves, language);
			assert.deepEqual(r.errors, []);
			assert.equal(r.number, r.moves.length);
			assert.deepEqual(tell(r.moves, language).ops, tell(moves, language).ops);
			assert.equal(textFrom(tell(r.moves, language).storyText), text);
		}
		// The same moves; empty kinds ('' = plain) are written out by the core when reading back.
		const withoutEmpty = (z: Move[]) => z.map((x) => Object.fromEntries(Object.entries(x).filter(([, v]) => v !== '')));
		const r = textMoves(textFrom(tell(WITH_NAME, language).storyText), WITH_NAME, language);
		assert.deepEqual(withoutEmpty(r.moves), withoutEmpty(language === 'de' ? WITH_NAME : r.moves));
	});

test('Text AK2: an appended line "Quatsch hier" names its number, otherwise the number of moves', () => {
	for (const [language, pattern] of [['de', /^Zeile (\d+): „Quatsch hier“ nicht verstanden/], ['en', /^Line (\d+): “Quatsch hier” not understood/]] as const) {
		const text = textFrom(tell(WITH_NAME, language).storyText);
		const lines = text.split('\n').length;
		const ok = checkText(text, language);
		assert.deepEqual(ok, { number: WITH_NAME.length, errors: [] });
		const f = checkText(text + '\nQuatsch hier', language);
		assert.equal(f.line, lines + 1);
		assert.equal(f.errors.length, 1);
		assert.equal(f.errors[0].match(pattern)?.[1], String(lines + 1));
	}
});

test('Text AK3: error text gives no moves, empty text zero moves', () => {
	const f = textMoves('ES BEGINNT: [A] bei [@B].\n\nirgendwas', WITH_NAME, 'de');
	assert.deepEqual(f.moves, []);
	assert.equal(f.line, 3);
	assert.match(f.errors[0], /^Zeile 3:/);
	assert.deepEqual(textMoves('', WITH_NAME, 'de'), { moves: [], number: 0, errors: [] });
	assert.deepEqual(checkText('  \n\n', 'de'), { number: 0, errors: [] });
	// Error without a specific line ("was zuerst passiert" without a heading): no number.
	const z = checkText('ES BEGINNT: [A] bei [@B].\nWAS ZUERST PASSIERT:', 'de');
	assert.equal(z.errors.length, 1);
	assert.equal(z.line, undefined);
});

test('Text AK4: the process name comes from the old start move, without an old start it stays empty', () => {
	const text = 'ES BEGINNT: [A] bei [@B].\nB soll C.';
	const withWord = textMoves(text, WITH_NAME, 'de');
	assert.equal((withWord.moves[0] as Extract<Move, { move: 'start' }>).process, 'Rechnungseingang');
	const without = textMoves(text, [], 'de');
	assert.equal((without.moves[0] as Extract<Move, { move: 'start' }>).process, undefined);
	// The old state is not changed.
	assert.equal((WITH_NAME[0] as Extract<Move, { move: 'start' }>).process, 'Rechnungseingang');
});

test('Text AK5: the coloured layer contains every line character for character', () => {
	const lines = [
		'ES BEGINNT: [Rechnung geht ein] bei [@Buchhaltung].',
		'    [@Buchhaltung] soll [Rechnung prüfen] in [#SAP] mit [+Rechnung], Frist [!3 Tage].',
		'\tWENN [?Betrag über 5000 €]',
		'ENDE: [<img src=x onerror=alert(1)>].',
		'Buchhaltung soll 🧾 buchen.',
		'x'.repeat(300),
		'',
		'[offen',
	];
	for (const z of lines) assert.equal(textParts(z).map((t) => t.text).join(''), z);
	const t = textParts('  WENN [?Frage] und [#SAP]');
	assert.deepEqual(t.map((x) => x.subtype), ['text', 'sw', 'text', 'o', 'text', 'o']);
	assert.equal(t[3].object, 'question');
	assert.equal(t[3].text, '[?Frage]');
	assert.equal(t[5].object, 'system');
});

test('Text: writing aid in the diagram language, its patterns can be read back', () => {
	assert.equal(helpPattern('de').length, 9);
	assert.match(helpPattern('de')[0], /^ES BEGINNT:/);
	assert.match(helpPattern('en')[0], /^IT STARTS:/);
	for (const s of ['de', 'en'] as const) assert.deepEqual(checkText(helpPattern(s)[0], s).errors, []);
});

// Round 1: checking while typing in the worker, so long texts do not stall the page.
function attrappe() {
	const sent: { num: number; text: string; language: string }[] = [];
	let finished = false;
	const w: CheckerWorker = {
		postMessage: (m) => { sent.push(m); },
		terminate: () => { finished = true; },
		onmessage: null,
		onerror: null,
	};
	// Answer like the real worker (textChecker.worker.ts).
	const answer = (i: number) => w.onmessage!({ data: { num: sent[i].num, result: textMoves(sent[i].text, [], 'de') } });
	return { w, sent, answer, finished: () => finished };
}

test('Text worker: checking runs in the worker, answers find their text even in the wrong order', async () => {
	const a = attrappe();
	const p = textChecker('de', () => a.w);
	assert.equal(p.inWorker, true);
	const one = p.check('ES BEGINNT: [A] bei [@B].');
	const two = p.check('ES BEGINNT: [A] bei [@B].\nQuatsch');
	// Nothing computed on the main thread: both texts went to the worker, the promises are pending.
	assert.deepEqual(a.sent.map((m) => m.text.split('\n').length), [1, 2]);
	let done = false;
	void one.then(() => { done = true; });
	await Promise.resolve();
	assert.equal(done, false);
	a.answer(1);
	a.answer(0);
	assert.equal((await one).number, 1);
	const z = await two;
	assert.equal(z.line, 2);
	assert.deepEqual(z.moves, []);
	p.end();
	assert.equal(a.finished(), true);
});

test('Text worker: if it fails or does not start, the page computes it itself', async () => {
	const a = attrappe();
	const p = textChecker('de', () => a.w);
	const open = p.check('ES BEGINNT: [A] bei [@B].\n[@B] soll [C].');
	a.w.onerror!(new Error('broken'));
	assert.equal((await open).number, 2);
	assert.equal(p.inWorker, false);
	assert.equal((await p.check('ES BEGINNT: [A] bei [@B].')).number, 1);
	const without = textChecker('de', () => { throw new Error('CSP'); });
	assert.equal(without.inWorker, false);
	assert.equal((await without.check('Quatsch')).line, 1);
	assert.equal((await textChecker('en').check('IT STARTS: [A] at [@B].')).number, 1);
});

test('Text: withProcess sets the old name without changing the checker\'s moves', () => {
	const added = textMoves('ES BEGINNT: [A] bei [@B].', [], 'de').moves;
	const m = withProcess(added, WITH_NAME);
	assert.equal((m[0] as Extract<Move, { move: 'start' }>).process, 'Rechnungseingang');
	assert.equal((added[0] as Extract<Move, { move: 'start' }>).process, undefined);
	assert.equal(withProcess(added, []), added);
});

test('376 AK1 outputs: finished story as PDF (2+ pages) and SVG without ENTWURF and without mark', async () => {
	const { PDFDocument } = await import('pdf-lib');
	const a = await outputs(README, 'de');
	assert.equal(a.draft, false);
	assert.equal(Buffer.from(a.pdf.slice(0, 5)).toString(), '%PDF-');
	assert.ok((await PDFDocument.load(a.pdf)).getPageCount() >= 2);
	assert.match(a.svg, /^<svg /);
	assert.doesNotMatch(a.svg, /ENTWURF/);
	assert.doesNotMatch(a.svg, /class="hier"/);
	// the preview of the same state is equal except for the mark
	assert.equal((await replay(README, 'de')).readingCopy, true);
});

test('376 AK1 outputs: a state without a reading copy carries ENTWURF, without a diagram an error', async () => {
	const a = await outputs(LOOP, 'de');
	assert.equal(a.draft, true);
	assert.match(a.svg, /ENTWURF/);
	assert.equal(Buffer.from(a.pdf.slice(0, 5)).toString(), '%PDF-');
	await assert.rejects(outputs([], 'de'));
});

test('376 risk: markup and umlauts in the process name stay escaped, the PDF is produced', async () => {
	const z: Move[] = [{ ...README[0], process: 'Prüfung <script>alert(1)</script> & 😀' } as Move, ...README.slice(1)];
	const a = await outputs(z, 'de');
	assert.doesNotMatch(a.svg, /<script/);
	assert.equal(Buffer.from(a.pdf.slice(0, 5)).toString(), '%PDF-');
	assert.equal(outputName(null, 'a/b\\c', 'svg'), 'a b c.svg');
});

test('376 AK2 outputName: name of the open file, otherwise a suggestion from the process', () => {
	assert.equal(outputName({ name: 'Rechnung.BPMN' }, 'x', 'pdf'), 'Rechnung.pdf');
	assert.equal(outputName({ name: 'Ablauf.bpmn' }, undefined, 'svg'), 'Ablauf.svg');
	assert.equal(outputName(null, 'Bestellung / neu', 'svg'), 'Bestellung neu.svg');
	assert.equal(outputName(undefined, undefined, 'pdf'), 'process.pdf');
});

test('376 confirmation after publishing shows special characters in the path unchanged', async () => {
	// texte.js is JS without types: loaded via a path as a string
	const texts: string = '../../src/texts.js';
	const { storedText } = await import(texts) as { storedText: (p?: string) => string };
	assert.equal(storedText('/Processes/Einkauf & Lager <alt> "x".pdf'), 'Reading copy filed: Processes/Einkauf & Lager <alt> "x".pdf');
	assert.equal(storedText(undefined), 'Reading copy filed: ');
});

test('376 confirmation does not go through DOMPurify (in the browser: & becomes &amp;, <…> is dropped)', async () => {
	// In Node DOMPurify has no window and no sanitize(); here it is reproduced as in the
	// browser (tags removed, & escaped). t() reads DOMPurify.sanitize on every call.
	const { default: DOMPurify } = await import('dompurify');
	const purify = DOMPurify as unknown as { sanitize?: (html: string) => string };
	const previously = purify.sanitize;
	const calls: string[] = [];
	purify.sanitize = (html: string) => {
		calls.push(html);
		return html.replace(/<[^>]*>/g, '').replace(/&/g, '&amp;');
	};
	try {
		const texts: string = '../../src/texts.js';
		const { storedText } = await import(texts) as { storedText: (p?: string) => string };
		assert.equal(storedText('/P/Einkauf & Lager <tablet>.pdf'), 'Reading copy filed: P/Einkauf & Lager <tablet>.pdf');
		assert.deepEqual(calls, []);
	} finally {
		purify.sanitize = previously;
	}
});

test('377 AK2 language switch: the same moves in German and English, typed text stays', async () => {
	const moves = README.slice(0, 2);
	const de = workbench('de');
	const en = workbench('en');
	assert.equal((await de.set(moves)).ok, true);
	assert.equal((await en.set(moves)).ok, true);
	assert.match(textFrom(de.view!.storyText), /^ES BEGINNT/);
	assert.match(textFrom(en.view!.storyText), /^IT STARTS/);
	assert.match(en.view!.svg, /DRAFT/);
	assert.match(de.view!.svg, /ENTWURF/);
	assert.match(en.view!.svg, /Rechnung prüfen/);
	assert.deepEqual(en.view!.moves, moves);
	assert.match(en.view!.xml ?? '', /xml:lang="en"/);
});

test('377 AK3 a file saved in English opens in English, even with a German account language', async () => {
	const en = workbench('en');
	await en.set(README);
	const g = await loadStory(en.view!.xml!, 'de');
	assert.ok(!('errors' in g));
	assert.equal(g.language, 'en');
	assert.deepEqual(g.moves, README);
});

test('377 AK4 unsaved: a different language counts only for a told story', () => {
	assert.equal(unsaved(README, README, 'en', 'de'), true);
	assert.equal(unsaved(README, README, 'de', 'de'), false);
	assert.equal(unsaved([], [], 'en', 'de'), false);
	assert.equal(unsaved(README, README), false);
	assert.equal(unsaved(README, README.slice(0, -1), 'de', 'de'), true);
});

test('379 round 1: every object kind of the story text has its colour class and its name in the colour key', () => {
	const css = readFileSync('src/workshop.css', 'utf8');
	const texts = readFileSync('src/texts.js', 'utf8');
	const key = texts.slice(texts.indexOf('export const objectText'));
	const keyNames = [...key.slice(0, key.indexOf('})')).matchAll(/^\t(\w+): t\(/gm)].map((m) => m[1]);
	const kinds = [lineParts('[Step]'), lineParts('[@Role]'), lineParts('[#System]'), lineParts('[+Delivery note]'), lineParts('[!3 days]'), lineParts('[?Approved]')]
		.map((p) => p[0].object!);
	assert.deepEqual(kinds, ['task', 'role', 'system', 'document', 'deadline', 'question']);
	for (const k of kinds) {
		assert.match(css, new RegExp(`\\.o-${k} \\{ background: var\\(--o-${k}\\)`), k);
		assert.equal((css.match(new RegExp(`--o-${k}:`, 'g')) ?? []).length, 3, `--o-${k} in light, dark and dark media`);
		assert.ok(keyNames.includes(k), `${k} in objectText`);
	}
	assert.deepEqual([...keyNames].sort(), [...kinds].sort());
	for (const part of textParts('[+Delivery note]')) if (part.subtype === 'o') assert.equal(part.object, 'document');
});
