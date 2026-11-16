// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { headChips, figures } from '../../src/headChips.js';

// Job 447: Story2BPMN on the design system Soothing (foundation and frame).

const workshop = readFileSync('src/workshop.css', 'utf8');
const vue = readdirSync('src/components').filter((f) => f.endsWith('.vue')).map((f) => `src/components/${f}`).concat('src/App.vue');
const styles = vue.map((f) => ({ f, css: [...readFileSync(f, 'utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n') }));
const sheets = [{ f: 'src/workshop.css', css: workshop }, ...styles];

/** The innermost rules of a stylesheet (inside @media and @container too), comments removed. */
function rules(css: string): { selector: string; body: string }[] {
	const plain = css.replace(/\/\*[\s\S]*?\*\//g, '');
	return [...plain.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));
}
/** The declarations of a rule body as [property, value]. */
function declarations(body: string): [string, string][] {
	return body.split(';').map((d) => d.trim()).filter(Boolean).map((d) => { const i = d.indexOf(':'); return [d.slice(0, i).trim(), d.slice(i + 1).trim()]; });
}

test('447 AK1 the Soothing files are there and src/fonts.js registers the faces of tokens.css', () => {
	for (const f of ['tokens.css', 'components.css', 'fonts/IBMPlexMono-400.woff2', 'fonts/IBMPlexMono-500.woff2', 'fonts/LICENSE-IBMPlexMono.txt']) {
		assert.ok(existsSync(`src/css/soothing/${f}`), f);
	}
	const tokens = readFileSync('src/css/soothing/tokens.css', 'utf8');
	const src = readFileSync('src/fonts.js', 'utf8');
	const faces = [...tokens.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => ({
		family: /font-family:\s*"([^"]+)"/.exec(body)![1],
		weight: /font-weight:\s*(\d+)/.exec(body)![1],
		file: /url\("fonts\/([^"]+)"\)/.exec(body)![1],
		range: /unicode-range:\s*([^;]+);/.exec(body)![1].trim(),
	}));
	assert.equal(faces.length, 2);
	for (const face of faces) {
		assert.equal(face.family, /FAMILY = '([^']+)'/.exec(src)![1]);
		assert.equal(face.range, /UNICODE_RANGE = '([^']+)'/.exec(src)![1]);
		assert.match(src, new RegExp(`\\['${face.weight}', mono${face.weight}\\]`));
		assert.match(src, new RegExp(`fonts/${face.file.replace('.', '\\.')}\\?url'`));
	}
	const main = readFileSync('src/main.js', 'utf8');
	assert.ok(main.indexOf('soothing/tokens.css') < main.indexOf('soothing/components.css') && main.indexOf('soothing/components.css') < main.indexOf('workshop.css'), 'tokens, components, then the workshop');
	assert.match(main, /registerFonts\(\)/);
});

const built = existsSync('css/story2bpmn-style.css') && existsSync('js/fonts');
test('447 AK1 the build ships the fonts in js/fonts/ and no @font-face or data: font in the stylesheet', { skip: !built && 'run `npm run build` first' }, () => {
	const fonts = readdirSync('js/fonts');
	assert.ok(fonts.some((f) => /^IBMPlexMono-400-.*\.woff2$/.test(f)), fonts.join());
	assert.ok(fonts.some((f) => /^IBMPlexMono-500-.*\.woff2$/.test(f)), fonts.join());
	assert.ok(fonts.includes('LICENSE-IBMPlexMono.txt'));
	const css = readFileSync('css/story2bpmn-style.css', 'utf8');
	assert.doesNotMatch(css, /@font-face/);
	assert.doesNotMatch(css, /data:font|data:application\/font/);
	assert.match(css, /\.so-chip--open/);
});

/** Colour literals are allowed only for the paper of the diagram (white with dark ink in every theme). */
const PAPER = new Set(['--paper', '--ink', '--ink-soft']);
const LITERAL = /#[0-9a-f]{3,8}\b|\b(?:oklch|oklab|rgba?|hsla?|lab|lch)\(/i;

test('447 AK2 colours only from tokens: no colour values of their own, no theme selectors', () => {
	const found: string[] = [];
	for (const { f, css } of sheets) {
		for (const r of rules(css)) {
			for (const [p, v] of declarations(r.body)) if (LITERAL.test(v) && !PAPER.has(p)) found.push(`${f}: ${r.selector} { ${p}: ${v} }`);
		}
		if (/data-themes/.test(css)) found.push(`${f}: a [data-themes] selector`);
		if (/prefers-color-scheme/.test(css)) found.push(`${f}: its own dark colours`);
	}
	assert.deepEqual(found, []);
	// Counter-probe: the rule sees a literal
	assert.ok(LITERAL.test('oklch(45% 0.13 150)') && LITERAL.test('#fff') && LITERAL.test('rgb(0 0 0)') && !LITERAL.test('var(--accent)') && !LITERAL.test('color-mix(in oklch, var(--accent) 35%, transparent)'));
});

