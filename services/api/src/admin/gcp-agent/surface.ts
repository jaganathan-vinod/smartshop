import { SMARTSHOP_A2UI_CATALOG_ID, type A2uiMessage, type GcpAgentChatMessage } from "@smartshop/shared";

const ASSET_LINE = /ASSET\s+(asset_[a-f0-9]{12})\s+(image|video)\s+(REVIEW|GENERATING)/i;
const ASSET_ID = /\b(asset_[a-f0-9]{12})\b/i;

export type CampaignAsset = {
  assetId: string;
  kind: "image" | "video";
  status: "REVIEW" | "GENERATING";
};

export function findAsset(text: string): CampaignAsset | undefined {
  const lines = [...text.matchAll(new RegExp(ASSET_LINE, "gi"))];
  const line = lines.at(-1);
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

export function findAssetInValue(value: unknown): CampaignAsset | undefined {
  return walkExplicitAsset(value, 0) ?? walkForAsset(value, 0);
}

export function visibleReply(text: string): string {
  return stripTraceObjects(text)
    .replace(new RegExp(ASSET_LINE, "gi"), "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function cleanSurface(messages: A2uiMessage[], asset: CampaignAsset | undefined): A2uiMessage[] {
  let changed = false;
  const next = messages.map((message) => {
    const update = asRecord(message.updateComponents);
    const components = update?.components;
    if (!update || !Array.isArray(components)) {
      return message;
    }
    const cleaned = components.map((item) => cleanComponent(item, asset));
    if (cleaned.some((item, index) => item !== components[index])) {
      changed = true;
      return { ...message, updateComponents: { ...update, components: cleaned } };
    }
    return message;
  });
  return changed ? next : messages;
}

export function latestAsset(events: unknown[]): CampaignAsset | undefined {
  let found: CampaignAsset | undefined;
  for (const event of events) {
    const asset = findAssetInValue(event);
    if (asset) {
      found = asset;
    }
  }
  return found;
}

export function readA2ui(value: unknown): A2uiMessage[] | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) {
      return undefined;
    }
    try {
      return readA2ui(JSON.parse(trimmed) as unknown);
    } catch {
      return undefined;
    }
  }
  return isA2uiList(value) ? value : undefined;
}

