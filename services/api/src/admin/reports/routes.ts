import type { Hono } from "hono";
import { ZodError } from "zod";
import {
  createReportJobRequestSchema,
  refineReportJobRequestSchema,
  reportJobIdSchema,
} from "@smartshop/shared";
import { currentClaims } from "../../auth.js";
import { jsonError, zodError } from "../../http.js";
import { denyUnlessAdmin } from "../guard.js";
import {
  CursorCloudError,
  cursorDashboardConfigured,
  resumeDashboardAgent,
  startDashboardAgent,
} from "./cursor-cloud.js";
import {
  PUBLISHED_JOB_ID,
  createRunningJob,
  getReportJob,
  markJobRunning,
  publishJobSpec,
  refreshRunningJob,
} from "./store.js";

function cursorError(c: Parameters<typeof jsonError>[0], error: unknown) {
  if (error instanceof CursorCloudError) {
    const status = error.code === "CURSOR_NOT_CONFIGURED" ? 503 : 502;
    return jsonError(c, status, error.code, error.message);
  }
  throw error;
}

export function registerAdminReportRoutes(app: Hono): void {
  app.get("/v1/admin/reports/published", async (c) => {
    const denied = await denyUnlessAdmin(c);
    if (denied) {
      return denied;
    }
    const live = await getReportJob(PUBLISHED_JOB_ID);
    if (!live) {
      return jsonError(c, 404, "NOT_FOUND", "No dashboard has been approved yet");
    }
    return c.json(live);
  });

  app.post("/v1/admin/reports/jobs", async (c) => {
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
      const body = createReportJobRequestSchema.parse(await c.req.json());
      const started = await startDashboardAgent(body.prompt);
      const job = await createRunningJob({
        createdBy: claims.sub,
        prompt: body.prompt,
        agentId: started.agentId,
        runId: started.runId,
        previewUrl: started.url,
      });
      return c.json(job, 201);
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

  app.get("/v1/admin/reports/jobs/:jobId", async (c) => {
    const denied = await denyUnlessAdmin(c);
    if (denied) {
      return denied;
    }
    try {
      const jobId = reportJobIdSchema.parse(c.req.param("jobId"));
      const existing = await getReportJob(jobId);
      if (!existing || existing.jobId === PUBLISHED_JOB_ID) {
        return jsonError(c, 404, "NOT_FOUND", "Report job not found");
      }
      const job = await refreshRunningJob(existing);
      return c.json(job);
    } catch (error) {
      if (error instanceof ZodError) {
        return zodError(c, error);
      }
      return cursorError(c, error);
    }
  });

  app.post("/v1/admin/reports/jobs/:jobId/messages", async (c) => {
    const denied = await denyUnlessAdmin(c);
    if (denied) {
      return denied;
    }
    try {
      const jobId = reportJobIdSchema.parse(c.req.param("jobId"));
      const body = refineReportJobRequestSchema.parse(await c.req.json());
      const existing = await getReportJob(jobId);
      if (!existing || existing.jobId === PUBLISHED_JOB_ID) {
        return jsonError(c, 404, "NOT_FOUND", "Report job not found");
      }
      if (existing.status === "running") {
        return jsonError(c, 409, "JOB_RUNNING", "Wait for the current preview to finish");
      }
      if (!existing.agentId) {
        return jsonError(c, 409, "AGENT_REQUIRED", "Job has no Cursor agent to resume");
      }
      const follow = await resumeDashboardAgent(existing.agentId, body.prompt);
      const job = await markJobRunning(existing, { runId: follow.runId, prompt: body.prompt });
      return c.json(job);
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

  app.post("/v1/admin/reports/jobs/:jobId/approve", async (c) => {
    const denied = await denyUnlessAdmin(c);
    if (denied) {
      return denied;
    }
    try {
      const jobId = reportJobIdSchema.parse(c.req.param("jobId"));
      const existing = await getReportJob(jobId);
      if (!existing || existing.jobId === PUBLISHED_JOB_ID) {
        return jsonError(c, 404, "NOT_FOUND", "Report job not found");
      }
      switch (existing.status) {
        case "preview_ready":
        case "approved":
          break;
        case "running":
        case "error":
        case "published":
          return jsonError(
            c,
            409,
            "PREVIEW_REQUIRED",
            "Approve only after a successful preview",
          );
        default: {
          const _never: never = existing.status;
          return jsonError(c, 409, "PREVIEW_REQUIRED", _never);
        }
      }
      const { job } = await publishJobSpec(existing);
      return c.json(job);
    } catch (error) {
      if (error instanceof ZodError) {
        return zodError(c, error);
      }
      return cursorError(c, error);
    }
  });
}
