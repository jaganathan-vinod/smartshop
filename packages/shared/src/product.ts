import { z } from "zod";
import { centsSchema, currencySchema } from "./money.js";

export const productSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1),
  nameLower: z.string().min(1),
  description: z.string(),
  category: z.string().min(1),
  unitPriceCents: centsSchema,
  currency: currencySchema,
  stockQty: z.number().int().nonnegative(),
  imageUrl: z.string(),
  active: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Product = z.infer<typeof productSchema>;
