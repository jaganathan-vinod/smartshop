import { assistantInvokeRequestSchema, type AssistantInvokeRequest } from "@smartshop/shared";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizeInvokePayload(raw: unknown): AssistantInvokeRequest {
  const record = asRecord(raw);
  let nested: Record<string, unknown> = record;
  if (typeof record.prompt === "string") {
    try {
      const parsed = JSON.parse(record.prompt) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        nested = { ...record, ...(parsed as Record<string, unknown>) };
      } else {
        nested = { ...record, message: record.prompt };
      }
    } catch {
      nested = { ...record, message: record.prompt };
    }
  }
  return assistantInvokeRequestSchema.parse({
    conversationId: nested.conversationId,
    message:
      typeof nested.message === "string"
        ? nested.message
        : typeof nested.prompt === "string"
          ? nested.prompt
          : undefined,
    imageObjectKey: nested.imageObjectKey,
    history: nested.history,
  });
}
