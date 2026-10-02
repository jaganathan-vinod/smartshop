import { z } from "zod";

export const agentSessionIdSchema = z
  .string()
  .min(8)
  .max(80)
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid session id");

export const createAgentSessionResponseSchema = z.object({
  sessionId: agentSessionIdSchema,
});

export const agentMessageRequestSchema = z.object({
  text: z.string().trim().min(1).max(500),
});

export type AgentMessageRequest = z.infer<typeof agentMessageRequestSchema>;

export const agentTurnSchema = z.object({
  sessionId: agentSessionIdSchema,
  reply: z.string(),
  status: z.literal("COMPLETE"),
  planId: z.string().min(1).max(80).optional(),
  routeGeojson: z.string().optional(),
});

export type AgentTurn = z.infer<typeof agentTurnSchema>;

export const agentSessionMessageSchema = z.object({
  role: z.enum(["user", "agent"]),
  text: z.string(),
  planId: z.string().optional(),
  routeGeojson: z.string().optional(),
});

export type AgentSessionMessage = z.infer<typeof agentSessionMessageSchema>;

export const agentSessionDetailSchema = z.object({
  sessionId: agentSessionIdSchema,
  status: z.literal("COMPLETE"),
  messages: z.array(agentSessionMessageSchema),
});

export type AgentSessionDetail = z.infer<typeof agentSessionDetailSchema>;
