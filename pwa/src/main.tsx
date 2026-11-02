import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const scope = import.meta.env.BASE_URL;
    navigator.serviceWorker
      .register(`${scope}sw.js`, { scope })
      .then(async (registration) => {
        await navigator.serviceWorker.ready;
        const reloaded = sessionStorage.getItem("exact-chinesechess-coi-reloaded") === "1";
        // WebRTC works without isolation; do not tear down a friend setup or
        // match just to enable the optional threaded AI on a first visit.
        const friendSession = document.querySelector('[data-friend-session="active"]');
        if (!window.crossOriginIsolated && registration.active && !reloaded && !friendSession) {
          sessionStorage.setItem("exact-chinesechess-coi-reloaded", "1");
          window.location.reload();
        }
      })
      .catch(() => {
        // The app remains usable if service worker registration is blocked.
      });
  });
}
