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
