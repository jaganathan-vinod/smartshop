import { z } from "zod";
import { productIdSchema } from "./product.js";

export const upsertCartItemRequestSchema = z.object({
  productId: productIdSchema,
  quantity: z.number().int().min(1),
});

export type UpsertCartItemRequest = z.infer<typeof upsertCartItemRequestSchema>;

export const patchCartItemRequestSchema = z.object({
  quantity: z.number().int().min(1),
});

export type PatchCartItemRequest = z.infer<typeof patchCartItemRequestSchema>;
