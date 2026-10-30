-- LIFE QUEST — migration 002: esposa + carro de 6 lugares
-- Roda em banco existente sem perder partidas (valores padrao seguros).
USE lifequest;

SET @has_spouse := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'lifequest' AND TABLE_NAME = 'game_players' AND COLUMN_NAME = 'spouse');
SET @sql1 := IF(@has_spouse = 0,
  'ALTER TABLE game_players ADD COLUMN spouse TINYINT(1) NOT NULL DEFAULT 0 AFTER children_count', 'SELECT 1');
PREPARE s1 FROM @sql1; EXECUTE s1; DEALLOCATE PREPARE s1;

SET @has_seats := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'lifequest' AND TABLE_NAME = 'game_players' AND COLUMN_NAME = 'car_seats');
SET @sql2 := IF(@has_seats = 0,
  'ALTER TABLE game_players ADD COLUMN car_seats TINYINT NOT NULL DEFAULT 4 AFTER spouse', 'SELECT 1');
PREPARE s2 FROM @sql2; EXECUTE s2; DEALLOCATE PREPARE s2;
