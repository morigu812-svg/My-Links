// Browser-ID based entry routing; private-data authorization stays on the server.
(()=>{'use strict';
 const source=document.currentScript.src;
 let allowed=false;
 try{allowed=/^[A-Za-z0-9_-]{8,100}$/.test(localStorage.getItem('linkCoreNoticeBrowserIdV1')||'');}catch{}
 if(!allowed){document.documentElement.style.visibility='hidden';location.replace(new URL('login-required.html',source).href);}
})();
