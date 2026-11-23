export const LIMIT=9e12;
const finite=(n,f=0)=>Number.isFinite(n)?Math.max(0,Math.min(LIMIT,n)):f;
export function createState(raw,runId){const valid=raw?.schema===1;return{schema:1,districts:valid?Math.min(999,Math.floor(finite(raw.districts))):0,runId:valid&&/^[a-z0-9-]{10,64}$/i.test(raw.runId)?raw.runId:runId,bank:valid?finite(raw.bank,45):45,stash:valid?finite(raw.stash):0,total:valid?finite(raw.total):0,mines:valid?Math.max(1,Math.min(200,Math.floor(finite(raw.mines,1)))):1,forges:valid?Math.min(200,Math.floor(finite(raw.forges))):0,drones:valid?Math.min(200,Math.floor(finite(raw.drones))):0,taps:valid?Math.floor(finite(raw.taps)):0,claimed:valid?Math.min(50,Math.floor(finite(raw.claimed))):0,combo:0,comboTime:0,boost:0,delivery:0,deliveryClock:0,autoClock:0,savedAt:valid?finite(raw.savedAt):Date.now()};}
export const level=s=>Math.min(50,Math.floor(Math.log(1+s.total/80)/Math.log(1.65)));
export const nextGoal=s=>80*(Math.pow(1.65,level(s)+1)-1);
export const rate=s=>Math.min(LIMIT,s.mines*5*(1+s.districts*.2)*(s.boost>0?2:1));
export const value=s=>1+s.forges*.4;
export function price(s,type){const n=s[type];return Math.min(LIMIT,Math.ceil(({mines:18,forges:32,drones:80}[type]||LIMIT)*Math.pow(1.48,type==='mines'?n-1:n)));}
export function tap(s){s.combo=Math.min(12,s.combo+1);s.comboTime=2;s.boost=Math.min(8,s.boost+.7);const earned=8*(1+s.combo*.15);s.stash=Math.min(LIMIT,s.stash+earned);s.taps++;return earned;}
export function collect(s,manual=true){if(s.stash<1)return 0;const gain=Math.min(LIMIT,Math.floor(s.stash*value(s)*(manual?1+Math.min(12,s.combo)*.04:1)));s.stash=0;s.bank=Math.min(LIMIT,s.bank+gain);s.total=Math.min(LIMIT,s.total+gain);if(manual)s.boost=Math.max(s.boost,2);return gain;}
export function buy(s,type){if(!['mines','forges','drones'].includes(type)||s[type]>=200)return false;const cost=price(s,type);if(s.bank<cost)return false;s.bank-=cost;s[type]++;s.boost=Math.max(s.boost,3);return true;}
export function delivery(s){if(s.delivery<=0)return 0;s.delivery=0;const n=Math.ceil(80+level(s)*30+s.mines*15);s.bank=Math.min(LIMIT,s.bank+n);s.total=Math.min(LIMIT,s.total+n);s.boost=8;return n;}
export function advance(s,seconds){const dt=Math.max(0,Math.min(.25,Number.isFinite(seconds)?seconds:0));s.stash=Math.min(LIMIT,s.stash+rate(s)*dt);s.comboTime=Math.max(0,s.comboTime-dt);if(!s.comboTime)s.combo=0;s.boost=Math.max(0,s.boost-dt);s.deliveryClock+=dt;if(s.deliveryClock>=20){s.deliveryClock=0;s.delivery=8;}s.delivery=Math.max(0,s.delivery-dt);s.autoClock+=dt;if(s.drones>0&&s.autoClock>=Math.max(1.5,8/(1+s.drones*.25))){s.autoClock=0;return collect(s,false);}return 0;}
export function snapshot(s,now){return{...s,combo:0,comboTime:0,boost:0,delivery:0,deliveryClock:0,autoClock:0,savedAt:now};}
export function offline(s,now){const elapsed=Math.max(0,Math.min(120,(now-s.savedAt)/1000));const gain=Math.min(LIMIT,elapsed*s.mines*5*(1+s.districts*.2));s.stash=Math.min(LIMIT,s.stash+gain);s.savedAt=now;return gain;}

export function nextDistrict(s){if(level(s)<12)return false;s.districts++;s.bank=45;s.stash=0;s.total=0;s.mines=1;s.forges=0;s.drones=0;s.claimed=0;s.combo=0;s.comboTime=0;s.boost=0;s.autoClock=0;s.delivery=0;s.deliveryClock=0;return true;}
