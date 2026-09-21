import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Hono } from "hono";
import { runWithClaims } from "../auth.js";
import { denyUnlessAdmin } from "./guard.js";
import { setAdminGroupLookupForTests } from "./groups.js";

function app() {
  const hono = new Hono();
  hono.get("/check", async (c) => {
    const denied = await denyUnlessAdmin(c);
    if (denied) {
      return denied;
    }
    return c.json({ ok: true });
  });
  return hono;
}

describe("denyUnlessAdmin", () => {
  it("allows an admin after Cognito group lookup when JWT claims omit groups", async () => {
    setAdminGroupLookupForTests(async () => ["admin"]);
    try {
      const response = await runWithClaims({ sub: "admin-1", username: "a@example.com", groups: [] }, () =>
        app().request("http://localhost/check"),
      );
      assert.equal(response.status, 200);
    } finally {
      setAdminGroupLookupForTests(null);
    }
  });

  it("still rejects a customer when lookup returns no admin group", async () => {
    setAdminGroupLookupForTests(async () => []);
    try {
      const response = await runWithClaims({ sub: "user-a", groups: [] }, () =>
        app().request("http://localhost/check"),
      );
      assert.equal(response.status, 403);
    } finally {
      setAdminGroupLookupForTests(null);
    }
  });
});
