# Block 03 — PR Summaries and Richer Reports

## Objective
Move from a fake static JSON summary to a more realistic pipeline reporting flow.

In this block, you will:
- capture real CI step outcomes
- generate structured JSON dynamically inside the workflow
- feed that JSON into your custom TypeScript action
- publish a richer job summary
- upload artifacts for debugging and traceability
- add failure annotations in the workflow

At the end of this block, you will have:
- a more realistic CI workflow
- generated report files committed only as artifacts, not source
- richer summaries in GitHub Actions
- a cleaner reporting contract for future PR comments and infra summaries

---

## 1. Why this block matters

Block 02 proved that you can build and run a custom TypeScript GitHub Action.
That was the tooling foundation.

Now we need to make the pipeline more realistic.
A platform engineer usually does not want:
- hardcoded success/failure JSON inside the workflow
- duplicated status text across many pipelines
- poor observability when a job fails

Instead, you want a reporting pipeline that:
- captures execution results
- normalizes them into a contract
- renders human-readable output
- preserves artifacts for later inspection

That is the bridge from “toy action” to “useful platform pattern”.

---

## 2. Target design for this block

We will keep the same custom action from Block 02, but improve the workflow.

### Flow
1. run `lint`
2. run `test`
3. run `build`
4. capture each step result even when a step fails
5. generate `ci-result.json`
6. run the summary action
7. upload the JSON report as an artifact
8. emit annotations for failed checks

### Important pipeline idea
Normally, a failed step would stop the job immediately.
For reporting pipelines, that is often too early.

So for the execution steps we will use:
- `continue-on-error: true`

Then we will:
- inspect each step outcome
- generate the report
- fail the job at the end if needed

This is a very useful platform pattern because it separates:
- **execution capture**
- **report generation**
- **final gate decision**

---

## 3. Concepts introduced in this block

### Step outcome inspection
GitHub Actions lets you inspect the result of previous steps via `steps.<id>.outcome`.
That allows you to convert raw pipeline execution into structured report data.

### Artifact publishing
Artifacts are useful when you want:
- debug evidence
- result snapshots
- pipeline traceability
- reusable outputs across jobs later

### Annotations
Annotations make failures easier to scan in CI logs and PR checks.
They are especially useful when you later summarize lint or test failures more specifically.

---

## 4. Small improvement to the custom action package

In Block 02, the action already rendered markdown and outputs.
That is good enough for this block.

But let us make one small improvement: a more expressive `overallStatus` rule.

### Desired rule
- if `failed > 0`, overall = `failed`
- else if `passed > 0` and `skipped > 0`, overall = `passed`
- else if all passed, overall = `passed`
- else if all skipped, overall = `skipped`

This is optional, but good design.

Update `packages/github-action-summary/src/parser.ts` like this:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CheckResult, CheckStatus, SummaryInput, SummaryStats } from './types.js';

function isValidStatus(value: unknown): value is CheckStatus {
  return value === 'passed' || value === 'failed' || value === 'skipped';
}

function normalizeCheck(raw: unknown): CheckResult {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Each check must be an object.');
  }

  const maybeCheck = raw as Record<string, unknown>;

  if (typeof maybeCheck.name !== 'string' || maybeCheck.name.trim().length === 0) {
    throw new Error('Each check must have a non-empty string name.');
  }

  if (!isValidStatus(maybeCheck.status)) {
    throw new Error(
      `Invalid status for check "${maybeCheck.name}". Expected passed, failed, or skipped.`,
    );
  }

  return {
    name: maybeCheck.name,
    status: maybeCheck.status,
    details: typeof maybeCheck.details === 'string' ? maybeCheck.details : undefined,
  };
}

