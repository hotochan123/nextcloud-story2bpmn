// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';

// Job 381: the public repository gets everything except "release.exclude" of factory.json. No public
// document may point at a path that is missing there. The public repository has no factory.json:
// then the list below stands in (same entries as factory.json).
const FALLBACK = ['factory', 'factory.json', '.claude', 'dev/legacy', 'docs/design-handoff'];

function excluded(): string[] {
	if (!existsSync('factory.json')) return FALLBACK;
	return JSON.parse(readFileSync('factory.json', 'utf8')).release?.exclude ?? FALLBACK;
}

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((f) => {
		if (['node_modules', 'vendor', '.git'].includes(f)) return [];
		const p = dir === '.' ? f : `${dir}/${f}`;
		return statSync(p).isDirectory() ? walk(p) : [p];
	});
}

function repoFiles(): string[] {
	try {
		return execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\0').filter(Boolean);
	} catch {
		return walk('.');
	}
}

const markdownFiles = (): string[] => repoFiles().filter((f) => f.endsWith('.md'));

const under = (file: string, entry: string) => file === entry || file.startsWith(`${entry}/`);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The exclude entries that a text names as a path. A one-word entry without a dot counts only with a slash after it. */
export function references(text: string, entries: string[]): string[] {
	return entries.filter((e) => {
		const after = /^[\w-]+$/.test(e) ? '/' : '(?=/|\\.(?!\\w)|[^\\w.-]|$)';
		return new RegExp(`(?<![\\w./-])${escape(e)}${after}`, 'm').test(text);
	});
}

test('381 AK2 public docs name no excluded path', () => {
	const entries = excluded();
	const docs = markdownFiles().filter((f) => !entries.some((e) => under(f, e)));
	assert.ok(docs.includes('README.md') && docs.includes('docs/symbols.md'));
	const found = docs.flatMap((f) => references(readFileSync(f, 'utf8'), entries).map((e) => `${f}: ${e}`));
	assert.deepEqual(found, []);
});

test('381 AK3 counter-probe: excluded paths are found, look-alikes are not', () => {
	const entries = FALLBACK;
	assert.deepEqual(references('see docs/design-handoff/x.md', entries), ['docs/design-handoff']);
	assert.deepEqual(references('the old tool in `dev/legacy`', entries), ['dev/legacy']);
	assert.deepEqual(references('read factory/CONTEXT.md', entries), ['factory']);
	assert.deepEqual(references('checks in factory.json.', entries), ['factory.json']);
	assert.deepEqual(references('settings in .claude/', entries), ['.claude']);
	assert.deepEqual(references('built by a software factory', entries), []);
	assert.deepEqual(references('<!-- factory:ai-banner -->', entries), []);
	assert.deepEqual(references('myfactory.json, factory.json.bak and docs/design-handoff-old', entries), []);
	assert.deepEqual(references('https://example.org/x/factory/', entries), []);
});

test('381 AK2 fallback list matches factory.json', { skip: !existsSync('factory.json') }, () => {
	assert.deepEqual([...excluded()].sort(), [...FALLBACK].sort());
});

test('433 AK4 no test reads or names an excluded path (the public repository has none of them)', () => {
	const entries = excluded();
	const self = 'tests/client/public-docs.test.ts';
	const files = repoFiles().filter((f) => f.startsWith('tests/')).filter((f) => f !== self);
	assert.ok(files.includes('tests/core/render.test.ts'));
	const found = files.flatMap((f) => references(readFileSync(f, 'utf8'), entries).map((e) => `${f}: ${e}`));
	assert.deepEqual(found, []);
});
