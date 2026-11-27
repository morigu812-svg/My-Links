const APP_TITLE = 'LINK BASE';
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
  'NEWラベル',
  '非公開フィルター'
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
function publicationFilterKey_(value) {
  return String(value||'').normalize('NFKC').trim().toLowerCase().replace(/[\s　]+/g,'').replace(/[‐‑‒–—−]/g,'-');
}
function normalizeExcludedFilters_(values) {
  if(!Array.isArray(values)||values.length>50)throw new Error('除外フィルターは50件以内で選択してください。');
  const unique=new Map();values.forEach(value=>{if(typeof value!=='string')throw new Error('フィルター名が不正です。');const name=value.trim();if(!name||name.length>100)throw new Error('フィルター名は1〜100文字で入力してください。');unique.set(publicationFilterKey_(name),name);});
  return Array.from(unique.values());
}
function parseExcludedFilters_(value) {
  if(value==null||value==='')return [];
  try{return normalizeExcludedFilters_(typeof value==='string'?JSON.parse(value):value);}catch{return null;}
}
function linkVisibleForFilter_(link,filter) {
  if(link.visibleToVisitors!==true||link.excludedFilters===null)return false;
  const excluded=link.excludedFilters||[];
  if(!excluded.length)return true;
  const key=publicationFilterKey_(filter);return !!key&&!excluded.some(name=>publicationFilterKey_(name)===key);
}
function linkPublicationOptions_(){
  const names=Array.from(visitorChatProfilesByBrowser_(filterAccessSpreadsheet_()).values(),profile=>profile.filter).filter(Boolean);
  return Array.from(new Set(names)).sort((a,b)=>a.localeCompare(b,'ja'));
}
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
    excludedFilters: parseExcludedFilters_(get('非公開フィルター')),
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
  removeChunkedJsonCache_('LINK_CORE_LINKS_ALL_V3');
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
    if (header!=='非公開フィルター'&&!columns[header]) throw new Error('必要な列がありません: ' + header + '。管理者画面を開いてシート構成を確認してください。');
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
  writeChunkedJsonCache_('LINK_CORE_LINKS_ALL_V3', result, LINKS_CACHE_TTL_SECONDS);
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
    console.warn('LINK BASE cache warm-up failed:', error);
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
  return { cache: CacheService.getScriptCache(), key: 'LINK_CORE_AUTH_' + scope + '_' + suffix, scope:scope };
}

function checkAuthRateLimit_(state) {
  const raw = state.cache.get(state.key);
  if (!raw) return;
  let data = {};
  try { data = JSON.parse(raw) || {}; } catch (_) {}
  if (Number(data.lockedUntil || 0) > Date.now()) {
    securityEvent_('auth_locked', state.scope || 'AUTH');
    throw new Error('認証の試行回数が上限に達しました。15分ほど待ってから再試行してください。');
  }
}

function recordAuthFailure_(state) {
  const lock = LockService.getScriptLock();
  lock.waitLock(3000);
  let failureCount = 0;
  try {
    let data = {};
    try { data = JSON.parse(state.cache.get(state.key) || '{}') || {}; } catch (_) {}
    const count = Number(data.count || 0) + 1;
    failureCount = count;
    const lockedUntil = count >= 5 ? Date.now() + 15 * 60 * 1000 : 0;
    state.cache.put(state.key, JSON.stringify({ count, lockedUntil }), 15 * 60);
  } finally {
    lock.releaseLock();
  }
  securityEvent_(failureCount >= 5 ? 'auth_repeated' : 'auth_failed', state.scope || 'AUTH', failureCount);
}

function clearAuthFailures_(state) {
  state.cache.remove(state.key);
}

/** 利用者ページの共有パスワードを検証して閲覧専用トークンを発行する。 */
function authenticateVisitor(password, browserId, browserSecret) {
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(String(browserId || ''))) throw new Error('ブラウザIDを確認できません。');
  if (isVisitorBanned_(browserId)) throw new Error('このブラウザは利用を停止されています。管理者にお問い合わせください。');
  const expected = PropertiesService.getScriptProperties().getProperty('LINK_CORE_VISITOR_PASSWORD');
  if (!expected) throw new Error('利用者用パスワードが未設定です。管理者が設定を完了するまでお待ちください。');
  if (typeof password !== 'string' || !password || password !== expected) {
    securityEvent_('auth_failed', 'VISITOR');
    throw new Error('サイトのパスワードが違います。');
  }
  return createVisitorSession_(browserId,browserSecret);
}
function createVisitorSession_(browserId,browserSecret){
  if(!/^[A-Za-z0-9_-]{8,100}$/.test(String(browserId||'')))throw new Error('ブラウザIDを確認できません。');
  if(isVisitorBanned_(browserId))throw new Error('このブラウザは利用を停止されています。');
  const generation=sessionGeneration_();
  requireVisitorTimeAllowed_(browserId);
  let directBound = false;
  if (supabaseChatMode_() === 'supabase') {
    const inbox = privateChatBrowserId_(browserSecret);
    if (!inbox) throw new Error('ブラウザの識別情報を確認できません。サイトデータの保存を許可して再試行してください。');
    let bound;
    try {
      bound = supabaseChatRequest_('post', 'rpc/link_core_bind_visitor_chat', {browser:browserId, inbox_id:inbox});
    } catch (_) {
      throw new Error('ブラウザの本人確認に接続できませんでした。時間をおいて再試行してください。');
    }
    if (bound !== true) {
      securityEvent_('identity_mismatch', 'VISITOR');
      securityEvent_('auth_failed', 'VISITOR');
      throw new Error('ブラウザの識別情報が一致しません。同じブラウザからログインしてください。');
    }
    directBound = true;
  }
  const token = Utilities.getUuid() + Utilities.getUuid();
  storeSession_('VISITOR', token, generation);
  const bindings = {};
  bindings['LINK_CORE_VISITOR_BROWSER_' + token] = browserId;
  bindings['LINK_CORE_VISITOR_PROFILE_' + token] = browserId;
  if (directBound) bindings['LINK_CORE_VISITOR_DM_' + token] = browserId;
  CacheService.getScriptCache().putAll(bindings, SESSION_TTL_SECONDS);

  // 認証直後のリンク取得を同じ応答にまとめ、ブラウザーとの往復を1回減らす。
  const profile = getVisitorChatProfile(browserId, token);
  CacheService.getScriptCache().put('LINK_CORE_PROFILE_READY_' + token,
    profile.school && profile.filter ? '1' : '0', SESSION_TTL_SECONDS);
  const initialLinks = getLinksForToken_(token, false);
  recordVisitorLogin_(browserId);

  return {
    ok: true, token: token, browserId:browserId, profile:profile, warning:visitorWarning_(browserId), expiresIn: SESSION_TTL_SECONDS,
    links: initialLinks.links, categories: initialLinks.categories, replyRequired:!!initialLinks.replyRequired, profileRequired:!!initialLinks.profileRequired,
    blockedLinkIds:!initialLinks.profileRequired&&!initialLinks.replyRequired?visitorBlockedLinkIds_(browserId,profile.filter,initialLinks.links):[]
  };
}

function authenticateVisitorFromAdmin(browserId,browserSecret,adminToken){
  requireAdmin_(adminToken);
  const cache=CacheService.getScriptCache();
  const parent=cache.get('LINK_CORE_ADMIN_'+adminToken);
  const deadline=Number(String(parent||'').split(':')[1]);
  if(!Number.isFinite(deadline)||deadline<=Date.now())throw new Error('管理者ログインの有効期限が切れました。');
  const auth=createVisitorSession_(browserId,browserSecret);
  if(!isSessionValid_('ADMIN',adminToken))throw new Error('管理者ログインの有効期限が切れました。');
  const ttl=Math.max(1,Math.min(SESSION_TTL_SECONDS,Math.floor((deadline-Date.now())/1000)));
  cache.put('LINK_CORE_VISITOR_'+auth.token,visitorSessionGeneration_()+':'+Math.min(deadline,Date.now()+ttl*1000)+':'+adminToken,ttl);
  auth.expiresIn=ttl;return auth;
}

const SESSION_TTL_SECONDS = 30 * 60;
const SESSION_GENERATION_PROPERTY = 'LINK_CORE_SESSION_GENERATION';

function visitorSessionGeneration_() {
  return sessionGeneration_() + '|' + (PropertiesService.getScriptProperties().getProperty('LINK_CORE_VISITOR_GENERATION') || 'yes');
}

function logoutAllVisitors(adminToken) {
  requireAdmin_(adminToken, 'logoutAllVisitors');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try { requireAdmin_(adminToken); PropertiesService.getScriptProperties().setProperty('LINK_CORE_VISITOR_GENERATION', Utilities.getUuid()); return {ok:true}; }
  finally { lock.releaseLock(); }
}

function sessionGeneration_() {
  return PropertiesService.getScriptProperties().getProperty(SESSION_GENERATION_PROPERTY) || 'yes';
}

function isSessionValid_(role, token) {
  if (typeof token !== 'string' || !/^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}){2}$/i.test(token)) return false;
  const savedGeneration = CacheService.getScriptCache().get('LINK_CORE_' + role + '_' + token);
  if (!savedGeneration) return false;
  const [generation, expiresAt, parentAdminToken] = savedGeneration.split(':');
  if (!(Number(expiresAt) > Date.now() && generation === (role === 'VISITOR' ? visitorSessionGeneration_() : role === 'AUDIT' ? auditGeneration_() : sessionGeneration_()))) return false;
  if (role === 'VISITOR') {
    if(parentAdminToken&&!isSessionValid_('ADMIN',parentAdminToken))return false;
    const browser = CacheService.getScriptCache().get('LINK_CORE_VISITOR_BROWSER_' + token);
    if(!browser || isVisitorBanned_(browser))return false;
    requireVisitorTimeAllowed_(browser);
    return true;
  }
  return true;
}

function isVisitorBanned_(browserId) {
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(String(browserId || ''))) return false;
  return PropertiesService.getScriptProperties().getProperty('LINK_CORE_BAN_' + browserId) === '1';
}
function setVisitorBan(browserId, banned, adminToken) {
  requireAdmin_(adminToken, 'setVisitorBan');
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(String(browserId || '')) || typeof banned !== 'boolean') throw new Error('ブラウザIDまたは設定が不正です。');
  const props = PropertiesService.getScriptProperties();
  const key = 'LINK_CORE_BAN_' + browserId;
  if (banned) props.setProperty(key, '1'); else props.deleteProperty(key);
  return {ok:true, banned, bannedCount:activeBanCount_()};
}

function getBanVisitors(adminToken) {
  requireAdmin_(adminToken);
  const props = PropertiesService.getScriptProperties();
  const spreadsheet = SpreadsheetApp.openById(props.getProperty(SPREADSHEET_PROPERTY));
  const visitors = new Map();
  const prefix = 'LINK_CORE_BAN_';
  const settings = props.getProperties();
  const names = getClickBrowserNames_(spreadsheet);
  const profiles = visitorChatProfilesByBrowser_(spreadsheet);

  function record(id, date, signedIn) {
    const browserId = String(id || '');
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(browserId)) return;
    const visitor = visitors.get(browserId) || {
      browserId, browserName: names.get(browserId) || '', lastLogin: '', lastActivity: '',
      school:profiles.get(browserId)?.school || '', filter:profiles.get(browserId)?.filter || '',
      banned: settings[prefix + browserId] === '1'
    };
    const timestamp = date ? new Date(date) : null;
    if (timestamp && Number.isFinite(timestamp.getTime())) {
      const day = timestamp.toISOString();
      if (day > visitor.lastActivity) visitor.lastActivity = day;
      if (signedIn && day > visitor.lastLogin) visitor.lastLogin = day;
    }
    visitors.set(browserId, visitor);
  }

  function readHistory(sheetName, dateColumn, idColumn, signedIn) {
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() < 2 || sheet.getLastColumn() < idColumn) return;
    const rows = sheet.getRange(2, dateColumn, sheet.getLastRow() - 1, idColumn - dateColumn + 1).getValues();
    rows.forEach(row => record(row[idColumn - dateColumn], row[0], signedIn));
  }

  readHistory('VisitorLoginLogs', 1, 2, true);
  readHistory(CLICK_LOG_SHEET_NAME, 5, 6, false);
  readHistory('BAN異議申し立て', 1, 2, false);
  Object.keys(settings).forEach(key => {
    if (key.startsWith(prefix) && settings[key] === '1') record(key.slice(prefix.length));
  });
  return {logs: Array.from(visitors.values()).sort((a, b) =>
    Number(b.banned) - Number(a.banned) ||
    b.lastActivity.localeCompare(a.lastActivity) || a.browserId.localeCompare(b.browserId)
  )};
}

function getVisitorDirectory(options, adminToken) {
  // Older admin pages only pass the token.
  if (typeof options === 'string' && adminToken === undefined) { adminToken = options; options = null; }
  requireAdmin_(adminToken);
  const now = new Date();
  const dayNumber = date => Math.floor((new Date(date).getTime() + 9 * 3600000) / 86400000);
  const today = dayNumber(now);
  const cacheKey = 'LINK_CORE_VISITOR_DIRECTORY_V1_' + today;
  if (!options?.refresh) {
    const cached = readChunkedJsonCache_(cacheKey);
    if (cached) return cached;
  }
  const settings = PropertiesService.getScriptProperties().getProperties();
  const spreadsheetId = settings[SPREADSHEET_PROPERTY];
  if (!spreadsheetId) throw new Error('スプレッドシートIDが未設定です。');
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const names = getClickBrowserNames_(spreadsheet);
  const profiles = visitorChatProfilesByBrowser_(spreadsheet);
  const visitors = new Map();
  const daysByBrowser = new Map();

  function visitorFor(value) {
    const browserId = String(value || '').trim();
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(browserId)) return null;
    if (!visitors.has(browserId)) {
      const profile = profiles.get(browserId);
      visitors.set(browserId, {
        browserId, browserName:names.get(browserId) || '', school:profile?.school || '',
        filter:profile?.filter || '', profileUpdatedAt:profile?.updatedAt || '',
        schoolCorrectionRequired:!!profile?.schoolCorrectionRequired, filterCorrectionRequired:!!profile?.filterCorrectionRequired,
        firstLogin:'', lastLogin:'', loginCount:0, loginDays:0, loginDayNumber:0,
        loginStreak:0, clickCount:0, lastClick:'', lastClickTitle:'',
        reports:0, appeals:0, requiredReplies:0, lastSeen:'',
        banned:settings['LINK_CORE_BAN_' + browserId] === '1'
      });
    }
    return visitors.get(browserId);
  }

  function rows(sheetName, firstColumn, width) {
    const sheet = spreadsheet.getSheetByName(sheetName);
    const last = sheet ? sheet.getLastRow() : 0;
    return last > 1 && sheet.getLastColumn() >= firstColumn + width - 1
      ? sheet.getRange(2, firstColumn, last - 1, width).getValues() : [];
  }

  function timestamp(value) {
    const time = value ? new Date(value) : null;
    return time && Number.isFinite(time.getTime()) ? time.toISOString() : '';
  }

  names.forEach((_, id) => visitorFor(id));
  profiles.forEach((_, id) => visitorFor(id));
  rows('VisitorLoginLogs', 1, 2).forEach(([value, id]) => {
    const visitor = visitorFor(id);
    const date = timestamp(value);
    if (!visitor || !date) return;
    const day = dayNumber(date);
    if (day > today) return;
    if (!daysByBrowser.has(visitor.browserId)) daysByBrowser.set(visitor.browserId, new Set());
    daysByBrowser.get(visitor.browserId).add(day);
    visitor.loginCount++;
    if (!visitor.firstLogin || date < visitor.firstLogin) visitor.firstLogin = date;
    if (date > visitor.lastLogin) visitor.lastLogin = date;
  });

  rows(CLICK_LOG_SHEET_NAME, 3, 4).forEach(([title,, value, id]) => {
    const visitor = visitorFor(id);
    const date = timestamp(value);
    if (!visitor || !date) return;
    visitor.clickCount++;
    if (date >= visitor.lastClick) {
      visitor.lastClick = date;
      visitor.lastClickTitle = String(title || '');
    }
  });
  rows(LINK_REPORT_SHEET, 4, 1).forEach(([id]) => {
    const visitor = visitorFor(id);
    if (visitor) visitor.reports++;
  });
  rows('BAN異議申し立て', 2, 1).forEach(([id]) => {
    const visitor = visitorFor(id);
    if (visitor) visitor.appeals++;
  });

  Object.entries(settings).forEach(([key, value]) => {
    if (key.startsWith('LINK_CORE_BAN_') && value === '1') visitorFor(key.slice('LINK_CORE_BAN_'.length));
    if (!key.startsWith('LINK_CORE_REQUIRED_REPLY_')) return;
    let pending;
    try { pending = JSON.parse(value); } catch (_) { return; }
    if (!Array.isArray(pending) || !pending.length) return;
    const visitor = visitorFor(key.slice('LINK_CORE_REQUIRED_REPLY_'.length));
    if (visitor) visitor.requiredReplies = pending.length;
  });

  visitorOnlineSnapshot_('', '', false, true, true).logs.forEach(item => {
    const visitor = visitorFor(item.browserId);
    if (visitor) visitor.lastSeen = item.lastSeen;
  });
  daysByBrowser.forEach((days, id) => {
    const visitor = visitors.get(id);
    visitor.loginDays = days.size;
    visitor.loginDayNumber = today - dayNumber(visitor.firstLogin) + 1;
    let cursor = days.has(today) ? today : today - 1;
    while (days.has(cursor)) { visitor.loginStreak++; cursor--; }
  });

  const logs = Array.from(visitors.values(), visitor => ({
    visitor, activity:[visitor.lastSeen, visitor.lastLogin, visitor.lastClick].sort().pop()
  })).sort((a,b) => b.activity.localeCompare(a.activity) ||
    a.visitor.browserId.localeCompare(b.visitor.browserId)).map(item => item.visitor);
  const result = {logs};
  writeChunkedJsonCache_(cacheKey, result, 20);
  return result;
}

function storeSession_(role, token, generation) {
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  CacheService.getScriptCache().put('LINK_CORE_' + role + '_' + token,
    (role === 'VISITOR' ? visitorSessionGeneration_() : generation) + ':' + expiresAt, SESSION_TTL_SECONDS);
}

function logoutCurrentSession(token) {
  requireLinkViewer_(token);
  if (isSessionValid_('ADMIN',token)) auditAdminOperation_(token,'logout');
  const browser = CacheService.getScriptCache().get('LINK_CORE_VISITOR_BROWSER_' + token);
  if (browser) {
    try { visitorOnlineSnapshot_(token, browser, false, false); } catch (_) { /* Session revocation must still succeed. */ }
  }
  CacheService.getScriptCache().removeAll(['LINK_CORE_ADMIN_' + token, 'LINK_CORE_ADMIN_ACTIVITY_' + token, 'LINK_CORE_VISITOR_' + token, 'LINK_CORE_VISITOR_DM_' + token, 'LINK_CORE_VISITOR_PROFILE_' + token, 'LINK_CORE_PROFILE_READY_' + token, 'LINK_CORE_VISITOR_BROWSER_' + token]);
  return { ok: true };
}

function checkViewerSession(token, browserId) {
  if (token === '' && typeof browserId === 'string') {
    return {ok: true, banned: isVisitorBanned_(browserId), downtime:visitorDowntimeState_(browserId), warning:visitorWarning_(browserId)};
  }
  requireLinkViewer_(token);
  const browser=CacheService.getScriptCache().get('LINK_CORE_VISITOR_BROWSER_'+token);
  return { ok: true, downtime:browser?visitorDowntimeState_(browser):null, warning:browser?visitorWarning_(browser):null };
}

function logoutAllBrowsers(adminToken) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    requireAdmin_(adminToken, 'logoutAllBrowsers');
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
  if (typeof token === 'string' && /^[0-9a-f-]{72}$/i.test(token)) {
    const browser = CacheService.getScriptCache().get('LINK_CORE_VISITOR_BROWSER_' + token);
    if (isVisitorBanned_(browser)) throw new Error('このブラウザは利用を停止されています。管理者にお問い合わせください。');
  }
  securityEvent_('viewer_denied', 'VISITOR');
  throw new Error('閲覧にはサイトのパスワード認証が必要です。');
}

