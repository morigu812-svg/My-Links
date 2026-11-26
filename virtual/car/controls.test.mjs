import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
test('touch controls: single tap shifts without held pedal, pedals release independently, blur clears',async()=>{
 const source=await readFile(new URL('./game.js',import.meta.url),'utf8'),html=await readFile(new URL('./index.html',import.meta.url),'utf8'),deps={};
 for(const m of source.matchAll(/import \{([^}]+)\} from '([^']+)';/g)){if(m[2].startsWith('./scene'))continue;const mod=await import(new URL(m[2],import.meta.url));for(const name of m[1].split(',').map(s=>s.trim()))deps[name]=mod[name];}
 const elements=new Map(),events={};const classes=()=>({add(){},remove(){},toggle(){}});
 function el(id=''){return {id,hidden:false,value:'',textContent:'',innerHTML:'',style:{},dataset:{},children:[],classList:classes(),setAttribute(k,v){this[k]=v},getAttribute(k){return this[k]},append(n){this.children.push(n)},replaceChildren(){this.children=[]},addEventListener(k,fn){this[k]=fn},focus(){},blur(){},setPointerCapture(){},getBoundingClientRect(){return {left:0,top:0,right:200,bottom:200,width:110}},getContext(){return new Proxy({}, {get:()=>()=>{}})},click(){this.onclick?.({detail:0})}}}
 for(const m of html.matchAll(/id="([^"]+)"/g))elements.set(m[1],el(m[1]));const gears=['P','R','N','D','M'].map(g=>{const b=el();b.dataset.gear=g;return b});const pedals=['brake','throttle'].map(n=>{const b=elements.get(n==='brake'?'brake':'accelerator');b.dataset.pedal=n;return b});
 const document={body:{classList:classes()},hidden:false,getElementById:id=>elements.get(id),createElement:()=>el(),addEventListener(k,fn){events[k]=fn},querySelectorAll(q){if(q==='[data-gear]')return gears;if(q==='[data-pedal]')return pedals;return []}};
 const world=new Proxy({}, {get:()=>()=>{}});deps.createWorld=()=>world;
 const globals={document,performance:{now:()=>0},requestAnimationFrame(){},addEventListener(k,f){events[k]=f},matchMedia:()=>({matches:true}),confirm:()=>true,window:{},console};
 const fn=new (Object.getPrototypeOf(async function(){}).constructor)('deps',...Object.keys(globals),`const {${Object.keys(deps).join(',')}}=deps;\n`+source.replace(/^import .*;\n/gm,'')+'\nreturn {start:()=>startLesson(0),read:()=>({car,input:input(),state,brakeHold})};');
 const app=await fn(deps,...Object.values(globals));app.start();const touch={pointerType:'touch',pointerId:1,preventDefault(){}};
 gears[3].onpointerdown(touch);assert.equal(app.read().car.gear,'D');assert.equal(app.read().input.brake,1);assert(app.read().brakeHold);
 pedals[1].onpointerdown({...touch,pointerId:2});assert.equal(app.read().input.throttle,1);assert.equal(app.read().input.brake,0);
 pedals[0].onpointerdown({...touch,pointerId:3});pedals[1].pointerup({pointerId:2});assert.equal(app.read().input.throttle,0);assert.equal(app.read().input.brake,1);pedals[0].pointercancel({pointerId:3});assert.equal(app.read().input.brake,0);
 app.read().car.speed=5;gears[1].onpointerdown(touch);assert.equal(app.read().car.gear,'D');events.blur();assert.equal(app.read().state,'paused');assert.equal(app.read().input.throttle,0);assert.equal(app.read().input.brake,0);
});
