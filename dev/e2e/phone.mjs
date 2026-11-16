// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Browser cases of the phone view (job 394): Chromium with touch at 390 × 844, 360 × 780 and 844 × 390,
// tablet upright and laptop for comparison. Started by dev/it/run.sh with E2E=1 inside the network
// namespace of the throwaway Nextcloud (http://localhost); never against another instance.
//
// Env: S2B_E2E_URL, S2B_E2E_USER, S2B_E2E_PASS, S2B_E2E_PW (path of playwright-core's index.mjs),
// S2B_E2E_OUT (screenshots: phone-*.png and one per red case), S2B_E2E_FILE (example working file),
// S2B_E2E_ONLY (comma-separated case names; empty: all).
// Output: one line per case (ok <case> / FAIL <case>: <message>), last line E2E <ok>/<failed>. Exit 0 or 1.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const { chromium } = await import(process.env.S2B_E2E_PW);
const url = process.env.S2B_E2E_URL;
const user = process.env.S2B_E2E_USER;
const pass = process.env.S2B_E2E_PASS;
const out = process.env.S2B_E2E_OUT || '/tmp';
const FILE = 'Invoice approval.bpmn';
const auth = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
const only = (process.env.S2B_E2E_ONLY || '').split(',').filter(Boolean);
const PHONE = { width: 390, height: 844, touch: true };

const davOf = (name) => `${url}/remote.php/dav/files/${encodeURIComponent(user)}/${encodeURIComponent(name)}`;
async function upload(name = FILE, body = readFileSync(process.env.S2B_E2E_FILE)) {
	const dav = davOf(name);
	const r = await fetch(dav, { method: 'PUT', headers: { Authorization: auth }, body });
	if (!r.ok) throw new Error(`upload: HTTP ${r.status}`);
	const p = await fetch(dav, {
		method: 'PROPFIND', headers: { Authorization: auth, Depth: '0', 'Content-Type': 'application/xml' },
		body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><oc:fileid/></d:prop></d:propfind>',
	});
	const id = (await p.text()).match(/<oc:fileid>(\d+)</)?.[1];
	if (!id) throw new Error('no file id');
	return id;
}

const browser = await chromium.launch();
let fileId;
let state; // storage state after the login, shared by every case

async function login() {
	const ctx = await browser.newContext({ locale: 'en-US' });
	const page = await ctx.newPage();
	await page.goto(`${url}/login`);
	await page.fill('#user', user);
	await page.fill('#password', pass);
	await page.press('#password', 'Enter');
	await page.waitForURL(/\/apps\//, { timeout: 60000 });
	state = await ctx.storageState();
	await ctx.close();
}

async function open({ width, height, touch = false, scheme = 'light', id = fileId }) {
	const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, colorScheme: scheme, locale: 'en-US', storageState: state });
	const page = await ctx.newPage();
	await page.goto(`${url}/apps/story2bpmn/?fileId=${id}`);
	await page.waitForSelector('.story2bpmn-workshop .diagram-card svg', { state: 'attached', timeout: 30000 });
	await page.waitForTimeout(800);
	return { ctx, page };
}

const visibleCards = (page) => page.locator('.workbench > .card').evaluateAll((els) => els.filter((e) => e.getClientRects().length > 0).length);
const shown = (page, sel) => page.locator(sel).first().isVisible();
function check(cond, msg) {
	if (!cond) throw new Error(msg);
}
const stillOpen = (page) => page.locator('.workbench .line .txt', { hasText: /^\s*STILL OPEN\.\s*$/ }).count();
// A change the phone way: the last line (the end) is reopened through its ⋯ sheet. Right after opening,
// Undo has nothing to take back (job 409), so it no longer serves as a quick change.
async function reopenLast(page) {
	const before = await stillOpen(page);
	const more = page.locator('.line-tap').getByRole('button', { name: 'More' });
	// A tap on the line chosen already takes the choice away: tap until its actions show.
	for (let i = 0; i < 2 && !(await more.isVisible()); i++) {
		await page.locator('.workbench .line.choosable').last().locator('.num').tap();
		await page.waitForTimeout(300);
	}
	await more.tap();
	await page.locator('.bottom-sheet').getByRole('button', { name: 'Reopen path' }).tap();
	await page.waitForFunction((want) => [...document.querySelectorAll('.workbench .line .txt')].filter((e) => e.textContent.trim() === 'STILL OPEN.').length === want, before + 1, { timeout: 10000 });
}

// Job 416: a working file with valid version 1 whose process owner is the test user, so the sidebar
// offers "Accept"/"Reject"; built from the example file (its stored story becomes the valid version).
function approvedXml(xml) {
	const m = xml.match(/bpmnc:geschichte="([^"]*)"/);
	if (!m) throw new Error('no story in the example file');
	const unxml = (s) => s.replace(/&#34;/g, '"').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, '&');
	const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&#34;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	const me = { uid: user, name: user };
	const freigabe = { status: 'gueltig', verantwortlich: me, ersteller: me, gueltig: { nummer: 1, datum: '2026-11-13T12:00:00.000Z', von: me, sprache: 'en', geschichte: JSON.parse(unxml(m[1])) }, entschieden: [], schlagwort: false };
	return xml.replace('<bpmn:definitions ', `<bpmn:definitions xmlns:s2b="urn:story2bpmn:freigabe" s2b:freigabe="${esc(JSON.stringify(freigabe))}" `);
}
const commentsOf = (id) => `${url}/remote.php/dav/comments/files/${id}`;
// Job 432: the approval of approvedXml() counts only once Nextcloud's comments confirm it: bob (the second
// account of dev/it/run.sh, same password) asks the test user, who then writes the approval comment with
// the check code of exactly that story (approvalCode() of src/core/fingerprint.ts).
async function sayAs(who, id, message) {
	const r = await fetch(commentsOf(id), { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(`${who}:${pass}`).toString('base64'), 'Content-Type': 'application/json' }, body: JSON.stringify({ actorType: 'users', verb: 'comment', message, objectType: 'files' }) });
	if (r.status !== 201) throw new Error(`comment by ${who}: HTTP ${r.status}`);
}
async function confirmOn(id, name, xml) {
	const share = await fetch(`${url}/ocs/v2.php/apps/files_sharing/api/v1/shares?format=json`, {
		method: 'POST', headers: { Authorization: auth, 'OCS-APIRequest': 'true', 'Content-Type': 'application/json' },
		body: JSON.stringify({ path: '/' + name, shareType: 0, shareWith: 'bob', permissions: 1 }),
	});
	if (share.status !== 200) throw new Error(`share: HTTP ${share.status}`);
	const m = xml.match(/bpmnc:geschichte="([^"]*)"/);
	const story = m[1].replace(/&#34;/g, '"').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&#38;/g, '&').replace(/&amp;/g, '&');
	const code = createHash('sha256').update(`1\nen\n${JSON.stringify(JSON.parse(story))}`, 'utf8').digest('hex').slice(0, 16);
	await sayAs('bob', id, `@"${user}" Please approve "Invoice approval".`);
	await sayAs(user, id, `Approved as valid version 1.\nCheck code: ${code}`);
}
async function proposeOn(id) {
	// Line 11: the number left of the line (job 417), the text line 13 counts two path headings.
	const message = 'Proposal on valid version 1, line 11 [Paid]\nKind: Change line\nNew: END: [Invoice paid].';
	const r = await fetch(commentsOf(id), { method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ actorType: 'users', verb: 'comment', message, objectType: 'files' }) });
	if (r.status !== 201) throw new Error(`comment: HTTP ${r.status}`);
}
async function commentCount(id) {
	const r = await fetch(commentsOf(id), {
		method: 'REPORT', headers: { Authorization: auth, 'Content-Type': 'application/xml' },
		body: '<?xml version="1.0"?><oc:filter-comments xmlns:oc="http://owncloud.org/ns"><oc:limit>200</oc:limit><oc:offset>0</oc:offset></oc:filter-comments>',
	});
	return ((await r.text()).match(/<oc:message>/g) ?? []).length;
}
const fileText = async (name) => (await fetch(davOf(name), { headers: { Authorization: auth } })).text();

// Job 418: zoom shown at the zoom buttons, and the screen centre of a shape of the diagram.
const zoomPercent = async (page) => Number((await page.locator('.diagram-card .zoom output').textContent()).replace(/[^0-9]/g, ''));
async function shapeCentre(page, i) {
	const b = await page.locator('.diagram-card .sheet g[data-move]').nth(i).boundingBox();
	return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
/** Middle shape that lies inside the area, as anchor of a gesture. */
async function anchorShape(page) {
	const area = await page.locator('.diagram-card .mat').boundingBox();
	const n = await page.locator('.diagram-card .sheet g[data-move]').count();
	for (let i = Math.floor(n / 2), k = 0; k < n; k++, i = (i + 1) % n) {
		const c = await shapeCentre(page, i);
		if (c.x > area.x + 140 && c.x < area.x + area.width - 140 && c.y > area.y + 40 && c.y < area.y + area.height - 40) return i;
	}
	throw new Error('no shape inside the area');
}
/** The shape stayed within 30 px of `at` on each axis, unless the area stands at its scroll edge there. */
async function anchored(page, i, at) {
	const c = await shapeCentre(page, i);
	const edge = await page.locator('.diagram-card .mat').evaluate((m) => ({
		x: m.scrollLeft <= 0 || m.scrollLeft >= m.scrollWidth - m.clientWidth - 1,
		y: m.scrollTop <= 0 || m.scrollTop >= m.scrollHeight - m.clientHeight - 1,
	}));
	const dx = Math.round(c.x - at.x);
	const dy = Math.round(c.y - at.y);
	check((Math.abs(dx) <= 30 || edge.x) && (Math.abs(dy) <= 30 || edge.y), `shape moved by ${dx}, ${dy} px`);
}
async function pinchAt(page, ctx, at, from, to) {
	const cdp = await ctx.newCDPSession(page);
	const pts = (d) => [{ x: at.x - d, y: at.y, id: 1 }, { x: at.x + d, y: at.y, id: 2 }];
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(from) });
	for (let k = 1; k <= 8; k++) {
		await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(from + (to - from) * k / 8) });
		await page.waitForTimeout(40);
	}
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await page.waitForTimeout(400);
	await cdp.detach();
}

