import {intersections,signalState,nearestRoad,correctLane,railClosed,railway} from './world-data.mjs?v=academy1';
export const sources=[['警視庁・交通違反の点数一覧','https://www.keishicho.metro.tokyo.lg.jp/menkyo/torishimari/gyosei/seido/tensu.html'],['警視庁・点数制度','https://www.keishicho.metro.tokyo.lg.jp/menkyo/torishimari/gyosei/seido/gyosei15.html'],['神奈川県警・事故の付加点数','https://www.police.pref.kanagawa.jp/tetsuzuki/menkyo/mes83040.html'],['警察庁・教習の標準','https://www.npa.go.jp/laws/notification/koutuu/menkyo/menkyo20250228_008.pdf']];
export const violations={red:{name:'信号無視',points:2,loss:35,critical:true},stop:{name:'指定場所一時不停止',points:2,loss:25,critical:true},wrongWay:{name:'通行区分違反',points:2,loss:20,critical:true},crosswalk:{name:'横断歩行者等妨害',points:2,loss:30,critical:true},railStop:{name:'踏切不停止等',points:2,loss:30,critical:true},rail:{name:'遮断踏切立入り',points:2,loss:40,critical:true},belt:{name:'座席ベルト装着義務違反',points:1,loss:10},signal:{name:'合図不履行',points:1,loss:10},headway:{name:'車間距離不保持（一般道路）',points:1,loss:10},safety:{name:'安全運転義務違反',points:2,loss:30,critical:true},speed:{name:'速度超過',points:1,loss:15},offRoad:{name:'コース逸脱',points:0,loss:15,gameOnly:true},observation:{name:'安全確認不足',points:0,loss:10,gameOnly:true},rough:{name:'急な操作',points:0,loss:3,gameOnly:true}};
export function speedingPoints(over){return over>=50?12:over>=30?6:over>=25?3:over>=20?2:over>0?1:0;}
export function accidentPoints(kind,primary=true){return kind==='building'?(primary?3:2):kind==='pedestrian'?(primary?3:2):0;}
export function disposition(points,prior=0){
 if(prior===0){if(points>=15)return {kind:'cancelled',days:365};if(points>=12)return {kind:'suspended',days:90};if(points>=9)return {kind:'suspended',days:60};if(points>=6)return {kind:'suspended',days:30};}
 else if(prior===1){if(points>=10)return {kind:'cancelled',days:365};if(points>=8)return {kind:'suspended',days:120};if(points>=6)return {kind:'suspended',days:90};if(points>=4)return {kind:'suspended',days:60};}
 else if(prior===2){if(points>=5)return {kind:'cancelled',days:365};if(points>=4)return {kind:'suspended',days:150};if(points>=3)return {kind:'suspended',days:120};if(points>=2)return {kind:'suspended',days:90};}
 else {if(points>=4)return {kind:'cancelled',days:365};if(points>=3)return {kind:'suspended',days:prior>=4?180:150};if(points>=2)return {kind:'suspended',days:prior>=4?150:120};}
 return {kind:'valid',days:0};
}
export function createRuleTracker(){return {cooldowns:{},stops:{},amber:{},lastSignals:{},durations:{},latched:{},lastHeading:null,turning:false,turnStart:0,turnIndicator:0,turnChecked:false};}
function trigger(t,code,time,out,detail='',points){if(time<(t.cooldowns[code]||0))return;t.cooldowns[code]=time+12;out.push({...violations[code],code,detail,...(points===undefined?{}:{points})});}
export function checkRules(tracker,previous,car,time,dt,{campus=false,wet=false,agents=[]}={}){
 const out=[],speed=Math.abs(car.speed)*3.6;if(campus)return out;const road=nearestRoad(car);
 function sustained(name,active,seconds,code,detail='',points){if(!active){tracker.durations[name]=0;tracker.latched[name]=false;return;}tracker.durations[name]=(tracker.durations[name]||0)+dt;if(tracker.durations[name]>seconds&&!tracker.latched[name]){trigger(tracker,code,time,out,detail,points);tracker.latched[name]=true;}}
 sustained('speed',speed>road.limit+.5&&road.onRoad,1.2,'speed',`${Math.round(speed)} / 制限${road.limit} km/h`,speedingPoints(speed-road.limit));
 sustained('belt',!car.belt&&speed>2,1,'belt');sustained('lane',speed>4&&!correctLane(car,road)&&!road.intersection,2,'wrongWay');sustained('off',!road.onRoad&&speed>5,2,'offRoad');
 // Front bumper, not vehicle center, crosses the stop line.
 const f={x:-Math.sin(car.heading),z:-Math.cos(car.heading)},prevFront={x:previous.x+f.x*2.2,z:previous.z+f.z*2.2},front={x:car.x+f.x*2.2,z:car.z+f.z*2.2};
 for(const i of intersections){if(Math.hypot(car.x-i.x,car.z-i.z)>65)continue;const axis=Math.abs(f.z)>.85?'z':Math.abs(f.x)>.85?'x':null;if(!axis)continue;const lat=axis==='z'?Math.abs(car.x-i.x):Math.abs(car.z-i.z);if(lat>8)continue;const signed=(p)=>(p.x-i.x)*f.x+(p.z-i.z)*f.z,along=signed(front),prev=signed(prevFront),key=i.id+axis+(axis==='z'?Math.sign(f.z):Math.sign(f.x));
  if(along>-25&&along<-16&&speed<.7)tracker.stops[key]=(tracker.stops[key]||0)+dt;
  if(i.signal){const light=signalState(i,axis,time),old=tracker.lastSignals[key];if(light==='amber'&&old!=='amber'){const distance=Math.max(0,-16-along),stopping=car.speed**2/(2*(wet?4:6))+Math.abs(car.speed)*.7;tracker.amber[key]=stopping>distance;}tracker.lastSignals[key]=light;
   if(prev<-16&&along>=-16&&car.speed>.2&&(light==='red'||light==='amber'&&!tracker.amber[key]))trigger(tracker,'red',time,out,light==='amber'?'黄信号：停止可能な距離から進入':'赤信号で停止線を通過');
  }else if(axis===i.stopAxis&&prev<-16&&along>=-16&&car.speed>.2&&(tracker.stops[key]||0)<1)trigger(tracker,'stop',time,out,'停止線手前で完全停止が必要');
  if(along>25){delete tracker.stops[key];delete tracker.amber[key];}
 }
 const signedRail=(p)=>(p.z-railway.z)*f.z;
 if(Math.abs(car.x-railway.x)<8&&Math.abs(f.z)>.85){const sign=Math.sign(f.z),key='rail'+sign;const along=signedRail(front);if(along>-20&&along<-12&&speed<.7)tracker.stops[key]=(tracker.stops[key]||0)+dt;if(signedRail(prevFront)<-12&&along>=-12&&car.speed>.2){if(railClosed(time))trigger(tracker,'rail',time,out);else if((tracker.stops[key]||0)<1)trigger(tracker,'railStop',time,out);}if(along>20)delete tracker.stops[key];}
 const nearPed=agents.some(a=>a.kind==='pedestrian'&&a.active&&Math.hypot(car.x-a.x,car.z-a.z)<10);
 sustained('ped',nearPed&&speed>5,.35,'crosswalk');
 const nearAhead=agents.some(a=>{if(a.kind!=='vehicle')return false;const dx=a.x-car.x,dz=a.z-car.z,along=dx*f.x+dz*f.z,side=Math.abs(dx*f.z-dz*f.x);return along>3&&along<Math.max(4,Math.abs(car.speed)*1.5)&&side<2});sustained('headway',nearAhead&&speed>12,2.5,'headway');
 // Accumulate actual yaw across frames; do not reset the reference each frame.
 const delta=Math.atan2(Math.sin(car.heading-previous.heading),Math.cos(car.heading-previous.heading));
 if(!tracker.turning&&Math.abs(car.steer)>.12&&speed>2){tracker.turning=true;tracker.turnStart=0;tracker.turnIndicator=car.indicator;tracker.turnChecked=time-car.lastSafety<8;tracker.straight=0;}
 if(tracker.turning){tracker.turnStart+=delta;if(Math.abs(tracker.turnStart)>1.1){if(tracker.turnIndicator!==Math.sign(tracker.turnStart))trigger(tracker,'signal',time,out);if(!tracker.turnChecked)trigger(tracker,'observation',time,out);tracker.turning=false;}else if(Math.abs(car.steer)<.08){tracker.straight=(tracker.straight||0)+dt;if(tracker.straight>.6)tracker.turning=false;}}
 return out;
}
