# LINK CORE チャットの Supabase 移行

利用者の共通チャット・個別返信と、管理者専用の全体・個別トークを Supabase Postgres に保存します。既読と画像付きの利用者投稿も対象です。管理者専用チャットの添付バイナリは Google Drive に保存し、ファイルの参照情報を投稿と一緒に Postgres に記録します。GAS が既存のログインと権限を確認し、データを読み書きします。

ブラウザは行レベルで閲覧権限を制限した Realtime Postgres Changes で更新通知を受信し、GAS 経由で新着を取得します。接続が中断した場合に備えて定期取得も行います。ページを開いているときの更新機能です。

## 準備

1. LINK CORE 専用の Supabase プロジェクトを作り、SQL Editor で [chat.sql](chat.sql) を実行します。チャット用のテーブル、アクセス制御、通知トリガーを作ります。
2. GAS のスクリプト プロパティに、次の値を設定します。秘密値は GitHub、HTML、チャットに貼り付けず、GAS に直接入力します。
   - `LINK_CORE_SUPABASE_URL` — プロジェクトURL
   - `LINK_CORE_SUPABASE_SERVER_KEY` — サーバー用 secret key（または legacy service_role key）
   - `LINK_CORE_SUPABASE_PUBLISHABLE_KEY` — ブラウザ用 publishable key（または legacy anon key）
   - `LINK_CORE_SUPABASE_JWT_SECRET` — その専用プロジェクトで検証可能な legacy HS256 JWT signing secret
   - `LINK_CORE_CHAT_BACKEND` — 最初は `sheets`
3. 最新の `Code.gs` と `bridge.html` を GAS へ反映し、**既存のウェブアプリのデプロイ**を新しいバージョンに更新します。旧バージョンで同じシートへ書き込む別デプロイがある場合は停止します。

## 既存データを移す

1. 元のスプレッドシートをバックアップし、`LINK_CORE_CHAT_BACKEND` を `migrating` にします。この間、履歴の閲覧はでき、投稿・削除・既読の書き込みは一時停止します。
2. GAS エディタで `migrateChatHistoryToSupabase_` を実行します。実行ログで `public`・`direct`・`staff` が全部 `done: true` になるまで繰り返します。過去の投稿IDは引き継ぎます。失敗した処理を再実行しても同じIDの投稿は重複しません。
3. Supabase で件数と旧投稿・画像・添付付き投稿を照合してから、GAS エディタで `activateSupabaseChat_` を実行します。
4. 端末２台で、利用者の共通チャット、個別返信、管理者専用の全体と個別トークを送受信します。対象外の端末に個別投稿が表示されないことを確認し、既読・削除・添付と、通信復帰後の取得も試します。

切り替え前に中止する場合は `sheets` に戻せます。シートへの書き込みを再開した後に移行をやり直す場合は、Supabase の取り込み先と移行位置を見直します。切り替え後に新しい投稿が入った状態で元に戻す場合は、Supabase 側の追加分と変更を先に退避・照合します。

## 利用者との個人トークの `Load failed` 対策

ブラウザからSupabase RPCへの直接通信がSafari等で失敗しても動作するよう、個人トークの読み込み・送信は **GitHub Pages → GAS bridge.html → `visitorDirectChatProxy` → Supabase** で中継します。通信は既存のGASログイントークンで認証し、短命の権限限定JWTでSupabaseの`link_core_visitor_dm` RPCを呼び出します。管理者以外は他のブラウザIDを指定できません。ブラウザに秘密のサーバーキーは渡しません。

修正の反映には、新しい`Code.gs`と`bridge.html`をGASプロジェクトに反映し、**GASウェブアプリを新しいバージョンで再デプロイ**する必要があります。また`supabase/chat.sql`・`supabase/chat-direct.sql`・`supabase/visitor-direct-chat.sql`を適用済みで、`LINK_CORE_CHAT_BACKEND=supabase`になっていることも必要です。

個人トークを利用する端末では再ログインしてブラウザ連携を再登録します。登録に失敗したときは認証情報エラーを表示するため、GAS実行ログとSupabaseの関数・設定を確認してください。GitHub Pagesのデプロイ成功はGASやSupabase本番設定の成功を意味しません。

## 管理者の個人トーク：相手の既読表示

自分が送った個人メッセージの下に「未読 / ✓ 既読」を表示します。既存の `AdminChatMessages` の既読ブラウザID、または Supabase の `link_core_chat.readers` に含まれる**相手のメールボックスID**を使うため、過去の既読を消したり移行し直す必要はありません。共有トークの既読件数は変更しません。

`Code.gs` をGASに反映して**ウェブアプリを新バージョンで再デプロイ**してください。Supabaseを使う場合は、SQL Editorで**最新版の `supabase/visitor-direct-chat.sql` にある `create or replace function public.link_core_chat_read_direct(...)` の定義**を更新すると、ブラウザへの直接取得でも `peerRead` が返るようになります（`chat-direct.sql` 側も同じフィールドに更新済み）。SQLが未更新の場合も、新しいGASを通じて既読を補完しますが、追加の通信が発生することがあります。既存テーブルや `readers` 列を削除・初期化しないでください。
