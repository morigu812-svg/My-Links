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

  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) {
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
    visibleToVisitors: get('利用者に公開') === false || String(get('利用者に公開')).toLowerCase() === 'false' ? false : true,
    openMode: String(get('開き方') || 'internal').toLowerCase() === 'external' ? 'external' : 'internal',
    isNew: get('NEWラベル') === true || String(get('NEWラベル')).toLowerCase() === 'true',
    createdAt: toIso_(get('作成日時')),
    updatedAt: toIso_(get('更新日時'))
  };
}

/**
 * 全リンクと、カテゴリ一覧を返す。
 */
function readLinks_(sheet, columns) {
  const lastRow = sheet.getLastRow();
  let links = [];

  if (lastRow >= 2) {
    links = sheet
      .getRange(2, 1, lastRow - 1, sheet.getLastColumn())
      .getValues()
      .filter(row => row[columns['ID'] - 1] !== '')
      .map(row => rowToLink_(row, columns));
  }

  const categories = Array.from(
    new Set(links.map(link => link.category).filter(Boolean))
  ).sort();

  return { links: links, categories: categories };
}

/**
 * 初回設定状態を返す。パスワード自体は返さない。
 */
function getAdminSetupStatus() {
  return {
    configured: !!PropertiesService.getScriptProperties().getProperty('LINK_CORE_ADMIN_PASSWORD')
  };
}

// 初期パスワードは Apps Script のスクリプト プロパティで管理者が登録する。

/**
 * 管理者パスワードで認証し、短時間有効なサーバー側トークンを発行する。
 * パスワードは初回設定画面から登録され、Apps Script のスクリプトプロパティに保存される。
 */

/** 利用者ページの共有パスワードを検証して閲覧専用トークンを発行する。 */
function authenticateVisitor(password) {
  const expected = PropertiesService.getScriptProperties().getProperty('LINK_CORE_VISITOR_PASSWORD');
  if (!expected) throw new Error('利用者用パスワードが未設定です。管理者が設定を完了するまでお待ちください。');
  if (typeof password !== 'string' || !password || password !== expected) {
    throw new Error('サイトのパスワードが違います。');
  }
  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put('LINK_CORE_VISITOR_' + token, 'yes', 21600);
  return { ok: true, token: token, expiresIn: 21600 };
}

function requireLinkViewer_(token) {
  if (typeof token === 'string' && token &&
      (CacheService.getScriptCache().get('LINK_CORE_ADMIN_' + token) === 'yes' ||
       CacheService.getScriptCache().get('LINK_CORE_VISITOR_' + token) === 'yes')) return;
  throw new Error('閲覧にはサイトのパスワード認証が必要です。');
}

function authenticateAdmin(password) {
  const expected = PropertiesService.getScriptProperties().getProperty('LINK_CORE_ADMIN_PASSWORD');
  if (!expected) throw new Error('管理者パスワードが未設定です。Apps Script のスクリプト プロパティに LINK_CORE_ADMIN_PASSWORD を登録してください。');
  if (typeof password !== 'string' || !password || password !== expected) {
    throw new Error('管理者パスワードが違います。');
  }
  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put('LINK_CORE_ADMIN_' + token, 'yes', 21600);
  return { ok: true, token: token, expiresIn: 21600 };
}

/** 書き込み系関数は必ずサーバー側で管理者トークンを検証する。 */
function requireAdmin_(token) {
  if (typeof token !== 'string' || !token ||
      CacheService.getScriptCache().get('LINK_CORE_ADMIN_' + token) !== 'yes') {
    throw new Error('管理者ログインが必要です。ログインし直してください。');
  }
}

/**
 * 画面表示用に全リンクを返す。
 */
