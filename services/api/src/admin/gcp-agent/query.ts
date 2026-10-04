import type { GcpAgentTurn } from "@smartshop/shared";
import { googleAccessToken } from "../routes-map/client.js";
import { routeMapConfig } from "../routes-map/query.js";
import { turnFromAgentEvents } from "./surface.js";

const CLOUD_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
export const GCP_AGENT_LOCATION = "us-central1";
export const GCP_AGENT_ENGINE_ID = process.env.GCP_AGENT_ENGINE_ID?.trim() || "5576634465393836032";
const ASK_TIMEOUT_MS = 25_000;
const STREAM_TIMEOUT_MS = 150_000;

export class GcpAgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GcpAgentError";
  }
}

export function replyFromAgentEvents(raw: string): string {
  const texts: string[] = [];
  for (const chunk of jsonChunks(raw)) {
    collectText(chunk, texts);
  }
  return texts.map((text) => text.trim()).filter((text) => text.length > 0).at(-1) ?? "";
}

export function sessionIdFromPayload(payload: unknown): string | undefined {
  const record = asRecord(unwrapOutput(payload));
  const id = record?.id ?? record?.session_id ?? record?.sessionId;
  return typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : undefined;
}

export async function askGcpAgent(
  userId: string,
  text: string,
  sessionId: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<GcpAgentTurn> {
  const token = await googleAccessToken([CLOUD_SCOPE]);
  const activeSession = sessionId ?? (await createSession(token, userId, fetchImpl));
  const turn = await streamReply(token, userId, activeSession, text, fetchImpl);
  if (!turn.reply) {
    throw new GcpAgentError("The agent returned no answer");
  }
  return { reply: turn.reply, sessionId: activeSession, a2ui: turn.a2ui };
}

export async function createCoordinatorSession(userId: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const token = await googleAccessToken([CLOUD_SCOPE]);
  return createSession(token, userId, fetchImpl);
}

export async function openCoordinatorStream(
  userId: string,
  sessionId: string,
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const token = await googleAccessToken([CLOUD_SCOPE]);
  return postEngine(
    token,
    "streamQuery",
    { user_id: userId, session_id: sessionId, message: text },
    "async_stream_query",
    fetchImpl,
    STREAM_TIMEOUT_MS,
  );
}

async function createSession(token: string, userId: string, fetchImpl: typeof fetch): Promise<string> {
  const payload = await postJson(token, "query", { user_id: userId }, "async_create_session", fetchImpl);
  const sessionId = sessionIdFromPayload(payload);
  if (!sessionId) {
    throw new GcpAgentError("The agent did not start a session");
  }
  return sessionId;
}

async function streamReply(
  token: string,
  userId: string,
  sessionId: string,
  text: string,
  fetchImpl: typeof fetch,
): Promise<{ reply: string; a2ui: GcpAgentTurn["a2ui"] }> {
  const response = await postEngine(
    token,
    "streamQuery",
    { user_id: userId, session_id: sessionId, message: text },
    "async_stream_query",
    fetchImpl,
  );
  return turnFromAgentEvents(await response.text());
}

async function postJson(
  token: string,
  method: "query" | "streamQuery",
  input: Record<string, string>,
  classMethod: string,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  const response = await postEngine(token, method, input, classMethod, fetchImpl);
  return response.json() as Promise<unknown>;
}

async function postEngine(
  token: string,
  method: "query" | "streamQuery",
  input: Record<string, string>,
  classMethod: string,
  fetchImpl: typeof fetch,
  timeoutMs = ASK_TIMEOUT_MS,
): Promise<Response> {
  const { project } = routeMapConfig();
  const url = `https://${GCP_AGENT_LOCATION}-aiplatform.googleapis.com/v1/projects/${project}/locations/${GCP_AGENT_LOCATION}/reasoningEngines/${GCP_AGENT_ENGINE_ID}:${method}`;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ classMethod, input }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new GcpAgentError("The agent did not answer in time");
  }
  if (!response.ok) {
    throw new GcpAgentError("The agent did not answer");
  }
  return response;
}

function jsonChunks(raw: string): unknown[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      // Fall through to newline-delimited events.
    }
  }
  const chunks: unknown[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    const data = line.startsWith("data:") ? line.slice(5).trim() : line.trim();
    if (!data || data === "[DONE]") {
      continue;
    }
    try {
      chunks.push(JSON.parse(data) as unknown);
    } catch {
      continue;
    }
  }
  return chunks;
}

function collectText(value: unknown, texts: string[]): void {
  const record = asRecord(value);
  if (!record) {
    return;
  }
  if (typeof record.text === "string" && !record.function_call && !record.functionCall) {
    texts.push(record.text);
  }
  if ("output" in record) {
    collectText(record.output, texts);
  }
  const content = asRecord(record.content);
  const parts = content?.parts;
  if (Array.isArray(parts)) {
    for (const part of parts) {
      collectText(part, texts);
    }
  }
}

function unwrapOutput(value: unknown): unknown {
  const record = asRecord(value);
  return record && "output" in record ? record.output : value;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}
