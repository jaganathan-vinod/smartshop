import { gcpAgentMessageRequestSchema, gcpAgentSessionIdSchema, gcpAssetIdSchema } from "@smartshop/shared";
import type { GcpAgentSession, GcpAgentSessionSummary, GcpAgentTurn } from "@smartshop/shared";
import type { Context, Hono } from "hono";
import { ZodError } from "zod";
import { currentClaims } from "../../auth.js";
import { jsonError, zodError } from "../../http.js";
import { denyUnlessAdmin } from "../guard.js";
import { RouteMapNotConfigured } from "../routes-map/query.js";
import { loadGcpAsset, type GcpAssetFile } from "./assets.js";
import { askGcpAgent, GcpAgentError } from "./query.js";
import { getGcpSession, GcpSessionNotFound, listGcpSessions } from "./sessions.js";

export type GcpAgentRouteDeps = {
  ask?: (userId: string, text: string, sessionId: string | undefined) => Promise<GcpAgentTurn>;
  listSessions?: (userId: string) => Promise<GcpAgentSessionSummary[]>;
  getSession?: (userId: string, sessionId: string) => Promise<GcpAgentSession>;
  loadAsset?: (assetId: string) => Promise<GcpAssetFile | undefined>;
};

export function registerAdminGcpAgentRoutes(app: Hono, deps: GcpAgentRouteDeps = {}): void {
  const ask = deps.ask ?? askGcpAgent;
  const listSessions = deps.listSessions ?? listGcpSessions;
  const getSession = deps.getSession ?? getGcpSession;
  const loadAsset = deps.loadAsset ?? loadGcpAsset;

  app.get("/v1/admin/gcp-agents/sessions", async (c) => {
    const userId = await adminUser(c);
    if (typeof userId !== "string") {
      return userId;
    }
    try {
      const sessions = await listSessions(userId);
      return c.json({ sessions });
    } catch (error) {
      return agentFailure(c, error);
    }
  });

  app.get("/v1/admin/gcp-agents/sessions/:sessionId", async (c) => {
    const userId = await adminUser(c);
    if (typeof userId !== "string") {
      return userId;
    }
    const sessionId = gcpAgentSessionIdSchema.safeParse(c.req.param("sessionId"));
    if (!sessionId.success) {
      return zodError(c, sessionId.error);
    }
    try {
      return c.json(await getSession(userId, sessionId.data));
    } catch (error) {
      if (error instanceof GcpSessionNotFound) {
        return jsonError(c, 404, "SESSION_NOT_FOUND", error.message);
      }
      return agentFailure(c, error);
    }
  });

  app.get("/v1/admin/gcp-agents/assets/:assetId", async (c) => {
    const userId = await adminUser(c);
    if (typeof userId !== "string") {
      return userId;
    }
    const assetId = gcpAssetIdSchema.safeParse(c.req.param("assetId"));
    if (!assetId.success) {
      return zodError(c, assetId.error);
    }
    try {
      const file = await loadAsset(assetId.data);
      if (!file) {
        return jsonError(c, 404, "ASSET_NOT_READY", "The asset is not ready");
      }
      return c.body(Uint8Array.from(file.bytes), 200, {
        "Content-Type": file.contentType,
        "Cache-Control": "private, max-age=60",
      });
    } catch (error) {
      return agentFailure(c, error);
    }
  });

  app.post("/v1/admin/gcp-agents/messages", async (c) => {
    const userId = await adminUser(c);
    if (typeof userId !== "string") {
      return userId;
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
      const turn = await ask(userId, parsed.text, parsed.sessionId);
      return c.json(turn);
    } catch (error) {
      return agentFailure(c, error);
    }
  });
}

async function adminUser(c: Context): Promise<string | Response> {
  const denied = await denyUnlessAdmin(c);
  if (denied) {
    return denied;
  }
  const claims = currentClaims();
  if (!claims) {
    return jsonError(c, 401, "UNAUTHENTICATED", "Sign in required");
  }
  return claims.sub;
}

function agentFailure(c: Context, error: unknown): Response {
  if (error instanceof RouteMapNotConfigured) {
    return jsonError(c, 503, "AGENT_UNAVAILABLE", "The Google reader is not configured");
  }
  if (error instanceof GcpAgentError) {
    return jsonError(c, 502, "AGENT_FAILED", error.message);
  }
  return jsonError(c, 502, "AGENT_FAILED", "The agent did not answer");
}
