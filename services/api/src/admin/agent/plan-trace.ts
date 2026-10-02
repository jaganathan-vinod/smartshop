import type { PlanApiCall } from "@smartshop/shared";

type GeocodePayload = {
  status?: string;
  results?: Array<{
    formatted_address?: string;
    geometry?: { location?: { lat?: number; lng?: number } };
  }>;
};

type PlacesPayload = {
  places?: Array<{
    id?: string;
    displayName?: { text?: string };
    location?: { latitude?: number; longitude?: number };
  }>;
  error?: { message?: string; status?: string };
};

type RoutesPayload = {
  routes?: Array<{
    distanceMeters?: number;
    duration?: string;
    polyline?: { encodedPolyline?: string };
  }>;
  error?: { message?: string; status?: string };
};

export function withoutApiKey(url: string, apiKey: string): string {
  const parsed = new URL(url);
  parsed.searchParams.delete("key");
  return redact(parsed.toString(), apiKey);
}

export function jsonBlock(value: unknown, apiKey: string): string {
  const text = redact(JSON.stringify(value, null, 2), apiKey);
  return text.length > 12_000 ? `${text.slice(0, 12_000)}\n…` : text;
}

export function geocodeSummary(payload: GeocodePayload) {
  const first = payload.results?.[0];
  return {
    status: payload.status ?? "UNKNOWN",
    resultCount: payload.results?.length ?? 0,
    formattedAddress: first?.formatted_address,
    location: first?.geometry?.location,
  };
}

export function placesSummary(payload: PlacesPayload) {
  if (payload.error) {
    return { error: payload.error };
  }
  return {
    places: (payload.places ?? []).map((place) => ({
      id: place.id,
      displayName: place.displayName?.text,
      location: place.location,
    })),
  };
}

export function routesSummary(payload: RoutesPayload) {
  if (payload.error) {
    return { error: payload.error };
  }
  return {
    routes: (payload.routes ?? []).map((route) => ({
      distanceMeters: route.distanceMeters,
      duration: route.duration,
      encodedPolyline: clipPolyline(route.polyline?.encodedPolyline),
    })),
  };
}

export function recordCall(calls: PlanApiCall[], call: PlanApiCall): void {
  if (calls.length < 40) {
    calls.push(call);
  }
}

export async function readResponseJson(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (raw.length === 0) {
    return {};
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { raw: raw.slice(0, 2_000) };
  }
}

function clipPolyline(encoded: string | undefined): string | undefined {
  if (!encoded) {
    return undefined;
  }
  if (encoded.length <= 48) {
    return encoded;
  }
  return `${encoded.slice(0, 48)}… (${encoded.length} characters)`;
}

function redact(text: string, apiKey: string): string {
  return apiKey.length > 0 ? text.split(apiKey).join("[redacted]") : text;
}
