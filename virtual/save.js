// Versioned browser-local saves. Never stores LINK BASE credentials or sends data to a server.
const PREFIX='linkBaseVirtualSaveV1:';
const allowed=new Set(['city','race','wallet','player','life','voxel']);
export function readSave(name){
  if(!allowed.has(name))return null;
  try{
    const raw=localStorage.getItem(PREFIX+name);
    if(!raw||raw.length>100000)return null;
    const data=JSON.parse(raw);
    return data&&data.version===1&&data.payload&&typeof data.payload==='object'&&!Array.isArray(data.payload)?data.payload:null;
  }catch{return null;}
}
export function writeSave(name,payload){
  if(!allowed.has(name))return false;
  try{localStorage.setItem(PREFIX+name,JSON.stringify({version:1,savedAt:new Date().toISOString(),payload}));return true;}
  catch{return false;}
}

