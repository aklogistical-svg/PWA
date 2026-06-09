// sw.js - Service Worker pour la PWA Gestion Scolaire
const CACHE_NAME = 'gestionscolaire-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/css/main.css',
  '/js/app.js',
  '/js/db.js',
  '/js/ui.js',
  '/js/modules/eleves.js',
  '/js/modules/academique.js',
  '/js/modules/enseignants.js',
  '/js/modules/notes.js',
  '/js/modules/sanctions.js',
  '/js/modules/rapports.js',
  '/js/modules/exportimport.js',
  '/js/modules/archives.js',
  // La bibliothèque SQLite est chargée depuis un CDN, on la met en cache aussi
  'https://cdn.jsdelivr.net/npm/@sqlite.org/sqlite-wasm@latest/dist/sqlite-wasm.js'
];

// Installation : mise en cache de tous les fichiers essentiels
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Mise en cache des ressources');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activation : nettoyage des anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Stratégie de cache : Cache First pour les ressources statiques,
// Network First pour la navigation (afin d'obtenir la dernière version si en ligne)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Pour les fichiers statiques locaux (sauf la page HTML principale)
  if (url.origin === self.location.origin && url.pathname !== '/') {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        return cachedResponse || fetch(event.request).then((response) => {
          // Mettre en cache les nouvelles versions (hors-ligne possible après mise à jour)
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return response;
        });
      })
    );
  }
  // Pour la page HTML principale et les requêtes externes (CDN), on essaie réseau d'abord
  else {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(event.request);
      })
    );
  }
});