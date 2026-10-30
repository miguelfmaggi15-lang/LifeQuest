# LIFE QUEST — Jogo da Vida Digital 3D Multiplayer

## Jogar online

**[Abrir o Life Quest](https://miguelfmaggi15-lang.github.io/LifeQuest/)** — compartilhe este link com qualquer pessoa.

O GitHub Pages publica a entrada em `docs/index.html`, que encaminha para o [jogo hospedado](https://lifequest-jogo.efmm4maggi.chatgpt.site/). O multiplayer e o banco de dados continuam na hospedagem Cloudflare Worker/D1; o GitHub Pages serve apenas arquivos estáticos. O acesso ao jogo é público e permite jogar por apelido, sem criar conta.

Este repositório reúne duas versões do projeto:

- **Versão original PHP/MySQL:** os arquivos na raiz, com instalação via XAMPP descrita abaixo.
- **Versão web com Cloudflare Worker e D1:** código em [`hosted/`](hosted/README.md), incluindo os dois jogos e os testes automatizados. Consulte esse README para a arquitetura e o fluxo de publicação.

Para executar os testes de regressão da versão web, com Node.js 22.13 ou superior:

```sh
cd hosted
node --test scripts/multiplayer-regression.test.mjs scripts/map-controls.test.mjs scripts/island-visual.test.mjs
```

Credenciais, dependências instaladas, dados locais do banco e arquivos gerados não fazem parte do repositório.

Versao digital, reduzida e original do classico Jogo da Vida. Multiplayer online 2–4 jogadores, tabuleiro 3D com 40 casas, roleta 3D, carreiras, casas, familia, eventos, aposentadoria e ranking historico.

> Identidade propria (nao copia artes/marcas comerciais). Feito para o Hackathon: **funcionamento > logica > multiplayer > banco > UX > 3D**.

## Funcionalidades (checklist final)
- [x] Landing page + Como Jogar + Regras + Ranking
- [x] Criar sala (codigo 6 letras) + copiar codigo
- [x] Entrar por codigo + apelido unico (reconexao por nome)
- [x] Lobby 2–4 jogadores, host identificado, iniciar (min 2, max 4)
- [x] Multiplayer real: servidor PHP + MySQL fonte da verdade, polling 2s + `state_version`
- [x] Turnos `Turno de: NOME`, bloqueio fora do turno (403), destaque visual
- [x] Roleta 3D 1–10 com animacao desacelerando + numero no hub
- [x] Tabuleiro 3D 40 casas (inicio, payday, carreira, evento, sorte, casa, familia, imposto, escolha, aposentadoria)
- [x] Movimento animado casa-a-casa, pecas 3D por cor, sem sobreposicao total
- [x] 8 carreiras com salario + bonus unico, 4 casas, 16 cartas originais
- [x] Dinheiro validado no servidor (transacao, sem duplicar, sem negativo indevido)
- [x] Escolhas bonitas: carreira / estudar-trabalhar / risco-poupanca / comprar-casa
- [x] HUD: jogadores, seu painel, feed ao vivo (`Miguel girou 6` etc), acoes
- [x] Aposentadoria casa 39, riqueza = dinheiro + revenda casa + 10k/filho + bonus chegada
- [x] Tela final com ranking, estatisticas, confete + som, Nova Partida + Sair
- [x] Nova Partida mantem historico, reconexao por token, host automatico
- [x] MySQL 8 tabelas relacionadas + consultas uteis (ranking, historico, top fortunas, feed)
- [x] Responsivo (desktop/tablet/celular), acessibilidade (foco, aria, nao-so-cor, reduced-motion), som ON/OFF via WebAudio original
- [x] README + SQL completo para reinstalar

## Tecnologias
- **Interface:** HTML5 + CSS3 (CSS 3D perspectiva, sombras, relevo) + JavaScript vanilla (fetch/AJAX)
- **Regras:** PHP 8 (validacao servidor: turno, dinheiro, acoes, estado)
- **Persistencia:** MySQL/MariaDB via XAMPP (PDO + prepared statements)
- **Integracao:** polling inteligente 2s com `state_version` (estavel no XAMPP, sem WebSocket/Node)
- **3D:** Three.js (r128, vendored em `assets/js/three.min.js`, sem CDN/offline) — ilha rica (`js/island-world.js`: cordilheira com neve, cidade com janelas acesas + praça/fonte/igreja/escola com relógio, hospital azul com heliponto + ambulância, casinha branca de telhado vermelho com balão-coração, lago com ponte e patos, praia com palmeiras/guarda-sóis/píer/farol de feixe giratório, cascata com lago de espuma, lancha com rastro circulando a ilha, barcos, nuvens, pássaros, balão, pódio com troféu e fogos no fim). Estrada de pedra com meio-fio, casas com ícones brancos + números, roleta-estádio de 3 anéis, legenda de 7 categorias no canto. Caminho de 40 casas (curva CatmullRom; indice = `position` do servidor), roleta 3D central e carrinhos conversíveis que **aceleram/freiam de verdade** (smootherstep, rodas girando, inclinação na curva, poeira, chase-cam) com **pinos de motorista/esposa/filhos**. Fallback automatico para grade CSS 3D se WebGL indisponivel. Mesmo componente na landing (previa auto-girando) e no jogo (arraste gira, scroll zoom).
- **Bibliotecas externas:** nenhuma obrigatoria (zero dependencias). Fontes do sistema.

## Arquitetura
```
NAVEGADOR (HTML/CSS/JS) --fetch JSON--> PHP API --PDO--> MySQL
   landing/lobby/game/final      rooms.php / game.php    rooms, players, games,
   board 3D + roleta + feed      lib/engine.php          game_players, actions,
                                 lib/helpers.php         careers, houses, cards
Fluxo: servidor -> banco -> estado atualizado -> jogadores (polling)
```

## Banco de dados
Tabelas: `rooms` (+`board_size`, `game_type`), `players` (+`user_id`), `users` + `sessions` (contas opcionais, guest livre), `games` (+`board_size`, `game_type`), `game_players` (+`spouse`, `car_seats`), `game_actions`, `careers`, `houses`, `cards`, + **Banco Imobiliário**: `mono_tiles` (32), `mono_games`, `mono_players`, `mono_deeds`, `mono_offers`, `mono_actions`, `mono_cards` (migration 006), + **rankings vitalícios**: `rank_life`, `rank_mono`, `rank_global` (migration 007; só contam partidas com 2+ logados; guest não pontua).

## Demo em 4 PCs (2 jogos)
1. PC1 cria sala (escolhe o jogo no hero: Vida ou Imobiliário) e mostra o código.
2. PC2–4 entram com o código (guest ou logados para pontuar no ranking).
3. Host inicia; todos veem o mesmo tabuleiro 3D sincronizado.
4. Vida: roleta → decisões; Mono: dados → comprar/leiloar/construir.
5. Fim: tela de resultado + riqueza vitalícia (logados) + Nova partida. **Tabuleiro 60** (Maratona ~25min) ou **Clássico 40** (~10min, host escolhe no lobby via ação `size`; casa 39 vira Chegada).

## Landing e movimento
- Landing fiel à referência: Baloo 2 (Google Fonts com fallback), logo com coroa em SVG, hero full-bleed com a ilha 3D de fundo + scrim, trilha tracejada nos 8 passos, ícones SVG em tudo.
- Biblioteca única `css/motion.css` (só transform/opacity) + `js/motion.js` (reveals por IntersectionObserver, count-up de dinheiro, tudo desligável via `prefers-reduced-motion`): entrada orquestrada, transições de tela, banner com swap, feed slide-in, carta com flip, escolhas em cascata, ranking em cascata + troféu, varredura cinematográfica de entrada na partida (pulável). Riqueza = dinheiro + revenda da casa + $10k/filho + **$5k esposa** + bonus de chegada. Casa 16 (Casamento!) da a esposa (pino 2, sem custo); demais FAMILIA dao filhos. Acao `car`: carro de 6 lugares por $25.000 no proprio turno.
Ver `database/schema.sql` (criacao + seeds + consultas comentadas).

Consultas uteis:
- ranking campeoes (GROUP BY + MAX), top fortunas (ORDER BY final_wealth), historico por sala, feed da partida. Endpoint `api/game.php?action=ranking|history`.

## Como instalar (XAMPP Windows)
1. Instale XAMPP, inicie **Apache + MySQL**.
2. Copie esta pasta para `C:\xampp\htdocs\lifequest\` (ja inclui `index.html`, `api/`, `config/`, `lib/`, `css/`, `js/`, `database/`).
3. Importe o banco: no shell `Get-Content database\schema.sql | & "C:\xampp\mysql\bin\mysql.exe" -u root` ou via phpMyAdmin (`http://localhost/phpmyadmin`).
4. Acesse `http://localhost/lifequest/`.

## Como executar / demo rapida (4 PCs)
- PC1: Criar Sala (apelido) → anota codigo (ex `A7K9P2`) → Copiar.
- PC2/3/4: Entrar em Sala → codigo + apelido diferente → Lobby.
- PC1 (host): Iniciar Partida → todos veem o mesmo tabuleiro.
- Jogue: banner `Turno de: X`, GIRAR (ou Enter), carro anda, carta aparece, escolha se preciso. Outros veem feed + polling.
- Fim: todos na casa 39 → tela final com riqueza. Nova Partida (host) ou Sair.

## Como testar multiplayer + reconexao
- 5o jogador → `Sala cheia`. Codigo errado → `Sala nao encontrada`. Nome vazio → erro. Entrar apos inicio → bloqueado. Girar fora do turno → `Aguarde o turno`.
- Atualize a pagina (F5) → Entrar → Reconectar sessao salva (token localStorage) → volta na mesma posicao.
- Host sai → proximo conectado vira host automaticamente (`ensure_host`).
- Teste automatico completo: `python` loop spin/choice ate `finished` (validado: 4 jogadores, 31 turnos, vencedor correto).

## Sincronizacao
Cada mutacao faz `UPDATE rooms SET state_version+1` em transacao. Cliente guarda `lastVersion`; se igual, ignora render (economiza CPU). `heartbeat` a cada 15s + `last_seen` para host-migration (>60s = offline).

## Skills utilizadas (e para que)
- `brainstorming` — classificar Architectural, definir escopo reduzido (40 casas) e fluxo completo primeiro.
- `writing-plans` — plano por subsistemas (banco → API → jogo → frontend 3D → testes).
- `ui-ux-pro-max` — direcao visual (contraste 4.5:1, 44px touch, feedback, hierarquia, mobile-first). Fallback para defaults (sem match DB).
- `frontend-design` (principios) + `web-design-guidelines` — layout, tipografia 16px/1.5, estados (loading, vez, erro, reconectando).
- `accessibility` — aria-live feed, labels, foco visivel, nao-so-cor (icone+texto), reduced-motion.
- `webapp-testing` + `systematic-debugging` — testes de API (criar/entrar/iniciar/spin/choice/fim/nova), correcao bug `fetch()` duplo e `new` apos finish.
- `verification-before-completion` — checklist final + partida simulada 4 jogadores ate vitoria.
- `executing-plans` — implementacao tarefa-a-tarefa.

## Estrutura
```
/ (lifequest)
  index.html
  css/style.css, css/board3d.css
  js/api.js, sound.js, board.js, game.js, app.js
  api/rooms.php, api/game.php
  config/db.php  lib/helpers.php  lib/engine.php
  database/schema.sql
  README.md
```

## Decisoes tecnicas (para explicar ao professor)
1. **Polling 2s em vez de WebSocket:** XAMPP nao tem WS nativo; polling + version e estavel, simples e suficiente para turnos.
2. **CSS 3D em vez de Three.js:** zero dependencia, roda offline, 60fps, facil de explicar (rotateX/perspective), ainda com profundidade/sombra/luz/pecas/roleta/particulas.
3. **Servidor valida tudo:** roleta `random_int(1,10)` no PHP, turno checado em transacao, dinheiro nunca via cliente.
4. **Riqueza final transparente:** formula exibida na tela final, auditavel em `game_actions`.
5. **LocalStorage so p/ token:** banco e fonte verdade; LocalStorage nao substitui MySQL.

## Segurança
PDO prepared, validacao de codigo/nome/token, checagem host/turno/pendencia/fim, transacoes, sem SQL injection, sem dinheiro via cliente.
