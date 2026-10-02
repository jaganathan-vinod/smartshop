import type { PlanApiCall } from "@smartshop/shared";
import { listAllProducts } from "../../catalog/store.js";
import { jsonBlock, recordCall } from "../agent/plan-trace.js";
import { googleAccessToken, runBigQuerySql, type BqQueryParameter } from "../routes-map/client.js";
import { routeMapConfig, type BqQueryResponse } from "../routes-map/query.js";
import {
  imagenPrompt,
  matchCatalogueProducts,
  type CatalogueProduct,
} from "./intent.js";

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/;
const MODEL_NAME = /^[A-Za-z][A-Za-z0-9._-]{0,80}$/;
const CLOUD_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const IMAGEN_MODEL = process.env.IMAGEN_MODEL?.trim() || "gemini-3.1-flash-image";
const VERTEX_LOCATION = process.env.VERTEX_LOCATION?.trim() || "global";

export type MarketingImageResult = {
  reply: string;
  assetId?: string;
  trace?: PlanApiCall[];
};

export function marketingBucket(): string {
  return process.env.MARKETING_GCS_BUCKET?.trim() || "smartshop-marketing";
}

export function marketingObjectName(assetId: string): string {
  return `${assetId}.png`;
}

export async function generateMarketingImage(
  sessionId: string,
  text: string,
): Promise<MarketingImageResult> {
  const calls: PlanApiCall[] = [];
  let products: CatalogueProduct[];
  try {
    products = await syncCatalogue();
  } catch {
    return {
      reply:
        "Catalogue sync failed. Create marketing.catalogue_products and marketing.assets, and let the BigQuery reader edit them. No image was saved.",
    };
  }
  if (products.length === 0) {
    return { reply: "There are no active catalogue products. No image was generated." };
  }
  const selected = matchCatalogueProducts(text, products);
  if (selected.length === 0) {
    const names = products
      .slice(0, 12)
      .map((product) => product.name)
      .join(", ");
    return {
      reply: `That guidance does not name a catalogue product. Active products: ${names}. No image was generated.`,
    };
  }
  const prompt = imagenPrompt(text, selected);
  let png: Buffer;
  try {
    png = await renderImage(prompt, calls);
  } catch {
    return { reply: "Image generation failed. No image was saved.", trace: calls };
  }
  const assetId = `asset_${crypto.randomUUID().replaceAll("-", "")}`;
  const bucket = marketingBucket();
  const objectName = marketingObjectName(assetId);
  try {
    await uploadPng(bucket, objectName, png);
  } catch {
    return { reply: "The image was generated, but storing it failed. No review record was saved.", trace: calls };
  }
  try {
    await insertAsset({
      assetId,
      sessionId,
      productIds: selected.map((product) => product.productId),
      guidance: text,
      gcsUri: `gs://${bucket}/${objectName}`,
    });
  } catch {
    return { reply: "The image was stored, but saving the review record failed.", trace: calls };
  }
  const names = selected.map((product) => product.name).join(", ");
  return {
    reply: `Image ready for review. Products: ${names}.`,
    assetId,
    trace: calls,
  };
}

