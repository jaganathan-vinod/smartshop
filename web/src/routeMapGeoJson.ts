import type { RouteMapRow } from "@smartshop/shared";

export type LineStringGeometry = {
  type: "LineString";
  coordinates: number[][];
};

export type RouteFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: { pair_id: string };
    geometry: LineStringGeometry;
  }>;
};

function isLineString(value: unknown): value is LineStringGeometry {
  if (!value || typeof value !== "object") {
    return false;
  }
  const geometry = value as { type?: unknown; coordinates?: unknown };
  if (geometry.type !== "LineString" || !Array.isArray(geometry.coordinates)) {
    return false;
  }
  return geometry.coordinates.length >= 2;
}

export function routeFeatureCollection(rows: RouteMapRow[]): RouteFeatureCollection {
  const features: RouteFeatureCollection["features"] = [];
  for (const row of rows) {
    let geometry: unknown;
    try {
      geometry = JSON.parse(row.geojson) as unknown;
    } catch {
      continue;
    }
    if (!isLineString(geometry)) {
      continue;
    }
    features.push({
      type: "Feature",
      properties: { pair_id: row.pair_id },
      geometry,
    });
  }
  return { type: "FeatureCollection", features };
}
