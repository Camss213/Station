import { mapApiStation, type FuelType, type StationApiItem, type StationItem } from "./fuel";

const LOCAL_API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";
const OFFICIAL_API_URL =
  "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records";

type SearchStationsParams = {
  fuelType: FuelType;
  query: string;
  radiusKm: number;
  lat?: number | null;
  lng?: number | null;
  signal?: AbortSignal;
  offset?: number;
  limit?: number;
};

export type SearchStationsResult = {
  stations: StationItem[];
  hasMore: boolean;
  totalCount: number | null;
};

type OfficialStationRecord = {
  id: string | number;
  adresse?: string;
  ville?: string;
  cp?: string | number;
  enseigne?: string | null;
  brand?: string | null;
  pop?: string | null;
  nom?: string | null;
  name?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  geom?: {
    lat?: number;
    lon?: number;
  } | null;
  gazole_prix?: string | number | null;
  gazole_maj?: string | null;
  sp95_prix?: string | number | null;
  sp95_maj?: string | null;
  sp98_prix?: string | number | null;
  sp98_maj?: string | null;
  e10_prix?: string | number | null;
  e10_maj?: string | null;
  e85_prix?: string | number | null;
  e85_maj?: string | null;
};

type OfficialApiResponse = {
  results: OfficialStationRecord[];
  total_count?: number;
};

type CacheEntry = {
  createdAt: number;
  data: SearchStationsResult;
};

const requestCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;
const FULL_DATASET_PAGE_SIZE = 100;
const FULL_DATASET_MAX_RECORDS = 20_000;

let fullDatasetPromise: Promise<OfficialStationRecord[]> | null = null;
let fullDatasetCache: OfficialStationRecord[] | null = null;

function getFuelKeys(fuelType: FuelType) {
  switch (fuelType) {
    case "Gazole":
      return { price: "gazole_prix", updatedAt: "gazole_maj" } as const;
    case "SP95":
      return { price: "sp95_prix", updatedAt: "sp95_maj" } as const;
    case "SP98":
      return { price: "sp98_prix", updatedAt: "sp98_maj" } as const;
    case "E10":
      return { price: "e10_prix", updatedAt: "e10_maj" } as const;
    case "E85":
      return { price: "e85_prix", updatedAt: "e85_maj" } as const;
  }
}

function parseCoordinate(value: number | string | null | undefined, fallback?: number) {
  if (typeof value === "number") {
    return Math.abs(value) > 180 ? value / 100000 : value;
  }
  if (typeof value === "string" && value.trim()) {
    const numericValue = Number(value);
    if (!Number.isNaN(numericValue)) {
      return Math.abs(numericValue) > 180 ? numericValue / 100000 : numericValue;
    }
  }
  return fallback ?? 0;
}

function toDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const earthRadiusKm = 6371;
  const deltaLat = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLng = ((lng2 - lng1) * Math.PI) / 180;
  const startLat = (lat1 * Math.PI) / 180;
  const endLat = (lat2 * Math.PI) / 180;
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) ** 2;

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(haversine));
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function pickStationName(record: OfficialStationRecord) {
  const candidates = [record.enseigne, record.nom, record.name, record.brand, record.pop]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 1);

  const brand = candidates[0] ?? null;
  const name = candidates[1] ?? candidates[0] ?? null;
  return { brand, name };
}

function buildCacheKey({
  fuelType,
  query,
  radiusKm,
  lat,
  lng,
  offset = 0,
  limit = 100,
}: SearchStationsParams) {
  return JSON.stringify({
    fuelType,
    query: normalizeText(query),
    radiusKm,
    lat: lat === null || lat === undefined ? null : Number(lat.toFixed(3)),
    lng: lng === null || lng === undefined ? null : Number(lng.toFixed(3)),
    offset,
    limit,
  });
}

function normalizeOfficialRecord(
  record: OfficialStationRecord,
  fuelType: FuelType,
  lat?: number | null,
  lng?: number | null
): StationItem | null {
  const fuelKeys = getFuelKeys(fuelType);
  const rawPrice = record[fuelKeys.price];
  if (rawPrice === null || rawPrice === undefined || rawPrice === "") {
    return null;
  }

  const price = Number(String(rawPrice).replace(",", "."));
  if (Number.isNaN(price)) {
    return null;
  }

  const stationLat = parseCoordinate(record.latitude, record.geom?.lat);
  const stationLng = parseCoordinate(record.longitude, record.geom?.lon);
  const distanceKm =
    typeof lat === "number" && typeof lng === "number"
      ? Number(toDistanceKm(lat, lng, stationLat, stationLng).toFixed(2))
      : null;
  const names = pickStationName(record);

  return mapApiStation({
    station_id: String(record.id),
    brand: names.brand,
    name: names.name,
    address: record.adresse ?? "Adresse indisponible",
    city: record.ville ?? "Ville inconnue",
    postal_code: String(record.cp ?? ""),
    fuel_type: fuelType,
    price,
    distance_km: distanceKm,
    updated_at: String(record[fuelKeys.updatedAt] ?? new Date().toISOString()),
    latitude: stationLat,
    longitude: stationLng,
  });
}

async function fetchOfficialPage(
  params: URLSearchParams,
  signal?: AbortSignal
): Promise<OfficialApiResponse> {
  const response = await fetch(`${OFFICIAL_API_URL}?${params.toString()}`, { signal });
  if (!response.ok) {
    throw new Error("L'API officielle des carburants ne repond pas correctement.");
  }
  return (await response.json()) as OfficialApiResponse;
}

