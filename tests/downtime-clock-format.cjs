const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const source=fs.readFileSync(process.argv[2]||path.join(__dirname,'../Code.gs'),'utf8');
function fn(name){const start=source.indexOf('function '+name+'(');assert(start>=0,name);return source.slice(start,source.indexOf('\n}\n',start)+2);}
function compile(names,scope={}){return new Function(...Object.keys(scope),names.map(fn).join('\n')+';return {'+names.join(',')+'};')(...Object.values(scope));}
const clock=compile(['normalizeDowntimeTime_','downtimeWindow_']);
for(const [raw,expected]of [['22:00','22:00'],['22:00:00','22:00'],['7:00:00','07:00'],['10:00 PM','22:00'],['午後10:00','22:00'],['午前12:00','00:00'],['12:00 PM','12:00'],['2026/11/25 7:00:00','07:00']])assert.equal(clock.normalizeDowntimeTime_(raw),expected,raw);
for(const raw of ['24:00','23:60','9:00:99','invalid'])assert.equal(clock.normalizeDowntimeTime_(raw),'');
const config={enabled:true,start:'22:00:00',end:'7:00:00'};
for(const [time,active]of [['21:59:59',false],['22:00:00',true],['23:00:00',true],['00:00:00',true],['06:59:59',true],['07:00:00',false]])assert.equal(clock.downtimeWindow_(config,Date.parse('2026-11-25T'+time+'+09:00')).active,active,time);
assert.equal(clock.downtimeWindow_({...config,enabled:false},Date.now()).active,false);
assert.equal(clock.downtimeWindow_({enabled:true,start:'bad',end:'07:00'},Date.now()).invalid,true);
let cacheValue=null,reads=0;const keys=[];
const api=compile(['normalizeDowntimeTime_','visitorDowntimeConfig_'],{CacheService:{getScriptCache:()=>({get:k=>{keys.push(k);return cacheValue},put:(k,v)=>{keys.push(k);cacheValue=v}})},visitorAccessSpreadsheet_:()=>{reads++;return {getSheetByName:()=>({getLastRow:()=>2,getRange:()=>({createTextFinder:()=>({matchEntireCell(){return this},matchCase(){return this},findNext:()=>({getRow:()=>2})}),getDisplayValues:()=>[['TRUE','22:00:00','7:00:00']]})})}}});
const read=api.visitorDowntimeConfig_('browser123');assert.equal(read.start,'22:00');assert.equal(read.end,'07:00');assert.equal(read.enabled,true);api.visitorDowntimeConfig_('browser123');assert.equal(reads,1);assert(keys.every(k=>k.startsWith('LINK_CORE_DOWNTIME_V2_')));
const writes=[];const saver=compile(['normalizeDowntimeTime_','downtimeWindow_','saveVisitorDowntime'],{requireAdmin_:t=>{if(t!=='admin')throw Error('auth')},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},visitorDowntimeSheet_:()=>({getLastRow:()=>1,getRange:(r,c,h,w)=>({setNumberFormat:x=>writes.push(['format',c,w,x]),setValues:v=>writes.push(['values',v])})}),SpreadsheetApp:{flush(){}},CacheService:{getScriptCache:()=>({remove:k=>writes.push(['invalidate',k])})}});
assert.throws(()=>saver.saveVisitorDowntime('browser123',true,'22:00','07:00','visitor'));
assert.throws(()=>saver.saveVisitorDowntime('browser123',true,'24:00','07:00','admin'));
saver.saveVisitorDowntime('browser123',true,'22:00:00','7:00:00','admin');
assert.deepEqual(writes[0],['format',3,2,'@']);assert.deepEqual(writes[1][1][0],['browser123',true,'22:00','07:00']);assert(writes[2][1].startsWith('LINK_CORE_DOWNTIME_V2_'));
const guard=compile(['requireVisitorTimeAllowed_'],{visitorDowntimeState_:()=>({invalid:true})});assert.throws(()=>guard.requireVisitorTimeAllowed_('browser123'),/LINK_BASE_DOWNTIME_CONFIG_ERROR/);
console.log('PASS: Sheets clock formats, overnight boundaries, canonical cache, text-formatted save, invalid config protection and permissions');
