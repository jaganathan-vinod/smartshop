# Technical design — location and marketing

Companion to the business use cases. Shopping stays on the existing CloudFront SPA, Cognito, API Gateway, and order Lambda. Location, planning, and marketing media run in GCP project `project-fd286af4-b340-4967-86b`.

| Use case | Document |
| --- | --- |
| UC-1 Express route at checkout | [uc-1-express-route.md](uc-1-express-route.md) |
| UC-2 Store planning | [uc-2-store-planning.md](uc-2-store-planning.md) |
| UC-3 Catalogue marketing images | [uc-3-marketing-images.md](uc-3-marketing-images.md) |
| UC-4 Catalogue marketing video | [uc-4-marketing-video.md](uc-4-marketing-video.md) |

UC-2, UC-3, and UC-4 share one embedded Vertex Agent Builder chat. Express checkout does not go through that chat.

## API Gateway

No new API, authorizer, or route. Authenticated calls already match `/{proxy+}` with the Cognito JWT authorizer (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`). New Lambda paths are code on that proxy. CORS already allows `Authorization` and `Content-Type`.

The browser does not call Geocoding, Routes, Places, BigQuery, Imagen, or Veo. Those stay on GCP. The SPA draws maps with the existing referrer-restricted Maps JavaScript key.

## DynamoDB

No new tables. The only change is optional attributes on the existing **Orders** item, and only for UC-1. Products, Users, Carts, OrderNumbers, Conversations, and ReportJobs stay as they are.

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
