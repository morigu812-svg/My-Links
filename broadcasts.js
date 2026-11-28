/* Announcements and surveys share the existing short-lived, server-issued login. */
window.setupLinkBaseBroadcasts = function ({admin=false,getToken,issueSession}) {
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const button=(text,fn)=>{const b=el('button',text,'btn');b.type='button';b.onclick=fn;return b;};
 let session,sessionToken='',pending,busy=false,items=[],last='',generation=0;
 async function rpc(operation,payload={}) {
  const token=getToken();if(!token)throw Error('ログインしてください。');
  if(!session||sessionToken!==token||session.expiresAt<Date.now()+15000){session=await issueSession();sessionToken=token;}
  if(token!==getToken())throw Error('ログインが変更されました。');
  if(!session?.enabled)throw Error('配信サービスに接続できません。');
  const paths=[location.hostname.endsWith('github.io') ? session.url+'/rest/v1/rpc/link_base_broadcast_api' : '/chat-api/rest/v1/rpc/link_base_broadcast_api'];
  let error;
  for(const path of paths){
   try{const response=await fetch(path,{method:'POST',headers:{apikey:session.key,Authorization:'Bearer '+session.token,'Content-Type':'application/json'},body:JSON.stringify({operation,payload}),signal:AbortSignal.timeout(15000)});const data=await response.json();if(!response.ok){const e=Error(data.message||'通信に失敗しました');e.server=true;throw e;}if(token!==getToken())throw Error('ログインが変更されました。');return data;}
   catch(e){error=e;if(e.server)break;/* Relay missing on GitHub Pages: try direct. */}
  }throw error;
 }
 const dialog=el('dialog',undefined,'lb-broadcast-dialog');document.body.append(dialog);
 const status=el('p','','lb-broadcast-status');status.setAttribute('role','status');
 const close=()=>dialog.close();
 function open(title){dialog.replaceChildren(button('閉じる',close),el('h2',title),status);status.textContent='';if(!dialog.open)dialog.showModal();}
 function fail(e){status.textContent=e.message||String(e);}
 const region=el('section',undefined,'lb-announcements');region.hidden=true;region.setAttribute('aria-label','管理者からのお知らせ');
 const strip=document.getElementById('visitorCounterStrip');if(!admin&&strip)strip.after(region);
 const notices=el('div',undefined,'lb-survey-notifications');notices.setAttribute('aria-label','アンケート通知');document.body.append(notices);
 function render(){
  region.replaceChildren();notices.replaceChildren();region.hidden=true;
  if(!getToken())return;
  let latestNoticeShown=false;
  for(const item of items.filter(i=>i.active)){
   if(item.kind==='notice'){
    if(latestNoticeShown)continue;latestNoticeShown=true;
    region.hidden=false;const card=el('article',undefined,'lb-broadcast-card');card.append(el('small','管理者からのお知らせ'),el('h3',item.title),el('p',item.body));card.append(button('お知らせ一覧を見る',showAnnouncements));region.append(card);
   }else if(!item.answered){notices.append(button('管理者からアンケートが届いています［'+item.title+'］',()=>answer(item)));}
  }
 }
 async function refresh(){
  if(busy)return;const token=getToken();if(!token){items=[];last='';session=null;render();if(dialog.open)dialog.close();return;}
  busy=true;
  try{const data=await rpc('list');if(token!==getToken())return;const json=JSON.stringify(data);if(json!==last){items=data;last=json;if(!admin)render();}}
  catch(e){if(admin&&dialog.open)fail(e);}
  finally{busy=false;}
 }
 function answer(item){
  open(item.title);dialog.append(el('p',item.body));const form=el('form');
  item.questions.forEach((q,index)=>{const label=el('label',`${index+1}. ${q.title}`);let input;
   if(q.type==='choice'){input=el('select');const empty=el('option','選択してください');empty.value='';input.append(empty);q.options.forEach(o=>{const option=el('option',o);option.value=o;input.append(option);});}
   else{input=el('textarea');input.maxLength=2000;input.rows=3;}
   input.name='q'+index;input.required=true;label.append(input);form.append(label);
  });
  const send=el('button','回答を送信','btn primary');send.type='submit';form.append(send);dialog.append(form);
  form.onsubmit=async e=>{e.preventDefault();if(send.disabled)return;send.disabled=true;status.textContent='送信中…';try{await rpc('answer',{id:item.id,answers:item.questions.map((_,i)=>form.elements['q'+i].value.trim())});item.answered=true;render();open('回答ありがとうございました');dialog.append(el('p','回答を保存しました。'));last='';void refresh();}catch(error){fail(error);}finally{send.disabled=false;}};
 }
 async function showAnnouncements(){
  open('お知らせ一覧');status.textContent='読み込み中…';
  try{const token=getToken(),data=await rpc('list');if(token!==getToken())return;items=data;last=JSON.stringify(data);render();status.textContent='';
   const announcements=items.filter(i=>i.kind==='notice'&&i.active);
   if(!announcements.length)dialog.append(el('p','現在、お知らせはありません。'));
   for(const item of announcements){const card=el('article',undefined,'lb-broadcast-card');card.append(el('h3',item.title),el('small',new Date(item.created_at).toLocaleString('ja-JP')),el('p',item.body));dialog.append(card);}
  }catch(e){fail(e);}
 }
 async function manage(){open('お知らせ・アンケート配信');status.textContent='読み込み中…';try{items=await rpc('list');status.textContent='';}catch(e){fail(e);return;}
  const tabs=el('div',undefined,'lb-broadcast-actions');tabs.append(button('お知らせを作成',()=>compose('notice')),button('アンケートを作成',()=>compose('survey')),button('更新',manage));dialog.append(tabs);
  for(const item of items){const card=el('article',undefined,'lb-broadcast-card');card.append(el('h3',item.title),el('small',(item.kind==='survey'?'アンケート':'お知らせ')+' · '+(item.active?'配信中':'終了')+' · '+new Date(item.created_at).toLocaleString('ja-JP')),el('p',item.body));
   if(item.kind==='survey')card.append(button('回答を見る（'+item.response_count+'件）',()=>results(item)));
   if(item.active)card.append(button('配信を終了',async()=>{try{await rpc('close',{id:item.id});last='';await manage();}catch(e){fail(e);}}));dialog.append(card);
  }
 }
 function compose(kind){
  open(kind==='notice'?'お知らせを作成':'アンケートを作成');const form=el('form');
  const field=(caption,max,area=false)=>{const label=el('label',caption),input=el(area?'textarea':'input');input.maxLength=max;input.required=true;label.append(input);form.append(label);return input;};
  const title=field('題名',120),body=field(kind==='survey'?'説明':'お知らせ内容',10000,true);if(kind==='survey')body.required=false;
  const questions=[];const holder=el('div');form.append(holder);
  function add(){if(questions.length>=20)return;const row=el('fieldset');const legend=el('legend','質問 '+(questions.length+1));const question=el('input');question.placeholder='質問文';question.required=true;question.maxLength=300;
   const type=el('select');[['text','自由記述'],['choice','単一選択']].forEach(([v,t])=>{const o=el('option',t);o.value=v;type.append(o);});
   const options=el('textarea');options.placeholder='選択肢を1行に1つ入力（2〜10個）';options.hidden=true;type.onchange=()=>{options.hidden=type.value!=='choice';options.required=!options.hidden;};
   row.append(legend,question,type,options,button('この質問を削除',()=>{questions.splice(questions.indexOf(q),1);row.remove();}));const q={question,type,options};questions.push(q);holder.append(row);
  }
  if(kind==='survey'){add();form.append(button('質問を追加',add));}
  const send=el('button','配信する','btn primary');send.type='submit';form.append(send);dialog.append(form);
  form.onsubmit=async e=>{e.preventDefault();if(send.disabled)return;try{const qs=questions.map(q=>({title:q.question.value.trim(),type:q.type.value,options:[...new Set(q.options.value.split('\n').map(s=>s.trim()).filter(Boolean))]}));if(kind==='survey'&&(!qs.length||qs.some(q=>q.type==='choice'&&(q.options.length<2||q.options.length>10))))throw Error('質問と選択肢を確認してください。');send.disabled=true;status.textContent='配信中…';await rpc('publish',{kind,title:title.value.trim(),body:body.value.trim(),questions:qs});last='';await manage();}catch(e){fail(e);}finally{send.disabled=false;}};
 }
 async function results(item){open(item.title+' · 回答');status.textContent='読み込み中…';try{const rows=await rpc('results',{id:item.id});status.textContent=rows.length+'件（最大2000件を表示）';
  item.questions.forEach((q,i)=>{if(q.type==='choice'){const box=el('article',undefined,'lb-broadcast-card');box.append(el('h3',q.title));q.options.forEach(o=>box.append(el('p',o+'：'+rows.filter(r=>r.answers[i]===o).length+'件')));dialog.append(box);}});
  rows.forEach(r=>{const card=el('article',undefined,'lb-broadcast-card');card.append(el('small',new Date(r.created_at).toLocaleString('ja-JP')));item.questions.forEach((q,i)=>card.append(el('h4',q.title),el('p',r.answers[i])));dialog.append(card);});
 }catch(e){fail(e);}}
 if(!admin){const sidebar=document.querySelector('#linksPanel .sidebar');const b=button('お知らせ',showAnnouncements);b.classList.add('side-item');b.id='visitorAnnouncementsTab';const anchor=sidebar?.querySelector('.sidebar-section');if(anchor)anchor.before(b);else sidebar?.append(b);}
 if(admin){const sidebar=document.querySelector('#finderWindow .sidebar')||document.querySelector('.sidebar');const b=button('お知らせ・アンケート',manage);b.classList.add('side-item');sidebar?.append(b);}
 setInterval(()=>{if(!document.hidden)void refresh();},20000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
 // Login changes are observed without starting any unauthenticated network request.
 setInterval(()=>{const t=getToken();if(t!==pending){pending=t;generation++;items=[];last='';session=null;render();if(dialog.open)dialog.close();void refresh();}},1500);
 void refresh();
};
