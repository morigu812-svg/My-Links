import {trainingCar} from './catalog.mjs?v=academy1';
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const ratios=[3.7,2.2,1.55,1.15,.9,.72],finalDrive=3.9,radius=.31;
export function createCar(x=1196.5,z=145,heading=0){return {x,z,heading,speed:0,steer:0,distance:0,gear:'P',shift:1,rpm:800,handbrake:true,belt:false,indicator:0,lights:false,acceleration:0,collision:false,impactSpeed:0,lastSafety:-999,manual:1};}
export function selectGear(car,gear){if(!['P','R','N','D','M'].includes(gear))return false;if(Math.abs(car.speed)>.35){if(!(['D','M'].includes(gear)&&['D','M'].includes(car.gear)))return false;}car.gear=gear;if(gear==='P')car.speed=0;return true;}
export function stepCar(car,input,dt,v=trainingCar,env={}){
 dt=clamp(Number.isFinite(dt)?dt:0,0,.04);if(!dt)return car;
 const throttle=clamp(input.throttle||0,0,1),brake=clamp(input.brake||0,0,1),steering=clamp(input.steer||0,-1,1),mu=(env.wet?.67:1)*v.grip;
 car.steer+=(steering-car.steer)*(1-Math.exp(-5.8*dt));const speed=Math.abs(car.speed);
 if(car.gear==='D'){if(car.rpm>3600&&car.shift<6)car.shift++;else if(car.rpm<1400&&car.shift>1)car.shift--;}
 if(car.gear==='M')car.shift=clamp(car.manual,1,6);
 const ratio=car.gear==='R'?3.2:ratios[car.shift-1];car.rpm=clamp(Math.max(800,speed/radius*ratio*finalDrive*60/(2*Math.PI)),800,6500);
 const drive=['D','M','R'].includes(car.gear),direction=car.gear==='R'?-1:1;
 const curve=clamp(1-Math.abs(car.rpm-3200)/6500,.4,1),torque=v.torque*curve;
 let force=drive?throttle*Math.min(torque*ratio*finalDrive*.86/radius,v.power*1000/Math.max(speed,3))*direction:0;
 if(drive&&!car.handbrake&&throttle<.02&&brake<.01&&speed<1.2)force+=direction*v.mass*.65; // torque-converter creep
 const rolling=speed>.04?v.mass*9.81*.012:0,drag=.5*1.225*v.drag*v.area*speed*speed;
 const engineBrake=drive&&throttle<.01?Math.min(650,speed*55):0;
 const braking=brake*mu*v.mass*9.81*.82+(car.handbrake?mu*v.mass*9.81*.8:0);
 const old=car.speed;force-=v.mass*9.81*(env.grade||0);const staticHold=Math.abs(old)<.05&&braking>=Math.abs(force);const sign=Math.sign(old)||Math.sign(force);force-=sign*(rolling+drag+engineBrake+braking);
 let acceleration=clamp(force/v.mass,-mu*9.81,mu*9.81);car.speed+=acceleration*dt;
 if((brake>.01||car.handbrake||(!drive&&Math.abs(env.grade||0)<.001))&&old*car.speed<0)car.speed=0;
 if(car.gear==='P'||staticHold)car.speed=0;
 car.speed=clamp(car.speed,car.gear==='R'?-8:-2,v.ev?44:car.gear==='R'?2:55);car.acceleration=(car.speed-old)/dt;
 const maxSteer=.58/(1+speed*.035);const ideal=-car.speed/v.wheelbase*Math.tan(car.steer*maxSteer);const maxYaw=mu*9.81/Math.max(speed,1);car.heading=wrap(car.heading+clamp(ideal,-maxYaw,maxYaw)*dt);
 const dx=-Math.sin(car.heading)*car.speed*dt,dz=-Math.cos(car.heading)*car.speed*dt,nx=car.x+dx,nz=car.z+dz,r=v.width/2+.12;
 const obstacle=(env.obstacles||[]).find(o=>nx>o.minX-v.length&&nx<o.maxX+v.length&&nz>o.minZ-v.length&&nz<o.maxZ+v.length&&vehiclesOverlap({x:nx,z:nz,heading:car.heading},v,{x:(o.minX+o.maxX)/2,z:(o.minZ+o.maxZ)/2,heading:0},{width:o.maxX-o.minX,length:o.maxZ-o.minZ}));const bounds=env.bounds||{minX:-970,maxX:1480,minZ:-970,maxZ:970};
 car.collision=!!obstacle||nx<bounds.minX||nx>bounds.maxX||nz<bounds.minZ||nz>bounds.maxZ;car.hit=obstacle||null;car.impactSpeed=car.collision?Math.abs(car.speed):0;
 if(car.collision){car.speed=0;car.acceleration=0;}else{car.x=nx;car.z=nz;car.distance+=Math.hypot(dx,dz)}return car;
}

export function vehiclesOverlap(a,as,b,bs){
 const ar={x:Math.cos(a.heading),z:-Math.sin(a.heading)},af={x:-Math.sin(a.heading),z:-Math.cos(a.heading)},br={x:Math.cos(b.heading),z:-Math.sin(b.heading)},bf={x:-Math.sin(b.heading),z:-Math.cos(b.heading)},dx=b.x-a.x,dz=b.z-a.z;
 const dot=(p,q)=>p.x*q.x+p.z*q.z;
 for(const axis of [ar,af,br,bf]){const extentA=Math.abs(dot(axis,ar))*as.width/2+Math.abs(dot(axis,af))*as.length/2,extentB=Math.abs(dot(axis,br))*bs.width/2+Math.abs(dot(axis,bf))*bs.length/2;if(Math.abs(dx*axis.x+dz*axis.z)>extentA+extentB+.08)return false;}return true;
}
