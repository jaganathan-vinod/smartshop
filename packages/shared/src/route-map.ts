import { z } from "zod";

export const ROUTE_MAP_LIMIT = 200;

export const routeMapRowSchema = z.object({
  pair_id: z.string().min(1),
  geojson: z.string().min(1),
});

export const routeMapResponseSchema = z.object({
  routes: z.array(routeMapRowSchema).max(ROUTE_MAP_LIMIT),
});

export type RouteMapRow = z.infer<typeof routeMapRowSchema>;
export type RouteMapResponse = z.infer<typeof routeMapResponseSchema>;
