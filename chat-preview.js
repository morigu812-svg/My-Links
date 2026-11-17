(() => {
  const allowedSource = /^data:image\/(?:jpeg|png|gif|webp);base64,/i;

  window.createChatImagePreviews = function () {
    const open = new Map();

    function create(id, label, load) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn chat-image-preview-button';
      const image = document.createElement('img');
      image.className = 'chat-image-preview';
      image.alt = label;
      image.hidden = true;

      function reset(text = 'プレビュー') {
        image.hidden = true;
        image.removeAttribute('src');
        button.disabled = false;
        button.textContent = text;
        button.setAttribute('aria-expanded', 'false');
      }

      function show(url) {
        image.src = url;
        image.hidden = false;
        button.disabled = false;
        button.textContent = '画像を閉じる';
        button.setAttribute('aria-expanded', 'true');
      }

      function restore(entry) {
        if (entry.url) {
          show(entry.url);
          return;
        }
        button.disabled = true;
        button.textContent = '取得中…';
        entry.promise.then(url => {
          if (button.isConnected && open.get(id) === entry) show(url);
        }).catch(() => {
          if (!button.isConnected || open.get(id) !== entry) return;
          open.delete(id);
          reset('画像を再取得');
        });
      }

      image.addEventListener('error', () => {
        if (!image.isConnected || image.hidden) return;
        if (open.get(id)?.url === image.getAttribute('src')) open.delete(id);
        reset('画像を再取得');
      });
      button.addEventListener('click', () => {
        if (open.has(id)) {
          open.delete(id);
          reset();
          return;
        }
        const entry = {};
        entry.promise = Promise.resolve().then(load).then(url => {
          if (typeof url !== 'string' || !allowedSource.test(url)) throw new Error('画像を取得できませんでした。');
          entry.url = url;
          return url;
        });
        open.set(id, entry);
        restore(entry);
      });

      reset();
      const entry = open.get(id);
      if (entry) restore(entry);
      return {button, image};
    }

    return {
      create,
      keep(ids) {
        const keep = new Set(ids);
        for (const id of open.keys()) if (!keep.has(id)) open.delete(id);
      },
      clear() { open.clear(); }
    };
  };
})();
