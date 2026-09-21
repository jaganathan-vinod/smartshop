# Phase 7 — Admin dashboard builder

**Goal:** A signed-in **admin** describes an executive dashboard in plain language. SmartShop starts a **Cursor SDK cloud agent** against this repo. The agent generates dashboard code, the admin **previews** it on live metrics, then either **refines** the prompt on the same agent or **approves**. Approve deploys through the existing CI/CDK path. The Cursor agent **never** deploys AWS.

This is **not** the customer shopping assistant. It does not use AgentCore Runtime, Nova, or `POST /v1/internal/assistant/tools`.

**Related:** [project-technical-requirements.md](../project-technical-requirements.md) §2.5, §5.9, §6

---

## Architecture (locked for Phase 7)

| Decision | Choice |
| --- | --- |
| Actor | Cognito group `admin` only |
| Host | Admin screens in the existing CloudFront SPA (`/admin/reports`) |
| Code generation | Cursor TypeScript SDK (`@cursor/sdk`) **cloud** agent on the SmartShop GitHub repo |
| Invocation | `Agent.create` + `agent.send` + `Agent.resume` (durable). Not one-shot `Agent.prompt` — Refine must keep the thread |
| API key | Service-account `CURSOR_API_KEY` on the **backend** (Secrets Manager or GitHub Actions). Browser never sees it |
| Preview | Agent writes only under an allowlisted path (`web/src/admin/reports/generated/` or a preview S3 prefix). Admin iframe loads that build |
| Live publish | Human **Approve** starts CDK/CI. Model has no `cdk deploy` / AWS admin credentials |
| Metrics | Read-only admin metrics API over existing DynamoDB (orders, products, users). No invented numbers. Unknown KPIs render **not available** |
| Shopping / assistant | **Frozen** — see §2.4 and US-7.07 |

**Compatibility:** Phase 7 must not change catalogue, cart, checkout, orders, login, CORS, JWT authorizers, AgentCore Runtime, or assistant tools.

**Build order:** this documentation → read-only metrics API → dashboard-job API (create / send / status / preview URL) → preview hosting → admin prompt UI → Approve pipeline. After each slice, Phase 1–6 tests and shopping/chat flows must still pass.

---

## US-7.01 Prompt a dashboard

**Title:** Admin describes an executive view  
**Actor:** Admin  
**Story:** As an admin, I want to type a high-level dashboard prompt (metrics and objectives) so a Cursor agent can generate an executive-looking page.

**Preconditions**

- Signed in. Cognito group contains `admin`.
- Cursor cloud agent can clone the private SmartShop repo (service account + GitHub access).
- `CURSOR_API_KEY` is configured on the backend, not in the SPA.

**Main flow**

1. Admin opens `/admin/reports` and types a prompt (for example: weekly GMV vs a $12k target, top products, stockouts).
2. SPA `POST /v1/admin/reports/jobs` with the prompt (customer JWT, admin group).
3. Lambda starts `Agent.create` (cloud, this repo) and `agent.send` with a system brief: allowlisted output directory, read-only metrics contract, do not edit shopping/assistant/infra except the reports preview path.
4. Response returns `{ jobId, agentId, status: "running" }`. SPA polls or streams status.

**Acceptance criteria**

- Non-admin JWT → 403. Missing JWT → 401.
- Job record stores `agentId` for resume.
- Agent working tree constraint is the reports allowlist; shopping Lambda and AgentCore sources are out of bounds.

**APIs / screens**

- `/admin/reports`
- `POST /v1/admin/reports/jobs`

**Out of scope**

- Customer-facing analytics.
- Merchant product-CRUD UI (admin product APIs stay curl/Postman).

---

## US-7.02 Preview before publish

**Title:** Show generated dashboard on live metrics  
**Actor:** Admin  
**Story:** As an admin, I want a preview of the generated dashboard bound to real SmartShop data before anything goes live.

**Preconditions**

- US-7.01 job reached `status: "preview_ready"` (`run.wait()` finished successfully).

**Main flow**

1. Admin opens the preview iframe (URL from the job).
2. Widgets call `GET /v1/admin/metrics/...` with the admin JWT (or a short-lived preview token scoped to metrics).
3. Missing metrics show **not available**, not a guessed number.

**Acceptance criteria**

- Preview is not the production `/admin/reports` live view until Approve.
- Preview GMV/order counts match the same DynamoDB orders the shop uses (cent math, USD).
- A prompt that asks for “session conversion” when view events do not exist shows **not available** for that widget.

**APIs / screens**

- Job `previewUrl`
- `GET /v1/admin/metrics/summary` (and related read-only routes in §5.9)

**Out of scope**

- A separate analytics warehouse or OpenSearch.

---

## US-7.03 Refine on the same agent

**Title:** Change requirements and rebuild preview  
**Actor:** Admin  
**Story:** As an admin, I want to refine the dashboard (drop a KPI, add delivery mix) without starting from a blank agent.

**Preconditions**

- Job has `agentId` from US-7.01.

**Main flow**

1. Admin types a follow-up on the same job.
2. SPA `POST /v1/admin/reports/jobs/{jobId}/messages`.
3. Backend `Agent.resume(agentId)` then `agent.send(followUp)`.
4. New preview replaces the old one when `wait()` succeeds.

