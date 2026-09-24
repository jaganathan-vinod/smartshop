# Dashboard v2 — HTML report template

**Status:** implemented. Page `/admin/reports/v2`.

**Goal:** A signed-in admin describes a report. A Cursor cloud agent, started from the API Lambda, clones this repo and returns one HTML template. The admin page fills that template with live metrics, shows it in a sandboxed iframe, and the admin refines or approves it. The run does not edit or commit the git repo.

This is not the Phase 7 spec dashboard and not the shopping assistant.

**Design:** [dashboard-v2-design.md](../dashboard-v2-design.md)

---

## Decisions carried by every story

| Topic | Rule |
| --- | --- |
| Page | `/admin/reports/v2` |
| Agent | Cloud agent, `autoCreatePR: false`, no file edits, no commits, no pull request |
| Lambda | Start the run and return. Do not wait for the model inside the 30 second function |
| Output | HTML, inline CSS, inline SVG, placeholders. No JavaScript from the model |
| Numbers | Existing `/v1/admin/metrics/*`, filled by the page |
| Publish record | `jobId = published-html`. Never `published` |
| Frozen | Phase 7 `/admin/reports`, shopping, assistant, CORS, JWT authorizers |

---

## US-V2.01 Prompt a report

**Title:** Admin describes an HTML report  
**Actor:** Admin  
**Story:** As an admin, I want to type a report prompt so SmartShop can prepare an HTML template from the metrics we already have.

**Preconditions**

- Signed in. Cognito group contains `admin`.
- `CURSOR_DASHBOARD_API_KEY` (or `CURSOR_API_KEY`) is set on the API Lambda.
- The cloud agent can clone the private repo at `CURSOR_CLOUD_REF` (default `dashboards-v2`).

**Main flow**

1. Admin opens `/admin/reports/v2`. The page loads the five metrics endpoints for the selected window (default 7 days) and shows them in the plain layout.
2. Admin types a prompt and submits.
3. SPA `POST /v1/admin/reports/v2/jobs` with `{ prompt }`.
4. Lambda wraps the prompt with the v2 brief and starts a cloud run (`autoCreatePR: false`, `skipReviewerRequest: true`).
5. Response is `{ jobId, agentId, status: "running" }`. The plain metrics layout stays on screen.

**Acceptance criteria**

- Non-admin JWT → 403. Missing JWT → 401.
- The job row stores `agentId`, `runId`, and `kind: "html-v2"`.
- The Lambda returns before the cloud run finishes.
- The browser response does not contain the Cursor API key.

**APIs / screens**

- `/admin/reports/v2`
- `POST /v1/admin/reports/v2/jobs`

**Out of scope**

- Replacing `/admin/reports`.
- Customer-facing analytics.

---

## US-V2.02 Preview the template on live metrics

**Title:** Show the HTML report with real shop numbers  
**Actor:** Admin  
**Story:** As an admin, I want to see the generated report filled with current orders, products, and stock before I approve it.

**Preconditions**

- US-V2.01 job exists.
- Metrics APIs return the existing catalogue (summary, products, stock, delivery, premium).

**Main flow**

1. SPA polls `GET /v1/admin/reports/v2/jobs/{jobId}`.
2. While the run is unfinished, the page keeps the plain metrics layout.
3. When the run finishes, Lambda reads the reply, rejects it if Cursor opened a pull request, extracts one HTML document, strips script and event handlers, and stores `templateHtml` with status `preview_ready`.
4. SPA loads the template and replaces placeholders from a fresh metrics read for the selected window.
5. The filled document is shown in a sandboxed iframe (`srcdoc`, no scripts, no same-origin).

**Acceptance criteria**

- Preview figures match the metrics API for the same window, including `$0.00` when there are no orders.
- A request for a metric outside the catalogue does not invent a value.
- The iframe cannot read the admin token.
- Phase 7 `previewSpec` and `Board.tsx` are not written.

**APIs / screens**

- `GET /v1/admin/reports/v2/jobs/{jobId}`
- `GET /v1/admin/reports/v2/jobs/{jobId}/preview`
- `GET /v1/admin/metrics/*`

**Out of scope**

- Chart JavaScript inside the template.
- A new CORS origin for the iframe.

---

## US-V2.03 Refine on the same agent

**Title:** Change the report without a new conversation  
**Actor:** Admin  
**Story:** As an admin, I want to send a follow-up sentence so the same cloud agent revises the HTML template.

**Preconditions**

