import { routeMapConfig, type BqQueryResponse } from "../routes-map/query.js";
import { runBigQuerySql, type BqQueryParameter } from "../routes-map/client.js";
import { loadMapsServerKey, parseDurationSeconds } from "../../orders/express-route.js";
import { decodePolyline, linestringWkt } from "../../orders/polyline.js";
import {
  candidateAddress,
  lineGeoJson,
  planFeatureCollection,
  planReply,
  type PlanDrive,
} from "./plan-format.js";

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/;
const PLACES_URL = "https://places.googleapis.com/v1/places:searchNearby";
const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const FIELD_MASK = "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline";
const COMPETITOR_LIMIT = 5;
const PLACE_RADIUS_METERS = 3000;

export class StorePlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorePlanError";
  }
}

export type StorePlanResult = {
  reply: string;
  planId?: string;
  routeGeojson?: string;
};

type StoreRow = { storeId: string; name: string; lat: number; lng: number };
type PlaceRow = { placeId: string; name: string; lat: number; lng: number };
type DriveHit = { distanceMeters: number; durationSeconds: number; encodedPolyline: string };

export async function planCandidate(text: string): Promise<StorePlanResult> {
  const address = candidateAddress(text);
  if (address.length < 3) {
    return { reply: "Send a candidate address to compare current stores and nearby competitors." };
  }
  let apiKey: string;
  try {
    apiKey = await loadMapsServerKey();
  } catch {
    return { reply: "Store planning is not configured. The Maps server key is missing." };
  }
  let destination: { lat: number; lng: number };
  try {
    destination = await geocodeAddress(address, apiKey);
  } catch {
    return { reply: `Could not locate ${address}. No plan was saved.` };
  }
  let stores: StoreRow[];
  try {
    stores = await listActiveStores();
  } catch {
    return { reply: "Could not read current stores. No plan was saved." };
  }
  if (stores.length === 0) {
    return { reply: "There are no active stores. No plan was saved." };
  }
  let places: PlaceRow[];
  try {
    places = await nearbyCompetitors(destination, apiKey);
  } catch {
    return { reply: "Nearby competitor search failed. No plan was saved." };
  }
  const drives: PlanDrive[] = [];
  try {
    for (const store of stores) {
      const hit = await driveTo(store.lat, store.lng, destination, apiKey);
      const drive = hit ? toDrive(hit, {
        subjectKind: "CURRENT_STORE",
        subjectName: store.name,
        originStoreId: store.storeId,
      }) : undefined;
      if (drive) {
        drives.push(drive);
      }
    }
    for (const place of places) {
      const hit = await driveTo(place.lat, place.lng, destination, apiKey);
      const drive = hit ? toDrive(hit, {
        subjectKind: "COMPETITOR",
        subjectName: place.name,
        placeId: place.placeId,
      }) : undefined;
      if (drive) {
        drives.push(drive);
      }
    }
  } catch {
    return { reply: "A driving-route request failed. No plan was saved." };
  }
  if (drives.length === 0) {
    return { reply: `No driving route reaches ${address}. No plan was saved.` };
  }
  const planId = `plan_${crypto.randomUUID().replaceAll("-", "")}`;
  try {
    await insertPlan(planId, address, destination, drives);
  } catch {
    return {
      reply: "The routes were computed, but saving the plan failed. Check that routes.store_plan_results exists and the BigQuery reader can insert into it.",
    };
  }
  return {
    reply: planReply(address, drives),
    planId,
    routeGeojson: planFeatureCollection(drives),
  };
}

function toDrive(
  hit: DriveHit,
  subject: Pick<PlanDrive, "subjectKind" | "subjectName" | "placeId" | "originStoreId">,
): PlanDrive | undefined {
  let points: Array<[number, number]>;
  try {
    points = decodePolyline(hit.encodedPolyline);
    return {
      ...subject,
      distanceMeters: hit.distanceMeters,
      durationSeconds: hit.durationSeconds,
      wkt: linestringWkt(points),
      geojson: lineGeoJson(points),
    };
  } catch {
    return undefined;
  }
}

async function geocodeAddress(address: string, apiKey: string): Promise<{ lat: number; lng: number }> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", apiKey);
  const region = process.env.GEOCODE_REGION?.trim();
  if (region) {
    url.searchParams.set("region", region);
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const payload = (await response.json()) as {
    status?: string;
    results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
  };
  const location = payload.results?.[0]?.geometry?.location;
  if (!response.ok || payload.status !== "OK" || typeof location?.lat !== "number" || typeof location.lng !== "number") {
    throw new StorePlanError("Could not locate that address");
  }
  return { lat: location.lat, lng: location.lng };
}