function authenticateAdminWithSupabase(accessToken, activityContext) {
  const generation = sessionGeneration_();
  const rateState = getAuthRateState_('ADMIN');
  checkAuthRateLimit_(rateState);
  if (typeof accessToken !== 'string' || accessToken.length > 16384 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(accessToken)) {
    throw new Error('Supabaseのログイン情報が不正です。');
  }
  const {url, props} = supabaseChatConfig_();
  const key = props.getProperty('LINK_CORE_SUPABASE_PUBLISHABLE_KEY');
  if (!key) throw new Error('Supabaseの公開キーが未設定です。');
  const response = UrlFetchApp.fetch(url + '/rest/v1/rpc/link_core_check_staff_login', {
    method:'post', headers:{apikey:key, Authorization:'Bearer ' + accessToken},
    contentType:'application/json', payload:'{}', muteHttpExceptions:true
  });
  const status = response.getResponseCode();
  if (status === 401 || status === 403 || (status === 200 && response.getContentText() !== 'true')) {
    recordAuthFailure_(rateState);
    throw new Error('管理者権限を確認できません。アカウント登録とAuth Hooksの設定を確認してください。');
  }
  if (status !== 200) throw new Error('Supabaseの管理者認証に接続できませんでした。');
  clearAuthFailures_(rateState);
  const token = Utilities.getUuid() + Utilities.getUuid();
  storeSession_('ADMIN', token, generation);
  auditAdminLogin_(token, activityContext, 'Supabase認証');
  return {ok:true, token, expiresIn:SESSION_TTL_SECONDS};
}

