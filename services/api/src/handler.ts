import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import type { HealthResponse } from "@smartshop/shared";
import { apiError } from "@smartshop/shared";
import { withClaims } from "./auth.js";
import { registerAdminRoutes } from "./admin/routes.js";
import { registerCartRoutes } from "./cart/routes.js";
import { registerCatalogRoutes } from "./catalog/routes.js";
import { registerIdentityRoutes } from "./identity/routes.js";
import { registerOrderRoutes } from "./orders/routes.js";
import { registerQuoteRoutes } from "./pricing/routes.js";

const app = new Hono();

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

app.notFound((c) => c.json(apiError("NOT_FOUND", "Route not found"), 404));

app.onError((error, c) => {
  console.error(error);
  return c.json(apiError("INTERNAL", "Unexpected error"), 500);
});

export const handler = withClaims(handle(app));
