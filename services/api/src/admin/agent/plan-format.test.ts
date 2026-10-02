import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  candidateAddress,
  planFeatureCollection,
  planReply,
  type PlanDrive,
} from "./plan-format.js";

const store: PlanDrive = {
  subjectKind: "CURRENT_STORE",
  subjectName: "SmartShop Orchard",
  originStoreId: "store_sg_orchard",
  distanceMeters: 2400,
  durationSeconds: 540,
  geojson: '{"type":"LineString","coordinates":[[103.83,1.30],[103.84,1.31]]}',
  wkt: "LINESTRING(103.83 1.30, 103.84 1.31)",
};

describe("candidateAddress", () => {
  it("keeps a plain address and strips a planning prefix", () => {
    assert.equal(candidateAddress("391 Orchard Rd, Singapore"), "391 Orchard Rd, Singapore");
    assert.equal(
      candidateAddress("competitors near 391 Orchard Rd, Singapore"),
      "391 Orchard Rd, Singapore",
    );
  });
});

describe("planReply", () => {
  it("names the shortest current store and competitor", () => {
    const reply = planReply("391 Orchard Rd, Singapore", [
      store,
      { ...store, subjectName: "SmartShop Tampines", durationSeconds: 900, distanceMeters: 12000 },
      {
        ...store,
        subjectKind: "COMPETITOR",
        subjectName: "Neighborhood Market",
        originStoreId: undefined,
        placeId: "ChIJ_example",
        durationSeconds: 180,
        distanceMeters: 400,
      },
    ]);
    assert.match(reply, /Nearest current store: SmartShop Orchard/);
    assert.match(reply, /Nearest competitor: Neighborhood Market/);
    assert.match(reply, /2 current store routes and 1 competitor route/);
  });
});

describe("planFeatureCollection", () => {
  it("builds one feature per drive", () => {
    const collection = JSON.parse(planFeatureCollection([store])) as {
      features: Array<{ properties: { subject_kind: string } }>;
    };
    assert.equal(collection.features.length, 1);
    assert.equal(collection.features[0]?.properties.subject_kind, "CURRENT_STORE");
  });
});
