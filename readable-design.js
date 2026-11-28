/* Presentation only: keep existing IDs, authentication, navigation and data. */
(() => {
 document.documentElement.classList.add('readable-design');
 function apply(){
  document.querySelectorAll('.finder-toolbar .finder-title').forEach(title=>{
   if(title.querySelector('.readable-brand'))return;
   const brand=document.createElement('span');brand.className='readable-brand';brand.textContent='LB';brand.setAttribute('aria-hidden','true');title.prepend(brand);
   for(const node of title.childNodes){if(node.nodeType===Node.TEXT_NODE)node.textContent=node.textContent.replace('My Desktop','LINK BASE').replace('管理者アクティビティ','最高管理者');}
  });
  const sidebar=document.querySelector('.finder-window:not(.login-window) .sidebar');
  if(sidebar&&!document.querySelector('.readable-menu-toggle')){
   sidebar.id=sidebar.id||'readableNavigation';
   const menu=document.createElement('button');menu.type='button';menu.className='readable-menu-toggle';menu.textContent='メニュー';menu.setAttribute('aria-controls',sidebar.id);menu.setAttribute('aria-expanded','false');
   const toggle=on=>{document.body.classList.toggle('readable-menu-open',on);menu.setAttribute('aria-expanded',String(on));};
   menu.addEventListener('click',()=>toggle(!document.body.classList.contains('readable-menu-open')));
   sidebar.closest('.finder-window').querySelector('.finder-toolbar').append(menu);
   sidebar.addEventListener('click',e=>{if(e.target.closest('.side-item,a'))toggle(false);});
   document.addEventListener('keydown',e=>{if(e.key==='Escape')toggle(false);});
  }
  const kicker=document.querySelector('.section-kicker');if(kicker)kicker.textContent=document.querySelector('#linksPanel')?'リンクライブラリー':'管理ワークスペース';
  document.querySelectorAll('.section-note').forEach(n=>{if(n.textContent.trim()==='ICON VIEW')n.textContent='ライブラリー';});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
})();
