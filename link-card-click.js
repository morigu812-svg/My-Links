/* Use the card's existing anchor so authentication gates and visit logging still run. */
(() => {
 document.addEventListener('click', event => {
  if(event.defaultPrevented || event.button!==0 || !(event.target instanceof Element))return;
  const card=event.target.closest('.lc-link-card');
  if(!card || event.target.closest('a,button,input,textarea,select,label,summary,[role="button"],[contenteditable="true"]'))return;
  if(String(window.getSelection?.()||'').trim())return;
  const anchor=card.querySelector('a.title[href]');
  if(!anchor)return;
  let url;try{url=new URL(anchor.getAttribute('href'),location.href);}catch(_){return;}
  if(!/^https?:$/.test(url.protocol) || anchor.getAttribute('href')==='#')return;
  anchor.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window,button:0,ctrlKey:event.ctrlKey,metaKey:event.metaKey,shiftKey:event.shiftKey,altKey:event.altKey}));
 });
})();