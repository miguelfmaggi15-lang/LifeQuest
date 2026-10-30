<?php
// BANCO IMOBILIÁRIO — motor (regras validadas no servidor)
declare(strict_types=1);

const MONO_TILES = 32;
const MONO_START_MONEY = 15000;
const MONO_SALARY = 2000;
const MONO_JAIL_FINE = 500;
const MONO_MAX_ROUNDS = 40;
const MONO_HOUSE_MULT = [1, 5, 15, 45, 80, 150]; // nível 0..5 (5 = hotel)

function mono_tiles(PDO $pdo): array {
  static $cache = null;
  if ($cache !== null) return $cache;
  $rows = $pdo->query('SELECT * FROM mono_tiles ORDER BY tile ASC')->fetchAll();
  $cache = [];
  foreach ($rows as $r) $cache[(int)$r['tile']] = $r;
  return $cache;
}

function mono_log(PDO $pdo, int $gameId, $playerId, int $turn, string $type, int $value, $pos, string $desc): void {
  $st = $pdo->prepare('INSERT INTO mono_actions (game_id, player_id, turn_number, action_type, value, position, description) VALUES (?,?,?,?,?,?,?)');
  $st->execute([$gameId, $playerId, $turn, $type, $value, $pos, mb_substr($desc, 0, 250)]);
}

function mono_deeds(PDO $pdo, int $gameId): array {
  $st = $pdo->prepare('SELECT * FROM mono_deeds WHERE game_id = ?');
  $st->execute([$gameId]);
  $out = [];
  foreach ($st->fetchAll() as $d) $out[(int)$d['tile']] = $d;
  return $out;
}

function mono_group_tiles(array $tiles, string $group): array {
  $out = [];
  foreach ($tiles as $t => $row) {
    if (($row['color_group'] ?? null) === $group) $out[] = (int)$t;
  }
  return $out;
}

function mono_owner_of(array $deeds, int $tile) {
  return isset($deeds[$tile]) && $deeds[$tile]['owner_player_id'] !== null ? (int)$deeds[$tile]['owner_player_id'] : null;
}

function mono_monopoly(array $deeds, array $tiles, string $group, int $pid): bool {
  foreach (mono_group_tiles($tiles, $group) as $t) {
    if (mono_owner_of($deeds, $t) !== $pid) return false;
  }
  return true;
}

// Aluguel conforme nível (0..5) e monopólio. Estações/utilidades têm regra própria.
function mono_rent(PDO $pdo, int $gameId, array $deeds, array $tiles, int $tile, int $dice = 0): int {
  $t = $tiles[$tile];
  $owner = mono_owner_of($deeds, $tile);
  if ($owner === null) return 0;
  if (!empty($deeds[$tile]['mortgaged'])) return 0;
  if ($t['kind'] === 'station') {
    $cnt = 0;
    foreach ($deeds as $d) {
      if ($d['owner_player_id'] !== null && (int)$d['owner_player_id'] === $owner && $tiles[(int)$d['tile']]['kind'] === 'station') $cnt++;
    }
    return [0, 250, 500, 1000, 2000][$cnt] ?? 2000;
  }
  if ($t['kind'] === 'utility') {
    $cnt = 0;
    foreach ($deeds as $d) {
      if ($d['owner_player_id'] !== null && (int)$d['owner_player_id'] === $owner && $tiles[(int)$d['tile']]['kind'] === 'utility') $cnt++;
    }
    return $dice * ($cnt >= 2 ? 300 : 100);
  }
  $lvl = (int)$deeds[$tile]['houses'];
  $base = (int)$t['rent0'];
  if ($lvl === 0 && mono_monopoly($deeds, $tiles, $t['color_group'], $owner)) $base *= 2;
  return $base * MONO_HOUSE_MULT[$lvl];
}

function mono_net_worth(PDO $pdo, int $gameId, array $mp, array $deeds, array $tiles): int {
  $w = (int)$mp['money'];
  foreach ($deeds as $t => $d) {
    if ($d['owner_player_id'] === null || (int)$d['owner_player_id'] !== (int)$mp['player_id']) continue;
    $tile = $tiles[(int)$t];
    $w += (int)$tile['price'];
    $w += (int)$d['houses'] * (int)$tile['house_cost'];
  }
  return $w;
}

// Construção pareada: só com grupo completo, sem hipotecada, diferença máx 1 entre terrenos.
function mono_can_build(array $deeds, array $tiles, int $tile, int $pid, ?string &$why = null): bool {
  $t = $tiles[$tile] ?? null;
  if (!$t || $t['kind'] !== 'prop') { $why = 'Só terrenos comuns recebem construção.'; return false; }
  if (mono_owner_of($deeds, $tile) !== $pid) { $why = 'Terreno não é seu.'; return false; }
  if (!empty($deeds[$tile]['mortgaged'])) { $why = 'Terreno hipotecado.'; return false; }
  if (!mono_monopoly($deeds, $tiles, $t['color_group'], $pid)) { $why = 'Complete o grupo de cor primeiro.'; return false; }
  if ((int)$deeds[$tile]['houses'] >= 5) { $why = 'Já tem hotel.'; return false; }
  foreach (mono_group_tiles($tiles, $t['color_group']) as $o) {
    if (!empty($deeds[$o]['mortgaged'])) { $why = 'Há terreno hipotecado no grupo.'; return false; }
    if ((int)$deeds[$o]['houses'] < (int)$deeds[$tile]['houses']) { $why = 'Construa de forma pareada no grupo.'; return false; }
  }
  return true;
}

