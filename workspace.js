/* Shell arrangement only. Existing authentication, data and feature controllers stay intact. */
(() => {
 const ready=()=>{
  const main=document.querySelector('#linksPanel')||document.querySelector('#finderWindow');
  const sidebar=main?.querySelector('.sidebar');
  document.querySelectorAll('.finder-window').forEach(panel=>{
   for(const prop of ['width','height','min-width','min-height','max-width','transform','left','top'])panel.style.removeProperty(prop);
   const title=panel.querySelector('.finder-title');
   if(title&&!title.querySelector('.workspace-brand')){
    const logo=document.createElement('span');logo.className='workspace-brand';logo.textContent='LB';logo.setAttribute('aria-hidden','true');title.prepend(logo);
    for(const node of title.childNodes)if(node.nodeType===Node.TEXT_NODE)node.textContent=node.textContent.replace('My Desktop','LINK BASE').replace('リンクライブラリー','LINK BASE');
   }
  });
  if(sidebar){
   const toolbar=main.querySelector('.finder-toolbar');
   const adminLink=document.querySelector('#linksPanel')&&document.querySelector('a[href="./admin.html"],a[href="admin.html"]');if(adminLink&&!sidebar.contains(adminLink)){adminLink.classList.add('side-item','workspace-admin-link');sidebar.append(adminLink);}
   sidebar.id=sidebar.id||'workspaceNavigation';
   const toggle=document.createElement('button');toggle.type='button';toggle.className='toolbar-menu';toggle.textContent='メニュー';toggle.setAttribute('aria-controls',sidebar.id);toggle.setAttribute('aria-expanded','false');
   const setOpen=open=>{document.body.classList.toggle('workspace-menu-open',open);toggle.setAttribute('aria-expanded',String(open));};
   toggle.onclick=()=>setOpen(!document.body.classList.contains('workspace-menu-open'));toolbar.append(toggle);
   sidebar.addEventListener('click',event=>{if(event.target.closest('.side-item,a'))setOpen(false);});
   document.addEventListener('keydown',event=>{if(event.key==='Escape')setOpen(false);});
   const paths={star:'m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z',clock:'M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',chat:'M21 11a8 8 0 0 1-8 8H8l-5 3V11a9 9 0 0 1 18 0Z',plus:'M12 4v16M4 12h16',folder:'M3 6h6l2 3h10v11H3Z',chart:'M4 20V10m8 10V4m8 16v-7',shield:'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7Z',grid:'M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z'};
   const decorate=()=>sidebar.querySelectorAll('.side-item>span:first-child').forEach(span=>{
    if(span.dataset.workspaceIcon||span.classList.contains('sidebar-category-name')||span.textContent.trim().length>3)return;
    const label=span.parentElement.textContent;const type=/お気に入り/.test(label)?'star':/最近|履歴/.test(label)?'clock':/チャット|相談/.test(label)?'chat':/追加/.test(label)?'plus':/分析|観覧|閲覧/.test(label)?'chart':/警告|セキュリティ/.test(label)?'shield':/すべて/.test(label)?'grid':'folder';
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.6');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[type]);svg.append(path);span.dataset.workspaceIcon='1';span.replaceChildren(svg);
   });
   decorate();new MutationObserver(decorate).observe(sidebar,{childList:true,subtree:true});
  }
  const editor=document.querySelector('#form');
  if(editor){for(const id of ['fTitle','fUrl','fCat','fMemo']){
   const input=document.getElementById(id),label=editor.querySelector('label[for="'+id+'"]');
   if(input&&label&&!input.closest('.editor-field')){const group=document.createElement('div');group.className='editor-field'+(['fCat','fMemo'].includes(id)?' editor-field-wide':'');label.before(group);group.append(label,input);}
  }}
  document.querySelectorAll('.section-kicker').forEach(e=>e.textContent=document.querySelector('#linksPanel')?'リンクライブラリー':document.querySelector('.audit-page')?'最高管理者':'管理ワークスペース');
  const note=document.querySelector('.link-feed-privacy-note');
  if(note&&!note.closest('.workspace-tip')){
   const tip=document.createElement('details');tip.className='workspace-tip';const summary=document.createElement('summary');summary.textContent='このサイトの使い方・案内';tip.append(summary);note.before(tip);tip.append(note);
  }
  const heading=document.querySelector('.workspace .section-heading');const counter=document.querySelector('.visitor-counter-strip');
  if(heading&&counter){heading.after(counter);const notices=document.querySelector('.lb-announcements');if(notices)counter.after(notices);}
  const feed=document.querySelector('.list-heading');
  if(feed){const label=feed.querySelector('strong')||feed.querySelector('span');if(label&&/LINK FEED/.test(label.textContent))label.textContent='リンクとフォルダー';}
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
})();
