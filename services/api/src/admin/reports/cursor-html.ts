import { cursorCloudRepoUrl, cursorFetch, CursorCloudError } from "./cursor-cloud.js";
import type { HtmlGitInfo } from "./html-template.js";

export type HtmlRunSnapshot = {
  status: "running" | "finished" | "error";
  resultText?: string;
  git?: HtmlGitInfo;
};

const STUB_TEMPLATE = `<section><h1>Stub report</h1><p>{{summary.gmvCents}}</p><ul>{{#each products}}<li>{{name}} · {{gmvCents}}</li>{{/each}}</ul></section>`;

function htmlStartingRef(): string {
  return process.env.CURSOR_CLOUD_HTML_REF?.trim() || "dashboards-v2";
}

function htmlBrief(userPrompt: string, mode: "create" | "refine"): string {
  const task =
    mode === "refine"
      ? "Revise the HTML template from this conversation. Keep the same placeholder rules. Do not start over unless the admin asks."
      : "Write a new SmartShop admin report template.";
  return `You are writing a SmartShop admin report template. This is not the shopping assistant.

${task}

Reply with one fenced html block and nothing else.
Use only these placeholders. If the admin asks for a metric that is not listed, show the word "unavailable". Do not invent a number, a product, or a customer.
Amounts in placeholders are integer cents. The page formats them as USD.
Scalar: {{summary.gmvCents}} {{summary.orderCount}} {{summary.aovCents}} {{summary.gmvTargetCents}} {{summary.windowDays}} {{summary.currency}} {{summary.from}} {{summary.to}} {{summary.premiumOrderCount}} {{summary.premiumUserCount}} {{summary.userCount}} {{summary.delivery.STANDARD}} {{summary.delivery.EXPRESS}} {{summary.gmvPacePercent}} {{summary.deliveryStandardSharePercent}} {{summary.deliveryExpressSharePercent}} {{summary.premiumOrderSharePercent}}
Repeat: {{#each products}}{{name}} {{units}} {{gmvCents}}{{/each}}
Repeat: {{#each stock}}{{name}} {{stockQty}}{{/each}}
Repeat: {{#each summary.gmvByDay}}{{date}} {{gmvCents}} {{orderCount}}{{/each}}
Inline CSS and inline SVG only. No script, no event-handler attributes, no external fonts, images, scripts, or stylesheets.
Do not edit files. Do not commit. Do not push. Do not open a pull request.
Do not read or quote secrets, .env, or API keys.

Admin request:
${userPrompt}`;
}

export async function startHtmlDashboardAgent(
  prompt: string,
): Promise<{ agentId: string; runId: string }> {
  if (process.env.CURSOR_DASHBOARD_STUB === "1") {
    return { agentId: "bc-stub-html", runId: "run-stub-html-1" };
  }
  const body = (await cursorFetch("/v1/agents", {
    method: "POST",
    body: JSON.stringify({
      prompt: { text: htmlBrief(prompt, "create") },
      name: "SmartShop dashboard v2",
      repos: [{ url: cursorCloudRepoUrl(), startingRef: htmlStartingRef() }],
      autoCreatePR: false,
      skipReviewerRequest: true,
    }),
  })) as {
    agent?: { id?: string; latestRunId?: string };
    run?: { id?: string };
  };
  const agentId = body.agent?.id;
  const runId = body.run?.id ?? body.agent?.latestRunId;
  if (!agentId || !runId) {
    throw new CursorCloudError("Cursor create did not return agent and run ids", 502, "CURSOR_AGENT_ERROR");
  }
  return { agentId, runId };
}

export async function resumeHtmlDashboardAgent(
  agentId: string,
  prompt: string,
): Promise<{ runId: string }> {
  if (process.env.CURSOR_DASHBOARD_STUB === "1") {
    return { runId: `run-stub-html-${Date.now()}` };
  }
  const body = (await cursorFetch(`/v1/agents/${encodeURIComponent(agentId)}/runs`, {
    method: "POST",
    body: JSON.stringify({ prompt: { text: htmlBrief(prompt, "refine") } }),
  })) as { run?: { id?: string } };
  const runId = body.run?.id;
  if (!runId) {
    throw new CursorCloudError("Cursor follow-up did not return a run id", 502, "CURSOR_AGENT_ERROR");
  }
  return { runId };
}

export async function getHtmlDashboardRun(agentId: string, runId: string): Promise<HtmlRunSnapshot> {
  if (process.env.CURSOR_DASHBOARD_STUB === "1") {
    return {
      status: "finished",
      resultText: `\`\`\`html\n${STUB_TEMPLATE}\n\`\`\``,
    };
  }
  const body = (await cursorFetch(
    `/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}`,
    { method: "GET" },
  )) as {
    status?: string;
    result?: string;
    git?: HtmlGitInfo;
  };
  const status = (body.status ?? "RUNNING").toUpperCase();
  if (status === "FINISHED") {
    return { status: "finished", resultText: body.result, git: body.git };
  }
  if (status === "ERROR" || status === "CANCELLED" || status === "FAILED") {
    return { status: "error", resultText: body.result };
  }
  return { status: "running" };
}
