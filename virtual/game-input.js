(()=>{'use strict';
 const active=()=>!!document.body&&['walking','racing','in-game'].some(c=>document.body.classList.contains(c));
 const editable=e=>e.target?.closest?.('input,textarea,select,[contenteditable="true"]');
 document.addEventListener('keydown',e=>{if(active()&&!editable(e))e.preventDefault();},true);
 for(const type of ['dblclick','selectstart','contextmenu','dragstart','gesturestart','gesturechange','gestureend'])document.addEventListener(type,e=>{if(active()&&!editable(e))e.preventDefault();},{capture:true,passive:false});
 document.addEventListener('wheel',e=>{if(active()&&(e.ctrlKey||e.metaKey))e.preventDefault();},{passive:false});
 const style=document.createElement('style');style.textContent='body.walking,body.walking *,body.racing,body.racing *,body.in-game,body.in-game *{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}body.walking input,body.walking textarea,body.racing input,body.racing textarea,body.in-game input,body.in-game textarea{-webkit-user-select:text;user-select:text}';document.head.append(style);
})();