export function displayText(text: string, asset: CampaignAsset | undefined): string {
  const stripped = visibleReply(text);
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
  const children = asset ? ["asset"] : ["summary"];
  const components: Record<string, unknown>[] = [{ id: "root", component: "Column", children }];
  if (!asset) {
    components.push({ id: "summary", component: "Text", text: displayText(text, asset), variant: "body" });
  }
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

export type StockProposal = {
  productId: string;
  delta: number;
};

export function stockProposal(text: string): StockProposal | undefined {
  if (!/awaiting approval|proposed the change|needs approval/i.test(text)) {
    return undefined;
  }
  const product = text.match(/product\s+['"]([^'"]+)['"]/i)?.[1] ?? text.match(/\b(prod-[a-z0-9-]+)\b/i)?.[1];
  const delta = text.match(/([+-]?\d+)\s+units/i)?.[1];
  if (!product || !delta || Number.isNaN(Number(delta))) {
    return undefined;
  }
  return { productId: product, delta: Number(delta) };
}

export function decisionSurface(proposal: StockProposal, surfaceId: string): A2uiMessage[] {
  const approve = `Approve adding ${proposal.delta} units to ${proposal.productId}`;
  const reject = `Reject adding ${proposal.delta} units to ${proposal.productId}`;
  return [
    {
      version: "v0.9",
      createSurface: { surfaceId, catalogId: SMARTSHOP_A2UI_CATALOG_ID },
    },
    {
      version: "v0.9",
      updateComponents: {
        surfaceId,
        components: [
          { id: "root", component: "Column", children: ["approve", "reject"] },
          { id: "approve-label", component: "Text", text: "Approve" },
          { id: "reject-label", component: "Text", text: "Reject" },
          {
            id: "approve",
            component: "Button",
            child: "approve-label",
            variant: "primary",
            action: { event: { name: approve } },
          },
          {
            id: "reject",
            component: "Button",
            child: "reject-label",
            action: { event: { name: reject } },
          },
        ],
      },
    },
  ];
}

export function messagesFromSessionEvents(events: unknown[]): GcpAgentChatMessage[] {
  const messages: GcpAgentChatMessage[] = [];
  let pending: A2uiMessage[] | undefined;
  let carried: CampaignAsset | undefined;
  let specialist = "";
  for (const event of events) {
    const role = roleOf(event);
    const parts = partsOf(event);
    const toolSurface = a2uiFromParts(parts);
    if (toolSurface) {
      pending = toolSurface;
    }
    const transferred = transferredSpecialist(event);
    if (transferred) {
      specialist = transferred;
    }
    const discovered = assetCreatedThisTurn(event, specialist);
    if (discovered) {
      carried = discovered;
    }
    const text = textFromParts(parts);
    if (!text || isHandoff(text)) {
      continue;
    }
    if (role === "user") {
      carried = undefined;
      pending = undefined;
      specialist = "";
      messages.push({ role: "user", text, a2ui: [] });
      continue;
    }
    const asset = carried;
    if (asset && text.replace(ASSET_LINE, "").trim() === "") {
      carried = asset;
      continue;
    }
    const proposal = stockProposal(displayText(text, asset));
    const base = surfaceForTurn(surfaceForReply(pending, text, `s_${messages.length}`, asset), asset);
    const a2ui = proposal && !surfaceHasButtons(base) ? decisionSurface(proposal, `s_${messages.length}`) : base;
    if (surfaceHasAsset(a2ui)) {
      carried = undefined;
    }
    pending = undefined;
    messages.push({ role: "agent", text: displayText(text, asset), a2ui });
  }
  const last = messages.at(-1);
  if (pending && last?.role === "agent" && (!carried || surfaceHasAsset(pending))) {
    last.a2ui = surfaceForTurn(pending, carried);
    if (surfaceHasAsset(pending)) {
      carried = undefined;
    }
  }
  if (carried && last?.role === "agent" && !surfaceHasAsset(last.a2ui)) {
    last.a2ui = buildA2ui(last.text, `s_${messages.length}`, carried);
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
  const cleaned = text.replace(/\b(?:not|no)\s+(?:a\s+)?videos?\b/gi, " ");
  const video = /\bvideos?\b/i.test(cleaned);
  const image = /\b(images?|poster|still)\b/i.test(cleaned);
  if (image && !video) {
    return "image";
  }
  if (video && !image) {
    return "video";
  }
  if (image) {
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
    const candidate = readA2ui(payload.a2ui) ?? (nested ? readA2ui(nested.a2ui) : undefined);
    if (candidate) {
      return candidate;
    }
  }
  return undefined;
}

function surfaceForReply(
  pending: A2uiMessage[] | undefined,
  text: string,
  surfaceId: string,
  asset: CampaignAsset | undefined,
): A2uiMessage[] {
  if (pending && (!asset || surfaceHasAsset(pending))) {
    return pending;
  }
  return buildA2ui(text, surfaceId, asset);
}

function surfaceHasButtons(messages: A2uiMessage[]): boolean {
  return messages.some((message) => {
    const update = asRecord(message.updateComponents);
    const components = update?.components;
    return Array.isArray(components) && components.some((component) => asRecord(component)?.component === "Button");
  });
}

function surfaceHasAsset(messages: A2uiMessage[]): boolean {
  for (const message of messages) {
    const update = asRecord(message.updateComponents);
    const components = update?.components;
    if (!Array.isArray(components)) {
      continue;
    }
    if (components.some((component) => asRecord(component)?.component === "Asset")) {
      return true;
    }
  }
  return false;
}

export function assetFromTurn(value: unknown): CampaignAsset | undefined {
  return walkExplicitAsset(withoutOperator(value), 0) ?? walkForAsset(withoutOperator(value), 0);
}

export function assetCreatedThisTurn(event: unknown, specialist: string): CampaignAsset | undefined {
  const author = authorOf(event);
  if (author !== "marketing_agent" && specialist !== "marketing_agent" && !hasMediaTool(event)) {
    return undefined;
  }
  return assetFromTurn(event);
}

export function surfaceForTurn(messages: A2uiMessage[], asset: CampaignAsset | undefined): A2uiMessage[] {
  const aligned = asset ? cleanSurface(messages, asset) : stripAssets(messages);
  return asset ? withoutAnswer(aligned) : aligned;
}

function authorOf(event: unknown): string {
  const record = asRecord(unwrapOutput(event));
  return typeof record?.author === "string" ? record.author : "";
}

function transferredSpecialist(event: unknown): string {
  return namedCall(event, "transfer_to_agent");
}

function hasMediaTool(event: unknown): boolean {
  return namedCall(event, "create_campaign_image") !== "" || namedCall(event, "start_campaign_video") !== "";
}

function namedCall(value: unknown, tool: string, depth = 0): string {
  if (depth > 8) {
    return "";
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = namedCall(item, tool, depth + 1);
      if (found) {
        return found;
      }
    }
    return "";
  }
  const record = asRecord(value);
  if (!record) {
    return "";
  }
  const response = asRecord(record.functionResponse) ?? asRecord(record.function_response);
  const call = asRecord(record.functionCall) ?? asRecord(record.function_call);
  const name = response?.name ?? call?.name;
  if (name === tool) {
    if (tool !== "transfer_to_agent") {
      return tool;
    }
    const args = asRecord(call?.args) ?? asRecord(response?.response);
    const agent = args?.agent_name ?? args?.agentName;
    return typeof agent === "string" ? agent : "";
  }
  for (const nested of Object.values(record)) {
    const found = namedCall(nested, tool, depth + 1);
    if (found) {
      return found;
    }
  }
  return "";
}

function withoutOperator(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => withoutOperator(item));
  }
  const record = asRecord(value);
  if (!record) {
    return value;
  }
  const response = asRecord(record.functionResponse) ?? asRecord(record.function_response);
  if (response?.name === "present_to_operator") {
    return undefined;
  }
  return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, withoutOperator(item)]));
}

