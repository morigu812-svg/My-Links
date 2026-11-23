import * as THREE from '../vendor/three.module.min.js';
import {readSave,writeSave} from '../save.js';
const savedRace=readSave('race');
const $=id=>document.getElementById(id), TAU=Math.PI*2;
const mobileDevice=matchMedia('(pointer:coarse)').matches;
let renderer;
try{renderer=new THREE.WebGLRenderer({canvas:$('world'),antialias:false,powerPreference:'default'});}catch(e){$('error').textContent='3D描画を開始できません。WebGLが有効なブラウザで開いてください。';throw e;}
renderer.setPixelRatio(Math.min(devicePixelRatio,mobileDevice?1:1.25));renderer.setSize(innerWidth,innerHeight);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
const scene=new THREE.Scene();scene.background=new THREE.Color('#080b25');scene.fog=new THREE.FogExp2('#101432',.00145);
const camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,.5,9000);
scene.add(new THREE.HemisphereLight(0xa9d9ff,0x18112e,2));const sun=new THREE.DirectionalLight(0xaaaaff,2.5);sun.position.set(100,500,200);scene.add(sun);
const points=[[-800,140,0],[-500,180,-1000],[600,260,-1450],[1650,210,-900],[1800,320,250],[900,390,1300],[-200,260,1600],[-1350,180,1000]].map(p=>new THREE.Vector3(...p));
const track=new THREE.CatmullRomCurve3(points,true,'catmullrom',.35);track.arcLengthDivisions=4000;track.updateArcLengths();const length=track.getLength(), WIDTH=33;
const samples=Array.from({length:1201},(_,i)=>frame(i/1200));
function frame(u){u=((u%1)+1)%1;const p=track.getPointAt(u),f=track.getTangentAt(u).normalize(),right=new THREE.Vector3().crossVectors(f,new THREE.Vector3(0,1,0)).normalize();const up=new THREE.Vector3().crossVectors(right,f).normalize();return {p,f,right,up};}
const materials={road:new THREE.MeshStandardMaterial({color:0x0a1732,metalness:.65,roughness:.35,side:THREE.DoubleSide}),dark:new THREE.MeshStandardMaterial({color:0x111b34,metalness:.7,roughness:.3}),glass:new THREE.MeshStandardMaterial({color:0x70cced,emissive:0x112f5c,metalness:.8,roughness:.1})};
const glow=(c)=>new THREE.MeshBasicMaterial({color:c});const cyan=glow(0x38edff),pink=glow(0xf153e7),white=glow(0xc9ffff);
function ribbon(offset,width,mat){const verts=[],indices=[];for(let i=0;i<=1200;i++){const fr=samples[i];for(const x of [offset-width/2,offset+width/2]){const p=fr.p.clone().addScaledVector(fr.right,x);verts.push(p.x,p.y,p.z);}if(i<1200){const k=i*2;indices.push(k,k+1,k+2,k+1,k+3,k+2);}}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setIndex(indices);g.computeVertexNormals();const mesh=new THREE.Mesh(g,mat);scene.add(mesh);return mesh;}
ribbon(0,WIDTH*2,materials.road);ribbon(-WIDTH,.45,pink);ribbon(WIDTH,.45,cyan);ribbon(-WIDTH-1.7,1.4,glow(0x281549));ribbon(WIDTH+1.7,1.4,glow(0x123753));
const box=new THREE.BoxGeometry(1,1,1), dummy=new THREE.Object3D();
const lanes=new THREE.InstancedMesh(box,glow(0x42648d),500);for(let i=0;i<250;i++){const fr=frame(i/250);for(let lane=0;lane<2;lane++){dummy.position.copy(fr.p).addScaledVector(fr.right,lane?11:-11).addScaledVector(fr.up,.06);dummy.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(fr.right,fr.up,fr.f.clone().negate()));dummy.scale.set(.16,.12,8);dummy.updateMatrix();lanes.setMatrixAt(i*2+lane,dummy.matrix);}}scene.add(lanes);
function oriented(mesh,fr,offset=0,height=0){mesh.position.copy(fr.p).addScaledVector(fr.right,offset).addScaledVector(fr.up,height);mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(fr.right,fr.up,fr.f.clone().negate()));}
const pads=[];for(let i=0;i<28;i++){const u=(i+.5)/28,off=[-20,0,20][i%3],fr=frame(u),m=new THREE.Mesh(box,glow(i%2?0xff4be3:0x24edff));oriented(m,fr,off,.12);m.scale.set(9,.15,13);scene.add(m);pads.push({u,off});}
// Portal frames follow the road without sharp corners or obstacles.
for(let i=0;i<28;i++){const fr=frame(i/28),gate=new THREE.Group();for(const off of [-WIDTH-2,WIDTH+2]){const post=new THREE.Mesh(box,i%2?pink:cyan);post.position.set(off,10,0);post.scale.set(.6,20,.6);gate.add(post);}const beam=new THREE.Mesh(box,i%2?pink:cyan);beam.position.y=20;beam.scale.set(WIDTH*2+5,.5,.5);gate.add(beam);oriented(gate,fr);scene.add(gate);}
// Geometric city: instanced dark towers and luminous window strips.
let seed=94;function random(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
const towers=new THREE.InstancedMesh(box,new THREE.MeshStandardMaterial({color:0x101b3a,metalness:.45,roughness:.7}),360),windows=new THREE.InstancedMesh(box,glow(0x1a5c85),720),roofs=new THREE.InstancedMesh(box,pink,360);
for(let i=0;i<360;i++){const fr=frame(random()),offset=(90+random()*700)*(random()>.5?1:-1),p=fr.p.clone().addScaledVector(fr.right,offset),h=30+random()*200;const base=-80;dummy.position.set(p.x,base+h/2,p.z);dummy.rotation.set(0,random()*.6,0);const w=15+random()*35,d=15+random()*30;dummy.scale.set(w,h,d);dummy.updateMatrix();towers.setMatrixAt(i,dummy.matrix);dummy.position.y=base+h;dummy.scale.set(w+.4,.7,d+.4);dummy.updateMatrix();roofs.setMatrixAt(i,dummy.matrix);for(let n=0;n<2;n++){dummy.position.set(p.x+(n?1:-1)*w*.3,base+h/2,p.z+d/2+.3);dummy.scale.set(.6,h*.8,.4);dummy.updateMatrix();windows.setMatrixAt(i*2+n,dummy.matrix);}}
scene.add(towers,windows,roofs);const ground=new THREE.Mesh(new THREE.PlaneGeometry(18000,18000),new THREE.MeshBasicMaterial({color:0x060c22}));ground.rotation.x=-Math.PI/2;ground.position.y=-85;scene.add(ground);
const grid=new THREE.GridHelper(12000,180,0x143453,0x0d1c36);grid.position.y=-84;scene.add(grid);
const starG=new THREE.BufferGeometry(),starV=[];for(let i=0;i<550;i++)starV.push((random()-.5)*9000,900+random()*2500,(random()-.5)*9000);starG.setAttribute('position',new THREE.Float32BufferAttribute(starV,3));scene.add(new THREE.Points(starG,new THREE.PointsMaterial({color:0x99cfff,size:2.8,sizeAttenuation:true})));
const moon=new THREE.Mesh(new THREE.SphereGeometry(210,32,16),new THREE.MeshBasicMaterial({color:0x7b4fa5}));moon.position.set(2300,1600,-3500);scene.add(moon);
function car(color){const root=new THREE.Group(),paint=new THREE.MeshStandardMaterial({color,metalness:.7,roughness:.22,emissive:color,emissiveIntensity:.12});const lit=glow(color);
function part(x,y,z,w,h,d,mat){const m=new THREE.Mesh(box,mat);m.position.set(x,y,z);m.scale.set(w,h,d);root.add(m);return m;}
part(0,1,0,4.3,1.1,8.6,paint);part(0,1.9,.2,2.7,1.3,4.3,materials.glass);part(0,.65,-4,3.2,.6,2,paint);part(0,.45,1.4,7.7,.32,3.5,paint);part(0,1,3.9,6.5,.3,1,paint);
for(const x of [-2.6,2.6]){part(x,.3,.5,.65,.7,6.8,materials.dark);part(x,.65,-2.9,.8,.2,1.5,white);part(x,.5,2.9,.7,.3,1.8,lit);}part(0,.45,-4.5,2.9,.18,.3,white);part(0,.6,4.4,3.6,.25,.2,lit);
const jets=[];for(const x of [-1.4,1.4]){const jet=new THREE.Mesh(new THREE.ConeGeometry(.6,6,8),lit);jet.rotation.x=Math.PI/2;jet.position.set(x,.5,7);root.add(jet);jets.push(jet);}root.userData.jets=jets;return root;}
const player=car(0x42dbff);scene.add(player);
const rivals=Array.from({length:5},(_,i)=>{const mesh=car([0xff49be,0xa57bff,0xffcb53,0x50ffbb,0xff715e][i]);scene.add(mesh);return {mesh,progress:30+i*22,lane:(i%3-1)*20,speed:148+i*5,phase:i*2.2};});
const traffic=[];for(let i=0;i<6;i++){const mesh=car(i%2?0x7b55de:0x2f86a3);mesh.scale.setScalar(.8);scene.add(mesh);traffic.push({mesh,u:random(),height:60+random()*100,off:(i%2?1:-1)*(70+random()*170)});}
const keys={left:false,right:false,boost:false};let state='menu',mode='race',progress=0,speed=0,lane=0,laneV=0,energy=100,time=0,bestLap=Infinity,lapStarted=0,lastLap=0,count=0,padCooldown=0,messageTimer=0,collisionCooldown=0,boosting=false;let renderTime=0,lastNow=performance.now(),ready=0;const laps=3;
const fmt=s=>{const ms=Math.floor(Math.max(0,s)*1000);return String(Math.floor(ms/60000)).padStart(2,'0')+':'+String(Math.floor(ms/1000)%60).padStart(2,'0')+'.'+String(ms%1000).padStart(3,'0');};
function message(text,duration=2){$('message').textContent=text;messageTimer=duration;}
let audio=null,osc=null,gain=null,sound=false;function toggleSound(){sound=!sound;if(sound&&!audio){try{audio=new (window.AudioContext||window.webkitAudioContext)();osc=audio.createOscillator();gain=audio.createGain();osc.type='sawtooth';const filter=audio.createBiquadFilter();filter.type='lowpass';filter.frequency.value=500;osc.connect(filter);filter.connect(gain);gain.connect(audio.destination);gain.gain.value=0;osc.start();}catch{sound=false;}}if(audio?.state==='suspended')audio.resume();$('sound').textContent=sound?'音 ON':'音 OFF';$('sound').setAttribute('aria-pressed',String(sound));}
$('sound').onclick=toggleSound;
function reset(nextMode){mode=nextMode;progress=0;speed=0;lane=0;laneV=0;energy=100;time=0;lapStarted=0;lastLap=0;bestLap=Infinity;padCooldown=0;collisionCooldown=0;count=3.2;ready=0;keys.boost=false;keys.left=false;keys.right=false;messageTimer=0;$('message').textContent='';rivals.forEach((r,i)=>{r.progress=30+i*22;r.lane=(i%3-1)*20;r.mesh.visible=mode==='race';});state='countdown';$('menu').hidden=true;$('footer').hidden=true;$('overlay').hidden=true;$('hud').hidden=false;$('pause').hidden=false;document.body.classList.add('racing');$('countdown').textContent='3';$('rank').textContent='6';}
const requestedAudio=new URLSearchParams(location.search).get('audio');
let audioChosen=requestedAudio==='on'||requestedAudio==='off';
if(audioChosen)$('raceAudioGate').hidden=true;
$('raceSoundOn').onclick=()=>{audioChosen=true;if(!sound)toggleSound();$('raceAudioGate').hidden=true;};
$('raceSoundOff').onclick=()=>{audioChosen=true;if(sound)toggleSound();$('raceAudioGate').hidden=true;};
function begin(mode){if(!audioChosen){$('raceAudioGate').hidden=false;return;}if(requestedAudio==='on'&&!sound)toggleSound();reset(mode);}
$('start').onclick=()=>begin('race');$('practice').onclick=()=>begin('practice');$('restart').onclick=()=>reset(mode);$('resume').onclick=()=>pause(false);
function home(){persistRace();state='menu';$('overlay').hidden=true;$('hud').hidden=true;$('menu').hidden=false;$('footer').hidden=false;$('pause').hidden=true;$('countdown').textContent='';document.body.classList.remove('racing','boosting');keys.boost=false;rivals.forEach(r=>r.mesh.visible=true);}
$('home').onclick=home;
function pause(on=state!=='paused'){if(on&&state!=='racing')return;if(!on&&state!=='paused')return;state=on?'paused':'racing';keys.left=keys.right=keys.boost=false;$('overlay').hidden=!on;if(on){$('resultTag').textContent='PAUSED';$('resultTitle').textContent='ひと休み';$('resultText').textContent='準備ができたら、再び空へ。';$('resultStats').replaceChildren();$('resume').hidden=false;$('restart').hidden=true;}persistRace();document.body.classList.remove('boosting');}
$('pause').onclick=()=>pause();document.addEventListener('visibilitychange',()=>{if(document.hidden)pause(true);});
$('fullscreen').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen?.();else document.documentElement.requestFullscreen?.().catch(()=>{});};
function finish(){state='finished';const rank=1+rivals.filter(r=>r.progress>progress).length;$('overlay').hidden=false;$('resume').hidden=true;$('restart').hidden=false;$('resultTag').textContent='SKYLINE GRAND PRIX';$('resultTitle').textContent=rank===1?'VICTORY':rank+'位 FINISH';$('resultText').textContent=rank===1?'ネオンの空は、君のもの。':'ブーストパッドと追い風で、次はもっと速く。';$('resultStats').replaceChildren();for(const text of ['TIME '+fmt(time),'BEST LAP '+fmt(bestLap)]){const el=document.createElement('span');el.textContent=text;$('resultStats').append(el);}records.races++;if(rank===1)records.wins++;records.bestTime=Math.min(records.bestTime||Infinity,time);records.bestLap=Math.min(records.bestLap||Infinity,bestLap);persistRace();refreshRecords();document.body.classList.remove('boosting');}
const bindings={ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',Space:'boost',ShiftLeft:'boost',ShiftRight:'boost'};
addEventListener('keydown',e=>{if(bindings[e.code]){if(state==='racing'||state==='countdown')e.preventDefault();keys[bindings[e.code]]=true;}if((e.code==='KeyP'||e.code==='Escape')&&!e.repeat)pause();if(e.code==='KeyR'&&state==='racing'&&!e.repeat)reset(mode);});
addEventListener('keyup',e=>{if(bindings[e.code])keys[bindings[e.code]]=false;});addEventListener('blur',()=>{keys.left=keys.right=keys.boost=false;pause(true);});
for(const id of ['left','right','boost']){const el=$(id);el.onpointerdown=e=>{e.preventDefault();keys[id]=true;el.setPointerCapture(e.pointerId);};for(const name of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(name,()=>keys[id]=false);}

const positive=value=>Number.isFinite(value)&&value>0?value:null;
const records={bestTime:positive(savedRace?.records?.bestTime),bestLap:positive(savedRace?.records?.bestLap),
  races:Number.isSafeInteger(savedRace?.records?.races)?Math.max(0,savedRace.records.races):0,
  wins:Number.isSafeInteger(savedRace?.records?.wins)?Math.max(0,savedRace.records.wins):0};
const recordStatus=document.createElement('p');recordStatus.className='assist';$('menu').append(recordStatus);
function refreshRecords(){recordStatus.textContent='保存済み記録： '+records.races+'レース / '+records.wins+'勝'+(records.bestTime?' / ベスト '+fmt(records.bestTime):'')+(records.bestLap?' / 最速ラップ '+fmt(records.bestLap):'');}
refreshRecords();
let saveElapsed=0,saveWarning=false;
function persistRace(){
  const active=['racing','paused','countdown'].includes(state);
  const run=active?{mode,progress,speed,lane,energy,time,bestLap:Number.isFinite(bestLap)?bestLap:null,lapStarted,lastLap,rivals:rivals.map(r=>({progress:r.progress,lane:r.lane,speed:r.speed}))}:(state==='finished'?null:readSave('race')?.run||null);
  if(!writeSave('race',{records:{...records,bestLap:positive(records.bestLap),bestTime:positive(records.bestTime)},run,sound})&&!saveWarning){saveWarning=true;message('ブラウザに保存できません',3);}
}
function validRun(run){
  if(!run||!['race','practice'].includes(run.mode))return false;
  if(!['progress','speed','lane','energy','time','lapStarted','lastLap'].every(key=>Number.isFinite(run[key])))return false;
  if(run.progress<0||run.progress>1e8||run.time<0||run.time>1e7||run.lapStarted<0||run.lapStarted>run.time||run.speed<0||run.speed>400||Math.abs(run.lane)>WIDTH||run.energy<0||run.energy>100)return false;
  if(!Number.isInteger(run.lastLap)||run.lastLap!==Math.floor(run.progress/length))return false;
  if(run.mode==='race'&&run.progress>=length*laps)return false;
  return Array.isArray(run.rivals)&&run.rivals.length===5&&run.rivals.every(r=>r&&Number.isFinite(r.progress)&&r.progress>=0&&r.progress<1e8&&Number.isFinite(r.lane)&&Math.abs(r.lane)<=WIDTH&&Number.isFinite(r.speed)&&r.speed>=0&&r.speed<=400);
}
if(validRun(savedRace?.run)){
  const resumeRace=document.createElement('button');resumeRace.textContent='保存したレースの続きから';resumeRace.style.marginTop='12px';
  resumeRace.onclick=()=>{
    if(!audioChosen){$('raceAudioGate').hidden=false;return;}
    const run=savedRace.run;begin(run.mode);
    progress=run.progress;speed=run.speed;lane=run.lane;energy=run.energy;time=run.time;lapStarted=run.lapStarted;lastLap=run.lastLap;bestLap=positive(run.bestLap)||Infinity;
    run.rivals.forEach((r,i)=>Object.assign(rivals[i],r));
    persistRace();
  };
  $('menu').append(resumeRace);
}
addEventListener('pagehide',persistRace);

const map=$('map').getContext('2d');const mapPts=Array.from({length:161},(_,i)=>track.getPointAt(i/160));const bounds={minX:Math.min(...mapPts.map(p=>p.x)),maxX:Math.max(...mapPts.map(p=>p.x)),minZ:Math.min(...mapPts.map(p=>p.z)),maxZ:Math.max(...mapPts.map(p=>p.z))};function mapPos(p){return [15+(p.x-bounds.minX)/(bounds.maxX-bounds.minX)*170,10+(p.z-bounds.minZ)/(bounds.maxZ-bounds.minZ)*135];}
function drawMap(){map.clearRect(0,0,200,160);map.beginPath();mapPts.forEach((p,i)=>{const [x,y]=mapPos(p);i?map.lineTo(x,y):map.moveTo(x,y);});map.strokeStyle='#285274';map.lineWidth=5;map.stroke();map.strokeStyle='#58d1f3';map.lineWidth=1;map.stroke();if(mode==='race')rivals.forEach(r=>{const [x,y]=mapPos(track.getPointAt(((r.progress/length)%1+1)%1));map.fillStyle='#e563b9';map.beginPath();map.arc(x,y,2.8,0,TAU);map.fill();});const [x,y]=mapPos(track.getPointAt(((progress/length)%1+1)%1));map.fillStyle='#efffff';map.shadowColor='#35f5ff';map.shadowBlur=10;map.beginPath();map.arc(x,y,4,0,TAU);map.fill();map.shadowBlur=0;}
const cameraTarget=new THREE.Vector3(),lookTarget=new THREE.Vector3();let hudStep=0;
function update(dt){renderTime+=dt;boosting=false;saveElapsed+=dt;if(saveElapsed>=5){saveElapsed=0;if(state==='racing')persistRace();}
if(state==='menu'){const u=(renderTime*.005)%1;progress=u*length;lane=0;speed=0;}
if(state==='countdown'){count-=dt;$('countdown').textContent=count>0?String(Math.max(1,Math.ceil(count))):'GO';if(count<=0){state='racing';ready=1;message(mode==='practice'?'FREE FLIGHT':'CHASE THE HORIZON',2);}}
if(state==='racing'){
if(ready>0){ready-=dt;if(ready<=0)$('countdown').textContent='';}time+=dt;padCooldown=Math.max(0,padCooldown-dt);collisionCooldown=Math.max(0,collisionCooldown-dt);
const input=(keys.right?1:0)-(keys.left?1:0);laneV=THREE.MathUtils.damp(laneV,input*29,8,dt);lane+=laneV*dt;lane=THREE.MathUtils.clamp(lane,-WIDTH+4,WIDTH-4);
// No spinouts: the ship follows the track automatically, even at top speed.
let draft=false;for(const r of rivals){const gap=r.progress-progress;if(mode==='race'&&gap>5&&gap<90&&Math.abs(r.lane-lane)<8)draft=true;}
boosting=(keys.boost&&energy>1)||padCooldown>1.25;const target=boosting?292:draft?224:207;speed=THREE.MathUtils.damp(speed,target,boosting?1.5:.8,dt);
energy=THREE.MathUtils.clamp(energy+(boosting&&keys.boost?-24:13)*dt,0,100);progress+=speed*dt;
for(const pad of pads){let delta=((progress/length-pad.u+.5)%1+1)%1-.5;if(Math.abs(delta)<.0017&&Math.abs(lane-pad.off)<6&&padCooldown<=0){padCooldown=2.5;energy=Math.min(100,energy+23);message('BOOST GATE',1.1);}}
if(draft&&!boosting)messageTimer<=0&&message('SLIPSTREAM',.5);
for(const r of rivals){r.speed=155+18*Math.sin(time*.13+r.phase)+(r.progress<progress-180?22:0);r.progress+=r.speed*dt;r.lane=THREE.MathUtils.damp(r.lane,Math.sin(time*.1+r.phase)*23,1.2,dt);if(mode==='race'&&Math.abs(r.progress-progress)<8&&Math.abs(r.lane-lane)<5&&collisionCooldown<=0){speed*=.92;lane+=lane>r.lane?2:-2;collisionCooldown=1;}}
const lap=Math.floor(progress/length);if(lap>lastLap){bestLap=Math.min(bestLap,time-lapStarted);records.bestLap=Math.min(records.bestLap||Infinity,bestLap);lapStarted=time;lastLap=lap;if(mode==='race'&&lap>=laps){finish();}else message(mode==='practice'?'LAP '+(lap+1):lap===2?'FINAL LAP':'LAP '+(lap+1),2);}
}
if(state!=='paused'){
const fr=frame(progress/length);oriented(player,fr,lane,2.3+Math.sin(renderTime*8)*.13);player.rotateZ(-laneV*.009);player.rotateX(Math.sin(renderTime*3)*.009);
player.userData.jets.forEach(j=>{j.scale.set(boosting?1.5:1,boosting?2.2:1,boosting?1.5:1);});
rivals.forEach((r,i)=>{const rf=frame((state==='menu'?progress+45+i*25:r.progress)/length);oriented(r.mesh,rf,r.lane,2.5+Math.sin(renderTime*7+i)*.15);});
traffic.forEach((r,i)=>{r.u=(r.u+dt*.006)%1;oriented(r.mesh,frame(r.u),r.off,r.height);});
const back=state==='menu'?30:boosting?23:27,height=state==='menu'?12:11;cameraTarget.copy(fr.p).addScaledVector(fr.right,lane*.75+(state==='menu'?17:0)).addScaledVector(fr.f,-back).addScaledVector(fr.up,height);lookTarget.copy(fr.p).addScaledVector(fr.f,state==='menu'?8:55).addScaledVector(fr.up,3).addScaledVector(fr.right,lane*.65);if(renderTime<.12||count>3){camera.position.copy(cameraTarget);}else camera.position.lerp(cameraTarget,1-Math.exp(-dt*9));camera.lookAt(lookTarget);camera.fov=THREE.MathUtils.damp(camera.fov,boosting?89:state==='menu'?63:75,3,dt);camera.updateProjectionMatrix();
}
if(messageTimer>0){messageTimer-=dt;if(messageTimer<=0)$('message').textContent='';}
document.body.classList.toggle('boosting',boosting&&state==='racing');if(audio&&gain){gain.gain.setTargetAtTime(sound&&state==='racing'?.018:0,audio.currentTime,.1);osc.frequency.setTargetAtTime(45+speed*.31+(boosting?18:0),audio.currentTime,.1);}
hudStep+=dt;if(hudStep>.08){hudStep=0;$('speed').textContent=Math.round(speed*3.6);$('energy').style.width=energy+'%';$('energyLabel').textContent=Math.round(energy)+'%';$('boostHint').textContent=boosting?'BOOST ACTIVE':energy<15?'ENERGY RECHARGING':'SPACE / BOOST';$('time').textContent=fmt(time);$('best').textContent=Number.isFinite(bestLap)?fmt(bestLap):'—';$('lap').textContent=mode==='practice'?String(Math.floor(progress/length)+1):Math.min(laps,Math.floor(progress/length)+1)+' / '+laps;$('rank').textContent=mode==='practice'?'—':String(1+rivals.filter(r=>r.progress>progress).length);drawMap();}
}
function loop(now){const targetFps=state==='racing'||state==='countdown'?(mobileDevice?30:60):24;if(now-lastNow<1000/targetFps-1){requestAnimationFrame(loop);return;}const dt=Math.min(.04,(now-lastNow)/1000);lastNow=now;update(dt);renderer.render(scene,camera);requestAnimationFrame(loop);}requestAnimationFrame(loop);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
