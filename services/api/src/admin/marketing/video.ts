import type { PlanApiCall } from "@smartshop/shared";
import { jsonBlock, recordCall } from "../agent/plan-trace.js";
import { googleAccessToken, runBigQuerySql, type BqQueryParameter } from "../routes-map/client.js";
import { routeMapConfig, type BqQueryResponse } from "../routes-map/query.js";
import { marketingBucket, syncCatalogue } from "./image.js";
import {
  matchCatalogueProducts,
  videoPrompt,
  type CatalogueProduct,
} from "./intent.js";

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/;
const MODEL_NAME = /^[A-Za-z][A-Za-z0-9._-]{0,80}$/;
const OPERATION_NAME =
  /^projects\/[A-Za-z0-9._-]+\/locations\/[A-Za-z0-9_-]+\/publishers\/google\/models\/[A-Za-z0-9._-]+\/operations\/[A-Za-z0-9-]+$/;
const CLOUD_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const VEO_MODEL = process.env.VEO_MODEL?.trim() || "veo-3.1-generate-001";
const VEO_LOCATION = process.env.VEO_LOCATION?.trim() || "us-central1";
const VIDEO_WAIT_MS = 15 * 60 * 1000;

const startedAt = new Map<string, number>();

export type MarketingVideoResult = {
  reply: string;
  assetId?: string;
  assetKind?: "VIDEO";
  assetStatus?: "GENERATING" | "REVIEW" | "FAILED";
  trace?: PlanApiCall[];
};

export type VideoRefresh = {
  status: "GENERATING" | "REVIEW" | "FAILED";
  reply: string;
};

export async function startMarketingVideo(
  sessionId: string,
  text: string,
): Promise<MarketingVideoResult> {
  const calls: PlanApiCall[] = [];
  let products: CatalogueProduct[];
  try {
    products = await syncCatalogue();
  } catch {
    return {
      reply:
        "Catalogue sync failed. Create marketing.catalogue_products and marketing.assets, and let the BigQuery reader edit them. No video was saved.",
    };
  }
  if (products.length === 0) {
    return { reply: "There are no active catalogue products. No video was generated." };
  }
  const selected = matchCatalogueProducts(text, products);
  if (selected.length === 0) {
    const names = products
      .slice(0, 12)
      .map((product) => product.name)
      .join(", ");
    return {
      reply: `That guidance does not name a catalogue product. Active products: ${names}. No video was generated.`,
    };
  }
  const assetId = `asset_${crypto.randomUUID().replaceAll("-", "")}`;
  const prompt = videoPrompt(text, selected);
  let operationName: string;
  try {
    operationName = await beginVideo(assetId, prompt, calls);
  } catch {
    return { reply: "Video generation failed to start. No video was saved.", trace: calls };
  }
  try {
    await insertVideo({
      assetId,
      sessionId,
      productIds: selected.map((product) => product.productId),
      guidance: text,
      operationName,
    });
  } catch {
    return { reply: "The video was started, but saving the review record failed.", trace: calls };
  }
  startedAt.set(assetId, Date.now());
  const names = selected.map((product) => product.name).join(", ");
  return {
    reply: `Video started for review. Products: ${names}.`,
    assetId,
    assetKind: "VIDEO",
    assetStatus: "GENERATING",
    trace: calls,
  };
}

export async function refreshMarketingVideo(assetId: string): Promise<VideoRefresh | null> {
  try {
    return await refreshMarketingVideoOnce(assetId);
  } catch {
    return { status: "GENERATING", reply: "Video is still generating." };
  }
}

