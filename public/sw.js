const CACHE_NAME = "taxflow-v1";
const STATIC_ASSETS = [
    "/",
    "/dashboard",
    "/offline",
];

// Install — cache app shell
self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
    );
    self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key)),
            ),
        ),
    );
    self.clients.claim();
});

// Fetch — network first, fall back to cache
self.addEventListener("fetch", (event) => {
    const { request } = event;

    // Skip non-GET, API, and Socket.IO requests
    if (
        request.method !== "GET" ||
        request.url.includes("/api/") ||
        request.url.includes("/socketio")
    ) {
        return;
    }

    event.respondWith(
        fetch(request)
            .then((response) => {
                // Cache successful responses
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, clone);
                    });
                }
                return response;
            })
            .catch(() => {
                // Serve from cache when offline
                return caches.match(request).then((cached) => {
                    return cached || new Response("Offline", { status: 503 });
                });
            }),
    );
});

// Background sync — process queued actions when reconnected
self.addEventListener("sync", (event) => {
    if (event.tag === "taxflow-sync") {
        event.waitUntil(
            self.clients.matchAll().then((clients) => {
                clients.forEach((client) => {
                    client.postMessage({ type: "SYNC_REQUESTED" });
                });
            }),
        );
    }
});
