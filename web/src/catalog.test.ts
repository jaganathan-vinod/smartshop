import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Product } from "@smartshop/shared";
import {
  categoryPath,
  dealProducts,
  formatCategoryLabel,
  productsListPath,
} from "./catalog";

function product(overrides: Partial<Product> & Pick<Product, "productId" | "category" | "unitPriceCents">): Product {
  return {
    name: overrides.productId,
    nameLower: overrides.productId,
    description: "",
    currency: "USD",
    stockQty: 4,
    imageUrl: "",
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("catalog helpers", () => {
  it("builds a public products path with category", () => {
    assert.equal(productsListPath({ category: "home" }), "/v1/products?category=home");
    assert.equal(
      productsListPath({ q: "mug", category: "home", limit: 10 }),
      "/v1/products?q=mug&category=home&limit=10",
    );
    assert.equal(productsListPath({}), "/v1/products");
  });

  it("formats known and unknown category labels", () => {
    assert.equal(formatCategoryLabel("electronics"), "Electronics");
    assert.equal(formatCategoryLabel("desk-gear"), "Desk Gear");
    assert.equal(categoryPath("electronics"), "/c/electronics");
  });

  it("keeps deal rails on the seeded price band", () => {
    const catalog = [
      product({ productId: "cheap", category: "home", unitPriceCents: 1299 }),
      product({ productId: "premium", category: "electronics", unitPriceCents: 8999 }),
    ];
    assert.deepEqual(
      dealProducts(catalog).map((item) => item.productId),
      ["cheap"],
    );
  });
});
