<?php
// BANCO IMOBILIÁRIO — API (turnos, dados, leilão, trocas, prisão, falência)
declare(strict_types=1);
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../lib/engine.php';
require_once __DIR__ . '/../lib/mono.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') json_out(['ok' => true]);
$in = req_body();
$action = strtolower(trim($in['action'] ?? $_GET['action'] ?? ''));
$pdo = db();

function mono_payload(PDO $pdo, int $gameId, int $roomId): array {
  $g = $pdo->prepare('SELECT * FROM mono_games WHERE id = ?');
  $g->execute([$gameId]);
  $game = $g->fetch();
  $tiles = mono_tiles($pdo);
  $deeds = mono_deeds($pdo, $gameId);
  $q = $pdo->prepare('SELECT mp.*, p.name, p.avatar_color, p.avatar_emoji, p.is_host, p.is_connected FROM mono_players mp JOIN players p ON p.id = mp.player_id WHERE mp.game_id = ? ORDER BY p.id ASC');
  $q->execute([$gameId]);
  $plist = $q->fetchAll();
  foreach ($plist as &$pl) $pl['net_worth'] = mono_net_worth($pdo, $gameId, $pl, $deeds, $tiles);
  $dl = [];
  foreach ($deeds as $t => $d) {
    $dl[] = ['tile' => $t, 'owner' => $d['owner_player_id'] === null ? null : (int)$d['owner_player_id'],
      'houses' => (int)$d['houses'], 'mortgaged' => (int)$d['mortgaged'], 'info' => $tiles[$t]];
  }
  $f = $pdo->prepare('SELECT ma.*, p.name AS pname FROM mono_actions ma LEFT JOIN players p ON p.id = ma.player_id WHERE ma.game_id = ? ORDER BY ma.id DESC LIMIT 25');
  $f->execute([$gameId]);
  $feed = array_reverse($f->fetchAll());
  $o = $pdo->prepare('SELECT * FROM mono_offers WHERE game_id = ? AND status = \'pending\' ORDER BY id ASC');
  $o->execute([$gameId]);
  $r = $pdo->prepare('SELECT * FROM rooms WHERE id = ?');
  $r->execute([$roomId]);
  $pend = $game['pending_json'] ? json_decode($game['pending_json'], true) : null;
  return ['game' => $game, 'players' => $plist, 'deeds' => $dl, 'feed' => $feed,
    'offers' => $o->fetchAll(), 'pending' => $pend, 'room' => $r->fetch(), 'tiles' => array_values($tiles)];
}

function mono_active(PDO $pdo, int $roomId): ?array {
  $st = $pdo->prepare("SELECT * FROM mono_games WHERE room_id = ? AND status = 'playing' ORDER BY id DESC LIMIT 1");
  $st->execute([$roomId]);
  $g = $st->fetch();
  return $g ?: null;
}

function mono_myrow(PDO $pdo, int $gameId, int $pid): ?array {
  $st = $pdo->prepare('SELECT * FROM mono_players WHERE game_id = ? AND player_id = ? LIMIT 1');
  $st->execute([$gameId, $pid]);
  $r = $st->fetch();
  return $r ?: null;
}

