<?php
// LIFE QUEST — motor do jogo (regras validadas no servidor)
declare(strict_types=1);

const BOARD_SIZE = 60; // Maratona: posicoes 0..59 (Clássico usa 0..39)
const START_MONEY = 20000;

function board_size_valid($v): int {
  return ((int)$v === 40) ? 40 : 60;
}

function tile_at(int $pos, int $size = 60): array {
  // Retorna [tipo, rotulo]. Na Clássica (40) a casa 39 vira a Chegada.
  if ($size !== 60 && $pos === 39) return ['aposentadoria', 'Chegada!'];
  static $map = [
    0 => ['inicio', 'Inicio da Vida'],
    1 => ['evento', 'Evento surpresa'],
    2 => ['carreira', 'Escolha de Carreira'],
    3 => ['payday', 'Dia de pagamento'],
    4 => ['evento', 'Evento surpresa'],
    5 => ['payday', 'Dia de pagamento'],
    6 => ['familia', 'Familia cresce'],
    7 => ['carreira', 'Nova oportunidade'],
    8 => ['imposto', 'Impostos'],
    9 => ['evento', 'Evento surpresa'],
    10 => ['escolha', 'Estudar ou Trabalhar?'],
    11 => ['payday', 'Dia de pagamento'],
    12 => ['sorte', 'Sorte!'],
    13 => ['casa', 'Corretora de imoveis'],
    14 => ['carreira', 'Mudanca de carreira'],
    15 => ['evento', 'Reviravolta'],
    16 => ['familia', 'Casamento!'],
    17 => ['payday', 'Dia de pagamento'],
    18 => ['imposto', 'Impostos'],
    19 => ['casa', 'Corretora de imoveis'],
    20 => ['evento', 'Evento surpresa'],
    21 => ['escolha', 'Investir ou poupar?'],
    22 => ['payday', 'Dia de pagamento'],
    23 => ['familia', 'Chegou um bebe!'],
    24 => ['sorte', 'Sorte!'],
    25 => ['carreira', 'Proposta irrecusavel'],
    26 => ['payday', 'Dia de pagamento'],
    27 => ['evento', 'Reviravolta'],
    28 => ['casa', 'Corretora de imoveis'],
    29 => ['imposto', 'Impostos'],
    30 => ['familia', 'Reuniao de familia'],
    31 => ['payday', 'Dia de pagamento'],
    32 => ['evento', 'Evento surpresa'],
    33 => ['sorte', 'Grande sorte!'],
    34 => ['familia', 'Familia cresce'],
    35 => ['casa', 'Corretora de bairro'],
    36 => ['imposto', 'Impostos'],
    37 => ['payday', 'Dia de pagamento'],
    38 => ['evento', 'Evento surpresa'],
    39 => ['sorte', 'Marco da jornada!'],
    40 => ['carreira', 'Nova fase'],
    41 => ['payday', 'Dia de pagamento'],
    42 => ['evento', 'Reviravolta'],
    43 => ['familia', 'Chegou um bebe!'],
    44 => ['escolha', 'Investir ou poupar?'],
    45 => ['payday', 'Dia de pagamento'],
    46 => ['casa', 'Casa dos sonhos'],
    47 => ['imposto', 'Impostos'],
    48 => ['sorte', 'Sorte grande!'],
    49 => ['familia', 'Familia cresce'],
    50 => ['carreira', 'Auge da carreira'],
    51 => ['payday', 'Dia de pagamento'],
    52 => ['evento', 'Reviravolta'],
    53 => ['casa', 'Imoveis premium'],
    54 => ['imposto', 'Impostos'],
    55 => ['sorte', 'Sorte!'],
    56 => ['familia', 'Reuniao de familia'],
    57 => ['payday', 'Dia de pagamento'],
    58 => ['evento', 'Ultimo evento'],
    59 => ['aposentadoria', 'Aposentadoria'],
  ];
  return $map[$pos] ?? ['evento', 'Evento'];
}

function career_bonus_salary(array $gp, array $careerRow): int {
  $s = (int)$careerRow['salary'];
  if (!empty($gp['studied'])) $s = (int)round($s * 1.3);
  return $s;
}

function calc_final_wealth(array $gp, PDO $pdo): int {
  $money = (int)$gp['money'];
  $bonus = 0;
  if (!empty($gp['house_id'])) {
    $st = $pdo->prepare('SELECT sell_value FROM houses WHERE id = ?');
    $st->execute([$gp['house_id']]);
    $h = $st->fetch();
    if ($h) $bonus += (int)$h['sell_value'];
  }
  $bonus += ((int)$gp['children_count']) * 10000;
  if (!empty($gp['spouse'])) $bonus += 5000; // esposa entra no carro e na riqueza
  // Bonus por ordem de chegada
  $ord = (int)($gp['finish_order'] ?? 99);
  if ($ord === 1) $bonus += 15000;
  elseif ($ord === 2) $bonus += 8000;
  elseif ($ord === 3) $bonus += 4000;
  return $money + $bonus;
}

