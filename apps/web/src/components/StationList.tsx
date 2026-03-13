import {
  Download,
  Fuel,
  List,
  LoaderCircle,
  LocateFixed,
  MapPinned,
  Search,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";

import { preloadOfficialDataset, searchStations } from "../lib/api";
import type { FuelType, StationItem } from "../lib/fuel";
import { StationMap } from "./StationMap";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const fuelOptions: FuelType[] = ["Gazole", "SP95", "SP98", "E10", "E85"];
const DEFAULT_POSITION = { lat: 48.8566, lng: 2.3522 };
const PAGE_SIZE = 40;

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debouncedValue;
}

function requestCurrentPosition(setPosition: (value: { lat: number; lng: number }) => void) {
  if (!navigator.geolocation) {
    setPosition(DEFAULT_POSITION);
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (geoPosition) => {
      setPosition({
        lat: geoPosition.coords.latitude,
        lng: geoPosition.coords.longitude,
      });
    },
    () => {
      setPosition(DEFAULT_POSITION);
    },
    {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 300000,
    }
  );
}

function formatDistance(distanceKm: number | null) {
  if (distanceKm === null) {
    return "N/A";
  }
  return `${distanceKm.toFixed(1)} km`;
}

function getStationTitle(station: StationItem) {
  return station.brand ?? station.name ?? station.address;
}

function getStationSubtitle(station: StationItem) {
  if (station.brand && station.name && station.name !== station.brand) {
    return station.name;
  }
  return station.address;
}

