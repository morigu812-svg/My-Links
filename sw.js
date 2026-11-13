'use strict';
const blank = "<!doctype html>\n<html lang=\"ja\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title></title><style>html{background:#fff;color-scheme:light}</style></head><body></body></html>\n";
const scope = self.registration.scope;

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => /^link-core-(static|data)-/.test(key)).map(key => caches.delete(key)));
    await self.clients.claim();
    const windows = await self.clients.matchAll({type: 'window'});
    await Promise.allSettled(windows.filter(client => client.url.startsWith(scope)).map(client => client.navigate(client.url)));
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate' && event.request.url.startsWith(scope)) {
    event.respondWith(new Response(blank, {headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'}}));
  }
});
