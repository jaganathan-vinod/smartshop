import { SMARTSHOP_AGUI_ACTIVITY, type A2uiMessage } from "@smartshop/shared";
import { buildA2ui, findAsset } from "./surface.js";

export const A2UI_ACTIVITY_TYPE = SMARTSHOP_AGUI_ACTIVITY;

export type AguiEvent = Record<string, unknown> & { type: string };

type Specialist =
  | "delivery_agent"
  | "insights_agent"
  | "inventory_agent"
  | "standards_agent"
  | "marketing_agent";

export type TranslateState = {
  messageId?: string;
  sent: string;
  step?: string;
  specialist?: string;
  activitySent: boolean;
  lastText: string;
  messageCount: number;
};

export function createTranslateState(): TranslateState {
  return { sent: "", activitySent: false, lastText: "", messageCount: 0 };
}

export function createNdjsonReader(): { push(chunk: string): unknown[]; flush(): unknown[] } {
  let buffer = "";
  return {
    push(chunk: string): unknown[] {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      return parseLines(lines);
    },
    flush(): unknown[] {
      const rest = buffer.trim();
      buffer = "";
      if (!rest) {
        return [];
      }
      if (rest.startsWith("[") || rest.startsWith("{")) {
        try {
          const parsed = JSON.parse(rest) as unknown;
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          return parseLines(rest.split(/\r?\n/));
        }
      }
      return parseLines(rest.split(/\r?\n/));
    },
  };
}

