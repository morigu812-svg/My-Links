/* The database keeps the messages; a protected change stream asks active pages to refresh. */
(() => {
  const sdkUrl = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.91.0/+esm';
  window.createChatRealtime = function (issueSession, onChange) {
    let client;
    let channels = [];
    let renewal;
    let notification;
    let generation = 0;
    let running = false;
    const changedTopics = new Set();

    function notify(topic) {
      changedTopics.add(topic);
      if (notification) return;
      notification = setTimeout(() => {
        notification = undefined;
        const topics = [...changedTopics];
        changedTopics.clear();
        onChange(topics);
      }, 120);
    }

    function stop() {
      running = false;
      generation++;
      clearTimeout(renewal);
      clearTimeout(notification);
      notification = undefined;
      changedTopics.clear();
      if (client) void client.removeAllChannels();
      client = undefined;
      channels = [];
    }

    async function authorize(current) {
      try {
        const session = await issueSession();
        if (current !== generation) return;
        if (!session?.enabled) {
          stop();
          return;
        }
        if (!client) {
          const {createClient} = await import(sdkUrl);
          if (current !== generation) return;
          client = createClient(session.url, session.key, {
            auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false}
          });
        }
        await client.realtime.setAuth(session.token);
        if (current !== generation) return;
        if (!channels.length) {
          channels = session.topics.map(topic => client.channel(topic)
            .on('postgres_changes', {
              event: '*', schema: 'public', table: 'link_core_chat_signals', filter: 'topic=eq.' + topic
            }, () => { if (current === generation) notify(topic); })
            .subscribe(status => {
              if (current === generation && status === 'SUBSCRIBED') notify(topic);
            }));
        }
        renewal = setTimeout(() => authorize(current), Math.max(5000, session.expiresAt - Date.now() - 35000));
      } catch (_) {
        if (current === generation) renewal = setTimeout(() => authorize(current), 15000);
      }
    }

    return {
      start() {
        if (running) return;
        running = true;
        void authorize(++generation);
      },
      stop
    };
  };
})();
