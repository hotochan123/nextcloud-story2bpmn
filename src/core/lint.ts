import { Linter } from 'bpmnlint';
import StaticResolver from 'bpmnlint/lib/resolver/static-resolver.js';
import { LINT_CACHE } from './lintRules.js';
import { Issue } from './ir.js';

const DOCS = 'https://github.com/bpmn-io/bpmnlint/tree/main/docs/rules';

export type LintOptions = { includeWarnings?: boolean };

/**
 * General BPMN rules (bpmnlint:recommended): start and end present,
 * nothing unconnected, decisions labelled. No Camunda rules -
 * the diagrams are read, not executed.
 */
export async function lint(definitions: any, opts: LintOptions = {}): Promise<Issue[]> {
  const linter = new Linter({
    config: { extends: ['bpmnlint:recommended'] },
    resolver: new StaticResolver(LINT_CACHE)
  });

  const reports = await linter.lint(definitions);
  const issues: Issue[] = [];

  for (const [rule, entries] of Object.entries(reports as Record<string, any[]>)) {
    for (const r of entries) {
      if (r.category === 'warn' && !opts.includeWarnings) continue;
      issues.push({
        source: 'lint',
        rule,
        elementId: r.id,
        elementName: r.name,
        message: r.message
      });
    }
  }
  return issues;
}

/**
 * Compact, machine-readable feedback for the retry prompt.
 * Deliberately terse: rule, element, cause - no prose.
 */
export function toPromptFeedback(issues: Issue[]): string {
  if (!issues.length) return '';
  const lines = issues.map((i) => {
    const where = i.elementId ? ` @${i.elementId}${i.elementName ? ` ("${i.elementName}")` : ''}` : '';
    return `- [${i.rule}]${where}: ${i.message}`;
  });
  return [
    'Das erzeugte Diagramm ist nicht gueltig. Behebe genau diese Punkte und gib erneut',
    'nur eine Ops-Liste zurueck (keine Erklaerung, kein XML):',
    ...lines,
    `Regeldokumentation: ${DOCS}`
  ].join('\n');
}
