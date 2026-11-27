/* Same-origin handoff: only the visitor grant is sent between tabs, never admin tokens. */
(()=>{'use strict';const topic='link-base-admin-visitor-sso-v1';
 const valid=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(value);
 function channel(){try{return typeof BroadcastChannel==='function'?new BroadcastChannel(topic):null;}catch{return null;}}
 function serve(authenticate,available=()=>true){const bus=channel();if(!bus)return;const responder=crypto.randomUUID();let working=false;
  bus.onmessage=async({data})=>{if(!data||typeof data.id!=='string'||data.id.length>100)return;
   if(data.type==='probe'){if(!available())return;bus.postMessage({type:'available',id:data.id,responder});return;}
   if(data.type!=='grant'||data.responder!==responder||working||!available()||!valid(data.browser)||!/^[a-f0-9]{64}$/.test(data.secret||''))return;
   working=true;try{const auth=await authenticate(data.browser,data.secret);bus.postMessage({type:'result',id:data.id,responder,auth:auth||null});}catch{bus.postMessage({type:'result',id:data.id,responder,auth:null});}finally{working=false;}
  };addEventListener('pagehide',event=>{if(!event.persisted)bus.close();});
 }
 function request(browser,secret){const bus=channel();if(!bus||!valid(browser)||!/^[a-f0-9]{64}$/.test(secret||'')){bus?.close();return Promise.resolve(null);}
  return new Promise(resolve=>{const id=crypto.randomUUID();let chosen='',done=false,timer;
   const finish=auth=>{if(done)return;done=true;clearTimeout(timer);bus.close();resolve(auth);};
   bus.onmessage=({data})=>{if(!data||data.id!==id)return;if(data.type==='available'&&!chosen&&typeof data.responder==='string'){chosen=data.responder;clearTimeout(timer);timer=setTimeout(()=>finish(null),30000);bus.postMessage({type:'grant',id,responder:data.responder,browser,secret});}else if(data.type==='result'&&chosen&&data.responder===chosen)finish(data.auth||null);};
   timer=setTimeout(()=>finish(null),700);bus.postMessage({type:'probe',id});
  });
 }
 window.LinkBaseAdminVisitorSession={serve,request};
})();
