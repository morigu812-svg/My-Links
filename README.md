# MY LINKS

DAILY CORE風の黒いサイバー系リンク集。GitHub Pagesを画面、Google Apps ScriptとGoogleスプレッドシートを保存先として使います。

## 個人専用にするための重要設定
- GASウェブアプリは「実行ユーザー：自分」「アクセスできるユーザー：自分のみ」でデプロイしてください。
- GitHub Pagesの画面自体は公開URLですが、データ操作はGASのGoogleアカウント制限で保護します。
- DAILY COREとは別のApps Scriptプロジェクトと専用スプレッドシートを使用してください。
- GASのアクセス範囲を「全員」に変更しないでください。

## 1. Apps Scriptの準備
1. https://script.google.com/ で新しいプロジェクトを作成。
2. このリポジトリの gas/Code.gs の内容をCode.gsへコピー。
3. Apps ScriptでHTMLファイルを追加し、名前を bridge にして gas/bridge.html の内容をコピー。
4. 関数一覧で setup を選んで実行し、権限を許可。
5. 実行ログのURLを確認。専用の「My-Links Data (Private)」スプレッドシートが作成されます。DAILY COREの保存先は使用しません。

## 2. デプロイ
1. Apps Scriptの「デプロイ」→「新しいデプロイ」→「ウェブアプリ」。
2. 実行ユーザー「自分」、アクセスできるユーザー「自分のみ」を選択してデプロイ。
3. 末尾が /exec のウェブアプリURLをコピー。

## 3. GitHub Pages
1. リポジトリの Settings → Pages を開く。
2. Deploy from a branch、main、/(root) を選択して保存。
3. https://morigu812-svg.github.io/My-Links/ を開く。
4. 左側の「接続設定」にGASの /exec URLを貼り付け、「接続して読み込む」を押す。

Googleアカウントや組織の設定によって「自分のみ」の埋め込み動作が異なる場合があります。エラーが出てもアクセス範囲を公開に変えず、まずエラーメッセージを確認してください。

## 機能
- リンクの追加・編集・削除
- カテゴリ分けとキーワード検索
- スマホ・PC対応
- データは専用スプレッドシートに保存され、GitHub Pagesの再デプロイでは消えません

## データ保護
削除はスプレッドシートの該当行を削除します。大切なデータは時々バックアップしてください。個人情報や秘密のトークンは登録しないでください。
