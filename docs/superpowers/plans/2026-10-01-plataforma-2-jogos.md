# Plano mestre — plataforma 2 jogos (execução nativa)

> Aprovado em chat em 2026-10-01. Método: nativo, por etapas com checkpoint testado.

**Goal:** Hub com Jogo da Vida + Banco Imobiliário completo, contas opcionais e 3 rankings vitalícios.

## Etapa 0 — Fundação (esta)
- `rooms.game_type`, `games.game_type` (`life`|default; `mono` futuro); `users`, `sessions`, `players.user_id NULL`.
- `api/auth.php` (register/login/logout/me, bcrypt, token 30d, rate-limit).
- Header com chip de conta + modal; apelido = username p/ logado, livre p/ guest; `game_type` no fluxo criar→lobby; start bloqueia `mono` com "chega na Etapa 1".
- Constraints: guest intacto; sem quebrar sessão de sala; prepared statements.
- Review: criar sala life/mono, login/logout, guest jogando, toggle game_type.

## Etapa 1 — Mono backend
- `mono_games/mono_players/mono_deeds` + seed 32 casas; `lib/mono.php` + `api/mono.php`
  (comprar, leilão c/ timeout, aluguel, casas/hotel, hipoteca, trocas, prisão, cartas, falência, fim).
- Constraints: tudo validado no servidor em transação; trava de turno; anti-jogo-infinito (40 rodadas).
- Review: sim até 3 falências, troca aceita/recusada, leilão timeout, hipoteca, prisão.

## Etapa 2 — Mono 3D + HUD
- `js/mono.js` + cidade Three.js (prédios por nível, bandeiras, dados 3D, tokens), HUD patrimônio, feed, flip, final.
- Constraints: mesma perf da ilha; fallback; reduced-motion.
- Review: screenshots desktop/mobile, drive, console limpo.

## Etapa 3 — Rankings
- `rank_life/rank_mono/rank_global`; crédito no finish (2+ logados distintos); endpoints + 3 abas; "+$X" no final; apelido travado.
- Review: 2 logados creditam; solo/guest não; ordenação e empates.

## Etapa 4 — Landing hub
- Hero 2 (cidade animada, selo NOVO, CTAs `game_type=mono`); trilhas; seletores Regras/Ranking; chip no header.
- Review: screenshots 2 heróis, criar sala guest/logado por jogo.

## Etapa 5 — Verificação final
- Partidas completas 2 jogos + 2 tamanhos, rankings, reseed, README, roteiro demo 4 PCs.

## Pacotes externos
- Remake visual da ilha pela outra IA (entregue no chat) → entra na Etapa 2 como anexo.
