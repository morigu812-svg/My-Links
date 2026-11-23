# 現在の管理者チャット通信

管理者チャットの本文取得（全員宛て・個人宛て・過去ページ）とテキスト送信・引用返信は、既存のGASブリッジを経由してSupabaseへ通信します。Renderの /chat-api/* Rewriteは通常動作には必要ありません。

保存先はSupabaseのみです。GAS側は管理者セッションを検証し、LINK_CORE_CHAT_BACKENDがsupabaseでない場合はエラーにします。旧スプレッドシートへは切り替えません。添付本体は従来の非公開Driveに保存します。

既に最新Code.gsを反映済みなら、今回の修正でGAS再デプロイは不要です。

以下は任意の中継方式の設定資料です。現在の管理者画面はこの中継方式を使用しません。

---

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
