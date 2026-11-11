// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

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
