# Block 02 — First TypeScript GitHub Action

## Objective
Build the first real custom GitHub Action in TypeScript for the monorepo.

This action will:
- read a JSON file with CI result data
- validate and normalize the input
- compute totals
- generate a markdown summary
- write to `GITHUB_STEP_SUMMARY`
- expose outputs for later workflow steps

At the end of this block, you will have:
- a real custom action package
- `action.yml`
- TypeScript code using the GitHub Actions toolkit
- a local fixture to test the action logic
- a workflow wired to execute the action
- a reusable base for future test/lint/coverage/Terraform/CDK summaries

---

## 1. Why this block matters

In GitHub Actions, many teams stop at YAML orchestration.
That is useful, but shallow.

A platform-oriented engineer should go one level deeper:
- move repeated workflow logic into reusable actions
- standardize outputs
- standardize reports
- turn pipeline execution into pipeline communication

This block introduces exactly that mindset.

Instead of hardcoding summary text directly in the workflow, we will create a reusable **TypeScript action** that can later summarize:
- Jest results
- ESLint results
- coverage results
- Terraform plan stats
- CDK diff stats
- deployment status

---

## 2. Target design

We will use the package created in Block 01:

```text
packages/
  github-action-summary/
    action.yml
    package.json
    tsconfig.json
    src/
      index.ts
      types.ts
      markdown.ts
      parser.ts
    fixtures/
      ci-result.sample.json
```

### Design intent

We are separating concerns inside the action package:
- `types.ts`: contracts
- `parser.ts`: parsing and normalization
- `markdown.ts`: rendering
- `index.ts`: orchestration, GitHub Actions inputs/outputs

This is small, but already follows a clean package design.

---

## 3. What the input JSON will look like

For this first version, use a simple schema:

```json
{
  "title": "Sample Nest API CI",
  "checks": [
    {
      "name": "lint",
      "status": "passed",
      "details": "ESLint completed successfully"
    },
    {
      "name": "test",
      "status": "passed",
      "details": "All unit tests passed"
    },
    {
      "name": "build",
      "status": "failed",
      "details": "TypeScript compilation failed in one workspace"
    }
  ]
}
```

This gives us enough information to:
- count total checks
- count passed checks
- count failed checks
- count skipped checks later
- render a readable markdown summary

---

## 4. Action contract

### Inputs
- `input-file`: path to the JSON file
- `summary-title`: optional override for the markdown title

### Outputs
- `total`
- `passed`
- `failed`
- `skipped`
- `overall-status`

### Behavior
- if any check failed, `overall-status=failed`
- otherwise if all are passed, `overall-status=passed`
- `skipped` is allowed for future use

---

## 5. Install the required dependencies

From the repository root, install build/runtime dependencies for the action package.

### 5.1 Runtime dependencies for the action

```bash
npm install -w packages/github-action-summary @actions/core @actions/github
```

### 5.2 Dev/build dependency for bundling

GitHub custom JavaScript actions typically need a compiled distributable file committed in the repository.  
For that, use `tsup` to bundle the action.

```bash
npm install -D -w packages/github-action-summary tsup
```

Why bundle now:
- GitHub Actions cannot compile TypeScript for you at runtime
- you commit the generated JS bundle used by `action.yml`
- later this also helps package versioning and release discipline

---

## 6. Update the action package `package.json`

Replace `packages/github-action-summary/package.json` with:

```json
{
  "name": "@packages/github-action-summary",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts --out-dir dist",
    "lint": "eslint \"src/**/*.ts\"",
    "test": "node --test",
    "dev": "node --loader ts-node/esm src/index.ts"
  },
  "dependencies": {
    "@actions/core": "^1.11.1",
    "@actions/github": "^6.0.1"
  },
  "devDependencies": {
    "tsup": "^8.5.0"
  }
}
```

### Important note
The `dev` script is optional and not required by GitHub Actions itself.  
It is only there if you later want to run parts locally with a TS loader.

