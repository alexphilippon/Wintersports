/* Ski game – service worker minimal : sert seulement à rendre le site installable.
   Aucune mise en cache : chaque ouverture charge la dernière version publiée. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
