/**
 * Apps Script エディタで一時的に使う移行ランナー。
 * ChatMigration.gs を作成して貼り付け、保存してから実行します。
 * このファイルを含めたままウェブアプリを再デプロイしないでください。
 */
function runLinkCoreChatMigration() {
  const mode = supabaseChatMode_();
  if (mode === 'sheets') {
    supabaseChatRows_({ select: 'id', limit: 1 });
    console.log('Supabaseへの接続OK');
    return;
  }
  if (mode !== 'migrating') {
    throw new Error('LINK_CORE_CHAT_BACKEND を sheets または migrating に設定してください。');
  }
  return migrateChatHistoryToSupabase_();
}

/** 履歴の照合後にエディタから実行します。 */
function runLinkCoreChatActivation() {
  activateSupabaseChat_();
  console.log('チャットの保存先を Supabase に切り替えました');
}
