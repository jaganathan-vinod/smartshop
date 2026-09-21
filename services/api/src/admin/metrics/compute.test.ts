import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Order, Product, UserProfile } from "@smartshop/shared";
import { computeMetrics, stockoutRows, topProductsFromOrders } from "./compute.js";

function order(overrides: Partial<Order> & Pick<Order, "orderId" | "createdAt" | "deliveryMethod" | "isPremiumAtPurchase">): Order {
  return {
    orderNumber: "SS-20260921-00001",
    status: "CONFIRMED",
    items: [
      {
        productId: "prod_keyboard",
        name: "Mechanical Keyboard",
        quantity: 1,
        unitPriceCents: 7900,
      },
    ],
    breakdown: {
      currency: "USD",
      subtotalCents: 7900,
      premiumDiscountCents: 0,
      deliveryCents: 499,
      taxCents: 0,
      totalCents: 8399,
    },
    ...overrides,
  };
}

describe("computeMetrics", () => {
  const now = new Date("2026-09-21T12:00:00.000Z");
  const products: Product[] = [
    {
      productId: "prod_keyboard",
      name: "Mechanical Keyboard",
      nameLower: "mechanical keyboard",
      description: "",
      category: "Electronics",
      unitPriceCents: 7900,
      currency: "USD",
      stockQty: 0,
      imageUrl: "",
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ];
  const users: UserProfile[] = [
    {
      userId: "user-a",
      email: "a@example.com",
      displayName: "A",
      isPremium: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      userId: "user-b",
      email: "b@example.com",
      displayName: "B",
      isPremium: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ];

  it("sums GMV from confirmed orders in the window only", () => {
    const summary = computeMetrics({
      now,
      days: 7,
      products,
      users,
      orders: [
        order({
          orderId: "ord_old",
          createdAt: "2026-09-01T00:00:00.000Z",
          deliveryMethod: "STANDARD",
          isPremiumAtPurchase: false,
        }),
        order({
          orderId: "ord_new",
          createdAt: "2026-09-20T00:00:00.000Z",
          deliveryMethod: "EXPRESS",
          isPremiumAtPurchase: true,
          breakdown: {
            currency: "USD",
            subtotalCents: 7900,
            premiumDiscountCents: 790,
            deliveryCents: 1299,
            taxCents: 0,
            totalCents: 8409,
          },
        }),
      ],
    });
    assert.equal(summary.gmvCents, 8409);
    assert.equal(summary.orderCount, 1);
    assert.equal(summary.delivery.EXPRESS, 1);
    assert.equal(summary.premiumOrderCount, 1);
    assert.equal(summary.premiumUserCount, 1);
    assert.deepEqual(summary.unavailable, ["viewToOrder"]);
  });

  it("ranks products by line GMV and lists zero-stock SKUs", () => {
    const orders = [
      order({
        orderId: "ord_a",
        createdAt: "2026-09-20T00:00:00.000Z",
        deliveryMethod: "STANDARD",
        isPremiumAtPurchase: false,
        items: [
          { productId: "prod_keyboard", name: "Mechanical Keyboard", quantity: 2, unitPriceCents: 7900 },
          { productId: "prod_mug", name: "Mug", quantity: 1, unitPriceCents: 1200 },
        ],
      }),
    ];
    const ranked = topProductsFromOrders(orders, 5);
    assert.equal(ranked[0]?.productId, "prod_keyboard");
    assert.equal(ranked[0]?.gmvCents, 15800);
    assert.equal(stockoutRows(products).length, 1);
  });
});
