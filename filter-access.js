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

  function summarize(data, filter, school, query) {
    // An alias merge can put several raw reports in one group. Count each browser once.
    const latest = new Map();
    data.reports.forEach(report => {
      const key = JSON.stringify([report.browser,report.linkId,report.filter]);
      const previous = latest.get(key);
      if (!previous || report.updatedAt >= previous.updatedAt) latest.set(key,report);
    });
    const groups = new Map();
    latest.forEach(report => {
      if (school && report.school !== school) return;
      const key = JSON.stringify([report.linkId,report.filter]);
      if (!groups.has(key)) groups.set(key,{allowed:0,blocked:0,updatedAt:''});
      const group = groups.get(key);
      group[report.result]++;
      if (report.updatedAt > group.updatedAt) group.updatedAt = report.updatedAt;
    });
    const links = new Map(data.links.map(link => [link.id,link]));
    data.reports.forEach(report => {
      if (!links.has(report.linkId)) links.set(report.linkId,{id:report.linkId,title:report.title,url:report.url});
    });
    const filters = filter ? [filter] : data.filters;
    const rows = [];
    links.forEach(link => {
      if (query && !(link.title + ' ' + link.url).toLowerCase().includes(query)) return;
      filters.forEach(name => {
        const group = groups.get(JSON.stringify([link.id,name])) || {allowed:0,blocked:0,updatedAt:''};
        const state = group.allowed && group.blocked ? '結果が混在' : group.allowed ? '開けた報告のみ' : group.blocked ? '制限された報告のみ' : '報告なし';
        rows.push({...link,filter:name,...group,state});
      });
    });
    return rows;
  }
  window.setupAdminFilterAccess = (button, request) => {
    button.addEventListener('click', () => {
      const dialog = modal('フィルター別アクセス状況');
      const note = element('p','利用者の報告を集計しています。学校や設定によって結果が異なります。');
      const status = element('p','読み込み中…');
      status.setAttribute('role','status');
      const tools = element('div','','filter-access-tools');
      function selectControl(label) {
        const wrapper = element('label',label);
        const select = element('select');
        wrapper.append(select); tools.append(wrapper);
        return select;
      }
      const filter = selectControl('フィルター');
      const school = selectControl('学校');
      const searchLabel = element('label','リンクを検索');
      const search = element('input');
      search.type = 'search';
      searchLabel.append(search); tools.append(searchLabel);
      const refresh = element('button','再読み込み','btn');
      const merge = element('button','フィルター名を統合','btn');
      refresh.type = merge.type = 'button';
      tools.append(refresh,merge);
      const scroll = element('div','','filter-access-table');
      const table = element('table');
      const head = element('thead');
      const headRow = element('tr');
      ['リンク','フィルター','結果','開けた','制限された','最終報告（日本時間）'].forEach(title=>{
        const cell=element('th',title);cell.scope='col';headRow.append(cell);
      });
      head.append(headRow);
      const body = element('tbody');table.append(head,body);scroll.append(table);
      const more = element('button','続きを表示','btn');
      more.type='button';more.hidden=true;
      dialog.append(note,tools,status,scroll,more);
      let data = null, visible = 100, busy = false;
      function render() {
        if (!data) return;
        const rows=summarize(data,filter.value,school.value,search.value.trim().toLowerCase());
        body.replaceChildren(...rows.slice(0,visible).map(report=>{
          const row=element('tr');
          const link=element('td');
          link.append(element('strong',report.title),element('div',report.url,'filter-access-url'));
          row.append(link);
          [report.filter,report.state,report.allowed+'件',report.blocked+'件',
            report.updatedAt ? new Date(report.updatedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}) : '—']
            .forEach((value,index)=>{
              const cell=element('td',value);
              cell.dataset.label=['フィルター','結果','開けた','制限された','最終報告'][index];
              row.append(cell);
            });
          return row;
        }));
        status.textContent=rows.length ? rows.length+'件中 '+Math.min(visible,rows.length)+'件を表示' : '報告はまだありません。';
        more.hidden=visible>=rows.length;
      }
      function setOptions(select,values,label) {
        const previous=select.value;
        select.replaceChildren(new Option(label,''),...values.map(value=>new Option(value,value)));
        if(values.includes(previous))select.value=previous;
      }
      async function load() {
        if(busy)return;
        busy=true;refresh.disabled=merge.disabled=true;status.textContent='読み込み中…';
        try {
          const response=await request('getFilterAccessSummary');
          if(!dialog.open)return;
          if(!Array.isArray(response.reports)||!Array.isArray(response.links)||!Array.isArray(response.filters))throw new Error('集計結果が不正です。');
          data=response;
          setOptions(filter,data.filters,'すべて');
          setOptions(school,Array.from(new Set(data.reports.map(report=>report.school))).sort(),'すべて');
          visible=100;render();
        }catch(error){if(dialog.open)status.textContent='取得できませんでした　'+error.message;}
        finally{busy=false;refresh.disabled=merge.disabled=false;}
      }
      [filter,school].forEach(select=>select.addEventListener('change',()=>{visible=100;render();}));
      search.addEventListener('input',()=>{visible=100;render();});
      more.addEventListener('click',()=>{visible+=100;render();});
      refresh.addEventListener('click',load);
      merge.addEventListener('click',async()=>{
        const source=filter.value || prompt('統合元のフィルター名を入力してください。');
        if(!source)return;
        const target=prompt('「'+source+'」の集計先のフィルター名を入力してください。');
        if(!target || target.trim()===source)return;
        if(!confirm('「'+source+'」を「'+target.trim()+'」に統合しますか？ 同じブラウザの報告は最新の1件として数えます。'))return;
        merge.disabled=true;
        try {
          await request('mergeFilterAccessNames',source,target.trim());
          await load();
        }catch(error){if(dialog.open)status.textContent='統合できませんでした　'+error.message;}
        finally{merge.disabled=false;}
      });
      void load();
    });
  };
})();
