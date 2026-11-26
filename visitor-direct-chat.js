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
        <textarea placeholder="メッセージを入力…" aria-label="メッセージ" maxlength="1000" rows="2"></textarea>
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
    const send = form.querySelector('button[type=submit]');
    const status = find('[data-status]');
    const back = find('[data-back]');
    const names = new Map();
    function resolveBrowserName(id) {
      return names.get(id) || layout.resolveName?.(id) || '';
    }
    function setBrowserName(id, name) {
      if (typeof id !== 'string' || typeof name !== 'string') return;
      if (name) names.set(id, name); else names.delete(id);
      renderedRooms = '';
      if (isAdmin && browser === id) title.textContent = (resolveBrowserName(id) || id) + 'とのトーク';
    }
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
    let manualReply = null;
    let selectedFile = null;
    let uploadId = null;
    let sendId = null;
    let sendSignature = '';
    const mediaUrls = new Map();
    const replyStatus = document.createElement('p');
    replyStatus.className = 'visitor-dm-reply-context';
    replyStatus.setAttribute('role', 'status');
    replyStatus.hidden = true;
    form.before(replyStatus);
    const presence = document.createElement('p');
    presence.className = 'visitor-dm-presence';
    presence.setAttribute('role', 'status');
    form.before(presence);
    const tools = document.createElement('div');
    tools.className = 'visitor-dm-compose-tools';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.csv,.docx,.xlsx,.pptx,.mp4,.mov,.webm,.m4v';
    fileInput.hidden = true;
    const chooseFile = document.createElement('button');
    chooseFile.type = 'button'; chooseFile.className = 'btn'; chooseFile.textContent = '📎 ファイルを添付';
    const photoInput = document.createElement('input');
    photoInput.type = 'file'; photoInput.accept = 'image/*'; photoInput.hidden = true;
    const choosePhoto = document.createElement('button');
    choosePhoto.type = 'button'; choosePhoto.className = 'btn'; choosePhoto.textContent = '写真を添付';
    const fileLabel = document.createElement('span');
    const clearFile = document.createElement('button');
    clearFile.type = 'button'; clearFile.className = 'btn'; clearFile.textContent = '添付を解除'; clearFile.hidden = true;
    const cancelReply = document.createElement('button');
    cancelReply.type = 'button'; cancelReply.className = 'btn'; cancelReply.textContent = '返信を解除'; cancelReply.hidden = true;
    tools.append(chooseFile,choosePhoto,fileInput,photoInput,fileLabel,clearFile,cancelReply);
    form.prepend(tools);
    // Keep the submit reference independent of attachment and reply buttons.
    function selectFile(file) {
      if (sending || !file) return;
      if (!file.size || file.size > 40 * 1024 * 1024) { status.textContent = '添付は40 MiB以内にしてください。'; return; }
      selectedFile = file; uploadId = crypto.randomUUID(); sendId = null;
      fileLabel.textContent = file.name + '（' + (file.size / 1024 / 1024).toFixed(1) + ' MiB）';
      clearFile.hidden = false;
    }
    chooseFile.addEventListener('click', () => fileInput.click());
    choosePhoto.addEventListener('click', () => photoInput.click());
    fileInput.addEventListener('change', () => selectFile(fileInput.files[0]));
    photoInput.addEventListener('change', () => selectFile(photoInput.files[0]));
    clearFile.addEventListener('click', () => { if (!sending) clearAttachment(); });
    function clearAttachment() {
      selectedFile = null; uploadId = null; fileLabel.textContent = '';
      fileInput.value = ''; photoInput.value = ''; clearFile.hidden = true;
    }
    cancelReply.addEventListener('click', () => { if (!sending) { manualReply = null; rendered = ''; render(true); } });
    async function updatePresence() {
      if (!panel.open || browser === null || document.hidden) return;
      const current = generation;
      try {
        const result = await request({operation:'presence',browser});
        if (panel.open && current === generation) {
          presence.dataset.state = result.online ? 'online' : 'offline';
          presence.textContent = result.online ? '● 相手はオンラインです' : '相手はオフラインです';
        }
      } catch (_) { if (panel.open && current === generation) { presence.dataset.state = 'unknown'; presence.textContent = '接続状況を確認できません'; } }
    }
    function asBase64(blob) {
      return new Promise((resolve,reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('ファイルを読み込めません。'));
        reader.readAsDataURL(blob);
      });
    }
    async function attachmentUrl(item, targetBrowser) {
      if (mediaUrls.has(item.id)) return mediaUrls.get(item.id);
      const current = generation;
      const parts = [];
      let offset = 0;
      do {
        const response = await request({operation:'attachment',browser:targetBrowser,message_id:item.id,offset});
        if (!Number.isSafeInteger(response.nextOffset)||!(response.nextOffset > offset) || response.nextOffset > item.attachment.size || response.size !== item.attachment.size) throw new Error('添付の取得位置を確認できません。');
        if (current !== generation || !panel.open) throw new Error('添付の取得を中止しました。');
        const binary = atob(response.base64);
        if(binary.length!==response.nextOffset-offset)throw new Error('添付ファイルの分割サイズが一致しません。');
        parts.push(Uint8Array.from(binary, c => c.charCodeAt(0)));
        offset = response.nextOffset;
      } while (offset < item.attachment.size);
      const url = URL.createObjectURL(new Blob(parts,{type:item.attachment.mime}));
      mediaUrls.set(item.id,url);
      return url;
    }




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
      const pending = isAdmin ? [] : messages.filter(item => !item.own && item.replyRequired);
      const target = pending[0];
      replyTo = target ? target.id : manualReply?.id || null;
      replyStatus.hidden = !target && !manualReply;
      cancelReply.hidden = !!target || !manualReply;
      replyStatus.textContent = target
        ? '返信が必要です（残り' + pending.length + '件）。下に入力して「返信を送信」を押してください。\n返信先：' + target.message
        : manualReply ? '返信先：' + manualReply.message : '';
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
      const existingCards = new Map(Array.from(history.querySelectorAll('[data-message-id]'), card => [card.dataset.messageId,card]));
      const seen = new Set();
      readObserver.disconnect();
      visibleMessages.clear();
      const cards = messages.flatMap(item => {
        if (seen.has(item.id)) return [];
        seen.add(item.id);
        const contentKey = JSON.stringify([item.id,item.author,item.message,item.createdAt,item.own,item.attachment,item.replyTo,
          messages.find(message => message.id === item.replyTo)?.message]);
        const existing = existingCards.get(item.id);
        if (existing?.dataset.contentKey === contentKey) return [existing];
        const card = document.createElement('article');
        card.dataset.contentKey = contentKey;
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
        if (item.replyTo) {
          const quote = document.createElement('blockquote');
          quote.className = 'visitor-dm-quote';
          const original = messages.find(message => message.id === item.replyTo);
          quote.textContent = original ? original.message || original.attachment?.name || '添付ファイル' : '以前のメッセージへの返信';
          card.append(quote);
        }
        body.className = 'visitor-dm-body';
        card.append(body, time);
        if (item.attachment) {
          const attachment = document.createElement('button');
          attachment.type = 'button'; attachment.className = 'btn visitor-dm-attachment';
          attachment.textContent = '📎 ' + item.attachment.name + '（' + (item.attachment.size / 1048576).toFixed(1) + ' MiB）';
          const media = document.createElement('div');
          const targetBrowser = browser;
          const current = generation;
          attachment.addEventListener('click', async () => {
            attachment.disabled = true;
            try {
              const url = await attachmentUrl(item, targetBrowser);
              if (current !== generation || !panel.open) return;
              const download = document.createElement('a');
              download.href = url; download.download = item.attachment.name;
              download.textContent = 'ダウンロード'; download.className = 'btn';
              const content = [];
              if (/^image\//.test(item.attachment.mime)) {
                const image = document.createElement('img'); image.src = url; image.alt = item.attachment.name; content.push(image);
              } else if (/^video\//.test(item.attachment.mime)) {
                const video = document.createElement('video'); video.src = url; video.controls = true; video.playsInline = true; content.push(video);
              }
              media.replaceChildren(...content, download);
            } catch (error) { if (current === generation) status.textContent = error.message; }
            finally { attachment.disabled = false; }
          });
          card.append(attachment,media);
        }
        const actions = document.createElement('details');
        actions.className = 'visitor-dm-actions';
        const menu = document.createElement('summary');
        menu.textContent = '…'; menu.setAttribute('aria-label', 'メッセージの操作');
        const reply = document.createElement('button');
        reply.type = 'button'; reply.className = 'btn'; reply.textContent = '返信';
        reply.addEventListener('click', () => {
          if (sending) return;
          manualReply = {id:item.id,message:item.message || item.attachment?.name || '添付ファイル'};
          rendered = ''; render(true); input.focus();
        });
        actions.append(menu,reply);
        if (isAdmin && item.own) {
          const remove = document.createElement('button');
          remove.type = 'button'; remove.className = 'btn danger'; remove.textContent = '送信取消';
          remove.addEventListener('click', async () => {
            if (!confirm('このメッセージの送信を取り消しますか？')) return;
            remove.disabled = true;
            const current = generation;
            try {
              await request({operation:'delete',browser,message_id:item.id});
              if (current !== generation) return;
              oldMessages = oldMessages.filter(message => message.id !== item.id);
              if (manualReply?.id === item.id) manualReply = null;
              rendered = ''; await refresh();
            } catch (error) { if (current === generation) status.textContent = error.message; }
            finally { remove.disabled = false; }
          });
          actions.append(remove);
        }
        card.append(actions);
        if (item.own) {
          const receipt = document.createElement('span');
          receipt.className = 'visitor-dm-read-receipt';
          receipt.textContent = item.readByPeer ? '既読' : '未読';
          receipt.classList.toggle('is-read', !!item.readByPeer);
          card.append(receipt);
        }
        if (isAdmin && item.own) {
          const toggle = document.createElement('button');
          toggle.type = 'button';
          toggle.className = 'btn visitor-dm-require-action';
          toggle.dataset.required = String(!!item.replyRequired);
          const required = !!item.replyRequired;
          toggle.textContent = required ? '返信必須を解除' : '返信必須にする';
          toggle.addEventListener('click', async () => {
            const current = generation;
            toggle.disabled = true;
            try {
              await request({operation:'requireReply',browser,message_id:item.id,required:toggle.dataset.required !== 'true'});
              if (current !== generation) return;
              await refresh();
            } catch (error) {
              if (current === generation) status.textContent = error.message;
            } finally { toggle.disabled = false; }
          });
          actions.append(toggle);
        }
        if (!isAdmin && item.replyRequired) {
          const badge = document.createElement('p');
          badge.textContent = item.id === replyTo ? 'このメッセージへの返信を入力してください' : '返信待ち';
          badge.className = 'visitor-dm-required-badge';
          card.append(badge);
        }
        return [card];
      });
      const retained = new Set(cards);
      Array.from(history.children).forEach(card => { if (!retained.has(card)) card.remove(); });
      if (cards.length && !history.children.length) history.textContent = '';
      cards.forEach((card,index) => {
        // Preserve the DOM nodes holding open menus, previews and playing media.
        if (history.children[index] !== card) history.insertBefore(card,history.children[index] || null);
        const item = messages.find(message => message.id === card.dataset.messageId);
        const receipt = card.querySelector('.visitor-dm-read-receipt');
        if (receipt) {
          receipt.textContent = item.readByPeer ? '既読' : '未読';
          receipt.classList.toggle('is-read', !!item.readByPeer);
        }
        const toggle = card.querySelector('.visitor-dm-require-action');
        if (toggle) {
          toggle.dataset.required = String(!!item.replyRequired);
          toggle.textContent = item.replyRequired ? '返信必須を解除' : '返信必須にする';
        }
        let badge = card.querySelector('.visitor-dm-required-badge');
        if (!isAdmin && item.replyRequired) {
          if (!badge) { badge = document.createElement('p'); badge.className = 'visitor-dm-required-badge'; card.append(badge); }
          badge.textContent = item.id === replyTo ? 'このメッセージへの返信を入力してください' : '返信待ち';
        } else if (badge) badge.remove();
      });
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
        if (!panel.open || current !== generation) return;
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
            name.textContent = (resolveBrowserName(room.browserId) || room.browserId) + 'とのトーク';
            const description = document.createElement('span');
            description.textContent = room.lastMessage;
            button.append(name, description);
            button.addEventListener('click', () => open(room.browserId, resolveBrowserName(room.browserId)));
            return button;
          }));
          if (!response.rooms.length) rooms.textContent = 'クリック履歴の「個人トーク」から相手を選べます。';
        } else {
          const response = await request({operation:'read',browser,receipt_ids:visibleReceiptIds()});
          if (!panel.open || current !== generation) return;
          if (isAdmin && typeof response.browserName === 'string') {
            if (response.browserName) names.set(browser, response.browserName);
            else names.delete(browser);
            title.textContent = (resolveBrowserName(browser) || browser) + 'とのトーク';
          }
          const requiredIds = new Set(response.requiredReplyIds || []);
          const receipts = new Map((response.receipts || []).map(item => [item.id,item]));
          oldMessages = oldMessages.map(item => ({...item, ...receipts.get(item.id), replyRequired:requiredIds.has(item.id)}));
          latestMessages = response.messages;

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
      mediaUrls.forEach(url => URL.revokeObjectURL(url)); mediaUrls.clear();
      readObserver.disconnect(); visibleMessages.clear(); clearTimeout(readTimer);
      nextCursor = null;
      oldMessages = [];
      latestMessages = [];
      rendered = '';
      sendError = '';
      history.replaceChildren();
      input.value = '';
      replyTo = null; manualReply = null; sendId = null; clearAttachment(); replyStatus.textContent = ''; replyStatus.hidden = true;
      input.placeholder = 'メッセージを入力…'; send.textContent = '送信';
      const isList = browser === null;
      presence.hidden = isList;
      presence.dataset.state = 'checking';
      presence.textContent = '接続状況を確認中…';
      title.textContent = isList ? '利用者との個人トーク' :
        isAdmin ? (resolveBrowserName(browser) ? resolveBrowserName(browser) + 'とのトーク' : '名前を確認中…') : '管理者との個人トーク';
      rooms.hidden = !isList;
      back.hidden = !isAdmin || isList;
      thread.hidden = isList;
      form.hidden = isList;
      older.hidden = true;
      status.textContent = '読み込み中…';
      if (!panel.open) { if (layout.main) { layout.onOpen?.(panel); panel.show(); } else panel.showModal(); }
      // Each list/read response already includes the canonical browser name.
      void refresh(); void updatePresence();
    }

    find('[data-close]').addEventListener('click', () => {
      if (sending) return;
      if (isAdmin && browser !== null) { open(); return; }
      panel.close(); layout.onClose?.();
    });
    back.addEventListener('click', () => open());
    panel.addEventListener('close', () => { mediaUrls.forEach(url => URL.revokeObjectURL(url)); mediaUrls.clear(); readObserver.disconnect(); visibleMessages.clear(); clearTimeout(readTimer); generation++; renderedRooms=''; history.replaceChildren(); rooms.replaceChildren(); input.value=''; });
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
      if (sending || (!message && !selectedFile) || browser === null) return;
      const current = generation;
      sending = true;
      send.disabled = true;
      input.disabled = true; chooseFile.disabled = true; choosePhoto.disabled = true;
      sendError = '';
      status.textContent = '送信中…';
      try {
        if (selectedFile) {
          const file = selectedFile;
          const start = await request({operation:'uploadStart',browser,upload_id:uploadId,
            file:{name:file.name,mime:file.type,size:file.size}});
          if(current!==generation||!panel.open)return;
          if(!Number.isSafeInteger(start.offset)||start.offset<0||start.offset>file.size||!Number.isSafeInteger(start.chunkSize)||start.chunkSize<1||start.chunkSize>1024*1024)throw new Error('添付の転送開始位置または分割サイズが不正です。');
          let offset = start.offset;
          let retries = 0;
          while (offset < file.size) {
            status.textContent = '添付を送信中 ' + Math.floor(offset / file.size * 100) + '%';
            const encoded = await asBase64(file.slice(offset,Math.min(file.size,offset + start.chunkSize)));
            if(current!==generation||!panel.open)return;
            const result = await request({operation:'uploadChunk',browser,upload_id:uploadId,offset,base64:encoded});
            if (!Number.isSafeInteger(result.offset) || result.offset < offset || result.offset > file.size ||
                (result.offset === offset && ++retries > 2)) throw new Error('添付の転送が進みません。再送してください。');
            if (result.offset > offset) retries = 0;
            offset = result.offset;
          }
        }
        if(current!==generation||!panel.open)return;
        const signature = JSON.stringify([message,replyTo,uploadId]);
        if (sendId && signature !== sendSignature && selectedFile) throw new Error('送信確認が完了していません。元の本文と返信先で再送するか、添付を選び直してください。');
        if (!sendId || signature !== sendSignature) sendId = crypto.randomUUID();
        sendSignature = signature;
        await request({operation:'send',browser,message,message_id:sendId,reply_to:replyTo,upload_id:selectedFile ? uploadId : null});
        if (current !== generation) return;
        if (input.value.trim() === message) input.value = '';
        replyTo = null; manualReply = null; sendId = null; clearAttachment(); replyStatus.textContent = '';
        status.textContent = '';
      } catch (error) {
        if (current === generation) {
          sendError = '送信できませんでした：' + (error.message || '通信エラー');
          status.textContent = sendError;
        }
      } finally {
        sending = false;
        send.disabled = false; input.disabled = false; chooseFile.disabled = false; choosePhoto.disabled = false;
        if (current === generation) void refresh();
      }
    });
    setInterval(() => { if (panel.open) void refresh(); }, 5000);
    setInterval(() => { void updatePresence(); }, 30000);
    window.addEventListener('pagehide', () => { mediaUrls.forEach(url => URL.revokeObjectURL(url)); mediaUrls.clear(); });
    return {open, refresh, setBrowserName, close:() => { if (panel.open) panel.close(); }};
  };
})();