export function readSummaryInput(filePath: string): SummaryInput {
  const resolvedPath = resolve(filePath);
  const fileContent = readFileSync(resolvedPath, 'utf8');
  const parsed = JSON.parse(fileContent) as Record<string, unknown>;

  if (typeof parsed.title !== 'string' || parsed.title.trim().length === 0) {
    throw new Error('Input JSON must contain a non-empty string field: title');
  }

  if (!Array.isArray(parsed.checks)) {
    throw new Error('Input JSON must contain a checks array.');
  }

  return {
    title: parsed.title,
    checks: parsed.checks.map(normalizeCheck),
  };
}

export function computeStats(input: SummaryInput): SummaryStats {
  const stats = input.checks.reduce(
    (acc, check) => {
      acc.total += 1;
      acc[check.status] += 1;
      return acc;
    },
    {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
    },
  );

  let overallStatus: CheckStatus;

  if (stats.failed > 0) {
    overallStatus = 'failed';
  } else if (stats.passed === 0 && stats.skipped > 0) {
    overallStatus = 'skipped';
  } else {
    overallStatus = 'passed';
  }

  return {
    ...stats,
    overallStatus,
  };
}
```

And simplify `src/types.ts` to:

```ts
export type CheckStatus = 'passed' | 'failed' | 'skipped';

export interface CheckResult {
  name: string;
  status: CheckStatus;
  details?: string;
}

export interface SummaryInput {
  title: string;
  checks: CheckResult[];
}

export interface SummaryStats {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  overallStatus: CheckStatus;
}
```

Then rebuild the action:

```bash
npm run build -w packages/github-action-summary
```

---

## 5. Add a scripts directory for generated pipeline reports

At repo root:

```bash
mkdir -p scripts
```

We will add one script that helps generate structured CI result JSON.

This is useful because you do not want workflow YAML to become your main programming language.

---

## 6. Create a report generator script

Create `scripts/generate-ci-report.mjs`:

```js
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function normalizeOutcome(outcome) {
  if (outcome === 'success') return 'passed';
  if (outcome === 'failure') return 'failed';
  if (outcome === 'skipped') return 'skipped';
  return 'failed';
}

const outputFile = process.argv[2] || 'artifacts/ci-result.json';

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
  checks,
};

const resolved = resolve(outputFile);
mkdirSync(dirname(resolved), { recursive: true });
writeFileSync(resolved, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(`CI report written to ${resolved}`);
```

### Why use a script instead of raw shell
A script gives you:
- better readability
- easier future evolution
- easier testing later
- less shell quoting pain

That is usually a better platform engineering tradeoff than trying to do everything in YAML or inline bash.

---

## 7. Add a root helper script in `package.json`

Update the root `package.json` scripts section to include:

```json
{
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "report:ci": "node scripts/generate-ci-report.mjs"
  }
}
```

This gives you a reusable entrypoint for report generation.

---

## 8. Replace the CI workflow with a richer version

Update `.github/workflows/ci.yml` to this:

```yaml
name: CI

on:
  pull_request:
  push:
    branches:
      - main

jobs:
  ci:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Lint
        id: lint
        continue-on-error: true
        run: npm run lint

      - name: Test
        id: test
        continue-on-error: true
        run: npm run test

      - name: Build
        id: build
        continue-on-error: true
        run: npm run build

      - name: Generate CI result JSON
        run: npm run report:ci -- artifacts/ci-result.json
        env:
          REPORT_TITLE: Sample Nest API CI
          LINT_OUTCOME: ${{ steps.lint.outcome }}
          LINT_DETAILS: Lint workspace run completed.
          TEST_OUTCOME: ${{ steps.test.outcome }}
          TEST_DETAILS: Test workspace run completed.
          BUILD_OUTCOME: ${{ steps.build.outcome }}
          BUILD_DETAILS: Build workspace run completed.

      - name: Run summary action
        id: summary
        uses: ./packages/github-action-summary
        with:
          input-file: artifacts/ci-result.json
          summary-title: CI Summary Report

      - name: Annotate lint failure
        if: ${{ steps.lint.outcome == 'failure' }}
        run: echo '::error title=Lint failed::The lint step failed. Check eslint output in the logs.'

      - name: Annotate test failure
        if: ${{ steps.test.outcome == 'failure' }}
        run: echo '::error title=Tests failed::The test step failed. Check jest output in the logs.'

      - name: Annotate build failure
        if: ${{ steps.build.outcome == 'failure' }}
        run: echo '::error title=Build failed::The build step failed. Check compilation output in the logs.'

      - name: Upload CI report artifact
        uses: actions/upload-artifact@v4
        with:
          name: ci-report
          path: artifacts/ci-result.json

      - name: Print summary outputs
        run: |
          echo "total=${{ steps.summary.outputs.total }}"
          echo "passed=${{ steps.summary.outputs.passed }}"
          echo "failed=${{ steps.summary.outputs.failed }}"
          echo "skipped=${{ steps.summary.outputs.skipped }}"
          echo "overall-status=${{ steps.summary.outputs.overall-status }}"

      - name: Fail job if any quality gate failed
        if: ${{ steps.summary.outputs.overall-status == 'failed' }}
        run: |
          echo 'At least one CI check failed.'
          exit 1
