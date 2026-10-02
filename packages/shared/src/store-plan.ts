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

export const planChoiceSchema = z.object({
  id: z.string().min(1).max(80),
  subjectKind: z.enum(["CURRENT_STORE", "COMPETITOR"]),
  subjectName: z.string().min(1),
  distanceMeters: z.number().nonnegative(),
  durationSeconds: z.number().nonnegative(),
  routeGeojson: z.string().min(1),
});

export type PlanChoice = z.infer<typeof planChoiceSchema>;

export const planApiCallSchema = z.object({
  label: z.string().min(1).max(200),
  api: z.enum(["GEOCODE", "PLACES", "ROUTES", "IMAGEN"]),
  method: z.enum(["GET", "POST"]),
  url: z.string().min(1).max(2000),
  status: z.number().int().nonnegative(),
  request: z.string().max(8_000),
  response: z.string().max(16_000),
});

export type PlanApiCall = z.infer<typeof planApiCallSchema>;

export const agentTurnSchema = z.object({
  sessionId: agentSessionIdSchema,
  reply: z.string(),
  status: z.literal("COMPLETE"),
  planId: z.string().min(1).max(80).optional(),
  routeGeojson: z.string().optional(),
  choices: z.array(planChoiceSchema).optional(),
  trace: z.array(planApiCallSchema).max(40).optional(),
  assetId: z.string().min(8).max(80).regex(/^[A-Za-z0-9_-]+$/).optional(),
});

export type AgentTurn = z.infer<typeof agentTurnSchema>;

export const agentSessionMessageSchema = z.object({
  role: z.enum(["user", "agent"]),
  text: z.string(),
  planId: z.string().optional(),
  routeGeojson: z.string().optional(),
  choices: z.array(planChoiceSchema).optional(),
  trace: z.array(planApiCallSchema).max(40).optional(),
  assetId: z.string().min(8).max(80).regex(/^[A-Za-z0-9_-]+$/).optional(),
});

export type AgentSessionMessage = z.infer<typeof agentSessionMessageSchema>;

export const agentSessionDetailSchema = z.object({
  sessionId: agentSessionIdSchema,
  status: z.literal("COMPLETE"),
  messages: z.array(agentSessionMessageSchema),
});

export type AgentSessionDetail = z.infer<typeof agentSessionDetailSchema>;
