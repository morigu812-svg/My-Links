const APP_TITLE = 'LINK CORE';
// DAILY CORE と同じスプレッドシートを使う（スクリプトプロパティに登録済みのID）
const SPREADSHEET_PROPERTY = 'DAILY_CORE_SPREADSHEET_ID';
const SHEET_NAME = 'Links';

const HEADERS = [
  'ID',
  'タイトル',
  'URL',
  'カテゴリ',
  'メモ',
  'お気に入り',
  '作成日時',
  '更新日時',
  '利用者に公開',
  '開き方',
  'NEWラベル'
];

/**
 * ?mode=bridge なら GitHub Pages 用の通信窓口、それ以外はGAS画面を返す。
 */
function doGet(e) {
  if (e && e.parameter && e.parameter.mode === 'bridge') {
    return HtmlService
      .createHtmlOutputFromFile('bridge')
      .setTitle(APP_TITLE + ' Bridge')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  ensureSheet_();

  return HtmlService
    .createHtmlOutputFromFile('index')
    .setTitle(APP_TITLE)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * 既存スプレッドシートを開き、Linksシートを返す。
 * スプレッドシートIDが未設定ならエラー（新規作成はしない）。
 * Linksシートだけは新規追加なので、無ければ作成する（既存シートは変更しない）。
 * 既存列の順序は変えず、不足列だけ末尾に追加する。
 */
function ensureSheet_() {
  const spreadsheetId = PropertiesService
    .getScriptProperties()
    .getProperty(SPREADSHEET_PROPERTY);

  if (!spreadsheetId) {
    throw new Error(
      'スプレッドシートIDが未設定です。' +
      'スクリプトプロパティ ' + SPREADSHEET_PROPERTY + ' を確認してください。'
    );
  }

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }

  const lastColumn = sheet.getLastColumn();

  if (lastColumn === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  } else {
    const existing = sheet
      .getRange(1, 1, 1, lastColumn)
      .getDisplayValues()[0];

    HEADERS.forEach(header => {
      if (existing.indexOf(header) === -1) {
        sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
        existing.push(header);
      }
    });
  }

  return sheet;
}

/**
 * ヘッダー名 → 列番号（1始まり）。
 */
function getColumnMap_(sheet) {
  const lastColumn = sheet.getLastColumn();

  if (lastColumn < 1) {
    throw new Error('シートのヘッダーがありません。');
  }

  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const map = {};

  headers.forEach((header, index) => {
    if (header) map[header] = index + 1;
  });

  HEADERS.forEach(header => {
    if (!map[header]) throw new Error('必要な列がありません: ' + header);
  });

  return map;
}

/**
 * 文字列を整形する。
 */
function cleanText_(value, maxLength) {
  const text = String(value == null ? '' : value).trim();

  if (maxLength && text.length > maxLength) {
    throw new Error('入力できる文字数は最大' + maxLength + '文字です。');
  }

  return text;
}

/**
 * URLを検証する。http / https のみ許可（javascript: などを防ぐ）。
 * スキームが無ければ https:// を補う。
 */
function normalizeUrl_(value) {
  let url = cleanText_(value, 2000);

  if (!url) throw new Error('URLを入力してください。');

  if (!/^https?:\/\//i.test(url)) {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
      throw new Error('URLは http:// または https:// のみ利用できます。');
    }
    url = 'https://' + url;
  }

  if (!/^https?:\/\/[^\s/$.?#][^\s]*$/i.test(url)) {
    throw new Error('URLの形式が正しくありません。http:// か https:// で始まるURLを入力してください。');
  }

  return url;
}

/**
 * セルに書く文字列の先頭が = + - @ だと数式として解釈されるため、
 * 先頭に ' を付けてテキストとして保存する。
 */
function safeCell_(text) {
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function toIso_(value) {
  return value instanceof Date && !isNaN(value.getTime())
    ? value.toISOString()
    : String(value || '');
}

/**
 * シートの1行をリンクオブジェクトに変換する。
 * 1行の不正値で全体が失敗しないよう、例外を出さない。
 */
function rowToLink_(row, columns) {
  const get = header => row[columns[header] - 1];
  const favorite = get('お気に入り');

  return {
    id: String(get('ID') || ''),
    title: String(get('タイトル') || ''),
    url: String(get('URL') || ''),
    category: String(get('カテゴリ') || ''),
    memo: String(get('メモ') || ''),
    favorite: favorite === true || String(favorite).toLowerCase() === 'true',
    // 公開フラグが明示的に true の場合だけ公開する（空欄・不明値は非公開）。
    visibleToVisitors: get('利用者に公開') === true || String(get('利用者に公開')).toLowerCase() === 'true',
    openMode: String(get('開き方') || 'internal').toLowerCase() === 'external' ? 'external' : 'internal',
    isNew: get('NEWラベル') === true || String(get('NEWラベル')).toLowerCase() === 'true',
    createdAt: toIso_(get('作成日時')),
    updatedAt: toIso_(get('更新日時'))
  };
}

/**
 * 全リンクと、カテゴリ一覧を返す。
 */
/* 短時間キャッシュ。認証後にロール別キーでのみ返し、更新時は必ず破棄する。 */
const LINKS_CACHE_TTL_SECONDS = 300;
const CHAT_CACHE_TTL_SECONDS = 8;
const LINKS_CACHE_CHUNK_LENGTH = 18000;
const LINKS_CACHE_MAX_CHUNKS = 10;
function readJsonCache_(key) {
  try {
    const raw = CacheService.getScriptCache().get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}
function writeJsonCache_(key, value, ttl) {
  try {
    const raw = JSON.stringify(value);
    if (raw.length < 95000) CacheService.getScriptCache().put(key, raw, ttl);
  } catch (_) {}
}
function readChunkedJsonCache_(key) {
  try {
    const cache = CacheService.getScriptCache();
    // メタ情報と全チャンク候補を1回のgetAllで取得し、CacheServiceとの往復を1回にまとめる。
    const keys = [key + '_META'];
    for (let i = 0; i < LINKS_CACHE_MAX_CHUNKS; i++) keys.push(key + '_PART_' + i);
    const cached = cache.getAll(keys);
    const metaRaw = cached[key + '_META'];
    if (!metaRaw) return null;
    const meta = JSON.parse(metaRaw);
    if (!meta || !Number.isInteger(meta.count) || meta.count < 1 || meta.count > LINKS_CACHE_MAX_CHUNKS) return null;
    const parts = [];
    for (let i = 0; i < meta.count; i++) {
      const part = cached[key + '_PART_' + i];
      if (typeof part !== 'string') return null;
      parts.push(part);
    }
    return JSON.parse(parts.join(''));
  } catch (_) { return null; }
}
function writeChunkedJsonCache_(key, value, ttl) {
  const cache = CacheService.getScriptCache();
  const oldMeta = readJsonCache_(key + '_META');
  try {
    const raw = JSON.stringify(value);
    const count = Math.ceil(raw.length / LINKS_CACHE_CHUNK_LENGTH);
    if (count < 1 || count > LINKS_CACHE_MAX_CHUNKS) {
      removeChunkedJsonCache_(key);
      return;
    }
    const values = {};
    for (let i = 0; i < count; i++) {
      values[key + '_PART_' + i] = raw.slice(i * LINKS_CACHE_CHUNK_LENGTH, (i + 1) * LINKS_CACHE_CHUNK_LENGTH);
    }
    cache.putAll(values, ttl);
    // メタ情報は全パーツを書き終えてから保存する。
    cache.put(key + '_META', JSON.stringify({count:count}), ttl);
    if (oldMeta && Number.isInteger(oldMeta.count)) {
      const stale = [];
      for (let i = count; i < Math.min(oldMeta.count, LINKS_CACHE_MAX_CHUNKS); i++) stale.push(key + '_PART_' + i);
      if (stale.length) cache.removeAll(stale);
    }
  } catch (_) {
    removeChunkedJsonCache_(key);
  }
}
function removeChunkedJsonCache_(key) {
  const cache = CacheService.getScriptCache();
  const meta = readJsonCache_(key + '_META');
  const keys = [key + '_META'];
  if (meta && Number.isInteger(meta.count)) {
    for (let i = 0; i < Math.min(meta.count, LINKS_CACHE_MAX_CHUNKS); i++) keys.push(key + '_PART_' + i);
  }
  for (let i = 0; i < LINKS_CACHE_MAX_CHUNKS; i++) keys.push(key + '_PART_' + i);
  cache.removeAll(keys);
}
function invalidateLinksCache_() {
  removeChunkedJsonCache_('LINK_CORE_LINKS_ALL_V2');
}
function invalidateChatCache_() {
  CacheService.getScriptCache().remove('LINK_CORE_CHAT_MESSAGES_V1');
}

function readLinksFromData_(data) {
  if (!data || !data.length) throw new Error('Linksシートにヘッダーがありません。');
  const headers = data[0].map(value => String(value || ''));
  const columns = {};
  headers.forEach((header, index) => { if (header) columns[header] = index + 1; });
  HEADERS.forEach(header => {
    if (!columns[header]) throw new Error('必要な列がありません: ' + header + '。管理者画面を開いてシート構成を確認してください。');
  });
  const links = data.slice(1)
    .filter(row => row[columns['ID'] - 1] !== '' && row[columns['ID'] - 1] != null)
    .map(row => rowToLink_(row, columns));
  const categories = Array.from(new Set(links.map(link => link.category).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, 'ja'));
  return { links: links, categories: categories };
}
function readLinks_(sheet, columns) {
  return readLinksFromData_(sheet.getDataRange().getValues());
}
function refreshLinksCacheFromSheet_(sheet) {
  const result = readLinks_(sheet);
  writeChunkedJsonCache_('LINK_CORE_LINKS_ALL_V2', result, LINKS_CACHE_TTL_SECONDS);
  return result;
}
function readLinksForDisplay_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty(SPREADSHEET_PROPERTY);
  if (!spreadsheetId) throw new Error('スプレッドシートIDが未設定です。');
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Linksシートがありません。管理者画面で初期設定を行ってください。');
  // ヘッダーと全データを一度の読み取りで取得する。
  return readLinksFromData_(sheet.getDataRange().getValues());
}

/**
 * 初回設定状態を返す。パスワード自体は返さない。
 */
function getAdminSetupStatus() {
  // ログイン画面の表示中にリンク一覧のサーバーキャッシュを先行準備する。
  // リンク本体は返さず、認証成功後の getLinks() でのみ管理者に返却する。
  try {
    getLinksForToken_(null, false);
  } catch (error) {
    // キャッシュ準備に失敗しても、ログイン画面と認証処理は通常どおり続行する。
    console.warn('LINK CORE cache warm-up failed:', error);
  }
  return {
    configured: !!PropertiesService.getScriptProperties().getProperty('LINK_CORE_ADMIN_PASSWORD')
  };
}

// 初期パスワードは Apps Script のスクリプト プロパティで管理者が登録する。

/**
 * 管理者パスワードで認証し、短時間有効なサーバー側トークンを発行する。
 * パスワードは初回設定画面から登録され、Apps Script のスクリプトプロパティに保存される。
 */

/**
 * 認証失敗を利用者単位で短時間制限する。
 * Apps Script から接続元IPを取得できないため、仮名化された一時ユーザーキーを使用する。
 * 一時キーを取得できない環境では anonymous に集約し、全体への試行制限にフォールバックする。
 */
function getAuthRateState_(scope) {
  let userKey = 'anonymous';
  try {
    userKey = Session.getTemporaryActiveUserKey() || 'anonymous';
  } catch (_) {}
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    scope + ':' + userKey
  );
  const suffix = digest.map(byte => ('0' + ((byte + 256) % 256).toString(16)).slice(-2)).join('').slice(0, 32);
  return { cache: CacheService.getScriptCache(), key: 'LINK_CORE_AUTH_' + scope + '_' + suffix };
}

function checkAuthRateLimit_(state) {
  const raw = state.cache.get(state.key);
  if (!raw) return;
  let data = {};
  try { data = JSON.parse(raw) || {}; } catch (_) {}
  if (Number(data.lockedUntil || 0) > Date.now()) {
    throw new Error('認証の試行回数が上限に達しました。15分ほど待ってから再試行してください。');
  }
}

function recordAuthFailure_(state) {
  const lock = LockService.getScriptLock();
  lock.waitLock(3000);
  try {
    let data = {};
    try { data = JSON.parse(state.cache.get(state.key) || '{}') || {}; } catch (_) {}
    const count = Number(data.count || 0) + 1;
    const lockedUntil = count >= 5 ? Date.now() + 15 * 60 * 1000 : 0;
    state.cache.put(state.key, JSON.stringify({ count, lockedUntil }), 15 * 60);
  } finally {
    lock.releaseLock();
  }
}

function clearAuthFailures_(state) {
  state.cache.remove(state.key);
}

/** 利用者ページの共有パスワードを検証して閲覧専用トークンを発行する。 */
function authenticateVisitor(password, browserId) {
  const generation = sessionGeneration_();
  const rateState = getAuthRateState_('VISITOR');
  checkAuthRateLimit_(rateState);
  const expected = PropertiesService.getScriptProperties().getProperty('LINK_CORE_VISITOR_PASSWORD');
  if (!expected) throw new Error('利用者用パスワードが未設定です。管理者が設定を完了するまでお待ちください。');
  if (typeof password !== 'string' || !password || password !== expected) {
    recordAuthFailure_(rateState);
    throw new Error('サイトのパスワードが違います。');
  }
  clearAuthFailures_(rateState);
  const token = Utilities.getUuid() + Utilities.getUuid();
  storeSession_('VISITOR', token, generation);
  // 認証直後のリンク取得を同じ応答にまとめ、ブラウザーとの往復を1回減らす。
  const initialLinks = getLinksForToken_(token, false);
  recordVisitorLogin_(browserId);
  // 同じブラウザは1日1回まで。ログイン履歴の削除とは独立して保存する。
  recordVisitorCounter_(browserId);
  return {
    ok: true, token: token, expiresIn: SESSION_TTL_SECONDS,
    links: initialLinks.links, categories: initialLinks.categories
  };
}

const SESSION_TTL_SECONDS = 30 * 60;
const SESSION_GENERATION_PROPERTY = 'LINK_CORE_SESSION_GENERATION';

function sessionGeneration_() {
  return PropertiesService.getScriptProperties().getProperty(SESSION_GENERATION_PROPERTY) || 'yes';
}

function isSessionValid_(role, token) {
  if (typeof token !== 'string' || !token) return false;
  const savedGeneration = CacheService.getScriptCache().get('LINK_CORE_' + role + '_' + token);
  if (!savedGeneration) return false;
  const [generation, expiresAt] = savedGeneration.split(':');
  return Number(expiresAt) > Date.now() && generation === sessionGeneration_();
}

function storeSession_(role, token, generation) {
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  CacheService.getScriptCache().put('LINK_CORE_' + role + '_' + token,
    generation + ':' + expiresAt, SESSION_TTL_SECONDS);
}

function logoutCurrentSession(token) {
  requireLinkViewer_(token);
  CacheService.getScriptCache().removeAll(['LINK_CORE_ADMIN_' + token, 'LINK_CORE_VISITOR_' + token]);
  return { ok: true };
}

function checkViewerSession(token) {
  requireLinkViewer_(token);
  return { ok: true };
}

function logoutAllBrowsers(adminToken) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    requireAdmin_(adminToken);
    PropertiesService.getScriptProperties().setProperty(SESSION_GENERATION_PROPERTY, Utilities.getUuid());
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function requireLinkViewer_(token) {
  if (typeof token === 'string' && token &&
      (isSessionValid_('ADMIN', token) ||
       isSessionValid_('VISITOR', token))) return;
  throw new Error('閲覧にはサイトのパスワード認証が必要です。');
}

function authenticateAdmin(password, includeLinks) {
  const generation = sessionGeneration_();
  const rateState = getAuthRateState_('ADMIN');
  checkAuthRateLimit_(rateState);
  const expected = PropertiesService.getScriptProperties().getProperty('LINK_CORE_ADMIN_PASSWORD');
  if (!expected) throw new Error('管理者パスワードが未設定です。Apps Script のスクリプト プロパティに LINK_CORE_ADMIN_PASSWORD を登録してください。');
  if (typeof password !== 'string' || !password || password !== expected) {
    recordAuthFailure_(rateState);
    throw new Error('管理者パスワードが違います。');
  }
  clearAuthFailures_(rateState);
  const token = Utilities.getUuid() + Utilities.getUuid();
  storeSession_('ADMIN', token, generation);

  // 管理画面だけ、認証成功後に一覧を同じ応答で返す。メモ帳はトークンだけ受け取る。
  if (includeLinks === true) {
    try {
      const { links, categories } = getLinksForToken_(token, true);
      return { ok: true, token: token, expiresIn: SESSION_TTL_SECONDS, links: links, categories: categories };
    } catch (error) {
      console.warn('LINK CORE initial admin links failed:', error);
      // 一覧の一時エラーで認証成功を取り消さない。管理画面から再取得できる。
    }
  }
  return {
    ok: true,
    token: token,
    expiresIn: SESSION_TTL_SECONDS
  };
}

/** 書き込み系関数は必ずサーバー側で管理者トークンを検証する。 */
function requireAdmin_(token) {
  if (typeof token !== 'string' || !token ||
      !isSessionValid_('ADMIN', token)) {
    throw new Error('管理者ログインが必要です。ログインし直してください。');
  }
}

/**
 * 画面表示用に全リンクを返す。
 */
function getLinksForToken_(viewerToken, knownIsAdmin, performanceData) {
  const isAdmin = typeof knownIsAdmin === 'boolean'
    ? knownIsAdmin
    : isSessionValid_('ADMIN', viewerToken);

  const cacheStartedAt = Date.now();
  let result = readChunkedJsonCache_('LINK_CORE_LINKS_ALL_V2');
  if (performanceData) {
    performanceData.cacheReadMs = Date.now() - cacheStartedAt;
    performanceData.cacheHit = !!result;
  }

  if (!result) {
    const sheetStartedAt = Date.now();
    result = readLinksForDisplay_();
    if (performanceData) performanceData.sheetReadMs = Date.now() - sheetStartedAt;
    const cacheWriteStartedAt = Date.now();
    writeChunkedJsonCache_('LINK_CORE_LINKS_ALL_V2', result, LINKS_CACHE_TTL_SECONDS);
    if (performanceData) performanceData.cacheWriteMs = Date.now() - cacheWriteStartedAt;
  } else if (performanceData) {
    performanceData.sheetReadMs = 0;
    performanceData.cacheWriteMs = 0;
  }

  // キャッシュはサーバー内に全件を保持し、利用者には返却直前に公開リンクだけを渡す。
  if (!isAdmin) {
    const filterStartedAt = Date.now();
    const visibleLinks = result.links.filter(link => link.visibleToVisitors === true);
    const filtered = {
      links: visibleLinks,
      categories: Array.from(new Set(visibleLinks.map(link => link.category).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ja'))
    };
    if (performanceData) performanceData.filterMs = Date.now() - filterStartedAt;
    return filtered;
  }
  if (performanceData) performanceData.filterMs = 0;
  return result;
}
function getLinks(viewerToken) {
  const startedAt = Date.now();
  // トークン種別を一度だけ確認し、後続処理で同じCacheService照会を繰り返さない。
  const authStartedAt = Date.now();
  const isAdmin = typeof viewerToken === 'string' && viewerToken &&
    isSessionValid_('ADMIN', viewerToken);
  const isVisitor = isAdmin || (typeof viewerToken === 'string' && viewerToken &&
    isSessionValid_('VISITOR', viewerToken));
  const authMs = Date.now() - authStartedAt;
  if (!isVisitor) throw new Error('閲覧にはサイトのパスワード認証が必要です。');

  const performanceData = isAdmin ? { authMs: authMs } : null;
  const result = getLinksForToken_(viewerToken, isAdmin, performanceData);
  if (performanceData) {
    performanceData.serverTotalMs = Date.now() - startedAt;
    performanceData.linkCount = result.links.length;
    result._performance = performanceData;
  }
  return result;
}

/**
 * リンクを新規作成または更新する。
 */
function saveLink(input, adminToken) {
  requireAdmin_(adminToken);
  if (!input || typeof input !== 'object') {
    throw new Error('リンクの入力内容がありません。');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = ensureSheet_();
    const columns = getColumnMap_(sheet);
    const now = new Date();

    const id = cleanText_(input.id, 200) || Utilities.getUuid();
    const title = cleanText_(input.title, 200);
    const url = normalizeUrl_(input.url);
    const category = cleanText_(input.category, 50);
    const memo = cleanText_(input.memo, 10000);

    if (!title) throw new Error('タイトルを入力してください。');

    const lastRow = sheet.getLastRow();
    const width = sheet.getLastColumn();
    let targetRow = 0;
    let rowValues = new Array(width).fill('');
    let createdAt = now;

    if (lastRow >= 2) {
      const ids = sheet
        .getRange(2, columns['ID'], lastRow - 1, 1)
        .getDisplayValues();

      for (let i = 0; i < ids.length; i++) {
        if (ids[i][0] === id) {
          targetRow = i + 2;
          // 既存行の値を保持し、HEADERS以外の列を壊さない
          rowValues = sheet.getRange(targetRow, 1, 1, width).getValues()[0];
          createdAt = rowValues[columns['作成日時'] - 1] || now;
          break;
        }
      }
    }

    const action = targetRow ? '編集' : '追加';
    if (!targetRow) targetRow = lastRow + 1;

    const valuesByHeader = {
      'ID': id,
      'タイトル': safeCell_(title),
      'URL': url,
      'カテゴリ': safeCell_(category),
      'メモ': safeCell_(memo),
      '利用者に公開': input.visibleToVisitors !== false,
      '開き方': input.openMode === 'external' ? 'external' : 'internal',
      'NEWラベル': input.isNew === true,
      '作成日時': createdAt,
      '更新日時': now
    };

    Object.keys(valuesByHeader).forEach(header => {
      rowValues[columns[header] - 1] = valuesByHeader[header];
    });

    // 1行分を一括で書き込む
    sheet.getRange(targetRow, 1, 1, width).setValues([rowValues]);
    recordLinkOperation_(sheet, action, id, title);

    invalidateLinksCache_();
    return refreshLinksCacheFromSheet_(sheet);
  } finally {
    lock.releaseLock();
  }
}

const VISITOR_FAVORITES_SHEET = 'VisitorFavorites';
const CLICK_BROWSER_NAMES_SHEET = 'ClickBrowserNames';

function twoColumnRecordsSheet_(name, headers, create) {
  const id = PropertiesService.getScriptProperties().getProperty(SPREADSHEET_PROPERTY);
  if (!id) throw new Error('スプレッドシートIDが未設定です。');
  const spreadsheet = SpreadsheetApp.openById(id);
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet && create) sheet = spreadsheet.insertSheet(name);
  if (create && sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, 2).setValues([headers]);
  return sheet;
}

function matchingRecordRows_(sheet, key) {
  const last = sheet ? sheet.getLastRow() : 0;
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, 1).createTextFinder(key).matchCase(true).matchEntireCell(true).findAll();
}

function visitorFavoritesProfile_(secret, token) {
  if (typeof token !== 'string' || !token || !isSessionValid_('VISITOR', token)) {
    throw new Error('閲覧にはサイトのパスワード認証が必要です。');
  }
  if (typeof secret !== 'string' || !/^[0-9a-f]{64}$/.test(secret)) {
    throw new Error('お気に入りを利用するにはブラウザで保存を許可してください。');
  }
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'favorites:' + secret, Utilities.Charset.UTF_8)
    .map(byte => (byte & 255).toString(16).padStart(2, '0')).join('');
}

