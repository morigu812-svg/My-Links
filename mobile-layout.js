(() => {
 const mobile = matchMedia('(max-width:760px)');
 const disclosures = [];
 function wrap(node,label) {
  if (!node || node.closest('.mobile-info-disclosure')) return;
  const details = document.createElement('details');
  details.className='mobile-info-disclosure';
  const summary=document.createElement('summary');
  summary.textContent=label;
  node.before(details);
  details.append(summary,node);
  disclosures.push(details);
 }
 document.querySelectorAll('.link-feed-privacy-note').forEach(node=>wrap(node,'お知らせ'));
 wrap(document.querySelector('#status'),'接続状況・詳細');
 wrap(document.querySelector('#loadStatus'),'読み込み状況・詳細');
 function update() { disclosures.forEach(details=>{details.open=!mobile.matches;}); }
 mobile.addEventListener('change',update);
 update();
})();