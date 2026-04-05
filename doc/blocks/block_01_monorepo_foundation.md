# Block 01 — Monorepo Foundation (npm Workspaces)

## Objective
Create the base monorepo for studying:
- GitHub Actions pipelines
- TypeScript custom actions
- summaries and reports in CI
- future Terraform and CDK integration
- a sample NestJS app as the pipeline target

At the end of this block, you will have:
- a working monorepo
- one NestJS application
- one package reserved for a custom GitHub Action
- a base TypeScript setup
- a first GitHub Actions CI workflow
- a study document you can keep as project log

---

## 1. Architectural goal of this block

We want a structure that supports three concerns from day one:

1. **Application layer**  
   A real service to lint, test, build, and report on.

2. **Platform tooling layer**  
   Internal reusable packages, especially custom GitHub Actions written in TypeScript.

3. **Infrastructure layer**  
   A clean place for Terraform and CDK later, without mixing infra with app code.

This follows a simple separation of concerns:
- `apps/` for executable products
- `packages/` for reusable building blocks
- `infra/` for infrastructure as code
- `.github/workflows/` for delivery orchestration
- `docs/blocks/` for study logs and reproducible knowledge

---

## 2. Recommended stack for this study repo

For the first version, use:
- **Node.js 22 LTS**
- **npm workspaces**
- **TypeScript**
- **NestJS**
- **Jest**
- **ESLint**
- **Prettier**
- **GitHub Actions**

Why this setup:
- `npm workspaces` is native and fits what you already use
- TypeScript is required for the custom actions track
- NestJS gives you a realistic backend target
- Jest and ESLint generate useful outputs for future summaries

---

## 3. Final target structure for Block 01

```text
platform-study-monorepo/
  .github/
    workflows/
      ci.yml
  apps/
    sample-nest-api/
  packages/
    github-actions-summary/
  infra/
    terraform/
    cdk/
  docs/
    blocks/
      block-01-monorepo-foundation.md
  .editorconfig
  .gitignore
  .prettierrc
  eslint.config.mjs
  package.json
  tsconfig.base.json
  tsconfig.json
  README.md
```

---

## 4. Create the repository

### 4.1 Create root folder

```bash
mkdir platform-study-monorepo
cd platform-study-monorepo
git init
```

### 4.2 Create base folders

```bash
mkdir -p .github/workflows
mkdir -p apps
mkdir -p packages
mkdir -p infra/terraform
mkdir -p infra/cdk
mkdir -p docs/blocks
```

---

## 5. Root workspace configuration

### 5.1 `package.json`

Create this file at the repository root:

```json
{
  "name": "platform-study-monorepo",
  "private": true,
  "version": "0.1.0",
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  },
  "devDependencies": {
    "@eslint/js": "^9.24.0",
    "@types/node": "^22.14.1",
    "eslint": "^9.24.0",
    "globals": "^16.0.0",
    "prettier": "^3.5.3",
    "typescript": "^5.8.3",
    "typescript-eslint": "^8.29.0"
  }
}
```

### 5.2 Why this root script strategy works with npm workspaces

These commands:

```bash
npm run build --workspaces --if-present
npm run lint --workspaces --if-present
npm run test --workspaces --if-present
```

mean:
- run the script in each workspace
- skip workspaces that do not define that script
- let the root orchestrate the monorepo

That gives you a simple monorepo flow without introducing extra tooling yet.

---

## 6. TypeScript base setup

### 6.1 `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "removeComments": false,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUncheckedIndexedAccess": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### 6.2 `tsconfig.json`

```json
{
  "extends": "./tsconfig.base.json",
  "files": [],
  "references": []
}
```

Why two files:
- `tsconfig.base.json` holds shared compiler conventions
- `tsconfig.json` becomes the root orchestration point for future project references

This is a good monorepo pattern because later you can scale to composite builds and shared references.

---

## 7. Formatting and linting

### 7.1 `.prettierrc`

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100
}
```

### 7.2 `.editorconfig`

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true
```

### 7.3 `eslint.config.mjs`

