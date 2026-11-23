(() => {
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function modal(title) {
    const dialog = element('dialog', '', 'filter-access-dialog');
    const heading = element('h2', title);
    const close = element('button', '閉じる', 'btn');
    close.type = 'button';
    const header = element('header');
    header.append(heading, close);
    dialog.append(header);
    dialog.setAttribute('aria-label',title);
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => dialog.remove(), {once:true});
    document.body.append(dialog);
    dialog.showModal();
    return dialog;
  }
  const resultLabel = result => result === 'allowed' ? '開けた' : result === 'blocked' ? 'フィルターで制限された' : '報告なし';
  window.setupVisitorFilterAccess = (list, request) => {
    list.addEventListener('click', async event => {
      const button = event.target.closest('[data-filter-access]');
      if (!button) return;
      const card = button.closest('[data-link-id]');
      const id = card?.dataset.linkId;
      if (!id) return;
      event.preventDefault();
      const dialog = modal('⚠️ フィルターで制限された');
      const title = element('p',card.querySelector('a.title')?.textContent || 'リンク');
      const profile = element('p');
      const status = element('p', '登録情報を確認中…');
      status.setAttribute('role','status');
      dialog.append(title, profile, status);
      try {
        const current = await request('getMyFilterAccessReport', id);
        if (!dialog.open) return;
        profile.textContent = '登録フィルター　' + current.filter;
        status.textContent = '現在の報告　' + resultLabel(current.result);
        const actions = element('div','','filter-access-actions');
        const buttons = [['blocked','制限されたと報告する'],['allowed','開けたと報告する'],['','報告を取り消す']].map(([result,label]) => {
          const action = element('button',label,'btn');
          action.type = 'button';
          action.addEventListener('click', async () => {
            buttons.forEach(item=>{item.disabled=true;});
            status.textContent = '保存中…';
            try {
              const response = await request('saveFilterAccessReport', id, result);
              if (!dialog.open) return;
              if (!response?.ok) throw new Error('保存を確認できませんでした。');
              status.textContent = result ? response.filter + 'で「' + resultLabel(result) + '」と報告しました。' : '報告を取り消しました。';

            } catch (error) {
              if (dialog.open) status.textContent = '保存できませんでした　' + error.message;
            } finally { buttons.forEach(item=>{item.disabled=false;}); }
          });
          return action;
        });
        actions.append(...buttons);
        dialog.append(actions);
      } catch (error) {
        if (dialog.open) status.textContent = '取得できませんでした　' + error.message;
      }
    });
  };


  // Filter access dashboard: never treat the latest user report as a click event.
  const UNKNOWN_FILTER = '未設定・不明';
  const fmt = value => Number(value || 0).toLocaleString('ja-JP');
  const percent = (top, bottom) => bottom ? (top * 100 / bottom).toFixed(1) + '%' : '—';
  const dateJst = value => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? new Date(date.getTime() + 9 * 3600000).toISOString().slice(0,10) : '';
  };
  const midnightJst = () => {
    const today = dateJst(new Date());
    return Date.parse(today + 'T00:00:00+09:00');
  };
  const cutoffDay = days => dateJst(new Date(midnightJst() - (days-1) * 86400000));
  function node(tag, cls, textValue) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (textValue !== undefined) n.textContent = textValue;
    return n;
  }
  function emptyNode(textValue) {
    return node('p','fa-empty',textValue);
  }
  function statusChip(label, kind) {
    return node('span','fa-chip fa-chip-'+kind,label);
  }
  function buildReports(data, period, filter, school, query, includeEmpty) {
    if (!data) return [];
    const cutoff = period === '7' ? cutoffDay(7) : period === '30' ? cutoffDay(30) : '';
    const recent = new Map();
    (data.reports || []).forEach(report => {
      if (!report || !['allowed','blocked'].includes(report.result)) return;
      const key = JSON.stringify([report.browser,report.linkId,report.filter]);
      const old = recent.get(key);
      if (!old || report.updatedAt >= old.updatedAt) recent.set(key,report);
    });
    const groups = new Map();
    recent.forEach(r => {
      if (filter && r.filter !== filter || school && r.school !== school) return;
      if (cutoff && dateJst(r.updatedAt) < cutoff) return;
      const key = JSON.stringify([r.linkId,r.filter]);
      if (!groups.has(key)) groups.set(key,{id:r.linkId,filter:r.filter,school:r.school,allowed:0,blocked:0,updatedAt:'',title:r.title,url:r.url});
      const group = groups.get(key);
      group[r.result] += 1;
      if (r.updatedAt > group.updatedAt) group.updatedAt = r.updatedAt;
    });
    const links = new Map((data.links || []).map(item => [item.id,item]));
    (data.reports || []).forEach(item => {
      if (!links.has(item.linkId)) links.set(item.linkId,{id:item.linkId,title:item.title,url:item.url});
    });
    if (includeEmpty) {
      const names = filter ? [filter] : data.filters || [];
      for (const link of links.values()) {
        for (const name of names) {
          const key = JSON.stringify([link.id,name]);
          if (!groups.has(key)) groups.set(key,{id:link.id,filter:name,allowed:0,blocked:0,updatedAt:'',title:link.title,url:link.url});
        }
      }
    }
    const rows = Array.from(groups.values()).map(r => {
      const link = links.get(r.id);
      return {...r,title:link?.title || r.title || 'リンク名なし',url:link?.url || r.url || ''};
    }).filter(r => !query || (r.title+' '+r.url).toLowerCase().includes(query));
    rows.sort((a,b)=>b.blocked-a.blocked || b.allowed-a.allowed || b.updatedAt.localeCompare(a.updatedAt) || a.title.localeCompare(b.title,'ja'));
    return rows;
  }
  function reportTotals(data, period, filter, school) {
    const rows=buildReports(data,period,filter,school,'',false);
    return rows.reduce((a,b)=>({allowed:a.allowed+b.allowed,blocked:a.blocked+b.blocked}),{allowed:0,blocked:0});
  }
  function scopedActivity(activity, period, filter, school) {
    const initial = {clicks:0,logins:0,browsers:0,unknownBrowsers:0,groups:[]};
    if (!activity?.periods) return initial;
    const src = activity.periods[period] || initial;
    const groups = (src.groups || []).filter(g=>(!filter||g.filter===filter)&&(!school||g.school===school));
    return {clicks:groups.reduce((n,g)=>n+g.clicks,0),
      logins:groups.reduce((n,g)=>n+g.logins,0),
      // Each recorded browser belongs to exactly one current school/filter group.
      browsers:groups.reduce((n,g)=>n+g.browsers,0),
      unknownBrowsers:groups.filter(g=>g.filter===UNKNOWN_FILTER).reduce((n,g)=>n+g.browsers,0),
      groups};
  }
  function dateLabels(length) {
    const start=midnightJst();
    return Array.from({length},(_,i)=>dateJst(new Date(start-(length-i-1)*86400000)));
  }
  function chartSvg(daily,period,filter,school,metric) {
    const dates=dateLabels(period==='7'?7:30);
    const byDay = new Map(dates.map(date=>[date,0]));
    (daily || []).forEach(row=>{
      if (!byDay.has(row.date) || filter && row.filter!==filter || school && row.school!==school) return;
      byDay.set(row.date,byDay.get(row.date)+(metric==='operations'?Number(row.clicks||0)+Number(row.logins||0):Number(row[metric]||0)));
    });
    const values=dates.map(date=>byDay.get(date)||0);
    const max=Math.max(1,...values), width=720,height=210,left=42,right=16,top=15,bottom=34;
    const base=height-bottom, graphWidth=width-left-right, graphHeight=base-top;
    const ns='http://www.w3.org/2000/svg';
    const svg=document.createElementNS(ns,'svg');
    svg.setAttribute('viewBox','0 0 '+width+' '+height);
    svg.setAttribute('role','img');
    svg.setAttribute('aria-label',({clicks:'日別リンククリック数',logins:'日別ログイン回数',browsers:'日別ブラウザ数',operations:'日別操作合計'})[metric]);
    svg.classList.add('fa-plot');
    function shape(tag,attributes,textValue){
      const el=document.createElementNS(ns,tag);
      Object.entries(attributes).forEach(([key,value])=>el.setAttribute(key,String(value)));
      if(textValue!==undefined)el.textContent=textValue;
      svg.append(el);return el;
    }
    for(let n=0;n<=4;n++){
      const value=max*n/4;
      const y=base-graphHeight*n/4;
      shape('line',{x1:left,y1:y,x2:width-right,y2:y,stroke:'#234558','stroke-width':1});
      shape('text',{x:left-9,y:y+4,'text-anchor':'end',fill:'#92b2c1','font-size':11},String(Math.round(value)));
    }
    const x=i=>left+(dates.length===1?0:i*graphWidth/(dates.length-1));
    const y=v=>base-v/max*graphHeight;
    const pts=values.map((v,i)=>x(i).toFixed(1)+','+y(v).toFixed(1)).join(' ');
    shape('polygon',{points:left+','+base+' '+pts+' '+x(values.length-1)+','+base,fill:'#31c9fb','fill-opacity':'.09'});
    shape('polyline',{points:pts,stroke:'#45d7fa','stroke-width':3,fill:'none','stroke-linejoin':'round','stroke-linecap':'round'});
    values.forEach((v,i)=>{
      if (dates.length<=7 || i===0 || i===dates.length-1 || i%5===0) {
        shape('circle',{cx:x(i),cy:y(v),r:3,fill:'#a3efff'});
      }
    });
    const ticks=dates.length===7?[0,3,6]:[0,7,14,21,29];
    ticks.forEach(i=>shape('text',{x:x(i),y:height-10,'text-anchor':i===0?'start':i===dates.length-1?'end':'middle',fill:'#94b6c7','font-size':11},dates[i].slice(5).replace('-','/')));
    return svg;
  }

  window.setupAdminFilterAccess = (button, request, createPanel) => {
    button.addEventListener('click', () => {
      const dialog=createPanel?createPanel():modal('フィルター別アクセス状況');
      const container=node('div','fa-dashboard');
      const lead=node('p','fa-lead','利用状況（ログ）と、リンクを開けたかどうかの報告を分けて分析します。');
      const periodTools=node('div','fa-period-tools');
      const periods=[['7','7日間'],['30','30日間'],['all','全期間']];
      let period='30', visible=80, loaded=false, loading=false, reports=null, activity=null, currentError='';
      const periodButtons=periods.map(([id,label])=>{
        const b=node('button','fa-period',label);
        b.type='button';b.dataset.period=id;b.setAttribute('aria-pressed',id===period?'true':'false');
        b.addEventListener('click',()=>{period=id;visible=80;periodButtons.forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render();});
        periodTools.append(b);return b;
      });
      const tools=node('div','fa-toolbar');
      function selectControl(label) {
        const wrapper=node('label','fa-field');
        wrapper.append(node('span','',label));
        const select=node('select');
        wrapper.append(select);tools.append(wrapper);
        return select;
      }
      const filter=selectControl('フィルター');
      const school=selectControl('学校');
      const metric=selectControl('推移の指標');
      metric.append(new Option('リンククリック回数','clicks'),new Option('ログイン回数','logins'),new Option('日別ブラウザ数','browsers'),new Option('操作合計（クリック＋ログイン）','operations'));
      const reportState=selectControl('報告の状態');
      [['','すべて'],['blocked','制限報告あり'],['allowed','開放報告あり'],['mixed','結果が混在'],['none','報告なし']].forEach(([value,label])=>reportState.append(new Option(label,value)));
      const searchWrapper=node('label','fa-field fa-search');
      searchWrapper.append(node('span','','リンク名・URLを検索'));
      const search=node('input');search.type='search';search.placeholder='報告一覧を検索';
      searchWrapper.append(search);tools.append(searchWrapper);
      const controls=node('div','fa-actions');
      const refresh=node('button','btn','↻ 集計を更新');
      const merge=node('button','btn','フィルター名を統合');
      refresh.type=merge.type='button';controls.append(refresh,merge);
      const status=node('p','fa-status','報告データを読み込んでいます…');
      status.setAttribute('role','status');
      const cards=node('div','fa-cards');
      const sectionRow=node('div','fa-grid');
      const ranking=node('section','fa-section');
      ranking.append(node('h3','','フィルター別ランキング'));
      const rankingHint=node('p','fa-hint','クリック回数の多い順。右側の成功率は利用者の報告に基づく数値です。');
      const rankingRows=node('div','fa-ranks');ranking.append(rankingHint,rankingRows);
      const trend=node('section','fa-section');
      trend.append(node('h3','','日別の推移'));
      const trendHint=node('p','fa-hint');
      const trendContent=node('div','fa-graph');
      trend.append(trendHint,trendContent);
      sectionRow.append(ranking,trend);
      const schoolSection=node('section','fa-section');
      schoolSection.append(node('h3','','学校別の内訳'));
      const schoolBody=node('div','fa-school-list');
      schoolSection.append(schoolBody);
      const detail=node('section','fa-section');
      detail.append(node('h3','','リンクごとの開放・制限報告'));
      const detailHint=node('p','fa-hint','各ブラウザのリンクごとの最新報告を集計。クリック履歴とは異なり、報告を変更・取り消すと数値が変わります。');
      const emptyLabel=node('label','fa-toggle');
      const showEmpty=node('input');showEmpty.type='checkbox';
      emptyLabel.append(showEmpty,node('span','','報告なしの組み合わせも表示'));
      const detailBar=node('div','fa-detail-tools');
      detailBar.append(detailHint,emptyLabel);detail.append(detailBar);
      const tableWrap=node('div','filter-access-table');
      const table=node('table','fa-detail-table');
      const head=node('thead'), headerRow=node('tr');
      ['リンク','フィルター','開けた','制限された','成功率','最新報告（日本時間）'].forEach(label=>{
        const th=node('th','',label);th.scope='col';headerRow.append(th);
      });
      head.append(headerRow);
      const body=node('tbody');table.append(head,body);tableWrap.append(table);detail.append(tableWrap);
      const more=node('button','btn','さらに表示');more.type='button';more.hidden=true;detail.append(more);
      const foot=node('p','fa-method');
      container.append(lead,periodTools,tools,controls,status,cards,sectionRow,schoolSection,detail,foot);
      dialog.append(container);

      function populate(select,values,label) {
        const current=select.value;
        const cleaned=Array.from(new Set((values||[]).filter(x=>typeof x==='string'&&x.trim()))).sort((a,b)=>a.localeCompare(b,'ja'));
        select.replaceChildren(new Option(label,''),...cleaned.map(v=>new Option(v,v)));
        if(cleaned.includes(current))select.value=current;
      }
      function numberCard(label,value,detailText) {
        const card=node('div','fa-card');
        card.append(node('span','fa-card-label',label),node('strong','fa-card-value',value),node('span','fa-card-hint',detailText));
        return card;
      }
      function renderSkeleton() {
        const block=cls=>{
          const placeholder=node('div','fa-skeleton '+cls);
          placeholder.setAttribute('aria-hidden','true');
          return placeholder;
        };
        cards.replaceChildren(...Array.from({length:5},()=>{
          const card=node('div','fa-card');
          card.setAttribute('aria-hidden','true');
          card.append(block('fa-skeleton-label'),block('fa-skeleton-number'),block('fa-skeleton-hint'));
          return card;
        }));
        rankingRows.replaceChildren(...Array.from({length:4},()=>block('fa-skeleton-rank')));
        trendContent.replaceChildren(block('fa-skeleton-chart'));
        schoolBody.replaceChildren(...Array.from({length:3},()=>block('fa-skeleton-school')));
        const row=node('tr');
        const cell=node('td');cell.colSpan=6;
        cell.append(...Array.from({length:3},()=>block('fa-skeleton-table-row')));
        row.append(cell);body.replaceChildren(row);
        more.hidden=true;
      }
      function render() {
        if(!dialog.open)return;
        container.setAttribute('aria-busy',String(loading));
        if(loading) { renderSkeleton(); return; }
        const filterName=filter.value,schoolName=school.value;
        const scoped=scopedActivity(activity,period,filterName,schoolName);
        cards.replaceChildren(
          numberCard('リンククリック',activity?fmt(scoped.clicks):'—','クリック履歴に保存された回数'),
          numberCard('ユニークブラウザ',activity?fmt(scoped.browsers):'—','ログイン・クリックに登場したブラウザ'),
          numberCard('ログイン回数',activity?fmt(scoped.logins):'—','訪問者ログイン履歴の件数'),
          numberCard('1ブラウザ当たりクリック',activity&&scoped.browsers?(scoped.clicks/scoped.browsers).toFixed(1):'—','選択期間のクリック ÷ ユニークブラウザ'),
          numberCard('学校数',activity?fmt(new Set(scoped.groups.map(g=>g.school).filter(x=>x!==UNKNOWN_FILTER)).size):'—','アクセス記録に登場する登録校')
        );
        const byFilter=new Map();
        scoped.groups.forEach(g=>{
          const current=byFilter.get(g.filter)||{filter:g.filter,clicks:0,logins:0,browsers:0};
          current.clicks+=g.clicks;current.logins+=g.logins;current.browsers+=g.browsers;byFilter.set(g.filter,current);
        });
        const ranked=Array.from(byFilter.values()).sort((a,b)=>b.clicks-a.clicks || b.browsers-a.browsers || a.filter.localeCompare(b.filter,'ja'));
        const maximum=Math.max(1,...ranked.map(r=>r.clicks));
        rankingRows.replaceChildren();
        if(!activity)rankingRows.append(emptyNode('アクセス履歴を集計しています…'));
        else if(!ranked.length)rankingRows.append(emptyNode('この期間のアクセス記録はありません。'));
        else ranked.forEach((item,index)=>{
          const r=reportTotals(reports,period,item.filter,schoolName);
          const line=node('button','fa-rank');
          line.type='button';
          line.title='選択してこのフィルターに絞り込む';
          const info=node('div','fa-rank-info');
          info.append(node('span','fa-rank-name',(index+1)+'. '+item.filter),
            node('span','fa-rank-count',fmt(item.clicks)+'クリック · '+fmt(item.browsers)+'ブラウザ · 報告の開放率 '+percent(r.allowed,r.allowed+r.blocked)));
          const bar=node('div','fa-rank-bar');
          const fill=node('div','fa-rank-fill');
          fill.style.width=Math.max(0,Math.min(100,item.clicks/maximum*100))+'%';
          bar.append(fill);line.append(info,bar);
          line.addEventListener('click',()=>{
            filter.value=item.filter;visible=80;render();
          });
          rankingRows.append(line);
        });
        trendContent.replaceChildren();
        const label=({clicks:'リンククリック',logins:'ログイン',browsers:'日別ブラウザ数',operations:'操作合計'})[metric.value];
        trendHint.textContent=(period==='all'?'全期間選択中のためグラフは直近30日分を表示します。':'日本時間で日別集計します。')+' 指標：'+label+'。';
        if(activity)trendContent.append(chartSvg(activity.daily,period,filterName,schoolName,metric.value));
        else trendContent.append(emptyNode('推移を読み込んでいます…'));
        const bySchool=new Map();
        scoped.groups.forEach(item=>{
          const g=bySchool.get(item.school)||{name:item.school,clicks:0,logins:0,browsers:0};
          g.clicks+=item.clicks;g.logins+=item.logins;g.browsers+=item.browsers;bySchool.set(item.school,g);
        });
        schoolBody.replaceChildren();
        const schools=Array.from(bySchool.values()).sort((a,b)=>b.clicks-a.clicks);
        if(!activity)schoolBody.append(emptyNode('集計中…'));
        else if(!schools.length)schoolBody.append(emptyNode('この条件ではアクセス記録がありません。'));
        else schools.forEach(item=>{
          const row=node('div','fa-school-row');
          row.append(node('strong','',item.name),node('span','',fmt(item.clicks)+'クリック'),
            node('span','',fmt(item.browsers)+'ブラウザ'),node('span','',fmt(item.logins)+'ログイン'));
          schoolBody.append(row);
        });
        const rows=buildReports(reports,period,filterName,schoolName,search.value.trim().toLowerCase(),showEmpty.checked||reportState.value==='none').filter(item=>!reportState.value || (reportState.value==='blocked'?item.blocked>0:reportState.value==='allowed'?item.allowed>0:reportState.value==='mixed'?item.allowed>0&&item.blocked>0:item.allowed+item.blocked===0));
        body.replaceChildren();
        rows.slice(0,visible).forEach(item=>{
          const row=node('tr');
          const title=node('td','fa-link-title');
          title.append(node('strong','',item.title));
          if(item.url)title.append(node('small','filter-access-url',item.url));
          row.append(title,node('td','',item.filter),
            node('td','',fmt(item.allowed)),node('td','',fmt(item.blocked)),
            node('td','',percent(item.allowed,item.allowed+item.blocked)),
            node('td','',item.updatedAt?new Date(item.updatedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):'—'));
          body.append(row);
        });
        if(!rows.length){const row=node('tr');const cell=node('td','fa-empty','この条件に合う報告はありません。');cell.colSpan=6;row.append(cell);body.append(row);}
        more.hidden=visible>=rows.length;
        more.textContent='さらに表示（'+Math.min(visible,rows.length)+' / '+fmt(rows.length)+'件）';
        const alerts=[];
        if(activity?.truncated?.length)alerts.push('最大5万行で打ち切った履歴：'+activity.truncated.join('、'));
        if(activity?.missing?.length)alerts.push('取得できない記録：'+activity.missing.join('、'));
        foot.textContent='集計上の注意：クリック・ログインは操作履歴、開放率は各利用者が最後に報告した結果です。'
          +'過去のフィルター・学校は保存されていないため、ログは現在の登録情報で分類します。'
          +'削除済みの履歴は含みません。'
          +(alerts.length?' '+alerts.join('。')+'。':'');
        if(!loading) {
          status.textContent=activity
            ? '集計完了 · 期間：'+(period==='7'?'過去7日':period==='30'?'過去30日':'保存されている全期間')
              +' · '+fmt(rows.length)+'件のリンク別報告'+(currentError?' · '+currentError:'')
            : (currentError||'アクセス履歴を読み込んでいます…');
        }
      }
      async function load() {
        if(loading)return;
        loading=true;refresh.disabled=true;merge.disabled=true;
        status.textContent='集計結果を読み込んでいます…';
        render();
        try{
          const response=await request('getFilterAccessSummary');
          if(!dialog.open)return;
          if(!Array.isArray(response?.reports)||!Array.isArray(response?.links)||!Array.isArray(response?.filters))throw new Error('報告データの形式が不正です。');
          reports=response;currentError='';
          const filters=new Set(response.filters);
          const schools=new Set(response.reports.map(r=>r.school));
          populate(filter,Array.from(filters),'すべて');
          populate(school,Array.from(schools),'すべて');
          status.textContent='報告を取得しました。クリック・ログイン履歴を集計中…';
          render();
          try{
            const access=await request('getFilterAccessActivitySummary');
            if(!dialog.open)return;
            if(!access?.periods || !Array.isArray(access?.daily))throw new Error('履歴集計の形式が不正です。');
            activity=access;
            for(const g of access.periods.all?.groups||[]) {filters.add(g.filter);schools.add(g.school);}
            populate(filter,Array.from(filters),'すべて');
            populate(school,Array.from(schools),'すべて');
          }catch(error){
            if(dialog.open)currentError='アクセス履歴の取得に失敗：'+(error?.message||'通信エラー')+'（GASの更新が必要な可能性があります）';
          }
        }catch(error){
          if(dialog.open)currentError='報告の取得に失敗：'+(error?.message||'通信エラー');
        }finally{
          loading=false;refresh.disabled=false;merge.disabled=false;
          if(dialog.open)render();
        }
      }
      [filter,school,metric,reportState].forEach(item=>item.addEventListener('change',()=>{visible=80;render();}));
      search.addEventListener('input',()=>{visible=80;render();});
      showEmpty.addEventListener('change',()=>{visible=80;render();});
      more.addEventListener('click',()=>{visible+=80;render();});
      refresh.addEventListener('click',()=>{activity=null;void load();});
      merge.addEventListener('click',async()=>{
        const source=filter.value||prompt('統合元のフィルター名を入力してください。');
        if(!source)return;
        const target=prompt('「'+source+'」の集計先のフィルター名を入力してください。');
        if(!target||target.trim()===source)return;
        if(!confirm('「'+source+'」を「'+target.trim()+'」に統合しますか？元の報告・アクセス履歴は削除しません。'))return;
        merge.disabled=true;
        try{
          await request('mergeFilterAccessNames',source,target.trim());
          reports=null;activity=null;await load();
        }catch(error){if(dialog.open)status.textContent='フィルター名の統合に失敗：'+(error?.message||'通信エラー');}
        finally{merge.disabled=false;}
      });
      void load();
    });
  };
})();