function getVisitorFavorites(secret, token) {
  const profile = visitorFavoritesProfile_(secret, token);
  const sheet = twoColumnRecordsSheet_(VISITOR_FAVORITES_SHEET, [], false);
  const last = sheet ? sheet.getLastRow() : 0;
  if (last < 2) return {ids: []};
  const rows = sheet.getRange(2, 1, last - 1, 2).getDisplayValues();
  return {ids: rows.filter(row => row[0] === 'visitor-' + profile).map(row => row[1])};
}

function setVisitorFavorite(linkId, favorite, secret, token) {
  const profile = 'visitor-' + visitorFavoritesProfile_(secret, token);
  const id = cleanText_(linkId, 200);
  if (!id || typeof favorite !== 'boolean') throw new Error('お気に入りの指定が不正です。');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    visitorFavoritesProfile_(secret, token);
    if (favorite && !getLinksForToken_(token, false).links.some(link => link.id === id)) {
      throw new Error('利用者に公開されているリンクが見つかりません。');
    }
    const sheet = twoColumnRecordsSheet_(VISITOR_FAVORITES_SHEET, ['利用者', 'リンクID'], favorite);
    const last = sheet ? sheet.getLastRow() : 0;
    const records = last < 2 ? [] : sheet.getRange(2, 1, last - 1, 2).getDisplayValues();
    const rows = [];
    records.forEach((row, index) => {
      if (row[0] === profile && row[1] === id) rows.push(index + 2);
    });
    if (favorite && !rows.length) sheet.appendRow([profile, safeCell_(id)]);
    if (!favorite) rows.reverse().forEach(row => sheet.deleteRow(row));
    return {ok: true, favorite};
  } finally {
    lock.releaseLock();
  }
}

/**
 * リンクを削除する。行を即座に消すのではなく、まず Trash シートへ移動する。
 * Trash への保存に失敗した場合は Links から削除しない（誤削除の防止）。
 * 管理画面の「元に戻す」は restoreTrash で Trash から Links へ戻す。
 */
function deleteLink(id, adminToken) {
  requireAdmin_(adminToken);
  const linkId = cleanText_(id, 200);
  if (!linkId) throw new Error('削除するリンクIDがありません。');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = ensureSheet_();
    const columns = getColumnMap_(sheet);
    const lastRow = sheet.getLastRow();

    if (lastRow >= 2) {
      const ids = sheet
        .getRange(2, columns['ID'], lastRow - 1, 1)
        .getDisplayValues();

      for (let i = ids.length - 1; i >= 0; i--) {
        if (ids[i][0] === linkId) {
          const targetRow = i + 2;
          const rowValues = sheet.getRange(targetRow, 1, 1, sheet.getLastColumn()).getValues()[0];
          // Trash へ先に保存してから Links から削除する。
          moveRowToTrash_(rowValues, columns);
          sheet.deleteRow(targetRow);
          recordLinkOperation_(sheet, '削除', linkId, rowValues[columns['タイトル'] - 1]);
          break;
        }
      }
    }

    invalidateLinksCache_();
    return refreshLinksCacheFromSheet_(sheet);
  } finally {
    lock.releaseLock();
  }
}


/* ゴミ箱：削除したリンクを Trash シートへ退避し、復元・完全削除できるようにする。
   対象は通常リンクのみ。公式リンク（OfficialLinks）の削除は従来どおり即削除のまま。 */
const TRASH_SHEET_NAME = 'Trash';
const TRASH_HEADERS = ['ID', 'タイトル', 'URL', 'カテゴリ', 'メモ', 'お気に入り', '作成日時', '更新日時', '利用者に公開', '開き方', 'NEWラベル', '削除日時'];

function ensureTrashSheet_() {
  const spreadsheetId = PropertiesService
    .getScriptProperties()
    .getProperty(SPREADSHEET_PROPERTY);
  if (!spreadsheetId) throw new Error('スプレッドシートIDが未設定です。');
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  let sheet = spreadsheet.getSheetByName(TRASH_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(TRASH_SHEET_NAME);
  const lastColumn = sheet.getLastColumn();
  if (lastColumn === 0) {
    sheet.getRange(1, 1, 1, TRASH_HEADERS.length).setValues([TRASH_HEADERS]);
  } else {
    const existing = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
    TRASH_HEADERS.forEach(header => {
      if (existing.indexOf(header) === -1) {
        sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
        existing.push(header);
      }
    });
  }
  return sheet;
}

/** Trash シートの列名 → 列番号（1始まり）。不足列があればエラーにする。 */
function getTrashColumnMap_(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) throw new Error('Trashシートのヘッダーがありません。');
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const map = {};
  headers.forEach((header, index) => {
    if (header) map[header] = index + 1;
  });
  TRASH_HEADERS.forEach(header => {
    if (!map[header]) throw new Error('Trashシートに必要な列がありません: ' + header);
  });
  return map;
}

/** Links の1行分を Trash の行に変換する。 */
function rowToTrashValues_(rowValues, columns) {
  const get = header => rowValues[columns[header] - 1];
  return [
    get('ID'), get('タイトル'), get('URL'), get('カテゴリ'), get('メモ'),
    get('お気に入り'), get('作成日時'), get('更新日時'), get('利用者に公開'),
    get('開き方'), get('NEWラベル'), new Date()
  ];
}

/** Links の1行分を Trash シートへ追加する。deleteLink 内（ロック取得中）から呼ぶ。 */
function moveRowToTrash_(rowValues, columns) {
  const trashSheet = ensureTrashSheet_();
  const width = Math.max(TRASH_HEADERS.length, trashSheet.getLastColumn());
  const values = rowToTrashValues_(rowValues, columns);
  while (values.length < width) values.push('');
  trashSheet.appendRow(values.slice(0, width));
}

/** Trash の1行を管理画面へ返す形に変換する。 */
function trashRowToItem_(row, columns) {
  const get = header => row[columns[header] - 1];
  const favorite = get('お気に入り');
  return {
    id: String(get('ID') || ''),
    title: String(get('タイトル') || ''),
    url: String(get('URL') || ''),
    category: String(get('カテゴリ') || ''),
    memo: String(get('メモ') || ''),
    favorite: favorite === true || String(favorite).toLowerCase() === 'true',
    visibleToVisitors: get('利用者に公開') === true || String(get('利用者に公開')).toLowerCase() === 'true',
    openMode: String(get('開き方') || 'internal').toLowerCase() === 'external' ? 'external' : 'internal',
    isNew: get('NEWラベル') === true || String(get('NEWラベル')).toLowerCase() === 'true',
    createdAt: toIso_(get('作成日時')),
    updatedAt: toIso_(get('更新日時')),
    deletedAt: toIso_(get('削除日時'))
  };
}