async function refreshMarketingVideoOnce(assetId: string): Promise<VideoRefresh | null> {
  const row = await readVideoRow(assetId);
  if (!row) {
    return null;
  }
  if (row.status === "REVIEW") {
    return { status: "REVIEW", reply: "Video ready for review." };
  }
  if (row.status === "FAILED") {
    return { status: "FAILED", reply: "Video generation failed. No video was saved." };
  }
  const began = startedAt.get(assetId) ?? Date.now();
  if (!startedAt.has(assetId)) {
    startedAt.set(assetId, began);
  }
  if (Date.now() - began > VIDEO_WAIT_MS) {
    await markVideo(assetId, "FAILED", null);
    return { status: "FAILED", reply: "The video took longer than 15 minutes. No video was saved." };
  }
  if (!row.operationName || !OPERATION_NAME.test(row.operationName)) {
    await markVideo(assetId, "FAILED", null);
    return { status: "FAILED", reply: "Video generation failed. No video was saved." };
  }
  const outcome = await fetchVideoOperation(row.operationName);
  switch (outcome.state) {
    case "RUNNING":
      return { status: "GENERATING", reply: "Video is still generating." };
    case "FAILED":
      await markVideo(assetId, "FAILED", null);
      return { status: "FAILED", reply: "Video generation failed. No video was saved." };
    case "READY":
      if (!videoUriAllowed(assetId, outcome.gcsUri)) {
        await markVideo(assetId, "FAILED", null);
        return { status: "FAILED", reply: "Video generation failed. No video was saved." };
      }
      await markVideo(assetId, "REVIEW", outcome.gcsUri);
      return { status: "REVIEW", reply: "Video ready for review." };
    default: {
      const unexpected: never = outcome;
      return unexpected;
    }
  }
}

export async function loadMarketingVideo(assetId: string): Promise<Buffer | null> {
  const row = await readVideoRow(assetId);
  if (!row || row.status !== "REVIEW" || !row.gcsUri || !videoUriAllowed(assetId, row.gcsUri)) {
    return null;
  }
  const bucket = marketingBucket();
  const objectName = row.gcsUri.slice(`gs://${bucket}/`.length);
  const token = await googleAccessToken([CLOUD_SCOPE]);
  const response = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}?alt=media`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!response.ok) {
    throw new Error(`Cloud Storage HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export function videoUriAllowed(assetId: string, gcsUri: string): boolean {
  const bucket = marketingBucket();
  const prefix = `gs://${bucket}/videos/${assetId}/`;
  if (!gcsUri.startsWith(prefix)) {
    return false;
  }
  const objectName = gcsUri.slice(`gs://${bucket}/`.length);
  return objectName.length > prefix.length - `gs://${bucket}/`.length && !objectName.includes("..");
}

async function beginVideo(assetId: string, prompt: string, calls: PlanApiCall[]): Promise<string> {
  const { project } = videoProject();
  const url = `https://${VEO_LOCATION}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(VEO_LOCATION)}/publishers/google/models/${encodeURIComponent(VEO_MODEL)}:predictLongRunning`;
  const storageUri = `gs://${marketingBucket()}/videos/${assetId}/`;
  const request = {
    instances: [{ prompt }],
    parameters: {
      storageUri,
      sampleCount: 1,
      durationSeconds: 6,
      aspectRatio: "16:9",
      resolution: "720p",
    },
  };
  const token = await googleAccessToken([CLOUD_SCOPE]);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = (await response.json()) as { name?: string; error?: { message?: string } };
  recordCall(calls, {
    label: "Veo predictLongRunning",
    api: "VEO",
    method: "POST",
    url,
    status: response.status,
    request: jsonBlock({ model: VEO_MODEL, prompt, parameters: request.parameters }, ""),
    response: jsonBlock({ operation: payload.name, error: payload.error?.message }, ""),
  });
  if (!response.ok || !payload.name || !OPERATION_NAME.test(payload.name)) {
    throw new Error("Veo did not start a video");
  }
  return payload.name;
}

type VideoOutcome =
  | { state: "RUNNING" }
  | { state: "FAILED" }
  | { state: "READY"; gcsUri: string };

async function fetchVideoOperation(operationName: string): Promise<VideoOutcome> {
  const { project } = videoProject();
  const url = `https://${VEO_LOCATION}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(VEO_LOCATION)}/publishers/google/models/${encodeURIComponent(VEO_MODEL)}:fetchPredictOperation`;
  const token = await googleAccessToken([CLOUD_SCOPE]);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ operationName }),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = (await response.json()) as {
    done?: boolean;
    error?: { message?: string };
    response?: { videos?: Array<{ gcsUri?: string }> };
  };
  if (!response.ok) {
    return { state: "RUNNING" };
  }
  if (payload.error?.message) {
    return { state: "FAILED" };
  }
  if (!payload.done) {
    return { state: "RUNNING" };
  }
  const gcsUri = payload.response?.videos?.find((video) => video.gcsUri)?.gcsUri;
  if (!gcsUri) {
    return { state: "FAILED" };
  }
  return { state: "READY", gcsUri };
}

