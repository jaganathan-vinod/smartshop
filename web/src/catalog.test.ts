import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Product } from "@smartshop/shared";
import {
  categoryPath,
  dealCompareAtCents,
  dealProducts,
  featuredPicks,
  formatCategoryLabel,
  heroHighlights,
  heroSlides,
  productSocialProof,
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

  it("orders featured deals and picks to match the storefront sample", () => {
    const catalog = [
      product({ productId: "prod-gel-pens", category: "stationery", unitPriceCents: 699 }),
      product({ productId: "prod-canvas-tote", category: "apparel", unitPriceCents: 1599 }),
      product({ productId: "prod-ceramic-mug", category: "home", unitPriceCents: 1299 }),
      product({ productId: "prod-notebook-set", category: "stationery", unitPriceCents: 1499 }),
      product({ productId: "prod-running-socks", category: "apparel", unitPriceCents: 899 }),
      product({ productId: "prod-wireless-mouse", category: "electronics", unitPriceCents: 2499 }),
      product({ productId: "prod-mech-keyboard", category: "electronics", unitPriceCents: 8999 }),
      product({ productId: "prod-usbc-hub", category: "electronics", unitPriceCents: 3999 }),
    ];
    assert.deepEqual(
      dealProducts(catalog).map((item) => item.productId),
      ["prod-running-socks", "prod-ceramic-mug", "prod-notebook-set", "prod-canvas-tote"],
    );
    assert.deepEqual(
      featuredPicks(catalog).map((item) => item.productId),
      ["prod-mech-keyboard", "prod-usbc-hub", "prod-wireless-mouse"],
    );
  });

  it("keeps sample ratings, compare-at price, and keyboard highlights stable", () => {
    const socks = product({
      productId: "prod-running-socks",
      category: "apparel",
      unitPriceCents: 899,
    });
    const keyboard = product({
      productId: "prod-mech-keyboard",
      category: "electronics",
      unitPriceCents: 8999,
    });
    assert.deepEqual(productSocialProof(socks), { rating: 4.8, reviewCount: 124 });
    assert.equal(dealCompareAtCents(socks), 1199);
    assert.deepEqual(
      heroHighlights(keyboard).map((item) => item.label),
      ["Hot-swap switches", "Compact 75% layout", "Premium build quality"],
    );
    assert.deepEqual(
      heroSlides([socks, keyboard]).map((item) => item.productId),
      ["prod-mech-keyboard"],
    );
  });
});
