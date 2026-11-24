/* Per-tab estimate of time away. No destination-page inspection or third-party requests. */
(() => {
  window.createLinkVisitDuration = function ({send, getToken, getBrowserId, storage, now = () => Date.now()}) {
    try {if(!storage)storage=window.sessionStorage;} catch (_) {}
    const key = "linkBaseVisitDurationV1", maxAge = 86400000;
    const valid = x => x && /^[0-9a-f-]{36}$/i.test(x.id) && /^[A-Za-z0-9_-]{8,100}$/.test(x.browser) && Number.isFinite(x.clicked) && now() >= x.clicked && now() - x.clicked <= maxAge;
    let active = null, queue = [], sending = false;
    try {const saved = JSON.parse(storage.getItem(key) || "{}");active = valid(saved.active) ? saved.active : null;queue = Array.isArray(saved.queue) ? saved.queue.filter(x => valid(x) && Number.isFinite(x.seconds) && x.seconds >= 0 && x.seconds <= 86400).slice(-20) : [];} catch (_) {}
    function save() {try {storage.setItem(key, JSON.stringify({active, queue}));} catch (_) {}}
    async function flush() {
      if(sending || !getToken()) return;
      sending = true;
      try {
        for(const item of queue.slice()) {
          if(!item.registered && now()-item.clicked < 30000)continue;
          if(!valid(item) || item.browser !== getBrowserId()) {queue = queue.filter(x => x !== item);save();continue;}
          const token = getToken();if(!token)break;
          try {const result = await send("completeLinkVisit",item.id,item.seconds,item.browser,token);if(!result?.ok)break;queue = queue.filter(x => x !== item);save();} catch (_) {break;}
        }
      } finally {sending = false;}
    }
    function returned() {
      if(document.hidden) return;
      if(active && Number.isFinite(active.away) && active.away >= active.clicked && now() >= active.away) {
        const item = {...active,seconds:(now()-active.away)/1000};active = null;
        if(valid(item) && item.seconds <= 86400)queue = queue.concat(item).slice(-20);
        save();
      }
      void flush();
    }
    function left() {
      if(active && !Number.isFinite(active.away)) {active.away = now();save();}
    }
    document.addEventListener("visibilitychange", () => document.hidden ? left() : returned());
    window.addEventListener("pagehide",left);
    window.addEventListener("pageshow",returned);
    window.addEventListener("focus",returned);
    return {
      begin(id) {returned();active = {id,browser:getBrowserId(),clicked:now(),registered:false};save();},
      registered(id, result) {if(result?.visitId === id){if(active?.id === id)active.registered=true;for(const item of queue)if(item.id===id)item.registered=true;save();void flush();}else {if(active?.id === id)active = null;queue = queue.filter(x => x.id !== id);save();}},
      failed(id) {if(active?.id === id)active = null;queue = queue.filter(x => x.id !== id);save();},
      resume:returned
    };
  };
})();
