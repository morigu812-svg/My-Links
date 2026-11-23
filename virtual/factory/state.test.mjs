import assert from 'node:assert/strict';
import {createState,tap,collect,buy,advance,level,price,snapshot,offline,rate,nextDistrict} from './state.js';
const s=createState(null,'test-run-12345');assert.equal(s.bank,45);assert.equal(buy(s,'mines'),true);assert.equal(s.bank,27);assert.equal(buy(s,'forges'),false);assert.equal(buy(s,'invalid'),false);
for(let i=0;i<10;i++)tap(s);assert.equal(s.combo,10);const before=s.stash;const gain=collect(s);assert.ok(gain>before);assert.equal(s.stash,0);assert.equal(collect(s),0);assert.equal(buy(s,'forges'),true);
for(let i=0;i<60*20;i++){advance(s,.05);if(i%5===0)tap(s);if(i%20===0)collect(s);for(const type of ['mines','forges','drones'])if(s.bank>=price(s,type))buy(s,type);}
assert.ok(s.mines>=5&&s.forges>=5&&level(s)>=5);assert.ok(rate(s)>25);
const restored=createState(snapshot(s,100000),'ignored-run');assert.equal(restored.runId,s.runId);const stash=restored.stash;assert.equal(offline(restored,100000+600000),120*restored.mines*5);assert.ok(restored.stash>stash);assert.equal(offline(restored,100000+600000),0);
const malformed=createState({schema:1,bank:Infinity,stash:-123,mines:Infinity,forges:99999},'safe-run-12345');assert.equal(malformed.bank,45);assert.equal(malformed.stash,0);assert.equal(malformed.mines,1);assert.equal(malformed.forges,200);
console.log(JSON.stringify({tests:'passed',oneMinute:{mines:s.mines,forges:s.forges,drones:s.drones,city:level(s)+1,total:Math.floor(s.total)}}));

const d=createState(null,'district-run-12345');assert.equal(nextDistrict(d),false);d.total=100000;assert.equal(nextDistrict(d),true);assert.equal(d.districts,1);assert.equal(d.mines,1);assert.equal(d.bank,45);assert.equal(rate(d),6);console.log('Permanent district bonus and reset passed');
