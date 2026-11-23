const decoder=new TextDecoder();
export async function readPack(file){
 if(file.size>120*1024*1024)throw Error('120MB以下のZIP/JARを選んでください');
 const bytes=new Uint8Array(await file.arrayBuffer()),v=new DataView(bytes.buffer);let eocd=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(v.getUint32(i,true)===0x06054b50){eocd=i;break;}
 if(eocd<0)throw Error('ZIP/JAR形式を確認してください');
 const count=v.getUint16(eocd+10,true);let cursor=v.getUint32(eocd+16,true),total=0;const files={};
 for(let i=0;i<count;i++){
  if(cursor+46>bytes.length||v.getUint32(cursor,true)!==0x02014b50)throw Error('ZIPの一覧が不正です');
  const method=v.getUint16(cursor+10,true),size=v.getUint32(cursor+20,true),expanded=v.getUint32(cursor+24,true),nl=v.getUint16(cursor+28,true),el=v.getUint16(cursor+30,true),cl=v.getUint16(cursor+32,true),offset=v.getUint32(cursor+42,true);const name=decoder.decode(bytes.subarray(cursor+46,cursor+46+nl));cursor+=46+nl+el+cl;
  if(!/^assets\/minecraft\/(textures\/(block|item)\/[a-z0-9_/]+\.png|models\/block\/[a-z0-9_/]+\.json)$/.test(name))continue;
  if(expanded>4*1024*1024||offset+30>bytes.length||v.getUint32(offset,true)!==0x04034b50)throw Error('素材のサイズまたは形式が不正です');total+=expanded;if(total>64*1024*1024)throw Error('素材は合計64MBまでです');
  const start=offset+30+v.getUint16(offset+26,true)+v.getUint16(offset+28,true);if(start+size>bytes.length)throw Error('ZIPデータが途中で切れています');let data=bytes.slice(start,start+size);
  if(method===8){const reader=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(),chunks=[];let size=0;try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>expanded||size>4*1024*1024)throw Error('展開後の素材が大きすぎます');chunks.push(part.value);}}finally{await reader.cancel().catch(()=>{});}data=new Uint8Array(size);let at=0;for(const chunk of chunks){data.set(chunk,at);at+=chunk.length;}}else if(method!==0)throw Error('この圧縮方式には対応していません');
  if(data.length!==expanded)throw Error('素材の展開に失敗しました');files[name]=name.endsWith('.png')?new Blob([data],{type:'image/png'}):decoder.decode(data);
 }
 if(!Object.keys(files).some(n=>n.includes('/textures/block/')))throw Error('Java版のassets/minecraft/textures/blockを含むZIP/JARが必要です');
 return{name:file.name,files};
}
function db(){return new Promise((resolve,reject)=>{const r=indexedDB.open('link-base-resource-pack',1);r.onupgradeneeded=()=>r.result.createObjectStore('pack');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function savePack(pack){const d=await db();try{await new Promise((resolve,reject)=>{const tx=d.transaction('pack','readwrite');tx.objectStore('pack').put(pack,'active');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{d.close();}}
export async function loadPack(){const d=await db();try{return await new Promise((resolve,reject)=>{const r=d.transaction('pack').objectStore('pack').get('active');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}finally{d.close();}}
export function textureSource(pack){const urls=new Map(),models=new Map();for(const [name,value]of Object.entries(pack.files)){if(value instanceof Blob)urls.set(name,URL.createObjectURL(value));else try{models.set(name,JSON.parse(value));}catch{}}
 function faces(name){const textures={},faces={};function collect(id,depth=0){if(depth>12)return;const model=models.get('assets/minecraft/models/'+id.replace(/^minecraft:/,'')+'.json');if(!model)return;if(model.parent)collect(model.parent,depth+1);Object.assign(textures,model.textures||{});for(const e of model.elements||[])Object.assign(faces,e.faces||{});}collect('block/'+name);
  function resolve(id,depth=0){if(!id||depth>12)return null;if(id[0]==='#')return resolve(textures[id.slice(1)],depth+1);return urls.get('assets/minecraft/textures/'+id.replace(/^minecraft:/,'')+'.png')||null;}
  const fallback=urls.get('assets/minecraft/textures/block/'+name+'.png');return ['east','west','up','down','south','north'].map(face=>resolve(faces[face]?.texture)||resolve(textures.all)||resolve(face==='up'?(textures.top||textures.end):(face==='down'?(textures.bottom||textures.end):textures.side))||fallback||resolve(textures.particle));
 }
 return{faces,icon(name){return urls.get('assets/minecraft/textures/item/'+name+'.png')||faces(name).find(Boolean)||null;},dispose(){for(const url of urls.values())URL.revokeObjectURL(url);}};
}
