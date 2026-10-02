import type { Hono } from "hono";
import { z, ZodError } from "zod";
import { jsonError, zodError } from "../../http.js";
import { denyUnlessAdmin } from "../guard.js";
import { loadMarketingPng } from "./image.js";
import { loadMarketingVideo } from "./video.js";

const assetIdSchema = z
  .string()
  .min(8)
  .max(80)
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid asset id");

export function registerAdminMarketingRoutes(app: Hono): void {
  app.get("/v1/admin/marketing/assets/:assetId", async (c) => {
    const denied = await denyUnlessAdmin(c);
    if (denied) {
      return denied;
    }
    try {
      const assetId = assetIdSchema.parse(c.req.param("assetId"));
      const png = await loadMarketingPng(assetId);
      if (png) {
        const contentType = png[0] === 0xff && png[1] === 0xd8 ? "image/jpeg" : "image/png";
        return c.body(new Uint8Array(png), 200, {
          "Content-Type": contentType,
          "Cache-Control": "private, max-age=300",
        });
      }
      const video = await loadMarketingVideo(assetId);
      if (!video) {
        return jsonError(c, 404, "NOT_FOUND", "Marketing asset not found");
      }
      return c.body(new Uint8Array(video), 200, {
        "Content-Type": "video/mp4",
        "Cache-Control": "private, max-age=300",
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return zodError(c, error);
      }
      return jsonError(c, 502, "ASSET_FAILED", "Could not load the marketing asset");
    }
  });
}
