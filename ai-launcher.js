/* LINK CORE AI launcher: WebLLM runs in a same-origin iframe.
 * Context is passed by postMessage only after login, never saved to storage or sent to GAS.
 */
(function () {
  'use strict';
  const trigger = document.querySelector('a.side-item[href^="./ai.html?from="]');
  if (!trigger) return;
  let overlay = null;
  let frame = null;
  let lastFocus = null;
  let previousOverflow = '';

  function closeAi() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    frame = null;
    document.body.style.overflow = previousOverflow;
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }

  function openAi(event) {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (overlay) return;

    lastFocus = document.activeElement;
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    overlay = document.createElement('div');
    overlay.id = 'linkCoreAiOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'LINK CORE AIチャット');

    const top = document.createElement('div');
    top.className = 'link-core-ai-overlay-top';
    const name = document.createElement('strong');
    name.textContent = '✧ LINK CORE AI';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'link-core-ai-overlay-close';
    close.textContent = '閉じる ×';
    close.setAttribute('aria-label', 'AIチャットを閉じる');
    close.addEventListener('click', closeAi);
    top.append(name, close);

    frame = document.createElement('iframe');
    frame.title = 'LINK CORE AIチャット';
    frame.setAttribute('allow', 'webgpu; clipboard-write');
    frame.setAttribute('referrerpolicy', 'same-origin');
    const src = new URL(trigger.getAttribute('href'), location.href);
    src.searchParams.set('embed', '1');
    frame.src = src.href;

    const style = document.createElement('style');
    style.textContent = [
      '#linkCoreAiOverlay{position:fixed;inset:0;z-index:2147483000;background:#050c17;display:flex;flex-direction:column;color:#eaf6ff;}',
      '#linkCoreAiOverlay .link-core-ai-overlay-top{height:49px;flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;padding:8px 15px;border-bottom:1px solid #26536b;background:#0a1928;font:600 13px system-ui,sans-serif;}',
      '#linkCoreAiOverlay .link-core-ai-overlay-close{border:1px solid #32617a;border-radius:8px;padding:7px 13px;background:#10273a;color:#e6faff;font:600 12px system-ui,sans-serif;cursor:pointer;}',
      '#linkCoreAiOverlay iframe{width:100%;min-height:0;flex:1;border:0;background:#06101c;}'
    ].join('');
    overlay.append(style, top, frame);
    document.body.append(overlay);
    close.focus();
  }

  trigger.addEventListener('click', openAi);
  window.addEventListener('keydown', function (event) {
    if (overlay && event.key === 'Escape' && event.target && event.target.ownerDocument === document) {
      event.preventDefault();
      closeAi();
    }
  });
  window.addEventListener('message', function (event) {
    if (!overlay || !frame || event.origin !== location.origin || event.source !== frame.contentWindow) return;
    if (!event.data || typeof event.data !== 'object') return;
    if (event.data.type === 'LC_AI_CLOSE') {
      closeAi();
      return;
    }
    if (event.data.type !== 'LC_AI_CONTEXT_REQUEST') return;
    let context = {role: 'standalone', links: []};
    try {
      if (typeof window.getLinkCoreAiContext === 'function') {
        const candidate = window.getLinkCoreAiContext();
        if (candidate && typeof candidate === 'object') {
          context = {
            role: candidate.role === 'admin' ? 'admin' : 'viewer',
            // Titles/categories only; no URLs, notes, passwords, tokens or member IDs.
            links: Array.isArray(candidate.links) ? candidate.links.slice(0, 350).map(function (entry) {
              return {
                title: String(entry.title || '').slice(0, 90),
                category: String(entry.category || '').slice(0, 70),
                favorite: entry.favorite === true
              };
            }) : []
          };
        }
      }
    } catch (error) {
      console.warn('[LINK CORE AI] サイト情報の取得に失敗しました。', error);
    }
    frame.contentWindow.postMessage({type: 'LC_AI_CONTEXT_RESPONSE', context: context}, location.origin);
  });
})();