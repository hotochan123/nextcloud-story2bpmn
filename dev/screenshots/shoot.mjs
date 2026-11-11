// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// App Store screenshots of Story2BPMN (the four <screenshot> entries of appinfo/info.xml).
// Uploads the example working file dev/screenshots/invoice-approval.bpmn (English) into the account,
// opens it in the app and writes docs/screenshots/*.png.
//
//   dev/screenshots/run.sh <nextcloud url> <user> <password>
//
// Needs Playwright 1.49 (run.sh starts it in the image mcr.microsoft.com/playwright:v1.49.1-jammy).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// PLAYWRIGHT_MODULES: a node_modules folder that holds playwright
const require = createRequire(process.env.PLAYWRIGHT_MODULES ? `${process.env.PLAYWRIGHT_MODULES}/../resolve.js` : import.meta.url);
const { chromium } = require('playwright');
const [url, user, pass, out = 'docs/screenshots'] = process.argv.slice(2);
if (!url || !user || !pass) {
	console.error('usage: node dev/screenshots/shoot.mjs <nextcloud url> <user> <password> [outdir]');
	process.exit(2);
}
const auth = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
const FILE = 'Invoice approval.bpmn';

async function upload() {
	const r = await fetch(`${url}/remote.php/dav/files/${encodeURIComponent(user)}/${encodeURIComponent(FILE)}`, {
		method: 'PUT', headers: { Authorization: auth }, body: readFileSync('dev/screenshots/invoice-approval.bpmn'),
	});
	if (!r.ok) throw new Error(`upload: HTTP ${r.status}`);
	const p = await fetch(`${url}/remote.php/dav/files/${encodeURIComponent(user)}/${encodeURIComponent(FILE)}`, {
		method: 'PROPFIND', headers: { Authorization: auth, Depth: '0', 'Content-Type': 'application/xml' },
		body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><oc:fileid/></d:prop></d:propfind>',
	});
	const id = (await p.text()).match(/<oc:fileid>(\d+)</)?.[1];
	if (!id) throw new Error('no file id');
	return id;
}

async function open(browser, fileId, { width, height, touch = false, scheme = 'light' }) {
	const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, colorScheme: scheme, locale: 'en-US' });
	const page = await ctx.newPage();
	await page.goto(`${url}/login`);
	await page.fill('#user', user);
	await page.fill('#password', pass);
	await page.press('#password', 'Enter');
	await page.waitForURL(/\/apps\//);
	await page.goto(`${url}/apps/story2bpmn/?fileId=${fileId}`);
	await page.waitForSelector('.story2bpmn-workshop svg', { timeout: 30000 });
	const lang = page.getByLabel('Diagram language');
	if (await lang.count()) await lang.selectOption('en').catch(() => {});
	await page.waitForTimeout(1500);
	return { ctx, page };
}

const browser = await chromium.launch();
try {
	const fileId = await upload();
	let s = await open(browser, fileId, { width: 1366, height: 768 });
	await s.page.screenshot({ path: `${out}/01-tell-light.png` });
	await s.ctx.close();

	s = await open(browser, fileId, { width: 1366, height: 768, scheme: 'dark' });
	for (let i = 0; i < 2; i++) await s.page.getByRole('button', { name: 'Zoom out' }).click();
	await s.page.waitForTimeout(500);
	await s.page.screenshot({ path: `${out}/02-diagram-dark.png` });
	await s.ctx.close();

	s = await open(browser, fileId, { width: 1366, height: 768 });
	await s.page.getByRole('button', { name: /edit as text/i }).click();
	await s.page.waitForTimeout(1000);
	await s.page.screenshot({ path: `${out}/03-story-text.png` });
	await s.ctx.close();

	s = await open(browser, fileId, { width: 820, height: 1180, touch: true });
	await s.page.screenshot({ path: `${out}/04-tablet.png` });
	await s.ctx.close();
	console.log(`screenshots: 4 written to ${out}`);
} finally {
	await browser.close();
}
