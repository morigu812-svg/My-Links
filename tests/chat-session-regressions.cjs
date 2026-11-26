const fs=require('node:fs'),path=require('node:path');

async function runRegressionTests(visitor,admin){
 const assert=(condition,message)=>{if(!condition)throw Error(message)};
 const scope=(context,code,result)=>new Function('context','with(context){'+code+';return '+result+';}')(context);
 const get=(s,name,next)=>{const start=s.indexOf('async function '+name+'(');const end=next?s.indexOf(next,start):s.indexOf('\n}',start)+2;assert(start>=0&&end>start,name);return s.slice(start,end)};
 const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
 let profile=deferred(),sent=deferred(),calls=0,handler;
 const form={addEventListener:(type,fn)=>handler=fn},input={value:'first',focus(){}},button={disabled:false};
 const context={chatForm:form,chatInput:input,chatSend:button,visitorToken:'old',ensureVisitorChatProfile:()=>profile.promise,visitorChatProfile:{school:'s',filter:'f'},viewerReply:null,sendViewerChat:()=>{calls++;return sent.promise},refreshChat:async()=>{},chatOverlay:{classList:{contains:()=>false}},isVisitorAuthError:()=>false};
 const start=visitor.indexOf("chatForm.addEventListener('submit',async e=>"),end=visitor.indexOf('\n\nfunction showChatImageButton',start);
 scope(context,visitor.slice(start,end),'null');
 const first=handler({preventDefault(){}});handler({preventDefault(){}});
 assert(button.disabled,'send must lock before profile await');profile.resolve(true);await Promise.resolve();await Promise.resolve();assert(calls===1,'double submission prevented');input.value='next draft';sent.resolve({ok:true});await first;assert(input.value==='next draft','new draft preserved');assert(!button.disabled,'send lock released');
 let read=deferred(),logouts=0,loads=0;
 const chat={visitorToken:'a',chatLoading:false,visitorDowntimeDialog:{open:false},readViewerChat:()=>++loads===1?read.promise:Promise.resolve({messages:[]}),renderChat(){},chatLoaded:false,viewerMessagesKey:'',chatMessages:{textContent:'keep'},isVisitorAuthError:()=>true,showVisitorLogin:()=>logouts++,document:{hidden:true}};
 const refresh=scope(chat,get(visitor,'refreshChat'), 'refreshChat');const pending=refresh();chat.visitorToken='b';read.reject(Error('expired'));await pending;assert(logouts===0&&chat.chatMessages.textContent==='keep','stale chat error ignored');
 let fetchProfile=deferred();const cache={visitorToken:'a',visitorChatProfile:null,getNoticeBrowserId:()=> 'browser',call:()=>fetchProfile.promise,alert(){}};const ensure=scope(cache,get(visitor,'ensureVisitorChatProfileImpl','\nasync function openChat'), 'ensureVisitorChatProfileImpl');const fetching=ensure();cache.visitorToken='b';cache.visitorChatProfile={school:'new',filter:'new'};fetchProfile.resolve({school:'old',filter:'old'});await fetching;assert(cache.visitorChatProfile.school==='new','stale profile cannot overwrite new session');
 let inspected=0;const correction={visitorToken:'a',visitorChatProfile:{school:'s',filter:'f',schoolCorrectionRequired:true},setSchoolProfileChoice:()=>{inspected++;throw Error('stop after requirement detected')},alert(){}};await scope(correction,get(visitor,'ensureVisitorChatProfileImpl','\nasync function openChat'),'ensureVisitorChatProfileImpl')();assert(inspected===1,'correction request not bypassed');
 let count=0,dialogWait=deferred();const unique={visitorToken:'a',ensureVisitorChatProfileImpl:()=>{count++;return dialogWait.promise}};const wrapper=visitor.slice(visitor.indexOf('let visitorProfileRequest=null;'),visitor.indexOf('async function ensureVisitorChatProfileImpl'));const dedupe=scope(unique,wrapper,'ensureVisitorChatProfile');const one=dedupe(),two=dedupe();assert(one===two&&count===1,'profile dialog deduplicated');dialogWait.resolve(false);await one;
 const nodes=new Map(),$=id=>{if(!nodes.has(id))nodes.set(id,{disabled:false,textContent:'',replaceChildren(){},appendChild(){}});return nodes.get(id)};
 let diagCalls=0;const diagnostic={diagnosisRunning:false,adminSession:{getItem:()=> 'token'},ADMIN_TOKEN_KEY:'key',$,diagnosisResults:[],diagnosisDuplicates:[],diagnosisTotalUrls:0,document:{createElement:()=>({appendChild(){}})},state:{links:[]},serverCall:async()=>{diagCalls++;return {results:[],nextOffset:0,totalUrls:1}},diagnosisRowsFromResults:()=>[],renderDiagnosis(){},renderDiagnosisError(){},updateDiagnosisSummary(){}};
 await scope(diagnostic,get(admin,'runDiagnosis','\n  function openDiagnosis'),'runDiagnosis')();assert(diagCalls===1&&!diagnostic.diagnosisRunning,'diagnosis must stop when offset does not advance');
 let trash=deferred(),rendered=0,session='a';const trashState={trashLoading:false,trashLoaded:false,adminSession:{getItem:()=>session},ADMIN_TOKEN_KEY:'key',$,serverCall:()=>trash.promise,renderTrash:()=>rendered++};
 const trashTask=scope(trashState,get(admin,'refreshTrash','\n  function openTrash'),'refreshTrash')();session='b';trash.resolve({trash:[{id:'private'}]});await trashTask;assert(rendered===0,'stale trash response ignored');
 let adminHandler,adminSend=deferred();const adminInput={value:'one',focus(){}},adminBtn={disabled:false};
 const adminState={chatForm:{addEventListener:(type,fn)=>adminHandler=fn},chatSend:adminBtn,chatInput:adminInput,adminSession:{getItem:()=> 'token'},ADMIN_TOKEN_KEY:'key',adminVisitorReply:null,updateChatSendStatus(){},adminChatRealtime:null,serverCall:()=>adminSend.promise,refreshAdminChat:async()=>{}};
 const a=admin.indexOf("  chatForm.addEventListener('submit', async event => {"),b=admin.indexOf('\n\n  const staffChat',a);scope(adminState,admin.slice(a,b),'null');const posting=adminHandler({preventDefault(){}});adminInput.value='next admin draft';adminSend.resolve({ok:true});await posting;assert(adminInput.value==='next admin draft','admin next draft preserved');
 return 'PASS: double-send, both chat drafts, stale chat errors, profile cache isolation/corrections/dialog dedupe, diagnosis progress and stale trash';
}

runRegressionTests(fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),fs.readFileSync(path.join(__dirname,'../admin.html'),'utf8')).then(console.log).catch(error=>{console.error(error);process.exitCode=1;});
