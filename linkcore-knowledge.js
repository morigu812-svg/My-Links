/* LINK CORE verified help (no AI API, no model inference).
 * Knowledge items are based on the current README.md, Code.gs and actual UI.
 * Returns deterministic, text-only answers; registered link names are read
 * from the already logged-in parent page only.
 */
(function (root) {
  'use strict';
  const norm = value => String(value == null ? '' : value).normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  const has = (s, re) => re.test(s);

  const FAQ = [
    {
      id: 'diagnosis', title: 'リンク診断', keywords: ['リンク診断','リンク切れ','重複','404','診断'],
      test: q => has(q, /リンク診断|リンク切れ|リンク.{0,8}切れ|リンクの?重複|重複した?(?:url|リンク)|(?:url|リンク)を診断|診断とは|診断する|診断機能/),
      answer: '「リンク診断」は、管理者が登録済みリンクの「リンク切れ」と「重複URL」を確認する機能です。\n\n使い方：管理者画面 → 左の「リンク診断」 → 「▶ 診断する」。Google Apps Scriptから8件ずつURLを確認し、「OK」「切れている」「要確認」と重複を表示します。\n\n「要確認」にはアクセス拒否（403）・タイムアウトなども含まれます。診断を実行しただけではリンクを削除・変更しません。家庭・端末のフィルターの有無は判定しません。'
    },
    {
      id: 'trash', title: 'ゴミ箱と復元', keywords: ['ゴミ箱','復元','元に戻す','完全削除'],
      test: q => has(q, /ゴミ箱|復元|元に戻す|完全削除|誤って削除/),
      answer: '管理者がリンクを削除すると、通常のリンクは「ゴミ箱」に移動します。削除直後の「元に戻す」か、管理画面の左メニュー「ゴミ箱」から復元できます。ゴミ箱では個別の完全削除や一括削除もできます。完全削除は取り消せません。公式リンクは通常のゴミ箱の対象外です。'
    },
    {
      id: 'add', title: 'リンクの追加・編集・削除', keywords: ['追加','編集','登録','削除'],
      test: q => has(q, /リンク(を|の|は)?(?:追加|編集|登録|削除)|(?:追加|編集|登録|削除)(?:する|したい|方法|できる|には).*リンク|リンクの?管理/),
      answer: 'リンクの追加・編集・削除は管理者画面から操作します。「リンクを追加」でタイトル、URL、カテゴリ（フォルダー）、メモなどを設定できます。登録済みリンクを編集し、利用者への公開・非公開、お気に入り、NEWラベルも管理できます。利用者画面からリンク自体を編集することはできません。'
    },
    {
      id: 'folders', title: 'フォルダーとカテゴリ', keywords: ['フォルダ','フォルダー','カテゴリ','階層','分類'],
      test: q => has(q, /フォルダ|フォルダー|カテゴリ|階層|分類する/),
      answer: 'LINK COREでは「カテゴリ」がフォルダーとして表示されます。画面のフォルダーを押すと中のリンクを表示します。管理者はカテゴリ名を「学習/英語」のように / で区切ると、フォルダーの中にフォルダーを作れます。利用者はフォルダーを開いて閲覧できます。'
    },
    {
      id: 'favorites', title: 'お気に入り', keywords: ['お気に入り','スター','★'],
      test: q => has(q, /お気に入り|スター機能|★/),
      answer: '「お気に入り」は、よく使うリンクをまとめて表示する機能です。左メニューの「★ お気に入り」で一覧を開きます。管理者はリンクのお気に入り状態を切り替えられます。'
    },
    {
      id: 'chat', title: '管理者・利用者チャット', keywords: ['チャット','個人宛','既読','メッセージ','添付'],
      test: q => has(q, /管理者(?:専用)?チャット|利用者チャット|個人宛|既読|メッセージ|添付|チャットの?使い方/),
      answer: 'LINK COREには2種類のチャットがあります。\n\n・利用者チャット：利用者が管理者へ質問や不具合報告を送れます。\n・管理者専用チャット：管理者同士の連絡に使います。全員宛て・個人宛て、既読確認、ファイル添付（最大2MB）、自分の投稿の削除に対応するコードがあります。\n\n個人宛て・添付などGAS側の新機能は、最新のCode.gsをGASへ反映して再デプロイしていない場合は利用できません。'
    },
    {
      id: 'search', title: '検索と更新', keywords: ['検索','見つからない','更新','再読み込み'],
      test: q => has(q, /検索(?:欄|機能|方法|する|でき|とは)|リンクを更新|リンクが(?:表示されない|見つからない)|再読み込み/),
      answer: '画面上部の検索欄にキーワードを入れると、登録リンクのタイトル・URL・メモ・カテゴリから検索できます。リンクが新しく登録されたのに表示されないときは、「リンクを更新」を押して最新の一覧を取得してください。利用者には公開対象のリンクだけが表示されます。'
    },
    {
      id: 'new', title: 'NEWラベル', keywords: ['new','新着','新しいリンク'],
      test: q => has(q, /newラベル|new(?:表示|マーク)|新着ラベル|新しいリンクのマーク/),
      answer: '「NEW」は、管理者が新しいリンクを目立たせたいときに付けるラベルです。黄色いNEW表示が出ます。管理者はリンクの設定でNEWラベルを切り替えられます。'
    },
    {
      id: 'history', title: '履歴とログ', keywords: ['履歴','ログ','クリック','アクセス'],
      test: q => has(q, /クリック履歴|操作履歴|ログイン履歴|アクセス履歴|利用履歴/),
      answer: '管理者画面の「ログ」から、リンク操作履歴・利用者ログイン履歴・クリック履歴を確認できます。利用者画面からこれらの管理者向け履歴を閲覧することはできません。'
    },
    {
      id: 'official', title: '公式リンク', keywords: ['公式リンク','クイックアクセス'],
      test: q => has(q, /公式リンク|クイックランチャー/),
      answer: '「公式リンク」は、よく使う公式サイトをまとめて開ける管理画面の機能です。管理者画面の左メニュー「公式リンク」で表示・追加・削除できます。通常のリンク一覧とは別に管理されています。'
    },
    {
      id: 'memo', title: 'メモ帳', keywords: ['メモ帳','メモを保存'],
      test: q => has(q, /メモ帳|メモを(?:保存|書く|編集)/),
      answer: '「メモ帳」は管理者向けの機能です。管理者画面の左メニュー「メモ帳」から開けます。リンクカードに付ける「メモ」とは別の機能です。'
    },
    {
      id: 'share', title: 'ページの共有', keywords: ['qr','共有','シェア'],
      test: q => has(q, /qrコード|ページを共有|リンクコアを共有|共有する方法/),
      answer: '利用者画面・管理者画面の「このページを共有」から、利用者向けLINK COREページのQRコードとURLを表示できます。管理者画面のURLをそのまま共有する機能ではありません。'
    },
    {
      id: 'login', title: 'ログイン', keywords: ['ログイン','パスワード','認証'],
      test: q => has(q, /ログイン|パスワード|認証(?:方法|する|できない)/),
      answer: 'LINK COREは利用者画面と管理者画面にそれぞれログインがあります。利用者はサイトのパスワードでログインし、公開対象のリンクを閲覧します。管理者は別の管理者認証でリンクを編集します。パスワードをAIに入力・共有する必要はありません。'
    },
    {
      id: 'ai', title: 'AIチャット', keywords: ['webllm','aiチャット','aiの仕組み','人工知能'],
      test: q => has(q, /webllm|aiチャット|aiの仕組み|aiは何ができる|aiの使い方/),
      answer: 'LINK CORE AIは、WebLLMを使って端末のWebGPUで文章を生成するチャットです。APIキー・AI API課金は不要です。モデルは初回起動時にダウンロードが必要です。LINK COREの機能説明や、LINK CORE内から開いたときに取得したリンク名を参考にしますが、サイトやGASを直接操作することはできません。'
    },
    {
      id: 'general', title: 'LINK COREの機能', keywords: ['linkcore','リンクコア','このサイト','どんな機能'],
      test: q => has(q, /(?:linkcore|リンクコア|このサイト|このページ).*(?:何|とは|機能|できる|使い方|教えて)|どんな機能|機能一覧/),
      answer: 'LINK COREは、リンクをフォルダーごとに管理・共有できるWebサイトです。\n\n利用者向け：フォルダー閲覧、お気に入り、リンク検索、最近追加した項目、管理者チャット、QRコード共有。\n管理者向け：リンクの追加・編集・削除、公開範囲、NEWラベル、公式リンク、ゴミ箱と復元、リンク診断、クリック履歴、管理者専用チャット、メモ帳。\n\n知りたい機能名を質問すると、詳しい使い方を案内できます。'
    }
  ];

  function catalogAnswer(question, context) {
    if (!context || !context.received || !Array.isArray(context.links)) return null;
    const links = context.links.filter(x => x && typeof x.title === 'string' && x.title.trim());
    if (!links.length) return null;
    const q = norm(question);
    const matches = links.filter(item => {
      const title = norm(item.title);
      // Avoid substring matching generic two-character words or AI/chat terminology.
      return title.length >= 3 && !/^(?:ai|new|link|chat|home)$/.test(title) && q.includes(title);
    }).slice(0, 5);
    if (matches.length && (has(q, /リンク|フォルダ|フォルダー|カテゴリ|場所|どこ|お気に入り|探|登録/) || matches.some(item => norm(item.title) === q))) {
      return '取得済みのリンク一覧で見つかった項目：\n' +
        matches.map(item => '・' + String(item.title).slice(0,90) +
         ' → ' + String(item.category || '未分類').slice(0,70) +
         (item.favorite ? '（お気に入り）' : '')).join('\n') +
         '\n\n※リンク先ページの内容は確認していません。';
    }
    if (has(q, /登録(?:した|済み)?リンク|リンク一覧/) && has(q, /一覧|全部|いくつ|何件|教えて|表示/)) {
      const first = links.slice(0, 12);
      return 'この画面で受信したリンク名は ' + links.length + ' 件です。先頭から一部を表示します：\n' +
        first.map(item => '・' + item.title.slice(0,90) + '（' + (item.category || '未分類') + '）').join('\n') +
        (links.length > 12 ? '\nほか ' + (links.length-12) + ' 件あります。' : '') +
        '\n\n※これは取得済みのリンク名で、リンク先の内容は確認できません。';
    }
    return null;
  }

  function answer(question, context) {
    const q = norm(question);
    if (!q) return null;
    // The question may contain a registered link title. Prioritize exact title lookup,
    // except for help about LINK CORE's own built-in features.
    if (!has(q, /リンク診断|リンク切れ|ゴミ箱|管理者専用チャット|newラベル/)) {
      const found = catalogAnswer(question, context);
      if (found) return {kind: 'catalog', answer: found, title: '登録リンク情報'};
    }
    for (const item of FAQ) if (item.test(q)) return {kind:'help',answer:item.answer,title:item.title,id:item.id};
    return null;
  }

  function reference(question) {
    const q = norm(question);
    const matches = FAQ.filter(item => item.test(q)).slice(0, 2);
    return matches.length ? matches.map(item => item.title + ': ' + item.answer).join('\n') : 'サイトの使い方については、具体的な機能名が分かる場合のみ回答してください。';
  }

  root.LinkCoreKnowledge = Object.freeze({answer,reference,faqCount:FAQ.length});
})(typeof window !== 'undefined' ? window : globalThis);