import * as T from './vendor/three.module.min.js';
import {readSave,writeSave} from './save.js';
import {getWallet,awardCredits,todayJst} from './wallet.js';
export function createCityLife({scene,buildAvatar,templates,position,travel,freeze,resume,toast,refreshWallet}){
 const raw=readSave('life')||{},life={food:Math.min(99,Math.max(0,Math.floor(Number(raw.food)||0))),theme:['mint','sunset','violet'].includes(raw.theme)?raw.theme:'mint',visits:Array.isArray(raw.visits)?raw.visits.filter(x=>typeof x==='string').slice(-20):[],family:Array.isArray(raw.family)?raw.family.slice(0,3).map((n,i)=>String(n||['アオイ','ハル','ソラ'][i]).slice(0,12)):['アオイ','ハル','ソラ']};
 const save=()=>writeSave('life',life),people=[],walls=[],furniture=[],box=new T.BoxGeometry(1,1,1),mats=new Map();
 const mat=c=>{if(!mats.has(c))mats.set(c,new T.MeshStandardMaterial({color:c,roughness:.6,metalness:.15}));return mats.get(c)};
 function block(w,h,d,c,x,y,z,list){const m=new T.Mesh(box,mat(c));m.scale.set(w,h,d);m.position.set(x,y,z);scene.add(m);if(list)list.push({x,z,w:w/2+.7,d:d/2+.7});return m;}
 function label(text,x,y,z){const c=document.createElement('canvas');c.width=512;c.height=128;const g=c.getContext('2d');g.fillStyle='#102033';g.fillRect(0,0,512,128);g.fillStyle='#e7fff7';g.textAlign='center';g.font='bold 42px sans-serif';g.fillText(text,256,80);const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;const m=new T.Mesh(new T.PlaneGeometry(17,4),new T.MeshBasicMaterial({map:tex,side:T.DoubleSide}));m.position.set(x,y,z);scene.add(m);return m;}
 // Open-front interiors: actual rooms in the walkable world, not decorative doors.
 function room(x,z,w,d,color,title){block(w,.25,d,'#dde7e9',x,.15,z);block(w,9,.5,color,x,4.5,z-d/2,walls);block(.5,9,d,color,x-w/2,4.5,z,walls);block(.5,9,d,color,x+w/2,4.5,z,walls);for(const side of [-1,1])block(w/2-5,9,.5,color,x+side*(w/4+2.5),4.5,z+d/2,walls);block(w,1,.7,'#70f5dd',x,9,z+d/2);label(title,x,11,z+d/2+.5);}
 room(0,202,34,30,'#446278','YOUR HOME');room(194,0,34,32,'#4c536c','NOVA MARKET');
 // Sofa, bed, kitchen, holographic television and dining table.
 const couch=block(9,1.5,3,'#54bdb5',-8,1,195,furniture);block(9,2,.7,'#337e83',-8,2,194);block(1,2,3,'#337e83',-13,1.5,195);block(6,1,9,'#7d86bb',9,.8,194,furniture);block(5.7,.35,5,'#e5e1fa',9,1.5,194);block(5,.4,2,'#fff7ea',9,1.7,191);block(8,3,3,'#d9b98b',-9,1.5,212,furniture);block(6,3,.5,'#65dce0',-8,4,187);block(4,1.7,4,'#e5bd8b',2,1,204,furniture);
 for(const z of [-8,2,10]){block(20,1.2,2,'#dce5ef',194,1,z,furniture);for(let i=0;i<10;i++){block(1,.9,1,i%3===0?'#ffca7b':i%3===1?'#8ce1ba':'#c2abff',185+i*2,2,z);}}
 block(7,2.5,3,'#6ba5bb',183,1.4,12,furniture);label('FOOD / 15 CR',194,6,-12);
 const homeColors={mint:'#54bdb5',sunset:'#e49b7d',violet:'#9e83dc'};couch.material=mat(homeColors[life.theme]);
 function person(i,family=false){const c={...templates[i%3],style:'short',height:family&&i===2?85:95+i%3*5,suit:['#5a9aca','#d492b6','#73b5a1','#bba176'][i%4]};const model=buildAvatar(c);scene.add(model);const p={model,family,i,phase:i*1.7};people.push(p);return p;}
 for(let i=0;i<14;i++)person(i);for(let i=0;i<3;i++){const p=person(i,true);p.model.position.set(-7+i*6,0,207);p.nameLabel=label(life.family[i],-7+i*6,4,207);p.nameLabel.scale.setScalar(.35);}
 const phoneButton=document.createElement('button');phoneButton.id='phoneButton';phoneButton.innerHTML='<span class="pb-ico">📱</span><span>スマホ</span>';phoneButton.hidden=true;document.body.append(phoneButton);
 const action=document.createElement('button');action.id='lifeAction';action.hidden=true;document.body.append(action);
 const panel=document.createElement('section');panel.id='lifePanel';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','スマホ');document.body.append(panel);
 // --- iPhone-style screen: status bar, wallpaper, app grid, dock (built once) ---
 const phone=document.createElement('div');phone.className='iphone';panel.append(phone);
 const island=document.createElement('div');island.className='island';phone.append(island);
 const statusbar=document.createElement('div');statusbar.className='statusbar';
 statusbar.innerHTML='<span class="sb-time"></span><span class="sb-icons"><span class="sig"><i></i><i></i><i></i><i></i></span><span class="net">5G</span><span class="batt"><i></i></span></span>';
 phone.append(statusbar);
 const screen=document.createElement('div');screen.className='screen';phone.append(screen);
 const homebar=document.createElement('div');homebar.className='homebar';phone.append(homebar);
 let current='phone',near=null,t=0;
 function jstParts(){const d=new Date(Date.now()+9*3600000);const hh=String(d.getUTCHours()).padStart(2,'0'),mm=String(d.getUTCMinutes()).padStart(2,'0');const wd=['日','月','火','水','木','金','土'][d.getUTCDay()];return {time:hh+':'+mm,date:(d.getUTCMonth()+1)+'月'+d.getUTCDate()+'日（'+wd+'）'};}
 function visit(id){if(!life.visits.includes(id)){life.visits.push(id);save();}}
 function el(tag,cls,value){const n=document.createElement(tag);if(cls)n.className=cls;if(value!=null)n.textContent=value;screen.append(n);return n;}
 function button(text,fn,cls){const b=document.createElement('button');b.textContent=text;if(cls)b.className=cls;b.onclick=fn;screen.append(b);return b;}
 function appIcon(emoji,label,fn,cls){const b=document.createElement('button');b.className='appicon '+(cls||'');b.innerHTML='<span class="ai-emoji">'+emoji+'</span><span class="ai-label">'+label+'</span>';b.onclick=fn;return b;}
 function nav(title){const n=document.createElement('div');n.className='navbar';const back=document.createElement('button');back.className='navback';back.textContent='‹ ホーム';back.onclick=()=>open('phone');n.append(back);const t=document.createElement('span');t.className='navtitle';t.textContent=title;n.append(t);const c=document.createElement('span');c.className='navcr';c.textContent=getWallet().balance.toLocaleString('ja-JP')+' CR';n.append(c);screen.append(n);}
 function close(){panel.hidden=true;resume();}
 function open(page='phone'){
  current=page;freeze();panel.hidden=false;screen.replaceChildren();screen.className='screen'+(page==='phone'?' wallpaper':'');
  const now=jstParts();statusbar.querySelector('.sb-time').textContent=now.time;
  if(page==='phone'){
   const cw=document.createElement('div');cw.className='clock-widget';cw.innerHTML='<span class="cw-date">'+now.date+'</span><span class="cw-time">'+now.time+'</span>';screen.append(cw);
   const grid=document.createElement('div');grid.className='appgrid';screen.append(grid);
   const apps=[
    ['🏠','自分の家','a-home',()=>{travel(0,225);close();}],
    ['🛒','スーパー','a-shop',()=>{travel(194,24);close();}],
    ['🏎️','レース会場','a-race',()=>{travel(0,-120);close();}],
    ['⛲','中央広場','a-plaza',()=>{travel(0,26);close();}],
    ['👨‍👩‍👧','家族','a-family',()=>open('family')],
    ['🎒','持ち物','a-inv',()=>open('inventory')],
    ['⚙️','設定','a-set',()=>open('settings')],
    ['💬','街の案内','a-help',()=>open('guide')]];
   for(const [emoji,label,cls,fn] of apps)grid.append(appIcon(emoji,label,fn,cls));
   const dock=document.createElement('div');dock.className='dock';screen.append(dock);
   dock.append(appIcon('🏠','家','a-home',()=>{travel(0,225);close();}));
   dock.append(appIcon('🛒','スーパー','a-shop',()=>{travel(194,24);close();}));
   dock.append(appIcon('🎒','持ち物','a-inv',()=>open('inventory')));
   const closeBtn=document.createElement('button');closeBtn.className='appicon a-close';closeBtn.innerHTML='<span class="ai-emoji">✕</span><span class="ai-label">閉じる</span>';closeBtn.onclick=close;dock.append(closeBtn);
   el('p','hint','行き先をタップして出かけよう。ドックからも開けます。');
   return;
  }
  nav(page==='shop'?'NOVA MARKET':page==='home'?'自分の家':page==='family'?'家族との時間':page==='settings'?'家族の設定':page==='inventory'?'持ち物':'街の案内');
  if(page==='shop'){visit('shop');el('p',null,'食材パック 15 CR。家に持ち帰って家族と食事ができます。所持 '+life.food+' 個');button('食材を買う · 15 CR',()=>{const w=getWallet();if(w.balance<15)return toast('CRが足りません。光を集めたりレースで遊ぼう。');if(life.food>=99)return toast('食材は99個までです。');const next={...w,balance:w.balance-15};if(!writeSave('wallet',next))return toast('保存できませんでした');life.food++;if(!save()){life.food--;writeSave('wallet',w);return toast('持ち物を保存できませんでした');}refreshWallet();toast('食材を購入しました');open('shop');});}
  if(page==='home'){visit('home');el('p',null,'ベッド・ソファ・キッチンのある、あなたと家族の家。');button('家族と話す・食事する',()=>open('family'));el('h3',null,'部屋のカラー');for(const [id,name]of [['mint','ミント'],['sunset','サンセット'],['violet','バイオレット']])button(name,()=>{life.theme=id;couch.material=mat(homeColors[id]);save();toast('部屋の色を保存しました');});}
  if(page==='family'){visit('family');el('p',null,life.family[0]+'「おかえり！今日はどこで遊んだ？」');el('p',null,life.family[1]+'「光を集めて、今夜のごはんを買いに行こうよ。」');el('p',null,life.family[2]+'「レースの話、聞かせて！」');button('一緒に食事 · 食材1個',()=>{if(life.food<1)return toast('スーパーで食材を買ってこよう');const id='dinner:'+todayJst();if(getWallet().claimed.includes(id))return toast('今日はもうみんなで食事しました。また明日！');const reward=awardCredits(id,80);if(!reward.amount)return toast('報酬を保存できませんでした');life.food--;save();refreshWallet();toast('家族との食事！ +80 CR');open('family');});}
  if(page==='settings'){life.family.forEach((name,i)=>{const l=el('label',null,'家族 '+(i+1));const input=document.createElement('input');input.maxLength=12;input.value=name;l.append(input);input.onchange=()=>{life.family[i]=input.value.trim().slice(0,12)||name;save();};});el('p',null,'名前は保存されます。街の名札は次回入場時に更新されます。');}
  if(page==='inventory'){el('p',null,'食材 '+life.food+' 個 / 訪問 '+life.visits.join('・'));const done=['home','shop','family'].every(x=>life.visits.includes(x));el('p',null,'街めぐり：家・スーパー・家族を訪ねよう。達成で120 CR');button('街めぐり報酬を受け取る',()=>{if(!done)return toast('まずは3か所を訪ねよう');const a=awardCredits('life:welcome-tour',120);refreshWallet();toast(a.amount?'街めぐり達成！ +120 CR':'報酬は受取済みです');});}
  if(page==='guide'){el('p',null,'この町は未来の日常の町。北に家と住宅街、東に商店街とスーパー、南に駅と学校、西に公園・図書館・病院があります。');el('p',null,'中央広場から歩いて回れます。南のゲートからは空飛ぶ車のレースに参加できます。');el('p',null,'光を集めるとCRがたまり、スーパーで食材を買って家族と食事ができます。');}
  button('閉じて街へ',close,'wide-close');
 }
 phoneButton.onclick=()=>open();action.onclick=()=>open(near||'phone');
 return {open,close,blocked:()=>!panel.hidden,canWalk(x,z){return !walls.concat(furniture).some(b=>Math.abs(x-b.x)<b.w&&Math.abs(z-b.z)<b.d);},update(dt,active){t+=dt;phoneButton.hidden=!active;near=Math.hypot(position.x,position.z-210)<26?'home':Math.hypot(position.x-194,position.z-8)<28?'shop':null;action.hidden=!active||!near||!panel.hidden;action.textContent=near==='home'?'家・家族 · E':'スーパーで買い物 · E';for(const p of people){p.model.visible=p.model.position.distanceTo(position)<85;if(!p.family){const axis=p.i%2,along=Math.sin(t*.05+p.phase)*175,cross=(p.i%4<2?1:-1)*(23+p.i%3*4);p.model.position.set(axis?along:cross,0,axis?cross:along);p.model.rotation.y=axis?(Math.cos(t*.05+p.phase)>0?Math.PI/2:-Math.PI/2):(Math.cos(t*.05+p.phase)>0?0:Math.PI);}else p.model.rotation.y=Math.sin(t*.3+p.i)*.35;const moving=!p.family;for(const l of p.model.userData.limbs){l.arm.rotation.x=moving?Math.sin(t*7+p.phase)*.35*l.side:0;l.leg.rotation.x=moving?-Math.sin(t*7+p.phase)*.45*l.side:0;}}},interact(){if(near){open(near);return true;}return false;}};
}
