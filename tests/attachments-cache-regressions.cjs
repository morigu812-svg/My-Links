const fs=require('node:fs'),path=require('node:path');

async function runUntouchedTests(admin,dm,audit,worker){
 const assert=(v,m)=>{if(!v)throw Error(m)},defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
 const scope=(ctx,code,out)=>new Function('ctx','with(ctx){'+code+';return '+out+';}')(ctx);
 let completed=false,attachmentError='',handler;
 const download={disabled:false,textContent:'ダウンロード',addEventListener:(k,f)=>handler=f};
 let i=admin.indexOf("download.addEventListener('click', async () => {"),j=admin.indexOf('\n            });',i)+16;
 assert(i>=0&&j>i,'download callback exists');
 const env={download,adminSession:{getItem:()=> 'token'},ADMIN_TOKEN_KEY:'key',fetchAttachment:async()=>({chunked:true,size:2,mime:'video/mp4'}),STAFF_MAX_FILE_BYTES:40*1024*1024,staffOwnMailbox:'',staffBrowserId:'browser',item:{id:'m'},serverCall:async()=>({ok:true,offset:0,nextOffset:2,base64:'AAA='}),atob:()=>'\0\0',Uint8Array,Blob:class{},URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},document:{createElement:()=>({click:()=>completed=true,remove(){}}),body:{appendChild(){}}},setTimeout(){},staffStatus:{set textContent(v){attachmentError=v}}};
 scope(env,admin.slice(i,j),'null');await handler();assert(completed&&!attachmentError,'chunked download completes instead of ReferenceError');
 const codeStart=dm.indexOf('async function attachmentUrl('),codeEnd=dm.indexOf('\n\n\n',codeStart),body=dm.slice(codeStart,codeEnd);
 const media={mediaUrls:new Map(),generation:1,panel:{open:true},request:async()=>({nextOffset:3,size:3,base64:'bad'}),atob:()=>'\0',Uint8Array,Blob:class{},URL:{createObjectURL:()=> 'blob:bad'}};
 let failed=false;try{await scope(media,body,'attachmentUrl')({id:'x',attachment:{size:3,mime:'image/png'}},'target')}catch{failed=true}assert(failed&&!media.mediaUrls.size,'truncated private attachment rejected');
 let resolved=defer(),applied=0,retry=0;
 const undo={undoTarget:{id:'link',title:'test'},state:{busy:false},adminSession:{getItem:()=> 'a'},ADMIN_TOKEN_KEY:'key',hideUndoToast(){this.undoTarget=null},setBusy(v){undo.state.busy=v},setStatus(){},serverCall:()=>resolved.promise,apply:()=>applied++,showUndoToast:()=>retry++,trashLoaded:true};
 i=admin.indexOf('async function undoDelete(');j=admin.indexOf('\n  async function deleteLinkWithUndo',i);
 const undoFn=scope(undo,admin.slice(i,j),'undoDelete');const task=undoFn();resolved.reject(Error('network'));await task;assert(retry===1&&!undo.state.busy,'failed undo offers retry');
 const nodes=new Map(),el=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',disabled:false,children:[],append(n){this.children.push(n)},replaceChildren(){this.children=[]}});return nodes.get(id)};
 i=audit.indexOf('function renderRows()');j=audit.indexOf('\nfunction options()',i);
 const auditEnv={$:el,logs:[{id:'one',date:'d',name:'a'}],renderedAuditSignatures:[],document:{createElement:()=>({append(){},textContent:''})},text:(n,v)=>n.textContent=v,date:x=>x,types:{},activityAction:()=>'',activityTarget:()=>''};
 const draw=scope(auditEnv,audit.slice(i,j),'renderRows');draw();const row=el('auditRows').children[0];auditEnv.logs.push({id:'two',date:'e',name:'b'});draw();assert(el('auditRows').children[0]===row&&el('auditRows').children.length===2,'audit pagination preserves existing DOM rows');auditEnv.logs[0].name='renamed';draw();assert(el('auditRows').children[0]!==row,'renaming invalidates rows correctly');
 const Url=typeof URL!=='undefined'?URL:class{constructor(value){const m=/^(https?:\/\/[^/]+)(\/[^?#]*)?/.exec(value);this.origin=m[1];this.pathname=m[2]||'/';this.href=value;this.hostname=m[1].split('//')[1];}};
 const handlers={},cacheMap=new Map();let background=[],network={ok:true,clone(){return this}},offline=false;
 const workerEnv={self:{location:{origin:'https://app.test',href:'https://app.test/sw.js'},registration:{scope:'https://app.test/'},addEventListener:(k,f)=>handlers[k]=f},URL:Url,Request:class{constructor(url){this.url=url}},Response:class{constructor(body,opts){this.status=opts.status}},fetch:async()=>{if(offline)throw Error('offline');return network},caches:{open:async()=>({match:async req=>cacheMap.get(req.url),put:async(req,value)=>cacheMap.set(req.url,value)})}};
 scope(workerEnv,worker,'null');
 let response;const event={request:{method:'GET',mode:'navigate',url:'https://app.test/admin.html?v=new'},respondWith:p=>response=p,waitUntil:p=>background.push(p)};handlers.fetch(event);await response;await Promise.all(background);assert(cacheMap.has('https://app.test/admin.html'),'latest HTML persisted under canonical offline URL');
 offline=true;background=[];event.request.url='https://app.test/missing.html';handlers.fetch(event);assert((await response).status===503,'offline cache miss yields explicit response');

 let officialHandler,officialPending=defer(),officialCalls=0,resets=0;const officialNodes=new Map();
 const officialGet=id=>{if(!officialNodes.has(id))officialNodes.set(id,{value:({officialName:'First',officialUrl:'https://example.test/',officialDesc:'Description'})[id]||'',disabled:false,addEventListener:(k,f)=>officialHandler=f,reset:()=>resets++,querySelector:()=>({disabled:false})});return officialNodes.get(id)};
 const official={$:officialGet,officialMutationBusy:false,officialRevision:0,adminSession:{getItem:()=> 'token'},ADMIN_TOKEN_KEY:'key',officialCloudReady:true,officialLinks:[],URL:class{constructor(value){this.href=value;this.protocol='https:';this.hostname='example.test'}},serverCall:()=>{officialCalls++;return officialPending.promise},saveOfficialLinksLocal(){},renderOfficialLinks(){},setOfficialStatus(){},alert(){},confirm:()=>true};
 i=admin.indexOf("  $('officialAddForm').addEventListener('submit', async event => {");j=admin.indexOf("\n  $('officialGrid').addEventListener",i);
 scope(official,admin.slice(i,j),'null');const officialTask=officialHandler({preventDefault(){},currentTarget:officialGet('officialAddForm')});officialHandler({preventDefault(){},currentTarget:officialGet('officialAddForm')});assert(officialCalls===1,'official add double-click deduplicated');officialGet('officialName').value='Next';officialPending.resolve({links:[{id:'saved'}]});await officialTask;assert(resets===0&&!official.officialMutationBusy,'official form keeps next input and releases lock');
 let cloudPending=defer(),painted=0;const officialLoad={adminSession:{getItem:()=> 'token'},ADMIN_TOKEN_KEY:'key',officialRevision:1,serverCall:()=>cloudPending.promise,preserveLegacyOfficialLinks:()=>false,officialLinks:[],officialCloudReady:false,saveOfficialLinksLocal(){},renderOfficialLinks:()=>painted++,setOfficialStatus(){}};
 i=admin.indexOf('async function loadOfficialCloud()');j=admin.indexOf("\n  $('officialAddForm')",i);const loadingCloud=scope(officialLoad,admin.slice(i,j),'loadOfficialCloud')();officialLoad.officialRevision++;cloudPending.resolve({links:[{id:'outdated'}]});await loadingCloud;assert(painted===0&&!officialLoad.officialCloudReady,'stale official load cannot replace mutations');

 return 'PASS: chunked video download, private attachment integrity, undo retry, incremental audit rows, latest HTML offline cache and offline miss';
}

const read=name=>fs.readFileSync(path.join(__dirname,'../',name),'utf8');
runUntouchedTests(read('admin.html'),read('visitor-direct-chat.js'),read('admin-audit.js'),read('sw.js')).then(console.log).catch(error=>{console.error(error);process.exitCode=1;});
