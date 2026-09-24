import type { Hono } from "hono";
import { ZodError } from "zod";
import {
  PUBLISHED_HTML_JOB_ID,
  createHtmlReportJobRequestSchema,
  refineHtmlReportJobRequestSchema,
  reportJobIdSchema,
  type HtmlReportJob,
} from "@smartshop/shared";
import { currentClaims } from "../../auth.js";
import { jsonError, zodError } from "../../http.js";
import { logJson } from "../../log.js";
import { denyUnlessAdmin } from "../guard.js";
import { CursorCloudError, cursorDashboardConfigured } from "./cursor-cloud.js";
import { cursorAgentUrl, resumeHtmlDashboardAgent, startHtmlDashboardAgent } from "./cursor-html.js";
import {
  createHtmlRunningJob,
  getHtmlReportJob,
  markHtmlJobRunning,
  publishHtmlTemplate,
  refreshHtmlRunningJob,
} from "./html-store.js";

function cursorError(c: Parameters<typeof jsonError>[0], error: unknown) {
  if (error instanceof CursorCloudError) {
    const status = error.code === "CURSOR_NOT_CONFIGURED" ? 503 : 502;
    return jsonError(c, status, error.code, error.message);
  }
  throw error;
}

function toClient(job: HtmlReportJob): HtmlReportJob {
  const withUrl: HtmlReportJob = job.agentId
    ? { ...job, agentUrl: job.agentUrl ?? cursorAgentUrl(job.agentId) }
    : job;
  switch (withUrl.status) {
    case "preview_ready":
    case "approved":
    case "published":
      return withUrl;
    case "running":
    case "error":
      return { ...withUrl, templateHtml: undefined };
    default: {
      const _never: never = withUrl.status;
      return _never;
    }
  }
}

