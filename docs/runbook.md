# SmartShop operator runbook

For a new environment after `npm run deploy`. Do **not** paste access keys, secret keys, passwords, or AWS account IDs here.

Values come from gitignored `cdk-outputs.json` (or CloudFormation outputs on stack `SmartShopStack`):

| Output | Use |
| --- | --- |
| `ApiUrl` | HTTP API base, e.g. `https://{api-id}.execute-api.ap-southeast-1.amazonaws.com` |
| `CloudFrontUrl` | SPA origin customers open in a browser |
| `UserPoolId` | Cognito User Pool |
| `UserPoolClientId` | Public SPA app client (no secret) |
| `UserPoolRegion` | `ap-southeast-1` |

---

## Cognito User Pool

- Username is **email**. Self-sign-up is on. Email verification is required before first sign-in.
- Required attributes: `email`, `name` (display name from `/signup`).
- App client is public: auth flows `USER_PASSWORD_AUTH` and `USER_SRP_AUTH`. Hosted UI is not used; SmartShop owns `/signup`, `/confirm`, and `/login`.
- Passwords are stored and reset **only** in Cognito (console “reset password” for demos). Never write a password to DynamoDB, Lambda logs, or this repo.

Sign-up sequence:

1. SPA `SignUp` (email, password, name).
2. Customer enters the email code on `/confirm` (`ConfirmSignUp`).
3. SPA `SignIn` → ID token.
4. First authenticated `GET /v1/me` upserts DynamoDB `Users` keyed by Cognito `sub`. `isPremium` starts false.

---

## Admin group bootstrap

New sign-ups are customers. Operators add admins in the User Pool group `admin`.

```bash
export AWS_REGION=ap-southeast-1
USER_POOL_ID="$(node -e "const o=require('./cdk-outputs.json'); const s=o.SmartShopStack||Object.values(o)[0]; process.stdout.write(s.UserPoolId)")"
aws cognito-idp admin-add-user-to-group \
  --user-pool-id "$USER_POOL_ID" \
  --username "$EMAIL" \
  --group-name admin
```

`$EMAIL` is the Cognito username (the customer’s email). The user must already exist (they signed up in the SPA, or you created them in the console).

Sign out and sign in again so the ID token includes `cognito:groups: admin`. Customer tokens on `/v1/admin/*` return **403**.

---

## Toggle premium

`userId` is the Cognito `sub` from `GET /v1/me` (not the email).

```bash
API_URL="$(node -e "const o=require('./cdk-outputs.json'); const s=o.SmartShopStack||Object.values(o)[0]; process.stdout.write(s.ApiUrl)")"
curl -sS -X PATCH "$API_URL/v1/admin/users/$USER_SUB/premium" \
  -H "Authorization: Bearer $ADMIN_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"isPremium":true}'
```

Premium is 10% off merchandise only, not delivery.

---

## Phase 7 dashboard builder

`/admin/reports` is Cognito group `admin` only. Metrics are read-only over existing tables.

Generate starts a **Cursor cloud agent** (not AgentCore). Put the key on the API at deploy time, never in the SPA or `config.json`:

```bash
export CURSOR_DASHBOARD_API_KEY="cursor_..."   # Cursor Dashboard → API Keys
export CURSOR_CLOUD_REPO="https://github.com/jaganathan-vinod/smartshop"
export CURSOR_CLOUD_REF="main"
npm run deploy
```

Local tests can set `CURSOR_DASHBOARD_STUB=1` so jobs skip the real Cursor API.

Approve stores the widget spec as the live layout (`jobId=published`). It does not give the agent CDK credentials. A later pipeline can promote `web/src/admin/reports/generated/`.

---

## Dashboard v2

Implemented. Spec: [dashboard-v2-design.md](dashboard-v2-design.md). Page: `/admin/reports/v2`.

It reuses the Phase 7 Cursor key and repo URL. The v2 clone starts at `CURSOR_CLOUD_HTML_REF` (default `dashboards-v2`) and does not change the Phase 7 default of `main`. Approve writes `jobId=published-html` and must not replace `published`. A cloud run that opens a pull request is a failed v2 job. A branch name on the run payload is the temporary clone.

---

## CORS and local SPA

Deployed API CORS `Allow-Origin` is the CloudFront URL only. The hosted SPA can call the API; a random browser origin cannot.

`npm run dev` still works: Vite proxies `/v1` to `VITE_API_URL` from `web/.env`, so the browser talks same-origin to localhost and never hits CORS.

---

## Logs and alarms

Lambda writes one JSON line per request: `requestId`, `userId` (Cognito `sub`, not the JWT), `route`, `method`, `status`, `ms`. Tokens and passwords are not logged.

CloudWatch alarms (console, no SNS in v1):

- `smartshop-api-lambda-errors` — any Lambda error in 5 minutes
- `smartshop-api-5xx` — 3 or more HTTP API 5xx in 5 minutes

---

## Related

- Laptop/AWS CLI bootstrap: [one-time-setup.md](one-time-setup.md)
- Phase stories: [usecase-stories/phase-6-hardening.md](usecase-stories/phase-6-hardening.md), [usecase-stories/phase-7-admin-dashboard.md](usecase-stories/phase-7-admin-dashboard.md)
