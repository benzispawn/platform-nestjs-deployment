import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const inputFile = process.argv[2] || 'artifacts/ci-result.json';
const outputFile = process.argv[3] || 'artifacts/ci-report.md';

const input = JSON.parse(readFileSync(resolve(inputFile), 'utf-8'));

const lines = [
    `# ${input.title}`,
    '',
    ...input.checks.map(
        (check) => `- **${check.name}**: ${check.status}${check.details ? ` - ${check.details}` : ''}`,
    ),
    '',
];

const resolvedOutput = resolve(outputFile);
mkdirSync(dirname(resolvedOutput), { recursive: true });
writeFileSync(resolvedOutput, lines.join('\n'), 'utf-8');

console.log(`Markdown report written to ${resolvedOutput}`);