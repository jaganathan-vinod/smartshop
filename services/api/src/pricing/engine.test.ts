import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CartLine } from "@smartshop/shared";
import { computeQuote, PricingError } from "./engine.js";

const line = (unitPriceCents: number, quantity = 1): CartLine => ({
  productId: "prod-x",
  name: "Item",
  quantity,
  unitPriceCents,
});

describe("computeQuote", () => {
  it("rejects an empty cart", () => {
    assert.throws(
      () => computeQuote([], false, "STANDARD"),
      (error: unknown) => error instanceof PricingError && error.code === "CART_EMPTY",
    );
  });

  it("applies STANDARD delivery and no premium discount", () => {
    const quote = computeQuote([line(10000)], false, "STANDARD");
    assert.equal(quote.breakdown.subtotalCents, 10000);
    assert.equal(quote.breakdown.premiumDiscountCents, 0);
    assert.equal(quote.breakdown.deliveryCents, 499);
    assert.equal(quote.breakdown.taxCents, 0);
    assert.equal(quote.breakdown.totalCents, 10499);
  });

  it("applies EXPRESS delivery", () => {
    const quote = computeQuote([line(10000)], false, "EXPRESS");
    assert.equal(quote.breakdown.deliveryCents, 1299);
    assert.equal(quote.breakdown.totalCents, 11299);
  });

  it("applies 10% premium discount on merchandise only", () => {
    const quote = computeQuote([line(10000)], true, "STANDARD");
    assert.equal(quote.breakdown.premiumDiscountCents, 1000);
    assert.equal(quote.breakdown.deliveryCents, 499);
    assert.equal(quote.breakdown.totalCents, 9499);
  });

  it("floors the premium discount to cents", () => {
    const quote = computeQuote([line(999)], true, "STANDARD");
    assert.equal(quote.breakdown.premiumDiscountCents, 99);
    assert.equal(quote.breakdown.totalCents, 999 - 99 + 499);
  });
});
