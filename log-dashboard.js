(() => {
  const make=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
  window.renderLogDashboardSkeleton=container=>{
    container.replaceChildren();
    const root=make('div',undefined,'log-dashboard log-dashboard-skeleton');
    root.setAttribute('aria-hidden','true');
    const placeholder=(cls)=>make('div',undefined,'log-skeleton-block '+cls);
    root.append(placeholder('log-skeleton-intro'));
    const cards=make('div',undefined,'log-dashboard-cards');
    for(let i=0;i<7;i++){
      const card=make('div',undefined,'log-dashboard-stat');
      card.append(placeholder('log-skeleton-label'),placeholder('log-skeleton-number'),placeholder('log-skeleton-unit'));
      cards.append(card);
    }
    root.append(cards,placeholder('log-skeleton-control'));
    const grid=make('div',undefined,'log-dashboard-grid');
    for(let i=0;i<4;i++){
      const chart=make('section',undefined,'log-dashboard-chart');
      chart.append(placeholder('log-skeleton-label'),placeholder('log-skeleton-plot'),placeholder('log-skeleton-axis'));
      grid.append(chart);
    }
    root.append(grid);container.append(root);
  };
  window.renderLogDashboard=(container,data)=>{
    container.replaceChildren();
    const root=make('div',undefined,'log-dashboard');
    const description=make('p','直近30日・日本時間。集計は最大60秒キャッシュします。日別来客数の合計は延べブラウザ日数です。同じブラウザの別日の訪問は重複します。');
    root.append(description);
    if(data.truncated?.length)root.append(make('p','各ログの最新50,000行を集計しています。上限より前の記録は含まれません：'+data.truncated.join(', '),'log-dashboard-warning'));
    if(data.missing?.length)root.append(make('p','まだ記録がないデータ：'+data.missing.join(', '),'log-dashboard-note'));
    const fields=[['logins','ログイン回数','回'],['visitors','日別来客数の合計','ブラウザ日'],['clicks','リンクのクリック','回'],['security','セキュリティ検知','件'],['operations','リンク操作','件'],['reports','リンク報告','件'],['appeals','異議申し立て','件']];
    const cards=make('div',undefined,'log-dashboard-cards');
    fields.forEach(([key,label,unit])=>{const card=make('div',undefined,'log-dashboard-stat');card.append(make('span',label),make('strong',(data.totals[key]||0).toLocaleString('ja-JP')),make('small',unit));cards.append(card);});
    root.append(cards);
    const grid=make('div',undefined,'log-dashboard-grid');
    const chartTools=make('label','表示するカテゴリ：','log-dashboard-category');
    const category=make('select');
    [['all','すべて'],['usage','利用状況'],['management','管理操作・報告'],['security','セキュリティ']].forEach(([value,label])=>{const option=make('option',label);option.value=value;category.append(option);});
    chartTools.append(category);root.append(chartTools);
    const usageKeys=new Set(['logins','visitors','clicks']);
    const groupFor=key=>usageKeys.has(key)?'usage':key==='security'?'security':'management';
    fields.forEach(([key,label,unit])=>{
      const section=make('section',undefined,'log-dashboard-chart');
      section.dataset.group=groupFor(key);
      section.append(make('h3',label+'の日別推移'));
      const max=Math.max(1,...data.days.map(d=>d[key]||0));
      section.append(make('small','最大 '+max.toLocaleString('ja-JP')+' '+unit));
      const graph=make('div',undefined,'log-dashboard-bars');
      const selected=make('p','棒を選ぶと日付と件数を表示します。','log-dashboard-selected');
      selected.setAttribute('role','status');
      data.days.forEach(d=>{
        const button=make('button',undefined,'log-dashboard-bar');
        button.type='button';button.style.setProperty('--bar-height',((d[key]||0)/max*100)+'%');
        const text=d.date+'：'+(d[key]||0)+' '+unit;
        button.title=text;button.setAttribute('aria-label',text);
        button.append(make('span',undefined,'log-dashboard-bar-fill'));
        button.addEventListener('click',()=>{selected.textContent=text;});
        graph.append(button);
      });
      const axis=make('div',undefined,'log-dashboard-axis');axis.append(make('span',data.days[0].date),make('span',data.days[data.days.length-1].date));
      section.append(graph,axis,selected);grid.append(section);
    });
    function ranking(title,items,group='usage') {
      items=items||[];
      const section=make('section',undefined,'log-dashboard-chart');section.dataset.group=group;section.append(make('h3',title));
      if(!items.length)section.append(make('p','集計対象の記録がありません。'));
      const max=Math.max(1,...items.map(x=>x.count));
      items.forEach(item=>{const row=make('div',undefined,'log-dashboard-rank');row.append(make('span',item.label),make('b',item.count.toLocaleString('ja-JP')+'件'));const meter=make('div',undefined,'log-dashboard-meter');const fill=make('span');fill.style.width=(item.count/max*100)+'%';meter.append(fill);row.append(meter);section.append(row);});
      grid.append(section);
    }
    ranking('クリックの多いリンク TOP 10',data.topLinks);ranking('セキュリティ検知の種類',data.securityTypes,'security');
    ranking('検知の重要度',data.securityLevels,'security');
    ranking('学校別の操作数（現在の登録情報）',data.schoolActivity);
    ranking('フィルター別の操作数（現在の登録情報）',data.filterActivity);
    ranking('時間帯別の操作数（日本時間）',data.hourlyActivity);
    ranking('リンク操作の種類',data.operationTypes,'management');
    category.addEventListener('change',()=>{grid.querySelectorAll('[data-group]').forEach(el=>{el.hidden=category.value!=='all'&&el.dataset.group!==category.value;});});
    root.append(grid);
    root.append(make('p','学校別・フィルター別・時間帯別の操作数はログイン＋クリックです。分類は現在の登録情報で、当時の設定ではありません。'));
    const details=make('details');details.append(make('summary','日別の数値を表で確認'));
    const scroll=make('div',undefined,'log-dashboard-table');const table=make('table');const head=make('thead'),headRow=make('tr');
    ['日付','ログイン回数','来客ブラウザ数','クリック回数','検知件数','リンク操作','リンク報告','異議申し立て'].forEach(label=>{const th=make('th',label);th.scope='col';headRow.append(th);});head.append(headRow);
    const body=make('tbody');data.days.slice().reverse().forEach(d=>{const row=make('tr');[d.date,d.logins,d.visitors,d.clicks,d.security,d.operations||0,d.reports||0,d.appeals||0].forEach(v=>row.append(make('td',v)));body.append(row);});table.append(head,body);scroll.append(table);details.append(scroll);root.append(details);
    root.append(make('p','セキュリティ検知には入力ミスや認証期限切れも含みます。不正アクセスの確定件数ではありません。'));
    root.append(make('small','集計日時：'+new Date(data.generatedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})));
    container.append(root);
  };
})();
