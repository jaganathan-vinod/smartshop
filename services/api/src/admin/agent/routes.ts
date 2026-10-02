import {
  agentMessageRequestSchema,
  agentSessionIdSchema,
  createAgentSessionRequestSchema,
  type AgentSessionDetail,
  type AgentSessionKind,
  type AgentSessionMessage,
  type AgentTurn,
} from "@smartshop/shared";
import type { Hono } from "hono";
import { ZodError } from "zod";
import { currentClaims } from "../../auth.js";
import { jsonError, zodError } from "../../http.js";
import { denyUnlessAdmin } from "../guard.js";
import { planCandidate, type StorePlanResult } from "./plan.js";
import { isImageRequest, isVideoRequest } from "../marketing/intent.js";
import { generateMarketingImage, type MarketingImageResult } from "../marketing/image.js";
import {
  refreshMarketingVideo,
  startMarketingVideo,
  type MarketingVideoResult,
} from "../marketing/video.js";

type AgentSession = {
  sessionId: string;
  userId: string;
  kind: AgentSessionKind;
  messages: AgentSessionMessage[];
};

const sessions = new Map<string, AgentSession>();

export type AgentRouteDeps = {
  plan?: (text: string) => Promise<StorePlanResult>;
  image?: (sessionId: string, text: string) => Promise<MarketingImageResult>;
  video?: (sessionId: string, text: string) => Promise<MarketingVideoResult>;
  refreshVideo?: (assetId: string) => Promise<{ status: "GENERATING" | "REVIEW" | "FAILED"; reply: string } | null>;
};

export function registerAdminAgentRoutes(app: Hono, deps: AgentRouteDeps = {}): void {
  const plan = deps.plan ?? planCandidate;
  const image = deps.image ?? generateMarketingImage;
  const video = deps.video ?? startMarketingVideo;
  const refreshVideo = deps.refreshVideo ?? refreshMarketingVideo;

  app.post("/v1/admin/agent/sessions", async (c) => {
    const denied = await denyUnlessAdmin(c);
    if (denied) {
      return denied;
    }
    const userId = currentClaims()?.sub;
    if (!userId) {
      return jsonError(c, 401, "UNAUTHENTICATED", "Sign in required");
    }
    try {
      const kind = await sessionKind(c);
      const sessionId = `sess_${crypto.randomUUID().replaceAll("-", "")}`;
      sessions.set(sessionId, { sessionId, userId, kind, messages: [] });
      return c.json({ sessionId });
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
      const turn = await runTurn(session, body.text, { plan, image, video });
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
      await refreshGenerating(session, refreshVideo);
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

async function sessionKind(c: { req: { text: () => Promise<string> } }): Promise<AgentSessionKind> {
  const raw = await c.req.text();
  if (raw.trim().length === 0) {
    return "planning";
  }
  const parsed = createAgentSessionRequestSchema.parse(JSON.parse(raw) as unknown);
  return parsed.kind ?? "planning";
}

async function runTurn(
  session: AgentSession,
  text: string,
  deps: {
    plan: (text: string) => Promise<StorePlanResult>;
    image: (sessionId: string, text: string) => Promise<MarketingImageResult>;
    video: (sessionId: string, text: string) => Promise<MarketingVideoResult>;
  },
): Promise<AgentTurn> {
  switch (session.kind) {
    case "planning":
      return finish(session, text, await deps.plan(text), undefined, undefined);
    case "marketing":
      return marketingTurn(session, text, deps);
    default: {
      const unexpected: never = session.kind;
      return unexpected;
    }
  }
}

async function marketingTurn(
  session: AgentSession,
  text: string,
  deps: {
    image: (sessionId: string, text: string) => Promise<MarketingImageResult>;
    video: (sessionId: string, text: string) => Promise<MarketingVideoResult>;
  },
): Promise<AgentTurn> {
  if (isVideoRequest(text)) {
    const filmed = await deps.video(session.sessionId, text);
    return finish(session, text, undefined, undefined, filmed);
  }
  if (isImageRequest(text)) {
    const pictured = await deps.image(session.sessionId, text);
    return finish(session, text, undefined, pictured, undefined);
  }
  return finish(session, text, {
    reply: "Name a catalogue product and ask for an image or a short video.",
  }, undefined, undefined);
}

function finish(
  session: AgentSession,
  text: string,
  planned: StorePlanResult | undefined,
  pictured: MarketingImageResult | undefined,
  filmed: MarketingVideoResult | undefined,
): AgentTurn {
  const reply = planned?.reply ?? pictured?.reply ?? filmed?.reply ?? "";
  const assetId = filmed?.assetId ?? pictured?.assetId;
  const assetKind = filmed?.assetKind ?? (pictured?.assetId ? "IMAGE" : undefined);
  const assetStatus = filmed?.assetStatus ?? (pictured?.assetId ? "REVIEW" : undefined);
  session.messages.push({ role: "user", text });
  session.messages.push({
    role: "agent",
    text: reply,
    planId: planned?.planId,
    routeGeojson: planned?.routeGeojson,
    choices: planned?.choices,
    trace: planned?.trace ?? pictured?.trace ?? filmed?.trace,
    assetId,
    assetKind,
    assetStatus,
  });
  return {
    sessionId: session.sessionId,
    reply,
    status: "COMPLETE",
    planId: planned?.planId,
    routeGeojson: planned?.routeGeojson,
    choices: planned?.choices,
    trace: planned?.trace ?? pictured?.trace ?? filmed?.trace,
    assetId,
    assetKind,
    assetStatus,
  };
}

async function refreshGenerating(
  session: AgentSession,
  refreshVideo: (assetId: string) => Promise<{ status: "GENERATING" | "REVIEW" | "FAILED"; reply: string } | null>,
): Promise<void> {
  for (const message of session.messages) {
    if (message.assetKind !== "VIDEO" || message.assetStatus !== "GENERATING" || !message.assetId) {
      continue;
    }
    const refreshed = await refreshVideo(message.assetId);
    if (!refreshed || refreshed.status === "GENERATING") {
      continue;
    }
    message.assetStatus = refreshed.status;
    message.text = refreshed.reply;
  }
}
