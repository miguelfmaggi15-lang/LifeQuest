-- LIFE QUEST — migration 005: contas opcionais (guest continua sem conta)
USE lifequest;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(20) NOT NULL UNIQUE,
  pass_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_users_name (username)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token VARCHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_sessions_token (token)
) ENGINE=InnoDB;

SET @has_pu := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'lifequest' AND TABLE_NAME = 'players' AND COLUMN_NAME = 'user_id');
SET @sql3 := IF(@has_pu = 0,
  'ALTER TABLE players ADD COLUMN user_id INT NULL AFTER room_id, ADD CONSTRAINT fk_players_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL', 'SELECT 1');
PREPARE s3 FROM @sql3; EXECUTE s3; DEALLOCATE PREPARE s3;
