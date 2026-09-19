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
    assert.deepEqual(claims?.groups, ["admin"]);
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
