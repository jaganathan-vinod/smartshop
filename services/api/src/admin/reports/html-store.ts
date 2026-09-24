import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import {
  HTML_REPORT_KIND,
  PUBLISHED_HTML_JOB_ID,
  htmlReportJobSchema,
  type HtmlReportJob,
  type HtmlReportWindowDays,
} from "@smartshop/shared";
import { docClient } from "../../db.js";
import { reportJobsTableName } from "../../env.js";
import { logJson } from "../../log.js";
import { getHtmlDashboardRun } from "./cursor-html.js";
import { acceptHtmlReply } from "./html-template.js";

function nowIso(): string {
  return new Date().toISOString();
}

function newJobId(): string {
  return `job_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`;
}

export async function putHtmlReportJob(job: HtmlReportJob): Promise<HtmlReportJob> {
  const parsed = htmlReportJobSchema.parse(job);
  await docClient.send(
    new PutCommand({
      TableName: reportJobsTableName(),
      Item: parsed,
    }),
  );
  return parsed;
}

export async function getHtmlReportJob(jobId: string): Promise<HtmlReportJob | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: reportJobsTableName(),
      Key: { jobId },
    }),
  );
  if (!result.Item || result.Item.kind !== HTML_REPORT_KIND) {
    return null;
  }
  const parsed = htmlReportJobSchema.safeParse(result.Item);
  return parsed.success ? parsed.data : null;
}

export async function createHtmlRunningJob(input: {
  createdBy: string;
  prompt: string;
  windowDays: HtmlReportWindowDays;
  agentId: string;
  runId: string;
  agentUrl: string;
}): Promise<HtmlReportJob> {
  const timestamp = nowIso();
  return putHtmlReportJob({
    jobId: newJobId(),
    kind: HTML_REPORT_KIND,
    status: "running",
    prompt: input.prompt,
    createdBy: input.createdBy,
    agentId: input.agentId,
    runId: input.runId,
    agentUrl: input.agentUrl,
    windowDays: input.windowDays,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export async function refreshHtmlRunningJob(job: HtmlReportJob): Promise<HtmlReportJob> {
  if (job.status !== "running" || !job.agentId || !job.runId) {
    return job;
  }
  const snapshot = await getHtmlDashboardRun(job.agentId, job.runId);
  if (snapshot.status === "running") {
    return job;
  }
  if (snapshot.status === "error") {
    logJson({
      msg: "html-report-run",
      agentId: job.agentId,
      runId: job.runId,
      status: "error",
    });
    return putHtmlReportJob({
      ...job,
      status: "error",
      errorMessage: (snapshot.resultText ?? "Cursor agent run failed").slice(0, 2000),
      updatedAt: nowIso(),
    });
  }
  const accepted = acceptHtmlReply({ resultText: snapshot.resultText, git: snapshot.git });
  if ("error" in accepted) {
    logJson({
      msg: "html-report-run",
      agentId: job.agentId,
      runId: job.runId,
      status: "rejected",
    });
    return putHtmlReportJob({
      ...job,
      status: "error",
      errorMessage: accepted.error,
      updatedAt: nowIso(),
    });
  }
  logJson({
    msg: "html-report-run",
    agentId: job.agentId,
    runId: job.runId,
    status: "preview_ready",
  });
  return putHtmlReportJob({
    ...job,
    status: "preview_ready",
    templateHtml: accepted.html,
    errorMessage: undefined,
    updatedAt: nowIso(),
  });
}

export async function markHtmlJobRunning(
  job: HtmlReportJob,
  patch: { runId: string; prompt: string; windowDays?: HtmlReportWindowDays },
): Promise<HtmlReportJob> {
  return putHtmlReportJob({
    ...job,
    status: "running",
    runId: patch.runId,
    prompt: patch.prompt,
    windowDays: patch.windowDays ?? job.windowDays,
    errorMessage: undefined,
    updatedAt: nowIso(),
  });
}

export async function publishHtmlTemplate(
  job: HtmlReportJob,
): Promise<{ live: HtmlReportJob; job: HtmlReportJob }> {
  const templateHtml = job.templateHtml;
  if (!templateHtml) {
    throw new Error("HTML report is missing a template");
  }
  const timestamp = nowIso();
  const live = await putHtmlReportJob({
    jobId: PUBLISHED_HTML_JOB_ID,
    kind: HTML_REPORT_KIND,
    status: "published",
    prompt: job.prompt,
    createdBy: job.createdBy,
    agentId: job.agentId,
    runId: job.runId,
    windowDays: job.windowDays,
    templateHtml,
    createdAt: job.createdAt,
    updatedAt: timestamp,
  });
  const updated = await putHtmlReportJob({
    ...job,
    status: "approved",
    templateHtml,
    updatedAt: timestamp,
  });
  return { live, job: updated };
}
