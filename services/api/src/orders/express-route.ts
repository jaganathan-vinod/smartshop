import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import type { PlanApiCall } from "@smartshop/shared";
import { routeMapConfig, type BqQueryResponse } from "../admin/routes-map/query.js";
import { runBigQuerySql, type BqQueryParameter } from "../admin/routes-map/client.js";
import {
  geocodeSummary,
  jsonBlock,
  readResponseJson,
  recordCall,
  routesSummary,
  withoutApiKey,
} from "../admin/agent/plan-trace.js";
import { decodePolyline, linestringWkt } from "./polyline.js";

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/;
const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const FIELD_MASK = "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline";

export class ExpressRouteError extends Error {
  constructor(
    public readonly code: "NO_STORE" | "ROUTE_FAILED",
    message: string,
    public readonly calls: PlanApiCall[] = [],
  ) {
    super(message);
    this.name = "ExpressRouteError";
  }
}

export type PlannedExpressRoute = {
  routeId: string;
  trace: PlanApiCall[];
};

export type ExpressRouteSnapshot = {
  storeName: string;
  distanceMeters: number;
  durationSeconds: number;
  routeGeojson: string;
};

type StoreRow = {
  storeId: string;
  name: string;
  lat: number;
  lng: number;
};

type StoreDrive = StoreRow & {
  distanceMeters: number;
  durationSeconds: number;
  encodedPolyline: string;
};

let cachedMapsKey: string | undefined;

export function parseDurationSeconds(value: string): number | undefined {
  if (!value.endsWith("s")) {
    return undefined;
  }
  const seconds = Number(value.slice(0, -1));
  if (!Number.isFinite(seconds) || seconds < 0) {
    return undefined;
  }
  return seconds;
}

export function pickFastestDrive(routes: StoreDrive[]): StoreDrive | undefined {
  let best: StoreDrive | undefined;
  for (const route of routes) {
    if (!best || route.durationSeconds < best.durationSeconds) {
      best = route;
    }
  }
  return best;
}

export async function planExpressRoute(input: {
  orderId: string;
  userId: string;
  deliveryAddress: string;
}): Promise<PlannedExpressRoute> {
  const calls: PlanApiCall[] = [];
  const apiKey = await loadMapsServerKey();
  const destination = await geocodeAddress(input.deliveryAddress, apiKey, calls);
  const stores = await listActiveStores();
  if (stores.length === 0) {
    throw new ExpressRouteError("NO_STORE", "No active store can fulfill express delivery", calls);
  }
  const drives: StoreDrive[] = [];
  for (const store of stores) {
    const drive = await driveFromStore(store, destination, apiKey, calls);
    if (drive) {
      drives.push(drive);
    }
  }
  const chosen = pickFastestDrive(drives);
  if (!chosen) {
    throw new ExpressRouteError("ROUTE_FAILED", "Could not compute a driving route to that address", calls);
  }
  const points = decodePolyline(chosen.encodedPolyline);
  let wkt: string;
  try {
    wkt = linestringWkt(points);
  } catch {
    throw new ExpressRouteError("ROUTE_FAILED", "The driving route could not be saved", calls);
  }
  const routeId = `route_${crypto.randomUUID().replaceAll("-", "")}`;
  try {
    await insertExpressRoute({
      routeId,
      orderId: input.orderId,
      userId: input.userId,
      storeId: chosen.storeId,
      deliveryAddress: input.deliveryAddress,
      destLat: destination.lat,
      destLng: destination.lng,
      distanceMeters: chosen.distanceMeters,
      durationSeconds: chosen.durationSeconds,
      encodedPolyline: chosen.encodedPolyline,
      wkt,
    });
  } catch (error) {
    if (error instanceof ExpressRouteError) {
      throw new ExpressRouteError(error.code, error.message, calls);
    }
    throw error;
  }
  return { routeId, trace: calls };
}

