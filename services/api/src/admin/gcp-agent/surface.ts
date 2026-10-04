import { SMARTSHOP_A2UI_CATALOG_ID, type A2uiMessage, type GcpAgentChatMessage } from "@smartshop/shared";

const ASSET_LINE = /ASSET\s+(asset_[a-f0-9]{12})\s+(image|video)\s+(REVIEW|GENERATING)/i;
const ASSET_ID = /\b(asset_[a-f0-9]{12})\b/i;

export type CampaignAsset = {
  assetId: string;
  kind: "image" | "video";
  status: "REVIEW" | "GENERATING";
};

export function findAsset(text: string): CampaignAsset | undefined {
  const line = text.match(ASSET_LINE);
  if (line?.[1] && line[2] && line[3]) {
    return assetFrom(line[1], line[2], line[3]);
  }
  const id = text.match(ASSET_ID)?.[1];
  if (!id) {
    return undefined;
  }
  const kind = kindFrom(text);
  if (!kind) {
    return undefined;
  }
  return { assetId: id, kind, status: statusFrom(kind, text) };
}

export function displayText(text: string, asset: CampaignAsset | undefined): string {
  const stripped = text.replace(ASSET_LINE, "").trim();
  if (stripped) {
    return stripped;
  }
  if (!asset) {
    return text.trim();
  }
  switch (asset.status) {
    case "GENERATING":
      return "The video is generating.";
    case "REVIEW":
      return "The asset is ready for review.";
    default: {
      const unexpected: never = asset.status;
      return unexpected;
    }
  }
}

export function buildA2ui(text: string, surfaceId: string, asset: CampaignAsset | undefined): A2uiMessage[] {
  const children = asset ? ["summary", "asset"] : ["summary"];
  const components: Record<string, unknown>[] = [
    { id: "root", component: "Column", children },
    { id: "summary", component: "Text", text: displayText(text, asset), variant: "body" },
  ];
  if (asset) {
    components.push({
      id: "asset",
      component: "Asset",
      assetId: asset.assetId,
      kind: asset.kind,
      status: asset.status,
    });
  }
  return [
    {
      version: "v0.9",
      createSurface: { surfaceId, catalogId: SMARTSHOP_A2UI_CATALOG_ID },
    },
    {
      version: "v0.9",
      updateComponents: { surfaceId, components },
    },
    {
      version: "v0.9",
      updateDataModel: {
        surfaceId,
        path: "/",
        value: {
          summary: displayText(text, asset),
          asset: asset ?? null,
        },
      },
    },
  ];
}

export function messagesFromSessionEvents(events: unknown[]): GcpAgentChatMessage[] {
  const messages: GcpAgentChatMessage[] = [];
  let pending: A2uiMessage[] | undefined;
  for (const event of events) {
    const role = roleOf(event);
    const parts = partsOf(event);
    const toolSurface = a2uiFromParts(parts);
    if (toolSurface) {
      pending = toolSurface;
    }
    const text = textFromParts(parts);
    if (!text || isHandoff(text)) {
      continue;
    }
    if (role === "user") {
      messages.push({ role: "user", text, a2ui: [] });
      continue;
    }
    const asset = findAsset(text);
    const a2ui = pending ?? buildA2ui(text, `s_${messages.length}`, asset);
    pending = undefined;
    messages.push({ role: "agent", text: displayText(text, asset), a2ui });
  }
  const last = messages.at(-1);
  if (pending && last?.role === "agent") {
    last.a2ui = pending;
  }
  return messages;
}

export function turnFromAgentEvents(raw: string): { reply: string; a2ui: A2uiMessage[] } {
  const messages = messagesFromSessionEvents(jsonChunks(raw));
  const last = [...messages].reverse().find((message) => message.role === "agent");
  if (last) {
    return { reply: last.text, a2ui: last.a2ui };
  }
  return { reply: "", a2ui: [] };
}

export function sessionRecords(payload: unknown): { sessionId: string; updatedAt: string; userId: string | undefined }[] {
  const record = asRecord(payload);
  const sessions = record?.sessions;
  if (!Array.isArray(sessions)) {
    return [];
  }
  const parsed: { sessionId: string; updatedAt: string; userId: string | undefined }[] = [];
  for (const session of sessions) {
    const item = asRecord(session);
    if (!item) {
      continue;
    }
    const sessionId = sessionIdFromName(item);
    if (!sessionId) {
      continue;
    }
    const updated = item.updateTime ?? item.update_time;
    const owner = item.userId ?? item.user_id;
    parsed.push({
      sessionId,
      updatedAt: typeof updated === "string" ? updated : "",
      userId: typeof owner === "string" ? owner : undefined,
    });
  }
  return parsed;
}

