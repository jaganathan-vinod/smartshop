# UC-2 — Store planning

**Actor:** Operations (Cognito group `admin`)  
**Goal:** One admin chat can show current stores and, for a candidate address, nearby competitors and drive times.

Population is out of scope. This chat does not place an order and does not edit the catalogue. The same Planning page also serves UC-3. UC-4 will use it when that use case is built. Express checkout does not use this chat.

## Flow

1. The admin opens `/admin/planning`. The SPA calls `POST /v1/admin/agent/sessions`.
2. A message that matches an image request goes to UC-3. Any other text is a location question.
3. The planner geocodes the candidate. `GEOCODE_REGION` is sent only when that environment variable is set. Express checkout still defaults the region to `us`.
4. It reads active `routes.stores`, calls Places `searchNearby` for `grocery_store`, `supermarket`, and `convenience_store` within 3 km (at most 5 places), then calls Routes `computeRoutes` with `TRAFFIC_UNAWARE` from each current store and each competitor to the candidate.
5. Every successful drive is inserted into `routes.store_plan_results`, including current stores that are far from the candidate.
6. The reply lists choices: the nearest current store first, then competitors ordered by `durationSeconds`. Other current stores stay in BigQuery and are omitted from the list. Each choice carries one route. `routeGeojson` defaults to the nearest current store. Selecting a competitor replaces the map with that route only.
7. The page ends with a collapsed trace of the geocode, Places, and Routes calls. The API key is omitted. Polylines in the trace are clipped.

## DynamoDB

No change. Stores and plan results live in BigQuery. The session map is in the Lambda process. Orders are not written.

## API Gateway

No API Gateway change. Admin paths use the existing JWT `/{proxy+}`. The Lambda checks the Cognito `admin` group, the same way `/v1/admin/reports` does.

| Method and path | Role |
| --- | --- |
| `POST /v1/admin/agent/sessions` | Starts an in-memory session for this admin. Returns `sessionId`. Shared with UC-3. |
| `POST /v1/admin/agent/sessions/{sessionId}/messages` | Sends the operator text. A location turn returns `reply`, `choices`, `routeGeojson`, and `trace`. An image turn returns `assetId` from UC-3. |
| `GET /v1/admin/agent/sessions/{sessionId}` | Returns the messages already stored for that session. Turns finish inside the POST. |

This cut runs the planner inside the API Lambda, using the Maps server key and the BigQuery reader. The session endpoints match the Vertex chat contract so a later Agent Builder session can replace the in-process planner. The browser does not call Places, Routes, or BigQuery.

`GET /v1/admin/routes` stays the existing admin map of `route_results`. Store planning does not replace that endpoint.

## BigQuery

**Read:** active rows in `routes.stores`. This planner does not read or write `routes.express_order_routes`.

**New table** `routes.store_plan_results`. One row per competitor or current-store drive-time computed for a candidate.

```sql
CREATE TABLE IF NOT EXISTS `project-fd286af4-b340-4967-86b.routes.store_plan_results` (
  plan_id STRING NOT NULL,
  candidate_address STRING NOT NULL,
  candidate_lat FLOAT64 NOT NULL,
  candidate_lng FLOAT64 NOT NULL,
  subject_kind STRING NOT NULL,
  subject_name STRING NOT NULL,
  place_id STRING,
  origin_store_id STRING,
  distance_meters INT64,
  duration_seconds FLOAT64,
  route_geography GEOGRAPHY,
  computed_at TIMESTAMP NOT NULL
)
PARTITION BY DATE(computed_at)
CLUSTER BY plan_id;
```

`subject_kind` is `COMPETITOR` or `CURRENT_STORE`. `route_geography` is the drive line when Routes returned one. The chat map uses the GeoJSON already on the chosen `choices` entry. Current-store lines are blue (`#1a73e8`) and competitor lines are red (`#c5221f`). A grey map immediately after a selection is tiles loading.

Places field mask is `places.id,places.displayName,places.location`. Routes and Places request headers recorded in the trace omit `X-Goog-Api-Key`.

**Unchanged:** `routes.od_pairs`, `routes.geocode_cache`, `routes.route_results`.

## Failure

| Condition | Result |
| --- | --- |
| Caller is not `admin` | 403. |
| Candidate address cannot be geocoded | The chat replies with that failure. No plan rows. |
| Places or Routes fails | The chat replies with that failure. Partial rows from the same `plan_id` are not kept. |
