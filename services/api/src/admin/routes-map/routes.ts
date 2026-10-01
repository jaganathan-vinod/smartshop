import type { RouteMapRow } from "@smartshop/shared";
import type { Hono } from "hono";
import { logJson } from "../../log.js";
import { jsonError } from "../../http.js";
import { denyUnlessAdmin } from "../guard.js";
import { queryRouteMap } from "./client.js";
import { RouteMapNotConfigured } from "./query.js";

export type RouteMapDeps = {
  query?: () => Promise<RouteMapRow[]>;
};

export function registerAdminRouteMapRoutes(app: Hono, deps: RouteMapDeps = {}): void {
  app.get("/v1/admin/routes", async (c) => {
    const denied = await denyUnlessAdmin(c);
    if (denied) {
      return denied;
    }
    try {
      const routes = deps.query ? await deps.query() : await queryRouteMap();
      return c.json({ routes });
    } catch (error) {
      if (error instanceof RouteMapNotConfigured) {
        return jsonError(c, 503, "BQ_NOT_CONFIGURED", "BigQuery route reader is not configured");
      }
      logJson({
        msg: "route-map",
        error: error instanceof Error ? error.message : "unknown",
      });
      return jsonError(c, 502, "BQ_QUERY_FAILED", "Could not load routes");
    }
  });
}
