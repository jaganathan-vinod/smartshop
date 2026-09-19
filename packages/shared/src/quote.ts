import { z } from "zod";
import { deliveryMethodSchema } from "./delivery.js";
import { centsSchema, currencySchema } from "./money.js";

export const cartLineSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPriceCents: centsSchema,
});

export type CartLine = z.infer<typeof cartLineSchema>;

export const priceBreakdownSchema = z.object({
  currency: currencySchema,
  subtotalCents: centsSchema,
  premiumDiscountCents: centsSchema,
  deliveryCents: centsSchema,
  taxCents: centsSchema,
  totalCents: centsSchema,
});

export type PriceBreakdown = z.infer<typeof priceBreakdownSchema>;

export const quoteRequestSchema = z.object({
  deliveryMethod: deliveryMethodSchema,
});

export const quoteResponseSchema = z.object({
  deliveryMethod: deliveryMethodSchema,
  items: z.array(cartLineSchema),
  breakdown: priceBreakdownSchema,
  isPremium: z.boolean(),
});

export type QuoteResponse = z.infer<typeof quoteResponseSchema>;
