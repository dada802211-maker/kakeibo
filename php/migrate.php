<?php
declare(strict_types=1);
// 既存のカード・購入明細を残したまま、新しい設定列だけを追加します。
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/bootstrap.php';
try {
    $columns = array_column(query('SHOW COLUMNS FROM kb_cards')->fetchAll(), 'Field');
    if (!in_array('closing_day', $columns, true)) db()->exec('ALTER TABLE kb_cards ADD closing_day TINYINT UNSIGNED NOT NULL DEFAULT 31');
    echo "Card billing settings migrated successfully.\n";
} catch (Throwable $e) { fwrite(STDERR, $e->getMessage() . "\n"); exit(1); }
