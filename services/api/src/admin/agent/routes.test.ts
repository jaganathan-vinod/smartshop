import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Hono } from "hono";
import { runWithClaims } from "../../auth.js";
import { registerAdminAgentRoutes } from "./routes.js";

const LINE = '{"type":"FeatureCollection","features":[]}';

function app() {
  const hono = new Hono();
  registerAdminAgentRoutes(hono, {
    plan: async () => ({
      reply: "Nearest current store: SmartShop Orchard.",
      planId: "plan_test",
      routeGeojson: LINE,
    }),
  });
  return hono;
}

describe("admin agent sessions", () => {
  it("rejects a customer", async () => {
    const response = await runWithClaims({ sub: "user-a", groups: [] }, () =>
      app().request("http://localhost/v1/admin/agent/sessions", { method: "POST" }),
    );
    assert.equal(response.status, 403);
  });

  it("plans a candidate address for an admin", async () => {
    const hono = app();
    await runWithClaims({ sub: "admin-1", groups: ["admin"] }, async () => {
      const created = await hono.request("http://localhost/v1/admin/agent/sessions", {
        method: "POST",
      });
      assert.equal(created.status, 200);
      const session = (await created.json()) as { sessionId: string };
      const message = await hono.request(
        `http://localhost/v1/admin/agent/sessions/${session.sessionId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "391 Orchard Rd, Singapore" }),
        },
      );
      assert.equal(message.status, 200);
      const turn = (await message.json()) as { reply: string; routeGeojson: string };
      assert.match(turn.reply, /SmartShop Orchard/);
      assert.equal(turn.routeGeojson, LINE);
      const loaded = await hono.request(
        `http://localhost/v1/admin/agent/sessions/${session.sessionId}`,
      );
      assert.equal(loaded.status, 200);
    });
  });
});
