const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const create=tag=>({tag,children:[],append(n){this.children.push(n)},replaceChildren(){this.children=[]}}),context={window:{},URL,document:{createElement:create,createTextNode:text=>({text})}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../chat-links.js'),'utf8'),context);const {split,render}=context.window.LinkBaseChatLinks;
const links=s=>split(s).filter(p=>p.href);
assert.equal(links('こんにちは https://example.com/path?a=1&b=2\nhttp://example.org/').length,2);
assert.equal(links('（https://example.com/abc）。')[0].text,'https://example.com/abc');
assert.equal(links('https://example.com/wiki/Test_(demo)')[0].text,'https://example.com/wiki/Test_(demo)');
assert.equal(links('www.example.com')[0].href,'https://www.example.com/');
assert.equal(links('javascript:alert(1) data:text/html,test').length,0);
assert.equal(links('name@www.example.com').length,0);
const node=create('div');render(node,'<img src=x onerror=alert(1)> https://example.com');assert.equal(node.children[0].text,'<img src=x onerror=alert(1)> ');const a=node.children[1];assert.equal(a.tag,'a');assert.equal(a.target,'_blank');assert.equal(a.rel,'noopener noreferrer');
const url='https://example.com/'+ 'x'.repeat(150);render(node,url,{maxLength:95});assert.equal(node.children[0].href,url);assert.equal(node.children[0].textContent.length,95);
for(const name of ['index.html','admin.html','visitor-direct-chat.js']){const source=fs.readFileSync(path.join(__dirname,'../'+name),'utf8');assert(source.includes('window.LinkBaseChatLinks.render(body,item.message)'));}
console.log('PASS: all chat renderers, multiple links, Japanese punctuation, balanced parentheses, www, unsafe schemes, HTML as text and complete href in clipped quotes');
