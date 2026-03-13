import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Marker as LeafletMarker } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import type { StationItem } from "../lib/fuel";

type StationMapProps = {
  stations: StationItem[];
  center: { lat: number; lng: number } | null;
};

const userIcon = L.divIcon({
  className: "fuel-user-pin",
  html: '<div class="fuel-user-pin__dot"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const stationIcon = L.divIcon({
  className: "fuel-station-pin",
  html: '<div class="fuel-station-pin__dot"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

export function StationMap({ stations, center }: StationMapProps) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<LeafletMarker[]>([]);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) {
      return;
    }

    mapRef.current = L.map(mapElementRef.current, {
      zoomControl: false,
      attributionControl: true,
    }).setView([48.8566, 2.3522], 11);

    L.control.zoom({ position: "bottomright" }).addTo(mapRef.current);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(mapRef.current);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    const bounds: [number, number][] = [];

    if (center) {
      const userMarker = L.marker([center.lat, center.lng], { icon: userIcon }).bindPopup(
        "Votre position"
      );
      userMarker.addTo(map);
      markersRef.current.push(userMarker);
      bounds.push([center.lat, center.lng]);
    }

    stations.forEach((station) => {
      if (station.latitude === null || station.longitude === null) {
        return;
      }

      const popup = `
        <div style="min-width: 180px">
          <strong>${station.brand ?? station.name ?? "Station"}</strong><br />
          <span>${station.address}</span><br />
          <span>${station.postalCode ?? ""} ${station.city}</span><br />
          <strong>${station.price.toFixed(3)} EUR/L</strong>
        </div>
      `;

      const marker = L.marker([station.latitude, station.longitude], { icon: stationIcon }).bindPopup(
        popup
      );
      marker.addTo(map);
      markersRef.current.push(marker);
      bounds.push([station.latitude, station.longitude]);
    });

    if (bounds.length === 1) {
      map.setView(bounds[0], 13);
      return;
    }

    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [28, 28] });
    }
  }, [center, stations]);

  return <div ref={mapElementRef} className="h-[420px] w-full rounded-[28px] border border-white/10" />;
}
