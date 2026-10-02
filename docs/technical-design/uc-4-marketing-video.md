# UC-4 — Catalogue marketing video

**Actor:** Marketing (Cognito group `admin`)  
**Goal:** In the same admin chat, generate a short marketing video from catalogue products and the operator’s guidance, then hold it for review.

Still images stay in UC-3. The video is not published to the storefront. The shopping assistant cannot start this flow.

## Flow

1. The operator sends a video request on the existing session (`POST /v1/admin/agent/sessions/{sessionId}/messages`).
2. Vertex checks the named products against `marketing.catalogue_products`, then starts a Veo job.
3. A `marketing.assets` row is inserted with `kind = VIDEO` and `status = GENERATING`.
4. The message response returns `assetId` and `status = GENERATING` without waiting for the file.
5. The SPA polls `GET /v1/admin/agent/sessions/{sessionId}` until Vertex reports the job finished.
6. The worker writes the MP4 to Cloud Storage, sets `gcs_uri`, and sets `status = REVIEW`.
7. The SPA plays it through `GET /v1/admin/marketing/assets/{assetId}`.

Veo does not run inside the API Gateway or Lambda timeout. The Lambda only starts the session turn and reads status.

## DynamoDB

No change. The review record is the BigQuery row. Product fields are read from `marketing.catalogue_products`, which is synced from the existing Products table.

## API Gateway

No API Gateway change. Video uses the same admin JWT proxy paths as UC-3.

| Method and path | Role |
| --- | --- |
| `POST /v1/admin/agent/sessions/{sessionId}/messages` | Starts the Veo job. Returns `assetId` and `status = GENERATING`. |
| `GET /v1/admin/agent/sessions/{sessionId}` | Polls until `status` is `REVIEW` or `FAILED`. |
| `GET /v1/admin/marketing/assets/{assetId}` | Streams the MP4 after `status = REVIEW`. |

No new authorizer and no new API Gateway route. The browser does not call Veo.

## BigQuery

No new table. UC-4 writes `marketing.assets` from UC-3.

| Column | Video value |
| --- | --- |
| `kind` | `VIDEO` |
| `status` | `GENERATING`, then `REVIEW` or `FAILED` |
| `product_ids` | Catalogue ids named in the guidance |
| `guidance` | Operator text |
| `gcs_uri` | MP4 location. Empty while `GENERATING`. |

`marketing.catalogue_products` is read and not updated by the video job. `routes.*` is not used.

## Failure

| Condition | Result |
| --- | --- |
| Caller is not `admin` | 403. |
| A named product is missing from `catalogue_products` | The agent refuses. No asset row. |
| Veo rejects the job | `status = FAILED`. No `gcs_uri`. The chat shows the failure. |
| The poll exceeds 15 minutes | `status = FAILED`. The SPA stops polling. |
