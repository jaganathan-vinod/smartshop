# UC-3 — Catalogue marketing images

**Actor:** Marketing (Cognito group `admin`)  
**Goal:** In the same admin chat as store planning, generate still images from the catalogue and the operator’s guidance, then hold them for review.

Images are not written onto products and are not shown on the storefront. Video is UC-4. The shopping assistant cannot open this chat.

## Flow

1. The operator opens `/admin/marketing`, which starts a marketing session. Store planning stays on `/admin/planning`.
2. The message is an image request when it matches `\b(image|images|poster|photo|picture|render|visual|artwork|creative)\b`. A video request is UC-4. Other marketing text asks for an image or a short video.
3. The Lambda replaces `marketing.catalogue_products` on that request: delete every row, then insert the active DynamoDB products.
4. Up to four products match. A match is the full product name, or every word in the name that is at least four characters. An unknown product returns the active names and does not generate.
5. The prompt includes each product name, up to 400 characters of description, the catalogue image URL as text, and the operator guidance. It asks for no text or logos unless the guidance asks. The model does not fetch that URL as a reference image.
6. Vertex `generateContent` runs on `gemini-3.1-flash-image` at location `global`. The host is `https://aiplatform.googleapis.com`. The body sets `responseModalities` to `TEXT` and `IMAGE` and `imageConfig.aspectRatio` to `1:1`. Bytes come from `candidates[].content.parts[].inlineData.data` (or `inline_data`). The fetch aborts at 25 seconds.
7. The object is uploaded to `gs://smartshop-marketing/{assetId}.png`. The name stays `.png` even when the bytes are JPEG. One row is inserted in `marketing.assets` with `kind = IMAGE` and `status = REVIEW`.
8. The chat reply includes `assetId`. The SPA loads the bytes through `GET /v1/admin/marketing/assets/{assetId}` with the admin ID token and an object URL. The response is `image/jpeg` when the first two bytes are `FF D8`, otherwise `image/png`.
9. Nothing in this flow updates DynamoDB Products or the public catalogue.

`IMAGEN_MODEL` and `VERTEX_LOCATION` override the model and location. `MARKETING_GCS_BUCKET` overrides the bucket. The default bucket name is `smartshop-marketing`. The trace label is “Gemini image generateContent” and `api` stays `IMAGEN`. The recorded response is the MIME type and byte length.

## DynamoDB

No schema change. Products stay the source for name, description, category, price, and `imageUrl`. The sync reads them. It does not add columns.

Orders, Carts, Users, Conversations, and ReportJobs are not used.

## API Gateway

No API Gateway change. Paths sit on the existing admin JWT proxy.

| Method and path | Role |
| --- | --- |
| `POST /v1/admin/agent/sessions` | Shared with UC-2 and UC-4. |
| `POST /v1/admin/agent/sessions/{sessionId}/messages` | Image turns return `assetId` and `trace` when generation finishes. |
| `GET /v1/admin/marketing/assets/{assetId}` | Admin-only. Streams the GCS object for review. Shared with UC-4. |

Image generation runs inside the API Lambda, not in the browser and not as a new API Gateway integration. A location question still uses the UC-2 planner.

## BigQuery

**New dataset** `marketing`.

**New table** `marketing.catalogue_products`. Replaced on every image request from active DynamoDB products. The chat does not edit it.

```sql
CREATE TABLE IF NOT EXISTS `project-fd286af4-b340-4967-86b.marketing.catalogue_products` (
  product_id STRING NOT NULL,
  name STRING NOT NULL,
  description STRING,
  category STRING,
  unit_price_cents INT64 NOT NULL,
  image_url STRING,
  active BOOL NOT NULL,
  synced_at TIMESTAMP NOT NULL
)
CLUSTER BY product_id;
```

**New table** `marketing.assets`. Review record. UC-4 uses the same table with `kind = VIDEO`.

```sql
CREATE TABLE IF NOT EXISTS `project-fd286af4-b340-4967-86b.marketing.assets` (
  asset_id STRING NOT NULL,
  session_id STRING NOT NULL,
  kind STRING NOT NULL,
  status STRING NOT NULL,
  product_ids ARRAY<STRING>,
  guidance STRING NOT NULL,
  gcs_uri STRING,
  created_at TIMESTAMP NOT NULL
)
PARTITION BY DATE(created_at)
CLUSTER BY asset_id;
```

For this use case `kind` is `IMAGE` and `status` is `REVIEW`. `gcs_uri` points at the PNG. There is no publish status in this cut.

## Failure

| Condition | Result |
| --- | --- |
| Caller is not `admin` | 403. |
| Guidance names a product that is not in the synced catalogue | The reply lists active names. No image call. |
| Image generation fails | “Image generation failed. No image was saved.” The trace is still returned. No asset row. |
| GCS upload fails | No asset row. |
| The object uploaded and the BigQuery insert failed | The chat says the review record failed. The object can remain in the bucket. |

## Findings

A live Planning request for the Ceramic Mug synced the catalogue and matched the product (“12 oz matte mug. Dishwasher safe.” plus its catalogue image URL). The following call returned HTTP 404 and zero image bytes:

`POST https://us-central1-aiplatform.googleapis.com/v1/projects/project-fd286af4-b340-4967-86b/locations/us-central1/publishers/google/models/imagen-3.0-generate-002:predict`

The error was that the publisher model was not found or the project does not have access. Imagen 3 publisher models were discontinued on 30 June 2026. The replacement above is deployed. A later live retry that returns image bytes has not been confirmed. If that retry fails on Cloud Storage or Vertex after a successful `generateContent`, the reader still needs `roles/storage.objectAdmin` on `gs://smartshop-marketing` and `roles/aiplatform.user` on the project. Those grants are separate from the dataset ACL that already lets catalogue sync succeed.
