import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { upsertCartItemRequestSchema } from "@smartshop/shared";
import {
  claimsFromEvent,
  parseGroups,
  requireAdmin,
  requireUser,
  runWithClaims,
} from "./auth.js";
import { orderBelongsToCaller } from "./orders/store.js";

describe("parseGroups", () => {
  it("reads a Cognito string list and a JSON array", () => {
    assert.deepEqual(parseGroups("admin"), ["admin"]);
    assert.deepEqual(parseGroups(["admin", "other"]), ["admin", "other"]);
    assert.deepEqual(parseGroups('["admin"]'), ["admin"]);
    assert.deepEqual(parseGroups("[admin]"), ["admin"]);
  });
});

describe("requireAdmin", () => {
  it("rejects a customer JWT", () => {
    runWithClaims({ sub: "user-a", groups: [] }, () => {
      assert.throws(
        () => requireAdmin(),
        (error: unknown) =>
          error instanceof Error && "code" in error && error.code === "FORBIDDEN",
      );
    });
  });

  it("allows the admin group", () => {
    runWithClaims({ sub: "admin-1", groups: ["admin"] }, () => {
      assert.equal(requireAdmin().sub, "admin-1");
    });
  });
});

describe("orderBelongsToCaller", () => {
  it("hides another customer’s order", () => {
    assert.equal(orderBelongsToCaller("user-b", "user-a"), false);
    assert.equal(orderBelongsToCaller("user-a", "user-a"), true);
  });
});

describe("cart body cannot set userId", () => {
  it("strips a forged userId from upsert", () => {
    const parsed = upsertCartItemRequestSchema.parse({
      productId: "prod-ceramic-mug",
      quantity: 1,
      userId: "attacker",
    });
    assert.equal("userId" in parsed, false);
    assert.equal(parsed.productId, "prod-ceramic-mug");
  });
});

describe("claimsFromEvent", () => {
  it("reads HTTP API JWT claims", () => {
    const claims = claimsFromEvent({
      version: "2.0",
      routeKey: "POST /v1/admin/products",
      rawPath: "/v1/admin/products",
      requestContext: {
        authorizer: {
          jwt: {
            claims: {
              sub: "user-a",
              email: "a@example.com",
              name: "A",
              "cognito:groups": "admin",
            },
          },
        },
      },
    } as unknown as Parameters<typeof claimsFromEvent>[0]);
    assert.equal(claims?.sub, "user-a");
    assert.equal(claims?.email, "a@example.com");
    assert.deepEqual(claims?.groups, ["admin"]);
  });

  it("uses cognito:username when email is missing", () => {
    const claims = claimsFromEvent({
      version: "2.0",
      routeKey: "GET /v1/me",
      rawPath: "/v1/me",
      requestContext: {
        authorizer: {
          jwt: {
            claims: {
              sub: "user-a",
              "cognito:username": "a@example.com",
            },
          },
        },
      },
    } as unknown as Parameters<typeof claimsFromEvent>[0]);
    assert.equal(claims?.email, "a@example.com");
  });

  it("fills cognito:groups from the verified Bearer payload when HTTP API omits the array claim", () => {
    const payload = Buffer.from(
      JSON.stringify({ sub: "admin-1", "cognito:groups": ["admin"] }),
    ).toString("base64url");
    const claims = claimsFromEvent({
      version: "2.0",
      routeKey: "GET /v1/admin/metrics/summary",
      rawPath: "/v1/admin/metrics/summary",
      headers: { authorization: `Bearer header.${payload}.sig` },
      requestContext: {
        authorizer: {
          jwt: {
            claims: {
              sub: "admin-1",
              email: "admin@example.com",
            },
          },
        },
      },
    } as unknown as Parameters<typeof claimsFromEvent>[0]);
    assert.deepEqual(claims?.groups, ["admin"]);
  });

  it("does not take groups from a Bearer payload whose sub does not match the authorizer", () => {
    const payload = Buffer.from(
      JSON.stringify({ sub: "attacker", "cognito:groups": ["admin"] }),
    ).toString("base64url");
    const claims = claimsFromEvent({
      version: "2.0",
      routeKey: "GET /v1/admin/metrics/summary",
      rawPath: "/v1/admin/metrics/summary",
      headers: { authorization: `Bearer header.${payload}.sig` },
      requestContext: {
        authorizer: {
          jwt: {
            claims: { sub: "user-a" },
          },
        },
      },
    } as unknown as Parameters<typeof claimsFromEvent>[0]);
    assert.deepEqual(claims?.groups, []);
  });
});

describe("requireUser", () => {
  it("rejects a missing JWT", () => {
    runWithClaims(null, () => {
      assert.throws(
        () => requireUser(),
        (error: unknown) =>
          error instanceof Error && "code" in error && error.code === "UNAUTHENTICATED",
      );
    });
  });
});
