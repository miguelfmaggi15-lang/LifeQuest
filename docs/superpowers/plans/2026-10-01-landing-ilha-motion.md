# Landing Fiel + Reforma da Ilha + Motion — Plano consolidado (execução única)

> REQUIRED SUB-SKILL: executing-plans (nativo). Aprovado em chat em 2026-10-01.

**Goal:** Landing fiel à referência + ilha com estrada de pedra/relevo/mar animado + movimento no site todo.

**Tech:** Three.js r128, vanilla CSS/JS, PHP/MySQL intactos (zero backend aqui).

## Parte 1 — landing (index.html, css/island.css, js/app.js, js/island-map.js)
- Fonte Baloo 2 (Google, display=swap, fallback sistema); logo coroa SVG + wordmark gradiente.
- Hero full-bleed: prévia 3D como fundo com scrim; CTAs com ícones SVG; mini-botões viram links.
- Steps com trilha tracejada + 8 ícones SVG; feats com ícones SVG (fim das letras).
- Prévia: preset próximo (dist ~55, pitch ~0.55, alvo sul) + auto-rotação lenta.
- Constraints: mesmos IDs de botões; máscara garante contraste AA; mobile empilha (ilha vira bloco 320px).

## Parte 2 — ilha (js/island-map.js, js/island-world.js)
- Fita de pedra sob a curva (largura 5.6, topo 2.5, textura com juntas) + meio-fio duplo (tubos).
- Casas y 1.9→3.0, saia pedra escura; carros/pinos/dust/anel sobem (base 3.5); waypointPos y 3.1→3.5.
- Falésias no anel, gramado 2 tons + tufos, manchas; tudo distToPath>5.
- Mar: disco raso turquesa + espuma pulsante; postes a cada 5 casas; aro dourado na casa do turno.
- Curva, índices, física e API intactos.

## Parte 3 — motion (novo css/motion.css, js/motion.js; edits app.js, game.js, island-map.js, index.html)
- Entrada orquestrada única; reveal por IntersectionObserver; transições de tela 220ms.
- Count-up de dinheiro, feed slide-in, flip da carta, cascata de escolhas, banner com swap animado, botão girando, cascata do ranking + troféu, varredura de entrada 1.5s pulável.
- Tudo transform/opacity; reduced-motion desliga (CSS + JS).

## Review Focus
- Scrim insuficiente → texto ilegível sobre a ilha (teste: screenshot + checagem visual).
- Fonte offline → fallback (teste: bloquear fonts.googleapis).
- Estrada cobre placas das casas (teste: screenshot — casas a 3.0, fita a 2.5).
- Animação trava polling (teste: count-up usa rAF curto, não bloqueia).
- Reduced-motion (teste: revisão de código do guard).
