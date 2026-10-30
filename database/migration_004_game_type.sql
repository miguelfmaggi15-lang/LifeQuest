-- LIFE QUEST — migration 004: tipo de jogo por sala/partida
USE lifequest;

SET @has_rg := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'lifequest' AND TABLE_NAME = 'rooms' AND COLUMN_NAME = 'game_type');
SET @sql1 := IF(@has_rg = 0,
  'ALTER TABLE rooms ADD COLUMN game_type VARCHAR(8) NOT NULL DEFAULT ''life'' AFTER board_size', 'SELECT 1');
PREPARE s1 FROM @sql1; EXECUTE s1; DEALLOCATE PREPARE s1;

SET @has_gg := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'lifequest' AND TABLE_NAME = 'games' AND COLUMN_NAME = 'game_type');
SET @sql2 := IF(@has_gg = 0,
  'ALTER TABLE games ADD COLUMN game_type VARCHAR(8) NOT NULL DEFAULT ''life'' AFTER board_size', 'SELECT 1');
PREPARE s2 FROM @sql2; EXECUTE s2; DEALLOCATE PREPARE s2;