function authenticateAdmin(password, includeLinks, activityContext) {
  const generation = sessionGeneration_();
  const rateState = getAuthRateState_('ADMIN');
  checkAuthRateLimit_(rateState);
  const properties = PropertiesService.getScriptProperties();
  const auditPassword = properties.getProperty(ADMIN_AUDIT_PASSWORD_PROPERTY);
  if (typeof password === 'string' && password.startsWith('K:')) {
    if (!auditPassword) throw new Error('管理者アクティビティのパスワードが未設定です。');
    if (!password.slice(2) || password.slice(2) !== auditPassword) {
      recordAuthFailure_(rateState);
      throw new Error('管理者アクティビティのパスワードが違います。');
    }

    if (auditPassword === properties.getProperty('LINK_CORE_ADMIN_PASSWORD')) throw new Error('通常管理者と監査用のパスワードは別の値に設定してください。');
    if (!activityContext || activityContext.supportsAuditLogin !== true) {
      throw new Error('この管理者画面は監査用ログインに未対応の古い版です。管理者ページを再読み込みしてから専用パスワードを入力してください。');
    }
    clearAuthFailures_(rateState);
    const auditToken = Utilities.getUuid() + Utilities.getUuid();
    storeSession_('AUDIT', auditToken, auditGeneration_());
    return {ok:true, role:'audit', token:auditToken, expiresIn:SESSION_TTL_SECONDS};
  }
  const expected = PropertiesService.getScriptProperties().getProperty('LINK_CORE_ADMIN_PASSWORD');
  if (!expected) throw new Error('管理者パスワードが未設定です。Apps Script のスクリプト プロパティに LINK_CORE_ADMIN_PASSWORD を登録してください。');
  if (typeof password !== 'string' || !password || password !== expected) {
    recordAuthFailure_(rateState);
    throw new Error('管理者パスワードが違います。');
  }
  clearAuthFailures_(rateState);
  const token = Utilities.getUuid() + Utilities.getUuid();
  storeSession_('ADMIN', token, generation);
  auditAdminLogin_(token, activityContext, 'パスワード認証');

  // 管理画面だけ、認証成功後に一覧を同じ応答で返す。メモ帳はトークンだけ受け取る。
  if (includeLinks === true) {
    try {
      const { links, categories } = getLinksForToken_(token, true);
      return { ok: true, token: token, expiresIn: SESSION_TTL_SECONDS, links: links, categories: categories };
    } catch (error) {
      console.warn('LINK BASE initial admin links failed:', error);
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
function requireAdmin_(token, activityMethod) {
  if (typeof token !== 'string' || !token ||
      !isSessionValid_('ADMIN', token)) {
    securityEvent_('admin_denied', 'ADMIN');
    throw new Error('管理者ログインが必要です。ログインし直してください。');
  }
  if (activityMethod) auditAdminOperation_(token, activityMethod);
}

function visitorChatReadSheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty(SPREADSHEET_PROPERTY);
  if (!spreadsheetId) throw new Error('スプレッドシートIDが未設定です。');
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheet = ss.getSheetByName('AdminVisitorChatRead') || ss.insertSheet('AdminVisitorChatRead');
  if (!sheet.getLastRow()) sheet.appendRow(['管理者ブラウザID','メッセージID','既読日時']);
  return sheet;
}
function getAdminVisitorChatRead(browserId, adminToken) {
  requireAdmin_(adminToken);
  if (!/^staff-[0-9a-f]{32}$/.test(String(browserId || ''))) throw new Error('管理者ブラウザIDが不正です。');
  const sheet = visitorChatReadSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return {ids:[]};
  return {ids:sheet.getRange(2,1,last-1,2).getDisplayValues().filter(row=>row[0]===browserId).map(row=>row[1]).slice(-1000)};
}
function markAdminVisitorChatRead(browserId, ids, adminToken) {
  requireAdmin_(adminToken);
  if (!/^staff-[0-9a-f]{32}$/.test(String(browserId || '')) || !Array.isArray(ids) || ids.length>200 ||
      ids.some(id=>typeof id!=='string' || !/^[0-9a-f-]{36}$/i.test(id))) throw new Error('既読情報が不正です。');
  const lock = LockService.getScriptLock();lock.waitLock(10000);
  try {
    const sheet = visitorChatReadSheet_();const last=sheet.getLastRow();
    const saved = new Set(last<2?[]:sheet.getRange(2,1,last-1,2).getDisplayValues().filter(row=>row[0]===browserId).map(row=>row[1]));
    const added = [...new Set(ids)].filter(id=>!saved.has(id));
    if (added.length) sheet.getRange(last+1,1,added.length,3).setValues(added.map(id=>[browserId,id,new Date()]));
    return {ok:true,ids:[...saved,...added].slice(-1000)};
  } finally {lock.releaseLock();}
}

const LINK_REPORT_SHEET = 'LinkReports';
function banAppealSheet_(create) {
  const id = PropertiesService.getScriptProperties().getProperty(SPREADSHEET_PROPERTY);
  if (!id) throw new Error('スプレッドシートIDが未設定です。');
  const spreadsheet = SpreadsheetApp.openById(id);
  let sheet = spreadsheet.getSheetByName('BAN異議申し立て');
  if (!sheet && create) sheet = spreadsheet.insertSheet('BAN異議申し立て');
  if (sheet && create && !sheet.getLastRow()) sheet.appendRow(['受信日時', 'ブラウザID', '理由']);
  return sheet;
}

function submitBanAppeal(browserId, text) {
  const message = typeof text === 'string' ? text.trim() : '';
  if (!message || message.length > 1000) throw new Error('理由を1〜1000文字で入力してください。');
  if (!isVisitorBanned_(browserId)) throw new Error('利用停止中のブラウザから送信してください。');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (!isVisitorBanned_(browserId)) throw new Error('利用停止は解除されています。ページを更新してください。');
    const sheet = banAppealSheet_(true);
    const last = sheet.getLastRow();
    if (last > 1) {
      const entries = sheet.getRange(2, 2, last - 1, 1).createTextFinder(browserId).matchEntireCell(true).matchCase(true).findAll();
      const latest = entries.reduce((highest, entry) => Math.max(highest, entry.getRow()), 0);
      if (latest && Date.now() - new Date(sheet.getRange(latest, 1).getValue()).getTime() < 86400000) {
        throw new Error('このブラウザからは送信済みです。次の送信は24時間後にできます。');
      }
    }
    sheet.appendRow([new Date(), safeCell_(String(browserId)), safeCell_(message)]);
    SpreadsheetApp.flush();
    return {ok: true};
  } finally {
    lock.releaseLock();
  }
}

function getBanAppeals(adminToken) {
  requireAdmin_(adminToken);
  const sheet = banAppealSheet_(false);
  const last = sheet ? sheet.getLastRow() : 0;
  if (last < 2) return {logs: []};
  const count = Math.min(last - 1, 200);
  return {logs: sheet.getRange(last - count + 1, 1, count, 3).getValues().reverse()
    .map(([date, browserId, message]) => ({
      date: toIso_(date),
      browserId: String(browserId),
      message: String(message),
      banned: isVisitorBanned_(String(browserId))
    }))};
}

function linkReportSheet_(create) {
  const id = PropertiesService.getScriptProperties().getProperty(SPREADSHEET_PROPERTY);
  if (!id) throw new Error('スプレッドシートIDが未設定です。');
  const ss = SpreadsheetApp.openById(id);
  let sheet = ss.getSheetByName(LINK_REPORT_SHEET);
  if (!sheet && create) sheet = ss.insertSheet(LINK_REPORT_SHEET);
  if (sheet && !sheet.getLastRow()) sheet.appendRow(['ID', '報告日時', 'URL', 'ブラウザID', '確認日時']);
  return sheet;
}
function submitLinkReport(url, browserId, visitorToken) {
  if (!isSessionValid_('VISITOR', visitorToken)) throw new Error('利用者ログインが必要です。');
  const value = String(url || '').trim();
  if (value.length > 2048 || !/^https?:\/\//i.test(value)) throw new Error('http:// または https:// のURLを入力してください。');
  if (!/^https?:\/\/[^\s/@?#]+(?:[/?#]|$)/i.test(value) || /[\s\u0000-\u001f]/.test(value)) {
    throw new Error('URLの形式が正しくありません。');
  }
  const browser = visitorProfileBrowser_(browserId, visitorToken);
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try { linkReportSheet_(true).appendRow([Utilities.getUuid(), new Date(), safeCell_(value), safeCell_(browser), '']); }
  finally { lock.releaseLock(); }
  return {ok:true};
}
function getLinkReports(options, adminToken) {
  if(typeof options==='string'&&adminToken===undefined){adminToken=options;options={};}
  requireAdmin_(adminToken);
  const bannedCount = activeBanCount_();
  const sheet = linkReportSheet_(false);
  if (!sheet || sheet.getLastRow() < 2) return {reports:[], unread:0, bannedCount};
  const last = sheet.getLastRow();
  const rows = sheet.getRange(2, 1, last - 1, 5).getValues();
  const unread=rows.filter(row=>row[0] && !row[4]).length;
  if(options?.summary===true)return {bannedCount,unread};
  return {bannedCount, unread,
    reports:rows.slice(-200).reverse().filter(row=>row[0]).map(row=>({id:String(row[0]), date:toIso_(row[1]), url:String(row[2]), browserId:String(row[3]), checked:!!row[4]}))};
}
function markLinkReportChecked(id, adminToken) {
  requireAdmin_(adminToken, 'markLinkReportChecked');
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) throw new Error('報告IDが不正です。');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sheet = linkReportSheet_(false);
    if (!sheet) throw new Error('報告が見つかりません。');
    const found = sheet.getRange(2, 1, Math.max(1, sheet.getLastRow()-1), 1).createTextFinder(id).matchEntireCell(true).findNext();
    if (!found) throw new Error('報告が見つかりません。');
    sheet.getRange(found.getRow(), 5).setValue(new Date());
    return {ok:true};
  } finally { lock.releaseLock(); }
}

/**
 * 画面表示用に全リンクを返す。
 */
function getLinksForToken_(viewerToken, knownIsAdmin, performanceData) {
  const isAdmin = typeof knownIsAdmin === 'boolean'
    ? knownIsAdmin
    : isSessionValid_('ADMIN', viewerToken);

  if (!isAdmin && visitorProfileRequired_(viewerToken)) return {links:[], categories:[], profileRequired:true};
  if (!isAdmin && visitorReplyGate_(viewerToken)) return {links:[], categories:[], replyRequired:true};
  const cacheStartedAt = Date.now();
  let result = readChunkedJsonCache_('LINK_CORE_LINKS_ALL_V3');
  if (performanceData) {
    performanceData.cacheReadMs = Date.now() - cacheStartedAt;
    performanceData.cacheHit = !!result;
  }

  if (!result) {
    const sheetStartedAt = Date.now();
    result = readLinksForDisplay_();
    if (performanceData) performanceData.sheetReadMs = Date.now() - sheetStartedAt;
    const cacheWriteStartedAt = Date.now();
    writeChunkedJsonCache_('LINK_CORE_LINKS_ALL_V3', result, LINKS_CACHE_TTL_SECONDS);
    if (performanceData) performanceData.cacheWriteMs = Date.now() - cacheWriteStartedAt;
  } else if (performanceData) {
    performanceData.sheetReadMs = 0;
    performanceData.cacheWriteMs = 0;
  }

  // キャッシュはサーバー内に全件を保持し、利用者には返却直前に公開リンクだけを渡す。
  if (!isAdmin) {
    const filterStartedAt = Date.now();
    const browser=visitorProfileBrowser_('',viewerToken);
    const profile=getVisitorChatProfile(browser,viewerToken);
    const visibleLinks = result.links.filter(link => linkVisibleForFilter_(link,profile.filter));
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
  if(!isAdmin&&!result.profileRequired&&!result.replyRequired){
    const browser=visitorProfileBrowser_('',viewerToken),profile=getVisitorChatProfile(browser,viewerToken);
    result.blockedLinkIds=visitorBlockedLinkIds_(browser,profile.filter,result.links);
  }
  if (performanceData) {
    performanceData.serverTotalMs = Date.now() - startedAt;
    performanceData.linkCount = result.links.length;
    result._performance = performanceData;
  }
  if(isAdmin){result.publicationRulesVersion=1;try{result.publicationFilters=linkPublicationOptions_();}catch(_){result.publicationFilters=[];}}
  return result;
}

/**
 * リンクを新規作成または更新する。
 */
function saveLink(input, adminToken) {
  requireAdmin_(adminToken, 'saveLink');
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
      '非公開フィルター': JSON.stringify(normalizeExcludedFilters_(input.excludedFilters===undefined?(parseExcludedFilters_(rowValues[columns['非公開フィルター']-1])||[]):input.excludedFilters)),
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
  requireAdmin_(adminToken, 'deleteLink');
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
const TRASH_HEADERS = ['ID', 'タイトル', 'URL', 'カテゴリ', 'メモ', 'お気に入り', '作成日時', '更新日時', '利用者に公開', '開き方', 'NEWラベル', '削除日時', '非公開フィルター'];

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
    get('開き方'), get('NEWラベル'), new Date(), get('非公開フィルター')||''
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
    excludedFilters: parseExcludedFilters_(get('非公開フィルター')),
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
  requireAdmin_(adminToken, 'restoreTrash');
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
  requireAdmin_(adminToken, 'deleteTrashPermanently');
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
  requireAdmin_(adminToken, 'emptyTrash');
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
  if (!isSessionValid_('ADMIN', viewerToken) && visitorProfileRequired_(viewerToken)) return {links:[], profileRequired:true};
  if (!isSessionValid_('ADMIN', viewerToken) && visitorReplyGate_(viewerToken)) return {links:[], replyRequired:true};
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
  requireAdmin_(adminToken, 'saveOfficialLink');
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
  requireAdmin_(adminToken, 'deleteOfficialLink');
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
  auditAdminOperation_(adminToken, 'saveMemo');
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
  auditAdminOperation_(adminToken, 'deleteMemo');
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


/* LINK BASE shared chat. Existing Links / OfficialLinks / Memos sheets remain untouched. */
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
function getChatMessages(viewerToken) {
  requireLinkViewer_(viewerToken);
  return getPublicChatMessages_(viewerToken);
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


function deleteVisitorChatMessage(messageId, isPrivate, adminToken) {
  requireAdmin_(adminToken, 'deleteVisitorChatMessage');
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

function sendChatReply(message, chatType, destination, targetId, browserId, messageId, viewerToken) {
  requireLinkViewer_(viewerToken);
  if (supabaseChatMode_() !== 'supabase') throw new Error('引用返信はチャットの移行完了後に利用できます。');
  const body = cleanText_(message, CHAT_MAX_LENGTH);
  if (!body || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(body)) throw new Error('メッセージを確認してください。');
  if (typeof targetId !== 'string' || !/^[0-9a-f-]{36}$/i.test(targetId)) throw new Error('返信先が不正です。');
  if (typeof messageId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(messageId)) throw new Error('送信IDが不正です。');
  const isAdmin = isSessionValid_('ADMIN', viewerToken);
  if (!['public','staff'].includes(chatType) || (chatType !== 'public' && !isAdmin)) throw new Error('返信先の権限がありません。');
  let recipient = '';
  let sender = '';
  if (chatType === 'staff') {
    sender = staffChatMailboxId_(browserId);
    if (!sender) throw new Error('管理者ブラウザIDが不正です。');
    recipient = staffChatPrivateRecipient_(destination, browserId);
  } else if (destination) throw new Error('公開チャットに宛先は指定できません。');
  const rate = CacheService.getScriptCache(), rateKey='LINK_CORE_REPLY_RATE_'+viewerToken;
  if (rate.get(rateKey)) throw new Error('少し待ってから再送してください。');
  const lock = LockService.getScriptLock();lock.waitLock(10000);
  try {
    requireLinkViewer_(viewerToken);
    // 通信が切れた直後に直接送信が完了していても、同じIDで二重投稿しない。
    const existing = supabaseChatRows_({kind:'eq.'+chatType,id:'eq.'+messageId,
      select:'body,recipient,sender,reply_to',limit:1})[0];
    if (existing) {
      if (existing.body===body && existing.recipient===recipient && existing.reply_to===targetId &&
          (chatType!=='staff' || existing.sender===sender)) return {ok:true};
      throw new Error('送信IDが既に使われています。');
    }
    const targets = supabaseChatRows_({kind:'eq.'+chatType,id:'eq.'+targetId,select:'sender,recipient',limit:1});
    const target=targets[0];
    if (!target || (chatType!=='staff' && target.recipient!==recipient) ||
        (chatType==='staff' && !((!recipient && !target.recipient) ||
          (recipient && ((target.sender===sender && target.recipient===recipient) ||
            (target.sender===recipient && target.recipient===sender)))))) throw new Error('返信先のメッセージが見つかりません。');
    requireChatWritable_();
    try {
      supabaseChatRequest_('post','link_core_chat',{kind:chatType,id:messageId,
        created_at:new Date().toISOString(),author:isAdmin?'管理者':'利用者',body,recipient,sender,reply_to:targetId},'return=minimal');
    } catch (error) {
      const committed = supabaseChatRows_({kind:'eq.'+chatType,id:'eq.'+messageId,
        select:'body,recipient,sender,reply_to',limit:1})[0];
      if (!committed || committed.body!==body || committed.recipient!==recipient ||
          committed.reply_to!==targetId || (chatType==='staff' && committed.sender!==sender)) throw error;
    }
    rate.put(rateKey,'1',3);
    return {ok:true};
  }finally{lock.releaseLock();}
}

function visitorChatProfileSheet_() {
  const id = PropertiesService.getScriptProperties().getProperty(SPREADSHEET_PROPERTY);
  if (!id) throw new Error('スプレッドシートIDが未設定です。');
  const ss = SpreadsheetApp.openById(id);
  const sheet = ss.getSheetByName('VisitorChatProfiles') || ss.insertSheet('VisitorChatProfiles');
  if (!sheet.getLastRow()) sheet.appendRow(['ブラウザID', '学校名', 'フィルターの種類', '更新日時']);
  return sheet;
}
function requestVisitorSchoolCorrection(browserId, adminToken) {
  return requestVisitorProfileCorrection_(browserId, [0], adminToken);
}

function requestVisitorFilterCorrection(browserId, adminToken) {
  return requestVisitorProfileCorrection_(browserId, [1], adminToken);
}

function requestVisitorSchoolAndFilterCorrection(browserId, adminToken) {
  return requestVisitorProfileCorrection_(browserId, [0, 1], adminToken);
}

function requestVisitorProfileCorrection_(browserId, fields, adminToken) {
  requireAdmin_(adminToken, 'requestVisitorProfileCorrection_');
  if (typeof browserId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(browserId)) throw new Error('ブラウザIDが不正です。');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = visitorChatProfileSheet_();
    const last = sheet.getLastRow();
    const found = last < 2 ? null : sheet.getRange(2,1,last-1,1).createTextFinder(browserId).matchEntireCell(true).matchCase(true).findNext();
    if (!found) throw new Error('登録済みの利用者情報が見つかりません。');
    const labels = ['学校名', 'フィルター'];
    const values = sheet.getRange(found.getRow(), 2, 1, 2).getDisplayValues()[0];
    const headers = sheet.getRange(1, 5, 1, 2);
    const headerValues = headers.getValues()[0];
    const requests = sheet.getRange(found.getRow(), 5, 1, 2);
    const pending = requests.getValues()[0];
    fields.forEach(field => {
      if (!values[field].trim()) throw new Error('登録済みの' + labels[field] + 'が見つかりません。');
      if (!headerValues[field]) headerValues[field] = labels[field] + '再入力リクエスト';
      if (!pending[field]) pending[field] = Utilities.getUuid();
    });
    headers.setValues([headerValues]);
    requests.setValues([pending]);
    SpreadsheetApp.flush();
    invalidateVisitorDirectory_();
    return {ok:true};
  } finally { lock.releaseLock(); }
}

function invalidateVisitorDirectory_() {
  const day = Math.floor((Date.now() + 9 * 3600000) / 86400000);
  CacheService.getScriptCache().remove('LINK_CORE_VISITOR_DIRECTORY_V1_' + day + '_META');
}

function getVisitorChatProfile(browserId, visitorToken) {
  browserId = visitorProfileBrowser_(browserId, visitorToken);
  const sheet = visitorChatProfileSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return {school:'', filter:''};
  const found = sheet.getRange(2,1,last-1,1).createTextFinder(browserId).matchEntireCell(true).matchCase(true).findNext();
  if (!found) return {school:'', filter:''};
  const [school, filter,, schoolRequest, filterRequest, nickname] = sheet.getRange(found.getRow(),2,1,6).getDisplayValues()[0];
  const observed = {};
  if (schoolRequest) observed['LINK_CORE_SCHOOL_CORRECTION_' + visitorToken] = schoolRequest;
  if (filterRequest) observed['LINK_CORE_FILTER_CORRECTION_' + visitorToken] = filterRequest;
  if (schoolRequest || filterRequest) CacheService.getScriptCache().putAll(observed, SESSION_TTL_SECONDS);
  return {
    nickname:nickname || '',
    school:schoolRequest ? '' : school, filter:filterRequest ? '' : filter,
    schoolCorrectionRequired:!!schoolRequest, filterCorrectionRequired:!!filterRequest
  };
}
function saveVisitorChatProfile(browserId, school, filter, visitorToken) {
  browserId = visitorProfileBrowser_(browserId, visitorToken);
  const name = cleanText_(school,80), kind = cleanText_(filter,80);
  if (!name || !kind || /[\u0000-\u001f]/.test(name+kind)) throw new Error('学校名とフィルターの種類を入力してください。');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sheet = visitorChatProfileSheet_();
    const last = sheet.getLastRow();
    const found = last < 2 ? null : sheet.getRange(2,1,last-1,1).createTextFinder(browserId).matchEntireCell(true).matchCase(true).findNext();
    const row = found ? found.getRow() : last+1;
    const [schoolRequest, filterRequest] = found ? sheet.getRange(row,5,1,2).getDisplayValues()[0] : ['', ''];
    if (schoolRequest || filterRequest) {
      const schoolKey = 'LINK_CORE_SCHOOL_CORRECTION_' + visitorToken;
      const filterKey = 'LINK_CORE_FILTER_CORRECTION_' + visitorToken;
      const observed = CacheService.getScriptCache().getAll([schoolKey, filterKey]);
      if ((schoolRequest && observed[schoolKey] !== schoolRequest) ||
          (filterRequest && observed[filterKey] !== filterRequest)) {
        throw new Error('管理者から再入力が求められています。ログインし直してください。');
      }
    }
    sheet.getRange(row,1,1,6).setValues([[browserId,safeCell_(name),safeCell_(kind),new Date(),'','']]);
    SpreadsheetApp.flush();
    if (schoolRequest || filterRequest) invalidateVisitorDirectory_();
    CacheService.getScriptCache().put('LINK_CORE_PROFILE_READY_' + visitorToken, '1', SESSION_TTL_SECONDS);
    return {school:name,filter:kind};
  } finally { lock.releaseLock(); }
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


/* LINK BASE click history. Only authenticated visitors can write; only admins can read. */
const CLICK_LOG_SHEET_NAME = 'ClickLogs';
const CLICK_LOG_HEADERS = ['ID', 'リンクID', 'リンク名', 'URL', 'クリック日時', 'ブラウザID', '推定閲覧秒数', '戻った日時'];
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
function recordLinkClick(linkId, browserId, visitorToken, visitId) {
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
    if (CacheService.getScriptCache().get('LINK_CORE_VISITOR_BROWSER_' + visitorToken) !== browser) throw new Error('ブラウザIDが一致しません。');

    stage = 'リンク一覧の読み込み';
    // 一覧キャッシュを再利用し、クリックのたびに Links シートを開かない。
    const cachedLinks = getLinksForToken_(visitorToken);
    const selected = cachedLinks.links.find(link => link.id === id);
    if (!selected || selected.visibleToVisitors !== true) {
      throw new Error('対象リンクが見つからないか、利用者に公開されていません。');
    }

    if (visitId !== undefined && (typeof visitId !== 'string' || !/^[0-9a-f-]{36}$/i.test(visitId))) throw new Error('閲覧記録IDが不正です。');
    stage = 'ClickLogsシートへの保存';
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const viewSheet = linkViewsSheet_();
      const logSheet = ensureClickLogSheet_();
      const logId = visitId || Utilities.getUuid();
      if (visitId && logSheet.getLastRow()>1) {
        const existing = logSheet.getRange(2,1,logSheet.getLastRow()-1,1).createTextFinder(logId).matchEntireCell(true).matchCase(true).findNext();
        if(existing){const values=logSheet.getRange(existing.getRow(),2,1,5).getDisplayValues()[0];if(values[0]!==id||values[4]!==browser)throw new Error('閲覧記録IDが一致しません。');return {ok:true,visitId:logId,title:selected.title};}
      }
      logSheet.appendRow([logId, safeCell_(selected.id), safeCell_(selected.title), safeCell_(selected.url), new Date(), safeCell_(browser), '', '']);
      incrementLinkView_(viewSheet, selected.id);
      return {ok: true, visitId:logId, title: selected.title, savedAt: new Date().toISOString()};
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    const detail = error && error.message ? error.message : String(error);
    console.error('[LINK BASE] recordLinkClick failed at ' + stage + ': ' + detail);
    throw new Error('クリック履歴の保存処理（' + stage + '）で失敗しました：' + detail);
  }
}
function setClickBrowserName(browserId, name, adminToken) {
  requireAdmin_(adminToken, 'setClickBrowserName');
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

function getClickBrowserNames_(spreadsheet) {
  const namesSheet = spreadsheet ? spreadsheet.getSheetByName(CLICK_BROWSER_NAMES_SHEET) : twoColumnRecordsSheet_(CLICK_BROWSER_NAMES_SHEET, [], false);
  const namesLast = namesSheet ? namesSheet.getLastRow() : 0;
  return new Map(namesLast < 2 ? [] : namesSheet.getRange(2, 1, namesLast - 1, 2).getDisplayValues());
}

function getClickLogs(options, adminToken) {
  // Keep old callers working while the static site and GAS are updated.
  if (typeof options === 'string' && adminToken === undefined) { adminToken = options; options = {}; }
  requireAdmin_(adminToken);
  options = options || {};
  const cursor = options.cursor;
  const browser = options.browserId;
  if (browser !== undefined && (typeof browser !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(browser))) {
    throw new Error('ブラウザIDが不正です。');
  }
  const pageSize = browser ? 50 : 500;
  if (cursor != null && (!Number.isSafeInteger(cursor.beforeRow) || cursor.beforeRow < 2 ||
      typeof cursor.anchor !== 'string' || cursor.anchor.length > 200)) {
    throw new Error('クリック履歴の読み込み位置が不正です。');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const properties = PropertiesService.getScriptProperties().getProperties();
    const spreadsheetId = properties[SPREADSHEET_PROPERTY];
    if (!spreadsheetId) throw new Error('スプレッドシートIDが未設定です。');
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const sheet = spreadsheet.getSheetByName(CLICK_LOG_SHEET_NAME);
    const last = sheet ? sheet.getLastRow() : 0;
    const empty = {logs:[], nextCursor:null, pageSize};
    if (last < 2) return empty;
    let beforeRow = last + 1;
    if (cursor) {
      beforeRow = cursor.beforeRow;
      // Appends do not move this anchor. Locate it again after a row deletion.
      if (beforeRow > last || String(sheet.getRange(beforeRow, 1).getDisplayValue()) !== cursor.anchor) {
        if (!cursor.anchor) return {logs:[], nextCursor:null, pageSize, resetRequired:true};
        const match = sheet.getRange(2, 1, last - 1, 1).createTextFinder(cursor.anchor)
          .matchEntireCell(true).useRegularExpression(false).findNext();
        if (!match) return {logs:[], nextCursor:null, pageSize, resetRequired:true};
        beforeRow = match.getRow();
      }
    }
    const upper = Math.min(last, beforeRow - 1);
    if (upper < 2) return empty;
    const first = browser ? 2 : Math.max(2, upper - pageSize + 1);
    const rows = sheet.getRange(first, 1, upper - first + 1, Math.min(CLICK_LOG_HEADERS.length, sheet.getMaxColumns())).getValues();
    let selected = rows;
    // Use a matching row as the cursor anchor for a filtered page.
    let nextCursor = first > 2 ? {beforeRow:first, anchor:String(rows[0][0] || '')} : null;
    if (browser) {
      selected = [];
      let oldestSelected = -1;
      for (let i = rows.length - 1; i >= 0; i--) {
        const row = rows[i];
        if (!row[0] || String(row[5]) !== browser) continue;
        if (selected.length === pageSize) {
          nextCursor = {beforeRow:first + oldestSelected, anchor:String(rows[oldestSelected][0])};
          break;
        }
        selected.push(row);
        oldestSelected = i;
      }
      selected.reverse();
    }
    const names = getClickBrowserNames_(spreadsheet);
    const logs = selected.filter(row => row[0] !== '').slice().reverse().map(row => {
      const browserId = String(row[5] || '');
      return {
        id:String(row[0] || ''), linkId:String(row[1] || ''), title:String(row[2] || ''),
        url:String(row[3] || ''), clickedAt:toIso_(row[4]), browserId:browserId,
        estimatedViewSeconds:row[6]!=='' && row[6]!==undefined && Number.isFinite(Number(row[6])) ? Number(row[6]) : null,
        returnedAt:row[7] ? toIso_(row[7]) : '',
        browserName:names.get(browserId) || '',
        banned:/^[A-Za-z0-9_-]{8,100}$/.test(browserId) && properties['LINK_CORE_BAN_' + browserId] === '1'
      };
    });
    return {logs:logs, nextCursor:nextCursor, pageSize};
  } finally { lock.releaseLock(); }
}


/* 管理者によるクリック履歴の全削除 */
function deleteClickLogs(adminToken) {
  requireAdmin_(adminToken, 'deleteClickLogs');
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
  requireAdmin_(adminToken, 'deleteClickLog');
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


/* LINK BASE notice read receipts. One receipt per browser and notice. */
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
  if (!isSessionValid_('ADMIN', viewerToken)) visitorProfileBrowser_(browser, viewerToken);
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    const sheet=ensureNoticeReadSheet_(),last=sheet.getLastRow();
    let rows=last>=2?sheet.getRange(2,1,last-1,2).getDisplayValues():[];
    if(rows.some(row=>row[0]===id&&row[1]===browser))return isSessionValid_('ADMIN',viewerToken) ? {added:false,count:rows.filter(row=>row[0]===id).length} : {added:false};
    sheet.appendRow([id,browser,new Date()]);
    rows=sheet.getRange(2,1,sheet.getLastRow()-1,2).getDisplayValues();
    return isSessionValid_('ADMIN',viewerToken) ? {added:true,count:rows.filter(row=>row[0]===id).length} : {added:true};
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
  const presence = refreshStaffPresence_(browserId, '');
  return presence ? presence.count : null;
}

function getStaffChatPresence(adminToken, browserId, peerMailbox) {
  requireAdmin_(adminToken);
  if (typeof peerMailbox !== 'string' || (peerMailbox && !/^mbx-[0-9a-f]{64}$/.test(peerMailbox))) {
    throw new Error('トーク相手を確認できません。');
  }
  return refreshStaffPresence_(browserId, peerMailbox);
}

function refreshStaffPresence_(browserId, peerMailbox) {
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
    const active = Object.keys(online);
    return {
      count: active.length,
      peerOnline: peerMailbox ? active.some(id => staffChatMailboxId_(id) === peerMailbox) : null
    };
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
/** 旧スプレッドシートの既読ブラウザIDを、個人トークの相手のメールボックスIDと照合する。 */
function staffPeerHasRead_(readerBrowserIds, recipientMailbox) {
  if (!/^mbx-[0-9a-f]{64}$/.test(String(recipientMailbox || ''))) return false;
  return readerBrowserIds.some(id => validStaffBrowserId_(id) &&
    staffChatMailboxId_(id) === recipientMailbox);
}

function getStaffChatMessages(adminToken, browserId, pageOptions) {
  requireAdmin_(adminToken);
  requireStaffSupabase_();
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
    let latestUnreadRoom = null;
    for (let i = 0; i < identities.length; i++) {
      const author = String(identities[i][0] || '');
      const readers = String(identities[i][1] || '').split(',').filter(Boolean);
      const recipient = String(recipients[i][0] || '');
      const canView = !recipient || (browserValid && (author === browserId || recipient === mailbox));
      if (canView && browserValid && author !== browserId && !readers.includes(browserId)) {
        unreadCount++;
        latestUnreadRoom = recipient ? (staffChatMailboxId_(author) || null) : '';
      }
    }
    return Object.assign({messages:[], nextCursor:null, unreadCount, latestUnreadRoom},metadata);
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
        // 自分が送った個人メッセージのみ、実際の相手の既読に基づく状態を返す。
        peerRead: !!roomScoped && !!room && own && recipient === room
          ? staffPeerHasRead_(readers, room) : null,
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
  requireStaffSupabase_();
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
  requireStaffSupabase_();
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
const STAFF_ATTACHMENT_INLINE_MAX_BYTES = 2 * 1024 * 1024;
const STAFF_ATTACHMENT_MAX_BYTES = 40 * 1024 * 1024; // 33.8MB動画に対応する40MiB上限
const STAFF_ATTACHMENT_CHUNK_BYTES = 1024 * 1024;
const STAFF_ATTACHMENT_UPLOAD_TTL = 2 * 60 * 60;
const STAFF_ATTACHMENT_FOLDER_PROPERTY = 'LINK_CORE_STAFF_ATTACHMENTS_FOLDER_ID';
const STAFF_ATTACHMENT_MIME = Object.freeze({
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', m4v: 'video/x-m4v'
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


function validateStaffAttachmentMeta_(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('添付データが不正です。');
  const filename = String(payload.name || '').replace(/[\\/]/g, '_').replace(/[\x00-\x1f\x7f]/g, '').trim();
  if (!filename || filename.length > 150 || filename.charAt(0) === '.' || /[:<>"|?*]/.test(filename)) throw new Error('ファイル名を確認してください（150文字以内）。');
  const ext = filename.includes('.') ? filename.split('.').pop().toLowerCase() : '';
  const mime = STAFF_ATTACHMENT_MIME[ext];
  if (!mime) throw new Error('このファイル形式は添付できません。');
  const incomingMime = String(payload.mime || '').toLowerCase();
  const fileMimeAlias = (ext === 'csv' && incomingMime === 'application/vnd.ms-excel') ||
    (ext === 'm4v' && incomingMime === 'video/mp4') ||
    (['mp4', 'mov', 'm4v', 'webm'].includes(ext) && incomingMime === 'application/octet-stream');
  if (incomingMime && incomingMime !== mime && !fileMimeAlias) {
    throw new Error('ファイルの拡張子と形式が一致しません。');
  }
  const size = Number(payload.size);
  if (!Number.isSafeInteger(size) || size < 1 || size > STAFF_ATTACHMENT_MAX_BYTES) {
    throw new Error('添付ファイルは40 MiB以内にしてください。');
  }
  return {filename, mime, size, ext};
}

function validateStaffAttachment_(payload) {
  const meta = validateStaffAttachmentMeta_(payload);
  const {filename, mime, ext} = meta;
  const expectedSize = meta.size;
  if (expectedSize > STAFF_ATTACHMENT_INLINE_MAX_BYTES) {
    throw new Error('2 MiBを超えるファイルは分割アップロードで送信してください。');
  }
  const encoded = payload.base64;
  if (typeof encoded !== 'string' || encoded.length > Math.ceil(STAFF_ATTACHMENT_INLINE_MAX_BYTES / 3) * 4 + 4 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('添付データの形式が不正です。');
  const bytes = Utilities.base64Decode(encoded);
  if (bytes.length !== expectedSize) throw new Error('ファイルサイズが一致しません。');
  validateAttachmentSignature_(bytes, ext);
  return {filename, mime, bytes, size:expectedSize};
}

/** 投稿とファイルを1回の呼び出しで作成。requestIdでタイムアウト後の再送を冪等化。 */
function sendStaffChatAttachment(message, payload, requestId, browserId, recipientOrToken, adminToken) {
  // 古い画面からの5引数呼び出しは全員宛てとして扱う。
  if (adminToken === undefined) { adminToken = recipientOrToken; recipientOrToken = ''; }
  requireAdmin_(adminToken);
  requireStaffSupabase_();
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


/* ===== 大容量添付：Drive API再開可能アップロード（1MiBずつ） =====
 * OAuthトークンとDriveのアップロードURLはGASだけに保持する。
 * ブラウザ側は既存のGoogle Apps Script認証を通して各チャンクを送る。
 * 未完了データは約2時間で失効。完了後にチャット投稿と紐付ける。
 */
function staffLargeUploadKey_(requestId) {
  if (typeof requestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(requestId)) {
    throw new Error('ファイルの送信IDが不正です。');
  }
  return 'LC_STAFF_LARGE_' + requestId;
}
function staffLargeUploadState_(requestId, browserId) {
  const state = CacheService.getScriptCache().get(staffLargeUploadKey_(requestId));
  if (!state) throw new Error('アップロードの有効期限が切れました。ファイルを選び直して送信してください。');
  const data = JSON.parse(state);
  if (data.browserId !== browserId) throw new Error('アップロード元が一致しません。');
  return data;
}
function staffSaveLargeUpload_(state) {
  CacheService.getScriptCache().put(staffLargeUploadKey_(state.requestId),
    JSON.stringify(state), STAFF_ATTACHMENT_UPLOAD_TTL);
}
function staffDriveUploadHeaders_(response) {
  return response.getAllHeaders ? response.getAllHeaders() : response.getHeaders();
}
function staffDriveUploadHeader_(response, name) {
  const headers = staffDriveUploadHeaders_(response);
  const key = Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase());
  return key ? String(headers[key]) : '';
}
function staffDriveLargeUploadStatus_(state) {
  const response = UrlFetchApp.fetch(state.sessionUrl, {
    method:'put', followRedirects:false, headers:{
      Authorization:'Bearer ' + ScriptApp.getOAuthToken(),
      'Content-Range':'bytes */' + state.size
    },
    contentType:state.mime, payload:'', muteHttpExceptions:true
  });
  return staffDriveApplyUploadResponse_(state, response);
}
function staffDriveApplyUploadResponse_(state, response) {
  const status = response.getResponseCode();
  if (status === 308) {
    const received = staffDriveUploadHeader_(response, 'Range');
    const matched = received.match(/^bytes=0-(\d+)$/i);
    state.offset = matched ? Number(matched[1]) + 1 : 0;
    if (!Number.isSafeInteger(state.offset) || state.offset > state.size) {
      throw new Error('アップロード進捗が不正です。');
    }
  } else if (status === 200 || status === 201) {
    let item;
    try { item = JSON.parse(response.getContentText()); } catch (_) {}
    if (!item || typeof item.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(item.id)) {
      throw new Error('Driveへのアップロード完了を確認できませんでした。');
    }
    state.fileId = item.id;
    state.offset = state.size;
  } else {
    throw new Error('Driveへのアップロードに失敗しました（HTTP ' + status + '）。');
  }
  staffSaveLargeUpload_(state);
  return {ok:true, offset:state.offset, complete:!!state.fileId};
}

function startStaffChatLargeUpload(message, payload, requestId, browserId, recipientOrToken, adminToken) {
  if (adminToken === undefined) { adminToken = recipientOrToken; recipientOrToken = ''; }
  requireAdmin_(adminToken);
  requireStaffSupabase_();
  if (!validStaffBrowserId_(browserId)) throw new Error('送信元ブラウザを確認できません。');
  staffLargeUploadKey_(requestId);
  requireChatWritable_();
  const meta = validateStaffAttachmentMeta_(payload);
  const recipient = staffChatPrivateRecipient_(recipientOrToken, browserId);
  const body = cleanText_(message, CHAT_MAX_LENGTH);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    requireAdmin_(adminToken);
    let cached = CacheService.getScriptCache().get(staffLargeUploadKey_(requestId));
    if (cached) {
      const state = JSON.parse(cached);
      if (state.browserId !== browserId || state.recipient !== recipient ||
          state.filename !== meta.filename || state.size !== meta.size ||
          state.mime !== meta.mime || state.message !== body) {
        throw new Error('送信IDが別の添付データと重複しています。');
      }
      return {ok:true, offset:state.offset, complete:!!state.fileId,
        chunkSize:STAFF_ATTACHMENT_CHUNK_BYTES};
    }
    if (supabaseChatMode_() === 'supabase') {
      const [existing] = supabaseChatRows_({kind:'eq.staff',request_id:'eq.'+requestId,
        select:'sender,recipient', limit:1});
      if (existing) {
        if (existing.sender !== staffChatMailboxId_(browserId) || existing.recipient !== recipient) {
          throw new Error('送信IDが別の投稿に使用されています。');
        }
        return {ok:true, done:true, duplicate:true};
      }
    } else {
      const sheet = staffChatSheet_(false);
      const last = sheet ? sheet.getLastRow() : 0;
      if (last >= 2 &&
          sheet.getRange(2, 10, last - 1, 1).getDisplayValues().some(row => row[0] === requestId)) {
        return {ok:true, done:true, duplicate:true};
      }
    }
    const folder = staffAttachmentFolder_();
    const response = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,size', {
      method:'post', contentType:'application/json',followRedirects:false,
      headers:{
        Authorization:'Bearer ' + ScriptApp.getOAuthToken(),
        'X-Upload-Content-Type':meta.mime,
        'X-Upload-Content-Length':String(meta.size)
      },
      payload:JSON.stringify({name:meta.filename,mimeType:meta.mime,parents:[folder.getId()]}),
      muteHttpExceptions:true
    });
    if (response.getResponseCode() !== 200) {
      throw new Error('Driveのアップロード準備に失敗しました（HTTP ' + response.getResponseCode() + '）。');
    }
    const sessionUrl = staffDriveUploadHeader_(response, 'Location');
    if (!/^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files(?:\?|\/)/.test(sessionUrl)) {
      throw new Error('Driveのアップロード先を確認できませんでした。');
    }
    const state = {requestId,browserId,recipient,message:body,filename:meta.filename,
      mime:meta.mime,size:meta.size,offset:0,fileId:'',sessionUrl};
    staffSaveLargeUpload_(state);
    return {ok:true,offset:0,complete:false,chunkSize:STAFF_ATTACHMENT_CHUNK_BYTES};
  } finally {
    lock.releaseLock();
  }
}

function appendStaffChatLargeUploadChunk(requestId, browserId, offset, base64, adminToken) {
  requireAdmin_(adminToken);
  requireStaffSupabase_();
  if (!validStaffBrowserId_(browserId)) throw new Error('送信元ブラウザを確認できません。');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    requireAdmin_(adminToken);
    const state = staffLargeUploadState_(requestId, browserId);
    if (state.fileId) return {ok:true,offset:state.size,complete:true};
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > state.size) {
      throw new Error('送信位置が不正です。');
    }
    if (offset !== state.offset) {
      // 通信失敗後に同じチャンクが再送された場合は進捗のみ返す。
      return {ok:true,offset:state.offset,complete:false};
    }
    if (typeof base64 !== 'string' || base64.length > Math.ceil(STAFF_ATTACHMENT_CHUNK_BYTES / 3) * 4 + 4 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error('分割データが不正です。');
    const bytes = Utilities.base64Decode(base64);
    if (!bytes.length || bytes.length > STAFF_ATTACHMENT_CHUNK_BYTES ||
        offset + bytes.length > state.size ||
        (offset + bytes.length < state.size && bytes.length % (256 * 1024) !== 0)) {
      throw new Error('分割データの容量が不正です。');
    }
    if (offset === 0) validateAttachmentSignature_(bytes, state.filename.split('.').pop().toLowerCase());
    let response;
    try {
      response = UrlFetchApp.fetch(state.sessionUrl, {
        method:'put',contentType:state.mime,payload:bytes,followRedirects:false,
        headers:{
          Authorization:'Bearer ' + ScriptApp.getOAuthToken(),
          'Content-Range':'bytes ' + offset + '-' + (offset + bytes.length - 1) + '/' + state.size
        },
        muteHttpExceptions:true
      });
    } catch (_) {
      // アップロード自体が成功し、GASへの応答だけ失われた場合に備え進捗を再照会。
      return staffDriveLargeUploadStatus_(state);
    }
    if (![200,201,308].includes(response.getResponseCode())) {
      return staffDriveLargeUploadStatus_(state);
    }
    return staffDriveApplyUploadResponse_(state, response);
  } finally {
    lock.releaseLock();
  }
}

function finishStaffChatLargeUpload(requestId, browserId, adminToken) {
  requireAdmin_(adminToken);
  requireStaffSupabase_();
  if (!validStaffBrowserId_(browserId)) throw new Error('送信元ブラウザを確認できません。');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    requireAdmin_(adminToken);
    requireChatWritable_();
    const state = staffLargeUploadState_(requestId, browserId);
    if (!state.fileId || state.offset !== state.size) throw new Error('アップロードがまだ完了していません。');
    const uploaded = DriveApp.getFileById(state.fileId);
    if (uploaded.isTrashed() || !staffAttachmentFileIsInFolder_(uploaded) || uploaded.getSize() !== state.size) {
      throw new Error('保存された添付ファイルを確認できませんでした。');
    }
    if (supabaseChatMode_() === 'supabase') {
      const [existing] = supabaseChatRows_({kind:'eq.staff',request_id:'eq.'+requestId,
        select:'sender,recipient,file_id',limit:1});
      if (existing) {
        if (existing.sender !== staffChatMailboxId_(browserId) || existing.recipient !== state.recipient) {
          throw new Error('送信IDが別の投稿に使用されています。');
        }
        if (existing.file_id !== state.fileId) uploaded.setTrashed(true);
        CacheService.getScriptCache().remove(staffLargeUploadKey_(requestId));
        return {ok:true,duplicate:true};
      }
      supabaseChatInsert_('staff', {body:state.message, sender:staffChatMailboxId_(browserId),
        recipient:state.recipient,file_id:state.fileId,file_name:state.filename,
        file_mime:state.mime,file_size:state.size,request_id:requestId});
    } else {
      const sheet = staffChatSheet_(true);
      const last = sheet.getLastRow();
      if (last >= 2 &&
          sheet.getRange(2, 10, last - 1, 1).getDisplayValues().some(row => row[0] === requestId)) {
        CacheService.getScriptCache().remove(staffLargeUploadKey_(requestId));
        return {ok:true,duplicate:true};
      }
      sheet.appendRow([Utilities.getUuid(),safeCell_(state.message),new Date(),browserId,'',
        state.fileId,safeCell_(state.filename),state.mime,state.size,requestId,state.recipient]);
    }
    CacheService.getScriptCache().remove(staffLargeUploadKey_(requestId));
    return {ok:true};
  } finally {
    lock.releaseLock();
  }
}

/** Drive共有URLは渡さず、認証済み管理者に該当投稿のデータのみ返す。 */

function staffAttachmentAuthorizedFile_(messageId, browserId) {
  if (typeof messageId !== 'string' || !/^[0-9a-f-]{36}$/i.test(messageId)) throw new Error('投稿IDが不正です。');
  let row;
  if (supabaseChatMode_() === 'supabase') {
    const [message] = supabaseChatRows_({kind:'eq.staff', id:supabaseChatIdFilter_(messageId),
      or:supabaseStaffAccess_(staffChatMailboxId_(browserId)),
      select:'file_id,file_name,file_mime,file_size',limit:1});
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
  const size = file.getSize();
  if (size < 1 || size > STAFF_ATTACHMENT_MAX_BYTES) throw new Error('添付ファイルの容量が上限を超えています。');
  return {file,size,name:String(row[6] || 'attachment'),
    mime:String(row[7] || 'application/octet-stream')};
}

/** 2MiB以下は従来のBase64、動画など大容量は分割ダウンロードに切り替える。 */
function getStaffChatAttachment(messageId, browserOrToken, adminToken) {
  const browserId = adminToken === undefined ? '' : browserOrToken;
  if (adminToken === undefined) adminToken = browserOrToken;
  requireAdmin_(adminToken);
  requireStaffSupabase_();
  const item = staffAttachmentAuthorizedFile_(messageId, browserId);
  const meta = {name:item.name,mime:item.mime,size:item.size};
  if (item.size > STAFF_ATTACHMENT_INLINE_MAX_BYTES) {
    return Object.assign(meta,{chunked:true,chunkSize:STAFF_ATTACHMENT_CHUNK_BYTES});
  }
  return Object.assign(meta,{base64:Utilities.base64Encode(item.file.getBlob().getBytes())});
}

/** メッセージへのアクセス権を毎回確認し、DriveのRange APIから1MiBずつ返す。 */
function getStaffChatAttachmentChunk(messageId, offset, browserOrToken, adminToken) {
  const browserId = adminToken === undefined ? '' : browserOrToken;
  if (adminToken === undefined) adminToken = browserOrToken;
  requireAdmin_(adminToken);
  requireStaffSupabase_();
  const item = staffAttachmentAuthorizedFile_(messageId, browserId);
  if (item.size <= STAFF_ATTACHMENT_INLINE_MAX_BYTES) {
    throw new Error('このファイルは通常のダウンロードを使用してください。');
  }
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= item.size ||
      offset % STAFF_ATTACHMENT_CHUNK_BYTES !== 0) throw new Error('ダウンロード位置が不正です。');
  const end = Math.min(offset + STAFF_ATTACHMENT_CHUNK_BYTES,item.size) - 1;
  const response = UrlFetchApp.fetch(
    'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(item.file.getId()) + '?alt=media',
    {method:'get',headers:{
      Authorization:'Bearer ' + ScriptApp.getOAuthToken(),
      Range:'bytes=' + offset + '-' + end
    },muteHttpExceptions:true}
  );
  if (response.getResponseCode() !== 206) {
    throw new Error('Driveから動画を分割取得できませんでした（HTTP ' + response.getResponseCode() + '）。');
  }
  const bytes = response.getContent();
  if (bytes.length !== end - offset + 1) throw new Error('取得した動画データの長さが一致しません。');
  return {ok:true,base64:Utilities.base64Encode(bytes),offset,
    nextOffset:end + 1,size:item.size};
}

function deleteStaffChatMessage(id, browserId, adminToken) {
  requireAdmin_(adminToken, 'deleteStaffChatMessage');
  requireStaffSupabase_();
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
function recordVisitorCounter_(browserId, lockedSpreadsheet) {
  if (typeof browserId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(browserId)) return;
  const cache = CacheService.getScriptCache();
  const day = visitorCounterToday_();
  if (day < VISITOR_COUNTER_MIN_DATE) return;
  const digest = visitorCounterDigest_(browserId, visitorCounterSalt_());
  const cacheKey = 'LINK_CORE_COUNTED_V1_' + day + '_' + digest;
  if (cache.get(cacheKey) === '1') return;
  const lock = lockedSpreadsheet ? null : LockService.getScriptLock();
  let acquired = false;
  try {
    if (lock) { lock.waitLock(10000); acquired = true; }
    if (cache.get(cacheKey) === '1') return;
    let sheet = lockedSpreadsheet ? lockedSpreadsheet.getSheetByName(VISITOR_COUNTER_SHEET) : null;
    if (!sheet || sheet.getLastRow() === 0) sheet = visitorCounterSheet_(true);
    const last = sheet.getLastRow();
    // Search this browser's history rather than transferring every visitor's rows.
    const matches = last > 1 ? sheet.getRange(2, 2, last - 1, 1)
      .createTextFinder(digest).matchEntireCell(true).matchCase(true).findAll() : [];
    // One date read for the matching span instead of a remote request per visit.
    let counted = false;
    if (matches.length) {
      const rowNumbers = matches.map(cell => cell.getRow());
      const first = rowNumbers.reduce((a,b) => Math.min(a,b)), lastMatch = rowNumbers.reduce((a,b) => Math.max(a,b));
      const dates = sheet.getRange(first, 1, lastMatch - first + 1, 1).getValues();
      counted = rowNumbers.some(row => visitorCounterDateKey_(dates[row - first][0]) === day);
    }
    if (!counted) sheet.appendRow([day, digest, new Date()]);
    // Cache is only an optimization. A miss always checks the persisted records under the lock.
    cache.put(cacheKey, '1', 21600);
  } catch (error) {
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
    const lastRow = sheet.getLastRow();
    if (!lastRow) sheet.appendRow(['ログイン日時', 'ブラウザID', '履歴ID']);
    else if (sheet.getLastColumn() === 1) sheet.getRange(1, 2).setValue('ブラウザID');
    sheet.appendRow([new Date(), safeCell_(idForLog), Utilities.getUuid()]);
    recordVisitorCounter_(browserId, spreadsheet);
  } catch (error) {
    console.error('利用者ログイン履歴の保存に失敗しました。', error.message);
  } finally {
    if (locked) lock.releaseLock();
  }
}

function getVisitorLoginLogs(adminToken) {
  requireAdmin_(adminToken);
  const properties = PropertiesService.getScriptProperties().getProperties();
  const spreadsheetId = properties[SPREADSHEET_PROPERTY];
  if (!spreadsheetId) throw new Error('スプレッドシートIDが未設定です。');
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const lock = LockService.getScriptLock();
  let rows, history;
  lock.waitLock(10000);
  try {
    const sheet = spreadsheet.getSheetByName('VisitorLoginLogs');
    const last = sheet ? sheet.getLastRow() : 0;
    if (last < 2) return {logs: []};
    const first = Math.max(2, last - 199);
    rows = sheet.getRange(first, 1, last - first + 1, 3).getValues();
    // Only legacy rows need repair. Normal reads do not write to the sheet.
    if (rows.some(row => row[0] && !row[2])) {
      rows.forEach(row => { if (row[0] && !row[2]) row[2] = Utilities.getUuid(); });
      sheet.getRange(first, 3, rows.length, 1).setValues(rows.map(row => [row[2]]));
      sheet.getRange(1, 3).setValue('履歴ID');
    }
    // Keep all dates for an exact streak, but reuse the page when it is complete.
    history = first === 2 ? rows : sheet.getRange(2, 1, last - 1, 2).getValues();
  } finally {
    lock.releaseLock();
  }
  const names = getClickBrowserNames_(spreadsheet);
  const profiles = visitorChatProfilesByBrowser_(spreadsheet);
  const browsers = new Set(rows.filter(row => row[0]).map(row => String(row[1] || '')));
  const streaks = visitorLoginStreaks_(history, browsers, Date.now());
  return {logs: rows.slice().reverse().filter(row => row[0]).map(([date, browserId, id]) => {
    const browser = String(browserId || '');
    const streak = streaks.get(browser) || 0;
    return {
      date:toIso_(date), browserId:browser, id:String(id),
      browserName:names.get(browser) || '',
      school:profiles.get(browser)?.school || '', filter:profiles.get(browser)?.filter || '',
      banned:/^[A-Za-z0-9_-]{8,100}$/.test(browser) && properties['LINK_CORE_BAN_' + browser] === '1',
      loginStreak:streak, regularVisitor:streak >= 3
    };
  })};
}

/** JST has a fixed UTC+9 offset. No remote date formatting is needed per row. */
function visitorLoginStreaks_(history, browsers, now) {
  const dayNumber = value => {
    const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
    return Number.isFinite(timestamp) ? Math.floor((timestamp + 9 * 3600000) / 86400000) : null;
  };
  const today = dayNumber(now);
  const daysByBrowser = new Map();
  history.forEach(([date, browser]) => {
    const key = String(browser || '');
    if (!date || !key || !browsers.has(key)) return;
    const day = dayNumber(date);
    if (day === null || day > today) return;
    if (!daysByBrowser.has(key)) daysByBrowser.set(key, new Set());
    daysByBrowser.get(key).add(day);
  });
  const streaks = new Map();
  daysByBrowser.forEach((days, browser) => {
    let cursor = days.has(today) ? today : today - 1;
    let streak = 0;
    while (days.has(cursor)) { streak++; cursor--; }
    streaks.set(browser, streak);
  });
  return streaks;
}

function visitorLoginLogSheet_() {
  const id = PropertiesService.getScriptProperties().getProperty(SPREADSHEET_PROPERTY);
  return SpreadsheetApp.openById(id).getSheetByName('VisitorLoginLogs');
}

function deleteVisitorLoginLog(id, adminToken) {
  requireAdmin_(adminToken, 'deleteVisitorLoginLog');
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
  requireAdmin_(adminToken, 'deleteVisitorLoginLogs');
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
  requireAdmin_(adminToken, 'setStaffNickname');
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
  const rows = supabaseChatRows_({kind:'eq.public', select:'id,author,body,created_at,has_image,reply_to', order:'seq.desc', limit:CHAT_MAX_MESSAGES});
  const targets = new Map(rows.map(row => [row.id, row]));
  return rows.reverse().map(row => ({id:row.id, author:row.author, message:row.body,
    createdAt:row.created_at, hasScreenshot:!!row.has_image,
    reply:targets.has(row.reply_to) ? {author:targets.get(row.reply_to).author || '利用者',
      message:String(targets.get(row.reply_to).body || 'メッセージ').slice(0,120)} : undefined}));
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
    const result = supabaseChatRequest_('post', 'rpc/link_core_staff_summary',
      {mailbox:mailbox || '', include_conversations:opts.mode === 'conversations'});
    if (!result || !Array.isArray(result.messages)) throw new Error('管理者チャット一覧を取得できませんでした。');
    if (opts.mode === 'conversations') {
      if (!Array.isArray(result.conversations)) throw new Error('トーク一覧の応答が不正です。');
      const names = PropertiesService.getScriptProperties().getProperties();
      result.conversations = result.conversations.map(peer => ({
        mailboxId:peer.mailboxId, name:names[STAFF_CHAT_MEMBER_PREFIX + peer.mailboxId] || '管理者'
      }));
    }
    return Object.assign(result, metadata);
  }
  const query = Object.assign(base, {select:'seq,id,sender,recipient,body,created_at,readers,file_name,file_mime,file_size,reply_to', limit:limit+1});
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
  const targets = new Map(page.map(row => [row.id, row]));
  const messages = page.slice().reverse().map(row => ({
    id:row.id, author:names[STAFF_CHAT_MEMBER_PREFIX+row.sender] || '管理者',
    message:row.body, createdAt:row.created_at, own:!!mailbox && row.sender===mailbox,
    readCount:row.readers.length, unread:!!mailbox && row.sender!==mailbox && !row.readers.includes(mailbox),
    reply:targets.has(row.reply_to) ? {author:names[STAFF_CHAT_MEMBER_PREFIX+targets.get(row.reply_to).sender] || '管理者',
      senderMailbox:targets.get(row.reply_to).sender,
      message:String(targets.get(row.reply_to).body || targets.get(row.reply_to).file_name || 'メッセージ').slice(0,120)} : undefined,
    peerRead:roomScoped && !!opts.room && row.sender===mailbox && row.recipient===opts.room
      ? row.readers.includes(opts.room) : null,
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
  const directClaims = {};
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'chat-writer:' + viewerToken);
  directClaims.link_core_writer = digest.map(byte => (byte & 255).toString(16).padStart(2, '0')).join('');
  if (isSessionValid_('ADMIN', viewerToken)) {
    topics.push('lc-chat-direct-admin', 'lc-chat-staff-all');
    const staffMailbox = staffChatMailboxId_(staffBrowserId);
    if (staffMailbox) {
      topics.push('lc-chat-staff-' + staffMailbox);
      directClaims.link_core_staff_mailbox = staffMailbox;
      const propsByName = props.getProperties();
      directClaims.link_core_staff_name = propsByName[STAFF_CHAT_MEMBER_PREFIX + staffMailbox] || '管理者';
      directClaims.link_core_staff_recipients = Object.keys(propsByName)
        .filter(key => key.startsWith(STAFF_CHAT_MEMBER_PREFIX))
        .map(key => key.slice(STAFF_CHAT_MEMBER_PREFIX.length))
        .filter(id => /^mbx-[0-9a-f]{64}$/.test(id) && id !== staffMailbox)
        .slice(0, 80);
    }
  } else {
    const browser = CacheService.getScriptCache().get('LINK_CORE_VISITOR_DM_' + viewerToken);
    if (browser && /^[A-Za-z0-9_-]{8,100}$/.test(browser)) {
      directClaims.link_core_visitor_browser = browser;
      topics.push('lc-chat-direct-vb_' + browser);
    }
  }
  const now = Math.floor(Date.now() / 1000);
  let exp = now + 120;
  if(!topics.includes('lc-chat-direct-admin')){
    const browser=CacheService.getScriptCache().get('LINK_CORE_VISITOR_BROWSER_'+viewerToken);
    const downtime=visitorDowntimeState_(browser);
    if(downtime.nextStart> Date.now())exp=Math.min(exp,Math.floor(downtime.nextStart/1000));
  }
  const encode = value => Utilities.base64EncodeWebSafe(value).replace(/=+$/, '');
  const header = encode(JSON.stringify({alg:'HS256', typ:'JWT'}));
  const claims = encode(JSON.stringify(Object.assign({role:'authenticated', aud:'authenticated', sub:Utilities.getUuid(),
    iat:now, exp, link_core_topics:topics}, directClaims)));
  const body = header + '.' + claims;
  const signature = encode(Utilities.computeHmacSha256Signature(body, signingSecret));
  return {enabled:true, url, key, token:body + '.' + signature, topics, visitorDm:!!directClaims.link_core_visitor_browser || topics.includes('lc-chat-direct-admin'), recipients:directClaims.link_core_staff_recipients || [], direct:true, expiresAt:exp*1000};
}

/**
 * 利用者との個人トーク専用GASプロキシ。
 * iOS Safariなどでブラウザ→Supabaseのクロスオリジンfetchが
 * "Load failed" になる場合でも、既存の安全なGASブリッジ経由で送受信する。
 * 送信元はGASセッショントークンから検証した短命のJWTで識別する。
 * クライアントが要求した管理者権限・ブラウザIDをJWTには使用しない。
 */
function visitorDirectChatProxy(parameters, viewerToken) {
  requireLinkViewer_(viewerToken);
  if (supabaseChatMode_() !== 'supabase') {
    throw new Error('個人トークはSupabaseに接続されていません。GASとSupabaseの設定を確認してください。');
  }
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) {
    throw new Error('個人トークのリクエストが不正です。');
  }
  const operation = parameters.operation;
  if (!['list', 'read', 'send', 'requireReply', 'markRead', 'delete', 'presence', 'uploadStart', 'uploadChunk', 'attachment'].includes(operation)) {
    throw new Error('個人トークの操作を確認してください。');
  }
  const isAdmin = isSessionValid_('ADMIN', viewerToken);
  if (operation === 'list' && !isAdmin) throw new Error('管理者専用の操作です。');
  const browser = parameters.browser === undefined ? '' : parameters.browser;
  if (typeof browser !== 'string' ||
      (browser !== '' && !/^[A-Za-z0-9_-]{8,100}$/.test(browser)) ||
      (isAdmin && operation !== 'list' && !browser) ||
      (!isAdmin && browser)) {
    throw new Error('トーク相手のブラウザIDを確認してください。');
  }
  const beforeCursor = parameters.before_cursor == null ? null : parameters.before_cursor;
  if (beforeCursor !== null &&
      (!Number.isSafeInteger(beforeCursor) || beforeCursor < 1)) {
    throw new Error('読み込み位置が不正です。');
  }
  let message = '';
  let messageId = null;
  if (operation === 'send') {
    if (typeof parameters.message !== 'string') throw new Error('送信するメッセージが不正です。');
    message = parameters.message.trim();
    if ((!message && !parameters.upload_id) || message.length > 1000) throw new Error('メッセージは1〜1000文字で入力してください。');
    messageId = parameters.message_id;
    if (typeof messageId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(messageId)) {
      throw new Error('メッセージ送信IDが不正です。');
    }
  }
  // GASの認証済みセッションから利用者のブラウザIDを引く。クライアント指定のIDは信用しない。
  const ownBrowser = isAdmin ? '' : CacheService.getScriptCache().get('LINK_CORE_VISITOR_DM_' + viewerToken);
  if (!isAdmin && (!ownBrowser || !/^[A-Za-z0-9_-]{8,100}$/.test(ownBrowser))) {
    throw new Error('個人トークの登録を確認できません。利用者ページから再ログインしてください。');
  }
  const peer = isAdmin ? browser : ownBrowser;
  const base = 'link_core_chat?kind=eq.direct&recipient=eq.' + encodeURIComponent('vb_' + peer);
  const author = isAdmin ? '管理者' : '利用者';
  if (operation === 'presence') {
    const cache = CacheService.getScriptCache();
    const key = 'LC_DM_PRESENCE_' + peer + '_';
    cache.put(key + author, String(Date.now()), 90);
    const other = Number(cache.get(key + (isAdmin ? '利用者' : '管理者')) || 0);
    return {online:other > Date.now() - 90000};
  }
  if (operation === 'uploadStart' || operation === 'uploadChunk') {
    return visitorDmUpload_(parameters, peer, author, viewerToken);
  }
  if (operation === 'attachment') {
    const id = parameters.message_id;
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('添付IDが不正です。');
    const [item] = supabaseChatRequest_('get', base + '&id=eq.' + id + '&select=file_id,file_name,file_mime,file_size&limit=1');
    if (!item?.file_id) throw new Error('添付が見つかりません。');
    const file = DriveApp.getFileById(item.file_id);
    if (file.isTrashed() || !staffAttachmentFileIsInFolder_(file)) throw new Error('添付を取得できません。');
    const size = Number(item.file_size);
    const offset = parameters.offset;
    if (!Number.isSafeInteger(size) || size < 1 || size > STAFF_ATTACHMENT_MAX_BYTES ||
        !Number.isSafeInteger(offset) || offset < 0 || offset >= size || offset % STAFF_ATTACHMENT_CHUNK_BYTES !== 0) {
      throw new Error('添付の取得位置が不正です。');
    }
    let bytes;
    if (size <= STAFF_ATTACHMENT_INLINE_MAX_BYTES) bytes = file.getBlob().getBytes();
    else {
      const end = Math.min(size, offset + STAFF_ATTACHMENT_CHUNK_BYTES) - 1;
      const response = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(item.file_id) + '?alt=media',
        {headers:{Authorization:'Bearer ' + ScriptApp.getOAuthToken(), Range:'bytes=' + offset + '-' + end},muteHttpExceptions:true});
      if (response.getResponseCode() !== 206) throw new Error('添付の分割取得に失敗しました。');
      bytes = response.getContent();
      if (bytes.length !== end - offset + 1) throw new Error('添付のサイズが一致しません。');
    }
    return {base64:Utilities.base64Encode(bytes), nextOffset:offset + bytes.length,
      size, name:item.file_name, mime:item.file_mime};
  }
  if (operation === 'delete') {
    if (!isAdmin) throw new Error('送信取消は管理者のみ利用できます。');
    const id = parameters.message_id;
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('投稿IDが不正です。');
    const lock = LockService.getScriptLock(); lock.waitLock(10000);
    try {
      const [item] = supabaseChatRequest_('get', base + '&id=eq.' + id + '&select=author,file_id&limit=1');
      if (!item) return {ok:true};
      if (item.author !== '管理者') throw new Error('管理者の投稿のみ取り消せます。');
      supabaseChatRequest_('delete', base + '&id=eq.' + id);
      PropertiesService.getScriptProperties().setProperty('LINK_CORE_REQUIRED_REPLY_' + peer,
        JSON.stringify(visitorRequiredReplies_(peer).filter(value => value !== id)));
      trashStaffChatFile_(item.file_id);
      return {ok:true};
    } finally { lock.releaseLock(); }
  }
  if (operation === 'markRead') {
    const ids = parameters.message_ids;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100 ||
        ids.some(id => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
      throw new Error('既読にするメッセージの指定が不正です。');
    }
    const targets = supabaseChatRequest_('get', base + '&id=in.(' + Array.from(new Set(ids)).join(',') + ')&select=id,author,readers');
    const incoming = targets.filter(row => row.author === (isAdmin ? '利用者' : '管理者'));
    const reader = isAdmin ? 'dm_admin' : 'dm_visitor';
    const groups = new Map();
    incoming.forEach(row => {
      const readers = Array.isArray(row.readers) ? row.readers : [];
      if (readers.includes(reader)) return;
      const values = Array.from(new Set([...readers,reader])).sort();
      const key = JSON.stringify(values);
      if (!groups.has(key)) groups.set(key, {readers:values,ids:[]});
      groups.get(key).ids.push(row.id);
    });
    groups.forEach(group => {
      // Merge existing receipts; retries and simultaneous readers keep their markers.
      supabaseChatRequest_('patch', base + '&id=in.(' + group.ids.join(',') + ')', {readers:group.readers});
    });
    return {ok:true,ids:incoming.map(row => row.id)};
  }
  if (operation === 'requireReply') {
    if (!isAdmin) throw new Error('管理者専用の操作です。');
    if (typeof parameters.required !== 'boolean' || typeof parameters.message_id !== 'string' ||
        !/^[0-9a-f-]{36}$/i.test(parameters.message_id)) throw new Error('返信必須の指定が不正です。');
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const target = supabaseChatRequest_('get', base + '&id=eq.' + encodeURIComponent(parameters.message_id) + '&select=id,author&limit=1');
      if (!target.length || target[0].author !== '管理者') throw new Error('管理者のメッセージを選んでください。');
      const pending = visitorRequiredReplies_(peer).filter(id => id !== parameters.message_id);
      if (parameters.required) pending.push(parameters.message_id);
      if (pending.length > 50) throw new Error('返信必須は同時に50件まで設定できます。');
      PropertiesService.getScriptProperties().setProperty('LINK_CORE_REQUIRED_REPLY_' + peer, JSON.stringify(pending));
      return {ok:true};
    } finally { lock.releaseLock(); }
  }
  if (operation === 'list') {
    const cacheKey = 'LC_DM_ADMIN_ROOMS_V1';
    const cached = readChunkedJsonCache_(cacheKey);
    if (cached) return cached;
    const rows = supabaseChatRequest_('get', 'link_core_chat?kind=eq.direct&recipient=like.vb_*&select=id,author,recipient,body,created_at,seq&order=seq.desc&limit=500');
    const seen = new Set();
    const names = getClickBrowserNames_();
    const result = {
      rooms:rows.filter(row => {if (seen.has(row.recipient)) return false; seen.add(row.recipient); return true;})
        .map(row => ({browserId:String(row.recipient).slice(3),browserName:names.get(String(row.recipient).slice(3)) || '',lastMessage:String(row.body).slice(0,90),createdAt:row.created_at})),
      incoming:rows.filter(row => row.author !== '管理者').map(row => ({
        id:row.id, browserId:String(row.recipient).slice(3), createdAt:row.created_at
      }))
    };
    writeChunkedJsonCache_(cacheKey, result, 10);
    return result;
  }
  if (operation === 'read') {
    const pending = visitorRequiredReplies_(peer);
    const summary=parameters.summary===true;
    const fields=summary?'id,author,seq':'id,author,body,created_at,seq,readers,reply_to,file_name,file_mime,file_size';
    const query = base + (beforeCursor ? '&seq=lt.' + beforeCursor : '') + '&select='+fields+'&order=seq.desc&limit=101';
    const rows = supabaseChatRequest_('get', query);
    const more = rows.length > 100;
    const page = rows.slice(0,100);
    // Required messages must remain reachable even when older than the latest page.
    const requiredRows = pending.length ? supabaseChatRequest_('get', base + '&id=in.(' + pending.join(',') + ')&select='+fields+'&order=seq.asc') : [];
    const present = new Set(page.map(row => row.id));
    const messages = page.slice().reverse();
    requiredRows.forEach(row => { if (!present.has(row.id)) messages.unshift(row); });
    messages.sort((a,b) => a.seq - b.seq);
    if(summary)return {replyRequired:pending.length>0,requiredReplyIds:pending,messages:messages.map(row=>({id:row.id,own:row.author===author}))};
    const visibleIds = parameters.receipt_ids || [];
    if (!Array.isArray(visibleIds) || visibleIds.length > 100 ||
        visibleIds.some(id => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
      throw new Error('既読確認の対象が不正です。');
    }
    const displayed = new Set(messages.map(row => row.id));
    const extraIds = Array.from(new Set(visibleIds)).filter(id => !displayed.has(id));
    const receipts = extraIds.length ? supabaseChatRequest_('get', base + '&id=in.(' + extraIds.join(',') + ')&select=id,readers') : [];

    return {receipts:receipts.map(row => ({id:row.id,
      readByPeer:Array.isArray(row.readers) && row.readers.includes(isAdmin ? 'dm_visitor' : 'dm_admin'),
      readByMe:Array.isArray(row.readers) && row.readers.includes(isAdmin ? 'dm_admin' : 'dm_visitor')})),
      replyRequired:pending.length > 0,requiredReplyIds:pending,browserName:isAdmin ? getClickBrowserNames_().get(peer) || '' : undefined,
      messages:messages.map(row=>({id:row.id,author:row.author,message:row.body,createdAt:row.created_at,
      replyRequired:pending.includes(row.id), replyTo:row.reply_to,
      attachment:row.file_name ? {name:row.file_name,mime:row.file_mime,size:row.file_size} : null,
      readByPeer:Array.isArray(row.readers) && row.readers.includes(isAdmin ? 'dm_visitor' : 'dm_admin'),
      readByMe:Array.isArray(row.readers) && row.readers.includes(isAdmin ? 'dm_admin' : 'dm_visitor'),
      own:row.author === (isAdmin ? '管理者' : '利用者')})),nextCursor:more ? page[page.length-1].seq : null};
  }
  // 管理者から未登録の利用者には送らない。本人の登録はログイン時に行う。
  const identities = supabaseChatRequest_('get', 'link_core_visitor_chat_identity?browser_id=eq.' + encodeURIComponent(peer) + '&select=browser_id&limit=1');
  if (!identities.length) throw new Error('この利用者はまだ個人トークに接続していません。利用者ページから再ログインしてください。');
  const cache = CacheService.getScriptCache();
  const rateKey = 'LINK_CORE_DM_RATE_' + viewerToken;
  if (cache.get(rateKey)) throw new Error('少し待ってから再送してください。');
  cache.put(rateKey, '1', 2);
  const replyTo = parameters.reply_to;
  if (replyTo != null && (typeof replyTo !== 'string' || !/^[0-9a-f-]{36}$/i.test(replyTo))) throw new Error('返信先が不正です。');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const pending = visitorRequiredReplies_(peer);
    if (replyTo) {
      const targets = supabaseChatRequest_('get', base + '&id=eq.' + replyTo + '&select=id&limit=1');
      if (!targets.length) throw new Error('返信先が見つかりません。');
    }
    const [existing] = supabaseChatRequest_('get', 'link_core_chat?id=eq.' + messageId + '&select=recipient,author,reply_to,body&limit=1');
    if (existing && (existing.recipient !== 'vb_' + peer || existing.author !== author || existing.body !== message ||
        (existing.reply_to || null) !== (replyTo || null))) throw new Error('送信IDが重複しています。');
    let attachment = {};
    if (parameters.upload_id) {
      const state = visitorDmUploadState_(parameters.upload_id, peer, author, viewerToken);
      if (!state.fileId || state.offset !== state.size) throw new Error('添付の転送が完了していません。');
      const file = DriveApp.getFileById(state.fileId);
      if (file.isTrashed() || !staffAttachmentFileIsInFolder_(file) || file.getSize() !== state.size) throw new Error('添付の保存を確認できません。');
      if (state.messageId && state.messageId !== messageId) throw new Error('添付は送信済みです。');
      state.messageId = messageId;
      visitorDmSaveUpload_(state);
      attachment = {file_id:state.fileId,file_name:state.filename,file_mime:state.mime,file_size:state.size};
    }
    if (!existing) supabaseChatRequest_('post', 'link_core_chat', Object.assign({kind:'direct',id:messageId,
      created_at:new Date().toISOString(),author,recipient:'vb_' + peer,body:message,reply_to:replyTo || null},attachment));
    if (!isAdmin && replyTo) {
      PropertiesService.getScriptProperties().setProperty('LINK_CORE_REQUIRED_REPLY_' + peer, JSON.stringify(pending.filter(id => id !== replyTo)));
    }
    return {ok:true};
  } finally { lock.releaseLock(); }
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

/** Pending required replies are durable and bound to the authenticated browser. */
function visitorRequiredReplies_(browser) {
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(String(browser || ''))) return [];
  const raw = PropertiesService.getScriptProperties().getProperty('LINK_CORE_REQUIRED_REPLY_' + browser);
  return raw ? JSON.parse(raw) : [];
}
function visitorReplyGate_(token) {
  const browser = CacheService.getScriptCache().get('LINK_CORE_VISITOR_BROWSER_' + token);
  return visitorRequiredReplies_(browser).length > 0;
}

/** Visitor presence: 30-second heartbeat, 90-second expiry, one count per browser. */
function pulseVisitorOnline(active, visitorToken) {
  if (typeof active !== 'boolean' || !isSessionValid_('VISITOR', visitorToken)) {
    throw new Error('利用者ログインが必要です。');
  }
  const browser = CacheService.getScriptCache().get('LINK_CORE_VISITOR_BROWSER_' + visitorToken);
  return visitorOnlineSnapshot_(visitorToken, browser, active, false);
}
function getOnlineVisitors(adminToken) {
  requireAdmin_(adminToken);
  return visitorOnlineSnapshot_('', '', false, true);
}
function visitorOnlineSnapshot_(token, browser, active, includeNames, omitProfiles) {
  const generation = visitorSessionGeneration_();
  const key = 'LINK_CORE_VISITOR_ONLINE_V1_' + generation;
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  let visitors;
  try {
    const now = Date.now();
    const sessions = readChunkedJsonCache_(key) || {};
    if (token) {
      if (active) sessions[token] = {browserId:browser, lastSeen:now};
      else delete sessions[token];
    }
    const tokens = Object.keys(sessions);
    const cacheKeys = tokens.map(id => 'LINK_CORE_VISITOR_' + id);
    const validSessions = cacheKeys.length ? CacheService.getScriptCache().getAll(cacheKeys) : {};
    const properties = PropertiesService.getScriptProperties().getProperties();
    const byBrowser = new Map();
    tokens.forEach(id => {
      const item = sessions[id];
      const session = String(validSessions['LINK_CORE_VISITOR_' + id] || '').split(':');
      if (!item || !/^[A-Za-z0-9_-]{8,100}$/.test(String(item.browserId || '')) ||
          !(item.lastSeen > now - 90000) || !(Number(session[1]) > now) ||
          session[0] !== generation || properties['LINK_CORE_BAN_' + item.browserId] === '1') {
        delete sessions[id]; return;
      }
      byBrowser.set(item.browserId, Math.max(byBrowser.get(item.browserId) || 0, item.lastSeen));
    });
    writeChunkedJsonCache_(key, sessions, 120);
    visitors = Array.from(byBrowser, ([browserId,lastSeen]) => ({browserId:browserId,lastSeen:new Date(lastSeen).toISOString()}))
      .sort((a,b) => b.lastSeen.localeCompare(a.lastSeen));
  } finally { lock.releaseLock(); }
  if (!includeNames) return {count:visitors.length};
  if (omitProfiles) return {count:visitors.length, logs:visitors};
  const spreadsheet = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty(SPREADSHEET_PROPERTY));
  const names = getClickBrowserNames_(spreadsheet);
  const profiles = visitorChatProfilesByBrowser_(spreadsheet);
  return {count:visitors.length,logs:visitors.map(item => ({
    browserId:item.browserId,browserName:names.get(item.browserId) || '',lastSeen:item.lastSeen,
    school:profiles.get(item.browserId)?.school || '',filter:profiles.get(item.browserId)?.filter || ''
  }))};
}

/** Admin-only callers join saved chat profiles by browser ID in one sheet read. */
function visitorChatProfilesByBrowser_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName('VisitorChatProfiles');
  const last = sheet ? sheet.getLastRow() : 0;
  const profiles = new Map();
  if (last < 2) return profiles;
  sheet.getRange(2, 1, last - 1, 6).getDisplayValues().forEach(row => {
    const id = String(row[0] || '');
    if (/^[A-Za-z0-9_-]{8,100}$/.test(id)) profiles.set(id, {school:String(row[1] || ''), filter:String(row[2] || ''), updatedAt:String(row[3] || ''), schoolCorrectionRequired:!!row[4], filterCorrectionRequired:!!row[5]});
  });
  return profiles;
}

/** Check the profile once per authenticated session, keeping link payloads gated. */
function visitorProfileRequired_(token) {
  const cache = CacheService.getScriptCache();
  const key = 'LINK_CORE_PROFILE_READY_' + token;
  const ready = cache.get(key);
  if (ready === '1') return false;
  if (ready === '0') return true;
  const browser = cache.get('LINK_CORE_VISITOR_BROWSER_' + token);
  if (!browser) return true;
  const profile = getVisitorChatProfile(browser, token);
  const complete = !!(String(profile.school || '').trim() && String(profile.filter || '').trim());
  cache.put(key, complete ? '1' : '0', SESSION_TTL_SECONDS);
  return !complete;
}

/** Canonical browser labels for administrator conversation titles. */
function getClickBrowserNames(adminToken) {
  requireAdmin_(adminToken);
  return {names:Array.from(getClickBrowserNames_(), ([browserId,name]) => ({
    browserId:String(browserId).trim(),name:String(name).trim()
  }))};
}

/** Use the authenticated session's canonical browser binding for profile access. */
function visitorProfileBrowser_(browserId, token) {
  if (!isSessionValid_('VISITOR', token)) throw new Error('利用者ログインが必要です。');
  const bound = CacheService.getScriptCache().get('LINK_CORE_VISITOR_BROWSER_' + token);
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(String(bound || ''))) throw new Error('ログイン情報を確認できません。再ログインしてください。');
  if (browserId && browserId !== bound) {
    securityEvent_('identity_mismatch', 'VISITOR');
    throw new Error('ブラウザIDがログイン情報と一致しません。再ログインしてください。');
  }
  return bound;
}

function visitorDmApplyUploadResponse_(state, response) {
  const status = response.getResponseCode();
  if (status === 308) {
    const received = staffDriveUploadHeader_(response, 'Range');
    const matched = received.match(/^bytes=0-(\d+)$/i);
    state.offset = matched ? Number(matched[1]) + 1 : 0;
    if (!Number.isSafeInteger(state.offset) || state.offset > state.size) {
      throw new Error('アップロード進捗が不正です。');
    }
  } else if (status === 200 || status === 201) {
    let item;
    try { item = JSON.parse(response.getContentText()); } catch (_) {}
    if (!item || typeof item.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(item.id)) {
      throw new Error('Driveへのアップロード完了を確認できませんでした。');
    }
    state.fileId = item.id;
    state.offset = state.size;
  } else {
    throw new Error('Driveへのアップロードに失敗しました（HTTP ' + status + '）。');
  }
  visitorDmSaveUpload_(state);
  return {ok:true, offset:state.offset, complete:!!state.fileId};
}
function visitorDmUploadStatus_(state) {
  const response = UrlFetchApp.fetch(state.sessionUrl, {
    method:'put', followRedirects:false, headers:{
      Authorization:'Bearer ' + ScriptApp.getOAuthToken(),
      'Content-Range':'bytes */' + state.size
    },
    contentType:state.mime, payload:'', muteHttpExceptions:true
  });
  return visitorDmApplyUploadResponse_(state, response);
}
function visitorDmUploadKey_(id) {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('添付の送信IDが不正です。');
  return 'LC_DM_UPLOAD_' + id;
}
function visitorDmSaveUpload_(state) {
  CacheService.getScriptCache().put(visitorDmUploadKey_(state.requestId), JSON.stringify(state), STAFF_ATTACHMENT_UPLOAD_TTL);
}
function visitorDmUploadState_(id, peer, author, token) {
  const raw = CacheService.getScriptCache().get(visitorDmUploadKey_(id));
  if (!raw) throw new Error('添付の有効期限が切れました。ファイルを選び直してください。');
  const state = JSON.parse(raw);
  if (state.peer !== peer || state.author !== author || state.token !== token) throw new Error('添付のアクセス権限がありません。');
  return state;
}
function visitorDmUpload_(parameters, peer, author, token) {
  const id = parameters.upload_id;
  const key = visitorDmUploadKey_(id);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    if (parameters.operation === 'uploadStart') {
      const meta = validateStaffAttachmentMeta_(parameters.file);
      const raw = CacheService.getScriptCache().get(key);
      if (raw) {
        const state = visitorDmUploadState_(id, peer, author, token);
        if (state.filename !== meta.filename || state.size !== meta.size || state.mime !== meta.mime) throw new Error('添付IDが重複しています。');
        return {offset:state.offset,chunkSize:STAFF_ATTACHMENT_CHUNK_BYTES};
      }
      const response = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,size', {
        method:'post',contentType:'application/json',followRedirects:false,
        headers:{Authorization:'Bearer ' + ScriptApp.getOAuthToken(),
          'X-Upload-Content-Type':meta.mime,'X-Upload-Content-Length':String(meta.size)},
        payload:JSON.stringify({name:meta.filename,mimeType:meta.mime,parents:[staffAttachmentFolder_().getId()]}),
        muteHttpExceptions:true
      });
      if (response.getResponseCode() !== 200) throw new Error('添付の転送準備に失敗しました。');
      const sessionUrl = staffDriveUploadHeader_(response, 'Location');
      if (!/^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files(?:\?|\/)/.test(sessionUrl)) throw new Error('添付の転送先を確認できません。');
      visitorDmSaveUpload_({requestId:id,peer,author,token,filename:meta.filename,mime:meta.mime,size:meta.size,
        offset:0,fileId:'',sessionUrl});
      return {offset:0,chunkSize:STAFF_ATTACHMENT_CHUNK_BYTES};
    }
    const state = visitorDmUploadState_(id, peer, author, token);
    if (state.fileId) return {offset:state.size,complete:true};
    const offset = parameters.offset;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > state.size) throw new Error('転送位置が不正です。');
    if (offset !== state.offset) return {offset:state.offset};
    const encoded = parameters.base64;
    if (typeof encoded !== 'string' || encoded.length > Math.ceil(STAFF_ATTACHMENT_CHUNK_BYTES / 3) * 4 + 4 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('添付データが不正です。');
    const bytes = Utilities.base64Decode(encoded);
    if (!bytes.length || bytes.length > STAFF_ATTACHMENT_CHUNK_BYTES || offset + bytes.length > state.size ||
        (offset + bytes.length < state.size && bytes.length % (256 * 1024) !== 0)) throw new Error('添付のサイズが不正です。');
    if (offset === 0) validateAttachmentSignature_(bytes, state.filename.split('.').pop().toLowerCase());
    try {
      const response = UrlFetchApp.fetch(state.sessionUrl,{method:'put',contentType:state.mime,payload:bytes,followRedirects:false,
        headers:{Authorization:'Bearer ' + ScriptApp.getOAuthToken(),
          'Content-Range':'bytes ' + offset + '-' + (offset + bytes.length - 1) + '/' + state.size},muteHttpExceptions:true});
      if (![200,201,308].includes(response.getResponseCode())) return visitorDmUploadStatus_(state);
      return visitorDmApplyUploadResponse_(state,response);
    } catch (_) { return visitorDmUploadStatus_(state); }
  } finally { lock.releaseLock(); }
}

