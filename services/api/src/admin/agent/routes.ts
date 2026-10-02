import {
  agentMessageRequestSchema,
  agentSessionIdSchema,
  type AgentSessionDetail,
  type AgentSessionMessage,
  type AgentTurn,
} from "@smartshop/shared";
import type { Hono } from "hono";
import { ZodError } from "zod";
import { currentClaims } from "../../auth.js";
import { jsonError, zodError } from "../../http.js";
import { denyUnlessAdmin } from "../guard.js";
import { planCandidate, type StorePlanResult } from "./plan.js";
import { isImageRequest } from "../marketing/intent.js";
import { generateMarketingImage, type MarketingImageResult } from "../marketing/image.js";

type AgentSession = {
  sessionId: string;
  userId: string;
  messages: AgentSessionMessage[];
};

const sessions = new Map<string, AgentSession>();

export type AgentRouteDeps = {
  plan?: (text: string) => Promise<StorePlanResult>;
  image?: (sessionId: string, text: string) => Promise<MarketingImageResult>;
};

export function registerAdminAgentRoutes(app: Hono, deps: AgentRouteDeps = {}): void {
  const plan = deps.plan ?? planCandidate;
  const image = deps.image ?? generateMarketingImage;

  app.post("/v1/admin/agent/sessions", async (c) => {
    const denied = await denyUnlessAdmin(c);
    if (denied) {
      return denied;
    }
    const userId = currentClaims()?.sub;
    if (!userId) {
      return jsonError(c, 401, "UNAUTHENTICATED", "Sign in required");
    }
    const sessionId = `sess_${crypto.randomUUID().replaceAll("-", "")}`;
    sessions.set(sessionId, { sessionId, userId, messages: [] });
    return c.json({ sessionId });
  });

  app.post("/v1/admin/agent/sessions/:sessionId/messages", async (c) => {
    const denied = await denyUnlessAdmin(c);
    if (denied) {
      return denied;
    }
    const userId = currentClaims()?.sub;
    if (!userId) {
      return jsonError(c, 401, "UNAUTHENTICATED", "Sign in required");
    }
    try {
      const sessionId = agentSessionIdSchema.parse(c.req.param("sessionId"));
      const body = agentMessageRequestSchema.parse(await c.req.json());
      const session = sessions.get(sessionId);
      if (!session || session.userId !== userId) {
        return jsonError(c, 404, "NOT_FOUND", "Session not found");
      }
      const planned = isImageRequest(body.text) ? undefined : await plan(body.text);
      const pictured = planned ? undefined : await image(sessionId, body.text);
      const reply = planned?.reply ?? pictured?.reply ?? "";
      session.messages.push({ role: "user", text: body.text });
      session.messages.push({
        role: "agent",
        text: reply,
        planId: planned?.planId,
        routeGeojson: planned?.routeGeojson,
        choices: planned?.choices,
        trace: planned?.trace ?? pictured?.trace,
        assetId: pictured?.assetId,
      });
      const turn: AgentTurn = {
        sessionId,
        reply,
        status: "COMPLETE",
        planId: planned?.planId,
        routeGeojson: planned?.routeGeojson,
        choices: planned?.choices,
        trace: planned?.trace ?? pictured?.trace,
        assetId: pictured?.assetId,
      };
      return c.json(turn);
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

  app.get("/v1/admin/agent/sessions/:sessionId", async (c) => {
    const denied = await denyUnlessAdmin(c);
    if (denied) {
      return denied;
    }
    const userId = currentClaims()?.sub;
    if (!userId) {
      return jsonError(c, 401, "UNAUTHENTICATED", "Sign in required");
    }
    try {
      const sessionId = agentSessionIdSchema.parse(c.req.param("sessionId"));
      const session = sessions.get(sessionId);
      if (!session || session.userId !== userId) {
        return jsonError(c, 404, "NOT_FOUND", "Session not found");
      }
      const detail: AgentSessionDetail = {
        sessionId,
        status: "COMPLETE",
        messages: session.messages,
      };
      return c.json(detail);
    } catch (error) {
      if (error instanceof ZodError) {
        return zodError(c, error);
      }
      throw error;
    }
  });
}
