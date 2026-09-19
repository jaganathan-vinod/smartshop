# SmartShop

Startup e-commerce MVP: customers sign up and sign in with Amazon Cognito (email and password), browse a catalogue, manage a cart, preview delivery and premium pricing, confirm an order, and repeat that journey through an in-app AI assistant.

**Status:** Phase 0 foundation is in the repo. AWS deploy is still a separate step.

## Project path

`/Users/dhivya/vinod/cursor-projects/smartshop`

## Documentation

| Document | Description |
| --- | --- |
| [docs/project-business-requirements.md](docs/project-business-requirements.md) | Product, actors, pricing, scope |
| [docs/project-technical-requirements.md](docs/project-technical-requirements.md) | Architecture, data model, APIs |
| [docs/usecase-stories/](docs/usecase-stories/) | Use-case stories per implementation phase |
| [docs/github-setup.md](docs/github-setup.md) | Connect this folder to a private GitHub repo |
| [docs/one-time-setup.md](docs/one-time-setup.md) | One-time laptop setup: Node, gh, AWS CLI, `aws configure`, CDK bootstrap |

## Stack (v1)

- Frontend: React, TypeScript, Vite on S3 + CloudFront
- API: API Gateway HTTP API
- Backend: Node.js TypeScript Lambda (modular monolith)
- Data: DynamoDB
- Auth: Amazon Cognito User Pool (email + password, self-service sign-up)
- Validation: Zod
- Assistant: Amazon Bedrock (tool calling into the same domain modules)
- Checkout: simulated (no real payments)

## Phase 0

Creates the AWS shell: Cognito User Pool, HTTP API, Lambda `GET /v1/health`, DynamoDB tables, S3 + CloudFront placeholder, shared Zod types, and a 12-product seed.

One-time laptop and AWS account setup (CLI install, `aws configure`, `get-caller-identity`, CDK bootstrap) lives in [docs/one-time-setup.md](docs/one-time-setup.md). Those commands are **not** npm scripts.

After that, from the repo root:

```bash
npm install
npm run synth            # CloudFormation template, no deploy
npm run verify:phase0    # typecheck + synth; health check after deploy
npm run deploy           # needs credentials + bootstrap already done
npm run seed
npm run verify:phase0
```

`cdk deploy` writes `cdk-outputs.json` (gitignored) with `ApiUrl`, `CloudFrontUrl`, `UserPoolId`, and `UserPoolClientId`.

Phase 0 success means: synth works, `/v1/health` returns 200, tables and User Pool exist, CloudFront shows the placeholder page. Catalogue search, signup UI, cart, and orders are later phases.
