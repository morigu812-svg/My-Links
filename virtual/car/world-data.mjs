export const ROAD_COORDS=Array.from({length:9},(_,i)=>(i-4)*200);
export const CITY_SIZE=2000,LANE=3.5;
export const intersections=ROAD_COORDS.flatMap((x,ix)=>ROAD_COORDS.map((z,iz)=>({id:`${ix}-${iz}`,x,z,signal:(ix+iz)%2===0,phase:(ix*3+iz*5)%12,stopAxis:'x'})));
export function signalState(i,axis,time){const t=((time+i.phase)%60+60)%60;return axis==='z'?(t<24?'green':t<27?'amber':'red'):(t>=30&&t<54?'green':t>=54&&t<57?'amber':'red');}
export function nearestRoad(car){let nx=ROAD_COORDS.reduce((a,b)=>Math.abs(b-car.x)<Math.abs(a-car.x)?b:a),nz=ROAD_COORDS.reduce((a,b)=>Math.abs(b-car.z)<Math.abs(a-car.z)?b:a);const dx=Math.abs(car.x-nx),dz=Math.abs(car.z-nz);if(dx<14&&dz<14)return {intersection:true,onRoad:true,axis:Math.abs(Math.cos(car.heading))>Math.abs(Math.sin(car.heading))?'z':'x',center:dx<dz?nx:nz,limit:30};const axis=dx<dz?'z':'x',center=axis==='z'?nx:nz,onRoad=Math.min(dx,dz)<7.5;return {axis,center,onRoad,intersection:false,limit:center%400===0?40:30};}
export function correctLane(car,road){if(road.intersection||!road.onRoad)return true;const side=road.axis==='z'?car.x-road.center:car.z-road.center;return road.axis==='z'?side*Math.cos(car.heading)<-.25:side*Math.sin(car.heading)>.25;}
export function groundHeight(x,z){if(x>=1360&&x<=1410&&z>-95&&z<5){return z>-45?(5-z)*.08:(z+95)*.08;}return 0;}
export function roadGrade(car){const forwardZ=-Math.cos(car.heading);if(car.x>1360&&car.x<1410&&car.z>-95&&car.z<5)return (car.z>-45?-.08:.08)*forwardZ;return 0;}
export const railway={x:-600,z:100};
export const railClosed=time=>time%65>36&&time%65<58;
export function routeHeading(a,b){return Math.atan2(-(b.x-a.x),-(b.z-a.z));}
export function distanceToRoute(p,route){let best=Infinity;for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));best=Math.min(best,Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t));}return best;}
