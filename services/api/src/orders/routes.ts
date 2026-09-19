import type { Context, Hono } from "hono";
import { ZodError } from "zod";
import {
  createOrderRequestSchema,
  idempotencyKeySchema,
  orderIdSchema,
} from "@smartshop/shared";
import { currentClaims } from "../auth.js";
import { jsonError, zodError } from "../http.js";
import { PricingError } from "../pricing/engine.js";
import { confirmOrder, getOrderForUser, listOrders, OrderError } from "./store.js";

function requireUser(c: Context) {
  const claims = currentClaims();
  if (!claims) {
    return { error: jsonError(c, 401, "UNAUTHENTICATED", "Sign in required") };
  }
  return { claims };
}

function parseIdempotencyKey(header: string | undefined): string | undefined {
  if (!header) {
    return undefined;
  }
  return idempotencyKeySchema.parse(header);
}

export function registerOrderRoutes(app: Hono): void {
  app.post("/v1/orders", async (c) => {
    const auth = requireUser(c);
    if ("error" in auth) {
      return auth.error;
    }
    try {
      const body = createOrderRequestSchema.parse(await c.req.json());
      const idempotencyKey = parseIdempotencyKey(c.req.header("Idempotency-Key"));
      const order = await confirmOrder(auth.claims.sub, body, idempotencyKey);
      return c.json(order);
    } catch (error) {
      return mapOrderError(c, error);
    }
  });

  app.get("/v1/orders", async (c) => {
    const auth = requireUser(c);
    if ("error" in auth) {
      return auth.error;
    }
    const orders = await listOrders(auth.claims.sub);
    return c.json({ orders });
  });

  app.get("/v1/orders/:orderId", async (c) => {
    const auth = requireUser(c);
    if ("error" in auth) {
      return auth.error;
    }
    try {
      const orderId = orderIdSchema.parse(c.req.param("orderId"));
      const order = await getOrderForUser(auth.claims.sub, orderId);
      if (!order) {
        return jsonError(c, 404, "NOT_FOUND", "Order not found");
      }
      return c.json(order);
    } catch (error) {
      if (error instanceof ZodError) {
        return zodError(c, error);
      }
      throw error;
    }
  });
}

function mapOrderError(c: Context, error: unknown) {
  if (error instanceof PricingError && error.code === "CART_EMPTY") {
    return jsonError(c, 400, "CART_EMPTY", error.message);
  }
  if (error instanceof OrderError) {
    const status =
      error.code === "IDEMPOTENCY_CONFLICT" ||
      error.code === "INSUFFICIENT_STOCK" ||
      error.code === "PRODUCT_UNAVAILABLE" ||
      error.code === "CART_CHANGED"
        ? 409
        : 400;
    return jsonError(c, status, error.code, error.message, error.details);
  }
  if (error instanceof ZodError) {
    return zodError(c, error);
  }
  if (error instanceof SyntaxError) {
    return jsonError(c, 400, "VALIDATION_ERROR", "Invalid JSON");
  }
  throw error;
}