If you prefer to keep things minimal, you can remove `dev`.

---

## 7. Keep the package `tsconfig.json`

Use this in `packages/github-action-summary/tsconfig.json`:

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

---

## 8. Create `action.yml`

Create `packages/github-action-summary/action.yml`:

```yaml
name: 'GitHub Action Summary'
description: 'Reads CI result JSON and writes a markdown summary with outputs'
author: 'Raphael study monorepo'

inputs:
  input-file:
    description: 'Path to the JSON file containing CI results'
    required: true
  summary-title:
    description: 'Optional title override for the generated summary'
    required: false
    default: ''

outputs:
  total:
    description: 'Total number of checks'
  passed:
    description: 'Number of passed checks'
  failed:
    description: 'Number of failed checks'
  skipped:
    description: 'Number of skipped checks'
  overall-status:
    description: 'Overall status derived from all checks'

runs:
  using: 'node20'
  main: 'dist/index.js'
```

### Why `action.yml` matters

This file is the contract between GitHub Actions and your package.
It defines:
- how the action is called
- what inputs it accepts
- what outputs it emits
- which compiled file GitHub runs

It is similar to a public interface in package design.

---

## 9. Create the TypeScript contracts

### 9.1 `src/types.ts`

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
  overallStatus: CheckStatus | 'passed';
}
```

### Design note
The action works better when it has explicit contracts rather than anonymous objects.  
This improves:
- maintainability
- future validation
- testability
- reuse across future packages

---

## 10. Create the parser/normalizer

### 10.1 `src/parser.ts`

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

  return {
    ...stats,
    overallStatus: stats.failed > 0 ? 'failed' : 'passed',
  };
}
```

### What this layer does

This file handles:
- filesystem reading
- JSON parsing
- shape validation
- normalization
- aggregate statistics

This is a classic **data transformation layer**.
It keeps `index.ts` cleaner and more orchestration-focused.

---

## 11. Create the markdown renderer

### 11.1 `src/markdown.ts`

```ts
import { SummaryInput, SummaryStats } from './types.js';

function statusIcon(status: string): string {
  switch (status) {
    case 'passed':
      return '✅';
    case 'failed':
      return '❌';
    case 'skipped':
      return '⏭️';
    default:
      return '•';
  }
}

export function renderSummaryMarkdown(input: SummaryInput, stats: SummaryStats, title?: string): string {
  const heading = title && title.trim().length > 0 ? title : input.title;

  const checkLines = input.checks
    .map((check) => {
      const details = check.details ? ` — ${check.details}` : '';
      return `- ${statusIcon(check.status)} **${check.name}**: ${check.status}${details}`;
    })
    .join('\n');

  return [
    `## ${heading}`,
    '',
    `- **Overall status**: ${stats.overallStatus}`,
    `- **Total**: ${stats.total}`,
    `- **Passed**: ${stats.passed}`,
    `- **Failed**: ${stats.failed}`,
    `- **Skipped**: ${stats.skipped}`,
    '',
    '### Checks',
    checkLines,
    '',
  ].join('\n');
}
```

### Why isolate rendering

Separating rendering from parsing is useful because later you may want:
- markdown summary
- PR comment markdown
- compact summary
- HTML export in another context

That is a small example of the **Single Responsibility Principle**.

---

## 12. Create the action entrypoint

### 12.1 `src/index.ts`

```ts
import * as core from '@actions/core';
import { computeStats, readSummaryInput } from './parser.js';
import { renderSummaryMarkdown } from './markdown.js';

