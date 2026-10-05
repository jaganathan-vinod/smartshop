import { storedCallMatches } from "./trace.js";
import type { CampaignAsset } from "./surface.js";
import { googleAccessToken } from "../routes-map/client.js";
import { GcpAgentError } from "./query.js";

const CLOUD_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

export type GcpAssetFile = {
  bytes: Uint8Array;
  contentType: string;
};

export type StoredAssetKind = "image" | "video" | "either";

type ListedObject = { name: string; updated: string };

export function pickLatestAsset(items: ListedObject[], prefer: StoredAssetKind): CampaignAsset | undefined {
  let newest: { asset: CampaignAsset; updated: string } | undefined;
  for (const item of items) {
    const asset = assetFromObjectName(item.name);
    if (!asset || !matchesPreference(asset.kind, prefer) || !item.updated) {
      continue;
    }
    if (!newest || item.updated > newest.updated) {
      newest = { asset, updated: item.updated };
    }
  }
  return newest?.asset;
}

export async function latestStoredAsset(
  prefer: StoredAssetKind,
  fetchImpl: typeof fetch = fetch,
): Promise<CampaignAsset | undefined> {
  const bucket = marketingBucket();
  const token = await googleAccessToken([CLOUD_SCOPE]);
  const [images, videos] = await Promise.all([
    listObjects(token, bucket, "campaigns/", fetchImpl),
    listObjects(token, bucket, "videos/", fetchImpl),
  ]);
  return pickLatestAsset([...images, ...videos], prefer);
}

export async function loadStoredMarketingTraces(
  prompts: string[],
  assetIds: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<unknown[]> {
  const bucket = marketingBucket();
  const token = await googleAccessToken([CLOUD_SCOPE]);
  const wanted = new Set(assetIds);
  const calls: unknown[] = [];
  for (const assetId of wanted) {
    calls.push(...(await readTraceFile(token, bucket, `traces/${assetId}.json`, fetchImpl)));
  }
  if (prompts.length === 0) {
    return calls;
  }
  const listed = await listObjects(token, bucket, "traces/", fetchImpl);
  const names = listed
    .filter((item) => item.name.endsWith(".json") && !wanted.has(assetIdFromTraceName(item.name)))
    .sort((left, right) => right.updated.localeCompare(left.updated))
    .slice(0, 15);
  for (const item of names) {
    for (const call of await readTraceFile(token, bucket, item.name, fetchImpl)) {
      if (storedCallMatches(call, prompts)) {
        calls.push(call);
      }
    }
  }
  return calls;
}

export async function loadGcpAsset(assetId: string, fetchImpl: typeof fetch = fetch): Promise<GcpAssetFile | undefined> {
  const bucket = marketingBucket();
  const token = await googleAccessToken([CLOUD_SCOPE]);
  const image = await download(token, bucket, `campaigns/${assetId}.png`, fetchImpl);
  if (image) {
    return { bytes: image, contentType: "image/png" };
  }
  const videoName = await firstVideo(token, bucket, assetId, fetchImpl);
  if (!videoName) {
    return undefined;
  }
  const video = await download(token, bucket, videoName, fetchImpl);
  if (!video) {
    return undefined;
  }
  return { bytes: video, contentType: "video/mp4" };
}

function assetIdFromTraceName(name: string): string {
  return name.match(/^traces\/(asset_[a-f0-9]{12})\.json$/i)?.[1] ?? "";
}

async function readTraceFile(token: string, bucket: string, objectName: string, fetchImpl: typeof fetch): Promise<unknown[]> {
  const bytes = await download(token, bucket, objectName, fetchImpl);
  if (!bytes) {
    return [];
  }
  try {
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as { calls?: unknown[] };
    return Array.isArray(payload.calls) ? payload.calls : [];
  } catch {
    return [];
  }
}

function marketingBucket(): string {
  return process.env.MARKETING_GCS_BUCKET?.trim() || "smartshop-marketing";
}

function matchesPreference(kind: CampaignAsset["kind"], prefer: StoredAssetKind): boolean {
  switch (prefer) {
    case "either":
      return true;
    case "image":
    case "video":
      return kind === prefer;
    default: {
      const unexpected: never = prefer;
      return unexpected;
    }
  }
}

function assetFromObjectName(name: string): CampaignAsset | undefined {
  const image = name.match(/^campaigns\/(asset_[a-f0-9]{12})\.png$/i);
  if (image?.[1]) {
    return { assetId: image[1], kind: "image", status: "REVIEW" };
  }
  const video = name.match(/^videos\/(asset_[a-f0-9]{12})\/[^/]+\.mp4$/i);
  if (video?.[1]) {
    return { assetId: video[1], kind: "video", status: "REVIEW" };
  }
  return undefined;
}

async function listObjects(
  token: string,
  bucket: string,
  prefix: string,
  fetchImpl: typeof fetch,
): Promise<ListedObject[]> {
  const items: ListedObject[] = [];
  let pageToken = "";
  for (let page = 0; page < 5; page += 1) {
    const url = new URL(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o`);
    url.searchParams.set("prefix", prefix);
    url.searchParams.set("maxResults", "100");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }
    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status === 404) {
      return items;
    }
    if (!response.ok) {
      throw new GcpAgentError("The asset could not be loaded");
    }
    const body = (await response.json()) as { items?: { name?: string; updated?: string }[]; nextPageToken?: string };
    for (const item of body.items ?? []) {
      if (item.name && item.updated) {
        items.push({ name: item.name, updated: item.updated });
      }
    }
    pageToken = body.nextPageToken ?? "";
    if (!pageToken) {
      break;
    }
  }
  return items;
}

async function firstVideo(
  token: string,
  bucket: string,
  assetId: string,
  fetchImpl: typeof fetch,
): Promise<string | undefined> {
  const prefix = `videos/${assetId}/`;
  const url = new URL(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o`);
  url.searchParams.set("prefix", prefix);
  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    throw new GcpAgentError("The asset could not be loaded");
  }
  const body = (await response.json()) as { items?: { name?: string }[] };
  return body.items?.find((item) => {
    const name = item.name ?? "";
    return name.startsWith(prefix) && name.endsWith(".mp4") && !name.includes("..");
  })?.name;
}

async function download(
  token: string,
  bucket: string,
  objectName: string,
  fetchImpl: typeof fetch,
): Promise<Uint8Array | undefined> {
  const response = await fetchImpl(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}?alt=media`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    throw new GcpAgentError("The asset could not be loaded");
  }
  return new Uint8Array(await response.arrayBuffer());
}
