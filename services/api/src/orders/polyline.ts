/** Decode a Routes API encoded polyline (precision 5) into latitude, longitude pairs. */
export function decodePolyline(encoded: string, precision = 5): Array<[number, number]> {
  if (precision < 0) {
    throw new Error("precision must be non-negative");
  }
  const factor = 10 ** precision;
  let index = 0;
  let lat = 0;
  let lng = 0;
  const points: Array<[number, number]> = [];
  while (index < encoded.length) {
    const latitude = decodeChunk(encoded, index);
    index = latitude.index;
    const longitude = decodeChunk(encoded, index);
    index = longitude.index;
    lat += latitude.delta;
    lng += longitude.delta;
    points.push([lat / factor, lng / factor]);
  }
  return points;
}

/** WKT for a GEOGRAPHY line. Coordinates are longitude then latitude. */
export function linestringWkt(points: Array<[number, number]>): string {
  if (points.length < 2) {
    throw new Error("polyline has fewer than 2 points");
  }
  const parts: string[] = [];
  for (const [lat, lng] of points) {
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new Error("polyline coordinate out of range");
    }
    parts.push(`${lng.toFixed(7)} ${lat.toFixed(7)}`);
  }
  return `LINESTRING(${parts.join(", ")})`;
}

function decodeChunk(encoded: string, index: number): { delta: number; index: number } {
  let result = 0;
  let shift = 0;
  while (true) {
    if (index >= encoded.length) {
      throw new Error("truncated polyline");
    }
    const chunk = encoded.charCodeAt(index) - 63;
    index += 1;
    result += (chunk & 0x1f) * 2 ** shift;
    shift += 5;
    if (chunk < 0x20) {
      break;
    }
    if (shift > 32) {
      throw new Error("invalid polyline chunk");
    }
  }
  const shifted = Math.floor(result / 2);
  const delta = result % 2 === 1 ? -shifted - 1 : shifted;
  return { delta, index };
}
