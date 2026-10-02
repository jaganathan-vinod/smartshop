import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseDurationSeconds, pickFastestDrive } from "./express-route.js";

const market = {
  storeId: "store_sf_market",
  name: "SmartShop Market St",
  lat: 37.787,
  lng: -122.404,
  distanceMeters: 2400,
  durationSeconds: 540,
  encodedPolyline: "abc",
};

describe("parseDurationSeconds", () => {
  it("reads a Routes API duration", () => {
    assert.equal(parseDurationSeconds("540s"), 540);
    assert.equal(parseDurationSeconds("12.5s"), 12.5);
    assert.equal(parseDurationSeconds("540"), undefined);
  });
});

describe("pickFastestDrive", () => {
  it("keeps the shortest duration", () => {
    const chosen = pickFastestDrive([
      market,
      { ...market, storeId: "store_oak_broadway", durationSeconds: 900, distanceMeters: 18000 },
    ]);
    assert.equal(chosen?.storeId, "store_sf_market");
  });

  it("returns undefined when every store failed", () => {
    assert.equal(pickFastestDrive([]), undefined);
  });
});