async function nearbyCompetitors(
  destination: { lat: number; lng: number },
  apiKey: string,
): Promise<PlaceRow[]> {
  const response = await fetch(PLACES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.id,places.displayName,places.location",
    },
    body: JSON.stringify({
      includedTypes: ["grocery_store", "supermarket", "convenience_store"],
      maxResultCount: COMPETITOR_LIMIT,
      locationRestriction: {
        circle: {
          center: { latitude: destination.lat, longitude: destination.lng },
          radius: PLACE_RADIUS_METERS,
        },
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new StorePlanError("Nearby competitor search failed");
  }
  const payload = (await response.json()) as {
    places?: Array<{
      id?: string;
      displayName?: { text?: string };
      location?: { latitude?: number; longitude?: number };
    }>;
  };
  const places: PlaceRow[] = [];
  for (const place of payload.places ?? []) {
    const name = place.displayName?.text;
    if (
      !place.id ||
      !name ||
      typeof place.location?.latitude !== "number" ||
      typeof place.location.longitude !== "number"
    ) {
      continue;
    }
    places.push({
      placeId: place.id,
      name,
      lat: place.location.latitude,
      lng: place.location.longitude,
    });
  }
  return places;
}

async function driveTo(
  originLat: number,
  originLng: number,
  destination: { lat: number; lng: number },
  apiKey: string,
): Promise<DriveHit | undefined> {
  const response = await fetch(ROUTES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: originLat, longitude: originLng } } },
      destination: {
        location: { latLng: { latitude: destination.lat, longitude: destination.lng } },
      },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
      computeAlternativeRoutes: false,
      units: "METRIC",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    throw new StorePlanError("A driving-route request failed");
  }
  const payload = (await response.json()) as {
    routes?: Array<{
      distanceMeters?: number;
      duration?: string;
      polyline?: { encodedPolyline?: string };
    }>;
  };
  const route = payload.routes?.[0];
  const durationSeconds = typeof route?.duration === "string" ? parseDurationSeconds(route.duration) : undefined;
  if (
    !route ||
    typeof route.distanceMeters !== "number" ||
    durationSeconds === undefined ||
    !route.polyline?.encodedPolyline
  ) {
    return undefined;
  }
  return {
    distanceMeters: Math.round(route.distanceMeters),
    durationSeconds,
    encodedPolyline: route.polyline.encodedPolyline,
  };
}

async function listActiveStores(): Promise<StoreRow[]> {
  const { project, dataset } = qualifiedDataset();
  const body = await runBigQuerySql(
    ["SELECT store_id, name, lat, lng", `FROM \`${project}.${dataset}.stores\``, "WHERE active"].join("\n"),
  );
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

async function insertPlan(
  planId: string,
  address: string,
  destination: { lat: number; lng: number },
  drives: PlanDrive[],
): Promise<void> {
  const { project, dataset } = qualifiedDataset();
  const parameters: BqQueryParameter[] = [
    { name: "plan_id", type: "STRING", value: planId },
    { name: "candidate_address", type: "STRING", value: address },
    { name: "candidate_lat", type: "FLOAT64", value: String(destination.lat) },
    { name: "candidate_lng", type: "FLOAT64", value: String(destination.lng) },
  ];
  const selects: string[] = [];
  drives.forEach((drive, index) => {
    parameters.push(
      { name: `kind_${index}`, type: "STRING", value: drive.subjectKind },
      { name: `name_${index}`, type: "STRING", value: drive.subjectName },
      { name: `place_${index}`, type: "STRING", value: drive.placeId ?? "" },
      { name: `store_${index}`, type: "STRING", value: drive.originStoreId ?? "" },
      { name: `distance_${index}`, type: "INT64", value: String(drive.distanceMeters) },
      { name: `duration_${index}`, type: "FLOAT64", value: String(drive.durationSeconds) },
      { name: `wkt_${index}`, type: "STRING", value: drive.wkt },
    );
    selects.push(
      [
        "SELECT @plan_id, @candidate_address, @candidate_lat, @candidate_lng,",
        `@kind_${index}, @name_${index}, NULLIF(@place_${index}, ''), NULLIF(@store_${index}, ''),`,
        `@distance_${index}, @duration_${index}, ST_GEOGFROMTEXT(@wkt_${index}), CURRENT_TIMESTAMP()`,
      ].join(" "),
    );
  });
  try {
    await runBigQuerySql(
      [
        `INSERT INTO \`${project}.${dataset}.store_plan_results\` (`,
        "plan_id, candidate_address, candidate_lat, candidate_lng, subject_kind, subject_name,",
        "place_id, origin_store_id, distance_meters, duration_seconds, route_geography, computed_at",
        ")",
        selects.join("\nUNION ALL\n"),
      ].join("\n"),
      parameters,
    );
  } catch (error) {
    await deletePlan(project, dataset, planId);
    throw error;
  }
}

async function deletePlan(project: string, dataset: string, planId: string): Promise<void> {
  try {
    await runBigQuerySql(
      `DELETE FROM \`${project}.${dataset}.store_plan_results\` WHERE plan_id = @plan_id`,
      [{ name: "plan_id", type: "STRING", value: planId }],
    );
  } catch {
    // The insert already failed. A missing table cannot be cleaned up.
  }
}

function qualifiedDataset(): { project: string; dataset: string } {
  const { project, dataset } = routeMapConfig();
  if (!IDENTIFIER.test(project) || !IDENTIFIER.test(dataset)) {
    throw new StorePlanError("BigQuery project or dataset is not valid");
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
