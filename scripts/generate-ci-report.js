import { dirname, resolve } from "path";
import { writeFileSync, mkdirSync } from "fs";

function normalizeOutcome(outcome) {
    if (outcome === 'success') return 'passed';
    if (outcome === 'failure') return 'failed';
    if (outcome === 'skipped') return 'skipped';
    return 'failed';
}

const outputFile = process.argv[2] || 'artifacts/ci-report.json';
const target = process.env.REPORT_TARGET || 'unknown-target';

const checks = [
    {
    name: 'lint',
    status: normalizeOutcome(process.env.LINT_OUTCOME),
    details: process.env.LINT_DETAILS || 'Lint step finished.',
  },
  {
    name: 'test',
    status: normalizeOutcome(process.env.TEST_OUTCOME),
    details: process.env.TEST_DETAILS || 'Test step finished.',
  },
  {
    name: 'build',
    status: normalizeOutcome(process.env.BUILD_OUTCOME),
    details: process.env.BUILD_DETAILS || 'Build step finished.',
  },
];

const report = {
    title: process.env.REPORT_TITLE || 'CI Report',
    target,
    checks,
};

const resolved = resolve(outputFile);
mkdirSync(dirname(resolved), { recursive: true });
writeFileSync(resolved, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');

console.log(`CI report generated at ${resolved}`);
