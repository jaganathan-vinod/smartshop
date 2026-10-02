export type PlanSubjectKind = "CURRENT_STORE" | "COMPETITOR";

export type PlanDrive = {
  subjectKind: PlanSubjectKind;
  subjectName: string;
  placeId?: string;
  originStoreId?: string;
  distanceMeters: number;
  durationSeconds: number;
  geojson: string;
  wkt: string;
};

export function candidateAddress(text: string): string {
  return text
    .replace(/^(please\s+)?(show\s+)?(plan|competitors near|stores near|near)\s+/i, "")
    .trim();
}

export type PlanChoice = {
  id: string;
  subjectKind: PlanSubjectKind;
  subjectName: string;
  distanceMeters: number;
  durationSeconds: number;
  routeGeojson: string;
};

export function planChoices(drives: PlanDrive[]): PlanChoice[] {
  const nearestStore = nearest(drives.filter((drive) => drive.subjectKind === "CURRENT_STORE"));
  const competitors = drives
    .filter((drive) => drive.subjectKind === "COMPETITOR")
    .sort((left, right) => left.durationSeconds - right.durationSeconds);
  const ordered = nearestStore ? [nearestStore, ...competitors] : competitors;
  return ordered.map((drive, index) => ({
    id: `${drive.subjectKind === "CURRENT_STORE" ? "store" : "competitor"}-${index}`,
    subjectKind: drive.subjectKind,
    subjectName: drive.subjectName,
    distanceMeters: drive.distanceMeters,
    durationSeconds: drive.durationSeconds,
    routeGeojson: planFeatureCollection([drive]),
  }));
}

export function planFeatureCollection(drives: PlanDrive[]): string {
  return JSON.stringify({
    type: "FeatureCollection",
    features: drives.map((drive) => ({
      type: "Feature",
      properties: {
        subject_kind: drive.subjectKind,
        subject_name: drive.subjectName,
      },
      geometry: JSON.parse(drive.geojson) as unknown,
    })),
  });
}

export function planReply(address: string, drives: PlanDrive[]): string {
  const stores = drives.filter((drive) => drive.subjectKind === "CURRENT_STORE");
  const competitors = drives.filter((drive) => drive.subjectKind === "COMPETITOR");
  const nearestStore = nearest(stores);
  const nearestCompetitor = nearest(competitors);
  const lines = [`Candidate ${address}.`];
  lines.push(
    nearestStore
      ? `Nearest current store: ${nearestStore.subjectName}, ${formatDrive(nearestStore)}.`
      : "No current store has a driving route to that address.",
  );
  lines.push(
    nearestCompetitor
      ? `Nearest competitor: ${nearestCompetitor.subjectName}, ${formatDrive(nearestCompetitor)}.`
      : "No nearby competitor has a driving route to that address.",
  );
  lines.push(
    `${countPhrase(stores.length, "current store route")} and ${countPhrase(competitors.length, "competitor route")}.`,
  );
  return lines.join(" ");
}

function nearest(drives: PlanDrive[]): PlanDrive | undefined {
  let best: PlanDrive | undefined;
  for (const drive of drives) {
    if (!best || drive.durationSeconds < best.durationSeconds) {
      best = drive;
    }
  }
  return best;
}

function countPhrase(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function formatDrive(drive: PlanDrive): string {
  const km = (drive.distanceMeters / 1000).toFixed(1);
  const minutes = Math.max(1, Math.round(drive.durationSeconds / 60));
  return `${km} km, about ${minutes} min`;
}

export function lineGeoJson(points: Array<[number, number]>): string {
  return JSON.stringify({
    type: "LineString",
    coordinates: points.map(([lat, lng]) => [lng, lat]),
  });
}
