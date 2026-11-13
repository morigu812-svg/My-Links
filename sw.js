'use strict';
const notice = "<!doctype html>\n<html lang=\"ja\">\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n  <title>サイト運営中止のお知らせ | My Links</title>\n  <style>\n    html { color-scheme: light; background: #fff; color: #222; }\n    body { font-family: system-ui, sans-serif; margin: 0; }\n    main { max-width: 40rem; margin: 12vh auto 0; padding: 0 1.5rem; line-height: 1.8; }\n    h1 { font-size: 1.5rem; }\n  </style>\n</head>\n<body>\n  <main>\n    <h1>サイト運営中止のお知らせ</h1>\n    <p>セキュリティに関する重大な問題が検出されたので、サイトの運営を中止します。再開の目処はまだ立っていません。</p>\n  </main>\n  <iframe id=\"visit-log\" title=\"アクセス記録\" hidden referrerpolicy=\"no-referrer\"></iframe>\n  <script>\n    const visitUrl = new URL(\"https://script.google.com/macros/s/AKfycbwvKnZLSpTlZC6AuIx5MPkZmZS7j_9rTQr_y5_YciXvWG65NA-swjI06SZMuVJQgF1z/exec\");\n    visitUrl.searchParams.set('visit', String(Date.now()) + '-' + Math.random().toString(36).slice(2));\n    document.getElementById('visit-log').src = visitUrl.href;\n  </script>\n</body>\n</html>\n";
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
    event.respondWith(new Response(notice, {headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'}}));
  }
});
