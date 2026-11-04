<?php
declare(strict_types=1);
// Web経由では実行できない初期設定コマンドです。標準入力からパスワードを受け取ります。
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/bootstrap.php';
try {
    db()->exec(file_get_contents(__DIR__ . '/schema.sql'));
    if (query('SELECT id FROM kb_account WHERE id=1')->fetch()) {
        fwrite(STDOUT, "Already installed. Password was not changed.\n"); exit;
    }
    fwrite(STDOUT, "Initial password (12+ characters): ");
    $password = trim((string) fgets(STDIN));
    if (strlen($password) < 12 || strlen($password) > 72) throw new RuntimeException('Use 12 to 72 bytes.');
    query('INSERT INTO kb_account (id,password_hash) VALUES (1,?)', [password_hash($password, PASSWORD_DEFAULT)]);
    fwrite(STDOUT, "Installed successfully.\n");
} catch (Throwable $e) { fwrite(STDERR, $e->getMessage() . "\n"); exit(1); }
