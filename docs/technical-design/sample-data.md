# Sample rows

Illustrative metadata for the new tables. Coordinates are longitude then latitude inside `GEOGRAPHY` WKT. Prices stay integer cents.

## DynamoDB Orders item (express only)

Existing key and price fields stay. Two attributes are added.

```json
{
  "userId": "cognito-sub-8f3a",
  "sk": "ORDER#2026-10-02T12:00:00.000Z#ord_01HZX",
  "orderId": "ord_01HZX",
  "orderNumber": "SS-20261002-00041",
  "status": "CONFIRMED",
  "deliveryMethod": "EXPRESS",
  "deliveryAddress": "1 Market St, San Francisco, CA",
  "expressRouteId": "route_01HZY",
  "isPremiumAtPurchase": false,
  "createdAt": "2026-10-02T12:00:00.000Z"
}
```

A standard order omits `deliveryAddress` and `expressRouteId`.

## `routes.stores`

```json
[
  {
    "store_id": "store_sf_market",
    "name": "SmartShop Market St",
    "address": "750 Market St, San Francisco, CA",
    "lat": 37.787,
    "lng": -122.404,
    "active": true,
    "updated_at": "2026-10-02T00:00:00Z"
  },
  {
    "store_id": "store_oak_broadway",
    "name": "SmartShop Broadway",
    "address": "400 Broadway, Oakland, CA",
    "lat": 37.796,
    "lng": -122.276,
    "active": true,
    "updated_at": "2026-10-02T00:00:00Z"
  }
]
```

## `routes.express_order_routes`

`route_id` matches `expressRouteId` on the order. `route_geography` is the driving line from the chosen store to the customer.

```json
{
  "route_id": "route_01HZY",
  "order_id": "ord_01HZX",
  "user_id": "cognito-sub-8f3a",
  "store_id": "store_sf_market",
  "delivery_address": "1 Market St, San Francisco, CA",
  "dest_lat": 37.794,
  "dest_lng": -122.395,
  "distance_meters": 2400,
  "duration_seconds": 540,
  "encoded_polyline": "encoded_polyline_omitted",
  "route_geography": "LINESTRING(-122.404 37.787, -122.400 37.790, -122.395 37.794)",
  "status": "OK",
  "computed_at": "2026-10-02T12:00:05Z"
}
```

## `routes.store_plan_results`

One plan, two subjects. `plan_id` groups the rows the chat draws together.

```json
[
  {
    "plan_id": "plan_01J00",
    "candidate_address": "100 Clement St, San Francisco, CA",
    "candidate_lat": 37.783,
    "candidate_lng": -122.465,
    "subject_kind": "CURRENT_STORE",
    "subject_name": "SmartShop Market St",
    "place_id": null,
    "origin_store_id": "store_sf_market",
    "distance_meters": 6200,
    "duration_seconds": 1100,
    "route_geography": "LINESTRING(-122.404 37.787, -122.465 37.783)",
    "computed_at": "2026-10-02T13:00:00Z"
  },
  {
    "plan_id": "plan_01J00",
    "candidate_address": "100 Clement St, San Francisco, CA",
    "candidate_lat": 37.783,
    "candidate_lng": -122.465,
    "subject_kind": "COMPETITOR",
    "subject_name": "Neighborhood Market",
    "place_id": "ChIJ_example",
    "origin_store_id": null,
    "distance_meters": 400,
    "duration_seconds": 120,
    "route_geography": "LINESTRING(-122.468 37.783, -122.465 37.783)",
    "computed_at": "2026-10-02T13:00:00Z"
  }
]
```

## `marketing.catalogue_products`

Copied from DynamoDB Products. `product_id` stays the catalogue id.

```json
{
  "product_id": "prod-ceramic-mug",
  "name": "Ceramic Mug",
  "description": "12 oz stoneware mug",
  "category": "home",
  "unit_price_cents": 1800,
  "image_url": "https://cdn.example/mug.jpg",
  "active": true,
  "synced_at": "2026-10-02T04:00:00Z"
}
```

## `marketing.assets`

Image row after Imagen returns. Video row while Veo is still running, then the same row with `status = REVIEW` and a `gcs_uri`.

```json
[
  {
    "asset_id": "asset_img_01",
    "session_id": "sess_admin_01",
    "kind": "IMAGE",
    "status": "REVIEW",
    "product_ids": ["prod-ceramic-mug"],
    "guidance": "Morning light, mug on a wood table, no text",
    "gcs_uri": "gs://smartshop-marketing/asset_img_01.png",
    "created_at": "2026-10-02T14:00:00Z"
  },
  {
    "asset_id": "asset_vid_01",
    "session_id": "sess_admin_01",
    "kind": "VIDEO",
    "status": "GENERATING",
    "product_ids": ["prod-ceramic-mug"],
    "guidance": "Five second pour into the mug",
    "gcs_uri": null,
    "created_at": "2026-10-02T14:05:00Z"
  }
]
```
