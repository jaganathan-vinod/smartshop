import requests

from smartshop.config import MAPS_API_KEY

PLACES_URL = "https://places.googleapis.com/v1/places:searchNearby"
ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"
GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"


def _key() -> str:
    if not MAPS_API_KEY:
        raise RuntimeError("MAPS_API_KEY is not set on the agent")
    return MAPS_API_KEY


def geocode_address(address: str) -> dict:
    """Turn a street address into latitude and longitude.

    Args:
        address: The address to locate.
    """
    response = requests.get(
        GEOCODE_URL,
        params={"address": address, "key": _key()},
        timeout=15,
    )
    payload = response.json()
    results = payload.get("results") or []
    location = results[0].get("geometry", {}).get("location") if results else None
    if response.status_code != 200 or payload.get("status") != "OK" or not location:
        return {"error": "Could not locate that address"}
    return {
        "formattedAddress": results[0].get("formatted_address"),
        "lat": location["lat"],
        "lng": location["lng"],
    }


def search_nearby_grocers(latitude: float, longitude: float) -> dict:
    """Find grocery, supermarket, and convenience stores within 3 km.

    Args:
        latitude: Center latitude.
        longitude: Center longitude.
    """
    response = requests.post(
        PLACES_URL,
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": _key(),
            "X-Goog-FieldMask": "places.id,places.displayName,places.location",
        },
        json={
            "includedTypes": ["grocery_store", "supermarket", "convenience_store"],
            "maxResultCount": 5,
            "locationRestriction": {
                "circle": {
                    "center": {"latitude": latitude, "longitude": longitude},
                    "radius": 3000,
                }
            },
        },
        timeout=15,
    )
    payload = response.json()
    if response.status_code != 200:
        return {"error": "Nearby search failed"}
    places = []
    for place in payload.get("places") or []:
        loc = place.get("location") or {}
        name = (place.get("displayName") or {}).get("text")
        if place.get("id") and name and "latitude" in loc and "longitude" in loc:
            places.append(
                {
                    "placeId": place["id"],
                    "name": name,
                    "lat": loc["latitude"],
                    "lng": loc["longitude"],
                }
            )
    return {"places": places}


def drive_duration(
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
) -> dict:
    """Compute one driving route without live traffic.

    Args:
        origin_lat: Origin latitude.
        origin_lng: Origin longitude.
        dest_lat: Destination latitude.
        dest_lng: Destination longitude.
    """
    response = requests.post(
        ROUTES_URL,
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": _key(),
            "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
        },
        json={
            "origin": {"location": {"latLng": {"latitude": origin_lat, "longitude": origin_lng}}},
            "destination": {"location": {"latLng": {"latitude": dest_lat, "longitude": dest_lng}}},
            "travelMode": "DRIVE",
            "routingPreference": "TRAFFIC_UNAWARE",
            "computeAlternativeRoutes": False,
            "units": "METRIC",
        },
        timeout=15,
    )
    payload = response.json()
    routes = payload.get("routes") or []
    if response.status_code != 200 or not routes:
        return {"error": "Could not compute a driving route"}
    return {
        "duration": routes[0].get("duration"),
        "distanceMeters": routes[0].get("distanceMeters"),
    }
