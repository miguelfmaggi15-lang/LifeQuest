# Jogo da Vida: maquete artesanal

O rework de 04/10/2026 altera somente a apresentação da ilha e dos jogadores do Jogo da Vida. Banco Imobiliário, regras, APIs, dados, controles e câmeras permanecem intactos.

## Direção implementada

- Base recortada em camadas de madeira, costa de pequenas pedras e água de papel pintado.
- Terreno verde sálvia, montanhas de argila com topos arredondados, pinheiros torneados e copas macias. Menos vegetação junto à trilha para reforçar a hierarquia visual.
- Arquitetura com quinas suavizadas, telhados espessos com vincos, molduras pintadas, toldos e floreiras. Centros e reservas dos edifícios mantidos.
- Casas do percurso com borda de madeira clara, pintura com pequenas variações, números e pictogramas em tinta escura. As dez categorias mantêm seus identificadores e rótulos.
- Roleta de madeira pintada, com setores e numerais legíveis.
- Carrinhos conversíveis de quatro ou seis lugares, carroceria na cor do jogador, identificação no capô, bancos de madeira, rodas com cubos e pinos com rostos simples. Família excedente conserva o indicador +N.
- Acabamento fosco, sem metalização. Paleta principal: sálvia `#83a16c`, água `#438b98`, madeira `#b17d51`, papel `#fff4d9`, telha `#d77960`, tinta `#28434a`.

Geometrias estáticas agrupadas por material; carroceria e cada pino usam uma malha combinada. Rodas e grupos de passageiros mantêm suas animações independentes. Recursos compartilhados são reutilizados nas atualizações da família e liberados ao sair da cena. Não há novos downloads de bibliotecas, texturas externas ou processamento de imagem em execução.

## Verificação

- 15 testes passaram: regressões de multiplayer e controles existentes, mais quatro testes do mapa visual com Three.js real e relógio/GPU simulados.
- A fixture `scripts/fixtures/island-layout.json` foi capturada do código publicado anterior, commit `fbee21cc984939c63bb39052abfcad27318e3e85`, antes da edição. Compara todas as posições, rotações, índices, tipos e rótulos dos tabuleiros de 40/60 casas, as reservas dos marcos e as posições de quatro jogadores.
- Verificados: alternância 40/60, movimentação animada e reduzida, carros 4/6, família excedente, atualização de passageiros e descarte dos recursos compartilhados.
- Inspeção em navegador: visão geral a 1440×1000, aproximação dos carros, viewport móvel a 390×844, zoom, navegação e movimento. Isso não substitui medição de FPS em aparelho físico.
- Comparação de renderização na mesma visão geral, com quatro jogadores: chamadas de desenho 326 → 259; geometrias residentes 248 → 90; triângulos 220.343 → 217.073. Contagens de um quadro, não promessa de FPS.
- A imagem `life-island.png` foi recapturada diretamente do novo mapa, com transparência, para manter a prévia estática coerente. A prévia interativa mantém as câmeras existentes.

## Arquivos de produto

- `public/js/island-map.js`: trilha, iluminação, roleta, modelos de jogadores e recursos gráficos.
- `public/js/island-world.js`: terreno, base, água, marcos, edifícios e vegetação.
- `public/assets/images/life-island.png`: prévia estática do mapa atualizado.
- `public/game.html`: somente versões dos dois scripts e da imagem para renovar o cache.

As mesmas alterações visuais estão espelhadas no projeto original, em `../js/island-map.js`, `../js/island-world.js`, `../assets/images/life-island.png` e `../index.html`. Testes e documentação ficam no checkout `hosted`.
