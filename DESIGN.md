# LifeQuest — sistema visual da referência

## Direção aprovada
Landing de jogos em azul oceano com mapa vivo à direita; conteúdo em papel creme; processo de quatro passos; seleção de dois jogos em amarelo claro e azul claro; seção social azul-marinho; convite final amarelo; rodapé azul-marinho. A referência do chat é a autoridade visual, incluindo cores lúdicas, cartões arredondados e coroa da marca.

## Tokens implementados
| Papel | Valor |
|---|---|
| Fundo creme | `#fff9f0` |
| Superfície clara | `#fffdf8` |
| Texto principal | `#10274b` |
| Texto secundário | `#465e7c` |
| Navegação oceano | `#083c5d` |
| Seção social | `#10294d` |
| Rodapé | `#0d2542` |
| Ação principal | `#ffc641` |
| Jogo da Vida | `#ffeab9` |
| Banco Imobiliário | `#b6e1f5` |
| Ação positiva | `#00865e` |

Baloo 2 local, pesos 600 e 800, em títulos e marca; Segoe UI/system-ui em formulários e corpo. Fontes em `assets/fonts/`, sob SIL Open Font License. Títulos em cor sólida; amarelo destaca a frase da referência sem gradiente de texto.

## Componentes
- Botões principais amarelos, secundários azul/creme; mínimo de 44px de altura para interação.
- Cartões claros com sombra suave; sem vidro roxo, neon, blur decorativo ou filetes multicoloridos.
- Avatares preservam as letras e as cores das peças. A tinta escura melhora o contraste sem alterar avatar_color ou dados do servidor.
- HUDs compartilham superfícies claras, banner amarelo de turno próprio, abas locais a cada jogo e cartas de decisão creme.
- Foco visível, modal de conta com foco inicial e retorno, navegação por teclado nas abas, estados de carregamento e mensagens de erro existentes.
- Movimento: entrada curta no hero e respostas discretas às ações. Reduced-motion desliga movimento da interface.

## Ilhas e ilustrações
`js/island-map.js`, `js/island-world.js` e `js/monocity.js` não foram editados nesta entrega. `initShowcase` em app.js cria somente prévias transparentes: não altera os modelos nem a renderização da partida. Cada jogo conserva uma única cena ativa de sua API pública.

`assets/images/life-island.png` e `mono-island.png` são capturas transparentes dos tabuleiros originais, não pinturas ou imagens geradas. Servem como ilustração e fallback. Ícones vetoriais são símbolos SVG locais; peças decorativas pequenas são geometria CSS. A sala da galera é identificada como exemplo.

## Responsivo
Desktop 1440px: navegação horizontal, hero amplo, quatro passos, dois jogos e seis recursos. Mobile 390px: hero empilhado, passos e recursos em duas colunas, jogos em uma coluna, HUD abaixo do mapa. Elementos financeiros não quebram os dígitos em linhas diferentes.

## Arquivos de implementação
`index.html`, `css/style.css`, `css/island.css`, `css/game.css`, `css/motion.css`, `js/app.js`, `js/motion.js` e assets locais. Backend, polling, mapas e contratos de IDs existentes preservados. O ID duplicado antigo btnMonoRules passa a existir uma única vez, com um novo acionador por data-mono-rules na landing.

## Verificação e evidências
As capturas e o relatório ficam em `docs/screenshots/2026-10-02-ui-recap/`. Cream, bordas arredondadas e destaque amarelo são escolhas explícitas da referência, mesmo quando um detector genérico as sinaliza. O recorte dos modelos dentro dos cards de jogos é intencional; não há popover funcional nesses recortes.
