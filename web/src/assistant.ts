import type { AssistantInvokeResponse } from "@smartshop/shared";
import { ApiRequestError } from "./api";
import { requireAssistantToken, requireIdToken } from "./cognitoSession";
import { assistantInvokeUrl, loadConfig } from "./config";
import { isNetworkFailure } from "./validation";

export function newConversationId(): string {
  return `conv-${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`;
}

export function newRuntimeSessionId(): string {
  return `smartshop-session-${crypto.randomUUID()}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function assistantFailureMessage(
  status: number,
  body: unknown,
  errorType?: string | null,
): string {
  const record = asRecord(body);
  const nested = asRecord(record.error);
  const candidates = [nested.message, record.message, errorType];
  const detail = candidates.find((value) => typeof value === "string" && value.trim());
  if (typeof detail === "string") {
    return status === 424 ? `Assistant runtime error: ${detail}` : detail;
  }
  if (status === 424) {
    return "Assistant runtime error. The Runtime container rejected the turn.";
  }
  if (status === 401 || status === 403) {
    return "Assistant auth failed. Sign in again and retry.";
  }
  return "Assistant request failed";
}

export function normalizeAssistantResponse(
  body: unknown,
): AssistantInvokeResponse | null {
  const record = asRecord(body);
  if (typeof record.reply === "string") {
    return {
      conversationId: String(record.conversationId ?? ""),
      reply: record.reply,
      toolsUsed: Array.isArray(record.toolsUsed) ? (record.toolsUsed as AssistantInvokeResponse["toolsUsed"]) : [],
      orderNumber: typeof record.orderNumber === "string" ? record.orderNumber : undefined,
    };
  }
  if (typeof record.response === "string") {
    try {
      return normalizeAssistantResponse(JSON.parse(record.response) as unknown);
    } catch {
      return {
        conversationId: String(record.conversationId ?? "conv-runtime"),
        reply: record.response,
        toolsUsed: [],
      };
    }
  }
  if (record.response && typeof record.response === "object") {
    return normalizeAssistantResponse(record.response);
  }
  return null;
}

export async function requestAssistantUpload(): Promise<{ uploadUrl: string; objectKey: string }> {
  const config = await loadConfig();
  const headers = new Headers({
    Authorization: `Bearer ${await requireIdToken()}`,
    "Content-Type": "application/json",
  });
  const response = await fetch(`${config.apiUrl}/v1/assistant/uploads`, {
    method: "POST",
    headers,
  });
  const body = (await response.json()) as {
    uploadUrl?: string;
    objectKey?: string;
    error?: { code?: string; message?: string };
  };
  if (!response.ok || !body.uploadUrl || !body.objectKey) {
    throw new ApiRequestError(
      response.status,
      body.error?.code ?? "HTTP_ERROR",
      body.error?.message ?? "Could not start image upload",
    );
  }
  return { uploadUrl: body.uploadUrl, objectKey: body.objectKey };
}

export async function invokeAssistant(input: {
  conversationId: string;
  sessionId: string;
  message?: string;
  imageObjectKey?: string;
  history?: { role: "user" | "assistant"; text: string }[];
}): Promise<AssistantInvokeResponse> {
  const config = await loadConfig();
  const url = assistantInvokeUrl(config);
  if (!url) {
    throw new ApiRequestError(
      503,
      "ASSISTANT_UNAVAILABLE",
      "Assistant runtime is not in config yet. Deploy Phase 5 CDK or set VITE_ASSISTANT_RUNTIME_URL.",
    );
  }
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await requireAssistantToken()}`,
        "Content-Type": "application/json",
        "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id": input.sessionId,
      },
      body: JSON.stringify({
        conversationId: input.conversationId,
        message: input.message,
        imageObjectKey: input.imageObjectKey,
        history: input.history,
      }),
    });
  } catch (error) {
    if (isNetworkFailure(error)) {
      throw new ApiRequestError(0, "NETWORK_ERROR", "Could not reach the assistant. Try again.");
    }
    throw error;
  }
  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = { message: text };
    }
  }
  if (!response.ok) {
    throw new ApiRequestError(
      response.status,
      String(asRecord(asRecord(parsed).error).code ?? "HTTP_ERROR"),
      assistantFailureMessage(
        response.status,
        parsed,
        response.headers.get("x-amzn-errortype"),
      ),
    );
  }
  const body = normalizeAssistantResponse(parsed);
  if (!body?.reply) {
    throw new ApiRequestError(response.status, "EMPTY_REPLY", "Assistant returned an empty reply");
  }
  return body;
}
