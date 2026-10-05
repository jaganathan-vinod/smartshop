const STORE_PLAN =
  /\b(?:store planning|site planning|candidate address|candidates?|competitors?|open a store|new store|stores near)\b/i;
const PLAN_A_STORE = /\bplan\b[^.\n]{0,48}\b(?:store|stores|site|address|competitor|competitors)\b/i;

export function isStorePlanQuestion(text: string): boolean {
  return STORE_PLAN.test(text) || PLAN_A_STORE.test(text);
}

export function planningRequest(text: string): string {
  if (!/\bplan\b/i.test(text)) {
    return text;
  }
  const at = text.match(/\bat\s+(.+)$/i)?.[1]?.trim();
  return at && at.length >= 3 ? at : text;
}
