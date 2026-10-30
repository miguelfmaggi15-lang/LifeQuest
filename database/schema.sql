-- LIFE QUEST — Jogo da Vida Digital
-- Banco: MySQL / MariaDB (XAMPP)

CREATE DATABASE IF NOT EXISTS lifequest
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE lifequest;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS game_actions;
DROP TABLE IF EXISTS game_players;
DROP TABLE IF EXISTS games;
DROP TABLE IF EXISTS players;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS rank_global;
DROP TABLE IF EXISTS rank_mono;
DROP TABLE IF EXISTS rank_life;
DROP TABLE IF EXISTS mono_actions;
DROP TABLE IF EXISTS mono_offers;
DROP TABLE IF EXISTS mono_deeds;
DROP TABLE IF EXISTS mono_players;
DROP TABLE IF EXISTS mono_games;
DROP TABLE IF EXISTS mono_cards;
DROP TABLE IF EXISTS mono_tiles;
DROP TABLE IF EXISTS rooms;
DROP TABLE IF EXISTS cards;
DROP TABLE IF EXISTS careers;
DROP TABLE IF EXISTS houses;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE rooms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(6) NOT NULL UNIQUE,
  status ENUM('lobby','playing','finished') NOT NULL DEFAULT 'lobby',
  max_players TINYINT NOT NULL DEFAULT 4,
  host_player_id INT NULL,
  current_turn_player_id INT NULL,
  turn_number INT NOT NULL DEFAULT 0,
  state_version INT NOT NULL DEFAULT 1,
  board_size TINYINT NOT NULL DEFAULT 60,
  game_type VARCHAR(8) NOT NULL DEFAULT 'life',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP NULL,
  finished_at TIMESTAMP NULL,
  INDEX idx_rooms_code (code),
  INDEX idx_rooms_status (status)
) ENGINE=InnoDB;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(20) NOT NULL UNIQUE,
  pass_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_users_name (username)
) ENGINE=InnoDB;

CREATE TABLE sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token VARCHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_sessions_token (token)
) ENGINE=InnoDB;

CREATE TABLE players (
  id INT AUTO_INCREMENT PRIMARY KEY,
  room_id INT NOT NULL,
  user_id INT NULL,
  name VARCHAR(24) NOT NULL,
  avatar_color VARCHAR(16) NOT NULL DEFAULT '#6C5CE7',
  avatar_emoji VARCHAR(8) NOT NULL DEFAULT 'X',
  token VARCHAR(64) NOT NULL UNIQUE,
  is_host TINYINT(1) NOT NULL DEFAULT 0,
  is_connected TINYINT(1) NOT NULL DEFAULT 1,
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_players_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  CONSTRAINT fk_players_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_room_name (room_id, name),
  INDEX idx_players_room (room_id),
  INDEX idx_players_token (token)
) ENGINE=InnoDB;

CREATE TABLE games (
  id INT AUTO_INCREMENT PRIMARY KEY,
  room_id INT NOT NULL,
  status ENUM('playing','finished') NOT NULL DEFAULT 'playing',
  turn_index INT NOT NULL DEFAULT 0,
  current_player_id INT NULL,
  winner_player_id INT NULL,
  total_turns INT NOT NULL DEFAULT 0,
  board_size TINYINT NOT NULL DEFAULT 60,
  game_type VARCHAR(8) NOT NULL DEFAULT 'life',
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP NULL,
  CONSTRAINT fk_games_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  INDEX idx_games_room (room_id),
  INDEX idx_games_status (status)
) ENGINE=InnoDB;

CREATE TABLE careers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(32) NOT NULL UNIQUE,
  salary INT NOT NULL,
  bonus_desc VARCHAR(120) NOT NULL,
  color VARCHAR(16) NOT NULL DEFAULT '#0984E3',
  icon VARCHAR(8) NOT NULL DEFAULT 'B'
) ENGINE=InnoDB;

CREATE TABLE houses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(40) NOT NULL,
  price INT NOT NULL,
  sell_value INT NOT NULL,
  icon VARCHAR(8) NOT NULL DEFAULT 'H'
) ENGINE=InnoDB;

CREATE TABLE cards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kind ENUM('positivo','negativo','escolha','sorte') NOT NULL,
  title VARCHAR(80) NOT NULL,
  description VARCHAR(255) NOT NULL,
  effect_money INT NOT NULL DEFAULT 0,
  extra VARCHAR(80) NOT NULL DEFAULT ''
) ENGINE=InnoDB;