function getLinks(viewerToken) {
  requireLinkViewer_(viewerToken);
  const sheet = ensureSheet_();
  const result = readLinks_(sheet, getColumnMap_(sheet));

  // 管理者には全件を返すが、利用者用トークンには公開リンクだけを返す。
  // ブラウザー側の表示フィルターだけに頼らず、サーバー側でも非公開を除外する。
  const isAdmin = CacheService.getScriptCache().get('LINK_CORE_ADMIN_' + viewerToken) === 'yes';
  if (!isAdmin) {
    result.links = result.links.filter(link => link.visibleToVisitors === true);
    result.categories = Array.from(new Set(result.links.map(link => link.category).filter(Boolean))).sort();
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

    if (!targetRow) targetRow = lastRow + 1;

    const valuesByHeader = {
      'ID': id,
      'タイトル': safeCell_(title),
      'URL': url,
      'カテゴリ': safeCell_(category),
      'メモ': safeCell_(memo),
      'お気に入り': input.favorite === true,
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

    return readLinks_(sheet, columns);
  } finally {
    lock.releaseLock();
  }
}

/**
 * お気に入りだけを切り替える。
 */
function toggleFavorite(id, favorite, adminToken) {
  requireAdmin_(adminToken);
  const linkId = cleanText_(id, 200);
  if (!linkId) throw new Error('リンクIDがありません。');

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

      for (let i = 0; i < ids.length; i++) {
        if (ids[i][0] === linkId) {
          sheet.getRange(i + 2, columns['お気に入り']).setValue(favorite === true);
          sheet.getRange(i + 2, columns['更新日時']).setValue(new Date());
          break;
        }
      }
    }

    return readLinks_(sheet, columns);
  } finally {
    lock.releaseLock();
  }
}

/**
 * リンクを削除する。
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
          sheet.deleteRow(i + 2);
          break;
        }
      }
    }

    return readLinks_(sheet, columns);
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

function getOfficialLinks() {
  const sheet = ensureOfficialSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { links: [] };
  const rows = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues();
  const headers = rows.shift().map(String), col = {};
  headers.forEach((h, i) => { if (h) col[h] = i; });
  return { links: rows.filter(row => row[col['ID']] !== '').map(row => ({
    id: String(row[col['ID']] || ''),
    name: String(row[col['サイト名']] || ''),
    url: String(row[col['URL']] || ''),
    description: String(row[col['説明']] || ''),
    icon: String(row[col['アイコン']] || ''),
    kind: String(row[col['種別']] || 'custom'),
    createdAt: toIso_(row[col['作成日時']]),
    updatedAt: toIso_(row[col['更新日時']])
  })) };
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
    return getOfficialLinks();
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
    return getOfficialLinks();
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

function getMemos(adminToken) {
  requireAdmin_(adminToken);
  const sheet = ensureMemosSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { memos: [] };
  const width = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, width).getDisplayValues()[0];
  const col = {};
  headers.forEach((header, i) => { if (header) col[header] = i; });
  ['ID', 'タイトル', '本文', '作成日時', '更新日時'].forEach(h => {
    if (col[h] === undefined) throw new Error('必要な列がありません: ' + h);
  });
  const memos = sheet.getRange(2, 1, lastRow - 1, width).getValues()
    .filter(row => row[col['ID']] !== '')
    .map(row => ({
      id: String(row[col['ID']] || ''),
      title: String(row[col['タイトル']] || ''),
      body: String(row[col['本文']] || ''),
      createdAt: toIso_(row[col['作成日時']]),
      updatedAt: toIso_(row[col['更新日時']])
    }));
  memos.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return { memos };
}

function saveMemo(input, adminToken) {
  requireAdmin_(adminToken);
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
    return getMemos(adminToken);
  } finally {
    lock.releaseLock();
  }
}

function deleteMemo(id, adminToken) {
  requireAdmin_(adminToken);
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
    return getMemos(adminToken);
  } finally {
    lock.releaseLock();
  }
}


/* LINK CORE shared chat. Existing Links / OfficialLinks / Memos sheets remain untouched. */
const CHAT_SHEET_NAME = 'ChatMessages';
const CHAT_HEADERS = ['ID', '投稿者', 'メッセージ', '送信日時'];
const CHAT_MAX_MESSAGES = 200;
const CHAT_MAX_LENGTH = 1000;
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
  const sheet = ensureChatSheet_(), last = sheet.getLastRow();
  if (last < 2) return {messages:[]};
  const headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0], col = {};
  headers.forEach((h,i)=>{if(h)col[h]=i;});
  CHAT_HEADERS.forEach(h=>{if(col[h]===undefined)throw new Error('チャットシートに必要な列がありません: '+h);});
  const first = Math.max(2,last-CHAT_MAX_MESSAGES+1);
  const rows = sheet.getRange(first,1,last-first+1,sheet.getLastColumn()).getValues();
  return {messages:rows.filter(r=>r[col['ID']]!=='').map(r=>({
    id:String(r[col['ID']]||''),author:String(r[col['投稿者']]||'利用者'),
    message:String(r[col['メッセージ']]||''),createdAt:toIso_(r[col['送信日時']])
  }))};
}
function sendChatMessage(message, viewerToken) {
  requireLinkViewer_(viewerToken);
  const body = cleanText_(message,CHAT_MAX_LENGTH);
  if(!body)throw new Error('メッセージを入力してください。');
  if(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(body))throw new Error('使用できない制御文字が含まれています。');
  const cache=CacheService.getScriptCache(), rateKey='LINK_CORE_CHAT_RATE_'+viewerToken;
  if(cache.get(rateKey))throw new Error('連続送信はできません。少し待ってから送信してください。');
  const isAdmin=cache.get('LINK_CORE_ADMIN_'+viewerToken)==='yes';
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    if(cache.get(rateKey))throw new Error('連続送信はできません。少し待ってから送信してください。');
    const sheet=ensureChatSheet_(),headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0],col={};
    headers.forEach((h,i)=>{if(h)col[h]=i;});
    const row=new Array(headers.length).fill('');
    row[col['ID']]=Utilities.getUuid();row[col['投稿者']]=isAdmin?'管理者':'利用者';
    row[col['メッセージ']]=safeCell_(body);row[col['送信日時']]=new Date();
    sheet.getRange(sheet.getLastRow()+1,1,1,row.length).setValues([row]);
    cache.put(rateKey,'1',3);
  }finally{lock.releaseLock();}
  return getChatMessages(viewerToken);
}


