import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Product } from "@smartshop/shared";
import { filterProducts } from "./filter.js";

function product(overrides: Partial<Product> & Pick<Product, "productId" | "name" | "nameLower" | "category">): Product {
  return {
    description: "",
    unitPriceCents: 1000,
    currency: "USD",
    stockQty: 5,
    imageUrl: "",
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("filterProducts", () => {
  const catalog = [
    product({ productId: "prod-mug", name: "Ceramic Mug", nameLower: "ceramic mug", category: "home" }),
    product({ productId: "prod-mouse", name: "Wireless Mouse", nameLower: "wireless mouse", category: "electronics" }),
    product({
      productId: "prod-old",
      name: "Old Mug",
      nameLower: "old mug",
      category: "home",
      active: false,
    }),
  ];

  it("omits inactive products", () => {
    const result = filterProducts(catalog, {});
    assert.equal(result.length, 2);
    assert.ok(result.every((item) => item.active));
  });

  it("filters name contains case-insensitively", () => {
    const result = filterProducts(catalog, { q: "MUG" });
    assert.deepEqual(
      result.map((item) => item.productId),
      ["prod-mug"],
    );
  });

  it("returns empty list for unknown category", () => {
    const result = filterProducts(catalog, { category: "toys" });
    assert.deepEqual(result, []);
  });

  it("caps results with limit", () => {
    const result = filterProducts(catalog, { limit: 1 });
    assert.equal(result.length, 1);
  });
});