**Acceptance criteria**

- Follow-up does not call one-shot `Agent.prompt` (that would drop conversation context).
- Failed run (`result.status === "error"`) leaves the last good preview in place and surfaces the error on the job.

**APIs / screens**

- `POST /v1/admin/reports/jobs/{jobId}/messages`

**Out of scope**

- Multi-admin collaborative editing of one job.

---

## US-7.04 Approve deploys; the model does not

**Title:** Human Approve publishes via CI/CDK  
**Actor:** Admin  
**Story:** As an admin, I want Approve to publish the previewed dashboard, and I want Reject/Refine to leave production unchanged.

**Preconditions**

- Preview accepted by the admin (US-7.02).

**Main flow**

1. Admin clicks **Approve and deploy**.
2. SPA `POST /v1/admin/reports/jobs/{jobId}/approve`.
3. Backend marks the job approved and starts the existing deploy pipeline (promote generated files + `cdk deploy` or GitHub Action). It does **not** give the Cursor agent AWS deploy credentials.
4. When the pipeline succeeds, `/admin/reports` (live) serves the new dashboard.

**Acceptance criteria**

- Cursor agent IAM/token cannot call `sts:AssumeRole` for CDK deploy or `cloudfront:CreateInvalidation` except through the human-gated pipeline role.
- Closing the preview without Approve leaves production dashboard unchanged.
- Pipeline failure does not mark the job `published`.

**APIs / screens**

- `POST /v1/admin/reports/jobs/{jobId}/approve`

**Out of scope**

- Automatic deploy on every agent file write.

---

## US-7.05 Secrets and identity

**Title:** Cursor key stays on the server; only admins start jobs  
**Actor:** Operator  
**Story:** As an operator, I want the Cursor API key and GitHub token off the SPA and out of git.

**Preconditions**

- Admin group bootstrap from Phase 6 runbook.

**Main flow**

1. `CURSOR_API_KEY` (and repo clone credentials for cloud agents) live in Secrets Manager / GitHub Actions secrets.
2. SPA sends only the Cognito JWT to SmartShop admin routes.
3. Logs record `jobId`, `agentId`, `run.id` — never the API key or JWT.

**Acceptance criteria**

- Key is not in `config.json`, `web/.env`, or generated dashboard source.
- Customer JWT on report job routes → 403.

**APIs / screens**

- Secrets as in [github-setup.md](../github-setup.md); new secret names documented in the runbook when implemented

**Out of scope**

- End-user Cursor Dashboard login from the shop.

---

## US-7.06 Metrics are system of record

**Title:** Dashboards read shop data, they do not invent it  
**Actor:** Admin  
**Story:** As an admin, I want every number on the dashboard to come from orders, catalogue, or users — the same sources checkout uses.

**Preconditions**

- Phases 1–3 data model.

**v1 metric catalogue (allowed)**

| Metric | Source |
| --- | --- |
| GMV / order count / AOV | `Orders` (confirmed orders, `totalCents`) |
| Top products | Order line items |
| Stockouts / low stock | `Products.stockQty` |
| Delivery mix STANDARD vs EXPRESS | Order `deliveryMethod` |
| Premium attach | `Users.isPremium` vs orders |

**Not in v1 unless a later story adds events:** page views, funnel conversion, advertising ROAS, cohort retention.

**Acceptance criteria**

- Generated widgets call the metrics API (or a typed client over it). Hard-coded sample dollars in production views fail review.
- Pricing remains integer cents, USD.

**APIs / screens**

- §5.9 metrics GET routes

**Out of scope**

- Write APIs from the dashboard (no stock edits, no premium toggles from charts).

---

## US-7.07 Existing shopping and assistant unchanged

**Title:** Phase 7 does not regress catalogue, cart, checkout, login, or chat  
**Actor:** Customer / Admin  
**Story:** As a customer, I want the store and shopping assistant to work exactly as they do after Phase 5/6.

**Preconditions**

- Phase 7 work is in progress or deployed.

**Main flow**

1. Customer browses, carts, checks out, and uses chat as today.
2. Admin still uses existing `/v1/admin/products` and premium APIs.
3. Admin dashboard builder is extra routes and extra SPA pages only.

**Acceptance criteria**

- No change to `JWT_PROTECTED_METHODS`, CORS origins, AgentCore Runtime, or `POST /v1/internal/assistant/tools`.
- Existing unit tests stay green with no contract changes.
- `/admin/reports` is behind `Protected` **and** admin group (customers who are signed in but not admin do not see it).

**APIs / screens**

- Frozen surfaces in technical requirements §2.4 and §2.5

**Out of scope**

- Redesign of home, cart, checkout, or `/chat` to “match” the dashboard.

---

## Build notes (implementation later)

This branch is **documentation only**. Do not add SDK orchestration, metrics routes, or `/admin/reports` UI until implementation is requested.

Suggested later layout (not created yet):

- `services/api/src/admin/reports/` — jobs + metrics
- `web/src/pages/AdminReportsPage.tsx` — prompt, status, preview iframe, Refine / Approve
- Generated output only under `web/src/admin/reports/generated/`
