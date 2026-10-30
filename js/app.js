/* LIFE QUEST — navegacao + auth + modais */
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.body.classList.toggle('in-game', id === 'screen-game' || id === 'screen-mono' || id === 'screen-final');
  document.body.classList.toggle('mono-lobby', id === 'screen-lobby' && typeof Game !== 'undefined' && Game.session && Game.session.game_type === 'mono');
  if (id === 'screen-lobby') {
    const subtitle = document.getElementById('lobbySub');
    subtitle.dataset.g = ''; subtitle.textContent = 'Compartilhe o código e reúna até 3 amigos.';
  }
  window.scrollTo({ top: 0, behavior: window.Motion && Motion.reduced() ? 'auto' : 'smooth' });
  document.querySelectorAll('.games-menu').forEach(menu => menu.open = false);
  if (id === 'screen-landing') requestAnimationFrame(() => {
    const hero = document.getElementById('heroIsland');
    if (hero) hero.dispatchEvent(new Event('preview-resume'));
    const preview = document.getElementById('monoPreview');
    if (preview && !preview.querySelector('canvas') && window.Monocity) {
      preview.dataset.done = '';
      preview.dispatchEvent(new Event('preview-resume'));
    }
  });
}
let modalReturnFocus = null;
// Transparent showcase rendering only. Game scenes and map files stay intact.
function initShowcase(map, container) {
  const Renderer = THREE.WebGLRenderer;
  THREE.WebGLRenderer = function (options) {
    const renderer = new Renderer(Object.assign({}, options, { alpha: true }));
    renderer.domElement.dataset.showcase = 'true';
    const render = renderer.render;
    renderer.render = function (scene, camera) {
      const background = scene.background, fog = scene.fog, sea = [];
      scene.background = null; scene.fog = null;
      renderer.setClearColor(0x000000, 0);
      scene.traverse(object => {
        if (object.isMesh && object.material && object.material.isShaderMaterial && object.visible) {
          sea.push(object); object.visible = false;
        }
      });
      try { render.call(renderer, scene, camera); }
      finally { scene.background = background; scene.fog = fog; sea.forEach(object => object.visible = true); }
    };
    return renderer;
  };
  try { return map.initPreview(container, { hero: container.classList.contains('hero-bg'), showcase: container.classList.contains('game-art') }); }
  finally { THREE.WebGLRenderer = Renderer; }
}
function openModal(title, html) {
  if (!document.getElementById('modal').classList.contains('open')) modalReturnFocus = document.activeElement;
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = html;
  document.getElementById('modal').classList.add('open');
  requestAnimationFrame(() => {
    const el = document.querySelector('#modalBody input, #modalBody button') || document.getElementById('btnCloseModal');
    el.focus();
  });
}
function closeModal() { document.getElementById('modal').classList.remove('open'); if (modalReturnFocus && modalReturnFocus.isConnected) modalReturnFocus.focus(); }
const RULES_HTML = '<p><b>Objetivo:</b> chegar a aposentadoria (última casa: 39 na Clássica, 59 na Maratona) com a maior riqueza. Riqueza = dinheiro + valor de revenda da casa + $10.000 por filho + $5.000 esposa + bonus de chegada (1o +$15k, 2o +$8k, 3o +$4k).</p>' +
'<p><b>Tamanho:</b> o host escolhe no lobby <b>Clássico 40</b> (rápida, ~10min, ideal p/ demo) ou <b>Maratona 60</b> (completa, ~25min).</p>' +
'<p><b>Preparacao:</b> host cria a sala, compartilha o codigo de 6 letras, 2–4 entram no lobby, host inicia. Todos comecam com $20.000 e um carro de 4 lugares.</p>' +
'<p><b>Turnos:</b> o banner mostra <b>Turno de: NOME</b>. So quem esta na vez pode GIRAR. Roleta da 1–10, o carro acelera sozinho pela ilha, a casa resolve e o servidor passa o turno e sincroniza.</p>' +
'<p><b>Casas:</b> PAYDAY paga salario (ou $2.000 sem carreira) • CARREIRA oferece 2 profissoes • EVENTO/SORTE tira carta (+/-) • CASA oferece compra • CASAMENTO (16) traz a esposa p/ o carro • FAMILIA +1 filho (-$5.000) • IMPOSTO cobra 10% • ESCOLHA: Estudo/Trabalho e Risco/Poupanca • FIM aposenta.</p>' +
'<p><b>Carro da familia:</b> no seu turno voce pode comprar o carro de 6 lugares por $25.000 — cabem esposa + 4 filhos como pinos. Quem nao couber aparece como +N, mas a riqueza conta todos.</p>' +
'<p><b>Carreiras (bonus):</b> Desenvolvedor +$4k em SORTE • Medica paga metade em negativos • Designer +$2k no PAYDAY • Engenheira -$3k em casas • Chef +$3k em FAMILIA • Professora estuda pela metade • Fotografa +$1,5k em SORTE • Empresaria +50% em investimento.</p>' +
'<p><b>Reconexao:</b> atualizou? Use Reconectar. Host que sai passa a coroa automaticamente. Acoes fora do turno sao bloqueadas pelo servidor.</p>' +
'<p><b>Vitoria:</b> quando todos se aposentam, ranking por riqueza final. Nova Partida mantem o historico no banco.</p>';
let picked = { color: '#E84393', emoji: 'R' };