/** ゴミ箱の一覧を返す（新しい削除順）。管理者のみ。 */
function getTrash(adminToken) {
  requireAdmin_(adminToken);
  const sheet = ensureTrashSheet_();
  const columns = getTrashColumnMap_(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { trash: [] };
  const width = sheet.getLastColumn();
  const rows = sheet.getRange(2, 1, lastRow - 1, width).getValues();
  const trash = rows
    .filter(row => String(row[columns['ID'] - 1] || '') !== '')
    .map(row => trashRowToItem_(row, columns))
    .reverse();
  return { trash: trash };
}

/**
 * ゴミ箱の1件を Links へ復元する。作成日時・更新日時も元のまま戻す。
 * 同じIDのリンクが既に Links にある場合は、重複を避けるため復元せずエラーにする。
 * 戻り値は getLinks と同じ形（{links, categories}）で、管理画面の apply() がそのまま使える。
 */
function restoreTrash(id, adminToken) {
  requireAdmin_(adminToken);
  const trashId = cleanText_(id, 200);
  if (!trashId) throw new Error('復元するリンクIDがありません。');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const trashSheet = ensureTrashSheet_();
    const trashColumns = getTrashColumnMap_(trashSheet);
    const trashLastRow = trashSheet.getLastRow();
    let trashRowIndex = -1;
    let trashRowValues = null;
    if (trashLastRow >= 2) {
      const ids = trashSheet
        .getRange(2, trashColumns['ID'], trashLastRow - 1, 1)
        .getDisplayValues();
      for (let i = 0; i < ids.length; i++) {
        if (ids[i][0] === trashId) {
          trashRowIndex = i + 2;
          trashRowValues = trashSheet.getRange(trashRowIndex, 1, 1, trashSheet.getLastColumn()).getValues()[0];
          break;
        }
      }
    }
    if (trashRowIndex === -1) throw new Error('ゴミ箱にそのリンクがありません。');

    const sheet = ensureSheet_();
    const columns = getColumnMap_(sheet);
    const lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      const ids = sheet.getRange(2, columns['ID'], lastRow - 1, 1).getDisplayValues();
      for (let i = 0; i < ids.length; i++) {
        if (ids[i][0] === trashId) throw new Error('同じIDのリンクが既にあります。ゴミ箱の項目を削除してから再登録してください。');
      }
    }

    // Trash の値を Links の列順に並べ替えて末尾へ追加する。
    const width = sheet.getLastColumn();
    const rowValues = new Array(width).fill('');
    TRASH_HEADERS.forEach(header => {
      if (header === '削除日時' || !columns[header]) return;
      rowValues[columns[header] - 1] = trashRowValues[trashColumns[header] - 1];
    });
    sheet.getRange(lastRow + 1, 1, 1, width).setValues([rowValues]);

    trashSheet.deleteRow(trashRowIndex);
    invalidateLinksCache_();
    return refreshLinksCacheFromSheet_(sheet);
  } finally {
    lock.releaseLock();
  }
}

/** ゴミ箱の1件を完全に削除する（復元不可）。管理者のみ。 */
function deleteTrashPermanently(id, adminToken) {
  requireAdmin_(adminToken);
  const trashId = cleanText_(id, 200);
  if (!trashId) throw new Error('削除するリンクIDがありません。');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = ensureTrashSheet_();
    const columns = getTrashColumnMap_(sheet);
    const lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      const ids = sheet.getRange(2, columns['ID'], lastRow - 1, 1).getDisplayValues();
      for (let i = ids.length - 1; i >= 0; i--) {
        if (ids[i][0] === trashId) {
          sheet.deleteRow(i + 2);
          break;
        }
      }
    }
    return getTrash(adminToken);
  } finally {
    lock.releaseLock();
  }
}

/** ゴミ箱をすべて空にする（復元不可）。管理者のみ。 */
function emptyTrash(adminToken) {
  requireAdmin_(adminToken);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = ensureTrashSheet_();
    const lastRow = sheet.getLastRow();
    const deleted = Math.max(0, lastRow - 1);
    if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);
    SpreadsheetApp.flush();
    return { ok: true, deleted: deleted, trash: [] };
  } finally {
    lock.releaseLock();
  }
}


/* 公式リンク用クラウド保存。既存 Links シートは変更しない。 */
const OFFICIAL_SHEET_NAME = 'OfficialLinks';
const OFFICIAL_HEADERS = ['ID', 'サイト名', 'URL', '説明', 'アイコン', '種別', '作成日時', '更新日時'];

function ensureOfficialSheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty(SPREADSHEET_PROPERTY);
  if (!spreadsheetId) throw new Error('スプレッドシートIDが未設定です。');
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  let sheet = spreadsheet.getSheetByName(OFFICIAL_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(OFFICIAL_SHEET_NAME);
  const lastColumn = sheet.getLastColumn();
  if (lastColumn === 0) {
    sheet.getRange(1, 1, 1, OFFICIAL_HEADERS.length).setValues([OFFICIAL_HEADERS]);
  } else {
    const existing = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
    OFFICIAL_HEADERS.forEach(header => {
      if (existing.indexOf(header) === -1) {
        sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
        existing.push(header);
      }
    });
  }
  return sheet;
}

const OFFICIAL_CACHE_TTL_SECONDS = 300;
function invalidateOfficialLinksCache_() {
  CacheService.getScriptCache().remove('LINK_CORE_OFFICIAL_LINKS_V1');
}
function getOfficialLinks(viewerToken) {
  requireLinkViewer_(viewerToken);
  const cached = readJsonCache_('LINK_CORE_OFFICIAL_LINKS_V1');
  if (cached) return cached;
  const sheet = ensureOfficialSheet_();
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    const empty = {links:[]};
    writeJsonCache_('LINK_CORE_OFFICIAL_LINKS_V1', empty, OFFICIAL_CACHE_TTL_SECONDS);
    return empty;
  }
  const headers = data[0].map(String), col = {};
  headers.forEach((h, i) => { if (h) col[h] = i; });
  const links = data.slice(1).filter(row => row[col['ID']] !== '').map(row => ({
    id: String(row[col['ID']] || ''),
    name: String(row[col['サイト名']] || ''),
    url: String(row[col['URL']] || ''),
    description: String(row[col['説明']] || ''),
    icon: String(row[col['アイコン']] || ''),
    kind: String(row[col['種別']] || 'custom'),
    createdAt: toIso_(row[col['作成日時']]),
    updatedAt: toIso_(row[col['更新日時']])
  }));
  const result = {links};
  writeJsonCache_('LINK_CORE_OFFICIAL_LINKS_V1', result, OFFICIAL_CACHE_TTL_SECONDS);
  return result;
}

function saveOfficialLink(input, adminToken) {
  requireAdmin_(adminToken);
  if (!input || typeof input !== 'object') throw new Error('公式リンクの入力内容がありません。');
  const id = cleanText_(input.id, 200) || Utilities.getUuid();
  const name = cleanText_(input.name, 200), url = normalizeUrl_(input.url);
  const description = cleanText_(input.description, 1000);
  const icon = cleanText_(input.icon, 20), kind = cleanText_(input.kind, 40) || 'custom';
  if (!name) throw new Error('サイト名を入力してください。');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = ensureOfficialSheet_();
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0], col = {};
    headers.forEach((h, i) => { if (h) col[h] = i; });
    const lastRow = sheet.getLastRow();
    let target = 0, values = new Array(headers.length).fill(''), createdAt = new Date();
    if (lastRow >= 2) {
      const rows = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
      for (let i = 0; i < rows.length; i++) {
        if (String(rows[i][col['ID']]) === id) {
          target = i + 2; values = rows[i]; createdAt = values[col['作成日時']] || createdAt; break;
        }
      }
    }
    if (!target) target = lastRow + 1;
    const now = new Date();
    const fields = {
      'ID': id, 'サイト名': safeCell_(name), 'URL': url, '説明': safeCell_(description),
      'アイコン': safeCell_(icon), '種別': safeCell_(kind), '作成日時': createdAt, '更新日時': now
    };
    Object.keys(fields).forEach(key => { values[col[key]] = fields[key]; });
    sheet.getRange(target, 1, 1, headers.length).setValues([values]);
    invalidateOfficialLinksCache_();
    return getOfficialLinks(adminToken);
  } finally { lock.releaseLock(); }
}

function deleteOfficialLink(id, adminToken) {
  requireAdmin_(adminToken);
  const linkId = cleanText_(id, 200);
  if (!linkId) throw new Error('削除する公式リンクIDがありません。');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = ensureOfficialSheet_(), headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    const idColumn = headers.indexOf('ID') + 1, lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      const ids = sheet.getRange(2, idColumn, lastRow - 1, 1).getDisplayValues();
      for (let i = ids.length - 1; i >= 0; i--) if (ids[i][0] === linkId) { sheet.deleteRow(i + 2); break; }
    }
    invalidateOfficialLinksCache_();
    return getOfficialLinks(adminToken);
  } finally { lock.releaseLock(); }
}


/* 独立メモ機能。既存の Links / OfficialLinks シートには触れず、Memos シートのみを利用する。 */
const MEMOS_SHEET_NAME = 'Memos';
const MEMOS_HEADERS = ['ID', 'タイトル', '本文', '作成日時', '更新日時'];

function ensureMemosSheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty(SPREADSHEET_PROPERTY);
  if (!spreadsheetId) throw new Error('スプレッドシートIDが未設定です。');
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  let sheet = spreadsheet.getSheetByName(MEMOS_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(MEMOS_SHEET_NAME);
  const lastColumn = sheet.getLastColumn();
  if (lastColumn === 0) {
    sheet.getRange(1, 1, 1, MEMOS_HEADERS.length).setValues([MEMOS_HEADERS]);
  } else {
    const existing = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
    MEMOS_HEADERS.forEach(header => {
      if (existing.indexOf(header) === -1) {
        sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
        existing.push(header);
      }
    });
  }
  return sheet;
}

const MEMOS_CACHE_TTL_SECONDS = 60;
function invalidateMemosCache_() {
  CacheService.getScriptCache().remove('LINK_CORE_MEMOS_V1');
}
function authenticateMemo(password, adminToken) {
  requireAdmin_(adminToken);
  const state = getAuthRateState_('MEMO');
  checkAuthRateLimit_(state);
  const properties = PropertiesService.getScriptProperties();
  const expected = properties.getProperty('LINK_CORE_MEMO_PASSWORD');
  if (!expected || expected === properties.getProperty('LINK_CORE_ADMIN_PASSWORD')) {
    throw new Error('GASで管理者用とは別のメモ帳パスワードを設定してください。');
  }
  if (typeof password !== 'string' || password !== expected) {
    recordAuthFailure_(state);
    throw new Error('メモ帳のパスワードが違います。');
  }
  clearAuthFailures_(state);
  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put('LINK_CORE_MEMO_' + token, adminToken, SESSION_TTL_SECONDS);
  return {token};
}

function requireMemo_(memoToken, adminToken) {
  requireAdmin_(adminToken);
  if (typeof memoToken !== 'string' || !/^[0-9a-f-]{72}$/i.test(memoToken) ||
      CacheService.getScriptCache().get('LINK_CORE_MEMO_' + memoToken) !== adminToken) {
    throw new Error('メモ帳の認証が必要です。メモ帳を開き直してください。');
  }
}

function getMemos(memoToken, adminToken) {
  requireMemo_(memoToken, adminToken);
  const cached = readJsonCache_('LINK_CORE_MEMOS_V1');
  if (cached) return cached;
  const sheet = ensureMemosSheet_();
  const data = sheet.getDataRange().getValues();
  if (!data.length) {
    const empty = {memos:[]};
    writeJsonCache_('LINK_CORE_MEMOS_V1', empty, MEMOS_CACHE_TTL_SECONDS);
    return empty;
  }
  const headers = data[0].map(String), col = {};
  headers.forEach((header, i) => { if (header) col[header] = i; });
  ['ID', 'タイトル', '本文', '作成日時', '更新日時'].forEach(h => {
    if (col[h] === undefined) throw new Error('必要な列がありません: ' + h);
  });
  const memos = data.slice(1).filter(row => row[col['ID']] !== '')
    .map(row => ({
      id: String(row[col['ID']] || ''),
      title: String(row[col['タイトル']] || ''),
      body: String(row[col['本文']] || ''),
      createdAt: toIso_(row[col['作成日時']]),
      updatedAt: toIso_(row[col['更新日時']])
    }));
  memos.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const result = {memos};
  writeJsonCache_('LINK_CORE_MEMOS_V1', result, MEMOS_CACHE_TTL_SECONDS);
  return result;
}

function saveMemo(input, memoToken, adminToken) {
  requireMemo_(memoToken, adminToken);
  if (!input || typeof input !== 'object') throw new Error('メモの入力内容がありません。');
  const title = cleanText_(input.title, 200);
  const body = cleanText_(input.body, 20000);
  if (!title) throw new Error('タイトルを入力してください。');
  if (!body) throw new Error('本文を入力してください。');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = ensureMemosSheet_();
    const width = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, width).getDisplayValues()[0];
    const col = {};
    headers.forEach((h, i) => { if (h) col[h] = i; });
    const id = cleanText_(input.id, 200) || Utilities.getUuid();
    const now = new Date();
    const lastRow = sheet.getLastRow();
    let targetRow = 0;
    let values = new Array(width).fill('');
    let createdAt = now;

    if (lastRow >= 2) {
      const rows = sheet.getRange(2, 1, lastRow - 1, width).getValues();
      for (let i = 0; i < rows.length; i++) {
        if (String(rows[i][col['ID']] || '') === id) {
          targetRow = i + 2;
          values = rows[i];
          createdAt = values[col['作成日時']] || now;
          break;
        }
      }
    }
    if (!targetRow) targetRow = lastRow + 1;
    values[col['ID']] = id;
    values[col['タイトル']] = safeCell_(title);
    values[col['本文']] = safeCell_(body);
    values[col['作成日時']] = createdAt;
    values[col['更新日時']] = now;
    sheet.getRange(targetRow, 1, 1, width).setValues([values]);
    invalidateMemosCache_();
    return getMemos(memoToken, adminToken);
  } finally {
    lock.releaseLock();
  }
}

function deleteMemo(id, memoToken, adminToken) {
  requireMemo_(memoToken, adminToken);
  const memoId = cleanText_(id, 200);
  if (!memoId) throw new Error('削除するメモIDがありません。');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = ensureMemosSheet_();
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    const idColumn = headers.indexOf('ID') + 1;
    if (!idColumn) throw new Error('メモID列がありません。');
    const lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      const ids = sheet.getRange(2, idColumn, lastRow - 1, 1).getDisplayValues();
      for (let i = ids.length - 1; i >= 0; i--) {
        if (ids[i][0] === memoId) {
          sheet.deleteRow(i + 2);
          break;
        }
      }
    }
    invalidateMemosCache_();
    return getMemos(memoToken, adminToken);
  } finally {
    lock.releaseLock();
  }
}


