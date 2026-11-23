import {createCityLife} from './life.js';
import * as T from './vendor/three.module.min.js';
import {readSave,writeSave} from './save.js';
import {getWallet,awardCredits,todayJst} from './wallet.js';
import {createCityMultiplayer} from './multiplayer.js';
import {addSky,windowTexture,asphaltTexture,lightPool,sportHover} from './visuals.js';
var cityLife;
const citySave=readSave('city');
const $=id=>document.getElementById(id);const clamp=T.MathUtils.clamp;const WORLD_RADIUS=246;
const mobileDevice=matchMedia('(pointer:coarse)').matches;
let renderer,previewRenderer;
try{renderer=new T.WebGLRenderer({canvas:$('world'),antialias:false,powerPreference:'default'});previewRenderer=new T.WebGLRenderer({canvas:$('avatarPreview'),antialias:false,alpha:true});}catch(error){$('error').textContent='3D表示を開始できません。WebGLが有効なブラウザで開いてください。';throw error;}
renderer.setPixelRatio(Math.min(devicePixelRatio,mobileDevice?1:1.25));renderer.setSize(innerWidth,innerHeight);renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
previewRenderer.setPixelRatio(Math.min(devicePixelRatio,1));previewRenderer.setSize(145,185,false);previewRenderer.toneMapping=T.ACESFilmicToneMapping;
const scene=new T.Scene();scene.background=new T.Color('#291b40');scene.fog=new T.FogExp2('#352348',.0017);addSky(scene);const camera=new T.PerspectiveCamera(65,innerWidth/innerHeight,.1,1800);
scene.add(new T.HemisphereLight(0xa4e6f0,0x352442,2.8));const sunlight=new T.DirectionalLight(0xc9cfff,2.8);sunlight.position.set(-60,180,80);scene.add(sunlight);
const previewScene=new T.Scene(),previewCamera=new T.PerspectiveCamera(35,145/185,.1,30);previewCamera.position.set(0,1.8,5.8);previewCamera.lookAt(0,1.05,0);previewScene.add(new T.HemisphereLight(0xd7ffff,0x483058,3));const light=new T.DirectionalLight(0xffffff,3);light.position.set(3,5,5);previewScene.add(light);
const box=new T.BoxGeometry(1,1,1);const basic=c=>new T.MeshBasicMaterial({color:c});const metal=c=>new T.MeshStandardMaterial({color:c,metalness:.55,roughness:.38});const cyan=basic(0x6affe2),blue=basic(0x37afff),pink=basic(0xef6eff),gold=basic(0xffd58a),dark=metal(0x13243e);const obstacles=[];
function cube(w,h,d,mat,x,y,z,parent=scene){const m=new T.Mesh(box,mat);m.scale.set(w,h,d);m.position.set(x,y,z);parent.add(m);return m;}
function ring(radius,thick,mat,x,y,z){const m=new T.Mesh(new T.TorusGeometry(radius,thick,8,64),mat);m.rotation.x=-Math.PI/2;m.position.set(x,y,z);scene.add(m);return m;}
const roadTex=asphaltTexture();roadTex.repeat.set(4,35);const roadMaterial=new T.MeshStandardMaterial({color:0x8370a1,map:roadTex,roughness:.38,metalness:.5});
const ground=new T.Mesh(new T.CylinderGeometry(280,266,14,96),metal(0x10253a));ground.position.y=-7;scene.add(ground);ring(279,.45,cyan,0,.05,0);ring(260,.15,blue,0,.06,0);
const grid=new T.GridHelper(540,54,0x2a5e74,0x193f56);grid.position.y=.02;scene.add(grid);
// A cross of broad, unobstructed walking boulevards.
cube(38,.12,510,roadMaterial,0,.03,0);cube(510,.12,38,roadMaterial,0,.04,0);
for(const side of [-1,1]){cube(.15,.12,470,cyan,side*19,.13,0);cube(470,.12,.15,pink,0,.14,side*19);}
const plaza=new T.Mesh(new T.CylinderGeometry(52,52,.2,64),metal(0x152e48));plaza.position.y=.08;scene.add(plaza);ring(50,.2,cyan,0,.25,0);ring(35,.09,blue,0,.26,0);
for(let i=0;i<12;i++){const angle=i*Math.PI/6;cube(.18,.2,6,i%2?pink:cyan,Math.sin(angle)*43,.25,Math.cos(angle)*43).rotation.y=angle;}
// Central sculpture floats high enough to walk beneath.
const core=new T.Group();const crystal=new T.Mesh(new T.OctahedronGeometry(3.3),new T.MeshStandardMaterial({color:0x7bfff0,emissive:0x23a9a9,emissiveIntensity:1,metalness:.7,roughness:.1}));core.add(crystal);core.position.set(0,12,0);scene.add(core);const coreRing=new T.Mesh(new T.TorusGeometry(6,.13,8,64),pink);coreRing.rotation.x=.8;core.add(coreRing);
function sign(text,sub,color=0x6affe2){const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;const ctx=canvas.getContext('2d');ctx.fillStyle='#09182be8';ctx.fillRect(0,0,1024,256);ctx.strokeStyle='#477487';ctx.lineWidth=5;ctx.strokeRect(5,5,1014,246);ctx.fillStyle='#'+new T.Color(color).getHexString();ctx.textAlign='center';ctx.font='bold 70px sans-serif';ctx.fillText(text,512,117);ctx.fillStyle='#bdd7e6';ctx.font='28px sans-serif';ctx.fillText(sub,512,192);const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;return new T.Mesh(new T.PlaneGeometry(24,6),new T.MeshBasicMaterial({map:texture,side:T.DoubleSide,transparent:true}));}
const signs=[];function placard(text,sub,x,z,color){const m=sign(text,sub,color);m.position.set(x,12,z);scene.add(m);signs.push(m);return m;}
placard('CENTRAL PLAZA','LINK BASE / YOUR NEXT WORLD',0,35,0x78fff0);
const cityMats=[0x51527e,0x6b4983,0x3a6277].map((color,i)=>{const tex=windowTexture(i+10);return new T.MeshStandardMaterial({color,map:tex,emissiveMap:tex,emissive:0xaabbe8,emissiveIntensity:.55,metalness:.55,roughness:.3});});let seed=682;function rnd(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
const facadeParts=new Map();
function facade(w,h,d,mat,x,y,z){const key=mat.uuid;if(!facadeParts.has(key))facadeParts.set(key,{mat,parts:[]});facadeParts.get(key).parts.push({w,h,d,x,y,z});}
const towers=[];for(let sx of [-1,1])for(let sz of [-1,1])for(let row=0;row<4;row++)for(let col=0;col<4;col++){
const x=sx*(62+col*46),z=sz*(62+row*46);if(Math.hypot(x,z)>244)continue;if(Math.hypot(x+116,z+116)<38||Math.hypot(x-116,z-116)<38)continue;const w=22+rnd()*9,d=22+rnd()*9,h=20+rnd()*70;const m=cube(w,h,d,cityMats[Math.floor(rnd()*3)],x,h/2,z);obstacles.push({x,z,w:w/2+3,d:d/2+3});towers.push(m);const neon=(col+row)%2?cyan:pink;for(const side of [-1,1])facade(.35,h*.85,.35,neon,x+side*w*.4,h/2,z+d/2+.12);facade(w+1,.25,d+1,neon,x,h,z);for(let k=6;k<h-4;k+=7)facade(w*.8,.35,.15,blue,x,k,z+d/2+.16);
}
const whiteLamp=basic(0xe5fff5);

// Architectural podiums, rooftop setbacks and ground-level shopfronts.
for(const tower of towers){
 const [w,h,d]=[tower.scale.x,tower.scale.y,tower.scale.z],x=tower.position.x,z=tower.position.z;
 facade(w+4,3,d+4,dark,x,1.5,z);facade(w*.78,5,d*.78,dark,x,h+2.5,z);facade(.3,6,.3,pink,x,h+8,z);
 facade(w+4,.15,d+4,gold,x,3.1,z);
}
for(const side of [-1,1])for(const z of [-190,-145,-100,-55,55,100,145,190]){
 facade(.35,8,.35,dark,side*23,4,z);facade(4,.35,.45,dark,side*21.2,8,z);facade(3.7,.12,.4,whiteLamp,side*21.2,7.8,z);
 if(Math.abs(z)%2===0){const pool=lightPool(24,18,side>0?0xe2a6ff:0x8ee9f4,.26);pool.position.set(side*13,.22,z);scene.add(pool);}
}
for(const z of [-190,-86,86,190]){
 for(const x of [-27,27]){facade(1.2,12,1.2,dark,x,6,z);facade(.18,11,.18,pink,x+.8,6,z);}
 facade(56,.6,2,dark,0,12,z);facade(56,.15,2.2,gold,0,12.5,z);
}
const shopNames=['ASTRA','NEON CAFE','PULSE LAB','HORIZON'];
for(let i=0;i<8;i++){
 const side=i%2?1:-1,z=[-160,-110,110,160][Math.floor(i/2)],x=side*41;
 facade(8,5,18,dark,x,2.5,z);facade(8.4,.3,19,i%2?pink:cyan,x,5.3,z);
 facade(.2,3.5,8,blue,x-side*4.1,2.4,z);
 const board=sign(shopNames[i%4],'VIRTUAL CITY / OPEN',i%2?0xff8fe4:0x8affef);board.scale.set(.55,.55,.55);board.position.set(x-side*4.3,7,z);board.rotation.y=side>0?-Math.PI/2:Math.PI/2;scene.add(board);
 obstacles.push({x,z,w:4.7,d:9.7});
}
for(const side of [-1,1])for(const z of [-46,46]){
 facade(7,1.3,3,dark,side*29,.65,z);
 for(let n=0;n<3;n++){const bush=new T.Mesh(new T.IcosahedronGeometry(1.8),metal(0x256c69));bush.position.set(side*29+(n-1)*2,2,z);scene.add(bush);}
}
const halo=lightPool(100,100,0x9363ed,.2);halo.position.set(0,.26,0);scene.add(halo);
for(const x of [-72,72]){const rock=new T.Mesh(new T.DodecahedronGeometry(25,0),metal(x>0?0x59416f:0x2b6273));rock.scale.set(1.1,1.7,.8);rock.position.set(x,12,-224);scene.add(rock);obstacles.push({x,z:-224,w:24,d:24});}
for(const {mat,parts} of facadeParts.values()){const inst=new T.InstancedMesh(box,mat,parts.length),o=new T.Object3D();parts.forEach((p,i)=>{o.position.set(p.x,p.y,p.z);o.scale.set(p.w,p.h,p.d);o.updateMatrix();inst.setMatrixAt(i,o.matrix);});scene.add(inst);}
// Far skyline is decorative, outside the walking island.
const towerInstances=new T.InstancedMesh(box,metal(0x172c48),120),dummy=new T.Object3D();const skylineLights=new T.InstancedMesh(box,basic(0x447da0),120);
for(let i=0;i<120;i++){const angle=rnd()*Math.PI*2,r=350+rnd()*950,h=40+rnd()*220;dummy.position.set(Math.sin(angle)*r,h/2-30,Math.cos(angle)*r);dummy.scale.set(18+rnd()*30,h,18+rnd()*30);dummy.updateMatrix();towerInstances.setMatrixAt(i,dummy.matrix);dummy.position.y=h-30;dummy.scale.y=.7;dummy.updateMatrix();skylineLights.setMatrixAt(i,dummy.matrix);}scene.add(towerInstances,skylineLights);
const starsG=new T.BufferGeometry(),starPos=[];for(let i=0;i<350;i++)starPos.push((rnd()-.5)*3000,300+rnd()*1300,(rnd()-.5)*3000);starsG.setAttribute('position',new T.Float32BufferAttribute(starPos,3));scene.add(new T.Points(starsG,new T.PointsMaterial({size:1.4,color:0xa8d9ff})));
// A luminous, elevated transit ring and independent flying traffic.
const transit=ring(315,1.7,blue,0,75,0);const traffic=[];for(let i=0;i<10;i++){const car=new T.Group(),paint=metal(i%2?0x306386:0x75448d);cube(3,1,7,paint,0,0,0,car);cube(2,.8,3,metal(0x65a5bb),0,.8,0,car);for(const x of [-1.7,1.7])cube(.25,.25,5,i%2?pink:cyan,x,-.2,0,car);cube(2,.2,.15,cyan,0,0,-3.6,car);scene.add(car);traffic.push({mesh:car,angle:rnd()*Math.PI*2,r:300+rnd()*200,y:65+rnd()*90,speed:.04+rnd()*.05});}
// Only the race portal is playable; future venues are explicitly marked.
const racePortal={x:0,z:-132,radius:16};const portal=new T.Group();portal.position.set(racePortal.x,0,racePortal.z);scene.add(portal);cube(34,.4,28,dark,0,.2,0,portal);for(const x of [-17,17]){cube(1,17,1,pink,x,8.5,0,portal);cube(3,.4,5,cyan,x,1,0,portal);}cube(35,1,1,pink,0,17,0,portal);const raceSign=sign('SKYLINE RACE','PLAY NOW / HOVER CAR RACING',0xff8de8);raceSign.position.set(0,22,0);portal.add(raceSign);const portalRing=ring(10,.3,pink,0,.5,-132);
placard('ARCADE DISTRICT','COMING SOON / 次の遊びを準備中',122,0,0x9aa1ff);placard('SKY GARDEN','EXPLORE / 街を散歩しよう',-120,0,0x89ffd0);
for(const p of [[-30,-68],[30,-68],[-30,68],[30,68],[-105,-27],[105,27]]){cube(10,1.1,3,dark,p[0],.55,p[1]);cube(10,.12,.15,cyan,p[0],1.15,p[1]+1.5);}
// Holographic trees outside the main streets.
for(let i=0;i<18;i++){const angle=i*Math.PI*2/18,r=225;const x=Math.sin(angle)*r,z=Math.cos(angle)*r;cube(.5,4,.5,dark,x,2,z);const tree=new T.Mesh(new T.IcosahedronGeometry(3.5,0),new T.MeshStandardMaterial({color:0x268c8d,emissive:0x164c59,metalness:.4,roughness:.5,transparent:true,opacity:.85}));tree.position.set(x,6,z);scene.add(tree);}
// Civic landmarks and landscaped waterfront: a lived-in future city.
const glass=new T.MeshStandardMaterial({color:0x769db3,metalness:.65,roughness:.18,transparent:true,opacity:.7});
const civic=new T.Group();civic.position.set(-116,0,-116);scene.add(civic);
for(let i=0;i<7;i++){const y=i*10;const floor=cube(38-i*2.8,8,32-i*2,cityMats[i%3],0,y+4,0,civic);floor.rotation.y=i*.12;cube(40-i*2.8,.3,34-i*2,cyan,0,y+8,0,civic).rotation.y=i*.12;}
const dome=new T.Mesh(new T.SphereGeometry(20,24,12,0,Math.PI*2,0,Math.PI/2),glass);dome.position.set(116,9,116);scene.add(dome);placard('SKY CONSERVATORY','未来の温室 / BOTANICAL GARDEN',116,94,0xa0ffcb);
const water=new T.Mesh(new T.PlaneGeometry(16,240),new T.MeshStandardMaterial({color:0x289bac,emissive:0x124a61,metalness:.8,roughness:.2}));water.rotation.x=-Math.PI/2;water.position.set(-38,.2,0);scene.add(water);
for(let z=-180;z<=180;z+=45){cube(30,.45,5,dark,-38,.5,z);for(const side of [-1,1])cube(.2,2,5,cyan,-38+side*14,1.6,z);}
for(let i=0;i<26;i++){const z=-180+i*14;for(const x of [-24,25]){const trunk=new T.Mesh(new T.CylinderGeometry(.35,.55,4,6),metal(0x826b72));trunk.position.set(x,2,z);scene.add(trunk);const leaves=new T.Mesh(new T.SphereGeometry(2.4,8,6),metal(i%3===0?0xa77ba6:0x3b9c89));leaves.position.set(x,5,z);scene.add(leaves);}if(i%3===0){cube(5,.4,1.5,metal(0xc9a382),29,1,z);cube(.4,1,1.5,dark,27, .5,z);cube(.4,1,1.5,dark,31,.5,z);}}
placard('NOVA LIVING','HOME / MARKET / PEOPLE / PLAY',0,88,0xffd9a0);
const templates=[{id:'scout',label:'シティボーイ',suit:'#37bce8',accent:'#70fff0',skin:'#d9ad8c',style:'hair',height:100},{id:'runner',label:'ストリート',suit:'#a36ae8',accent:'#ff9be3',skin:'#b87954',style:'hair',height:105},{id:'pilot',label:'シティガール',suit:'#e2e8f6',accent:'#4dbdff',skin:'#e5c5a7',style:'hair',height:100},{id:'robot',label:'カジュアル',suit:'#294b70',accent:'#ffd37b',skin:'#d6af92',style:'hair',height:95}];let config={...templates[0],name:'プレイヤー'},selected='scout',soundChoice=null,state='setup',hasEntered=false,elapsed=0,yaw=0,walkPhase=0,toastTime=0,portalNear=false;
const avatarRoot=new T.Group();scene.add(avatarRoot);const avatarPreviewRoot=new T.Group();previewScene.add(avatarPreviewRoot);let body,previewBody;const position=new T.Vector3(0,0,26);
if(citySave?.position && Number.isFinite(citySave.position.x)&&Number.isFinite(citySave.position.z)&&canWalk(citySave.position.x,citySave.position.z))position.set(citySave.position.x,0,citySave.position.z);
if(Number.isFinite(citySave?.yaw))yaw=citySave.yaw%(Math.PI*2);
function buildAvatar(c){
 const root=new T.Group(),limbs=[];
 const suit=new T.MeshStandardMaterial({color:c.suit,metalness:.28,roughness:.5});
 const skin=new T.MeshStandardMaterial({color:c.skin,metalness:c.style==='robot'?.7:.04,roughness:.52});
 const accent=new T.MeshStandardMaterial({color:c.accent,emissive:c.accent,emissiveIntensity:.55,roughness:.3,metalness:.45});
 const trim=new T.MeshStandardMaterial({color:0xe8ebfa,metalness:.3,roughness:.5});
 const hair=new T.MeshStandardMaterial({color:0x242031,roughness:.8});
 const eye=new T.MeshStandardMaterial({color:0x132333,roughness:.25});
 const visor=new T.MeshStandardMaterial({color:c.accent,emissive:c.accent,emissiveIntensity:.18,metalness:.85,roughness:.1});
 function part(geo,mat,x,y,z,parent=root,sx=1,sy=1,sz=1){const m=new T.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);parent.add(m);return m;}
 function round(mat,x,y,z,sx,sy,sz,parent=root){return part(new T.SphereGeometry(1,12,10),mat,x,y,z,parent,sx,sy,sz);}
 function capsule(mat,x,y,z,r,length,parent=root){return part(new T.CapsuleGeometry(r,length,4,8),mat,x,y,z,parent);}
 // Fitted jacket, shoulder shapes, collar, utility belt and illuminated chest emblem.
 capsule(suit,0,1.23,0,.33,.38);
 round(suit,0,1.48,0,.46,.23,.25);
 round(dark,0,.95,0,.35,.17,.23);
 part(box,trim,0,1.12,.255,root,.052,.48,.04);
 part(box,accent,.18,1.42,.245,root,.16,.12,.04);
 part(box,accent,-.19,1.42,.245,root,.035,.16,.04);
 part(box,dark,0,.91,0,root,.72,.13,.5);
 part(box,accent,0,.91,.27,root,.13,.09,.06);
 capsule(skin,0,1.73,0,.12,.14);
 // A sculpted head with ears, eyes, brows and nose, rather than a featureless cube.
 if(c.style==='robot'){
   const g=new T.BoxGeometry(.56,.55,.49);part(g,skin,0,2,0);
   part(box,dark,0,2.04,.252,root,.47,.23,.04);
   part(box,accent,-.11,2.06,.28,root,.1,.055,.02);part(box,accent,.11,2.06,.28,root,.1,.055,.02);
   part(box,trim,0,1.87,.26,root,.23,.025,.03);
   capsule(accent,.3,2.37,0,.035,.18);
   round(accent,.3,2.5,0,.055,.055,.055);
 }else{
   round(skin,0,2,0,.29,.34,.255);
   for(const side of [-1,1]){
     round(skin,side*.29,1.99,0,.065,.1,.07);
     round(trim,side*.105,2.04,.232,.072,.058,.026);
     round(eye,side*.105,2.04,.254,.033,.04,.018);
     part(box,hair,side*.105,2.13,.239,root,.13,.025,.025);
   }
   round(skin,0,1.99,.272,.047,.065,.06);
   part(box,eye,0,1.87,.24,root,.105,.016,.012);
   if(c.style==='hair'){
     round(hair,0,2.23,-.025,.3,.18,.26);
     for(let i=0;i<6;i++){const tuft=capsule(hair,-.22+i*.085,2.31,-.03,.07,.17);tuft.rotation.z=-.45;tuft.rotation.x=.35;}
     round(hair,-.255,2.1,-.07,.07,.18,.2);
   }else if(c.style==='helmet'){
     round(suit,0,2.09,-.04,.34,.36,.31);
     round(visor,0,2.06,.21,.28,.18,.17);
     for(const side of [-1,1])part(new T.CylinderGeometry(.105,.105,.07,12),accent,side*.33,2.06,0).rotation.z=Math.PI/2;
     part(box,trim,0,2.38,-.02,root,.08,.03,.48);
   }else{
     round(hair,0,2.24,-.05,.295,.12,.24);
     part(box,visor,0,2.07,.27,root,.5,.115,.07);
     part(box,accent,0,2.03,.312,root,.44,.015,.012);
   }
 }
 // Articulated arms and legs keep the existing walking animation.
 for(const side of [-1,1]){
   const arm=new T.Group();arm.position.set(side*.48,1.51,0);root.add(arm);
   round(suit,0,0,0,.18,.18,.18,arm);
   capsule(suit,0,-.23,0,.12,.24,arm);
   part(box,trim,0,-.36,.1,arm,.22,.12,.04);
   capsule(dark,0,-.48,0,.115,.12,arm);
   part(box,accent,0,-.43,.12,arm,.17,.04,.04);
   round(skin,0,-.65,.01,.105,.13,.1,arm);
   const leg=new T.Group();leg.position.set(side*.2,.86,0);root.add(leg);
   capsule(suit,0,-.22,0,.14,.25,leg);
   round(dark,0,-.41,.085,.13,.13,.1,leg);
   capsule(suit,0,-.53,0,.12,.15,leg);
   round(dark,0,-.73,.09,.155,.13,.25,leg);
   part(box,trim,0,-.8,.08,leg,.31,.055,.43);
   part(box,accent,side*.12,-.68,.12,leg,.035,.07,.25);
   limbs.push({arm,leg,side});
 }
 // Casual human avatars wear a small fabric backpack.
 round(suit,0,1.28,-.27,.23,.27,.1);
 part(box,trim,0,1.25,-.38,root,.12,.05,.025);
 if(c.style==='helmet'){for(const side of [-1,1])capsule(trim,side*.22,1.23,-.35,.07,.33);}
 if(c.style==='robot'){part(box,accent,0,1.26,.3,root,.2,.2,.05);}
 // Merge static parts sharing a material, separately for each articulated limb.
 function mergeParts(group){
   for(const child of [...group.children])if(child.isGroup)mergeParts(child);
   const sets=new Map();
   for(const mesh of [...group.children])if(mesh.isMesh){mesh.updateMatrix();const key=mesh.material.uuid;if(!sets.has(key))sets.set(key,{material:mesh.material,items:[]});sets.get(key).items.push(mesh);}
   for(const {material,items} of sets.values()){
     if(items.length<2)continue;const positions=[],normals=[];
     for(const mesh of items){
       const g=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();g.applyMatrix4(mesh.matrix);
       positions.push(...g.attributes.position.array);normals.push(...g.attributes.normal.array);g.dispose();
       if(mesh.geometry!==box)mesh.geometry.dispose();group.remove(mesh);
     }
     const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));group.add(new T.Mesh(g,material));
   }
 }
 mergeParts(root);
 root.scale.setScalar(c.height/100);root.userData.limbs=limbs;return root;
}
function disposeModel(root){const geoms=new Set(),mats=new Set();root.traverse(o=>{if(o.isMesh){if(o.geometry!==box)geoms.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])if(m!==dark)mats.add(m);}});geoms.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());}
function rebuild(){if(body){avatarRoot.remove(body);disposeModel(body);}if(previewBody){avatarPreviewRoot.remove(previewBody);disposeModel(previewBody);}body=buildAvatar(config);previewBody=buildAvatar(config);avatarRoot.add(body);avatarPreviewRoot.add(previewBody);avatarRoot.position.copy(position);previewBody.rotation.y=-.28;}
function syncFields(){for(const [id,key]of [['suitColor','suit'],['accentColor','accent'],['skinColor','skin'],['headStyle','style'],['height','height']])$(id).value=config[key];document.querySelectorAll('#templates button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.template===selected)));}
for(const t of templates){const b=document.createElement('button');b.type='button';b.textContent=t.label;b.dataset.template=t.id;b.onclick=()=>{config={...t,name:$('avatarName').value};selected=t.id;syncFields();rebuild();};$('templates').append(b);}
for(const [id,key]of [['suitColor','suit'],['accentColor','accent'],['skinColor','skin'],['headStyle','style'],['height','height']])$(id).addEventListener('input',()=>{config[key]=key==='height'?Number($(id).value):$(id).value;selected='custom';syncFields();rebuild();});
try{const saved=citySave?.avatar||JSON.parse(sessionStorage.getItem('linkBaseVirtualAvatar')||'null');if(saved&&/^#[0-9a-f]{6}$/i.test(saved.suit)&&/^#[0-9a-f]{6}$/i.test(saved.accent)&&/^#[0-9a-f]{6}$/i.test(saved.skin)&&['visor','hair','helmet','robot'].includes(saved.style)){config={...config,suit:saved.suit,accent:saved.accent,skin:saved.skin,style:'hair',skin:saved.style==='robot'?'#d6af92':saved.skin,name:String(saved.name||'パイロット').slice(0,14),height:clamp(Number(saved.height)||100,85,120)};selected='custom';$('avatarName').value=config.name;}}catch{}
syncFields();rebuild();
let audio=null,osc=null,gain=null,sound=false;function setAudio(enabled){sound=enabled;soundChoice=enabled;if(enabled){try{if(!audio){audio=new (window.AudioContext||window.webkitAudioContext)();osc=audio.createOscillator();gain=audio.createGain();osc.type='sine';osc.frequency.value=82;gain.gain.value=0;osc.connect(gain);gain.connect(audio.destination);osc.start();}audio.resume().catch(()=>{});}catch{sound=false;}}$('audioToggle').textContent=sound?'音 ON':'音 OFF';$('audioToggle').setAttribute('aria-pressed',String(sound));$('chooseSound').setAttribute('aria-pressed',String(soundChoice===true));$('chooseSilent').setAttribute('aria-pressed',String(soundChoice===false));$('enter').disabled=false;$('enter').textContent=hasEntered?'このアバターで街に戻る':'このアバターで街へ';}
$('chooseSound').onclick=()=>setAudio(true);$('chooseSilent').onclick=()=>setAudio(false);$('audioToggle').onclick=()=>setAudio(!sound);
function toast(text){$('toast').textContent=text;toastTime=3;}
function clearInput(){leftPointer=null;rightPointer=null;keys.sprint=false;keys.turbo=false;keys.forward=false;keys.back=false;keys.strafeLeft=false;keys.strafeRight=false;keys.left=false;keys.right=false;if(document.pointerLockElement===canvas)document.exitPointerLock?.();$('joystick').style.display='none';document.body.classList.remove('walking');}
$('entry').onsubmit=e=>{e.preventDefault();if(soundChoice===null)return;config.name=$('avatarName').value.trim().slice(0,14)||'パイロット';try{sessionStorage.setItem('linkBaseVirtualAvatar',JSON.stringify(config));sessionStorage.setItem('linkBaseVirtualAudio',sound?'on':'off');}catch{}state='walking';hasEntered=true;persistCity();clearInput();updateWallet();$('setup').hidden=true;$('hud').hidden=false;document.body.classList.add('playing');$('displayName').textContent=config.name;toast('ようこそ、'+config.name+'。北のゲートでレースに参加できます。');};
function edit(){state='setup';clearInput();$('setup').hidden=false;$('hud').hidden=true;$('pausePanel').hidden=true;$('portalPanel').hidden=true;$('enter').textContent='このアバターで街に戻る';document.body.classList.remove('playing');}
$('editAvatar').onclick=edit;$('restartSetup').onclick=edit;
function pause(){if(state!=='walking')return;persistCity();state='paused';clearInput();$('pausePanel').hidden=false;}$('pause').onclick=pause;$('resume').onclick=()=>{state='walking';$('pausePanel').hidden=true;};
function showPortal(){if(state!=='walking'||!portalNear)return;state='portal';clearInput();$('portalPanel').hidden=false;}$('portalAction').onclick=showPortal;$('cancelPortal').onclick=()=>{state='walking';$('portalPanel').hidden=true;};$('launchRace').onclick=()=>{persistCity();multiplayer.leave();try{sessionStorage.setItem('linkBaseVirtualAudio',sound?'on':'off');}catch{}location.assign('./race/?audio='+(sound?'on':'off'));};
const keys={forward:false,back:false,strafeLeft:false,strafeRight:false,left:false,right:false,sprint:false,turbo:false};let leftPointer=null,rightPointer=null,lastX=0;
const canvas=$('world');canvas.style.touchAction='none';canvas.addEventListener('pointerdown',e=>{if(state!=='walking')return;e.preventDefault();if(e.pointerType==='mouse'){
  if(e.button!==0&&e.button!==2)return;
  if(e.button===0&&canvas.requestPointerLock){try{const pending=canvas.requestPointerLock();pending?.catch(()=>{toast('マウスを押したまま動かして向きを変えられます。');});}catch{}}
  rightPointer=e.pointerId;lastX=e.clientX;canvas.setPointerCapture(e.pointerId);return;
}if(e.clientX<innerWidth/2){if(leftPointer!==null)return;leftPointer=e.pointerId;$('joystick').style.left=e.clientX+'px';$('joystick').style.top=e.clientY+'px';$('joystick').style.display='block';}else{if(rightPointer!==null)return;rightPointer=e.pointerId;lastX=e.clientX;}canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(state!=='walking'||e.pointerId!==rightPointer||document.pointerLockElement===canvas)return;e.preventDefault();yaw-=(e.clientX-lastX)*.0055;lastX=e.clientX;});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('mousemove',e=>{if(state==='walking'&&document.pointerLockElement===canvas&&Number.isFinite(e.movementX))yaw-=e.movementX*.0028;});
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==canvas&&state==='walking'){clearInput();pause();}});
function release(e){if(e.pointerId===leftPointer){leftPointer=null;$('joystick').style.display='none';}if(e.pointerId===rightPointer)rightPointer=null;}
for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,release);
addEventListener('keydown',e=>{if(state==='walking'){if(['KeyW','KeyS','ArrowUp','ArrowDown','KeyA','ArrowLeft','KeyD','ArrowRight','Space'].includes(e.code))e.preventDefault();keys.turbo=e.ctrlKey||e.metaKey||['ControlLeft','ControlRight','MetaLeft','MetaRight'].includes(e.code);if(e.code==='ShiftLeft'||e.code==='ShiftRight')keys.sprint=true;if(e.code==='KeyW'||e.code==='ArrowUp')keys.forward=true;if(e.code==='KeyS'||e.code==='ArrowDown')keys.back=true;if(e.code==='KeyA')keys.strafeLeft=true;if(e.code==='KeyD')keys.strafeRight=true;if(e.code==='ArrowLeft')keys.left=true;if(e.code==='ArrowRight')keys.right=true;if(e.code==='KeyE'&&!e.repeat){if(!cityLife.interact())showPortal();}if(e.code==='KeyM'&&!e.repeat)cityLife.open();if(e.code==='Escape')pause();}});
addEventListener('keyup',e=>{keys.turbo=!!(e.ctrlKey||e.metaKey);if(e.code==='ShiftLeft'||e.code==='ShiftRight')keys.sprint=false;if(e.code==='KeyW'||e.code==='ArrowUp')keys.forward=false;if(e.code==='KeyS'||e.code==='ArrowDown')keys.back=false;if(e.code==='KeyA')keys.strafeLeft=false;if(e.code==='KeyD')keys.strafeRight=false;if(e.code==='ArrowLeft')keys.left=false;if(e.code==='ArrowRight')keys.right=false;});addEventListener('blur',()=>{clearInput();pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();pause();}});
function canWalk(x,z){if(Math.hypot(x,z)>WORLD_RADIUS)return false;if(cityLife&&!cityLife.canWalk(x,z))return false;if(Math.abs(x+38)<8&&Math.abs(z)<120&&Math.abs(z-Math.round(z/45)*45)>3)return false;return !obstacles.some(b=>x>b.x-b.w-0.6&&x<b.x+b.w+.6&&z>b.z-b.d-.6&&z<b.z+b.d+.6);}
const collectibles=[];const locations=[[0,70],[0,112],[0,-56],[0,-96],[0,-177],[0,-217],[68,0],[110,0],[190,0],[-68,0],[-125,0],[-195,0]];for(const [x,z]of locations){const gem=new T.Mesh(new T.OctahedronGeometry(.9),gold);gem.position.set(x,1.6,z);scene.add(gem);collectibles.push({mesh:gem,x,z,found:false});}