export function registerAdminHtmlReportRoutes(app: Hono): void {
  app.get("/v1/admin/reports/v2/published", async (c) => {
    const denied = await denyUnlessAdmin(c);
    if (denied) {
      return denied;
    }
    const live = await getHtmlReportJob(PUBLISHED_HTML_JOB_ID);
    if (!live?.templateHtml) {
      return jsonError(c, 404, "NOT_FOUND", "No HTML report has been approved yet");
    }
    return c.json(toClient(live));
  });

  app.post("/v1/admin/reports/v2/jobs", async (c) => {
    const denied = await denyUnlessAdmin(c);
    if (denied) {
      return denied;
    }
    const claims = currentClaims();
    if (!claims) {
      return jsonError(c, 401, "UNAUTHENTICATED", "Sign in required");
    }
    if (!cursorDashboardConfigured()) {
      return jsonError(
        c,
        503,
        "CURSOR_NOT_CONFIGURED",
        "Set CURSOR_DASHBOARD_API_KEY on the API (or CURSOR_DASHBOARD_STUB=1 for local tests)",
      );
    }
    try {
      const body = createHtmlReportJobRequestSchema.parse(await c.req.json());
      const started = await startHtmlDashboardAgent(body.prompt);
      logJson({
        msg: "html-report-start",
        agentId: started.agentId,
        runId: started.runId,
      });
      const job = await createHtmlRunningJob({
        createdBy: claims.sub,
        prompt: body.prompt,
        windowDays: body.windowDays,
        agentId: started.agentId,
        runId: started.runId,
        agentUrl: started.agentUrl,
      });
      return c.json(toClient(job), 201);
    } catch (error) {
      if (error instanceof ZodError) {
        return zodError(c, error);
      }
      if (error instanceof SyntaxError) {
        return jsonError(c, 400, "VALIDATION_ERROR", "Invalid JSON");
      }
      return cursorError(c, error);
    }
  });

  app.get("/v1/admin/reports/v2/jobs/:jobId/preview", async (c) => {
    const denied = await denyUnlessAdmin(c);
    if (denied) {
      return denied;
    }
    try {
      const jobId = reportJobIdSchema.parse(c.req.param("jobId"));
      if (jobId === PUBLISHED_HTML_JOB_ID) {
        return jsonError(c, 404, "NOT_FOUND", "Report job not found");
      }
      const existing = await getHtmlReportJob(jobId);
      if (!existing) {
        return jsonError(c, 404, "NOT_FOUND", "Report job not found");
      }
      const job = await refreshHtmlRunningJob(existing);
      if (job.status === "running") {
        return jsonError(c, 409, "JOB_RUNNING", "Wait for the current preview to finish");
      }
      if (!job.templateHtml || (job.status !== "preview_ready" && job.status !== "approved")) {
        return jsonError(c, 409, "PREVIEW_REQUIRED", "Preview is not ready");
      }
      return c.json({ templateHtml: job.templateHtml, windowDays: job.windowDays });
    } catch (error) {
      if (error instanceof ZodError) {
        return zodError(c, error);
      }
      return cursorError(c, error);
    }
  });

  app.get("/v1/admin/reports/v2/jobs/:jobId", async (c) => {
    const denied = await denyUnlessAdmin(c);
    if (denied) {
      return denied;
    }
    try {
      const jobId = reportJobIdSchema.parse(c.req.param("jobId"));
      if (jobId === PUBLISHED_HTML_JOB_ID) {
        return jsonError(c, 404, "NOT_FOUND", "Report job not found");
      }
      const existing = await getHtmlReportJob(jobId);
      if (!existing) {
        return jsonError(c, 404, "NOT_FOUND", "Report job not found");
      }
      const job = await refreshHtmlRunningJob(existing);
      return c.json(toClient(job));
    } catch (error) {
      if (error instanceof ZodError) {
        return zodError(c, error);
      }
      return cursorError(c, error);
    }
  });

  app.post("/v1/admin/reports/v2/jobs/:jobId/messages", async (c) => {
    const denied = await denyUnlessAdmin(c);
    if (denied) {
      return denied;
    }
    try {
      const jobId = reportJobIdSchema.parse(c.req.param("jobId"));
      const body = refineHtmlReportJobRequestSchema.parse(await c.req.json());
      if (jobId === PUBLISHED_HTML_JOB_ID) {
        return jsonError(c, 404, "NOT_FOUND", "Report job not found");
      }
      const existing = await getHtmlReportJob(jobId);
      if (!existing) {
        return jsonError(c, 404, "NOT_FOUND", "Report job not found");
      }
      if (existing.status === "running") {
        return jsonError(c, 409, "JOB_RUNNING", "Wait for the current preview to finish");
      }
      if (existing.status !== "preview_ready") {
        return jsonError(c, 409, "PREVIEW_REQUIRED", "Refine only after a successful preview");
      }
      if (!existing.agentId) {
        return jsonError(c, 409, "AGENT_REQUIRED", "Job has no Cursor agent to resume");
      }
      const follow = await resumeHtmlDashboardAgent(existing.agentId, body.prompt);
      logJson({
        msg: "html-report-refine",
        agentId: existing.agentId,
        runId: follow.runId,
      });
      const job = await markHtmlJobRunning(existing, {
        runId: follow.runId,
        prompt: body.prompt,
        windowDays: body.windowDays,
      });
      return c.json(toClient(job));
    } catch (error) {
      if (error instanceof ZodError) {
        return zodError(c, error);
      }
      if (error instanceof SyntaxError) {
        return jsonError(c, 400, "VALIDATION_ERROR", "Invalid JSON");
      }
      return cursorError(c, error);
    }
  });

  app.post("/v1/admin/reports/v2/jobs/:jobId/approve", async (c) => {
    const denied = await denyUnlessAdmin(c);
    if (denied) {
      return denied;
    }
    try {
      const jobId = reportJobIdSchema.parse(c.req.param("jobId"));
      if (jobId === PUBLISHED_HTML_JOB_ID) {
        return jsonError(c, 404, "NOT_FOUND", "Report job not found");
      }
      const existing = await getHtmlReportJob(jobId);
      if (!existing) {
        return jsonError(c, 404, "NOT_FOUND", "Report job not found");
      }
      if (existing.status === "running") {
        return jsonError(c, 409, "JOB_RUNNING", "Wait for the current preview to finish");
      }
      if (existing.status !== "preview_ready" || !existing.templateHtml) {
        return jsonError(c, 409, "PREVIEW_REQUIRED", "Approve only after a successful preview");
      }
      const { job } = await publishHtmlTemplate(existing);
      return c.json(toClient(job));
    } catch (error) {
      if (error instanceof ZodError) {
        return zodError(c, error);
      }
      return cursorError(c, error);
    }
  });
}
