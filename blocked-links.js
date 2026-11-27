/* Browser-specific virtual folder. Original link categories are never changed. */
(()=>{'use strict';let dbPromise;
 function db(){if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{const r=indexedDB.open('link-base-blocked-links',1);r.onupgradeneeded=()=>r.result.createObjectStore('reports');r.onsuccess=()=>resolve(r.result);r.onerror=r.onblocked=()=>reject(Error('保存領域を開けません'));}).catch(error=>{dbPromise=null;throw error;});return dbPromise;}
 async function read(key){try{const database=await db();return await new Promise(resolve=>{const r=database.transaction('reports').objectStore('reports').get(key);r.onsuccess=()=>resolve(Array.isArray(r.result)?r.result:[]);r.onerror=()=>resolve([]);});}catch{return [];}}
 let writes=Promise.resolve();function write(key,ids){writes=writes.catch(()=>{}).then(async()=>{try{const database=await db();await new Promise(resolve=>{const tx=database.transaction('reports','readwrite');tx.objectStore('reports').put(ids,key);tx.oncomplete=tx.onerror=tx.onabort=resolve;});}catch{}});}
 window.createBrowserBlockedLinks=onChange=>{
  let key='',ids=new Set(),revision=0,loading=false,pending=new Map();
  return {has:id=>ids.has(String(id)),get size(){return ids.size},reset(){key='';ids=new Set();revision++;loading=false;pending.clear();},configure(browser,filter,serverIds){const next=JSON.stringify([browser,filter]);if(next!==key){key=next;ids=new Set();revision++;loading=false;pending.clear();const version=revision;if(!Array.isArray(serverIds)){loading=true;void read(next).then(saved=>{if(key!==next||revision!==version)return;ids=new Set(saved.map(String));for(const [id,blocked] of pending){if(blocked)ids.add(id);else ids.delete(id);}const changed=pending.size>0;pending.clear();loading=false;if(changed)write(key,[...ids]);onChange();});}}
   if(Array.isArray(serverIds)){ids=new Set(serverIds.map(String));revision++;loading=false;pending.clear();write(key,[...ids]);}
  },update(id,result,filter){if(!key||JSON.parse(key)[1]!==filter)return;id=String(id);const had=ids.has(id);if(result==='blocked')ids.add(id);else ids.delete(id);if(loading)pending.set(id,result==='blocked');else write(key,[...ids]);if(had!==ids.has(id))onChange();}};
 };
})();
