# MY LINKS

DAILY CORE風の黒いサイバー系リンク集。GitHub Pagesを画面として維持し、Firebase Authentication（Googleログイン）とFirestoreを保存先にする移行案です。

## 現在の状態
- `firebase-migration` ブランチにFirebase版の `index.html` と `firestore.rules` を用意しています。
- これは準備用ブランチです。Firebaseの設定値がまだ入っていないため、`main` へマージ／公開しないでください。
- 既存のGASファイルと専用スプレッドシートは削除・変更していません。DAILY COREにも触れていません。
- Firebase版へは既存のGASデータは自動移行されません。データを移す場合は別途バックアップと件数照合が必要です。

## 1. Firebaseプロジェクトを用意
1. https://console.firebase.google.com/ でMy-Links専用プロジェクトを新規作成します。DAILY COREで使うプロジェクトを流用しないでください。
2. Project settings → Your apps でWebアプリを登録し、Firebase configの `apiKey`、`authDomain`、`projectId`、`appId` を取得します。
3. Authentication → Sign-in method でGoogleプロバイダを有効にします。
4. Authentication → Settings → Authorized domains に `morigu812-svg.github.io` を追加します（すでにあれば不要）。
5. Firestore Databaseを作成します。

## 2. 設定値を入れる
Firebase Consoleから取得した値を、`index.html` の `firebaseConfig` にある以下のプレースホルダーへ置き換えます。
- `REPLACE_WITH_FIREBASE_API_KEY`
- `REPLACE_WITH_FIREBASE_AUTH_DOMAIN`
- `REPLACE_WITH_FIREBASE_PROJECT_ID`
- `REPLACE_WITH_FIREBASE_APP_ID`

Firebase Web configはフロントエンド用の設定値で、秘密鍵ではありません。サービスアカウントの秘密鍵、OAuth client secret、アクセストークンは絶対にGitHubへ置かないでください。

## 3. Firestoreルールを個人アカウントに限定
1. いったんFirebase版をテスト用ブランチから確認できるようにし、Googleでログインして画面に表示されるUIDを取得します。設定値が未入力の間はログインできません。
2. Firebase Console → Firestore Database → Rules で `firestore.rules` の内容を設定します。
3. ルール中の `REPLACE_WITH_YOUR_UID` を自分のログインUIDに置き換えてから公開します。置き換えるままならアクセスは許可されません。
4. ルールが有効になるまでは、アプリで保存・編集・削除をテストしないでください。

## 4. 公開前のチェック
- Firebase configが実値になっている
- Googleログインが成功する
- Firestore Rulesに自分のUIDが設定されている
- ログインした本人のデータだけ読み書きできる
- テストリンクを追加し、再読み込み後も残る
- 別アカウントからデータにアクセスできない
- 既存GASのデータを必要に応じてバックアップし、Firebaseデータとの件数・内容を照合する

## 重要
Firebase版の準備が完了するまでは、`main` ブランチと現在公開中のGitHub Pagesは変更しません。GAS／スプレッドシートは切替が成功するまで残してください。DAILY COREのプロジェクトやデータは使用しません。
