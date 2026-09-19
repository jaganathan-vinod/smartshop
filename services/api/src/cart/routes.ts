import type { Context, Hono } from "hono";
import { ZodError } from "zod";
import {
  patchCartItemRequestSchema,
  productIdSchema,
  upsertCartItemRequestSchema,
} from "@smartshop/shared";
import { currentClaims } from "../auth.js";
import { jsonError, zodError } from "../http.js";
import {
  deleteCartItem,
  getCartLines,
  upsertCartItem,
} from "./store.js";

function requireUser(c: Context) {
  const claims = currentClaims();
  if (!claims) {
    return { error: jsonError(c, 401, "UNAUTHENTICATED", "Sign in required") };
  }
  return { claims };
}

export function registerCartRoutes(app: Hono): void {
  app.get("/v1/cart", async (c) => {
    const auth = requireUser(c);
    if ("error" in auth) {
      return auth.error;
    }
    const items = await getCartLines(auth.claims.sub);
    return c.json({ items });
  });

  app.put("/v1/cart/items", async (c) => {
    const auth = requireUser(c);
    if ("error" in auth) {
      return auth.error;
    }
    try {
      const body = upsertCartItemRequestSchema.parse(await c.req.json());
      await upsertCartItem(auth.claims.sub, body.productId, body.quantity);
      return c.json({ items: await getCartLines(auth.claims.sub) });
    } catch (error) {
      if (error instanceof ZodError) {
        return zodError(c, error);
      }
      if (error instanceof SyntaxError) {
        return jsonError(c, 400, "VALIDATION_ERROR", "Invalid JSON");
      }
      if (error instanceof Error && "code" in error && error.code === "NOT_FOUND") {
        return jsonError(c, 404, "NOT_FOUND", "Product not found");
      }
      throw error;
    }
  });

  app.patch("/v1/cart/items/:productId", async (c) => {
    const auth = requireUser(c);
    if ("error" in auth) {
      return auth.error;
    }
    try {
      const productId = productIdSchema.parse(c.req.param("productId"));
      const body = patchCartItemRequestSchema.parse(await c.req.json());
      await upsertCartItem(auth.claims.sub, productId, body.quantity);
      return c.json({ items: await getCartLines(auth.claims.sub) });
    } catch (error) {
      if (error instanceof ZodError) {
        return zodError(c, error);
      }
      if (error instanceof SyntaxError) {
        return jsonError(c, 400, "VALIDATION_ERROR", "Invalid JSON");
      }
      if (error instanceof Error && "code" in error && error.code === "NOT_FOUND") {
        return jsonError(c, 404, "NOT_FOUND", "Product not found");
      }
      throw error;
    }
  });

  app.delete("/v1/cart/items/:productId", async (c) => {
    const auth = requireUser(c);
    if ("error" in auth) {
      return auth.error;
    }
    try {
      const productId = productIdSchema.parse(c.req.param("productId"));
      await deleteCartItem(auth.claims.sub, productId);
      return c.json({ items: await getCartLines(auth.claims.sub) });
    } catch (error) {
      if (error instanceof ZodError) {
        return zodError(c, error);
      }
      throw error;
    }
  });
}
