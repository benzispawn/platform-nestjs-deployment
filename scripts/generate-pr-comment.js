import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const inputFile = process.argv[2] || 'artifacts/ci-result.json';
const outputFile = process.argv[3] || 'artifacts/pr-comment.md';

const input = JSON.parse(readFileSync(resolve(inputFile), 'utf-8'));

const icon = (status) => {
  if (status === 'success') return '✅';
  if (status === 'failure') return '❌';
  if (status === 'skipped') return '⏭️';
  return '•';
}

const total = input.checks.length;
const passed = input.checks.filter((check) => check.status === 'passed').length;
const failed = input.checks.filter((check) => check.status === 'failed').length;
const skipped = input.checks.filter((check) => check.status === 'skipped').length;
const overall = failed > 0 ? 'failed' : passed === 0 && skipped > 0 ? 'skipped' : 'passed';
const target = input.target || 'unknown target';

const lines = [
  '<!-- platform-study-ci-report -->',
  `## ${input.title}`,
  '',
  `**Target**: ${target}`,
  '',
  `- **Overall status**: ${overall}`,
  `- **Total**: ${total}`,
  `- **Passed**: ${passed}`,
  `- **Failed**: ${failed}`,
  `- **Skipped**: ${skipped}`,
  '',
  '### Checks',
  ...input.checks.map(
    (check) => `- ${icon(check.status)} **${check.name}**: ${check.status}${check.details ? ` — ${check.details}` : ''}`,
  ),
  '',
  '> This comment is updated by the CI workflow.',
  '',
];

const resolvedOuput = resolve(outputFile);
mkdirSync(dirname(resolvedOuput), { recursive: true });
writeFileSync(resolvedOuput, lines.join('\n'), 'utf-8');

console.log(`PR comment markdown written to ${resolvedOuput}`);
