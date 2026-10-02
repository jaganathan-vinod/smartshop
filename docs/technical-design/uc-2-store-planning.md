# UC-2 — Store planning

**Actor:** Operations (Cognito group `admin`)  
**Goal:** One admin chat can show current stores and, for a candidate address, nearby competitors and drive times.

Population is out of scope. This chat does not place an order and does not edit the catalogue. The same Vertex Agent Builder agent also serves UC-3 and UC-4. Location turns call the BigQuery data agent as a tool. The map beside the chat draws any lines that tool returns.

## Flow

1. The admin opens the operations chat. The SPA calls `POST /v1/admin/agent/sessions` and embeds the reply stream.
2. A location question is handled by Vertex, which invokes the BigQuery data agent.
3. The data agent may read `routes.stores`, `routes.express_order_routes`, and `routes.store_plan_results`. It may also ask the route service to geocode a candidate address, call Places for competitors, and call Routes for drive times.
4. New competitor and drive-time rows are inserted into `routes.store_plan_results`.
5. The chat reply includes the GeoJSON for the map. The SPA draws it with the Maps JavaScript API.

Express checkout (UC-1) does not use this chat.

## DynamoDB

No change. Stores and plan results live in BigQuery. Session state lives in Vertex. Orders are not written.

## API Gateway

No API Gateway change. Admin paths use the existing JWT `/{proxy+}`. The Lambda checks the Cognito `admin` group, the same way `/v1/admin/reports` does.

| Method and path | Role |
| --- | --- |
| `POST /v1/admin/agent/sessions` | Starts a Vertex session for this admin. Returns `sessionId`. Shared with UC-3 and UC-4. |
| `POST /v1/admin/agent/sessions/{sessionId}/messages` | Sends the operator text. Returns the agent reply, optional `routeGeojson`, and optional asset ids from UC-3 or UC-4. |
| `GET /v1/admin/agent/sessions/{sessionId}` | Polls a turn that is still running. |

The browser does not hold a GCP key. The Lambda exchanges the admin JWT for a short-lived Vertex session. Places, Routes, and BigQuery are called from GCP, not from API Gateway.

`GET /v1/admin/routes` stays the existing admin map of `route_results`. Store planning does not replace that endpoint.

## BigQuery

**Read:** `routes.stores` and `routes.express_order_routes` from UC-1. The data agent must not mutate `express_order_routes`.

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

`subject_kind` is `COMPETITOR` or `CURRENT_STORE`. `route_geography` is the drive line when Routes returned one. The chat map uses `ST_ASGEOJSON(route_geography)`.

**Unchanged:** `routes.od_pairs`, `routes.geocode_cache`, `routes.route_results`.

## Failure

| Condition | Result |
| --- | --- |
| Caller is not `admin` | 403. |
| Candidate address cannot be geocoded | The chat replies with that failure. No plan rows. |
| Places or Routes fails | The chat replies with that failure. Partial rows from the same `plan_id` are not kept. |
