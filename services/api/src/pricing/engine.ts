import {
  DELIVERY_CENTS,
  type CartLine,
  type DeliveryMethod,
  type QuoteResponse,
} from "@smartshop/shared";

export const PREMIUM_RATE = 0.1;

export class PricingError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "PricingError";
  }
}

export function computeQuote(
  items: CartLine[],
  isPremium: boolean,
  deliveryMethod: DeliveryMethod,
): QuoteResponse {
  if (items.length === 0) {
    throw new PricingError("CART_EMPTY", "Cart is empty");
  }

  const subtotalCents = items.reduce(
    (sum, item) => sum + item.unitPriceCents * item.quantity,
    0,
  );
  const premiumDiscountCents = isPremium
    ? Math.floor(subtotalCents * PREMIUM_RATE)
    : 0;
  const deliveryCents = DELIVERY_CENTS[deliveryMethod];
  const taxCents = 0;
  const totalCents =
    subtotalCents - premiumDiscountCents + deliveryCents + taxCents;

  return {
    deliveryMethod,
    items,
    isPremium,
    breakdown: {
      currency: "USD",
      subtotalCents,
      premiumDiscountCents,
      deliveryCents,
      taxCents,
      totalCents,
    },
  };
}
