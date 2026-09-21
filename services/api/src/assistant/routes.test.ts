import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Hono } from "hono";
import { runWithClaims, runWithInternalCaller } from "../auth.js";
import { registerAssistantRoutes } from "./routes.js";

function app() {
  const hono = new Hono();
  registerAssistantRoutes(hono);
  return hono;
}

describe("internal assistant route authz", () => {
  it("rejects a customer JWT", async () => {
    const response = await runWithClaims({ sub: "user-a", groups: [] }, () =>
      app().request("http://localhost/v1/internal/assistant/tools", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-smartshop-user-id": "user-aaaaaaaa",
        },
        body: JSON.stringify({
          conversationId: "conv-abc12345",
          tool: "get_cart",
          args: {},
        }),
      }),
    );
    assert.equal(response.status, 403);
    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, "FORBIDDEN");
  });

  it("rejects a missing IAM caller", async () => {
    const response = await runWithClaims(null, () =>
      app().request("http://localhost/v1/internal/assistant/tools", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: "conv-abc12345",
          tool: "get_cart",
        }),
      }),
    );
    assert.equal(response.status, 403);
  });

  it("rejects IAM without X-SmartShop-User-Id", async () => {
    const response = await runWithInternalCaller("arn:aws:iam::1:role/runtime", () =>
      app().request("http://localhost/v1/internal/assistant/tools", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: "conv-abc12345",
          tool: "get_cart",
        }),
      }),
    );
    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, "USER_ID_REQUIRED");
  });
});
