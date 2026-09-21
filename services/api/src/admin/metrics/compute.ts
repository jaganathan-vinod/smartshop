import type { Order, Product, UserProfile } from "@smartshop/shared";
import { metricsSummarySchema, type MetricsSummary } from "@smartshop/shared";

const DEFAULT_WINDOW_DAYS = 7;
const DEFAULT_GMV_TARGET_CENTS = 1_200_000;

function utcDay(iso: string): string {
  return iso.slice(0, 10);
}

function addUtcDays(day: string, amount: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function windowStartIso(now: Date, days: number): string {
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return start.toISOString();
}

export function computeMetrics(input: {
  orders: Order[];
  products: Product[];
  users: UserProfile[];
  now?: Date;
  days?: number;
  gmvTargetCents?: number;
}): MetricsSummary {
  const now = input.now ?? new Date();
  const days = input.days ?? DEFAULT_WINDOW_DAYS;
  const from = windowStartIso(now, days);
  const inWindow = input.orders.filter((order) => order.createdAt >= from);
  const gmvCents = inWindow.reduce((sum, order) => sum + order.breakdown.totalCents, 0);
  const orderCount = inWindow.length;
  const aovCents = orderCount === 0 ? 0 : Math.round(gmvCents / orderCount);
  const endDay = utcDay(now.toISOString());
  const startDay = addUtcDays(endDay, -(days - 1));
  const byDay = new Map<string, { gmvCents: number; orderCount: number }>();
  for (let i = 0; i < days; i += 1) {
    byDay.set(addUtcDays(startDay, i), { gmvCents: 0, orderCount: 0 });
  }
  for (const order of inWindow) {
    const day = utcDay(order.createdAt);
    const bucket = byDay.get(day);
    if (!bucket) {
      continue;
    }
    bucket.gmvCents += order.breakdown.totalCents;
    bucket.orderCount += 1;
  }
  const delivery = { STANDARD: 0, EXPRESS: 0 };
  let premiumOrderCount = 0;
  for (const order of inWindow) {
    delivery[order.deliveryMethod] += 1;
    if (order.isPremiumAtPurchase) {
      premiumOrderCount += 1;
    }
  }
  return metricsSummarySchema.parse({
    currency: "USD",
    windowDays: days,
    from,
    to: now.toISOString(),
    gmvCents,
    orderCount,
    aovCents,
    gmvTargetCents: input.gmvTargetCents ?? DEFAULT_GMV_TARGET_CENTS,
    gmvByDay: [...byDay.entries()].map(([date, value]) => ({ date, ...value })),
    delivery,
    premiumOrderCount,
    premiumUserCount: input.users.filter((user) => user.isPremium).length,
    userCount: input.users.length,
    unavailable: ["viewToOrder"],
  });
}

export function topProductsFromOrders(
  orders: Order[],
  limit = 5,
): { productId: string; name: string; units: number; gmvCents: number }[] {
  const byId = new Map<string, { productId: string; name: string; units: number; gmvCents: number }>();
  for (const order of orders) {
    for (const line of order.items) {
      const current = byId.get(line.productId) ?? {
        productId: line.productId,
        name: line.name,
        units: 0,
        gmvCents: 0,
      };
      current.units += line.quantity;
      current.gmvCents += line.unitPriceCents * line.quantity;
      current.name = line.name;
      byId.set(line.productId, current);
    }
  }
  return [...byId.values()].sort((a, b) => b.gmvCents - a.gmvCents).slice(0, limit);
}

export function stockoutRows(products: Product[]) {
  return products
    .filter((product) => product.active && product.stockQty === 0)
    .map((product) => ({
      productId: product.productId,
      name: product.name,
      stockQty: product.stockQty,
    }));
}
