import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// Every UI text (t/n with 'story2bpmn') and server text ($this->l->t) has a German version.
const files = ['src/App.vue', 'src/texts.js', 'src/fileApi.js', 'src/files.js', ...readdirSync('src/components').map((f) => `src/components/${f}`)];
const php = readdirSync('lib', { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.php')).map((f) => `lib/${f}`);

function key(): string[] {
	const k = new Set<string>();
	for (const f of files) {
		const src = readFileSync(f, 'utf8');
		for (const m of src.matchAll(/\bt\('story2bpmn', '((?:[^'\\]|\\.)*)'/g)) k.add(m[1]);
		for (const m of src.matchAll(/\bn\('story2bpmn', '((?:[^'\\]|\\.)*)', '((?:[^'\\]|\\.)*)'/g)) k.add(`_${m[1]}_::_${m[2]}_`);
	}
	for (const f of php) {
		const src = readFileSync(f, 'utf8');
		for (const m of src.matchAll(/->t\('((?:[^'\\]|\\.)*)'/g)) k.add(m[1]);
	}
	return [...k];
}

for (const language of ['de', 'de_DE']) {
	test(`l10n/${language}: every UI text translated, .js equals .json`, () => {
		const json = JSON.parse(readFileSync(`l10n/${language}.json`, 'utf8')).translations;
		const k = key();
		assert.ok(k.length > 100);
		assert.deepEqual(k.filter((s) => !json[s]), []);
		const js = readFileSync(`l10n/${language}.js`, 'utf8');
		const reg = new Function('OC', `let r; OC.L10N = { register: (_a, t) => { r = t } }; ${js}; return r`)({});
		assert.deepEqual(reg, json);
	});
}

test('377 AK6 l10n/de_DE uses the formal "Sie": no "Du" form', () => {
	const json = JSON.parse(readFileSync('l10n/de_DE.json', 'utf8')).translations;
	const values = Object.values(json).flat() as string[];
	const du = /\b(du|dich|dir|dein\w*)\b|(^|[.!?:]\s+)(Lies|Wähle|Speichere|Erzähle|Prüfe|Öffne|Klicke|Tippe)\b/i;
	assert.deepEqual(values.filter((w) => du.test(w)), []);
	// Counter-probe: the rule recognises the informal "Du" form
	assert.ok(du.test('Lies die Geschichte noch einmal.') && du.test('Diese Datei darfst du nicht ändern.'));
});

test('378 AK3 every t(/n( call in src uses the domain story2bpmn, l10n registers story2bpmn', () => {
	const all = readdirSync('src', { recursive: true, encoding: 'utf8' }).filter((f) => /\.(js|vue|ts)$/.test(f) && !f.startsWith('core/')).map((f) => `src/${f}`);
	const foreign: string[] = [];
	for (const f of all) {
		const src = readFileSync(f, 'utf8');
		for (const m of src.matchAll(/\b[tn]\(\s*'([^']*)'\s*,/g)) if (m[1] !== 'story2bpmn') foreign.push(`${f}: ${m[0]}`);
	}
	assert.deepEqual(foreign, []);
	for (const language of ['de', 'de_DE']) {
		assert.match(readFileSync(`l10n/${language}.js`, 'utf8'), /OC\.L10N\.register\(\s*"story2bpmn"/);
	}
});
