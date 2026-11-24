
/* Keep the static games in step with visitor downtime. Server-side APIs enforce it independently. */
(()=>{'use strict';
 const root=new URL('../',document.currentScript.src);
 let browser='',token='';
 try{
   browser=localStorage.getItem('linkCoreNoticeBrowserIdV1')||'';
   token=sessionStorage.getItem('linkCoreAdminToken')||'';
   if(!token)token=JSON.parse(sessionStorage.getItem('linkCoreVisitorSessionV1')||'null')?.token||'';
 }catch{}
 if(!/^[A-Za-z0-9_-]{8,100}$/.test(browser))return;
 const frame=document.createElement('iframe');frame.hidden=true;frame.setAttribute('aria-hidden','true');frame.src='https://script.google.com/macros/s/AKfycbwr6gUhjgC_zcazwXqDKOqHqiWt1t-NOjrz3IiOjP-NVaXvAJpKOKQ8Ez6It1qKvkxzFw/exec?mode=bridge';document.documentElement.append(frame);
 let origin='',pending='',sent=0;
 function check(){
   if(!origin||document.hidden||(pending&&Date.now()-sent<30000))return;
   pending=crypto.randomUUID();sent=Date.now();
   frame.contentWindow.postMessage({type:'DAILY_CORE_REQUEST',id:pending,method:'checkViewerSession',args:[token,browser]},origin);
 }
 function lock(){location.replace(root.href);}
 addEventListener('message',event=>{
   if(event.source!==frame.contentWindow)return;
   let host;try{host=new URL(event.origin).hostname;}catch{return;}
   if(host!=='script.google.com'&&!host.endsWith('.googleusercontent.com'))return;
   if(event.data?.type==='DAILY_CORE_BRIDGE_READY'){origin=event.origin;check();return;}
   if(event.data?.type!=='DAILY_CORE_RESPONSE'||event.data.id!==pending)return;
   pending='';
   if(!event.data.ok){if(/LINK_BASE_DOWNTIME:/.test(event.data.error||''))lock();else if(token){token='';check();}return;}
   let unacknowledged=false;const warning=event.data.result?.warning;
   if(warning?.id){try{unacknowledged=localStorage.getItem('linkBaseAcknowledgedWarningV1:'+browser)!==warning.id;}catch{unacknowledged=true;}}
   if(event.data.result?.banned||event.data.result?.downtime?.active||unacknowledged)lock();
 });
 setInterval(check,30000);document.addEventListener('visibilitychange',check);
})();
