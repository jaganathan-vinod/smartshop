# Phase 6 — Hardening

**Goal:** Production-shaped security, observability, CORS, and operator docs. No new shopping features.

---

## US-6.01 Authorization boundaries

**Title:** JWT and group checks  
**Actor:** Operator  
**Story:** As an operator, I want JWT/group checks so customers cannot hit admin or another user’s orders.

**Preconditions**

- All customer and admin routes exist.

**Main flow**

1. API Gateway JWT authorizer rejects missing/invalid tokens on protected routes.
2. Lambda rejects `/v1/admin/*` unless `cognito:groups` contains `admin`.
3. Order and cart queries always filter by `sub`; forged `userId` in the body is ignored.

**Acceptance criteria**

- Customer token on admin product create → 403.
- User A `GET /v1/orders/{userBOrderId}` → 404.
- Automated authz tests cover these cases.

**APIs / screens**

- All `/v1/admin/*`, `/v1/orders*`, `/v1/cart*`

**Out of scope**

- WAF rules beyond defaults, pentest report.

---

## US-6.02 Logging, alarms, and CORS

**Title:** CloudWatch and locked CORS  
**Actor:** Operator  
**Story:** As an operator, I want CloudWatch logs/alarms and CORS locked to CloudFront.

**Preconditions**

- CloudFront domain is known.

**Main flow**

1. Lambda emits structured JSON logs with `requestId`, `userId` (not tokens), `route`, `status`.
2. Alarms fire on 5xx rate and Lambda errors.
3. HTTP API CORS `Allow-Origin` is the CloudFront origin only (not `*` in deployed prod).

**Acceptance criteria**

- Browser SPA on CloudFront can call the API.
- A random origin is rejected by CORS.
- Chat and confirm paths are traceable in logs without dumping JWTs.

**APIs / screens**

- API Gateway CORS configuration; CloudWatch alarms

**Out of scope**

- Full APM / X-Ray sampling policy (optional extra).

---

## US-6.03 Operator README for OAuth and admin bootstrap

**Title:** Google OAuth and admin group runbook  
**Actor:** Engineer  
**Story:** As an engineer, I want README steps for Google OAuth client setup and admin group bootstrap so a new environment can be demonstrated.

**Preconditions**

- Cognito User Pool exists.

**Main flow**

1. README (or `docs/runbook.md` in this phase) lists: Google Cloud OAuth client, authorized redirect URIs for Cognito, Secrets Manager keys, CDK context.
2. Document how to add a user to Cognito group `admin`.
3. Document how to toggle `isPremium` via admin API.

**Acceptance criteria**

- A new engineer can follow the runbook without reading CDK source.
- No secrets are pasted into the runbook; placeholders only.

**APIs / screens**

- README / runbook markdown

**Out of scope**

- Automated Google Cloud project provisioning.
