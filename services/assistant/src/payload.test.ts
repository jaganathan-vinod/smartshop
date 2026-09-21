import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeInvokePayload } from "./payload.js";

describe("normalizeInvokePayload", () => {
  it("keeps the SPA invoke body", () => {
    const payload = normalizeInvokePayload({
      conversationId: "conv-abc12345",
      message: "i want to order keyboard",
    });
    assert.equal(payload.conversationId, "conv-abc12345");
    assert.equal(payload.message, "i want to order keyboard");
  });

  it("unwraps a JSON object that AgentCore stuffed into prompt", () => {
    const payload = normalizeInvokePayload({
      prompt: JSON.stringify({
        conversationId: "conv-abc12345",
        message: "mouse",
      }),
    });
    assert.equal(payload.conversationId, "conv-abc12345");
    assert.equal(payload.message, "mouse");
  });

  it("treats a plain prompt string as the user message", () => {
    assert.equal(normalizeInvokePayload({ prompt: "hello" }).message, "hello");
  });

  it("keeps prior turns for the model", () => {
    const payload = normalizeInvokePayload({
      conversationId: "conv-abc12345",
      message: "yes add to cart",
      history: [
        { role: "user", text: "mechanical keyboard" },
        { role: "assistant", text: "Here is a mechanical keyboard" },
      ],
    });
    assert.equal(payload.history?.length, 2);
  });
});
