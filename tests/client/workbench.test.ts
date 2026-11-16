import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tell } from '../../src/core/index.js';
import type { Move } from '../../src/core/index.js';
import {
	replay, change, append, replace, before, remove, undo, switchTo,
	lineActions, ranks, fields, prefill, requiredEmpty, moveFromForm, targetsUntil,
	digitKey, lineParts, workbench, keepPath, keptPath, dropPath, droppedPath, reopen, diagramLanguage, type View,
	loadStory, fileXml, fileSuggestion, unsaved, outputs, outputName, saveThenPublish, type SaveResult,
	textFrom, textMoves, checkText, textParts, helpPattern, textChecker, withProcess, sameStory, type CheckerWorker,
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
	assert.deepEqual(lineActions(README[0], 0), ['edit', 'addTrigger']);
	assert.deepEqual(lineActions(README[1], 1), ['edit', 'before', 'addException', 'remove', 'subprocess']);
	assert.deepEqual(lineActions(README[2], 2), ['edit', 'before', 'addPath', 'keep:0', 'keep:1']);
	assert.deepEqual(lineActions({ move: 'merge' }, 4), ['before', 'reopen']);
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

// "Done" without a change is no change (job 412)
for (const language of ['de', 'en'] as const)
	test(`Job 412 AK1 (${language}): the unchanged text, with empty lines and trailing spaces, is the same story; a changed step is not`, () => {
		for (const old of [WITH_NAME, LOOP]) {
			const start = textFrom(tell(old, language).storyText);
			const startMoves = textMoves(start, old, language).moves;
			const same = (text: string) => {
				const r = textMoves(text, old, language);
				assert.deepEqual(r.errors, []);
				return sameStory(r.moves, startMoves, old);
			};
			assert.equal(same(start), true);
			assert.equal(same(`\n${start.split('\n').map((l) => l + '   ').join('\n\n')}\n\n`), true);
			assert.equal(same(start.replace(language === 'de' ? 'Rechnung prüfen' : /\[[^\]@#]+\]\.\n/, language === 'de' ? 'Rechnung lesen' : '[read it].\n')), false);
		}
	});

test('Job 412 AK2: without the start moves the moves when opened count; the empty kinds written out make them differ', () => {
	assert.equal(sameStory(WITH_NAME, undefined, WITH_NAME), true);
	assert.equal(sameStory(LOOP, undefined, WITH_NAME), false);
	assert.equal(sameStory(LOOP, WITH_NAME, WITH_NAME), false);
	// Read back, the core writes out '' kinds the stored moves lack: only the start moves catch that.
	const r = textMoves(textFrom(tell(WITH_NAME, 'de').storyText), WITH_NAME, 'de').moves;
	assert.equal(sameStory(r, undefined, WITH_NAME), false);
	assert.equal(sameStory(r, r, WITH_NAME), true);
});

test('Job 412 risk: on a subprocess level the moves of that level compare the same way', () => {
	const sub: Move[] = [{ move: 'start', text: 'Teil beginnt', role: 'Buchhaltung' } as Move, { move: 'task', text: 'Belege sammeln', role: 'Buchhaltung' } as Move];
	const start = textFrom(tell(sub, 'de').storyText);
	const startMoves = textMoves(start, sub, 'de').moves;
	assert.equal(sameStory(textMoves(start + '\n\n', sub, 'de').moves, startMoves, sub), true);
	assert.equal(sameStory(textMoves(start.replace('Belege sammeln', 'Belege prüfen'), sub, 'de').moves, startMoves, sub), false);
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
	assert.equal(helpPattern('de').length, 11);
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
	const kinds = [lineParts('[Step]'), lineParts('[@Role]'), lineParts('[#System]'), lineParts('[+Delivery note]'), lineParts('[!3 days]'), lineParts('[?Approved]'), lineParts('WAIT FOR SIGNAL [Stop declared].'), lineParts('[@A] shall [B], FOR EACH [invoice item], IN SEQUENCE.').slice(-2)]
		.map((p) => p.find((x) => x.subtype === 'o')!.object!);
	assert.deepEqual(kinds, ['task', 'role', 'system', 'document', 'deadline', 'question', 'signal', 'item']);
	for (const k of kinds) {
		assert.match(css, new RegExp(`\\.o-${k} \\{ background: var\\(--o-${k}\\)`), k);
		assert.equal((css.match(new RegExp(`--o-${k}:`, 'g')) ?? []).length, 3, `--o-${k} in light, dark and dark media`);
		assert.ok(keyNames.includes(k), `${k} in objectText`);
	}
	assert.deepEqual([...keyNames].sort(), [...kinds].sort());
	for (const part of textParts('[+Delivery note]')) if (part.subtype === 'o') assert.equal(part.object, 'document');
});

test('380 AK1 outputs: an unfinished story with a diagram is a draft, a finished one is not', async () => {
	for (const n of [1, 2, README.length - 1]) {
		const a = await outputs(README.slice(0, n), 'de');
		assert.equal(a.draft, true, `${n} moves`);
		assert.match(a.svg, /ENTWURF/);
		assert.equal(Buffer.from(a.pdf.slice(0, 5)).toString(), '%PDF-');
	}
	const done = await outputs(README, 'de');
	assert.equal(done.draft, false);
	assert.doesNotMatch(done.svg, /ENTWURF/);
});

function steps(saveResult: SaveResult, published = true) {
	const calls: string[] = [];
	return {
		calls,
		save: async () => { calls.push('save'); return saveResult; },
		publish: async () => { calls.push('publish'); return published; },
	};
}

test('380 AK2 saveThenPublish: a saved state is published without saving, an unsaved one is saved first', async () => {
	const a = steps('saved');
	assert.equal(await saveThenPublish({ needsSave: false, ...a }), 'published');
	assert.deepEqual(a.calls, ['publish']);
	const b = steps('saved');
	assert.equal(await saveThenPublish({ needsSave: true, ...b }), 'published');
	assert.deepEqual(b.calls, ['save', 'publish']);
	const c = steps('saved', false);
	assert.equal(await saveThenPublish({ needsSave: true, ...c }), 'publishFailed');
});

test('380 AK3 saveThenPublish: conflict, failed or cancelled save publishes nothing', async () => {
	for (const r of ['conflict', 'failed', 'cancelled'] as const) {
		const a = steps(r);
		assert.equal(await saveThenPublish({ needsSave: true, ...a }), r);
		assert.deepEqual(a.calls, ['save']);
	}
});

test('383 AK1 preview without legend, PDF and SVG downloads with it; shapes carry move numbers', async () => {
	const a = await replay(README, 'de');
	assert.doesNotMatch(a.svg, />Legende</);
	assert.match(a.svg, /<g data-move="1" data-node="Start_\d+">/);
	assert.ok(a.bands.length >= 2);
	assert.ok(a.pool);
	const o = await outputs(README, 'de');
	assert.match(o.svg, />Legende</);
	assert.doesNotMatch(o.svg, /data-move/);
	const en = await replay(README, 'en');
	assert.doesNotMatch(en.svg, />Legend</);
});

test('386 AK1 the exception form names the kind "error" "Something goes wrong"', async () => {
	const texts: string = '../../src/texts.js';
	const { kindText } = await import(texts) as { kindText: () => Record<string, Record<string, string>> };
	assert.equal(kindText().exceptionPath.error, 'Something goes wrong');
	assert.equal('errors' in kindText().exceptionPath, false);
});

test('386 AK2 every choice of every form has a text (no raw value shown)', async () => {
	const texts: string = '../../src/texts.js';
	const { kindText } = await import(texts) as { kindText: () => Record<string, Record<string, string> | undefined> };
	const { fields } = await import('../../src/workbench.js');
	const a = kindText();
	const forms: [Parameters<typeof fields>[0], Record<string, string>][] = [
		['start', {}], ['wait', {}], ['decision', { subtype: '' }], ['decision', { subtype: 'first' }],
		['exceptionPath', { subtype: 'error' }], ['exceptionPath', { subtype: 'deadline' }],
		['end', { subtype: 'cancel' }], ['sendSignal', {}], ['task', {}], ['goTo', {}],
	];
	let checked = 0;
	for (const [move, values] of forms) {
		for (const f of fields(move, values, ['', 'message', 'signal', 'cancel'])) {
			if (f.subtype !== 'choice') continue;
			for (const value of f.values!) {
				// the same lookup as choiceText in MoveForm.vue
				const text = (f.key === 'subtype' ? a[move] : a[f.key])?.[value];
				assert.ok(typeof text === 'string' && text !== '' && text !== value, `${move}.${f.key}=${value || "''"} has no text`);
				checked++;
			}
		}
	}
	assert.ok(checked >= 20, `only ${checked} choices checked`);
});

test('389 AK7 form of a decision with further paths: fields, prefill, missing, move', async () => {
	const { addPath, removePath, pathCount, hasFields } = await import('../../src/workbench.js');
	let v = prefill('decision', {}, 'de');
	v = addPath('decision', addPath('decision', v));
	assert.deepEqual(fields('decision', v).map((f) => f.key), ['subtype', 'question', 'yes', 'more0', 'more1', 'no']);
	assert.equal(pathCount('decision', v), 4);
	Object.assign(v, { question: 'Betrag?', yes: 'klein', more0: ' mittel ', more1: '' });
	assert.deepEqual(requiredEmpty('decision', v), ['more1']);
	v.more1 = 'groß';
	v.no = 'sehr groß';
	assert.deepEqual(moveFromForm('decision', v), { move: 'decision', subtype: '', question: 'Betrag?', yes: 'klein', more: ['mittel', 'groß'], no: 'sehr groß' });
	// Removing the first further path moves the second up.
	const r = removePath('decision', v, 0);
	assert.deepEqual([r.more0, 'more1' in r], ['groß', false]);
	// Editing: a stored move fills the fields again.
	const again = prefill('decision', { move: 'decision', question: 'Betrag?', yes: 'klein', more: ['mittel'], no: 'groß' } as never, 'de');
	assert.deepEqual([again.more0, 'more' in again], ['mittel', false]);
	assert.deepEqual((moveFromForm('decision', again) as { more?: string[] }).more, ['mittel']);
	// Without further paths the move is as before.
	assert.equal('more' in moveFromForm('decision', prefill('decision', { question: 'x?' }, 'de')), false);
	// In parallel now has a form: the number of branches.
	assert.equal(hasFields('concurrent'), true);
	assert.deepEqual(moveFromForm('concurrent', {}), { move: 'concurrent' });
	const c = addPath('concurrent', prefill('concurrent', {}, 'de'));
	assert.deepEqual(moveFromForm('concurrent', c), { move: 'concurrent', branches: 3 });
	assert.deepEqual(moveFromForm('concurrent', removePath('concurrent', c, 2)), { move: 'concurrent' });
	assert.equal(prefill('concurrent', { move: 'concurrent', branches: 4 } as never, 'de').branches, '4');
	assert.deepEqual(lineActions({ move: 'concurrent' }, 1), ['edit', 'before', 'addPath', 'keep:0', 'keep:1']);
});

test('389 AK7 what comes first: each further path with its kind, signal names suggested', async () => {
	const { addPath, signalFields } = await import('../../src/workbench.js');
	const v = addPath('decision', prefill('decision', { subtype: 'first' }, 'de'));
	assert.deepEqual(fields('decision', v).map((f) => f.key), ['subtype', 'yes', 'yesKind', 'more0', 'more0Kind', 'no', 'noKind']);
	Object.assign(v, { yes: 'Zahlung', more0: 'Stopp', more0Kind: 'signal', no: '14 Tage', noKind: 'time' });
	assert.deepEqual(signalFields('decision', v), ['more0']);
	const z = moveFromForm('decision', v);
	assert.deepEqual(z, { move: 'decision', subtype: 'first', yes: 'Zahlung', yesKind: 'message', more: ['Stopp'], moreKinds: ['signal'], no: '14 Tage', noKind: 'time' });
	assert.deepEqual(tell([{ move: 'start', text: 's', role: 'A' }, z]).errors, []);
	// At most 20 paths.
	let w = prefill('decision', {}, 'de');
	for (let i = 0; i < 30; i++) w = addPath('decision', w);
	assert.equal(fields('decision', w).filter((f) => f.key.startsWith('more')).length, 18);
});

test('389 round 1: switching the kind of a decision keeps the number of paths', async () => {
	const { switchKind, pathCount } = await import('../../src/workbench.js');
	const told = { move: 'decision', question: 'Betrag?', yes: 'klein', more: ['mittel'], no: 'groß' } as never;
	const v = prefill('decision', told, 'de');
	v.subtype = 'first';
	const first = switchKind(v, 'de');
	assert.equal(pathCount('decision', first), 3);
	assert.deepEqual(fields('decision', first).map((f) => f.key), ['subtype', 'yes', 'yesKind', 'more0', 'more0Kind', 'no', 'noKind']);
	assert.deepEqual([first.yes, first.more0, first.more0Kind], ['', '', 'message']);
	first.subtype = '';
	const back = switchKind(first, 'de');
	assert.deepEqual(fields('decision', back).map((f) => f.key), ['subtype', 'question', 'yes', 'more0', 'no']);
	assert.equal('more0Kind' in back, false);
	// The moves told after it stay in their paths: three paths before and after the switch.
	Object.assign(first, { yes: 'Zahlung', more0: 'Mahnung', no: '14 Tage' });
	const moves: Move[] = [{ move: 'start', text: 's', role: 'A' }, moveFromForm('decision', first), { move: 'end', text: 'a' }, { move: 'task', text: 'B1', role: 'A' }];
	assert.equal(tell(moves).open.length, 1);
});

// Job 393: deleting a branch, keeping one path; undo goes back one change.

test('393 AK9 lineActions offer one keep per path, the exception only its deletion', () => {
	assert.deepEqual(lineActions({ move: 'decision', question: 'q', yes: 'a', more: ['b'], no: 'c' }, 2), ['edit', 'before', 'addPath', 'keep:0', 'keep:1', 'keep:2', 'drop:0', 'drop:1']);
	assert.deepEqual(lineActions({ move: 'concurrent', branches: 4 }, 2), ['edit', 'before', 'addPath', 'keep:0', 'keep:1', 'keep:2', 'keep:3', 'drop:0', 'drop:1', 'drop:2', 'drop:3']);
	assert.deepEqual(lineActions({ move: 'concurrent' }, 2, true), ['edit', 'before', 'addPath', 'keep:0', 'keep:1']);
	assert.deepEqual(lineActions({ move: 'exceptionPath', text: 'x' }, 2), ['edit', 'before', 'keep:1']);
	assert.deepEqual(lineActions({ move: 'decision', subtype: 'first', yes: 'a', no: 'b' }, 1, true), ['edit', 'before', 'addPath', 'keep:0', 'keep:1']);
	assert.equal(keptPath('keep:12'), 12);
	assert.equal(keptPath('remove'), null);
	assert.equal(keptPath('keep:'), null);
});

test('393 AK9 button texts name the path as in the story', async () => {
	const texts: string = '../../src/texts.js';
	const { keepText } = await import(texts) as { keepText: (z: Move, j: number, language: string) => string };
	assert.equal(keepText({ move: 'decision', question: 'q', yes: 'ja', more: ['vielleicht'], no: 'nein' }, 1, 'de'), 'Keep only “vielleicht”');
	assert.equal(keepText({ move: 'decision', subtype: 'first', yes: 'Zahlung', no: '14 Tage' }, 1, 'de'), 'Keep only “14 Tage”');
	assert.equal(keepText({ move: 'concurrent', branches: 3 }, 2, 'de'), 'Keep only “dritter Strang”');
	assert.equal(keepText({ move: 'concurrent' }, 0, 'en'), 'Keep only “first branch”');
	assert.equal(keepText({ move: 'exceptionPath', text: 'x' }, 1, 'de'), 'Delete exception path');
});

test('393 AK10 deleting a branch keeps one path, undo brings the deleted path back', async () => {
	const w = workbench('de');
	assert.equal(w.canUndo, false);
	assert.equal((await w.set(README.slice(0, 2))).ok, true);
	assert.equal(w.canUndo, false, 'the empty state before the first move is not kept');
	assert.equal((await w.set(README)).ok, true);
	const r = keepPath(w.moves, 2, 1, 'de');
	assert.ok('moves' in r);
	assert.equal((await w.set(r.moves)).ok, true);
	assert.deepEqual(w.moves, [README[0], README[1], README[6]]);
	assert.equal((await w.undo()).ok, true);
	assert.deepEqual(w.moves, README);
	assert.equal((await w.undo()).ok, true);
	assert.deepEqual(w.moves, README.slice(0, 2));
	assert.equal(w.canUndo, false);
	// No earlier state left: nothing changes (job 409).
	assert.equal((await w.undo()).ok, true);
	assert.deepEqual(w.moves, README.slice(0, 2));
});

test('393 AK8 AK10 on a subprocess level: deleting a branch changes only that flow, undo restores the whole state', async () => {
	const inner: Move[] = [
		{ move: 'decision', question: 'Vollständig?', yes: 'ja', more: ['teils'], no: 'nein' },
		{ move: 'task', text: 'Buchen', role: 'Buchhaltung' }, { move: 'merge' },
		{ move: 'task', text: 'Teilbuchen', role: 'Buchhaltung' }, { move: 'merge' },
		{ move: 'task', text: 'Nachfordern', role: 'Buchhaltung' }, { move: 'merge' },
		{ move: 'end', text: 'Geprüft' },
	];
	const all: Move[] = [README[0], { ...README[1], subprocess: inner } as Move, { move: 'end', text: 'Bezahlt' }];
	const w = workbench('de');
	assert.equal((await w.set(all)).ok, true);
	assert.equal((await w.show(1)).ok, true);
	const r = keepPath(w.view!.levelMoves, 0, 2, 'de', { inner: { name: 'Rechnung prüfen' } });
	assert.ok('moves' in r, 'error' in r ? r.error : '');
	assert.equal((await w.setLevel(r.moves)).ok, true);
	assert.deepEqual(w.moves[0], all[0]);
	assert.deepEqual(w.moves[2], all[2]);
	assert.deepEqual((w.moves[1] as { subprocess: Move[] }).subprocess, [inner[5], inner[7]]);
	assert.equal(w.view!.level, 1, 'the level stays');
	assert.equal((await w.undo()).ok, true);
	assert.deepEqual(w.moves, all);
	assert.equal(w.view!.level, 1);
});

test('409 AK1 without history undo changes nothing, also on a subprocess level', async () => {
	const all: Move[] = [README[0], { ...README[1], subprocess: [{ move: 'task', text: 'A', role: 'x' }] } as Move];
	const w = workbench('de');
	assert.equal((await w.set(all)).ok, true);
	assert.equal(w.canUndo, false);
	await w.show(1);
	assert.deepEqual(await w.undo(), { ok: true });
	assert.deepEqual(w.moves, all);
	assert.equal(w.view!.level, 1);
	await w.show();
	assert.deepEqual(await w.undo(), { ok: true });
	assert.deepEqual(w.moves, all);
});

test('393 AK8 AK10 in the flow of something at any time: only that flow changes, undo restores all', async () => {
	const flow: Move[] = [
		{ move: 'decision', question: 'Bezahlt?', yes: 'ja', no: 'nein' },
		{ move: 'task', text: 'Erstatten', role: 'Buchhaltung' }, { move: 'merge' }, { move: 'merge' },
		{ move: 'end', text: 'Storniert' },
	];
	const all: Move[] = [README[0], README[1], { move: 'end', text: 'Bezahlt' }, { move: 'anytime', text: 'Storno', subtype: 'message', subprocess: flow }];
	const w = workbench('de');
	assert.equal((await w.set(all)).ok, true);
	assert.equal((await w.show(3)).ok, true);
	const sub = w.view!.sub!;
	assert.ok(sub.trigger, 'the level of something at any time');
	const r = keepPath(w.view!.levelMoves, 0, 1, 'de', { inner: { name: sub.name, trigger: sub.trigger } });
	assert.ok('moves' in r, 'error' in r ? r.error : '');
	assert.equal((await w.setLevel(r.moves)).ok, true);
	assert.deepEqual(w.moves.slice(0, 3), all.slice(0, 3));
	assert.deepEqual((w.moves[3] as { subprocess: Move[] }).subprocess, [flow[4]]);
	assert.equal(w.view!.level, 3);
	assert.equal((await w.undo()).ok, true);
	assert.deepEqual(w.moves, all);
	assert.equal(w.view!.level, 3);
});

// Job 395: a path added after the story went on.
const LATER: Move[] = [README[0], README[1], README[2], README[3], { move: 'merge' }, { move: 'merge' }, { move: 'task', text: 'Zahlen', role: 'Buchhaltung' }, { move: 'end', text: 'Bezahlt' }];

test('395 AK8 lineActions: add a path on both kinds of decision and in parallel, a path still open is told', async () => {
	const { MAX_PATHS } = await import('../../src/core/index.js');
	assert.ok(lineActions(README[2], 2).includes('addPath'));
	assert.ok(lineActions({ move: 'decision', subtype: 'first', yes: 'a', no: 'b' }, 2).includes('addPath'));
	assert.ok(lineActions({ move: 'concurrent' }, 2).includes('addPath'));
	assert.ok(!lineActions({ move: 'exceptionPath', text: 'x' }, 2).includes('addPath'));
	assert.ok(!lineActions(README[1], 1).includes('addPath'));
	assert.ok(!lineActions({ move: 'concurrent', branches: MAX_PATHS }, 2).includes('addPath'));
	assert.deepEqual(lineActions({ move: 'openPath' }, 5), ['tell', 'before']);
	assert.deepEqual(lineActions({ move: 'openPath' }, 5, true), ['tell', 'before']);
});

test('395 AK8 form: the new path of what comes first is the last one after the story went on', async () => {
	const { addPath, withNewPath, prefill: pre } = await import('../../src/workbench.js');
	const v = pre('decision', { subtype: 'first', yes: 'Zahlung', yesKind: 'message', no: 'Frist', noKind: 'time' }, 'de');
	const w = addPath('decision', v, true);
	assert.equal(w.more0, 'Frist');
	assert.equal(w.more0Kind, 'time');
	assert.equal(w.no, '');
	assert.equal(addPath('decision', v).more0, '');
	assert.equal(addPath('decision', v).no, 'Frist');
	const n = withNewPath(README[2]);
	assert.deepEqual(n.start, { ...README[2], more: [''] });
	assert.equal(n.focus, 'more0');
	const f = withNewPath({ move: 'decision', subtype: 'first', yes: 'a', no: 'b', noKind: 'signal' });
	assert.deepEqual(f.start, { move: 'decision', subtype: 'first', yes: 'a', more: ['b'], moreKinds: ['signal'], no: '', noKind: 'message' });
	assert.equal(f.focus, 'no');
	assert.deepEqual(withNewPath({ move: 'concurrent' }).start, { move: 'concurrent', branches: 3 });
});

test('395 AK2 AK5 changeLine adds the path still open, tellHere tells it, hereState and openPaths show it', async () => {
	const { changeLine, tellHere, hereState, openPaths } = await import('../../src/workbench.js');
	const r = changeLine(LATER, 2, { ...README[2], more: ['unklar'] } as Move, 'de');
	assert.ok('moves' in r, 'error' in r ? r.error : '');
	const at = r.moves.findIndex((m) => m.move === 'openPath');
	assert.equal(at, 5);
	assert.deepEqual(openPaths(r.moves, 'de'), [{ index: 5, path: '„Betrag über 5000 €?“ → unklar' }]);
	const here = hereState(r.moves, at, 'de');
	assert.equal(here.path, '„Betrag über 5000 €?“ → unklar');
	assert.ok(here.options.includes('merge') && !here.options.includes('anytime') && !here.options.includes('switchTo'));
	const t = tellHere(r.moves, at, { move: 'task', text: 'Klären', role: 'Buchhaltung' }, 'de');
	assert.ok('moves' in t);
	assert.equal(t.at, at + 1);
	const m = tellHere(t.moves, t.at!, { move: 'merge' }, 'de');
	assert.ok('moves' in m);
	assert.equal(m.at, null);
	assert.deepEqual(openPaths(m.moves, 'de'), []);
	// The last line: replaced as it is, no path still open.
	assert.deepEqual(changeLine([README[0], README[2]], 1, { ...README[2], more: ['x'] } as Move, 'de'), { moves: [README[0], { ...README[2], more: ['x'] }] });
});

test('395 AK6 the working file keeps a path still open', async () => {
	const { changeLine, fileXml: xmlOf } = await import('../../src/workbench.js');
	const r = changeLine(LATER, 2, { ...README[2], more: ['unklar'] } as Move, 'de');
	assert.ok('moves' in r);
	const xml = await xmlOf(r.moves, 'de');
	const g = await loadStory(xml!, 'de');
	assert.ok('moves' in g);
	assert.deepEqual(g.moves, r.moves);
	assert.equal(g.changed, false);
});

test('395 AK7 on a subprocess level only that flow changes, undo brings it back', async () => {
	const { changeLine } = await import('../../src/workbench.js');
	const flow: Move[] = [
		{ move: 'decision', question: 'Vollständig?', yes: 'ja', no: 'nein' },
		{ move: 'end', text: 'Gut' }, { move: 'end', text: 'Schlecht' },
	];
	const all: Move[] = [README[0], { ...README[1], subprocess: flow } as Move, { move: 'end', text: 'Bezahlt' }];
	const w = workbench('de');
	assert.equal((await w.set(all)).ok, true);
	assert.equal((await w.show(1)).ok, true);
	const r = changeLine(w.view!.levelMoves, 0, { ...flow[0], more: ['teils'] } as Move, 'de', { inner: { name: w.view!.sub!.name } });
	assert.ok('moves' in r, 'error' in r ? r.error : '');
	assert.equal((await w.setLevel(r.moves)).ok, true);
	assert.deepEqual(w.moves[0], all[0]);
	assert.deepEqual(w.moves[2], all[2]);
	assert.deepEqual((w.moves[1] as { subprocess: Move[] }).subprocess, [{ ...flow[0], more: ['teils'] }, flow[1], { move: 'openPath' }, flow[2]]);
	assert.equal(w.view!.readingCopy, false);
	assert.equal((await w.undo()).ok, true);
	assert.deepEqual(w.moves, all);
});

test('395 round 2: a path still open is an open point of the head, not "fully told"', async () => {
	const { changeLine } = await import('../../src/workbench.js');
	const { pills } = await import('../../src/approval.js');
	const r = changeLine(LATER, 2, { ...README[2], more: ['unklar'] } as Move, 'de');
	assert.ok('moves' in r);
	const v = await replay(r.moves, 'de');
	assert.equal(v.complete, true);
	assert.equal(v.untold, 1);
	assert.equal(v.readingCopy, false);
	const kinds = pills({ approval: null, done: v.complete, issues: v.issues.length + v.untold, moves: v.moves, language: 'de', proposals: 0 }).map((p) => p.kind);
	assert.ok(!kinds.includes('done'));
	assert.ok(kinds.includes('open'));
	assert.equal((await replay(LATER, 'de')).untold, 0);
});

test('395 round 3: during "Tell here" a step before another line goes to that line, every other line action ends it', async () => {
	const { applyTarget, endsTelling, changeLine, tellHere } = await import('../../src/workbench.js');
	assert.equal(applyTarget('before', true), 'before');
	assert.equal(applyTarget('replace', true), 'replace');
	assert.equal(applyTarget('added', true), 'tellOpen');
	assert.equal(applyTarget('added', false), 'append');
	assert.equal(endsTelling('tell'), false);
	for (const a of ['edit', 'before', 'remove', 'subprocess', 'addPath', 'keep:0'] as const) assert.equal(endsTelling(a), true, a);
	// The step lands before the chosen line ("Zahlen"), not on the path still open.
	const r = changeLine(LATER, 2, { ...README[2], more: ['unklar'] } as Move, 'de');
	assert.ok('moves' in r);
	const zahlen = r.moves.findIndex((m) => m.move === 'task' && m.text === 'Zahlen');
	const step: Move = { move: 'task', text: 'Archivieren', role: 'Buchhaltung' };
	const out = before(r.moves, zahlen, step, 'de');
	assert.deepEqual(out[zahlen], step);
	assert.equal(out[zahlen - 1].move, 'merge');
	const wrong = tellHere(r.moves, r.moves.findIndex((m) => m.move === 'openPath'), step, 'de');
	assert.ok('moves' in wrong && JSON.stringify(wrong.moves) !== JSON.stringify(out));
});

// Job 398: deleting one path of a branch with three paths or more.
test('398 AK7 lineActions offer drop from three paths on, never the otherwise path of a check', async () => {
	const check: Move = { move: 'decision', question: 'q', yes: 'a', more: ['b'], no: 'c' };
	assert.deepEqual(lineActions(check, 2).filter((a) => a.startsWith('drop:')), ['drop:0', 'drop:1']);
	assert.deepEqual(lineActions(check, 2).slice(-5), ['keep:0', 'keep:1', 'keep:2', 'drop:0', 'drop:1']);
	assert.deepEqual(lineActions({ move: 'decision', subtype: 'first', yes: 'a', more: ['b'], no: 'c' }, 2, true).filter((a) => a.startsWith('drop:')), ['drop:0', 'drop:1', 'drop:2']);
	assert.deepEqual(lineActions({ move: 'concurrent', branches: 3 }, 2).filter((a) => a.startsWith('drop:')), ['drop:0', 'drop:1', 'drop:2']);
	assert.ok(!lineActions({ move: 'concurrent' }, 2).some((a) => a.startsWith('drop:')));
	assert.ok(!lineActions({ move: 'decision', question: 'q', yes: 'a', no: 'b' }, 2).some((a) => a.startsWith('drop:')));
	assert.ok(!lineActions({ move: 'exceptionPath', text: 'x' }, 2).some((a) => a.startsWith('drop:')));
	assert.ok(!lineActions({ move: 'task', text: 'x', role: 'y' }, 2).some((a) => a.startsWith('drop:')));
	assert.equal(droppedPath('drop:3'), 3);
	assert.equal(droppedPath('keep:3'), null);
	const { sheetActions } = await import('../../src/phoneView.js');
	assert.ok(sheetActions(check, 2, false, false).includes('drop:1'), 'also in the sheet on a phone');
	const texts: string = '../../src/texts.js';
	const { dropText } = await import(texts) as { dropText: (z: Move, j: number, language: string) => string };
	assert.equal(dropText(check, 1, 'de'), 'Delete this path: b');
	assert.equal(dropText({ move: 'decision', subtype: 'first', yes: 'Zahlung', more: ['Anruf'], no: '14 Tage' }, 2, 'de'), 'Delete this path: 14 Tage');
	assert.equal(dropText({ move: 'concurrent', branches: 3 }, 1, 'de'), 'Delete this path: zweiter Strang');
	assert.equal(dropText({ move: 'concurrent', branches: 3 }, 0, 'en'), 'Delete this path: first branch');
});

test('398 AK6 on a subprocess level and in the flow at any time: only that flow changes, undo restores all', async () => {
	const flow: Move[] = [
		{ move: 'decision', question: 'Vollständig?', yes: 'ja', more: ['teils'], no: 'nein' },
		{ move: 'task', text: 'Buchen', role: 'Buchhaltung' }, { move: 'merge' },
		{ move: 'task', text: 'Teilbuchen', role: 'Buchhaltung' }, { move: 'merge' },
		{ move: 'merge' },
		{ move: 'end', text: 'Geprüft' },
	];
	const all: Move[] = [README[0], { ...README[1], subprocess: flow } as Move, { move: 'end', text: 'Bezahlt' }, { move: 'anytime', text: 'Storno', subtype: 'message', subprocess: flow }];
	const w = workbench('de');
	assert.equal((await w.set(all)).ok, true);
	for (const level of [1, 3]) {
		assert.equal((await w.show(level)).ok, true);
		const sub = w.view!.sub!;
		const r = dropPath(w.view!.levelMoves, 0, 0, 'de', { inner: { name: sub.name, ...(sub.trigger && { trigger: sub.trigger }) } });
		assert.ok('moves' in r, 'error' in r ? r.error : '');
		assert.equal((await w.setLevel(r.moves)).ok, true);
		assert.deepEqual((w.moves[level] as { subprocess: Move[] }).subprocess, [{ move: 'decision', question: 'Vollständig?', yes: 'teils', no: 'nein' }, flow[3], flow[4], flow[5], flow[6]]);
		assert.deepEqual(w.moves.filter((_, j) => j !== level), all.filter((_, j) => j !== level));
		assert.equal(w.view!.level, level);
		assert.equal((await w.undo()).ok, true);
		assert.deepEqual(w.moves, all);
	}
});

test('400 AK7 lineActions: reopen on merge, "continue at" and end, also on an inner level', () => {
	for (const move of [{ move: 'merge' }, { move: 'goTo', target: 'Schritt_2' }, { move: 'end', text: 'Fertig' }] as Move[]) {
		assert.ok(lineActions(move, 4).includes('reopen'));
		assert.ok(lineActions(move, 0, true).includes('reopen'));
	}
	assert.deepEqual(lineActions({ move: 'end', text: 'Fertig' }, 4), ['edit', 'before', 'reopen']);
	for (const move of [README[1], README[2], { move: 'openPath' }, { move: 'openPath', joins: true }, { move: 'exceptionPath', text: 'x' }] as Move[])
		assert.ok(!lineActions(move, 4).includes('reopen'));
});

test('400 AK5 reopen through the workbench: main level, subprocess level, flow at any time; undo restores all', async () => {
	const flow: Move[] = [
		{ move: 'decision', question: 'Vollständig?', yes: 'ja', no: 'nein' },
		{ move: 'task', text: 'Buchen', role: 'Buchhaltung' }, { move: 'merge' },
		{ move: 'end', text: 'Abgelehnt' },
		{ move: 'end', text: 'Geprüft' },
	];
	const all: Move[] = [README[0], { ...README[1], subprocess: flow } as Move, ...README.slice(2), { move: 'anytime', text: 'Storno', subtype: 'message', subprocess: flow }];
	const w = workbench('de');
	assert.equal((await w.set(all)).ok, true);
	// Main level: the merge of the yes path (the no path merges too) is open again.
	const main = reopen(all, 4, 'de');
	assert.ok('moves' in main, 'error' in main ? main.error : '');
	assert.equal((await w.set(main.moves)).ok, true);
	assert.deepEqual(w.moves[4], { move: 'openPath' });
	assert.ok(w.view!.untold >= 1, 'zählt als offen');
	assert.equal((await w.undo()).ok, true);
	assert.deepEqual(w.moves, all);
	for (const level of [1, all.length - 1]) {
		assert.equal((await w.show(level)).ok, true);
		const sub = w.view!.sub!;
		const r = reopen(w.view!.levelMoves, 2, 'de', { inner: { name: sub.name, ...(sub.trigger && { trigger: sub.trigger }) } });
		assert.ok('moves' in r, 'error' in r ? r.error : '');
		assert.equal((await w.setLevel(r.moves)).ok, true);
		assert.deepEqual((w.moves[level] as { subprocess: Move[] }).subprocess, [flow[0], flow[1], { move: 'openPath', joins: true }, flow[3], flow[4]]);
		assert.deepEqual(w.moves.filter((_, j) => j !== level), all.filter((_, j) => j !== level));
		assert.equal((await w.undo()).ok, true);
		assert.deepEqual(w.moves, all);
	}
});

test('400 AK6 a working file with a reopened merge saves and opens with the same moves', async () => {
	const moves: Move[] = [README[0], README[2], README[3], { move: 'openPath', joins: true }, { move: 'end', text: 'Abgelehnt' }, { move: 'end', text: 'Bezahlt' }];
	assert.deepEqual(tell(moves, 'de').errors, []);
	const xml = await fileXml(moves, 'de', null);
	const back = await loadStory(xml!, 'de');
	assert.ok(!('errors' in back), JSON.stringify(back));
	assert.deepEqual(back.moves, moves);
});
