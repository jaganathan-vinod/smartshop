import { googleAccessToken } from "../routes-map/client.js";
import { GcpAgentError } from "./query.js";

const CLOUD_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

export type GcpAssetFile = {
  bytes: Uint8Array;
  contentType: string;
};

export async function loadGcpAsset(assetId: string, fetchImpl: typeof fetch = fetch): Promise<GcpAssetFile | undefined> {
  const bucket = process.env.MARKETING_GCS_BUCKET?.trim() || "smartshop-marketing";
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
