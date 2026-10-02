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
      trace: [
        {
          label: "Places searchNearby",
          api: "PLACES",
          method: "POST",
          url: "https://places.googleapis.com/v1/places:searchNearby",
          status: 200,
          request: "{}",
          response: "{\"places\":[]}",
        },
      ],
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
      const turn = (await message.json()) as {
        reply: string;
        routeGeojson: string;
        trace?: Array<{ label: string }>;
      };
      assert.match(turn.reply, /SmartShop Orchard/);
      assert.equal(turn.routeGeojson, LINE);
      assert.equal(turn.trace?.[0]?.label, "Places searchNearby");
      const loaded = await hono.request(
        `http://localhost/v1/admin/agent/sessions/${session.sessionId}`,
      );
      assert.equal(loaded.status, 200);
    });
  });

  it("returns a review image instead of a driving plan", async () => {
    const hono = new Hono();
    registerAdminAgentRoutes(hono, {
      plan: async () => {
        throw new Error("planning should not run");
      },
      image: async () => ({
        reply: "Image ready for review. Products: Ceramic Mug.",
        assetId: "asset_testimage01",
      }),
    });
    await runWithClaims({ sub: "admin-1", groups: ["admin"] }, async () => {
      const created = await hono.request("http://localhost/v1/admin/agent/sessions", {
        method: "POST",
      });
      const session = (await created.json()) as { sessionId: string };
      const message = await hono.request(
        `http://localhost/v1/admin/agent/sessions/${session.sessionId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "image of the Ceramic Mug on a wood table" }),
        },
      );
      assert.equal(message.status, 200);
      const turn = (await message.json()) as { reply: string; assetId?: string; routeGeojson?: string };
      assert.equal(turn.assetId, "asset_testimage01");
      assert.match(turn.reply, /Ceramic Mug/);
      assert.equal(turn.routeGeojson, undefined);
    });
  });
});