```javascript
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', '**/.turbo/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
```

Why keep lint simple now:
- this block is foundation, not maximum strictness
- later blocks can add package boundaries, depcruise, semgrep, and report generation

---

## 8. Root `.gitignore`

```gitignore
node_modules/

coverage/
dist/
.tmp/

.env
.env.*

.DS_Store
.idea/
.vscode/

*.tsbuildinfo
```

Important: **commit `package-lock.json`** in a real repository.  
For npm-based CI reproducibility, the lockfile should be versioned.

---

## 9. Create the NestJS sample app

### 9.1 Bootstrap app

From the repository root:

```bash
npx -y @nestjs/cli@11 new apps/sample-nest-api --package-manager npm --strict
```

If the CLI asks to install dependencies, allow it.

After creation, the app will already contain:
- `src/main.ts`
- `src/app.module.ts`
- controller/service examples
- Jest config
- build/test scripts

---

## 10. Normalize the NestJS app for the monorepo

Open `apps/sample-nest-api/package.json` and make it look like this:

```json
{
  "name": "@apps/sample-nest-api",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:debug": "nest start --debug --watch",
    "start:prod": "node dist/main",
    "lint": "eslint \"{src,test}/**/*.ts\" --fix",
    "test": "jest --passWithNoTests",
    "test:cov": "jest --coverage",
    "test:e2e": "jest --config ./test/jest-e2e.json"
  }
}
```

### 10.1 Why keep a real app here

This app is not just a toy.  
It will be the pipeline target for:
- lint reports
- unit test reports
- coverage reports
- build verification
- future deployment packaging

That makes the custom actions useful in a realistic scenario.

---

## 11. Create the custom GitHub Action package placeholder

Create the package folder:

```bash
mkdir -p packages/github-actions-summary/src
```

### 11.1 `packages/github-actions-summary/package.json`

```json
{
  "name": "@packages/github-actions-summary",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "lint": "eslint \"src/**/*.ts\"",
    "test": "node --test"
  },
  "devDependencies": {
    "@actions/core": "^1.11.1",
    "@actions/github": "^6.0.1"
  }
}
```

### 11.2 `packages/github-actions-summary/tsconfig.json`

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

### 11.3 `packages/github-actions-summary/src/index.ts`

```ts
export function placeholder(): string {
  return 'github-actions-summary placeholder';
}

console.log(placeholder());
```

Why create the placeholder now:
- it validates package structure early
- it lets the workspace build everything from the root
- Block 2 can focus only on action behavior, not project plumbing

---

## 12. Install dependencies from the root

Run:

```bash
npm install
```

Then build everything:

```bash
npm run build
```

Lint everything:

```bash
npm run lint
```

Test everything:

```bash
npm run test
```

At this stage, the repo should already behave as a monorepo with shared root commands.

---

## 13. Add a first README

Create `README.md`:

```md
# Platform Study Monorepo

Monorepo for studying:
- GitHub Actions with TypeScript custom actions
- pipeline summaries and reports
- Terraform and AWS CDK delivery flows
- platform engineering patterns for NestJS services

## Workspace structure

- `apps/` executable applications
- `packages/` reusable internal packages and actions
- `infra/` infrastructure as code
- `.github/workflows/` CI/CD workflows
- `docs/blocks/` study notes and logs

## Root commands

```bash
npm install
npm run build
npm run lint
npm run test
npm run format
```
```

---

## 14. Add the first GitHub Actions workflow

Create `.github/workflows/ci.yml`:

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

      - name: Workflow summary
        run: |
          echo "## CI Result" >> $GITHUB_STEP_SUMMARY
          echo "- Lint: passed" >> $GITHUB_STEP_SUMMARY
          echo "- Test: passed" >> $GITHUB_STEP_SUMMARY
          echo "- Build: passed" >> $GITHUB_STEP_SUMMARY
