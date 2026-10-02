# Technical design — location and marketing

Companion to the business use cases. Shopping stays on the existing CloudFront SPA, Cognito, API Gateway, and order Lambda. Location, planning, and marketing media run in GCP project `project-fd286af4-b340-4967-86b`.

| Use case | Document |
| --- | --- |
| UC-1 Express route at checkout | [uc-1-express-route.md](uc-1-express-route.md) |
| UC-2 Store planning | [uc-2-store-planning.md](uc-2-store-planning.md) |
| UC-3 Catalogue marketing images | [uc-3-marketing-images.md](uc-3-marketing-images.md) |
| UC-4 Catalogue marketing video | [uc-4-marketing-video.md](uc-4-marketing-video.md) |

UC-1, UC-2, and UC-3 are built and deployed. UC-4 is designed and not started. UC-2 and UC-3 share the admin Planning page. Express checkout does not go through that chat. A later Vertex Agent Builder session can replace the in-process planner and image branch. The session endpoints already match that contract.

## Status

| Use case | State |
| --- | --- |
| UC-1 Express route | Built. Geocode, Routes, BigQuery insert, order map, and a saved Google call trace. |
| UC-2 Store planning | Built. Lambda planner, selectable single-route map, Places and Routes trace. |
| UC-3 Catalogue images | Built. Catalogue sync, Gemini stills, Cloud Storage, review row. Live Imagen 3 calls returned HTTP 404; the model switch is deployed. A successful Gemini image on the live site is not yet confirmed. |
| UC-4 Catalogue video | Not built. |

## Findings

Recorded while building and running the first three use cases. Secret values stay in Secrets Manager and `web/.env`.

**Two Maps keys.** The browser key in CloudFront `config.json` (`mapsBrowserKey`) is referrer-restricted. It draws tiles in the SPA. It cannot geocode or call Routes or Places from Lambda. Those calls use the plaintext server key in AWS secret `smartshop/maps-server` (`MAPS_SERVER_SECRET_ID`).

**One reader for BigQuery, Vertex, and Cloud Storage.** AWS secret `smartshop/bq-reader` (`BQ_READER_SECRET_ID`) is the service account `smartshop-router-reader`. BigQuery queries use scope `https://www.googleapis.com/auth/bigquery`. Image generation and the GCS upload use the same account with scope `https://www.googleapis.com/auth/cloud-platform`. Tokens are cached per scope string.

**Dataset IAM.** `bq add-iam-policy-binding` on `marketing` failed with “This feature requires allowlisting.” The working grant is the legacy dataset ACL: `WRITER` for that service account, applied with `bq update`. `WRITER` is enough to delete and insert. The reader does not create tables. Catalogue sync succeeding on the live site shows the `marketing` write ACL is in place. `routes.stores`, `routes.express_order_routes`, and `routes.store_plan_results` already accept writes from the same account.

**Vertex image models.** `imagen-3.0-generate-002` at `us-central1` `:predict` returned HTTP 404: the publisher model was not found. Imagen 3 publisher models were discontinued on 30 June 2026. The live call is now `gemini-3.1-flash-image` at location `global`. A global model uses host `https://aiplatform.googleapis.com`. The host `global-aiplatform.googleapis.com` is wrong. The method is `:generateContent`, with `responseModalities` `TEXT` and `IMAGE`. `gemini-2.5-flash-image` retires on 2 October 2026. Overrides are `IMAGEN_MODEL` and `VERTEX_LOCATION`.

**Timeouts.** The API Lambda timeout is 60 seconds. The HTTP API integration returns in about 30 seconds, so the image request aborts at 25 seconds. The GCS upload aborts at 20 seconds.

**Call traces.** Geocoding, Places, Routes, and image generation are recorded as `PlanApiCall` rows (`GEOCODE`, `PLACES`, `ROUTES`, `IMAGEN`). The URL and JSON have the API key replaced with `[redacted]`. Polylines are clipped. Image traces store the byte length, not the base64. At most 40 calls are kept. The SPA renders them in a collapsed section. Standard orders do not call Google and have no trace.

**Sessions.** Planning sessions live in the Lambda process memory. A new Lambda instance starts an empty chat. UC-4 polling is specified and not implemented.

## API Gateway

No new API, authorizer, or route. Authenticated calls already match `/{proxy+}` with the Cognito JWT authorizer (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`). New Lambda paths are code on that proxy. CORS already allows `Authorization` and `Content-Type`.

The browser does not call Geocoding, Routes, Places, BigQuery, Imagen, or Veo. Those stay on GCP. The SPA draws maps with the existing referrer-restricted Maps JavaScript key.

## DynamoDB

No new tables. The only change is optional attributes on the existing **Orders** item, and only for UC-1: `deliveryAddress`, `expressRouteId`, and `trace`. `GET /v1/orders` strips `trace` so the list stays small. Products, Users, Carts, OrderNumbers, Conversations, and ReportJobs stay as they are.

## BigQuery

Existing dataset `routes` keeps `od_pairs`, `geocode_cache`, and `route_results`. The admin Map page keeps reading `route_results`. New tables:

| Table | Use case |
| --- | --- |
| `routes.stores` | UC-1, UC-2 |
| `routes.express_order_routes` | UC-1 |
| `routes.store_plan_results` | UC-2 |
| `marketing.catalogue_products` | UC-3, UC-4 RAG source |
| `marketing.assets` | UC-3, UC-4 review records |

Example rows for each table are in [sample-data.md](sample-data.md).
