import React from "react";
import { createRoot } from "react-dom/client";
import CoachApp from "./CoachApp";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<React.StrictMode><CoachApp /></React.StrictMode>);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const scope = `${import.meta.env.BASE_URL}coach/`;
    navigator.serviceWorker.register(`${scope}sw.js`, { scope }).then(async (registration) => {
      if (!registration.active) {
        const worker = registration.installing || registration.waiting;
        if (worker) await new Promise<void>((resolve) => {
          if (worker.state === "activated") { resolve(); return; }
          worker.addEventListener("statechange", () => { if (worker.state === "activated" || worker.state === "redundant") resolve(); });
        });
      }
      const key = "exact-chinesechess-coach-sw-reloaded";
      if (registration.active && sessionStorage.getItem(key) !== "1") {
        sessionStorage.setItem(key, "1");
        window.location.reload();
      }
    }).catch(() => {});
  });
}
