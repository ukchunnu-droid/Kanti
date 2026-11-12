// Kanti service worker — shows push notifications (orders, restocks, reminders) and opens the right page.
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { title: 'Kanti', body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(d.title || 'Kanti', {
    body: d.body || '', icon: '/img/apple-touch-icon.png', badge: '/img/favicon-64.png', tag: d.tag || 'kanti', data: { link: d.link || '/' },
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data && event.notification.data.link || '/', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
    for (const w of wins) if (w.url.startsWith(self.location.origin)) { w.navigate(url); return w.focus(); }
    return self.clients.openWindow(url);
  }));
});
