# Platform Pipeline Study Monorepo

## Goal

Build a study monorepo focused on:

* GitHub Actions with TypeScript custom actions
* Pipeline summaries and rich reports
* Infrastructure deployment with Terraform and/or AWS CDK
* Reusable CI/CD patterns for platform engineering

## Candidate study projects

### Option A — Pipeline Observability Lab

Create a monorepo where pull requests generate:

* test summaries
* lint summaries
* coverage summaries
* infra plan summaries
* PR comments/check annotations

**What you learn**

* custom GitHub Actions in TypeScript
* workflow commands, outputs, annotations
* job summaries and artifact publishing
* reusable workflows

**Why it is a strong starting point**

* fastest feedback loop
* no cloud account required for the first blocks
* directly useful for NestJS/platform work

---

### Option B — Infra Delivery Lab

Create a monorepo with an application package plus infra packages that deploy using:

* Terraform
* AWS CDK
* GitHub Actions with OIDC

**What you learn**

* IaC structure
* deploy pipelines
* environment promotion
* plan/apply or synth/diff/deploy flows

**Why it is strong**

* gives you real deployment practice
* good bridge between platform and app delivery

**Tradeoff**

* more setup and cloud prerequisites early

---

### Option C — Platform Action Toolkit

Build a set of internal reusable actions:

* changed-files detector
* NestJS quality gate action
* Terraform plan summarizer
* CDK diff summarizer
* release note generator

**What you learn**

* action packaging/versioning
* action contracts and inputs/outputs
* reuse across repos

**Why it is strong**

* very platform-oriented
* produces reusable assets

**Tradeoff**

* benefits more after you already have a sample repo consuming them

## Recommended order

1. Start with **Option A**
2. Add a small slice of **Option C** inside it
3. Then add **Option B** when the local CI/reporting baseline is stable

That gives you a gradual path from local pipeline intelligence to real deployment automation.

## Proposed monorepo shape

```text
platform-study-monorepo/
  apps/
    sample-nest-api/
  packages/
    github-actions-summary/
    github-actions-pr-comment/
    shared-report-models/
  infra/
    terraform/
    cdk/
  .github/
    workflows/
      ci.yml
      pr-report.yml
      terraform-plan.yml
      cdk-diff.yml
      deploy.yml
      reusable-node-ci.yml
  docs/
    blocks/
      block-01-foundation.md
      block-02-typescript-action-basics.md
      block-03-ci-summary-and-reports.md
      block-04-reusable-workflows.md
      block-05-terraform-pipeline.md
      block-06-cdk-pipeline.md
      block-07-oidc-deploy.md
```

## Step-by-step blocks

### Block 1 — Monorepo foundation

Set up:

* pnpm or npm workspaces
* TypeScript base config
* lint/format/test standards
* a sample NestJS app
* a package for custom GitHub Actions

### Block 2 — First TypeScript GitHub Action

Build an action that:

* reads JSON test results
* computes totals and failures
* writes a job summary
* exposes outputs

### Block 3 — PR summaries and reports

Enhance workflows to:

* publish markdown summaries
* attach artifacts
* annotate failures
* optionally comment on PRs

### Block 4 — Reusable workflows

Refactor CI into reusable workflows:

* generic Node CI
* generic package test workflow
* PR quality gate

### Block 5 — Terraform pipeline

Add Terraform module(s) and workflow:

* fmt
* validate
* plan
* plan summary generation

### Block 6 — CDK pipeline

Add CDK app and workflow:

* synth
* diff
* deployment-ready structure
* diff summary generation

### Block 7 — Secure cloud delivery

Add:

* GitHub OIDC authentication
* protected environments
* branch controls
* deploy promotion strategy

### Block 8 — Platform-grade polish

Add:

* matrix builds
* caching
* dependency graph or SBOM export
* release automation
* status dashboards

## Suggested first milestone

Finish Blocks 1 through 3. At that point you will already have:

* a working monorepo
* one custom TypeScript action
* real summaries/reports in GitHub Actions
* a base to expand into Terraform/CDK

## Decision note

Best default starting point: **Option A with a built-in mini version of Option C**.