/** A box-shadow draws a line, never a soft shadow: no blur radius (inset edges and rings are lines). */
function blurred(value: string): boolean {
	if (value === 'none') return false;
	return value.split(/,(?![^(]*\))/).some((s) => {
		const lengths = s.replace(/var\([^)]*\)|inset/g, '').trim().split(/\s+/).filter((x) => /^-?[\d.]+(px)?$/.test(x));
		return lengths.length >= 3 && parseFloat(lengths[2]) !== 0;
	});
}

test('447 AK3 lines instead of shadows', () => {
	const found: string[] = [];
	for (const { f, css } of sheets) {
		for (const r of rules(css)) for (const [p, v] of declarations(r.body)) if (p === 'box-shadow' && blurred(v)) found.push(`${f}: ${r.selector}`);
	}
	assert.deepEqual(found, []);
	assert.ok(blurred('0 6px 14px -10px var(--x)') && !blurred('inset 3px 0 0 var(--accent)') && !blurred('0 0 0 2px var(--reason)') && !blurred('none'));
});

/** IBM Plex Mono only for figures (Soothing 4, job 450: the raw text of a proposal is in the instance font too). */
const MONO = [/\.line \.num$/, /\.option kbd$/, /\.zoom output$/, /\.chosen-num$/, /\.gutter$/];

test('447 AK3 mono only for figures, labels in the instance font without capitals', () => {
	const found: string[] = [];
	for (const { f, css } of sheets) {
		for (const r of rules(css)) {
			if (!declarations(r.body).some(([p, v]) => p !== '--f-mono' && /var\(--(f|font)-mono\)|monospace/.test(v))) continue;
			const sel = r.selector.split(',').map((s) => s.trim());
			if (!sel.every((s) => MONO.some((m) => m.test(s)))) found.push(`${f}: ${r.selector}`);
		}
		if (/text-transform:\s*uppercase/.test(css)) found.push(`${f}: text-transform: uppercase`);
	}
	assert.deepEqual(found, []);
});

test('447 AK4 the state chips of the head: sign class and word', () => {
	assert.deepEqual(headChips([{ kind: 'draft' }]), [{ word: 'draft', className: 'so-chip--closed' }]);
	assert.deepEqual(headChips([{ kind: 'done' }]), [{ word: 'done', className: 'so-chip--open' }]);
	assert.deepEqual(headChips([{ kind: 'open', count: 2 }]), [{ word: 'open', count: 2, className: 'so-chip--warn' }]);
	assert.deepEqual(headChips([{ kind: 'review', owner: 'Petra' }]), [{ word: 'review', className: 'so-chip--info' }]);
	assert.deepEqual(headChips([{ kind: 'valid', number: 2 }, { kind: 'changed', number: 2 }]),
		[{ word: 'valid', number: 2, className: 'so-chip--ok' }, { word: 'draft', className: 'so-chip--closed' }]);
	assert.deepEqual(headChips([{ kind: 'valid', number: 2 }, { kind: 'proposals', count: 3 }]), [{ word: 'valid', number: 2, className: 'so-chip--ok' }]);
	// The App renders the words: "Valid version {number}" is a translated text
	const app = readFileSync('src/App.vue', 'utf8');
	assert.match(app, /t\('story2bpmn', 'Valid version \{number\}', \{ number: c\.number \}\)/);
	assert.doesNotMatch(app, /'Tell a process'/);
});

test('447 figures: numbers of a head text apart from its words', () => {
	assert.deepEqual(figures('11 moves'), [{ text: '11', num: true }, { text: ' moves', num: false }]);
	assert.deepEqual(figures('10 Knoten · 2 Bahnen').filter((p) => p.num).map((p) => p.text), ['10', '2']);
	assert.deepEqual(figures(''), []);
});

test('447 round 2: the way back in the head keeps the touch target (44 px on pointer: coarse through --target)', () => {
	const back = rules(workshop).filter((r) => /\.head-crumbs (\.button\.icon|a)$/.test(r.selector));
	assert.equal(back.length, 2);
	for (const r of back) {
		for (const [p, v] of declarations(r.body)) if (/^(min-)?(width|height)$/.test(p)) assert.equal(v, 'var(--target)', `${r.selector} { ${p}: ${v} }`);
	}
	assert.match(workshop, /@media \(pointer: coarse\) \{ \.story2bpmn-workshop \{ --target: 44px; \} \}/);
});
