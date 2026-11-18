(() => {
  window.createVisitorDirectChat = function (request, isAdmin, layout = {}) {
    const panel = document.createElement('dialog');
    panel.className = 'visitor-dm' + (layout.main ? ' visitor-dm-main click-log-panel chat-main-panel' : '');
    panel.setAttribute('aria-labelledby', 'visitorDmTitle');
    panel.innerHTML = `
      <header><h2 id="visitorDmTitle">個人トーク</h2><button type="button" data-close>閉じる</button></header>
      <button type="button" data-back hidden>トーク一覧に戻る</button>
      <div class="visitor-dm-list" data-rooms hidden></div>
      <div class="visitor-dm-thread" data-thread hidden>
        <button type="button" data-older hidden>以前のメッセージを表示</button>
        <div data-messages></div>
      </div>
      <form data-form hidden>
        <textarea placeholder="メッセージを入力…" aria-label="メッセージ" maxlength="1000" rows="2" required></textarea>
        <button type="submit">送信</button>
      </form>
      <p data-status role="status"></p>`;
    (layout.main ? layout.container : document.body).append(panel);
    const find = selector => panel.querySelector(selector);
    const title = find('h2');
    const rooms = find('[data-rooms]');
    const thread = find('[data-thread]');
    const history = find('[data-messages]');
    const older = find('[data-older]');
    const form = find('form');
    const input = find('textarea');
    const send = form.querySelector('button');
    const status = find('[data-status]');
    const back = find('[data-back]');
    const names = new Map();
    let browser = null;
    let generation = 0;
    let polling = false;
    let nextCursor = null;
    let oldMessages = [];
    let latestMessages = [];
    let rendered = '';
    let renderedRooms = '';
    let sending = false;
    let sendError = '';

    function render(keepScroll = false) {
      const messages = [...oldMessages, ...latestMessages];
      const key = JSON.stringify(messages);
      if (rendered === key) return;
      rendered = key;
      const previousHeight = thread.scrollHeight;
      const atBottom = previousHeight - thread.scrollTop - thread.clientHeight < 80;
      const seen = new Set();
      const cards = messages.flatMap(item => {
        if (seen.has(item.id)) return [];
        seen.add(item.id);
        const card = document.createElement('article');
        card.className = 'visitor-dm-message' + (item.own ? ' own' : '');
        const body = document.createElement('div');
        body.textContent = item.message;
        const time = document.createElement('time');
        const date = new Date(item.createdAt);
        if (Number.isFinite(date.getTime())) {
          time.dateTime = date.toISOString();
          time.textContent = date.toLocaleString('ja-JP', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
        }
        card.append(body, time);
        return [card];
      });
      history.replaceChildren(...cards);
      if (!cards.length) history.textContent = 'メッセージはまだありません。';
      if (keepScroll) thread.scrollTop += thread.scrollHeight - previousHeight;
      else if (atBottom) thread.scrollTop = thread.scrollHeight;
    }

    async function refresh() {
      if (!panel.open || polling || document.hidden) return;
      const current = generation;
      polling = true;
      try {
        if (browser === null) {
          const response = await request({operation:'list'});
          if (!panel.open || current !== generation) return;
          const roomKey = JSON.stringify(response.rooms);
          if (renderedRooms === roomKey) {
            status.textContent = sendError;
            return;
          }
          renderedRooms = roomKey;
          rooms.replaceChildren(...response.rooms.map(room => {
            const button = document.createElement('button');
            button.type = 'button';
            const name = document.createElement('strong');
            name.textContent = names.get(room.browserId) || room.browserId;
            const description = document.createElement('span');
            description.textContent = room.lastMessage;
            button.append(name, description);
            button.addEventListener('click', () => open(room.browserId));
            return button;
          }));
          if (!response.rooms.length) rooms.textContent = 'クリック履歴の「個人トーク」から相手を選べます。';
        } else {
          const response = await request({operation:'read',browser});
          if (!panel.open || current !== generation) return;
          latestMessages = response.messages;
          if (!oldMessages.length) nextCursor = response.nextCursor;
          older.hidden = !nextCursor;
          render();
        }
        if (!sending) status.textContent = sendError;
      } catch (error) {
        if (current === generation && panel.open && !sending) status.textContent = error.message || '読み込みに失敗しました。';
      } finally {
        polling = false;
        if (current !== generation && panel.open) void refresh();
      }
    }

    function open(target = '', name = '') {
      if (sending) return;
      if (target && name) names.set(target, name);
      browser = isAdmin ? (target || null) : '';
      generation++;
      nextCursor = null;
      oldMessages = [];
      latestMessages = [];
      rendered = '';
      sendError = '';
      history.replaceChildren();
      input.value = '';
      const isList = browser === null;
      title.textContent = isList ? '利用者との個人トーク' :
        isAdmin ? (names.get(browser) || browser) + 'との個人トーク' : '管理者との個人トーク';
      rooms.hidden = !isList;
      back.hidden = !isAdmin || isList;
      thread.hidden = isList;
      form.hidden = isList;
      older.hidden = true;
      status.textContent = '読み込み中…';
      if (!panel.open) { if (layout.main) { layout.onOpen?.(panel); panel.show(); } else panel.showModal(); }
      void refresh();
    }

    find('[data-close]').addEventListener('click', () => { panel.close(); layout.onClose?.(); });
    back.addEventListener('click', () => open());
    panel.addEventListener('close', () => { generation++; renderedRooms=''; history.replaceChildren(); rooms.replaceChildren(); input.value=''; });
    older.addEventListener('click', async () => {
      if (older.disabled || !nextCursor || browser === null) return;
      const current = generation;
      older.disabled = true;
      try {
        const response = await request({operation:'read',browser,before_cursor:nextCursor});
        if (current !== generation) return;
        oldMessages = [...response.messages,...oldMessages];
        nextCursor = response.nextCursor;
        older.hidden = !nextCursor;
        render(true);
      } catch (error) {
        if (current === generation) status.textContent = error.message || '読み込みに失敗しました。';
      } finally { older.disabled = false; }
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const message = input.value.trim();
      if (sending || !message || browser === null) return;
      const current = generation;
      sending = true;
      send.disabled = true;
      sendError = '';
      status.textContent = '送信中…';
      try {
        await request({operation:'send',browser,message,message_id:crypto.randomUUID()});
        if (current !== generation) return;
        if (input.value.trim() === message) input.value = '';
        status.textContent = '';
      } catch (error) {
        if (current === generation) {
          sendError = '送信できませんでした：' + (error.message || '通信エラー');
          status.textContent = sendError;
        }
      } finally {
        sending = false;
        send.disabled = false;
        if (current === generation) void refresh();
      }
    });
    setInterval(() => { if (panel.open) void refresh(); }, 5000);
    return {open, refresh, close:() => { if (panel.open) panel.close(); }};
  };
})();
