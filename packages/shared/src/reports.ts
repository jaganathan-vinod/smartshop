import { z } from "zod";
import { centsSchema, currencySchema } from "./money.js";

export const reportJobIdSchema = z
  .string()
  .min(8)
  .max(80)
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid report job id");

export const reportJobStatusSchema = z.enum([
  "running",
  "preview_ready",
  "error",
  "approved",
  "published",
]);

export type ReportJobStatus = z.infer<typeof reportJobStatusSchema>;

export const reportKpiIdSchema = z.enum([
  "gmv",
  "orderCount",
  "aov",
  "targetPace",
  "stockouts",
  "premiumShare",
]);

export type ReportKpiId = z.infer<typeof reportKpiIdSchema>;

export const reportChartIdSchema = z.enum([
  "gmvByDay",
  "topProducts",
  "deliveryMix",
  "premium",
]);

export type ReportChartId = z.infer<typeof reportChartIdSchema>;

export const dashboardSpecSchema = z.object({
  title: z.string().min(1).max(120),
  kpis: z.array(reportKpiIdSchema).min(1).max(8),
  charts: z.array(reportChartIdSchema).max(8),
  unavailable: z.array(z.string().min(1)).default([]),
  gmvTargetCents: centsSchema.optional(),
});

export type DashboardSpec = z.infer<typeof dashboardSpecSchema>;

export const DEFAULT_DASHBOARD_SPEC: DashboardSpec = {
  title: "Weekly executive",
  kpis: ["gmv", "orderCount", "aov", "targetPace", "stockouts"],
  charts: ["gmvByDay", "topProducts", "deliveryMix", "premium"],
  unavailable: ["viewToOrder"],
  gmvTargetCents: 1_200_000,
};

export const createReportJobRequestSchema = z.object({
  prompt: z.string().trim().min(8).max(4000),
});

export type CreateReportJobRequest = z.infer<typeof createReportJobRequestSchema>;

export const refineReportJobRequestSchema = z.object({
  prompt: z.string().trim().min(4).max(4000),
});

export type RefineReportJobRequest = z.infer<typeof refineReportJobRequestSchema>;

export const reportJobSchema = z.object({
  jobId: reportJobIdSchema,
  status: reportJobStatusSchema,
  prompt: z.string().min(1),
  createdBy: z.string().min(1),
  agentId: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  previewUrl: z.string().url().optional(),
  previewSpec: dashboardSpecSchema.optional(),
  errorMessage: z.string().max(2000).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ReportJob = z.infer<typeof reportJobSchema>;

export const metricsDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gmvCents: centsSchema,
  orderCount: z.number().int().nonnegative(),
});

export const metricsProductRowSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1),
  units: z.number().int().nonnegative(),
  gmvCents: centsSchema,
});

export const metricsStockRowSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1),
  stockQty: z.number().int().nonnegative(),
});

export const metricsSummarySchema = z.object({
  currency: currencySchema,
  windowDays: z.number().int().positive(),
  from: z.string().datetime(),
  to: z.string().datetime(),
  gmvCents: centsSchema,
  orderCount: z.number().int().nonnegative(),
  aovCents: centsSchema,
  gmvTargetCents: centsSchema.optional(),
  gmvByDay: z.array(metricsDaySchema),
  delivery: z.object({
    STANDARD: z.number().int().nonnegative(),
    EXPRESS: z.number().int().nonnegative(),
  }),
  premiumOrderCount: z.number().int().nonnegative(),
  premiumUserCount: z.number().int().nonnegative(),
  userCount: z.number().int().nonnegative(),
  unavailable: z.array(z.string().min(1)),
});

export type MetricsSummary = z.infer<typeof metricsSummarySchema>;

export function parseDashboardSpecFromText(text: string): DashboardSpec | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], text];
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const trimmed = candidate.trim();
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) {
      continue;
    }
    try {
      const parsed = dashboardSpecSchema.safeParse(JSON.parse(trimmed.slice(start, end + 1)));
      if (parsed.success) {
        return parsed.data;
      }
    } catch {
      continue;
    }
  }
  return null;
}
