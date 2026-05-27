// ISR App — Service Worker v1
// Handles push notifications and offline caching

self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(clients.claim());
});

// ---- PUSH ----
self.addEventListener('push', function(event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch(e) {}

  var title   = data.title  || 'Inglês sem Roteiro';
  var body    = data.body   || '';
  var icon    = 'https://d1yei2z3i6k35z.cloudfront.net/10277034/69b287e3c48d6_logograndeISR_logo2_01.png';
  var badge   = icon;
  var tag     = data.tag    || 'isr-notif';
  var actions = data.actions || [];
  var payload = data.data   || {};

  event.waitUntil(
    self.registration.showNotification(title, {
      body:    body,
      icon:    icon,
      badge:   badge,
      tag:     tag,
      renotify: true,
      data:    payload,
      actions: actions,
      requireInteraction: data.requireInteraction || false
    })
  );
});

// ---- NOTIFICATION CLICK ----
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var payload = event.notification.data || {};
  var url = '/';

  if (event.action === 'pay'     && payload.linkPagamento) url = payload.linkPagamento;
  if (event.action === 'confirm' && payload.confirmUrl)    url = payload.confirmUrl;
  if (!event.action && payload.url) url = payload.url;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        if (clientList[i].url === url && 'focus' in clientList[i]) {
          return clientList[i].focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
