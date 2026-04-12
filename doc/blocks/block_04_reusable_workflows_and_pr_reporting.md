# Block 04 — Reusable Workflows and PR Reporting

## Objective
Refactor the pipeline into reusable workflow building blocks and make the report visible in the Pull Request conversation
In this block, you will:
- create a reusable Node CI workflow with `workflow_call`
- keep the summary artifact/reporting pattern from Block 03
- add a PR comment step so reviewers can see the report in the PR conversation
- configure workflow permissions required for PR comments
- expose reusable workflow outputs for future jobs and deployment flows

At the end of this block, you will have:
- a reusable CI workflow
- a lightweight caller workflow
- PR-visible reporting
- a better base for scaling the monorepo to more apps/packages

---

## 1. Important correction before this block

If you were expecting the report from Block 03 to appear directly in the Pull Request conversation, that is not how `GITHUB_STEP_SUMMARY` works.

### What `GITHUB_STEP_SUMMARY` does
It writes markdown to the **workflow run summary page**.
It does **not** automatically create a PR comment.

So there are now two separate reporting surfaces in your design:

1. **Workflow summary**
   Good for run-level visibility.

2. **PR comment**
   Good for reviewer-facing visibility inside the PR conversation.

This block adds the second one.

---

## 2. Why reusable workflows now

By Block 03, the workflow is already becoming more capable.
That is good, but it is also starting to accumulate responsibilities:
- install dependencies
- run CI steps
- generate JSON report
- run summary action
- upload artifacts
- annotate failures
- make final gate decision
- now also comment on PRs

That is the right moment to introduce **reusable workflows**.

### Why reusable workflows instead of only composite actions
A composite action is good when you want to reuse a sequence of steps.
A reusable workflow is better when you want to reuse:
- multiple jobs
- job outputs
- permissions
- runner selection
- workflow inputs/secrets

For platform work, reusable workflows are often the stronger abstraction for standardized CI patterns.

---

## 3. Target design for Block 04

We will split the workflow into two layers.

### Layer A — reusable workflow
File:

```text
.github/workflows/reusable-node-ci.yml
```

Responsibilities:
- checkout
- setup node
- install dependencies
- run lint/test/build
- generate report artifact
- run summary action
- optionally comment on PR
- expose outputs
- fail at the end if needed

### Layer B — caller workflow
File:

```text
.github/workflows/ci.yml
```

Responsibilities:
- define triggers
- call the reusable workflow
- pass parameters

This separation is useful because later you can reuse the same CI workflow for:
- more apps in the monorepo
- package-only validation
- future deployment prereqs

---

## 4. Files introduced in this block

```text
.github/
  workflows/
    ci.yml
    reusable-node-ci.yml
scripts/
  generate-pr-comment.mjs
```

We will also update the root `package.json` with one helper script.

---

## 5. Reusable workflow design

### Inputs
We will define these inputs on the reusable workflow:
- `node-version`
- `report-title`
- `working-directory` (optional, can be `.` for now)
- `enable-pr-comment` (boolean-like string for simplicity)

### Outputs
We will expose:
- `overall-status`
- `total`
- `passed`
- `failed`
- `skipped`

Why this matters:
- callers can make decisions based on CI results
- later deploy workflows can depend on these outputs
- reporting becomes part of the platform contract

---

## 6. Add a script to render a PR comment body

Create `scripts/generate-pr-comment.mjs`:

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

