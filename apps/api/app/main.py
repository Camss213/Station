from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.schemas import StationSearchResponse
from app.services.fuel_ingestion import (
    StationRecord,
    fetch_fuel_xml,
    haversine_distance_km,
    parse_station_payload,
)


app = FastAPI(title=settings.app_name)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_station_cache: list[StationRecord] = []
_station_cache_expiry: datetime | None = None


async def get_cached_stations() -> list[StationRecord]:
    global _station_cache
    global _station_cache_expiry

    now = datetime.now(timezone.utc)
    if _station_cache and _station_cache_expiry and now < _station_cache_expiry:
        return _station_cache

    try:
        xml_payload = await fetch_fuel_xml(settings.fuel_data_url)
        stations = parse_station_payload(xml_payload)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=503,
            detail="Impossible de recuperer le flux officiel des stations carburant.",
        ) from exc

    if not stations:
        raise HTTPException(
            status_code=503,
            detail="Le flux officiel n'a retourne aucune station exploitable.",
        )

    _station_cache = stations
    _station_cache_expiry = now + timedelta(seconds=settings.fuel_cache_ttl_seconds)
    return _station_cache


@app.get("/health")
async def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/stations", response_model=list[StationSearchResponse])
async def search_stations(
    lat: float | None = Query(None, description="Latitude utilisateur"),
    lng: float | None = Query(None, description="Longitude utilisateur"),
    radius_km: int = Query(settings.default_search_radius_km, ge=1, le=100),
    fuel_type: str = Query("Gazole"),
    q: str | None = Query(None, description="Ville ou code postal"),
    limit: int = Query(settings.default_search_limit, ge=1, le=100),
) -> list[StationSearchResponse]:
    stations = await get_cached_stations()
    query_text = q.strip().lower() if q else None
    results: list[StationSearchResponse] = []

    for station in stations:
        if query_text:
            haystack = " ".join(
                [
                    station.city.lower(),
                    station.postal_code.lower(),
                    station.address.lower(),
                    (station.name or "").lower(),
                    (station.brand or "").lower(),
                ]
            )
            if query_text not in haystack:
                continue

        distance_km: float | None = None
        if lat is not None and lng is not None:
            distance_km = haversine_distance_km(lat, lng, station.latitude, station.longitude)
            if distance_km > radius_km:
                continue

        for fuel in station.fuels:
            if fuel["fuel_type"] != fuel_type:
                continue

            results.append(
                StationSearchResponse(
                    station_id=station.station_id,
                    brand=station.brand,
                    name=station.name,
                    address=station.address,
                    city=station.city,
                    postal_code=station.postal_code,
                    fuel_type=fuel_type,
                    price=float(fuel["price"]),
                    distance_km=round(distance_km, 2) if distance_km is not None else None,
                    updated_at=fuel["updated_at"],
                )
            )

    results.sort(
        key=lambda item: (
            item.price,
            item.distance_km if item.distance_km is not None else 999999,
            -item.updated_at.timestamp(),
        )
    )
    return results[:limit]
