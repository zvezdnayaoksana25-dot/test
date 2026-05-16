const CACHE_NAME = 'worktracker-v1';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    if (e.request.url.includes('mymemory.translated.net')) {
        e.respondWith(fetch(e.request).catch(() => {
            return new Response(JSON.stringify({ responseData: { translatedText: 'Нет подключения к интернету' } }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }));
        return;
    }

    e.respondWith(
        caches.match(e.request).then((response) => {
            return response || fetch(e.request).then((fetchResp) => {
                if (fetchResp && fetchResp.status === 200) {
                    const clone = fetchResp.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(e.request, clone);
                    });
                }
                return fetchResp;
            });
        }).catch(() => {
            return caches.match('./index.html');
        })
    );
});
