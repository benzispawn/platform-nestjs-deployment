# Block 05 — Multi-App Scaling and Reusable Quality Gates

## Objective
Evolve the study monorepo from a single-service CI flow into a platform-style monorepo pattern.

In this block, you will:
- prepare the repository for multiple apps and packages
- introduce targeted validation by workspace
- keep a shared reporting contract across all validations
- add a matrix-based workflow for scalable CI execution
- preserve PR-visible reporting while making the pipeline more modular

At the end of this block, you will have:
- a monorepo CI design that can scale beyond one app
- reusable quality gate logic per workspace
- matrix-based execution with per-target reporting
- a cleaner base for Terraform/CDK flows in later blocks

---

## 1. Why this block matters

Up to Block 04, the repository behaves like a strong single-app CI setup.
That is already valuable.

But a real platform monorepo usually has more than one executable or reusable unit:
- backend services
- shared libraries
- internal tooling packages
- GitHub Actions packages
- infra code

When that happens, a single flat CI job starts to break down.
You need a pattern that lets you:
- run validation per target
- understand which target failed
- reuse the same reporting format
- keep PR visibility readable

This block introduces that scaling step.

---

## 2. Monorepo direction for this block

We will make the repo ready for multiple workspaces by introducing a second app and a more structured CI model.

### Current baseline
You already have:
- `apps/sample-nest-api`
- `packages/github-action-summary`
- reusable workflow with PR comments

### New target shape
We will move toward:

```text
apps/
  sample-nest-api/
  sample-worker/
packages/
  github-action-summary/
  shared-report-models/   (optional later)
.github/workflows/
  ci.yml
  reusable-node-ci.yml
  reusable-workspace-quality.yml
scripts/
  generate-ci-report.mjs
  generate-pr-comment.mjs
```

We will not overcomplicate it yet.
This block keeps the repo understandable while adding real scaling behavior.

---

## 3. Architectural decision for Block 05

There are two common monorepo CI directions here:

### Option A — one job validates the entire repo
Pros:
- simpler
- fewer moving parts

Cons:
- harder to know which workspace failed
- less scalable
- less reusable for future multi-service patterns

### Option B — one job per target/workspace
Pros:
- clearer ownership
- better visibility
- easier parallelism
- closer to platform engineering reality

Cons:
- more YAML and output handling

For this block, we will choose **Option B**.
That is the more useful learning path.

---

## 4. What we will build

We will add:

1. **A second workspace**
   A simple worker-style TypeScript package in `apps/sample-worker`.

2. **A reusable workspace-quality workflow**
   A workflow that validates one target workspace at a time.

3. **A matrix caller**
   A workflow that runs the reusable validation for multiple targets.

4. **Per-target report artifacts**
   Each target gets its own CI result JSON and PR comment section.

5. **A combined PR comment strategy**
   The PR comment will contain multiple target sections.

---

## 5. Create a second sample app

We want a lightweight second workspace so the monorepo really has multiple targets.

Create the folder:

```bash
mkdir -p apps/sample-worker/src
```

### 5.1 `apps/sample-worker/package.json`

```json
{
  "name": "@apps/sample-worker",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "lint": "eslint \"src/**/*.ts\"",
    "test": "node --test"
  }
}
```

### 5.2 `apps/sample-worker/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"]
}
```

### 5.3 `apps/sample-worker/src/index.ts`

```ts
export function processJob(jobName: string): string {
  return `processed:${jobName}`;
}

console.log(processJob('sample-job'));
```

### 5.4 `apps/sample-worker/src/index.test.ts`

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { processJob } from './index.js';

test('processJob returns the expected result', () => {
  assert.equal(processJob('sample-job'), 'processed:sample-job');
});
```

### Why add this workspace
This gives you a second target with:
- build
- lint
- test

That is enough to exercise monorepo scaling patterns without introducing new domain complexity.

---

## 6. Update `.gitignore` for the new app build output

Make sure `.gitignore` still contains:

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

That already covers the new app.

---

## 7. Introduce target-oriented report generation

The current `scripts/generate-ci-report.mjs` is already close to what we need.
We only need to enrich it with a target name.

