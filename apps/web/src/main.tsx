import React from "react";
import ReactDOM from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <>
      <App />
      <Analytics />
    </>
  </React.StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").then((registration) => {
      function notifyUpdateAvailable(worker: ServiceWorker | null) {
        if (!worker) {
          return;
        }
        window.dispatchEvent(
          new CustomEvent("pwa-update-available", {
            detail: { worker },
          })
        );
      }

      if (registration.waiting) {
        notifyUpdateAvailable(registration.waiting);
      }

      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) {
          return;
        }

        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            notifyUpdateAvailable(newWorker);
          }
        });
      });

      let isRefreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (isRefreshing) {
          return;
        }
        isRefreshing = true;
        window.location.reload();
      });
    });
  });
}