const cases = {
	// AK4: the bar, one card, segment targets ≥ 44 px; line → shape → line
	async bar() {
		const { ctx, page } = await open(PHONE);
		try {
			check(await shown(page, '.phone-bar'), 'no bar at 390 × 844');
			check(await visibleCards(page) === 1, `cards visible: ${await visibleCards(page)}`);
			for (const b of await page.locator('.phone-bar .seg').all()) {
				const box = await b.boundingBox();
				check(box && box.height >= 44 && box.width >= 44, `segment target ${box?.width} × ${box?.height}`);
			}
			const bar = await page.locator('.phone-bar').boundingBox();
			check(Math.abs(bar.y + bar.height - 844) <= 1, `bar not at the bottom (${bar.y + bar.height})`);
			await page.screenshot({ path: `${out}/phone-390-light.png` });
			// Tap a line: chosen, still the story; "Show in the diagram" switches and frames the shape
			const line = page.locator('.workbench .line.choosable').nth(1);
			await line.locator('.num').tap();
			check(await shown(page, '.line.chosen'), 'tapped line not chosen');
			check(await shown(page, '.workbench > .card:not(.diagram-card)'), 'tap on a line left the story');
			await page.locator('.line-tap').getByRole('button', { name: 'Show in the diagram' }).tap();
			await page.waitForTimeout(500);
			check(await shown(page, '.diagram-card'), 'diagram not shown after "Show in the diagram"');
			check(await visibleCards(page) === 1, 'two cards after the switch');
			check(await page.locator('.diagram-card .chosen-frame').count() === 1, 'shape not framed');
			// Tap a shape: its line at the bottom, "To the line" goes back
			const g = page.locator('.diagram-card g[data-move]').nth(2);
			await g.tap({ force: true });
			await page.waitForSelector('.chosen-line', { timeout: 5000 });
			// the line of the shape that was hit (a tap in the middle of a box may hit a label of another move)
			const want = Number(await page.locator('.chosen-line .chosen-num').textContent()) - 1;
			check(await shown(page, '.diagram-card'), 'tap on a shape left the diagram');
			await page.getByRole('button', { name: 'To the line' }).tap();
			await page.waitForTimeout(400);
			check(await shown(page, '.workbench > .card:not(.diagram-card)'), 'story not shown after "To the line"');
			check(await page.locator(`.line.chosen[data-line="${want}"]`).count() === 1, `line ${want} not chosen (chosen: ${await page.locator(".line.chosen").evaluateAll((e) => e.map((x) => x.dataset.line).join(","))})`);
			const story = page.locator('.workbench > .card:not(.diagram-card)');
			const below = async (sel) => {
				const head = await story.locator('.card-head').boundingBox();
				const line = await page.locator(sel).boundingBox();
				return line && head && line.y >= head.y + head.height - 1;
			};
			check(await below(`.line[data-line="${want}"]`), 'chosen line under the card head');
			// From further down the story: "To the line" of a shape near the top lands below the sticky head
			await story.evaluate((e) => { e.scrollTop = e.scrollHeight; });
			await page.locator('.phone-bar .seg').nth(1).tap();
			await page.waitForTimeout(300);
			await page.locator('.diagram-card g[data-move="2"]').tap({ force: true });
			await page.waitForSelector('.chosen-line', { timeout: 5000 });
			const up = Number(await page.locator('.chosen-line .chosen-num').textContent()) - 1;
			await page.getByRole('button', { name: 'To the line' }).tap();
			await page.waitForTimeout(500);
			check(await below(`.line[data-line="${up}"]`), `line ${up} under the card head after "To the line"`);
		} finally {
			await ctx.close();
		}
	},
	// AK5: a move keeps the story, point and hint; "View" switches; turning keeps the pane
	async move() {
		const { ctx, page } = await open(PHONE);
		try {
			// The file is told to its end: reopen its end, then tell that path through "Tell now"
			await reopenLast(page);
			await page.getByRole('button', { name: /Tell now/ }).first().tap();
			const sheet = page.locator('.move.as-sheet');
			await sheet.waitFor({ state: 'visible', timeout: 5000 });
			const box = await sheet.boundingBox();
			check(box.height <= 844 * 0.7 + 1, `sheet higher than 70 % (${box.height})`);
			await sheet.locator('.option').first().tap();
			for (const f of await sheet.locator('input[type="text"], input:not([type])').all()) if (!(await f.inputValue())) await f.fill('Archive invoice');
			await sheet.getByRole('button', { name: 'Apply' }).tap();
			// Telling a path still open keeps its sheet for the next move: stop telling there
			await page.waitForSelector('.line.fresh', { timeout: 10000 });
			await sheet.getByRole('button', { name: 'Stop telling here' }).tap();
			await page.waitForSelector('.phone-note', { timeout: 10000 });
			check(await shown(page, '.workbench > .card:not(.diagram-card)'), 'the story did not stay');
			check(await page.locator('.seg-point').count() === 1, 'no point at the segment');
			check(await page.locator('.line.fresh .new-tag').count() === 1, 'no NEW mark');
			check(!(await sheet.isVisible()), 'the move sheet stayed open');
			await page.screenshot({ path: `${out}/phone-390-move.png` });
			await page.locator('.phone-note').getByRole('button', { name: 'View' }).tap();
			await page.waitForTimeout(400);
			check(await shown(page, '.diagram-card'), '"View" did not show the diagram');
			check(await page.locator('.seg-point').count() === 0, 'point still there');
			// Turning the device: the bar becomes a rail, the pane stays
			await page.setViewportSize({ width: 844, height: 390 });
			await page.waitForTimeout(600);
			const rail = await page.locator('.phone-bar.rail').boundingBox();
			check(rail && rail.x <= 1 && rail.height > rail.width, 'no rail at the left edge at 844 × 390');
			check(await shown(page, '.diagram-card') && await visibleCards(page) === 1, 'pane changed when turning');
			await page.screenshot({ path: `${out}/phone-844x390.png` });
		} finally {
			await ctx.close();
		}
	},
	// AK6: tablet upright and laptop unchanged; ⋯ of the header; edit as text full screen
	async wide() {
		for (const v of [{ width: 820, height: 1180, touch: true }, { width: 1366, height: 768 }]) {
			const { ctx, page } = await open(v);
			try {
				check(await page.locator('.phone-bar').count() === 0, `bar at ${v.width} × ${v.height}`);
				check(await visibleCards(page) === 2, `cards visible at ${v.width}: ${await visibleCards(page)}`);
			} finally {
				await ctx.close();
			}
		}
	},
	async menu() {
		const { ctx, page } = await open(PHONE);
		try {
			await page.getByRole('button', { name: 'More actions' }).tap();
			const sheet = page.locator('.head-sheet');
			await sheet.waitFor({ state: 'visible' });
			for (const name of ['Save as …', 'Download PDF', 'Edit as text', 'New']) {
				check(await sheet.getByRole('button', { name, exact: true }).count() === 1, `no "${name}" in the ⋯ sheet`);
			}
			// Job 403: only "New" begins anew; "Start over" kept the old file connected.
			check(await sheet.getByRole('button', { name: 'Start over' }).count() === 0, '"Start over" still in the ⋯ sheet');
			await sheet.getByRole('button', { name: 'Edit as text' }).tap();
			const ed = page.locator('.text-editor.full');
			await ed.waitFor({ state: 'visible' });
			const b = await ed.boundingBox();
			check(b.width >= 389 && b.y + b.height >= 843, `editor not full screen (${b.width} × ${b.height} at ${b.y})`);
			check(await page.locator('.phone-bar').count() === 0, 'bar shown while editing as text');
			check(await ed.getByRole('button', { name: 'Done' }).count() === 1 && await ed.getByRole('button', { name: 'Cancel' }).count() === 1, 'no Cancel/Done');
			await ed.getByRole('button', { name: 'Cancel' }).tap();
			await page.waitForSelector('.phone-bar');
			// Publishing from the ⋯ sheet while the story is shown: the result is visible above the bar
			await page.getByRole('button', { name: 'More actions' }).tap();
			await sheet.getByRole('button', { name: 'Publish', exact: true }).tap();
			const note = page.locator('.phone-note', { hasText: /reading copy|publish/i });
			await note.waitFor({ state: 'visible', timeout: 15000 });
			check(await shown(page, '.workbench > .card:not(.diagram-card)'), 'publishing left the story');
		} finally {
			await ctx.close();
		}
	},
	// Follow (in the diagram head since job 450) starts on again when the diagram card is rebuilt (language, level)
	async follow() {
		const { ctx, page } = await open(PHONE);
		try {
			await page.locator('.phone-bar .seg').nth(1).tap();
			const follow = page.locator('.diagram-card .card-head .follow');
			check(await follow.getAttribute('aria-pressed') === 'true', 'Follow not on at the start');
			await follow.tap();
			check(await follow.getAttribute('aria-pressed') === 'false', 'Follow did not switch off');
			await page.getByRole('button', { name: 'More actions' }).tap();
			const lang = page.locator('.head-sheet select.language');
			await lang.selectOption((await lang.inputValue()) === 'de' ? 'en' : 'de');
			await page.waitForTimeout(1500);
			// the rebuilt card starts with Follow on, and one tap switches it off again
			check(await follow.getAttribute('aria-pressed') === 'true', 'Follow off, the rebuilt diagram follows');
			await follow.tap();
			check(await follow.getAttribute('aria-pressed') === 'false', 'one tap did not switch Follow off');
		} finally {
			await ctx.close();
		}
	},
	// Job 447: Soothing head, the explanation only on the empty start, one primary button, the paper stays white in dark
	async soothing() {
		const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US', storageState: state });
		const page = await ctx.newPage();
		try {
			await page.goto(`${url}/apps/story2bpmn/`);
			const see = page.getByRole('button', { name: 'See an example' });
			await see.waitFor({ state: 'visible', timeout: 30000 });
			const head = page.locator('.story2bpmn-workshop .head');
			check(!/Tell a process/.test(await head.textContent()), 'the head still says "Tell a process"');
			check(await shown(page, '.diagram-card .empty-sheet .about'), 'no explanation on the empty start');
			check(/For documentation, not for execution\./.test(await page.locator('.empty-sheet .about').textContent()), 'explanation text');
			await see.click();
			await page.waitForSelector('.story2bpmn-workshop .diagram-card svg', { state: 'attached', timeout: 30000 });
			await page.waitForTimeout(800);
			const title = (await head.locator('h1.name').textContent()).trim();
			check(title && title !== 'New process', `title of the head: "${title}"`);
			check(/Not saved yet/.test(await head.locator('.file').textContent()), 'the rubric does not say "Not saved yet"');
			check((await head.locator('.so-chip--open').textContent()).trim() === 'Fully told', 'no chip "● Fully told"');
			check(await page.locator('.empty-sheet .about').count() === 0 && !/For documentation, not for execution/.test(await page.locator('.story2bpmn-workshop').textContent()), 'explanation left over a told story');
			const mains = await page.locator('.story2bpmn-workshop .button.main').evaluateAll((els) => els.filter((e) => e.getClientRects().length > 0).length);
			check(mains <= 1, `${mains} primary buttons`);
			await page.locator('.workbench .line.choosable').nth(1).locator('.num').click();
			await page.waitForTimeout(800);
			const frame = await page.locator('.diagram-card .chosen-frame').first().evaluate((r) => {
				const s = getComputedStyle(r);
				const probe = document.createElement('span');
				probe.style.color = 'var(--color-primary-element)';
				document.querySelector('.story2bpmn-workshop').append(probe);
				const accent = getComputedStyle(probe).color;
				probe.remove();
				return { dash: s.strokeDasharray, stroke: s.stroke, accent };
			});
			check(frame.dash === 'none' && frame.stroke !== frame.accent, `chosen frame ${JSON.stringify(frame)}`);
			await page.screenshot({ path: `${out}/soothing-light.png` });
		} finally {
			await ctx.close();
		}
		const { ctx: dark, page: darkPage } = await open({ width: 1440, height: 900, scheme: 'dark' });
		try {
			const look = await darkPage.evaluate(() => {
				const lum = (c) => { const [r, g, b] = c.match(/[\d.]+/g).map(Number); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
				return {
					mat: lum(getComputedStyle(document.querySelector('.diagram-card .mat')).backgroundColor),
					paper: getComputedStyle(document.querySelector('.diagram-card .sheet svg')).backgroundColor,
				};
			});
			check(look.mat < 0.5, `area around the paper not dark (${look.mat})`);
			check(look.paper === 'rgb(255, 255, 255)', `paper ${look.paper}`);
			await darkPage.screenshot({ path: `${out}/soothing-dark.png` });
		} finally {
			await dark.close();
		}
	},
	// Job 449 (Soothing 3): "Edit as text" numbers its lines like the story; an error names that number (AK5–AK7)
	async 'text-numbers'() {
		const { ctx, page } = await open({ width: 1440, height: 900 });
		try {
			const story = page.locator('.workbench > .card:not(.diagram-card)');
			const numbers = await page.locator('.course > .line[data-line] .num-button').allInnerTexts();
			check(numbers.length > 3, `story numbers: ${numbers.length}`);
			await story.getByRole('button', { name: 'Edit as text' }).click();
			const editor = page.locator('.text-editor');
			const field = editor.locator('textarea');
			await field.waitFor({ state: 'visible' });
			await editor.locator('.t-status.ok').getByText(/recognised/).waitFor({ timeout: 30000 });
			const gutter = () => editor.locator('.gutter span').allInnerTexts();
			const text = (await field.inputValue()).split('\n');
			const g = await gutter();
			check(g.length === text.length, `gutter ${g.length} rows for ${text.length} lines`);
			check(JSON.stringify(g.filter((x) => x.trim())) === JSON.stringify(numbers), `gutter ${g.join(',')} vs story ${numbers.join(',')}`);
			const heads = text.map((l, i) => [l, i]).filter(([l]) => /^\s*((ELSE|SONST) )?→ /.test(l));
			check(heads.length >= 2, 'no path headings in the example');
			for (const [l, i] of heads) check(!g[i].trim(), `heading "${l.trim()}" has number ${g[i]}`);
			// AK6: field and layer in the same face, the instance font; each line as wide as in the field
			const fonts = await editor.locator('.fieldWrap').evaluate((w) => {
				const ta = w.querySelector('textarea');
				const keys = ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'lineHeight'];
				const of = (el) => keys.map((k) => getComputedStyle(el)[k]).join('|');
				const want = of(ta);
				const odd = [...w.querySelectorAll('.color, .color *')].filter((el) => of(el) !== want).map((el) => `${el.className}: ${of(el)}`);
				const c = document.createElement('canvas').getContext('2d');
				const s = getComputedStyle(ta);
				c.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
				const widths = [...w.querySelectorAll('.color .tz')].map((tz, i) => {
					const line = ta.value.split('\n')[i] ?? '';
					if (!line.trim()) return 0;
					const r = document.createRange();
					r.selectNodeContents(tz);
					return Math.abs(r.getBoundingClientRect().width - c.measureText(line).width);
				});
				return { want, odd, worst: Math.max(0, ...widths) };
			});
			check(!fonts.odd.length, `layer differs from the field: ${fonts.odd[0]}`);
			check(!/mono/i.test(fonts.want), `field in mono: ${fonts.want}`);
			check(fonts.worst <= 1, `a line of the layer is ${fonts.worst.toFixed(2)} px off the field`);
			// AK5: a typo in a move names the number the story shows on that line
			const at = text.findIndex((l) => /^\s*END: /.test(l));
			check(at > 0 && g[at].trim(), `no numbered END line: ${at}`);
			const typo = [...text];
			typo[at] = typo[at].replace('END:', 'ENDD:');
			await field.fill(typo.join('\n'));
			const notice = editor.locator('.so-notice--danger');
			await notice.waitFor({ timeout: 30000 });
			const said = (await notice.innerText()).replace(/\s+/g, ' ');
			check(said.includes(`Not taken over: Line ${g[at].trim()}`), `notice: ${said}`);
			check(await editor.locator('.so-chip--danger', { hasText: 'Not taken over' }).count() === 1, 'no chip "Not taken over"');
			const marked = await editor.locator('.color .tz').evaluateAll((els) => els.map((e, i) => (e.classList.contains('missing') ? i : -1)).filter((i) => i >= 0));
			check(JSON.stringify(marked) === JSON.stringify([at]), `marked lines ${marked} instead of ${at}`);
			check((await gutter())[at].trim() === g[at].trim(), 'the number of the line changed with the typo');
			await page.screenshot({ path: `${out}/text-numbers-desktop.png` });
		} catch (e) {
			await page.screenshot({ path: `${out}/text-numbers-red.png` });
			throw e;
		} finally {
			await ctx.close();
		}
		// AK7: the phone's full screen editor has the number column and the notice; the page does not overflow
		const { ctx: c, page: p } = await open(PHONE);
		try {
			await p.getByRole('button', { name: 'More actions' }).tap();
			await p.locator('.head-sheet').getByRole('button', { name: 'Edit as text', exact: true }).tap();
			const ed = p.locator('.text-editor.full');
			await ed.waitFor({ state: 'visible' });
			const field = ed.locator('textarea');
			const g = await ed.locator('.gutter span').allInnerTexts();
			check(g.some((x) => x.trim() === '1'), 'no number column on the phone');
			const col = await ed.locator('.gutter').boundingBox();
			check(col && col.width >= 28, `number column ${col?.width} px`);
			await field.fill((await field.inputValue()) + '\nQuatsch hier');
			await ed.locator('.so-notice--danger').waitFor({ timeout: 30000 });
			check(await ed.locator('.so-notice--danger').isVisible(), 'notice hidden on the phone');
			const over = await p.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
			check(over <= 0, `page ${over} px wider than the screen`);
			for (const b of await ed.locator('.editor-head button').all()) {
				const box = await b.boundingBox();
				check(box && box.height >= 44, `target ${box?.height} px`);
			}
			await p.screenshot({ path: `${out}/text-numbers-phone.png` });
		} catch (e) {
			await p.screenshot({ path: `${out}/text-numbers-phone-red.png` });
			throw e;
		} finally {
			await c.close();
		}
	},
	// Job 448 (Soothing 2): the story as a tree, numbers on the text's baseline, sentence parts, ⋯ and its menu, next move
	async 'soothing-story'() {
		const { ctx, page } = await open({ width: 1440, height: 900 });
		try {
			const story = page.locator('.workbench > .card:not(.diagram-card)');
			await story.getByRole('button', { name: 'Edit as text' }).click();
			const field = page.locator('.text-editor textarea');
			await field.waitFor({ state: 'visible' });
			// Two levels of questions; the last path is not told to its end, so "Next move" stays open
			await field.fill(['IT STARTS with a message: [Complaint arrives] at [@Service].', '[@Service] shall [Record complaint] in [#CRM].', 'IF [?Defect confirmed]', '→ yes:',
				'  IF [?Repair possible]', '  → yes:', '    [@Workshop] shall [Repair goods], deadline [!7 days].', '    MERGE.', '  ELSE → no:',
				'    [@Accounting] shall [Refund the amount of the complaint to the customer and close the case in the books] with [+Credit note].', '    END: [Refunded].',
				'  [@Store] shall [Return goods].', '  END: [Repaired].', 'ELSE → no:', '  [@Service] shall [Explain refusal].'].join('\n'));
			await page.locator('.text-editor').getByRole('button', { name: 'Apply', exact: true }).click();
			await page.waitForSelector('.course .line[data-line="10"]', { timeout: 10000 });
			await page.waitForTimeout(500);
			// (a) every number in the same column, on the baseline of its text (also two levels deep, also wrapped)
			const lines = await page.locator('.course > .line[data-line]').evaluateAll((els) => els.map((li) => {
				const num = li.querySelector('.num-button');
				const txt = li.querySelector('.txt');
				const r = document.createRange();
				r.selectNodeContents(num);
				const n = r.getClientRects()[0];
				r.selectNodeContents(txt);
				const t = [...r.getClientRects()].filter((x) => x.width > 0)[0];
				return { move: li.dataset.line, left: num.getBoundingClientRect().left, right: n.right, numBottom: n.bottom, txtBottom: t.bottom, lines: Math.round(txt.getBoundingClientRect().height / 24) };
			}));
			check(lines.length === 11, `${lines.length} numbered lines`);
			for (const l of lines) {
				check(Math.abs(l.right - lines[0].right) <= 1, `number of move ${l.move} not in the column (${l.right} / ${lines[0].right})`);
				check(Math.abs(l.numBottom - l.txtBottom) <= 2, `number of move ${l.move} off the text's baseline (${l.numBottom} / ${l.txtBottom})`);
			}
			check(lines.some((l) => l.lines >= 2), 'no wrapped line to measure');
			// (b) path names at their branch, no number; later answers name their question
			const heads = await page.locator('.course > .line.path-head').evaluateAll((els) => els.map((e) => ({ text: e.querySelector('.txt').textContent.replace(/\s+/g, ' ').trim(), num: !!e.querySelector('.num-button') })));
			check(heads.every((h) => !h.num), 'a path heading has a number');
			check(JSON.stringify(heads.map((h) => h.text)) === JSON.stringify(['yes', 'yes', 'Repair possible? → no', 'Defect confirmed? → no']), `path names ${JSON.stringify(heads)}`);
			// (c) the chosen line two levels deep colours its way, in the primary colour; another path stays grey
			await page.locator('.course .line[data-line="6"] .num-button').click();
			await page.waitForTimeout(500);
			const way = await page.evaluate(() => {
				const probe = document.createElement('span');
				probe.style.color = 'var(--color-primary-element)';
				document.querySelector('.story2bpmn-workshop').append(probe);
				const accent = getComputedStyle(probe).color;
				probe.remove();
				const hot = [...document.querySelectorAll('.course .rail.hot')].map((r) => getComputedStyle(r, '::before').borderLeftColor);
				const at = (m) => document.querySelectorAll(`.course .line[data-line="${m}"] .rail.hot`).length;
				const outerNo = [...document.querySelectorAll('.course > .line.path-head')].pop();
				return { accent, hot, six: at(6), ten: at(10), outerNo: outerNo.querySelectorAll('.rail.hot, .rail.tick').length, grey: getComputedStyle(outerNo.querySelector('.rail'), '::before').borderLeftColor };
			});
			check(way.six >= 1 && way.hot.length >= 5 && way.hot.every((c) => c === way.accent), `way of the chosen line ${JSON.stringify(way)}`);
			check(way.ten === 0 && way.outerNo === 0 && way.grey !== way.accent, `another path coloured ${JSON.stringify(way)}`);
			// (d) the legend
			check(/^Sentence parts:/.test((await story.locator('.key').textContent()).trim()), 'legend does not begin with "Sentence parts:"');
			// (e) readable parts in light and dark
			const contrast = () => page.evaluate(() => {
				const rgb = (c) => c.match(/[\d.]+/g).map(Number);
				const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
				const over = (fg, bg) => (fg.length < 4 ? fg : [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])));
				const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
				const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
				const card = rgb(getComputedStyle(document.querySelector('.workbench > .card:not(.diagram-card)')).backgroundColor);
				const out = {};
				for (const sel of ['.o-task', '.o-role', '.o-question', '.filler']) {
					const el = document.querySelector(`.course .line:not(.chosen) ${sel}`);
					const s = getComputedStyle(el);
					const bg = over(rgb(s.backgroundColor), card);
					out[sel] = Math.round(ratio(over(rgb(s.color), bg), bg) * 100) / 100;
				}
				return out;
			});
			for (const scheme of ['light', 'dark']) {
				await page.emulateMedia({ colorScheme: scheme });
				await page.waitForTimeout(300);
				const c = await contrast();
				check(Object.values(c).every((x) => x >= 4.5), `contrast ${scheme} ${JSON.stringify(c)}`);
				await page.screenshot({ path: `${out}/soothing-story-${scheme}.png` });
			}
			await page.emulateMedia({ colorScheme: 'light' });
			// (f) without fills (forced colours) a role shows its sign
			await page.emulateMedia({ forcedColors: 'active' });
			const sign = await page.locator('.course .o-role').first().evaluate((e) => getComputedStyle(e, '::before').content);
			check(sign === '"@"', `role sign in forced colours: ${sign}`);
			await page.emulateMedia({ forcedColors: 'none' });
			// (g) ⋯ only at a hovered line; the menu in groups, Delete last
			await page.mouse.move(1430, 5);
			await page.waitForTimeout(300);
			const more = page.locator('.course .line[data-line="1"] .more');
			check(await more.evaluate((e) => getComputedStyle(e).opacity) === '0', '⋯ shown at a line not hovered');
			await page.locator('.course .line[data-line="1"] .txt').hover();
			await page.waitForTimeout(300);
			check(await more.evaluate((e) => getComputedStyle(e).opacity) === '1', '⋯ not shown at the hovered line');
			await more.click();
			const menu = page.locator('.course .line[data-line="1"] .line-actions');
			await menu.waitFor({ state: 'visible' });
			const groups = await menu.locator('.menu-group').evaluateAll((els) => els.map((g) => [...g.querySelectorAll('button')].map((b) => ({ text: b.textContent.trim(), danger: b.classList.contains('danger') }))));
			const lastItem = groups.at(-1)?.at(-1);
			check(groups.length >= 2 && lastItem?.text === 'Delete' && lastItem.danger, `menu groups ${JSON.stringify(groups)}`);
			await more.click();
			// (h) next move: key fields in mono, 1 still opens the form
			const kbd = page.locator('.move .option kbd').first();
			check((await kbd.textContent()).trim() === '1' && /Plex Mono/.test(await kbd.evaluate((e) => getComputedStyle(e).fontFamily)), 'key field 1 not in mono');
			const forms = () => story.locator('form.form').count();
			const f0 = await forms();
			await page.locator('.story2bpmn-workshop .card-head h2').first().click();
			await page.keyboard.press('1');
			await page.waitForTimeout(500);
			check(await forms() > f0, 'key 1 opened no form');
		} catch (e) {
			await page.screenshot({ path: `${out}/soothing-story-red.png` });
			throw e;
		} finally {
			await ctx.close();
		}
	},
	// Job 396: the example process from the empty start page; on a phone also from the ⋯ sheet, unsaved changes asked about
	async example() {
		const ctx = await browser.newContext({ viewport: { width: 1512, height: 900 }, locale: 'en-US', storageState: state });
		const page = await ctx.newPage();
		try {
			await page.goto(`${url}/apps/story2bpmn/`);
			const see = page.getByRole('button', { name: 'See an example' });
			await see.waitFor({ state: 'visible', timeout: 30000 });
			// Laptop, tablet upright: the button is in view without scrolling, above the trigger form
			for (const [w, h] of [[1366, 768], [820, 1180], [1512, 900]]) {
				await page.setViewportSize({ width: w, height: h });
				await page.waitForTimeout(400);
				const box = await see.boundingBox();
				const form = await page.locator('.move .form').first().boundingBox();
				check(box && box.y >= 0 && box.y + box.height <= h, `"See an example" out of view at ${w} × ${h} (y ${box?.y})`);
				check(!form || box.y < form.y, `"See an example" below the form at ${w} × ${h}`);
			}
			await see.click();
			await page.waitForSelector('.story2bpmn-workshop .diagram-card svg', { state: 'attached', timeout: 30000 });
			await page.waitForTimeout(800);
			check(await page.locator('.workbench .line.choosable').count() === 14, `lines: ${await page.locator('.workbench .line.choosable').count()}`);
			check(await shown(page, '.example-note'), 'no note above the story');
			check(/For a process of your own: New\./.test(await page.locator('.example-note').textContent()), 'note does not name New');
			check(await page.locator('.head .unsaved').count() === 0, 'the example counts as unsaved');
			check(/Not saved yet/.test(await page.locator('.head .file').textContent()), 'head does not say "Not saved yet"');
			check(await page.getByRole('button', { name: 'See an example' }).count() === 0, '"See an example" left over a told story');
			await page.screenshot({ path: `${out}/example-1512.png` });
			const area = await page.locator('.diagram-card .sheet').first().evaluate((e) => { const r = e.parentElement.getBoundingClientRect(); return `${Math.round(r.width)} × ${Math.round(r.height)}`; }).catch(() => '?');
			check(await page.locator('.diagram-card .overview').count() === 0, `diagram does not fit at 1512 × 900 (area ${area})`);
			// The head keeps one row at 1366 and 1024 (no extra head button)
			for (const [w, h] of [[1366, 768], [1024, 768]]) {
				await page.setViewportSize({ width: w, height: h });
				await page.waitForTimeout(500);
				const tops = await page.locator('.head .file-buttons > *').evaluateAll((els) => els.filter((x) => x.getClientRects().length).map((x) => Math.round(x.getBoundingClientRect().top)));
				check(Math.max(...tops) - Math.min(...tops) < 20, `head buttons wrap at ${w} (tops ${tops.join(', ')})`);
			}
			// "New": the note goes, "See an example" is back
			await page.getByRole('button', { name: 'New', exact: true }).click();
			await page.waitForTimeout(600);
			check(await page.locator('.example-note').count() === 0, 'note left after New');
			check(await page.getByRole('button', { name: 'See an example' }).count() === 1, '"See an example" not back after New');
		} finally {
			await ctx.close();
		}
		const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'en-US', storageState: state });
		const p = await phone.newPage();
		try {
			await p.goto(`${url}/apps/story2bpmn/`);
			const see = p.getByRole('button', { name: 'See an example' });
			await see.waitFor({ state: 'visible', timeout: 30000 });
			await p.waitForTimeout(500);
			const box = await see.boundingBox();
			const bar = await p.locator('.phone-bar').boundingBox();
			check(box && bar && box.y + box.height <= bar.y, `button under the phone bar (${box?.y}+${box?.height} vs ${bar?.y})`);
			await see.tap();
			await p.waitForSelector('.example-note', { timeout: 30000 });
			check(/⋯ → New/.test(await p.locator('.example-note').textContent()), 'phone note does not name ⋯ → New');
			await p.screenshot({ path: `${out}/example-phone.png` });
			// Job 409 AK5: just opened, there is nothing to undo; after a change Undo takes it back
			const undoButton = p.locator('.phone-bar').getByRole('button', { name: 'Undo' });
			check(await undoButton.isDisabled(), 'Undo enabled right after opening the example');
			await reopenLast(p);
			check(await undoButton.isEnabled(), 'Undo disabled after a change');
			await undoButton.tap();
			await p.waitForFunction(() => ![...document.querySelectorAll('.workbench .line .txt')].some((e) => e.textContent.trim() === 'STILL OPEN.'), null, { timeout: 10000 });
			check(await p.locator('.workbench .line.choosable').count() === 14, `lines after Undo: ${await p.locator('.workbench .line.choosable').count()}`);
			check(await undoButton.isDisabled(), 'Undo enabled with nothing left to take back');
			// A change, then ⋯ → "Open example": asked first; Cancel keeps the changed story, Discard opens the example
			await reopenLast(p);
			const sheet = p.locator('.head-sheet');
			const dialog = p.getByRole('dialog', { name: 'Discard unsaved changes?' });
			await p.getByRole('button', { name: 'More actions' }).tap();
			await sheet.waitFor({ state: 'visible' });
			await sheet.getByRole('button', { name: 'Open example', exact: true }).tap();
			await dialog.waitFor({ state: 'visible', timeout: 5000 });
			check(await p.locator('.head-sheet').count() === 0, 'the ⋯ sheet stayed open');
			await dialog.getByRole('button', { name: 'Cancel' }).tap();
			await p.waitForTimeout(400);
			check(await stillOpen(p) === 1 && await p.locator('.head .unsaved').count() === 1, 'Cancel did not keep the changed story');
			await p.getByRole('button', { name: 'More actions' }).tap();
			await sheet.getByRole('button', { name: 'Open example', exact: true }).tap();
			await dialog.waitFor({ state: 'visible', timeout: 5000 });
			await dialog.getByRole('button', { name: 'Discard' }).tap();
			await p.waitForTimeout(800);
			check(await stillOpen(p) === 0 && await p.locator('.head .unsaved').count() === 0, 'Discard did not open the example');
		} finally {
			await phone.close();
		}
	},
	// Job 399: an unsaved state survives reloading (IndexedDB of the browser); Restore and Discard
	async draft() {
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'en-US', storageState: state });
		const p = await ctx.newPage();
		const note = p.locator('.draft-note');
		const lines = () => p.locator('.workbench .line.choosable').count();
		try {
			await p.goto(`${url}/apps/story2bpmn/`);
			const see = p.getByRole('button', { name: 'See an example' });
			await see.waitFor({ state: 'visible', timeout: 30000 });
			await see.tap();
			await p.waitForSelector('.example-note', { timeout: 30000 });
			await p.reload();
			await see.waitFor({ state: 'visible', timeout: 30000 });
			await p.waitForTimeout(800);
			check(await note.count() === 0, 'the unchanged example was kept');
			await see.tap();
			await p.waitForSelector('.example-note', { timeout: 30000 });
			await reopenLast(p);
			await p.waitForTimeout(800);
			await p.reload();
			await note.waitFor({ state: 'visible', timeout: 30000 });
			check(/Unsaved state from .+ found\./.test(await note.textContent()), `note: ${await note.textContent()}`);
			const box = await note.boundingBox();
			check(box && box.x >= 0 && box.x + box.width <= 390, `note overflows at 390 (${box?.x} + ${box?.width})`);
			for (const name of ['Restore', 'Discard']) {
				const b = await note.getByRole('button', { name, exact: true }).boundingBox();
				check(b && b.height >= 44 && b.x + b.width <= 390, `"${name}" ${b?.width} × ${b?.height}`);
				// Nothing lies over the button (the trigger sheet of the empty start waits for the decision)
				const free = await p.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.draft-note'), [b.x + 4, b.y + b.height - 4]);
				check(free, `"${name}" covered at its lower edge`);
			}
			check(!(await shown(p, '.move.as-sheet')), 'trigger sheet shown over the note');
			await p.screenshot({ path: `${out}/draft-phone.png` });
			await note.getByRole('button', { name: 'Restore', exact: true }).tap();
			await p.waitForTimeout(800);
			check(await stillOpen(p) === 1, 'restored state without its reopened end');
			check(await note.count() === 0, 'note left after Restore');
			check(await p.locator('.head .unsaved').count() === 1, 'restored state not shown as unsaved');
			// Still kept after restoring; Discard drops it for good
			await p.reload();
			await note.waitFor({ state: 'visible', timeout: 30000 });
			await note.getByRole('button', { name: 'Discard', exact: true }).tap();
			await p.waitForTimeout(600);
			check(await note.count() === 0 && await lines() === 0, 'Discard did not leave the empty start page');
			check(await shown(p, '.move.as-sheet'), 'trigger sheet not back after Discard');
			await p.reload();
			await see.waitFor({ state: 'visible', timeout: 30000 });
			await p.waitForTimeout(800);
			check(await note.count() === 0, 'note back after Discard');
		} finally {
			await ctx.close();
		}
		// A working file: the other diagram language, reload, Restore brings it back unsaved
		const { ctx: c, page } = await open({ width: 1366, height: 768 });
		try {
			const select = page.locator('.head select.language');
			const other = (await select.inputValue()) === 'de' ? 'en' : 'de';
			await select.selectOption(other);
			await page.waitForTimeout(800);
			await page.reload();
			const n = page.locator('.draft-note');
			await n.waitFor({ state: 'visible', timeout: 30000 });
			await n.getByRole('button', { name: 'Restore', exact: true }).click();
			await page.waitForTimeout(800);
			check(await select.inputValue() === other, `language after Restore: ${await select.inputValue()}`);
			check(await page.locator('.head .unsaved').count() === 1, 'restored file state not unsaved');
		} finally {
			await c.close();
		}
	},
	// Job 412: "Done" with the same story (here an empty line more) only closes, the file stays saved
	async textSame() {
		const { ctx, page: p } = await open(PHONE);
		const ed = p.locator('.text-editor.full');
		const field = ed.locator('textarea');
		const done = ed.getByRole('button', { name: 'Done', exact: true });
		const edit = async () => {
			await p.getByRole('button', { name: 'More actions' }).tap();
			await p.locator('.head-sheet').getByRole('button', { name: 'Edit as text', exact: true }).tap();
			await ed.waitFor({ state: 'visible' });
		};
		const finish = async (text) => {
			await field.fill(text);
			// The check of the typed text is in: Done is enabled (no page script, the CSP forbids eval)
			await ed.locator('.editor-head button.main:not([disabled])').waitFor({ state: 'visible', timeout: 30000 });
			await p.waitForTimeout(500);
			await done.tap();
			await ed.waitFor({ state: 'detached', timeout: 30000 });
		};
		try {
			check(await p.locator('.head .unsaved').count() === 0, 'opened file shown as unsaved');
			await edit();
			const start = await field.inputValue();
			await finish(`${start}\n\n`);
			check(await p.locator('.head .unsaved').count() === 0, 'Done with the same story made the file unsaved');
			// A real change still counts
			await edit();
			// The last step: no "continue at" leads to it
			const renamed = start.replace(/((?:shall|soll) \[)[^\]]+(?![\s\S]*(?:shall|soll) \[)/, '$1check it twice');
			check(renamed !== start, 'no step to rename in the example');
			await finish(renamed);
			check(await p.locator('.head .unsaved').count() === 1, 'a changed story is not unsaved');
		} finally {
			await p.screenshot({ path: `${out}/text-same-phone.png` });
			await ctx.close();
		}
	},
	// Job 406: "Edit as text" throws typed text away only on the second press, keeps it over a reload
	async textDiscard() {
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'en-US', storageState: state });
		const p = await ctx.newPage();
		const ed = p.locator('.text-editor.full');
		const field = ed.locator('textarea');
		const lines = () => p.locator('.workbench .line.choosable').count();
		const edit = async () => {
			await p.getByRole('button', { name: 'More actions' }).tap();
			await p.locator('.head-sheet').getByRole('button', { name: 'Edit as text', exact: true }).tap();
			await ed.waitFor({ state: 'visible' });
		};
		const typeLine = async () => {
			await field.focus();
			await field.press('Control+End');
			await field.type('\nAccounting shall check the invoice.');
		};
		try {
			await p.goto(`${url}/apps/story2bpmn/`);
			const see = p.getByRole('button', { name: 'See an example' });
			await see.waitFor({ state: 'visible', timeout: 30000 });
			await see.tap();
			await p.waitForSelector('.example-note', { timeout: 30000 });
			const before = await lines();
			// Nothing typed: Cancel closes at once
			await edit();
			await ed.getByRole('button', { name: 'Cancel', exact: true }).tap();
			await p.waitForSelector('.phone-bar');
			check(await ed.count() === 0, 'unchanged editor did not close on Cancel');
			// Typed: the first Cancel arms, the second discards
			await edit();
			await typeLine();
			await ed.getByRole('button', { name: 'Cancel', exact: true }).tap();
			const armed = ed.getByRole('button', { name: 'Really discard?', exact: true });
			check(await armed.count() === 1 && await ed.isVisible(), 'first Cancel closed the changed editor');
			check(/armed/.test(await armed.getAttribute('class')), 'Cancel not armed');
			// The head of the full-screen editor stays one row, Done fully on screen (390 px)
			const head = await ed.locator('.editor-head').boundingBox();
			const done = await ed.getByRole('button', { name: 'Done' }).boundingBox();
			check(head.height <= 60 && done.x + done.width <= 390, `editor head ${head.height} high, Done at ${done.x} + ${done.width}`);
			await p.screenshot({ path: `${out}/text-discard-phone.png` });
			await armed.tap();
			await p.waitForSelector('.phone-bar');
			check(await ed.count() === 0, 'second Cancel did not close');
			check(await lines() === before, `lines after discarding: ${await lines()}`);
			// Esc arms; a second Esc only disarms again (job 413), the armed button discards
			await edit();
			await typeLine();
			await field.press('Escape');
			check(await ed.isVisible() && await ed.getByRole('button', { name: 'Really discard?', exact: true }).count() === 1, 'first Esc closed the changed editor');
			await field.press('Escape');
			check(await ed.isVisible() && await ed.getByRole('button', { name: 'Cancel', exact: true }).count() === 1, 'second Esc did not disarm, or closed the editor');
			await field.press('Escape');
			await ed.getByRole('button', { name: 'Really discard?', exact: true }).tap();
			await p.waitForSelector('.phone-bar');
			check(await ed.count() === 0, 'armed Cancel after Esc did not close');
			// Typed text is unsaved and comes back after a reload
			await edit();
			await typeLine();
			check(await p.locator('.head .unsaved').count() === 1, 'typed text not shown as unsaved');
			await p.waitForTimeout(800);
			await p.reload();
			const note = p.locator('.draft-note');
			await note.waitFor({ state: 'visible', timeout: 30000 });
			await note.getByRole('button', { name: 'Restore', exact: true }).tap();
			await ed.waitFor({ state: 'visible', timeout: 10000 });
			check((await field.inputValue()).endsWith('Accounting shall check the invoice.'), 'typed text not restored');
			await ed.getByRole('button', { name: 'Cancel', exact: true }).tap();
			await ed.getByRole('button', { name: 'Really discard?', exact: true }).tap();
			await p.waitForSelector('.phone-bar');
		} finally {
			await ctx.close();
		}
		// Laptop: "New" and the diagram language ask before the typed text goes
		const { ctx: c, page } = await open({ width: 1366, height: 768 });
		try {
			const dialog = page.getByRole('dialog', { name: 'Discard unsaved changes?' });
			const editor = page.locator('.text-editor');
			await page.locator('.as-text').click();
			await editor.waitFor({ state: 'visible' });
			const f = editor.locator('textarea');
			await f.focus();
			await f.press('Control+End');
			await f.type('\nAccounting shall check the invoice.');
			const select = page.locator('.head select.language');
			const lang = await select.inputValue();
			await select.selectOption(lang === 'de' ? 'en' : 'de');
			await dialog.waitFor({ state: 'visible', timeout: 5000 });
			await dialog.getByRole('button', { name: 'Cancel' }).click();
			await page.waitForTimeout(300);
			check(await select.inputValue() === lang && await editor.isVisible(), 'cancelled language change did not keep language and editor');
			await page.locator('.head').getByRole('button', { name: 'New', exact: true }).click();
			await dialog.waitFor({ state: 'visible', timeout: 5000 });
			await dialog.getByRole('button', { name: 'Discard' }).click();
			await page.waitForTimeout(800);
			check(await editor.count() === 0, 'editor left after discarding through "New"');
			// Opening the flow behind a task in the diagram asks too; confirmed, the text is gone for good
			await page.locator('.as-text').click();
			await editor.waitFor({ state: 'visible' });
			await f.fill([
				'IT STARTS: [Order received] at [@Sales].',
				'[@Warehouse] shall [Ship goods], WITH SUBPROCESS.',
				'END: [Order done].',
				'SUBPROCESS [Ship goods]:',
				'IT STARTS.',
				'[@Warehouse] shall [Pack parcel].',
				'END: [Goods shipped].',
			].join('\n'));
			const apply = editor.getByRole('button', { name: 'Apply', exact: true });
			await editor.locator('.buttons .button.main:not([disabled])').waitFor({ timeout: 10000 });
			await apply.click();
			await editor.waitFor({ state: 'detached', timeout: 10000 });
			await page.locator('.as-text').click();
			await editor.waitFor({ state: 'visible' });
			await f.press('Control+End');
			await f.type('\nX');
			await page.locator('.diagram-card g[data-move]', { hasText: 'Ship' }).first().dblclick();
			await dialog.waitFor({ state: 'visible', timeout: 5000 });
			await dialog.getByRole('button', { name: 'Cancel' }).click();
			await page.waitForTimeout(300);
			check(await editor.isVisible() && (await f.inputValue()).endsWith('\nX'), 'cancelled level change lost the editor');
			await page.locator('.diagram-card g[data-move]', { hasText: 'Ship' }).first().dblclick();
			await dialog.waitFor({ state: 'visible', timeout: 5000 });
			await dialog.getByRole('button', { name: 'Discard' }).click();
			await page.locator('nav.crumbs').waitFor({ state: 'visible', timeout: 10000 });
			check(await editor.count() === 0, 'editor left after opening the flow behind it');
			// Back on the main level nothing asks: the typed text is no unsaved change any more
			await page.locator('nav.crumbs > button').first().click();
			await page.locator('nav.crumbs').waitFor({ state: 'detached', timeout: 10000 });
			check(await dialog.count() === 0, 'going back asked about a text that is gone');
		} finally {
			await c.close();
		}
	},
	// Job 408 AK8: "+ Insert before" in the ⋯ sheet offers more than a step; a decision takes the rest, its other path stays open
	async insertBefore() {
		const { ctx, page } = await open(PHONE);
		try {
			const open = () => page.locator('.workbench .line .txt', { hasText: /^\s*STILL OPEN\.\s*$/ }).count();
			const before = await open();
			const lines = await page.locator('.workbench .line.choosable').count();
			await page.locator('.workbench .line.choosable').nth(1).locator('.num').tap();
			await page.locator('.line-tap').getByRole('button', { name: 'More' }).tap();
			await page.getByRole('button', { name: '+ Insert before' }).tap();
			const sheet = page.locator('.move.as-sheet');
			await sheet.waitFor({ state: 'visible', timeout: 5000 });
			check(await sheet.locator('h3', { hasText: 'What comes before?' }).count() === 1, 'no "What comes before?" in the sheet');
			const option = sheet.locator('.before-choice .option', { hasText: 'It depends' });
			check(await option.count() === 1, 'no decision among the choices');
			const box = await option.boundingBox();
			check(box && box.height >= 44, `choice target ${box?.height} px high`);
			await option.tap();
			let n = 0;
			for (const f of await sheet.locator('input[type="text"], input:not([type])').all()) if (!(await f.inputValue())) await f.fill(`Urgent ${++n}`);
			await sheet.getByRole('button', { name: 'Apply' }).tap();
			await page.waitForFunction((want) => [...document.querySelectorAll('.workbench .line .txt')].filter((e) => e.textContent.trim() === 'STILL OPEN.').length === want, before + 1, { timeout: 10000 });
			check(await page.locator('.workbench .line.choosable').count() === lines + 2, 'not one decision line and one placeholder more');
			check(await open() === before + 1, 'no line "STILL OPEN." more');
		} finally {
			await ctx.close();
		}
	},
	// Job 410: a visible "Download" in the diagram card on laptop and tablet; on a subprocess level "Download the whole process"
	async download() {
		const head = (page) => page.locator('.diagram-card .card-head');
		const menu = (page) => page.locator('.diagram-card .download-menu .action-item__menutoggle');
		const fileOf = async (page, item, touch = false) => {
			const [d] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), touch ? page.getByRole('menuitem', { name: item }).tap() : page.getByRole('menuitem', { name: item }).click()]);
			return d.suggestedFilename();
		};
		// AK3: the head does not run out of the card
		const fits = async (page, w) => {
			const over = await head(page).evaluate((h) => {
				const card = h.closest('.card').getBoundingClientRect();
				return [...h.querySelectorAll('*')].filter((e) => e.getClientRects().length && e.getBoundingClientRect().right > card.right + 1).map((e) => e.className?.baseVal ?? e.className).slice(0, 3);
			});
			check(!over.length, `card head runs out at ${w}: ${over.join(', ')}`);
		};
		let mainName;
		for (const v of [{ width: 1366, height: 768 }, { width: 820, height: 1180, touch: true }]) {
			const { ctx, page } = await open(v);
			try {
				const b = menu(page);
				check(await b.count() === 1 && await b.isVisible(), `no visible download button at ${v.width}`);
				check((await b.innerText()).trim() === 'Download' && await b.locator('svg').count() >= 1, `download button text "${await b.innerText()}"`);
				check(await head(page).getByRole('button', { name: 'Actions' }).count() === 0, 'a ⋯ without words left in the card head');
				await fits(page, v.width);
				const item = (name) => page.getByRole('menuitem', { name });
				const openMenu = async () => {
					if (await item(/^Download PDF/).isVisible()) return;
					await (v.touch ? b.tap() : b.click());
					await item(/^Download PDF/).waitFor({ state: 'visible', timeout: 5000 });
				};
				await openMenu();
				await page.screenshot({ path: `${out}/download-${v.width}-menu.png` });
				for (const name of [/^Download PDF/, /^Download SVG/]) {
					check(await item(name).count() === 1, `no ${name} in the menu`);
					// Finger and pen: entries at least 44 px high
					const box = await item(name).boundingBox();
					if (v.touch) check(box && box.height >= 44, `${name} ${box?.height} px high`);
				}
				const pdf = await fileOf(page, /^Download PDF/, v.touch);
				check(/\.pdf$/.test(pdf), `PDF named ${pdf}`);
				if (!mainName) mainName = pdf;
				await page.waitForTimeout(300);
				await openMenu();
				check(/\.svg$/.test(await fileOf(page, /^Download SVG/, v.touch)), 'SVG download not .svg');
				await page.screenshot({ path: `${out}/download-${v.width}.png` });
			} finally {
				await ctx.close();
			}
		}
		const { ctx, page } = await open({ width: 1366, height: 768 });
		try {
			await fits(page, 1366);
			await page.setViewportSize({ width: 1024, height: 768 });
			await page.waitForTimeout(400);
			await fits(page, 1024);
			await page.setViewportSize({ width: 1366, height: 768 });
			await page.waitForTimeout(400);
			// AK4: keyboard
			const b = menu(page);
			await b.focus();
			await page.keyboard.press('Enter');
			await page.getByRole('menuitem', { name: /^Download PDF/ }).waitFor({ state: 'visible', timeout: 5000 });
			await page.waitForTimeout(300);
			await page.keyboard.press('ArrowDown');
			await page.waitForTimeout(200);
			const focused = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
			check(/^Download (PDF|SVG)/.test(focused), `arrow key reached "${focused}"`);
			await page.keyboard.press('Escape');
			await page.waitForTimeout(300);
			check(await page.getByRole('menuitem', { name: /^Download PDF/ }).count() === 0 || !(await page.getByRole('menuitem', { name: /^Download PDF/ }).isVisible()), 'Esc did not close the menu');
			// AK2: a task with an empty subprocess, opened: "Download the whole process" loads the same file
			await page.locator('.workbench > .card:not(.diagram-card)').getByRole('button', { name: 'Edit as text' }).click({ timeout: 10000 }).catch(async (e) => { await page.screenshot({ path: `${out}/download-red-605.png` }); throw new Error('step 605: ' + e.message); });
			const field = page.locator('.text-editor textarea');
			await field.waitFor({ state: 'visible' });
			const text = await field.inputValue();
			const told = text.replace(/((?:shall|soll) \[[^\]\n]+\])\./, '$1, WITH SUBPROCESS.');
			check(told !== text, 'no task line to give a subprocess');
			await field.fill(told);
			await page.locator('.text-editor').getByRole('button', { name: 'Apply', exact: true }).click({ timeout: 10000 }).catch(async (e) => { await page.screenshot({ path: `${out}/download-red-612.png` }); throw new Error('step 612: ' + e.message); });
			const line = page.locator('.workbench .line.choosable', { hasText: /WITH SUBPROCESS|MIT TEILABLAUF/ }).first();
			await line.waitFor({ state: 'visible', timeout: 10000 });
			await line.locator('.num').click({ timeout: 10000 }).catch(async (e) => { await page.screenshot({ path: `${out}/download-red-615.png` }); throw new Error('step 615: ' + e.message); });
			await page.locator('.diagram-card').getByRole('button', { name: 'Open the flow behind it' }).click({ timeout: 10000 }).catch(async (e) => { await page.screenshot({ path: `${out}/download-red-616.png` }); throw new Error('step 616: ' + e.message); });
			await page.waitForFunction(() => /subprocess/i.test(document.querySelector('#story2bpmn-h-diagram')?.textContent ?? ''), null, { timeout: 10000 });
			check(await page.locator('.level-note').count() === 0, 'the hint text is still there');
			const s = menu(page);
			check((await s.innerText()).trim() === 'Download the whole process', `subprocess button "${await s.innerText()}"`);
			check(!(await s.isDisabled()), 'download disabled on the empty subprocess level');
			await fits(page, 1366);
			await s.click({ timeout: 10000 }).catch(async (e) => { await page.screenshot({ path: `${out}/download-red-623.png` }); throw new Error('step 623: ' + e.message); });
			const subName = await fileOf(page, /^Download PDF/);
			check(subName === mainName, `subprocess level gave ${subName}, main level ${mainName}`);
			await page.screenshot({ path: `${out}/download-sub.png` });
		} finally {
			await ctx.close();
		}
	},
	// Job 413: an armed "Really …?" button returns to normal after 4 s, at a press elsewhere and at Esc
	async armed() {
		const { ctx, page } = await open({ width: 1366, height: 900 });
		try {
			const lines = () => page.locator('.workbench .line.choosable').count();
			const actions = page.locator('.line-actions');
			const del = actions.locator('button', { hasText: /^\s*(Delete|Really delete\?|Delete the exception too\?)\s*$/ });
			const isArmed = async () => /\barmed\b/.test((await del.getAttribute('class')) ?? '');
			// The first line whose ⋯ offers "Delete"
			let found = false;
			for (const more of await page.locator('[data-menu]').all()) {
				await more.click();
				if (await del.count() === 1) {
					found = true;
					break;
				}
				await more.click();
			}
			check(found, 'no line offers Delete');
			await del.click();
			check(await isArmed(), 'first click did not arm Delete');
			await page.waitForTimeout(4300);
			check(!(await isArmed()) && (await del.innerText()).trim() === 'Delete', 'Delete still armed after 4 s');
			await del.click();
			await page.locator('#story2bpmn-h-story').click();
			check(!(await isArmed()), 'a click elsewhere did not disarm');
			await del.click();
			await page.keyboard.press('Escape');
			check(!(await isArmed()) && await actions.isVisible(), 'Esc did not disarm, or closed the actions');
			const before = await lines();
			await del.click();
			await del.click();
			await page.waitForFunction((n) => document.querySelectorAll('.workbench .line.choosable').length < n, before, { timeout: 10000 });
			// "Edit as text": Esc disarms; the second press on "Edit as text" still discards
			const editor = page.locator('.text-editor');
			await page.locator('.as-text').click();
			await editor.waitFor({ state: 'visible' });
			const f = editor.locator('textarea');
			await f.focus();
			await f.press('Control+End');
			await f.type('\nAccounting shall check the invoice.');
			const cancel = editor.getByRole('button', { name: /^(Cancel|Really discard\?)$/ });
			await cancel.click();
			check((await cancel.innerText()).trim() === 'Really discard?', 'Cancel not armed');
			await page.keyboard.press('Escape');
			check((await cancel.innerText()).trim() === 'Cancel' && await editor.isVisible(), 'Esc did not disarm Cancel');
			await page.locator('.as-text').click();
			check((await cancel.innerText()).trim() === 'Really discard?', '"Edit as text" did not arm Cancel');
			await page.locator('.as-text').click();
			await page.waitForTimeout(500);
			check(await editor.count() === 0, 'second "Edit as text" did not discard');
		} finally {
			await ctx.close();
		}
		// Phone: the armed sheet entry disarms at a tap elsewhere in the sheet, the second tap deletes
		const { ctx: c, page: p } = await open(PHONE);
		try {
			const sheet = p.locator('.bottom-sheet');
			const del = sheet.locator('.sheet-item', { hasText: /^\s*(Delete|Really delete\?|Delete the exception too\?)\s*$/ });
			let found = false;
			const count = await p.locator('.workbench .line.choosable').count();
			for (let i = 1; i < count && !found; i++) {
				await p.locator('.workbench .line.choosable').nth(i).locator('.num').tap();
				const more = p.locator('.line-tap').getByRole('button', { name: 'More' });
				if (!(await more.isVisible())) continue;
				await more.tap();
				if (await del.count() === 1) found = true;
				else await p.keyboard.press('Escape');
			}
			check(found, 'no line offers Delete on the phone');
			await del.tap();
			check(/\barmed\b/.test(await del.getAttribute('class')), 'first tap did not arm');
			await sheet.locator('.sheet-head h3').tap();
			check(!/\barmed\b/.test(await del.getAttribute('class')), 'a tap elsewhere in the sheet did not disarm');
			const before = await p.locator('.workbench .line.choosable').count();
			await del.tap();
			await del.tap();
			await p.waitForFunction((n) => document.querySelectorAll('.workbench .line.choosable').length < n, before, { timeout: 10000 });
		} finally {
			await c.close();
		}
	},
	// Job 414: deleting a step a "continue at" leads to names that line, lights it up, a click on the message goes there
	async refusalLine() {
		const STORY = [
			'IT STARTS: [Invoice arrives] at [@Accounting].',
			'[@Accounting] shall [Check invoice].',
			'IF [?Amount correct]',
			'→ yes:',
			'  [@Accounting] shall [Pay invoice].',
			'  END: [Invoice paid].',
			'ELSE → no:',
			'  [@Accounting] shall [Ask supplier].',
			'  CONTINUE AT [Pay invoice].',
		].join('\n');
		const WANT = /^\s*Line 7 still leads to “Pay invoice” – change it there first\s*$/;
		const flashed = (page) => page.locator('.workbench .line[data-line="6"].flash').count();
		/** The story as text through the editor, then Done once its check is in. */
		const tellText = async (page, phone) => {
			if (phone) {
				await page.getByRole('button', { name: 'More actions' }).tap();
				await page.locator('.head-sheet').getByRole('button', { name: 'Edit as text', exact: true }).tap();
			} else await page.locator('.as-text').click();
			const ed = page.locator('.text-editor');
			await ed.waitFor({ state: 'visible' });
			await ed.locator('textarea').fill(STORY);
			const label = phone ? /^\s*Done\s*$/ : /^\s*Apply\s*$/;
			const done = ed.locator('button:not([disabled])', { hasText: label }).first();
			await done.waitFor({ state: 'visible', timeout: 30000 });
			await page.waitForTimeout(500);
			if (phone) await done.tap();
			else await done.click();
			await ed.waitFor({ state: 'detached', timeout: 30000 });
			await page.locator('.workbench .line[data-line="6"]').waitFor({ state: 'attached', timeout: 10000 });
		};
		const checkRefusal = async (page, name) => {
			const jump = page.locator('.messages .jump');
			await jump.waitFor({ state: 'visible', timeout: 10000 });
			check(WANT.test(await jump.innerText()), `${name}: message "${await jump.innerText()}"`);
			check(await page.locator('.workbench .line.choosable').count() === 7, `${name}: the step went anyway`);
			check(await flashed(page) === 1, `${name}: line 7 not lit up`);
			const box = await jump.boundingBox();
			const width = page.viewportSize().width;
			check(box && box.x >= 0 && box.x + box.width <= width, `${name}: message runs out of the screen`);
			await page.waitForTimeout(2500);
			check(await flashed(page) === 0, `${name}: line 7 still lit after 2 s`);
			return jump;
		};
		const inView = async (page) => {
			const b = await page.locator('.workbench .line[data-line="6"]').boundingBox();
			return b && b.y >= 0 && b.y + b.height <= page.viewportSize().height;
		};
		// Laptop: ⋯ of line 4 → Delete twice; click on the message: line 7 in view, its ⋯ focused, lit again
		{
			const { ctx, page } = await open({ width: 1366, height: 900 });
			try {
				await tellText(page, false);
				await page.locator('[data-menu="3"]').click();
				const del = page.locator('.line-actions').locator('button', { hasText: /^\s*(Delete|Really delete\?)\s*$/ });
				await del.click();
				await del.click();
				const jump = await checkRefusal(page, 'laptop');
				await jump.click();
				await page.waitForTimeout(400);
				check(await flashed(page) === 1, 'laptop: line 7 not lit after the click');
				check(await inView(page), 'laptop: line 7 not in view');
				check(await page.evaluate(() => document.activeElement?.getAttribute('data-menu')) === '6', 'laptop: ⋯ of line 7 not focused');
				// Keyboard: the message is a button, Enter goes there as well
				await jump.focus();
				await page.keyboard.press('Enter');
				await page.waitForTimeout(400);
				check(await page.evaluate(() => document.activeElement?.getAttribute('data-menu')) === '6', 'laptop: Enter did not go to line 7');
			} finally {
				await page.screenshot({ path: `${out}/refusal-laptop.png` });
				await ctx.close();
			}
		}
		// Phone: line 4 → More → Delete twice in the sheet; a tap on the message brings line 7 into view
		const { ctx, page: p } = await open(PHONE);
		try {
			await tellText(p, true);
			await p.locator('.workbench .line[data-line="3"] .num').tap();
			const more = p.locator('.line-tap').getByRole('button', { name: 'More' });
			if (!(await more.isVisible())) await p.locator('.workbench .line[data-line="3"] .num').tap();
			await more.tap();
			const del = p.locator('.bottom-sheet .sheet-item', { hasText: /^\s*(Delete|Really delete\?)\s*$/ });
			await del.tap();
			await del.tap();
			const jump = await checkRefusal(p, 'phone');
			const box = await jump.boundingBox();
			check(box.height >= 44, `phone: message ${box.height} px high`);
			await jump.tap();
			await p.waitForTimeout(600);
			check(await flashed(p) === 1, 'phone: line 7 not lit after the tap');
			check(await inView(p), 'phone: line 7 not in view');
		} finally {
			await p.screenshot({ path: `${out}/refusal-phone.png` });
			await ctx.close();
		}
	},
	// AK7: screenshots dark and 360 × 780
	async shots() {
		for (const [v, name] of [[{ ...PHONE, scheme: 'dark' }, 'phone-390-dark'], [{ width: 360, height: 780, touch: true }, 'phone-360']]) {
			const { ctx, page } = await open(v);
			try {
				check(await shown(page, '.phone-bar'), `no bar for ${name}`);
				await page.screenshot({ path: `${out}/${name}.png` });
			} finally {
				await ctx.close();
			}
		}
	},
	// Job 415: the phone shows the save state (a point at Save) and the file name (first line of the ⋯ sheet).
	// Last case: it saves the shared working file.
	async savestate() {
		const point = (page) => page.locator('.head .file-buttons .save-point');
		const sheetFile = async (page) => {
			await page.getByRole('button', { name: 'More actions' }).tap();
			const sheet = page.locator('.head-sheet');
			await sheet.waitFor({ state: 'visible' });
			const first = await sheet.locator('.sheet-body > *').first().evaluate((e) => e.classList.contains('sheet-file'));
			const text = (await sheet.locator('.sheet-file').textContent()).trim();
			await sheet.getByRole('button', { name: 'Close' }).tap();
			await sheet.waitFor({ state: 'detached' });
			return { first, text };
		};
		// Laptop: no point, the head shows the hint as before
		const { ctx: lc, page: lp } = await open({ width: 1280, height: 800 });
		try {
			// typed text counts as unsaved (job 406)
			await lp.locator('.as-text').click();
			const f = lp.locator('.text-editor textarea');
			await f.waitFor({ state: 'visible' });
			await f.focus();
			await f.press('Control+End');
			await f.type('\nAccounting shall check the invoice.');
			await lp.waitForTimeout(400);
			check(await shown(lp, '.head .unsaved'), 'laptop: no "Unsaved changes" in the head after typing');
			check(await point(lp).count() === 0, 'laptop: point at Save');
		} finally {
			await lc.close();
		}
		const { ctx, page } = await open(PHONE);
		try {
			check(await point(page).count() === 0, 'point at Save right after opening');
			let s = await sheetFile(page);
			check(s.first && s.text === FILE, `⋯ sheet does not start with the file name (${s.first}, "${s.text}")`);
			await reopenLast(page);
			const p = point(page);
			check(await p.isVisible(), 'no point at Save after a change');
			check(await p.count() === 1 && await p.getAttribute('role') === 'img' && await p.getAttribute('aria-label') === 'Unsaved changes', 'point not one img "Unsaved changes"');
			const [pc, wc] = await page.evaluate(() => {
				const probe = document.createElement('span');
				probe.className = 'unsaved';
				document.querySelector('.story2bpmn-workshop').appendChild(probe);
				const want = getComputedStyle(probe).color;
				probe.remove();
				return [getComputedStyle(document.querySelector('.save-point')).backgroundColor, want];
			});
			check(pc === wc, `point colour ${pc}, hint colour ${wc}`);
			const save = page.locator('.head .file-buttons .phone-keep:not(.head-more)');
			const b = await save.boundingBox();
			check(b.width >= 44 && b.height >= 44, `Save button ${b.width} × ${b.height}`);
			s = await sheetFile(page);
			check(s.text === FILE, `⋯ sheet lost the file name after a change ("${s.text}")`);
			await page.screenshot({ path: `${out}/phone-savestate.png` });
			// a tap in the middle of the button saves: the point does not catch it
			await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
			await p.waitFor({ state: 'detached', timeout: 15000 });
			// "New": nothing told yet, the sheet says so
			await page.getByRole('button', { name: 'More actions' }).tap();
			await page.locator('.head-sheet').getByRole('button', { name: 'New', exact: true }).tap();
			await page.waitForTimeout(800);
			const dialog = page.getByRole('dialog', { name: 'Discard unsaved changes?' });
			if (await dialog.count()) await dialog.getByRole('button', { name: 'Discard' }).tap();
			check(await point(page).count() === 0, 'point at Save after New');
			s = await sheetFile(page);
			check(s.first && s.text === 'Not saved yet', `⋯ sheet after New says "${s.text}"`);
		} finally {
			await ctx.close();
		}
	},
	// Job 432 AK8: approval details in the file that Nextcloud does not confirm: a hint, no "Valid" pill.
	async unconfirmed() {
		const example = readFileSync(process.env.S2B_E2E_FILE, 'utf8');
		for (const [label, view] of [['laptop', { width: 1366, height: 900 }], ['phone', PHONE]]) {
			const id = await upload(`Forged ${label}.bpmn`, approvedXml(example));
			const { ctx, page } = await open({ ...view, id });
			try {
				const hint = page.locator('.approval-notice.notice-unconfirmed');
				await hint.waitFor({ timeout: 10000 });
				const text = (await hint.textContent()).trim();
				check(/not confirmed by Nextcloud/.test(text), `${label}: hint reads "${text}"`);
				const pills = await page.locator('.pill').allTextContents();
				check(!pills.some((t) => /Valid/.test(t)), `${label}: pills ${JSON.stringify(pills)}`);
				await page.screenshot({ path: `${out}/unconfirmed-${label}.png` });
			} finally {
				await ctx.close();
			}
		}
	},
	// Job 416 AK2–AK4: "Accept"/"Reject" are two-step; locked while there are unsaved changes.
	async decide() {
		const example = readFileSync(process.env.S2B_E2E_FILE, 'utf8');
		for (const [label, view] of [['laptop', { width: 1366, height: 900 }], ['phone', PHONE]]) {
			const name = `Proposal ${label}.bpmn`;
			const xml = approvedXml(example);
			const id = await upload(name, xml);
			await confirmOn(id, name, xml);
			await proposeOn(id);
			const { ctx, page } = await open({ ...view, id });
			const press = (l) => (view.touch ? l.tap() : l.click());
			const openSidebar = async () => {
				if (view.touch) {
					await page.getByRole('button', { name: 'More actions' }).tap();
					await page.locator('.head-sheet').getByRole('button', { name: /^Proposals/ }).tap();
				} else {
					await page.getByRole('button', { name: /^Proposals/ }).first().click();
				}
				await page.locator('.story2bpmn-sidebar .proposal').first().waitFor({ timeout: 10000 });
			};
			try {
				await openSidebar();
				const card = page.locator('.story2bpmn-sidebar .proposal').first();
				const accept = card.locator('[data-decide$=":accepted"]');
				const reject = card.locator('[data-decide$=":rejected"]');
				const before = await fileText(name);
				const comments = await commentCount(id);
				// First press arms only: nothing written, no comment
				await press(accept);
				check((await accept.textContent()).trim() === 'Really accept?', `${label}: accept armed reads "${(await accept.textContent()).trim()}"`);
				const box = await accept.boundingBox();
				check(box && (!view.touch || box.height >= 44) && box.x + box.width <= view.width, `${label}: armed button ${box?.width} × ${box?.height} at x ${box?.x}`);
				await page.screenshot({ path: `${out}/decide-${label}.png` });
				await page.waitForTimeout(800);
				check(await fileText(name) === before, `${label}: file written after the first press`);
				check(await commentCount(id) === comments, `${label}: comment sent after the first press`);
				// A press elsewhere disarms
				await press(card.locator('.who'));
				check((await accept.textContent()).trim() === 'Accept', `${label}: still armed after a press elsewhere`);
				// Reject is two-step as well; Esc disarms
				await press(reject);
				check((await reject.textContent()).trim() === 'Really reject?', `${label}: reject not armed`);
				await page.keyboard.press('Escape');
				check((await reject.textContent()).trim() === 'Reject', `${label}: still armed after Esc`);
				check(await fileText(name) === before && await commentCount(id) === comments, `${label}: reject decided without the second press`);
				if (view.touch) {
					// Unsaved changes lock deciding, with a hint; nothing is written
					await page.getByRole('button', { name: 'Back to the story' }).tap();
					await reopenLast(page);
					await openSidebar();
					check(await accept.isDisabled() && await reject.isDisabled(), `${label}: decision buttons not locked while unsaved`);
					check(await card.locator('.hint', { hasText: 'Save or discard your changes first' }).isVisible(), `${label}: no hint while unsaved`);
					await page.waitForTimeout(500);
					check(await fileText(name) === before, `${label}: file written while unsaved`);
					await page.getByRole('button', { name: 'Back to the story' }).tap();
					await page.locator('.phone-bar').getByRole('button', { name: 'Undo' }).tap();
					await page.waitForTimeout(500);
					await openSidebar();
					check(await accept.isEnabled(), `${label}: still locked after undo`);
				}
				// Second press on the armed button decides: the proposal goes, one comment more
				await press(accept);
				await press(accept);
				await page.locator('.story2bpmn-sidebar .proposal').first().waitFor({ state: 'detached', timeout: 15000 });
				check(await fileText(name) !== before, `${label}: file not written after accepting`);
				for (let i = 0; i < 20 && await commentCount(id) === comments; i++) await page.waitForTimeout(250);
				check(await commentCount(id) === comments + 1, `${label}: comments ${await commentCount(id)}, expected ${comments + 1}`);
			} finally {
				await ctx.close();
			}
		}
	},
	// Job 418 AK4–AK6: two fingers and Ctrl + wheel zoom only the diagram, around the anchor.
	async pinch() {
		{
			const { ctx, page } = await open({ width: 1024, height: 768, touch: true });
			try {
				const chosen = await page.locator('.workbench .line.chosen').count();
				const i = await anchorShape(page);
				const at = await shapeCentre(page, i);
				const before = await zoomPercent(page);
				await pinchAt(page, ctx, at, 40, 120);
				const wider = await zoomPercent(page);
				check(wider > before, `spreading: ${before} % → ${wider} %`);
				check(wider <= 300, `above 300 %: ${wider} %`);
				check(await page.evaluate(() => window.visualViewport.scale) === 1, 'the page zoomed');
				await anchored(page, i, at);
				await pinchAt(page, ctx, at, 150, 10);
				await pinchAt(page, ctx, at, 150, 10);
				const narrower = await zoomPercent(page);
				check(narrower < wider, `pinching: ${wider} % → ${narrower} %`);
				// Bounds: 50 % as with −, below only as far as Fit goes.
				await page.locator('.diagram-card .zoom').getByRole('button', { name: 'Fit' }).click();
				const fit = await zoomPercent(page);
				check(narrower >= Math.min(50, fit) - 1, `pinched to ${narrower} %, bound ${Math.min(50, fit)} %`);
				check(await page.evaluate(() => window.visualViewport.scale) === 1, 'the page zoomed while pinching');
				check(await page.locator('.workbench .line.chosen').count() === chosen, 'a pinch chose a line');
			} finally {
				await ctx.close();
			}
		}
		{
			const { ctx, page } = await open({ width: 1512, height: 900 });
			try {
				await page.evaluate(() => window.addEventListener('wheel', (e) => { window.__s2bWheel = e.defaultPrevented; }, { passive: true }));
				const i = await anchorShape(page);
				const at = await shapeCentre(page, i);
				const before = await zoomPercent(page);
				await page.mouse.move(at.x, at.y);
				await page.keyboard.down('Control');
				await page.mouse.wheel(0, -120);
				await page.keyboard.up('Control');
				await page.waitForTimeout(400);
				const wider = await zoomPercent(page);
				check(wider > before, `Ctrl + wheel: ${before} % → ${wider} %`);
				check(await page.evaluate(() => window.__s2bWheel) === true, 'Ctrl + wheel not kept from the page');
				await anchored(page, i, at);
				// A plain wheel still pans.
				const mat = page.locator('.diagram-card .mat');
				const top = await mat.evaluate((m) => m.scrollTop + m.scrollLeft);
				// Toward a side the area can still pan to.
				const room = await mat.evaluate((m) => ({ down: m.scrollTop < m.scrollHeight - m.clientHeight - 1, up: m.scrollTop > 0, right: m.scrollLeft < m.scrollWidth - m.clientWidth - 1 }));
				check(room.down || room.up || room.right, 'nothing to pan after zooming in');
				await page.mouse.wheel(room.down || room.up ? 0 : 120, room.down ? 120 : room.up ? -120 : 0);
				await page.waitForTimeout(400);
				check(await zoomPercent(page) === wider, 'a plain wheel zoomed');
				check(await page.evaluate(() => window.__s2bWheel) === false, 'a plain wheel kept from the page');
				check(await mat.evaluate((m) => m.scrollTop + m.scrollLeft) !== top, 'a plain wheel did not pan');
			} finally {
				await ctx.close();
			}
		}
	},
	// Job 431: no zoom controls and no Follow while there is no diagram; locked buttons look locked
	async emptyZoom() {
		const look = (l) => l.evaluate((e) => { const s = getComputedStyle(e); return `${s.backgroundColor} / ${s.color}`; });
		for (const v of [{ width: 1366, height: 768 }, { width: 820, height: 1180, touch: true }]) {
			const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, hasTouch: !!v.touch, isMobile: !!v.touch, locale: 'en-US', storageState: state });
			const page = await ctx.newPage();
			try {
				await page.goto(`${url}/apps/story2bpmn/`);
				const see = page.getByRole('button', { name: 'See an example' });
				await see.waitFor({ state: 'visible', timeout: 30000 });
				await page.waitForTimeout(400);
				const card = page.locator('.diagram-card');
				const zoom = card.locator('.zoom');
				const follow = card.locator('.card-head .follow');
				check(!await zoom.isVisible() && !await follow.isVisible(), `zoom or Follow shown without a diagram at ${v.width}`);
				check(await card.locator('.zoom output').evaluate((e) => getComputedStyle(e).visibility) === 'hidden', `"–" shown without a diagram at ${v.width}`);
				// Locked looks locked: the pressed Fit looks like the locked Zoom out
				const fit = zoom.getByRole('button', { name: 'Fit', includeHidden: true });
				const out1 = zoom.getByRole('button', { name: 'Zoom out', includeHidden: true });
				if (v.width === 1366) check(await look(fit) === await look(out1), `locked Fit looks different from locked Zoom out (${await look(fit)} vs ${await look(out1)})`);
				// The room stays: the zoom group keeps its size and its place next to Follow with the first diagram
				// (The example brings the node count and "Ask for approval", which may wrap the row: measure the zoom group against Follow before it.)
				const f0 = await follow.boundingBox();
				const z0 = await zoom.boundingBox();
				check(z0 && z0.width > 0, `the zoom group keeps no room at ${v.width}`);
				await see.click();
				await page.waitForSelector('.story2bpmn-workshop .diagram-card svg', { state: 'attached', timeout: 30000 });
				await page.waitForTimeout(800);
				check(await zoom.isVisible() && await follow.isVisible(), `zoom or Follow missing with a diagram at ${v.width}`);
				const z1 = await zoom.boundingBox();
				const f1 = await follow.boundingBox();
				check(Math.abs(z1.width - z0.width) <= 1 && Math.abs(z1.height - z0.height) <= 1 && Math.abs((z1.y - f1.y) - (z0.y - f0.y)) <= 1 && Math.abs((z1.x - f1.x) - (z0.x - f0.x)) <= 1 && Math.abs(f1.width - f0.width) <= 1, `the zoom group moved next to Follow at ${v.width} (${z0.width} × ${z0.height} at +${z0.x - f0.x},${z0.y - f0.y} → ${z1.width} × ${z1.height} at +${z1.x - f1.x},${z1.y - f1.y})`);
			} catch (e) {
				await page.screenshot({ path: `${out}/emptyZoom-${v.width}-red.png` });
				throw e;
			} finally {
				await ctx.close();
			}
		}
		// Phone: Fit and Follow (diagram head since job 450) only with a diagram; the segment of the bar stays where it is
		const ctx = await browser.newContext({ viewport: { width: PHONE.width, height: PHONE.height }, hasTouch: true, isMobile: true, locale: 'en-US', storageState: state });
		const p = await ctx.newPage();
		try {
			await p.goto(`${url}/apps/story2bpmn/`);
			await p.getByRole('button', { name: 'See an example' }).waitFor({ state: 'visible', timeout: 30000 });
			const bar = p.locator('.phone-bar');
			const seg = bar.locator('.segment');
			const s0 = await seg.boundingBox();
			await bar.getByRole('tab', { name: 'Diagram' }).tap();
			await p.waitForTimeout(400);
			const dhead = p.locator('.diagram-card .card-head');
			const fit = dhead.getByRole('button', { name: 'Fit', includeHidden: true });
			const follow = dhead.getByRole('button', { name: 'Follow', includeHidden: true });
			check(!await fit.isVisible() && !await follow.isVisible(), 'Fit or Follow shown without a diagram');
			const zout = dhead.getByRole('button', { name: 'Zoom out', includeHidden: true });
			check(await look(zout) === await look(fit), `locked Zoom out looks different from locked Fit (${await look(zout)} vs ${await look(fit)})`);
			const s1 = await seg.boundingBox();
			check(Math.abs(s1.x - s0.x) <= 1 && Math.abs(s1.width - s0.width) <= 1, `the segment moved (${s0.x} → ${s1.x})`);
			await bar.getByRole('tab', { name: 'Story' }).tap();
			await p.getByRole('button', { name: 'See an example' }).tap();
			await p.waitForSelector('.example-note', { timeout: 30000 });
			await bar.getByRole('tab', { name: 'Diagram' }).tap();
			await p.waitForTimeout(800);
			check(await fit.isVisible() && await follow.isVisible(), 'Fit or Follow missing with a diagram');
		} catch (e) {
			await p.screenshot({ path: `${out}/emptyZoom-phone-red.png` });
			throw e;
		} finally {
			await ctx.close();
		}
	},
	// Job 423: the diagram area by keyboard, and the reason under a locked "Publish"
	async keyboard() {
		// Its own copy: the cases before may have saved changes into the shared file.
		const id = await upload('Keyboard.bpmn');
		const { ctx, page } = await open({ width: 1366, height: 768, id });
		try {
			const mat = page.locator('.diagram-card .mat');
			const card = page.locator('.diagram-card');
			check(await mat.getAttribute('aria-label') === 'Diagram', `area label "${await mat.getAttribute('aria-label')}"`);
			check(await mat.getAttribute('role') === 'group', 'area has no role group');
			// AK3: Tab reaches the area (after the buttons of the card head), with a visible focus ring
			await card.locator('.download-menu button').first().focus();
			let reached = false;
			for (let i = 0; i < 12 && !reached; i++) {
				await page.keyboard.press('Tab');
				reached = await mat.evaluate((m) => document.activeElement === m);
			}
			check(reached, 'Tab does not reach the diagram area');
			check(await mat.evaluate((m) => m.matches(':focus-visible') && getComputedStyle(m).outlineStyle !== 'none' && parseFloat(getComputedStyle(m).outlineWidth) >= 2), 'no focus ring on the area');
			// + and − zoom (around the middle), 0 fits
			const p0 = await zoomPercent(page);
			await page.keyboard.press('+');
			await page.waitForTimeout(300);
			const p1 = await zoomPercent(page);
			check(p1 > p0, `+ : ${p0} % → ${p1} %`);
			await page.keyboard.press('-');
			await page.waitForTimeout(300);
			const p2 = await zoomPercent(page);
			check(p2 < p1, `- : ${p1} % → ${p2} %`);
			// Ctrl + + is the browser's: the app zoom stays
			await page.keyboard.press('Control+Equal');
			await page.waitForTimeout(300);
			check(await zoomPercent(page) === p2, 'Ctrl + = zoomed the diagram');
			await page.keyboard.press('+');
			await page.keyboard.press('+');
			await page.waitForTimeout(300);
			// Arrows pan
			const s0 = await mat.evaluate((m) => ({ left: m.scrollLeft, top: m.scrollTop, maxL: m.scrollWidth - m.clientWidth, maxT: m.scrollHeight - m.clientHeight }));
			check(s0.maxL > 60 || s0.maxT > 60, `nothing to pan at ${await zoomPercent(page)} %`);
			if (s0.maxL > 60) {
				await mat.evaluate((m) => { m.scrollLeft = 0; });
				await page.keyboard.press('ArrowRight');
				await page.waitForTimeout(200);
				check(await mat.evaluate((m) => m.scrollLeft) >= 50, 'ArrowRight did not pan');
			}
			if (s0.maxT > 60) {
				await mat.evaluate((m) => { m.scrollTop = 0; });
				await page.keyboard.press('ArrowDown');
				await page.waitForTimeout(200);
				check(await mat.evaluate((m) => m.scrollTop) >= 50, 'ArrowDown did not pan');
			}
			await page.keyboard.press('0');
			await page.waitForTimeout(300);
			check(await card.locator('.zoom button[aria-pressed]').getAttribute('aria-pressed') === 'true', '0 did not fit');
			// Enter: the chosen line's shape comes into view, also with Follow off
			await page.keyboard.press('+');
			await page.keyboard.press('+');
			await page.keyboard.press('+');
			await page.waitForTimeout(300);
			await page.locator('.workbench .line.choosable').nth(1).locator('.num').click();
			await page.waitForTimeout(800);
			await card.locator('.follow').click();
			await mat.evaluate((m) => m.scrollTo(m.scrollWidth, m.scrollHeight));
			await mat.focus();
			await page.waitForTimeout(300);
			const inView = async () => {
				const a = await mat.boundingBox();
				const g = await card.locator('.sheet g.chosen').first().boundingBox();
				return !!g && g.x >= a.x - 1 && g.y >= a.y - 1 && g.x + g.width <= a.x + a.width + 1 && g.y + g.height <= a.y + a.height + 1;
			};
			check(!(await inView()), 'the chosen shape was in view already');
			await page.keyboard.press('Enter');
			await page.waitForTimeout(1200);
			check(await inView(), 'Enter did not bring the chosen shape into view');
			await card.locator('.follow').click();
			await page.keyboard.press('0');
			// AK4: an unfinished story: the reason stands under "Publish" without hovering
			check(await card.locator('#story2bpmn-publish-why').count() === 0, 'reason shown for a story told to its end');
			await page.locator('.workbench > .card:not(.diagram-card)').getByRole('button', { name: 'Edit as text' }).click();
			const field = page.locator('.text-editor textarea');
			await field.waitFor({ state: 'visible' });
			const text = await field.inputValue();
			const ends = [...text.matchAll(/()\b(ENDE|END)\b[^\n]*/g)];
			check(ends.length > 0, `no end line in the story text: ${JSON.stringify(text).slice(0, 400)}`);
			const last = ends[ends.length - 1];
			// Without its end the story is not told to its end: Publish is locked.
			await field.fill(text.slice(0, last.index) + text.slice(last.index + last[0].length));
			await page.locator('.text-editor').getByRole('button', { name: 'Apply', exact: true }).click();
			await page.locator('#story2bpmn-publish-why').waitFor({ state: 'visible', timeout: 10000 });
			await page.mouse.move(5, 760);
			// 1180 × 820 (tablet across): the row of buttons wraps there
			for (const [w, h] of [[1366, 768], [1024, 768], [1180, 820], [1240, 800]]) {
				await page.setViewportSize({ width: w, height: h });
				await page.waitForTimeout(500);
				const why = card.locator('#story2bpmn-publish-why');
				check(await why.isVisible(), `reason not visible at ${w}`);
				check((await why.textContent()).trim() === 'Not every path has an end yet.', `reason "${(await why.textContent()).trim()}"`);
				const btn = card.locator('.publish-wrap > button');
				check(await btn.getAttribute('aria-describedby') === 'story2bpmn-publish-why', 'Publish not described by the reason');
				const r = await why.boundingBox();
				const b = await btn.boundingBox();
				check(r.y >= b.y + b.height - 1, `reason not under the button at ${w}`);
				const boxes = await card.locator('.card-head .right > *, .card-head .right .zoom > *').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => { const x = e.getBoundingClientRect(); return { x: x.x, y: x.y, w: x.width, h: x.height }; }));
				for (const o of boxes) check(!(r.x < o.x + o.w && o.x < r.x + r.width && r.y < o.y + o.h && o.y < r.y + r.height), `reason overlaps a head button at ${w}`);
				const area = await mat.boundingBox();
				check(r.y + r.height <= area.y, `reason overlaps the diagram at ${w}`);
				await page.screenshot({ path: `${out}/publish-why-${w}.png` });
			}
			await page.setViewportSize({ width: 1366, height: 768 });
			await page.waitForTimeout(400);
			// AK5: after a click on a shape, 1 still chooses in the story (the open point's first move)
			const forms = () => page.locator('.workbench .card:not(.diagram-card) form.form').count();
			const f0 = await forms();
			const shape = card.locator('.sheet g[data-move]').first();
			await shape.scrollIntoViewIfNeeded();
			const sb = await shape.boundingBox();
			await page.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2);
			await page.waitForTimeout(400);
			check(await mat.evaluate((m) => document.activeElement === m), 'a click did not leave the focus on the area');
			await page.keyboard.press('1');
			await page.waitForTimeout(600);
			check(await forms() > f0, '1 after a click into the diagram opened no form in the story');
		} catch (e) {
			await page.screenshot({ path: `${out}/keyboard-red.png` });
			throw e;
		} finally {
			await ctx.close();
		}
	},
	// Job 450 (Soothing 4) AK5: the approval sidebar after view B1, the dialog "Ask for approval" with the comparison (B2)
	async 'soothing-approval'() {
		const example = readFileSync(process.env.S2B_E2E_FILE, 'utf8');
		const name = 'Soothing approval.bpmn';
		const xml = approvedXml(example);
		const id = await upload(name, xml);
		await confirmOn(id, name, xml);
		// A named version "Valid version 1": the Versions tab gives it the valid chip
		const vurl = `${url}/remote.php/dav/versions/${encodeURIComponent(user)}/versions/${id}`;
		await new Promise((r) => setTimeout(r, 1500));
		await upload(name, xml + '\n');
		const list = await (await fetch(vurl, { method: 'PROPFIND', headers: { Authorization: auth, Depth: '1' } })).text();
		const vid = [...list.matchAll(/<d:href>[^<]*\/(\d+)\/?<\/d:href>/g)].map((m) => m[1]).filter((v) => v !== String(id))[0];
		check(vid, `no version of the uploaded file: ${list.replace(/\s+/g, " ").slice(0, 900)}`);
		const named = await fetch(`${vurl}/${vid}`, { method: 'PROPPATCH', headers: { Authorization: auth, 'Content-Type': 'application/xml' }, body: '<?xml version="1.0"?><d:propertyupdate xmlns:d="DAV:" xmlns:nc="http://nextcloud.org/ns"><d:set><d:prop><nc:version-label>Valid version 1</nc:version-label></d:prop></d:set></d:propertyupdate>' });
		check(named.status === 207 || named.status === 200, `naming the version: HTTP ${named.status}`);
		await proposeOn(id);
		await proposeOn(id);
		const { ctx, page } = await open({ width: 1366, height: 900, id });
		const side = page.locator('.story2bpmn-sidebar');
		const tab = (n) => side.getByRole('tab', { name: n });
		try {
			await page.getByRole('button', { name: /^Proposals/ }).first().click();
			await side.locator('.proposal').first().waitFor({ timeout: 10000 });
			check(await tab(/^Proposals/).count() === 1 && await tab('Versions').count() === 1 && await tab('Approvals').count() === 1, 'not the tabs Proposals, Versions, Approvals');
			check(await side.locator('.proposal').count() === 2, `${await side.locator('.proposal').count()} open proposals`);
			const tabName = async () => (await tab(/^Proposals/).textContent()).trim();
			check(await tabName() === 'Proposals (2)', `proposals tab reads "${await tabName()}"`);
			check((await side.locator('.proposal').first().locator('.so-chip--open').textContent()).trim() === 'Undecided', 'no chip "Undecided"');
			await page.waitForTimeout(600);
			await page.screenshot({ path: `${out}/soothing-b1.png` });
			// Accept the first (two-step): the story changes against version 1
			const accept = side.locator('.proposal').first().locator('[data-decide$=":accepted"]');
			await accept.click();
			await accept.click();
			await side.locator('.decided-proposal').first().waitFor({ timeout: 15000 });
			check(await side.locator('.proposal').count() === 1, 'the accepted proposal is still open');
			check(await tabName() === 'Proposals (1)', `after accepting the tab reads "${await tabName()}"`);
			// Reject the second: it shows "Rejected", without buttons
			const reject = side.locator('.proposal').first().locator('[data-decide$=":rejected"]');
			await reject.click();
			await reject.click();
			await side.locator('.proposal').first().waitFor({ state: 'detached', timeout: 15000 });
			const chips = side.locator('.decided-proposal .so-chip');
			for (let i = 0; i < 20 && !(await chips.allTextContents()).map((x) => x.trim()).includes('Rejected'); i++) await page.waitForTimeout(250);
			check((await chips.allTextContents()).map((x) => x.trim()).includes('Rejected'), `decided chips ${JSON.stringify(await chips.allTextContents())}`);
			check(await side.locator('.decided-proposal button').count() === 0, 'buttons on a decided proposal');
			check(await tabName() === 'Proposals', `with nothing open the tab reads "${await tabName()}"`);
			// Versions: the state now is a draft, the named version has the valid chip
			await tab('Versions').click();
			await side.locator('.current-state .so-chip--closed', { hasText: 'Draft' }).waitFor({ timeout: 10000 });
			await side.locator('.version .so-chip--ok', { hasText: 'Valid version 1' }).waitFor({ timeout: 10000 });
			// Approvals: the approval of version 1, and the shares below
			await tab('Approvals').click();
			await side.locator('.history-approved .so-chip--closed', { hasText: 'Granted' }).waitFor({ timeout: 10000 });
			check(await side.getByText('Version 1 approved').count() === 1, 'no "Version 1 approved"');
			check(await side.getByText('Shared with', { exact: true }).isVisible(), 'no "Shared with"');
			await page.screenshot({ path: `${out}/soothing-b1-approvals.png` });
			// The dialog: the comparison with the valid version as a register
			await page.getByRole('button', { name: /^Ask for approval/ }).first().click();
			const dialog = page.getByRole('dialog', { name: 'Ask for approval' });
			await dialog.waitFor({ timeout: 10000 });
			const diff = dialog.locator('.ask-diff');
			await diff.waitFor({ timeout: 5000 });
			check(/1 changed/.test(await diff.locator('.ask-counts').textContent()), `counts "${await diff.locator('.ask-counts').textContent()}"`);
			const row = diff.locator('.diff-changed').first();
			check((await row.locator('.so-chip--warn').textContent()).trim() === 'Changed', 'no chip "Changed"');
			check(/Before:/.test(await row.textContent()), 'no "Before:"');
			check(/^\d+$/.test((await row.locator('.diff-no').textContent()).trim()), 'no number on the changed row');
			check(await dialog.getByRole('button', { name: 'Ask for approval', exact: true }).count() === 1, 'no main button "Ask for approval"');
			await page.waitForTimeout(600);
			await page.screenshot({ path: `${out}/soothing-b2.png` });
			await dialog.getByRole('button', { name: 'Cancel' }).click();
		} catch (e) {
			await page.screenshot({ path: `${out}/soothing-approval-red.png` });
			throw e;
		} finally {
			await ctx.close();
		}
	},
	// Job 450 (Soothing 4) AK6: the phone after views C1–C3, nothing wider than 390 px
	async 'soothing-phone'() {
		const id = await upload('Soothing phone.bpmn');
		const { ctx, page } = await open({ ...PHONE, id });
		const fits = async (where) => {
			const over = await page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
			check(over <= 0, `${where}: page ${over} px wider than the screen`);
		};
		try {
			const bar = page.locator('.phone-bar');
			check(await bar.getByRole('button', { name: 'Undo' }).count() === 1, 'no Undo in the bar');
			check(await bar.getByRole('tab', { name: 'Story' }).count() === 1 && await bar.getByRole('tab', { name: 'Diagram' }).count() === 1, 'no tabs Story and Diagram');
			check(await bar.getByRole('button', { name: 'Fit', includeHidden: true }).count() === 0 && await bar.getByRole('button', { name: 'Follow', includeHidden: true }).count() === 0, 'Fit or Follow still in the bar');
			await fits('story');
			await page.screenshot({ path: `${out}/soothing-c1.png` });
			// C2: the diagram tools in the head of the diagram card
			await bar.getByRole('tab', { name: 'Diagram' }).tap();
			await page.waitForTimeout(600);
			check(await bar.getByRole('button', { name: 'Undo' }).isVisible(), 'no Undo with the diagram shown');
			const head = page.locator('.diagram-card .card-head');
			for (const n of ['Follow', 'Zoom out', 'Zoom in', 'Fit']) {
				const b = head.getByRole('button', { name: n, exact: true });
				check(await b.count() === 1 && await b.isVisible(), `no "${n}" in the diagram head`);
				const box = await b.boundingBox();
				check(box.height >= 44 && box.x >= 0 && box.x + box.width <= PHONE.width, `"${n}" ${box.width} × ${box.height} at x ${box.x}`);
			}
			await fits('diagram');
			await page.screenshot({ path: `${out}/soothing-c2.png` });
			// The ⋯ menu of the head keeps Publish
			await page.getByRole('button', { name: 'More actions' }).tap();
			const menu = page.locator('.head-sheet');
			await menu.waitFor({ state: 'visible' });
			check(await menu.getByRole('button', { name: 'Publish', exact: true }).count() === 1, 'no Publish in the ⋯ menu');
			await fits('⋯ menu');
			await menu.getByRole('button', { name: 'Proposals' }).tap();
			await page.locator('.story2bpmn-sidebar').waitFor({ state: 'visible', timeout: 10000 });
			await page.waitForTimeout(400);
			await fits('sidebar');
			await page.getByRole('button', { name: 'Back to the story' }).tap();
			// C3: the move form as a sheet from below
			await bar.getByRole('tab', { name: 'Story' }).tap();
			await reopenLast(page);
			await page.getByRole('button', { name: /Tell now/ }).first().tap();
			const sheet = page.locator('.move.as-sheet');
			await sheet.waitFor({ state: 'visible', timeout: 5000 });
			check((await sheet.locator('.sheet-rubric').textContent()).trim() === 'Next move', `rubric "${(await sheet.locator('.sheet-rubric').textContent()).trim()}"`);
			await sheet.locator('.option').first().tap();
			const apply = sheet.getByRole('button', { name: 'Apply' });
			const cancel = sheet.getByRole('button', { name: 'Cancel' });
			await apply.waitFor({ state: 'visible', timeout: 5000 });
			const a = await apply.boundingBox();
			const c = await cancel.boundingBox();
			check(c.x < a.x && a.width > c.width * 1.5 && a.height >= 44, `Cancel ${c.x}/${c.width}, Apply ${a.x}/${a.width} × ${a.height}`);
			await fits('sheet');
			await page.screenshot({ path: `${out}/soothing-c3.png` });
		} catch (e) {
			await page.screenshot({ path: `${out}/soothing-phone-red.png` });
			throw e;
		} finally {
			await ctx.close();
		}
	},
	// Job 451 AK7: the kind of a branch switched in its edit form on the phone; Undo brings the check back
	async branchKind() {
		const { ctx, page } = await open(PHONE);
		try {
			const line = page.locator('.workbench .line[data-line="5"]');
			check(/Amount over 5000/.test(await line.locator('.txt').first().textContent()), 'line 6 is not the check');
			const more = page.locator('.line-tap').getByRole('button', { name: 'More' });
			for (let i = 0; i < 2 && !(await more.isVisible()); i++) {
				await line.locator('.num').tap();
				await page.waitForTimeout(300);
			}
			await more.tap();
			await page.locator('.bottom-sheet').getByRole('button', { name: 'Edit', exact: true }).tap();
			const kind = page.getByLabel('What kind of branch?');
			await kind.waitFor({ state: 'visible', timeout: 5000 });
			check(await kind.inputValue() === '', `kind not "checked": ${await kind.inputValue()}`);
			await kind.selectOption('concurrent');
			check(await page.getByRole('list', { name: 'Branches' }).locator('li').count() === 2, 'not two branches after the switch');
			const form = page.locator('form.form');
			const box = await form.boundingBox();
			check(box && box.x >= 0 && box.x + box.width <= 391, `form wider than the phone (${box?.x} + ${box?.width})`);
			await page.screenshot({ path: `${out}/branch-kind-phone.png` });
			await form.getByRole('button', { name: 'Apply' }).tap();
			await page.waitForFunction(() => /IN PARALLEL/.test(document.querySelector('.workbench .line[data-line="5"] .txt')?.textContent ?? ''), null, { timeout: 10000 });
			await page.locator('.phone-bar').getByRole('button', { name: 'Undo' }).tap();
			await page.waitForFunction(() => /Amount over 5000/.test(document.querySelector('.workbench .line[data-line="5"] .txt')?.textContent ?? ''), null, { timeout: 10000 });
		} catch (e) {
			await page.screenshot({ path: `${out}/branch-kind-red.png` });
			throw e;
		} finally {
			await ctx.close();
		}
	},
	// Job 455 AK9: a path of a check with three paths moved down from the ⋯ sheet of its heading; Undo brings it back
	async swapPath() {
		const { ctx, page } = await open(PHONE);
		const lineText = (i) => page.locator(`.workbench .line[data-line="${i}"] .txt`).first().textContent();
		try {
			// A third path on the check, told through the text (the example's check has two).
			await page.getByRole('button', { name: 'More actions' }).tap();
			await page.locator('.head-sheet').getByRole('button', { name: 'Edit as text', exact: true }).tap();
			const ed = page.locator('.text-editor.full');
			await ed.waitFor({ state: 'visible' });
			const field = ed.locator('textarea');
			const text = (await field.inputValue()).replace('ELSE → no:', '→ unclear:\n  [@Accounting] shall [Ask the manager].\n  MERGE.\nELSE → no:');
			await field.fill(text);
			// The phone's full screen editor applies with "Done".
			await ed.getByRole('button', { name: 'Done', exact: true }).tap();
			await ed.waitFor({ state: 'detached', timeout: 30000 });
			check(/Approve payment/.test(await lineText(6)), 'line 7 is not on the first path');
			const more = page.locator('.workbench .line [data-menu="p5.0"]');
			await more.waitFor({ state: 'visible', timeout: 5000 });
			const box = await more.boundingBox();
			check(box && box.width >= 44 && box.height >= 44, `⋯ of the path heading too small (${box?.width} × ${box?.height})`);
			check(!(await page.locator('.workbench .line [data-menu="p5.2"]').count()), 'the otherwise path has a ⋯');
			await more.tap();
			const sheet = page.locator('.bottom-sheet');
			check(!(await sheet.getByRole('button', { name: 'Move path up' }).count()), 'first path offers "Move path up"');
			await sheet.getByRole('button', { name: 'Move path down' }).tap();
			await page.waitForFunction(() => /Ask the manager/.test(document.querySelector('.workbench .line[data-line="6"] .txt')?.textContent ?? ''), null, { timeout: 10000 });
			await page.screenshot({ path: `${out}/swap-path-phone.png` });
			await page.locator('.phone-bar').getByRole('button', { name: 'Undo' }).tap();
			await page.waitForFunction(() => /Approve payment/.test(document.querySelector('.workbench .line[data-line="6"] .txt')?.textContent ?? ''), null, { timeout: 10000 });
		} catch (e) {
			await page.screenshot({ path: `${out}/swap-path-red.png` });
			throw e;
		} finally {
			await ctx.close();
		}
	},
	// Job 456 AK9: "From here on for all paths" from the ⋯ sheet of a line: it comes after the merge, Undo brings it back
	async joinAll() {
		const { ctx, page } = await open(PHONE);
		const line = (i) => page.locator(`.workbench .line[data-line="${i}"]`).first();
		// Where "Pay invoice" stands (earlier cases may have changed the story): its move number, -1 if missing.
		const payAt = () => page.evaluate(() => {
			const l = [...document.querySelectorAll('.workbench .line[data-line]')].find((e) => /Pay invoice/.test(e.querySelector('.txt')?.textContent ?? ''));
			return l ? Number(l.getAttribute('data-line')) : -1;
		});
		try {
			// A story of its own (earlier cases may have changed the example): "Pay invoice" and the end told on
			// the yes path, the no path still open.
			await page.getByRole('button', { name: 'More actions' }).tap();
			await page.locator('.head-sheet').getByRole('button', { name: 'Edit as text', exact: true }).tap();
			const ed = page.locator('.text-editor.full');
			await ed.waitFor({ state: 'visible' });
			const field = ed.locator('textarea');
			const text = 'IT STARTS: [Invoice received] at [@Accounting].\n[@Accounting] shall [Check invoice].\nIF [?Amount over 5000 €]\n→ yes:\n  [@Manager] shall [Approve payment].\n  [@Accounting] shall [Pay invoice].\n  END: [Paid].\nELSE → no:\n  STILL OPEN.';
			await field.fill(text);
			await ed.getByRole('button', { name: 'Done', exact: true }).tap();
			await ed.waitFor({ state: 'detached', timeout: 30000 });
			const from = await payAt();
			check(from > 0, 'no line "Pay invoice"');
			const depth = async (i) => Number(await line(i).evaluate((e) => getComputedStyle(e).getPropertyValue('--t')));
			const before = await depth(from);
			// A tap on the line chosen already takes the choice away: tap until its actions show.
			const more = page.locator('.line-tap').getByRole('button', { name: 'More' });
			for (let i = 0; i < 2 && !(await more.isVisible()); i++) {
				await line(from).locator('.num').tap();
				await page.waitForTimeout(300);
			}
			await more.tap();
			const item = page.locator('.bottom-sheet').getByRole('button', { name: 'From here on for all paths' });
			const box = await item.boundingBox();
			check(box && box.height >= 44, `menu item too small (${box?.height})`);
			await item.tap();
			// Moves now: … merge (from), still open then merge, pay (from + 2), end.
			await page.waitForFunction((want) => [...document.querySelectorAll('.workbench .line[data-line]')].some((e) => e.getAttribute('data-line') === String(want) && /Pay invoice/.test(e.querySelector('.txt')?.textContent ?? '')), from + 2, { timeout: 10000 });
			check(/MERGE/.test(await line(from).locator('.txt').textContent()), 'no merge before the line');
			check((await depth(from + 2)) < before, 'the line is not on the common path');
			await page.screenshot({ path: `${out}/join-all-phone.png` });
			await page.locator('.phone-bar').getByRole('button', { name: 'Undo' }).tap();
			await page.waitForFunction((want) => /Pay invoice/.test(document.querySelector(`.workbench .line[data-line="${want}"] .txt`)?.textContent ?? ''), from, { timeout: 10000 });
		} catch (e) {
			await page.screenshot({ path: `${out}/join-all-red.png` });
			throw e;
		} finally {
			await ctx.close();
		}
	},
	async moveSteps() {
		const { ctx, page } = await open(PHONE);
		const txt = (i) => page.locator(`.workbench .line[data-line="${i}"] .txt`).first().textContent();
		try {
			// A story of its own: "Check invoice" was told too early, it belongs behind "Pay invoice".
			await page.getByRole('button', { name: 'More actions' }).tap();
			await page.locator('.head-sheet').getByRole('button', { name: 'Edit as text', exact: true }).tap();
			const ed = page.locator('.text-editor.full');
			await ed.waitFor({ state: 'visible' });
			await ed.locator('textarea').fill('IT STARTS: [Invoice received] at [@Accounting].\n[@Accounting] shall [Check invoice].\n[@Manager] shall [Approve payment].\n[@Accounting] shall [Pay invoice].\nEND: [Paid].');
			await ed.getByRole('button', { name: 'Done', exact: true }).tap();
			await ed.waitFor({ state: 'detached', timeout: 30000 });
			check(/Check invoice/.test(await txt(1)), 'line 2 is not "Check invoice"');
			const more = page.locator('.line-tap').getByRole('button', { name: 'More' });
			for (let i = 0; i < 2 && !(await more.isVisible()); i++) {
				await page.locator('.workbench .line[data-line="1"] .num').first().tap();
				await page.waitForTimeout(300);
			}
			await more.tap();
			const item = page.locator('.bottom-sheet').getByRole('button', { name: 'Move …' });
			const box = await item.boundingBox();
			check(box && box.height >= 44, `menu item too small (${box?.height})`);
			await item.tap();
			const form = page.locator('.move-to-form');
			await form.waitFor({ state: 'visible' });
			const where = form.locator('select[data-where]');
			const wbox = await where.boundingBox();
			check(wbox && wbox.height >= 40 && wbox.x >= 0 && wbox.x + wbox.width <= PHONE.width + 1, 'select "Where to?" off screen or too small');
			// Behind line 4 "Pay invoice": before old move 4.
			await page.screenshot({ path: `${out}/move-steps-form-phone.png` });
			await where.selectOption('4');
			await form.getByRole('button', { name: 'Move', exact: true }).tap();
			await page.waitForFunction(() => /Check invoice/.test(document.querySelector('.workbench .line[data-line="3"] .txt')?.textContent ?? ''), null, { timeout: 10000 });
			check(/Approve payment/.test(await txt(1)), 'line 2 is not "Approve payment" afterwards');
			check(!(await form.isVisible()), 'the form stays open');
			await page.screenshot({ path: `${out}/move-steps-phone.png` });
			await page.locator('.phone-bar').getByRole('button', { name: 'Undo' }).tap();
			await page.waitForFunction(() => /Check invoice/.test(document.querySelector('.workbench .line[data-line="1"] .txt')?.textContent ?? ''), null, { timeout: 10000 });
		} catch (e) {
			await page.screenshot({ path: `${out}/move-steps-red.png` });
			throw e;
		} finally {
			await ctx.close();
		}
	},
};

let ok = 0;
let failed = 0;
try {
	fileId = await upload();
	await login();
	for (const [name, run] of Object.entries(cases)) {
		if (only.length && !only.includes(name)) continue;
		try {
			await run();
			console.log(`ok ${name}`);
			ok++;
		} catch (e) {
			console.log(`FAIL ${name}: ${String(e?.message ?? e).split('\n')[0]}`);
			failed++;
		}
	}
} catch (e) {
	console.log(`FAIL setup: ${String(e?.message ?? e).split('\n')[0]}`);
	failed++;
} finally {
	await browser.close();
}
console.log(`E2E ${ok}/${failed}`);
process.exit(failed ? 1 : 0);