export function encodeSse(event: AguiEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function runInput(body: unknown): { threadId: string; runId: string; text: string } | undefined {
  const record = asRecord(body);
  if (!record) {
    return undefined;
  }
  const messages = Array.isArray(record.messages) ? record.messages : [];
  let text = "";
  for (const message of messages) {
    const next = userText(message);
    if (next) {
      text = next;
    }
  }
  const threadId = typeof record.threadId === "string" && record.threadId.trim() ? record.threadId.trim() : "new";
  const runId = typeof record.runId === "string" && record.runId.trim() ? record.runId.trim() : crypto.randomUUID();
  return { threadId, runId, text: text.slice(0, 1000) };
}

export function translateAdkEvent(event: unknown, state: TranslateState, runId: string): AguiEvent[] {
  const events: AguiEvent[] = [];
  const record = asRecord(unwrap(event));
  const content = asRecord(record?.content);
  const role = typeof content?.role === "string" ? content.role : "";
  const author = typeof record?.author === "string" ? record.author : "";
  if (author === "user" || role === "user") {
    return events;
  }
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  for (const part of parts) {
    const call = functionCall(part);
    if (call?.name === "transfer_to_agent") {
      const agent = agentName(call.args);
      finishStep(state, events);
      const stepName = stepNameFor(agent);
      state.step = stepName;
      state.specialist = agent;
      events.push({ type: "STEP_STARTED", stepName });
    }
    const surface = a2uiFromResponse(part);
    if (surface && (hasInteractive(surface) || state.specialist === "inventory_agent")) {
      emitActivity(state, events, runId, surface);
    }
  }
  const text = textFromParts(parts);
  if (text && !isHandoff(text)) {
    emitText(state, events, runId, text);
  }
  return events;
}

export function finishTranslation(state: TranslateState, runId: string): AguiEvent[] {
  const events: AguiEvent[] = [];
  finishStep(state, events);
  finishMessage(state, events);
  const asset = findAsset(state.lastText);
  if (!state.activitySent && (asset || state.specialist === "inventory_agent") && state.lastText) {
    emitActivity(state, events, runId, buildA2ui(state.lastText, `s_${runId}`, asset));
  }
  return events;
}

function emitText(state: TranslateState, events: AguiEvent[], runId: string, text: string): void {
  if (state.sent && (text === state.sent || text.startsWith(state.sent))) {
    const delta = text.slice(state.sent.length);
    state.sent = text;
    state.lastText = text;
    if (!delta || !state.messageId) {
      return;
    }
    events.push({ type: "TEXT_MESSAGE_CONTENT", messageId: state.messageId, delta });
    return;
  }
  if (state.step) {
    finishStep(state, events);
  }
  finishMessage(state, events);
  state.messageCount += 1;
  state.messageId = `text-${runId}-${state.messageCount}`;
  state.sent = text;
  state.lastText = text;
  events.push({ type: "TEXT_MESSAGE_START", messageId: state.messageId, role: "assistant" });
  events.push({ type: "TEXT_MESSAGE_CONTENT", messageId: state.messageId, delta: text });
}

function emitActivity(state: TranslateState, events: AguiEvent[], runId: string, messages: A2uiMessage[]): void {
  if (state.activitySent) {
    return;
  }
  const surface = state.specialist === "inventory_agent" ? attachDecisions(messages) : messages;
  state.activitySent = true;
  events.push({
    type: "ACTIVITY_SNAPSHOT",
    messageId: `activity-${runId}`,
    activityType: A2UI_ACTIVITY_TYPE,
    content: { messages: surface },
  });
}

function hasInteractive(messages: A2uiMessage[]): boolean {
  for (const message of messages) {
    const update = asRecord(message.updateComponents);
    const components = update?.components;
    if (!Array.isArray(components)) {
      continue;
    }
    for (const component of components) {
      const name = asRecord(component)?.component;
      if (name === "Asset" || name === "Button" || name === "Card") {
        return true;
      }
    }
  }
  return false;
}

function attachDecisions(messages: A2uiMessage[]): A2uiMessage[] {
  return messages.map((message) => {
    const update = asRecord(message.updateComponents);
    const components = update?.components;
    if (!update || !Array.isArray(components)) {
      return message;
    }
    const next = components.map((item) => ({ ...(asRecord(item) ?? {}) }));
    const root = next.find((item) => item.id === "root");
    const children = Array.isArray(root?.children) ? [...root.children] : [];
    if (root && !children.includes("approve")) {
      children.push("approve", "reject");
      root.children = children;
    }
    next.push(
      { id: "approve-label", component: "Text", text: "Approve" },
      { id: "reject-label", component: "Text", text: "Reject" },
      {
        id: "approve",
        component: "Button",
        child: "approve-label",
        variant: "primary",
        action: { event: { name: "Approve the stock proposal" } },
      },
      {
        id: "reject",
        component: "Button",
        child: "reject-label",
        action: { event: { name: "Reject the stock proposal" } },
      },
    );
    return { ...message, updateComponents: { ...update, components: next } };
  });
}

function finishStep(state: TranslateState, events: AguiEvent[]): void {
  if (!state.step) {
    return;
  }
  events.push({ type: "STEP_FINISHED", stepName: state.step });
  state.step = undefined;
}

function finishMessage(state: TranslateState, events: AguiEvent[]): void {
  if (!state.messageId) {
    return;
  }
  events.push({ type: "TEXT_MESSAGE_END", messageId: state.messageId });
  state.messageId = undefined;
  state.sent = "";
}

function stepNameFor(agent: string): string {
  if (!isSpecialist(agent)) {
    return "Asking a specialist";
  }
  switch (agent) {
    case "delivery_agent":
      return "Asking the delivery agent";
    case "insights_agent":
      return "Asking the insights agent";
    case "inventory_agent":
      return "Asking the inventory agent";
    case "standards_agent":
      return "Asking the standards agent";
    case "marketing_agent":
      return "Asking the marketing agent";
    default: {
      const unexpected: never = agent;
      return unexpected;
    }
  }
}

function isSpecialist(agent: string): agent is Specialist {
  switch (agent) {
    case "delivery_agent":
    case "insights_agent":
    case "inventory_agent":
    case "standards_agent":
    case "marketing_agent":
      return true;
    default:
      return false;
  }
}

function functionCall(part: unknown): { name: string; args: unknown } | undefined {
  const record = asRecord(part);
  const call = asRecord(record?.functionCall) ?? asRecord(record?.function_call);
  if (!call || typeof call.name !== "string") {
    return undefined;
  }
  return { name: call.name, args: call.args };
}

function a2uiFromResponse(part: unknown): A2uiMessage[] | undefined {
  const record = asRecord(part);
  const response = asRecord(record?.functionResponse) ?? asRecord(record?.function_response);
  if (!response || response.name !== "present_to_operator") {
    return undefined;
  }
  const payload = asRecord(response.response) ?? response;
  const nested = asRecord(payload.result);
  const candidate = isA2uiList(payload.a2ui) ? payload.a2ui : nested && isA2uiList(nested.a2ui) ? nested.a2ui : undefined;
  return candidate;
}

function agentName(args: unknown): string {
  const record = asRecord(args);
  const name = record?.agent_name ?? record?.agentName;
  return typeof name === "string" ? name : "";
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

function isHandoff(text: string): boolean {
  return text.includes("transfer_to_agent") || text.includes("BEGIN_QUOTED_AGENT_CONTENT");
}

function userText(message: unknown): string {
  const record = asRecord(message);
  if (!record || record.role !== "user") {
    return "";
  }
  if (typeof record.content === "string") {
    return record.content.trim();
  }
  if (!Array.isArray(record.content)) {
    return "";
  }
  return record.content
    .map((part) => {
      const item = asRecord(part);
      return typeof item?.text === "string" ? item.text : "";
    })
    .join("")
    .trim();
}

function isA2uiList(value: unknown): value is A2uiMessage[] {
  return Array.isArray(value) && value.every((item) => asRecord(item)?.version === "v0.9");
}

function parseLines(lines: string[]): unknown[] {
  const events: unknown[] = [];
  for (const line of lines) {
    const data = line.startsWith("data:") ? line.slice(5).trim() : line.trim();
    if (!data || data === "[DONE]") {
      continue;
    }
    try {
      events.push(JSON.parse(data) as unknown);
    } catch {
      continue;
    }
  }
  return events;
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