/* Filter access reports, owned by the authenticated visitor browser. */
function filterAccessSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty(SPREADSHEET_PROPERTY);
  if (!id) throw new Error('スプレッドシートIDが未設定です。');
  return SpreadsheetApp.openById(id);
}
function filterAccessSheet_(spreadsheet, name, headers, create) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet && create) sheet = spreadsheet.insertSheet(name);
  if (sheet && create && !sheet.getLastRow()) sheet.appendRow(headers);
  return sheet;
}
function filterAccessRows_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName('FilterAccessReports');
  return sheet && sheet.getLastRow() > 1 ? sheet.getRange(2,1,sheet.getLastRow()-1,9).getValues() : [];
}
function filterAccessAliases_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName('FilterAccessAliases');
  return new Map(sheet && sheet.getLastRow() > 1 ? sheet.getRange(2,1,sheet.getLastRow()-1,2).getDisplayValues() : []);
}
function filterAccessVisitor_(linkId, token) {
  if (!isSessionValid_('VISITOR', token)) throw new Error('利用者ログインが必要です。');
  const browser = visitorProfileBrowser_('', token);
  const profile = getVisitorChatProfile(browser, token);
  if (!profile.school || !profile.filter) throw new Error('学校名とフィルターを設定してください。');
  const link = getLinksForToken_(token).links.find(item => item.id === linkId && item.visibleToVisitors === true);
  if (!link) throw new Error('公開リンクが見つかりません。');
  return {browser,profile,link};
}
function visitorBlockedLinkIds_(browser, filter, visibleLinks) {
  const visible=new Set(visibleLinks.map(link=>String(link.id))),latest=new Map();
  filterAccessRows_(filterAccessSpreadsheet_()).forEach(row=>{
    if(String(row[0])!==String(browser)||String(row[2])!==String(filter)||!visible.has(String(row[1])))return;
    const id=String(row[1]),stamp=String(toIso_(row[5])),old=latest.get(id);
    if(!old||stamp>=old.stamp)latest.set(id,{stamp:stamp,result:row[4]});
  });
  return Array.from(latest).filter(entry=>entry[1].result==='blocked').map(entry=>entry[0]);
}
function getMyFilterAccessReport(linkId, token) {
  const {browser,profile} = filterAccessVisitor_(linkId, token);
  const rows = filterAccessRows_(filterAccessSpreadsheet_());
  const matches = rows.filter(row => row[0] === browser && row[1] === linkId && row[2] === profile.filter);
  const latest = matches.sort((a,b) => String(toIso_(b[5])).localeCompare(String(toIso_(a[5]))))[0];
  return {filter:profile.filter,school:profile.school,result:latest ? latest[4] : ''};
}
function saveFilterAccessReport(linkId, result, token) {
  if (!['allowed','blocked',''].includes(result)) throw new Error('報告の種類が不正です。');
  const {browser,profile,link} = filterAccessVisitor_(linkId, token);
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const spreadsheet = filterAccessSpreadsheet_();
    const sheet = filterAccessSheet_(spreadsheet,'FilterAccessReports',
      ['ブラウザID','リンクID','フィルター','学校名','結果','更新日時','リンク名','URL','報告ID'],!!result);
    const rows = filterAccessRows_(spreadsheet);
    const matches = rows.flatMap((row,index) => row[0] === browser && row[1] === linkId && row[2] === profile.filter ? [index+2] : []);
    if (result) {
      const row = matches.length ? matches[0] : sheet.getLastRow()+1;
      sheet.getRange(row,1,1,9).setValues([[browser,linkId,safeCell_(profile.filter),safeCell_(profile.school),result,new Date(),
        safeCell_(link.title),safeCell_(link.url),Utilities.getUuid()]]);
      matches.slice(1).reverse().forEach(index => sheet.deleteRow(index));
    } else if (sheet) matches.reverse().forEach(index => sheet.deleteRow(index));
    SpreadsheetApp.flush();
    removeChunkedJsonCache_('LC_FILTER_ACCESS_ADMIN_V1');
    return {ok:true,filter:profile.filter,result};
  } finally { lock.releaseLock(); }
}
function getFilterAccessSummary(adminToken) {
  requireAdmin_(adminToken);
  const cached = readChunkedJsonCache_('LC_FILTER_ACCESS_ADMIN_V1');
  if (cached) return cached;
  const spreadsheet = filterAccessSpreadsheet_();
  const aliases = filterAccessAliases_(spreadsheet);
  const reports = filterAccessRows_(spreadsheet).filter(row => ['allowed','blocked'].includes(row[4]))
    .map(row => ({browser:String(row[0]),linkId:String(row[1]),filter:aliases.get(String(row[2])) || String(row[2]),
      rawFilter:String(row[2]),school:String(row[3]),result:row[4],updatedAt:toIso_(row[5]),title:String(row[6]),url:String(row[7])}));
  const registered = Array.from(visitorChatProfilesByBrowser_(spreadsheet).values(), profile => aliases.get(profile.filter) || profile.filter).filter(Boolean);
  const filters = Array.from(new Set([...registered,...reports.map(row => row.filter)])).sort((a,b)=>a.localeCompare(b,'ja'));
  const links = readLinksForDisplay_().links.map(link => ({id:link.id,title:link.title,url:link.url}));
  const result = {reports,filters,links};
  writeChunkedJsonCache_('LC_FILTER_ACCESS_ADMIN_V1',result,20);
  return result;
}

