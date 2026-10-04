import { z } from "zod";

export const gcpAgentSessionIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

export const gcpAgentMessageRequestSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  sessionId: gcpAgentSessionIdSchema.optional(),
});

export type GcpAgentMessageRequest = z.infer<typeof gcpAgentMessageRequestSchema>;

export const SMARTSHOP_A2UI_CATALOG_ID = "https://smartshop.dev/a2ui/v0.9/catalog.json";

export const a2uiMessageSchema = z
  .object({
    version: z.literal("v0.9"),
  })
  .passthrough();

export type A2uiMessage = z.infer<typeof a2uiMessageSchema>;

export const gcpAgentTurnSchema = z.object({
  reply: z.string(),
  sessionId: gcpAgentSessionIdSchema,
  a2ui: z.array(a2uiMessageSchema),
});

export type GcpAgentTurn = z.infer<typeof gcpAgentTurnSchema>;

export const gcpAssetIdSchema = z.string().regex(/^asset_[a-f0-9]{12}$/);

export const gcpAgentSessionSummarySchema = z.object({
  sessionId: gcpAgentSessionIdSchema,
  title: z.string(),
  updatedAt: z.string(),
});

export type GcpAgentSessionSummary = z.infer<typeof gcpAgentSessionSummarySchema>;

export const gcpAgentChatMessageSchema = z.object({
  role: z.enum(["user", "agent"]),
  text: z.string(),
  a2ui: z.array(a2uiMessageSchema),
});

export type GcpAgentChatMessage = z.infer<typeof gcpAgentChatMessageSchema>;

export const gcpAgentSessionSchema = z.object({
  sessionId: gcpAgentSessionIdSchema,
  messages: z.array(gcpAgentChatMessageSchema),
});

export type GcpAgentSession = z.infer<typeof gcpAgentSessionSchema>;