/* LINK CORE shared chat. Existing Links / OfficialLinks / Memos sheets remain untouched. */
const CHAT_SHEET_NAME = 'ChatMessages';
const CHAT_HEADERS = ['ID', '投稿者', 'メッセージ', '送信日時'];
const CHAT_MAX_MESSAGES = 200;
const CHAT_MAX_LENGTH = 1000;
const CHAT_IMAGE_HEADERS = ['画像データ1', '画像データ2', '画像データ3'];
const CHAT_IMAGE_CHUNK_LENGTH = 45000;
const CHAT_IMAGE_MAX_LENGTH = 130000;
function ensureChatSheet_() {
  const id = PropertiesService.getScriptProperties().getProperty(SPREADSHEET_PROPERTY);
  if (!id) throw new Error('スプレッドシートIDが未設定です。');
  const ss = SpreadsheetApp.openById(id);
  let sheet = ss.getSheetByName(CHAT_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(CHAT_SHEET_NAME);
  const width = sheet.getLastColumn();
  if (!width) sheet.getRange(1,1,1,CHAT_HEADERS.length).setValues([CHAT_HEADERS]);
  else {
    const existing = sheet.getRange(1,1,1,width).getDisplayValues()[0];
    CHAT_HEADERS.forEach(h => { if (existing.indexOf(h) < 0) { sheet.getRange(1,sheet.getLastColumn()+1).setValue(h); existing.push(h); } });
  }
  return sheet;
}
function getChatMessages(viewerToken, browserSecret) {
  requireLinkViewer_(viewerToken);
  const publicResult = getPublicChatMessages_(viewerToken);
  const publicMessages = publicResult.messages;
  const isAdmin = isSessionValid_('ADMIN', viewerToken);
  const recipient = privateChatBrowserId_(browserSecret);
  if (supabaseChatMode_() === 'supabase') {
    const params = {kind:'eq.direct', select:'id,recipient,body,created_at', order:'seq.desc', limit:CHAT_MAX_MESSAGES};
    if (!isAdmin && !recipient) return {messages:publicMessages, screenshotsEnabled:true};
    if (!isAdmin) params.recipient = 'eq.' + recipient;
    const directMessages = supabaseChatRows_(params).reverse().map(row => ({
      id:row.id, author:'管理者', message:row.body, createdAt:row.created_at, private:true, recipient:isAdmin ? row.recipient : ''
    }));
    return {messages:publicMessages.concat(directMessages)
      .sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt)).slice(-CHAT_MAX_MESSAGES), screenshotsEnabled:true};
  }
  if (!isAdmin && !recipient) return {messages: publicMessages,screenshotsEnabled:true};

  const sheet = privateChatSheet_(false);
  if (!sheet || sheet.getLastRow() < 2) return {messages: publicMessages,screenshotsEnabled:true};
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
  const directMessages = rows
    .filter(row => row[0] && (isAdmin || row[1] === recipient))
    .slice(-CHAT_MAX_MESSAGES)
    .map(row => ({
      id: String(row[0]), author: '管理者', message: String(row[2]),
      createdAt: toIso_(row[3]), private: true, recipient: isAdmin ? String(row[1]) : ''
    }));
  return {messages: publicMessages.concat(directMessages)
    .sort((first, second) => first.createdAt.localeCompare(second.createdAt))
    .slice(-CHAT_MAX_MESSAGES),screenshotsEnabled:true};
}

function privateChatBrowserId_(secret) {
  if (typeof secret !== 'string' || !/^[0-9a-f]{64}$/.test(secret)) return '';
  return 'dm_' + Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, secret)
    .map(byte => ('0' + (byte & 255).toString(16)).slice(-2)).join('');
}

function privateChatSheet_(create) {
  const id = PropertiesService.getScriptProperties().getProperty(SPREADSHEET_PROPERTY);
  if (!id) throw new Error('スプレッドシートIDが未設定です。');
  const spreadsheet = SpreadsheetApp.openById(id);
  let sheet = spreadsheet.getSheetByName('PrivateChatMessages');
  if (!sheet && create) {
    sheet = spreadsheet.insertSheet('PrivateChatMessages');
    sheet.appendRow(['ID', '宛先ID', 'メッセージ', '送信日時']);
  }
  return sheet;
}

function sendPrivateChatMessage(message, recipient, adminToken) {
  requireAdmin_(adminToken);
  const body = cleanText_(message, CHAT_MAX_LENGTH);
  if (!body) throw new Error('メッセージを入力してください。');
  if (typeof recipient !== 'string' || !/^dm_[0-9a-f]{64}$/.test(recipient)) {
    throw new Error('利用者チャットに表示された個別チャットIDを入力してください。');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    requireAdmin_(adminToken);
    requireChatWritable_();
    if (supabaseChatMode_() === 'supabase') {
      supabaseChatInsert_('direct', {body, recipient});
      return {ok:true};
    }
    privateChatSheet_(true).appendRow([Utilities.getUuid(), recipient, safeCell_(body), new Date()]);
    return {ok: true};
  } finally {
    lock.releaseLock();
  }
}

function deleteVisitorChatMessage(messageId, isPrivate, adminToken) {
  requireAdmin_(adminToken);
  if (typeof messageId !== 'string' || !messageId || messageId.length > 200 ||
      typeof isPrivate !== 'boolean') throw new Error('メッセージIDが不正です。');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    requireAdmin_(adminToken);
    requireChatWritable_();
    if (supabaseChatMode_() === 'supabase') {
      supabaseChatDelete_(isPrivate ? 'direct' : 'public', messageId);
      return {ok:true};
    }
    const sheet = isPrivate ? privateChatSheet_(false) : ensureChatSheet_();
    const last = sheet ? sheet.getLastRow() : 0;
    if (last >= 2) {
      const idColumn = isPrivate ? 1 :
        sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].indexOf('ID') + 1;
      const match = sheet.getRange(2, idColumn, last - 1, 1).createTextFinder(messageId)
        .matchCase(true).matchEntireCell(true).findNext();
      if (match) {
        sheet.deleteRow(match.getRow());
        SpreadsheetApp.flush();
      }
    }
    if (!isPrivate) invalidateChatCache_();
    return {ok: true};
  } finally {
    lock.releaseLock();
  }
}

function getPublicChatMessages_(viewerToken) {
  requireLinkViewer_(viewerToken);
  if (supabaseChatMode_() === 'supabase') return {messages:supabasePublicMessages_(), screenshotsEnabled:true};
  const cached = readJsonCache_('LINK_CORE_CHAT_MESSAGES_V1');
  if (cached) return cached;
  const sheet = ensureChatSheet_(), last = sheet.getLastRow();
  if (last < 2) {
    const empty = {messages:[],screenshotsEnabled:true};
    writeJsonCache_('LINK_CORE_CHAT_MESSAGES_V1', empty, CHAT_CACHE_TTL_SECONDS);
    return empty;
  }
  const headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0], col = {};
  headers.forEach((h,i)=>{if(h)col[h]=i;});
  CHAT_HEADERS.forEach(h=>{if(col[h]===undefined)throw new Error('チャットシートに必要な列がありません: '+h);});
  const first = Math.max(2,last-CHAT_MAX_MESSAGES+1);
  const screenshotColumn = col[CHAT_IMAGE_HEADERS[0]];
    const dataWidth = Math.max(...CHAT_HEADERS.map(header=>col[header]))+1;
  const rows = sheet.getRange(first,1,last-first+1,dataWidth).getValues();
  const screenshotIds = screenshotColumn === undefined ? new Set() :
    new Set(sheet.getRange(first,screenshotColumn+1,last-first+1,1)
      .createTextFinder('data:image/jpeg;base64,').findAll().map(cell=>cell.getRow()));
  const result = {messages:rows.map((r,i)=>r[col['ID']]===''?null:({
    id:String(r[col['ID']]||''),author:String(r[col['投稿者']]||'利用者'),
    message:String(r[col['メッセージ']]||''),createdAt:toIso_(r[col['送信日時']]),
    hasScreenshot:screenshotIds.has(first+i)
  })).filter(Boolean),screenshotsEnabled:true};
  writeJsonCache_('LINK_CORE_CHAT_MESSAGES_V1', result, CHAT_CACHE_TTL_SECONDS);
  return result;
}
function sendChatMessage(message, viewerToken) {
  return postPublicChat_(message, viewerToken, '');
}

function sendChatScreenshot(image, viewerToken) {
  requireLinkViewer_(viewerToken);
  if (typeof image !== 'string' || image.length > CHAT_IMAGE_MAX_LENGTH ||
      !/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(image)) {
    throw new Error('スクリーンショットは JPEG 画像で送信してください。');
  }
  return postPublicChat_('スクリーンショット', viewerToken, image);
}

function getChatScreenshot(messageId, viewerToken) {
  requireLinkViewer_(viewerToken);
  if (typeof messageId !== 'string' || !/^[0-9a-f-]{36}$/.test(messageId)) {
    throw new Error('メッセージIDが不正です。');
  }
  if (supabaseChatMode_() === 'supabase') {
    const [row] = supabaseChatRows_({kind:'eq.public', id:supabaseChatIdFilter_(messageId), select:'image', limit:1});
    if (!row?.image) throw new Error('画像が見つかりません。');
    return {image:row.image};
  }
  const sheet = ensureChatSheet_();
  const headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];
  const imageColumns = CHAT_IMAGE_HEADERS.map(header=>headers.indexOf(header)+1);
  const last = sheet.getLastRow();
  if (last < 2 || imageColumns.some(column=>!column)) throw new Error('画像が見つかりません。');
  const first = Math.max(2,last-CHAT_MAX_MESSAGES+1);
  const match = sheet.getRange(first,headers.indexOf('ID')+1,last-first+1,1)
    .createTextFinder(messageId).matchEntireCell(true).findNext();
  if (!match) throw new Error('画像が見つかりません。');
  const row = sheet.getRange(match.getRow(),1,1,headers.length).getDisplayValues()[0];
  const image = imageColumns.map((column,i)=>i===0?row[column-1]:row[column-1].slice(4)).join('');
  if (!image) throw new Error('画像が見つかりません。');
  return {image};
}

function postPublicChat_(message, viewerToken, image) {
  requireLinkViewer_(viewerToken);
  const body = cleanText_(message,CHAT_MAX_LENGTH);
  if(!body)throw new Error('メッセージを入力してください。');
  if(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(body))throw new Error('使用できない制御文字が含まれています。');
  const cache=CacheService.getScriptCache(), rateKey='LINK_CORE_CHAT_RATE_'+viewerToken;
  if(cache.get(rateKey))throw new Error('連続送信はできません。少し待ってから送信してください。');
  const isAdmin=isSessionValid_('ADMIN', viewerToken);
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    if(cache.get(rateKey))throw new Error('連続送信はできません。少し待ってから送信してください。');
    requireChatWritable_();
    if (supabaseChatMode_() === 'supabase') {
      supabaseChatInsert_('public', {author:isAdmin ? '管理者' : '利用者', body, image});
      cache.put(rateKey,'1',3);
      return {ok:true};
    }
    const sheet=ensureChatSheet_();
    const headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];
    if (image) {
      const missing = CHAT_IMAGE_HEADERS.filter(header=>!headers.includes(header));
      if (missing.length) {
        const lastColumn = sheet.getLastColumn();
        if (lastColumn + missing.length > sheet.getMaxColumns()) {
          sheet.insertColumnsAfter(sheet.getMaxColumns(),missing.length);
        }
        sheet.getRange(1,lastColumn+1,1,missing.length).setValues([missing]);
        headers.push(...missing);
      }
    }
    const col={};
    headers.forEach((h,i)=>{if(h)col[h]=i;});
    const row=new Array(headers.length).fill('');
    row[col['ID']]=Utilities.getUuid();row[col['投稿者']]=isAdmin?'管理者':'利用者';
    row[col['メッセージ']]=safeCell_(body);row[col['送信日時']]=new Date();
    if (image) CHAT_IMAGE_HEADERS.forEach((header,i)=>{
      const chunk = image.slice(i*CHAT_IMAGE_CHUNK_LENGTH,(i+1)*CHAT_IMAGE_CHUNK_LENGTH);
      row[col[header]]=i===0?chunk:'b64:'+chunk;
    });
    sheet.getRange(sheet.getLastRow()+1,1,1,row.length).setValues([row]);
    invalidateChatCache_();
    cache.put(rateKey,'1',3);
  }finally{lock.releaseLock();}
  return getPublicChatMessages_(viewerToken);
}


/* LINK CORE click history. Only authenticated visitors can write; only admins can read. */
const CLICK_LOG_SHEET_NAME = 'ClickLogs';
const CLICK_LOG_HEADERS = ['ID', 'リンクID', 'リンク名', 'URL', 'クリック日時', 'ブラウザID'];
function ensureClickLogSheet_() {
  const id = PropertiesService.getScriptProperties().getProperty(SPREADSHEET_PROPERTY);
  if (!id) throw new Error('スプレッドシートIDが未設定です。');
  const ss = SpreadsheetApp.openById(id);
  let sheet = ss.getSheetByName(CLICK_LOG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CLICK_LOG_SHEET_NAME);
    sheet.getRange(1, 1, 1, CLICK_LOG_HEADERS.length).setValues([CLICK_LOG_HEADERS]);
  } else if (sheet.getLastColumn() === 0) {
    sheet.getRange(1, 1, 1, CLICK_LOG_HEADERS.length).setValues([CLICK_LOG_HEADERS]);
  }
  if (sheet.getLastColumn() < CLICK_LOG_HEADERS.length) sheet.getRange(1, 1, 1, CLICK_LOG_HEADERS.length).setValues([CLICK_LOG_HEADERS]);
  return sheet;
}
function recordLinkClick(linkId, browserId, visitorToken) {
  let stage = '利用者認証';
  try {
    if (typeof visitorToken !== 'string' || !visitorToken ||
        !isSessionValid_('VISITOR', visitorToken)) {
      throw new Error('利用者ログインが必要です。ログインの有効期限が切れている可能性があります。');
    }

    stage = 'リンクID・ブラウザIDの確認';
    const id = cleanText_(linkId, 200);
    const browser = cleanText_(browserId, 100);
    if (!id) throw new Error('リンクIDがありません。');
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(browser)) throw new Error('ブラウザIDが不正です。');

    stage = 'リンク一覧の読み込み';
    // 一覧キャッシュを再利用し、クリックのたびに Links シートを開かない。
    const cachedLinks = getLinksForToken_(visitorToken);
    const selected = cachedLinks.links.find(link => link.id === id);
    if (!selected || selected.visibleToVisitors !== true) {
      throw new Error('対象リンクが見つからないか、利用者に公開されていません。');
    }

    stage = 'ClickLogsシートへの保存';
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const logSheet = ensureClickLogSheet_();
      logSheet.appendRow([Utilities.getUuid(), safeCell_(selected.id), safeCell_(selected.title), safeCell_(selected.url), new Date(), safeCell_(browser)]);
      return {ok: true, title: selected.title, savedAt: new Date().toISOString()};
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    const detail = error && error.message ? error.message : String(error);
    console.error('[LINK CORE] recordLinkClick failed at ' + stage + ': ' + detail);
    throw new Error('クリック履歴の保存処理（' + stage + '）で失敗しました：' + detail);
  }
}
function setClickBrowserName(browserId, name, adminToken) {
  requireAdmin_(adminToken);
  const id = cleanText_(browserId, 100);
  const label = cleanText_(name, 40);
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(id)) throw new Error('ブラウザIDが不正です。');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    requireAdmin_(adminToken);
    const sheet = twoColumnRecordsSheet_(CLICK_BROWSER_NAMES_SHEET, ['ブラウザID', '名前'], !!label);
    const row = matchingRecordRows_(sheet, id)[0];
    if (row && label) sheet.getRange(row.getRow(), 2).setValue(safeCell_(label));
    else if (row) sheet.deleteRow(row.getRow());
    else if (label) sheet.appendRow([safeCell_(id), safeCell_(label)]);
    return {ok: true, name: label};
  } finally {
    lock.releaseLock();
  }
}

function getClickBrowserNames_() {
  const namesSheet = twoColumnRecordsSheet_(CLICK_BROWSER_NAMES_SHEET, [], false);
  const namesLast = namesSheet ? namesSheet.getLastRow() : 0;
  return new Map(namesLast < 2 ? [] : namesSheet.getRange(2, 1, namesLast - 1, 2).getDisplayValues());
}

function getClickLogs(adminToken) {
  requireAdmin_(adminToken);
  const sheet = ensureClickLogSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return {logs: []};
  const first = Math.max(2, last - 499);
  const rows = sheet.getRange(first, 1, last - first + 1, Math.max(CLICK_LOG_HEADERS.length, sheet.getLastColumn())).getValues();
  const names = getClickBrowserNames_();
  return {logs: rows.filter(row => row[0] !== '').reverse().map(row => ({
    id: String(row[0] || ''), linkId: String(row[1] || ''), title: String(row[2] || ''),
    url: String(row[3] || ''), clickedAt: toIso_(row[4]), browserId: String(row[5] || ''), browserName: names.get(String(row[5] || '')) || ''
  }))};
}


