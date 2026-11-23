import {readSave,writeSave} from './save.js';
const KEY='sb_publishable_uSQ9b6y_QL9GQ9gCa8CTMQ_AGs4jRG8';
function validIdentity(value){return value&&/^[0-9a-f-]{36}$/i.test(value.id)&&/^[0-9a-f]{64}$/.test(value.secret);}
export function createCityMultiplayer({snapshot,onPeers,onStatus}){
  let identity=readSave('player');
  if(!validIdentity(identity)){identity={id:crypto.randomUUID(),secret:Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('')};}
  let connected=false,pending=false,room='',timer=0,generation=0,lastSuccess=0,otherCount=0;
  function notify(text){onStatus(text);}
  async function request(operation,selectedRoom){
    const snap=snapshot();return new Promise((resolve,reject)=>{
      const xhr=new XMLHttpRequest();xhr.open('POST','/chat-api/rest/v1/rpc/link_base_virtual_sync',true);xhr.timeout=8000;
      xhr.setRequestHeader('apikey',KEY);xhr.setRequestHeader('Content-Type','application/json');
      xhr.onload=()=>{let data;try{data=JSON.parse(xhr.responseText);}catch{reject(new Error('マルチ通信の中継設定を確認してください。'));return;}
        if(xhr.status<200||xhr.status>=300){reject(new Error(data?.message||'マルチ通信に失敗しました。'));return;}if(!data||typeof data!=='object'||!Array.isArray(data.players)){reject(new Error('マルチ通信の応答が不正です。'));return;}resolve(data);};
      xhr.onerror=()=>reject(new Error('マルチ通信に接続できません。'));xhr.ontimeout=()=>reject(new Error('マルチ通信がタイムアウトしました。'));
      xhr.send(JSON.stringify({player_id:identity.id,player_secret:identity.secret,room_code:selectedRoom,profile:snap.avatar,px:snap.x,pz:snap.z,heading:snap.yaw,operation}));
    });
  }
  function apply(data){lastSuccess=performance.now();otherCount=Array.isArray(data.players)?data.players.length:0;onPeers(data.players||[]);notify(room+' / '+(otherCount+1)+'人'+(otherCount?' / 報酬4倍':' / 参加者を待っています'));}
  function queue(current){clearTimeout(timer);if(current===generation&&connected)timer=setTimeout(()=>tick(current),1600);}
  async function tick(current){
    if(current!==generation||!connected)return;
    if(document.hidden){otherCount=0;onPeers([]);queue(current);return;}
    if(pending){queue(current);return;}pending=true;
    try{const data=await request('heartbeat',room);if(current===generation)apply(data);}
    catch(error){if(current===generation){otherCount=0;onPeers([]);notify(error.message+' ソロ報酬で継続します。');}}
    finally{pending=false;queue(current);}
  }
  return {
    async join(code){
      if(pending)throw new Error('接続処理中です。');const clean=String(code).trim().toUpperCase();if(!/^[A-Z0-9]{4,12}$/.test(clean))throw new Error('ルーム名は半角英数字4〜12文字です。');
      const current=++generation;clearTimeout(timer);connected=false;otherCount=0;onPeers([]);pending=true;room=clean;notify('接続中…');
      try{const data=await request('join',room);if(current!==generation)return;connected=true;writeSave('player',identity);apply(data);queue(current);}
      catch(error){if(current===generation)notify(error.message);throw error;}finally{pending=false;}
    },
    leave(){const wasConnected=connected,oldRoom=room;++generation;clearTimeout(timer);connected=false;otherCount=0;onPeers([]);notify('ソロ / 通常報酬');if(wasConnected)void request('leave',oldRoom).catch(()=>{});},
    isRewardActive(){return connected&&!document.hidden&&otherCount>0&&performance.now()-lastSuccess<6000;},
    get connected(){return connected;}
  };
}

