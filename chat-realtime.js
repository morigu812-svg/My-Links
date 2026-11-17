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
    let authSession;
    let pendingSession;
    let verifiedDirect = false;
    const joined = new Set();

    async function getSession() {
      if (authSession?.expiresAt > Date.now() + 30000) return authSession;
      if (pendingSession) return pendingSession;
      const current = generation;
      const request = Promise.resolve().then(issueSession).then(session => {
        if (current !== generation) throw new Error('チャット接続が終了しました。');
        authSession = session;
        return session;
      }).finally(() => {
        if (pendingSession === request) pendingSession = undefined;
      });
      pendingSession = request;
      return request;
    }

    async function chatRequest(action, parameters, fallback) {
      const current = generation;
      let session;
      try { session = await getSession(); }
      catch (error) {
        if (current !== generation) throw error;
        return fallback();
      }
      if (current !== generation) throw new Error('チャット接続が終了しました。');
      if (!session?.direct || (action === 'send' && !verifiedDirect && !parameters.target_id) ||
          (action === 'send' && parameters.chat_type === 'staff' &&
          parameters.destination && !session.recipients?.includes(parameters.destination))) return fallback();
      try {
        const rpc = action === 'read' ? 'read_replies' : parameters.target_id ? 'send_reply' : 'send_direct';
        const response = await fetch(session.url + '/rest/v1/rpc/link_core_chat_' + rpc, {
          method: 'POST',
          headers: {apikey: session.key, Authorization: 'Bearer ' + session.token, 'Content-Type': 'application/json'},
          body: JSON.stringify(parameters),
          signal: AbortSignal.timeout(10000)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.message || 'Supabaseとの通信に失敗しました。');
        if (current === generation && action === 'read') verifiedDirect = true;
        return data;
      } catch (error) {
        // Reads can retry via GAS. A timed-out send may already be committed.
        if (current === generation && action === 'read') {
          verifiedDirect = false;
          return fallback();
        }
        throw error;
      }
    }
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
      joined.clear();
      authSession = undefined;
      pendingSession = undefined;
      verifiedDirect = false;
      if (client) void client.removeAllChannels();
      client = undefined;
      channels = [];
    }

    async function authorize(current) {
      try {
        const session = await getSession();
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
              if (current !== generation) return;
              if (status === 'SUBSCRIBED') {
                joined.add(topic);
                notify(topic);
              } else joined.delete(topic);
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
      stop,
      isConnected() { return channels.length > 0 && joined.size === channels.length; },
      read(parameters, fallback) { return chatRequest('read', parameters, fallback); },
      async visitorDm(parameters) {
        const current = generation;
        const session = await getSession();
        if (current !== generation || !session?.visitorDm) throw new Error('個人トークを使うにはページを開き直してログインしてください。');
        const response = await fetch(session.url + '/rest/v1/rpc/link_core_visitor_dm', {
          method: 'POST',
          headers: {apikey: session.key, Authorization: 'Bearer ' + session.token, 'Content-Type': 'application/json'},
          body: JSON.stringify(parameters),
          signal: AbortSignal.timeout(10000)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.message || '個人トークに接続できませんでした。');
        if (current !== generation) throw new Error('チャット接続が終了しました。');
        return data;
      },
      send(chatType, message, recipient, fallback, replyId) {
        return chatRequest('send', {
          chat_type: chatType, message, destination: recipient, message_id: crypto.randomUUID(),
          ...(replyId ? {target_id: replyId} : {})
        }, fallback);
      }
    };
  };
})();
