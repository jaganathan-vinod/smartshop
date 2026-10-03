import { gcpAgentMessageRequestSchema } from "@smartshop/shared";
import type { Hono } from "hono";
import { ZodError } from "zod";
import { currentClaims } from "../../auth.js";
import { jsonError, zodError } from "../../http.js";
import { denyUnlessAdmin } from "../guard.js";
import { RouteMapNotConfigured } from "../routes-map/query.js";
import { askGcpAgent, GcpAgentError } from "./query.js";

export type GcpAgentRouteDeps = {
  ask?: (userId: string, text: string, sessionId: string | undefined) => Promise<{ reply: string; sessionId: string }>;
};

export function registerAdminGcpAgentRoutes(app: Hono, deps: GcpAgentRouteDeps = {}): void {
  const ask = deps.ask ?? askGcpAgent;

  app.post("/v1/admin/gcp-agents/messages", async (c) => {
    const denied = await denyUnlessAdmin(c);
    if (denied) {
      return denied;
    }
    const claims = currentClaims();
    if (!claims) {
      return jsonError(c, 401, "UNAUTHENTICATED", "Sign in required");
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return jsonError(c, 400, "VALIDATION_ERROR", "Invalid request");
    }
    let parsed: { text: string; sessionId?: string };
    try {
      parsed = gcpAgentMessageRequestSchema.parse(body);
    } catch (error) {
      if (error instanceof ZodError) {
        return zodError(c, error);
      }
      throw error;
    }
    try {
      const turn = await ask(claims.sub, parsed.text, parsed.sessionId);
      return c.json(turn);
    } catch (error) {
      if (error instanceof RouteMapNotConfigured) {
        return jsonError(c, 503, "AGENT_UNAVAILABLE", "The Google reader is not configured");
      }
      if (error instanceof GcpAgentError) {
        return jsonError(c, 502, "AGENT_FAILED", error.message);
      }
      return jsonError(c, 502, "AGENT_FAILED", "The agent did not answer");
    }
  });
}
