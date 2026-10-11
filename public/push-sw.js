// Imported by the Workbox service worker (vite.config.js importScripts).
// Shows new-online-order pushes sent by the shop's "order-alert" Edge Function,
// even when no TinyPOS tab is open.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || 'TinyPOS', {
    body: data.body || '',
    icon: '/icon-192.png',
    // Android masks the badge to one color: it must be a transparent silhouette.
    badge: '/badge-96.png',
    tag: 'online-order',
    renotify: true,
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 400],
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
    const open = wins.find((w) => w.url.startsWith(self.location.origin));
    return open ? open.focus() : self.clients.openWindow(url);
  }));
});
