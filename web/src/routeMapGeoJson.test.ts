import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { routeFeatureCollection } from "./routeMapGeoJson";

const LINE = '{"type":"LineString","coordinates":[[-122.4,37.8],[-122.1,37.4]]}';

describe("routeFeatureCollection", () => {
  it("wraps BigQuery GeoJSON strings as features", () => {
    const collection = routeFeatureCollection([{ pair_id: "p1", geojson: LINE }]);
    assert.equal(collection.features.length, 1);
    assert.equal(collection.features[0]?.properties.pair_id, "p1");
    assert.equal(collection.features[0]?.geometry.type, "LineString");
  });

  it("skips rows that are not lines", () => {
    const collection = routeFeatureCollection([
      { pair_id: "bad", geojson: "not-json" },
      { pair_id: "point", geojson: '{"type":"Point","coordinates":[1,2]}' },
    ]);
    assert.equal(collection.features.length, 0);
  });
});