CREATE TABLE game_players (
  id INT AUTO_INCREMENT PRIMARY KEY,
  game_id INT NOT NULL,
  player_id INT NOT NULL,
  money INT NOT NULL DEFAULT 20000,
  position TINYINT NOT NULL DEFAULT 0,
  career_id INT NULL,
  salary INT NOT NULL DEFAULT 0,
  studied TINYINT(1) NOT NULL DEFAULT 0,
  children_count TINYINT NOT NULL DEFAULT 0,
  spouse TINYINT(1) NOT NULL DEFAULT 0,
  car_seats TINYINT NOT NULL DEFAULT 4,
  house_id INT NULL,
  finished TINYINT(1) NOT NULL DEFAULT 0,
  finish_order TINYINT NULL,
  final_wealth INT NULL,
  pending_type VARCHAR(24) NULL,
  pending_data TEXT NULL,
  last_spin TINYINT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_gp_game FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  CONSTRAINT fk_gp_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
  CONSTRAINT fk_gp_career FOREIGN KEY (career_id) REFERENCES careers(id) ON DELETE SET NULL,
  CONSTRAINT fk_gp_house FOREIGN KEY (house_id) REFERENCES houses(id) ON DELETE SET NULL,
  UNIQUE KEY uq_game_player (game_id, player_id),
  INDEX idx_gp_game (game_id)
) ENGINE=InnoDB;

CREATE TABLE game_actions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  game_id INT NOT NULL,
  player_id INT NULL,
  turn_number INT NOT NULL DEFAULT 0,
  action_type VARCHAR(24) NOT NULL,
  value INT NOT NULL DEFAULT 0,
  position TINYINT NULL,
  description VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ga_game FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  CONSTRAINT fk_ga_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE SET NULL,
  INDEX idx_ga_game (game_id, id),
  INDEX idx_ga_player (player_id)
) ENGINE=InnoDB;

ALTER TABLE rooms
  ADD CONSTRAINT fk_rooms_host FOREIGN KEY (host_player_id) REFERENCES players(id) ON DELETE SET NULL;

CREATE TABLE mono_tiles (
  tile TINYINT PRIMARY KEY,
  name VARCHAR(40) NOT NULL,
  kind ENUM('go','prop','station','utility','tax','sorte','cofre','jail','parking','stop') NOT NULL,
  color_group VARCHAR(16) NULL,
  price INT NOT NULL DEFAULT 0,
  rent0 INT NOT NULL DEFAULT 0,
  house_cost INT NOT NULL DEFAULT 0,
  mortgage INT NOT NULL DEFAULT 0,
  text VARCHAR(160) NOT NULL DEFAULT ''
) ENGINE=InnoDB;

CREATE TABLE mono_games (
  id INT AUTO_INCREMENT PRIMARY KEY,
  room_id INT NOT NULL,
  status ENUM('playing','finished') NOT NULL DEFAULT 'playing',
  round INT NOT NULL DEFAULT 1,
  turn_index INT NOT NULL DEFAULT 0,
  current_player_id INT NULL,
  winner_player_id INT NULL,
  jackpot INT NOT NULL DEFAULT 500,
  pending_json TEXT NULL,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP NULL,
  CONSTRAINT fk_mg_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  INDEX idx_mg_room (room_id)
) ENGINE=InnoDB;

CREATE TABLE mono_players (
  id INT AUTO_INCREMENT PRIMARY KEY,
  game_id INT NOT NULL,
  player_id INT NOT NULL,
  money INT NOT NULL DEFAULT 15000,
  position TINYINT NOT NULL DEFAULT 0,
  in_jail TINYINT NOT NULL DEFAULT 0,
  jail_free TINYINT NOT NULL DEFAULT 0,
  bankrupt TINYINT(1) NOT NULL DEFAULT 0,
  last_dice TINYINT NOT NULL DEFAULT 0,
  pending_type VARCHAR(24) NULL,
  pending_data TEXT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_mp_game FOREIGN KEY (game_id) REFERENCES mono_games(id) ON DELETE CASCADE,
  CONSTRAINT fk_mp_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
  UNIQUE KEY uq_mono_game_player (game_id, player_id),
  INDEX idx_mp_game (game_id)
) ENGINE=InnoDB;

CREATE TABLE mono_deeds (
  id INT AUTO_INCREMENT PRIMARY KEY,
  game_id INT NOT NULL,
  tile TINYINT NOT NULL,
  owner_player_id INT NULL,
  houses TINYINT NOT NULL DEFAULT 0,
  mortgaged TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT fk_md_game FOREIGN KEY (game_id) REFERENCES mono_games(id) ON DELETE CASCADE,
  CONSTRAINT fk_md_owner FOREIGN KEY (owner_player_id) REFERENCES players(id) ON DELETE SET NULL,
  UNIQUE KEY uq_mono_deed (game_id, tile),
  INDEX idx_md_game (game_id)
) ENGINE=InnoDB;