export async function loadMarketingPng(assetId: string): Promise<Buffer | null> {
  const { project } = marketingDataset();
  const body = await runBigQuerySql(
    [
      "SELECT gcs_uri, kind, status",
      `FROM \`${project}.marketing.assets\``,
      "WHERE asset_id = @asset_id",
      "LIMIT 1",
    ].join("\n"),
    [{ name: "asset_id", type: "STRING", value: assetId }],
  );
  const row = body.rows?.[0];
  const kind = cell(body, row, "kind");
  const status = cell(body, row, "status");
  const gcsUri = cell(body, row, "gcs_uri");
  const expected = `gs://${marketingBucket()}/${marketingObjectName(assetId)}`;
  if (kind !== "IMAGE" || status !== "REVIEW" || gcsUri !== expected) {
    return null;
  }
  const token = await googleAccessToken([CLOUD_SCOPE]);
  const response = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(marketingBucket())}/o/${encodeURIComponent(marketingObjectName(assetId))}?alt=media`,
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

async function syncCatalogue(): Promise<CatalogueProduct[]> {
  const products = (await listAllProducts())
    .filter((product) => product.active)
    .map((product) => ({
      productId: product.productId,
      name: product.name,
      description: product.description,
      category: product.category,
      unitPriceCents: product.unitPriceCents,
      imageUrl: product.imageUrl,
    }));
  const { project } = marketingDataset();
  await runBigQuerySql(`DELETE FROM \`${project}.marketing.catalogue_products\` WHERE TRUE`);
  if (products.length === 0) {
    return [];
  }
  const parameters: BqQueryParameter[] = [];
  const selects = products.map((product, index) => {
    parameters.push(
      { name: `id_${index}`, type: "STRING", value: product.productId },
      { name: `name_${index}`, type: "STRING", value: product.name },
      { name: `description_${index}`, type: "STRING", value: product.description.slice(0, 2000) },
      { name: `category_${index}`, type: "STRING", value: product.category },
      { name: `price_${index}`, type: "INT64", value: String(product.unitPriceCents) },
      { name: `image_${index}`, type: "STRING", value: product.imageUrl },
    );
    return `SELECT @id_${index}, @name_${index}, @description_${index}, @category_${index}, @price_${index}, @image_${index}, TRUE, CURRENT_TIMESTAMP()`;
  });
  await runBigQuerySql(
    [
      `INSERT INTO \`${project}.marketing.catalogue_products\` (`,
      "product_id, name, description, category, unit_price_cents, image_url, active, synced_at",
      ")",
      selects.join("\nUNION ALL\n"),
    ].join("\n"),
    parameters,
  );
  return products;
}

async function renderImage(prompt: string, calls: PlanApiCall[]): Promise<Buffer> {
  const { project } = marketingDataset();
  const url = `${vertexHost(VERTEX_LOCATION)}/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(VERTEX_LOCATION)}/publishers/google/models/${encodeURIComponent(IMAGEN_MODEL)}:generateContent`;
  const request = {
    contents: { role: "USER", parts: [{ text: prompt }] },
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: { aspectRatio: "1:1" },
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
    signal: AbortSignal.timeout(25_000),
  });
  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { mimeType?: string; data?: string };
          inline_data?: { mimeType?: string; data?: string };
        }>;
      };
    }>;
    error?: { message?: string };
  };
  const inline = payload.candidates
    ?.flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.inlineData ?? part.inline_data)
    .find((part) => part?.data);
  recordCall(calls, {
    label: "Gemini image generateContent",
    api: "IMAGEN",
    method: "POST",
    url,
    status: response.status,
    request: jsonBlock({ model: IMAGEN_MODEL, prompt, generationConfig: request.generationConfig }, ""),
    response: jsonBlock(
      {
        mimeType: inline?.mimeType,
        bytes: inline?.data ? Buffer.from(inline.data, "base64").length : 0,
        error: payload.error?.message,
      },
      "",
    ),
  });
  if (!response.ok || !inline?.data) {
    throw new Error("Image generation did not return an image");
  }
  return Buffer.from(inline.data, "base64");
}

function vertexHost(location: string): string {
  return location === "global"
    ? "https://aiplatform.googleapis.com"
    : `https://${location}-aiplatform.googleapis.com`;
}

async function uploadPng(bucket: string, objectName: string, png: Buffer): Promise<void> {
  const token = await googleAccessToken([CLOUD_SCOPE]);
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "image/png",
    },
    body: new Uint8Array(png),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`Cloud Storage HTTP ${response.status}`);
  }
}

async function insertAsset(input: {
  assetId: string;
  sessionId: string;
  productIds: string[];
  guidance: string;
  gcsUri: string;
}): Promise<void> {
  const { project } = marketingDataset();
  const parameters: BqQueryParameter[] = [
    { name: "asset_id", type: "STRING", value: input.assetId },
    { name: "session_id", type: "STRING", value: input.sessionId },
    { name: "guidance", type: "STRING", value: input.guidance },
    { name: "gcs_uri", type: "STRING", value: input.gcsUri },
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
      `SELECT @asset_id, @session_id, 'IMAGE', 'REVIEW', [${productArray}], @guidance, @gcs_uri, CURRENT_TIMESTAMP()`,
    ].join("\n"),
    parameters,
  );
}

function marketingDataset(): { project: string } {
  const { project } = routeMapConfig();
  if (!IDENTIFIER.test(project) || !IDENTIFIER.test(VERTEX_LOCATION) || !MODEL_NAME.test(IMAGEN_MODEL)) {
    throw new Error("Marketing project or model is not valid");
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