/* 管理者によるクリック履歴の全削除 */
function deleteClickLogs(adminToken) {
  requireAdmin_(adminToken);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = ensureClickLogSheet_();
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);
    SpreadsheetApp.flush();
    return {ok: true, deleted: Math.max(0, lastRow - 1)};
  } finally {
    lock.releaseLock();
  }
}


/* 管理者によるクリック履歴の個別削除 */
function deleteClickLog(logId, adminToken) {
  requireAdmin_(adminToken);
  const id = cleanText_(logId, 200);
  if (!id) throw new Error('削除対象の履歴IDがありません。');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = ensureClickLogSheet_();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return {ok: false, deleted: 0};
    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
    for (let i = ids.length - 1; i >= 0; i--) {
      if (String(ids[i][0]) === id) {
        sheet.deleteRow(i + 2);
        SpreadsheetApp.flush();
        return {ok: true, deleted: 1};
      }
    }
    return {ok: false, deleted: 0};
  } finally {
    lock.releaseLock();
  }
}


/* LINK CORE notice read receipts. One receipt per browser and notice. */
const NOTICE_READ_SHEET_NAME = 'NoticeReads';
function ensureNoticeReadSheet_() {
  const id = PropertiesService.getScriptProperties().getProperty(SPREADSHEET_PROPERTY);
  if (!id) throw new Error('スプレッドシートIDが未設定です。');
  const ss = SpreadsheetApp.openById(id);
  let sheet = ss.getSheetByName(NOTICE_READ_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(NOTICE_READ_SHEET_NAME);
  if (sheet.getLastColumn() === 0) sheet.getRange(1,1,1,3).setValues([['お知らせID','ブラウザID','既読日時']]);
  return sheet;
}
function getNoticeReadCount(noticeId, viewerToken) {
  // 管理者画面の serverCall() は認証トークンを引数の最後に追加する。
  if (typeof viewerToken !== 'string' || !viewerToken ||
      !isSessionValid_('ADMIN', viewerToken)) {
    throw new Error('既読件数の確認は管理者のみ利用できます。');
  }
  const id = cleanText_(noticeId,80);
  if (!id) throw new Error('お知らせIDが不正です。');
  const sheet=ensureNoticeReadSheet_(),last=sheet.getLastRow();
  if(last<2)return {count:0};
  const rows=sheet.getRange(2,1,last-1,2).getDisplayValues();
  return {count:rows.filter(row=>row[0]===id).length};
}
function markNoticeRead(viewerToken, noticeId, browserId) {
  requireLinkViewer_(viewerToken);
  const id=cleanText_(noticeId,80),browser=cleanText_(browserId,100);
  if(!id||!/^[A-Za-z0-9_-]{8,100}$/.test(browser))throw new Error('既読情報が不正です。');
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    const sheet=ensureNoticeReadSheet_(),last=sheet.getLastRow();
    let rows=last>=2?sheet.getRange(2,1,last-1,2).getDisplayValues():[];
    if(rows.some(row=>row[0]===id&&row[1]===browser))return {added:false,count:rows.filter(row=>row[0]===id).length};
    sheet.appendRow([id,browser,new Date()]);
    rows=sheet.getRange(2,1,sheet.getLastRow()-1,2).getDisplayValues();
    return {added:true,count:rows.filter(row=>row[0]===id).length};
  }finally{lock.releaseLock();}
}

/* リンク診断：重複チェック＋リンク切れチェック（管理者のみ。読み取り専用）。
   診断はリンクを変更・削除しない。死活チェックは GAS（UrlFetchApp）から行う。
   ブラウザーから直接 fetch すると CORS でブロックされるため、サーバー側で行う。
   1回の呼び出しは 8 URL ずつ処理する（管理画面は 15 秒の応答制限があるため、
   フロントエンドが offset を進めながら繰り返し呼ぶ）。 */
const DIAGNOSIS_BATCH_SIZE = 8;
const DIAGNOSIS_TRACKING_PARAMS = ['fbclid', 'gclid', 'gbraid', 'wbraid', 'igshid', 'msclkid', 'yclid', 'dclid', '_ga', '_gl', 'mc_cid', 'mc_eid', 'vero_id', 'fb_action_ids', 'fb_source', 'twclid', 'li_fat_id', 'srsltid'];
const DIAGNOSIS_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * 比較用の URL 正規化。normalizeUrl_ より強い正規化で、実質同じリンクを同一とみなす。
 * - ホスト小文字化、www. 除去、既定ポート（:80 / :443）除去
 * - パス末尾の / 除去、フラグメント除去
 * - utm_* などの追跡パラメーター除去、残りのクエリは並べ替え
 * - スキームは https にそろえる（http/https の違いだけの重複も検出するため）
 * 正規化できない URL は null を返す。
 */
function normalizeUrlForCompare_(value) {
  var url;
  try {
    url = normalizeUrl_(value);
  } catch (_) {
    return null;
  }
  var match = url.match(/^https?:\/\/([^\/:?#]+)(?::(\d+))?([^?#]*)(\?[^#]*)?(#.*)?$/i);
  if (!match) return null;
  var host = match[1].toLowerCase();
  if (host.indexOf('www.') === 0) host = host.slice(4);
  var port = match[2] || '';
  if (port === '80' || port === '443') port = '';
  var path = match[3] || '';
  if (path.length > 1 && path.slice(-1) === '/') path = path.slice(0, -1);
  if (path === '/') path = '';
  var query = '';
  if (match[4]) {
    var kept = match[4].slice(1).split('&').filter(function(part) {
      if (!part) return false;
      var name = part.split('=')[0].toLowerCase();
      return name.indexOf('utm_') !== 0 && DIAGNOSIS_TRACKING_PARAMS.indexOf(name) === -1;
    });
    kept.sort();
    if (kept.length) query = '?' + kept.join('&');
  }
  return 'https://' + host + (port ? ':' + port : '') + path + query;
}

/**
 * 重複グループを返す。同じ正規化 URL を持つリンクが 2 件以上ある組だけを返す。
 * 件数の多い組から並べる。
 */
function diagnoseDuplicates_(links) {
  var groups = {};
  var order = [];
  links.forEach(function(link) {
    var key = normalizeUrlForCompare_(link.url);
    if (!key) return;
    if (!groups[key]) {
      groups[key] = {key: key, url: link.url, links: []};
      order.push(key);
    }
    groups[key].links.push({id: link.id, title: link.title, category: link.category, createdAt: link.createdAt, url: link.url});
  });
  return order.map(function(key) { return groups[key]; })
    .filter(function(group) { return group.links.length > 1; })
    .sort(function(a, b) {
      return b.links.length - a.links.length || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    });
}

function checkOneUrlResult_(response) {
  var code = response.getResponseCode();
  if (code >= 200 && code < 400) return {status: 'ok', code: code, reason: ''};
  if (code === 403) return {status: 'unknown', code: code, reason: 'アクセスが拒否されました（403）。ボット対策の可能性があります。'};
  if (code >= 400) return {status: 'dead', code: code, reason: 'HTTP ' + code + ' が返されました。'};
  return {status: 'unknown', code: code, reason: 'HTTP ' + code + ' が返されました。'};
}

/**
 * 複数 URL の死活を並行確認する。fetchAll が1件の失敗で全体を投げた場合は
 * 1件ずつ確認し直す（1件の失敗でバッチ全体を落とさない）。
 * UrlFetchApp にリクエスト単位のタイムアウト指定はないため、バッチを小さくして
 * 1回の呼び出し時間を抑えている。
 */
function checkBatchUrls_(urls) {
  var results = {};
  var requests = urls.map(function(url) {
    return {url: url, muteHttpExceptions: true, followRedirects: true, headers: {'User-Agent': DIAGNOSIS_USER_AGENT}};
  });
  try {
    var responses = UrlFetchApp.fetchAll(requests);
    responses.forEach(function(response, i) {
      if (!response) {
        results[urls[i]] = {status: 'unknown', code: 0, reason: '応答がありませんでした。'};
        return;
      }
      results[urls[i]] = checkOneUrlResult_(response);
    });
  } catch (e) {
    urls.forEach(function(url) {
      if (results[url]) return;
      try {
        var response = UrlFetchApp.fetch(url, {muteHttpExceptions: true, followRedirects: true, headers: {'User-Agent': DIAGNOSIS_USER_AGENT}});
        results[url] = checkOneUrlResult_(response);
      } catch (err) {
        results[url] = {status: 'unknown', code: 0, reason: String(err && err.message ? err.message : err)};
      }
    });
  }
  return results;
}

/**
 * リンク診断を1バッチ分実行する（管理者のみ）。
 * offset は重複を除いた URL 一覧の中の開始位置。フロントエンドが done になるまで
 * offset を進めながら繰り返し呼ぶ。
 * 戻り値：{totalLinks, totalUrls, checked, nextOffset(-1 なら完了), done, duplicates, results}
 * results の1件：{url, status('ok'|'dead'|'unknown'), code, reason, linkIds}
 * - ok: 2xx、またはリダイレクト後の 3xx
 * - dead: 4xx / 5xx
 * - unknown: タイムアウト・取得失敗・403 など。切れているとは断定しない。
 * 診断は読み取り専用で、リンクの追加・変更・削除はしない。
 */
function diagnoseLinks(offset, adminToken) {
  requireAdmin_(adminToken);
  var start = Math.max(0, parseInt(offset, 10) || 0);
  var links = readLinksForDisplay_().links;
  var duplicates = diagnoseDuplicates_(links);
  // URL ごとに1件にまとめる（重複リンクは同じ URL を1回だけ確認する）。
  var targets = [];
  var seen = {};
  links.forEach(function(link) {
    var key = normalizeUrlForCompare_(link.url);
    if (!key) {
      targets.push({key: 'INVALID:' + link.id, url: link.url, linkIds: [link.id], invalid: true});
      return;
    }
    if (seen[key]) {
      seen[key].linkIds.push(link.id);
      return;
    }
    var target = {key: key, url: link.url, linkIds: [link.id], invalid: false};
    seen[key] = target;
    targets.push(target);
  });
  var batch = targets.slice(start, start + DIAGNOSIS_BATCH_SIZE);
  var fetchUrls = batch.filter(function(target) { return !target.invalid; }).map(function(target) { return target.url; });
  var checked = fetchUrls.length ? checkBatchUrls_(fetchUrls) : {};
  var results = batch.map(function(target) {
    if (target.invalid) {
      return {url: target.url, status: 'unknown', code: 0, reason: 'URLの形式が正しくありません。', linkIds: target.linkIds};
    }
    var check = checked[target.url] || {status: 'unknown', code: 0, reason: '確認できませんでした。'};
    return {url: target.url, status: check.status, code: check.code, reason: check.reason, linkIds: target.linkIds};
  });
  var nextOffset = start + batch.length;
  return {
    totalLinks: links.length,
    totalUrls: targets.length,
    checked: nextOffset,
    nextOffset: nextOffset >= targets.length ? -1 : nextOffset,
    done: nextOffset >= targets.length,
    duplicates: duplicates,
    results: results
  };
}

function countOnlineStaffBrowsers_(browserId) {
  if (!validStaffBrowserId_(browserId)) return null;
  const cache = CacheService.getScriptCache();
  const key = 'LINK_CORE_STAFF_ONLINE_' + sessionGeneration_();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(300)) return null;
  try {
    const now = Date.now();
    const online = JSON.parse(cache.get(key) || '{}');
    Object.keys(online).forEach(id => {
      if (online[id] <= now) delete online[id];
    });
    online[browserId] = now + 45000;
    cache.put(key, JSON.stringify(online), 45);
    return Object.keys(online).length;
  } finally {
    lock.releaseLock();
  }
}

/* 個人宛ての公開用コード（サブブラウザ連携IDそのものは公開しない）。 */
const STAFF_CHAT_MEMBER_PREFIX = 'LINK_CORE_STAFF_MAILBOX_';
function staffChatMailboxId_(browserId) {
  if (!validStaffBrowserId_(browserId)) return '';
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, browserId, Utilities.Charset.UTF_8);
  return 'mbx-' + bytes.map(byte => (byte & 255).toString(16).padStart(2, '0')).join('');
}
function staffChatMemberDirectory_(browserId, nickname, properties) {
  const self = staffChatMailboxId_(browserId);
  if (self && properties.getProperty(STAFF_CHAT_MEMBER_PREFIX + self) === null) {
    properties.setProperty(STAFF_CHAT_MEMBER_PREFIX + self, nickname || '管理者');
  }
  const values = properties.getProperties();
  const members = Object.keys(values)
    .filter(key => key.indexOf(STAFF_CHAT_MEMBER_PREFIX) === 0)
    .map(key => ({
      mailboxId: key.slice(STAFF_CHAT_MEMBER_PREFIX.length),
      name: String(values[key] || '管理者').slice(0, 24)
    }))
    .filter(member => /^mbx-[0-9a-f]{64}$/.test(member.mailboxId) && member.mailboxId !== self);
  members.sort((a, b) => a.name.localeCompare(b.name, 'ja') || a.mailboxId.localeCompare(b.mailboxId));
  return {self, members: members.slice(0, 200)};
}
function staffChatPrivateRecipient_(recipientId, browserId) {
  const recipient = typeof recipientId === 'string' ? recipientId.trim().toLowerCase() : '';
  if (!recipient) return '';
  if (!/^mbx-[0-9a-f]{64}$/.test(recipient)) throw new Error('個人宛ての宛先コードを確認してください。');
  const self = staffChatMailboxId_(browserId);
  if (!self) throw new Error('送信元の連携IDが正しくありません。');
  if (recipient === self) throw new Error('自分自身を個人宛てに指定できません。');
  if (PropertiesService.getScriptProperties().getProperty(STAFF_CHAT_MEMBER_PREFIX + recipient) === null) {
    throw new Error('宛先の管理者が見つかりません。相手に一度管理者チャットを開いてもらってください。');
  }
  return recipient;
}
function staffChatCanView_(row, browserId) {
  const recipient = String(row[10] || '');
  return !recipient || (!!validStaffBrowserId_(browserId) &&
    (row[3] === browserId || recipient === staffChatMailboxId_(browserId)));
}

function staffChatConversationList_(sheet, last, browserId, mailbox, properties) {
  if (!mailbox || last < 2 || sheet.getMaxColumns() < 11) return [];
  const authors = sheet.getRange(2, 4, last - 1, 1).getValues();
  const recipients = sheet.getRange(2, 11, last - 1, 1).getValues();
  const conversations = new Map();
  const mailboxes = new Map();
  for (let i = recipients.length - 1; i >= 0; i--) {
    const recipient = recipients[i][0];
    const author = authors[i][0];
    if (!recipient || (author !== browserId && recipient !== mailbox)) continue;
    if (!mailboxes.has(author)) mailboxes.set(author, staffChatMailboxId_(author));
    const peer = author === browserId ? recipient : mailboxes.get(author);
    if (!peer || peer === mailbox || conversations.has(peer)) continue;
    conversations.set(peer, {
      mailboxId: peer,
      name: properties.getProperty(STAFF_CHAT_MEMBER_PREFIX + peer) || '管理者'
    });
  }
  return Array.from(conversations.values());
}

/**
 * 管理者専用チャット。通常は従来互換の直近200件取得。
 * {limit:20} で新着20件だけ、{beforeRow:N,limit:180} で古い投稿を追加取得。
 * {room:''} は全体トーク、{room:宛先コード} はその相手との個別トーク。
 * {mode:'conversations'} は送受信履歴のある相手の一覧を返す。
 * {mode:'summary'} とトーク一覧は本文を読まず、直近200行の未読件数も返す。
 */
function getStaffChatMessages(adminToken, browserId, pageOptions) {
  requireAdmin_(adminToken);
  const opts = pageOptions && typeof pageOptions === 'object' && !Array.isArray(pageOptions)
    ? pageOptions : {};
  const summaryOnly = opts.mode === 'summary' || opts.mode === 'conversations';
  const roomScoped = Object.prototype.hasOwnProperty.call(opts, 'room');
  const room = opts.room;
  if (roomScoped && room !== '' && (typeof room !== 'string' || !/^mbx-[0-9a-f]{64}$/.test(room))) {
    throw new Error('トーク相手を確認できません。');
  }
  const browserValid = validStaffBrowserId_(browserId);
  const mailbox = browserValid ? staffChatMailboxId_(browserId) : '';
  if (roomScoped && room && (!mailbox || room === mailbox)) throw new Error('トーク相手を確認できません。');
  const olderPage = Number.isSafeInteger(opts.beforeRow) && opts.beforeRow >= 2;
  const limit = Number.isSafeInteger(opts.limit)
    ? Math.max(1, Math.min(CHAT_MAX_MESSAGES, opts.limit)) : CHAT_MAX_MESSAGES;
  // 古いページを取得するときはオンライン状況や管理者一覧を毎回再計算しない。
  const onlineCount = olderPage ? null : countOnlineStaffBrowsers_(browserId);
  const properties = PropertiesService.getScriptProperties();
  const nickname = olderPage ? '' :
    (validStaffBrowserId_(browserId) ? (properties.getProperty('LINK_CORE_STAFF_NAME_' + browserId) || '') : '');
  const directory = olderPage ? {self:'', members:[]} :
    staffChatMemberDirectory_(browserId, nickname, properties);
  const metadata = olderPage ? {} : {
    onlineCount, nickname, mailboxId: directory.self, members: directory.members
  };
  if (supabaseChatMode_() === 'supabase') return supabaseStaffChatMessages_(opts, mailbox, metadata, limit);
  const sheet = staffChatSheet_(false);
  const last = sheet ? sheet.getLastRow() : 0;
  if (opts.mode === 'conversations') {
    metadata.conversations = staffChatConversationList_(sheet, last, browserId, mailbox, properties);
  }
  if (roomScoped) metadata.room = room;
  if (last < 2) return Object.assign({messages:[], nextCursor:null, unreadCount:0},metadata);
  const first = roomScoped ? 2 : Math.max(2, last - CHAT_MAX_MESSAGES + 1);
  if (summaryOnly) {
    // 本文・添付を読み取らない軽量モード。既読数はこれまでと同じ直近200件。
    const count = last - first + 1;
    const identities = sheet.getRange(first, 4, count, 2).getValues();
    const recipients = sheet.getMaxColumns() >= 11
      ? sheet.getRange(first, 11, count, 1).getValues()
      : Array.from({length:count}, () => ['']);
    let unreadCount = 0;
    for (let i = 0; i < identities.length; i++) {
      const author = String(identities[i][0] || '');
      const readers = String(identities[i][1] || '').split(',').filter(Boolean);
      const recipient = String(recipients[i][0] || '');
      const canView = !recipient || (browserValid && (author === browserId || recipient === mailbox));
      if (canView && browserValid && author !== browserId && !readers.includes(browserId)) unreadCount++;
    }
    return Object.assign({messages:[], nextCursor:null, unreadCount},metadata);
  }

  let cursor = olderPage ? Math.min(last, opts.beforeRow) : last;
  if (cursor < first) return Object.assign({messages:[],nextCursor:null}, metadata);
  const messages = [];
  const names = Object.create(null);
  function nicknameFor(id) {
    if (!validStaffBrowserId_(id)) return '';
    if (names[id] === undefined) names[id] = properties.getProperty('LINK_CORE_STAFF_NAME_' + id) || '';
    return names[id];
  }
  // ページ単位で読み取り。個人宛て非公開投稿は件数に含めず、
  // 見られる投稿を新着順で最大limit件集める。
  while (cursor >= first && messages.length < limit) {
    const start = Math.max(first, cursor - (roomScoped ? CHAT_MAX_MESSAGES : 40) + 1);
    const rows = sheet.getRange(start, 1, cursor - start + 1, Math.min(11, sheet.getMaxColumns())).getValues();
    let finished = false;
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      const recipient = String(row[10] || '');
      const own = browserValid && row[3] === browserId;
      if (!row[0] || (recipient && !own && recipient !== mailbox)) continue;
      if (roomScoped) {
        const peer = recipient ? (own ? recipient : staffChatMailboxId_(row[3])) : '';
        if (peer !== room) continue;
      }
      const readers = String(row[4] || '').split(',').filter(Boolean);
      messages.push({
        id: String(row[0]), author: nicknameFor(row[3]) || '管理者',
        message: String(row[1]), createdAt: toIso_(row[2]), own,
        readCount: readers.length, unread: !!browserId && !own && !readers.includes(browserId),
        private: !!recipient,
        recipientName: recipient ? (properties.getProperty(STAFF_CHAT_MEMBER_PREFIX + recipient) || '管理者') : '',
        attachment: row[5] ? {
          name: String(row[6] || 'attachment'), mime: String(row[7] || ''), size: Number(row[8] || 0)
        } : null
      });
      if (messages.length >= limit) {
        cursor = start + i - 1;
        finished = true;
        break;
      }
    }
    if (!finished) cursor = start - 1;
  }
  // 従来どおり画面の表示順は古い→新しい。
  messages.reverse();
  return Object.assign({messages, nextCursor: cursor >= first ? cursor : null},metadata);
}

