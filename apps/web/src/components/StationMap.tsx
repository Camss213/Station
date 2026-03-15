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

function getMapsLinks(station: StationItem) {
  if (station.latitude === null || station.longitude === null) {
    return {
      google: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${station.address}, ${station.postalCode ?? ""} ${station.city}`
      )}`,
      apple: `https://maps.apple.com/?q=${encodeURIComponent(
        `${station.address}, ${station.postalCode ?? ""} ${station.city}`
      )}`,
    };
  }

  return {
    google: `https://www.google.com/maps/search/?api=1&query=${station.latitude},${station.longitude}`,
    apple: `https://maps.apple.com/?ll=${station.latitude},${station.longitude}&q=${encodeURIComponent(
      station.brand ?? station.name ?? "Station"
    )}`,
  };
}

function createPriceIcon(price: number) {
  return L.divIcon({
    className: "fuel-price-pin",
    html: `<div class="fuel-price-pin__label">${price.toFixed(3)} EUR</div><div class="fuel-price-pin__dot"></div>`,
    iconSize: [78, 36],
    iconAnchor: [39, 34],
    popupAnchor: [0, -26],
  });
}

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

      const mapsLinks = getMapsLinks(station);
      const popup = `
        <div class="fuel-popup">
          <div class="fuel-popup__eyebrow">Station</div>
          <div class="fuel-popup__title">${station.brand ?? station.name ?? "Station"}</div>
          <div class="fuel-popup__address">${station.address}</div>
          <div class="fuel-popup__city">${station.postalCode ?? ""} ${station.city}</div>
          <div class="fuel-popup__price">${station.price.toFixed(3)} EUR/L</div>
          <div class="fuel-popup__actions">
            <a class="fuel-popup__button" href="${mapsLinks.google}" target="_blank" rel="noreferrer">Google Maps</a>
            <a class="fuel-popup__button fuel-popup__button--secondary" href="${mapsLinks.apple}" target="_blank" rel="noreferrer">Plans</a>
          </div>
        </div>
      `;

      const marker = L.marker([station.latitude, station.longitude], {
        icon: createPriceIcon(station.price),
      }).bindPopup(popup);
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
