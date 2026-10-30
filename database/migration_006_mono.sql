-- LIFE QUEST — migration 006: Banco Imobiliário (tabelas + 32 casas + cartas)
USE lifequest;

CREATE TABLE IF NOT EXISTS mono_tiles (
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

CREATE TABLE IF NOT EXISTS mono_games (
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

CREATE TABLE IF NOT EXISTS mono_players (
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

CREATE TABLE IF NOT EXISTS mono_deeds (
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

CREATE TABLE IF NOT EXISTS mono_offers (
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

CREATE TABLE IF NOT EXISTS mono_actions (
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

CREATE TABLE IF NOT EXISTS mono_cards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  deck ENUM('sorte','cofre') NOT NULL,
  title VARCHAR(80) NOT NULL,
  description VARCHAR(255) NOT NULL,
  effect_money INT NOT NULL DEFAULT 0,
  effect VARCHAR(24) NOT NULL DEFAULT ''
) ENGINE=InnoDB;

-- Tabuleiro: 32 casas (nomes próprios originais)
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