/**
 * FILTER ACCESS ANALYTICS — clicks and login events (not self-reported success).
 * Links each logged browser to its CURRENT registered filter and school.
 * Private browser IDs never leave GAS; only aggregated numbers reach admin.
 * Source histories can be deleted/truncated independently from these reports.
 */
function getFilterAccessActivitySummary(adminToken) {
  requireAdmin_(adminToken);
  const key = 'LC_FILTER_ACTIVITY_DASHBOARD_V3';
  const cached = readChunkedJsonCache_(key);
  if (cached) return cached;
  const ss = filterAccessSpreadsheet_();
  const aliases = filterAccessAliases_(ss);
  const profiles = visitorChatProfilesByBrowser_(ss);
  const unknown = '未設定・不明';
  const now = new Date();
  const today = Utilities.formatDate(now,'Asia/Tokyo','yyyy-MM-dd');
  const midnight = Date.parse(today + 'T00:00:00+09:00');
  const jstDate = stamp => new Date(stamp + 9 * 3600000).toISOString().slice(0,10);
  const day7 = jstDate(midnight - 6 * 86400000);
  const day30 = jstDate(midnight - 29 * 86400000);
  const period = () => ({clicks:0,logins:0,ids:new Set(),unknownIds:new Set(),groups:new Map()});
  const periods = {'7':period(),'30':period(),'all':period()};
  const trends = new Map(), missing=[], truncated=[];
  const sources = [{sheet:'ClickLogs',firstColumn:5,type:'clicks'},
                   {sheet:'VisitorLoginLogs',firstColumn:1,type:'logins'}];
  function countVisit(sourceName, type, dateCell, browserCell) {
    const browser = String(browserCell || '').trim();
    let stamp;
    if (dateCell instanceof Date) stamp = dateCell.getTime();
    else stamp = new Date(dateCell).getTime();
    if (!Number.isFinite(stamp) || stamp > now.getTime()+86400000) return;
    const day = jstDate(stamp);
    const profile = browser ? profiles.get(browser) : null;
    const rawFilter = String(profile?.filter || '').trim();
    const filter = (aliases.get(rawFilter) || rawFilter).trim() || unknown;
    const school = String(profile?.school || '').trim() || unknown;
    const groupKey = JSON.stringify([filter,school]);
    for (const key of ['7','30','all']) {
      if (key==='7' && day<day7 || key==='30' && day<day30) continue;
      const total = periods[key];
      total[type]++;
      if (browser) {
        total.ids.add(browser);
        if (filter===unknown) total.unknownIds.add(browser);
      }
      if (!total.groups.has(groupKey)) {
        total.groups.set(groupKey,{filter,school,clicks:0,logins:0,ids:new Set()});
      }
      const group = total.groups.get(groupKey);
      group[type]++;
      if (browser) group.ids.add(browser);
    }
    if (day>=day30 && day<=today) {
      const trendKey = JSON.stringify([day,filter,school]);
      if (!trends.has(trendKey)) trends.set(trendKey,{date:day,filter,school,clicks:0,logins:0,ids:new Set()});
      trends.get(trendKey)[type]++;
      if (browser) trends.get(trendKey).ids.add(browser);
    }
  }
  sources.forEach(source=>{
    const sheet = ss.getSheetByName(source.sheet);
    if (!sheet) {missing.push(source.sheet);return;}
    const last = sheet.getLastRow();
    if (last<2) return;
    const first = Math.max(2,last-49999);
    if (first>2) truncated.push(source.sheet);
    if (sheet.getMaxColumns()<source.firstColumn+1) {missing.push(source.sheet+'（列不足）');return;}
    // Only read the timestamp and browser ID columns, not URLs or message text.
    sheet.getRange(first,source.firstColumn,last-first+1,2).getValues()
      .forEach(row=>countVisit(source.sheet,source.type,row[0],row[1]));
  });
  function exportPeriod(p) {
    return {clicks:p.clicks,logins:p.logins,browsers:p.ids.size,
      unknownBrowsers:p.unknownIds.size,
      groups:Array.from(p.groups.values(),g=>({
        filter:g.filter,school:g.school,clicks:g.clicks,logins:g.logins,browsers:g.ids.size
      })).sort((a,b)=>b.clicks-a.clicks || b.browsers-a.browsers || a.filter.localeCompare(b.filter,'ja'))};
  }
  const result = {periods:{
      '7':exportPeriod(periods['7']),
      '30':exportPeriod(periods['30']),
      'all':exportPeriod(periods.all)
    },
    daily:Array.from(trends.values(),g=>({date:g.date,filter:g.filter,school:g.school,clicks:g.clicks,logins:g.logins,browsers:g.ids.size})).sort((a,b)=>a.date.localeCompare(b.date)),
    missing,truncated,generatedAt:now.toISOString(),
    classification:'記録にあるブラウザIDを現在の登録フィルター・学校と照合しています。過去の設定変更は遡って復元できません。',
    definitions:'リンククリックとログインは保存済みの操作履歴です。利用者からの「開けた・制限された」報告数とは異なります。'};
  writeChunkedJsonCache_(key,result,60);
  return result;
}

