import type { GcpAgentSession, GcpAgentSessionSummary } from "@smartshop/shared";
import { googleAccessToken } from "../routes-map/client.js";
import { routeMapConfig } from "../routes-map/query.js";
import { GCP_AGENT_ENGINE_ID, GCP_AGENT_LOCATION, GcpAgentError } from "./query.js";
import {
  eventsFromPayload,
  messagesFromSessionEvents,
  nextPageToken,
  sessionOwner,
  sessionRecords,
} from "./surface.js";

const CLOUD_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const LIST_LIMIT = 15;

export class GcpSessionNotFound extends Error {
  constructor() {
    super("Session not found");
    this.name = "GcpSessionNotFound";
  }
}

export async function listGcpSessions(
  userId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GcpAgentSessionSummary[]> {
  const token = await googleAccessToken([CLOUD_SCOPE]);
  const listed = await getJson(token, sessionsUrl(userId), fetchImpl);
  const owned = sessionRecords(listed)
    .filter((session) => session.userId === undefined || session.userId === userId)
    .slice(0, LIST_LIMIT);
  const summaries = await Promise.all(
    owned.map(async (session) => {
      let title = "Chat";
      try {
        const events = await readEvents(token, session.sessionId, fetchImpl);
        const firstUser = messagesFromSessionEvents(events).find((message) => message.role === "user");
        if (firstUser?.text) {
          title = firstUser.text.slice(0, 80);
        }
      } catch {
        title = "Chat";
      }
      return { sessionId: session.sessionId, title, updatedAt: session.updatedAt };
    }),
  );
  return summaries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function getGcpSession(
  userId: string,
  sessionId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GcpAgentSession> {
  const token = await googleAccessToken([CLOUD_SCOPE]);
  const session = await getJson(token, sessionUrl(sessionId), fetchImpl);
  if (session === undefined) {
    throw new GcpSessionNotFound();
  }
  const owner = sessionOwner(session);
  if (owner !== userId) {
    throw new GcpSessionNotFound();
  }
  const events = await readEvents(token, sessionId, fetchImpl);
  return { sessionId, messages: messagesFromSessionEvents(events) };
}

async function readEvents(token: string, sessionId: string, fetchImpl: typeof fetch): Promise<unknown[]> {
  const events: unknown[] = [];
  let pageToken = "";
  for (let page = 0; page < 5; page += 1) {
    const payload = await getJson(token, eventsUrl(sessionId, pageToken), fetchImpl);
    if (payload === undefined) {
      break;
    }
    events.push(...eventsFromPayload(payload));
    pageToken = nextPageToken(payload);
    if (!pageToken) {
      break;
    }
  }
  return events;
}

function sessionsUrl(userId: string): string {
  const { project } = routeMapConfig();
  const filter = `user_id=${quoteFilter(userId)}`;
  const url = new URL(
    `https://${GCP_AGENT_LOCATION}-aiplatform.googleapis.com/v1beta1/projects/${project}/locations/${GCP_AGENT_LOCATION}/reasoningEngines/${GCP_AGENT_ENGINE_ID}/sessions`,
  );
  url.searchParams.set("pageSize", String(LIST_LIMIT));
  url.searchParams.set("filter", filter);
  return url.toString();
}

function sessionUrl(sessionId: string): string {
  const { project } = routeMapConfig();
  return `https://${GCP_AGENT_LOCATION}-aiplatform.googleapis.com/v1beta1/projects/${project}/locations/${GCP_AGENT_LOCATION}/reasoningEngines/${GCP_AGENT_ENGINE_ID}/sessions/${encodeURIComponent(sessionId)}`;
}

function eventsUrl(sessionId: string, pageToken: string): string {
  const url = new URL(`${sessionUrl(sessionId)}/events`);
  url.searchParams.set("pageSize", "100");
  if (pageToken) {
    url.searchParams.set("pageToken", pageToken);
  }
  return url.toString();
}

function quoteFilter(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

async function getJson(token: string, url: string, fetchImpl: typeof fetch): Promise<unknown> {
  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    throw new GcpAgentError("The agent did not answer");
  }
  return response.json() as Promise<unknown>;
}
