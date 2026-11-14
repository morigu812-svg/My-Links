/* LINK CORE Service Worker
 * 方針：
 * - 同一オリジンの静的ファイル（HTML / アイコン / manifest）は cache-first。
 *   オフラインでも直近の画面が開ける。初回はオンラインで取得してキャッシュする。
 * - Google Apps Script（script.google.com / script.googleusercontent.com）への
 *   通信は network-first。リンク一覧・メモ・チャット等のデータは常に最新を優先し、
 *   オフライン時はキャッシュがあればそれを返し、なければ fetch の失敗をそのまま返す。
 * - キャッシュ名にバージョンを付け、activate 時に古いキャッシュを削除する。
 * - skipWaiting / clients.claim は、更新を次の訪問まで待たせず即座に反映するために使う。
 *   ただし update はデプロイ直後に一度だけ起きる想定。頻繁な更新はしないこと。
 */
'use strict';

var CACHE_VERSION = 'link-core-v13';
var STATIC_CACHE = 'link-core-static-' + CACHE_VERSION;
var DATA_CACHE = 'link-core-data-' + CACHE_VERSION;

/* アプリの殻。相対パスなので、GitHub Pages のプロジェクトサイト
   （例：https://<user>.github.io/My-Links/）でもカスタムドメインでも動く。 */
var STATIC_ASSETS = [
  './',
  './index.html',
  './admin.html',
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
  }) || /\.(?:html|css|js|svg|png|jpg|jpeg|webp|ico|webmanifest|json)$/.test(path);
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
        if (key !== STATIC_CACHE && key !== DATA_CACHE) return caches.delete(key);
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

  /* GAS（データ）は network-first。 */
  if (isGasUrl(url)) {
    event.respondWith(
      fetch(request).then(function (response) {
        /* 成功した GET の応答だけをキャッシュする。 */
        if (response && response.ok) {
          var copy = response.clone();
          caches.open(DATA_CACHE).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      }).catch(function () {
        return caches.match(request);
      })
    );
    return;
  }

  // ログイン画面は、オンライン時に最新の HTML を使う。
  if (request.mode === 'navigate' && url.origin === self.location.origin &&
      url.href.startsWith(self.registration.scope)) {
    event.respondWith(fetch(request, { cache: 'reload' }).catch(function () {
      return caches.match(request, { ignoreSearch: true });
    }));
    return;
  }

  /* 静的ファイルは cache-first。 */
  if (isStaticAsset(request)) {
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then(function (cached) {
        if (cached) {
          /* バックグラウンドで最新版を取りに行く（次回以降に反映される）。 */
          fetch(request).then(function (response) {
            if (response && response.ok) {
              caches.open(STATIC_CACHE).then(function (cache) { cache.put(request, response); });
            }
          }).catch(function () { /* オフライン時は無視する */ });
          return cached;
        }
        return fetch(request).then(function (response) {
          if (response && response.ok) {
            var copy = response.clone();
            caches.open(STATIC_CACHE).then(function (cache) { cache.put(request, copy); });
          }
          return response;
        });
      })
    );
    return;
  }

  /* それ以外（Google Fonts 等の外部リソース）は Service Worker を通さない。 */
});