/* Conta opcional: guest joga normal; logado usa o username e pontua no ranking futuro */
const Auth = {
  token: null, user: null,
  load() { this.token = Store.get('auth', null); },
  save() { Store.set('auth', this.token); },
  async refresh() {
    this.load();
    if (!this.token) { this.user = null; this.syncChip(); this.syncNames(); return; }
    try {
      const j = await API.call('api/auth.php', { action: 'me', auth_token: this.token }, 'POST');
      this.user = { id: j.user_id, username: j.username };
    } catch (e) { this.token = null; this.user = null; this.save(); }
    this.syncChip(); this.syncNames();
  },
  syncChip() {
    const b = document.getElementById('btnAccount');
    if (b) b.textContent = this.user ? '@' + this.user.username : 'Entrar';
    document.querySelectorAll('[data-account="register"]').forEach(b => b.hidden = !!this.user);
  },
  syncNames() {
    ['createName', 'joinName'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (this.user) { el.value = this.user.username; el.disabled = true; el.title = 'Logado como ' + this.user.username; }
      else { el.disabled = false; el.title = ''; }
    });
  },
  openModal(mode) {
    if (this.user) {
      openModal('Sua conta', '<p><b>@' + escapeHtml(this.user.username) + '</b></p><p class="sub">Sua turma, suas histórias. Partidas com pelo menos dois jogadores com conta entram no ranking.</p><div class="row"><button class="btn btn-sm" id="btnLogout">Sair da conta</button></div>');
      document.getElementById('btnLogout').onclick = async () => {
        try { await API.call('api/auth.php', { action: 'logout', auth_token: this.token }, 'POST'); } catch (e) {}
        this.token = null; this.user = null; this.save(); this.syncChip(); this.syncNames(); closeModal(); toast('Conta desconectada.', 'ok');
      };
      return;
    }
    openModal(mode === 'register' ? 'Sua próxima história começa aqui' : 'Que bom te ver de novo!',
      '<div class="form"><label for="authUser">Usuario (3-20: letras, numeros, _)</label><input id="authUser" maxlength="20" autocomplete="username">' +
      '<label for="authPass">Senha (min. 6)</label><input id="authPass" type="password" autocomplete="current-password">' +
      '<div class="row"><button class="btn btn-sm btn-primary" id="btnLogin">Entrar</button>' +
      '<button class="btn btn-sm" id="btnRegister">Criar conta</button></div>' +
      '<span class="sub" id="authMsg" role="status"></span>' +
      '<p class="sub">A conta é grátis e opcional. Você também pode jogar só com seu apelido.</p></div>');
    const go = async (kind) => {
      const u = document.getElementById('authUser').value.trim();
      const p = document.getElementById('authPass').value;
      const m = document.getElementById('authMsg');
      m.textContent = '...';
      try {
        const j = await API.call('api/auth.php', { action: kind, username: u, password: p }, 'POST');
        this.token = j.auth_token; this.user = { id: j.user_id, username: j.username };
        this.save(); this.syncChip(); this.syncNames(); closeModal();
        toast('Bem-vindo, @' + j.username + '!', 'ok'); Sound.cash();
      } catch (e) { m.textContent = e.message; }
    };
    document.getElementById('btnLogin').onclick = () => go('login');
    document.getElementById('btnRegister').onclick = () => go('register');
    if (mode === 'register') {
      document.getElementById('authPass').autocomplete = 'new-password';
      document.getElementById('btnRegister').classList.add('btn-primary');
      document.getElementById('btnLogin').classList.remove('btn-primary');
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  Sound.init(); FX.init();
  Game.load();
  Auth.refresh();
  document.getElementById('btnAccount').onclick = () => { Sound.click(); Auth.openModal(); };
  document.querySelectorAll('[data-account]').forEach(b => b.onclick = () => { Sound.click(); Auth.openModal(b.dataset.account); });
  const scrollLanding = id => {
    if (!document.getElementById('screen-landing').classList.contains('active')) {
      Game.stopLobby(); Game.stopGame(); if (window.Mono) Mono.stopGame(); show('screen-landing');
    }
    document.querySelectorAll('.games-menu').forEach(menu => menu.open = false);
    document.getElementById(id).scrollIntoView({ behavior: Motion.reduced() ? 'auto' : 'smooth', block: 'start' });
  };
  document.querySelectorAll('[data-scroll]').forEach(b => b.onclick = e => { e.preventDefault(); scrollLanding(b.dataset.scroll); });
  document.querySelectorAll('[data-ranking]').forEach(b => b.onclick = () => window.openRankings('global'));
  const help = {
    faq: ['Dúvidas frequentes', '<h3>Preciso criar conta?</h3><p>Não. Escolha seu apelido e jogue. Uma conta permite participar dos rankings em partidas com dois ou mais jogadores com conta.</p><h3>Como convido minha turma?</h3><p>Crie uma sala e compartilhe o código de seis caracteres. Seus amigos escolhem “Tenho um código”.</p><h3>Quantas pessoas podem jogar?</h3><p>De 2 a 4 por sala. Funciona no computador, celular e tablet, direto no navegador.</p><h3>Atualizei a página. E agora?</h3><p>Escolha “Voltar à partida” no mesmo navegador para retomar sua sala.</p>'],
    rules: ['Como jogar', RULES_HTML],
    contact: ['Ajuda para sua turma', '<p>Se você não encontrou a sala, peça a quem criou o jogo para conferir o código. Todos devem acessar o mesmo endereço do LifeQuest.</p><p>Para problemas no teste em casa, fale com a pessoa que mantém o computador do servidor ligado.</p>'],
    terms: ['Sobre o LifeQuest', '<p>Um projeto independente de dois jogos de tabuleiro online para jogar com amigos. A conta é opcional, e as regras de cada jogo ficam disponíveis durante a partida.</p><p>Jogo da Vida e Banco Imobiliário são as modalidades disponíveis nesta versão.</p>'],
    privacy: ['Privacidade nesta versão', '<p>Seu navegador guarda os tokens usados para sua conta e para reconectar à sala. O servidor armazena apelidos, contas, partidas e ações do jogo.</p><p>As senhas de contas são armazenadas como hashes. Rankings exibem o nome de usuário e a pontuação das partidas elegíveis.</p><p>Em um dispositivo compartilhado, saia da conta e da sala quando terminar.</p>']
  };
  document.querySelectorAll('[data-help]').forEach(b => b.onclick = () => { const info = help[b.dataset.help]; openModal(info[0], info[1]); });
  Board.render(document.getElementById('board'), []);
  Board.rouletteNumbers();
  const roulette = document.getElementById('roulette');
  if (roulette && 'ResizeObserver' in window) new ResizeObserver(() => Board.rouletteNumbers()).observe(roulette);
  if ('ResizeObserver' in window) new ResizeObserver(entries => {
    document.documentElement.style.setProperty('--nav-height', entries[0].target.getBoundingClientRect().height + 'px');
  }).observe(document.querySelector('.topbar'));
  document.querySelectorAll('.size-pick').forEach(button => {
    button.setAttribute('role', 'radio');
    const sync = () => button.setAttribute('aria-checked', String(!!button.style.outline));
    new MutationObserver(sync).observe(button, { attributes: true, attributeFilter: ['style'] });
    sync();
  });

  document.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => {
    Sound.click();
    const v = b.dataset.nav;
    if (v === 'landing') { Game.stopLobby(); Game.stopGame(); if (window.Mono) Mono.stopGame(); show('screen-landing'); }
    if (v === 'create' || v === 'join') { show('screen-auth'); }
  }));
  Game.pendingType = 'life';
  document.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => {
    Sound.click();
    Game.pendingType = b.dataset.game === 'mono' ? 'mono' : 'life';
    show('screen-auth');
    const t = document.getElementById('authGame');
    if (t) t.textContent = Game.pendingType === 'mono' ? 'Sala de Banco Imobiliário' : 'Sala de Jogo da Vida';
  }));
  document.getElementById('btnMonoHow').onclick = (e) => { if (e) e.preventDefault(); openModal('Como Jogar — Banco Imobiliário',
    '<p>Role 2 dados, ande pelo anel, compre terrenos ou abra leilão. Complete grupos para construir casas e hotéis. Caia nos dos outros e pague aluguel. Último solvente vence!</p>'); };
  document.getElementById('btnMonoRules').onclick = (e) => { if (e) e.preventDefault(); openModal('Regras — Banco Imobiliário',
    '<p><b>Objetivo:</b> último solvente (ou mais rico na rodada 40).</p><p><b>Turno:</b> 2 dados, dupla joga de novo, 3 duplas = prisão. Passar na Partida: +$2.000.</p><p><b>Terrenos:</b> compre ou leiloem; aluguel ×2 com grupo; casas/hotel multiplicam.</p><p><b>Prisão:</b> dupla, $500 ou carta. <b>Falência:</b> devendo, hipoteque/negocie ou faleça.</p>'); };
  // prévia da cidade com lazy-load (só monta quando visível)
  try {
    const mp = document.getElementById('monoPreview');
    if (mp && window.Monocity && typeof THREE !== 'undefined') {
      const start = () => {
        if (!mp.dataset.done) {
          mp.dataset.done = '1';
          try {
            const r = initShowcase(window.Monocity, mp);
            const ld = document.getElementById('monoLoader');
            if (ld) ld.style.display = 'none';
          } catch (e) {}
        }
      };
      mp.addEventListener('preview-resume', start);
      if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver(es => { es.forEach(en => { if (en.isIntersecting) { start(); io.disconnect(); } }); });
        io.observe(mp);
      } else start();
    }
  } catch (e) {}
  document.getElementById('btnHow').onclick = (e) => { if (e) e.preventDefault(); openModal('Como Jogar', RULES_HTML); };
  const dR = document.getElementById('btnDemoRules'); if (dR) dR.onclick = () => openModal('Regras', RULES_HTML);
  const dR2 = document.getElementById('btnDemoRules2'); if (dR2) dR2.onclick = (e) => { if (e) e.preventDefault(); openModal('Regras', RULES_HTML); };
  const navGo = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = (e) => { e.preventDefault(); fn(); }; };
  navGo('navHow', () => scrollLanding('howSection'));
  navGo('navRules', () => openModal('Regras', RULES_HTML));
  navGo('navAbout', () => scrollLanding('aboutSection'));
  // IslandMap owns one scene. Reuse it between the hero and the interactive card.
  try {
    const hero = document.getElementById('heroIsland');
    const card = document.getElementById('lifePreview');
    if (hero && window.IslandMap && typeof THREE !== 'undefined') {
      const activate = container => {
        if (!document.getElementById('screen-landing').classList.contains('active')) return;
        if (container.querySelector('canvas[data-showcase]')) return;
        initShowcase(window.IslandMap, container);
        document.getElementById('heroLoader').style.display = 'none';
      };
      hero.addEventListener('preview-resume', () => activate(hero));
      hero.addEventListener('pointerenter', () => activate(hero));
      if (card) {
        card.addEventListener('pointerenter', () => activate(card));
        let heroVisible = true, cardVisible = false;
        if ('IntersectionObserver' in window) {
          const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
              if (entry.target === hero) heroVisible = entry.isIntersecting;
              else cardVisible = entry.isIntersecting;
            });
            if (heroVisible) activate(hero);
            else if (cardVisible) activate(card);
          }, { rootMargin: '100px', threshold: 0 });
          observer.observe(hero); observer.observe(card);
        }
      }
      activate(hero);
    } else {
      const ld = document.getElementById('heroLoader');
      if (ld) ld.style.display = 'none';
    }
  } catch (e) { /* sem WebGL: landing segue normal */ }
  document.getElementById('btnRulesTop').onclick = () => {
    if (Game.session && Game.session.game_type === 'mono') document.getElementById('btnMonoRules').click();
    else openModal('Regras', RULES_HTML);
  };
  document.getElementById('btnRulesIn').onclick = () => openModal('Regras', RULES_HTML);
  document.getElementById('btnCloseModal').onclick = closeModal;
  document.getElementById('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  document.getElementById('btnSound').onclick = () => Sound.toggle();
  window.openRankings = async (scope) => {
    scope = ['life', 'mono', 'global'].includes(scope) ? scope : 'global';
    const titles = { life: 'Jogo da Vida', mono: 'Banco Imobiliário', global: 'Geral (2 jogos)' };
    try {
      const j = await API.call('api/rank.php', { scope, auth_token: Auth.token }, 'GET');
      let h = '<div class="row" style="margin-bottom:10px">' +
        ['life', 'mono', 'global'].map(s => '<button class="btn btn-sm' + (s === scope ? ' btn-primary' : ' btn-ghost') + '" data-rscope="' + s + '">' + (s === 'life' ? 'Vida' : s === 'mono' ? 'Imobiliário' : 'Geral') + '</button>').join('') + '</div>';
      h += '<h3>' + titles[scope] + ' — riqueza vitalícia</h3>';
      h += j.top.length ? j.top.map((r, i) => '<p><b>' + (i + 1) + 'º @' + escapeHtml(r.username) + '</b> — ' + money(r.total_wealth) + ' <span class="sub">(' + r.partidas + ' partidas, ' + r.vitorias + ' vitórias)</span></p>').join('')
        : '<p class="sub">Ninguém pontuou ainda. Jogue logado com +1 amigo!</p>';
      if (j.me) h += '<p style="margin-top:10px"><b>Sua posição:</b> ' + (j.me.pos ? '#' + j.me.pos : '—') + ' • ' + money(j.me.total_wealth) + '</p>';
      else h += '<p class="sub">Entre na conta para pontuar.</p>';
      h += '<p class="sub">Só contam partidas com 2+ jogadores logados. Guests jogam de graça, sem pontuar.</p>';
      openModal('Ranking', h);
      document.querySelectorAll('[data-rscope]').forEach(b => { b.onclick = () => window.openRankings(b.dataset.rscope); });
    } catch (e) { toast(e.message, 'err'); }
  };
  document.getElementById('btnRankingTop').onclick = () => window.openRankings('global');
  document.querySelectorAll('.avatar-pick').forEach(b => b.onclick = () => {
    picked = { color: b.dataset.color, emoji: b.dataset.emoji };
    document.querySelectorAll('.avatar-pick').forEach(x => x.setAttribute('aria-checked', String(x === b)));
    Sound.click();
  });
  const avatarInk = () => document.querySelectorAll('.avatar,.avatar-pick').forEach(avatar => {
    const rgb = getComputedStyle(avatar).backgroundColor.match(/[\d.]+/g);
    if (!rgb || rgb.length < 3) return;
    const linear = rgb.slice(0, 3).map(value => {
      const channel = Number(value) / 255;
      return channel <= .04045 ? channel / 12.92 : Math.pow((channel + .055) / 1.055, 2.4);
    });
    const luminance = linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
    const whiteContrast = 1.05 / (luminance + .05), darkContrast = (luminance + .05) / .058;
    avatar.style.setProperty('--avatar-ink', whiteContrast > darkContrast ? '#ffffff' : '#071729');
  });
  avatarInk();
  new MutationObserver(avatarInk).observe(document.body, { childList: true, subtree: true });

  document.getElementById('btnCreate').onclick = async () => {
    const name = document.getElementById('createName').value.trim();
    const msg = document.getElementById('createMsg');
    if (!name) { msg.textContent = 'Digite seu apelido.'; return; }
    msg.textContent = 'Criando sala...';
    try {
      const j = await API.rooms({ action: 'create', name, color: picked.color, emoji: picked.emoji, auth_token: Auth.token, game_type: Game.pendingType || 'life' });
      Game.session = { code: j.code, token: j.token, player_id: j.player_id, is_host: true, game_type: j.game_type || 'life' };
      Game.save();
      toast('Sala ' + j.code + ' criada!', 'ok');
      Sound.cash();
      show('screen-lobby');
      Game.startLobbyPoll();
    } catch (e) { msg.textContent = e.message; toast(e.message, 'err'); }
  };
  document.getElementById('btnJoin').onclick = async () => {
    const code = document.getElementById('joinCode').value.trim().toUpperCase();
    const name = document.getElementById('joinName').value.trim();
    const msg = document.getElementById('joinMsg');
    if (!code || !name) { msg.textContent = 'Codigo + apelido.'; return; }
    msg.textContent = 'Entrando...';
    try {
      const j = await API.rooms({ action: 'join', code, name, auth_token: Auth.token });
      Game.session = { code: j.code, token: j.token, player_id: j.player_id, is_host: false, game_type: j.game_type || 'life' };
      Game.save();
      toast(j.reconnected ? 'Sessao recuperada!' : 'Bem-vindo a sala ' + j.code + '!', 'ok');
      Sound.cash();
      show('screen-lobby');
      Game.startLobbyPoll();
    } catch (e) { msg.textContent = e.message; toast(e.message, 'err'); }
  };
  document.getElementById('btnReconnect').onclick = async () => {
    const msg = document.getElementById('reMsg');
    Game.load();
    if (!Game.session) { msg.textContent = 'Nenhuma sessao salva neste navegador.'; return; }
    try {
      const j = await API.rooms({ action: 'reconnect', token: Game.session.token });
      Game.session.code = j.code;
      Game.save();
      toast('Reconectado a sala ' + j.code + '!', 'ok');
      if (j.room.status === 'playing') {
        if (Game.session.game_type === 'mono') Mono.enterGame();
        else Game.enterGame();
      }
      else { show('screen-lobby'); Game.startLobbyPoll(); }
    } catch (e) { msg.textContent = e.message; }
  };
  document.getElementById('btnCopy').onclick = async () => {
    const c = document.getElementById('lobbyCode').textContent;
    try { await navigator.clipboard.writeText(c); toast('Codigo ' + c + ' copiado!', 'ok'); }
    catch { toast('Codigo: ' + c); }
    Sound.click();
  };
  document.getElementById('btnStart').onclick = async () => {
    const m = document.getElementById('lobbyMsg');
    m.textContent = 'Iniciando...';
    try {
      if (Game.session.game_type === 'mono') {
        const j = await API.call('api/mono.php', { action: 'start', token: Game.session.token }, 'POST');
        Sound.win();
        Mono.enterGame();
        return;
      }
      const j = await API.game({ action: 'start', token: Game.session.token });
      Sound.win();
      Game.enterGame();
    } catch (e) { m.textContent = e.message; toast(e.message, 'err'); }
  };
  document.getElementById('btnSpin').onclick = () => Game.spin();
  document.getElementById('btnCar').onclick = () => Game.buyCar();
  document.addEventListener('keydown', e => {
    const modal = document.getElementById('modal');
    if (modal.classList.contains('open')) {
      if (e.key === 'Escape') { closeModal(); return; }
      if (e.key === 'Tab') {
        const focusables = [...modal.querySelectorAll('button:not(:disabled),input:not(:disabled),a[href]')];
        const first = focusables[0], last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      return;
    }
    if (e.target.matches('input,select,textarea') && e.key !== 'Escape') return;
    if (e.key === 'Enter' && document.getElementById('screen-game').classList.contains('active')) {
      const b = document.getElementById('btnSpin');
      if (!b.disabled) Game.spin();
    }
    if (e.key === 'Enter' && document.getElementById('screen-mono').classList.contains('active')) {
      const b = document.getElementById('btnRoll');
      if (b && !b.disabled) Mono.roll();
    }
    if (/^[1-4]$/.test(e.key) && document.getElementById('screen-game').classList.contains('active')) {
      const opts = document.querySelectorAll('#eventChoices .choice:not(:disabled)');
      const pick = opts[Number(e.key) - 1];
      if (pick && !document.getElementById('eventPanel').hidden) pick.click();
    }
    if (/^[1-4]$/.test(e.key) && document.getElementById('screen-mono').classList.contains('active')) {
      const opts = document.querySelectorAll('#monoEventChoices .choice:not(:disabled)');
      const pick = opts[Number(e.key) - 1];
      if (pick && !document.getElementById('monoEventPanel').hidden) pick.click();
    }
    if (e.key === 'Escape') {
      closeModal();
      if (window.IslandMap && IslandMap.cancelIntro) IslandMap.cancelIntro(); // pula varredura
      // fecha aviso informativo (decisão obrigatória não fecha)
      const x = document.getElementById('eventClose');
      if (x && !x.hidden && !document.getElementById('eventPanel').hidden) x.click();
      const mx = document.getElementById('monoEventClose');
      if (mx && !mx.hidden && !document.getElementById('monoEventPanel').hidden) mx.click();
    }
  });
  if (window.Motion) Motion.initReveals(); // entrada orquestrada da landing
  const newGame = async () => {
    try { const j = await API.game({ action: 'new', token: Game.session.token }); Game.state = j; Game.lastVersion = -1; show('screen-game'); Board.rouletteNumbers(); if (Board.upgrade) Board.upgrade(); if (window.IslandMap && window.IslandMap.ok !== false) { try { window.IslandMap.setPlayers(j.players || []); } catch (e) {} } Game.refresh(true); Game.startGamePoll(); toast('Nova partida!', 'ok'); }
    catch (e) { toast(e.message, 'err'); }
  };
  Game.lifeNewGame = newGame;
  document.getElementById('btnNewFinal').onclick = newGame;
  document.getElementById('btnNewMid').onclick = newGame;
  const leave = async () => {
    try { if (Game.session) await API.rooms({ action: 'leave', token: Game.session.token }); } catch {}
    Game.clear(); Game.stopLobby(); Game.stopGame();
    if (window.Mono) Mono.stopGame();
    show('screen-landing');
  };
  document.getElementById('btnLeave').onclick = leave;
  document.getElementById('btnExitFinal').onclick = leave;
  document.getElementById('btnMonoLeave').onclick = leave;
  document.getElementById('btnMonoNew').onclick = () => Mono.newGame();
  document.getElementById('btnMonoRules').onclick = () => openModal('Regras — Banco Imobiliário',
    '<p><b>Objetivo:</b> ser o último solvente (ou o mais rico na rodada 40). Patrimônio = dinheiro + terrenos + construções.</p>' +
    '<p><b>Turno:</b> role 2 dados (dupla joga de novo; 3 duplas = prisão). Passar pela Partida: +$2.000.</p>' +
    '<p><b>Terrenos:</b> caiu em livre? Compre ou abra leilão. Dono cobra aluguel (×2 com grupo; casas/hotel multiplicam).</p>' +
    '<p><b>Construir:</b> só com grupo completo e pareado; 4 casas + hotel. Hipoteca libera metade; resgate +10%.</p>' +
    '<p><b>Prisão:</b> saia com dupla, $500 ou carta. <b>Trocas:</b> proponha na aba Ações. <b>Falência:</b> devendo, hipoteque/negocie ou faleça (bens ao banco).</p>');
  document.querySelectorAll('[data-mono-rules]').forEach(b => b.onclick = e => { e.preventDefault(); document.getElementById('btnMonoRules').click(); });
  document.querySelectorAll('.tabs').forEach(tabs => {
    const mono = !!tabs.closest('#screen-mono');
    const screen = tabs.closest('.screen');
    const tabKey = mono ? 'mtab' : 'tab', pageKey = mono ? 'mpage' : 'page';
    const buttons = [...tabs.querySelectorAll('[role="tab"]')];
    buttons.forEach(button => {
      // Scope each game's tabs so Life handlers never bind to Mono panels.
      button.dataset.bound = '1';
      button.onclick = () => {
        Sound.click();
        buttons.forEach(other => { other.classList.toggle('on', other === button); other.setAttribute('aria-selected', String(other === button)); });
        screen.querySelectorAll('.tabpage').forEach(page => page.hidden = page.dataset[pageKey] !== button.dataset[tabKey]);
        if (button.dataset[tabKey] === 'feed') {
          const game = mono ? Mono : Game;
          game._feedSeen = game.state && game.state.feed ? game.state.feed.length : 0;
          const badge = document.getElementById(mono ? 'monoFeedBadge' : 'feedBadge');
          if (badge) { badge.hidden = true; badge.textContent = ''; }
        }
      };
    });
    tabs.addEventListener('keydown', e => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
    const buttons = [...tabs.querySelectorAll('[role="tab"]')], index = buttons.indexOf(document.activeElement);
    if (index < 0) return;
    e.preventDefault(); const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus(); buttons[next].click();
    });
  });
  document.getElementById('btnRoll').onclick = () => Mono.roll();
  const monoRestartPlaying = Mono.newGame.bind(Mono);
  Mono.newGame = async function () {
    if (!this.state || this.state.game.status !== 'finished') return monoRestartPlaying();
    try {
      // The existing server start route handles finished rooms; new requires an active game.
      const j = await API.call('api/mono.php', { action: 'start', token: Game.session.token }, 'POST');
      this.state = j; this.lastVersion = -1; this._aucKey = null; this._bidKey = null;
      this.hideOverlay(); await this.enterGame(); toast('Nova partida pronta!', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  };

  // auto-reconnect silencioso se havia sessao
  if (Game.session && Game.session.token) {
    API.rooms({ action: 'reconnect', token: Game.session.token }).then(j => {
      Game.session.code = j.code; Game.save();
    }).catch(() => {});
  }
});
