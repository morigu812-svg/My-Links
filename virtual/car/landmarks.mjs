import * as THREE from '../vendor/three.module.min.js';
// Dimensions and placement follow the PLATEAU footprints. Exterior detailing is
// independently modelled from the Google Maps photographs reviewed 2026-11-27.
export const LANDMARKS={
 'bldg_9c2c736c-68d2-42b8-837a-dbdf9d7ca1a1':{name:'大阪駅',type:'station',color:'#8c9ea7',replace:true},
 'bldg_a7a0f325-c271-44db-bced-7d3066780c65':{name:'大阪駅・北側駅ビル',type:'station-building',color:'#879ca9'},
 'bldg_bfee20ad-5b64-48bc-8d47-fd764e89b70c':{name:'大阪駅・南側駅ビル',type:'station-building',color:'#a4a8a1'},
 'bldg_947f6fc4-dfdf-460a-aba9-11304a35e021':{name:'グランフロント大阪 南館',type:'grandfront',color:'#a0aeb1'},
 'bldg_9dcffdb5-9431-4650-951e-7f7c715e28a9':{name:'梅田スカイビル',type:'sky',color:'#8ca4b5'}
};
export function createLandmarkTexture(type){const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');x.fillStyle='#e1e7e9';x.fillRect(0,0,128,128);if(type==='grandfront'){x.fillStyle='#617d8d';x.fillRect(3,9,122,104);x.fillStyle='#c4cfd1';x.fillRect(0,114,128,8);x.fillStyle='#a9b7bd';for(let i=16;i<128;i+=24)x.fillRect(i,9,2,104);x.fillStyle='#a3bac7';x.fillRect(5,11,118,18);}else{x.fillStyle='#4c6d82';x.fillRect(4,6,120,111);x.fillStyle='#a0b1bd';for(let i=22;i<128;i+=22)x.fillRect(i,6,2,111);x.fillStyle='#bac5c9';x.fillRect(0,118,128,6);x.fillStyle='#8097a7';x.fillRect(5,8,116,8);}const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;}
export function createLandmarkDetails(buildings){const group=new THREE.Group(),entries=new Map(),unit=new THREE.BoxGeometry(1,1,1),steel=new THREE.MeshStandardMaterial({color:'#9baab2',metalness:.5,roughness:.38}),roof=new THREE.MeshStandardMaterial({color:'#7a8d98',metalness:.42,roughness:.42}),glass=new THREE.MeshStandardMaterial({color:'#466e84',metalness:.32,roughness:.25}),stone=new THREE.MeshStandardMaterial({color:'#aeb4ad',roughness:.85}),fins=new THREE.MeshStandardMaterial({color:'#d6d1bd',roughness:.55});
 function box(g,x,y,z,w,h,d,m){const b=new THREE.Mesh(unit,m);b.position.set(x,y,z);b.scale.set(w,h,d);b.castShadow=true;b.receiveShadow=true;g.add(b);return b;}
 function beam(g,a,b,width=.4,material=steel){const v=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)),m=new THREE.Mesh(unit,material);m.position.copy(new THREE.Vector3(...a).add(new THREE.Vector3(...b)).multiplyScalar(.5));m.scale.set(width,v.length(),width);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());m.castShadow=true;g.add(m);}
 for(const b of buildings){const profile=LANDMARKS[b.id];if(!profile)continue;const points=b.foot.flat(),minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0])),minZ=Math.min(...points.map(p=>p[1])),maxZ=Math.max(...points.map(p=>p[1])),cx=(minX+maxX)/2,cz=(minZ+maxZ)/2,g=new THREE.Group();g.position.set(cx,0,cz);group.add(g);entries.set(b.id,{group:g,cx,cz,profile});
  if(profile.type==='station'){
   // Align the roof and platforms to the diagonal railway footprint.
   let longest=0,ux=1,uz=0;const ring=b.foot[0];for(let i=1;i<ring.length;i++){const dx=ring[i][0]-ring[i-1][0],dz=ring[i][1]-ring[i-1][1],l=Math.hypot(dx,dz);if(l>longest){longest=l;ux=dx/l;uz=dz/l;}}
   const u=points.map(p=>(p[0]-cx)*ux+(p[1]-cz)*uz),v=points.map(p=>-(p[0]-cx)*uz+(p[1]-cz)*ux),L=Math.max(...u)-Math.min(...u),W=Math.max(...v)-Math.min(...v),local=new THREE.Group();local.rotation.y=-Math.atan2(uz,ux);g.add(local);box(local,0,2,0,L,4,W,stone);
   for(let row=-2;row<=2;row++){const z=row*W/5;box(local,0,5.2,z,L,.5,6.5,stone);for(const side of [-1,1])box(local,0,4.6,z+side*4,L,.14,.12,steel);}
   const canopy=(z)=>39+9*Math.cos(z/W*Math.PI);for(let z=-W/2;z<W/2;z+=W/20){const mid=z+W/40,slab=box(local,0,canopy(mid),mid,L,.25,W/20+.1,roof);slab.rotation.x=Math.atan(9*Math.PI/W*Math.sin(mid/W*Math.PI));}
   for(let x=-L/2+4;x<=L/2;x+=18){for(let z=-W/2;z<W/2;z+=W/10){beam(local,[x,canopy(z)-.4,z],[x,canopy(z+W/10)-.4,z+W/10],.42);beam(local,[x,canopy(z)-3,z],[x,canopy(z+W/10)-3,z+W/10],.32);beam(local,[x,canopy(z)-.4,z],[x,canopy(z+W/10)-3,z+W/10],.24);}for(const z of [-W*.4,W*.4])beam(local,[x,4,z],[x,canopy(z)-3,z],.7);}
   for(const z of [-W*.47,W*.47]){box(local,0,12,z,L,13,.5,glass);for(let x=-L/2;x<L/2;x+=8)box(local,x,12,z,.3,13,.7,steel);}
   // Visible concourse bridge, stairs and thin roof supported by trusses.
   box(local,0,19,W*.1,L*.72,1,9,stone);for(const x of [-L*.25,L*.25]){for(let i=0;i<24;i++)box(local,x,18.5-i*.55,W*.1+6+i*.8,8,.5,.85,stone);beam(local,[x-4,20,W*.1],[x-4,6,W*.1+26],.18);beam(local,[x+4,20,W*.1],[x+4,6,W*.1+26],.18);}
  }else if(profile.type==='grandfront'){
   // The measured curved podium edge supplies the arc, rather than a new box.
   const ring=b.foot[0];for(let i=12;i<=31&&i<ring.length;i++){const a=ring[i-1],c=ring[i],dx=c[0]-a[0],dz=c[1]-a[1],len=Math.hypot(dx,dz),n=Math.ceil(len/1.35);for(let k=0;k<n;k++){const t=k/n;box(g,a[0]+dx*t-cx,21,a[1]+dz*t-cz,.22,28,.55,fins);}beam(g,[a[0]-cx,35.5,a[1]-cz],[c[0]-cx,35.5,c[1]-cz],.65,fins);}
  }
 }
 // Batch repeated beams and fins per material while keeping each landmark
 // independently animated for collapse/reconstruction.
 group.updateMatrixWorld(true);for(const entry of entries.values()){const g=entry.group,batches=new Map(),inverse=g.matrixWorld.clone().invert();g.traverse(o=>{if(!o.isMesh)return;if(!batches.has(o.material))batches.set(o.material,[]);batches.get(o.material).push(new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld));});g.clear();for(const [material,matrices]of batches){const batch=new THREE.InstancedMesh(unit,material,matrices.length);matrices.forEach((m,i)=>batch.setMatrixAt(i,m));batch.castShadow=true;batch.receiveShadow=true;batch.computeBoundingSphere();g.add(batch);}}
 function set(id,growth=1,fall=0){const e=entries.get(id);if(!e)return;e.group.scale.y=Math.max(.001,growth);e.group.rotation.z=fall*Math.PI*.47;}
 return {group,entries,set};
}
