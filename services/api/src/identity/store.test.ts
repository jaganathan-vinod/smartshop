import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveProfileFields } from "./store.js";

describe("resolveProfileFields", () => {
  it("uses the name claim when present", () => {
    assert.deepEqual(
      resolveProfileFields({ email: "a@example.com", name: "Ada" }),
      { email: "a@example.com", displayName: "Ada" },
    );
  });

  it("falls back to email when the token has no name", () => {
    assert.deepEqual(resolveProfileFields({ email: "a@example.com" }), {
      email: "a@example.com",
      displayName: "a@example.com",
    });
  });

  it("returns null without an email", () => {
    assert.equal(resolveProfileFields({ name: "Ada" }), null);
  });
});
