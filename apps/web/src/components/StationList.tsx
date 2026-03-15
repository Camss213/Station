import {
  ArrowDownUp,
  CircleAlert,
  Download,
  ExternalLink,
  Fuel,
  Heart,
  LayoutGrid,
  List,
  LoaderCircle,
  LocateFixed,
  MapPinned,
  Search,
  Star,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  getSearchSuggestions,
  preloadOfficialDataset,
  searchStations,
  type SearchSuggestion,
} from "../lib/api";
import type { FuelType, StationItem } from "../lib/fuel";
import { StationMap } from "./StationMap";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const fuelOptions: FuelType[] = ["Gazole", "SP95", "SP98", "E10", "E85"];
const DEFAULT_POSITION = { lat: 48.8566, lng: 2.3522 };
const PAGE_SIZE = 40;
const FAVORITES_STORAGE_KEY = "hakoway-favorites";

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debouncedValue;
}

function requestCurrentPosition(
  setPosition: (value: { lat: number; lng: number }) => void,
  onDenied?: () => void
) {
  if (!navigator.geolocation) {
    setPosition(DEFAULT_POSITION);
    onDenied?.();
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
      onDenied?.();
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

function shouldShowAddressLine(station: StationItem) {
  const title = getStationTitle(station).trim().toLowerCase();
  const subtitle = getStationSubtitle(station).trim().toLowerCase();
  const address = station.address.trim().toLowerCase();

  return address !== title && address !== subtitle;
}

function getMapsLink(station: StationItem) {
  if (station.latitude !== null && station.longitude !== null) {
    return `https://www.google.com/maps/search/?api=1&query=${station.latitude},${station.longitude}`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${station.address}, ${station.postalCode ?? ""} ${station.city}`
  )}`;
}

function loadFavorites() {
  try {
    const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function StationList() {
  const [stations, setStations] = useState<StationItem[]>([]);
  const [query, setQuery] = useState("");
  const [fuelType, setFuelType] = useState<FuelType>("Gazole");
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "grid" | "map">("list");
  const [scope, setScope] = useState<"nearby" | "france">("nearby");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [sortBy, setSortBy] = useState<"price" | "distance" | "name">("price");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const debouncedQuery = useDebouncedValue(query, 350);
  const hasActiveSearch = debouncedQuery.trim().length > 0;
  const useNearbyScope = scope === "nearby" && !hasActiveSearch;

  useEffect(() => {
    requestCurrentPosition(setPosition, () => setShowLocationModal(true));
    preloadOfficialDataset();
    setFavorites(loadFavorites());
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

    async function loadSuggestions() {
      if (debouncedQuery.trim().length < 2) {
        setSuggestions([]);
        return;
      }

      try {
        const result = await getSearchSuggestions(debouncedQuery);
        setSuggestions(result);
      } catch {
        setSuggestions([]);
      }
    }

    void loadSuggestions();
    return () => controller.abort();
  }, [debouncedQuery]);

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
          lat: position?.lat ?? null,
          lng: position?.lng ?? null,
          useDistanceFilter: useNearbyScope,
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
        lat: position?.lat ?? null,
        lng: position?.lng ?? null,
        useDistanceFilter: useNearbyScope,
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

  function toggleFavorite(stationId: string) {
    setFavorites((current) => {
      const next = current.includes(stationId)
        ? current.filter((id) => id !== stationId)
        : [...current, stationId];
      window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  function applySuggestion(suggestion: SearchSuggestion) {
    setQuery(suggestion.query);
    setSuggestions([]);
  }

  const filteredStations = [...stations]
    .filter((station) => !favoritesOnly || favorites.includes(station.stationId))
    .sort((left, right) => {
      if (sortBy === "distance") {
        return (left.distanceKm ?? 999) - (right.distanceKm ?? 999) || left.price - right.price;
      }
      if (sortBy === "name") {
        return getStationTitle(left).localeCompare(getStationTitle(right), "fr", {
          sensitivity: "base",
        });
      }
      return left.price - right.price || (left.distanceKm ?? 999) - (right.distanceKm ?? 999);
    });

  const cheapestPrice = filteredStations[0]?.price ?? null;
  const highestPrice = filteredStations.at(-1)?.price ?? null;

  return (
    <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,_rgba(74,222,128,0.16),_transparent_35%),linear-gradient(180deg,_#081014_0%,_#0d171d_45%,_#081014_100%)] px-3 py-4 text-slate-100 sm:px-4 sm:py-6">
      <section className="mx-auto flex w-full max-w-xl min-w-0 flex-col gap-4">
        <header className="rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-glow backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-mint/80">HakoWay</p>
              <h1 className="mt-2 text-3xl font-semibold">Stations autour de vous</h1>
            </div>
            <button
              className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-mint/30 bg-mint/10 text-mint"
              onClick={() =>
                requestCurrentPosition(setPosition, () => setShowLocationModal(true))
              }
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

            {suggestions.length > 0 ? (
              <div className="rounded-2xl border border-white/10 bg-panel/95 p-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={`${suggestion.label}-${suggestion.query}`}
                    className="block w-full rounded-xl px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/5"
                    onClick={() => applySuggestion(suggestion)}
                    type="button"
                  >
                    {suggestion.label}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="flex justify-center gap-2 pb-1">
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
            </div>

            <div className="grid gap-2">
              <div className="grid grid-cols-3 gap-2">
                {fuelOptions.slice(0, 3).map((option) => (
                  <button
                    key={option}
                    className={`rounded-full border px-3 py-3 text-sm ${
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
              <div className="mx-auto grid w-[70%] grid-cols-2 gap-2">
                {fuelOptions.slice(3).map((option) => (
                  <button
                    key={option}
                    className={`rounded-full border px-3 py-3 text-sm ${
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
          </div>
        </header>

        <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
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

        <div className="flex flex-col gap-3 text-sm text-slate-400 min-[430px]:flex-row min-[430px]:items-center min-[430px]:justify-between">
          <p className="max-w-full">
            {isLoading
              ? "Chargement..."
              : `${filteredStations.length} stations chargees${
                  totalCount !== null ? ` / ${totalCount}` : ""
                }${useNearbyScope ? " autour de vous" : " sur la France"}`}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 min-[430px]:justify-start">
            <div className="flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-slate-300">
              <ArrowDownUp className="h-4 w-4" />
              <select
                className="min-w-0 bg-transparent text-sm outline-none"
                onChange={(event) => setSortBy(event.target.value as "price" | "distance" | "name")}
                value={sortBy}
              >
                <option className="bg-ink text-white" value="price">
                  Prix
                </option>
                <option className="bg-ink text-white" value="distance">
                  Distance
                </option>
                <option className="bg-ink text-white" value="name">
                  Nom
                </option>
              </select>
            </div>
            <button
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 ${
                favoritesOnly
                  ? "border-mint/30 bg-mint/10 text-mint"
                  : "border-white/10 bg-white/5 text-slate-300"
              }`}
              onClick={() => setFavoritesOnly((current) => !current)}
              type="button"
            >
              <Star className="h-4 w-4" />
              Favoris
            </button>
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
            <div className="grid w-full grid-cols-3 rounded-full border border-white/10 bg-white/5 p-1 min-[430px]:flex min-[430px]:w-auto min-[430px]:items-center min-[430px]:gap-2">
              <button
                className={`inline-flex items-center justify-center gap-2 rounded-full px-3 py-2 ${
                  view === "list" ? "bg-mint text-ink" : "text-slate-300"
                }`}
                onClick={() => setView("list")}
                type="button"
              >
                <List className="h-4 w-4 shrink-0" />
                <span className="hidden min-[360px]:inline">Liste</span>
              </button>
              <button
                className={`inline-flex items-center justify-center gap-2 rounded-full px-3 py-2 ${
                  view === "grid" ? "bg-mint text-ink" : "text-slate-300"
                }`}
                onClick={() => setView("grid")}
                type="button"
              >
                <LayoutGrid className="h-4 w-4 shrink-0" />
                <span className="hidden min-[360px]:inline">Grille</span>
              </button>
              <button
                className={`inline-flex items-center justify-center gap-2 rounded-full px-3 py-2 ${
                  view === "map" ? "bg-mint text-ink" : "text-slate-300"
                }`}
                onClick={() => setView("map")}
                type="button"
              >
                <MapPinned className="h-4 w-4 shrink-0" />
                <span className="hidden min-[360px]:inline">Carte</span>
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

        {!isLoading && !error && filteredStations.length > 0 && view !== "map" ? (
          <section
            className={
              view === "grid"
                ? "grid grid-cols-2 gap-3"
                : "flex flex-col gap-3"
            }
          >
            {filteredStations.map((station, index) => {
              const accent =
                index === 0
                  ? "border-mint/30 bg-mint/10"
                  : index === filteredStations.length - 1
                    ? "border-coral/20 bg-coral/10"
                    : "border-white/10 bg-white/5";
              const isGridView = view === "grid";

              return (
                <article
                  key={`${station.stationId}-${station.fuelType}`}
                  className={`rounded-[22px] border shadow-glow backdrop-blur min-[380px]:rounded-[24px] ${
                    isGridView ? "p-3" : "p-2.5 min-[380px]:p-3"
                  } ${accent}`}
                >
                  {isGridView ? (
                    <div className="flex h-full flex-col gap-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-base font-semibold leading-tight min-[380px]:text-lg">
                            {getStationTitle(station)}
                          </p>
                          <p className="mt-0.5 line-clamp-2 text-xs text-slate-400 min-[380px]:text-sm">
                            {station.postalCode ? `${station.postalCode} ` : ""}
                            {station.city}
                          </p>
                        </div>
                        <button
                          className={`shrink-0 rounded-full border p-2 ${
                            favorites.includes(station.stationId)
                              ? "border-mint/30 bg-mint/15 text-mint"
                              : "border-white/10 bg-white/5 text-slate-300"
                          }`}
                          onClick={() => toggleFavorite(station.stationId)}
                          type="button"
                        >
                          <Heart
                            className="h-4 w-4"
                            fill={favorites.includes(station.stationId) ? "currentColor" : "none"}
                          />
                        </button>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-ink/30 p-2.5 min-[380px]:p-3">
                        <p className="text-lg font-semibold min-[380px]:text-xl">
                          {station.price.toFixed(3)} EUR
                        </p>
                        <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                          par litre
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1 rounded-2xl bg-ink/60 px-3 py-2">
                          <p className="truncate text-sm font-medium">
                            {formatDistance(station.distanceKm)}
                          </p>
                          <p className="text-xs text-slate-500">{station.fuelType}</p>
                        </div>
                        <a
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl border border-mint/20 bg-mint/10 px-2.5 py-2 text-[11px] text-mint min-[380px]:gap-2 min-[380px]:px-3 min-[380px]:text-xs"
                          href={getMapsLink(station)}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span className="hidden min-[380px]:inline">Maps</span>
                        </a>
                      </div>

                      {shouldShowAddressLine(station) ? (
                        <p className="mt-auto text-xs text-slate-400 min-[380px]:text-sm">
                          {station.address}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] font-semibold leading-tight min-[380px]:text-base">
                            {getStationTitle(station)}
                          </p>
                          <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-400 min-[380px]:text-xs">
                            {getStationSubtitle(station)}
                          </p>
                          <p className="mt-2 text-xs text-slate-500 min-[380px]:text-sm">
                            {station.postalCode ? `${station.postalCode} ` : ""}
                            {station.city}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-start gap-2">
                          <button
                            className={`rounded-full border p-2 ${
                              favorites.includes(station.stationId)
                                ? "border-mint/30 bg-mint/15 text-mint"
                                : "border-white/10 bg-white/5 text-slate-300"
                            }`}
                            onClick={() => toggleFavorite(station.stationId)}
                            type="button"
                          >
                            <Heart
                              className="h-4 w-4"
                              fill={favorites.includes(station.stationId) ? "currentColor" : "none"}
                            />
                          </button>
                          <div className="rounded-2xl border border-white/10 bg-ink/30 px-3 py-2 text-right">
                            <p className="text-base font-semibold min-[380px]:text-lg">
                              {station.price.toFixed(3)} EUR
                            </p>
                            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400 min-[380px]:text-[11px]">
                              par litre
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-end justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          {shouldShowAddressLine(station) ? (
                            <p className="line-clamp-1 text-xs text-slate-300 min-[380px]:text-sm">
                              {station.address}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <a
                            className="inline-flex items-center gap-1.5 rounded-2xl border border-mint/20 bg-mint/10 px-2.5 py-2 text-[11px] text-mint min-[380px]:gap-2 min-[380px]:px-3 min-[380px]:text-xs"
                            href={getMapsLink(station)}
                            rel="noreferrer"
                            target="_blank"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            <span className="hidden min-[380px]:inline">Maps</span>
                          </a>
                          <div className="rounded-2xl bg-ink/60 px-2.5 py-2 text-right min-[380px]:px-3">
                            <p className="text-sm font-medium">{formatDistance(station.distanceKm)}</p>
                            <p className="text-xs text-slate-500">{station.fuelType}</p>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </article>
              );
            })}
            {scope === "france" && hasMore ? (
              <button
                className={`rounded-[24px] border border-white/10 bg-white/5 px-4 py-4 text-sm text-slate-200 ${
                  view === "grid" ? "col-span-2" : ""
                }`}
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

      {showLocationModal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-[28px] border border-white/10 bg-panel p-5 shadow-glow">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl border border-amber/30 bg-amber/10 p-3 text-amber">
                <CircleAlert className="h-5 w-5" />
              </div>
              <div>
                <p className="text-lg font-semibold text-white">Active la localisation</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Autorise la localisation pour afficher les stations les plus proches de chez
                  toi et calculer correctement les distances.
                </p>
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                className="flex-1 rounded-full border border-white/10 px-4 py-3 text-sm text-slate-300"
                onClick={() => setShowLocationModal(false)}
                type="button"
              >
                Plus tard
              </button>
              <button
                className="flex-1 rounded-full bg-mint px-4 py-3 text-sm font-medium text-ink"
                onClick={() => {
                  setShowLocationModal(false);
                  requestCurrentPosition(setPosition, () => setShowLocationModal(true));
                }}
                type="button"
              >
                Reessayer
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