let collectionDay=todayJst();
const collectedBefore=new Set(citySave?.collectionDay===collectionDay&&Array.isArray(citySave?.collected)?citySave.collected.filter(x=>typeof x==='string'):[]);
for(const item of collectibles){if(collectedBefore.has(item.x+':'+item.z)){item.found=true;item.mesh.visible=false;}}
$('collectCount').textContent=collectibles.filter(item=>item.found).length+' / 12';
let saveWarning=false;
function persistCity(){
  if(!hasEntered)return;
  const ok=writeSave('city',{avatar:{name:config.name,suit:config.suit,accent:config.accent,skin:config.skin,style:config.style,height:config.height},
    position:{x:position.x,z:position.z},yaw:yaw,collected:collectibles.filter(x=>x.found).map(x=>x.x+':'+x.z),collectionDay,sound:sound});
  if(!ok&&!saveWarning){saveWarning=true;toast('ブラウザに保存できません。サイトデータの保存設定を確認してください。');}
}
let autoSaveElapsed=0;
addEventListener('pagehide',persistCity);

let walletBalance=getWallet().balance;
function updateWallet(){walletBalance=getWallet().balance;$('balance').textContent=walletBalance.toLocaleString('ja-JP')+' CR';}
const remotePlayers=new Map();
function removePeer(id){const peer=remotePlayers.get(id);if(!peer)return;scene.remove(peer.root);disposeModel(peer.model);peer.label.material.map.dispose();peer.label.material.dispose();remotePlayers.delete(id);}
function peerLabel(name){
  const cv=document.createElement('canvas');cv.width=256;cv.height=64;const ctx=cv.getContext('2d');ctx.fillStyle='#102139dc';ctx.fillRect(0,0,256,64);ctx.textAlign='center';ctx.fillStyle='#baffec';ctx.font='bold 26px sans-serif';ctx.fillText(String(name).slice(0,14),128,43);
  const texture=new T.CanvasTexture(cv);texture.colorSpace=T.SRGBColorSpace;
  const label=new T.Sprite(new T.SpriteMaterial({map:texture,transparent:true,depthWrite:false}));label.scale.set(3.4,.85,1);label.position.y=3.05;return label;
}
const multiplayer=createCityMultiplayer({
  snapshot:()=>({avatar:config,x:position.x,z:position.z,yaw}),
  onStatus:text=>{$('multiStatus').textContent=text;},
  onPeers:peers=>{
    const keep=new Set();
    for(const p of peers){
      if(!p||typeof p.id!=='string'||!Number.isFinite(p.x)||!Number.isFinite(p.z)||!p.avatar)continue;
      keep.add(p.id);const key=JSON.stringify(p.avatar);let peer=remotePlayers.get(p.id);
      if(peer&&peer.key!==key){removePeer(p.id);peer=null;}
      if(!peer){const root=new T.Group(),model=buildAvatar(p.avatar),label=peerLabel(p.avatar.name);root.add(model,label);root.position.set(p.x,0,p.z);scene.add(root);peer={root,model,label,key,target:new T.Vector3(),yaw:0,phase:0};remotePlayers.set(p.id,peer);}
      peer.target.set(p.x,0,p.z);peer.yaw=p.yaw||0;
    }
    for(const id of remotePlayers.keys())if(!keep.has(id))removePeer(id);
  }
});
$('joinMulti').onclick=async()=>{
  if(state!=='walking'){toast('街に入ってから参加してください。');return;}
  const btn=$('joinMulti');btn.disabled=true;
  try{await multiplayer.join($('roomCode').value);$('leaveMulti').hidden=false;$('roomCode').disabled=true;btn.hidden=true;toast('マルチの街に参加しました。');}
  catch(error){toast(error.message);}finally{btn.disabled=false;}
};
$('leaveMulti').onclick=()=>{multiplayer.leave();$('leaveMulti').hidden=true;$('joinMulti').hidden=false;$('roomCode').disabled=false;};
let coopSeconds=0,coopDistance=0,previousPosition=position.clone();
addEventListener('pagehide',()=>multiplayer.leave());

