-- 既存版からの更新時のみ実行します。既存明細は変更・削除しません。
-- 追加済みの列はスキップするので、再実行しても安全です。
SET @sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='kb_cards' AND COLUMN_NAME='closing_day')=0,
 'ALTER TABLE kb_cards ADD closing_day TINYINT UNSIGNED NOT NULL DEFAULT 31', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
