import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runWithClaims } from "./auth.js";
import { logJson } from "./log.js";

describe("logJson", () => {
  it("includes userId and omits tokens", () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(String(args[0]));
    };
    try {
      runWithClaims({ sub: "user-a", groups: [] }, () => {
        logJson({
          msg: "request",
          route: "/v1/orders",
          status: 200,
          authorization: "Bearer secret",
        });
      });
    } finally {
      console.log = original;
    }
    const parsed = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>;
    assert.equal(parsed.userId, "user-a");
    assert.equal(parsed.route, "/v1/orders");
    assert.equal(parsed.authorization, undefined);
  });
});
