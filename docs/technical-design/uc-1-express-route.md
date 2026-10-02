# UC-1 — Express route at checkout

**Actor:** Customer  
**Goal:** On express confirm, pick the current store with the shortest drive to the delivery address, save that path, and show it on the order.

Standard delivery does not collect an address and does not call GCP. The express fee stays $12.99 and the 1–2 day promise stays as written. The map shows drive time, not a change to that promise.

## Flow

1. Checkout with `deliveryMethod = EXPRESS` requires `deliveryAddress`.
2. `POST /v1/orders` still requires `confirm: true`. The Lambda reprices, checks stock, then calls the GCP route service.
3. The route service geocodes the address, reads `routes.stores`, calls the Routes API once per active store, and keeps the minimum `duration_seconds`.
4. It inserts one row in `routes.express_order_routes` and returns `route_id`.
5. The Lambda writes the order, including `deliveryAddress` and `expressRouteId`, decrements stock, and clears the cart.
6. If geocoding or routing fails, the Lambda creates no order and does not decrement stock.
7. `GET /v1/orders/{orderId}` returns the snapshot. The order page draws `route_geojson` with the Maps JavaScript API.

The shopping assistant does not collect this address in this cut. Web checkout owns the flow.

## DynamoDB

**Table:** existing Orders (`PK userId`, `SK ORDER#<createdAt>#<orderId>`). No new table. No new GSI. The item is schemaless; these attributes are omitted for `STANDARD`.

| Attribute | Type | When |
| --- | --- | --- |
| `deliveryAddress` | string | EXPRESS only. The address the customer typed. |
| `expressRouteId` | string | EXPRESS only. Equals `express_order_routes.route_id`. |

`GET` by `orderId` already exists (`orderId-index`). The page loads the line geometry from the API, which reads BigQuery by `expressRouteId`. The polyline is not copied into DynamoDB.

Unchanged attributes: `orderId`, `orderNumber`, `status`, `deliveryMethod`, `items`, `breakdown`, `isPremiumAtPurchase`, `createdAt`.

## API Gateway

No API Gateway change. Both calls already fall through `/{proxy+}` with the customer JWT.

| Method and path | Change |
| --- | --- |
| `POST /v1/orders` | Body gains `deliveryAddress` (required when `deliveryMethod` is `EXPRESS`, rejected when `STANDARD`). |
| `GET /v1/orders/{orderId}` | EXPRESS responses add `deliveryAddress`, `expressRouteId`, `storeName`, `distanceMeters`, `durationSeconds`, `routeGeojson`. |
| `POST /v1/quotes` | Unchanged. Quotes still do not store an address or a route. |
| `GET /v1/orders` | List payload stays the summary. The map loads on the detail page. |

`deliveryAddress` is part of the idempotency hash so a changed address is a different order attempt.

This cut runs the route computation inside the API Lambda. It uses the existing BigQuery reader and a Maps server key in Secrets Manager (`smartshop/maps-server`, or `MAPS_SERVER_API_KEY` for local runs). The browser never calls Geocoding or Routes, and it never sees that key.

## BigQuery

**New table** `routes.stores`. Seeded with current shops. UC-2 reads the same table.

```sql
CREATE TABLE IF NOT EXISTS `project-fd286af4-b340-4967-86b.routes.stores` (
  store_id STRING NOT NULL,
  name STRING NOT NULL,
  address STRING NOT NULL,
  lat FLOAT64 NOT NULL,
  lng FLOAT64 NOT NULL,
  active BOOL NOT NULL,
  updated_at TIMESTAMP NOT NULL
)
CLUSTER BY store_id;
```

**New table** `routes.express_order_routes`. One row per successful express confirm.

```sql
CREATE TABLE IF NOT EXISTS `project-fd286af4-b340-4967-86b.routes.express_order_routes` (
  route_id STRING NOT NULL,
  order_id STRING NOT NULL,
  user_id STRING NOT NULL,
  store_id STRING NOT NULL,
  delivery_address STRING NOT NULL,
  dest_lat FLOAT64 NOT NULL,
  dest_lng FLOAT64 NOT NULL,
  distance_meters INT64,
  duration_seconds FLOAT64,
  encoded_polyline STRING,
  route_geography GEOGRAPHY,
  status STRING NOT NULL,
  computed_at TIMESTAMP NOT NULL
)
PARTITION BY DATE(computed_at)
CLUSTER BY order_id;
```

`route_geography` is a `LINESTRING` from the Routes polyline, same pattern as `route_results`. The detail API returns `ST_ASGEOJSON(route_geography)`.

**Unchanged:** `routes.od_pairs`, `routes.geocode_cache`, `routes.route_results`. Express checkout does not read or write those tables. The admin Map page keeps querying `route_results`.

## Failure

| Condition | Result |
| --- | --- |
| EXPRESS without `deliveryAddress` | 400. No order. |
| STANDARD with `deliveryAddress` | 400. No order. |
| No active store | 503 `NO_STORE`. No order. |
| Geocode or Routes error | 502 `ROUTE_FAILED`. No order. Cart and stock unchanged. |
| BigQuery insert fails after a route was chosen | 502. No order. |
