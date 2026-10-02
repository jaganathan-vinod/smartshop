import { useEffect, useMemo } from "react";
import { APIProvider, Map, useMap } from "@vis.gl/react-google-maps";

const DEFAULT_CENTER = { lat: 1.35, lng: 103.82 };

type PlanCollection = {
  type: "FeatureCollection";
  features: object[];
};

function PlanLines({ collection }: { collection: PlanCollection }) {
  const map = useMap();

  useEffect(() => {
    if (!map || collection.features.length === 0) {
      return;
    }
    const features = map.data.addGeoJson(collection);
    map.data.setStyle((feature) => ({
      strokeColor: feature.getProperty("subject_kind") === "COMPETITOR" ? "#c5221f" : "#1a73e8",
      strokeWeight: 4,
    }));
    const bounds = new google.maps.LatLngBounds();
    for (const feature of features) {
      feature.getGeometry()?.forEachLatLng((latLng) => {
        bounds.extend(latLng);
      });
    }
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, 48);
    }
    const info = new google.maps.InfoWindow();
    const listener = map.data.addListener("click", (event: google.maps.Data.MouseEvent) => {
      const name = event.feature.getProperty("subject_name");
      if (typeof name !== "string" || !event.latLng) {
        return;
      }
      const label = document.createElement("p");
      label.textContent = name;
      info.setContent(label);
      info.setPosition(event.latLng);
      info.open(map);
    });
    return () => {
      listener.remove();
      info.close();
      for (const feature of features) {
        map.data.remove(feature);
      }
    };
  }, [map, collection]);

  return null;
}

export function PlanMap({ mapsKey, routeGeojson }: { mapsKey: string; routeGeojson: string }) {
  const collection = useMemo(() => {
    try {
      const parsed = JSON.parse(routeGeojson) as PlanCollection;
      if (parsed?.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }, [routeGeojson]);

  if (!mapsKey) {
    return <p className="flash error">The map key is not configured.</p>;
  }
  if (!collection || collection.features.length === 0) {
    return <p className="muted">The plan has no lines to draw.</p>;
  }

  return (
    <APIProvider apiKey={mapsKey}>
      <Map
        className="route-map plan-map"
        style={{ width: "100%", height: "100%" }}
        defaultCenter={DEFAULT_CENTER}
        defaultZoom={11}
        gestureHandling="greedy"
      >
        <PlanLines collection={collection} />
      </Map>
    </APIProvider>
  );
}
