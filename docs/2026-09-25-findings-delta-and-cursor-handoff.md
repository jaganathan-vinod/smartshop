# SmartShop — Findings delta and Cursor handoff

**Date:** 2026-09-25  
**Audience:** Cursor agent / engineering (next implementation pass)  
**Branch reviewed:** `Latest-Tech-Reviews`  
**Parent brief (do not replace):** [docs/2026-09-24-innovative-features-and-architecture.md](./2026-09-24-innovative-features-and-architecture.md)  
**Scope:** Recommendations only. This file does not change `web/`, `services/`, `packages/`, or `infra/` runtime code.

Scout windows re-analyzed: **Frontend Scout**, **App Layer Scout**, **AI Backend Scout** (delta vs the 24 Sep brief). Still-P0 / new / stale classifications below follow the **authoritative 25 Sep analysis packets**. Names, versions, and URLs are copied from those packets. Architecture context (region, current pins, what is already in the repo) stays in the [24 Sep brief](./2026-09-24-innovative-features-and-architecture.md).

---

## How to use this file

1. Treat §1 as the open P0 list. **Do not drop any item.**
2. Treat §2 as new since the 24 Sep brief (architecture / pin notes — not extra CVEs unless marked P0).
3. Treat §3 as explicitly **stale**. Do not re-raise those as open P0s.
4. Execute §4 on a **separate engineering branch**. This commit is docs-only.

---

## 1. Still-open P0s (do not drop)

Five items remain P0 as of 25 Sep. Work them in the order below unless a later scout says otherwise.

### Frontend