async function fetchFullDataset(signal?: AbortSignal): Promise<OfficialStationRecord[]> {
  if (fullDatasetCache) {
    return fullDatasetCache;
  }
  if (fullDatasetPromise) {
    return fullDatasetPromise;
  }

  fullDatasetPromise = (async () => {
    const allRecords: OfficialStationRecord[] = [];
    for (let offset = 0; offset < FULL_DATASET_MAX_RECORDS; offset += FULL_DATASET_PAGE_SIZE) {
      const params = new URLSearchParams({
        limit: String(FULL_DATASET_PAGE_SIZE),
        offset: String(offset),
      });
      const payload = await fetchOfficialPage(params, signal);
      const results = payload.results ?? [];
      allRecords.push(...results);
      if (results.length < FULL_DATASET_PAGE_SIZE) {
        break;
      }
    }
    fullDatasetCache = allRecords;
    return allRecords;
  })();

  try {
    return await fullDatasetPromise;
  } finally {
    if (!fullDatasetCache) {
      fullDatasetPromise = null;
    }
  }
}

function applyLocalSearch(
  records: OfficialStationRecord[],
  fuelType: FuelType,
  query: string,
  lat?: number | null,
  lng?: number | null,
  radiusKm?: number
): StationItem[] {
  const normalizedQuery = normalizeText(query);
  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);

  return records
    .map((record) => normalizeOfficialRecord(record, fuelType, lat, lng))
    .filter((station): station is StationItem => station !== null)
    .filter((station) => {
      if (!queryTokens.length) {
        return true;
      }
      const haystack = normalizeText(
        `${station.brand ?? ""} ${station.name ?? ""} ${station.city} ${station.address} ${station.postalCode ?? ""}`
      );
      return queryTokens.every((token) => haystack.includes(token));
    })
    .filter((station) => {
      if (typeof lat !== "number" || typeof lng !== "number" || typeof radiusKm !== "number") {
        return true;
      }
      return station.distanceKm !== null && station.distanceKm <= radiusKm;
    })
    .sort(
      (left, right) =>
        left.price - right.price || (left.distanceKm ?? 999999) - (right.distanceKm ?? 999999)
    );
}

async function searchStationsOfficial({
  fuelType,
  query,
  radiusKm,
  lat,
  lng,
  signal,
  offset = 0,
  limit = 100,
}: SearchStationsParams): Promise<SearchStationsResult> {
  const cacheKey = buildCacheKey({
    fuelType,
    query,
    radiusKm,
    lat,
    lng,
    offset,
    limit,
  });
  const cached = requestCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const normalizedQuery = normalizeText(query);
  let result: SearchStationsResult;

  if (normalizedQuery) {
    const fullDataset = await fetchFullDataset(signal);
    const searchedStations = applyLocalSearch(fullDataset, fuelType, query, lat, lng, radiusKm);
    result = {
      stations: searchedStations.slice(offset, offset + limit),
      hasMore: offset + limit < searchedStations.length,
      totalCount: searchedStations.length,
    };
  } else {
    const fuelKeys = getFuelKeys(fuelType);
    const baseParams = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      order_by: `${fuelKeys.price} asc`,
    });

    const whereClauses: string[] = [`${fuelKeys.price} is not null`];

    if (typeof lat === "number" && typeof lng === "number") {
      whereClauses.push(`within_distance(geom, geom'POINT(${lng} ${lat})', ${radiusKm}km)`);
    }

    baseParams.set("where", whereClauses.join(" AND "));
    const payload = await fetchOfficialPage(baseParams, signal);
    const stations = (payload.results ?? [])
      .map((record) => normalizeOfficialRecord(record, fuelType, lat, lng))
      .filter((station): station is StationItem => station !== null)
      .sort(
        (left, right) =>
          left.price - right.price || (left.distanceKm ?? 999999) - (right.distanceKm ?? 999999)
      );

    const totalCount = payload.total_count ?? null;
    result = {
      stations,
      hasMore: totalCount !== null ? offset + stations.length < totalCount : stations.length === limit,
      totalCount,
    };
  }

  requestCache.set(cacheKey, {
    createdAt: Date.now(),
    data: result,
  });
  return result;
}

async function searchStationsLocal(params: SearchStationsParams): Promise<SearchStationsResult> {
  const searchParams = new URLSearchParams({
    fuel_type: params.fuelType,
    radius_km: String(params.radiusKm),
    limit: String(params.limit ?? 100),
  });

  if (params.query.trim()) {
    searchParams.set("q", params.query.trim());
  }

  if (typeof params.lat === "number" && typeof params.lng === "number") {
    searchParams.set("lat", String(params.lat));
    searchParams.set("lng", String(params.lng));
  }

  const response = await fetch(`${LOCAL_API_URL}/stations?${searchParams.toString()}`, {
    signal: params.signal,
  });

  if (!response.ok) {
    let message = "Impossible de charger les stations.";
    try {
      const errorPayload = (await response.json()) as { detail?: string };
      if (errorPayload.detail) {
        message = errorPayload.detail;
      }
    } catch {
      // no-op
    }
    throw new Error(message);
  }

  const payload = (await response.json()) as StationApiItem[];
  return {
    stations: payload.map(mapApiStation),
    hasMore: false,
    totalCount: payload.length,
  };
}

export function preloadOfficialDataset() {
  void fetchFullDataset();
}

export async function searchStations(params: SearchStationsParams): Promise<SearchStationsResult> {
  try {
    return await searchStationsOfficial(params);
  } catch (error) {
    if (import.meta.env.VITE_USE_LOCAL_API === "true") {
      return searchStationsLocal(params);
    }
    throw error;
  }
}
