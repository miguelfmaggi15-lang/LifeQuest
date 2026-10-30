<?php
// LIFE QUEST — helpers de API
declare(strict_types=1);

function json_out($data, int $code = 200): void {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  header('Access-Control-Allow-Origin: *');
  header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type');
  echo json_encode($data, JSON_UNESCAPED_UNICODE);
  exit;
}

function json_error(string $msg, int $code = 400, array $extra = []): void {
  json_out(array_merge(['ok' => false, 'error' => $msg], $extra), $code);
}

function req_body(): array {
  $ct = $_SERVER['CONTENT_TYPE'] ?? '';
  if (stripos($ct, 'application/json') !== false) {
    $raw = file_get_contents('php://input');
    $j = json_decode($raw ?: '{}', true);
    if (is_array($j)) return $j;
  }
  return array_merge($_GET, $_POST);
}

function rand_token(int $len = 32): string {
  return bin2hex(random_bytes($len / 2));
}

function room_code(): string {
  $chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  $c = '';
  for ($i = 0; $i < 6; $i++) $c .= $chars[random_int(0, strlen($chars) - 1)];
  return $c;
}

function bump_room(PDO $pdo, int $roomId): void {
  $pdo->prepare('UPDATE rooms SET state_version = state_version + 1 WHERE id = ?')->execute([$roomId]);
}

function auth_user(PDO $pdo, string $token): ?array {
  if ($token === '' || strlen($token) > 128) return null;
  $st = $pdo->prepare('SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > NOW() LIMIT 1');
  $st->execute([$token]);
  $u = $st->fetch();
  return $u ?: null;
}

function get_player_by_token(PDO $pdo, string $token): ?array {
  if ($token === '') return null;
  $st = $pdo->prepare('SELECT * FROM players WHERE token = ? LIMIT 1');
  $st->execute([$token]);
  $p = $st->fetch();
  return $p ?: null;
}

function touch_player(PDO $pdo, int $playerId): void {
  $pdo->prepare('UPDATE players SET is_connected = 1, last_seen = NOW() WHERE id = ?')->execute([$playerId]);
}

function active_game_for_room(PDO $pdo, int $roomId): ?array {
  $st = $pdo->prepare("SELECT * FROM games WHERE room_id = ? AND status = 'playing' ORDER BY id DESC LIMIT 1");
  $st->execute([$roomId]);
  $g = $st->fetch();
  return $g ?: null;
}

function latest_game_for_room(PDO $pdo, int $roomId): ?array {
  $st = $pdo->prepare('SELECT * FROM games WHERE room_id = ? ORDER BY id DESC LIMIT 1');
  $st->execute([$roomId]);
  $g = $st->fetch();
  return $g ?: null;
}

function ensure_host(PDO $pdo, int $roomId): void {
  // Se host saiu/desconectou, promove o mais antigo conectado
  $st = $pdo->prepare('SELECT * FROM rooms WHERE id = ?');
  $st->execute([$roomId]);
  $room = $st->fetch();
  if (!$room) return;
  $hostId = (int)($room['host_player_id'] ?? 0);
  if ($hostId) {
    $h = $pdo->prepare('SELECT id FROM players WHERE id = ? AND room_id = ? AND is_connected = 1 AND last_seen > (NOW() - INTERVAL 60 SECOND)');
    $h->execute([$hostId, $roomId]);
    if ($h->fetch()) return; // host ok
  }
  $n = $pdo->prepare('SELECT id FROM players WHERE room_id = ? AND is_connected = 1 ORDER BY id ASC LIMIT 1');
  $n->execute([$roomId]);
  $row = $n->fetch();
  if ($row) {
    $pdo->prepare('UPDATE players SET is_host = 0 WHERE room_id = ?')->execute([$roomId]);
    $pdo->prepare('UPDATE players SET is_host = 1 WHERE id = ?')->execute([$row['id']]);
    $pdo->prepare('UPDATE rooms SET host_player_id = ? WHERE id = ?')->execute([$row['id'], $roomId]);
  }
}

/* Riqueza vitalícia: soma final_wealth/patrimônio por usuário logado.
   Só creditado pela função chamadora quando há 2+ logados distintos (antifarm). */
function rank_credit(PDO $pdo, int $userId, string $game, int $wealth, bool $won): void {
  $tbl = ($game === 'mono') ? 'rank_mono' : 'rank_life';
  $w = $won ? 1 : 0;
  $pdo->prepare("INSERT INTO $tbl (user_id, total_wealth, partidas, vitorias) VALUES (?,?,1,?) ON DUPLICATE KEY UPDATE total_wealth = total_wealth + VALUES(total_wealth), partidas = partidas + 1, vitorias = vitorias + VALUES(vitorias)")->execute([$userId, $wealth, $w]);
  $l = $pdo->prepare('SELECT COALESCE(SUM(total_wealth),0) t, COALESCE(SUM(partidas),0) p, COALESCE(SUM(vitorias),0) v FROM rank_life WHERE user_id = ?');
  $l->execute([$userId]);
  $a = $l->fetch();
  $m = $pdo->prepare('SELECT COALESCE(SUM(total_wealth),0) t, COALESCE(SUM(partidas),0) p, COALESCE(SUM(vitorias),0) v FROM rank_mono WHERE user_id = ?');
  $m->execute([$userId]);
  $b = $m->fetch();
  $pdo->prepare('INSERT INTO rank_global (user_id, total_wealth, partidas, vitorias) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE total_wealth = VALUES(total_wealth), partidas = VALUES(partidas), vitorias = VALUES(vitorias)')
    ->execute([$userId, (int)$a['t'] + (int)$b['t'], (int)$a['p'] + (int)$b['p'], (int)$a['v'] + (int)$b['v']]);
}

function fmt_money(int $v): string {
  $neg = $v < 0;
  $a = abs($v);
  $s = number_format($a, 0, ',', '.');
  return ($neg ? '-$' : '$') . $s;
}
