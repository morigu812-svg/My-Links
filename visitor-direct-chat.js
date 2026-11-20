(() => {
  window.createVisitorDirectChat = function (request, isAdmin, layout = {}) {
    const panel = document.createElement('dialog');
    panel.className = 'visitor-dm' + (layout.main ? ' visitor-dm-main click-log-panel chat-main-panel' : '');
    panel.setAttribute('aria-labelledby', 'visitorDmTitle');
    panel.innerHTML = `
      <header><h2 id="visitorDmTitle">個人トーク</h2><button type="button" class="btn" data-close>閉じる</button></header>
      <button type="button" class="btn" data-back hidden>トーク一覧に戻る</button>
      <div class="visitor-dm-list" data-rooms hidden></div>
      <div class="visitor-dm-thread" data-thread hidden>
        <button type="button" class="btn" data-older hidden>以前のメッセージを表示</button>
        <div data-messages></div>
      </div>
      <form data-form hidden>
        <textarea placeholder="メッセージを入力…" aria-label="メッセージ" maxlength="1000" rows="2" required></textarea>
        <button type="submit" class="btn primary">送信</button>
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
    let replyTo = null;
    const replyStatus = document.createElement('p');
    replyStatus.className = 'visitor-dm-reply-context';
    replyStatus.setAttribute('role', 'status');
    replyStatus.hidden = true;
    form.before(replyStatus);



    let readTimer = null;
    let markingRead = false;
    const visibleMessages = new Set();
    const readObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const id = entry.target.dataset.messageId;
        if (entry.isIntersecting) visibleMessages.add(id);
        else visibleMessages.delete(id);
      });
      scheduleRead();
    }, {root:thread, threshold:0});
    function scheduleRead() {
      clearTimeout(readTimer);
      readTimer = setTimeout(() => { void markVisibleRead(); }, 250);
    }
    async function markVisibleRead() {
      if (!panel.open || browser === null || document.hidden || markingRead || !panel.getClientRects().length) return;
      const bounds = thread.getBoundingClientRect();
      const incoming = new Map([...oldMessages,...latestMessages].filter(item => !item.own && !item.readByMe).map(item => [item.id,item]));
      const ids = [...history.querySelectorAll('[data-message-id]')].filter(card => {
        const rect = card.getBoundingClientRect();
        return visibleMessages.has(card.dataset.messageId) && incoming.has(card.dataset.messageId) &&
          rect.bottom > Math.max(bounds.top,0) && rect.top < Math.min(bounds.bottom,innerHeight) &&
          rect.right > Math.max(bounds.left,0) && rect.left < Math.min(bounds.right,innerWidth);
      }).map(card => card.dataset.messageId).slice(0,100);
      if (!ids.length) return;
      const current = generation, target = browser;
      markingRead = true;
      try {
        const result = await request({operation:'markRead',browser:target,message_ids:ids});
        if (!panel.open || current !== generation) return;
        const saved = new Set(result.ids || []);
        const update = item => saved.has(item.id) ? {...item,readByMe:true} : item;
        oldMessages = oldMessages.map(update);
        latestMessages = latestMessages.map(update);
      } catch (_) {
        // Retry visible messages on the next poll without changing their state.
      } finally { markingRead = false; }
    }
    thread.addEventListener('scroll', scheduleRead, {passive:true});
    document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleRead(); });
    window.addEventListener('resize', scheduleRead);

    function prepareRequiredReply(messages) {
      if (isAdmin) return;
      const pending = messages.filter(item => !item.own && item.replyRequired);
      const target = pending[0];
      replyTo = target ? target.id : null;
      replyStatus.hidden = !target;
      replyStatus.textContent = target
        ? '返信が必要です（残り' + pending.length + '件）。下に入力して「返信を送信」を押してください。\n返信先：' + target.message
        : '';
      input.placeholder = target ? '上のメッセージへの返信を入力…' : 'メッセージを入力…';
      send.textContent = target ? '返信を送信' : '送信';
    }

    function render(keepScroll = false) {
      const messages = [...oldMessages, ...latestMessages];
      prepareRequiredReply(latestMessages);
      const key = JSON.stringify([messages,replyTo]);
      if (rendered === key) return;
      rendered = key;
      const previousHeight = thread.scrollHeight;
      const atBottom = previousHeight - thread.scrollTop - thread.clientHeight < 80;
      const seen = new Set();
      readObserver.disconnect();
      visibleMessages.clear();
      const cards = messages.flatMap(item => {
        if (seen.has(item.id)) return [];
        seen.add(item.id);
        const card = document.createElement('article');
        card.className = 'visitor-dm-message' + (item.own ? ' own' : '');
        card.dataset.messageId = item.id;
        const body = document.createElement('div');
        body.textContent = item.message;
        const time = document.createElement('time');
        const date = new Date(item.createdAt);
        if (Number.isFinite(date.getTime())) {
          time.dateTime = date.toISOString();
          time.textContent = date.toLocaleString('ja-JP', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
        }
        card.append(body, time);
        if (item.own) {
          const receipt = document.createElement('span');
          receipt.className = 'visitor-dm-read-receipt';
          receipt.textContent = item.readByPeer ? '既読' : '未読';
          card.append(receipt);
        }
        if (isAdmin && item.own) {
          const label = document.createElement('label');
          label.className = 'visitor-dm-required-toggle';
          const toggle = document.createElement('input');
          toggle.type = 'checkbox';
          toggle.checked = !!item.replyRequired;
          label.append(toggle, document.createTextNode(' 返信必須'));
          toggle.addEventListener('change', async () => {
            toggle.disabled = true;
            try {
              await request({operation:'requireReply',browser,message_id:item.id,required:toggle.checked});
              await refresh();
            } catch (error) { toggle.checked = !!item.replyRequired; status.textContent = error.message; }
            finally { toggle.disabled = false; }
          });
          card.append(label);
        }
        if (!isAdmin && item.replyRequired) {
          const badge = document.createElement('p');
          badge.textContent = item.id === replyTo ? 'このメッセージへの返信を入力してください' : '返信待ち';
          badge.className = 'visitor-dm-required-badge';
          card.append(badge);
        }
        return [card];
      });
      history.replaceChildren(...cards);
      cards.forEach(card => readObserver.observe(card));
      scheduleRead();
      if (!cards.length) history.textContent = 'メッセージはまだありません。';
      if (keepScroll) thread.scrollTop += thread.scrollHeight - previousHeight;
      else if (atBottom) thread.scrollTop = thread.scrollHeight;
    }


    function visibleReceiptIds() {
      const bounds = thread.getBoundingClientRect();
      return [...history.querySelectorAll('[data-message-id]')].filter(card => {
        const rect = card.getBoundingClientRect();
        return rect.bottom > Math.max(bounds.top,0) && rect.top < Math.min(bounds.bottom,innerHeight);
      }).map(card => card.dataset.messageId).slice(0,100);
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
            if (typeof room.browserName === 'string') {
              if (room.browserName) names.set(room.browserId, room.browserName);
              else names.delete(room.browserId);
            }
            name.textContent = names.get(room.browserId) || room.browserId;
            const description = document.createElement('span');
            description.textContent = room.lastMessage;
            button.append(name, description);
            button.addEventListener('click', () => open(room.browserId));
            return button;
          }));
          if (!response.rooms.length) rooms.textContent = 'クリック履歴の「個人トーク」から相手を選べます。';
        } else {
          const response = await request({operation:'read',browser,receipt_ids:visibleReceiptIds()});
          if (!panel.open || current !== generation) return;
          if (isAdmin && typeof response.browserName === 'string') {
            if (response.browserName) names.set(browser, response.browserName);
            else names.delete(browser);
            title.textContent = (response.browserName || browser) + 'との個人トーク';
          }
          const requiredIds = new Set(response.requiredReplyIds || []);
          const receipts = new Map((response.receipts || []).map(item => [item.id,item]));
          oldMessages = oldMessages.map(item => ({...item, ...receipts.get(item.id), replyRequired:requiredIds.has(item.id)}));
          latestMessages = response.messages;
          if (replyTo && !latestMessages.some(item => item.id === replyTo && item.replyRequired)) { replyTo = null; replyStatus.textContent = ''; }
          layout.onGate?.(!!response.replyRequired);
          if (!document.hidden) layout.onRead?.(latestMessages);
          if (!oldMessages.length) nextCursor = response.nextCursor;
          older.hidden = !nextCursor;
          render();
          scheduleRead();
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
      readObserver.disconnect(); visibleMessages.clear(); clearTimeout(readTimer);
      nextCursor = null;
      oldMessages = [];
      latestMessages = [];
      rendered = '';
      sendError = '';
      history.replaceChildren();
      input.value = '';
      replyTo = null; replyStatus.textContent = ''; replyStatus.hidden = true;
      input.placeholder = 'メッセージを入力…'; send.textContent = '送信';
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
    panel.addEventListener('close', () => { readObserver.disconnect(); visibleMessages.clear(); clearTimeout(readTimer); generation++; renderedRooms=''; history.replaceChildren(); rooms.replaceChildren(); input.value=''; });
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
        await request({operation:'send',browser,message,message_id:crypto.randomUUID(),reply_to:replyTo});
        if (current !== generation) return;
        if (input.value.trim() === message) input.value = '';
        replyTo = null; replyStatus.textContent = '';
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