// Resolve a casa onde o jogador parou (profundidade máx 2 p/ cartas de movimento)
function mono_resolve(PDO $pdo, int $roomId, int $gameId, array $me, array $gp, array $tiles, array $deeds, int $dice, int $depth, array &$event): void {
  $pos = (int)$gp['position'];
  $t = $tiles[$pos];
  $turn = (int)$pdo->query("SELECT turn_index FROM mono_games WHERE id = $gameId")->fetch()['turn_index'] + 1;
  $pname = $me['name'];
  if ($t['kind'] === 'prop' || $t['kind'] === 'station' || $t['kind'] === 'utility') {
    $owner = mono_owner_of($deeds, $pos);
    if ($owner === null) {
      $pdo->prepare('UPDATE mono_players SET pending_type = ?, pending_data = ? WHERE id = ?')
        ->execute(['buy', json_encode(['tile' => $pos, 'price' => (int)$t['price']]), $gp['id']]);
      $event['need_choice'] = true; $event['choice_kind'] = 'buy';
      $event['tile_info'] = $t;
      $event['text'] = "{$t['name']} está à venda por " . fmt_money((int)$t['price']) . '. Comprar ou leiloar?';
    } elseif ($owner !== (int)$me['id']) {
      $rent = mono_rent($pdo, $gameId, $deeds, $tiles, $pos, $dice);
      if ($rent > 0) {
        $pdo->prepare('UPDATE mono_players SET money = money - ? WHERE id = ?')->execute([$rent, $gp['id']]);
        $ow = $pdo->prepare('SELECT id FROM mono_players WHERE game_id = ? AND player_id = ?');
        $ow->execute([$gameId, $owner]); $owr = $ow->fetch();
        if ($owr) $pdo->prepare('UPDATE mono_players SET money = money + ? WHERE id = ?')->execute([$rent, $owr['id']]);
        $on = $pdo->prepare('SELECT name FROM players WHERE id = ?'); $on->execute([$owner]);
        mono_log($pdo, $gameId, $me['id'], $turn, 'rent', -$rent, $pos, "$pname pagou aluguel " . fmt_money($rent) . " a " . $on->fetch()['name'] . " ({$t['name']}).");
        $event['loss'] = $rent;
        $event['text'] = "Terreno de outro jogador! Aluguel " . fmt_money($rent) . ".";
        if ((int)$pdo->query("SELECT money FROM mono_players WHERE id = {$gp['id']}")->fetch()['money'] < 0) {
          $event['text'] .= ' Você está devendo: hipoteque, negocie ou declare falência.';
        }
      } else {
        $event['text'] = "{$t['name']} está hipotecado: sem aluguel.";
      }
    } else {
      $event['text'] = "Seu terreno {$t['name']}.";
    }
  } elseif ($t['kind'] === 'tax') {
    $tax = 1000;
    $pdo->prepare('UPDATE mono_players SET money = money - ? WHERE id = ?')->execute([$tax, $gp['id']]);
    $pdo->prepare('UPDATE mono_games SET jackpot = jackpot + ? WHERE id = ?')->execute([$tax, $gameId]);
    mono_log($pdo, $gameId, $me['id'], $turn, 'money', -$tax, $pos, "$pname pagou taxa " . fmt_money($tax) . " (foi p/ o jackpot).");
    $event['loss'] = $tax;
    $event['text'] = "{$t['name']}: pagou " . fmt_money($tax) . " ao jackpot.";
  } elseif ($t['kind'] === 'parking') {
    $jk = (int)$pdo->query("SELECT jackpot FROM mono_games WHERE id = $gameId")->fetch()['jackpot'];
    if ($jk > 0) {
      $pdo->prepare('UPDATE mono_players SET money = money + ? WHERE id = ?')->execute([$jk, $gp['id']]);
      $pdo->prepare('UPDATE mono_games SET jackpot = 500 WHERE id = ?')->execute([$gameId]);
      mono_log($pdo, $gameId, $me['id'], $turn, 'money', $jk, $pos, "$pname levou o jackpot " . fmt_money($jk) . "!");
      $event['gain'] = $jk;
      $event['text'] = "Estacionamento livre! Você levou " . fmt_money($jk) . ".";
    } else $event['text'] = 'Estacionamento livre. Jackpot vazio.';
  } elseif ($t['kind'] === 'jail') {
    $pdo->prepare('UPDATE mono_players SET in_jail = 3 WHERE id = ?')->execute([$gp['id']]);
    mono_log($pdo, $gameId, $me['id'], $turn, 'jail', 0, $pos, "$pname foi para a prisão!");
    $event['text'] = 'Vá para a prisão! Saia com dados duplos, $500 ou carta.';
  } elseif ($t['kind'] === 'sorte' || $t['kind'] === 'cofre') {
    $deck = $t['kind'];
    $card = $pdo->query("SELECT * FROM mono_cards WHERE deck = '$deck' ORDER BY RAND() LIMIT 1")->fetch();
    $fx = $card['effect'];
    $msg = $card['title'] . ' — ' . $card['description'];
    if ($fx === '' || $fx === null) {
      $v = (int)$card['effect_money'];
      if ($v !== 0) {
        if ($fx === '' && $v < 0 && $card['deck'] === 'cofre') { /* nada extra */ }
        $pdo->prepare('UPDATE mono_players SET money = money + ? WHERE id = ?')->execute([$v, $gp['id']]);
        if ($v > 0) { $event['gain'] = $v; } else { $event['loss'] = -$v; }
      }
      mono_log($pdo, $gameId, $me['id'], $turn, 'event', (int)$card['effect_money'], $pos, "$pname: $msg");
      $event['card'] = $card;
      $event['text'] = $msg;
    } elseif ($fx === 'go_jail') {
      $pdo->prepare('UPDATE mono_players SET in_jail = 3 WHERE id = ?')->execute([$gp['id']]);
      mono_log($pdo, $gameId, $me['id'], $turn, 'jail', 0, $pos, "$pname: $msg");
      $event['text'] = $msg;
    } elseif ($fx === 'jail_free') {
      $pdo->prepare('UPDATE mono_players SET jail_free = jail_free + 1 WHERE id = ?')->execute([$gp['id']]);
      mono_log($pdo, $gameId, $me['id'], $turn, 'event', 0, $pos, "$pname: $msg");
      $event['text'] = $msg;
    } elseif ($fx === 'goto_go') {
      $pdo->prepare('UPDATE mono_players SET position = 0, money = money + ? WHERE id = ?')->execute([MONO_SALARY, $gp['id']]);
      mono_log($pdo, $gameId, $me['id'], $turn, 'money', MONO_SALARY, 0, "$pname: $msg");
      $event['text'] = $msg;
    } elseif ($fx === 'repair') {
      $cost = 0;
      foreach ($deeds as $d) {
        if ($d['owner_player_id'] !== null && (int)$d['owner_player_id'] === (int)$me['id']) $cost += min(3, (int)$d['houses']) * 400;
      }
      $cost = min(1200, $cost);
      if ($cost > 0) $pdo->prepare('UPDATE mono_players SET money = money - ? WHERE id = ?')->execute([$cost, $gp['id']]);
      mono_log($pdo, $gameId, $me['id'], $turn, 'money', -$cost, $pos, "$pname: $msg");
      $event['loss'] = $cost; $event['text'] = $msg;
    } elseif ($fx === 'gift') {
      $got = 0;
      $others = $pdo->prepare('SELECT id FROM mono_players WHERE game_id = ? AND player_id <> ? AND bankrupt = 0');
      $others->execute([$gameId, $me['id']]);
      foreach ($others->fetchAll() as $o) {
        $pdo->prepare('UPDATE mono_players SET money = money - 300 WHERE id = ?')->execute([$o['id']]);
        $got += 300;
      }
      $pdo->prepare('UPDATE mono_players SET money = money + ? WHERE id = ?')->execute([$got, $gp['id']]);
      mono_log($pdo, $gameId, $me['id'], $turn, 'money', $got, $pos, "$pname: $msg");
      $event['gain'] = $got; $event['text'] = $msg;
    } elseif (($fx === 'fwd3' || $fx === 'back3') && $depth < 2) {
      $np = ($pos + ($fx === 'fwd3' ? 3 : -3) + MONO_TILES) % MONO_TILES;
      $passed = ($fx === 'fwd3' && $np < $pos);
      $pdo->prepare('UPDATE mono_players SET position = ? WHERE id = ?')->execute([$np, $gp['id']]);
      if ($passed) $pdo->prepare('UPDATE mono_players SET money = money + ? WHERE id = ?')->execute([MONO_SALARY, $gp['id']]);
      $gp2 = $pdo->prepare('SELECT * FROM mono_players WHERE id = ?');
      $gp2->execute([$gp['id']]);
      mono_resolve($pdo, $roomId, $gameId, $me, $gp2->fetch(), $tiles, mono_deeds($pdo, $gameId), $dice, $depth + 1, $event);
      $event['text'] = $msg . ' ' . ($event['text'] ?? '');
    } else {
      $event['text'] = $msg;
    }
  } else {
    $event['text'] = $t['text'] !== '' ? $t['text'] : $t['name'] . '.';
  }
}

