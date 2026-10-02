import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { geocodeSummary, jsonBlock, placesSummary, routesSummary, withoutApiKey } from "./plan-trace.js";

describe("plan trace", () => {
  it("drops the API key from the geocode URL and JSON", () => {
    const key = "secret-maps-key";
    const url = withoutApiKey(
      `https://maps.googleapis.com/maps/api/geocode/json?address=punggol&key=${key}`,
      key,
    );
    assert.equal(url.includes(key), false);
    assert.match(url, /address=punggol/);
    assert.equal(jsonBlock({ note: key }, key).includes(key), false);
  });

  it("keeps places and route results readable", () => {
    const places = placesSummary({
      places: [{ id: "p1", displayName: { text: "Sheng Siong" }, location: { latitude: 1.4, longitude: 103.9 } }],
    }) as { places: Array<{ displayName?: string }> };
    assert.equal(places.places[0]?.displayName, "Sheng Siong");
    const routes = routesSummary({
      routes: [{ distanceMeters: 1800, duration: "420s", polyline: { encodedPolyline: "a".repeat(80) } }],
    }) as { routes: Array<{ encodedPolyline?: string }> };
    assert.match(routes.routes[0]?.encodedPolyline ?? "", /80 characters/);
    assert.equal(geocodeSummary({ status: "OK", results: [] }).status, "OK");
  });
});