export async function loadExpressRouteSnapshot(
  userId: string,
  routeId: string,
): Promise<ExpressRouteSnapshot | null> {
  const { project, dataset } = qualifiedDataset();
  const body = await runBigQuerySql(
    [
      "SELECT s.name AS store_name, r.distance_meters, r.duration_seconds,",
      "ST_ASGEOJSON(r.route_geography) AS geojson",
      `FROM \`${project}.${dataset}.express_order_routes\` r`,
      `JOIN \`${project}.${dataset}.stores\` s ON s.store_id = r.store_id`,
      "WHERE r.route_id = @route_id AND r.user_id = @user_id AND r.status = 'OK'",
      "LIMIT 1",
    ].join("\n"),
    [
      { name: "route_id", type: "STRING", value: routeId },
      { name: "user_id", type: "STRING", value: userId },
    ],
  );
  const row = body.rows?.[0];
  if (!row) {
    return null;
  }
  const storeName = cell(body, row, "store_name");
  const distance = cell(body, row, "distance_meters");
  const duration = cell(body, row, "duration_seconds");
  const routeGeojson = cell(body, row, "geojson");
  const distanceMeters = distance === undefined ? undefined : Number(distance);
  const durationSeconds = duration === undefined ? undefined : Number(duration);
  if (
    !storeName ||
    !routeGeojson ||
    distanceMeters === undefined ||
    !Number.isFinite(distanceMeters) ||
    durationSeconds === undefined ||
    !Number.isFinite(durationSeconds)
  ) {
    return null;
  }
  return {
    storeName,
    distanceMeters: Math.round(distanceMeters),
    durationSeconds,
    routeGeojson,
  };
}

async function listActiveStores(): Promise<StoreRow[]> {
  const { project, dataset } = qualifiedDataset();
  let body: BqQueryResponse;
  try {
    body = await runBigQuerySql(
      [
        "SELECT store_id, name, lat, lng",
        `FROM \`${project}.${dataset}.stores\``,
        "WHERE active",
      ].join("\n"),
    );
  } catch {
    throw new ExpressRouteError("ROUTE_FAILED", "Could not read store locations");
  }
  const stores: StoreRow[] = [];
  for (const row of body.rows ?? []) {
    const storeId = cell(body, row, "store_id");
    const name = cell(body, row, "name");
    const lat = Number(cell(body, row, "lat"));
    const lng = Number(cell(body, row, "lng"));
    if (!storeId || !name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      continue;
    }
    stores.push({ storeId, name, lat, lng });
  }
  return stores;
}

async function insertExpressRoute(input: {
  routeId: string;
  orderId: string;
  userId: string;
  storeId: string;
  deliveryAddress: string;
  destLat: number;
  destLng: number;
  distanceMeters: number;
  durationSeconds: number;
  encodedPolyline: string;
  wkt: string;
}): Promise<void> {
  const { project, dataset } = qualifiedDataset();
  const parameters: BqQueryParameter[] = [
    { name: "route_id", type: "STRING", value: input.routeId },
    { name: "order_id", type: "STRING", value: input.orderId },
    { name: "user_id", type: "STRING", value: input.userId },
    { name: "store_id", type: "STRING", value: input.storeId },
    { name: "delivery_address", type: "STRING", value: input.deliveryAddress },
    { name: "dest_lat", type: "FLOAT64", value: String(input.destLat) },
    { name: "dest_lng", type: "FLOAT64", value: String(input.destLng) },
    { name: "distance_meters", type: "INT64", value: String(input.distanceMeters) },
    { name: "duration_seconds", type: "FLOAT64", value: String(input.durationSeconds) },
    { name: "encoded_polyline", type: "STRING", value: input.encodedPolyline },
    { name: "wkt", type: "STRING", value: input.wkt },
  ];
  try {
    await runBigQuerySql(
      [
        `INSERT INTO \`${project}.${dataset}.express_order_routes\` (`,
        "route_id, order_id, user_id, store_id, delivery_address,",
        "dest_lat, dest_lng, distance_meters, duration_seconds,",
        "encoded_polyline, route_geography, status, computed_at",
        ")",
        "SELECT @route_id, @order_id, @user_id, @store_id, @delivery_address,",
        "@dest_lat, @dest_lng, @distance_meters, @duration_seconds,",
        "@encoded_polyline, ST_GEOGFROMTEXT(@wkt), 'OK', CURRENT_TIMESTAMP()",
      ].join("\n"),
      parameters,
    );
  } catch (error) {
    throw new ExpressRouteError(
      "ROUTE_FAILED",
      error instanceof Error ? error.message : "Could not save the express route",
    );
  }
}

