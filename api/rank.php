<?php
// LIFE QUEST — rankings vitalícios (Vida, Imobiliário, Global)
declare(strict_types=1);
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../lib/helpers.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') json_out(['ok' => true]);
$in = req_body();
$scope = strtolower(trim($in['scope'] ?? $_GET['scope'] ?? 'global'));
if (!in_array($scope, ['life', 'mono', 'global'], true)) $scope = 'global';
$pdo = db();

try {
  $tbl = $scope === 'life' ? 'rank_life' : ($scope === 'mono' ? 'rank_mono' : 'rank_global');
  $rows = $pdo->query("SELECT r.*, u.username FROM $tbl r JOIN users u ON u.id = r.user_id ORDER BY r.total_wealth DESC, r.vitorias DESC LIMIT 10")->fetchAll();
  $me = null;
  $tok = trim($in['auth_token'] ?? '');
  if ($tok !== '' && ($u = auth_user($pdo, $tok))) {
    $my = $pdo->prepare("SELECT * FROM $tbl WHERE user_id = ?");
    $my->execute([$u['id']]);
    if ($row = $my->fetch()) {
      $pos = $pdo->prepare("SELECT COUNT(*)+1 p FROM $tbl WHERE total_wealth > ? OR (total_wealth = ? AND vitorias > ?)");
      $pos->execute([$row['total_wealth'], $row['total_wealth'], $row['vitorias']]);
      $me = ['pos' => (int)$pos->fetch()['p']] + $row;
      $me['username'] = $u['username'];
    } else {
      $me = ['pos' => null, 'username' => $u['username'], 'total_wealth' => 0, 'partidas' => 0, 'vitorias' => 0];
    }
  }
  json_out(['ok' => true, 'scope' => $scope, 'top' => $rows, 'me' => $me]);
} catch (PDOException $e) {
  json_error('Erro no banco. Tente de novo.', 500);
}