async function insertVideo(input: {
  assetId: string;
  sessionId: string;
  productIds: string[];
  guidance: string;
  operationName: string;
}): Promise<void> {
  const { project } = videoProject();
  const parameters: BqQueryParameter[] = [
    { name: "asset_id", type: "STRING", value: input.assetId },
    { name: "session_id", type: "STRING", value: input.sessionId },
    { name: "guidance", type: "STRING", value: input.guidance },
    { name: "gcs_uri", type: "STRING", value: input.operationName },
  ];
  input.productIds.forEach((productId, index) => {
    parameters.push({ name: `product_${index}`, type: "STRING", value: productId });
  });
  const productArray = input.productIds.map((_, index) => `@product_${index}`).join(", ");
  await runBigQuerySql(
    [
      `INSERT INTO \`${project}.marketing.assets\` (`,
      "asset_id, session_id, kind, status, product_ids, guidance, gcs_uri, created_at",
      ")",
      `SELECT @asset_id, @session_id, 'VIDEO', 'GENERATING', [${productArray}], @guidance, @gcs_uri, CURRENT_TIMESTAMP()`,
    ].join("\n"),
    parameters,
  );
}

async function markVideo(
  assetId: string,
  status: "REVIEW" | "FAILED",
  gcsUri: string | null,
): Promise<void> {
  const { project } = videoProject();
  const parameters: BqQueryParameter[] = [
    { name: "asset_id", type: "STRING", value: assetId },
    { name: "status", type: "STRING", value: status },
  ];
  const uriSql = gcsUri ? "@gcs_uri" : "NULL";
  if (gcsUri) {
    parameters.push({ name: "gcs_uri", type: "STRING", value: gcsUri });
  }
  await runBigQuerySql(
    [
      `UPDATE \`${project}.marketing.assets\``,
      `SET status = @status, gcs_uri = ${uriSql}`,
      "WHERE asset_id = @asset_id AND kind = 'VIDEO'",
    ].join("\n"),
    parameters,
  );
}

async function readVideoRow(
  assetId: string,
): Promise<{ status: string; operationName?: string; gcsUri?: string } | null> {
  const { project } = videoProject();
  const body = await runBigQuerySql(
    [
      "SELECT status, gcs_uri, kind",
      `FROM \`${project}.marketing.assets\``,
      "WHERE asset_id = @asset_id",
      "LIMIT 1",
    ].join("\n"),
    [{ name: "asset_id", type: "STRING", value: assetId }],
  );
  const row = body.rows?.[0];
  if (cell(body, row, "kind") !== "VIDEO") {
    return null;
  }
  const status = cell(body, row, "status");
  const stored = cell(body, row, "gcs_uri");
  if (!status) {
    return null;
  }
  return {
    status,
    operationName: stored && OPERATION_NAME.test(stored) ? stored : undefined,
    gcsUri: stored?.startsWith("gs://") ? stored : undefined,
  };
}

function videoProject(): { project: string } {
  const { project } = routeMapConfig();
  if (!IDENTIFIER.test(project) || !IDENTIFIER.test(VEO_LOCATION) || !MODEL_NAME.test(VEO_MODEL)) {
    throw new Error("Marketing project or video model is not valid");
  }
  if (!IDENTIFIER.test(marketingBucket())) {
    throw new Error("Marketing bucket is not valid");
  }
  return { project };
}

function cell(
  body: BqQueryResponse,
  row: { f?: Array<{ v?: string | null }> } | undefined,
  name: string,
): string | undefined {
  const index = (body.schema?.fields ?? []).findIndex((field) => field.name === name);
  const value = row?.f?.[index]?.v;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