- Job status is `preview_ready`.

**Main flow**

1. Admin enters a follow-up and submits.
2. SPA `POST /v1/admin/reports/v2/jobs/{jobId}/messages` with `{ prompt }`.
3. Lambda resumes that `agentId` and starts a new run with the v2 brief plus the follow-up.
4. Status returns to `running`. Poll and preview repeat from US-V2.02.
5. The 7-day / 30-day control still only refetches metrics. It does not resume the agent.

**Acceptance criteria**

- Follow-up uses the stored `agentId`. It does not call a one-shot prompt API.
- A message while status is `running` → 409 `JOB_RUNNING`.
- The previous approved `published-html` template is unchanged until Approve.

**APIs / screens**

- `POST /v1/admin/reports/v2/jobs/{jobId}/messages`

**Out of scope**

- Editing the template by hand in git.

---

## US-V2.04 Approve the template

**Title:** Publish the HTML template without calling Cursor  
**Actor:** Admin  
**Story:** As an admin, I want to approve the preview so later visits show that layout with current metrics.

**Preconditions**

- Job status is `preview_ready`.
- `templateHtml` is stored and already stripped.

**Main flow**

1. Admin chooses Approve.
2. SPA `POST /v1/admin/reports/v2/jobs/{jobId}/approve`.
3. Lambda copies `templateHtml` onto the item `jobId = published-html`.
4. The next page load uses `GET /v1/admin/reports/v2/published`, fills placeholders, and shows the iframe.
5. No Cursor call, no git commit, no CDK deploy.

**Acceptance criteria**

- Approve while `running` or `error` → 409 `PREVIEW_REQUIRED`.
- `jobId = "published"` (Phase 7) is not modified.
- Reloading the page does not call Cursor.

**APIs / screens**

- `POST /v1/admin/reports/v2/jobs/{jobId}/approve`
- `GET /v1/admin/reports/v2/published`

**Out of scope**

- Promoting generated React under `web/src/admin/reports/generated/`.

---

## US-V2.05 Cloud clone does not change git

**Title:** The agent may clone the repo and must not land a change  
**Actor:** Admin, indirectly the cloud agent  
**Story:** As an operator, I want the cloud agent to clone the repo the way Cursor cloud runs do, without edits or commits reaching GitHub.

**Preconditions**

- Cloud run is created with `autoCreatePR: false` and `skipReviewerRequest: true`.
- The brief forbids file edits, commits, and pushes.

**Main flow**

1. Cursor clones `CURSOR_CLOUD_REPO` at `CURSOR_CLOUD_REF` onto its VM.
2. The agent replies with one HTML template.
3. Lambda reads the run. If the payload includes a pull request URL, the job becomes `error` and `templateHtml` is not stored. A branch name without a pull request is the cloud clone.
4. The VM clone is discarded. SmartShop does not pull, merge, or deploy it.

**Acceptance criteria**

- A successful v2 job creates no commit and no pull request on `jaganathan-vinod/smartshop`.
- A run that opens a pull request does not become `preview_ready`.
- `web/src/admin/reports/generated/` in git is unchanged by the run.

**APIs / screens**

- Cloud agents API, server-side only.

**Out of scope**

- A local scratch agent with no clone.
- Granting the agent a GitHub write token beyond what Cursor cloud already uses, or any deploy role.

---

## US-V2.06 Existing reports and shopping stay

**Title:** Dashboard v2 does not change Phase 7 or checkout  
**Actor:** Admin and customer  
**Story:** As an operator, I want the current report page and the shop to behave as they do today after v2 exists.

**Preconditions**

- v2 routes and `published-html` are the only new surfaces.

**Main flow**

1. Admin opens `/admin/reports` and sees the Phase 7 spec board, including the `published` spec when one exists.
2. Customer completes browse → cart → checkout → order history.
3. v2 preview and approve run against a fixture order set.

**Acceptance criteria**

- Phase 7 job routes, `previewSpec`, and `Board.tsx` keep their current contracts.
- Customer JWT cannot call `/v1/admin/reports/v2/*` or `/v1/admin/metrics/*`.
- CORS allow-list is still the CloudFront SPA origin only.
- Catalogue, cart, pricing, orders, and assistant tests stay green.

**APIs / screens**

- `/admin/reports`
- `/admin/reports/v2`
- Shop routes in [phase-4-spa.md](phase-4-spa.md)

**Out of scope**

- Migrating the Phase 7 spec into an HTML template.
