/* Render chat text without interpreting HTML. Only HTTP(S) becomes a link. */
(()=>{'use strict';
 function split(text){
  const source=String(text??''),tokens=[];let from=0;
  const pattern=/(?:https?:\/\/|www\.)[^\s<>"'`\u3000]+/giu;
  for(const match of source.matchAll(pattern)){
   const at=match.index,previous=source[at-1]||'';if(/[A-Za-z0-9_@]/.test(previous))continue;
   let value=match[0];
   // Remove surrounding prose, retaining balanced parentheses inside URLs.
   while(value){const last=value.at(-1);if(/[.,!?;:。、，．！？：；…]/u.test(last)){value=value.slice(0,-1);continue;}
    const pairs={')':'(',']':'[','}':'{','）':'（','］':'［','｝':'｛','」':'「','』':'『','】':'【','〉':'〈','》':'《'};
    if(pairs[last]&&value.split(last).length>value.split(pairs[last]).length){value=value.slice(0,-1);continue;}break;
   }
   let url;try{url=new URL(/^www\./i.test(value)?'https://'+value:value);}catch{continue;}
   if(!['http:','https:'].includes(url.protocol)||!url.hostname)continue;
   if(at>from)tokens.push({text:source.slice(from,at)});
   tokens.push({text:value,href:url.href});from=at+value.length;
  }
  if(from<source.length)tokens.push({text:source.slice(from)});
  return tokens;
 }
 function render(node,text,{maxLength=Infinity}={}){node.replaceChildren();let remaining=maxLength;for(const part of split(text)){
  if(remaining<=0){node.append(document.createTextNode("…"));break;}const label=part.text.slice(0,remaining),clipped=label.length<part.text.length;remaining-=label.length;
  if(!part.href){node.append(document.createTextNode(label));if(clipped){node.append(document.createTextNode("…"));break;}continue;}
  const a=document.createElement('a');a.className='lc-chat-link';a.href=part.href;a.textContent=label;a.target='_blank';a.rel='noopener noreferrer';a.referrerPolicy='no-referrer';node.append(a);if(clipped){node.append(document.createTextNode("…"));break;}
 }return node;}
 window.LinkBaseChatLinks={split,render};
})();
