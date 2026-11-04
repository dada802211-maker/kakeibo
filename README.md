# 家計ノート — React / PHP / MySQL 家計簿

個人用のカード支出管理アプリです。ユーザー登録はなく、1つのパスワードでログインします。

## できること

- 購入日、カード管理番号、購入項目番号、金額、メモを入力
- クレジットカードごとの月別合計と明細を表示（**カードごとの締め月**で集計）
- カードや購入項目を追加すると管理番号を自動採番。参照表のクリック入力も可能
- 明細の編集・削除、カード別の明細絞り込み、カード・項目の名称変更
- パスワード変更、2時間無操作でログイン期限切れ、5回失敗で15分間ログイン制限
- スマートフォン向け表示

カード管理番号はアプリ内の番号です。実際のカード番号・有効期限・セキュリティコードは保存しないでください。引き落とし日・分割払いの計算、収入管理は対象外です。金額は1〜999,999,999円の整数です。

## 動作環境

- PHP 8.3以降（PDO MySQL、mbstring、session）
- MySQL 8以降、Apache 2.4（mod_rewrite、AllowOverride有効）
- 開発・ビルド時のみ Node.js 22.12以降とnpm
- 本番サーバーにNode.jsは不要です

## ローカルで使う（Laragon）

配置先は `C:\laragon\www\kakeibo` です。LaragonからApacheとMySQLを起動し、次のURLを開きます。

- `http://localhost/kakeibo/`
- Laragonの自動仮想ホストを有効にして再読み込みした場合は `http://kakeibo.test/`

今回の初期設定では、既存のデータベース `kakeibo`、ユーザー `root`、空のDBパスワードを使います。ログインパスワードはDBパスワードとは別です。発行された初期ログインパスワードで入り、「パスワード設定」で変更してください。

### 初めての記録

1. 「カード・項目管理」でカード名（例：楽天カード）を登録します。
2. カードの締め日を設定します（初期値は月末）。同じ画面で購入項目（例：食料品、日用品、交通費）を登録します。
3. それぞれに付いた番号を確認します。番号は種類ごとに1から自動採番されます。
4. 「月別の家計簿」で購入日・管理番号・金額を入力し、「支出を記録する」を押します。
5. 表示する月を切り替えると、その月のカード別合計と明細が表示されます。

登録がない月でも登録済みカードは0円で表示されます。明細のカード絞り込みは一覧だけに適用し、上部の集計は月全体を表示します。名称・締め日の変更は過去の明細にも反映します。履歴を保護するため、カード・項目の削除機能は設けていません。

## 別の環境での初期設定

### カードごとの締め日

「カード・項目管理」→カードの「設定を編集」から、締め日を1〜30日または月末に変更できます。新規カードも登録時に指定できます。

表示月は**締め月**です。例えば2026年11月を表示した場合：

| 締め日 | 集計対象の購入日 |
| --- | --- |
| 15日 | 2026年10月16日〜11月15日 |
| 25日 | 2026年10月26日〜11月25日 |
| 月末 | 2026年11月1日〜11月30日 |

締め日当日はその月に含み、翌日から次の月に含みます。29・30日が存在しない月は月末を締め日とします。各カードの集計欄に実際の対象期間を表示します。登録・編集後は、その明細の締め月へ自動的に移動します。

締め日の変更は過去の月にも反映し、既存の購入日・金額は変更しません。カード会社の売上処理の遅れや締め日変更の履歴は自動補正しません。

### 既存版からの更新

既存データをバックアップし、新しい配布物を配置した後、次を実行してください。接続設定 `php/config.local.php` はそのまま残します。

```powershell
php php/migrate.php
```

SSHが使えない場合は、phpMyAdminで `php/migration-billing.sql` をインポートしてください。どちらも再実行可能です。カードに `closing_day` 列を追加するだけで、明細やログイン情報を削除しません。既存カードは月末締めになり、変更するまで以前の購入月集計と同じ結果になります。今回のローカル環境には移行を実行済みです。

### 新規インストール

1. 空のMySQLデータベースを用意します（既存データを削除しないでください）。
2. `php/config.example.php` を `php/config.local.php` にコピーし、ホスト・ポート・DB名・ユーザー・パスワードを設定します。
3. プロジェクト直下で以下を実行し、12〜72バイトのログインパスワードを入力します。

```powershell
& 'C:\laragon\bin\php\php-8.3.30-Win32-vs16-x64\php.exe' php/install.php
```

Linux/SSHでは `php php/install.php` です。CLIの入力は画面に表示される場合があるので、周囲に注意してください。コマンドライン引数やファイルに平文パスワードを保存しないでください。

インストーラーは `kb_` 接頭辞のテーブルだけを作成します。既存のアカウントがある場合はパスワードを変更しません。ユーザー登録画面はありません。

## 開発

```powershell
cd C:\laragon\www\kakeibo\front
npm ci
npm run dev
```

Viteの表示URLを開きます。開発時の `/php` リクエストは `http://kakeibo.test` に転送します。仮想ホストを使わない場合は、`front/vite.config.ts` のproxyを次のように変更してください。

```ts
server: { proxy: { '/php': { target: 'http://localhost', rewrite: path => '/kakeibo' + path, cookiePathRewrite: '/' } } }
```

通常のLaragon表示はビルド済みのルート `index.html` を使います。ソース変更後に更新する場合は次の操作で反映します。

