import { z } from "zod";
import { deliveryMethodSchema } from "./delivery.js";
import { cartLineSchema, priceBreakdownSchema } from "./quote.js";

export const orderStatusSchema = z.literal("CONFIRMED");
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const createOrderRequestSchema = z.object({
  deliveryMethod: deliveryMethodSchema,
  confirm: z.literal(true),
});

export const orderSchema = z.object({
  orderId: z.string().min(1),
  orderNumber: z.string().min(1),
  status: orderStatusSchema,
  deliveryMethod: deliveryMethodSchema,
  items: z.array(cartLineSchema),
  breakdown: priceBreakdownSchema,
  isPremiumAtPurchase: z.boolean(),
  createdAt: z.string().datetime(),
});

export type Order = z.infer<typeof orderSchema>;
