import { ROUTE_MAP_LIMIT, type RouteMapRow } from "@smartshop/shared";

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/;

export class RouteMapNotConfigured extends Error {
  constructor() {
    super("BigQuery route reader is not configured");
    this.name = "RouteMapNotConfigured";
  }
}

export function routeMapSql(project: string, dataset: string): string {
  if (!IDENTIFIER.test(project) || !IDENTIFIER.test(dataset)) {
    throw new Error("BigQuery project or dataset is not a valid identifier");
  }
  return [
    "SELECT pair_id, ST_ASGEOJSON(route_geography) AS geojson",
    `FROM \`${project}.${dataset}.route_results\``,
    "WHERE status = 'OK' AND route_geography IS NOT NULL",
    `LIMIT ${ROUTE_MAP_LIMIT}`,
  ].join("\n");
}

export function routeMapConfig(): { project: string; dataset: string } {
  const project = process.env.BQ_PROJECT?.trim() || "project-fd286af4-b340-4967-86b";
  const dataset = process.env.BQ_DATASET?.trim() || "routes";
  return { project, dataset };
}

type BqField = { name?: string };
type BqCell = { v?: string | null };
type BqRow = { f?: BqCell[] };

export type BqQueryResponse = {
  jobComplete?: boolean;
  jobReference?: { jobId?: string; location?: string };
  schema?: { fields?: BqField[] };
  rows?: BqRow[];
  pageToken?: string;
  error?: { message?: string };
  errors?: Array<{ message?: string }>;
};

export function rowsFromBigQuery(body: BqQueryResponse): RouteMapRow[] {
  const fields = body.schema?.fields ?? [];
  const pairIndex = fields.findIndex((field) => field.name === "pair_id");
  const geoIndex = fields.findIndex((field) => field.name === "geojson");
  if (pairIndex < 0 || geoIndex < 0) {
    return [];
  }
  const routes: RouteMapRow[] = [];
  for (const row of body.rows ?? []) {
    const pairId = row.f?.[pairIndex]?.v;
    const geojson = row.f?.[geoIndex]?.v;
    if (typeof pairId !== "string" || pairId.length === 0) {
      continue;
    }
    if (typeof geojson !== "string" || geojson.length === 0) {
      continue;
    }
    routes.push({ pair_id: pairId, geojson });
    if (routes.length >= ROUTE_MAP_LIMIT) {
      break;
    }
  }
  return routes;
}
