from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation
import gzip
import io
import json
from math import asin, cos, radians, sin, sqrt
import xml.etree.ElementTree as ET
import zipfile

import httpx


FUEL_NAME_MAP = {
    "Gazole": "Gazole",
    "SP95": "SP95",
    "SP98": "SP98",
    "E10": "E10",
    "E85": "E85",
    "GPLc": "GPLc",
}


@dataclass
class StationRecord:
    station_id: str
    latitude: float
    longitude: float
    address: str
    city: str
    postal_code: str
    brand: str | None
    name: str | None
    services: str | None
    updated_at: datetime
    fuels: list[dict[str, object]]


def haversine_distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    earth_radius_km = 6371.0
    delta_lat = radians(lat2 - lat1)
    delta_lng = radians(lng2 - lng1)
    origin_lat = radians(lat1)
    destination_lat = radians(lat2)

    haversine = (
        sin(delta_lat / 2) ** 2
        + cos(origin_lat) * cos(destination_lat) * sin(delta_lng / 2) ** 2
    )
    return 2 * earth_radius_km * asin(sqrt(haversine))


async def fetch_fuel_xml(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.get(url, follow_redirects=True)
        response.raise_for_status()

    payload = response.content
    if payload[:4] == b"PK\x03\x04":
        with zipfile.ZipFile(io.BytesIO(payload)) as zip_file:
            xml_members = [
                name for name in zip_file.namelist() if name.lower().endswith(".xml")
            ]
            if not xml_members:
                raise ValueError("Le flux ZIP officiel ne contient aucun fichier XML.")
            with zip_file.open(xml_members[0]) as xml_file:
                return xml_file.read()
    if payload[:2] == b"\x1f\x8b":
        with gzip.GzipFile(fileobj=io.BytesIO(payload)) as gz_file:
            return gz_file.read()
    return payload


def _parse_timestamp(value: str | None) -> datetime:
    if not value:
        return datetime.utcnow()

    normalized = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return datetime.utcnow()


def _parse_price(value: str | None) -> Decimal | None:
    if not value:
        return None

    try:
        return Decimal(value.replace(",", "."))
    except InvalidOperation:
        return None


def _build_station_record(
    station_id: str,
    latitude: float,
    longitude: float,
    address: str,
    city: str,
    postal_code: str,
    brand: str | None,
    name: str | None,
    services: list[str],
    fuels: list[dict[str, object]],
) -> StationRecord | None:
    if not fuels:
        return None

    updated_at = max(fuel["updated_at"] for fuel in fuels)
    return StationRecord(
        station_id=station_id,
        latitude=latitude,
        longitude=longitude,
        address=address or "Adresse indisponible",
        city=city or "Ville inconnue",
        postal_code=postal_code,
        brand=brand,
        name=name,
        services=", ".join(sorted(set(services))) or None,
        updated_at=updated_at,
        fuels=fuels,
    )


def parse_station_json(json_payload: bytes) -> list[StationRecord]:
    rows = json.loads(json_payload.decode("utf-8"))
    stations: list[StationRecord] = []

    for row in rows:
        latitude_raw = row.get("latitude")
        longitude_raw = row.get("longitude")
        if latitude_raw is None or longitude_raw is None:
            geom = row.get("geom") or {}
            latitude = float(geom.get("lat", 0))
            longitude = float(geom.get("lon", 0))
        else:
            latitude = int(str(latitude_raw)) / 100000
            longitude = int(str(longitude_raw)) / 100000

        fuels: list[dict[str, object]] = []
        for fuel_name in FUEL_NAME_MAP.values():
            key_prefix = fuel_name.lower()
            price_value = row.get(f"{key_prefix}_prix")
            updated_at = row.get(f"{key_prefix}_maj")
            if price_value is None:
                continue

            parsed_price = _parse_price(str(price_value))
            if parsed_price is None:
                continue

            fuels.append(
                {
                    "fuel_type": fuel_name,
                    "price": parsed_price,
                    "updated_at": _parse_timestamp(updated_at),
                }
            )

        services = row.get("services_service") or []
        if isinstance(services, str):
            services = [services]

        brand = row.get("enseigne") or row.get("brand")
        record = _build_station_record(
            station_id=str(row.get("id")),
            latitude=latitude,
            longitude=longitude,
            address=str(row.get("adresse") or ""),
            city=str(row.get("ville") or ""),
            postal_code=str(row.get("cp") or ""),
            brand=brand.strip() if isinstance(brand, str) and brand.strip() else None,
            name=(brand.strip() if isinstance(brand, str) and brand.strip() else str(row.get("id"))),
            services=[str(service) for service in services if service],
            fuels=fuels,
        )
        if record is not None:
            stations.append(record)

    return stations


def parse_station_xml(xml_payload: bytes) -> list[StationRecord]:
    root = ET.fromstring(xml_payload)
    stations: list[StationRecord] = []

    for pdv in root.findall(".//pdv"):
        latitude = int(pdv.attrib["latitude"]) / 100000
        longitude = int(pdv.attrib["longitude"]) / 100000
        postal_code = pdv.attrib.get("cp", "")
        city = (pdv.attrib.get("ville") or "").strip()

        address = ""
        services: list[str] = []
        fuels: list[dict[str, object]] = []
        brand = (pdv.attrib.get("enseigne") or "").strip() or None
        name = brand or pdv.attrib.get("id")

        for child in pdv:
            if child.tag == "adresse":
                address = (child.text or "").strip()
            elif child.tag == "ville" and not city:
                city = (child.text or "").strip()
            elif child.tag == "prix":
                fuel_name = FUEL_NAME_MAP.get(child.attrib.get("nom", ""))
                if not fuel_name:
                    continue

                price_value = _parse_price(child.attrib.get("valeur"))
                if price_value is None:
                    continue

                fuels.append(
                    {
                        "fuel_type": fuel_name,
                        "price": price_value,
                        "updated_at": _parse_timestamp(child.attrib.get("maj")),
                    }
                )
            elif child.tag == "service" and child.text:
                services.append(child.text.strip())

        if not fuels:
            continue

        record = _build_station_record(
            station_id=pdv.attrib["id"],
            latitude=latitude,
            longitude=longitude,
            address=address,
            city=city,
            postal_code=postal_code,
            brand=brand,
            name=name,
            services=services,
            fuels=fuels,
        )
        if record is not None:
            stations.append(record)

    return stations


def parse_station_payload(payload: bytes) -> list[StationRecord]:
    stripped_payload = payload.lstrip()
    if stripped_payload.startswith(b"[") or stripped_payload.startswith(b"{"):
        return parse_station_json(payload)
    return parse_station_xml(payload)


def build_upsert_queries(stations: list[StationRecord]) -> tuple[str, list[dict[str, object]]]:
    query = """
    INSERT INTO stations (
        id, name, brand, address, city, postal_code, latitude, longitude, services, geom, updated_at
    )
    VALUES (
        :station_id,
        :name,
        :brand,
        :address,
        :city,
        :postal_code,
        :latitude,
        :longitude,
        :services,
        ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography,
        :updated_at
    )
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        brand = EXCLUDED.brand,
        address = EXCLUDED.address,
        city = EXCLUDED.city,
        postal_code = EXCLUDED.postal_code,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        services = EXCLUDED.services,
        geom = EXCLUDED.geom,
        updated_at = EXCLUDED.updated_at
    """

    params: list[dict[str, object]] = []
    for station in stations:
        params.append(
            {
                "station_id": station.station_id,
                "name": station.name,
                "brand": station.brand,
                "address": station.address,
                "city": station.city,
                "postal_code": station.postal_code,
                "latitude": station.latitude,
                "longitude": station.longitude,
                "services": station.services,
                "updated_at": station.updated_at,
            }
        )
    return query, params


def build_price_rows(stations: list[StationRecord]) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for station in stations:
        for fuel in station.fuels:
            rows.append(
                {
                    "station_id": station.station_id,
                    "fuel_type": fuel["fuel_type"],
                    "price": float(fuel["price"]),
                    "updated_at": fuel["updated_at"],
                }
            )
    return rows