function markStaffChatRead(ids, browserId, adminToken) {
  requireAdmin_(adminToken);
  if (!validStaffBrowserId_(browserId) || !Array.isArray(ids) || ids.length > CHAT_MAX_MESSAGES) {
    throw new Error('既読にするメッセージを確認できません。');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    requireAdmin_(adminToken);
    requireChatWritable_();
    if (supabaseChatMode_() === 'supabase') {
      const messageIds = ids.filter(id => typeof id === 'string' && id.length > 0 && id.length <= 200);
      if (messageIds.length) supabaseChatRequest_('post', 'rpc/link_core_chat_staff_read',
        {message_ids:messageIds, mailbox:staffChatMailboxId_(browserId)});
      return {ok:true};
    }
    const sheet = staffChatSheet_(false);
    const last = sheet ? sheet.getLastRow() : 0;
    if (last < 2) return {ok: true};
    const wanted = new Set(ids);
    const mailbox = staffChatMailboxId_(browserId);
    for (let end = last; end >= 2 && wanted.size;) {
      const start = Math.max(2, end - CHAT_MAX_MESSAGES + 1);
      const rows = sheet.getRange(start, 1, end - start + 1, Math.min(11, sheet.getMaxColumns())).getValues();
      let changes = [];
      let changeStart = 0;
      rows.forEach((row, index) => {
        const value = String(row[4] || '');
        const recipient = String(row[10] || '');
        const readers = value.split(',').filter(Boolean);
        if (wanted.delete(String(row[0])) && row[3] !== browserId &&
            (!recipient || recipient === mailbox) && !readers.includes(browserId) && value.length < 45000) {
          if (!changes.length) changeStart = start + index;
          changes.push([readers.concat(browserId).join(',')]);
        } else if (changes.length) {
          sheet.getRange(changeStart, 5, changes.length, 1).setValues(changes);
          changes = [];
        }
      });
      if (changes.length) sheet.getRange(changeStart, 5, changes.length, 1).setValues(changes);
      end = start - 1;
    }
    return {ok: true};
  } finally {
    lock.releaseLock();
  }
}

function validStaffBrowserId_(id) {
  return typeof id === 'string' && /^staff-[0-9a-f]{32}$/.test(id);
}

function sendStaffChatMessage(message, adminToken, browserId, recipientId) {
  requireAdmin_(adminToken);
  const body = cleanText_(message, CHAT_MAX_LENGTH);
  if (!body) throw new Error('メッセージを入力してください。');
  const recipient = staffChatPrivateRecipient_(recipientId, browserId);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    requireAdmin_(adminToken);
    requireChatWritable_();
    if (supabaseChatMode_() === 'supabase') {
      supabaseChatInsert_('staff', {body, sender:staffChatMailboxId_(browserId), recipient});
      return {ok:true};
    }
    staffChatSheet_(true).appendRow([
      Utilities.getUuid(), safeCell_(body), new Date(), validStaffBrowserId_(browserId) ? browserId : '', '',
      '', '', '', '', '', recipient
    ]);
    return {ok: true};
  } finally {
    lock.releaseLock();
  }
}

/* ===== 管理者専用チャット：非公開Drive添付 ===== */
const STAFF_ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024;
const STAFF_ATTACHMENT_FOLDER_PROPERTY = 'LINK_CORE_STAFF_ATTACHMENTS_FOLDER_ID';
const STAFF_ATTACHMENT_MIME = Object.freeze({
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
});

function staffAttachmentFolder_() {
  const props = PropertiesService.getScriptProperties();
  const savedId = props.getProperty(STAFF_ATTACHMENT_FOLDER_PROPERTY);
  if (savedId) return DriveApp.getFolderById(savedId);
  const folder = DriveApp.createFolder('LINK CORE - Private Staff Chat Attachments');
  props.setProperty(STAFF_ATTACHMENT_FOLDER_PROPERTY, folder.getId());
  return folder;
}

function staffAttachmentFileIsInFolder_(file) {
  const id = PropertiesService.getScriptProperties().getProperty(STAFF_ATTACHMENT_FOLDER_PROPERTY);
  if (!id) return false;
  const parents = file.getParents();
  while (parents.hasNext()) if (parents.next().getId() === id) return true;
  return false;
}

function validateStaffAttachment_(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('添付データが不正です。');
  const filename = String(payload.name || '').replace(/[\\/]/g, '_').replace(/[\x00-\x1f\x7f]/g, '').trim();
  if (!filename || filename.length > 150 || filename.charAt(0) === '.') throw new Error('ファイル名を確認してください（150文字以内）。');
  const ext = filename.includes('.') ? filename.split('.').pop().toLowerCase() : '';
  const mime = STAFF_ATTACHMENT_MIME[ext];
  if (!mime) throw new Error('このファイル形式は添付できません。');
  const incomingMime = String(payload.mime || '').toLowerCase();
  if (incomingMime && incomingMime !== mime && !(ext === 'csv' && incomingMime === 'application/vnd.ms-excel')) {
    throw new Error('ファイルの拡張子と形式が一致しません。');
  }
  const expectedSize = Number(payload.size);
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 1 || expectedSize > STAFF_ATTACHMENT_MAX_BYTES) {
    throw new Error('添付ファイルの容量は2MB以内にしてください。');
  }
  const encoded = payload.base64;
  if (typeof encoded !== 'string' || encoded.length > Math.ceil(STAFF_ATTACHMENT_MAX_BYTES / 3) * 4 + 4 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('添付データの形式が不正です。');
  const bytes = Utilities.base64Decode(encoded);
  if (bytes.length !== expectedSize) throw new Error('ファイルサイズが一致しません。');
  const b = index => bytes[index] & 255;
  const ascii = (start, length) => bytes.slice(start, start + length).map(x => String.fromCharCode(x & 255)).join('');
  if (ext === 'pdf' && ascii(0, 5) !== '%PDF-') throw new Error('PDFの内容を確認してください。');
  if (ext === 'png' && (bytes.length < 8 || [137,80,78,71,13,10,26,10].some((n,i) => b(i) !== n))) throw new Error('PNGの内容を確認してください。');
  if ((ext === 'jpg' || ext === 'jpeg') && (bytes.length < 3 || b(0) !== 255 || b(1) !== 216 || b(2) !== 255)) throw new Error('JPEGの内容を確認してください。');
  if (ext === 'gif' && ascii(0, 4) !== 'GIF8') throw new Error('GIFの内容を確認してください。');
  if (ext === 'webp' && (ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WEBP')) throw new Error('WebPの内容を確認してください。');
  if (['docx','xlsx','pptx'].includes(ext) && !(b(0) === 80 && b(1) === 75)) throw new Error('Officeファイルの内容を確認してください。');
  return {filename, mime, bytes, size: expectedSize};
}

/** 投稿とファイルを1回の呼び出しで作成。requestIdでタイムアウト後の再送を冪等化。 */
function sendStaffChatAttachment(message, payload, requestId, browserId, recipientOrToken, adminToken) {
  // 古い画面からの5引数呼び出しは全員宛てとして扱う。
  if (adminToken === undefined) { adminToken = recipientOrToken; recipientOrToken = ''; }
  requireAdmin_(adminToken);
  if (!validStaffBrowserId_(browserId)) throw new Error('送信元ブラウザを確認できません。');
  if (typeof requestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(requestId)) throw new Error('送信IDが不正です。');
  const body = cleanText_(message, CHAT_MAX_LENGTH);
  const recipient = staffChatPrivateRecipient_(recipientOrToken, browserId);
  const attachment = validateStaffAttachment_(payload);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  let uploaded = null;
  try {
    requireAdmin_(adminToken);
    requireChatWritable_();
    if (supabaseChatMode_() === 'supabase') {
      const sender = staffChatMailboxId_(browserId);
      const [existing] = supabaseChatRows_({kind:'eq.staff', request_id:'eq.'+requestId, select:'sender,recipient', limit:1});
      if (existing) {
        if (existing.sender !== sender || existing.recipient !== recipient) throw new Error('送信IDが重複しています。');
        return {ok:true, duplicate:true};
      }
      uploaded = staffAttachmentFolder_().createFile(Utilities.newBlob(attachment.bytes, attachment.mime, attachment.filename));
      supabaseChatInsert_('staff', {body, sender, recipient, file_id:uploaded.getId(), file_name:attachment.filename,
        file_mime:attachment.mime, file_size:attachment.size, request_id:requestId});
      return {ok:true};
    }
    const sheet = staffChatSheet_(true);
    const last = sheet.getLastRow();
    if (last >= 2) {
      const ids = sheet.getRange(2, 10, last - 1, 1).getDisplayValues();
      if (ids.some(row => row[0] === requestId)) return {ok: true, duplicate: true};
    }
    const folder = staffAttachmentFolder_();
    const blob = Utilities.newBlob(attachment.bytes, attachment.mime, attachment.filename);
    uploaded = folder.createFile(blob);
    sheet.appendRow([
      Utilities.getUuid(), safeCell_(body), new Date(), browserId, '',
      uploaded.getId(), safeCell_(attachment.filename), attachment.mime, attachment.size, requestId, recipient
    ]);
    return {ok: true};
  } catch (error) {
    if (uploaded) {
      try { uploaded.setTrashed(true); } catch (cleanupError) { console.error('添付の後始末に失敗:', cleanupError); }
    }
    throw error;
  } finally {
    lock.releaseLock();
  }
}

/** Drive共有URLは渡さず、認証済み管理者に該当投稿のデータのみ返す。 */
function getStaffChatAttachment(messageId, browserOrToken, adminToken) {
  // 古い画面は全員宛て添付だけ利用可。個人宛て添付はブラウザIDの照合必須。
  const browserId = adminToken === undefined ? '' : browserOrToken;
  if (adminToken === undefined) adminToken = browserOrToken;
  requireAdmin_(adminToken);
  if (typeof messageId !== 'string' || !/^[0-9a-f-]{36}$/i.test(messageId)) throw new Error('投稿IDが不正です。');
  let row;
  if (supabaseChatMode_() === 'supabase') {
    const [message] = supabaseChatRows_({kind:'eq.staff', id:supabaseChatIdFilter_(messageId),
      or:supabaseStaffAccess_(staffChatMailboxId_(browserId)), select:'file_id,file_name,file_mime,file_size', limit:1});
    if (message?.file_id) row = [,,,,,message.file_id,message.file_name,message.file_mime,message.file_size];
  } else {
    const sheet = staffChatSheet_(false);
    const last = sheet ? sheet.getLastRow() : 0;
    if (last >= 2) {
      const rows = sheet.getRange(2, 1, last - 1, Math.min(11, sheet.getMaxColumns())).getValues();
      const message = rows.find(item => String(item[0]) === messageId);
      if (message && staffChatCanView_(message, browserId)) row = message;
    }
  }
  if (!row || !row[5]) throw new Error('添付ファイルは見つかりませんでした。');
  const file = DriveApp.getFileById(String(row[5]));
  if (!staffAttachmentFileIsInFolder_(file) || file.isTrashed()) throw new Error('添付ファイルを取得できません。');
  if (file.getSize() > STAFF_ATTACHMENT_MAX_BYTES) throw new Error('添付ファイルが容量上限を超えています。');
  const blob = file.getBlob();
  return {
    name: String(row[6] || 'attachment'),
    mime: String(row[7] || 'application/octet-stream'),
    size: file.getSize(),
    base64: Utilities.base64Encode(blob.getBytes())
  };
}

function deleteStaffChatMessage(id, browserId, adminToken) {
  requireAdmin_(adminToken);
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id) || !validStaffBrowserId_(browserId)) {
    throw new Error('投稿を確認できません。');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    requireAdmin_(adminToken);
    requireChatWritable_();
    if (supabaseChatMode_() === 'supabase') {
      const [row] = supabaseChatRows_({kind:'eq.staff', id:supabaseChatIdFilter_(id), select:'sender,file_id', limit:1});
      if (!row) return {ok:true};
      if (row.sender !== staffChatMailboxId_(browserId)) throw new Error('自分の投稿のみ削除できます。');
      supabaseChatDelete_('staff', id);
      trashStaffChatFile_(row.file_id);
      return {ok:true};
    }
    const sheet = staffChatSheet_(false);
    const last = sheet ? sheet.getLastRow() : 0;
    if (last < 2) return {ok: true};
    const match = sheet.getRange(2, 1, last - 1, 1).createTextFinder(id).matchEntireCell(true).findNext();
    if (!match) return {ok: true};
    const row = match.getRow();
    const [author, , fileId] = sheet.getRange(row, 4, 1, 3).getValues()[0];
    if (author !== browserId) throw new Error('自分の投稿のみ削除できます。');
    const attachmentId = String(fileId || '');
    sheet.deleteRow(row);
    trashStaffChatFile_(attachmentId);
    return {ok: true};
  } finally {
    lock.releaseLock();
  }
}

