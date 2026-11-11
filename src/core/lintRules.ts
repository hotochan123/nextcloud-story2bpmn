// Fixed list of the bpmnlint:recommended rules for the StaticResolver.
// Instead of looking them up at runtime via require (NodeResolver, Node only),
// they are imported statically here so that the core runs in the browser bundle.
// tests/core/browser.test.ts checks that the list matches recommended.js.
import recommended from 'bpmnlint/config/recommended.js';
import r0 from 'bpmnlint/rules/ad-hoc-sub-process.js';
import r1 from 'bpmnlint/rules/conditional-flows.js';
import r2 from 'bpmnlint/rules/end-event-required.js';
import r3 from 'bpmnlint/rules/event-based-gateway.js';
import r4 from 'bpmnlint/rules/event-sub-process-typed-start-event.js';
import r5 from 'bpmnlint/rules/fake-join.js';
import r6 from 'bpmnlint/rules/global.js';
import r7 from 'bpmnlint/rules/label-required.js';
import r8 from 'bpmnlint/rules/link-event.js';
import r9 from 'bpmnlint/rules/no-bpmndi.js';
import r10 from 'bpmnlint/rules/no-complex-gateway.js';
import r11 from 'bpmnlint/rules/no-disconnected.js';
import r12 from 'bpmnlint/rules/no-duplicate-sequence-flows.js';
import r13 from 'bpmnlint/rules/no-gateway-join-fork.js';
import r14 from 'bpmnlint/rules/no-implicit-split.js';
import r15 from 'bpmnlint/rules/no-implicit-end.js';
import r16 from 'bpmnlint/rules/no-implicit-start.js';
import r17 from 'bpmnlint/rules/no-inclusive-gateway.js';
import r18 from 'bpmnlint/rules/no-overlapping-elements.js';
import r19 from 'bpmnlint/rules/single-blank-start-event.js';
import r20 from 'bpmnlint/rules/single-event-definition.js';
import r21 from 'bpmnlint/rules/start-event-required.js';
import r22 from 'bpmnlint/rules/sub-process-blank-start-event.js';
import r23 from 'bpmnlint/rules/superfluous-gateway.js';
import r24 from 'bpmnlint/rules/superfluous-label.js';
import r25 from 'bpmnlint/rules/superfluous-termination.js';

export const RULES: Record<string, unknown> = {
  'ad-hoc-sub-process': r0,
  'conditional-flows': r1,
  'end-event-required': r2,
  'event-based-gateway': r3,
  'event-sub-process-typed-start-event': r4,
  'fake-join': r5,
  'global': r6,
  'label-required': r7,
  'link-event': r8,
  'no-bpmndi': r9,
  'no-complex-gateway': r10,
  'no-disconnected': r11,
  'no-duplicate-sequence-flows': r12,
  'no-gateway-join-fork': r13,
  'no-implicit-split': r14,
  'no-implicit-end': r15,
  'no-implicit-start': r16,
  'no-inclusive-gateway': r17,
  'no-overlapping-elements': r18,
  'single-blank-start-event': r19,
  'single-event-definition': r20,
  'start-event-required': r21,
  'sub-process-blank-start-event': r22,
  'superfluous-gateway': r23,
  'superfluous-label': r24,
  'superfluous-termination': r25,
};

/** Cache in the StaticResolver format: `config:<pkg>/<name>`, `rule:<pkg>/<name>`. */
export const LINT_CACHE: Record<string, unknown> = {
  'config:bpmnlint/recommended': recommended,
  ...Object.fromEntries(Object.entries(RULES).map(([name, rule]) => [`rule:bpmnlint/${name}`, rule]))
};
