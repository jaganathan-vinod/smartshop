import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import type { HealthResponse } from "@smartshop/shared";
import { apiError } from "@smartshop/shared";
import { withClaims } from "./auth.js";
import { registerAdminRoutes } from "./admin/routes.js";
import { registerAdminMetricsRoutes } from "./admin/metrics/routes.js";
import { registerAdminReportRoutes } from "./admin/reports/routes.js";
import { registerAssistantRoutes } from "./assistant/routes.js";
import { registerAssistantUploadRoutes } from "./assistant/uploads.js";
import { registerCartRoutes } from "./cart/routes.js";
import { registerCatalogRoutes } from "./catalog/routes.js";
import { registerIdentityRoutes } from "./identity/routes.js";
import { logJson } from "./log.js";
import { registerOrderRoutes } from "./orders/routes.js";
import { registerQuoteRoutes } from "./pricing/routes.js";

const app = new Hono();

app.use(async (c, next) => {
  const started = Date.now();
  await next();
  logJson({
    msg: "request",
    route: c.req.path,
    method: c.req.method,
    status: c.res.status,
    ms: Date.now() - started,
  });
});

app.get("/v1/health", (c) => {
  const body: HealthResponse = {
    status: "ok",
    service: "smartshop",
    time: new Date().toISOString(),
  };
  return c.json(body);
});

registerCatalogRoutes(app);
registerIdentityRoutes(app);
registerCartRoutes(app);
registerQuoteRoutes(app);
registerOrderRoutes(app);
registerAdminRoutes(app);
registerAdminMetricsRoutes(app);
registerAdminReportRoutes(app);
registerAssistantRoutes(app);
registerAssistantUploadRoutes(app);

app.notFound((c) => c.json(apiError("NOT_FOUND", "Route not found"), 404));

app.onError((error, c) => {
  logJson({
    msg: "error",
    route: c.req.path,
    method: c.req.method,
    status: 500,
    error: error instanceof Error ? error.name : "unknown",
  });
  return c.json(apiError("INTERNAL", "Unexpected error"), 500);
});

export const handler = withClaims(handle(app));