export function StationList() {
  const [stations, setStations] = useState<StationItem[]>([]);
  const [query, setQuery] = useState("");
  const [fuelType, setFuelType] = useState<FuelType>("Gazole");
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "map">("list");
  const [scope, setScope] = useState<"nearby" | "france">("france");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const debouncedQuery = useDebouncedValue(query, 350);
  const hasActiveSearch = debouncedQuery.trim().length > 0;
  const useNearbyScope = scope === "nearby" && !hasActiveSearch;

  useEffect(() => {
    requestCurrentPosition(setPosition);
    preloadOfficialDataset();
  }, []);

  useEffect(() => {
    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadStations() {
      setIsLoading(true);
      setError(null);

      try {
        const result = await searchStations({
          fuelType,
          query: debouncedQuery,
          radiusKm: useNearbyScope ? 20 : 1000,
          lat: useNearbyScope ? position?.lat : null,
          lng: useNearbyScope ? position?.lng : null,
          signal: controller.signal,
          offset: 0,
          limit: PAGE_SIZE,
        });
        setStations(result.stations);
        setHasMore(result.hasMore);
        setTotalCount(result.totalCount);
        setOffset(result.stations.length);
      } catch (fetchError) {
        if (controller.signal.aborted) {
          return;
        }
        setError(fetchError instanceof Error ? fetchError.message : "Erreur de chargement.");
        setStations([]);
        setHasMore(false);
        setTotalCount(null);
        setOffset(0);
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    if (useNearbyScope && !position) {
      return;
    }

    loadStations();
    return () => controller.abort();
  }, [debouncedQuery, fuelType, position, scope, useNearbyScope]);

  async function loadMoreStations() {
    setIsLoadingMore(true);
    setError(null);

    try {
      const result = await searchStations({
        fuelType,
        query: debouncedQuery,
        radiusKm: useNearbyScope ? 20 : 1000,
        lat: useNearbyScope ? position?.lat : null,
        lng: useNearbyScope ? position?.lng : null,
        offset,
        limit: PAGE_SIZE,
      });
      setStations((current) => [...current, ...result.stations]);
      setHasMore(result.hasMore);
      setTotalCount(result.totalCount);
      setOffset((current) => current + result.stations.length);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Erreur de chargement.");
    } finally {
      setIsLoadingMore(false);
    }
  }

  async function handleInstallApp() {
    if (!installPrompt) {
      return;
    }

    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  const filteredStations = [...stations].sort(
    (left, right) => left.price - right.price || (left.distanceKm ?? 999) - (right.distanceKm ?? 999)
  );

  const cheapestPrice = filteredStations[0]?.price ?? null;
  const highestPrice = filteredStations.at(-1)?.price ?? null;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(74,222,128,0.16),_transparent_35%),linear-gradient(180deg,_#081014_0%,_#0d171d_45%,_#081014_100%)] px-4 py-6 text-slate-100">
      <section className="mx-auto flex max-w-xl flex-col gap-4">
        <header className="rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-glow backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-mint/80">HakoWay</p>
              <h1 className="mt-2 text-3xl font-semibold">Stations autour de vous</h1>
            </div>
            <button
              className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-mint/30 bg-mint/10 text-mint"
              onClick={() => requestCurrentPosition(setPosition)}
              type="button"
            >
              <LocateFixed className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-panel px-4 py-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                placeholder="Ville, code postal ou adresse"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>

            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm ${
                  scope === "france"
                    ? "border-mint bg-mint text-ink"
                    : "border-white/10 bg-white/5 text-slate-300"
                }`}
                onClick={() => setScope("france")}
                type="button"
              >
                France entiere
              </button>
              <button
                className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm ${
                  scope === "nearby"
                    ? "border-mint bg-mint text-ink"
                    : "border-white/10 bg-white/5 text-slate-300"
                }`}
                onClick={() => setScope("nearby")}
                type="button"
              >
                Autour de moi
              </button>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              {fuelOptions.map((option) => (
                <button
                  key={option}
                  className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm ${
                    option === fuelType
                      ? "border-mint bg-mint text-ink"
                      : "border-white/10 bg-white/5 text-slate-300"
                  }`}
                  onClick={() => setFuelType(option)}
                  type="button"
                >
                  <span className="inline-flex items-center gap-2">
                    <Fuel className="h-4 w-4" />
                    {option}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-3xl border border-mint/20 bg-mint/10 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-mint/80">Moins cher</p>
            <p className="mt-2 text-2xl font-semibold">
              {cheapestPrice !== null ? `${cheapestPrice.toFixed(3)} EUR/L` : "--"}
            </p>
          </div>
          <div className="rounded-3xl border border-coral/20 bg-coral/10 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-coral/80">Plus cher</p>
            <p className="mt-2 text-2xl font-semibold">
              {highestPrice !== null ? `${highestPrice.toFixed(3)} EUR/L` : "--"}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm text-slate-400">
          <p>
            {isLoading
              ? "Chargement..."
              : `${filteredStations.length} stations chargees${
                  totalCount !== null ? ` / ${totalCount}` : ""
                }${useNearbyScope ? " autour de vous" : " sur la France"}`}
          </p>
          <div className="flex items-center gap-2">
            {installPrompt ? (
              <button
                className="inline-flex items-center gap-2 rounded-full border border-mint/30 bg-mint/10 px-3 py-2 text-mint"
                onClick={() => void handleInstallApp()}
                type="button"
              >
                <Download className="h-4 w-4" />
                Installer
              </button>
            ) : null}
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 p-1">
              <button
                className={`inline-flex items-center gap-2 rounded-full px-3 py-2 ${
                  view === "list" ? "bg-mint text-ink" : "text-slate-300"
                }`}
                onClick={() => setView("list")}
                type="button"
              >
                <List className="h-4 w-4" />
                Liste
              </button>
              <button
                className={`inline-flex items-center gap-2 rounded-full px-3 py-2 ${
                  view === "map" ? "bg-mint text-ink" : "text-slate-300"
                }`}
                onClick={() => setView("map")}
                type="button"
              >
                <MapPinned className="h-4 w-4" />
                Carte
              </button>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-3 rounded-[24px] border border-white/10 bg-white/5 p-6 text-slate-300">
            <LoaderCircle className="h-5 w-5 animate-spin" />
            Chargement des prix officiels en France...
          </div>
        ) : null}

        {error ? (
          <div className="flex items-center gap-3 rounded-[24px] border border-coral/30 bg-coral/10 p-4 text-sm text-coral">
            <TriangleAlert className="h-5 w-5 shrink-0" />
            {error}
          </div>
        ) : null}

        {!isLoading && !error && filteredStations.length === 0 ? (
          <div className="rounded-[24px] border border-white/10 bg-white/5 p-5 text-sm text-slate-300">
            Aucune station trouvee pour cette zone ou ce carburant.
          </div>
        ) : null}

        {!isLoading && !error && filteredStations.length > 0 && view === "map" ? (
          <StationMap stations={filteredStations} center={position} />
        ) : null}

        {!isLoading && !error && filteredStations.length > 0 && view === "list" ? (
          <section className="flex flex-col gap-3">
            {filteredStations.map((station, index) => {
              const accent =
                index === 0
                  ? "border-mint/30 bg-mint/10"
                  : index === filteredStations.length - 1
                    ? "border-coral/20 bg-coral/10"
                    : "border-white/10 bg-white/5";

              return (
                <article
                  key={`${station.stationId}-${station.fuelType}`}
                  className={`rounded-[24px] border p-4 shadow-glow backdrop-blur ${accent}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-lg font-semibold">{getStationTitle(station)}</p>
                      <p className="text-sm text-slate-400">{getStationSubtitle(station)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-semibold">{station.price.toFixed(3)} EUR</p>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">par litre</p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between text-sm text-slate-300">
                    <div>
                      <p>{station.address}</p>
                      <p className="text-slate-500">
                        {station.postalCode ? `${station.postalCode} ` : ""}
                        {station.city}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-ink/60 px-3 py-2 text-right">
                      <p className="font-medium">{formatDistance(station.distanceKm)}</p>
                      <p className="text-xs text-slate-500">{station.fuelType}</p>
                    </div>
                  </div>
                </article>
              );
            })}
            {scope === "france" && hasMore ? (
              <button
                className="rounded-[24px] border border-white/10 bg-white/5 px-4 py-4 text-sm text-slate-200"
                disabled={isLoadingMore}
                onClick={() => void loadMoreStations()}
                type="button"
              >
                {isLoadingMore ? "Chargement..." : "Charger plus de stations"}
              </button>
            ) : null}
          </section>
        ) : null}
      </section>
    </main>
  );
}