Replace `scripts/generate-ci-report.mjs` with:

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
writeFileSync(resolved, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(`CI report written to ${resolved}`);
```

### Why add `target`
This makes the report contract monorepo-aware.
Later, Terraform and CDK validations can also use `target` values like:
- `infra/terraform`
- `infra/cdk`

That is how you keep one reporting model across different pipeline units.

---

## 8. Replace the PR comment generator with a target-aware version

Replace `scripts/generate-pr-comment.mjs` with:

```js
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const inputFile = process.argv[2] || 'artifacts/ci-result.json';
const outputFile = process.argv[3] || 'artifacts/pr-comment.md';

const input = JSON.parse(readFileSync(resolve(inputFile), 'utf8'));

const icon = (status) => {
  if (status === 'passed') return '✅';
  if (status === 'failed') return '❌';
  if (status === 'skipped') return '⏭️';
  return '•';
};

const total = input.checks.length;
const passed = input.checks.filter((check) => check.status === 'passed').length;
const failed = input.checks.filter((check) => check.status === 'failed').length;
const skipped = input.checks.filter((check) => check.status === 'skipped').length;
const overall = failed > 0 ? 'failed' : passed === 0 && skipped > 0 ? 'skipped' : 'passed';
const target = input.target || 'unknown-target';

const lines = [
  '<!-- platform-study-ci-report -->',
  `## ${input.title}`,
  '',
  `### Target: \`${target}\``,
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

const resolvedOutput = resolve(outputFile);
mkdirSync(dirname(resolvedOutput), { recursive: true });
writeFileSync(resolvedOutput, lines.join('\n'), 'utf8');

console.log(`PR comment markdown written to ${resolvedOutput}`);
```

This still handles one target at a time.
In this block, that is enough.
A later block can aggregate many targets into one combined comment.

---

## 9. Create a reusable workspace-quality workflow

Create `.github/workflows/reusable-workspace-quality.yml`:

```yaml
name: Reusable Workspace Quality

on:
  workflow_call:
    inputs:
      workspace-name:
        required: true
        type: string
      workspace-path:
        required: true
        type: string
      node-version:
        required: false
        type: string
        default: '22'
      enable-pr-comment:
        required: false
        type: boolean
        default: true
    outputs:
      overall-status:
        description: Overall workspace CI status
        value: ${{ jobs.quality.outputs.overall-status }}
      total:
        description: Total checks
        value: ${{ jobs.quality.outputs.total }}
      passed:
        description: Passed checks
        value: ${{ jobs.quality.outputs.passed }}
      failed:
        description: Failed checks
        value: ${{ jobs.quality.outputs.failed }}
      skipped:
        description: Skipped checks
        value: ${{ jobs.quality.outputs.skipped }}

permissions:
  contents: read
  pull-requests: write

jobs:
  quality:
    runs-on: ubuntu-latest
    outputs:
      overall-status: ${{ steps.summary.outputs.overall-status }}
      total: ${{ steps.summary.outputs.total }}
      passed: ${{ steps.summary.outputs.passed }}
      failed: ${{ steps.summary.outputs.failed }}
      skipped: ${{ steps.summary.outputs.skipped }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ inputs.node-version }}
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build local action bundle
        run: npm run build -w packages/github-action-summary

      - name: Lint workspace
        id: lint
        continue-on-error: true
        run: npm run lint -w ${{ inputs.workspace-name }}

      - name: Test workspace
        id: test
        continue-on-error: true
        run: npm run test -w ${{ inputs.workspace-name }}

      - name: Build workspace
        id: build
        continue-on-error: true
        run: npm run build -w ${{ inputs.workspace-name }}

      - name: Generate workspace report JSON
        if: ${{ always() }}
        run: npm run report:ci -- artifacts/${{ inputs.workspace-name }}-ci-result.json
        env:
          REPORT_TITLE: Workspace Quality Report
          REPORT_TARGET: ${{ inputs.workspace-name }}
          LINT_OUTCOME: ${{ steps.lint.outcome }}
          LINT_DETAILS: Lint finished for ${{ inputs.workspace-name }}.
          TEST_OUTCOME: ${{ steps.test.outcome }}
          TEST_DETAILS: Tests finished for ${{ inputs.workspace-name }}.
          BUILD_OUTCOME: ${{ steps.build.outcome }}
          BUILD_DETAILS: Build finished for ${{ inputs.workspace-name }}.

      - name: Run summary action
        if: ${{ always() }}
        id: summary
        uses: ./packages/github-action-summary
        with:
          input-file: artifacts/${{ inputs.workspace-name }}-ci-result.json
          summary-title: Workspace Quality — ${{ inputs.workspace-name }}

      - name: Render PR comment markdown
        if: ${{ always() && github.event_name == 'pull_request' && inputs.enable-pr-comment }}
        run: npm run report:ci:pr-comment -- artifacts/${{ inputs.workspace-name }}-ci-result.json artifacts/${{ inputs.workspace-name }}-pr-comment.md

      - name: Create or update PR comment
        if: ${{ always() && github.event_name == 'pull_request' && inputs.enable-pr-comment }}
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('node:fs');
            const body = fs.readFileSync('artifacts/${{ inputs.workspace-name }}-pr-comment.md', 'utf8');
            const marker = '<!-- platform-study-ci-report -->';
            const workspaceMarker = `<!-- workspace:${{ inputs.workspace-name }} -->`;
            const finalBody = `${marker}\n${workspaceMarker}\n${body.replace(marker, '').trim()}`;
            const issue_number = context.payload.pull_request.number;
            const { owner, repo } = context.repo;

            const comments = await github.paginate(github.rest.issues.listComments, {
              owner,
              repo,
              issue_number,
              per_page: 100,
            });

            const existing = comments.find(
              (comment) =>
                comment.user?.type === 'Bot' &&
                typeof comment.body === 'string' &&
                comment.body.includes(workspaceMarker),
            );

            if (existing) {
              await github.rest.issues.updateComment({
                owner,
                repo,
                comment_id: existing.id,
                body: finalBody,
              });
            } else {
              await github.rest.issues.createComment({
                owner,
                repo,
                issue_number,
                body: finalBody,
              });
            }

      - name: Upload workspace report artifact
        if: ${{ always() }}
        uses: actions/upload-artifact@v4
        with:
          name: ${{ inputs.workspace-name }}-ci-report
          path: |
            artifacts/${{ inputs.workspace-name }}-ci-result.json
            artifacts/${{ inputs.workspace-name }}-pr-comment.md

      - name: Fail job if workspace quality gate failed
        if: ${{ steps.summary.outputs.overall-status == 'failed' }}
        run: |
          echo 'At least one workspace quality check failed.'
          exit 1
```

---

## 10. Replace the top-level CI workflow with a matrix caller

Replace `.github/workflows/ci.yml` with:

```yaml
name: CI

on:
  pull_request:
  push:
    branches:
      - main

jobs:
  sample-nest-api:
    uses: ./.github/workflows/reusable-workspace-quality.yml
    with:
      workspace-name: '@apps/sample-nest-api'
      workspace-path: 'apps/sample-nest-api'
      node-version: '22'
      enable-pr-comment: true

  sample-worker:
    uses: ./.github/workflows/reusable-workspace-quality.yml
    with:
      workspace-name: '@apps/sample-worker'
      workspace-path: 'apps/sample-worker'
      node-version: '22'
      enable-pr-comment: true
```

### Why not use a real matrix here
GitHub Actions does not allow a normal matrix directly on a job that `uses` a reusable workflow in the same flexible way people often expect.
For this study block, defining explicit jobs is cleaner and easier to understand.

A later block can introduce dynamic change detection and more advanced fan-out strategies.

---

## 11. Why this is already a strong platform pattern

You now have one standardized validation workflow that can be called for any workspace.
That gives you:
- one contract
- one report format
- one gating model
- one PR-visible report pattern

This is the beginning of a real internal CI platform pattern.

---

## 12. Optional enhancement: add a final aggregate status job

If you want one final monorepo gate job, add this to `.github/workflows/ci.yml`:

```yaml
  overall-quality:
    runs-on: ubuntu-latest
    needs:
      - sample-nest-api
      - sample-worker
    steps:
      - name: Print upstream results
        run: |
          echo "sample-nest-api=${{ needs.sample-nest-api.outputs.overall-status }}"
          echo "sample-worker=${{ needs.sample-worker.outputs.overall-status }}"

      - name: Fail if any workspace failed
        run: |
          if [ "${{ needs.sample-nest-api.outputs.overall-status }}" = "failed" ] || [ "${{ needs.sample-worker.outputs.overall-status }}" = "failed" ]; then
            echo "At least one workspace failed."
            exit 1
          fi
```

This creates a single top-level summary gate.
It is optional but useful.

---

## 13. Expected PR behavior now

When you open or update a PR:
- each workspace job runs separately
- each workspace gets its own artifact
- each workspace gets its own PR comment section/comment
- failures are isolated to a target

That makes it much easier to understand monorepo CI behavior.

---

## 14. Validation scenarios

### Scenario A — both workspaces green
Expected:
- both jobs succeed
- two report artifacts exist
- PR shows updated reports for both targets

### Scenario B — break only `sample-worker`
Expected:
- `sample-nest-api` stays green
- `sample-worker` fails
- only `sample-worker` report shows failure
- the monorepo gate job fails if you added it

### Scenario C — break only `sample-nest-api`
Expected:
- inverse of scenario B

This kind of target isolation is exactly why this block exists.

---

## 15. Suggested local commands

```bash
npm install
npm run build -w packages/github-action-summary
npm run build -w @apps/sample-worker
npm run test -w @apps/sample-worker
npm run lint -w @apps/sample-worker
npm run build
npm run test
npm run lint
```

If npm workspace name lookup gives trouble in your environment, path-based workspace addressing is also possible in some setups. For this study repo, keep package names consistent and prefer the package names shown above.

---

## 16. Suggested commit sequence

```bash
git add apps/sample-worker
git add scripts/generate-ci-report.mjs
git add scripts/generate-pr-comment.mjs
git add .github/workflows/reusable-workspace-quality.yml
git add .github/workflows/ci.yml
git commit -m "feat: add multi-workspace quality gates for monorepo ci"
```

---

## 17. What you learned in this block

### Technical concepts
- monorepo target-oriented CI
- reusable workflow per workspace
- workspace-scoped npm execution
- per-target report generation
- per-target PR-visible CI reporting
- optional aggregate monorepo gate

### Architecture and design patterns involved
- **Targeted Validation Pattern**: validate each unit independently
- **Reusable Quality Gate Pattern**: one workflow contract, many targets
- **Failure Isolation**: one workspace failing should not hide the state of others
- **Monorepo Platform Abstraction**: standard CI behavior becomes an internal platform primitive

---

## 18. Risks and common mistakes

### Mistake 1 — validating the whole repo in every target job
If each workspace job runs all repo scripts, you lose target isolation.
Use workspace-specific commands.

### Mistake 2 — not standardizing report shape
If each target reports differently, aggregation becomes painful later.

### Mistake 3 — overusing matrix complexity too early
For learning, explicit jobs are easier to reason about than dynamic matrix fan-out.

### Mistake 4 — forgetting artifact naming isolation
If every job uploads `ci-report` with the same name, artifact tracing gets confusing.

### Mistake 5 — mixing target identity and display title carelessly
Keep `workspace-name` as the stable identity and use human-friendly titles in summaries/comments.

---

## 19. Outcome of Block 05

You now have a monorepo CI pattern that is much closer to real platform engineering:
- multiple workspaces
- reusable quality gates
- per-target reports
- PR-visible reporting per target
- optional aggregate quality gate

This is a strong base for infrastructure validation next.

---

## 20. Suggested next block

**Block 06 — Terraform quality pipeline**

Goal of next block:
- add Terraform code under `infra/terraform`
- validate it with the same reporting mindset
- introduce `fmt`, `validate`, and `plan` summaries
- start comparing app CI and infra CI under one monorepo model

That is where the repo really starts to look like a platform engineer’s study lab.

---

## 21. Command recap

```bash
mkdir -p apps/sample-worker/src

npm install
npm run build -w packages/github-action-summary
npm run build -w @apps/sample-worker
npm run test -w @apps/sample-worker
npm run lint -w @apps/sample-worker
npm run build
npm run test
npm run lint
```