function mono_advance(PDO $pdo, int $roomId, int $gameId): ?int {
  $st = $pdo->prepare('SELECT mp.player_id FROM mono_players mp JOIN players p ON p.id = mp.player_id WHERE mp.game_id = ? AND mp.bankrupt = 0 ORDER BY p.id ASC');
  $st->execute([$gameId]);
  $alive = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
  if (empty($alive)) return null;
  $g = $pdo->prepare('SELECT current_player_id, turn_index, round FROM mono_games WHERE id = ?');
  $g->execute([$gameId]);
  $cur = $g->fetch();
  $idx = array_search((int)$cur['current_player_id'], $alive, true);
  $next = $alive[0];
  $round = (int)$cur['round'];
  if ($idx !== false) {
    $ni = ($idx + 1) % count($alive);
    $next = $alive[$ni];
    if ($ni === 0) $round++;
  }
  $pdo->prepare('UPDATE mono_games SET current_player_id = ?, turn_index = turn_index + 1, round = ? WHERE id = ?')->execute([$next, $round, $gameId]);
  $pdo->prepare('UPDATE rooms SET current_turn_player_id = ?, turn_number = turn_number + 1 WHERE id = ?')->execute([$next, $roomId]);
  return $next;
}

function mono_alive_count(PDO $pdo, int $gameId): int {
  $st = $pdo->prepare('SELECT COUNT(*) c FROM mono_players WHERE game_id = ? AND bankrupt = 0');
  $st->execute([$gameId]);
  return (int)$st->fetch()['c'];
}

function mono_check_end(PDO $pdo, int $roomId, int $gameId, array $tiles): bool {
  $st = $pdo->prepare('SELECT * FROM mono_games WHERE id = ?');
  $st->execute([$gameId]);
  $g = $st->fetch();
  if ($g['status'] !== 'playing') return true;
  $st = $pdo->prepare('SELECT * FROM mono_players WHERE game_id = ? AND bankrupt = 0');
  $st->execute([$gameId]);
  $alive = $st->fetchAll();
  $winner = null;
  if (count($alive) === 1) {
    $winner = (int)$alive[0]['player_id'];
  } elseif ((int)$g['round'] > MONO_MAX_ROUNDS) {
    $deeds = mono_deeds($pdo, $gameId);
    $best = null; $bw = PHP_INT_MIN;
    foreach ($alive as $a) {
      $w = mono_net_worth($pdo, $gameId, $a, $deeds, $tiles);
      if ($w > $bw) { $bw = $w; $best = (int)$a['player_id']; }
    }
    $winner = $best;
  }
  if ($winner === null) return false;
  $pdo->prepare("UPDATE mono_games SET status = 'finished', winner_player_id = ?, finished_at = NOW() WHERE id = ?")->execute([$winner, $gameId]);
  $pdo->prepare("UPDATE rooms SET status = 'finished', current_turn_player_id = NULL, finished_at = NOW() WHERE id = ?")->execute([$roomId]);
  mono_log($pdo, $gameId, $winner, 999, 'finish', 0, null, 'Venceu o Banco Imobiliário!');
  // riqueza vitalícia: só com 2+ logados distintos (antifarm); guests não pontuam
  $el = $pdo->prepare('SELECT DISTINCT p.user_id FROM mono_players mp JOIN players p ON p.id = mp.player_id WHERE mp.game_id = ? AND p.user_id IS NOT NULL');
  $el->execute([$gameId]);
  if (count($el->fetchAll(PDO::FETCH_COLUMN)) >= 2) {
    $deeds = mono_deeds($pdo, $gameId);
    $tiles = mono_tiles($pdo);
    $all = $pdo->prepare('SELECT mp.*, p.user_id FROM mono_players mp JOIN players p ON p.id = mp.player_id WHERE mp.game_id = ? AND p.user_id IS NOT NULL');
    $all->execute([$gameId]);
    foreach ($all->fetchAll() as $row) {
      rank_credit($pdo, (int)$row['user_id'], 'mono', max(0, mono_net_worth($pdo, $gameId, $row, $deeds, $tiles)), (int)$winner === (int)$row['player_id']);
    }
  }
  return true;
}

function mono_bump(PDO $pdo, int $roomId): void {
  $pdo->prepare('UPDATE rooms SET state_version = state_version + 1 WHERE id = ?')->execute([$roomId]);
}
