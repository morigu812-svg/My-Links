/* Original procedural focus music. Loaded only by admin.html. */
(()=>{'use strict';
if(document.getElementById('adminBgm'))return;
const panel=document.createElement('aside');panel.id='adminBgm';panel.setAttribute('aria-label','作業用BGM');panel.innerHTML='<button type="button" aria-pressed="false">♫ BGM を再生</button><label>音量 <input type="range" min="0" max="100" value="22" aria-label="BGMの音量"></label><span role="status">最初の操作で再生</span>';
document.body.append(panel);const button=panel.querySelector('button'),slider=panel.querySelector('input'),status=panel.querySelector('[role=status]');
let context,master,compressor,timer=null,enabled=true,next=0,step=0,starting=false;
const voices=new Set(),beat=60/76,stepDuration=beat/2;
// Cmaj9, Am9, Fmaj9, G6: eight bars with an evolving 32-bar melody.
const chords=[[48,55,59,62,64],[45,52,55,59,60],[41,48,52,55,57],[43,50,55,57,59]];
const motifs=[[76,74,71,67,69,71,74,71],[72,71,67,64,67,69,71,69],[69,67,64,60,64,67,69,67],[71,69,67,62,67,69,74,71]];
function note(midi,at,duration,volume,type='sine'){
 const osc=context.createOscillator(),amp=context.createGain();osc.type=type;osc.frequency.value=440*2**((midi-69)/12);amp.gain.setValueAtTime(0,at);amp.gain.linearRampToValueAtTime(volume,at+.035);amp.gain.exponentialRampToValueAtTime(.0001,at+duration);osc.connect(amp);amp.connect(compressor);voices.add(osc);osc.onended=()=>{voices.delete(osc);osc.disconnect();amp.disconnect()};osc.start(at);osc.stop(at+duration+.05);
}
function schedule(){if(!context||context.state!=='running'||!enabled)return;const now=context.currentTime;if(next<now-.2)next=now+.06;while(next<now+.45){const bar=Math.floor(step/8),pos=step%8,chord=chords[Math.floor(bar/2)%4];if(pos===0){note(chord[0],next,beat*3.8,.15);for(const pitch of chord.slice(1))note(pitch,next,beat*3.7,.035,'triangle')}note(chord[1+pos%4]+12,next,beat*1.8,.06);if(pos%2===0){const motif=motifs[Math.floor(bar/2)%4],pitch=motif[(pos+Math.floor(bar/8)*2)%8];note(pitch,next,beat*2.5,.075);note(pitch+12,next,beat*1.7,.008)}next+=stepDuration;step++}}
function paint(){const playing=enabled&&context?.state==='running';button.textContent=playing?'♫ BGM ON':'♫ BGM を再生';button.setAttribute('aria-pressed',String(playing));status.textContent=playing?'FOCUS · ピアノ＆アンビエント':enabled?'操作すると再生':'停止中'}
async function start(){if(!enabled||starting)return;starting=true;try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw Error('unsupported');if(!context){context=new Audio();master=context.createGain();master.gain.value=Number(slider.value)/100*.5;compressor=context.createDynamicsCompressor();compressor.threshold.value=-18;compressor.ratio.value=3;compressor.connect(master);master.connect(context.destination);context.onstatechange=()=>{if(context.state==='running'&&enabled){next=context.currentTime+.06;schedule()}paint()}}await context.resume();if(enabled){if(timer===null)timer=setInterval(schedule,100);schedule();removeAutostart()}}catch{status.textContent='BGMを再生できません。もう一度お試しください。'}finally{starting=false;paint()}}
function stop(){enabled=false;clearInterval(timer);timer=null;for(const voice of voices){try{voice.stop()}catch{}}voices.clear();context?.suspend();paint();removeAutostart()}
function auto(event){if(panel.contains(event.target)||!enabled)return;void start()}
function removeAutostart(){document.removeEventListener('pointerdown',auto);document.removeEventListener('keydown',auto)}
document.addEventListener('pointerdown',auto);document.addEventListener('keydown',auto);
button.onclick=()=>{if(enabled&&context?.state==='running')stop();else{enabled=true;void start()}};
slider.oninput=()=>{if(master)master.gain.setTargetAtTime(Number(slider.value)/100*.5,context.currentTime,.08)};
// Keep the music playing through admin panel changes and ordinary tab switches.
// If the OS suspends audio, resume on returning to the page or the next gesture.
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&enabled&&context)void start()});
window.addEventListener('pagehide',()=>{clearInterval(timer);timer=null;context?.suspend()});
window.addEventListener('pageshow',()=>{if(enabled&&context)void start()});
})();
