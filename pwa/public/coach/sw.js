const CACHE_NAME = "exact-chinesechess-coach-v1";
const scope = self.registration.scope;
const shell = [
  new URL("./", scope).href,
  new URL("manifest.webmanifest", scope).href,
  new URL("../engine/fairy-stockfish/coach-worker.js", scope).href,
  new URL("../engine/fairy-stockfish/stockfish.js", scope).href,
  new URL("../engine/fairy-stockfish/stockfish.wasm", scope).href,
  new URL("../engine/fairy-stockfish/stockfish.worker.js", scope).href,
  new URL("../assets/xiangqi/board.png", scope).href,
  ...["r", "b"].flatMap((side) => ["k", "a", "b", "n", "r", "c", "p"].map((piece) => new URL(`../assets/xiangqi/${side}_${piece}.png`, scope).href))
];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(shell)));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("exact-chinesechess-coach-") && key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
      return isolated(response);
    }).catch(async () => isolated(await caches.match(event.request) || await caches.match(new URL("./", scope)))));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => {
    if (cached) return isolated(cached);
    return fetch(event.request).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
      return isolated(response);
    });
  }));
});
function isolated(response) {
  if (!response || response.type === "opaque") return response;
  const headers = new Headers(response.headers);
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
