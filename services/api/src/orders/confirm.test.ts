import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createOrderRequestSchema, idempotencyKeySchema } from "@smartshop/shared";
import { formatOrderNumber, hashOrderRequest } from "./number.js";

describe("createOrderRequestSchema", () => {
  it("accepts confirm: true", () => {
    const parsed = createOrderRequestSchema.parse({
      deliveryMethod: "STANDARD",
      confirm: true,
    });
    assert.equal(parsed.confirm, true);
  });

  it("rejects missing confirm", () => {
    assert.throws(() =>
      createOrderRequestSchema.parse({ deliveryMethod: "STANDARD" }),
    );
  });

  it('rejects confirm: "true"', () => {
    assert.throws(() =>
      createOrderRequestSchema.parse({
        deliveryMethod: "STANDARD",
        confirm: "true",
      }),
    );
  });

  it("rejects confirm: false", () => {
    assert.throws(() =>
      createOrderRequestSchema.parse({
        deliveryMethod: "STANDARD",
        confirm: false,
      }),
    );
  });
});

describe("formatOrderNumber", () => {
  it("formats SS-YYYYMMDD-##### in UTC", () => {
    assert.equal(
      formatOrderNumber(new Date("2026-09-19T16:00:00.000Z"), 7),
      "SS-20260919-00007",
    );
  });
});

describe("hashOrderRequest", () => {
  it("is stable for the same body", () => {
    const a = hashOrderRequest({ deliveryMethod: "STANDARD", confirm: true });
    const b = hashOrderRequest({ deliveryMethod: "STANDARD", confirm: true });
    assert.equal(a, b);
    assert.notEqual(
      a,
      hashOrderRequest({ deliveryMethod: "EXPRESS", confirm: true }),
    );
  });
});

describe("idempotencyKeySchema", () => {
  it("accepts a UUID", () => {
    assert.equal(
      idempotencyKeySchema.parse("550e8400-e29b-41d4-a716-446655440000"),
      "550e8400-e29b-41d4-a716-446655440000",
    );
  });
});
