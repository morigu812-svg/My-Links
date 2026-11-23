import * as T from './vendor/three.module.min.js';
const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
export function windowTexture(seed=1){
  const c=canvas(256,512),x=c.getContext('2d');x.fillStyle='#171f46';x.fillRect(0,0,256,512);
  let n=seed;const rand=()=>{n=(n*1664525+1013904223)>>>0;return n/4294967296;};
  for(let row=0;row<18;row++)for(let col=0;col<7;col++){const lit=rand()>.27;x.fillStyle=lit?(['#d0fff5','#c6d3ff','#fff3df'][Math.floor(rand()*3)]):'#283154';x.fillRect(9+col*35,8+row*28,15,17);if(lit){x.fillStyle='#ffffff';x.fillRect(11+col*35,8+row*28,3,17);}}
  for(let i=0;i<8;i++){x.fillStyle='#53618f';x.fillRect(i*35,0,2,512);}const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;return tex;
}
export function asphaltTexture(){
  const c=canvas(512,512),x=c.getContext('2d');x.fillStyle='#35334f';x.fillRect(0,0,512,512);let seed=2;
  for(let i=0;i<9000;i++){seed=(seed*1664525+1013904223)>>>0;const a=seed%512;seed=(seed*1664525+1013904223)>>>0;const b=seed%512;x.fillStyle=i%2?'#66617b22':'#0c142522';x.fillRect(a,b,2,2);}
  x.strokeStyle='#171e38';x.lineWidth=3;x.strokeRect(2,2,508,508);x.strokeStyle='#77718f33';x.lineWidth=1;x.strokeRect(7,7,498,498);
  const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.wrapS=tex.wrapT=T.RepeatWrapping;return tex;
}
let glowMap;
export function lightPool(width,length,color=0x59ffff,opacity=.4){
  if(!glowMap){const c=canvas(128,128),x=c.getContext('2d'),g=x.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'#ffffffff');g.addColorStop(.25,'#ffffff99');g.addColorStop(1,'#ffffff00');x.fillStyle=g;x.fillRect(0,0,128,128);glowMap=new T.CanvasTexture(c);}
  const m=new T.Mesh(new T.PlaneGeometry(width,length),new T.MeshBasicMaterial({map:glowMap,color,transparent:true,opacity,depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide}));m.rotation.x=-Math.PI/2;return m;
}
export function addSky(scene){
  const sky=new T.Mesh(new T.SphereGeometry(2800,32,16),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,vertexShader:'varying vec3 pos; void main(){pos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'varying vec3 pos;void main(){float h=normalize(pos).y;vec3 low=vec3(.34,.12,.24);vec3 mid=vec3(.20,.08,.27);vec3 high=vec3(.025,.045,.13);vec3 color=mix(low,mid,smoothstep(-.05,.35,h));color=mix(color,high,smoothstep(.25,.9,h));gl_FragColor=vec4(color,1.);}',fog:false}));sky.renderOrder=-20;scene.add(sky);
}
export function sportHover(color=0x9764e9){
  const root=new T.Group(),paint=new T.MeshStandardMaterial({color,metalness:.85,roughness:.19}),dark=new T.MeshStandardMaterial({color:0x101329,metalness:.7,roughness:.22}),glass=new T.MeshStandardMaterial({color:0x35204f,metalness:.9,roughness:.12}),trim=new T.MeshBasicMaterial({color:0xe6ff6a}),head=new T.MeshBasicMaterial({color:0xf5ffff}),tail=new T.MeshBasicMaterial({color:0xff355f});
  const box=new T.BoxGeometry(1,1,1);
  function part(x,y,z,w,h,d,mat){const m=new T.Mesh(box,mat);m.position.set(x,y,z);m.scale.set(w,h,d);root.add(m);return m;}
  const shape=new T.Shape();shape.moveTo(-1.9,-3.7);shape.quadraticCurveTo(-2.3,-3.5,-2.3,-2.7);shape.lineTo(-2.45,2.5);shape.quadraticCurveTo(-2.4,4.2,-1.7,4.4);shape.lineTo(1.7,4.4);shape.quadraticCurveTo(2.4,4.2,2.45,2.5);shape.lineTo(2.3,-2.7);shape.quadraticCurveTo(2.3,-3.5,1.9,-3.7);shape.closePath();
  const shell=new T.Mesh(new T.ExtrudeGeometry(shape,{depth:.65,bevelEnabled:true,bevelSize:.3,bevelThickness:.25,bevelSegments:2,steps:1}),paint);shell.rotation.x=-Math.PI/2;shell.position.y=.5;root.add(shell);
  const cabin=new T.Mesh(new T.CylinderGeometry(1.45,1.85,1.15,4,1,false),glass);cabin.scale.set(1,1,1.55);cabin.rotation.y=Math.PI/4;cabin.position.set(0,1.55,.3);root.add(cabin);
  part(0,2.1,.5,2.55,.13,2.7,paint);part(0,.55,4.25,4.2,.35,.35,dark);part(0,.45,-3.85,4.1,.25,.2,trim);part(0,1.1,3.75,4.4,.14,.4,trim);
  for(const side of [-1,1]){
    part(side*2.23,.72,0,.10,.12,6.6,trim);part(side*1.9,1.1,-3.15,.65,.18,1.2,head);part(side*1.55,.95,4.05,.95,.3,.12,tail);
    for(const z of [-2.3,2.7]){const wheel=new T.Mesh(new T.CylinderGeometry(.8,.8,.42,12),dark);wheel.rotation.z=Math.PI/2;wheel.position.set(side*2.3,.45,z);root.add(wheel);const ring=new T.Mesh(new T.TorusGeometry(.63,.045,6,20),trim);ring.rotation.y=Math.PI/2;ring.position.set(side*2.54,.45,z);root.add(ring);}
    const edge=new T.Mesh(new T.TorusGeometry(1,.035,5,24,Math.PI),trim);edge.rotation.z=side*Math.PI/2;edge.scale.set(1.4,2.4,1);edge.rotation.y=Math.PI/2;edge.position.set(side*1.4,1.25,.2);root.add(edge);
  }
  const jets=[];for(const side of [-1,1]){const nozzle=new T.Mesh(new T.CylinderGeometry(.34,.34,.5,10),dark);nozzle.rotation.x=Math.PI/2;nozzle.position.set(side*1.35,.45,4.4);root.add(nozzle);const flame=new T.Mesh(new T.ConeGeometry(.35,3.5,8),new T.MeshBasicMaterial({color:0xff9be7}));flame.rotation.x=Math.PI/2;flame.position.set(side*1.35,.45,6.1);root.add(flame);jets.push(flame);}
  const under=lightPool(11,17,0x8e5dff,.32);under.position.y=.08;root.add(under);root.userData.jets=jets;return root;
}