const residents=[];
cityLife=createCityLife({scene,buildAvatar,templates,position,travel(x,z){position.set(x,0,z);yaw=0;persistCity();},freeze(){state='life';clearInput();},resume(){state='walking';},toast,refreshWallet:updateWallet});
const map=$('map').getContext('2d');function drawMap(){map.clearRect(0,0,160,160);map.strokeStyle='#2d596d';map.lineWidth=1;for(let n=16;n<160;n+=16){map.beginPath();map.moveTo(n,0);map.lineTo(n,160);map.moveTo(0,n);map.lineTo(160,n);map.stroke();}map.fillStyle='#397586';map.fillRect(74,10,12,140);map.fillRect(10,74,140,12);map.strokeStyle='#5affdc';map.beginPath();map.arc(80,80,14,0,Math.PI*2);map.stroke();const x=80+position.x/4,z=80+position.z/4;map.fillStyle='#ff8cde';map.fillRect(77,80-132/4-3,6,6);for(const g of collectibles)if(!g.found){map.fillStyle='#e9d58e';map.fillRect(79+g.x/4,79+g.z/4,2,2);}map.fillStyle='#ffd4a0';map.fillRect(76,128,8,6);map.fillStyle='#98f5ca';map.fillRect(125,76,8,6);map.save();map.translate(x,z);map.rotate(-yaw);map.beginPath();map.moveTo(0,-5);map.lineTo(-3,4);map.lineTo(3,4);map.closePath();map.fillStyle='#ecfffc';map.fill();map.restore();}
const camPos=new T.Vector3(),target=new T.Vector3(),walkForward=new T.Vector3(),walkRight=new T.Vector3();let last=performance.now(),hudTick=0;function animate(now){const targetFps=state==='walking'?(mobileDevice?30:60):24;if(now-last<1000/targetFps-1){requestAnimationFrame(animate);return;}const dt=Math.min(.04,(now-last)/1000);last=now;elapsed+=dt;cityLife.update(dt,state==='walking');let moving=false;
if(state==='walking'){yaw+=((keys.left?1:0)-(keys.right?1:0))*dt*1.8;const forwardAmount=(leftPointer!==null||keys.forward?1:0)-(keys.back?1:0),sideAmount=(keys.strafeRight?1:0)-(keys.strafeLeft?1:0);moving=forwardAmount!==0||sideAmount!==0;const forward=walkForward.set(-Math.sin(yaw),0,-Math.cos(yaw));if(moving){const direction=forward.multiplyScalar(forwardAmount).add(walkRight.set(Math.cos(yaw),0,-Math.sin(yaw)).multiplyScalar(sideAmount)).normalize();const moveSpeed=keys.turbo?72:keys.sprint?50:34;const dx=direction.x*moveSpeed*dt,dz=direction.z*moveSpeed*dt;const steps=Math.ceil(Math.max(Math.abs(dx),Math.abs(dz))/.45);for(let n=0;n<steps;n++){if(canWalk(position.x+dx/steps,position.z))position.x+=dx/steps;if(canWalk(position.x,position.z+dz/steps))position.z+=dz/steps;}walkPhase+=dt*11;}else walkPhase=T.MathUtils.damp(walkPhase,Math.round(walkPhase/Math.PI)*Math.PI,10,dt);avatarRoot.position.copy(position);avatarRoot.rotation.y=yaw+Math.PI;
for(const limb of body.userData.limbs){limb.arm.rotation.x=moving?Math.sin(walkPhase)*.5*limb.side:0;limb.leg.rotation.x=moving?-Math.sin(walkPhase)*.6*limb.side:0;}body.position.y=moving?Math.abs(Math.sin(walkPhase))*.045:0;
portalNear=Math.hypot(position.x-racePortal.x,position.z-racePortal.z)<racePortal.radius;$('portalAction').hidden=!portalNear;
for(const g of collectibles)if(!g.found&&Math.hypot(position.x-g.x,position.z-g.z)<2.2){g.found=true;g.mesh.visible=false;const earned=awardCredits('gem:'+collectionDay+':'+g.x+':'+g.z,multiplayer.isRewardActive()?40:10);updateWallet();persistCity();const count=collectibles.filter(x=>x.found).length;$('collectCount').textContent=count+' / 12';toast(count===12?'街の光をすべて発見！ CITY EXPLORER':'街の光を発見！ +'+earned.amount+' CR / '+count+' / 12');}
}
autoSaveElapsed+=dt;if(autoSaveElapsed>=5){autoSaveElapsed=0;if(state==='walking')persistCity();}

if(multiplayer.isRewardActive()&&state==='walking'){
  coopSeconds+=dt;coopDistance+=position.distanceTo(previousPosition);
  if(coopSeconds>=60&&coopDistance>=30){const earned=awardCredits('coop:'+crypto.randomUUID(),200);coopSeconds=0;coopDistance=0;updateWallet();toast('協力プレイボーナス +'+earned.amount+' CR');}
}else {coopSeconds=0;coopDistance=0;}
previousPosition.copy(position);
$('rewardMode').textContent=multiplayer.isRewardActive()?'MULTI ×4 / 協力ボーナスあり':'SOLO / 光1個 +10 CR';
for(const peer of remotePlayers.values()){
  const travel=peer.root.position.distanceTo(peer.target);
  peer.root.position.lerp(peer.target,1-Math.exp(-dt*4));
  const targetYaw=peer.yaw+Math.PI,angle=Math.atan2(Math.sin(targetYaw-peer.root.rotation.y),Math.cos(targetYaw-peer.root.rotation.y));
  peer.root.rotation.y+=angle*(1-Math.exp(-dt*6));peer.root.visible=position.distanceTo(peer.root.position)<165;
  peer.phase+=dt*10;for(const limb of peer.model.userData.limbs){limb.arm.rotation.x=travel>.1?Math.sin(peer.phase)*.4*limb.side:0;limb.leg.rotation.x=travel>.1?-Math.sin(peer.phase)*.5*limb.side:0;}
}
document.body.classList.toggle('walking',state==='walking');
if(state==='setup'&&!hasEntered){const a=elapsed*.018;camPos.set(Math.sin(a)*58,18,Math.cos(a)*58);target.set(0,8,-45);}else{camPos.set(position.x+Math.sin(yaw)*7,position.y+3.35,position.z+Math.cos(yaw)*7);target.set(position.x-Math.sin(yaw)*7,position.y+1.65,position.z-Math.cos(yaw)*7);}camera.position.lerp(camPos,1-Math.exp(-dt*8));camera.lookAt(target);
core.rotation.y=elapsed*.4;crystal.position.y=Math.sin(elapsed)*.7;portalRing.rotation.z=elapsed*.3;for(const t of traffic){t.angle+=dt*t.speed;t.mesh.position.set(Math.sin(t.angle)*t.r,t.y+Math.sin(elapsed+t.r)*1.2,Math.cos(t.angle)*t.r);t.mesh.rotation.y=t.angle+Math.PI/2;}for(const g of collectibles)if(!g.found){g.mesh.rotation.y+=dt;g.mesh.position.y=1.7+Math.sin(elapsed*2+g.x)*.25;}for(const sign of signs){sign.rotation.y=Math.atan2(camera.position.x-sign.position.x,camera.position.z-sign.position.z);}residents.forEach((n,i)=>{n.rotation.y=Math.sin(elapsed*.3+i)*.4;n.position.y=Math.sin(elapsed+i)*.025;});
if(state==='setup'){previewBody.rotation.y+=dt*.3;previewRenderer.render(previewScene,previewCamera);}if(gain&&audio)gain.gain.setTargetAtTime(sound&&state==='walking'?.025:0,audio.currentTime,.15);if(osc&&audio)osc.frequency.setTargetAtTime(moving?92:73,audio.currentTime,.4);
if(toastTime>0){toastTime-=dt;if(toastTime<=0)$('toast').textContent='';}hudTick+=dt;if(hudTick>.2){hudTick=0;if(collectionDay!==todayJst()){collectionDay=todayJst();for(const item of collectibles){item.found=false;item.mesh.visible=true;}$('collectCount').textContent='0 / 12';persistCity();toast('新しい日の光が街に現れました。');}drawMap();$('district').textContent=position.z>175&&Math.abs(position.x)<30?'ホーム・ガーデン':position.x>165&&Math.abs(position.z)<35?'NOVA MARKET':portalNear?'スカイライン・レースゲート':position.x>70?'アーケード・ストリート':position.x< -70?'スカイガーデン':position.z>75?'ネオン・プロムナード':'セントラルプラザ';}renderer.render(scene,camera);requestAnimationFrame(animate);}
camera.position.set(50,18,55);requestAnimationFrame(animate);addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});


// Suppress browser selection and gestures only while gameplay is active.
const gameplayActive=()=>document.body.classList.contains('walking')||document.body.classList.contains('racing');
for(const eventName of ['contextmenu','selectstart','dragstart','gesturestart','gesturechange','gestureend'])document.addEventListener(eventName,e=>{if(gameplayActive()&&!e.target?.closest?.('input,textarea'))e.preventDefault();},{passive:false});
document.addEventListener('wheel',e=>{if(gameplayActive()&&(e.ctrlKey||e.metaKey))e.preventDefault();},{passive:false});
document.addEventListener('keydown',e=>{if(gameplayActive()&&(e.ctrlKey||e.metaKey)&&['Equal','Minus','Digit0','NumpadAdd','NumpadSubtract'].includes(e.code))e.preventDefault();});
