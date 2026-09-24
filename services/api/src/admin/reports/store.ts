import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import {
  DEFAULT_DASHBOARD_SPEC,
  parseDashboardSpecFromText,
  reportJobSchema,
  type DashboardSpec,
  type ReportJob,
  type ReportJobStatus,
} from "@smartshop/shared";
import { docClient } from "../../db.js";
import { reportJobsTableName } from "../../env.js";
import { getDashboardRun } from "./cursor-cloud.js";

export const PUBLISHED_JOB_ID = "published";

function nowIso(): string {
  return new Date().toISOString();
}

function newJobId(): string {
  return `job_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`;
}

export async function putReportJob(job: ReportJob): Promise<ReportJob> {
  const parsed = reportJobSchema.parse(job);
  await docClient.send(
    new PutCommand({
      TableName: reportJobsTableName(),
      Item: parsed,
    }),
  );
  return parsed;
}

export async function getReportJob(jobId: string): Promise<ReportJob | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: reportJobsTableName(),
      Key: { jobId },
    }),
  );
  if (!result.Item) {
    return null;
  }
  if (result.Item.kind === "html-v2") {
    return null;
  }
  const parsed = reportJobSchema.safeParse(result.Item);
  return parsed.success ? parsed.data : null;
}

export async function createRunningJob(input: {
  createdBy: string;
  prompt: string;
  agentId?: string;
  runId?: string;
  previewUrl?: string;
}): Promise<ReportJob> {
  const timestamp = nowIso();
  return putReportJob({
    jobId: newJobId(),
    status: "running",
    prompt: input.prompt,
    createdBy: input.createdBy,
    agentId: input.agentId,
    runId: input.runId,
    previewUrl: input.previewUrl,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export async function refreshRunningJob(job: ReportJob): Promise<ReportJob> {
  if (job.status !== "running" || !job.agentId || !job.runId) {
    return job;
  }
  const snapshot = await getDashboardRun(job.agentId, job.runId);
  if (snapshot.status === "running") {
    return job;
  }
  if (snapshot.status === "error") {
    return putReportJob({
      ...job,
      status: "error",
      errorMessage: snapshot.resultText?.slice(0, 2000) || "Cursor agent run failed",
      updatedAt: nowIso(),
    });
  }
  const spec = snapshot.resultText
    ? parseDashboardSpecFromText(snapshot.resultText)
    : undefined;
  return putReportJob({
    ...job,
    status: "preview_ready",
    previewSpec: spec ?? job.previewSpec ?? DEFAULT_DASHBOARD_SPEC,
    previewUrl: snapshot.previewUrl ?? job.previewUrl,
    errorMessage: spec ? undefined : "Agent finished without a valid spec; using last/default layout",
    updatedAt: nowIso(),
  });
}

export async function markJobRunning(
  job: ReportJob,
  patch: { runId: string; prompt?: string; previewUrl?: string },
): Promise<ReportJob> {
  return putReportJob({
    ...job,
    status: "running",
    runId: patch.runId,
    prompt: patch.prompt ?? job.prompt,
    previewUrl: patch.previewUrl ?? job.previewUrl,
    errorMessage: undefined,
    updatedAt: nowIso(),
  });
}

export async function publishJobSpec(job: ReportJob): Promise<{ live: ReportJob; job: ReportJob }> {
  const spec: DashboardSpec = job.previewSpec ?? DEFAULT_DASHBOARD_SPEC;
  const timestamp = nowIso();
  const published = await putReportJob({
    jobId: PUBLISHED_JOB_ID,
    status: "published",
    prompt: job.prompt,
    createdBy: job.createdBy,
    agentId: job.agentId,
    runId: job.runId,
    previewUrl: job.previewUrl,
    previewSpec: spec,
    createdAt: job.createdAt,
    updatedAt: timestamp,
  });
  const updated = await putReportJob({
    ...job,
    status: "published",
    previewSpec: spec,
    updatedAt: timestamp,
  });
  return { live: published, job: updated };
}
