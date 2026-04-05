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
npm run start:dev -w @apps/sample-nest-api
npm run build -w apps/sample-nest-api
npm run test -w apps/sample-nest-api
npm run build -w packages/github-action-summary