function trashStaffChatFile_(attachmentId) {
  if (!attachmentId) return;
  try {
    const file = DriveApp.getFileById(attachmentId);
    if (staffAttachmentFileIsInFolder_(file)) file.setTrashed(true);
  } catch (error) {
    console.error('投稿削除後のDrive添付削除に失敗:', error);
  }
}

function staffChatSheet_(create) {
  const id = PropertiesService.getScriptProperties().getProperty(SPREADSHEET_PROPERTY);
  if (!id) throw new Error('スプレッドシートIDが未設定です。');
  const spreadsheet = SpreadsheetApp.openById(id);
  let sheet = spreadsheet.getSheetByName('AdminChatMessages');
  if (!sheet && create) sheet = spreadsheet.insertSheet('AdminChatMessages');
  if (create && sheet.getLastRow() === 0) sheet.appendRow(['ID', 'メッセージ', '送信日時', '送信元ブラウザ', '既読ブラウザ']);
  if (create && sheet.getLastColumn() === 3) sheet.getRange(1, 4, 1, 2).setValues([['送信元ブラウザ', '既読ブラウザ']]);
  if (create && sheet.getLastColumn() < 10) {
    sheet.getRange(1, 6, 1, 5).setValues([['添付DriveID', '添付ファイル名', '添付MIME', '添付サイズ', '添付送信ID']]);
  }
  if (create && sheet.getLastColumn() < 11) {
    if (sheet.getMaxColumns() < 11) sheet.insertColumnsAfter(sheet.getMaxColumns(), 11 - sheet.getMaxColumns());
    sheet.getRange(1, 11).setValue('個人宛先メールボックス');
  }
  return sheet;
}

function recordLinkOperation_(linksSheet, action, id, title) {
  try {
    const spreadsheet = linksSheet.getParent();
    const sheet = spreadsheet.getSheetByName('LinkOperationLogs') || spreadsheet.insertSheet('LinkOperationLogs');
    if (!sheet.getLastRow()) sheet.appendRow(['日時', '操作', 'リンクID', 'リンク名']);
    sheet.appendRow([new Date(), action, safeCell_(String(id)), safeCell_(String(title || ''))]);
  } catch (error) {
    console.error('リンク操作履歴を保存できませんでした。', error.message);
  }
}

function getLinkOperationLogs(adminToken) {
  requireAdmin_(adminToken);
  const id = PropertiesService.getScriptProperties().getProperty(SPREADSHEET_PROPERTY);
  if (!id) throw new Error('スプレッドシートIDが未設定です。');
  const sheet = SpreadsheetApp.openById(id).getSheetByName('LinkOperationLogs');
  const last = sheet ? sheet.getLastRow() : 0;
  if (last < 2) return {logs: []};
  const first = Math.max(2, last - 199);
  const logs = sheet.getRange(first, 1, last - first + 1, 4).getValues().reverse()
    .map(([date, action, linkId, title]) => ({
      date: toIso_(date), action: String(action), linkId: String(linkId), title: String(title)
    }));
  return {logs};
}

/* ===== 利用者来客数：日本時間の日別ユニークブラウザ =====
 * 既存のVisitorLoginLogsとは独立したVisitorCounterVisitsシート。
 * 1行 = 1ブラウザ・1日。複数回のログインや再読み込みで重複しない。
 * ブラウザIDはスクリプト固有saltによるHMAC-SHA256のみ保存し、生IDは記録しない。
 * この統計は導入後の訪問が対象で、過去ログの削除や編集で変化しない。
 */
const VISITOR_COUNTER_SHEET = 'VisitorCounterVisits';
const VISITOR_COUNTER_SALT_PROPERTY = 'LINK_CORE_VISITOR_COUNT_SALT';
const VISITOR_COUNTER_TIMEZONE = 'Asia/Tokyo';
// 2026年11月13日以前はカウントしない（11月14日から集計）。
const VISITOR_COUNTER_MIN_DATE = '2026-11-14';

function visitorCounterToday_() {
  return Utilities.formatDate(new Date(), VISITOR_COUNTER_TIMEZONE, 'yyyy-MM-dd');
}
function visitorCounterDateKey_(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return Utilities.formatDate(value, VISITOR_COUNTER_TIMEZONE, 'yyyy-MM-dd');
  }
  const day = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : '';
}
function visitorCounterSheet_(create) {
  const id = PropertiesService.getScriptProperties().getProperty(SPREADSHEET_PROPERTY);
  if (!id) throw new Error('スプレッドシートIDが未設定です。');
  const ss = SpreadsheetApp.openById(id);
  let sheet = ss.getSheetByName(VISITOR_COUNTER_SHEET);
  if (!sheet && create) {
    sheet = ss.insertSheet(VISITOR_COUNTER_SHEET);
    // yyyy-MM-ddがスプレッドシートのタイムゾーンで日付に変換されないよう文字列形式で保存。
    sheet.getRange(1, 1, sheet.getMaxRows(), 1).setNumberFormat('@');
  }
  if (sheet && create && sheet.getLastRow() === 0) {
    sheet.appendRow(['日付（JST）', 'ブラウザ識別子（ハッシュ）', '当日の初回来客日時']);
  }
  return sheet;
}
function visitorCounterSalt_() {
  const props = PropertiesService.getScriptProperties();
  let salt = props.getProperty(VISITOR_COUNTER_SALT_PROPERTY);
  if (!salt) {
    salt = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty(VISITOR_COUNTER_SALT_PROPERTY, salt);
  }
  return salt;
}
function visitorCounterDigest_(browserId, salt) {
  return Utilities.computeHmacSha256Signature(browserId, salt)
    .map(byte => (byte & 255).toString(16).padStart(2, '0')).join('');
}
function recordVisitorCounter_(browserId) {
  // 有効な識別子がない場合に仮のIDでカウントを増やさない。
  if (typeof browserId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(browserId)) return;
  const lock = LockService.getScriptLock();
  let acquired = false;
  try {
    lock.waitLock(10000);
    acquired = true;
    const digest = visitorCounterDigest_(browserId, visitorCounterSalt_());
    const day = visitorCounterToday_();
    if (day < VISITOR_COUNTER_MIN_DATE) return;
    const sheet = visitorCounterSheet_(true);
    const last = sheet.getLastRow();
    // 過去ログの後日取り込みにより日付が並び順にならないことがある。
    // そのため、直近の日付が違っても探索を打ち切らず、全行で照合する。
    for (let end = last; end >= 2; end -= 400) {
      const start = Math.max(2, end - 399);
      const rows = sheet.getRange(start, 1, end - start + 1, 2).getValues();
      for (let i = rows.length - 1; i >= 0; i--) {
        if (visitorCounterDateKey_(rows[i][0]) === day &&
            String(rows[i][1]) === digest) return;
      }
    }
    sheet.appendRow([day, digest, new Date()]);

  } catch (error) {
    // カウント機能のトラブルで利用者ログインを失敗させない。
    console.error('利用者来客カウンターを記録できませんでした。', error && error.message ? error.message : error);
  } finally {
    if (acquired) lock.releaseLock();
  }
}

/** 過去ログの日時を日本時間の日付に揃える。文字列はシートに表示された日付形式のみ許可。 */
function visitorCounterLegacyDate_(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return Utilities.formatDate(value, VISITOR_COUNTER_TIMEZONE, 'yyyy-MM-dd');
  }
  const match = String(value || '').trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:\s|$)/);
  if (!match) return '';
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return [year, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-');
}

/**
 * 管理者専用：VisitorLoginLogs の指定期間をカウンターに取り込む。
 * 既存記録と同一ブラウザ/同一日はスキップし、何回実行しても結果は増えない。
 * 空欄のIDは来客を特定できないため除外する。生のブラウザIDは移行先に残さない。
 */
function backfillVisitorCounterFromLogs(startDate, endDate, adminToken) {
  requireAdmin_(adminToken);
  if (typeof startDate !== 'string' || typeof endDate !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
      startDate > endDate || startDate < VISITOR_COUNTER_MIN_DATE) {
    throw new Error('来客カウンターには2026年11月14日以降の履歴のみ取り込めます。');
  }
  const firstDay = new Date(startDate + 'T00:00:00Z');
  const lastDay = new Date(endDate + 'T00:00:00Z');
  const span = Math.round((lastDay - firstDay) / 86400000);
  if (!Number.isFinite(span) || span < 0 || span > 31) {
    throw new Error('一度に取り込める期間は32日以内です。');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    requireAdmin_(adminToken);
    const source = visitorLoginLogSheet_();
    if (!source || source.getLastRow() < 2) {
      throw new Error('VisitorLoginLogs に過去のログがありません。');
    }
    const values = source.getRange(2, 1, source.getLastRow() - 1, 2).getValues();
    const target = visitorCounterSheet_(true);
    const existingRows = target.getLastRow();
    const known = new Set();
    if (existingRows >= 2) {
      const existing = target.getRange(2, 1, existingRows - 1, 2).getValues();
      existing.forEach(row => {
        const day = visitorCounterDateKey_(row[0]);
        const digest = String(row[1] || '');
        if (day && digest) known.add(day + ':' + digest);
      });
    }
    const salt = visitorCounterSalt_();
    const pending = [];
    const byDay = Object.create(null);
    let examined = 0, emptyIds = 0, duplicates = 0;
    values.forEach(row => {
      const dateKey = visitorCounterLegacyDate_(row[0]);
      if (!dateKey || dateKey < startDate || dateKey > endDate) return;
      examined++;
      const browserId = String(row[1] || '').trim();
      if (!/^[A-Za-z0-9_-]{8,100}$/.test(browserId)) {
        emptyIds++;
        return;
      }
      const digest = visitorCounterDigest_(browserId, salt);
      const key = dateKey + ':' + digest;
      if (known.has(key)) {
        duplicates++;
        return;
      }
      known.add(key);
      // 元ログの時刻を可能なら保持。文字列だった場合はJSTのその日00:00を使用。
      const firstSeen = row[0] instanceof Date && !Number.isNaN(row[0].getTime())
        ? row[0] : new Date(dateKey + 'T00:00:00+09:00');
      pending.push([dateKey, digest, firstSeen]);
      byDay[dateKey] = (byDay[dateKey] || 0) + 1;
    });
    if (pending.length) {
      const firstRow = target.getLastRow() + 1;
      const requiredRows = firstRow + pending.length - 1;
      if (target.getMaxRows() < requiredRows) {
        target.insertRowsAfter(target.getMaxRows(), requiredRows - target.getMaxRows());
      }
      target.getRange(firstRow, 1, pending.length, 3).setValues(pending);
    }
    return {
      ok: true, startDate, endDate,
      scanned: examined, imported: pending.length,
      skippedMissingId: emptyIds, skippedDuplicate: duplicates,
      importedDays: Object.keys(byDay).sort().map(date => ({date, count: byDay[date]}))
    };
  } finally {
    lock.releaseLock();
  }
}


/**
 * 管理者のみ：来客カウンターの2026-11-13以前の行を物理削除する。
 * VisitorLoginLogs（ログイン履歴）は削除しない。再実行しても安全。
 */
function deleteVisitorCounterBefore20261114(adminToken) {
  requireAdmin_(adminToken);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    requireAdmin_(adminToken);
    const sheet = visitorCounterSheet_(false);
    const last = sheet ? sheet.getLastRow() : 0;
    if (last < 2) return {ok: true, deleted: 0, cutoff: VISITOR_COUNTER_MIN_DATE};
    const days = sheet.getRange(2, 1, last - 1, 1).getValues();
    let endIndex = -1, deleted = 0;
    // 下から連続区間ごとに削除し、残る行番号が変わらないようにする。
    for (let index = days.length - 1; index >= -1; index--) {
      const day = index >= 0 ? visitorCounterDateKey_(days[index][0]) : '';
      const remove = !!day && day < VISITOR_COUNTER_MIN_DATE;
      if (remove) {
        if (endIndex < 0) endIndex = index;
        continue;
      }
      if (endIndex < 0) continue;
      const start = index + 1;
      const count = endIndex - start + 1;
      sheet.deleteRows(start + 2, count);
      deleted += count;
      endIndex = -1;
    }
    return {ok: true, deleted: deleted, cutoff: VISITOR_COUNTER_MIN_DATE};
  } finally {
    lock.releaseLock();
  }
}

/** 利用者には当日と累計、管理者には日付別履歴も返す。 */
function getVisitorCounterStats(viewerToken) {
  requireLinkViewer_(viewerToken);
  const today = visitorCounterToday_();
  const sheet = visitorCounterSheet_(false);
  const last = sheet ? sheet.getLastRow() : 0;
  const counts = Object.create(null);
  let total = 0;
  if (last >= 2) {
    const values = sheet.getRange(2, 1, last - 1, 1).getValues();
    values.forEach(row => {
      const day = visitorCounterDateKey_(row[0]);
      if (!day || day < VISITOR_COUNTER_MIN_DATE) return;
      counts[day] = (counts[day] || 0) + 1;
      total++;
    });
  }
  const result = {today: counts[today] || 0, total: total, date: today};
  if (isSessionValid_('ADMIN', viewerToken)) {
    // 直近30日については来客0の日も表示する。
    const keys = new Set(Object.keys(counts));
    const [year, month, day] = today.split('-').map(Number);
    for (let offset = 0; offset < 30; offset++) {
      const dateKey = new Date(Date.UTC(year, month - 1, day - offset)).toISOString().slice(0, 10);
      if (dateKey >= VISITOR_COUNTER_MIN_DATE) keys.add(dateKey);
    }
    result.days = Array.from(keys).sort().reverse().slice(0, 1000)
      .map(date => ({date: date, count: counts[date] || 0}));
  }
  return result;
}

