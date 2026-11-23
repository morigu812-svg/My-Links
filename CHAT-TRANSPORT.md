# 管理者チャットの同一オリジン通信

PULSEと同じく、管理者チャットの本文取得・テキスト送信（引用返信を含む）は
`/chat-api/rest/v1/rpc/...` へXHRで接続します。保存先は既存のSupabaseです。

## 既存のRenderサイトへの反映

GitHubへのpushだけでは、手動作成したStatic SiteにRewriteは追加されません。
既存のMy-LinksサイトのRedirects/Rewritesで次を追加してください。
SPA用の /* ルールがある場合は、その前に置きます。

- Source: `/chat-api/*`
- Destination: `https://bskmgytpfhmjhrclcohf.supabase.co/*`
- Action: Rewrite

Headersに `/chat-api/*` の `Cache-Control: no-store, private` と
`Vary: Authorization, apikey` を設定してください。
新規Blueprint用の設定はrender.yamlにあります。既存サイトを重複作成する必要はありません。

## 範囲と動作

- 管理者トーク本文の読込、過去ページ、テキスト送信、引用返信を中継します。
- JWTと公開キーを付け、既存のSupabase関数の権限判定を維持します。
- サーバー秘密キーはブラウザに配信しません。
- 共通チャット・利用者個人トーク・認証・添付・既読更新・一覧は従来の通信です。
- Realtime通知は従来の接続のままです。通知が利用できなくても既存の定期再取得は残ります。
- GitHub Pages単体にはRewrite機能がないため、この中継は利用できません。
- POST送信を自動再試行しません。タイムアウト後は再読み込みしてから再送してください。