function mergeFilterAccessNames(source, target, adminToken) {
  requireAdmin_(adminToken, 'mergeFilterAccessNames');
  source = cleanText_(source,80); target = cleanText_(target,80);
  if (!source || !target || /[\u0000-\u001f]/.test(source+target)) throw new Error('フィルター名を入力してください。');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const spreadsheet = filterAccessSpreadsheet_();
    const aliases = filterAccessAliases_(spreadsheet);
    const from = aliases.get(source) || source, to = aliases.get(target) || target;
    if (from === to) return {ok:true};
    aliases.forEach((value,key) => { if (value === from) aliases.set(key,to); });
    aliases.set(from,to); aliases.set(source,to);
    const sheet = filterAccessSheet_(spreadsheet,'FilterAccessAliases',['入力名','集計名'],true);
    const values = Array.from(aliases, ([key,value]) => [safeCell_(key),safeCell_(value)]);
    sheet.getRange(2,1,values.length,2).setValues(values);
    SpreadsheetApp.flush();
    removeChunkedJsonCache_('LC_FILTER_ACCESS_ADMIN_V1');
    return {ok:true};
  } finally { lock.releaseLock(); }
}

function validateAttachmentSignature_(bytes, ext) {
  const b = index => bytes[index] & 255;
  const ascii = (start, length) => bytes.slice(start, start + length).map(x => String.fromCharCode(x & 255)).join('');
  if (ext === 'pdf' && ascii(0, 5) !== '%PDF-') throw new Error('PDFの内容を確認してください。');
  if (ext === 'png' && (bytes.length < 8 || [137,80,78,71,13,10,26,10].some((n,i) => b(i) !== n))) throw new Error('PNGの内容を確認してください。');
  if ((ext === 'jpg' || ext === 'jpeg') && (bytes.length < 3 || b(0) !== 255 || b(1) !== 216 || b(2) !== 255)) throw new Error('JPEGの内容を確認してください。');
  if (ext === 'gif' && ascii(0, 4) !== 'GIF8') throw new Error('GIFの内容を確認してください。');
  if (ext === 'webp' && (ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WEBP')) throw new Error('WebPの内容を確認してください。');
  if (['docx','xlsx','pptx'].includes(ext) && !(b(0) === 80 && b(1) === 75)) throw new Error('Officeファイルの内容を確認してください。');
  if (['mp4', 'mov', 'm4v'].includes(ext) &&
      !(ascii(4, 4) === 'ftyp' || (ext === 'mov' && ascii(4, 4) === 'moov'))) {
    throw new Error('動画ファイルの内容を確認してください。');
  }
  if (ext === 'webm' && (bytes.length < 4 || [26,69,223,163].some((n,i) => b(i) !== n))) {
    throw new Error('WebMの内容を確認してください。');
  }
}

// Staff chat never falls back to the legacy spreadsheet backend.
function requireStaffSupabase_() {
  if (supabaseChatMode_() !== 'supabase') throw new Error('管理者チャットはSupabase専用です。チャット履歴の移行とLINK_CORE_CHAT_BACKENDのsupabase設定を完了してください。');
  supabaseChatConfig_();
}

/* Security observations are indicators, not proof of an intrusion.
 * No caller-provided message, password, JWT or session token is persisted.
 */
function securityEvent_(code, scope, count) {
  const definitions = {
    auth_failed:['注意','認証に失敗'],
    auth_repeated:['警告','認証失敗が連続（15分の試行制限）'],
    auth_locked:['警告','認証の試行制限中に再試行'],
    admin_denied:['確認','管理者認証がない・期限切れの操作'],
    viewer_denied:['確認','閲覧認証がない・期限切れの操作'],
    identity_mismatch:['警告','ログイン済み情報とブラウザの識別情報が不一致']
  };
  if (!Object.prototype.hasOwnProperty.call(definitions, code)) return;
  if (!['ADMIN','VISITOR','MEMO','AUTH'].includes(scope)) scope = 'AUTH';
  let lock, acquired = false;
  try {
    const state = getAuthRateState_('SECURITY');
    const actor = state.key.slice(-32);
    const key = 'LINK_CORE_SEC_EVENT_' + code + '_' + scope + '_' + actor;
    if (state.cache.get(key)) return;
    console.warn('LINK_BASE_SECURITY', JSON.stringify({code:code,scope:scope,actor:actor}));
    lock = LockService.getScriptLock();
    acquired = lock.tryLock(100);
    if (!acquired) return;
    if (state.cache.get(key)) return;
    const spreadsheetId = PropertiesService.getScriptProperties().getProperty(SPREADSHEET_PROPERTY);
    if (!spreadsheetId) return;
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sheet = ss.getSheetByName('SecurityEvents') || ss.insertSheet('SecurityEvents');
    if (!sheet.getLastRow()) sheet.appendRow(['日時','重要度','種別','対象','説明','送信元の匿名識別子','検知時の失敗回数']);
    const times = Number.isSafeInteger(count) && count > 0 ? Math.min(count,100000) : '';
    sheet.appendRow([new Date(),definitions[code][0],code,scope,definitions[code][1],actor,times]);
    state.cache.put(key,'1',600);
  } catch (_) {
    // Security logging must never grant access or replace the original rejection.
    console.warn('LINK_BASE_SECURITY_LOG_UNAVAILABLE');
  } finally {
    if (acquired) lock.releaseLock();
  }
}

function getSecurityEvents(adminToken) {
  requireAdmin_(adminToken);
  const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty(SPREADSHEET_PROPERTY));
  const sheet = ss.getSheetByName('SecurityEvents');
  const last = sheet ? sheet.getLastRow() : 0;
  if (last < 2) return {logs:[]};
  const first = Math.max(2,last-199);
  return {logs:sheet.getRange(first,1,last-first+1,7).getValues().reverse().map(row=>({
    date:toIso_(row[0]),severity:String(row[1]),code:String(row[2]),scope:String(row[3]),
    description:String(row[4]),actor:String(row[5]),failures:Number(row[6]) || 0
  }))};
}

/** Aggregates only anonymous totals. Reads at most the last 50,000 rows per source. */
function getLogDashboard(adminToken) {
  requireAdmin_(adminToken);
  const cacheKey = 'LINK_BASE_LOG_DASHBOARD_V3_' + (PropertiesService.getScriptProperties().getProperty('LINK_BASE_PAGE_GROUP_VERSION')||'0');
  const cached = readChunkedJsonCache_(cacheKey);
  if (cached) return cached;
  const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty(SPREADSHEET_PROPERTY));
  const today = Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy-MM-dd');
  const anchor = new Date(today+'T00:00:00+09:00').getTime();
  const days = [], byDay = Object.create(null);
  for (let i=29;i>=0;i--) {
    const date = new Date(anchor-i*86400000+9*3600000).toISOString().slice(0,10);
    const item = {date:date,logins:0,clicks:0,visitors:0,security:0,operations:0,reports:0,appeals:0};
    days.push(item);byDay[date]=item;
  }
  const truncated = [], missing = [], links = new Map(), events = new Map(), visitKeys = new Set();
  const profiles = visitorChatProfilesByBrowser_(ss);
  const pageGroups=linkPageGroups_(ss);
  const schools = new Map(), filters = new Map(), operations = new Map(), severities = new Map();
  const hours = Array.from({length:24},(_,hour)=>({label:String(hour).padStart(2,'0')+'時',count:0}));
  function add(map,label) {const key=String(label || '未登録');map.set(key,(map.get(key)||0)+1);}
  function classify(browser,date) {
    const profile=profiles.get(String(browser || ''));
    add(schools,profile?.school);add(filters,profile?.filter);
    const parsed=date instanceof Date?date:new Date(date);
    if(!isNaN(parsed.getTime()))hours[new Date(parsed.getTime()+9*3600000).getUTCHours()].count++;
  }
  function rows(name,width,consume) {
    const sheet=ss.getSheetByName(name);
    if (!sheet) {missing.push(name);return;}
    const last=sheet.getLastRow();if(last<2)return;
    const first=Math.max(2,last-49999);if(first>2)truncated.push(name);
    sheet.getRange(first,1,last-first+1,Math.min(width,sheet.getMaxColumns())).getValues().forEach(consume);
  }
  function dateKey(value) {
    if (value instanceof Date && !isNaN(value.getTime())) return new Date(value.getTime()+9*3600000).toISOString().slice(0,10);
    if (typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const date = new Date(value);
    return isNaN(date.getTime()) ? '' : new Date(date.getTime()+9*3600000).toISOString().slice(0,10);
  }
  rows('VisitorLoginLogs',2,row=>{const day=byDay[dateKey(row[0])];if(day){day.logins++;classify(row[1],row[0]);}});
  rows(CLICK_LOG_SHEET_NAME,6,row=>{
    const day=byDay[dateKey(row[4])];if(!day)return;
    day.clicks++;classify(row[5],row[4]);
    const page=linkPageIdentity_(row[1],row[2],pageGroups);
    const key=page.key;
    const item=links.get(key) || {label:page.label,count:0};
    item.count++;links.set(key,item);
  });
  rows(VISITOR_COUNTER_SHEET,2,row=>{
    const key=dateKey(row[0]),day=byDay[key];if(!day)return;
    const unique=key+':'+String(row[1] || '');
    if (!row[1] || visitKeys.has(unique))return;
    visitKeys.add(unique);day.visitors++;
  });
  rows('SecurityEvents',7,row=>{
    const day=byDay[dateKey(row[0])];if(!day)return;
    day.security++;add(severities,row[1]);
    const label=String(row[4] || row[2] || '種別未記録');
    events.set(label,(events.get(label)||0)+1);
  });
  rows('LinkOperationLogs',4,row=>{const day=byDay[dateKey(row[0])];if(day){day.operations++;add(operations,row[1]);}});
  rows('LinkReports',5,row=>{const day=byDay[dateKey(row[1])];if(day)day.reports++;});
  rows('BAN異議申し立て',3,row=>{const day=byDay[dateKey(row[0])];if(day)day.appeals++;});
  const ranks=map=>Array.from(map,([label,count])=>({label:label,count:count})).sort((a,b)=>b.count-a.count).slice(0,10);
  const totals=days.reduce((sum,day)=>{['logins','clicks','visitors','security','operations','reports','appeals'].forEach(key=>sum[key]+=day[key]);return sum;},{logins:0,clicks:0,visitors:0,security:0,operations:0,reports:0,appeals:0});
  const result={days:days,totals:totals,pageCount:links.size,pageGrouping:true,
    topLinks:Array.from(links.values()).sort((a,b)=>b.count-a.count).slice(0,10),
    securityTypes:Array.from(events,([label,count])=>({label:label,count:count})).sort((a,b)=>b.count-a.count),
    schoolActivity:ranks(schools),filterActivity:ranks(filters),hourlyActivity:hours,operationTypes:ranks(operations),securityLevels:ranks(severities),
    missing:missing,truncated:truncated,generatedAt:new Date().toISOString()};
  writeChunkedJsonCache_(cacheKey,result,60);
  return result;
}

function activeBanCount_() {
  const settings = PropertiesService.getScriptProperties().getProperties();
  return Object.keys(settings).filter(key=>key.startsWith('LINK_CORE_BAN_') && settings[key]==='1').length;
}


/** Nicknames are bound to the authenticated browser, independent of admin-assigned names. */
function setVisitorNickname(browserId, nickname, visitorToken) {
  browserId = visitorProfileBrowser_(browserId, visitorToken);
  const name = typeof nickname === 'string' ? nickname.trim() : '';
  if (!name || name.length > 24 || /[\x00-\x1F\x7F]/.test(name)) throw new Error('ニックネームは1〜24文字で入力してください。');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    browserId = visitorProfileBrowser_(browserId, visitorToken);
    const sheet = visitorChatProfileSheet_(), last = sheet.getLastRow();
    const found = last < 2 ? null : sheet.getRange(2,1,last-1,1).createTextFinder(browserId).matchEntireCell(true).matchCase(true).findNext();
    if (!found) throw new Error('先に学校情報とフィルターを設定してください。');
    sheet.getRange(1,7).setValue('ニックネーム');
    sheet.getRange(found.getRow(),7).setValue(safeCell_(name));
    return {nickname:name};
  } finally { lock.releaseLock(); }
}

