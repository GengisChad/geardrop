/**
 * Service worker del gestionale.
 *
 * Politica di caching intenzionalmente conservativa:
 * - installa SOLO management-offline.html in una cache statica versionata;
 * - non usa cache.put su risposte di rete (nessun caching di pagine autenticate,
 *   RSC, risposte Supabase, API o dati di business);
 * - in activation rimuove esclusivamente le versioni precedenti di questa stessa
 *   cache (prefisso "geardrop-management"); non tocca cache di altri domini/app;
 * - il logout (logout/route.ts) cancella la cache via caches.delete prima del
 *   redirect: il nome deve coincidere esattamente con MANAGEMENT_CACHE_NAME.
 *
 * MANAGEMENT_CACHE_NAME in logout/route.ts = "geardrop-management-shell-v1"
 */

const CACHE_NAME = "geardrop-management-shell-v1";
const OFFLINE_URL = "/management-offline.html";

// ---------------------------------------------------------------------------
// Install: precache solo la pagina offline statica
// ---------------------------------------------------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll([OFFLINE_URL]))
      .then(() => self.skipWaiting()),
  );
});

// ---------------------------------------------------------------------------
// Activate: rimuove SOLO le versioni precedenti di questa cache gestionale.
// Non tocca cache di altri service worker o domini.
// ---------------------------------------------------------------------------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith("geardrop-management") && key !== CACHE_NAME,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ---------------------------------------------------------------------------
// Fetch: nessun caching delle risposte di rete.
// Serve management-offline.html solo per navigazioni fallite (offline).
// ---------------------------------------------------------------------------
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Gestisce solo richieste di navigazione (non fetch API, immagini, ecc.)
  if (request.mode !== "navigate") return;

  event.respondWith(
    fetch(request).catch(() =>
      caches
        .open(CACHE_NAME)
        .then((cache) => cache.match(OFFLINE_URL))
        .then(
          (response) =>
            response ??
            new Response("Connessione non disponibile.", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            }),
        ),
    ),
  );
});
