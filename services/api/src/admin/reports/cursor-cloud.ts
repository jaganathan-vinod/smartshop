import { DEFAULT_DASHBOARD_SPEC } from "@smartshop/shared";

export class CursorCloudError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "CursorCloudError";
  }
}

export type CursorRunSnapshot = {
  status: "running" | "finished" | "error";
  resultText?: string;
  previewUrl?: string;
};

function dashboardApiKey(): string | undefined {
  return (
    process.env.CURSOR_DASHBOARD_API_KEY?.trim() ||
    process.env.CURSOR_API_KEY?.trim() ||
    undefined
  );
}

export function cursorDashboardConfigured(): boolean {
  return Boolean(dashboardApiKey()) || process.env.CURSOR_DASHBOARD_STUB === "1";
}

function repoUrl(): string {
  return process.env.CURSOR_CLOUD_REPO?.trim() || "https://github.com/jaganathan-vinod/smartshop";
}

function startingRef(): string {
  return process.env.CURSOR_CLOUD_REF?.trim() || "main";
}

function dashboardBrief(userPrompt: string): string {
  return `You are generating a SmartShop admin executive dashboard. This is NOT the customer shopping assistant.

Write ONLY under web/src/admin/reports/generated/. Do not edit services/api cart/orders, services/assistant, infra, web/src/styles.css, or JWT authorizers.

1. Overwrite web/src/admin/reports/generated/Board.tsx with a self-contained board (inline styles or a CSS module in generated/ only). It must export:
   export const isCustomBoard = true;
   export function GeneratedBoard(props: { spec; summary; products; stock; badge }): JSX.Element
   Bind widgets to GET /v1/admin/metrics/* (integer cents, USD). Do not invent GMV. Empty windows render $0.00 or "No orders in this window".
2. Overwrite web/src/admin/reports/generated/dashboard.spec.json.

End your reply with a fenced json block matching this shape:
{"title":"string","kpis":["gmv"|"orderCount"|"aov"|"targetPace"|"stockouts"|"premiumShare"],"charts":["gmvByDay"|"topProducts"|"deliveryMix"|"premium"],"unavailable":["viewToOrder"],"gmvTargetCents":1200000,"layout":"executive"|"pulse"|"command","theme":"store"|"navy","windowDays":7|30}

Use layout "pulse" or "command" when the admin wants a board (pace ring, daily GMV bars, product lanes, stockout chips). Use theme "navy" for a dark command-center look. windowDays 30 for monthly views. If the admin asks for page-view conversion, list it under unavailable.

Admin request:
${userPrompt}`;
}

async function cursorFetch(path: string, init: RequestInit): Promise<unknown> {
  const apiKey = dashboardApiKey();
  if (!apiKey) {
    throw new CursorCloudError("Cursor dashboard API key is not configured", 503, "CURSOR_NOT_CONFIGURED");
  }
  const response = await fetch(`https://api.cursor.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "message" in body && typeof body.message === "string"
        ? body.message
        : `Cursor API ${response.status}`;
    throw new CursorCloudError(message, response.status >= 500 ? 502 : 502, "CURSOR_AGENT_ERROR");
  }
  return body;
}

export async function startDashboardAgent(
  prompt: string,
): Promise<{ agentId: string; runId: string; url?: string }> {
  if (process.env.CURSOR_DASHBOARD_STUB === "1") {
    return { agentId: "bc-stub-dashboard", runId: "run-stub-1" };
  }
  const body = (await cursorFetch("/v1/agents", {
    method: "POST",
    body: JSON.stringify({
      prompt: { text: dashboardBrief(prompt) },
      name: "SmartShop dashboard",
      repos: [{ url: repoUrl(), startingRef: startingRef() }],
      autoCreatePR: false,
      skipReviewerRequest: true,
    }),
  })) as {
    agent?: { id?: string; url?: string; latestRunId?: string };
    run?: { id?: string };
  };
  const agentId = body.agent?.id;
  const runId = body.run?.id ?? body.agent?.latestRunId;
  if (!agentId || !runId) {
    throw new CursorCloudError("Cursor create did not return agent and run ids", 502, "CURSOR_AGENT_ERROR");
  }
  return { agentId, runId, url: body.agent?.url };
}

export async function resumeDashboardAgent(
  agentId: string,
  prompt: string,
): Promise<{ runId: string }> {
  if (process.env.CURSOR_DASHBOARD_STUB === "1") {
    return { runId: `run-stub-${Date.now()}` };
  }
  const body = (await cursorFetch(`/v1/agents/${encodeURIComponent(agentId)}/runs`, {
    method: "POST",
    body: JSON.stringify({ prompt: { text: dashboardBrief(prompt) } }),
  })) as { run?: { id?: string } };
  const runId = body.run?.id;
  if (!runId) {
    throw new CursorCloudError("Cursor follow-up did not return a run id", 502, "CURSOR_AGENT_ERROR");
  }
  return { runId };
}

export async function getDashboardRun(agentId: string, runId: string): Promise<CursorRunSnapshot> {
  if (process.env.CURSOR_DASHBOARD_STUB === "1") {
    return {
      status: "finished",
      resultText: `\`\`\`json\n${JSON.stringify(DEFAULT_DASHBOARD_SPEC)}\n\`\`\``,
    };
  }
  const body = (await cursorFetch(
    `/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}`,
    { method: "GET" },
  )) as {
    status?: string;
    result?: string;
    git?: { branches?: Array<{ prUrl?: string; branch?: string }> };
  };
  const status = (body.status ?? "RUNNING").toUpperCase();
  if (status === "FINISHED") {
    const branch = body.git?.branches?.[0];
    return {
      status: "finished",
      resultText: body.result,
      previewUrl: branch?.prUrl,
    };
  }
  if (status === "ERROR" || status === "CANCELLED" || status === "FAILED") {
    return { status: "error", resultText: body.result };
  }
  return { status: "running" };
}
