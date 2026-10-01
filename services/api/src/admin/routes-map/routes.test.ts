import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Hono } from "hono";
import { runWithClaims } from "../../auth.js";
import { registerAdminRouteMapRoutes } from "./routes.js";
import { RouteMapNotConfigured, routeMapSql, rowsFromBigQuery } from "./query.js";

const LINE = '{"type":"LineString","coordinates":[[-122.4,37.8],[-122.1,37.4]]}';

function app(query?: () => Promise<Array<{ pair_id: string; geojson: string }>>) {
  const hono = new Hono();
  registerAdminRouteMapRoutes(hono, query ? { query } : {});
  return hono;
}

describe("admin route map", () => {
  it("rejects a missing JWT", async () => {
    const response = await runWithClaims(null, () =>
      app(async () => []).request("http://localhost/v1/admin/routes"),
    );
    assert.equal(response.status, 401);
  });

  it("rejects a customer JWT", async () => {
    const response = await runWithClaims({ sub: "user-a", groups: [] }, () =>
      app(async () => []).request("http://localhost/v1/admin/routes"),
    );
    assert.equal(response.status, 403);
  });

  it("returns pair ids and GeoJSON for an admin", async () => {
    const response = await runWithClaims({ sub: "admin-1", groups: ["admin"] }, () =>
      app(async () => [{ pair_id: "p1", geojson: LINE }]).request("http://localhost/v1/admin/routes"),
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as { routes: Array<{ pair_id: string; geojson: string }> };
    assert.deepEqual(body.routes, [{ pair_id: "p1", geojson: LINE }]);
  });

  it("reports a missing BigQuery reader", async () => {
    const response = await runWithClaims({ sub: "admin-1", groups: ["admin"] }, () =>
      app(async () => {
        throw new RouteMapNotConfigured();
      }).request("http://localhost/v1/admin/routes"),
    );
    assert.equal(response.status, 503);
    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, "BQ_NOT_CONFIGURED");
  });
});

describe("route map query", () => {
  it("selects GeoJSON for OK routes with a row cap", () => {
    const sql = routeMapSql("project-fd286af4-b340-4967-86b", "routes");
    assert.match(sql, /ST_ASGEOJSON\(route_geography\)/);
    assert.match(sql, /status = 'OK'/);
    assert.match(sql, /LIMIT 200/);
    assert.match(sql, /`project-fd286af4-b340-4967-86b\.routes\.route_results`/);
  });

  it("rejects identifiers that are not safe to interpolate", () => {
    assert.throws(() => routeMapSql("project;drop", "routes"));
  });

  it("reads pair_id and geojson cells", () => {
    const rows = rowsFromBigQuery({
      schema: { fields: [{ name: "pair_id" }, { name: "geojson" }] },
      rows: [{ f: [{ v: "p1" }, { v: LINE }] }, { f: [{ v: "p2" }, { v: null }] }],
    });
    assert.deepEqual(rows, [{ pair_id: "p1", geojson: LINE }]);
  });
});
