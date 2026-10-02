import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodePolyline, linestringWkt } from "./polyline.js";

describe("decodePolyline", () => {
  it("decodes the Google sample polyline", () => {
    const points = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    assert.equal(points.length, 3);
    assert.ok(Math.abs(points[0][0] - 38.5) < 0.00001);
    assert.ok(Math.abs(points[0][1] - -120.2) < 0.00001);
    assert.ok(Math.abs(points[1][0] - 40.7) < 0.00001);
    assert.ok(Math.abs(points[1][1] - -120.95) < 0.00001);
    assert.ok(Math.abs(points[2][0] - 43.252) < 0.00001);
    assert.ok(Math.abs(points[2][1] - -126.453) < 0.00001);
  });
});

describe("linestringWkt", () => {
  it("writes longitude then latitude", () => {
    assert.equal(
      linestringWkt([
        [37.787, -122.404],
        [37.794, -122.395],
      ]),
      "LINESTRING(-122.4040000 37.7870000, -122.3950000 37.7940000)",
    );
  });
});
