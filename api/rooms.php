<?php
// LIFE QUEST — API de salas (criar, entrar, lobby, reconexao)
declare(strict_types=1);
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../lib/helpers.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') json_out(['ok' => true]);
$in = req_body();
$action = strtolower(trim($in['action'] ?? $_GET['action'] ?? ''));
$pdo = db();

try {
  if ($action === 'create') {
    $name = trim($in['name'] ?? '');
    if ($name === '' || mb_strlen($name) > 24) json_error('Escolha um apelido de 1 a 24 letras.');
    // conta opcional: vincula e usa o username (anti-falsificação)
    $au = auth_user($pdo, trim($in['auth_token'] ?? ''));
    $uid = $au ? (int)$au['id'] : null;
    if ($au) $name = $au['username'];
    $gtype = ($in['game_type'] ?? 'life') === 'mono' ? 'mono' : 'life';
    $color = substr(trim($in['color'] ?? '#6C5CE7'), 0, 16);
    $emoji = 'X';
    $allow = ['R','B','G','Y'];
    if (isset($in['emoji']) && in_array($in['emoji'], $allow, true)) $emoji = $in['emoji'];
    // codigo unico
    $code = '';
    for ($t = 0; $t < 20; $t++) {
      $c = room_code();
      $s = $pdo->prepare('SELECT id FROM rooms WHERE code = ?');
      $s->execute([$c]);
      if (!$s->fetch()) { $code = $c; break; }
    }
    if ($code === '') json_error('Tente novamente em instantes.');
    $pdo->beginTransaction();
    $pdo->prepare("INSERT INTO rooms (code, status, game_type) VALUES (?, 'lobby', ?)")->execute([$code, $gtype]);
    $roomId = (int)$pdo->lastInsertId();
    $token = rand_token();
    $pdo->prepare('INSERT INTO players (room_id, user_id, name, avatar_color, avatar_emoji, token, is_host, is_connected) VALUES (?,?,?,?,?,?,1,1)')
      ->execute([$roomId, $uid, $name, $color, $emoji, $token]);
    $pid = (int)$pdo->lastInsertId();
    $pdo->prepare('UPDATE rooms SET host_player_id = ? WHERE id = ?')->execute([$pid, $roomId]);
    $pdo->commit();
    json_out(['ok' => true, 'code' => $code, 'room_id' => $roomId, 'player_id' => $pid, 'token' => $token, 'is_host' => true, 'game_type' => $gtype]);
  }

  if ($action === 'join') {
    $code = strtoupper(trim($in['code'] ?? ''));
    $name = trim($in['name'] ?? '');
    if (!preg_match('/^[A-Z0-9]{6}$/', $code)) json_error('Codigo invalido. Confira 6 letras/numeros.');
    if ($name === '' || mb_strlen($name) > 24) json_error('Escolha um apelido de 1 a 24 letras.');
    $au2 = auth_user($pdo, trim($in['auth_token'] ?? ''));
    $uid2 = $au2 ? (int)$au2['id'] : null;
    if ($au2) $name = $au2['username'];
    $st = $pdo->prepare('SELECT * FROM rooms WHERE code = ? LIMIT 1');
    $st->execute([$code]);
    $room = $st->fetch();
    if (!$room) json_error('Sala nao encontrada.', 404);
    if ($room['status'] !== 'lobby') json_error('Partida ja iniciada. Pecao codigo de uma sala no lobby.');
    $c = $pdo->prepare('SELECT COUNT(*) c FROM players WHERE room_id = ? AND is_connected = 1');
    $c->execute([$room['id']]);
    // conta todos (reconexao permite mesmo nome retornar)
    $all = $pdo->prepare('SELECT * FROM players WHERE room_id = ? AND name = ? LIMIT 1');
    $all->execute([$room['id'], $name]);
    $existing = $all->fetch();
    if ($existing) {
      // Reconexao: mesmo nome volta com novo token? Mantem token se ainda valido, senao atualiza conexao
      // Se logado, vincula a conta (reivindica a sessão para o ranking futuro)
      $pdo->prepare('UPDATE players SET is_connected = 1, last_seen = NOW(), user_id = COALESCE(user_id, ?) WHERE id = ?')->execute([$uid2, $existing['id']]);
      ensure_host($pdo, (int)$room['id']);
      json_out(['ok' => true, 'reconnected' => true, 'code' => $code, 'room_id' => (int)$room['id'], 'player_id' => (int)$existing['id'], 'token' => $existing['token']]);
    }
    $n = $pdo->prepare('SELECT COUNT(*) c FROM players WHERE room_id = ?');
    $n->execute([$room['id']]);
    $rowc = $n->fetch();
    $countAll = (int)($rowc['c'] ?? 0);
    if ($countAll >= 4) json_error('Sala cheia (maximo 4 jogadores).');
    $color = substr(trim($in['color'] ?? '#00B894'), 0, 16);
    $emoji = 'X';
    $allow = ['R','B','G','Y'];
    // cor automatica por ordem
    $palette = ['#E84393','#0984E3','#00B894','#E17055'];
    $order = ['R','B','G','Y'];
    $color = $palette[$countAll % 4] ?? $color;
    if (isset($in['emoji']) && in_array($in['emoji'], $allow, true)) $emoji = $in['emoji'];
    else {
      $emoji = $order[$countAll % 4];
    }
    try {
      $token = rand_token();
      $pdo->prepare('INSERT INTO players (room_id, user_id, name, avatar_color, avatar_emoji, token, is_host, is_connected) VALUES (?,?,?,?,?,?,0,1)')
        ->execute([$room['id'], $uid2, $name, $color, $emoji, $token]);
    } catch (PDOException $e) {
      if (strpos($e->getMessage(), 'uq_room_name') !== false || $e->getCode() === '23000') json_error('Esse apelido ja esta na sala. Escolha outro.');
      throw $e;
    }
    $pid = (int)$pdo->lastInsertId();
    bump_room($pdo, (int)$room['id']);
    ensure_host($pdo, (int)$room['id']);
    json_out(['ok' => true, 'code' => $code, 'room_id' => (int)$room['id'], 'player_id' => $pid, 'token' => $token, 'is_host' => false, 'game_type' => ($room['game_type'] ?? 'life')]);
  }

  if ($action === 'state') {
    $code = strtoupper(trim($in['code'] ?? ''));
    if (!preg_match('/^[A-Z0-9]{6}$/', $code)) json_error('Codigo invalido.');
    $st = $pdo->prepare('SELECT * FROM rooms WHERE code = ? LIMIT 1');
    $st->execute([$code]);
    $room = $st->fetch();
    if (!$room) json_error('Sala nao encontrada.', 404);
    ensure_host($pdo, (int)$room['id']);
    $ps = $pdo->prepare('SELECT id, name, avatar_color, avatar_emoji, is_host, is_connected, last_seen FROM players WHERE room_id = ? ORDER BY id ASC');
    $ps->execute([$room['id']]);
    $players = $ps->fetchAll();
    $st2 = $pdo->prepare('SELECT * FROM rooms WHERE id = ?');
    $st2->execute([$room['id']]);
    $room = $st2->fetch();
    json_out(['ok' => true, 'room' => $room, 'players' => $players]);
  }

  if ($action === 'size') {
    // Host escolhe Clássico (40, ~10min) ou Maratona (60, ~25min) ainda no lobby
    require_once __DIR__ . '/../lib/engine.php';
    $token = trim($in['token'] ?? '');
    $p = get_player_by_token($pdo, $token);
    if (!$p) json_error('Sessao invalida.', 401);
    if (!(int)$p['is_host']) json_error('So o anfitriao escolhe o tamanho.', 403);
    $st = $pdo->prepare('SELECT * FROM rooms WHERE id = ?');
    $st->execute([$p['room_id']]);
    $room = $st->fetch();
    if (!$room || $room['status'] !== 'lobby') json_error('So vale no lobby.', 409);
    $size = board_size_valid($in['size'] ?? 60);
    $pdo->prepare('UPDATE rooms SET board_size = ?, state_version = state_version + 1 WHERE id = ?')->execute([$size, $p['room_id']]);
    json_out(['ok' => true, 'board_size' => $size]);
  }

  if ($action === 'heartbeat' || $action === 'reconnect') {
    $token = trim($in['token'] ?? '');
    $p = get_player_by_token($pdo, $token);
    if (!$p) json_error('Sessao expirada. Entre novamente.', 401);
    touch_player($pdo, (int)$p['id']);
    ensure_host($pdo, (int)$p['room_id']);
    $st = $pdo->prepare('SELECT code, status, state_version FROM rooms WHERE id = ?');
    $st->execute([$p['room_id']]);
    $room = $st->fetch();
    $me = $pdo->prepare('SELECT id, name, is_host, is_connected FROM players WHERE id = ?');
    $me->execute([$p['id']]);
    json_out(['ok' => true, 'room' => $room, 'me' => $me->fetch(), 'code' => $room['code']]);
  }

  if ($action === 'leave') {
    $token = trim($in['token'] ?? '');
    $p = get_player_by_token($pdo, $token);
    if (!$p) json_out(['ok' => true]);
    $pdo->prepare('UPDATE players SET is_connected = 0 WHERE id = ?')->execute([$p['id']]);
    ensure_host($pdo, (int)$p['room_id']);
    bump_room($pdo, (int)$p['room_id']);
    json_out(['ok' => true]);
  }

  json_error('Acao desconhecida.', 400);
} catch (PDOException $e) {
  if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
  json_error('Erro no banco. Tente de novo.', 500);
}
