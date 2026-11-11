// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import ts from 'typescript';

// Job 379: the public repository is English. File names, identifiers and comments of the code carry no
// German; strings are not checked (the diagram language, the story text keywords, the German UI
// translation and the stored story format are German on purpose). Quoted text in comments
// (`…`, "…", “…”, „…“) may name a German term.

const GERMAN = new Set(`
aktiv antrag nr druck dok fokus gefahr hoch lager mahnung matt mein ohr platzhalter quer rechnung stark urlaub warnfeld
aber abbrechen abgelehnt ablauf abstand adresse aendern aktion alle allein alles ander andere anfang angenommen ansicht anzahl arbeitsdatei auch ausgabe ausnahme auswahl
bahn bahnen baustein bedingung beendet behalten beispiel bereit beschreibung beschriftung bestaetigung bewerbung blatt boese bombe breite buendel
dann darf das dass datei dateien daten dauern davor dazwischen dem den der des diagramm diagramme dich dies diese dieser dokument dokumente doppel dort drei dritte durch
eine einen einem einer eines eintrag eintraege eintritt ende endung entscheidung entwurf ereignis ergebnis erklaerung erst erste erster erzaehle erzaehlt erzaehltext es etwas
faden faeden falls geschichte geschichten farbe fehler fehlt feld felder fertig frage fremd frist fuer geaendert geht gespeichert gibt gleich gleichzeitig grund gueltig
haeufig halb haupt hier hilfe hinweis einpassen leise markiert scharf selten tief hoehe immer ist jede jeder jetzt kann kasten kein keine klaerfall knoepfe knopf knoten kopf
laden laeuft leer legende lesbarkeit leseexemplar liegt linie linien liste
mehr meldung meldungen muss nach nachricht nein neu neue nicht nichts noch nur oben oder offen ohne optionen permutationen
prozess pruefe pruefen quelle raenge rand rang reihe richtung schritt schritte segmente seite seiten sein sich sie sind sobald soll sonst spalten speichern sprache stand stelle stellen strang
teil teile tiefe titel ueber um und unten unter varianten veraltet verstanden verzweigt viele vom von vor vorher waehle wann warten weg wege weil weiter wenn werden werkbank werkstatt wert werte wie wieder wird wo
zeile zeilen zeit zeitpunkt ziel ziele zu zuege zuerst zug zum zur zurueck zusammen zustand zwei zweite zwischen
`.split(/\s+/).filter(Boolean));
const GERMANISH = /[äöüÄÖÜß]/;

