import { z } from "zod";

export const currencySchema = z.literal("USD");
export type Currency = z.infer<typeof currencySchema>;

export const centsSchema = z.number().int().nonnegative();