try {
  $token = trim($in['token'] ?? '');
  $me = get_player_by_token($pdo, $token);
  if (!$me && !in_array($action, ['tiles'], true)) json_error('Sessao invalida. Entre na sala de novo.', 401);
  if ($me) { touch_player($pdo, (int)$me['id']); }
  $roomId = $me ? (int)$me['room_id'] : 0;

  if ($action === 'tiles') {
    json_out(['ok' => true, 'tiles' => array_values(mono_tiles($pdo))]);
  }

  // ---------- START ----------
  if ($action === 'start') {
    if (!(int)$me['is_host']) json_error('So o anfitriao pode iniciar.');
    $st = $pdo->prepare('SELECT * FROM rooms WHERE id = ?');
    $st->execute([$roomId]);
    $room = $st->fetch();
    if (($room['game_type'] ?? 'life') !== 'mono') json_error('Esta sala é do Jogo da Vida.');
    if ($room['status'] === 'playing') {
      $g = mono_active($pdo, $roomId);
      if ($g) json_out(['ok' => true, 'game_id' => (int)$g['id'], 'already' => true]);
    }
    $ps = $pdo->prepare('SELECT * FROM players WHERE room_id = ? AND is_connected = 1 ORDER BY id ASC');
    $ps->execute([$roomId]);
    $players = $ps->fetchAll();
    if (count($players) < 2) json_error('Chame pelo menos 2 jogadores para comecar.');
    if (count($players) > 4) $players = array_slice($players, 0, 4);
    $tiles = mono_tiles($pdo);
    $pdo->beginTransaction();
    $pdo->prepare("INSERT INTO mono_games (room_id, status) VALUES (?, 'playing')")->execute([$roomId]);
    $gameId = (int)$pdo->lastInsertId();
    foreach ($players as $pl) {
      $pdo->prepare('INSERT INTO mono_players (game_id, player_id, money, position) VALUES (?,?,?,0)')->execute([$gameId, $pl['id'], MONO_START_MONEY]);
    }
    foreach ($tiles as $t => $row) {
      if (in_array($row['kind'], ['prop', 'station', 'utility'], true)) {
        $pdo->prepare('INSERT INTO mono_deeds (game_id, tile) VALUES (?, ?)')->execute([$gameId, $t]);
      }
    }
    $first = (int)$players[0]['id'];
    $pdo->prepare('UPDATE mono_games SET current_player_id = ? WHERE id = ?')->execute([$first, $gameId]);
    $pdo->prepare("UPDATE rooms SET status = 'playing', game_type = 'mono', current_turn_player_id = ?, turn_number = 1, started_at = NOW(), finished_at = NULL WHERE id = ?")->execute([$first, $roomId]);
    mono_bump($pdo, $roomId);
    mono_log($pdo, $gameId, null, 0, 'system', 0, 0, 'Banco Imobiliário iniciado! Boa sorte, magnatas!');
    $pdo->commit();
    json_out(['ok' => true, 'game_id' => $gameId] + mono_payload($pdo, $gameId, $roomId));
  }

  $game = mono_active($pdo, $roomId);
  if (!$game && $action === 'state') {
    $st = $pdo->prepare('SELECT * FROM mono_games WHERE room_id = ? ORDER BY id DESC LIMIT 1');
    $st->execute([$roomId]);
    $lg = $st->fetch();
    if (!$lg) {
      $r = $pdo->prepare('SELECT * FROM rooms WHERE id = ?'); $r->execute([$roomId]);
      json_out(['ok' => true, 'room' => $r->fetch(), 'game' => null, 'players' => [], 'feed' => []]);
    }
    json_out(['ok' => true] + mono_payload($pdo, (int)$lg['id'], $roomId));
  }
  if (!$game) json_error('Nenhuma partida ativa.', 404);
  $gameId = (int)$game['id'];
  $mygp = mono_myrow($pdo, $gameId, (int)$me['id']);
  if (!$mygp) json_error('Voce nao esta nesta partida.', 403);
  $tiles = mono_tiles($pdo);

  if ($action === 'state') {
    $p = mono_payload($pdo, $gameId, $roomId);
    $p['me_id'] = (int)$me['id'];
    $p['ok'] = true;
    json_out($p);
  }

  // Trava global: devendo, só hipoteca/deshipoteca/troca/falência
  $debtLock = ((int)$mygp['money'] < 0) && !in_array($action, ['mortgage', 'unmortgage', 'trade_offer', 'trade_accept', 'trade_decline', 'bankrupt', 'state'], true);
  if ($debtLock) json_error('Você está devendo: hipoteque, negocie ou declare falência.', 409);

  // ---------- ROLL ----------
  if ($action === 'roll') {
    if ($game['status'] !== 'playing') json_error('Partida encerrada.');
    if ((int)$game['current_player_id'] !== (int)$me['id']) json_error('Aguarde o seu turno.', 403);
    if ((int)$mygp['bankrupt']) json_error('Você faliu. Assista aos outros.');
    if (!empty($mygp['pending_type'])) json_error('Resolva sua pendência antes.', 409);
    $pend = $game['pending_json'] ? json_decode($game['pending_json'], true) : null;
    if ($pend && ($pend['type'] ?? '') === 'auction') json_error('Aguarde o fim do leilão.', 409);
    $pdo->beginTransaction();
    $g = $pdo->prepare('SELECT current_player_id, status, turn_index FROM mono_games WHERE id = ?');
    $g->execute([$gameId]);
    $gf = $g->fetch();
    if ((int)$gf['current_player_id'] !== (int)$me['id']) { $pdo->rollBack(); json_error('Turno passou. Aguarde.', 409); }
    $d1 = random_int(1, 6); $d2 = random_int(1, 6);
    $dice = $d1 + $d2;
    $dbl = ($d1 === $d2);
    $doubles = (int)(($pend['doubles_' . $me['id']] ?? 0));
    $pdo->prepare('UPDATE mono_players SET last_dice = ? WHERE id = ?')->execute([$dice, $mygp['id']]);
    $turn = (int)$game['turn_index'] + 1;
    $event = ['dice' => [$d1, $d2], 'need_choice' => false];
    mono_log($pdo, $gameId, $me['id'], $turn, 'roll', $dice, null, "{$me['name']} rolou $d1+$d2=$dice.");
    if ((int)$mygp['in_jail'] > 0) {
      if ($dbl) {
        $pdo->prepare('UPDATE mono_players SET in_jail = 0 WHERE id = ?')->execute([$mygp['id']]);
        mono_log($pdo, $gameId, $me['id'], $turn, 'jail', 0, $mygp['position'], "{$me['name']} tirou dupla e saiu da prisão!");
        $event['text'] = "Dupla! Você saiu da prisão. ";
      } else {
        $left = (int)$mygp['in_jail'] - 1;
        if ($left <= 0) {
          $pdo->prepare('UPDATE mono_players SET in_jail = 0, money = money - ? WHERE id = ?')->execute([MONO_JAIL_FINE, $mygp['id']]);
          mono_log($pdo, $gameId, $me['id'], $turn, 'money', -MONO_JAIL_FINE, $mygp['position'], "{$me['name']} pagou fiança " . fmt_money(MONO_JAIL_FINE) . " e saiu.");
          $event['text'] = "Sem dupla em 3 tentativas: pagou fiança " . fmt_money(MONO_JAIL_FINE) . ". ";
        } else {
          $pdo->prepare('UPDATE mono_players SET in_jail = ? WHERE id = ?')->execute([$left, $mygp['id']]);
          mono_log($pdo, $gameId, $me['id'], $turn, 'jail', 0, $mygp['position'], "{$me['name']} segue preso ($left tentativa(s)).");
          $event['text'] = "Sem dupla. Resta(m) $left tentativa(s). ";
          $pj = $pend ?: []; $pj['doubles_' . $me['id']] = 0;
          $pdo->prepare('UPDATE mono_games SET pending_json = ? WHERE id = ?')->execute([json_encode($pj), $gameId]);
          mono_advance($pdo, $roomId, $gameId);
          mono_bump($pdo, $roomId);
          $pdo->commit();
          json_out(['ok' => true, 'event' => $event] + mono_payload($pdo, $gameId, $roomId));
        }
      }
    }
    if ($dbl) {
      $doubles++;
      if ($doubles >= 3) {
        $pdo->prepare('UPDATE mono_players SET in_jail = 3 WHERE id = ?')->execute([$mygp['id']]);
        $pj = $pend ?: []; $pj['doubles_' . $me['id']] = 0;
        $pdo->prepare('UPDATE mono_games SET pending_json = ? WHERE id = ?')->execute([json_encode($pj), $gameId]);
        mono_log($pdo, $gameId, $me['id'], $turn, 'jail', 0, $mygp['position'], "{$me['name']} tirou 3 duplas: foi preso!");
        mono_advance($pdo, $roomId, $gameId);
        mono_bump($pdo, $roomId);
        $pdo->commit();
        $event['text'] = "3 duplas seguidas: direto para a prisão!";
        json_out(['ok' => true, 'event' => $event] + mono_payload($pdo, $gameId, $roomId));
      }
    } else {
      $doubles = 0;
    }
    $oldPos = (int)$mygp['position'];
    $newPos = ($oldPos + $dice) % MONO_TILES;
    $passed = $newPos < $oldPos;
    $pdo->prepare('UPDATE mono_players SET position = ?' . ($passed ? ', money = money + ' . MONO_SALARY : '') . ' WHERE id = ?')->execute([$newPos, $mygp['id']]);
    if ($passed) mono_log($pdo, $gameId, $me['id'], $turn, 'money', MONO_SALARY, $newPos, "{$me['name']} passou pela Partida (+" . fmt_money(MONO_SALARY) . ").");
    $event['text'] = (isset($event['text']) ? $event['text'] : '') . "{$me['name']} rolou $d1+$d2=$dice e foi para $newPos ({$tiles[$newPos]['name']})." . ($passed ? ' Passou pela Partida!' : '');
    $gpq = $pdo->prepare('SELECT * FROM mono_players WHERE id = ?');
    $gpq->execute([$mygp['id']]);
    $gp = $gpq->fetch();
    $deeds = mono_deeds($pdo, $gameId);
    mono_resolve($pdo, $roomId, $gameId, $me, $gp, $tiles, $deeds, $dice, 0, $event);
    if (empty($event['need_choice'])) {
      $pj = $pend ?: []; $pj['doubles_' . $me['id']] = $dbl ? $doubles : 0;
      $pdo->prepare('UPDATE mono_games SET pending_json = ? WHERE id = ?')->execute([json_encode($pj), $gameId]);
      // duplo dá direito a novo giro (sem avançar o turno)
      if (!$dbl) mono_advance($pdo, $roomId, $gameId);
      else mono_log($pdo, $gameId, $me['id'], $turn, 'system', 0, $newPos, "{$me['name']} tirou dupla e joga de novo!");
    }
    mono_bump($pdo, $roomId);
    $pdo->commit();
    $pl = mono_payload($pdo, $gameId, $roomId);
    if (mono_check_end($pdo, $roomId, $gameId, $tiles)) {
      $pl = mono_payload($pdo, $gameId, $roomId);
    }
    json_out(['ok' => true, 'event' => $event] + $pl);
  }

  // ---------- BUY / DECLINE (abre leilão) ----------
  if ($action === 'buy') {
    if ((int)$game['current_player_id'] !== (int)$me['id']) json_error('Não é sua vez.', 403);
    if (($mygp['pending_type'] ?? '') !== 'buy') json_error('Nada para comprar.', 409);
    $pd = json_decode((string)$mygp['pending_data'], true) ?: [];
    $tile = (int)($pd['tile'] ?? -1);
    $tiles2 = $tiles;
    $price = (int)($tiles2[$tile]['price'] ?? 0);
    if ($tile < 0 || $price <= 0) json_error('Oferta inválida.');
    $pdo->beginTransaction();
    $fresh = mono_myrow($pdo, $gameId, (int)$me['id']);
    $deeds = mono_deeds($pdo, $gameId);
    if (mono_owner_of($deeds, $tile) !== null) { $pdo->rollBack(); json_error('Já tem dono.'); }
    if ((int)$fresh['money'] < $price) { $pdo->rollBack(); json_error('Dinheiro insuficiente.'); }
    $pdo->prepare('UPDATE mono_players SET money = money - ?, pending_type = NULL, pending_data = NULL WHERE id = ?')->execute([$price, $fresh['id']]);
    $pdo->prepare('UPDATE mono_deeds SET owner_player_id = ? WHERE game_id = ? AND tile = ?')->execute([$me['id'], $gameId, $tile]);
    $turn = (int)$game['turn_index'] + 1;
    mono_log($pdo, $gameId, $me['id'], $turn, 'buy', -$price, $tile, "{$me['name']} comprou {$tiles2[$tile]['name']} por " . fmt_money($price) . '.');
    mono_advance($pdo, $roomId, $gameId);
    mono_bump($pdo, $roomId);
    $pdo->commit();
    json_out(['ok' => true, 'message' => 'Terreno comprado!'] + mono_payload($pdo, $gameId, $roomId));
  }

  if ($action === 'decline') {
    if ((int)$game['current_player_id'] !== (int)$me['id']) json_error('Não é sua vez.', 403);
    if (($mygp['pending_type'] ?? '') !== 'buy') json_error('Nada para recusar.', 409);
    $pd = json_decode((string)$mygp['pending_data'], true) ?: [];
    $tile = (int)($pd['tile'] ?? -1);
    if ($tile < 0) json_error('Oferta inválida.');
    $pdo->beginTransaction();
    $pdo->prepare('UPDATE mono_players SET pending_type = NULL, pending_data = NULL WHERE id = ?')->execute([$mygp['id']]);
    $st = $pdo->prepare('SELECT mp.player_id FROM mono_players mp JOIN players p ON p.id = mp.player_id WHERE mp.game_id = ? AND mp.bankrupt = 0 AND mp.player_id <> ? ORDER BY p.id ASC');
    $st->execute([$gameId, $me['id']]);
    $order = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
    $turn = (int)$game['turn_index'] + 1;
    if (empty($order)) {
      mono_log($pdo, $gameId, $me['id'], $turn, 'system', 0, $tile, "{$me['name']} recusou {$tiles[$tile]['name']}; sem licitantes, segue no banco.");
    } else {
      $pdo->prepare('UPDATE mono_games SET pending_json = ? WHERE id = ?')
        ->execute([json_encode(['type' => 'auction', 'tile' => $tile, 'order' => $order, 'idx' => 0, 'highest' => 0, 'by' => null, 'bids' => []]), $gameId]);
      mono_log($pdo, $gameId, $me['id'], $turn, 'system', 0, $tile, "{$me['name']} recusou {$tiles[$tile]['name']}: LEILÃO aberto!");
    }
    mono_bump($pdo, $roomId);
    $pdo->commit();
    json_out(['ok' => true, 'message' => 'Leilão aberto!'] + mono_payload($pdo, $gameId, $roomId));
  }

  // ---------- BID ----------
  if ($action === 'bid') {
    $pend = $game['pending_json'] ? json_decode($game['pending_json'], true) : null;
    if (!$pend || ($pend['type'] ?? '') !== 'auction') json_error('Sem leilão ativo.', 409);
    $order = $pend['order'];
    if (!isset($order[$pend['idx']]) || (int)$order[$pend['idx']] !== (int)$me['id']) json_error('Aguarde sua vez de licitar.', 403);
    $amt = max(0, (int)($in['amount'] ?? 0));
    $pdo->beginTransaction();
    $fresh = mono_myrow($pdo, $gameId, (int)$me['id']);
    if ($amt > 0) {
      $min = ((int)$pend['highest']) + 100;
      if ($amt < $min) { $pdo->rollBack(); json_error('Lance mínimo: ' . fmt_money($min) . '.'); }
      if ($amt > (int)$fresh['money']) { $pdo->rollBack(); json_error('Sem saldo para esse lance.'); }
      $pend['highest'] = $amt; $pend['by'] = (int)$me['id'];
      $pend['bids'][] = ['pid' => (int)$me['id'], 'amt' => $amt];
      mono_log($pdo, $gameId, $me['id'], (int)$game['turn_index'] + 1, 'system', $amt, $pend['tile'], "{$me['name']} lances " . fmt_money($amt) . '!');
    } else {
      mono_log($pdo, $gameId, $me['id'], (int)$game['turn_index'] + 1, 'system', 0, $pend['tile'], "{$me['name']} passou no leilão.");
    }
    $pend['idx']++;
    $msg = 'Lance registrado.';
    if ($pend['idx'] >= count($order)) {
      // encerra: maior lance com saldo leva
      $tile = (int)$pend['tile'];
      $won = null;
      $bids = $pend['bids'];
      usort($bids, fn($a, $b) => $b['amt'] <=> $a['amt']);
      foreach ($bids as $b0) {
        $br = mono_myrow($pdo, $gameId, (int)$b0['pid']);
        if ($br && (int)$br['money'] >= (int)$b0['amt'] && !(int)$br['bankrupt']) { $won = $b0; break; }
      }
      if ($won) {
        $pdo->prepare('UPDATE mono_players SET money = money - ? WHERE game_id = ? AND player_id = ?')->execute([$won['amt'], $gameId, $won['pid']]);
        $pdo->prepare('UPDATE mono_deeds SET owner_player_id = ? WHERE game_id = ? AND tile = ?')->execute([$won['pid'], $gameId, $tile]);
        $wn = $pdo->prepare('SELECT name FROM players WHERE id = ?'); $wn->execute([$won['pid']]);
        mono_log($pdo, $gameId, $won['pid'], (int)$game['turn_index'] + 1, 'buy', -$won['amt'], $tile, $wn->fetch()['name'] . " arrematou {$tiles[$tile]['name']} por " . fmt_money($won['amt']) . '!');
        $msg = 'Arrematado por ' . fmt_money($won['amt']) . '!';
      } else {
        mono_log($pdo, $gameId, null, (int)$game['turn_index'] + 1, 'system', 0, $tile, "Leilão de {$tiles[$tile]['name']} sem lances válidos.");
        $msg = 'Sem lances: segue no banco.';
      }
      $pdo->prepare('UPDATE mono_games SET pending_json = NULL WHERE id = ?')->execute([$gameId]);
      mono_advance($pdo, $roomId, $gameId);
    } else {
      $pdo->prepare('UPDATE mono_games SET pending_json = ? WHERE id = ?')->execute([json_encode($pend), $gameId]);
    }
    mono_bump($pdo, $roomId);
    $pdo->commit();
    json_out(['ok' => true, 'message' => $msg] + mono_payload($pdo, $gameId, $roomId));
  }

  // ---------- BUILD ----------
  if ($action === 'build') {
    if ($game['status'] !== 'playing') json_error('Partida encerrada.');
    if ((int)$mygp['bankrupt']) json_error('Você faliu.');
    $tile = (int)($in['tile'] ?? -1);
    if (!isset($tiles[$tile])) json_error('Terreno inválido.');
    $pdo->beginTransaction();
    $deeds = mono_deeds($pdo, $gameId);
    if (!mono_can_build($deeds, $tiles, $tile, (int)$me['id'], $why)) { $pdo->rollBack(); json_error($why ?? 'Não pode construir.'); }
    $cost = (int)$tiles[$tile]['house_cost'] * ((int)$deeds[$tile]['houses'] >= 4 ? 2 : 1);
    $fresh = mono_myrow($pdo, $gameId, (int)$me['id']);
    if ((int)$fresh['money'] < $cost) { $pdo->rollBack(); json_error('Dinheiro insuficiente (' . fmt_money($cost) . ').'); }
    $pdo->prepare('UPDATE mono_players SET money = money - ? WHERE id = ?')->execute([$cost, $fresh['id']]);
    $pdo->prepare('UPDATE mono_deeds SET houses = houses + 1 WHERE game_id = ? AND tile = ?')->execute([$gameId, $tile]);
    $lvl = (int)$deeds[$tile]['houses'] + 1;
    mono_log($pdo, $gameId, $me['id'], (int)$game['turn_index'] + 1, 'build', -$cost, $tile, "{$me['name']} construiu " . ($lvl >= 5 ? 'HOTEL' : "casa $lvl") . " em {$tiles[$tile]['name']} (-" . fmt_money($cost) . ").");
    mono_bump($pdo, $roomId);
    $pdo->commit();
    json_out(['ok' => true, 'message' => 'Construído!'] + mono_payload($pdo, $gameId, $roomId));
  }

  // ---------- SELL (venda pareada reversa: só do(s) nível(is) mais alto(s) do grupo) ----------
  if ($action === 'sell') {
    if ($game['status'] !== 'playing') json_error('Partida encerrada.');
    if ((int)$mygp['bankrupt']) json_error('Você faliu.');
    $tile = (int)($in['tile'] ?? -1);
    if (!isset($tiles[$tile]) || $tiles[$tile]['kind'] !== 'prop') json_error('Terreno inválido.');
    $pdo->beginTransaction();
    $deeds = mono_deeds($pdo, $gameId);
    if (mono_owner_of($deeds, $tile) !== (int)$me['id']) { $pdo->rollBack(); json_error('Não é seu.'); }
    $lvl = (int)$deeds[$tile]['houses'];
    if ($lvl <= 0) { $pdo->rollBack(); json_error('Nada para vender.'); }
    foreach (mono_group_tiles($tiles, $tiles[$tile]['color_group']) as $o) {
      if ((int)$deeds[$o]['houses'] > $lvl) { $pdo->rollBack(); json_error('Venda primeiro dos terrenos mais altos do grupo.'); }
    }
    $refund = ($lvl >= 5) ? (int)$tiles[$tile]['house_cost'] : (int)floor((int)$tiles[$tile]['house_cost'] / 2);
    $pdo->prepare('UPDATE mono_players SET money = money + ? WHERE id = ?')->execute([$refund, $mygp['id']]);
    $pdo->prepare('UPDATE mono_deeds SET houses = houses - 1 WHERE game_id = ? AND tile = ?')->execute([$gameId, $tile]);
    mono_log($pdo, $gameId, $me['id'], (int)$game['turn_index'] + 1, 'build', $refund, $tile, "{$me['name']} vendeu construção em {$tiles[$tile]['name']} (+" . fmt_money($refund) . ").");
    mono_bump($pdo, $roomId);
    $pdo->commit();
    json_out(['ok' => true, 'message' => 'Vendido!'] + mono_payload($pdo, $gameId, $roomId));
  }

  // ---------- MORTGAGE ----------
  if ($action === 'mortgage' || $action === 'unmortgage') {
    if ($game['status'] !== 'playing') json_error('Partida encerrada.');
    if ((int)$mygp['bankrupt']) json_error('Você faliu.');
    $tile = (int)($in['tile'] ?? -1);
    if (!isset($tiles[$tile]) || !in_array($tiles[$tile]['kind'], ['prop', 'station', 'utility'], true)) json_error('Terreno inválido.');
    $pdo->beginTransaction();
    $deeds = mono_deeds($pdo, $gameId);
    if (mono_owner_of($deeds, $tile) !== (int)$me['id']) { $pdo->rollBack(); json_error('Não é seu.'); }
    if ($action === 'mortgage') {
      if (!empty($deeds[$tile]['mortgaged'])) { $pdo->rollBack(); json_error('Já hipotecado.'); }
      if ((int)$deeds[$tile]['houses'] > 0) { $pdo->rollBack(); json_error('Venda as construções antes (ação vender).'); }
      $v = (int)$tiles[$tile]['mortgage'];
      $pdo->prepare('UPDATE mono_players SET money = money + ? WHERE id = ?')->execute([$v, $mygp['id']]);
      $pdo->prepare('UPDATE mono_deeds SET mortgaged = 1 WHERE game_id = ? AND tile = ?')->execute([$gameId, $tile]);
      mono_log($pdo, $gameId, $me['id'], (int)$game['turn_index'] + 1, 'money', $v, $tile, "{$me['name']} hipotecou {$tiles[$tile]['name']} (+" . fmt_money($v) . ").");
      $msg = 'Hipotecado!';
    } else {
      if (empty($deeds[$tile]['mortgaged'])) { $pdo->rollBack(); json_error('Não está hipotecado.'); }
      $v = (int)round((int)$tiles[$tile]['mortgage'] * 1.1);
      $fresh = mono_myrow($pdo, $gameId, (int)$me['id']);
      if ((int)$fresh['money'] < $v) { $pdo->rollBack(); json_error('Faltam ' . fmt_money($v) . ' (+10% juros).'); }
      $pdo->prepare('UPDATE mono_players SET money = money - ? WHERE id = ?')->execute([$v, $mygp['id']]);
      $pdo->prepare('UPDATE mono_deeds SET mortgaged = 0 WHERE game_id = ? AND tile = ?')->execute([$gameId, $tile]);
      mono_log($pdo, $gameId, $me['id'], (int)$game['turn_index'] + 1, 'money', -$v, $tile, "{$me['name']} resgatou {$tiles[$tile]['name']} (-" . fmt_money($v) . ").");
      $msg = 'Resgatado!';
    }
    mono_bump($pdo, $roomId);
    $pdo->commit();
    json_out(['ok' => true, 'message' => $msg] + mono_payload($pdo, $gameId, $roomId));
  }

  // ---------- BANKRUPT ----------
  if ($action === 'bankrupt') {
    if ((int)$mygp['money'] >= 0) json_error('Só pode falir devendo. Hipoteque ou negocie antes.', 409);
    $pdo->beginTransaction();
    $pdo->prepare('UPDATE mono_players SET bankrupt = 1, pending_type = NULL, pending_data = NULL WHERE id = ?')->execute([$mygp['id']]);
    $pdo->prepare('UPDATE mono_deeds SET owner_player_id = NULL, houses = 0, mortgaged = 0 WHERE game_id = ? AND owner_player_id = ?')->execute([$gameId, $me['id']]);
    mono_log($pdo, $gameId, $me['id'], (int)$game['turn_index'] + 1, 'system', 0, $mygp['position'], "{$me['name']} FALIU! Bens voltaram ao banco.");
    $wasCurrent = ((int)$game['current_player_id'] === (int)$me['id']);
    if ($wasCurrent) mono_advance($pdo, $roomId, $gameId);
    mono_bump($pdo, $roomId);
    $pdo->commit();
    $pl = mono_payload($pdo, $gameId, $roomId);
    if (mono_check_end($pdo, $roomId, $gameId, $tiles)) $pl = mono_payload($pdo, $gameId, $roomId);
    json_out(['ok' => true, 'message' => 'Falência declarada.'] + $pl);
  }

  // ---------- JAIL ----------
  if ($action === 'jail_pay') {
    if ((int)$game['current_player_id'] !== (int)$me['id']) json_error('Não é sua vez.', 403);
    if ((int)$mygp['in_jail'] <= 0) json_error('Você não está preso.');
    if (!empty($mygp['pending_type'])) json_error('Resolva a pendência.', 409);
    $pdo->beginTransaction();
    $fresh = mono_myrow($pdo, $gameId, (int)$me['id']);
    if ((int)$fresh['money'] < MONO_JAIL_FINE) { $pdo->rollBack(); json_error('Sem dinheiro para a fiança.'); }
    $pdo->prepare('UPDATE mono_players SET money = money - ?, in_jail = 0 WHERE id = ?')->execute([MONO_JAIL_FINE, $mygp['id']]);
    $pdo->prepare('UPDATE mono_games SET jackpot = jackpot + ? WHERE id = ?')->execute([MONO_JAIL_FINE, $gameId]);
    mono_log($pdo, $gameId, $me['id'], (int)$game['turn_index'] + 1, 'money', -MONO_JAIL_FINE, $mygp['position'], "{$me['name']} pagou fiança e saiu da prisão.");
    mono_bump($pdo, $roomId);
    $pdo->commit();
    json_out(['ok' => true, 'message' => 'Livre! Agora gire os dados.'] + mono_payload($pdo, $gameId, $roomId));
  }

  if ($action === 'jail_card') {
    if ((int)$game['current_player_id'] !== (int)$me['id']) json_error('Não é sua vez.', 403);
    if ((int)$mygp['in_jail'] <= 0) json_error('Você não está preso.');
    if ((int)$mygp['jail_free'] <= 0) json_error('Sem carta de saída livre.');
    $pdo->beginTransaction();
    $pdo->prepare('UPDATE mono_players SET in_jail = 0, jail_free = jail_free - 1 WHERE id = ?')->execute([$mygp['id']]);
    mono_log($pdo, $gameId, $me['id'], (int)$game['turn_index'] + 1, 'jail', 0, $mygp['position'], "{$me['name']} usou saída livre!");
    mono_bump($pdo, $roomId);
    $pdo->commit();
    json_out(['ok' => true, 'message' => 'Livre! Agora gire os dados.'] + mono_payload($pdo, $gameId, $roomId));
  }

  // ---------- TRADES ----------
  if ($action === 'trade_offer') {
    if ($game['status'] !== 'playing') json_error('Partida encerrada.');
    if ((int)$mygp['bankrupt']) json_error('Você faliu.');
    $to = (int)($in['to'] ?? 0);
    $gt = array_values(array_filter(array_map('intval', explode(',', (string)($in['give_tiles'] ?? ''))), fn($t) => isset($tiles[$t])));
    $wt = array_values(array_filter(array_map('intval', explode(',', (string)($in['want_tiles'] ?? ''))), fn($t) => isset($tiles[$t])));
    $gm = max(0, (int)($in['give_money'] ?? 0));
    $wm = max(0, (int)($in['want_money'] ?? 0));
    if ($to <= 0 || $to === (int)$me['id']) json_error('Destinatário inválido.');
    if (empty($gt) && $gm <= 0) json_error('Ofereça algo.');
    if (empty($wt) && $wm <= 0) json_error('Peça algo.');
    $trow = $pdo->prepare('SELECT id FROM mono_players WHERE game_id = ? AND player_id = ? AND bankrupt = 0');
    $trow->execute([$gameId, $to]);
    if (!$trow->fetch()) json_error('Jogador indisponível.');
    $pdo->beginTransaction();
    $deeds = mono_deeds($pdo, $gameId);
    foreach ($gt as $t) {
      if (mono_owner_of($deeds, $t) !== (int)$me['id'] || !empty($deeds[$t]['mortgaged']) || (int)$deeds[$t]['houses'] > 0) {
        $pdo->rollBack(); json_error("Terreno $t indisponível (precisa estar livre e sem construção).");
      }
    }
    $fresh = mono_myrow($pdo, $gameId, (int)$me['id']);
    if ((int)$fresh['money'] < $gm) { $pdo->rollBack(); json_error('Sem saldo para ofertar.'); }
    $turn = (int)$game['turn_index'];
    $pdo->prepare('INSERT INTO mono_offers (game_id, from_player_id, to_player_id, give_tiles, give_money, want_tiles, want_money, expires_turn) VALUES (?,?,?,?,?,?,?,?)')
      ->execute([$gameId, $me['id'], $to, implode(',', $gt), $gm, implode(',', $wt), $wm, $turn + 10]);
    mono_log($pdo, $gameId, $me['id'], $turn, 'system', 0, null, "{$me['name']} propôs troca.");
    mono_bump($pdo, $roomId);
    $pdo->commit();
    json_out(['ok' => true, 'message' => 'Proposta enviada!'] + mono_payload($pdo, $gameId, $roomId));
  }

  if ($action === 'trade_accept' || $action === 'trade_decline') {
    $oid = (int)($in['offer_id'] ?? 0);
    $pdo->beginTransaction();
    $o = $pdo->prepare("SELECT * FROM mono_offers WHERE id = ? AND game_id = ? AND status = 'pending'");
    $o->execute([$oid, $gameId]);
    $of = $o->fetch();
    if (!$of) { $pdo->rollBack(); json_error('Proposta inválida.', 404); }
    if ((int)$of['to_player_id'] !== (int)$me['id']) { $pdo->rollBack(); json_error('Só o destinatário decide.', 403); }
    if ($action === 'trade_decline') {
      $pdo->prepare("UPDATE mono_offers SET status = 'declined' WHERE id = ?")->execute([$oid]);
      mono_log($pdo, $gameId, $me['id'], (int)$game['turn_index'], 'system', 0, null, "{$me['name']} recusou uma troca.");
      mono_bump($pdo, $roomId);
      $pdo->commit();
      json_out(['ok' => true, 'message' => 'Troca recusada.'] + mono_payload($pdo, $gameId, $roomId));
    }
    // accept: revalida tudo
    $deeds = mono_deeds($pdo, $gameId);
    $gt = array_filter(array_map('intval', explode(',', $of['give_tiles'])));
    $wt = array_filter(array_map('intval', explode(',', $of['want_tiles'])));
    foreach ($gt as $t) {
      if (mono_owner_of($deeds, $t) !== (int)$of['from_player_id'] || !empty($deeds[$t]['mortgaged']) || (int)$deeds[$t]['houses'] > 0) {
        $pdo->prepare("UPDATE mono_offers SET status = 'expired' WHERE id = ?")->execute([$oid]);
        $pdo->commit();
        json_error('Terrenos mudaram de dono. Proposta expirada.', 409);
      }
    }
    foreach ($wt as $t) {
      if (mono_owner_of($deeds, $t) !== (int)$me['id'] || !empty($deeds[$t]['mortgaged']) || (int)$deeds[$t]['houses'] > 0) {
        $pdo->prepare("UPDATE mono_offers SET status = 'expired' WHERE id = ?")->execute([$oid]);
        $pdo->commit();
        json_error('Seus terrenos mudaram. Proposta expirada.', 409);
      }
    }
    $rf = mono_myrow($pdo, $gameId, (int)$of['from_player_id']);
    $rt = mono_myrow($pdo, $gameId, (int)$me['id']);
    if ((int)$rf['money'] < (int)$of['give_money'] || (int)$rt['money'] < (int)$of['want_money']) {
      $pdo->prepare("UPDATE mono_offers SET status = 'expired' WHERE id = ?")->execute([$oid]);
      $pdo->commit();
      json_error('Saldo insuficiente. Proposta expirada.', 409);
    }
    $pdo->prepare('UPDATE mono_players SET money = money - ? + ? WHERE id = ?')->execute([$of['give_money'], $of['want_money'], $rf['id']]);
    $pdo->prepare('UPDATE mono_players SET money = money - ? + ? WHERE id = ?')->execute([$of['want_money'], $of['give_money'], $rt['id']]);
    foreach ($gt as $t) $pdo->prepare('UPDATE mono_deeds SET owner_player_id = ? WHERE game_id = ? AND tile = ?')->execute([$me['id'], $gameId, $t]);
    foreach ($wt as $t) $pdo->prepare('UPDATE mono_deeds SET owner_player_id = ? WHERE game_id = ? AND tile = ?')->execute([$of['from_player_id'], $gameId, $t]);
    $pdo->prepare("UPDATE mono_offers SET status = 'accepted' WHERE id = ?")->execute([$oid]);
    mono_log($pdo, $gameId, $me['id'], (int)$game['turn_index'], 'system', 0, null, "{$me['name']} aceitou uma troca!");
    mono_bump($pdo, $roomId);
    $pdo->commit();
    json_out(['ok' => true, 'message' => 'Troca feita!'] + mono_payload($pdo, $gameId, $roomId));
  }

  // ---------- NEW ----------
  if ($action === 'new') {
    if (!(int)$me['is_host']) json_error('So o anfitriao pode criar nova partida.');
    $r = $pdo->prepare('SELECT * FROM rooms WHERE id = ?');
    $r->execute([$roomId]);
    $roomNow = $r->fetch();
    if (($roomNow['game_type'] ?? 'life') !== 'mono') json_error('Sala do Jogo da Vida.');
    $pdo->beginTransaction();
    $ps = $pdo->prepare('SELECT * FROM players WHERE room_id = ? AND is_connected = 1 ORDER BY id ASC');
    $ps->execute([$roomId]);
    $players = $ps->fetchAll();
    if (count($players) < 2) { $pdo->rollBack(); json_error('Precisa de 2+ jogadores conectados.'); }
    if (count($players) > 4) $players = array_slice($players, 0, 4);
    $tiles = mono_tiles($pdo);
    $pdo->prepare("INSERT INTO mono_games (room_id, status) VALUES (?, 'playing')")->execute([$roomId]);
    $ng = (int)$pdo->lastInsertId();
    foreach ($players as $pl) {
      $pdo->prepare('INSERT INTO mono_players (game_id, player_id, money, position) VALUES (?,?,?,0)')->execute([$ng, $pl['id'], MONO_START_MONEY]);
    }
    foreach ($tiles as $t => $row) {
      if (in_array($row['kind'], ['prop', 'station', 'utility'], true)) {
        $pdo->prepare('INSERT INTO mono_deeds (game_id, tile) VALUES (?, ?)')->execute([$ng, $t]);
      }
    }
    $first = (int)$players[0]['id'];
    $pdo->prepare('UPDATE mono_games SET current_player_id = ? WHERE id = ?')->execute([$first, $ng]);
    $pdo->prepare("UPDATE rooms SET status='playing', current_turn_player_id=?, turn_number=1, started_at=NOW(), finished_at=NULL WHERE id=?")->execute([$first, $roomId]);
    mono_bump($pdo, $roomId);
    mono_log($pdo, $ng, null, 0, 'system', 0, 0, 'Nova partida do Banco Imobiliário!');
    $pdo->commit();
    json_out(['ok' => true, 'game_id' => $ng] + mono_payload($pdo, $ng, $roomId));
  }

  json_error('Acao desconhecida.', 400);
} catch (PDOException $e) {
  if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
  json_error('Erro no banco. Tente de novo.', 500);
}
