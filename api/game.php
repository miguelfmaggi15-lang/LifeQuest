<?php
// LIFE QUEST — API da partida (turnos, roleta, escolhas, fim)
declare(strict_types=1);
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../lib/engine.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') json_out(['ok' => true]);
$in = req_body();
$action = strtolower(trim($in['action'] ?? $_GET['action'] ?? ''));
$pdo = db();

function game_payload(PDO $pdo, int $gameId, int $roomId): array {
  $g = $pdo->prepare('SELECT * FROM games WHERE id = ?');
  $g->execute([$gameId]);
  $game = $g->fetch();
  $q = $pdo->prepare('SELECT gp.*, p.name, p.avatar_color, p.avatar_emoji, p.is_host, p.is_connected, c.name AS career_name, h.name AS house_name FROM game_players gp JOIN players p ON p.id = gp.player_id LEFT JOIN careers c ON c.id = gp.career_id LEFT JOIN houses h ON h.id = gp.house_id WHERE gp.game_id = ? ORDER BY p.id ASC');
  $q->execute([$gameId]);
  $plist = $q->fetchAll();
  $f = $pdo->prepare('SELECT ga.*, p.name AS pname FROM game_actions ga LEFT JOIN players p ON p.id = ga.player_id WHERE ga.game_id = ? ORDER BY ga.id DESC LIMIT 25');
  $f->execute([$gameId]);
  $feed = array_reverse($f->fetchAll());
  $r = $pdo->prepare('SELECT * FROM rooms WHERE id = ?');
  $r->execute([$roomId]);
  return ['game' => $game, 'players' => $plist, 'feed' => $feed, 'room' => $r->fetch()];
}

