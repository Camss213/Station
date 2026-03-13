export type FuelType = "Gazole" | "SP95" | "SP98" | "E10" | "E85";

export type StationItem = {
  stationId: string;
  brand: string | null;
  name?: string;
  address: string;
  city: string;
  postalCode?: string;
  fuelType: FuelType;
  price: number;
  distanceKm: number | null;
  updatedAt: string;
  latitude: number | null;
  longitude: number | null;
};

export type StationApiItem = {
  station_id: string;
  brand: string | null;
  name?: string | null;
  address: string;
  city: string;
  postal_code: string;
  fuel_type: FuelType;
  price: number;
  distance_km: number | null;
  updated_at: string;
  latitude?: number | null;
  longitude?: number | null;
};

export function mapApiStation(item: StationApiItem): StationItem {
  return {
    stationId: item.station_id,
    brand: item.brand,
    name: item.name ?? undefined,
    address: item.address,
    city: item.city,
    postalCode: item.postal_code,
    fuelType: item.fuel_type,
    price: item.price,
    distanceKm: item.distance_km,
    updatedAt: item.updated_at,
    latitude: item.latitude ?? null,
    longitude: item.longitude ?? null,
  };
}
