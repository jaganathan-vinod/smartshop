import type { Context, Hono } from "hono";
import { ZodError } from "zod";
import { quoteRequestSchema } from "@smartshop/shared";
import { currentClaims } from "../auth.js";
import { getCartLines } from "../cart/store.js";
import { jsonError, zodError } from "../http.js";
import { getUser } from "../identity/store.js";
import { computeQuote, PricingError } from "./engine.js";

function requireUser(c: Context) {
  const claims = currentClaims();
  if (!claims) {
    return { error: jsonError(c, 401, "UNAUTHENTICATED", "Sign in required") };
  }
  return { claims };
}

export function registerQuoteRoutes(app: Hono): void {
  app.post("/v1/quotes", async (c) => {
    const auth = requireUser(c);
    if ("error" in auth) {
      return auth.error;
    }
    try {
      const body = quoteRequestSchema.parse(await c.req.json());
      const items = await getCartLines(auth.claims.sub);
      const user = await getUser(auth.claims.sub);
      const quote = computeQuote(items, user?.isPremium ?? false, body.deliveryMethod);
      return c.json(quote);
    } catch (error) {
      if (error instanceof PricingError && error.code === "CART_EMPTY") {
        return jsonError(c, 400, "CART_EMPTY", error.message);
      }
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
