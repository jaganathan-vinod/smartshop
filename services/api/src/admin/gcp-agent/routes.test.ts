import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SMARTSHOP_A2UI_CATALOG_ID } from "@smartshop/shared";
import { Hono } from "hono";
import { runWithClaims } from "../../auth.js";
import { replyFromAgentEvents, sessionIdFromPayload } from "./query.js";
import { registerAdminGcpAgentRoutes } from "./routes.js";
import { pickLatestAsset } from "./assets.js";
import { buildA2ui, displayText, findAsset, findAssetInValue, messagesFromSessionEvents, sessionRecords, turnFromAgentEvents } from "./surface.js";
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

  it("picks the newest stored still or video", () => {
    const asset = pickLatestAsset(
      [
        { name: "campaigns/asset_aaaaaaaaaaaa.png", updated: "2026-10-04T00:00:00Z" },
        { name: "videos/asset_bbbbbbbbbbbb/clip.mp4", updated: "2026-10-04T01:00:00Z" },
        { name: "campaigns/notes.txt", updated: "2026-10-04T02:00:00Z" },
      ],
      "image",
    );
    assert.deepEqual(asset, { assetId: "asset_aaaaaaaaaaaa", kind: "image", status: "REVIEW" });
  });

  it("builds an asset surface from the specialist line", () => {
    const asset = findAsset("Poster ready.\nASSET asset_889f315b5590 image REVIEW");
    assert.deepEqual(asset, { assetId: "asset_889f315b5590", kind: "image", status: "REVIEW" });
    const messages = buildA2ui("Poster ready.\nASSET asset_889f315b5590 image REVIEW", "main", asset);
    const components = componentList(messages[1]);
    assert.equal(components.some((item) => item.component === "Text"), false);
    assert.match(JSON.stringify(components), /"component":"Asset"/);
    assert.match(JSON.stringify(components), /"kind":"image"/);
  });

  it("keeps an image asset when the trace text says not a video", () => {
    const trace = JSON.stringify({
      actor: "marketing_agent",
      api: "Vertex AI Gemini generateContent",
      input: { guidance: "A stylish image showcasing socks. No text overlay. Not a video." },
      output: { httpStatus: 200, hasImage: true, assetId: "asset_8741a17229ba" },
    });
    const text = `The asset is waiting for review. ASSET asset_8741a17229ba image REVIEW TRACE ${trace}`;
    assert.equal(displayText(text, findAsset(text)), "The asset is waiting for review.");
    assert.deepEqual(findAssetInValue({ content: { parts: [{ text }] } }), {
      assetId: "asset_8741a17229ba",
      kind: "image",
      status: "REVIEW",
    });
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

  it("attaches an image card when the tool result is stored beside the reply", () => {
    const messages = messagesFromSessionEvents([
      { author: "user", content: { role: "user", parts: [{ text: "Create a coffee mug image" }] } },
      {
        author: "marketing_agent",
        content: {
          parts: [
            {
              functionResponse: {
                name: "create_campaign_image",
                response: {
                  assetId: "asset_889f315b5590",
                  status: "REVIEW",
                  gcsUri: "gs://smartshop-marketing/campaigns/asset_889f315b5590.png",
                },
              },
            },
          ],
        },
      },
      {
        author: "coordinator",
        content: { parts: [{ text: "Your coffee mug campaign image is ready and waiting for review!" }] },
      },
    ]);
    const card = messages.at(-1);
    assert.equal(card?.role, "agent");
    assert.match(JSON.stringify(card?.a2ui), /asset_889f315b5590/);
    assert.match(JSON.stringify(card?.a2ui), /"component":"Asset"/);
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
