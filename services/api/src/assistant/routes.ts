import type { Context, Hono } from "hono";
import { ZodError } from "zod";
import {
  USER_CONFIRMED_HEADER,
  USER_ID_HEADER,
  assistantToolRequestSchema,
} from "@smartshop/shared";
import { currentClaims, currentIamArn } from "../auth.js";
import { jsonError, zodError } from "../http.js";
import { AssistantToolError, dispatchAssistantTool } from "./dispatch.js";

const USER_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export function internalCallerFromRequest(c: Context) {
  if (currentClaims()) {
    return {
      error: jsonError(c, 403, "FORBIDDEN", "Internal assistant tools are IAM-only"),
    };
  }
  if (!currentIamArn()) {
    return { error: jsonError(c, 403, "FORBIDDEN", "IAM caller required") };
  }
  const userId = c.req.header(USER_ID_HEADER)?.trim();
  if (!userId || !USER_ID_PATTERN.test(userId)) {
    return {
      error: jsonError(c, 400, "USER_ID_REQUIRED", "X-SmartShop-User-Id is required"),
    };
  }
  const confirmedHeader = c.req.header(USER_CONFIRMED_HEADER)?.trim().toLowerCase();
  return { userId, userConfirmed: confirmedHeader === "true" };
}

export function registerAssistantRoutes(app: Hono): void {
  app.post("/v1/internal/assistant/tools", async (c) => {
    const caller = internalCallerFromRequest(c);
    if ("error" in caller) {
      return caller.error;
    }
    try {
      const body = assistantToolRequestSchema.parse(await c.req.json());
      const result = await dispatchAssistantTool({
        userId: caller.userId,
        conversationId: body.conversationId,
        tool: body.tool,
        args: body.args,
        userConfirmed: caller.userConfirmed,
      });
      return c.json({ result });
    } catch (error) {
      if (error instanceof AssistantToolError) {
        const status =
          error.code === "NOT_FOUND"
            ? 404
            : error.code === "INSUFFICIENT_STOCK" ||
                error.code === "IDEMPOTENCY_CONFLICT" ||
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
      if (error instanceof Error && "code" in error && error.code === "NOT_FOUND") {
        return jsonError(c, 404, "NOT_FOUND", "Product not found");
      }
      throw error;
    }
  });
}
