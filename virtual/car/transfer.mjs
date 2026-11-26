import {sanitizeProfile} from './profile.mjs?v=academy2';
const KEY='sb_publishable_uSQ9b6y_QL9GQ9gCa8CTMQ_AGs4jRG8';
export async function codeDigest(code){
 if(!/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9_-]{12,64}$/.test(code))throw Error('コードは英字と数字を含む半角12〜64文字（- と _ も使用可）で設定してください。');
 const data=new TextEncoder().encode('link-base-car-transfer-v1:'+code);
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function transferRequest(operation,digest,profile=null,revision=null){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{const response=await fetch('/chat-api/rest/v1/rpc/link_base_driving_transfer',{method:'POST',cache:'no-store',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({operation,code_digest:digest,snapshot:profile,expected_revision:revision}),signal:controller.signal});
 const data=await response.json().catch(()=>null);if(!response.ok||!data?.ok)throw Error(data?.message||'クラウドに接続できません。時間をおいて再試行してください。');
 if(operation==='load'){if(data.profile?.version!==2)throw Error('セーブ形式を確認できません。');data.profile=sanitizeProfile(data.profile);}return data;
 }catch(e){if(e.name==='AbortError')throw Error('通信がタイムアウトしました。再試行してください。');throw e;}finally{clearTimeout(timer)}
}
// One writer at a time; each snapshot carries the last acknowledged server revision.
export function cloudWriter(request,onStatus=()=>{}){
 let session=null,chain=Promise.resolve();
 return {connect(value){session=value},get session(){return session},save(profile){const snapshot=structuredClone(profile),owner=session;if(!owner)return Promise.resolve(false);
 chain=chain.catch(()=>false).then(async()=>{if(session!==owner)return false;try{const data=await request('save',owner.digest,snapshot,owner.revision);owner.revision=data.revision;onStatus('クラウド保存済み',owner);return true;}catch(e){session=null;onStatus(e.message+' 再度コードで読み込むか、別コードで保存してください。',null);return false;}});return chain;}};
}
