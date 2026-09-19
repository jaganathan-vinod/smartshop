import type { Hono } from "hono";
import { currentClaims } from "../auth.js";
import { jsonError } from "../http.js";
import { upsertMe } from "./store.js";

export function registerIdentityRoutes(app: Hono): void {
  app.get("/v1/me", async (c) => {
    const claims = currentClaims();
    if (!claims) {
      return jsonError(c, 401, "UNAUTHENTICATED", "Sign in required");
    }
    try {
      const user = await upsertMe(claims);
      return c.json({
        userId: user.userId,
        email: user.email,
        displayName: user.displayName,
        isPremium: user.isPremium,
      });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "PROFILE_INCOMPLETE") {
        return jsonError(
          c,
          400,
          "PROFILE_INCOMPLETE",
          "Token is missing email or name",
        );
      }
      throw error;
    }
  });
}
