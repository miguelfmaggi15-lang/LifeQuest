# Ilha Rica + Pinos + Física de Direção — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ilha 3D rica, carro conversível que acelera/freia de verdade com chase-cam, pinos de motorista/esposa/filhos, upgrade para carro de 6 lugares, esposa valendo +$5k.

**Architecture:** Backend ganha 2 colunas (`spouse`, `car_seats`) + ação `car`; mundo 3D sai de `island-map.js` para novo `island-world.js`; `drive()` vira travessia única por arco de curva com perfil de velocidade; pinos derivam de `spouse/children_count/car_seats` do payload (que já usa `SELECT gp.*`).

**Tech Stack:** Three.js r128 global vendored, PHP 8 + PDO, MariaDB, vanilla JS.

**Spec:** Plano aprovado em chat em 2026-10-01 (ilha rica + pinos + carro 6 + chase-cam + esposa +$5k).

## Global Constraints
- Nenhum PHP/SQL fora de `game.php`, `engine.php`, `schema.sql` + 1 migration.
- `Board.animateMove(players, pid, from, to)` mantém assinatura; `game.js` só ganha handler do botão carro.
- Índices de waypoint === `position` 0–39 do servidor (não mexer na curva base).
- Reduced-motion = deslocamento instantâneo; fallback sem-WebGL preservado.
- Preço do carro 6: **$25.000**, uma vez por partida; bônus esposa: **+$5.000**.

## Review Focus
- Jogador compra carro sem dinheiro → servidor recusa, botão explica por quê (teste: saldo 20k inicial bloqueia).
- Duplo-clique no botão carro → só 1 débito (teste: transação + checagem `car_seats=4` no UPDATE).
- 7+ familiares → 6 pinos + badge "+N", riqueza conta todos (teste: children=5 render).
- Polling durante `drive()` (3s) → `refresh()` pula enquanto `spinning=true` (já existe; não quebrar).
- Migração em banco já existente com partidas antigas → `DEFAULT 0/4` + `schema.sql` atualizado (teste: importar do zero).

---

### Task 1: Backend spouse + carro 6

**Files:**
- Modify: `database/schema.sql` (cols em `game_players` + seed intacto)
- Create: `database/migration_002_spouse_car.sql`
- Modify: `lib/engine.php` (calc_final_wealth +5000 esposa)
- Modify: `api/game.php` (familia: pos 16 → esposa; nova ação `car`)

**Interfaces:**
- Consumes: `game_players(children_count)`, `log_action()`, `bump_room()`, `advance_turn()`.
- Produces: payload passa a incluir `spouse`, `car_seats` (via `SELECT gp.*`); ação `car` retorna game_payload.

- [ ] **Step 1: Migrar banco local e testar colunas**
Run: `Get-Content database/migration_002_spouse_car.sql | & "C:\xampp\mysql\bin\mysql.exe" -u root`
Expected: sem erro; `DESCRIBE game_players` mostra `spouse`, `car_seats`.
- [ ] **Step 2: Regra esposa/filhos + ação carro em `game.php`**
```php
// familia: tile 16 = esposa (sem custo), demais = +1 filho (-$5.000, bônus Chef)
if ($newPos === 16 && empty($gp['spouse'])) { /* SET spouse=1; log 'casou! +esposa (+$5.000 na riqueza final)' */ }
```
Ação `car`: turno próprio, sem pendência, não-finalizado, `car_seats=4`, `money>=25000` (condição no UPDATE: `... WHERE id=? AND car_seats=4 AND money>=25000`, checar `rowCount()`).
- [ ] **Step 3: `engine.php` +$5k esposa**
```php
if (!empty($gp['spouse'])) $bonus += 5000;
```
- [ ] **Step 4: Teste API** — criar sala 2P, forçar `position=15` via SQL, spin → esposa; comprar carro com/sem dinheiro; `final_wealth` com esposa.
- [ ] **Step 5: Sync htdocs.**

### Task 2: `js/island-world.js` — mundo rico

**Files:** Create `js/island-world.js`; Modify `index.html` (1 script tag antes de `island-map.js`).

**Interfaces:**
- Produces: `window.IslandWorld.build(S)` — recebe contexto `S` e preenche mundo; `celebrate()` dispara fogos no finish.
- Conteúdo: cordilheira 3 picos+neve, cidade 12 prédios+janelas+praça+fonte+igreja+escola, lago com ponte, praia com palmeiras/guardas-sóis/píer/farol, pássaros + balão, bandeirolas START, pódio+troféu+fogos (via `IslandMap.celebrate()`).

- [ ] Step 1: criar arquivo com `build(S)` + `celebrate()`; index.html inclui tag.
- [ ] Step 2: screenshot 3 ângulos, conferir caminho livre (distToPath > 4.5 em tudo).
- [ ] Step 3: FPS: medir delta médio > 50fps desktop.

### Task 3: Carro + pinos + física + chase-cam em `island-map.js`

**Files:** Modify `js/island-map.js` (ensureCar→conversível+pinos; drive→travessia; follow→chase).

**Interfaces:**
- Consumes: `p.spouse`, `p.children_count`, `p.car_seats` em `setPlayers()`; `IslandWorld.build/celebrate`.
- Produces: mesma API pública + novo `celebrate()` chamado por `Board` quando `game.status==='finished'`.
- Física: `drive(pid,from,to)`: `u0=from/39→u1=to/39`, `dur=450+320*(to-from)`ms, easing de velocidade, yaw da tangente + roll, rodas girando, poeira no arranque, highlight da casa sob o carro, chase-cam com easing de volta; `setPlayers` redesenha pinos (pop-in no novo).
- Lugares: 4 = [motorista, esposa] + [filho, filho]; 6 = + [filho, filho]; extras → badge "+N".

- [ ] Step 1: implementar; `node --check`.
- [ ] Step 2: no navegador, drive 2→12 cronometrado (~4s), sem saltos; screenshot chase-cam.
- [ ] Step 3: pinos: spouse=1/children=3/car=6, screenshot; badge com children=8.

### Task 4: UI botão carro + textos

**Files:** `index.html` (`#finalSub`, botão `#btnCar` no painel Ações, modal regras), `js/game.js` (handler + enable/disable), `css/island.css` (estilos), `README.md`.

- [ ] Step 1: botão só habilitado no próprio turno, sem pendência, `car_seats=4`; texto de motivo quando desabilitado.
- [ ] Step 2: regras + finalSub citam esposa +$5k e carro 6 $25k.

### Task 5: Verificação final
- [ ] smoke API completo; partida simulada até `finished` com esposa no ranking.
- [ ] fallback: bloquear THREE → grade aparece e gira.
- [ ] mobile 390px sem corte; reduced-motion instantâneo.
- [ ] reseed limpo; README; screenshots finais.