```

### Why this workflow matters

Even though it is simple, this workflow already introduces an important concept:
- the pipeline is not only for execution
- the pipeline is also for **communication**

That is exactly the bridge toward summary/report actions.

---

## 15. GitHub Actions design notes for later blocks

This first workflow is intentionally simple.  
Later we will evolve it into:
- separate jobs
- artifacts
- structured test result files
- custom TypeScript action execution
- reusable workflows
- PR comments
- infra plan summaries

So this block establishes the **execution backbone** that later blocks will enrich.

---

## 16. Suggested first commit sequence

```bash
git add .
git commit -m "chore: initialize platform study monorepo foundation"
```

If you want smaller history slices, use:

```bash
git add .
git commit -m "chore: add root monorepo workspace"

git add apps/sample-nest-api
git commit -m "feat: add sample NestJS app"

git add packages/github-actions-summary
git commit -m "feat: add github action summary package scaffold"

git add .github/workflows/ci.yml
git commit -m "ci: add initial monorepo workflow"
```

---

## 17. Validation checklist

Before moving to Block 02, verify:

- `npm install` works at root
- `npm run build` works at root
- `npm run lint` works at root
- `npm run test` works at root
- NestJS app runs locally
- CI workflow exists and is committed
- `packages/github-actions-summary` builds successfully

Run the app:

```bash
npm run start:dev -w @apps/sample-nest-api
```

You should be able to access the default NestJS route locally.

You can also run a specific workspace directly with path syntax if needed:

```bash
npm run build -w apps/sample-nest-api
npm run test -w apps/sample-nest-api
npm run build -w packages/github-actions-summary
```

---

## 18. What you learned in this block

### Technical concepts
- monorepo foundation
- npm workspace orchestration
- separation of concerns across app, package, and infra layers
- shared TypeScript base configuration
- root-level CI orchestration

### Architecture and design patterns involved
- **Modular Monolith / Monorepo partitioning**: clear boundaries by folder responsibility
- **Separation of Concerns**: app code, platform tooling, and infra code do not compete in the same space
- **Scaffolding for Reuse**: packages become reusable assets instead of app-local utilities
- **Pipeline as Product mindset**: CI is designed to communicate status, not only run commands

---

## 19. Risks and common mistakes

### Mistake 1 — mixing app and platform code too early
If you put custom action logic inside the app, reuse becomes painful.

### Mistake 2 — over-engineering root TypeScript config
Keep the root config stable and boring.  
Advanced optimizations can come later.

### Mistake 3 — adding Terraform/CDK before the base pipeline is healthy
If CI is not clean yet, infra blocks become harder to debug.

### Mistake 4 — not treating docs as part of the project
Your `docs/blocks` folder is part of the study architecture, not an afterthought.

### Mistake 5 — not committing `package-lock.json`
For npm and GitHub Actions, reproducibility is much better when `npm ci` uses a committed lockfile.

---

## 20. Outcome of Block 01

You now have a base repository ready for the next step:  
**Block 02 — build the first real TypeScript GitHub Action that generates a CI summary from structured input**.

That next block should introduce:
- `action.yml`
- Action Toolkit usage
- inputs and outputs
- markdown generation
- local test fixtures
- integration into the workflow

---

## 21. Optional improvements if you want to go slightly further now

These are optional and safe to postpone:
- add `npm workspaces` focused scripts per package later
- add Turbo later if you want task graph orchestration
- add Husky or Lefthook later
- add coverage reporters later
- split CI into separate jobs later

For now, keep the foundation clean and small.

---

## 22. Command recap

```bash
mkdir platform-study-monorepo
cd platform-study-monorepo
git init

mkdir -p .github/workflows apps packages infra/terraform infra/cdk docs/blocks

npx -y @nestjs/cli@11 new apps/sample-nest-api --package-manager npm --strict
mkdir -p packages/github-actions-summary/src

npm install
npm run build
npm run lint
npm run test

npm run start:dev -w @apps/sample-nest-api
```

---

## 23. Suggested next block

**Block 02 — First TypeScript GitHub Action**

Goal of next block:
- consume a JSON file containing CI results
- compute totals
- generate markdown summary
- publish outputs for other jobs
- wire it into the existing GitHub Actions workflow

