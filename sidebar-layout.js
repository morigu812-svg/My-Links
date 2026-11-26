/* Shared sidebar category tree. Category names and stored link data are unchanged. */
(()=>{'use strict';
 const openPaths=new Set(),closedPaths=new Set();let previousSelection=null;
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function renderCategories({categories,links,selected='',attribute,normalize,parts,icon='',isNew=()=>false}){
  if(!['data-category','data-side-cat'].includes(attribute))throw Error('Unknown category attribute');
  const selectionChanged=selected!==previousSelection;previousSelection=selected;
  const roots=new Map();
  for(const raw of [...categories,...links.map(l=>l.category)]){const path=normalize(raw);if(!path)continue;let map=roots,segments=[];for(const name of parts(path)){segments.push(name);const key=normalize(segments.join('/'));if(!map.has(name))map.set(name,{name,key,children:new Map()});map=map.get(name).children;}}
  const counts=new Map();let uncategorized=0;
  for(const link of links){const path=normalize(link.category);if(!path){uncategorized++;continue;}const segments=parts(path);for(let i=1;i<=segments.length;i++){const key=normalize(segments.slice(0,i).join('/'));counts.set(key,(counts.get(key)||0)+1);}}
  const button=(key,name)=>`<button type="button" class="side-item ${selected===key?'selected':''}" ${attribute}="${escape(key)}" title="${escape(key==='__uncategorized__'?'未分類':key)}"${selected===key?' aria-current="page"':''}><span class="side-folder-mini" aria-hidden="true">${icon}</span><span class="sidebar-category-name">${escape(name)}</span>${isNew(key)?'<span class="new-badge">NEW</span>':''}<span class="sidebar-category-count">${key==='__uncategorized__'?uncategorized:counts.get(key)||0}</span></button>`;
  function tree(map){return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,'ja',{numeric:true})).map(n=>{if(!n.children.size)return button(n.key,n.name);const ancestor=selected===n.key||selected.startsWith(n.key+'/');const open=(selectionChanged&&ancestor)||openPaths.has(n.key)||(!closedPaths.has(n.key)&&ancestor);return `<details class="sidebar-category-branch" data-category-branch="${escape(n.key)}"${open?' open':''}><summary><span class="sidebar-category-chevron" aria-hidden="true">›</span>${button(n.key,n.name)}</summary><div class="sidebar-category-children">${tree(n.children)}</div></details>`;}).join('');}
  return tree(roots)+(uncategorized?button('__uncategorized__','未分類'):'')||'<div class="side-empty">カテゴリーがありません</div>';
 }
 document.addEventListener('toggle',event=>{const node=event.target;if(!node.isConnected||!node.matches?.('.sidebar-category-branch'))return;const key=node.dataset.categoryBranch;if(node.open){openPaths.add(key);closedPaths.delete(key)}else{closedPaths.add(key);openPaths.delete(key)}},true);
 document.addEventListener('click',event=>{if(event.target.closest?.('.sidebar-category-branch summary button'))event.preventDefault();},true);
 window.LinkBaseSidebar={renderCategories};
})();

