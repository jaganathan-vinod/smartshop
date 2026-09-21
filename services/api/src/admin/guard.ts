import type { Context } from "hono";
import { currentClaims } from "../auth.js";
import { jsonError } from "../http.js";

export function denyUnlessAdmin(c: Context) {
  const claims = currentClaims();
  if (!claims) {
    return jsonError(c, 401, "UNAUTHENTICATED", "Sign in required");
  }
  if (!claims.groups.includes("admin")) {
    return jsonError(c, 403, "FORBIDDEN", "Admin role required");
  }
  return null;
}
