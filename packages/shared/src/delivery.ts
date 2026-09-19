import { z } from "zod";

export const deliveryMethodSchema = z.enum(["STANDARD", "EXPRESS"]);
export type DeliveryMethod = z.infer<typeof deliveryMethodSchema>;

export const DELIVERY_CENTS = {
  STANDARD: 499,
  EXPRESS: 1299,
} as const satisfies Record<DeliveryMethod, number>;
