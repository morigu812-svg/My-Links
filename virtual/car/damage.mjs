import {clamp} from './physics.mjs?v=academy2';
export function applyImpact(car,spec,speed,otherMass=Infinity){
 const impact=Math.max(0,Number.isFinite(speed)?speed:0),share=Number.isFinite(otherMass)?otherMass/(spec.mass+otherMass):1;
 const energy=.5*spec.mass*(impact*share)**2,loss=clamp(energy/1800,0,100);
 car.damage=clamp((car.damage||0)+loss,0,100);car.disabled=car.damage>=85;
 car.crush=clamp((car.crush||0)+loss/150,0,.5);car.speed=car.disabled?0:-Math.sign(car.speed||1)*Math.min(impact*.18,3);
 return {energy,loss,destroyed:car.disabled};
}
export function touchShiftAllowed(car,value){return ['P','R','N','D','M'].includes(value)&&Math.abs(car.speed)<=.35;}
