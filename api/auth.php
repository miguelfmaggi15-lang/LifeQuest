<?php
// LIFE QUEST — contas opcionais (guest continua sem conta)
declare(strict_types=1);
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../lib/helpers.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') json_out(['ok' => true]);
$in = req_body();
$action = strtolower(trim($in['action'] ?? ''));
$pdo = db();

function valid_username(string $u): bool {
  return (bool)preg_match('/^[A-Za-z0-9_]{3,20}$/', $u);
}

try {
  if ($action === 'register') {
    $name = trim($in['username'] ?? '');
    $pass = (string)($in['password'] ?? '');
    if (!valid_username($name)) json_error('Usuario: 3 a 20 letras/numeros/_ .');
    if (strlen($pass) < 6 || strlen($pass) > 72) json_error('Senha: minimo 6 caracteres.');
    $st = $pdo->prepare('SELECT id FROM users WHERE username = ?');
    $st->execute([$name]);
    if ($st->fetch()) json_error('Esse nome ja esta em uso.');
    $hash = password_hash($pass, PASSWORD_BCRYPT);
    $pdo->prepare('INSERT INTO users (username, pass_hash) VALUES (?, ?)')->execute([$name, $hash]);
    $uid = (int)$pdo->lastInsertId();
    $tok = rand_token(64);
    $pdo->prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))')->execute([$uid, $tok]);
    json_out(['ok' => true, 'user_id' => $uid, 'username' => $name, 'auth_token' => $tok]);
  }

  if ($action === 'login') {
    $name = trim($in['username'] ?? '');
    $pass = (string)($in['password'] ?? '');
    usleep(300000); // atrasa brute-force básico
    $st = $pdo->prepare('SELECT id, username, pass_hash FROM users WHERE username = ? LIMIT 1');
    $st->execute([$name]);
    $u = $st->fetch();
    if (!$u || !password_verify($pass, $u['pass_hash'])) json_error('Credenciais invalidas.', 401);
    $tok = rand_token(64);
    $pdo->prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))')->execute([$u['id'], $tok]);
    // limpa sessões expiradas do usuário (higiene, sem tabela extra)
    $pdo->prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at < NOW()')->execute([$u['id']]);
    json_out(['ok' => true, 'user_id' => (int)$u['id'], 'username' => $u['username'], 'auth_token' => $tok]);
  }

  if ($action === 'logout') {
    $tok = trim($in['auth_token'] ?? '');
    if ($tok !== '') $pdo->prepare('DELETE FROM sessions WHERE token = ?')->execute([$tok]);
    json_out(['ok' => true]);
  }

  if ($action === 'me') {
    $u = auth_user($pdo, trim($in['auth_token'] ?? ''));
    if (!$u) json_error('Sessao invalida.', 401);
    json_out(['ok' => true, 'user_id' => (int)$u['id'], 'username' => $u['username']]);
  }

  json_error('Acao desconhecida.', 400);
} catch (PDOException $e) {
  json_error('Erro no banco. Tente de novo.', 500);
}
