import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBuiltin } from 'node:module';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { Linter } from 'bpmnlint';
import NodeResolver from 'bpmnlint/lib/resolver/node-resolver.js';
import recommended from 'bpmnlint/config/recommended.js';
import { lint } from '../../src/core/lint.js';
import { RULES } from '../../src/core/lintRules.js';
import { parse } from '../../src/core/toBpmn.js';
import { run, emptyProcess } from '../../src/core/pipeline.js';
import { toBpmn } from '../../src/core/toBpmn.js';
import { layout } from '../../src/core/layout.js';
import { applyOps } from '../../src/core/apply.js';
import { scratchOps } from './fixtures.js';
import type { Move } from '../../src/core/story.js';

// The story from the README.
const README: Move[] = [
  { move: 'start', text: 'Rechnung geht ein', role: 'Buchhaltung' },
  { move: 'task', text: 'Rechnung prüfen', role: 'Buchhaltung' },
  { move: 'decision', question: 'Betrag über 5000 €?', yes: 'ja', no: 'nein' },
  { move: 'task', text: 'Zahlung freigeben', role: 'Führungskraft' },
  { move: 'merge' },
  { move: 'merge' },
  { move: 'end', text: 'Bezahlt' }
];

const head = '<?xml version="1.0" encoding="UTF-8"?>\n<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="http://x">';

// Without an end: end-event-required, no-implicit-end, plus no-bpmndi.
const WITHOUT_END = `${head}<bpmn:process id="P"><bpmn:startEvent id="S" name="Los"><bpmn:outgoing>F1</bpmn:outgoing></bpmn:startEvent>
<bpmn:task id="T" name="Tun"><bpmn:incoming>F1</bpmn:incoming></bpmn:task>
<bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="T"/></bpmn:process></bpmn:definitions>`;

// Decision without a label: label-required, conditional-flows, superfluous-gateway …
const DECISION_WITHOUT_NAME = `${head}<bpmn:process id="P"><bpmn:startEvent id="S" name="Los"><bpmn:outgoing>F1</bpmn:outgoing></bpmn:startEvent>
<bpmn:exclusiveGateway id="G"><bpmn:incoming>F1</bpmn:incoming><bpmn:outgoing>F2</bpmn:outgoing><bpmn:outgoing>F3</bpmn:outgoing></bpmn:exclusiveGateway>
<bpmn:endEvent id="E1" name="A"><bpmn:incoming>F2</bpmn:incoming></bpmn:endEvent>
<bpmn:endEvent id="E2" name="B"><bpmn:incoming>F3</bpmn:incoming></bpmn:endEvent>
<bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="G"/><bpmn:sequenceFlow id="F2" sourceRef="G" targetRef="E1"/>
<bpmn:sequenceFlow id="F3" sourceRef="G" targetRef="E2"/></bpmn:process></bpmn:definitions>`;

async function valid(): Promise<string> {
  const { ir } = applyOps(emptyProcess('B', 'B'), scratchOps);
  return (await toBpmn(ir, layout(ir))).xml;
}

/** The old behaviour: linter with NodeResolver, output formatted the way lint() does it. */
async function oldLint(definitions: any, includeWarnings: boolean) {
  const linter = new Linter({ config: { extends: ['bpmnlint:recommended'] }, resolver: new NodeResolver() });
  const reports = await linter.lint(definitions);
  const out: any[] = [];
  for (const [rule, entries] of Object.entries(reports as Record<string, any[]>))
    for (const r of entries) {
      if (r.category === 'warn' && !includeWarnings) continue;
      out.push({ source: 'lint', rule, elementId: r.id, elementName: r.name, message: r.message });
    }
  return out;
}

test('lint() with a fixed rule list reports the same as with NodeResolver', async () => {
  const diagrams = [await valid(), WITHOUT_END, DECISION_WITHOUT_NAME];
  let reported = 0;
  for (const xml of diagrams)
    for (const includeWarnings of [false, true]) {
      const added = await lint(await parse(xml), { includeWarnings });
      const old = await oldLint(await parse(xml), includeWarnings);
      assert.deepEqual(added, old);
      reported += added.length;
    }
  assert.ok(reported > 0, 'die Fehler-Diagramme muessen Meldungen erzeugen');
  assert.ok((await lint(await parse(WITHOUT_END))).some((i) => i.rule === 'end-event-required'));
  assert.ok((await lint(await parse(DECISION_WITHOUT_NAME))).some((i) => i.rule === 'label-required'));
});

test('the fixed rule list covers exactly bpmnlint:recommended', () => {
  assert.deepEqual(Object.keys(RULES).sort(), Object.keys(recommended.rules).sort());
});

test('core bundle for the browser needs no Node modules and works', { timeout: 60_000 }, async () => {
  const builtins: string[] = [];
  const dir = await mkdtemp(join(tmpdir(), 'story2bpmn-core-'));
  try {
    await build({
      configFile: false,
      logLevel: 'silent',
      root: resolve('.'),
      plugins: [
        {
          name: 'kein-node',
          enforce: 'pre',
          resolveId(id: string) {
            if (isBuiltin(id)) builtins.push(id);
            return null;
          }
        }
      ],
      build: {
        outDir: dir,
        emptyOutDir: false,
        minify: false,
        write: true,
        lib: { entry: resolve('src/core/index.ts'), formats: ['es'], fileName: () => 'core.mjs' },
        // .mjs for the partial chunks too: under tmpdir() .js would count as CommonJS
        rollupOptions: { output: { chunkFileNames: '[name]-[hash].mjs' } }
      }
    });
    assert.deepEqual(builtins, [], 'Node-Builtins im Bundle');
    const files = (await readdir(dir)).filter((f) => f.endsWith('.mjs'));
    assert.ok(files.length > 0);
    for (const f of files) {
      const code = await readFile(join(dir, f), 'utf8');
      assert.ok(!code.includes('__vite-browser-external'), `${f}: Browser-Ersatz fuer ein Node-Modul`);
      assert.ok(!/from\s*["']node:/.test(code), `${f}: Import eines node:-Moduls`);
      assert.ok(!/\brequire\(/.test(code), `${f}: require()`);
    }

    const core = await import(pathToFileURL(join(dir, 'core.mjs')).href);
    const g = core.tell(README);
    assert.deepEqual(g.errors, []);
    const r = await core.run({ ir: core.emptyProcess('P', 'Prozess'), ops: g.ops });
    assert.equal(r.ok, true, JSON.stringify(r.issues));
    assert.ok(r.xml.includes('bpmn:definitions'));
    const back = await core.fromBpmn(r.xml);
    assert.deepEqual(back.ir.nodes.map((n: any) => n.id).sort(), r.ir.nodes.map((n: any) => n.id).sort());
    const { svg, pdf } = await core.renderBoth(r.ir, r.positions, r.readingCopy);
    assert.ok(svg.startsWith('<svg'));
    assert.equal(new TextDecoder().decode(pdf.slice(0, 4)), '%PDF');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
