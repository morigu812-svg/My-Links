const CAP=1e6,MONEY=9e12;const num=(v,f=0,max=CAP)=>Number.isFinite(v)?Math.max(0,Math.min(max,v)):f;
export function createState(raw,id){const valid=raw?.schema===2,s={schema:2,id:valid&&/^[a-z0-9-]{10,64}$/i.test(raw.id)?raw.id:id,cash:valid?num(raw.cash,0,MONEY):0,sold:valid?Math.floor(num(raw.sold)):0,raw:valid?Math.floor(num(raw.raw)):0,goods:valid?Math.floor(num(raw.goods)):0,oreBuffer:valid?Math.floor(num(raw.oreBuffer)):0,output:valid?Math.floor(num(raw.output)):0,cargo:valid?Math.floor(num(raw.cargo)):0,pick:valid?Math.max(1,Math.floor(num(raw.pick,1,100))):1,refiners:valid?Math.floor(num(raw.refiners,0,100)):0,loaders:valid?Math.floor(num(raw.loaders,0,100)):0,miners:valid?Math.floor(num(raw.miners,0,100)):0,truck:valid?Math.max(1,Math.floor(num(raw.truck,1,100))):1,trip:valid?num(raw.trip,0,6):0,dispatch:valid?num(raw.dispatch,0,4):0,manifest:valid?Math.floor(num(raw.manifest)):0,paid:valid?!!raw.paid:false,mineProgress:0,refineProgress:0,loadProgress:0,autoMine:valid?num(raw.autoMine,0,1):0,autoRefine:valid?num(raw.autoRefine,0,1.5):0,autoLoad:valid?num(raw.autoLoad,0,.5):0,seconds:valid?num(raw.seconds,0,1e9):0,claimed:valid?Math.floor(num(raw.claimed)):0};s.cargo=Math.min(s.cargo,truckCapacity(s));if(s.trip===0){s.manifest=0;s.paid=false;}return s;}
export const carryCapacity=s=>12+Math.floor((s.pick-1)/2)*4;
export const truckCapacity=s=>8+(s.truck-1)*8;
export const mineDuration=s=>Math.max(.07,1/(1+(s.pick-1)*.35));
export const minerRate=s=>s.miners?4*Math.pow(s.miners,1.65):0;
export const refineryRate=s=>s.refiners/1.5;
export const loaderRate=s=>s.loaders*2;
export function cost(s,type){return Math.min(MONEY,Math.ceil(({pick:25,refiners:60,loaders:90,miners:280,truck:70}[type]||MONEY)*(1+.22*(s[type]-(type==='pick'||type==='truck'?1:0))+.02*Math.pow(s[type]-(type==='pick'||type==='truck'?1:0),2))));}
export function unlocked(s,type){return type!=='miners'||s.refiners>=1&&s.loaders>=1&&s.sold>=16;}
export function upgrade(s,type){if(!['pick','refiners','loaders','miners','truck'].includes(type)||s[type]>=100||!unlocked(s,type)||s.cash<cost(s,type))return false;s.cash-=cost(s,type);s[type]++;return true;}
export function deposit(s){const n=Math.min(s.raw,CAP-s.oreBuffer);s.oreBuffer+=n;s.raw-=n;return n;}
export function take(s){const n=Math.min(s.output,Math.max(0,carryCapacity(s)-s.raw-s.goods));s.output-=n;s.goods+=n;return n;}
export function ship(s){if(s.trip>0||s.cargo<1)return false;s.manifest=s.cargo;s.cargo=0;s.dispatch=0;s.trip=6;s.paid=false;return true;}
export function manual(s,action,dt){const events=[];const seconds=Math.max(0,Math.min(.2,Number.isFinite(dt)?dt:0));if(action!=='mine')s.mineProgress=0;if(action!=='refine')s.refineProgress=0;if(action!=='load')s.loadProgress=0;
 if(action==='mine'&&s.raw+s.goods<carryCapacity(s)){s.mineProgress+=seconds;while(s.mineProgress>=mineDuration(s)&&s.raw+s.goods<carryCapacity(s)){s.mineProgress-=mineDuration(s);s.raw++;events.push('mine');}}
 if(action==='refine'&&(s.raw>0||s.oreBuffer>0)){s.refineProgress+=seconds;while(s.refineProgress>=1.5&&(s.raw>0||s.oreBuffer>0)){s.refineProgress-=1.5;if(s.raw>0)s.raw--;else s.oreBuffer--;if(s.raw+s.goods<carryCapacity(s))s.goods++;else s.output=Math.min(CAP,s.output+1);events.push('refine');}}
 if(action==='load'&&s.trip===0&&s.goods>0){s.loadProgress+=seconds;while(s.loadProgress>=.25&&s.goods>0&&s.cargo<truckCapacity(s)){s.loadProgress-=.25;s.goods--;s.cargo++;events.push('load');}if(s.cargo>=truckCapacity(s)){ship(s);events.push('depart');}}
 return events;}
export function advance(s,dt){dt=Math.max(0,Math.min(.2,Number.isFinite(dt)?dt:0));s.seconds+=dt;const events=[];
 if(s.miners){s.autoMine+=minerRate(s)*dt;const n=Math.floor(s.autoMine);s.autoMine-=n;s.oreBuffer=Math.min(CAP,s.oreBuffer+n);}
 if(s.refiners&&s.oreBuffer>0){s.autoRefine+=dt*s.refiners;const n=Math.min(s.oreBuffer,Math.floor(s.autoRefine/1.5));s.autoRefine-=n*1.5;s.oreBuffer-=n;s.output=Math.min(CAP,s.output+n);}else s.autoRefine=0;
 if(s.loaders&&s.trip===0&&s.output>0){s.autoLoad+=dt*s.loaders;const n=Math.min(s.output,truckCapacity(s)-s.cargo,Math.floor(s.autoLoad/.5));s.autoLoad-=n*.5;s.output-=n;s.cargo+=n;if(s.cargo>=truckCapacity(s)){ship(s);events.push('depart');}}else s.autoLoad=0;
 if(s.trip===0&&s.loaders>0&&s.cargo>0){s.dispatch+=dt;if(s.dispatch>=4){ship(s);events.push('depart');}}else if(s.cargo===0)s.dispatch=0;
 if(s.trip>0){s.trip=Math.max(0,s.trip-dt);if(!s.paid&&s.trip<=3){s.cash=Math.min(MONEY,s.cash+s.manifest*10);s.sold=Math.min(CAP,s.sold+s.manifest);s.paid=true;events.push('sale');}if(s.trip===0){s.manifest=0;s.paid=false;events.push('return');}}
 return events;
}
export function bottleneck(s){if(s.refiners===0)return '次は精製機：手作業の1.5秒を自動化';if(s.loaders===0)return '次は積載機：精製品をトラックへ自動搬送';if(s.miners===0)return s.sold<16?'16個販売すると専用採掘機が解放':'次は専用採掘機：採掘から搬送まで自動化';const r=[['採掘機',minerRate(s)],['精製機',refineryRate(s)],['積載機',loaderRate(s)],['トラック',truckCapacity(s)/(6+truckCapacity(s)/Math.max(1,loaderRate(s)))]];r.sort((a,b)=>a[1]-b[1]);return '生産ラインで遅い工程：'+r[0][0];}
