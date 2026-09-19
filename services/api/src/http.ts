import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";
import { apiError } from "@smartshop/shared";

export function jsonError(
  c: Context,
  status: ContentfulStatusCode,
  code: string,
  message: string,
  details?: unknown,
) {
  return c.json(apiError(code, message, details), status);
}

export function zodError(c: Context, error: ZodError) {
  return jsonError(c, 400, "VALIDATION_ERROR", "Invalid request", error.flatten());
}