const words = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[^A-Za-zÄÖÜäöüß]+/g, ' ').toLowerCase().split(' ').filter(Boolean);
const bad = (s: string) => GERMANISH.test(s) || words(s).some((w) => GERMAN.has(w));
const unquote = (s: string) => s.replace(/`[^`]*`|"[^"\n]*"|“[^”]*”|„[^“”]*[“”]|'[^'\n]*'/g, ' ');

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((f) => {
		const p = `${dir}/${f}`;
		if (['node_modules', 'fixtures', 'legacy', 'design-handoff', 'screenshots'].includes(f)) return [];
		return statSync(p).isDirectory() ? walk(p) : [p];
	});
}
const ROOTS = ['src', 'lib', 'tests', 'dev/it', 'dev/store', 'dev/screenshots', 'docs', 'templates', 'appinfo', 'img', 'l10n'];
const files = () => ROOTS.flatMap((r) => { try { return walk(r); } catch { return []; } });

/** Identifiers and comments of a script (TypeScript scanner, regex literals understood). */
export function scriptFindings(name: string, src: string): string[] {
	const out: string[] = [];
	const K = ts.SyntaxKind;
	const sc = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, src);
	let t: ts.SyntaxKind, prev: ts.SyntaxKind | undefined;
	const braces: string[] = [];
	while ((t = sc.scan()) !== K.EndOfFileToken) {
		if ((t === K.SlashToken || t === K.SlashEqualsToken) && (prev === undefined || ![K.Identifier, K.NumericLiteral, K.CloseParenToken, K.CloseBracketToken, K.StringLiteral, K.CloseBraceToken].includes(prev))) t = sc.reScanSlashToken();
		if (t === K.CloseBraceToken && braces.at(-1) === 't') { braces.pop(); t = sc.reScanTemplateToken(false); if (t === K.TemplateMiddle) braces.push('t'); }
		else if (t === K.OpenBraceToken) braces.push('b');
		else if (t === K.CloseBraceToken) braces.pop();
		if (t === K.TemplateHead) braces.push('t');
		const text = sc.getTokenText();
		if (t === K.Identifier && bad(text)) out.push(`${name}: identifier ${text}`);
		if ((t === K.SingleLineCommentTrivia || t === K.MultiLineCommentTrivia) && bad(unquote(text))) out.push(`${name}: comment ${text.slice(0, 80)}`);
		if (![K.WhitespaceTrivia, K.NewLineTrivia, K.SingleLineCommentTrivia, K.MultiLineCommentTrivia].includes(t)) prev = t;
	}
	return out;
}

function findings(name: string, src: string): string[] {
	if (/\.(ts|js|mjs)$/.test(name)) return scriptFindings(name, src);
	if (name.endsWith('.vue')) {
		const script = src.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? '';
		const template = src.match(/<template>([\s\S]*)<\/template>/)?.[1] ?? '';
		const out = scriptFindings(name, script);
		for (const m of template.matchAll(/\{\{([\s\S]*?)\}\}|\s[:@]?[\w.:-]+="([^"]*)"|<\/?([\w-]+)|<!--([\s\S]*?)-->/g)) {
			const s = m[1] ?? m[2] ?? m[3] ?? m[4] ?? '';
			// expressions, attribute values, tag names; the UI texts sit in t() calls and are English
			if (bad(unquote(s.replace(/t\('story2bpmn',\s*'[^']*'(,[^)]*)?\)/g, '')))) out.push(`${name}: template ${s.trim().slice(0, 80)}`);
		}
		for (const m of src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) out.push(...cssFindings(name, m[1]));
		return out;
	}
	if (name.endsWith('.css')) return cssFindings(name, src);
	if (name.endsWith('.php')) return [...src.matchAll(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|\$\w+|function \w+/g)].filter((m) => bad(unquote(m[0]))).map((m) => `${name}: ${m[0].slice(0, 80)}`);
	if (name.endsWith('.sh')) return [...src.matchAll(/#[^\n]*/g)].filter((m) => bad(unquote(m[0]))).map((m) => `${name}: ${m[0].slice(0, 80)}`);
	if (name.endsWith('.md')) return bad(unquote(src.replace(/```[\s\S]*?```/g, ''))) ? [`${name}: German text`] : [];
	return [];
}
function cssFindings(name: string, src: string): string[] {
	const out: string[] = [];
	for (const m of src.matchAll(/\/\*[\s\S]*?\*\//g)) if (bad(unquote(m[0]))) out.push(`${name}: comment ${m[0].slice(0, 80)}`);
	for (const m of src.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(?<![0-9])\.([a-zA-Z][\w-]*)|--([a-z][\w-]*)/g)) if (bad(m[1] ?? m[2])) out.push(`${name}: class ${m[0]}`);
	return out;
}

test('379 AK3 file names, identifiers and comments of the code are English', () => {
	const all = files();
	assert.ok(all.length > 60);
	const found = all.filter((f) => bad(f.split('/').pop()!.replace(/\.[^.]*$/, ''))).map((f) => `file name ${f}`);
	for (const f of all) if (/\.(ts|js|mjs|vue|css|php|sh|md)$/.test(f)) found.push(...findings(f, readFileSync(f, 'utf8')));
	for (const f of ['README.md', 'CONTEXT.md', 'CHANGELOG.md', 'THIRD-PARTY.md'].filter((f) => { try { return statSync(f).isFile(); } catch { return false; } })) found.push(...findings(f, readFileSync(f, 'utf8')));
	assert.deepEqual(found, []);
});

test('379 AK3 counter-probe: a German comment, identifier, class or file name is caught', () => {
	assert.equal(scriptFindings('x.ts', '// Die Datei wird gespeichert\nconst a = 1;').length, 1);
	assert.equal(scriptFindings('x.ts', 'const zeile = 1;').length, 1);
	assert.equal(scriptFindings('x.ts', "const re = /WENN (.+)/; const s = 'Schritt prüfen'; // the `Zug` term\n").length, 0);
	assert.equal(cssFindings('x.css', '.knopf { color: red }').length, 1);
	assert.equal(cssFindings('x.css', '.sheet.einpassen svg { width: 100% }').length, 1);
	assert.ok(bad('geschichte'));
});