| # | Still P0 | Exact action from the 25 Sep packet | Sources |
| --- | --- | --- | --- |
| F1 | **Vite CVE-2026-39364** (+ **GHSA-p9ff** / **CVE-2026-39363**) | Patch **≥7.3.2 / ≥8.0.5** (prefer **8.3.0**); keep **`:5173` / `--host`** private; rotate keys if exposed | [CSA AL-2026-124](https://www.csa.gov.sg/alerts-and-advisories/alerts/al-2026-124/); [GHSA-v2wj-q39q-566r](https://github.com/vitejs/vite/security/advisories/GHSA-v2wj-q39q-566r) |
| F2 | **Chrome/Chromium 154** in CI | Playwright/Puppeteer **≥154**; **Chrome 155 Beta** only — don’t chase desktop Stable yet | [Chrome 154 release notes](https://developer.chrome.com/release-notes/154) |

**Still on disk (24 Sep snapshot, unchanged):** `web/package.json` has `"vite": "^6.0.3"`. There is no Playwright / Puppeteer / Chromium pin in CI. Continued Vite scanning **reinforces F1** — it does not replace it.

### App Layer

| # | Still P0 | Exact action from the 25 Sep packet | Sources |
| --- | --- | --- | --- |
| A1 | **API Gateway 1 MB execution-log destinations** + **dataTrace** discipline | Migrate alarms first; keep data tracing **off / non-prod** until destinations are locked down | [Amazon API Gateway 1 MB execution logs](https://aws.amazon.com/about-aws/whats-new/2026/09/amazon-api-gateway-1-mb-execution-logs/); [Customize Amazon API Gateway destinations for execution logs](https://aws.amazon.com/blogs/compute/customize-amazon-api-gateway-destinations-for-execution-logs/) |

**Still on disk:** HTTP API has **no** execution-log destination. Alarms `smartshop-api-lambda-errors` and `smartshop-api-5xx` are metric-based today — create **your** destination, then point any new subscription / metric-filter alarm at it, then enable logs. See parent brief §1.4.

### AI Backend

| # | Still P0 | Exact action from the 25 Sep packet | Sources |
| --- | --- | --- | --- |
| B1 | **Harness `allowedTools` lockdown** — Unit 42/CSA 18–19 Sep | Drop **`shell` / `file_operations`** where unused | [CSA research note — AWS AgentCore credential exfiltration](https://labs.cloudsecurityalliance.org/research/csa-research-note-aws-agentcore-credential-exfiltration-2026/) |
| B2 | **AgentCore Runtime V2** | Migrate for cost/latency (`platformVersion: V2`) | [New AgentCore Runtime generally available](https://aws.amazon.com/about-aws/whats-new/2026/09/new-agentcore-runtime-generally-available/) |

**Still on disk:** `services/assistant` already lists the ten shopping tools and rejects unknown names; there is no `shell` / `file_operations` tool. Pin `allowedTools` on every Runtime session anyway (fail closed). AgentCore Runtime is `NODE_22` in **`ap-southeast-1`**. Parent brief §1.3: do not set `platformVersion: V2` in Singapore until that region is on the V2 list; a Tokyo (`ap-northeast-1`) spike is a second Runtime, not a cutover.

---

## 2. New since the 2026-09-24 brief

These are **additions / reinforcements**, not a sixth silent P0 (unless already listed in §1).

| Scout | What is new | How to treat it |
| --- | --- | --- |
| AI Backend | **Multi-account AgentCore Gateway + MCP** pattern: platform account + LOB MCP targets, Identity/Okta, Policy. Architecture note if SmartShop splits catalog / orders / payments across accounts — **not a CVE** | [Build a multi-account AI agent with AgentCore Gateway and MCP](https://aws.amazon.com/blogs/machine-learning/build-a-multi-account-ai-agent-with-agentcore-gateway-and-mcp/). Record the pattern if/when LOBs split accounts. Do **not** treat this as a vulnerability hotfix and do **not** deploy Gateway MCP just because the blog exists. |
| App Layer | If still on **Node 22**, note **v22.23.3** (23 Sep) — prefer migrate to **24 LTS** | [Node v22.23.3](https://nodejs.org/en/blog/release/v22.23.3). SmartShop **is still on 22** for Lambda (`NODEJS_22_X`), AgentCore (`NODE_22`), and CI (`node-version: 22`); `.nvmrc` is `20`. Holding pin = **v22.23.3**. Written target remains **24 LTS** (**24.21.0**). |
| Frontend | Nothing material beyond F1; **continued Vite scanning reinforces** the CVE-2026-39364 / GHSA-p9ff / CVE-2026-39363 patch | Same advisories as F1. Do not close F1 as “already documented.” |

**Reclassification vs 24 Sep (so agents do not invent extra P0s):**

- **Node 24 LTS pin (24.21.0)** was a P0 in the 24 Sep brief §1.5. The 25 Sep App Layer packet moves it to **still matters (not P0)**. Prefer the migrate; do not block the §1 list on it.
- **Chrome/Chromium 154 in CI** was “later / P2” in the 24 Sep brief. The 25 Sep Frontend packet **raises it to P0** (F2). When browser CI exists, pin Playwright/Puppeteer **≥154**.
- **GHSA-p9ff / CVE-2026-39363** is an additional identifier on the existing Vite P0 (F1). Same patch floor: **≥7.3.2 / ≥8.0.5**, prefer **8.3.0**.
- The 25 Sep App Layer packet adds the What’s new URL for 1 MB execution logs (alongside the 24 Sep destinations blog). Use both links in A1.

---

## 3. Still matters (not P0)

Carry these as backlog, not as open P0s.

| Scout | Still matters |
| --- | --- |
| AI Backend | **Kimi K3** + prompt caching; **Marengo** multimodal KB; **AgentCore Evaluations** TS frameworks; **Consent Portal** + lifecycle hooks |
| Frontend | **Vite 8.3.0** upgrade vehicle (the patch vehicle for F1); **TypeScript 7.0.2** (7.1 beta ~6 Oct); **Firefox 156** scrollbar quirk; **S3 Express One Zone** `ap-southeast-1` only for non-CDN latency caches; **Node 24 LTS** with App Layer |
| App Layer | Backend **mTLS BYO ACM** (partners/payment only); **LMI 90-min async + Graviton5** (not sync checkout); **Node 24 LTS** pin (**24.21.0**); **Current 26.x** tooling only |

---

## 4. Stale — do not re-raise as open P0s

| Scout | Stale item | Why it is closed |
| --- | --- | --- |
| AI Backend | **CVE-2026-18830** | Patched server-side |
| AI Backend | Older SDK/CLI CVEs | Only relevant if pinning vulnerable toolkits |
| Frontend | **CloudFront PricingPlanManager** (3 Sep) | Optional, not a security P0 |
| Frontend | **DIT image** (8 Sep) | Optional, not a security P0 |
| App Layer | Older Node security blogs | Superseded; use the 25 Sep Node pins instead |
| App Layer | **Lambda SnapStart containers** / **AWS MCP diagnostics** | Optional DX, not P0 |

If a later scout re-opens one of these with a new CVE or a customer-action requirement, that new packet wins. Until then, keep them out of the P0 list.

---

## 5. Cursor-agent handoff checklist

Next engineering pass (separate branch). **Docs/snippets below are illustrative.** Do not apply them in this commit.

### P0 — do first

1. **Vite (F1).** Pin `web` to **8.3.0** (or at least **≥8.0.5 / ≥7.3.2**). Do not land on unpatched 7.x/8.x. Bind `server.host` / `preview.host` to `127.0.0.1`. Never `vite --host`, never public **`:5173`**. If a preview was reachable, **rotate keys**. Continued scanning reinforces this patch — do not defer it because the 24 Sep brief already described it.

```json
{ "devDependencies": { "vite": "8.3.0" } }
```

```ts
// web/vite.config.ts — localhost only; never vite --host
server: {
  host: "127.0.0.1",
  port: 5173,
  strictPort: true,
},
preview: { host: "127.0.0.1", port: 4173 },
```

2. **Chrome/Chromium 154 (F2).** When (or as) browser CI lands, pin Playwright/Puppeteer **≥154**. **Chrome 155 Beta** only — don’t chase desktop Stable yet.

```yaml
# illustrative CI pin — Playwright/Puppeteer ≥154
- run: npx playwright install chromium
  env:
    PLAYWRIGHT_CHROMIUM_VERSION: "154"
```

3. **API Gateway 1 MB execution logs (A1).** Create the CloudWatch / S3 / Firehose destination first. **Migrate alarms** off the auto-managed group. Then enable execution logs. Keep **dataTrace** **off / non-prod** until destinations are locked down. Never log `Authorization`, `Idempotency-Key`, or `$context.identity` wholesale.

4. **Harness `allowedTools` (B1).** On every AgentCore session, set `allowedTools` to the ten shopping tools only. Drop **`shell` / `file_operations`** (unused). Add a failing test that those names are rejected. Review Runtime role + egress when you next touch CDK. This is Unit 42/CSA 18–19 Sep research — **not** an AWS CVE.

```ts
const session = {
  allowedTools: [
    "search_products",
    "get_product",
    "get_cart",
    "upsert_cart_item",
    "remove_cart_item",
    "set_delivery",
    "get_quote",
    "confirm_order",
    "list_orders",
    "get_order",
  ],
  // never: "shell", "file_operations"
};
```

5. **AgentCore Runtime V2 (B2).** Opt in with `platformVersion: V2` **when the stack region is on the V2 list** (cost/latency). Do not set V2 in `ap-southeast-1` until AWS lists it — see parent brief §1.3. Pair any V2 opt-in with B1.

```ts
// infra — only when the region supports V2
// platformVersion: "V2"
```

### New / pin notes (not extra P0s)

6. **Node 22 hold → 24 LTS.** Surfaces still on 22 (`NODEJS_22_X`, `NODE_22`, CI `node-version: 22`, `.nvmrc` `20`) should hold **v22.23.3** if they cannot move this pass. Prefer migrate to **24 LTS** (**24.21.0**). **Current 26.x** is tooling only.

7. **Multi-account AgentCore Gateway + MCP.** If (and only if) SmartShop splits catalog / orders / payments across accounts, write an architecture note: platform account + LOB MCP targets, Identity/Okta, Policy. **Not a CVE.** Do not stand up Gateway MCP as a security response.

### Do not do

- Do not re-open **CVE-2026-18830**, CloudFront **PricingPlanManager** (3 Sep), **DIT image** (8 Sep), older Node security blogs, or **Lambda SnapStart containers** / **AWS MCP diagnostics** as P0s.
- Do not chase **Chrome 155** desktop Stable.
- Do not enable prod **dataTrace** before destinations and alarm migration.
- Do not add `shell` / `file_operations` “for debugging.”
- Do not treat the Gateway + MCP blog as a vulnerability.
- Do not change application code as part of *this* docs commit.

---

## 6. Pointers

| Document | Role |
| --- | --- |
| [docs/2026-09-24-innovative-features-and-architecture.md](./2026-09-24-innovative-features-and-architecture.md) | Full 24 Sep brief: current architecture, snippets, what-not-to-do, longer backlog |
| [docs/2026-09-23-innovative-features-and-architecture.md](./2026-09-23-innovative-features-and-architecture.md) | Prior snapshot; superseded for P0 status by 24 Sep, then this delta |

---

*Delta only. No application or infrastructure code was changed to produce this document. Still-P0 / new / stale labels, version numbers, and URLs follow the 25 Sep authoritative analysis packets.*