/* LINK CORE click history. Only authenticated visitors can write; only admins can read. */
const CLICK_LOG_SHEET_NAME = 'ClickLogs';
const CLICK_LOG_HEADERS = ['ID', 'リンクID', 'リンク名', 'URL', 'クリック日時'];
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
  return sheet;
}
function recordLinkClick(linkId, visitorToken) {
  let stage = '利用者認証';
  try {
    if (typeof visitorToken !== 'string' || !visitorToken ||
        CacheService.getScriptCache().get('LINK_CORE_VISITOR_' + visitorToken) !== 'yes') {
      throw new Error('利用者ログインが必要です。ログインの有効期限が切れている可能性があります。');
    }

    stage = 'リンクIDの確認';
    const id = cleanText_(linkId, 200);
    if (!id) throw new Error('リンクIDがありません。');

    stage = 'リンク一覧の読み込み';
    const linksSheet = ensureSheet_();
    const columns = getColumnMap_(linksSheet);
    const last = linksSheet.getLastRow();
    if (last < 2) throw new Error('Linksシートにリンクデータがありません。');
    const rows = linksSheet.getRange(2, 1, last - 1, linksSheet.getLastColumn()).getValues();
    let selected = null;
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][columns['ID'] - 1] || '') === id) {
        selected = rowToLink_(rows[i], columns);
        break;
      }
    }
    if (!selected) throw new Error('Linksシート内にID「' + id + '」のリンクが見つかりません。');
    if (selected.visibleToVisitors !== true) throw new Error('対象リンクが「利用者に公開」になっていません。');

    stage = 'ClickLogsシートへの保存';
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const logSheet = ensureClickLogSheet_();
      logSheet.appendRow([Utilities.getUuid(), safeCell_(selected.id), safeCell_(selected.title), safeCell_(selected.url), new Date()]);
      SpreadsheetApp.flush();
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
function getClickLogs(adminToken) {
  requireAdmin_(adminToken);
  const sheet = ensureClickLogSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return {logs: []};
  const first = Math.max(2, last - 499);
  const rows = sheet.getRange(first, 1, last - first + 1, CLICK_LOG_HEADERS.length).getValues();
  return {logs: rows.filter(row => row[0] !== '').reverse().map(row => ({
    id: String(row[0] || ''), linkId: String(row[1] || ''), title: String(row[2] || ''),
    url: String(row[3] || ''), clickedAt: toIso_(row[4])
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