async function geocodeAddress(
  address: string,
  apiKey: string,
  calls: PlanApiCall[],
): Promise<{ lat: number; lng: number }> {
  const region = process.env.GEOCODE_REGION?.trim() || "us";
  const url = new URL(GEOCODE_URL);
  url.searchParams.set("address", address);
  url.searchParams.set("region", region);
  url.searchParams.set("key", apiKey);
  const request = jsonBlock({ address, region }, apiKey);
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const payload = (await readResponseJson(response)) as {
      status?: string;
      results?: Array<{
        formatted_address?: string;
        geometry?: { location?: { lat?: number; lng?: number } };
      }>;
    };
    recordCall(calls, {
      label: "Geocode delivery address",
      api: "GEOCODE",
      method: "GET",
      url: withoutApiKey(url.toString(), apiKey),
      status: response.status,
      request,
      response: jsonBlock(geocodeSummary(payload), apiKey),
    });
    const location = payload.results?.[0]?.geometry?.location;
    if (
      !response.ok ||
      payload.status !== "OK" ||
      typeof location?.lat !== "number" ||
      typeof location.lng !== "number" ||
      location.lat < -90 ||
      location.lat > 90 ||
      location.lng < -180 ||
      location.lng > 180
    ) {
      throw new ExpressRouteError("ROUTE_FAILED", "Could not locate that address", calls);
    }
    return { lat: location.lat, lng: location.lng };
  } catch (error) {
    if (error instanceof ExpressRouteError) {
      throw error;
    }
    recordCall(calls, {
      label: "Geocode delivery address",
      api: "GEOCODE",
      method: "GET",
      url: withoutApiKey(url.toString(), apiKey),
      status: 0,
      request,
      response: jsonBlock(
        { error: error instanceof Error ? error.message : "request failed" },
        apiKey,
      ),
    });
    throw new ExpressRouteError("ROUTE_FAILED", "Could not locate that address", calls);
  }
}

async function driveFromStore(
  store: StoreRow,
  destination: { lat: number; lng: number },
  apiKey: string,
  calls: PlanApiCall[],
): Promise<StoreDrive | undefined> {
  const body = {
    origin: { location: { latLng: { latitude: store.lat, longitude: store.lng } } },
    destination: {
      location: { latLng: { latitude: destination.lat, longitude: destination.lng } },
    },
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE",
    computeAlternativeRoutes: false,
    units: "METRIC",
  };
  const request = jsonBlock({ headers: { "X-Goog-FieldMask": FIELD_MASK }, body }, apiKey);
  const label = `Routes computeRoutes · ${store.name}`.slice(0, 200);
  let payload: {
    routes?: Array<{
      distanceMeters?: number;
      duration?: string;
      polyline?: { encodedPolyline?: string };
    }>;
    error?: { message?: string; status?: string };
  };
  try {
    const response = await fetch(ROUTES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    payload = (await readResponseJson(response)) as typeof payload;
    recordCall(calls, {
      label,
      api: "ROUTES",
      method: "POST",
      url: ROUTES_URL,
      status: response.status,
      request,
      response: jsonBlock(routesSummary(payload), apiKey),
    });
    if (!response.ok) {
      return undefined;
    }
  } catch (error) {
    if (!(error instanceof ExpressRouteError)) {
      recordCall(calls, {
        label,
        api: "ROUTES",
        method: "POST",
        url: ROUTES_URL,
        status: 0,
        request,
        response: jsonBlock(
          { error: error instanceof Error ? error.message : "request failed" },
          apiKey,
        ),
      });
    }
    return undefined;
  }
  const route = payload.routes?.[0];
  const durationSeconds =
    typeof route?.duration === "string" ? parseDurationSeconds(route.duration) : undefined;
  const encodedPolyline = route?.polyline?.encodedPolyline;
  if (
    !route ||
    typeof route.distanceMeters !== "number" ||
    !Number.isInteger(route.distanceMeters) ||
    durationSeconds === undefined ||
    typeof encodedPolyline !== "string" ||
    encodedPolyline.length === 0
  ) {
    return undefined;
  }
  return {
    ...store,
    distanceMeters: route.distanceMeters,
    durationSeconds,
    encodedPolyline,
  };
}

export async function loadMapsServerKey(): Promise<string> {
  const fromEnv = process.env.MAPS_SERVER_API_KEY?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  if (cachedMapsKey) {
    return cachedMapsKey;
  }
  const secretId = process.env.MAPS_SERVER_SECRET_ID?.trim() || "smartshop/maps-server";
  try {
    const client = new SecretsManagerClient({});
    const result = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
    const value = result.SecretString?.trim();
    if (!value) {
      throw new Error("empty");
    }
    cachedMapsKey = value;
    return value;
  } catch {
    throw new ExpressRouteError(
      "ROUTE_FAILED",
      "Express routing is not configured",
    );
  }
}

function qualifiedDataset(): { project: string; dataset: string } {
  const { project, dataset } = routeMapConfig();
  if (!IDENTIFIER.test(project) || !IDENTIFIER.test(dataset)) {
    throw new ExpressRouteError("ROUTE_FAILED", "BigQuery project or dataset is not valid");
  }
  return { project, dataset };
}

function cell(
  body: BqQueryResponse,
  row: { f?: Array<{ v?: string | null }> },
  name: string,
): string | undefined {
  const index = (body.schema?.fields ?? []).findIndex((field) => field.name === name);
  const value = row.f?.[index]?.v;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
