# Banco Imobiliário — ilha-cidade costeira

Direção aprovada pelo dev em 02/10/2026: maquete costeira detalhada, mantendo as 32 posições e a API pública de `Monocity`.

## Entrega

- `js/monocity.js`: costa esculpida, oceano procedural, praia, palmeiras, píer, veleiros, farol; villas, comércio, skyline, banco com colunas, parque com ponte e praça com fonte.
- Lotes com nomes completos, faixas por grupo e preços; miniaturas de casas/hotel, bandeiras e hipotecas derivadas do estado do servidor.
- Tooltip, visão geral e câmera seguindo jogador; enquadramento responsivo, lista acessível e fallback textual de 32 casas.
- Geometria decorativa agrupada por material; descarte de recursos, listeners e observadores ao trocar de cena; pausa quando fora de tela.
- `css/island.css`: estilos locais dos controles, tooltip e fallback do Mono.
- `index.html`: versões de cache dos dois arquivos publicados.
- Publicado em `C:\xampp\htdocs\lifequest`.

## Evidências

Screenshots reais do navegador, sem imagens geradas:

| Vista | Antes | Depois |
| --- | --- | --- |
| Prévia desktop | [before-desktop.png](before-desktop.png) | [after-preview-desktop.png](after-preview-desktop.png) |
| Prévia mobile | [before-mobile.png](before-mobile.png) | [after-preview-mobile.png](after-preview-mobile.png) |
| Partida desktop | — | [after-desktop.png](after-desktop.png) |
| Mapa desktop | — | [after-map-desktop.png](after-map-desktop.png) |
| Partida mobile 390px | — | [after-mobile.png](after-mobile.png) |
| Resultado da partida | — | [finished-mobile.png](finished-mobile.png) |

## Verificação

- `node --check`: `js/monocity.js`, `js/mono.js`, `js/game.js`, sem erros.
- Rolar dados e comprar estação pela interface, com movimento visível.
- Continuação automatizada no navegador pela API real: 116 ações, 93 rolagens, 17 compras, 3 ações de leilão; fim pelo limite de rodadas, resultado de dois jogadores renderizado.
- Casas, hotel e hipoteca conferidos com payload ilustrativo somente em memória; cinco alternâncias de estado sem crescimento do número de meshes.
- Travessia 30 → 2 conferida; tooltip da casa 0 e controles de câmera funcionando.
- Reduced-motion: movimento/dados resolvidos em 0 ms, sem animação.
- WebGL indisponível: fallback mostrou 32 casas e nomes dos jogadores.
- Desktop 1440px e mobile 390px; nenhum overflow horizontal da página.
- Console: zero erros e zero avisos nas verificações.
- Detector visual: apenas dois avisos de gradiente de texto já existentes na landing, fora dos estilos adicionados.
- Limpeza: removidas somente as salas de QA 2 e 3, com dados relacionados por cascade. Zero jogadores de QA, zero partidas/ações Mono remanescentes; a sala preexistente foi preservada.

Esta entrega verifica o Banco Imobiliário. O remake da ilha do Jogo da Vida e o polimento geral continuam sendo tarefas separadas.
