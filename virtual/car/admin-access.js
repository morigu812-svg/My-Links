// This gates the static preview UI; server data keeps its existing authorization.
(()=>{'use strict';let allowed=false;try{allowed=!!sessionStorage.getItem('linkCoreAdminToken')&&sessionStorage.getItem('linkCoreAdminRoleProtocol')==='2'&&Number(sessionStorage.getItem('linkCoreAdminExpiresAt'))>Date.now();}catch{}
 window.LinkBaseCarAdminPreview=allowed;
 if(allowed)setInterval(()=>{try{if(!sessionStorage.getItem('linkCoreAdminToken')||Number(sessionStorage.getItem('linkCoreAdminExpiresAt'))<=Date.now())location.replace(new URL('../../admin.html',location.href).href);}catch{location.replace(new URL('../../admin.html',location.href).href);}},15000);
 if(!allowed){document.documentElement.style.visibility='hidden';location.replace(new URL('../visitor.html',document.currentScript.src).href);}
})();
