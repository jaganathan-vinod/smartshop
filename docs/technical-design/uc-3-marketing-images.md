# UC-3 — Catalogue marketing images

**Actor:** Marketing (Cognito group `admin`)  
**Goal:** In the same admin chat as store planning, generate still images from the catalogue and the operator’s guidance, then hold them for review.

Images are not written onto products and are not shown on the storefront. Video is UC-4. The shopping assistant cannot open this chat.

## Flow

1. The operator uses the session from UC-2 (`POST /v1/admin/agent/sessions` and `.../messages`).
2. Vertex routes a catalogue or image request to the RAG data store, whose source table is `marketing.catalogue_products`.
3. An image request calls Imagen with the guidance plus the selected product names, descriptions, and image URLs from that table.
4. The PNG is stored in Cloud Storage. One row is inserted in `marketing.assets` with `kind = IMAGE` and `status = REVIEW`.
5. The chat reply includes `assetId`. The SPA loads the bytes through `GET /v1/admin/marketing/assets/{assetId}`.
6. Nothing in this flow updates DynamoDB Products or the public catalogue.

A sync job copies active products from DynamoDB into `marketing.catalogue_products` and refreshes the Vertex RAG data store. The sync is not a customer request.

## DynamoDB

No schema change. Products stay the source for name, description, category, price, and `imageUrl`. The sync reads them. It does not add columns.

Orders, Carts, Users, Conversations, and ReportJobs are not used.

## API Gateway

No API Gateway change. Paths sit on the existing admin JWT proxy.

| Method and path | Role |
| --- | --- |
| `POST /v1/admin/agent/sessions` | Shared with UC-2 and UC-4. |
| `POST /v1/admin/agent/sessions/{sessionId}/messages` | Image turns return `assetId` when Imagen finishes. |
| `GET /v1/admin/marketing/assets/{assetId}` | Admin-only. Streams the GCS object for review. Shared with UC-4. |

Imagen is called from Vertex, not from the browser and not as a new API Gateway integration.

## BigQuery

**New dataset** `marketing`.

**New table** `marketing.catalogue_products`. RAG source. Replaced by the sync. Not edited from the chat.

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
| Guidance names a product that is not in `catalogue_products` | The agent says so and does not call Imagen. |
| Imagen fails | Chat error. No `marketing.assets` row. |
| GCS upload fails | No asset row. |
