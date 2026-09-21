import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assistantToolRequestSchema,
  isExplicitConfirm,
  stripForgedUserId,
} from "@smartshop/shared";
import { iamArnFromEvent } from "../auth.js";
import { AssistantToolError } from "./dispatch.js";

export function assertConfirmAllowed(userConfirmed: boolean, quotePresentedAt?: string) {
  if (!userConfirmed) {
    throw new AssistantToolError(
      "CONFIRM_REQUIRED",
      "Customer must explicitly confirm after a quote",
    );
  }
  if (!quotePresentedAt) {
    throw new AssistantToolError(
      "QUOTE_REQUIRED",
      "Present a quote before confirming an order",
    );
  }
}

describe("assistant tool payload", () => {
  it("strips a forged userId from args", () => {
    const parsed = assistantToolRequestSchema.parse({
      conversationId: "conv-abc12345",
      tool: "get_cart",
      args: { userId: "attacker", extra: 1 },
    });
    assert.equal("userId" in stripForgedUserId(parsed.args), false);
    assert.equal(parsed.tool, "get_cart");
  });

  it("rejects admin-like tool names", () => {
    assert.throws(() =>
      assistantToolRequestSchema.parse({
        conversationId: "conv-abc12345",
        tool: "create_product",
        args: {},
      }),
    );
  });
});

describe("explicit confirm phrase", () => {
  it("accepts yes and place it", () => {
    assert.equal(isExplicitConfirm("yes"), true);
    assert.equal(isExplicitConfirm("yes, place it"), true);
    assert.equal(isExplicitConfirm("yes confirm order"), true);
    assert.equal(isExplicitConfirm("yes, confirm"), true);
    assert.equal(isExplicitConfirm("place the order"), true);
    assert.equal(isExplicitConfirm("yes order"), true);
    assert.equal(isExplicitConfirm("yes, order"), true);
  });

  it("rejects implied consent", () => {
    assert.equal(isExplicitConfirm("sounds good"), false);
    assert.equal(isExplicitConfirm("looks good"), false);
    assert.equal(isExplicitConfirm("ok"), false);
  });
});

describe("confirm guard", () => {
  it("rejects confirm without an explicit user yes", () => {
    assert.throws(
      () => assertConfirmAllowed(false, "2026-01-01T00:00:00.000Z"),
      (error: unknown) =>
        error instanceof AssistantToolError && error.code === "CONFIRM_REQUIRED",
    );
  });

  it("rejects confirm without a prior quote", () => {
    assert.throws(
      () => assertConfirmAllowed(true, undefined),
      (error: unknown) =>
        error instanceof AssistantToolError && error.code === "QUOTE_REQUIRED",
    );
  });

  it("allows confirm after quote and yes", () => {
    assert.doesNotThrow(() => assertConfirmAllowed(true, "2026-01-01T00:00:00.000Z"));
  });
});

describe("iamArnFromEvent", () => {
  it("reads HTTP API IAM authorizer arn", () => {
    const arn = iamArnFromEvent({
      version: "2.0",
      routeKey: "POST /v1/internal/assistant/tools",
      rawPath: "/v1/internal/assistant/tools",
      requestContext: {
        authorizer: {
          iam: { userArn: "arn:aws:sts::1:assumed-role/runtime/session" },
        },
      },
    } as unknown as Parameters<typeof iamArnFromEvent>[0]);
    assert.equal(arn, "arn:aws:sts::1:assumed-role/runtime/session");
  });

  it("does not treat a JWT authorizer as IAM", () => {
    const arn = iamArnFromEvent({
      version: "2.0",
      routeKey: "GET /v1/cart",
      rawPath: "/v1/cart",
      requestContext: {
        authorizer: {
          jwt: { claims: { sub: "user-a" } },
        },
      },
    } as unknown as Parameters<typeof iamArnFromEvent>[0]);
    assert.equal(arn, null);
  });
});
