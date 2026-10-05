const STORE_PLAN =
  /\b(?:store planning|site planning|candidate address|candidates?|competitors?|open a store|new store|stores near)\b/i;
const PLAN_A_STORE = /\bplan\b[^.\n]{0,48}\b(?:store|stores|site|address|competitor|competitors)\b/i;
const PLANNING_AGENT = /\bplanning agent\b/i;
const FASTEST_PATH = /\b(?:fastest|shortest)\b[^.\n]{0,48}\b(?:delivery|route|path)\b/i;
const DELIVERY_PATH = /\bdelivery\s+path\b/i;
const NAMED_DRIVE = /\bfrom\b[^.\n]{0,80}\bto\b/i;

export function isStorePlanQuestion(text: string): boolean {
  const sitePlan = STORE_PLAN.test(text) || PLAN_A_STORE.test(text);
  if (NAMED_DRIVE.test(text) && !sitePlan && !PLANNING_AGENT.test(text)) {
    return false;
  }
  return sitePlan || PLANNING_AGENT.test(text) || FASTEST_PATH.test(text) || DELIVERY_PATH.test(text);
}

export function planningRequest(text: string, earlier = ""): string {
  return planningPlace(text) ?? planningPlace(earlier) ?? text;
}

export function hasPlanningTarget(text: string, earlier = ""): boolean {
  if (planningPlace(text) ?? planningPlace(earlier)) {
    return true;
  }
  return STORE_PLAN.test(text) || PLAN_A_STORE.test(text);
}

export function earlierUserText(body: unknown, latest: string): string {
  const record = body && typeof body === "object" ? (body as { messages?: unknown }) : undefined;
  const messages = Array.isArray(record?.messages) ? record.messages : [];
  const texts = messages.map(userQuestion).filter((text) => text.length > 0);
  if (texts.at(-1) === latest) {
    texts.pop();
  }
  return texts.join("\n");
}

function userQuestion(message: unknown): string {
  if (!message || typeof message !== "object") {
    return "";
  }
  const record = message as { role?: unknown; content?: unknown };
  if (record.role !== "user") {
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
      if (!part || typeof part !== "object") {
        return "";
      }
      const text = (part as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .join("")
    .trim();
}

export function planningPlace(text: string): string | undefined {
  const destination = text.match(/\bto\s+([^?.!\n]+)/i)?.[1];
  const located = cleanPlace(destination);
  if (located) {
    return located;
  }
  if (!/\bplan\b/i.test(text)) {
    return undefined;
  }
  return cleanPlace(text.match(/\bat\s+([^?.!\n]+)/i)?.[1]);
}

function cleanPlace(value: string | undefined): string | undefined {
  const cleaned = value?.replace(/[?.!,]+$/g, "").trim() ?? "";
  if (cleaned.length < 3 || /\b(?:planning agent|agent)\b/i.test(cleaned)) {
    return undefined;
  }
  return cleaned;
}
