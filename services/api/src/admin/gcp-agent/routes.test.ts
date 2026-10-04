import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SMARTSHOP_A2UI_CATALOG_ID } from "@smartshop/shared";
import { Hono } from "hono";
import { runWithClaims } from "../../auth.js";
import { replyFromAgentEvents, sessionIdFromPayload } from "./query.js";
import { registerAdminGcpAgentRoutes } from "./routes.js";
import { buildA2ui, findAsset, messagesFromSessionEvents, sessionRecords, turnFromAgentEvents } from "./surface.js";
import type { A2uiMessage } from "@smartshop/shared";

describe("gcp agent replies", () => {
  it("keeps the last text answer", () => {
    const raw = [
      JSON.stringify({ content: { parts: [{ text: "Looking up the route." }] } }),
      JSON.stringify({ content: { parts: [{ function_call: { name: "geocode" } }, { text: "ignore" }] } }),
      JSON.stringify({ output: { content: { parts: [{ text: "The drive is 12 minutes." }] } } }),
    ].join("\n");
    assert.equal(replyFromAgentEvents(raw), "The drive is 12 minutes.");
    const turn = turnFromAgentEvents(raw);
    assert.equal(turn.reply, "The drive is 12 minutes.");
    assert.equal(createdCatalog(turn.a2ui[0]), SMARTSHOP_A2UI_CATALOG_ID);
  });

  it("reads a session id from the create response", () => {
    assert.equal(sessionIdFromPayload({ output: { id: "sess_1" } }), "sess_1");
  });

  it("builds an asset surface from the specialist line", () => {
    const asset = findAsset("Poster ready.\nASSET asset_889f315b5590 image REVIEW");
    assert.deepEqual(asset, { assetId: "asset_889f315b5590", kind: "image", status: "REVIEW" });
    const messages = buildA2ui("Poster ready.\nASSET asset_889f315b5590 image REVIEW", "main", asset);
    const components = componentList(messages[1]);
    assert.equal(components.find((item) => item.component === "Text")?.text, "Poster ready.");
    assert.equal(components.some((item) => item.component === "Asset"), true);
  });

  it("replays user text and a tool surface", () => {
    const surface = buildA2ui("The drive is 12 minutes.", "main", undefined);
    const messages = messagesFromSessionEvents([
      { author: "user", content: { role: "user", parts: [{ text: "How long is the drive?" }] } },
      {
        author: "coordinator",
        content: {
          parts: [
            {
              functionResponse: {
                name: "present_to_operator",
                response: { a2ui: surface, summary: "The drive is 12 minutes." },
              },
            },
            { text: "The drive is 12 minutes." },
          ],
        },
      },
    ]);
    assert.equal(messages[0]?.text, "How long is the drive?");
    assert.equal(messages[1]?.a2ui, surface);
  });

  it("reads session ids from the list payload", () => {
    const records = sessionRecords({
      sessions: [
        {
          name: "projects/p/locations/us-central1/reasoningEngines/1/sessions/sess_2",
          userId: "admin-1",
          updateTime: "2026-10-04T00:00:00Z",
        },
      ],
    });
    assert.deepEqual(records, [{ sessionId: "sess_2", updatedAt: "2026-10-04T00:00:00Z", userId: "admin-1" }]);
  });
});

describe("admin gcp agent messages", () => {
  it("rejects a customer", async () => {
    const hono = new Hono();
    registerAdminGcpAgentRoutes(hono, {
      ask: async () => ({ reply: "unused", sessionId: "sess_1", a2ui: [] }),
    });
    const response = await runWithClaims({ sub: "user-a", groups: [] }, () =>
      hono.request("http://localhost/v1/admin/gcp-agents/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Where is the nearest store?" }),
      }),
    );
    assert.equal(response.status, 403);
  });

  it("returns the agent reply for an admin", async () => {
    const hono = new Hono();
    const surface = buildA2ui("The nearest store is Orchard.", "main", undefined);
    registerAdminGcpAgentRoutes(hono, {
      ask: async (userId, text, sessionId) => {
        assert.equal(userId, "admin-1");
        assert.equal(text, "Where is the nearest store?");
        assert.equal(sessionId, undefined);
        return { reply: "The nearest store is Orchard.", sessionId: "sess_9", a2ui: surface };
      },
    });
    const response = await runWithClaims({ sub: "admin-1", groups: ["admin"] }, () =>
      hono.request("http://localhost/v1/admin/gcp-agents/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Where is the nearest store?" }),
      }),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      reply: "The nearest store is Orchard.",
      sessionId: "sess_9",
      a2ui: surface,
    });
  });

  it("lists sessions and replays one", async () => {
    const hono = new Hono();
    registerAdminGcpAgentRoutes(hono, {
      listSessions: async (userId) => {
        assert.equal(userId, "admin-1");
        return [{ sessionId: "sess_9", title: "How long is the drive?", updatedAt: "2026-10-04T00:00:00Z" }];
      },
      getSession: async (userId, sessionId) => {
        assert.equal(userId, "admin-1");
        assert.equal(sessionId, "sess_9");
        return {
          sessionId,
          messages: [{ role: "user", text: "How long is the drive?", a2ui: [] }],
        };
      },
    });
    const listed = await runWithClaims({ sub: "admin-1", groups: ["admin"] }, () =>
      hono.request("http://localhost/v1/admin/gcp-agents/sessions"),
    );
    assert.equal(listed.status, 200);
    const detail = await runWithClaims({ sub: "admin-1", groups: ["admin"] }, () =>
      hono.request("http://localhost/v1/admin/gcp-agents/sessions/sess_9"),
    );
    assert.equal(detail.status, 200);
    const missing = await runWithClaims({ sub: "admin-1", groups: ["admin"] }, () =>
      hono.request("http://localhost/v1/admin/gcp-agents/sessions/bad id"),
    );
    assert.equal(missing.status, 400);
  });

  it("returns asset bytes for an admin", async () => {
    const hono = new Hono();
    registerAdminGcpAgentRoutes(hono, {
      loadAsset: async (assetId) => {
        if (assetId === "asset_000000000000") {
          return undefined;
        }
        assert.equal(assetId, "asset_889f315b5590");
        return { bytes: Uint8Array.from([1, 2, 3]), contentType: "image/png" };
      },
    });
    const response = await runWithClaims({ sub: "admin-1", groups: ["admin"] }, () =>
      hono.request("http://localhost/v1/admin/gcp-agents/assets/asset_889f315b5590"),
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "image/png");
    const pending = await runWithClaims({ sub: "admin-1", groups: ["admin"] }, () =>
      hono.request("http://localhost/v1/admin/gcp-agents/assets/asset_000000000000"),
    );
    assert.equal(pending.status, 404);
  });
});

function createdCatalog(message: A2uiMessage | undefined): string | undefined {
  const record = message as { createSurface?: { catalogId?: string } } | undefined;
  return record?.createSurface?.catalogId;
}

function componentList(message: A2uiMessage | undefined): { component: string; text?: string }[] {
  const record = message as { updateComponents?: { components?: { component: string; text?: string }[] } } | undefined;
  return record?.updateComponents?.components ?? [];
}
