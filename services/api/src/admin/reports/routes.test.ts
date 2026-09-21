import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Hono } from "hono";
import { runWithClaims } from "../../auth.js";
import { registerAdminMetricsRoutes } from "../metrics/routes.js";
import { registerAdminReportRoutes } from "./routes.js";

function app() {
  const hono = new Hono();
  registerAdminMetricsRoutes(hono);
  registerAdminReportRoutes(hono);
  return hono;
}

describe("admin dashboard authz", () => {
  it("rejects a customer JWT on metrics", async () => {
    const response = await runWithClaims({ sub: "user-a", groups: [] }, () =>
      app().request("http://localhost/v1/admin/metrics/summary"),
    );
    assert.equal(response.status, 403);
    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, "FORBIDDEN");
  });

  it("rejects a missing JWT on report jobs", async () => {
    const response = await runWithClaims(null, () =>
      app().request("http://localhost/v1/admin/reports/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: "Weekly GMV versus a 12k target" }),
      }),
    );
    assert.equal(response.status, 401);
  });

  it("does not start a job when Cursor is not configured", async () => {
    const previous = process.env.CURSOR_DASHBOARD_STUB;
    const previousKey = process.env.CURSOR_DASHBOARD_API_KEY;
    delete process.env.CURSOR_DASHBOARD_STUB;
    delete process.env.CURSOR_DASHBOARD_API_KEY;
    try {
      const response = await runWithClaims({ sub: "admin-1", groups: ["admin"] }, () =>
        app().request("http://localhost/v1/admin/reports/jobs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prompt: "Weekly GMV versus a 12k target" }),
        }),
      );
      assert.equal(response.status, 503);
      const body = (await response.json()) as { error: { code: string } };
      assert.equal(body.error.code, "CURSOR_NOT_CONFIGURED");
    } finally {
      if (previous === undefined) {
        delete process.env.CURSOR_DASHBOARD_STUB;
      } else {
        process.env.CURSOR_DASHBOARD_STUB = previous;
      }
      if (previousKey === undefined) {
        delete process.env.CURSOR_DASHBOARD_API_KEY;
      } else {
        process.env.CURSOR_DASHBOARD_API_KEY = previousKey;
      }
    }
  });
});
