-- LIFE QUEST — migration 003: tamanho do tabuleiro (Clássico 40 / Maratona 60)
USE lifequest;

SET @has_rb := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'lifequest' AND TABLE_NAME = 'rooms' AND COLUMN_NAME = 'board_size');
SET @sql1 := IF(@has_rb = 0,
  'ALTER TABLE rooms ADD COLUMN board_size TINYINT NOT NULL DEFAULT 60 AFTER max_players', 'SELECT 1');
PREPARE s1 FROM @sql1; EXECUTE s1; DEALLOCATE PREPARE s1;

SET @has_gb := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'lifequest' AND TABLE_NAME = 'games' AND COLUMN_NAME = 'board_size');
SET @sql2 := IF(@has_gb = 0,
  'ALTER TABLE games ADD COLUMN board_size TINYINT NOT NULL DEFAULT 60 AFTER total_turns', 'SELECT 1');
PREPARE s2 FROM @sql2; EXECUTE s2; DEALLOCATE PREPARE s2;
