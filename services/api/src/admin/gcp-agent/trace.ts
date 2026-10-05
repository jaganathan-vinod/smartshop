import type { GcpAgentTraceEntry } from "@smartshop/shared";

const TRACE_NAME = "smartshop.trace";
const STREAM_QUERY = "Vertex AI Agent Engine streamQuery";

export function traceEventName(): string {
  return TRACE_NAME;
}

export function openingTrace(sessionId: string, message: string): GcpAgentTraceEntry[] {
  return [
    {
      actor: "portal",
      kind: "google_api",
      name: STREAM_QUERY,
      detail: "async_stream_query",
      input: { sessionId, message },
    },
    {
      actor: "user",
      kind: "coordinator_input",
      name: "coordinator",
      input: message,
    },
  ];
}

export function traceFromEvents(events: unknown[], sessionId = ""): GcpAgentTraceEntry[] {
  const entries: GcpAgentTraceEntry[] = [];
  const open: { name: string; id?: string; index: number }[] = [];
  for (const event of events) {
    collectEvent(event, entries, open, sessionId, 0);
  }
  return entries;
}

export function liveTraceFromEvent(event: unknown): GcpAgentTraceEntry[] {
  return traceFromEvents([event]).filter((entry) => entry.kind !== "coordinator_input" && entry.name !== STREAM_QUERY);
}

function collectEvent(
  event: unknown,
  entries: GcpAgentTraceEntry[],
  open: { name: string; id?: string; index: number }[],
  sessionId: string,
  depth: number,
): void {
  if (depth > 4) {
    return;
  }
  const record = asRecord(unwrap(event));
  if (!record) {
    return;
  }
  const author = typeof record.author === "string" && record.author ? record.author : "coordinator";
  const content = asRecord(record.content);
  const role = typeof content?.role === "string" ? content.role : "";
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  for (const part of parts) {
    const call = functionCall(part);
    if (call) {
      const classified = classifyCall(call.name, call.args);
      entries.push({
        actor: author,
        kind: classified.kind,
        name: classified.name,
        detail: classified.detail,
        input: compact(call.args),
      });
      open.push({ name: call.name, id: call.id, index: entries.length - 1 });
      continue;
    }
    const response = functionResponse(part);
    if (response) {
      const match = takeOpen(open, response.name, response.id);
      const output = compact(response.response);
      if (match) {
        const current = entries[match.index];
        if (current) {
          current.output = output;
        }
      } else {
        const classified = classifyCall(response.name, undefined);
        entries.push({
          actor: author,
          kind: classified.kind,
          name: classified.name,
          detail: classified.detail,
          output,
        });
      }
      for (const nested of nestedEvents(response.response)) {
        collectEvent(nested, entries, open, sessionId, depth + 1);
      }
      appendApiTraces(entries, response.response);
      continue;
    }
    const text = textOf(part);
    if (!text || isHandoff(text)) {
      continue;
    }
    if (author === "user" || role === "user") {
      entries.push({
        actor: "portal",
        kind: "google_api",
        name: STREAM_QUERY,
        detail: "async_stream_query",
        input: sessionId ? { sessionId, message: text } : { message: text },
      });
      entries.push({ actor: "user", kind: "coordinator_input", name: "coordinator", input: text });
      continue;
    }
    const visible = text.replace(/^TRACE\s+\{.*\}\s*$/gm, "").trim();
    if (visible) {
      entries.push({ actor: author, kind: "output", name: author, output: visible });
    }
    appendApiTraces(entries, text);
  }
}

export function coordinatorPrompts(entries: GcpAgentTraceEntry[]): string[] {
  return entries.flatMap((entry) => (entry.kind === "coordinator_input" && typeof entry.input === "string" ? [entry.input] : []));
}

export function assetIdsInTrace(entries: GcpAgentTraceEntry[]): string[] {
  const found = new Set<string>();
  for (const match of JSON.stringify(entries).matchAll(/asset_[a-f0-9]{12}/gi)) {
    found.add(match[0]);
  }
  return [...found];
}

export function needsMarketingDetail(entries: GcpAgentTraceEntry[]): boolean {
  const called = entries.some((entry) => entry.kind === "agent_call" && entry.name === "marketing_agent");
  const recorded = entries.some((entry) => entry.actor === "marketing_agent" && entry.kind === "google_api");
  return called && !recorded;
}

export function appendStoredCalls(entries: GcpAgentTraceEntry[], calls: unknown[]): GcpAgentTraceEntry[] {
  const next = [...entries];
  const seen = new Set(next.filter((entry) => entry.kind === "google_api").map(traceKey));
  for (const entry of entriesFromStoredCalls(calls)) {
    const key = traceKey(entry);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    next.push(entry);
  }
  return next;
}

export function storedCallMatches(call: unknown, prompts: string[]): boolean {
  const record = asRecord(call);
  const haystack = JSON.stringify(record?.input ?? "").toLowerCase();
  return prompts.some((prompt) => {
    const needle = prompt.trim().toLowerCase();
    return needle.length >= 24 && haystack.includes(needle.slice(0, 80));
  });
}

function classifyCall(name: string, args: unknown): { kind: GcpAgentTraceEntry["kind"]; name: string; detail?: string } {
  if (name === "transfer_to_agent") {
    const agent = agentName(args);
    return { kind: "agent_call", name: agent || "specialist", detail: "transfer_to_agent" };
  }
  const api = googleApi(name);
  if (api) {
    return { kind: "google_api", name: api.api, detail: api.service };
  }
  return { kind: "tool", name };
}