function log_action(PDO $pdo, int $gameId, $playerId, int $turn, string $type, int $value, $pos, string $desc): void {
  $st = $pdo->prepare('INSERT INTO game_actions (game_id, player_id, turn_number, action_type, value, position, description) VALUES (?,?,?,?,?,?,?)');
  $st->execute([$gameId, $playerId, $turn, $type, $value, $pos, mb_substr($desc, 0, 250)]);
}

function advance_turn(PDO $pdo, int $roomId, int $gameId): ?int {
  // Avanca para o proximo jogador nao-finalizado (ordem por players.id)
  $st = $pdo->prepare('SELECT gp.player_id FROM game_players gp JOIN players p ON p.id = gp.player_id WHERE gp.game_id = ? AND gp.finished = 0 ORDER BY p.id ASC');
  $st->execute([$gameId]);
  $remaining = $st->fetchAll(PDO::FETCH_COLUMN);
  if (empty($remaining)) {
    $pdo->prepare('UPDATE games SET current_player_id = NULL WHERE id = ?')->execute([$gameId]);
    $pdo->prepare('UPDATE rooms SET current_turn_player_id = NULL WHERE id = ?')->execute([$roomId]);
    return null;
  }
  $g = $pdo->prepare('SELECT current_player_id, turn_index FROM games WHERE id = ?');
  $g->execute([$gameId]);
  $cur = $g->fetch();
  $curId = (int)($cur['current_player_id'] ?? 0);
  $idx = array_search($curId, array_map('intval', $remaining), true);
  $next = $remaining[0];
  if ($idx !== false) $next = $remaining[($idx + 1) % count($remaining)];
  $next = (int)$next;
  $pdo->prepare('UPDATE games SET current_player_id = ?, turn_index = turn_index + 1, total_turns = total_turns + 1 WHERE id = ?')->execute([$next, $gameId]);
  $pdo->prepare('UPDATE rooms SET current_turn_player_id = ?, turn_number = turn_number + 1 WHERE id = ?')->execute([$next, $roomId]);
  return $next;
}

function check_game_end(PDO $pdo, int $roomId, int $gameId): bool {
  $st = $pdo->prepare('SELECT COUNT(*) c FROM game_players WHERE game_id = ? AND finished = 0');
  $st->execute([$gameId]);
  $c = (int)$st->fetch()['c'];
  if ($c > 0) return false;
  // Todos terminaram: calcula vencedor por final_wealth
  $st = $pdo->prepare('SELECT player_id, final_wealth FROM game_players WHERE game_id = ? ORDER BY final_wealth DESC LIMIT 1');
  $st->execute([$gameId]);
  $w = $st->fetch();
  $pdo->prepare("UPDATE games SET status = 'finished', winner_player_id = ?, finished_at = NOW() WHERE id = ?")->execute([$w ? $w['player_id'] : null, $gameId]);
  $pdo->prepare("UPDATE rooms SET status = 'finished', current_turn_player_id = NULL, finished_at = NOW() WHERE id = ?")->execute([$roomId]);
  if ($w) log_action($pdo, $gameId, $w['player_id'], 999, 'finish', (int)$w['final_wealth'], 39, 'Venceu a partida!');
  // riqueza vitalícia: só com 2+ logados distintos (antifarm); guests não pontuam
  $el = $pdo->prepare('SELECT DISTINCT p.user_id FROM game_players gp JOIN players p ON p.id = gp.player_id WHERE gp.game_id = ? AND p.user_id IS NOT NULL');
  $el->execute([$gameId]);
  if (count($el->fetchAll(PDO::FETCH_COLUMN)) >= 2) {
    $all = $pdo->prepare('SELECT gp.player_id, gp.final_wealth, p.user_id FROM game_players gp JOIN players p ON p.id = gp.player_id WHERE gp.game_id = ? AND p.user_id IS NOT NULL');
    $all->execute([$gameId]);
    foreach ($all->fetchAll() as $row) {
      rank_credit($pdo, (int)$row['user_id'], 'life', max(0, (int)$row['final_wealth']), $w && (int)$w['player_id'] === (int)$row['player_id']);
    }
  }
  return true;
}

function do_payday(PDO $pdo, array $gp, int $gameId, int $turn, string $pname): array {
  $salary = (int)$gp['salary'];
  $gain = $salary > 0 ? $salary : 2000;
  // Bonus Designer
  if (!empty($gp['career_id'])) {
    $st = $pdo->prepare('SELECT name FROM careers WHERE id = ?');
    $st->execute([$gp['career_id']]);
    $cn = $st->fetch();
    if ($cn && $cn['name'] === 'Designer') $gain += 2000;
  }
  $pdo->prepare('UPDATE game_players SET money = money + ? WHERE id = ?')->execute([$gain, $gp['id']]);
  log_action($pdo, $gameId, $gp['player_id'], $turn, 'money', $gain, $gp['position'], "$pname recebeu salario " . fmt_money($gain) . '.');
  return ['gain' => $gain];
}
