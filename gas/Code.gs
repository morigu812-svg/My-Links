const SPREADSHEET_PROPERTY = 'MY_LINKS_SPREADSHEET_ID';
const SHEET_NAME = 'Links';
const HEADERS = ['ID', 'サイト名', 'URL', 'カテゴリ', '説明', '作成日時', '更新日時'];

// 初回に1回実行。My-Links専用の新しい保存先を作成し、IDを保存します。
// DAILY COREのスプレッドシートは参照・変更しません。
function setup() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(SPREADSHEET_PROPERTY);
  if (id) {
    const ss = SpreadsheetApp.openById(id);
    ensureHeaders_(ss.getSheetByName(SHEET_NAME));
    Logger.log('既存のMy-Links保存先: ' + ss.getUrl());
    return ss.getUrl();
  }
  const ss = SpreadsheetApp.create('My-Links Data (Private)');
  const sheet = ss.getSheets()[0];
  sheet.setName(SHEET_NAME);
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  props.setProperty(SPREADSHEET_PROPERTY, ss.getId());
  Logger.log('My-Links専用保存先を作成: ' + ss.getUrl());
  return ss.getUrl();
}
function doGet(e) {
  if (e && e.parameter && e.parameter.mode === 'bridge') {
    return HtmlService.createHtmlOutputFromFile('bridge').setTitle('MY LINKS Bridge').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  return HtmlService.createHtmlOutput('<h2>MY LINKS API</h2><p>個人用リンク集の接続APIです。</p>');
}
function getLinks() {
  const sheet = getSheet_(), last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, HEADERS.length).getValues().filter(r => r[0]).map(r => ({
    id:String(r[0]), name:String(r[1]||''), url:String(r[2]||''), category:String(r[3]||'その他'),
    description:String(r[4]||''), createdAt:r[5] instanceof Date ? r[5].toISOString() : String(r[5]||''),
    updatedAt:r[6] instanceof Date ? r[6].toISOString() : String(r[6]||'')
  })).sort((a,b)=>a.name.localeCompare(b.name,'ja'));
}
function saveLink(input) {
  if (!input || typeof input !== 'object') throw new Error('入力データが正しくありません。');
  const name = cleanText_(input.name,100), url = cleanUrl_(input.url);
  const category = cleanText_(input.category||'その他',40)||'その他';
  const description = cleanText_(input.description||'',500);
  if (!name) throw new Error('サイト名を入力してください。');
  if (!url) throw new Error('URLはhttp://またはhttps://で入力してください。');
  const sheet=getSheet_(), id=cleanText_(input.id||'',80), now=new Date(), last=sheet.getLastRow();
  if (id && last>=2) {
    const ids=sheet.getRange(2,1,last-1,1).getDisplayValues().flat(), index=ids.indexOf(id);
    if(index>=0){const row=index+2, created=sheet.getRange(row,6).getValue()||now;
      sheet.getRange(row,1,1,HEADERS.length).setValues([[id,safeCell_(name),url,safeCell_(category),safeCell_(description),created,now]]);
      return {ok:true,id,action:'updated'};
    }
  }
  const newId=Utilities.getUuid();
  sheet.appendRow([newId,safeCell_(name),url,safeCell_(category),safeCell_(description),now,now]);
  return {ok:true,id:newId,action:'created'};
}
function deleteLink(input) {
  const id=cleanText_(input&&input.id,80); if(!id) throw new Error('削除するリンクIDがありません。');
  const sheet=getSheet_(),last=sheet.getLastRow();if(last<2)return {ok:true,deleted:false};
  const ids=sheet.getRange(2,1,last-1,1).getDisplayValues().flat(),index=ids.indexOf(id);
  if(index<0)return {ok:true,deleted:false};sheet.deleteRow(index+2);return {ok:true,deleted:true};
}
function getSheet_() {
  const id=PropertiesService.getScriptProperties().getProperty(SPREADSHEET_PROPERTY);
  if(!id)throw new Error('保存先が未設定です。Apps Scriptでsetup()を1回実行してください。');
  const ss=SpreadsheetApp.openById(id),sheet=ss.getSheetByName(SHEET_NAME);
  if(!sheet)throw new Error('Linksシートがありません。データ保護のため自動作成は行いません。');
  ensureHeaders_(sheet);return sheet;
}
function ensureHeaders_(sheet) {
  if(!sheet)throw new Error('Linksシートがありません。');
  if(sheet.getLastRow()===0){sheet.getRange(1,1,1,HEADERS.length).setValues([HEADERS]);sheet.setFrozenRows(1);return;}
  const existing=sheet.getRange(1,1,1,Math.max(sheet.getLastColumn(),HEADERS.length)).getDisplayValues()[0];
  if(HEADERS.some((h,i)=>existing[i]!==h))throw new Error('Linksシートの見出しが想定と異なります。データ保護のため停止しました。');
}
function cleanText_(value,max){return String(value==null?'':value).replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);}
function cleanUrl_(value){const url=cleanText_(value,2000);if(!/^https?:\/\//i.test(url))return '';try{const u=new URL(url);return ['http:','https:'].includes(u.protocol)?u.href:'';}catch(e){return '';}}
function safeCell_(value){const s=String(value==null?'':value);return /^[=+\-@]/.test(s)?"'"+s:s;}
