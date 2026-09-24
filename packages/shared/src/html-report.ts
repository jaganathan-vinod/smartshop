import { z } from "zod";

export const HTML_REPORT_KIND = "html-v2" as const;

export const PUBLISHED_HTML_JOB_ID = "published-html";

export const HTML_TEMPLATE_MAX_BYTES = 300 * 1024;

export const htmlReportWindowDaysSchema = z.union([z.literal(7), z.literal(30)]);

export type HtmlReportWindowDays = z.infer<typeof htmlReportWindowDaysSchema>;

export const htmlReportStatusSchema = z.enum([
  "running",
  "preview_ready",
  "error",
  "approved",
  "published",
]);

export type HtmlReportStatus = z.infer<typeof htmlReportStatusSchema>;

export const htmlReportJobSchema = z.object({
  jobId: z
    .string()
    .min(8)
    .max(80)
    .regex(/^[A-Za-z0-9_-]+$/, "Invalid report job id"),
  kind: z.literal(HTML_REPORT_KIND),
  status: htmlReportStatusSchema,
  prompt: z.string().min(1),
  createdBy: z.string().min(1),
  agentId: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  windowDays: htmlReportWindowDaysSchema,
  templateHtml: z.string().max(HTML_TEMPLATE_MAX_BYTES).optional(),
  errorMessage: z.string().max(2000).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type HtmlReportJob = z.infer<typeof htmlReportJobSchema>;

export const createHtmlReportJobRequestSchema = z.object({
  prompt: z.string().trim().min(8).max(4000),
  windowDays: htmlReportWindowDaysSchema.default(7),
});

export type CreateHtmlReportJobRequest = z.infer<typeof createHtmlReportJobRequestSchema>;

export const refineHtmlReportJobRequestSchema = z.object({
  prompt: z.string().trim().min(4).max(4000),
  windowDays: htmlReportWindowDaysSchema.optional(),
});

export type RefineHtmlReportJobRequest = z.infer<typeof refineHtmlReportJobRequestSchema>;

export const htmlReportPreviewSchema = z.object({
  templateHtml: z.string().min(1).max(HTML_TEMPLATE_MAX_BYTES),
  windowDays: htmlReportWindowDaysSchema,
});

export type HtmlReportPreview = z.infer<typeof htmlReportPreviewSchema>;
