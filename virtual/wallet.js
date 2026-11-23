import {readSave,writeSave} from './save.js';
const MAX=99999999;
export function getWallet(){const saved=readSave('wallet');return {balance:Number.isSafeInteger(saved?.balance)?Math.max(0,Math.min(MAX,saved.balance)):0,claimed:Array.isArray(saved?.claimed)?saved.claimed.filter(x=>typeof x==='string'&&x.length<160).slice(-600):[],saved:!!saved};}
export function awardCredits(id,amount){
  if(typeof id!=='string'||id.length>150||!Number.isSafeInteger(amount)||amount<1||amount>1000)return {amount:0,...getWallet()};
  const wallet=getWallet();if(wallet.claimed.includes(id))return {amount:0,...wallet};
  const next={balance:Math.min(MAX,wallet.balance+amount),claimed:[...wallet.claimed,id].slice(-600)};
  const saved=writeSave('wallet',next);return {amount:saved?amount:0,...(saved?next:wallet),saved};
}
export const todayJst=()=>new Date(Date.now()+9*3600000).toISOString().slice(0,10);

