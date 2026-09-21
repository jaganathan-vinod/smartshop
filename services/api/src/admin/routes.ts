import type { Hono } from "hono";
import { ZodError } from "zod";
import {
  createProductRequestSchema,
  patchPremiumRequestSchema,
  patchProductRequestSchema,
  productIdSchema,
  replaceProductRequestSchema,
} from "@smartshop/shared";
import { jsonError, zodError } from "../http.js";
import {
  createProduct,
  patchProduct,
  replaceProduct,
} from "../catalog/store.js";
import { setPremium } from "../identity/store.js";
import { denyUnlessAdmin } from "./guard.js";

export function registerAdminRoutes(app: Hono): void {
  app.post("/v1/admin/products", async (c) => {
    const denied = await denyUnlessAdmin(c);
    if (denied) {
      return denied;
    }
    try {
      const body = createProductRequestSchema.parse(await c.req.json());
      const product = await createProduct(body);
      return c.json(product, 201);
    } catch (error) {
      if (error instanceof ZodError) {
        return zodError(c, error);
      }
      if (error instanceof SyntaxError) {
        return jsonError(c, 400, "VALIDATION_ERROR", "Invalid JSON");
      }
      throw error;
    }
  });

  app.put("/v1/admin/products/:productId", async (c) => {
    const denied = await denyUnlessAdmin(c);
    if (denied) {
      return denied;
    }
    try {
      const productId = productIdSchema.parse(c.req.param("productId"));
      const body = replaceProductRequestSchema.parse(await c.req.json());
      const product = await replaceProduct(productId, body);
      if (!product) {
        return jsonError(c, 404, "NOT_FOUND", "Product not found");
      }
      return c.json(product);
    } catch (error) {
      if (error instanceof ZodError) {
        return zodError(c, error);
      }
      if (error instanceof SyntaxError) {
        return jsonError(c, 400, "VALIDATION_ERROR", "Invalid JSON");
      }
      throw error;
    }
  });

  app.patch("/v1/admin/products/:productId", async (c) => {
    const denied = await denyUnlessAdmin(c);
    if (denied) {
      return denied;
    }
    try {
      const productId = productIdSchema.parse(c.req.param("productId"));
      const body = patchProductRequestSchema.parse(await c.req.json());
      const product = await patchProduct(productId, body);
      if (!product) {
        return jsonError(c, 404, "NOT_FOUND", "Product not found");
      }
      return c.json(product);
    } catch (error) {
      if (error instanceof ZodError) {
        return zodError(c, error);
      }
      if (error instanceof SyntaxError) {
        return jsonError(c, 400, "VALIDATION_ERROR", "Invalid JSON");
      }
      throw error;
    }
  });

  app.patch("/v1/admin/users/:userId/premium", async (c) => {
    const denied = await denyUnlessAdmin(c);
    if (denied) {
      return denied;
    }
    try {
      const userId = c.req.param("userId");
      if (!userId) {
        return jsonError(c, 400, "VALIDATION_ERROR", "userId is required");
      }
      const body = patchPremiumRequestSchema.parse(await c.req.json());
      const user = await setPremium(userId, body.isPremium);
      if (!user) {
        return jsonError(c, 404, "NOT_FOUND", "User not found");
      }
      return c.json({
        userId: user.userId,
        email: user.email,
        displayName: user.displayName,
        isPremium: user.isPremium,
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return zodError(c, error);
      }
      if (error instanceof SyntaxError) {
        return jsonError(c, 400, "VALIDATION_ERROR", "Invalid JSON");
      }
      throw error;
    }
  });
}
