/* Admin-only original focus soundtrack, native audio playback for Safari/iPad. */
(()=>{'use strict';if(document.getElementById('adminBgm'))return;
const panel=document.createElement('aside');panel.id='adminBgm';panel.setAttribute('aria-label','作業用BGM');panel.innerHTML='<button type="button" aria-pressed="false">BGMを再生</button><label>音量 <input type="range" min="0" max="100" value="40" aria-label="BGMの音量"></label><span role="status">クリック・タップで再生</span>';
document.body.append(panel);const button=panel.querySelector('button'),slider=panel.querySelector('input'),status=panel.querySelector('[role=status]');const audio=document.createElement('audio');audio.src=new URL('assets/audio/focus-loop.mp3',document.currentScript?.src||location.href).href;audio.loop=true;audio.preload='auto';audio.setAttribute('playsinline','');audio.volume=.4;audio.hidden=true;panel.append(audio);
let enabled=true,pending=false;
function paint(message){const playing=!audio.paused&&!audio.ended;button.textContent=playing?'BGM ON · 停止':'BGMを再生';button.setAttribute('aria-pressed',String(playing));status.textContent=message||(playing?'FOCUS · ピアノ＆アンビエント':enabled?'クリック・タップで再生':'停止中')}
function start(){if(!enabled||pending||!audio.paused)return;pending=true;let result;try{result=audio.play()}catch(e){pending=false;paint('BGMを再生できません。再生ボタンを押してください。');return}Promise.resolve(result).then(()=>paint()).catch(e=>{paint(e.name==='NotAllowedError'?'BGMを再生ボタンを押してください':'音源を読み込めません。再生ボタンで再試行')}).finally(()=>{pending=false})}
function gesture(e){if(enabled&&!panel.contains(e.target))start()}
// Capture click/touchend so stopped bubbling inside admin controls cannot prevent unlocking.
for(const type of ['click','touchend','keydown'])document.addEventListener(type,gesture,{capture:true,passive:true});
button.onclick=()=>{if(!audio.paused){enabled=false;audio.pause();paint()}else{enabled=true;if(audio.error)audio.load();start()}};
slider.oninput=()=>{audio.volume=Number(slider.value)/100;paint(Number(slider.value)===0?'音量0です。音量を上げてください':undefined)};
audio.addEventListener('playing',()=>{pending=false;paint()});audio.addEventListener('pause',()=>paint());audio.addEventListener('waiting',()=>paint('音源を読み込み中…'));audio.addEventListener('error',()=>{pending=false;paint('音源を読み込めません。再生ボタンで再試行')});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&enabled)start()});window.addEventListener('pageshow',()=>{if(enabled)start()});window.addEventListener('pagehide',()=>audio.pause());
// Attempt playback immediately if this site already has autoplay permission.
start();
})();