```powershell
cd C:\laragon\www\kakeibo\front
npm run build
Copy-Item dist\* ..\ -Recurse -Force
```

## 日付別releaseを作る

```powershell
cd C:\laragon\www\kakeibo
node scripts/release.mjs
```

TypeScriptチェックとViteのビルドを実行し、`release/YYYY-MM-DD/` にアップロード用一式を作成します。日付は日本時間です。同日の再実行は `YYYY-MM-DD-2` などの新しいフォルダになり、古い配布物は上書きしません。

配布物にはReactのビルド済みファイル、PHP、SQL、README、`.htaccess` が入ります。`node_modules`、開発ソース、ローカルのDB接続設定、ログイン情報、家計簿データは含みません。

## レンタルサーバーへデプロイ

1. サーバー側でMySQLデータベースと専用ユーザーを作成します。**rootや空パスワードは本番で使用しません。**
2. 必要なら既存DBをバックアップします。
3. 日付別releaseフォルダの**中身**を公開ディレクトリ（またはそのサブフォルダ）へアップロードします。`.htaccess` も含めます。
4. サーバー上の `php/config.local.php` に本番のDB接続情報を設定します。既存環境を更新する場合、このファイルを上書きしないでください。
5. SSHを使える場合は `php php/install.php` で初期設定します。
6. HTTPSを有効にし、サーバーの管理パネルでHTTPからHTTPSへのリダイレクトを設定します。
7. ログイン、カード・項目登録、明細保存、月別集計を確認します。`/php/schema.sql` と `/front/package.json` が公開されていないことも確認します。

**SSHが使えない場合**：サーバーのphpMyAdminで `php/schema.sql` をインポートします。ローカルのLaragonターミナルで次を実行し、標準入力で新しいパスワードを渡してハッシュを生成します。

```powershell
php -r '$p=trim(fgets(STDIN)); if(strlen($p)<12 || strlen($p)>72) exit(1); echo password_hash($p, PASSWORD_DEFAULT), PHP_EOL;'
```

phpMyAdminのSQL画面で、生成したハッシュを置き換えて次を実行します。

```sql
INSERT INTO kb_account (id, password_hash) VALUES (1, 'ここに生成したハッシュ');
```

既存データを移行する場合はローカルのMySQLから `kb_account`、`kb_cards`、`kb_items`、`kb_expenses` をエクスポートし、本番DBへインポートしてください。この場合はアカウントの新規INSERTは不要です。DBバックアップは公開ディレクトリに置かないでください。

Apache以外では `.htaccess` が効きません。Nginx等では、`php/api.php` 以外の `php/` 内ファイルと、`front/`、`scripts/`、`release/`、`.git/`、README等へのHTTPアクセスをサーバー設定で拒否してください。

## パスワードを忘れた場合

上記のハッシュ生成コマンドで新しいハッシュを作り、DB管理画面で次を実行します。

```sql
UPDATE kb_account
SET password_hash='ここに新しいハッシュ', auth_version=auth_version+1,
    failed_attempts=0, locked_until=NULL
WHERE id=1;
```

古いログインセッションも無効になります。平文パスワードをSQLへ入れないでください。

## 構成と実装

```text
kakeibo/
  index.html, assets/       Laragonで表示するビルド済み画面
  front/src/App.tsx        ログイン・入力・集計・管理画面
  front/src/index.css      レスポンシブデザイン
  php/api.php              JSON API、認証、入力検証、集計
  php/bootstrap.php        PDO接続と共通処理
  php/schema.sql           テーブル定義
  php/install.php          CLI限定の初期設定
  php/config.example.php   接続設定のひな形
  php/config.local.php     環境固有の接続設定（配布・Git対象外）
  scripts/release.mjs       日付別配布物生成
  release/YYYY-MM-DD/       レンタルサーバー向け配布物
```

認証はPHPセッションと `password_hash` / `password_verify` を使用します。更新APIはCSRFトークンを必須にし、SQLはPDOのプリペアドステートメントで実行します。金額は整数で保存し、集計時の小数誤差を避けます。月次集計はカードごとの「前回締め日の翌日〜表示月の締め日」を購入日の範囲検索で抽出します。

## トラブル時

- 接続エラー：LaragonのMySQL起動、ポート、DB名、接続設定、PDO MySQLの有効化を確認します。
- ログインできない：初期設定とパスワードを確認します。5回失敗した場合は15分待ちます。
- 403：画面を再読み込みします。ApacheでAllowOverrideとmod_rewriteを確認します。
- 真っ白な画面：日付別releaseの中身を配置しているか、`assets/` がアップロードされているか確認します。
- PHPの詳細エラーは画面へ返さずサーバーログに記録します。ログとDBバックアップは定期的に管理してください。

## Excel用CSV出力

「月別の家計簿」の「支出の明細」にある「CSV出力（Excel用）」ボタンで、表示中の明細を保存できます。表示している締め月とカード絞り込みが適用され、0件の場合は出力ボタンが無効になります。

出力列：集計月（締め月）、明細番号、購入日、カード管理番号、カード名、購入項目番号、購入項目名、金額（円）、メモ。金額は円記号や桁区切りなしの数値です。UTF-8 BOM付き・CRLF改行のCSVで、日本語、カンマ、引用符、改行を含むメモに対応します。Excelで数式として解釈される可能性のある文字列には、保護用のアポストロフィを付けます。CSVは明細の出力用で、DB復元用バックアップではありません。