function googleApi(name: string): { api: string; service: string } | undefined {
  switch (name) {
    case "geocode_address":
      return { api: "Google Maps Geocoding", service: "https://maps.googleapis.com/maps/api/geocode/json" };
    case "search_nearby_grocers":
      return { api: "Google Places searchNearby", service: "https://places.googleapis.com/v1/places:searchNearby" };
    case "drive_duration":
      return { api: "Google Routes computeRoutes", service: "https://routes.googleapis.com/directions/v2:computeRoutes" };
    case "query_read_only":
      return { api: "Google BigQuery query", service: "bigquery.googleapis.com" };
    case "search_standards":
      return { api: "Google Drive files.list and Cloud Storage", service: "www.googleapis.com/drive/v3" };
    case "create_campaign_image":
      return { api: "Vertex AI Gemini generateContent", service: "aiplatform.googleapis.com generateContent" };
    case "start_campaign_video":
      return { api: "Vertex AI Veo predictLongRunning", service: "aiplatform.googleapis.com predictLongRunning" };
    default:
      return undefined;
  }
}

function agentName(args: unknown): string {
  const record = asRecord(args);
  const name = record?.agent_name ?? record?.agentName;
  return typeof name === "string" ? name : "";
}

function functionCall(part: unknown): { id?: string; name: string; args: unknown } | undefined {
  const record = asRecord(part);
  const call = asRecord(record?.functionCall) ?? asRecord(record?.function_call);
  if (!call || typeof call.name !== "string") {
    return undefined;
  }
  const id = typeof call.id === "string" ? call.id : undefined;
  return { id, name: call.name, args: call.args };
}

function functionResponse(part: unknown): { id?: string; name: string; response: unknown } | undefined {
  const record = asRecord(part);
  const response = asRecord(record?.functionResponse) ?? asRecord(record?.function_response);
  if (!response || typeof response.name !== "string") {
    return undefined;
  }
  const id = typeof response.id === "string" ? response.id : undefined;
  return { id, name: response.name, response: response.response ?? response };
}

function takeOpen(
  open: { name: string; id?: string; index: number }[],
  name: string,
  id: string | undefined,
): { name: string; id?: string; index: number } | undefined {
  for (let index = open.length - 1; index >= 0; index -= 1) {
    const candidate = open[index];
    if (!candidate) {
      continue;
    }
    if ((id && candidate.id === id) || candidate.name === name) {
      open.splice(index, 1);
      return candidate;
    }
  }
  return undefined;
}

function nestedEvents(value: unknown): unknown[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
      return [];
    }
    try {
      return nestedEvents(JSON.parse(trimmed) as unknown);
    } catch {
      return [];
    }
  }
  if (Array.isArray(value)) {
    return value.every((item) => asRecord(item)?.content) ? value : [];
  }
  const record = asRecord(value);
  if (!record) {
    return [];
  }
  if (Array.isArray(record.events)) {
    return record.events;
  }
  if (Array.isArray(record.sessionEvents)) {
    return record.sessionEvents;
  }
  return [];
}

function appendApiTraces(entries: GcpAgentTraceEntry[], value: unknown): void {
  const seen = new Set(entries.filter((entry) => entry.kind === "google_api").map(traceKey));
  for (const entry of entriesFromStoredCalls(collectTraceObjects(value, 0))) {
    const key = traceKey(entry);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    entries.push(entry);
  }
}

function entriesFromStoredCalls(calls: unknown[]): GcpAgentTraceEntry[] {
  const entries: GcpAgentTraceEntry[] = [];
  for (const call of calls) {
    const record = asRecord(call);
    if (!record || typeof record.api !== "string") {
      continue;
    }
    entries.push({
      actor: typeof record.actor === "string" && record.actor ? record.actor : "marketing_agent",
      kind: "google_api",
      name: record.api,
      detail: typeof record.service === "string" ? record.service : undefined,
      input: compact(record.input),
      output: compact(record.output),
    });
  }
  return entries;
}

function collectTraceObjects(value: unknown, depth: number): unknown[] {
  if (depth > 6) {
    return [];
  }
  if (typeof value === "string") {
    const found: unknown[] = [];
    for (const match of value.matchAll(/^TRACE\s+(\{.*\})\s*$/gm)) {
      try {
        found.push(JSON.parse(match[1] ?? "") as unknown);
      } catch {
        continue;
      }
    }
    return found;
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectTraceObjects(item, depth + 1));
  }
  const record = asRecord(value);
  if (!record) {
    return [];
  }
  const calls = record.apiTrace ?? record.calls;
  if (Array.isArray(calls) && calls.every((item) => asRecord(item)?.api)) {
    return calls;
  }
  return Object.values(record).flatMap((item) => collectTraceObjects(item, depth + 1));
}

function traceKey(entry: GcpAgentTraceEntry): string {
  return `${entry.name}\n${JSON.stringify(entry.input)}`;
}

function textOf(part: unknown): string {
  const record = asRecord(part);
  if (!record || record.functionCall || record.function_call || record.functionResponse || record.function_response) {
    return "";
  }
  return typeof record.text === "string" ? record.text.trim() : "";
}

function isHandoff(text: string): boolean {
  return text.includes("transfer_to_agent") || text.includes("BEGIN_QUOTED_AGENT_CONTENT");
}

function compact(value: unknown, depth = 0): unknown {
  if (depth > 6) {
    return "…";
  }
  if (typeof value === "string") {
    return value.length > 4000 ? `${value.slice(0, 4000)}…` : value;
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 40).map((item) => compact(item, depth + 1));
  }
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) {
    next[key] = /(?:api)?key|token|authorization|secret|password/i.test(key) ? "••••" : compact(item, depth + 1);
  }
  return next;
}

function unwrap(value: unknown): unknown {
  const record = asRecord(value);
  return record && "output" in record ? record.output : value;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}
