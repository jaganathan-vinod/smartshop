import { useEffect, useMemo } from "react";
import { APIProvider, Map, useMap } from "@vis.gl/react-google-maps";
import { routeFeatureCollection, type RouteFeatureCollection } from "../routeMapGeoJson";

const DEFAULT_CENTER = { lat: 37.77, lng: -122.42 };

function RouteLine({ collection }: { collection: RouteFeatureCollection }) {
  const map = useMap();

  useEffect(() => {
    if (!map || collection.features.length === 0) {
      return;
    }
    const features = map.data.addGeoJson(collection);
    map.data.setStyle({ strokeColor: "#1a73e8", strokeWeight: 4 });
    const bounds = new google.maps.LatLngBounds();
    for (const feature of features) {
      feature.getGeometry()?.forEachLatLng((latLng) => {
        bounds.extend(latLng);
      });
    }
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, 48);
    }
    return () => {
      for (const feature of features) {
        map.data.remove(feature);
      }
    };
  }, [map, collection]);

  return null;
}

export function OrderRouteMap({
  mapsKey,
  routeGeojson,
  label,
}: {
  mapsKey: string;
  routeGeojson: string;
  label: string;
}) {
  const collection = useMemo(
    () => routeFeatureCollection([{ pair_id: label, geojson: routeGeojson }]),
    [label, routeGeojson],
  );

  if (!mapsKey) {
    return <p className="flash error">The map key is not configured.</p>;
  }
  if (collection.features.length === 0) {
    return <p className="muted">The saved route could not be drawn.</p>;
  }

  return (
    <APIProvider apiKey={mapsKey}>
      <Map
        className="route-map order-route"
        style={{ width: "100%", height: "24rem" }}
        defaultCenter={DEFAULT_CENTER}
        defaultZoom={12}
        gestureHandling="greedy"
      >
        <RouteLine collection={collection} />
      </Map>
    </APIProvider>
  );
}
