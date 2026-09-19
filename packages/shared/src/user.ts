import { z } from "zod";

export const userProfileSchema = z.object({
  userId: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().min(1),
  isPremium: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type UserProfile = z.infer<typeof userProfileSchema>;

export const meResponseSchema = userProfileSchema.pick({
  userId: true,
  email: true,
  displayName: true,
  isPremium: true,
});

export type MeResponse = z.infer<typeof meResponseSchema>;

export const patchPremiumRequestSchema = z.object({
  isPremium: z.boolean(),
});

export type PatchPremiumRequest = z.infer<typeof patchPremiumRequestSchema>;
