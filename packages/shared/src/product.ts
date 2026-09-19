import { z } from "zod";
import { centsSchema, currencySchema } from "./money.js";

export const productIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid product id");

export const productSchema = z.object({
  productId: productIdSchema,
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

export const listProductsQuerySchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

export const createProductRequestSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  category: z.string().min(1),
  unitPriceCents: centsSchema,
  stockQty: z.number().int().nonnegative(),
  imageUrl: z.string().default(""),
  active: z.boolean().default(true),
});

export type CreateProductRequest = z.infer<typeof createProductRequestSchema>;

export const replaceProductRequestSchema = createProductRequestSchema;

export const patchProductRequestSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    category: z.string().min(1).optional(),
    unitPriceCents: centsSchema.optional(),
    stockQty: z.number().int().nonnegative().optional(),
    imageUrl: z.string().optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((v) => v !== undefined), {
    message: "At least one field is required",
  });

export type PatchProductRequest = z.infer<typeof patchProductRequestSchema>;