CREATE TABLE mono_offers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  game_id INT NOT NULL,
  from_player_id INT NOT NULL,
  to_player_id INT NOT NULL,
  give_tiles VARCHAR(80) NOT NULL DEFAULT '',
  give_money INT NOT NULL DEFAULT 0,
  want_tiles VARCHAR(80) NOT NULL DEFAULT '',
  want_money INT NOT NULL DEFAULT 0,
  status ENUM('pending','accepted','declined','expired') NOT NULL DEFAULT 'pending',
  expires_turn INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_mo_game FOREIGN KEY (game_id) REFERENCES mono_games(id) ON DELETE CASCADE,
  INDEX idx_mo_game (game_id, status)
) ENGINE=InnoDB;

CREATE TABLE mono_actions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  game_id INT NOT NULL,
  player_id INT NULL,
  turn_number INT NOT NULL DEFAULT 0,
  action_type VARCHAR(24) NOT NULL,
  value INT NOT NULL DEFAULT 0,
  position TINYINT NULL,
  description VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ma_game FOREIGN KEY (game_id) REFERENCES mono_games(id) ON DELETE CASCADE,
  INDEX idx_ma_game (game_id, id)
) ENGINE=InnoDB;

CREATE TABLE rank_life (
  user_id INT PRIMARY KEY,
  total_wealth BIGINT NOT NULL DEFAULT 0,
  partidas INT NOT NULL DEFAULT 0,
  vitorias INT NOT NULL DEFAULT 0,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_rl_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE rank_mono (
  user_id INT PRIMARY KEY,
  total_wealth BIGINT NOT NULL DEFAULT 0,
  partidas INT NOT NULL DEFAULT 0,
  vitorias INT NOT NULL DEFAULT 0,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_rm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE rank_global (
  user_id INT PRIMARY KEY,
  total_wealth BIGINT NOT NULL DEFAULT 0,
  partidas INT NOT NULL DEFAULT 0,
  vitorias INT NOT NULL DEFAULT 0,
  atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_rg_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE mono_cards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  deck ENUM('sorte','cofre') NOT NULL,
  title VARCHAR(80) NOT NULL,
  description VARCHAR(255) NOT NULL,
  effect_money INT NOT NULL DEFAULT 0,
  effect VARCHAR(24) NOT NULL DEFAULT ''
) ENGINE=InnoDB;

INSERT INTO careers (name, salary, bonus_desc, color, icon) VALUES
('Desenvolvedor', 12000, 'Bonus +4000 em casas SORTE', '#0984E3', 'D'),
('Medica', 15000, 'Paga metade em eventos negativos', '#E84393', 'M'),
('Designer', 10000, 'Recebe +2000 em PAYDAY', '#6C5CE7', 'D'),
('Engenheira', 13000, 'Desconto de 3000 em casas', '#00B894', 'E'),
('Chef', 9000, 'Ganha 3000 extra em FAMILIA', '#E17055', 'C'),
('Professora', 8000, 'Estudo custa metade', '#B7791F', 'P'),
('Fotografa', 8500, 'SORTE rende +1500 extra', '#00CEC9', 'F'),
('Empresaria', 11000, 'Investimentos rendem +50%', '#D63031', 'E');

INSERT INTO houses (name, price, sell_value, icon) VALUES
('Chale Aconchego', 30000, 36000, 'H'),
('Apartamento Mirante', 55000, 66000, 'A'),
('Casa Jardim Luz', 80000, 98000, 'C'),
('Mansao Horizonte', 120000, 150000, 'M');

INSERT INTO cards (kind, title, description, effect_money, extra) VALUES
('positivo','Projeto brilhou','Seu projeto foi um sucesso. Receba $20.000.', 20000, ''),
('positivo','Freela premiado','Um cliente amou seu trabalho. Receba $12.000.', 12000, ''),
('positivo','Bonus criativo','Sua ideia economizou tempo. Receba $8.000.', 8000, ''),
('positivo','Feira de talentos','Voce venceu uma mostra local. Receba $10.000.', 10000, ''),
('negativo','Manutencao inesperada','O carro quebrou. Pague $8.000.', -8000, ''),
('negativo','Conta alta de luz','A fatura veio salgada. Pague $5.000.', -5000, ''),
('negativo','Multa distraida','Estacionou errado. Pague $4.000.', -4000, ''),
('negativo','Celular quebrou','Tela trincou. Pague $6.000.', -6000, ''),
('sorte','Sorte grande','Dia de sorte! Receba $15.000.', 15000, ''),
('sorte','Achado na rua','Voce devolveu carteira e ganhou recompensa $5.000.', 5000, ''),
('sorte','Rifa da sorte','Ganhou a rifa do bairro. Receba $9.000.', 9000, ''),
('positivo','Promocao relampago','Chefe reconheceu seu esforco. Receba $14.000.', 14000, ''),
('negativo','Chuva estragou tudo','Evento cancelou. Pague $7.000.', -7000, ''),
('positivo','Curso concluido','Certificado novo rendeu bonus. Receba $7.000.', 7000, ''),
('sorte','Moeda da sorte','Cara ou coroa a seu favor. Receba $6.000.', 6000, ''),
('negativo','Assinatura esquecida','Anuidade cobrada. Pague $3.000.', -3000, '');

REPLACE INTO mono_tiles (tile,name,kind,color_group,price,rent0,house_cost,mortgage,text) VALUES
(0,'Partida','go',NULL,0,0,0,0,'Salário $2.000 por volta'),
(1,'Vila Aurora','prop','vilas',600,50,300,300,''),
(2,'Cofre Comunitário','cofre',NULL,0,0,0,0,''),
(3,'Vila Brisa','prop','vilas',800,60,400,400,''),
(4,'Imposto Verde','tax',NULL,1000,0,0,0,'Pague $1.000 ao jackpot'),
(5,'Vila Sol','prop','vilas',1000,80,500,500,''),
(6,'Estação Norte','station',NULL,2000,250,0,1000,''),
(7,'Bairro Lirio','prop','bairros',1200,100,600,600,''),
(8,'Sorte Grande','sorte',NULL,0,0,0,0,''),
(9,'Bairro Ipê','prop','bairros',1400,110,700,700,''),
(10,'Visita na Prisão','stop',NULL,0,0,0,0,'Só de passagem'),
(11,'Bairro Jasmim','prop','bairros',1600,130,800,800,''),
(12,'Luz e Cia','utility',NULL,1500,300,0,750,''),
(13,'Avenida Central','prop','avenidas',1800,150,900,900,''),
(14,'Avenida Parque','prop','avenidas',2000,160,1000,1000,''),
(15,'Estação Sul','station',NULL,2000,250,0,1000,''),
(16,'Avenida Lago','prop','avenidas',2200,180,1100,1100,''),
(17,'Cofre da Praça','cofre',NULL,0,0,0,0,''),
(18,'Rua do Comércio','prop','centro',2400,200,1200,1200,''),
(19,'Rua das Flores','prop','centro',2600,220,1300,1300,''),
(20,'Estacionamento Livre','parking',NULL,0,0,0,0,'Leve o jackpot!'),
(21,'Rua do Porto','prop','centro',2800,240,1400,1400,''),
(22,'Sorte do Bairro','sorte',NULL,0,0,0,0,''),
(23,'Orla Maré','prop','orla',3000,260,1500,1500,''),
(24,'Orla Sol','prop','orla',3400,300,1700,1700,''),
(25,'Água e Vapor','utility',NULL,1500,300,0,750,''),
(26,'Orla Palms','prop','orla',3800,340,1900,1900,''),
(27,'Vá para a Prisão','jail',NULL,0,0,0,0,'Direto para a prisão!'),
(28,'Metrópole Alfa','prop','metro',4000,380,2000,2000,''),
(29,'Metrópole Beta','prop','metro',4400,420,2200,2200,''),
(30,'Taxa de Luxo','tax',NULL,1000,0,0,0,'Pague $1.000 ao jackpot'),
(31,'Metrópole Gama','prop','metro',4800,480,2400,2400,'');

REPLACE INTO mono_cards (deck,title,description,effect_money,effect) VALUES
('sorte','Achado na feira','Vendeu artesanato. Receba $800.',800,''),
('sorte','Multa de trânsito','Avançou o sinal. Pague $600.',-600,''),
('sorte','Aniversário','Amigos te presentearam. Receba $500.',500,''),
('sorte','Reforma urgente','Pague $400 por imóvel (máx. $1.200).',0,'repair'),
('sorte','Vá para a Partida','Ande até a Partida e receba o salário.',0,'goto_go'),
('sorte','Prisão!','Vá direto para a prisão.',0,'go_jail'),
('sorte','Saída livre','Guarde para sair da prisão de graça.',0,'jail_free'),
('sorte','Herança','Tia distante deixou $1.500.',1500,''),
('sorte','Apagão','Conta de luz alta. Pague $700.',-700,''),
('sorte','Prêmio de beleza','Seu jardim venceu. Receba $900.',900,''),
('sorte','Avançe 3 casas','Ande 3 casas agora.',0,'fwd3'),
('sorte','Volte 3 casas','Volte 3 casas agora.',0,'back3'),
('cofre','Restituição','Receba $1.000 de restituição.',1000,''),
('cofre','Mesada','Receba $600.',600,''),
('cofre','Consulta médica','Pague $400.',-400,''),
('cofre','Bolsa de estudos','Receba $700.',700,''),
('cofre','Anuidade do clube','Pague $500.',-500,''),
('cofre','Hora extra','Receba $800.',800,''),
('cofre','Presente','Receba $300 de cada jogador.',0,'gift'),
('cofre','Saída livre','Guarde para sair da prisão de graça.',0,'jail_free');