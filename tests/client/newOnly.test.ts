import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// Job 403: "Start over" only emptied the story and kept the file connected, so the next save
// overwrote the old working file with another process. Only "New" is left: it asks about
// unsaved changes and connects no file afterwards.
const app = readFileSync('src/App.vue', 'utf8');
const card = readFileSync('src/components/StoryCard.vue', 'utf8');

/** Body of the method `name() {` of a Vue options object, up to the next method at the same depth. */
function method(src: string, name: string): string {
	const at = src.indexOf(`\n\t\t${name}() {`);
	assert.ok(at > 0, `method ${name} found`);
	return src.slice(at, src.indexOf('\n\t\t},', at) + 5);
}

test('403 AK1 no "Start over" in the story card nor in the ⋯ sheet', () => {
	assert.doesNotMatch(card, /newArmed|startOver|'Start over'|'Really discard everything\?'/);
	assert.doesNotMatch(app, /startArmed|startOver|'Start over'|'Really discard everything\?'/);
	// The story card's tools keep Undo and Edit as text.
	assert.match(card, /t\('story2bpmn', 'Undo'\)/);
	assert.match(card, /t\('story2bpmn', 'Edit as text'\)/);
});

test('403 AK1 "Start over" is gone from every client file', () => {
	const all = readdirSync('src', { recursive: true, encoding: 'utf8' }).filter((f) => /\.(js|vue|ts)$/.test(f)).map((f) => `src/${f}`);
	assert.deepEqual(all.filter((f) => /'Start over'|To start over/.test(readFileSync(f, 'utf8'))), []);
});

test('403 AK2 "New" asks first and connects no file afterwards', () => {
	const added = method(app, 'added');
	assert.match(added, /this\.afterQuery\(/);
	assert.match(added, /this\.setState\(\[\]/);
	assert.match(added, /this\.file = null/);
	assert.match(added, /setUrl\(null\)/);
	assert.match(added, /this\.forgetApproval\(\)/);
	// The head and the ⋯ sheet both call it.
	assert.match(app, /class="button quiet" :disabled="locked" @click="added"/);
	assert.match(app, /@click="menuDo\(added\)"/);
	// afterQuery asks when unsaved changes would be lost.
	const ask = method(app.replace('afterQuery(goTo) {', 'afterQuery() {'), 'afterQuery');
	assert.match(ask, /if \(!this\.unsavedAll\) return goTo\(\)/);
	assert.match(ask, /subtype: 'discard'/);
});

test('403 AK3 the example note points to "New" for a process of one\'s own', () => {
	assert.match(card, /'Example – change whatever you like\. For a process of your own: New\.'/);
	assert.match(card, /'Example – change whatever you like\. For a process of your own: ⋯ → New\.'/);
	for (const language of ['de', 'de_DE']) {
		const json = JSON.parse(readFileSync(`l10n/${language}.json`, 'utf8')).translations;
		assert.equal(json['Example – change whatever you like. For a process of your own: New.'], language === 'de' ? 'Beispiel – ändere, was du willst. Eigener Prozess: Neu.' : 'Beispiel – ändern Sie, was Sie wollen. Eigener Prozess: Neu.');
		assert.equal(json['Start over'], undefined);
	}
});

test('403 risk: the ⋯ sheet shows no empty "Edit" heading on a subprocess level', () => {
	const at = app.indexOf("{{ t('story2bpmn', 'Edit') }}");
	assert.ok(at > 0);
	const before = app.slice(app.lastIndexOf('<template', at), at);
	assert.match(before, /<template v-if="!view\.sub">\s*<p class="sheet-group">\s*$/);
});
