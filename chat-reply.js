(() => {
  window.createChatReply = function (input, onSelect) {
    let target = null;
    const bar = document.createElement('div');
    bar.className = 'lc-reply-draft';
    bar.hidden = true;
    const text = document.createElement('span');
    text.setAttribute('role', 'status');
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = '×';
    cancel.setAttribute('aria-label', '返信先を解除');
    function clear() { target = null; bar.hidden = true; text.textContent = ''; }
    cancel.addEventListener('click', () => { clear(); input.focus(); });
    bar.append(text, cancel);
    input.before(bar);
    return {
      get target() { return target; },
      clear,
      select(item) {
        target = item;
        onSelect?.(item);
        text.textContent = '↩ ' + (item.author || 'メッセージ') + ' · ' + excerpt(item);
        bar.hidden = false;
        input.focus();
      }
    };
  };

  function excerpt(item) {
    return (item.message || item.attachment?.name || 'メッセージ').replace(/\s+/g, ' ').slice(0, 95);
  }

  window.bindChatReply = function (bubble, item, composer, canReply = true) {
    if (item.reply) {
      const quote = document.createElement('blockquote');
      quote.className = 'lc-reply-quote';
      const author = document.createElement('strong');
      author.textContent = item.reply.author || 'メッセージ';
      const text = document.createElement('span');
      text.textContent = excerpt(item.reply);
      quote.append(author, text);
      bubble.prepend(quote);
    }
    if (!canReply) return;
    bubble.classList.add('lc-reply-target');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lc-reply-button';
    button.textContent = '↩';
    button.setAttribute('aria-label', 'このメッセージに返信');
    button.addEventListener('click', () => composer.select(item));
    bubble.append(button);

    let start;
    let suppressTap = false;
    bubble.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'touch' || event.target.closest('button,a,input')) return;
      start = {id:event.pointerId, x:event.clientX, y:event.clientY};
    });
    bubble.addEventListener('pointermove', event => {
      if (start?.id !== event.pointerId) return;
      const x = event.clientX - start.x;
      if (Math.abs(event.clientY - start.y) > 24 && Math.abs(event.clientY - start.y) > -x) {
        start = null;
        bubble.style.removeProperty('--reply-shift');
      } else if (x < -8) bubble.style.setProperty('--reply-shift', Math.max(-32, x / 3) + 'px');
    });
    function end(event) {
      if (start?.id !== event.pointerId) return;
      const reply = event.type === 'pointerup' && start.x - event.clientX >= 56 &&
        Math.abs(event.clientY - start.y) <= 38;
      start = null;
      bubble.style.removeProperty('--reply-shift');
      if (reply) {
        suppressTap = true;
        composer.select(item);
        setTimeout(() => { suppressTap = false; }, 400);
      }
    }
    bubble.addEventListener('pointerup',end);
    bubble.addEventListener('pointercancel',end);
    bubble.addEventListener('pointerleave',end);
    bubble.addEventListener('click',event=>{
      if (suppressTap) { event.preventDefault(); event.stopPropagation(); }
    }, true);
  };
})();
