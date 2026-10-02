// Service worker: alleen de app-schil wordt gecachet, zodat de app installeerbaar
// is en direct opent. SharePoint/Bacon zelf wordt nooit gecachet.
const CACHE = "bacon-app-v4";
const SHELL = [
  "./",
  "index.html",
  "app.js",
  "config.js",
  "styles.css",
  "werkblad.html",
  "werkblad.js",
  "werkblad-parser.js",
  "werkblad-excel.js",
  "vendor/pdf.min.mjs",
  "vendor/pdf.worker.min.mjs",
  "vendor/xlsx.full.min.js",
  "vendor/exceljs.min.js",
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Netwerk eerst (zodat config-wijzigingen meteen doorkomen), cache als terugval.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true }))
  );
});