/** Called under the script lock. Seed once from retained click logs, then keep totals independently. */
function linkViewsSheet_() {
  const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty(SPREADSHEET_PROPERTY));
  let sheet = ss.getSheetByName('LinkViewCounts');
  if (sheet) return sheet;
  sheet = ss.insertSheet('LinkViewCounts');
  sheet.appendRow(['リンクID','閲覧数','公開']);
  const logs = ss.getSheetByName(CLICK_LOG_SHEET_NAME), counts = new Map();
  if (logs && logs.getLastRow()>1) logs.getRange(2,2,logs.getLastRow()-1,1).getDisplayValues().forEach(row=>{
    const id=String(row[0]); if(id) counts.set(id,(counts.get(id)||0)+1);
  });
  const rows=Array.from(counts,([id,count])=>[safeCell_(id),count,true]);
  if(rows.length)sheet.getRange(2,1,rows.length,3).setValues(rows);
  return sheet;
}
function linkViewsSnapshot_() {
  const cache=CacheService.getScriptCache(), saved=readChunkedJsonCache_('LINK_CORE_VIEWS_V1');
  if(saved)return saved;
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    const sheet=linkViewsSheet_(), result={entries:[]};
    if(sheet.getLastRow()>1) result.entries=sheet.getRange(2,1,sheet.getLastRow()-1,3).getValues().map(row=>({id:String(row[0]),count:Math.max(0,Number(row[1])||0),public:row[2]!==false&&String(row[2]).toLowerCase()!=='false'}));
    writeChunkedJsonCache_('LINK_CORE_VIEWS_V1',result,30);
    return result;
  } finally {lock.releaseLock();}
}
function invalidateLinkViews_(){CacheService.getScriptCache().remove('LINK_CORE_VIEWS_V1_META');}
function incrementLinkView_(sheet,id){
  const last=sheet.getLastRow(),found=last<2?null:sheet.getRange(2,1,last-1,1).createTextFinder(id).matchEntireCell(true).matchCase(true).findNext();
  if(found){const cell=sheet.getRange(found.getRow(),2);cell.setValue(Math.max(0,Number(cell.getValue())||0)+1);}
  else sheet.appendRow([safeCell_(id),1,true]);
  invalidateLinkViews_();
}
function getLinkViewCounts(viewerToken) {
  requireLinkViewer_(viewerToken);
  const admin=isSessionValid_('ADMIN',viewerToken);
  const available=getLinksForToken_(viewerToken,admin).links;
  const stats=new Map(linkViewsSnapshot_().entries.map(item=>[item.id,item]));
  return {links:available.map(link=>{
    const item=stats.get(String(link.id))||{count:0,public:true};
    return admin?{id:link.id,title:link.title,count:item.count,public:item.public}:{id:link.id,...(item.public?{count:item.count}:{})};
  })};
}
function setLinkViewVisibility(linkId,visible,adminToken){
  requireAdmin_(adminToken, 'setLinkViewVisibility');
  if(typeof visible!=='boolean')throw new Error('公開設定が不正です。');
  const id=String(linkId||'');
  if(!getLinksForToken_(adminToken,true).links.some(link=>String(link.id)===id))throw new Error('リンクが見つかりません。');
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    requireAdmin_(adminToken);
    const sheet=linkViewsSheet_(),last=sheet.getLastRow(),found=last<2?null:sheet.getRange(2,1,last-1,1).createTextFinder(id).matchEntireCell(true).matchCase(true).findNext();
    if(found)sheet.getRange(found.getRow(),3).setValue(visible);
    else sheet.appendRow([safeCell_(id),0,visible]);
    invalidateLinkViews_(); return {ok:true,public:visible};
  } finally {lock.releaseLock();}
}

/** An estimate of time away from LINK BASE, never a claim of activity inside the linked website. */
function completeLinkVisit(visitId, seconds, browserId, visitorToken) {
  const browser=visitorProfileBrowser_(browserId,visitorToken);
  if(typeof visitId!=='string'||!/^[0-9a-f-]{36}$/i.test(visitId)||
    typeof seconds!=='number'||!Number.isFinite(seconds)||seconds<0||seconds>86400)throw new Error('閲覧時間が不正です。');
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    visitorProfileBrowser_(browser,visitorToken);
    const sheet=ensureClickLogSheet_(),last=sheet.getLastRow();
    const found=last<2?null:sheet.getRange(2,1,last-1,1).createTextFinder(visitId).matchEntireCell(true).matchCase(true).findNext();
    if(!found)return {ok:true,missing:true};
    const row=sheet.getRange(found.getRow(),1,1,8).getValues()[0];
    if(String(row[5])!==browser)throw new Error('閲覧記録のブラウザIDが一致しません。');
    if(row[6]!==''&&row[6]!==undefined)return {ok:true};
    const elapsed=(Date.now()-new Date(row[4]).getTime())/1000;
    if(!Number.isFinite(elapsed)||seconds>elapsed+30)throw new Error('閲覧時間が記録日時と一致しません。');
    sheet.getRange(found.getRow(),7,1,2).setValues([[Math.round(seconds),new Date()]]);
    return {ok:true};
  }finally{lock.releaseLock();}
}


/** Daily downtime is evaluated by the server in Japan time, independently of device clocks. */

/** Normalize Sheets' localized/displayed clock values to the minute-based API format. */
function normalizeDowntimeTime_(value){
  let text=String(value==null?'':value).trim().replace(/：/g,':');
  const prefix=/^(午前|午後)\s*/.exec(text);
  if(prefix)text=text.slice(prefix[0].length)+' '+prefix[1];
  const match=/^(?:\d{4}[/-]\d{1,2}[/-]\d{1,2}\s+)?(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(AM|PM|午前|午後)?$/i.exec(text);
  if(!match)return '';
  let hour=Number(match[1]);const minute=Number(match[2]),second=Number(match[3]||0),period=(match[4]||'').toUpperCase();
  if(minute>59||second>59)return '';
  if(period){if(hour<1||hour>12)return '';hour=hour%12+(/^(PM|午後)$/.test(period)?12:0);}
  if(hour>23)return '';
  return String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0');
}

function downtimeWindow_(config, now) {
  const stamp=Number(now);
  if(!config || !config.enabled)return {active:false};
  const parse=value=>{const m=/^(\d{2}):(\d{2})$/.exec(normalizeDowntimeTime_(value));return m&&Number(m[1])<24&&Number(m[2])<60?Number(m[1])*60+Number(m[2]):null;};
  const start=parse(config.start),end=parse(config.end);
  if(start===null||end===null||start===end)return {active:false,invalid:true};
  const japan=new Date(stamp+9*3600000),minute=japan.getUTCHours()*60+japan.getUTCMinutes();
  const active=start<end?minute>=start&&minute<end:minute>=start||minute<end;
  const remaining=(end-minute+1440)%1440;
  const nextStart=stamp+((start-minute+1440)%1440)*60000-japan.getUTCSeconds()*1000-japan.getUTCMilliseconds();
  return {active,nextStart,until:active?stamp+remaining*60000-japan.getUTCSeconds()*1000-japan.getUTCMilliseconds():null,start:normalizeDowntimeTime_(config.start),end:normalizeDowntimeTime_(config.end),timeZone:'Asia/Tokyo'};
}

let visitorAccessSpreadsheetHandle_;
function visitorAccessSpreadsheet_(){
  const id=PropertiesService.getScriptProperties().getProperty(SPREADSHEET_PROPERTY);
  if(!visitorAccessSpreadsheetHandle_||visitorAccessSpreadsheetHandle_.id!==id)visitorAccessSpreadsheetHandle_={id,sheet:SpreadsheetApp.openById(id)};
  return visitorAccessSpreadsheetHandle_.sheet;
}

function visitorDowntimeSheet_() {
  const ss=visitorAccessSpreadsheet_();
  const sheet=ss.getSheetByName('VisitorDowntime')||ss.insertSheet('VisitorDowntime');
  if(!sheet.getLastRow())sheet.appendRow(['ブラウザID','有効','休止開始','休止終了']);
  return sheet;
}
function visitorDowntimeConfig_(browserId) {
  if(!/^[A-Za-z0-9_-]{8,100}$/.test(String(browserId||'')))return {enabled:false,start:'22:00',end:'07:00'};
  const cache=CacheService.getScriptCache(),key='LINK_CORE_DOWNTIME_V2_'+browserId;
  const cached=cache.get(key);if(cached){try{return JSON.parse(cached);}catch(_){}}
  // Checking unconfigured visitors does not create a sheet or add profile properties.
  const ss=visitorAccessSpreadsheet_();
  const sheet=ss.getSheetByName('VisitorDowntime'),last=sheet?sheet.getLastRow():0;
  const found=last<2?null:sheet.getRange(2,1,last-1,1).createTextFinder(browserId).matchEntireCell(true).matchCase(true).findNext();
  const row=found?sheet.getRange(found.getRow(),2,1,3).getDisplayValues()[0]:[];
  const config=found?{enabled:String(row[0]).trim().toLowerCase()==='true',start:normalizeDowntimeTime_(row[1]),end:normalizeDowntimeTime_(row[2])}:{enabled:false,start:'22:00',end:'07:00'};
  cache.put(key,JSON.stringify(config),30);return config;
}
function visitorDowntimeState_(browserId){return downtimeWindow_(visitorDowntimeConfig_(browserId),Date.now());}
function requireVisitorTimeAllowed_(browserId){
  const state=visitorDowntimeState_(browserId);
  if(state.invalid)throw new Error('LINK_BASE_DOWNTIME_CONFIG_ERROR 休止時間の設定を読み取れません。管理者に時刻の再設定を依頼してください。');
  if(state.active)throw new Error('LINK_BASE_DOWNTIME:'+state.until+' 現在は休止時間です。');
}
function getVisitorDowntime(browserId,adminToken){
  requireAdmin_(adminToken);
  if(!/^[A-Za-z0-9_-]{8,100}$/.test(String(browserId||'')))throw new Error('ブラウザIDが不正です。');
  return {config:visitorDowntimeConfig_(browserId),state:visitorDowntimeState_(browserId)};
}
function saveVisitorDowntime(browserId,enabled,start,end,adminToken){
  requireAdmin_(adminToken, 'saveVisitorDowntime');
  if(!/^[A-Za-z0-9_-]{8,100}$/.test(String(browserId||''))||typeof enabled!=='boolean')throw new Error('利用者または設定が不正です。');
  start=normalizeDowntimeTime_(start);end=normalizeDowntimeTime_(end);
  const valid=value=>typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  if(!valid(start)||!valid(end)||start===end)throw new Error('開始・終了は異なる時刻を設定してください。');
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    requireAdmin_(adminToken);
    const sheet=visitorDowntimeSheet_(),last=sheet.getLastRow();
    const found=last<2?null:sheet.getRange(2,1,last-1,1).createTextFinder(browserId).matchEntireCell(true).matchCase(true).findNext();
    const targetRow=found?found.getRow():last+1;
    sheet.getRange(targetRow,3,1,2).setNumberFormat('@');
    sheet.getRange(targetRow,1,1,4).setValues([[browserId,enabled,start,end]]);
    SpreadsheetApp.flush();
    CacheService.getScriptCache().remove('LINK_CORE_DOWNTIME_V2_'+browserId);
    return {ok:true,config:{enabled,start,end},state:downtimeWindow_({enabled,start,end},Date.now())};
  }finally{lock.releaseLock();}
}

