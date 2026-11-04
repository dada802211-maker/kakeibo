<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/billing.php';
date_default_timezone_set('Asia/Tokyo');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
// セッションCookieはJavaScriptからアクセスできないようにします。
ini_set('session.use_strict_mode', '1');
session_name('kakeibo_session');
session_set_cookie_params(['lifetime'=>0, 'path'=>rtrim(dirname(dirname($_SERVER['SCRIPT_NAME'])), '/') . '/', 'httponly'=>true, 'secure'=>!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off', 'samesite'=>'Strict']);
session_start();
$_SESSION['csrf'] ??= bin2hex(random_bytes(32));
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
try {
    if (!in_array($method, ['GET', 'POST'], true)) respond(['error'=>'このメソッドは使用できません。'], 405);
    $data = [];
    if ($method === 'POST') {
        // ログインを含むすべての更新をCSRFトークンで検証します。
        if (!hash_equals($_SESSION['csrf'], $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) respond(['error'=>'画面を再読み込みしてください。'], 403);
        try { $data = json_decode(file_get_contents('php://input'), true, 32, JSON_THROW_ON_ERROR); }
        catch (JsonException) { respond(['error'=>'入力形式が正しくありません。'], 400); }
        if (!is_array($data)) respond(['error'=>'入力形式が正しくありません。'], 400);
    }
    $account = query('SELECT * FROM kb_account WHERE id=1')->fetch();
    $authenticated = $account && isset($_SESSION['version'], $_SESSION['last_seen']) && $_SESSION['version'] === (int)$account['auth_version'] && time() - $_SESSION['last_seen'] < 7200;
    if ($authenticated) $_SESSION['last_seen'] = time();
    if ($action === 'session' && $method === 'GET') respond(['authenticated'=>(bool)$authenticated, 'csrf'=>$_SESSION['csrf'], 'installed'=>(bool)$account]);
    if ($action === 'login' && $method === 'POST') {
        if (!$account) respond(['error'=>'READMEの初期設定を実行してください。'], 503);
        // DBに失敗回数を保持するため、Cookieを消しても試行制限は解除されません。
        db()->beginTransaction();
        $account = query('SELECT * FROM kb_account WHERE id=1 FOR UPDATE')->fetch();
        if ($account['locked_until'] && strtotime($account['locked_until']) > time()) {
            db()->commit(); respond(['error'=>'試行回数の上限です。15分後にお試しください。'], 429);
        }
        if (!is_string($data['password'] ?? null) || !password_verify($data['password'], $account['password_hash'])) {
            $attempts = $account['locked_until'] ? 1 : (int)$account['failed_attempts'] + 1;
            query('UPDATE kb_account SET failed_attempts=?, locked_until=? WHERE id=1', [$attempts, $attempts >= 5 ? date('Y-m-d H:i:s', time()+900) : null]);
            db()->commit(); respond(['error'=>'パスワードが正しくありません。'], 401);
        }
        query('UPDATE kb_account SET failed_attempts=0, locked_until=NULL WHERE id=1');
        db()->commit();
        session_regenerate_id(true);
        $_SESSION['version'] = (int)$account['auth_version'];
        $_SESSION['last_seen'] = time();
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        respond(['csrf'=>$_SESSION['csrf']]);
    }
    if (!$authenticated) respond(['error'=>'ログインしてください。'], 401);
    if ($action === 'logout' && $method === 'POST') { $_SESSION=[]; session_destroy(); respond(['ok'=>true]); }
    if ($action === 'password' && $method === 'POST') {
        $new = $data['password'] ?? '';
        if (!is_string($data['current'] ?? null) || !password_verify($data['current'], $account['password_hash'])) respond(['error'=>'現在のパスワードが正しくありません。'], 422);
        if (!is_string($new) || strlen($new)<12 || strlen($new)>72) respond(['error'=>'新しいパスワードは12〜72バイトで入力してください。'], 422);
        query('UPDATE kb_account SET password_hash=?, auth_version=auth_version+1 WHERE id=1', [password_hash($new, PASSWORD_DEFAULT)]);
        $_SESSION['version'] = (int)$account['auth_version']+1;
        session_regenerate_id(true);
        respond(['ok'=>true]);
    }
    if ($action === 'masters') {
        if ($method === 'GET') respond(['cards'=>query('SELECT * FROM kb_cards ORDER BY id')->fetchAll(), 'items'=>query('SELECT * FROM kb_items ORDER BY id')->fetchAll()]);
        $table = match($data['kind'] ?? '') { 'cards'=>'kb_cards', 'items'=>'kb_items', default=>null };
        $name = is_string($data['name'] ?? null) ? trim($data['name']) : '';
        if (!$table || $name === '' || mb_strlen($name)>100) respond(['error'=>'名前を1〜100文字で入力してください。'], 422);
        if ($table === 'kb_cards') {
            $closing = filter_var($data['closing_day'] ?? null, FILTER_VALIDATE_INT);
            if ($closing === false || $closing < 1 || $closing > 31) respond(['error'=>'締め日を選択してください。'], 422);
            if (isset($data['id'])) {
                query('UPDATE kb_cards SET name=?,closing_day=? WHERE id=?',[$name,$closing,$data['id']]);
                respond(['ok'=>true]);
            }
            query('INSERT INTO kb_cards (name,closing_day) VALUES (?,?)',[$name,$closing]);
            respond(['id'=>(int)db()->lastInsertId()],201);
        }
        // テーブル名は固定値から選び、ユーザー入力をSQLへ連結しません。
        if (isset($data['id'])) {
            query("UPDATE $table SET name=? WHERE id=?", [$name, $data['id']]);
            respond(['ok'=>true]);
        }
        query("INSERT INTO $table (name) VALUES (?)", [$name]);
        respond(['id'=>(int)db()->lastInsertId()], 201);
    }
    if ($action === 'expenses' && $method === 'POST') {
        $id = filter_var($data['id'] ?? 0, FILTER_VALIDATE_INT);
        if (($data['operation'] ?? '') === 'delete') {
            if (!$id || $id<1) respond(['error'=>'明細番号が正しくありません。'],422);
            query('DELETE FROM kb_expenses WHERE id=?', [$id]); respond(['ok'=>true]);
        }
        $date = $data['purchased_on'] ?? '';
        $parsed = is_string($date) ? DateTimeImmutable::createFromFormat('!Y-m-d', $date) : false;
        $amount = filter_var($data['amount'] ?? null, FILTER_VALIDATE_INT);
        $card = filter_var($data['card_id'] ?? null, FILTER_VALIDATE_INT);
        $item = filter_var($data['item_id'] ?? null, FILTER_VALIDATE_INT);
        $note = $data['note'] ?? '';
        if (!$parsed || $parsed->format('Y-m-d') !== $date || $date<'1000-01-01' || $date>'9999-12-31' || !$amount || $amount<1 || $amount>999999999 || !$card || !$item || !is_string($note) || mb_strlen($note)>500) respond(['error'=>'購入日・番号・金額（1〜999,999,999円）・メモを確認してください。'],422);
        $cardSettings = query('SELECT * FROM kb_cards WHERE id=?',[$card])->fetch();
        if (!$cardSettings || !query('SELECT id FROM kb_items WHERE id=?',[$item])->fetch()) respond(['error'=>'未登録の番号です。「カード・項目管理」で登録してください。'],422);
        $values = [$date,$card,$item,$amount,$note];
        if ($id) { $values[]=$id; query('UPDATE kb_expenses SET purchased_on=?,card_id=?,item_id=?,amount=?,note=? WHERE id=?',$values); }
        else query('INSERT INTO kb_expenses (purchased_on,card_id,item_id,amount,note) VALUES (?,?,?,?,?)',$values);
        respond(['ok'=>true, 'billing_month'=>billingMonth($date,(int)$cardSettings['closing_day'])]);
    }
    if ($action === 'dashboard' && $method === 'GET') {
        $month = $_GET['month'] ?? date('Y-m');
        if (!preg_match('/^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/D', $month)) respond(['error'=>'年月が正しくありません。'],422);
        $cards = query('SELECT * FROM kb_cards ORDER BY id')->fetchAll();
        $rows = [];
        foreach ($cards as &$card) {
            $period = billingPeriod($month,(int)$card['closing_day']);
            $cardRows = query('SELECT e.*, c.name card_name, i.name item_name FROM kb_expenses e JOIN kb_cards c ON e.card_id=c.id JOIN kb_items i ON e.item_id=i.id WHERE e.card_id=? AND purchased_on>=? AND purchased_on<=?',[$card['id'],$period['period_start'],$period['period_end']])->fetchAll();
            $card = array_merge($card,$period,['total'=>array_sum(array_column($cardRows,'amount')),'count'=>count($cardRows)]);
            array_push($rows,...$cardRows);
        }
        unset($card);
        usort($rows,fn($a,$b)=>strcmp($b['purchased_on'],$a['purchased_on']) ?: $b['id'] <=> $a['id']);
        respond(['expenses'=>$rows,'summary'=>$cards]);
    }
    respond(['error'=>'操作が見つかりません。'],404);
} catch (Throwable $e) {
    // 例外の詳細や接続情報をブラウザへ送信しません。
    error_log((string)$e);
    if ($e instanceof PDOException && $e->getCode() === '23000') respond(['error'=>'同じ名前が登録済みか、関連データが存在します。'],409);
    respond(['error'=>'サーバーに接続できません。DB設定・初期設定を確認してください。'],500);
}
