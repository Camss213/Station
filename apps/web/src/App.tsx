import { Download, RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";

import { StationList } from "./components/StationList";

type UpdateEventDetail = {
  worker: ServiceWorker;
};

export default function App() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    function handleUpdateAvailable(event: Event) {
      const customEvent = event as CustomEvent<UpdateEventDetail>;
      setWaitingWorker(customEvent.detail.worker);
      setIsDismissed(false);
    }

    window.addEventListener("pwa-update-available", handleUpdateAvailable);
    return () => window.removeEventListener("pwa-update-available", handleUpdateAvailable);
  }, []);

  function applyUpdate() {
    waitingWorker?.postMessage({ type: "SKIP_WAITING" });
  }

  return (
    <>
      {!isDismissed && waitingWorker ? (
        <div className="sticky top-0 z-[60] border-b border-mint/20 bg-ink/95 px-3 py-3 text-slate-100 backdrop-blur">
          <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-mint/30 bg-mint/10 p-2 text-mint">
                <RefreshCw className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium">Nouvelle version disponible</p>
                <p className="text-xs text-slate-400">
                  Recharge l'app pour recuperer les derniers changements.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="inline-flex items-center gap-2 rounded-full bg-mint px-3 py-2 text-sm font-medium text-ink"
                onClick={applyUpdate}
                type="button"
              >
                <Download className="h-4 w-4" />
                Mettre a jour
              </button>
              <button
                className="rounded-full border border-white/10 p-2 text-slate-300"
                onClick={() => setIsDismissed(true)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <StationList />
    </>
  );
}
