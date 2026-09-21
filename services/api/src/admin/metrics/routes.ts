import type { Hono } from "hono";
import { jsonError } from "../../http.js";
import { denyUnlessAdmin } from "../guard.js";
import { loadAdminMetrics } from "./store.js";

function windowDays(raw: string | undefined): number {
  if (!raw) {
    return 7;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 90) {
    return 7;
  }
  return parsed;
}

export function registerAdminMetricsRoutes(app: Hono): void {
  app.get("/v1/admin/metrics/summary", async (c) => {
    const denied = await denyUnlessAdmin(c);
    if (denied) {
      return denied;
    }
    const metrics = await loadAdminMetrics(windowDays(c.req.query("days")));
    return c.json(metrics.summary);
  });

  app.get("/v1/admin/metrics/products", async (c) => {
    const denied = await denyUnlessAdmin(c);
    if (denied) {
      return denied;
    }
    const metrics = await loadAdminMetrics(windowDays(c.req.query("days")));
    return c.json({ products: metrics.products });
  });

  app.get("/v1/admin/metrics/stock", async (c) => {
    const denied = await denyUnlessAdmin(c);
    if (denied) {
      return denied;
    }
    const metrics = await loadAdminMetrics(windowDays(c.req.query("days")));
    return c.json({ items: metrics.stock });
  });

  app.get("/v1/admin/metrics/delivery", async (c) => {
    const denied = await denyUnlessAdmin(c);
    if (denied) {
      return denied;
    }
    const metrics = await loadAdminMetrics(windowDays(c.req.query("days")));
    return c.json({ delivery: metrics.summary.delivery, currency: metrics.summary.currency });
  });

  app.get("/v1/admin/metrics/premium", async (c) => {
    const denied = await denyUnlessAdmin(c);
    if (denied) {
      return denied;
    }
    const metrics = await loadAdminMetrics(windowDays(c.req.query("days")));
    return c.json({
      premiumOrderCount: metrics.summary.premiumOrderCount,
      orderCount: metrics.summary.orderCount,
      premiumUserCount: metrics.summary.premiumUserCount,
      userCount: metrics.summary.userCount,
    });
  });

  app.get("/v1/admin/metrics/:unknown", async (c) => {
    const denied = await denyUnlessAdmin(c);
    if (denied) {
      return denied;
    }
    return jsonError(c, 404, "NOT_AVAILABLE", "Metric is not in the v1 catalogue", {
      requested: c.req.param("unknown"),
    });
  });
}
