import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Hono } from "hono";
import { runWithClaims } from "../../auth.js";
import { replyFromAgentEvents, sessionIdFromPayload } from "./query.js";
import { registerAdminGcpAgentRoutes } from "./routes.js";

describe("gcp agent replies", () => {
  it("keeps the last text answer", () => {
    const raw = [
      JSON.stringify({ content: { parts: [{ text: "Looking up the route." }] } }),
      JSON.stringify({ content: { parts: [{ function_call: { name: "geocode" } }, { text: "ignore" }] } }),
      JSON.stringify({ output: { content: { parts: [{ text: "The drive is 12 minutes." }] } } }),
    ].join("\n");
    assert.equal(replyFromAgentEvents(raw), "The drive is 12 minutes.");
  });

  it("reads a session id from the create response", () => {
    assert.equal(sessionIdFromPayload({ output: { id: "sess_1" } }), "sess_1");
  });
});

describe("admin gcp agent messages", () => {
  it("rejects a customer", async () => {
    const hono = new Hono();
    registerAdminGcpAgentRoutes(hono, {
      ask: async () => ({ reply: "unused", sessionId: "sess_1" }),
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
    registerAdminGcpAgentRoutes(hono, {
      ask: async (userId, text, sessionId) => {
        assert.equal(userId, "admin-1");
        assert.equal(text, "Where is the nearest store?");
        assert.equal(sessionId, undefined);
        return { reply: "The nearest store is Orchard.", sessionId: "sess_9" };
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
    });
  });
});