export function sessionOwner(payload: unknown): string | undefined {
  const record = asRecord(unwrapOutput(payload));
  const owner = record?.userId ?? record?.user_id;
  return typeof owner === "string" ? owner : undefined;
}

export function eventsFromPayload(payload: unknown): unknown[] {
  const record = asRecord(payload);
  const events = record?.sessionEvents ?? record?.events;
  return Array.isArray(events) ? events : [];
}

export function nextPageToken(payload: unknown): string {
  const record = asRecord(payload);
  const token = record?.nextPageToken ?? record?.next_page_token;
  return typeof token === "string" ? token : "";
}

function assetFrom(assetId: string, kind: string, status: string): CampaignAsset | undefined {
  const normalizedKind = kind.toLowerCase();
  const normalizedStatus = status.toUpperCase();
  if (normalizedKind !== "image" && normalizedKind !== "video") {
    return undefined;
  }
  if (normalizedStatus !== "REVIEW" && normalizedStatus !== "GENERATING") {
    return undefined;
  }
  return { assetId, kind: normalizedKind, status: normalizedStatus };
}

function kindFrom(text: string): "image" | "video" | undefined {
  if (/\bvideo\b/i.test(text)) {
    return "video";
  }
  if (/\b(image|poster|still)\b/i.test(text)) {
    return "image";
  }
  return undefined;
}

function statusFrom(kind: "image" | "video", text: string): "REVIEW" | "GENERATING" {
  switch (kind) {
    case "image":
      return /generat/i.test(text) ? "GENERATING" : "REVIEW";
    case "video":
      if (/\bready\b/i.test(text) && !/waiting|started|generat/i.test(text)) {
        return "REVIEW";
      }
      return "GENERATING";
    default: {
      const unexpected: never = kind;
      return unexpected;
    }
  }
}

function roleOf(event: unknown): "user" | "agent" {
  const record = asRecord(unwrapOutput(event));
  const content = asRecord(record?.content);
  const author = typeof record?.author === "string" ? record.author : "";
  const role = typeof content?.role === "string" ? content.role : "";
  if (author === "user" || role === "user") {
    return "user";
  }
  return "agent";
}

function partsOf(event: unknown): unknown[] {
  const record = asRecord(unwrapOutput(event));
  const content = asRecord(record?.content);
  return Array.isArray(content?.parts) ? content.parts : [];
}

function textFromParts(parts: unknown[]): string {
  const texts: string[] = [];
  for (const part of parts) {
    const record = asRecord(part);
    if (!record || record.function_call || record.functionCall || record.function_response || record.functionResponse) {
      continue;
    }
    if (typeof record.text === "string") {
      texts.push(record.text);
    }
  }
  return texts.join("\n").trim();
}

function a2uiFromParts(parts: unknown[]): A2uiMessage[] | undefined {
  for (const part of parts) {
    const record = asRecord(part);
    const response = asRecord(record?.functionResponse) ?? asRecord(record?.function_response);
    if (!response || response.name !== "present_to_operator") {
      continue;
    }
    const payload = asRecord(response.response) ?? response;
    const nested = asRecord(payload.result);
    const candidate = isA2uiList(payload.a2ui) ? payload.a2ui : nested && isA2uiList(nested.a2ui) ? nested.a2ui : undefined;
    if (candidate) {
      return candidate;
    }
  }
  return undefined;
}

function isA2uiList(value: unknown): value is A2uiMessage[] {
  return Array.isArray(value) && value.every((item) => asRecord(item)?.version === "v0.9");
}

function isHandoff(text: string): boolean {
  return text.includes("transfer_to_agent") || text.includes("BEGIN_QUOTED_AGENT_CONTENT");
}

function sessionIdFromName(session: Record<string, unknown>): string | undefined {
  const direct = session.id ?? session.session_id ?? session.sessionId;
  if (typeof direct === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(direct)) {
    return direct;
  }
  const name = typeof session.name === "string" ? session.name : "";
  const id = name.split("/").at(-1) ?? "";
  return /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : undefined;
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
