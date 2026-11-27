// Game timing and tolerances; these are not real-world enforcement thresholds.
export const speedTolerance=mode=>mode==='free'?15:5;
export const exceedsSpeed=(speed,limit,mode)=>speed>limit+speedTolerance(mode)+1e-7;
export function patrolCount(elapsed){return elapsed>=75?0:elapsed>=60?3:elapsed>=30?2:elapsed>=15?1:0;}
export function createPursuit(event){return {pursuit:true,event,elapsed:0,walk:0,distance:30,hold:false,vehicles:[],count:0,stopped:0};}
export function advancePursuit(p,car,dt){
 p.elapsed+=Math.max(0,dt);p.count=patrolCount(p.elapsed);
 if(p.elapsed>=75)return 'escaped';
 while(p.vehicles.length<p.count){const i=p.vehicles.length,back=35+i*12;p.vehicles.push({x:car.x+Math.sin(car.heading)*back,z:car.z+Math.cos(car.heading)*back,heading:car.heading});}
 let nearest=Infinity;
 p.vehicles.forEach((v,i)=>{const back=6+i*7,tx=car.x+Math.sin(car.heading)*back,tz=car.z+Math.cos(car.heading)*back,dx=tx-v.x,dz=tz-v.z,d=Math.hypot(dx,dz),step=Math.min(d,(Math.max(12,Math.abs(car.speed)+6))*dt);if(d>.01){v.x+=dx/d*step;v.z+=dz/d*step;v.heading=Math.atan2(-dx,-dz);}nearest=Math.min(nearest,Math.hypot(v.x-car.x,v.z-car.z));});
 p.stopped=p.count>0&&nearest<9&&Math.abs(car.speed)<.7?p.stopped+dt:0;
 return p.stopped>=1?'stopped':'chasing';
}
export function repairProgress(elapsed){return Math.max(0,Math.min(1,(elapsed-3)/10));}