function stripAssets(messages: A2uiMessage[]): A2uiMessage[] {
  let changed = false;
  const next = messages.map((message) => {
    const update = asRecord(message.updateComponents);
    const components = update?.components;
    if (!update || !Array.isArray(components) || !components.some((item) => asRecord(item)?.component === "Asset")) {
      return message;
    }
    changed = true;
    return {
      ...message,
      updateComponents: { ...update, components: components.filter((item) => asRecord(item)?.component !== "Asset") },
    };
  });
  return changed ? next : messages;
}

function withoutAnswer(messages: A2uiMessage[]): A2uiMessage[] {
  return messages.map((message) => {
    const update = asRecord(message.updateComponents);
    const components = update?.components;
    if (!update || !Array.isArray(components)) {
      return message;
    }
    const kept = components
      .filter((item) => asRecord(item)?.id !== "summary")
      .map((item) => {
        const record = asRecord(item);
        if (!record || !Array.isArray(record.children)) {
          return item;
        }
        return { ...record, children: record.children.filter((child) => child !== "summary") };
      });
    return { ...message, updateComponents: { ...update, components: kept } };
  });
}

function cleanComponent(item: unknown, asset: CampaignAsset | undefined): unknown {
  const record = asRecord(item);
  if (!record) {
    return item;
  }
  if (record.component === "Text" && typeof record.text === "string") {
    const text = visibleReply(record.text);
    return text === record.text ? item : { ...record, text };
  }
  if (record.component === "Asset" && asset && (record.kind !== asset.kind || record.assetId !== asset.assetId || record.status !== asset.status)) {
    return { ...record, assetId: asset.assetId, kind: asset.kind, status: asset.status };
  }
  return item;
}

function explicitAsset(text: string): CampaignAsset | undefined {
  const lines = [...text.matchAll(new RegExp(ASSET_LINE, "gi"))];
  const line = lines.at(-1);
  if (!line?.[1] || !line[2] || !line[3]) {
    return undefined;
  }
  return assetFrom(line[1], line[2], line[3]);
}