try {
  // ---- acoes publicas (sem token): ranking / historico ----
  if ($action === 'ranking') {
    $rows = $pdo->query("SELECT p.name, COUNT(*) AS titulos, MAX(gp.final_wealth) AS maior FROM game_players gp JOIN players p ON p.id=gp.player_id JOIN games g ON g.id=gp.game_id WHERE g.status='finished' AND g.winner_player_id=gp.player_id GROUP BY p.name ORDER BY titulos DESC, maior DESC LIMIT 10")->fetchAll();
    $top = $pdo->query('SELECT p.name, gp.final_wealth, gp.game_id FROM game_players gp JOIN players p ON p.id=gp.player_id WHERE gp.final_wealth IS NOT NULL ORDER BY gp.final_wealth DESC LIMIT 5')->fetchAll();
    $tot = $pdo->query('SELECT COUNT(*) c FROM games')->fetch()['c'];
    json_out(['ok' => true, 'winners' => $rows, 'richest' => $top, 'total_games' => (int)$tot]);
  }
  if ($action === 'history') {
    $code = strtoupper(trim($in['code'] ?? ''));
    if ($code !== '') {
      $st = $pdo->prepare('SELECT id FROM rooms WHERE code = ?');
      $st->execute([$code]);
      $rm = $st->fetch();
      if (!$rm) json_error('Sala nao encontrada.', 404);
      $q = $pdo->prepare('SELECT g.*, (SELECT COUNT(*) FROM game_players WHERE game_id=g.id) AS jogadores FROM games g WHERE g.room_id = ? ORDER BY g.id DESC LIMIT 20');
      $q->execute([$rm['id']]);
      json_out(['ok' => true, 'games' => $q->fetchAll()]);
    }
    $q = $pdo->query('SELECT g.id, r.code, g.status, g.total_turns, g.started_at, (SELECT COUNT(*) FROM game_players WHERE game_id=g.id) AS jogadores FROM games g JOIN rooms r ON r.id=g.room_id ORDER BY g.id DESC LIMIT 20');
    json_out(['ok' => true, 'games' => $q->fetchAll()]);
  }

  $token = trim($in['token'] ?? '');
  $me = get_player_by_token($pdo, $token);
  if (!$me) json_error('Sessao invalida. Entre na sala de novo.', 401);
  touch_player($pdo, (int)$me['id']);
  $roomId = (int)$me['room_id'];

  if ($action === 'start') {
    if (!(int)$me['is_host']) json_error('So o anfitriao pode iniciar.');
    $st = $pdo->prepare('SELECT * FROM rooms WHERE id = ?');
    $st->execute([$roomId]);
    $room = $st->fetch();
    if ($room['status'] === 'playing') {
      $g = active_game_for_room($pdo, $roomId);
      if ($g) json_out(['ok' => true, 'game_id' => (int)$g['id'], 'already' => true]);
    }
    $ps = $pdo->prepare('SELECT * FROM players WHERE room_id = ? AND is_connected = 1 ORDER BY id ASC');
    $ps->execute([$roomId]);
    $players = $ps->fetchAll();
    if (count($players) < 2) json_error('Chame pelo menos 2 jogadores para comecar.');
    if (count($players) > 4) $players = array_slice($players, 0, 4);
    $gtype0 = ($room['game_type'] ?? 'life') === 'mono' ? 'mono' : 'life';
    if ($gtype0 !== 'life') json_error('Banco Imobiliario chega na Etapa 1. Crie uma sala do Jogo da Vida.');
    $pdo->beginTransaction();
    $bsize = board_size_valid($room['board_size'] ?? 60);
    $pdo->prepare('INSERT INTO games (room_id, status, board_size, game_type) VALUES (?, \'playing\', ?, ?)')->execute([$roomId, $bsize, $gtype0]);
    $gameId = (int)$pdo->lastInsertId();
    foreach ($players as $pl) {
      $pdo->prepare('INSERT INTO game_players (game_id, player_id, money, position) VALUES (?,?,?,0)')->execute([$gameId, $pl['id'], START_MONEY]);
    }
    $first = (int)$players[0]['id'];
    $pdo->prepare('UPDATE games SET current_player_id = ? WHERE id = ?')->execute([$first, $gameId]);
    $pdo->prepare("UPDATE rooms SET status = 'playing', current_turn_player_id = ?, turn_number = 1, started_at = NOW(), finished_at = NULL WHERE id = ?")->execute([$first, $roomId]);
    bump_room($pdo, $roomId);
    log_action($pdo, $gameId, null, 0, 'system', 0, 0, 'Partida iniciada! Boa jornada!');
    $pdo->commit();
    json_out(['ok' => true, 'game_id' => $gameId] + game_payload($pdo, $gameId, $roomId));
  }

  // Nova partida pode partir de sala finalizada (sem jogo ativo)
  if ($action === 'new') {
    if (!(int)$me['is_host']) json_error('So o anfitriao pode criar nova partida.');
    $r = $pdo->prepare('SELECT * FROM rooms WHERE id = ?');
    $r->execute([$roomId]);
    $roomNow = $r->fetch();
    $pdo->beginTransaction();
    $ps = $pdo->prepare('SELECT * FROM players WHERE room_id = ? AND is_connected = 1 ORDER BY id ASC');
    $ps->execute([$roomId]);
    $players = $ps->fetchAll();
    if (count($players) < 2) { $pdo->rollBack(); json_error('Precisa de 2+ jogadores conectados.'); }
    $bsize2 = board_size_valid($roomNow['board_size'] ?? 60);
    $gtype2 = ($roomNow['game_type'] ?? 'life') === 'mono' ? 'mono' : 'life';
    if ($gtype2 !== 'life') { $pdo->rollBack(); json_error('Banco Imobiliario chega na Etapa 1.'); }
    $pdo->prepare('INSERT INTO games (room_id, status, board_size, game_type) VALUES (?, \'playing\', ?, ?)')->execute([$roomId, $bsize2, $gtype2]);
    $ng = (int)$pdo->lastInsertId();
    foreach ($players as $pl) {
      $pdo->prepare('INSERT INTO game_players (game_id, player_id, money, position) VALUES (?,?,?,0)')->execute([$ng, $pl['id'], START_MONEY]);
    }
    $first = (int)$players[0]['id'];
    $pdo->prepare('UPDATE games SET current_player_id = ? WHERE id = ?')->execute([$first, $ng]);
    $pdo->prepare("UPDATE rooms SET status='playing', current_turn_player_id=?, turn_number=1, started_at=NOW(), finished_at=NULL WHERE id=?")->execute([$first, $roomId]);
    bump_room($pdo, $roomId);
    log_action($pdo, $ng, null, 0, 'system', 0, 0, 'Nova partida iniciada!');
    $pdo->commit();
    json_out(['ok' => true, 'game_id' => $ng] + game_payload($pdo, $ng, $roomId));
  }

  // Todas as demais exigem partida ativa (ou ultima p/ state)
  $game = active_game_for_room($pdo, $roomId);
  if (!$game && ($action === 'state')) {
    $game = latest_game_for_room($pdo, $roomId);
    if (!$game) {
      $st = $pdo->prepare('SELECT * FROM rooms WHERE id = ?');
      $st->execute([$roomId]);
      json_out(['ok' => true, 'room' => $st->fetch(), 'game' => null, 'players' => [], 'feed' => []]);
    }
    json_out(['ok' => true] + game_payload($pdo, (int)$game['id'], $roomId));
  }
  if (!$game) json_error('Nenhuma partida ativa.', 404);
  $gameId = (int)$game['id'];

  // helper: minha linha
  $gpq = $pdo->prepare('SELECT * FROM game_players WHERE game_id = ? AND player_id = ? LIMIT 1');
  $gpq->execute([$gameId, $me['id']]);
  $mygp = $gpq->fetch();
  if (!$mygp) json_error('Voce nao esta nesta partida.', 403);

  if ($action === 'state') {
    $payload = game_payload($pdo, $gameId, $roomId);
    $payload['me_id'] = (int)$me['id'];
    $payload['ok'] = true;
    // carreiras/casas para escolhas
    $payload['careers'] = $pdo->query('SELECT * FROM careers ORDER BY salary DESC')->fetchAll();
    $payload['houses'] = $pdo->query('SELECT * FROM houses ORDER BY price ASC')->fetchAll();
    json_out($payload);
  }

  if ($action === 'spin') {
    if ($game['status'] !== 'playing') json_error('Partida encerrada.');
    if ((int)$game['current_player_id'] !== (int)$me['id']) json_error('Aguarde o turno do jogador atual.', 403);
    if ($mygp['finished']) json_error('Voce ja se aposentou. Aguarde os outros.');
    if (!empty($mygp['pending_type'])) json_error('Resolva sua carta antes de girar.', 409);
    $pdo->beginTransaction();
    // trava simples: rele turno atual
    $g = $pdo->prepare('SELECT current_player_id, status FROM games WHERE id = ?');
    $g->execute([$gameId]);
    $gf = $g->fetch();
    if ((int)$gf['current_player_id'] !== (int)$me['id']) { $pdo->rollBack(); json_error('Turno passou. Aguarde.', 409); }
    $spin = random_int(1, 10);
    $bsize = board_size_valid($game['board_size'] ?? 60);
    $finPos = $bsize - 1;
    $newPos = min($finPos, (int)$mygp['position'] + $spin);
    $pdo->prepare('UPDATE game_players SET position = ?, last_spin = ? WHERE id = ?')->execute([$newPos, $spin, $mygp['id']]);
    [$type, $label] = tile_at($newPos, $bsize);
    $turn = (int)$game['turn_index'] + 1;
    $pname = $me['name'];
    log_action($pdo, $gameId, $me['id'], $turn, 'spin', $spin, $newPos, "$pname girou $spin e foi para $newPos ($label).");
    // recarrega gp
    $gpq->execute([$gameId, $me['id']]);
    $gp = $gpq->fetch();
    $event = ['tile' => $type, 'label' => $label, 'spin' => $spin, 'pos' => $newPos, 'need_choice' => false];
    $needChoice = false;

    if ($type === 'payday') {
      $r = do_payday($pdo, $gp, $gameId, $turn, $pname);
      $event['gain'] = $r['gain'];
      $event['text'] = "Dia de pagamento! Voce recebeu " . fmt_money($r['gain']) . ".";
    } elseif ($type === 'imposto') {
      $gpq->execute([$gameId, $me['id']]); $gp = $gpq->fetch();
      $tax = (int)round(((int)$gp['money']) * 0.10);
      $tax = max(1000, $tax);
      $pdo->prepare('UPDATE game_players SET money = money - ? WHERE id = ?')->execute([$tax, $gp['id']]);
      log_action($pdo, $gameId, $me['id'], $turn, 'money', -$tax, $newPos, "$pname pagou impostos " . fmt_money($tax) . ".");
      $event['loss'] = $tax;
      $event['text'] = "Impostos! Voce pagou " . fmt_money($tax) . ".";
    } elseif ($type === 'familia') {
      if ($newPos === 16 && empty($gp['spouse'])) {
        // Casamento! Esposa entra no carro (pino 2) e vale +$5.000 no final
        $pdo->prepare('UPDATE game_players SET spouse = 1 WHERE id = ?')->execute([$gp['id']]);
        log_action($pdo, $gameId, $me['id'], $turn, 'spouse', 1, $newPos, "$pname casou! A esposa entrou no carro (+$5.000 na riqueza final).");
        $event['text'] = "Casamento! Sua esposa entrou no carro (+$5.000 na riqueza final).";
        $event['spouse'] = true;
      } else {
        $cost = 5000;
        $bonusChef = false;
        if (!empty($gp['career_id'])) {
          $cs = $pdo->prepare('SELECT name FROM careers WHERE id = ?'); $cs->execute([$gp['career_id']]);
          if (($cs->fetch()['name'] ?? '') === 'Chef') $bonusChef = true;
        }
        $pdo->prepare('UPDATE game_players SET children_count = children_count + 1, money = money - ? WHERE id = ?')->execute([$cost, $gp['id']]);
        if ($bonusChef) $pdo->prepare('UPDATE game_players SET money = money + 3000 WHERE id = ?')->execute([$gp['id']]);
        log_action($pdo, $gameId, $me['id'], $turn, 'child', 1, $newPos, "$pname ganhou um filho! (-" . fmt_money($cost) . ($bonusChef ? ' +bonus Chef $3.000' : '') . ")");
        $event['text'] = "Familia cresceu! +1 filho (vale $10.000 na riqueza final). Custo " . fmt_money($cost) . ".";
        $event['child'] = true;
      }
    } elseif ($type === 'sorte' || $type === 'evento') {
      $kind = $type === 'sorte' ? "'sorte','positivo'" : "'positivo','negativo'";
      $card = $pdo->query("SELECT * FROM cards WHERE kind IN ($kind) ORDER BY RAND() LIMIT 1")->fetch();
      $val = (int)$card['effect_money'];
      // bonus / protecao por carreira
      $cn = '';
      if (!empty($gp['career_id'])) {
        $cs = $pdo->prepare('SELECT name FROM careers WHERE id = ?'); $cs->execute([$gp['career_id']]);
        $cn = $cs->fetch()['name'] ?? '';
      }
      if ($val < 0 && $cn === 'Medica') { $val = (int)round($val / 2); $card['title'] .= ' (plano Medica: metade)'; }
      if ($val > 0 && $cn === 'Fotografa') $val += 1500;
      if ($val > 0 && $type === 'sorte' && $cn === 'Desenvolvedor') $val += 4000;
      $pdo->prepare('UPDATE game_players SET money = money + ? WHERE id = ?')->execute([$val, $gp['id']]);
      log_action($pdo, $gameId, $me['id'], $turn, 'event', $val, $newPos, "$pname: {$card['title']} (" . fmt_money($val) . ")");
      $event['card'] = $card; $event['value'] = $val;
      $event['text'] = $card['title'] . ' — ' . $card['description'];
    } elseif ($type === 'carreira') {
      $opts = $pdo->query('SELECT * FROM careers ORDER BY RAND() LIMIT 2')->fetchAll();
      $pdo->prepare('UPDATE game_players SET pending_type = ?, pending_data = ? WHERE id = ?')->execute(['career', json_encode(['options' => array_column($opts, 'id')]), $gp['id']]);
      $needChoice = true;
      $event['need_choice'] = true; $event['choice_kind'] = 'career'; $event['options'] = $opts;
      $event['text'] = 'Escolha sua carreira! Ela define seu salario.';
    } elseif ($type === 'casa') {
      // oferece a casa da regiao (faixas por tamanho do tabuleiro)
      $houseId = 1;
      if ($bsize === 60) { if ($newPos >= 46) $houseId = 4; elseif ($newPos >= 32) $houseId = 3; elseif ($newPos >= 13) $houseId = 2; }
      else { if ($newPos >= 28) $houseId = 4; elseif ($newPos >= 19) $houseId = 3; elseif ($newPos >= 13) $houseId = 2; }
      // desconto engenheira
      $h = $pdo->prepare('SELECT * FROM houses WHERE id = ?'); $h->execute([$houseId]);
      $house = $h->fetch();
      $pdo->prepare('UPDATE game_players SET pending_type = ?, pending_data = ? WHERE id = ?')->execute(['house', json_encode(['house_id' => $houseId]), $gp['id']]);
      $needChoice = true;
      $event['need_choice'] = true; $event['choice_kind'] = 'house'; $event['house'] = $house;
      $event['text'] = "Corretora: {$house['name']} por " . fmt_money((int)$house['price']) . ". Comprar?";
    } elseif ($type === 'escolha') {
      $kind = ($newPos === 10) ? 'study' : 'invest';
      $pdo->prepare('UPDATE game_players SET pending_type = ?, pending_data = ? WHERE id = ?')->execute([$kind, json_encode(['pos' => $newPos]), $gp['id']]);
      $needChoice = true;
      $event['need_choice'] = true; $event['choice_kind'] = $kind;
      $event['text'] = $newPos === 10 ? 'Estudar (pague, ganhe +30% salario futuro) ou Trabalhar (receba agora)?' : 'Investimento ousado ou poupanca segura?';
    } elseif ($type === 'aposentadoria') {
      // finaliza jogador
      $gpq->execute([$gameId, $me['id']]); $gp = $gpq->fetch();
      // conta ordem
      $o = $pdo->prepare('SELECT COUNT(*) c FROM game_players WHERE game_id = ? AND finished = 1');
      $o->execute([$gameId]);
      $order = (int)$o->fetch()['c'] + 1;
      $tmp = array_merge($gp, ['finish_order' => $order]);
      $wealth = calc_final_wealth($tmp, $pdo);
      $pdo->prepare('UPDATE game_players SET finished = 1, finish_order = ?, final_wealth = ? WHERE id = ?')->execute([$order, $wealth, $gp['id']]);
      log_action($pdo, $gameId, $me['id'], $turn, 'finish', $wealth, 39, "$pname chegou a aposentadoria com riqueza " . fmt_money($wealth) . "!");
      $event['text'] = 'Aposentadoria! Riqueza final: ' . fmt_money($wealth) . '.';
      $event['wealth'] = $wealth;
    } elseif ($type === 'inicio') {
      $event['text'] = 'Inicio da jornada. Boa sorte!';
    }

    if (!$needChoice && $type !== 'aposentadoria') {
      advance_turn($pdo, $roomId, $gameId);
    } elseif ($type === 'aposentadoria') {
      $ended = check_game_end($pdo, $roomId, $gameId);
      if (!$ended) advance_turn($pdo, $roomId, $gameId);
    }
    bump_room($pdo, $roomId);
    $pdo->commit();
    json_out(['ok' => true, 'event' => $event] + game_payload($pdo, $gameId, $roomId));
  }

  if ($action === 'choice') {
    $choice = trim((string)($in['choice'] ?? ''));
    if ($choice === '' || empty($mygp['pending_type'])) json_error('Nenhuma escolha pendente.');
    $ptype = $mygp['pending_type'];
    $pdata = json_decode((string)$mygp['pending_data'], true) ?: [];
    $pdo->beginTransaction();
    $gpq->execute([$gameId, $me['id']]);
    $gp = $gpq->fetch();
    $turn = (int)$game['turn_index'] + 1;
    $pname = $me['name'];
    $msg = '';

    if ($ptype === 'career') {
      $cid = (int)$choice;
      if (!in_array($cid, $pdata['options'] ?? [], true)) json_error('Opcao invalida.');
      $cs = $pdo->prepare('SELECT * FROM careers WHERE id = ?'); $cs->execute([$cid]);
      $car = $cs->fetch();
      if (!$car) { $pdo->rollBack(); json_error('Carreira invalida.'); }
      $sal = career_bonus_salary($gp, $car);
      $pdo->prepare('UPDATE game_players SET career_id = ?, salary = ?, pending_type = NULL, pending_data = NULL WHERE id = ?')->execute([$cid, $sal, $gp['id']]);
      $msg = "$pname virou {$car['name']} (salario " . fmt_money($sal) . ").";
      log_action($pdo, $gameId, $me['id'], $turn, 'career', $sal, $gp['position'], $msg);
    } elseif ($ptype === 'study') {
      if ($choice === 'study') {
        $cost = 15000;
        $cn = '';
        if (!empty($gp['career_id'])) { $s = $pdo->prepare('SELECT name FROM careers WHERE id=?'); $s->execute([$gp['career_id']]); $cn = $s->fetch()['name'] ?? ''; }
        if ($cn === 'Professora') $cost = 7500;
        $pdo->prepare('UPDATE game_players SET money = money - ?, studied = 1, pending_type = NULL, pending_data = NULL WHERE id = ?')->execute([$cost, $gp['id']]);
        $msg = "$pname escolheu ESTUDAR (-" . fmt_money($cost) . ", +30% salario futuro).";
        log_action($pdo, $gameId, $me['id'], $turn, 'choice', -$cost, $gp['position'], $msg);
      } elseif ($choice === 'work') {
        $pdo->prepare('UPDATE game_players SET money = money + 10000, pending_type = NULL, pending_data = NULL WHERE id = ?')->execute([$gp['id']]);
        $msg = "$pname escolheu TRABALHAR (+" . fmt_money(10000) . " agora).";
        log_action($pdo, $gameId, $me['id'], $turn, 'choice', 10000, $gp['position'], $msg);
      } else { $pdo->rollBack(); json_error('Escolha invalida.'); }
    } elseif ($ptype === 'invest') {
      if ($choice === 'risk') {
        $win = random_int(0, 1) === 1;
        $cn = '';
        if (!empty($gp['career_id'])) { $s = $pdo->prepare('SELECT name FROM careers WHERE id=?'); $s->execute([$gp['career_id']]); $cn = $s->fetch()['name'] ?? ''; }
        if ($win) {
          $gain = 25000;
          if ($cn === 'Empresaria') $gain = (int)round($gain * 1.5);
          $pdo->prepare('UPDATE game_players SET money = money + ? WHERE id = ?')->execute([$gain - 10000, $gp['id']]);
          $msg = "$pname arriscou e LUCOU " . fmt_money($gain - 10000) . "!";
          log_action($pdo, $gameId, $me['id'], $turn, 'choice', $gain - 10000, $gp['position'], $msg);
        } else {
          $pdo->prepare('UPDATE game_players SET money = money - 10000 WHERE id = ?')->execute([$gp['id']]);
          $msg = "$pname arriscou e perdeu " . fmt_money(10000) . ".";
          log_action($pdo, $gameId, $me['id'], $turn, 'choice', -10000, $gp['position'], $msg);
        }
      } elseif ($choice === 'safe') {
        $pdo->prepare('UPDATE game_players SET money = money + 5000 WHERE id = ?')->execute([$gp['id']]);
        $msg = "$pname poupou com seguranca (+" . fmt_money(5000) . ").";
        log_action($pdo, $gameId, $me['id'], $turn, 'choice', 5000, $gp['position'], $msg);
      } else { $pdo->rollBack(); json_error('Escolha invalida.'); }
      $pdo->prepare('UPDATE game_players SET pending_type = NULL, pending_data = NULL WHERE id = ?')->execute([$gp['id']]);
    } elseif ($ptype === 'house') {
      $hid = (int)($pdata['house_id'] ?? 0);
      $h = $pdo->prepare('SELECT * FROM houses WHERE id = ?'); $h->execute([$hid]);
      $house = $h->fetch();
      if (!$house) { $pdo->rollBack(); json_error('Casa invalida.'); }
      if ($choice === 'buy') {
        $price = (int)$house['price'];
        $cn = '';
        if (!empty($gp['career_id'])) { $s = $pdo->prepare('SELECT name FROM careers WHERE id=?'); $s->execute([$gp['career_id']]); $cn = $s->fetch()['name'] ?? ''; }
        if ($cn === 'Engenheira') $price = max(0, $price - 3000);
        if ((int)$gp['money'] < $price) { $pdo->rollBack(); json_error('Dinheiro insuficiente para esta casa.'); }
        // vende anterior pelo valor de revenda (simplificado: soma ao dinheiro)
        if (!empty($gp['house_id'])) {
          $old = $pdo->prepare('SELECT sell_value FROM houses WHERE id=?'); $old->execute([$gp['house_id']]);
          $ov = (int)($old->fetch()['sell_value'] ?? 0);
          $pdo->prepare('UPDATE game_players SET money = money + ? WHERE id = ?')->execute([$ov, $gp['id']]);
        }
        $pdo->prepare('UPDATE game_players SET money = money - ?, house_id = ?, pending_type = NULL, pending_data = NULL WHERE id = ?')->execute([$price, $hid, $gp['id']]);
        $msg = "$pname comprou {$house['name']} por " . fmt_money($price) . ".";
        log_action($pdo, $gameId, $me['id'], $turn, 'house', -$price, $gp['position'], $msg);
      } elseif ($choice === 'skip') {
        $pdo->prepare('UPDATE game_players SET pending_type = NULL, pending_data = NULL WHERE id = ?')->execute([$gp['id']]);
        $msg = "$pname passou a oferta da casa.";
        log_action($pdo, $gameId, $me['id'], $turn, 'house', 0, $gp['position'], $msg);
      } else { $pdo->rollBack(); json_error('Escolha invalida.'); }
    } else { $pdo->rollBack(); json_error('Escolha desconhecida.'); }

    advance_turn($pdo, $roomId, $gameId);
    bump_room($pdo, $roomId);
    $pdo->commit();
    json_out(['ok' => true, 'message' => $msg] + game_payload($pdo, $gameId, $roomId));
  }

  if ($action === 'car') {
    // Upgrade para o carro de 6 lugares: $25.000, uma vez por partida, no proprio turno
    if ($game['status'] !== 'playing') json_error('Partida encerrada.');
    if ((int)$game['current_player_id'] !== (int)$me['id']) json_error('So na sua vez da para trocar de carro.', 403);
    if ($mygp['finished']) json_error('Voce ja se aposentou.');
    if (!empty($mygp['pending_type'])) json_error('Resolva sua carta antes.', 409);
    if ((int)$mygp['car_seats'] >= 6) json_error('Voce ja tem o carro de 6 lugares.');
    $pdo->beginTransaction();
    $up = $pdo->prepare('UPDATE game_players SET money = money - 25000, car_seats = 6 WHERE id = ? AND car_seats = 4 AND money >= 25000');
    $up->execute([$mygp['id']]);
    if ($up->rowCount() === 0) { $pdo->rollBack(); json_error('Dinheiro insuficiente: o carro de 6 lugares custa $25.000.'); }
    $turn = (int)$game['turn_index'] + 1;
    $msg = $me['name'] . ' trocou pelo carro de 6 lugares (-$25.000)! Agora cabe a familia toda.';
    log_action($pdo, $gameId, $me['id'], $turn, 'car', -25000, $mygp['position'], $msg);
    bump_room($pdo, $roomId);
    $pdo->commit();
    json_out(['ok' => true, 'message' => $msg] + game_payload($pdo, $gameId, $roomId));
  }

  json_error('Acao desconhecida.', 400);
} catch (PDOException $e) {
  if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
  json_error('Erro no banco. Tente de novo.', 500);
}
