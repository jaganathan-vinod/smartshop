# Phase 0 — Foundation

**Goal:** Deployable AWS shell, shared types, seed data, and a git-safe repo. No shopping behaviour yet.

**Related:** [project-technical-requirements.md](../project-technical-requirements.md)

---

## US-0.01 Provision the AWS shell

**Title:** CDK provisions Cognito, HTTP API, Lambda stub, DynamoDB, and S3/CloudFront  
**Actor:** Engineer  
**Story:** As an engineer, I want CDK to provision Cognito (Google), an HTTP API, a Lambda stub, DynamoDB tables, and S3/CloudFront so later phases have a deployable shell.

**Preconditions**

- AWS account and CDK bootstrap in `ap-southeast-1` are available.
- Google OAuth client id/secret can be stored in Secrets Manager (or placeholders for local synth).

**Main flow**

1. Engineer runs `cdk deploy` from the repo.
2. CDK creates: User Pool + Google IdP, HTTP API, Node 20 Lambda stub, Products/Users/Carts/Orders/OrderNumbers/Conversations tables, S3 bucket, CloudFront distribution.
3. Outputs print API URL, CloudFront URL, and User Pool id.

**Acceptance criteria**

- `cdk synth` succeeds with no secrets in templates.
- Lambda stub returns a health JSON on `GET /v1/health`.
- Tables exist with the keys described in technical requirements.
- CloudFront serves a placeholder `index.html`.

**APIs / screens**

- `GET /v1/health`

**Out of scope**

- Product search, cart, orders, SPA routes, Bedrock.

---

## US-0.02 Shared types and catalogue seed

**Title:** Zod types and a 12-product seed  
**Actor:** Engineer  
**Story:** As an engineer, I want shared Zod types and a product seed of about 12 items so APIs and UI have deterministic fixtures.

**Preconditions**

- Phase 0 CDK tables exist or a local seed script can target them.

**Main flow**

1. Shared package (or folder) exports Zod schemas for Product, CartLine, Quote, Order, DeliveryMethod.
2. Seed script writes ~12 active products with names, categories, `unitPriceCents`, and `stockQty`.
3. Re-running seed is idempotent (stable product ids or upsert by sku).

**Acceptance criteria**

- Types compile in the Lambda package.
- After seed, `Scan` on Products returns at least 12 `active` items.
- Prices are integer cents; at least two categories exist.

**APIs / screens**

- Seed CLI only in this phase (HTTP catalogue is Phase 1).

**Out of scope**

- Admin product APIs.

---

## US-0.03 Git hygiene

**Title:** Secrets never enter git  
**Actor:** Engineer  
**Story:** As an engineer, I want `.gitignore` and no secrets in git so the GitHub remote is safe to use.

**Preconditions**

- Local repo at `/Users/dhivya/vinod/cursor-projects/smartshop`.

**Main flow**

1. `.gitignore` excludes `node_modules/`, `.env*`, `cdk.out/`, `.aws/`, and key files.
2. Engineer (or agent, when asked) commits docs and ignore rules only.
3. `git status` does not list credential files.

**Acceptance criteria**

- `.env` and AWS key paths are ignored.
- [github-setup.md](../github-setup.md) describes private `gh repo create`.

**APIs / screens**

- None.

**Out of scope**

- Creating the GitHub remote without the user asking to push.
