export const LIMIT=292;
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function createCar(){return {x:0,z:36,heading:0,speed:0,steer:0,distance:0,collision:false};}
export function updateCar(car,input,dt,obstacles=[]){
 dt=clamp(Number.isFinite(dt)?dt:0,0,.05);const throttle=clamp(input.throttle||0,0,1),reverse=clamp(input.reverse||0,0,1),steering=clamp(input.steer||0,-1,1);let acceleration=throttle*10-reverse*7;
 if(car.speed<-.5&&throttle)acceleration=17;if(car.speed>.5&&reverse)acceleration=-20;
 if(input.brake)acceleration=car.speed>0?-30:car.speed<0?30:0;
 const previous=car.speed;car.speed+=acceleration*dt;
 if(input.brake&&previous*car.speed<0)car.speed=0;
 car.speed*=Math.exp(-(input.handbrake?3.1:.14)*dt);
 if(!throttle&&!reverse&&Math.abs(car.speed)<.12)car.speed=0;
 car.speed=clamp(car.speed,-9,39);car.steer+=(steering-car.steer)*(1-Math.exp(-7*dt));
 const yaw=car.speed/4.7*Math.tan(car.steer*.52)/(1+Math.abs(car.speed)*.045);car.heading-=yaw*dt*(input.handbrake?1.35:1);
 const dx=-Math.sin(car.heading)*car.speed*dt,dz=-Math.cos(car.heading)*car.speed*dt;
 const nextX=car.x+dx,nextZ=car.z+dz,radius=2.35;
 car.collision=Math.abs(nextX)>LIMIT||Math.abs(nextZ)>LIMIT||obstacles.some(o=>nextX>o.minX-radius&&nextX<o.maxX+radius&&nextZ>o.minZ-radius&&nextZ<o.maxZ+radius);
 if(car.collision){car.speed=-car.speed*.16;car.steer*=.5;}else{car.x=nextX;car.z=nextZ;car.distance+=Math.hypot(dx,dz)}
 return car;
}
export const checkpoints=[{x:0,z:-120},{x:120,z:-120},{x:240,z:-120},{x:240,z:0},{x:120,z:0},{x:120,z:120},{x:0,z:120},{x:-120,z:120},{x:-120,z:0},{x:0,z:0}];
export function reachedCheckpoint(car,checkpoint){return Math.hypot(car.x-checkpoint.x,car.z-checkpoint.z)<13;}
