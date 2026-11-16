// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

// Job 379: what the App Store and the public repository need.
const info = readFileSync('appinfo/info.xml', 'utf8');
const PUBLIC = 'https://github.com/hotochan123/nextcloud-story2bpmn';

test('379 AK6 info.xml links the public repository and four screenshots that exist in docs/screenshots', () => {
	assert.ok(info.includes(`<repository type="git">${PUBLIC}.git</repository>`));
	assert.ok(info.includes(`<website>${PUBLIC}</website>`));
	const shots = [...info.matchAll(/<screenshot>([^<]+)<\/screenshot>/g)].map((m) => m[1]);
	assert.equal(shots.length, 4);
	for (const s of shots) {
		assert.ok(s.startsWith('https://raw.githubusercontent.com/hotochan123/nextcloud-story2bpmn/main/docs/screenshots/'), s);
		const file = 'docs/screenshots/' + s.split('/').pop();
		assert.ok(existsSync(file), file);
		assert.deepEqual([...readFileSync(file).subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], `${file} is a PNG`);
	}
});

test('379 AK6 THIRD-PARTY.md names every runtime dependency of package.json', () => {
	const third = readFileSync('THIRD-PARTY.md', 'utf8');
	const deps = Object.keys(JSON.parse(readFileSync('package.json', 'utf8')).dependencies);
	assert.ok(deps.length >= 5);
	assert.deepEqual(deps.filter((d) => !third.includes(`| ${d} |`)), []);
});

test('379 AK6 the German store description uses the formal form', () => {
	const de = info.match(/<description lang="de"><!\[CDATA\[([\s\S]*?)\]\]>/)![1];
	assert.doesNotMatch(de, /\b(du|dich|dir|dein\w*)\b/i);
});

/** Job 433: the (name, version, licence) triples of the built `js/*.license` files, without the app itself. */
export function bundled(texts: string[]): string[] {
	const rows = new Set<string>();
	for (const text of texts) {
		for (const m of text.matchAll(/^- (\S+)\n\t- version: (\S+)\n\t- license: ([^\n]+)$/gm)) {
			if (m[1] !== 'story2bpmn') rows.add(`| ${m[1]} | ${m[2]} | ${m[3].trim()} |`);
		}
	}
	return [...rows].sort();
}

const licenseFiles = existsSync('js') ? readdirSync('js').filter((f) => f.endsWith('.license')) : [];

test('433 AK1 THIRD-PARTY.md has a row with version and licence for every package the build bundles', { skip: licenseFiles.length === 0 && 'no js/*.license: run `npm run build` first' }, () => {
	const lines = new Set(readFileSync('THIRD-PARTY.md', 'utf8').split('\n').map((l) => l.trim()));
	const rows = bundled(licenseFiles.map((f) => readFileSync(`js/${f}`, 'utf8')));
	assert.ok(rows.length >= 20, `only ${rows.length} packages found in js/*.license`);
	assert.deepEqual(rows.filter((r) => !lines.has(r)), []);
});

test('433 AK1 counter-probe: bundled() reads the plugin format, keeps every version and takes licences literally', () => {
	const a = '- foo\n\t- version: 1.0.0\n\t- license: MIT\n- story2bpmn\n\t- version: 0.1.0\n\t- license: AGPL-3.0-or-later\n- pako\n\t- version: 1.0.11\n\t- license: (MIT AND Zlib)\n';
	const b = '- foo\n\t- version: 2.0.0\n\t- license: MIT\n- foo\n\t- version: 1.0.0\n\t- license: MIT\n';
	assert.deepEqual(bundled([a, b]), ['| foo | 1.0.0 | MIT |', '| foo | 2.0.0 | MIT |', '| pako | 1.0.11 | (MIT AND Zlib) |']);
});
