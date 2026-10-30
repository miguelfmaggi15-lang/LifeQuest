# Life Quest

Site multiplayer público para jogar o Jogo da Vida e o Banco Imobiliário com amigos. Qualquer pessoa com o link pode abrir uma sala, escolher um apelido e convidar outros jogadores pelo código da sala; não é preciso criar conta.

## Como funciona

- `public/game.html` e os diretórios `public/css`, `public/js` e `public/assets` contêm o cliente original do jogo.
- `app/api/[...path]/route.ts` implementa os endpoints de sala e partida no Cloudflare Worker.
- `db/schema.ts` e `drizzle/` definem o D1 que guarda salas, sessões de jogador e o estado multiplayer.
- `/` carrega a interface do jogo; a API e a página compartilham a mesma origem.

As regras de turno são verificadas no servidor. O navegador mantém apenas o código/token da sessão para reconectar o jogador.

## Controles dos mapas

Nos dois jogos, arraste para mover a câmera e use a roda do mouse, pinça no celular ou os botões +/− para aproximar. Use Shift + arraste ou o botão Girar para rotacionar. Com o mapa focado, as setas movem a câmera e +/− ajustam o zoom. Visão geral mostra o tabuleiro inteiro; Seguir turno retoma o acompanhamento automático. Explorar o mapa mantém a câmera livre durante as atualizações da partida.

Rolagens recebidas pelo multiplayer animam os dados/roleta e o movimento para os convidados. O histórico inclui valores e posições autoritativos; reconexões não reproduzem rolagens antigas.

Validação local: `node --test scripts/multiplayer-regression.test.mjs scripts/map-controls.test.mjs`.

## Desenvolvimento e publicação

O projeto usa o starter Vinext do Sites. Dependências ficam registradas em `package-lock.json`; mudanças de esquema devem gerar uma nova migração Drizzle, sem editar migrações já publicadas. A publicação usa o fluxo Sites para enviar o código, aplicar migrações D1 e implantar o Worker.