async function run(): Promise<void> {
  try {
    const inputFile = core.getInput('input-file', { required: true });
    const summaryTitle = core.getInput('summary-title');

    const input = readSummaryInput(inputFile);
    const stats = computeStats(input);
    const markdown = renderSummaryMarkdown(input, stats, summaryTitle);

    core.summary.addRaw(markdown).write();

    core.setOutput('total', String(stats.total));
    core.setOutput('passed', String(stats.passed));
    core.setOutput('failed', String(stats.failed));
    core.setOutput('skipped', String(stats.skipped));
    core.setOutput('overall-status', stats.overallStatus);

    core.info(`Summary generated successfully for ${input.title}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error while running action';
    core.setFailed(message);
  }
}

void run();
```

### Important detail
`core.summary` is one of the most useful features for report-oriented pipeline design.  
It lets you write structured markdown directly into the job summary shown in GitHub Actions. ([GitHub Docs])

In our design, `index.ts` is acting like the **application service / orchestrator**:
- get inputs
- invoke domain-like functions
- publish outputs
- handle failures

---

## 13. Add a local fixture

Create `packages/github-action-summary/fixtures/ci-result.sample.json`:

```json
{
  "title": "Sample Nest API CI",
  "checks": [
    {
      "name": "lint",
      "status": "passed",
      "details": "ESLint completed successfully"
    },
    {
      "name": "test",
      "status": "passed",
      "details": "All unit tests passed"
    },
    {
      "name": "build",
      "status": "failed",
      "details": "TypeScript compilation failed in one workspace"
    }
  ]
}
```

This file will help you:
- reason about the contract
- manually test the action logic
- create future tests more easily

---

## 14. Build the action package

From the repository root:

```bash
npm run build -w packages/github-action-summary
```

After the build, verify that this exists:

```text
packages/github-action-summary/dist/index.js
```

That compiled file is the artifact GitHub Actions will execute.

---

## 15. Wire the action into the workflow

Now update `.github/workflows/ci.yml` to generate a temporary JSON file and run the action.

Replace the workflow with:

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
        run: npm run lint

      - name: Test
        run: npm run test

      - name: Build
        run: npm run build

      - name: Create CI result JSON
        run: |
          cat <<'EOF' > ci-result.json
          {
            "title": "Sample Nest API CI",
            "checks": [
              {
                "name": "lint",
                "status": "passed",
                "details": "Lint completed successfully"
              },
              {
                "name": "test",
                "status": "passed",
                "details": "Tests completed successfully"
              },
              {
                "name": "build",
                "status": "passed",
                "details": "Build completed successfully"
              }
            ]
          }
          EOF

      - name: Run summary action
        id: summary
        uses: ./packages/github-action-summary
        with:
          input-file: ci-result.json
          summary-title: 'CI Summary Report'

      - name: Print outputs
        run: |
          echo "total=${{ steps.summary.outputs.total }}"
          echo "passed=${{ steps.summary.outputs.passed }}"
          echo "failed=${{ steps.summary.outputs.failed }}"
          echo "skipped=${{ steps.summary.outputs.skipped }}"
          echo "overall-status=${{ steps.summary.outputs.overall-status }}"
```

---

## 16. Important local-action behavior in GitHub

For `uses: ./packages/github-action-summary` to work, the action directory must contain:
- `action.yml`
- the referenced compiled JS file in `dist/`

That means for local actions you generally need to:
1. build the action locally
2. commit the generated `dist/` files
3. push them with the workflow

Yes, committing `dist/` for custom GitHub Actions is normal in this case.

### Recommended action package `.gitignore`

Do **not** ignore `dist/` inside this specific action package if the action is consumed directly from the repo by GitHub.

At the root, if you currently ignore all `dist/`, add an exception like this:

```gitignore
node_modules/

coverage/
dist/
!packages/github-action-summary/dist/
.tmp/

.env
.env.*

.DS_Store
.idea/
.vscode/

*.tsbuildinfo
```

Because Git ignore rules can be tricky with nested paths, a safer approach is:
- remove the global `dist/` ignore
- ignore only workspace-specific build outputs where needed
- or explicitly re-include the action `dist/`

For this study repo, the cleanest approach is this version:

```gitignore
node_modules/

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

---

## 17. Build and validate everything

Run from the repo root:

```bash
npm install
npm run build
npm run lint
npm run test
```

Then explicitly rebuild the action:

```bash
npm run build -w packages/github-action-summary
```

Check generated files:

```bash
ls packages/github-action-summary/dist
```

You should see at least:

```text
index.js
index.d.ts
```

---

## 18. Suggested commit sequence

```bash
git add packages/github-action-summary
git add .github/workflows/ci.yml
git add .gitignore
git commit -m "feat: add first TypeScript GitHub summary action"
```

---

## 19. Validation checklist

Before moving to Block 03, verify:

- `action.yml` exists
- `packages/github-action-summary/dist/index.js` exists
- workflow uses `./packages/github-action-summary`
- the job summary in GitHub shows the markdown report
- outputs are printed in the workflow log
- changing one check status to `failed` changes `overall-status`

### Good manual test
Change the generated JSON in the workflow so that one check becomes failed:

```json
{
  "name": "build",
  "status": "failed",
  "details": "Build failed due to TypeScript error"
}
```

Then push and confirm:
- the summary shows one failed check
- output `overall-status=failed`

---

## 20. What you learned in this block

### Technical concepts
- GitHub custom JavaScript action structure
- `action.yml` contract
- TypeScript-to-JavaScript bundling for Actions
- using `@actions/core`
- reading action inputs and writing outputs
- writing markdown to `GITHUB_STEP_SUMMARY`
- local action consumption through `uses: ./path`

### Architecture and design patterns involved
- **Separation of Concerns**: parser, renderer, and entrypoint are isolated
- **Contract First Design**: `action.yml` + `types.ts` define stable boundaries
- **Orchestration Layer Pattern**: `index.ts` coordinates components without embedding all logic
- **Reusable Package Mindset**: pipeline logic becomes a reusable asset, not workflow duplication

---

## 21. Risks and common mistakes

### Mistake 1 — forgetting to build the action
If `dist/index.js` does not exist, GitHub cannot execute the action.

### Mistake 2 — forgetting to commit `dist/`
For repo-local custom actions, GitHub needs the compiled file in the repository content.

### Mistake 3 — overloading `index.ts`
If all parsing, rendering, and validation stay in one file, maintenance gets messy fast.

### Mistake 4 — weak contracts
If the input JSON shape is vague, later summary reuse becomes painful.

### Mistake 5 — trying to summarize raw tool output too early
For now, use structured input JSON.  
In later blocks, we can transform real Jest/ESLint/Terraform outputs into that shape.

---

## 22. Outcome of Block 02

You now have the first real platform asset in the monorepo:
- a reusable custom TypeScript GitHub Action
- structured input/output behavior
- markdown summary generation
- a concrete integration point in CI

This is the first step from “workflow user” to “pipeline tooling builder”.

---

## 23. Strong suggestion before Block 03

Before moving on, make one small improvement yourself:
- add one more fixture with all checks passed
- add another fixture with one failed check

That helps solidify the contract and prepares the package for tests.

---

## 24. Suggested next block

**Block 03 — PR summaries and richer reports**

Goal of next block:
- capture real outputs from lint/test/build
- transform them into structured JSON
- use the action to generate a real report
- publish artifacts
- add annotations and possibly PR comments

---

## 25. Command recap

```bash
npm install -w packages/github-action-summary @actions/core @actions/github
npm install -D -w packages/github-action-summary tsup

npm run build -w packages/github-action-summary
npm run build
npm run lint
npm run test
```

---

## 26. Notes on official docs

The design here follows the normal GitHub Actions custom action model:
- JavaScript actions are defined with `action.yml`
- the runtime executes compiled JavaScript, not raw TypeScript
- inputs/outputs are handled through the Actions toolkit
- job summaries are written through GitHub Actions summary support

When you later want, we can also align this package with the official TypeScript action template structure more closely.

