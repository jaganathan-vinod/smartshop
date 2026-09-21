import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Context, Hono } from "hono";
import { currentClaims } from "../auth.js";
import { s3Client } from "../db.js";
import { assistantUploadsBucket } from "../env.js";
import { jsonError } from "../http.js";

function requireUser(c: Context) {
  const claims = currentClaims();
  if (!claims) {
    return { error: jsonError(c, 401, "UNAUTHENTICATED", "Sign in required") };
  }
  return { claims };
}

export function registerAssistantUploadRoutes(app: Hono): void {
  app.post("/v1/assistant/uploads", async (c) => {
    const auth = requireUser(c);
    if ("error" in auth) {
      return auth.error;
    }
    const bucket = assistantUploadsBucket();
    if (!bucket) {
      return jsonError(c, 503, "UPLOADS_DISABLED", "Assistant uploads are not configured");
    }
    const objectKey = `${auth.claims.sub}/${crypto.randomUUID()}`;
    const uploadUrl = await getSignedUrl(
      s3Client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        ContentType: "image/jpeg",
      }),
      { expiresIn: 60 },
    );
    return c.json({ uploadUrl, objectKey });
  });
}