const lines = [
  '<!-- platform-study-ci-report -->',
  `## ${input.title}`,
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

### Why include a marker comment
The HTML comment marker:

```md
<!-- platform-study-ci-report -->
```

lets you identify and update the same PR comment later instead of posting a new one on every run.

That is a common platform pattern to avoid comment spam.

---

## 7. Update root `package.json`

Add one more root script:

```json
{
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "report:ci": "node scripts/generate-ci-report.mjs",
    "report:ci:pr-comment": "node scripts/generate-pr-comment.mjs"
  }
}
```

---

## 8. Create the reusable workflow

Create `.github/workflows/reusable-node-ci.yml`:

```yaml
name: Reusable Node CI

on:
  workflow_call:
    inputs:
      node-version:
        required: false
        type: string
        default: '22'
      report-title:
        required: false
        type: string
        default: 'CI Report'
      working-directory:
        required: false
        type: string
        default: '.'
      enable-pr-comment:
        required: false
        type: boolean
        default: true
    outputs:
      overall-status:
        description: Overall CI status
        value: ${{ jobs.ci.outputs.overall-status }}
      total:
        description: Total number of checks
        value: ${{ jobs.ci.outputs.total }}
      passed:
        description: Number of passed checks
        value: ${{ jobs.ci.outputs.passed }}
      failed:
        description: Number of failed checks
        value: ${{ jobs.ci.outputs.failed }}
      skipped:
        description: Number of skipped checks
        value: ${{ jobs.ci.outputs.skipped }}

permissions:
  contents: read
  pull-requests: write

jobs:
  ci:
    runs-on: ubuntu-latest
    outputs:
      overall-status: ${{ steps.summary.outputs.overall-status }}
      total: ${{ steps.summary.outputs.total }}
      passed: ${{ steps.summary.outputs.passed }}
      failed: ${{ steps.summary.outputs.failed }}
      skipped: ${{ steps.summary.outputs.skipped }}

    defaults:
      run:
        working-directory: ${{ inputs.working-directory }}

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
        working-directory: .

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
        if: ${{ always() }}
        run: npm run report:ci -- artifacts/ci-result.json
        working-directory: .
        env:
          REPORT_TITLE: ${{ inputs.report-title }}
          LINT_OUTCOME: ${{ steps.lint.outcome }}
          LINT_DETAILS: Lint workspace run completed.
          TEST_OUTCOME: ${{ steps.test.outcome }}
          TEST_DETAILS: Test workspace run completed.
          BUILD_OUTCOME: ${{ steps.build.outcome }}
          BUILD_DETAILS: Build workspace run completed.

      - name: Run summary action
        if: ${{ always() }}
        id: summary
        uses: ./packages/github-action-summary
        with:
          input-file: artifacts/ci-result.json
          summary-title: ${{ inputs.report-title }}

      - name: Render PR comment markdown
        if: ${{ always() && github.event_name == 'pull_request' && inputs.enable-pr-comment }}
        run: npm run report:ci:pr-comment -- artifacts/ci-result.json artifacts/pr-comment.md
        working-directory: .

      - name: Create or update PR comment
        if: ${{ always() && github.event_name == 'pull_request' && inputs.enable-pr-comment }}
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('node:fs');
            const body = fs.readFileSync('artifacts/pr-comment.md', 'utf8');
            const marker = '<!-- platform-study-ci-report -->';
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
                comment.body.includes(marker),
            );

            if (existing) {
              await github.rest.issues.updateComment({
                owner,
                repo,
                comment_id: existing.id,
                body,
              });
            } else {
              await github.rest.issues.createComment({
                owner,
                repo,
                issue_number,
                body,
              });
            }

      - name: Annotate lint failure
        if: ${{ steps.lint.outcome == 'failure' }}
        run: echo '::error title=Lint failed::The lint step failed. Check eslint output in the logs.'

      - name: Annotate test failure
        if: ${{ steps.test.outcome == 'failure' }}
        run: echo '::error title=Tests failed::The test step failed. Check jest output in the logs.'

      - name: Annotate build failure
        if: ${{ steps.build.outcome == 'failure' }}
        run: echo '::error title=Build failed::The build step failed. Check compilation output in the logs.'

      - name: Upload CI report artifacts
        if: ${{ always() }}
        uses: actions/upload-artifact@v4
        with:
          name: ci-report
          path: |
            artifacts/ci-result.json
            artifacts/pr-comment.md

      - name: Print summary outputs
        if: ${{ always() }}
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

## 9. Create the caller workflow

Now replace `.github/workflows/ci.yml` with a small caller workflow:

```yaml
name: CI

on:
  pull_request:
  push:
    branches:
      - main

jobs:
  ci:
    uses: ./.github/workflows/reusable-node-ci.yml
    with:
      node-version: '22'
      report-title: 'Sample Nest API CI'
      working-directory: '.'
      enable-pr-comment: true
```

### Why this is better
Your top-level workflow is now:
- shorter
- easier to read
- easier to reuse
- more consistent across apps and repos

This is exactly the kind of refactoring platform engineers do to reduce YAML duplication.

---

## 10. Why the PR comment needs permissions

To post or update a PR comment, the workflow token needs write permission on pull requests.  
That is why the reusable workflow includes:

```yaml
permissions:
  contents: read
  pull-requests: write
```

Without the right permissions, the workflow can run but the comment creation/update will fail.

---

## 11. Why use `actions/github-script`

`actions/github-script` is a practical bridge when you need small GitHub API automation without creating another custom action yet.

It is a good fit here because we only need to:
- list comments on the PR
- find the existing report comment by marker
- create or update that comment

Later, if you want, this can be moved into a custom action package too.

---

## 12. Important behavior notes

### Note A — workflow summary and PR comment are complementary
You now have both:
- job summary in the Actions run page
- comment in the PR conversation

That is ideal for platform visibility.

### Note B — `pull_request` vs `push`
The PR comment step should run only for `pull_request` events.
It will naturally skip on `push` to `main`.

### Note C — forks can behave differently
In some repository setups, PR comment permissions for forked PRs can be more restricted.
For your study repo or internal repo, this pattern is usually fine.

---

## 13. Validation scenarios

### Scenario A — pull request with all checks green
Expected:
- workflow summary appears on the run page
- PR comment appears in the conversation tab
- artifact exists
- job succeeds

### Scenario B — pull request with build failure
Expected:
- workflow summary shows failure
- PR comment updates to failure
- annotations appear
- artifact exists
- job fails at the end

### Scenario C — repeated PR pushes
Expected:
- the same PR comment is updated, not duplicated

That last scenario is especially important, because noisy PR automation gets ignored quickly.

---

## 14. Suggested local validation sequence

```bash
npm install
npm run build -w packages/github-action-summary
npm run build
npm run lint
npm run test
```

Then push a PR and validate:
- Actions tab run summary
- PR conversation comment
- `ci-report` artifact

---

## 15. Recommended commit sequence

```bash
git add .github/workflows/reusable-node-ci.yml
git add .github/workflows/ci.yml
git add scripts/generate-pr-comment.mjs
git add package.json
git add packages/github-action-summary/dist
git commit -m "feat: add reusable node ci workflow with pr reporting"
```

---

## 16. What you learned in this block

### Technical concepts
- reusable workflows with `workflow_call`
- reusable workflow inputs and outputs
- PR-visible reporting via comment automation
- workflow token permissions for PR automation
- create-or-update comment pattern

### Architecture and design patterns involved
- **Reusable Workflow Pattern**: standardize CI behavior across repos/services
- **Contract-based CI**: inputs/outputs become part of the workflow interface
- **Report Surface Separation**: workflow summary for run observers, PR comment for reviewers
- **Idempotent Comment Update Pattern**: update a stable PR report instead of spamming new comments

---

## 17. Risks and common mistakes

### Mistake 1 — expecting `GITHUB_STEP_SUMMARY` to show in PR conversation
It does not. That needs a separate PR comment flow.

### Mistake 2 — forgetting `pull-requests: write`
Without it, PR comment creation/update can fail.

### Mistake 3 — not using a marker
If you do not identify the prior CI comment, every run may create a new one.

### Mistake 4 — putting everything in the caller workflow
The whole point of this block is to centralize platform logic in the reusable workflow.

### Mistake 5 — mixing job defaults with repo-root commands carelessly
When you use `working-directory`, remember that some repo-wide commands still need to run from the root.
That is why some steps explicitly set `working-directory: .`.

---

## 18. Outcome of Block 04

You now have:
- a reusable Node CI workflow
- a caller workflow that stays small
- workflow summary reporting
- PR-visible reporting in the conversation tab
- CI outputs that can be consumed by future jobs

This is a strong platform-oriented baseline.

---

## 19. Suggested next block

**Block 05 — Multi-app scaling and reusable quality gates**

Goal of next block:
- support multiple apps/packages in the monorepo
- add matrix strategies or per-workspace targeting
- reuse the same reporting contract for several units
- prepare the repo for Terraform and CDK validation flows

That is the next natural jump from a single-service study repo to a real platform monorepo pattern.

---

## 20. Command recap

```bash
npm install
npm run build -w packages/github-action-summary
npm run build
npm run lint
npm run test
```