function walkExplicitAsset(value: unknown, depth: number): CampaignAsset | undefined {
  if (depth > 8 || (typeof value === "string" && value.length > 20_000)) {
    return undefined;
  }
  if (typeof value === "string") {
    return explicitAsset(value);
  }
  if (Array.isArray(value)) {
    let found: CampaignAsset | undefined;
    for (const item of value) {
      const next = walkExplicitAsset(item, depth + 1);
      if (next) {
        found = next;
      }
    }
    return found;
  }
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }
  let found: CampaignAsset | undefined;
  for (const nested of Object.values(record)) {
    const next = walkExplicitAsset(nested, depth + 1);
    if (next) {
      found = next;
    }
  }
  return found;
}

function stripTraceObjects(text: string): string {
  let result = "";
  let index = 0;
  while (index < text.length) {
    const at = text.indexOf("TRACE", index);
    if (at < 0) {
      result += text.slice(index);
      break;
    }
    const brace = text.indexOf("{", at);
    if (brace < 0 || brace - at > 12) {
      result += text.slice(index, at + 5);
      index = at + 5;
      continue;
    }
    const end = matchingBrace(text, brace);
    if (end < 0) {
      result += text.slice(index);
      break;
    }
    result += text.slice(index, at);
    index = end + 1;
  }
  return result;
}

function matchingBrace(text: string, open: number): number {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let cursor = open; cursor < text.length; cursor += 1) {
    const char = text[cursor];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (char === "\\") {
        escape = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return cursor;
      }
    }
  }
  return -1;
}

function walkForAsset(value: unknown, depth: number): CampaignAsset | undefined {
  if (depth > 8) {
    return undefined;
  }
  if (typeof value === "string") {
    if (value.length > 20_000) {
      return undefined;
    }
    const fromText = findAsset(value);
    if (fromText) {
      return fromText;
    }
    const trimmed = value.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
      return undefined;
    }
    try {
      return walkForAsset(JSON.parse(trimmed) as unknown, depth + 1);
    } catch {
      return undefined;
    }
  }
  if (Array.isArray(value)) {
    let found: CampaignAsset | undefined;
    for (const item of value) {
      const next = walkForAsset(item, depth + 1);
      if (next) {
        found = next;
      }
    }
    return found;
  }
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }
  let found = assetFromFields(record);
  for (const nested of Object.values(record)) {
    const next = walkForAsset(nested, depth + 1);
    if (next) {
      found = next;
    }
  }
  return found;
}

function assetFromFields(record: Record<string, unknown>): CampaignAsset | undefined {
  const rawId = record.assetId ?? record.asset_id;
  if (typeof rawId !== "string" || !/^asset_[a-f0-9]{12}$/i.test(rawId)) {
    return undefined;
  }
  const kind = kindFromFields(record);
  if (!kind) {
    return undefined;
  }
  return { assetId: rawId, kind, status: statusFromFields(record, kind) };
}

function kindFromFields(record: Record<string, unknown>): CampaignAsset["kind"] | undefined {
  const kind = typeof record.kind === "string" ? record.kind.toLowerCase() : "";
  if (kind === "image" || kind === "video") {
    return kind;
  }
  if (typeof record.gcsPrefix === "string" || typeof record.operationName === "string") {
    return "video";
  }
  const uri = typeof record.gcsUri === "string" ? record.gcsUri : "";
  if (uri.includes("/campaigns/") || uri.endsWith(".png")) {
    return "image";
  }
  return undefined;
}

function statusFromFields(record: Record<string, unknown>, kind: CampaignAsset["kind"]): CampaignAsset["status"] {
  const status = typeof record.status === "string" ? record.status.toUpperCase() : "";
  if (status === "REVIEW" || status === "GENERATING") {
    return status;
  }
  switch (kind) {
    case "image":
      return "REVIEW";
    case "video":
      return "GENERATING";
    default: {
      const unexpected: never = kind;
      return unexpected;
    }
  }
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