/** Administrator-issued notices; warnings do not automatically ban a visitor. */
function visitorWarningSheet_(create){
  const ss=visitorAccessSpreadsheet_();
  let sheet=ss.getSheetByName('VisitorWarnings');
  if(!sheet&&create){sheet=ss.insertSheet('VisitorWarnings');sheet.appendRow(['ブラウザID','警告ID','警告文','発行日時','有効']);}
  return sheet;
}
function visitorWarning_(browserId){
  if(!/^[A-Za-z0-9_-]{8,100}$/.test(String(browserId||'')))return null;
  const cache=CacheService.getScriptCache(),key='LINK_CORE_WARNING_'+browserId;
  const saved=cache.get(key);if(saved){try{return JSON.parse(saved).warning||null;}catch(_){}}
  const sheet=visitorWarningSheet_(false),last=sheet?sheet.getLastRow():0;
  const found=last<2?null:sheet.getRange(2,1,last-1,1).createTextFinder(browserId).matchEntireCell(true).matchCase(true).findNext();
  const row=found?sheet.getRange(found.getRow(),2,1,4).getDisplayValues()[0]:[];
  const warning=String(row[3]).toLowerCase()==='true'?{id:String(row[0]),message:String(row[1]),issuedAt:String(row[2])}:null;
  cache.put(key,JSON.stringify({warning}),30);return warning;
}
function getVisitorWarning(browserId,adminToken){
  requireAdmin_(adminToken);
  if(!/^[A-Za-z0-9_-]{8,100}$/.test(String(browserId||'')))throw new Error('ブラウザIDが不正です。');
  return {warning:visitorWarning_(browserId)};
}
function setVisitorWarning(browserId,message,enabled,adminToken){
  requireAdmin_(adminToken, 'setVisitorWarning');
  if(!/^[A-Za-z0-9_-]{8,100}$/.test(String(browserId||''))||typeof enabled!=='boolean')throw new Error('ブラウザIDまたは設定が不正です。');
  const text=typeof message==='string'?message.trim():'';
  if(enabled&&(!text||text.length>500||/[\x00-\x1f\x7f]/.test(text)))throw new Error('警告文は改行なしの1〜500文字で入力してください。');
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    requireAdmin_(adminToken);
    const sheet=visitorWarningSheet_(true),last=sheet.getLastRow();
    const found=last<2?null:sheet.getRange(2,1,last-1,1).createTextFinder(browserId).matchEntireCell(true).matchCase(true).findNext();
    const id=Utilities.getUuid(),stamp=new Date();
    sheet.getRange(found?found.getRow():last+1,1,1,5).setValues([[browserId,id,safeCell_(text),stamp,enabled]]);
    SpreadsheetApp.flush();CacheService.getScriptCache().remove('LINK_CORE_WARNING_'+browserId);
    return {ok:true,warning:enabled?{id,message:text,issuedAt:stamp.toISOString()}:null};
  }finally{lock.releaseLock();}
}


/** Explicitly assigned page identities, independent of link titles, URLs and click history. */
function linkPageGroups_(spreadsheet){
  const ss=spreadsheet||SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty(SPREADSHEET_PROPERTY));
  const sheet=ss.getSheetByName('LinkPageGroups'),last=sheet?sheet.getLastRow():0;
  const groups=new Map();
  if(last>1)sheet.getRange(2,1,last-1,2).getDisplayValues().forEach(row=>{
    const id=String(row[0]||'').trim(),name=String(row[1]||'').trim();
    if(id&&name)groups.set(id,name);
  });
  return groups;
}
function linkPageIdentity_(id,title,groups){
  const linkId=String(id||''),name=groups.get(linkId);
  return name?{key:'group:'+name,label:name}:{key:'link:'+(linkId||String(title||'名称未記録')),label:String(title||'名称未記録')};
}
function getLinkPageGroups(adminToken){
  requireAdmin_(adminToken);
  const ss=SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty(SPREADSHEET_PROPERTY));
  const groups=linkPageGroups_(ss),current=getLinksForToken_(adminToken,true).links;
  const stats=new Map(linkViewsSnapshot_().entries.map(item=>[item.id,item.count]));
  const ids=new Set(current.map(link=>String(link.id)));
  const links=current.map(link=>({id:String(link.id),title:String(link.title||''),url:String(link.url||''),group:groups.get(String(link.id))||'',count:stats.get(String(link.id))||0}));
  groups.forEach((group,id)=>{if(!ids.has(id))links.push({id,title:'削除済みリンク（'+id+'）',url:'',group,count:stats.get(id)||0,deleted:true});});
  return {links,groups:Array.from(new Set(groups.values())).sort((a,b)=>a.localeCompare(b,'ja'))};
}
function setLinkPageGroup(linkIds,groupName,adminToken){
  requireAdmin_(adminToken, 'setLinkPageGroup');
  if(!Array.isArray(linkIds)||!linkIds.length||linkIds.length>200||linkIds.some(id=>typeof id!=='string'||!id||id.length>200||/[\x00-\x1f\x7f]/.test(id)))throw new Error('リンクを1〜200件選択してください。');
  if(typeof groupName!=='string')throw new Error('集計ページ名を入力してください。');
  const group=groupName.trim();
  if(group.length>80||/[\x00-\x1f\x7f]/.test(group))throw new Error('集計ページ名は改行なしの80文字以内で入力してください。');
  const available=new Set(getLinksForToken_(adminToken,true).links.map(link=>String(link.id)));
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    requireAdmin_(adminToken);
    const ss=SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty(SPREADSHEET_PROPERTY));
    const groups=linkPageGroups_(ss);
    for(const id of linkIds)if(!available.has(id)&&!groups.has(id))throw new Error('対象リンクが見つかりません。リンク一覧を更新してください。');
    for(const id of new Set(linkIds)){if(group)groups.set(id,group);else groups.delete(id);}
    let sheet=ss.getSheetByName('LinkPageGroups');
    if(!sheet)sheet=ss.insertSheet('LinkPageGroups');
    const rows=Array.from(groups,([id,name])=>[safeCell_(id),safeCell_(name)]);
    const previous=Math.max(0,sheet.getLastRow()-1);
    sheet.getRange(1,1,1,2).setValues([['リンクID','集計ページ名']]);
    if(rows.length+1>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),rows.length+1-sheet.getMaxRows());
    if(rows.length)sheet.getRange(2,1,rows.length,2).setValues(rows);
    if(previous>rows.length)sheet.getRange(rows.length+2,1,previous-rows.length,2).clearContent();
    SpreadsheetApp.flush();
    PropertiesService.getScriptProperties().setProperty('LINK_BASE_PAGE_GROUP_VERSION',Utilities.getUuid());
    return {ok:true,group,updated:new Set(linkIds).size};
  }finally{lock.releaseLock();}
}



/* Admin activity audit. Separate role, tokens, storage and read APIs. */
const ADMIN_AUDIT_PASSWORD_PROPERTY = 'LINK_CORE_SUPER_ADMIN_PASSWORD';
const ADMIN_ACTIVITY_SHEET = 'AdminActivityLogs';
const ADMIN_ACTIVITY_HEADERS = ['ID','記録日時','管理者ブラウザID','管理者名','種別','操作','対象','URL','セッション識別'];
function auditGeneration_(){const value=PropertiesService.getScriptProperties().getProperty(ADMIN_AUDIT_PASSWORD_PROPERTY)||'';return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,value,Utilities.Charset.UTF_8).map(b=>(b&255).toString(16).padStart(2,'0')).join('');}
function requireAdminAudit_(token){if(!isSessionValid_('AUDIT',token))throw new Error('監査用ログインの有効期限が切れました。専用パスワードでログインし直してください。');}
function checkAdminAuditSession(token){requireAdminAudit_(token);return {ok:true,role:'audit'};}
function logoutAdminAuditSession(token){requireAdminAudit_(token);CacheService.getScriptCache().remove('LINK_CORE_AUDIT_'+token);return {ok:true};}
function auditShortText_(value,max){return String(value||'').replace(/[\x00-\x1f\x7f]/g,' ').slice(0,max);}
function activityActor_(token){let actor=null;try{actor=JSON.parse(CacheService.getScriptCache().get('LINK_CORE_ADMIN_ACTIVITY_'+token)||'null');}catch(_){}if(!actor)return null;const name=PropertiesService.getScriptProperties().getProperty('LINK_CORE_STAFF_NAME_'+actor.identityId);actor.name=auditShortText_(name||actor.name||'管理者',40);return actor;}
function bindAdminActivitySession_(token,context){let existing=activityActor_(token);if(existing)return existing;context=context&&typeof context==='object'?context:{};const valid=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(v);const browserId=valid(context.browserId)?context.browserId:'admin-'+Utilities.getUuid();const identityId=valid(context.identityId)?context.identityId:browserId;const name=PropertiesService.getScriptProperties().getProperty('LINK_CORE_STAFF_NAME_'+identityId)||'管理者';const actor={browserId,identityId,name:auditShortText_(name,40),sessionId:Utilities.getUuid()};CacheService.getScriptCache().put('LINK_CORE_ADMIN_ACTIVITY_'+token,JSON.stringify(actor),SESSION_TTL_SECONDS);return actor;}
function ensureAdminActivitySheet_(){const id=PropertiesService.getScriptProperties().getProperty(SPREADSHEET_PROPERTY);if(!id)throw new Error('スプレッドシートIDが未設定です。');const ss=SpreadsheetApp.openById(id);const sheet=ss.getSheetByName(ADMIN_ACTIVITY_SHEET)||ss.insertSheet(ADMIN_ACTIVITY_SHEET);if(sheet.getLastRow()===0)sheet.getRange(1,1,1,ADMIN_ACTIVITY_HEADERS.length).setValues([ADMIN_ACTIVITY_HEADERS]);return sheet;}
function appendAdminActivities_(actor,items){if(!actor||!items.length)return;const lock=LockService.getScriptLock();lock.waitLock(5000);try{const sheet=ensureAdminActivitySheet_();if(items.some(e=>e.id)&&sheet.getLastRow()>1){const last=sheet.getLastRow(),first=Math.max(2,last-499),seen=new Set(sheet.getRange(first,1,last-first+1,1).getValues().map(r=>String(r[0])));items=items.filter(e=>!e.id||!seen.has(e.id));}if(!items.length)return;const now=new Date();const rows=items.map(e=>[e.id||Utilities.getUuid(),now,safeCell_(actor.browserId),safeCell_(actor.name),safeCell_(e.type),safeCell_(e.action),safeCell_(e.target||''),safeCell_(e.url||''),actor.sessionId]);sheet.getRange(sheet.getLastRow()+1,1,rows.length,ADMIN_ACTIVITY_HEADERS.length).setValues(rows);}finally{lock.releaseLock();}}
function auditAdminLogin_(token,context,method){try{const actor=bindAdminActivitySession_(token,context);appendAdminActivities_(actor,[{type:'login',action:'管理者ログイン',target:method}]);}catch(error){console.error('Admin activity login record failed: '+error.message);}}
function attachAdminActivitySession(context,token){requireAdmin_(token);const actor=bindAdminActivitySession_(token,context);return {ok:true};}
function auditAdminOperation_(token,method){try{const actor=activityActor_(token)||bindAdminActivitySession_(token,{});appendAdminActivities_(actor,[{type:method==='logout'?'logout':'operation',action:method==='logout'?'管理者ログアウト':'操作要求',target:auditShortText_(method,80)}]);}catch(error){console.error('Admin activity operation record failed: '+error.message);}}
function auditSafeUrl_(value){return String(value||'').replace(/[?#].*$/,'').replace(/^(https?:\/\/)[^/@]+@/i,'$1').slice(0,1000);}
function recordAdminActivities(events,token){
 requireAdmin_(token);if(!Array.isArray(events)||events.length>30)throw new Error('操作記録の件数が不正です。');const actor=activityActor_(token);if(!actor)throw new Error('管理者の操作記録セッションが未登録です。');
 const cache=CacheService.getScriptCache(),rateKey='LINK_CORE_ACTIVITY_RATE_'+actor.sessionId+'_'+Math.floor(Date.now()/60000);const used=Number(cache.get(rateKey)||0);if(used+events.length>300)throw new Error('操作記録が多すぎます。少し待って再送してください。');
 const valid=events.map(e=>{if(!e||typeof e.id!=='string'||!/^[0-9a-f-]{36}$/i.test(e.id)||!['click','link','navigate'].includes(e.type))throw new Error('操作記録の形式が不正です。');return {id:e.id,type:e.type,target:auditShortText_(e.target,100),linkId:auditShortText_(e.linkId,200)};});
 const dedupeKey='LINK_CORE_ACTIVITY_IDS_'+actor.sessionId;let seen=[];try{seen=JSON.parse(cache.get(dedupeKey)||'[]');}catch(_){}const batchSeen=new Set(seen);const filtered=valid.filter(e=>{if(batchSeen.has(e.id))return false;batchSeen.add(e.id);return true;});let links=[];if(filtered.some(e=>e.type==='link'))links=getLinksForToken_(token,true).links;
 const rows=filtered.map(e=>{if(e.type==='link'){const link=links.find(l=>l.id===e.linkId);if(!link)return {id:e.id,type:'click',action:'リンクを開く（対象不明）',target:e.linkId};return {id:e.id,type:'link',action:'リンクを開く',target:auditShortText_(link.title,200),url:auditSafeUrl_(link.url)};}return {id:e.id,type:e.type,action:e.type==='navigate'?'画面を表示':'ボタン操作',target:e.target};});
 appendAdminActivities_(actor,rows);cache.put(dedupeKey,JSON.stringify([...batchSeen].slice(-240)),SESSION_TTL_SECONDS);cache.put(rateKey,String(used+rows.length),60);return {ok:true,saved:rows.length};
}
function getAdminActivityLogs(options,token){
 requireAdminAudit_(token);options=options||{};const cursor=options.beforeRow;if(cursor!=null&&(!Number.isSafeInteger(cursor)||cursor<2))throw new Error('読み込み位置が不正です。');const type=String(options.type||'');if(type&&!['login','logout','operation','click','link','navigate'].includes(type))throw new Error('種別が不正です。');const actor=String(options.browserId||'');if(actor&&!/^[A-Za-z0-9_-]{8,100}$/.test(actor))throw new Error('管理者ブラウザIDが不正です。');const query=auditShortText_(options.query,80).toLowerCase();const start=String(options.start||''),end=String(options.end||'');if((start&&!/^\d{4}-\d{2}-\d{2}$/.test(start))||(end&&!/^\d{4}-\d{2}-\d{2}$/.test(end))||(start&&end&&start>end))throw new Error('日付の範囲が不正です。');
 const id=PropertiesService.getScriptProperties().getProperty(SPREADSHEET_PROPERTY);const sheet=SpreadsheetApp.openById(id).getSheetByName(ADMIN_ACTIVITY_SHEET);const last=sheet?sheet.getLastRow():0;if(last<2)return {logs:[],nextCursor:null,hasMore:false,total:0};const before=Math.min(cursor||last+1,last+1),first=Math.max(2,before-1000);if(before<=2)return {logs:[],nextCursor:null,hasMore:false,total:last-1};const rows=sheet.getRange(first,1,before-first,9).getValues();const logs=[];let next=null;const names=PropertiesService.getScriptProperties().getProperties();
 for(let i=rows.length-1;i>=0;i--){const row=rows[i];const day=row[1] instanceof Date?Utilities.formatDate(row[1],'Asia/Tokyo','yyyy-MM-dd'):String(row[1]).slice(0,10);if(type&&row[4]!==type||actor&&row[2]!==actor||start&&day<start||end&&day>end)continue;const item={id:String(row[0]),date:toIso_(row[1]),browserId:String(row[2]),name:adminActivityDisplayName_(String(row[2]),row[3],names),type:String(row[4]),action:String(row[5]),target:String(row[6]),url:String(row[7]),sessionId:String(row[8])};if(query&&![item.name,item.browserId,item.action,item.target,item.url].join(' ').toLowerCase().includes(query))continue;logs.push(item);if(logs.length>=100){next=first+i;break;}}
 if(next===null)next=first;return {logs,nextCursor:next>2?next:null,hasMore:next>2,total:last-1};
}
function getAdminActivityOverview(token){requireAdminAudit_(token);const id=PropertiesService.getScriptProperties().getProperty(SPREADSHEET_PROPERTY);const sheet=SpreadsheetApp.openById(id).getSheetByName(ADMIN_ACTIVITY_SHEET);const last=sheet?sheet.getLastRow():0;if(last<2)return {total:0,sample:0,admins:[],counts:{}};const first=Math.max(2,last-1999),rows=sheet.getRange(first,1,last-first+1,9).getValues(),admins={},counts={};const names=PropertiesService.getScriptProperties().getProperties();rows.forEach(r=>{const browser=String(r[2]);admins[browser]={browserId:browser,name:adminActivityDisplayName_(browser,r[3],names)};counts[String(r[4])]=(counts[String(r[4])]||0)+1;});return {total:last-1,sample:rows.length,admins:Object.keys(admins).map(k=>admins[k]),counts};}




/** Browser labels assigned only by the super administrator; original activity rows stay intact. */
function setAdminActivityNickname(browserId,nickname,token){
 requireAdminAudit_(token);
 if(typeof browserId!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(browserId))throw new Error('管理者ブラウザIDが不正です。');
 const name=typeof nickname==='string'?nickname.trim():'';
 if(!name||name.length>24||/[\x00-\x1F\x7F]/.test(name))throw new Error('ニックネームは1〜24文字で入力してください。');
 PropertiesService.getScriptProperties().setProperty('LINK_CORE_AUDIT_NAME_'+browserId,name);
 return {browserId:browserId,nickname:name};
}
function adminActivityDisplayName_(browserId,fallback,names){return String(names['LINK_CORE_AUDIT_NAME_'+browserId]||fallback||'管理者');}