function recordVisitorLogin_(browserId) {
  const idForLog = typeof browserId === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(browserId) ? browserId : '';
  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    lock.waitLock(5000);
    locked = true;
    const id = PropertiesService.getScriptProperties().getProperty(SPREADSHEET_PROPERTY);
    const spreadsheet = SpreadsheetApp.openById(id);
    const sheet = spreadsheet.getSheetByName('VisitorLoginLogs') || spreadsheet.insertSheet('VisitorLoginLogs');
    if (!sheet.getLastRow()) sheet.appendRow(['ログイン日時', 'ブラウザID', '履歴ID']);
    else if (sheet.getLastColumn() === 1) sheet.getRange(1, 2).setValue('ブラウザID');
    sheet.appendRow([new Date(), safeCell_(idForLog), Utilities.getUuid()]);
  } catch (error) {
    console.error('利用者ログイン履歴の保存に失敗しました。', error.message);
  } finally {
    if (locked) lock.releaseLock();
  }
}

function getVisitorLoginLogs(adminToken) {
  requireAdmin_(adminToken);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = visitorLoginLogSheet_();
    const last = sheet ? sheet.getLastRow() : 0;
    if (last < 2) return {logs: []};
    const first = Math.max(2, last - 199);
    const rows = sheet.getRange(first, 1, last - first + 1, 3).getValues();
    if (rows.some(row => row[0] && !row[2])) {
      rows.forEach(row => { if (row[0] && !row[2]) row[2] = Utilities.getUuid(); });
      sheet.getRange(first, 3, rows.length, 1).setValues(rows.map(row => [row[2]]));
    }
    if (!sheet.getRange(1, 3).getValue()) sheet.getRange(1, 3).setValue('履歴ID');
    const names = getClickBrowserNames_();
    return {logs: rows.reverse().filter(row => row[0]).map(([date, browserId, id]) => ({
      date: toIso_(date), browserId: String(browserId || ''), id: String(id),
      browserName: names.get(String(browserId || '')) || ''
    }))};
  } finally {
    lock.releaseLock();
  }
}

function visitorLoginLogSheet_() {
  const id = PropertiesService.getScriptProperties().getProperty(SPREADSHEET_PROPERTY);
  return SpreadsheetApp.openById(id).getSheetByName('VisitorLoginLogs');
}

function deleteVisitorLoginLog(id, adminToken) {
  requireAdmin_(adminToken);
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('履歴IDが不正です。');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    requireAdmin_(adminToken);
    const sheet = visitorLoginLogSheet_();
    const last = sheet ? sheet.getLastRow() : 0;
    if (last > 1) {
      const row = sheet.getRange(2, 3, last - 1, 1).getValues().findIndex(value => value[0] === id);
      if (row >= 0) sheet.deleteRow(row + 2);
    }
    return {ok: true};
  } finally {
    lock.releaseLock();
  }
}

function deleteVisitorLoginLogs(adminToken) {
  requireAdmin_(adminToken);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    requireAdmin_(adminToken);
    const sheet = visitorLoginLogSheet_();
    const last = sheet ? sheet.getLastRow() : 0;
    if (last > 1) sheet.deleteRows(2, last - 1);
    return {ok: true};
  } finally {
    lock.releaseLock();
  }
}

function setStaffNickname(browserId, nickname, adminToken) {
  requireAdmin_(adminToken);
  if (!validStaffBrowserId_(browserId)) throw new Error('連携IDが不正です。');
  const name = typeof nickname === 'string' ? nickname.trim() : '';
  if (!name || name.length > 24 || /[\x00-\x1F\x7F]/.test(name)) throw new Error('ニックネームは1〜24文字で入力してください。');
  const props = PropertiesService.getScriptProperties();
  props.setProperty('LINK_CORE_STAFF_NAME_' + browserId, name);
  props.setProperty(STAFF_CHAT_MEMBER_PREFIX + staffChatMailboxId_(browserId), name);
  return {nickname: name};
}

/* Supabase chat storage. Link data, session validation, and Drive attachments remain in GAS. */
function supabaseChatMode_() {
  return PropertiesService.getScriptProperties().getProperty('LINK_CORE_CHAT_BACKEND') || 'sheets';
}

function requireChatWritable_() {
  if (supabaseChatMode_() === 'migrating') throw new Error('チャット履歴の移行中です。完了後に再試行してください。');
}

function supabaseChatConfig_() {
  const props = PropertiesService.getScriptProperties();
  const url = String(props.getProperty('LINK_CORE_SUPABASE_URL') || '').replace(/\/$/, '');
  const credential = props.getProperty('LINK_CORE_SUPABASE_SERVER_KEY');
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url) || !credential) {
    throw new Error('Supabaseの接続設定を確認してください。');
  }
  return {url, credential, props};
}

function supabaseChatRequest_(method, path, payload, preference) {
  const {url, credential} = supabaseChatConfig_();
  const headers = {apikey: credential};
  if (!credential.startsWith('sb_secret_')) headers.Authorization = 'Bearer ' + credential;
  if (preference) headers.Prefer = preference;
  const options = {method, headers, muteHttpExceptions: true};
  if (payload !== undefined) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }
  const response = UrlFetchApp.fetch(url + '/rest/v1/' + path, options);
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) throw new Error('Supabaseチャットへの接続に失敗しました（HTTP ' + status + '）。');
  const text = response.getContentText();
  return text ? JSON.parse(text) : null;
}

function supabaseChatRows_(parameters) {
  const query = Object.keys(parameters).map(key => encodeURIComponent(key) + '=' + encodeURIComponent(parameters[key])).join('&');
  return supabaseChatRequest_('get', 'link_core_chat?' + query);
}

function supabaseChatIdFilter_(id) {
  return 'eq.' + id;
}

function supabaseChatInsert_(kind, fields) {
  supabaseChatRequest_('post', 'link_core_chat', Object.assign({
    kind, id: Utilities.getUuid(), created_at: new Date().toISOString()
  }, fields), 'return=minimal');
}

function supabaseChatDelete_(kind, id) {
  supabaseChatRequest_('delete', 'link_core_chat?kind=eq.' + kind +
    '&id=' + encodeURIComponent(supabaseChatIdFilter_(id)), undefined, 'return=minimal');
}

function supabasePublicMessages_() {
  return supabaseChatRows_({kind:'eq.public', select:'id,author,body,created_at,has_image', order:'seq.desc', limit:CHAT_MAX_MESSAGES})
    .reverse().map(row => ({id:row.id, author:row.author, message:row.body, createdAt:row.created_at, hasScreenshot:!!row.has_image}));
}

function supabaseStaffAccess_(mailbox) {
  return mailbox ? '(is_direct.eq.false,recipient.eq.' + mailbox + ',sender.eq.' + mailbox + ')' : '(is_direct.eq.false)';
}

function supabaseStaffChatMessages_(opts, mailbox, metadata, limit) {
  const roomScoped = Object.prototype.hasOwnProperty.call(opts, 'room');
  const base = {kind:'eq.staff', order:'seq.desc', or:supabaseStaffAccess_(mailbox)};
  const summary = opts.mode === 'summary' || opts.mode === 'conversations';
  if (roomScoped) metadata.room = opts.room;
  if (summary) {
    const rows = supabaseChatRows_(Object.assign({}, base, {select:'sender,readers', limit:CHAT_MAX_MESSAGES}));
    if (opts.mode === 'conversations') {
      const peers = new Map();
      if (mailbox) {
        const props = PropertiesService.getScriptProperties().getProperties();
        for (let offset = 0; ; offset += 500) {
          const page = supabaseChatRows_({kind:'eq.staff', is_direct:'eq.true', or:'(sender.eq.'+mailbox+',recipient.eq.'+mailbox+')', order:'seq.desc', select:'sender,recipient', limit:500, offset});
          page.forEach(row => {
            const peer = row.sender === mailbox ? row.recipient : row.sender;
            if (peer && !peers.has(peer)) peers.set(peer, {mailboxId:peer, name:props[STAFF_CHAT_MEMBER_PREFIX+peer] || '管理者'});
          });
          if (page.length < 500) break;
        }
      }
      metadata.conversations = Array.from(peers.values());
    }
    const unreadCount = mailbox ? rows.filter(row => row.sender !== mailbox && !row.readers.includes(mailbox)).length : 0;
    return Object.assign({messages:[], nextCursor:null, unreadCount}, metadata);
  }
  const query = Object.assign(base, {select:'seq,id,sender,recipient,body,created_at,readers,file_name,file_mime,file_size', limit:limit+1});
  if (roomScoped) {
    if (opts.room) query.or = '(and(sender.eq.' + mailbox + ',recipient.eq.' + opts.room +
      '),and(sender.eq.' + opts.room + ',recipient.eq.' + mailbox + '))';
    else { delete query.or; query.is_direct = 'eq.false'; }
  }
  if (Number.isSafeInteger(opts.beforeRow) && opts.beforeRow >= 2) query.seq = 'lte.' + (opts.beforeRow-1);
  const rows = supabaseChatRows_(query);
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const names = PropertiesService.getScriptProperties().getProperties();
  const messages = page.slice().reverse().map(row => ({
    id:row.id, author:names[STAFF_CHAT_MEMBER_PREFIX+row.sender] || '管理者',
    message:row.body, createdAt:row.created_at, own:!!mailbox && row.sender===mailbox,
    readCount:row.readers.length, unread:!!mailbox && row.sender!==mailbox && !row.readers.includes(mailbox),
    private:!!row.recipient, recipientName:names[STAFF_CHAT_MEMBER_PREFIX+row.recipient] || '管理者',
    attachment:row.file_name ? {name:row.file_name, mime:row.file_mime, size:row.file_size} : null
  }));
  return Object.assign({messages, nextCursor:hasMore ? page[page.length-1].seq : null}, metadata);
}

function getChatRealtimeSession(viewerToken, browserSecret, staffBrowserId) {
  requireLinkViewer_(viewerToken);
  if (supabaseChatMode_() !== 'supabase') return {enabled:false};
  const {url, props} = supabaseChatConfig_();
  const key = props.getProperty('LINK_CORE_SUPABASE_PUBLISHABLE_KEY');
  const signingSecret = props.getProperty('LINK_CORE_SUPABASE_JWT_SECRET');
  if (!key || !signingSecret) throw new Error('Supabase Realtimeの設定を確認してください。');
  const topics = ['lc-chat-public'];
  if (isSessionValid_('ADMIN', viewerToken)) {
    topics.push('lc-chat-direct-admin', 'lc-chat-staff-all');
    const staffMailbox = staffChatMailboxId_(staffBrowserId);
    if (staffMailbox) topics.push('lc-chat-staff-' + staffMailbox);
  } else {
    const inbox = privateChatBrowserId_(browserSecret);
    if (inbox) topics.push('lc-chat-direct-' + inbox);
  }
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 120;
  const encode = value => Utilities.base64EncodeWebSafe(value).replace(/=+$/, '');
  const header = encode(JSON.stringify({alg:'HS256', typ:'JWT'}));
  const claims = encode(JSON.stringify({role:'authenticated', aud:'authenticated', sub:Utilities.getUuid(),
    iat:now, exp, link_core_topics:topics}));
  const body = header + '.' + claims;
  const signature = encode(Utilities.computeHmacSha256Signature(body, signingSecret));
  return {enabled:true, url, key, token:body + '.' + signature, topics, expiresAt:exp*1000};
}

/** Run from the Apps Script editor. Rerun until all three reports say done. */
function migrateChatHistoryToSupabase_() {
  const {props} = supabaseChatConfig_();
  if (supabaseChatMode_() !== 'migrating') throw new Error('LINK_CORE_CHAT_BACKEND を migrating にしてください。');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const report = {};
    for (const [kind, sheet] of [['public', ensureChatSheet_()], ['direct', privateChatSheet_(false)], ['staff', staffChatSheet_(false)]]) {
      const key = 'LINK_CORE_CHAT_MIGRATION_NEXT_' + kind.toUpperCase();
      const first = Math.max(2, Number(props.getProperty(key)) || 2);
      const last = sheet ? sheet.getLastRow() : 0;
      if (first > last) { report[kind] = {done:true, remaining:0}; continue; }
      const count = Math.min(kind === 'public' ? 20 : 100, last-first+1);
      const width = sheet.getLastColumn();
      const rows = sheet.getRange(first, 1, count, width).getValues();
      const headers = kind === 'public' ? sheet.getRange(1, 1, 1, width).getDisplayValues()[0] : [];
      const batch = rows.flatMap((row, offset) => {
        const get = key => row[headers.indexOf(key)];
        const id = kind === 'public' ? get('ID') : row[0];
        if (!id) return [];
        const created = Date.parse(toIso_(kind === 'public' ? get('送信日時') : row[kind === 'staff' ? 2 : 3]));
        if (!Number.isFinite(created)) throw new Error(kind + ' の ' + (first + offset) + ' 行目の日時を確認してください。');
        const entry = {kind, id:String(id), created_at:new Date(created).toISOString()};
        if (kind === 'public') Object.assign(entry, {author:String(get('投稿者') || '利用者'),
          body:String(get('メッセージ') || ''),
          image:CHAT_IMAGE_HEADERS.map((header,i)=>String(get(header)||'').slice(i ? 4 : 0)).join('')});
        else if (kind === 'direct') Object.assign(entry, {recipient:String(row[1] || ''), body:String(row[2] || '')});
        else Object.assign(entry, {
          body:String(row[1] || ''), sender:staffChatMailboxId_(row[3]), recipient:String(row[10] || ''),
          readers:Array.from(new Set(String(row[4] || '').split(',').map(staffChatMailboxId_).filter(Boolean))),
          file_id:String(row[5] || ''), file_name:String(row[6] || ''), file_mime:String(row[7] || ''),
          file_size:Number(row[8]) || 0, request_id:row[9] ? String(row[9]) : null
        });
        return [entry];
      });
      if (batch.length) supabaseChatRequest_('post', 'rpc/link_core_chat_import', {batch});
      props.setProperty(key, String(first + count));
      report[kind] = {done:first+count>last, remaining:last-first-count+1};
    }
    console.log(JSON.stringify(report));
    return report;
  } finally { lock.releaseLock(); }
}

function activateSupabaseChat_() {
  const {props} = supabaseChatConfig_();
  if (supabaseChatMode_() !== 'migrating') throw new Error('まず移行モードで履歴を取り込んでください。');
  if (!props.getProperty('LINK_CORE_SUPABASE_PUBLISHABLE_KEY') || !props.getProperty('LINK_CORE_SUPABASE_JWT_SECRET')) {
    throw new Error('Realtimeの設定が足りません。');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    for (const [kind, sheet] of [['public', ensureChatSheet_()], ['direct', privateChatSheet_(false)], ['staff', staffChatSheet_(false)]]) {
      const next = Number(props.getProperty('LINK_CORE_CHAT_MIGRATION_NEXT_' + kind.toUpperCase())) || 2;
      if (sheet && next <= sheet.getLastRow()) throw new Error(kind + ' の移行が完了していません。');
    }
    supabaseChatRows_({select:'id', limit:1});
    props.setProperty('LINK_CORE_CHAT_BACKEND', 'supabase');
  } finally { lock.releaseLock(); }
}
