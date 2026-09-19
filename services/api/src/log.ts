import { currentClaims, currentRequestId } from "./auth.js";

const REDACTED_KEYS = new Set([
  "authorization",
  "token",
  "idtoken",
  "accesstoken",
  "refreshtoken",
  "password",
]);

export function logJson(fields: Record<string, unknown>): void {
  const payload: Record<string, unknown> = {
    requestId: currentRequestId(),
    userId: currentClaims()?.sub,
    ...fields,
  };
  for (const key of Object.keys(payload)) {
    if (REDACTED_KEYS.has(key.toLowerCase())) {
      delete payload[key];
    }
  }
  console.log(JSON.stringify(payload));
}
