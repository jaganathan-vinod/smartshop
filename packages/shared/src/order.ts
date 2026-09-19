import { z } from "zod";
import { deliveryMethodSchema } from "./delivery.js";
import { cartLineSchema, priceBreakdownSchema } from "./quote.js";

export const orderStatusSchema = z.literal("CONFIRMED");
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const orderIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid order id");

export const idempotencyKeySchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._-]+$/, "Invalid idempotency key");

export const createOrderRequestSchema = z.object({
  deliveryMethod: deliveryMethodSchema,
  confirm: z.literal(true),
});

export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;

export const orderSchema = z.object({
  orderId: orderIdSchema,
  orderNumber: z.string().min(1),
  status: orderStatusSchema,
  deliveryMethod: deliveryMethodSchema,
  items: z.array(cartLineSchema),
  breakdown: priceBreakdownSchema,
  isPremiumAtPurchase: z.boolean(),
  createdAt: z.string().datetime(),
});

export type Order = z.infer<typeof orderSchema>;
