/* LINK BASE Service Worker
 * 方針：
 * - 同一オリジンの静的ファイル（HTML / アイコン / manifest）は cache-first。
 *   オフラインでも直近の画面が開ける。初回はオンラインで取得してキャッシュする。
 * - Google Apps Scriptへの通信はネットワークのみ。認証された応答は保存しない。
 * - キャッシュ名にバージョンを付け、activate 時に古いキャッシュを削除する。
 * - skipWaiting / clients.claim は、更新を次の訪問まで待たせず即座に反映するために使う。
 *   ただし update はデプロイ直後に一度だけ起きる想定。頻繁な更新はしないこと。
 */
'use strict';

var CACHE_VERSION = 'link-core-workspace-v2';
var STATIC_CACHE = 'link-core-static-' + CACHE_VERSION;

/* アプリの殻。相対パスなので、GitHub Pages のプロジェクトサイト
   （例：https://<user>.github.io/My-Links/）でもカスタムドメインでも動く。 */
var STATIC_ASSETS = [
  './workspace.css?v=2',
  './workspace.js?v=2',
  './admin-visitor-session.js?v=1',
  './blocked-links.js?v=1',
  './chat-links.js?v=1',
  './sidebar-layout.js?v=2',
  './site-thumbnails.js?v=3',
  './log-dashboard.js?v=5',
  './filter-access.js?v=10',
  './',
  './index.html',
  './admin.html',
  './ai.html',
  './ai-launcher.js',
  './chat-screenshot.js?v=1',
  './chat-realtime.js',
  './chat-reply.js?v=links1',
  './chat-preview.js',
  './visitor-direct-chat.js',
  './linkcore-knowledge.js',
  './memos.html',
  './bridge.html',
  './manifest.webmanifest',
  './link-core-icon.svg',
  './apple-touch-icon.png'
];

function isGasUrl(url) {
  return url.hostname === 'script.google.com' ||
    url.hostname === 'script.googleusercontent.com' ||
    url.hostname.endsWith('.googleusercontent.com');
}

function isStaticAsset(request) {
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  /* 同一オリジンの GET だけを対象にする。 */
  if (request.method !== 'GET') return false;
  /* 静的ファイルの一覧に含まれるもの、または同一オリジンの HTML / 画像 / CSS / JS。 */
  var path = url.pathname;
  return STATIC_ASSETS.some(function (asset) {
    return url.href === new URL(asset, self.location).href;
  }) || /\.(?:html|css|mjs|js|svg|png|jpg|jpeg|webp|ico|webmanifest|json)$/.test(path);
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(function (cache) {
      /* 一部が失敗してもインストール自体は止めない（addAll は1件でも失敗すると全滅するため）。 */
      return Promise.all(STATIC_ASSETS.map(function (asset) {
        return cache.add(asset).catch(function () { /* 任意の1件の失敗は無視する */ });
      }));
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        // WebLLM等がCache APIに保存するモデルデータは削除しない。
        // LINK BASEが管理する古いキャッシュだけ削除する。
        if ((key.indexOf('link-core-static-') === 0 || key.indexOf('link-core-data-') === 0) &&
            key !== STATIC_CACHE) return caches.delete(key);
        return Promise.resolve();
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url = new URL(request.url);

  // Authenticated GAS responses always require the network.
  if ((url.origin === self.location.origin && url.pathname.startsWith('/chat-api/')) || isGasUrl(url)) {
    event.respondWith(fetch(request, {cache:'no-store'}));
    return;
  }

  // Navigation fetches update the offline copy too.
  if (request.mode === 'navigate' && url.origin === self.location.origin &&
      url.href.startsWith(self.registration.scope)) {
    event.respondWith(fetch(request, {cache:'reload'}).then(function(response) {
      if(response && response.ok) {
        var copy=response.clone();
        event.waitUntil(caches.open(STATIC_CACHE).then(function(cache){return cache.put(new Request(url.origin+url.pathname),copy);}).catch(function(){}));
      }
      return response;
    }).catch(function() {
      return caches.open(STATIC_CACHE).then(function(cache){
        return cache.match(request,{ignoreSearch:true});
      }).then(function(cached) {
        return cached || new Response('このページはオフラインでは開けません。通信を確認して再度開いてください。',{status:503,headers:{'Content-Type':'text/plain;charset=utf-8'}});
      });
    }));
    return;
  }
  if (isStaticAsset(request)) {
    event.respondWith(caches.open(STATIC_CACHE).then(function(cache) {
      return cache.match(request).then(function(cached) {
        if(cached) {
          event.waitUntil(fetch(request).then(function(response) {
            if(response && response.ok)return cache.put(request,response);
          }).catch(function(){}));
          return cached;
        }
        return fetch(request).then(function(response) {
          if(response && response.ok) {
            var copy=response.clone();
            event.waitUntil(cache.put(request,copy).catch(function(){}));
          }
          return response;
        });
      });
    }));
    return;
  }

  /* それ以外（Google Fonts 等の外部リソース）は Service Worker を通さない。 */
});









