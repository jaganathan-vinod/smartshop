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

export const gcpAgentTurnSchema = z.object({
  reply: z.string(),
  sessionId: gcpAgentSessionIdSchema,
});

export type GcpAgentTurn = z.infer<typeof gcpAgentTurnSchema>;
