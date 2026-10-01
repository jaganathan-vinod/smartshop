import { useEffect, useMemo, useRef, useState } from "react";
import { APIProvider, Map, useMap } from "@vis.gl/react-google-maps";
import type { RouteMapRow } from "@smartshop/shared";
import { ApiRequestError, listRouteMap } from "../api";
import { loadConfig } from "../config";
import { routeFeatureCollection, type RouteFeatureCollection } from "../routeMapGeoJson";

const DEFAULT_CENTER = { lat: 39.8, lng: -98.6 };

function RouteLines({
  collection,
  onSelect,
}: {
  collection: RouteFeatureCollection;
  onSelect: (pairId: string) => void;
}) {
  const map = useMap();
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!map || collection.features.length === 0) {
      return;
    }
    const features = map.data.addGeoJson(collection);
    map.data.setStyle({ strokeColor: "#1a73e8", strokeWeight: 3 });
    const bounds = new google.maps.LatLngBounds();
    for (const feature of features) {
      feature.getGeometry()?.forEachLatLng((latLng) => {
        bounds.extend(latLng);
      });
    }
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds);
    }
    const info = new google.maps.InfoWindow();
    const listener = map.data.addListener("click", (event: google.maps.Data.MouseEvent) => {
      const pairId = event.feature.getProperty("pair_id");
      if (typeof pairId !== "string" || !event.latLng) {
        return;
      }
      onSelectRef.current(pairId);
      const label = document.createElement("p");
      label.textContent = pairId;
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

export function AdminMapPage() {
  const [rows, setRows] = useState<RouteMapRow[] | null>(null);
  const [mapsKey, setMapsKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPairId, setSelectedPairId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadConfig()
      .then((config) => {
        if (!cancelled) {
          setMapsKey(config.mapsBrowserKey);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMapsKey("");
        }
      });
    listRouteMap()
      .then((body) => {
        if (!cancelled) {
          setRows(body.routes);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setRows([]);
          setError(caught instanceof ApiRequestError ? caught.message : "Could not load routes");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const collection = useMemo(() => (rows ? routeFeatureCollection(rows) : null), [rows]);

  return (
    <section className="route-map-page">
      <header className="hero">
        <h1>Routes</h1>
        <p className="lede">Driving paths from route results with status OK.</p>
        {selectedPairId ? <p className="lede">Selected pair {selectedPairId}</p> : null}
      </header>
      {error ? <p className="flash error">{error}</p> : null}
      {rows === null ? <p className="lede">Loading routes…</p> : null}
      {collection && collection.features.length === 0 && !error ? (
        <p className="lede">No routes with status OK.</p>
      ) : null}
      {mapsKey === "" ? (
        <p className="flash error">Set VITE_MAPS_BROWSER_KEY to draw the map.</p>
      ) : null}
      {mapsKey && collection ? (
        <APIProvider apiKey={mapsKey}>
          <Map
            className="route-map"
            style={{ width: "100%", height: "70vh" }}
            defaultCenter={DEFAULT_CENTER}
            defaultZoom={4}
            gestureHandling="greedy"
          >
            <RouteLines collection={collection} onSelect={setSelectedPairId} />
          </Map>
        </APIProvider>
      ) : null}
    </section>
  );
}
