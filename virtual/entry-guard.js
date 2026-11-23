// Entry routing only. Authorization for private data remains on the server.
(()=>{'use strict';
 const source=document.currentScript.src,home=new URL('../',source).href;
 const valid=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(id);
 let allowed=false;
 try{
  const id=localStorage.getItem('linkCoreNoticeBrowserIdV1');
  const registered=JSON.parse(localStorage.getItem('linkBaseRegisteredBrowserV1')||'null');
  allowed=valid(id)&&registered?.browserId===id&&registered?.registered===true;
  if(!allowed&&valid(id)){
   const session=JSON.parse(sessionStorage.getItem('linkCoreVisitorSessionV1')||'null');
   if(session?.browserId===id&&typeof session.token==='string'&&session.token&&Number.isFinite(session.expiresAt)&&session.expiresAt>Date.now()&&session.expiresAt<=Date.now()+1800000){
    allowed=true;localStorage.setItem('linkBaseRegisteredBrowserV1',JSON.stringify({browserId:id,registered:true}));
   }
  }
 }catch{}
 if(!allowed){document.documentElement.style.visibility='hidden';location.replace(home);}
})();