```

---

## 9. Why this workflow design is better

This workflow is much closer to real platform delivery patterns.

### It captures all outcomes first
Even if lint fails, the workflow still records test/build results.

### It still enforces quality gates
The job fails at the end if the report says the overall status is failed.

### It generates traceable data
The JSON artifact can be downloaded and inspected later.

### It decouples report generation from execution
That is important when you later have more complex pipelines or separate jobs.

---

## 10. Optional refinement: use `always()` on report steps

If you want extra protection, you can make reporting steps run even when something odd happens earlier.

Example:

```yaml
      - name: Generate CI result JSON
        if: ${{ always() }}
        run: npm run report:ci -- artifacts/ci-result.json
        env:
          REPORT_TITLE: Sample Nest API CI
          LINT_OUTCOME: ${{ steps.lint.outcome }}
          LINT_DETAILS: Lint workspace run completed.
          TEST_OUTCOME: ${{ steps.test.outcome }}
          TEST_DETAILS: Test workspace run completed.
          BUILD_OUTCOME: ${{ steps.build.outcome }}
          BUILD_DETAILS: Build workspace run completed.
```

And the same idea can be applied to:
- summary action
- artifact upload
- final reporting steps

For this block, using `continue-on-error` is enough, but `always()` is a useful next-level pattern.

---

## 11. Add a second artifact for easier debugging

You can also upload raw logs or intermediate files later, but for now add one optional markdown artifact.

Create `scripts/render-ci-report-markdown.mjs`:

```js
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const inputFile = process.argv[2] || 'artifacts/ci-result.json';
const outputFile = process.argv[3] || 'artifacts/ci-report.md';

const input = JSON.parse(readFileSync(resolve(inputFile), 'utf8'));

const lines = [
  `# ${input.title}`,
  '',
  ...input.checks.map(
    (check) => `- **${check.name}**: ${check.status}${check.details ? ` — ${check.details}` : ''}`,
  ),
  '',
];

const resolvedOutput = resolve(outputFile);
mkdirSync(dirname(resolvedOutput), { recursive: true });
writeFileSync(resolvedOutput, lines.join('\n'), 'utf8');

console.log(`Markdown report written to ${resolvedOutput}`);
```

Add another root script:

```json
{
  "scripts": {
    "report:ci": "node scripts/generate-ci-report.mjs",
    "report:ci:md": "node scripts/render-ci-report-markdown.mjs"
  }
}
```

Then add these steps after JSON generation:

```yaml
      - name: Render markdown artifact
        run: npm run report:ci:md -- artifacts/ci-result.json artifacts/ci-report.md

      - name: Upload CI report artifacts
        uses: actions/upload-artifact@v4
        with:
          name: ci-report
          path: |
            artifacts/ci-result.json
            artifacts/ci-report.md
