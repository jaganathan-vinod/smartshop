# SmartShop

Startup e-commerce MVP: customers sign up and sign in with Amazon Cognito (email and password), browse a catalogue, manage a cart, preview delivery and premium pricing, confirm an order, and repeat that journey through an in-app AI assistant (text, voice, and image).

**Status:** Phases 0–4 and 6 are in the repo (Phase 5 assistant is later). AWS deploy is still a separate step.

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
| [docs/runbook.md](docs/runbook.md) | Operator runbook: Cognito, admin group, premium toggle, CORS, alarms |
| [docs/folder-structure.md](docs/folder-structure.md) | Source folders vs npm/CDK build artifacts |

## Stack (v1)

- Frontend: React, TypeScript, Vite on S3 + CloudFront
- API: API Gateway HTTP API
- Backend: Node.js TypeScript Lambda (modular monolith)
- Data: DynamoDB
- Auth: Amazon Cognito User Pool (email + password, self-service sign-up)
- Validation: Zod
- Assistant: Amazon Bedrock AgentCore Runtime (text, voice, image); tools call SmartShop over IAM
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

Phase 0 success means: synth works, `/v1/health` returns 200, tables and User Pool exist, CloudFront shows the placeholder page.

## Phase 1

Public catalogue and signed-in profile. After deploy + seed:

```bash
curl "$API_URL/v1/products"
curl "$API_URL/v1/products?q=mug"
curl "$API_URL/v1/products/prod-ceramic-mug"
curl -H "Authorization: Bearer $ID_TOKEN" "$API_URL/v1/me"
```

Admin product create and premium toggle need a Cognito user in group `admin`. See [docs/runbook.md](docs/runbook.md).

## Phase 2

Signed-in cart and quote (JWT required):

```bash
curl -H "Authorization: Bearer $ID_TOKEN" -H "Content-Type: application/json" \
  -X PUT "$API_URL/v1/cart/items" \
  -d '{"productId":"prod-ceramic-mug","quantity":2}'
curl -H "Authorization: Bearer $ID_TOKEN" "$API_URL/v1/cart"
curl -H "Authorization: Bearer $ID_TOKEN" -H "Content-Type: application/json" \
  -X POST "$API_URL/v1/quotes" \
  -d '{"deliveryMethod":"STANDARD"}'
```

Empty cart on quote returns 400 `CART_EMPTY`. Premium users get 10% off merchandise, not delivery.

## Phase 3

Signed-in confirm (JWT required). `confirm` must be boolean `true`. Optional `Idempotency-Key` header (UUID) replays the same order for 24 hours.

```bash
curl -H "Authorization: Bearer $ID_TOKEN" -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -X POST "$API_URL/v1/orders" \
  -d '{"deliveryMethod":"STANDARD","confirm":true}'
curl -H "Authorization: Bearer $ID_TOKEN" "$API_URL/v1/orders"
curl -H "Authorization: Bearer $ID_TOKEN" "$API_URL/v1/orders/$ORDER_ID"
```

Oversell returns 409 `INSUFFICIENT_STOCK`. Same key with a different body returns 409 `IDEMPOTENCY_CONFLICT`. Another customer’s order id returns 404.

## Phase 4

React + Vite SPA. Locally:

```bash
cp web/.env.example web/.env
npm install
npm run dev
```

Open http://localhost:5173 — catalogue is public; cart, checkout, orders, and chat redirect to `/login`. Sign up is Cognito (`/signup` → `/confirm` → `/login`). Vite proxies `/v1` to the deployed API so local CORS is not required. `cdk deploy` builds the SPA and writes `/config.json` with the API URL and User Pool ids.

## Phase 5

AgentCore Runtime hosts text, voice (Nova Sonic WebSocket), and image shopping. Tools call `POST /v1/internal/assistant/tools` with IAM; `userId` is injected from the inbound Cognito JWT. Public cart/order APIs stay JWT for the SPA. **Existing catalogue, checkout, and login must not change** ([§2.4](docs/project-technical-requirements.md), [US-5.08](docs/usecase-stories/phase-5-assistant.md)). Plan: [docs/usecase-stories/phase-5-assistant.md](docs/usecase-stories/phase-5-assistant.md).

## Phase 6

Hardening: JWT/group checks (customer on admin → 403; another user’s order → 404), JSON request logs without tokens, CloudWatch alarms `smartshop-api-lambda-errors` and `smartshop-api-5xx`, CORS locked to the CloudFront origin. Operator steps: [docs/runbook.md](docs/runbook.md).

## Phase 7

Admin **dashboard builder** (not customer chat): an admin types an executive-view prompt; a Cursor SDK **cloud** agent generates dashboard code; preview on live metrics; Refine on the same agent or Approve through CI/CDK. The model does not deploy. Shopping APIs, AgentCore, and assistant tools stay frozen ([§2.5](docs/project-technical-requirements.md), [US-7.07](docs/usecase-stories/phase-7-admin-dashboard.md)). Plan: [docs/usecase-stories/phase-7-admin-dashboard.md](docs/usecase-stories/phase-7-admin-dashboard.md). First slice: `/admin/reports`, read-only metrics, job create/poll/refine/approve. Deploy with `CURSOR_DASHBOARD_API_KEY` to generate; without it, metrics still load and generate returns 503.
