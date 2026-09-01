importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.4.1/workbox-sw.js');

if (workbox) {
  // Caché de recursos estáticos (HTML, CSS, JS e iconos)
  workbox.routing.registerRoute(
    ({request}) => request.destination === 'script' || request.destination === 'style' || request.destination === 'document',
    new workbox.strategies.StaleWhileRevalidate({ cacheName: 'static-resources' })
  );

  // Caché agresivo para que el mapa de Leaflet funcione sin internet en rutas de tren
  workbox.routing.registerRoute(
    ({url}) => url.origin === 'https://tile.openstreetmap.org',
    new workbox.strategies.CacheFirst({
      cacheName: 'map-tiles',
      plugins: [
        new workbox.expiration.ExpirationPlugin({ 
          maxEntries: 2000, // Retiene gran porción del mapa
          maxAgeSeconds: 30 * 24 * 60 * 60 // 30 días de memoria
        })
      ]
    })
  );

  // Background Sync para la cola de despacho
  const bgSyncPlugin = new workbox.backgroundSync.BackgroundSyncPlugin('sgof-sync', {
    maxRetentionTime: 24 * 60 // Reintenta por 24 horas si la señal de red cae
  });

  workbox.routing.registerRoute(
    ({url}) => url.pathname.includes('/api/sync'),
    new workbox.strategies.NetworkOnly({ plugins: [bgSyncPlugin] }),
    'POST'
  );
}