```

This is optional, but useful.

---

## 12. Validation scenarios you should test

### Scenario A — all green
Expected:
- summary shows all passed
- artifact exists
- job succeeds

### Scenario B — lint fails
To simulate this, temporarily break lint or add an invalid TS pattern.
Expected:
- lint annotation appears
- summary shows one failed check
- artifact exists
- final job fails

### Scenario C — build fails
Temporarily break a TypeScript import.
Expected:
- build annotation appears
- summary reflects failed build
- final job fails

These scenarios matter because platform work is not only about the happy path.

---

## 13. Suggested local commands

From repo root:

```bash
npm install
npm run build -w packages/github-action-summary
npm run build
npm run lint
npm run test
```

To generate a sample local report manually:

```bash
REPORT_TITLE="Local CI Report" \
LINT_OUTCOME=success \
TEST_OUTCOME=failure \
BUILD_OUTCOME=success \
npm run report:ci -- artifacts/local-ci-result.json
```

Inspect it:

```bash
cat artifacts/local-ci-result.json
```

This manual simulation is very useful for understanding the report contract.

---

## 14. Recommended `.gitignore` update

Because `artifacts/` is generated output, add it to `.gitignore` if it is not already there:

```gitignore
node_modules/
artifacts/

coverage/
.tmp/

.env
.env.*

.DS_Store
.idea/
.vscode/

*.tsbuildinfo

apps/*/dist/
packages/*/dist/
!packages/github-action-summary/dist/
```

This keeps source control clean while still allowing the compiled local action bundle.

---

## 15. Suggested commit sequence

```bash
git add scripts/generate-ci-report.mjs
git add scripts/render-ci-report-markdown.mjs
git add package.json
git add .github/workflows/ci.yml
git add .gitignore
git add packages/github-action-summary/src/parser.ts
git add packages/github-action-summary/src/types.ts
git add packages/github-action-summary/dist
git commit -m "feat: add richer CI summaries and report artifacts"
```

If you skip the optional markdown artifact script, omit that file.

---

## 16. What you learned in this block

### Technical concepts
- step outcome capture with GitHub Actions
- delayed failure pattern in pipelines
- structured report generation from workflow execution
- artifact publishing
- failure annotations
- pipeline report traceability

### Architecture and design patterns involved
- **Two-phase pipeline pattern**: first collect outcomes, then evaluate/fail
- **Normalized reporting contract**: workflow execution becomes structured data
- **Separation of Execution and Presentation**: commands run first, summaries render later
- **Traceability by Artifact**: reports become durable outputs, not only console text

---

## 17. Risks and common mistakes

### Mistake 1 — failing too early
If you do not use `continue-on-error: true`, the workflow may stop before generating the report.

### Mistake 2 — putting too much logic directly in YAML
When report generation becomes complicated, move logic to scripts or packages.

### Mistake 3 — not failing the job at the end
If you capture failures but never re-apply the gate, the pipeline can look green when it should be red.

### Mistake 4 — not uploading artifacts
Without artifacts, debugging historical runs becomes harder.

### Mistake 5 — mixing raw tool output with normalized report contracts
Keep your report schema stable. Tool-specific parsing can be layered on later.

---

## 18. Outcome of Block 03

You now have a pipeline that:
- runs real CI steps
- captures step outcomes
- generates a normalized report
- renders a markdown summary
- uploads traceable artifacts
- fails only after the report is complete

This is already a good platform-engineering baseline.

---

## 19. Suggested next block

**Block 04 — Reusable workflows and reusable report jobs**

Goal of next block:
- refactor CI into reusable workflows
- separate common Node CI patterns
- centralize report generation patterns
- prepare the monorepo for multiple apps/packages

That is where the repo starts to feel like an actual platform toolkit.

---

## 20. Command recap

```bash
mkdir -p scripts

npm run build -w packages/github-action-summary
npm run build
npm run lint
npm run test

REPORT_TITLE="Local CI Report" \
LINT_OUTCOME=success \
TEST_OUTCOME=failure \
BUILD_OUTCOME=success \
npm run report:ci -- artifacts/local-ci-result.json
```

