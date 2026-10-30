/* LIFE QUEST — estado multiplayer, turnos, polling 2s, escolhas */
const Game = {
  session: null, // {code, token, player_id, is_host}
  state: null, lobbyTimer: null, gameTimer: null, lastVersion: -1, spinning: false,

  load() { this.session = Store.get('session', null); },
  save() { Store.set('session', this.session); },
  clear() { this.session = null; Store.del('session'); },

  async pollLobby() {
    if (!this.session) return;
    try {
      const j = await API.rooms({ action: 'state', code: this.session.code }, 'GET');
      if (j.room.game_type) this.session.game_type = j.room.game_type;
      this.renderLobby(j);
      if (j.room.status === 'playing') {
        if ((j.room.game_type || 'life') === 'mono' && window.Mono) { Mono.enterGame(); return; }
        this.enterGame();
      }
    } catch (e) { /* mantem lobby, mostra erro leve */ }
  },
  renderLobby(j) {
    document.getElementById('lobbyCode').textContent = j.room.code;
    const gt = (j.room.game_type === 'mono') ? 'Banco Imobiliário' : 'Jogo da Vida';
    const sub = document.getElementById('lobbySub');
    if (sub && !sub.dataset.g) { sub.dataset.g = '1'; sub.textContent = gt + ' • ' + sub.textContent; }
    document.getElementById('lobbyCount').textContent = j.players.length + '/4 jogadores';
    const box = document.getElementById('lobbyPlayers');
    box.innerHTML = '';
    this._lobbyIds = this._lobbyIds || {};
    j.players.forEach(p => {
      const row = document.createElement('div');
      const isNew = !this._lobbyIds[p.id];
      row.className = 'player-row' + (isNew ? ' row-in' : '');
      this._lobbyIds[p.id] = 1;
      row.innerHTML = '<span class="avatar" style="background:' + p.avatar_color + '">' + (p.avatar_emoji || p.name[0]).toUpperCase() + '</span>' +
        '<span><b>' + escapeHtml(p.name) + '</b><br><small style="color:var(--muted)">' + (p.is_host == 1 ? 'HOST • anfitriao' : 'convidado') + ' • ' + (p.is_connected == 1 ? 'conectado' : 'saiu') + '</small></span>' +
        '<span style="margin-left:auto" class="pturn ' + (this.session && p.id == this.session.player_id ? 'you' : '') + '">' + (this.session && p.id == this.session.player_id ? 'VOCE' : 'PRONTO') + '</span>';
      box.appendChild(row);
    });
    const isHost = this.session && j.players.find(p => p.id == this.session.player_id && p.is_host == 1);
    this.session.is_host = !!isHost;
    this.save();
    const btn = document.getElementById('btnStart');
    btn.disabled = !isHost;
    btn.textContent = isHost ? 'Iniciar Partida' : 'Aguarde o host iniciar';
    // toggle Clássico/Maratona (só host; todos veem via polling)
    const sz = Number(j.room.board_size) === 40 ? 40 : 60;
    const szLabel = document.getElementById('lobbySize');
    if (szLabel) szLabel.textContent = sz === 40 ? 'Clássico 40 • ~10min' : 'Maratona 60 • ~25min';
    document.querySelectorAll('.size-pick').forEach(b => {
      const on = Number(b.dataset.size) === sz;
      b.style.outline = on ? '3px solid #fff' : '';
      b.disabled = !isHost;
      b.onclick = async () => {
        if (!isHost || b.disabled) return;
        Sound.click();
        try { await API.rooms({ action: 'size', token: this.session.token, size: b.dataset.size }); }
        catch (e) { toast(e.message, 'err'); }
      };
    });
    document.getElementById('lobbyMsg').textContent = j.players.length < 2 ? 'Chame pelo menos 2 jogadores.' : (isHost ? 'Tudo pronto! Pode iniciar.' : 'Host: ' + (j.players.find(p => p.is_host == 1) || {}).name);
  },

  boardSize(j) {
    if (j && j.game && j.game.board_size) return Number(j.game.board_size) === 40 ? 40 : 60;
    if (j && j.room && j.room.board_size) return Number(j.room.board_size) === 40 ? 40 : 60;
    return 60;
  },
  async enterGame() {
    this.stopLobby();
    if (window.Mono) Mono.stopGame();
    if (this.lifeNewGame) {
      document.getElementById('btnNewFinal').onclick = this.lifeNewGame;
      document.getElementById('btnNewMid').onclick = this.lifeNewGame;
    }
    show('screen-game');
    Board.rouletteNumbers();
    if (Board.upgrade) Board.upgrade(); // ilha 3D (agora visivel) ou grade fallback
    await this.refresh(true);
    this.startGamePoll();
  },
  initTabs() {
    const tabs = document.querySelectorAll('.rail-right .tabs [role="tab"]');
    tabs.forEach(t => {
      if (t.dataset.bound) return;
      t.dataset.bound = '1';
      t.onclick = () => {
        Sound.click();
        tabs.forEach(x => { x.classList.toggle('on', x === t); x.setAttribute('aria-selected', x === t ? 'true' : 'false'); });
        document.querySelectorAll('.rail-right .tabpage').forEach(pg => { pg.hidden = pg.dataset.page !== t.dataset.tab; });
        if (t.dataset.tab === 'feed') {
          this._feedSeen = (this.state && this.state.feed ? this.state.feed.length : 0);
          const b = document.getElementById('feedBadge');
          if (b) { b.hidden = true; b.textContent = ''; }
          const f = document.getElementById('feed');
          if (f) f.scrollTop = f.scrollHeight;
        }
      };
    });
  },
  showOverlay(hasChoices) {
    const panel = document.getElementById('eventPanel');
    panel.hidden = false;
    const hint = document.getElementById('pickHint');
    if (hint) hint.hidden = !hasChoices;
    // X só em aviso informativo; decisão é obrigatória e não pode ser fechada
    const x = document.getElementById('eventClose');
    if (x) {
      x.hidden = !!hasChoices;
      x.onclick = () => { Sound.click(); this.hideOverlay(); };
    }
    const card = panel.querySelector('.event-card');
    if (card) { card.classList.remove('deal'); void card.offsetWidth; card.classList.add('deal'); }
  },
  hideOverlay() {
    document.getElementById('eventPanel').hidden = true;
    document.getElementById('eventChoices').innerHTML = '';
  },
  startLobbyPoll() {
    this.stopLobby(); this.stopGame();
    this.pollLobby();
    this.lobbyTimer = setInterval(() => this.pollLobby(), 2000);
  },
  stopLobby() { if (this.lobbyTimer) clearInterval(this.lobbyTimer); this.lobbyTimer = null; },
  startGamePoll() {
    this.stopGame();
    this.gameTimer = setInterval(() => this.refresh(false), 2000);
    // heartbeat
    setInterval(() => { if (this.session) API.rooms({ action: 'heartbeat', token: this.session.token }).catch(() => {}); }, 15000);
  },
  stopGame() { if (this.gameTimer) clearInterval(this.gameTimer); this.gameTimer = null; },

  async refresh(force) {
    if (!this.session || this.spinning || this._refreshing) return;
    this._refreshing = true;
    try {
      const j = await API.game({ action: 'state', token: this.session.token }, 'GET');
      if (j.room && j.room.game_type === 'mono' && typeof Mono !== 'undefined') {
        this.session.game_type = 'mono'; this.save(); this.stopGame();
        await Mono.enterGame(); return;
      }
      if (!j.game) { show('screen-lobby'); this.startLobbyPoll(); return; }
      const ver = Number(j.room.state_version || 0);
      if (!force && ver === this.lastVersion) return;
      this.lastVersion = ver;
      await MultiplayerRolls.replay(this.state, j, this.session.player_id, 'spin', async (roll, state) => {
        document.getElementById('btnSpin').disabled = true;
        const wheel = document.getElementById('roulette'), hub = document.getElementById('rouletteHub');
        document.getElementById('spinMsg').textContent = roll.name + ' está girando...';
        Sound.spin();
        wheel.classList.remove('spinning'); void wheel.offsetWidth;
        wheel.style.setProperty('--spin', (1440 + roll.value * 36) + 'deg');
        wheel.classList.add('spinning');
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) await new Promise(r => setTimeout(r, 2100));
        hub.textContent = roll.value;
        this.lastSpin = { val: roll.value, at: Date.now() };
        Board.follow(roll.pid);
        await Board.animateMove(state.players, roll.pid, roll.from, roll.to);
      });
      this.state = j;
      this.renderGame(j);
      if (j.game.status === 'finished') this.showFinal(j);
    } catch (e) {
      if (/Sessao|Entra/.test(e.message)) toast(e.message, 'err');
    } finally {
      this._refreshing = false;
    }
  },

  renderGame(j) {
    if (window.Board && Board.setSize) Board.setSize(this.boardSize(j));
    const meId = this.session.player_id;
    const cur = Number(j.game.current_player_id);
    const me = j.players.find(p => p.player_id == meId);
    const curP = j.players.find(p => p.player_id == cur);
    const banner = document.getElementById('turnBanner');
    const isMine = cur === Number(meId) && me && !me.finished && !me.pending_type;
    const needChoice = me && me.pending_type;
    banner.classList.toggle('mine', !!isMine || !!needChoice);
    const turnStr = !curP ? 'Partida encerrada' : (cur === Number(meId) ? 'Sua vez, ' + me.name + '! Gire!' : 'Turno de: ' + curP.name.toUpperCase());
    const turnEl = document.getElementById('turnText');
    if (turnEl.textContent !== turnStr) {
      turnEl.textContent = turnStr;
      banner.classList.remove('swap'); void banner.offsetWidth; banner.classList.add('swap');
    }
    // lista jogadores
    const box = document.getElementById('gamePlayers');
    box.innerHTML = '';
    j.players.forEach(p => {
      const row = document.createElement('div');
      row.className = 'player-row';
      const tags = [];
      if (p.player_id == meId) tags.push('VOCE');
      if (p.player_id == cur && j.game.status === 'playing') tags.push('VEZ');
      if (p.finished) tags.push('FIM');
      row.innerHTML = '<span class="avatar" style="background:' + p.avatar_color + '">' + escapeHtml((p.avatar_emoji || p.name[0]).toUpperCase()) + '</span>' +
        '<span><b>' + escapeHtml(p.name) + '</b><br><small style="color:var(--muted)"><b class="js-money" data-pid="' + p.player_id + '">' + money(p.money) + '</b> • ' + escapeHtml(p.career_name || 'sem carreira') + ' • casa ' + p.position + ' • ' + p.children_count + ' filhos</small></span>' +
        '<span style="margin-left:auto;display:grid;gap:4px;justify-items:end">' + tags.map(t => '<span class="pturn ' + (t === 'VEZ' ? 'turn' : t === 'VOCE' ? 'you' : '') + '">' + t + '</span>').join('') + '</span>';
      box.appendChild(row);
    });
    // count-up no dinheiro que mudou
    if (window.Motion) {
      this._money = this._money || {};
      box.querySelectorAll('.js-money').forEach(el => {
        const pid = el.dataset.pid, cur2 = j.players.find(p => p.player_id == pid);
        const to = cur2 ? Number(cur2.money) : 0, from = this._money[pid];
        if (from !== undefined && from !== to) Motion.countUp(el, from, to);
        this._money[pid] = to;
      });
    }
    // board (ilha 3D + camera no jogador da vez)
    Board.placeAll(j.players);
    if (Board.follow && j.game.status === 'playing' && cur) Board.follow(cur);
    // meu painel (com count-up no dinheiro)
    const fin = this.boardSize(j) - 1;
    const mePanel = document.getElementById('mePanel');
    const prevMe = (this._money && this._money['me']) ?? null;
    mePanel.innerHTML = me ? ('<b>' + escapeHtml(me.name) + '</b><br>Dinheiro: <b id="meMoney">' + money(me.money) + '</b><br>Carreira: ' + escapeHtml(me.career_name || '—') + ' (' + money(me.salary) + ')<br>Filhos: ' + me.children_count + ' • Casa: ' + escapeHtml(me.house_name || '—') + '<br>Posicao: ' + me.position + '/' + fin + (me.pending_type ? '<br><b style="color:var(--gold)">Voce tem uma decisao pendente!</b>' : '')) : '—';
    if (window.Motion && me && prevMe !== null && prevMe !== Number(me.money)) {
      Motion.countUp(document.getElementById('meMoney'), prevMe, Number(me.money));
    }
    if (me) { this._money = this._money || {}; this._money['me'] = Number(me.money); }
    // feed (só o item novo desliza; badge se a aba Feed estiver fechada)
    const feed = document.getElementById('feed');
    const prevN = this._feedN || 0;
    feed.innerHTML = j.feed.map((f, i, arr) => '<div' + (i === arr.length - 1 && arr.length > prevN ? ' class="feed-in"' : '') + '><span class="t">#' + f.turn_number + '</span> ' + escapeHtml(f.description) + '</div>').join('');
    this._feedN = j.feed.length;
    feed.scrollTop = feed.scrollHeight;
    const feedTab = document.querySelector('.tabs [data-tab="feed"]');
    const badge = document.getElementById('feedBadge');
    if (badge && feedTab) {
      const seen = this._feedSeen || 0;
      const unread = j.feed.length - seen;
      if (!feedTab.classList.contains('on') && unread > 0 && prevN > 0) {
        badge.hidden = false;
        badge.textContent = unread > 9 ? '9+' : String(unread);
      } else if (feedTab.classList.contains('on')) {
        this._feedSeen = j.feed.length;
        badge.hidden = true;
      }
    }
    // botao girar (+ resultado recente em destaque, sobrevive ao polling)
    const spinBtn = document.getElementById('btnSpin');
    const msg = document.getElementById('spinMsg');
    const hit = this.lastSpin && (Date.now() - this.lastSpin.at < 9000) ? this.lastSpin : null;
    const prefix = hit ? 'Caiu ' + hit.val + '! ' : '';
    msg.classList.toggle('hit', !!hit);
    if (j.game.status !== 'playing') { spinBtn.disabled = true; msg.textContent = 'Partida encerrada.'; }
    else if (me && me.finished) { spinBtn.disabled = true; msg.textContent = 'Voce se aposentou. Aguarde os outros.'; }
    else if (needChoice) { spinBtn.disabled = true; msg.textContent = prefix + 'Resolva sua carta abaixo.'; this.showPending(me, j); }
    else if (cur === Number(meId)) { spinBtn.disabled = false; msg.textContent = prefix + 'Sua vez! Toque em GIRAR. (Enter)'; }
    else { spinBtn.disabled = true; msg.textContent = prefix + (curP ? 'Aguarde o turno de ' + curP.name + '.' : 'Aguarde...'); this.hideEvent(); }
    if (!needChoice && cur !== Number(meId)) this.hideEvent();
    // botao carro 6 lugares (compra opcional no proprio turno, antes de girar)
    const carBtn = document.getElementById('btnCar');
    const carMsg = document.getElementById('carMsg');
    if (carBtn) {
      const mine = j.game.status === 'playing' && me && !me.finished && !needChoice && cur === Number(meId);
      const seats = me ? Number(me.car_seats || 4) : 4;
      if (seats >= 6) { carBtn.disabled = true; carMsg.textContent = 'Você já tem o carro de 6 lugares.'; }
      else if (!mine) { carBtn.disabled = true; carMsg.textContent = me && me.finished ? '' : 'Disponível no seu turno.'; }
      else if (Number(me.money) < 25000) { carBtn.disabled = true; carMsg.textContent = 'Junte $25.000 para o carro de 6 lugares.'; }
      else { carBtn.disabled = false; carMsg.textContent = 'Cabe a família toda: 6 pinos!'; }
    }
  },

  async buyCar() {
    const btn = document.getElementById('btnCar');
    if (btn) btn.disabled = true;
    Sound.click();
    try {
      const j = await API.game({ action: 'car', token: this.session.token });
      this.state = j; this.lastVersion = Number(j.room.state_version || 0);
      toast(j.message || 'Carro novo!', 'ok');
      Sound.cash();
      this.renderGame(j);
    } catch (e) { toast(e.message, 'err'); }
  },

  async spin() {
    if (this.spinning || this._refreshing) return;
    const btn = document.getElementById('btnSpin');
    btn.disabled = true;
    this.spinning = true;
    this.hideOverlay();
    Sound.spin();
    // animacao roleta antes do servidor (feedback imediato), depois confirma
    const wheel = document.getElementById('roulette');
    const hub = document.getElementById('rouletteHub');
    wheel.classList.remove('spinning');
    void wheel.offsetWidth;
    const guess = 1440 + Math.floor(Math.random() * 720);
    wheel.style.setProperty('--spin', guess + 'deg');
    wheel.classList.add('spinning');
    btn.classList.add('loading');
    hub.classList.remove('hit');
    this.lastSpin = null;
    document.getElementById('spinMsg').textContent = 'Girando...';
    document.getElementById('spinMsg').classList.remove('hit');
    await new Promise(r => setTimeout(r, 2100));
    try {
      const before = this.state ? this.state.players.find(p => p.player_id == this.session.player_id) : null;
      const from = before ? Number(before.position) : 0;
      const j = await API.game({ action: 'spin', token: this.session.token });
      this.state = j; this.lastVersion = Number(j.room.state_version || 0);
      const ev = j.event || {};
      const spinVal = Number(ev.spin || 1);
      hub.textContent = spinVal;
      hub.classList.remove('hit'); void hub.offsetWidth; hub.classList.add('hit');
      this.lastSpin = { val: spinVal, at: Date.now() };
      // move animado
      const meAfter = j.players.find(p => p.player_id == this.session.player_id);
      await Board.animateMove(j.players.map(p => ({ ...p })), this.session.player_id, from, Number(ev.pos ?? meAfter.position));
      this.renderGame(j);
      this.handleEvent(ev, j);
      if (ev.gain) { Sound.cash(); FX.money(btn); }
      else if (ev.loss || (ev.value < 0)) Sound.bad();
      else Sound.click();
      if (j.game.status === 'finished') this.showFinal(j);
    } catch (e) {
      toast(e.message, 'err');
      Sound.bad();
      await this.refresh(true);
    } finally {
      this.spinning = false;
      btn.classList.remove('loading');
    }
  },

  handleEvent(ev, j) {
    if (!ev) return;
    const box = document.getElementById('eventChoices');
    box.innerHTML = '';
    if (ev.need_choice) {
      this.showOverlay(true);
      document.getElementById('eventTitle').textContent = 'Decisao: ' + (ev.label || '');
      document.getElementById('eventText').textContent = ev.text || '';
      const mk = (label, desc, val) => {
        const b = document.createElement('button');
        b.className = 'choice';
        b.innerHTML = '<b>' + escapeHtml(label) + '</b><span>' + escapeHtml(desc) + '</span>';
        b.onclick = () => this.choose(val, b);
        box.appendChild(b);
      };
      if (ev.choice_kind === 'career') (ev.options || []).forEach(c => mk(c.name + ' • ' + money(c.salary), c.bonus_desc, String(c.id)));
      else if (ev.choice_kind === 'house' && ev.house) {
        document.getElementById('eventTitle').textContent = ev.house.name;
        document.getElementById('eventText').textContent = ev.text + ' Revenda por ' + money(ev.house.sell_value) + '.';
        mk('COMPRAR por ' + money(ev.house.price), 'Entra para sua riqueza final', 'buy');
        mk('PASSAR a oferta', 'Sem custo, sem casa', 'skip');
      }
      else if (ev.choice_kind === 'study') { mk('ESTUDAR', 'Pague $15.000 (ou metade p/ Professora). +30% salario futuro', 'study'); mk('TRABALHAR', 'Receba $10.000 agora', 'work'); }
      else if (ev.choice_kind === 'invest') { mk('ARRISCAR $10.000', '50% de chance de ganhar $25.000', 'risk'); mk('POUPAR seguro', 'Garanta +$5.000', 'safe'); }
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else if (ev.text || ev.card) {
      this.showOverlay(false);
      document.getElementById('eventTitle').textContent = (ev.card && ev.card.title) || ev.label || 'Aconteceu!';
      document.getElementById('eventText').textContent = ev.text || '';
      if (ev.value) {
        const d = document.createElement('div');
        d.className = 'pturn ' + (ev.value >= 0 ? 'turn' : '');
        d.textContent = money(ev.value);
        d.style.display = 'inline-block'; d.style.marginTop = '8px';
        box.appendChild(d);
      }
    }
  },
  showPending(me, j) {
    // reconstroi escolhas a partir do estado (pos-refresh / outro PC)
    const t = me.pending_type;
    this.showOverlay(true);
    const box = document.getElementById('eventChoices');
    if (box.children.length) return;
    const mk = (label, desc, val) => {
      const b = document.createElement('button');
      b.className = 'choice';
      b.innerHTML = '<b>' + escapeHtml(label) + '</b><span>' + escapeHtml(desc) + '</span>';
      b.onclick = () => this.choose(val, b);
      box.appendChild(b);
    };
    try {
      const data = JSON.parse(me.pending_data || '{}');
      if (t === 'career') {
        document.getElementById('eventTitle').textContent = 'Escolha sua carreira';
        document.getElementById('eventText').textContent = 'Ela define seu salario em todo PAYDAY.';
        (j.careers || []).filter(c => (data.options || []).includes(c.id)).forEach(c => mk(c.name + ' • ' + money(c.salary), c.bonus_desc, String(c.id)));
      } else if (t === 'house') {
        const h = (j.houses || []).find(x => x.id == data.house_id);
        document.getElementById('eventTitle').textContent = h ? h.name : 'Casa';
        document.getElementById('eventText').textContent = h ? ('Comprar por ' + money(h.price) + '? Revenda ' + money(h.sell_value) + '.') : '';
        mk('COMPRAR', 'Soma na riqueza final', 'buy'); mk('PASSAR', 'Sem custo', 'skip');
      } else if (t === 'study') {
        document.getElementById('eventTitle').textContent = 'Estudar ou Trabalhar?';
        document.getElementById('eventText').textContent = 'Estudar paga agora e rende +30% depois.';
        mk('ESTUDAR', 'Invista no futuro', 'study'); mk('TRABALHAR', '+$10.000 agora', 'work');
      } else if (t === 'invest') {
        document.getElementById('eventTitle').textContent = 'Investir ou poupar?';
        document.getElementById('eventText').textContent = 'Ousadia ou seguranca?';
        mk('ARRISCAR', '50% de $25.000', 'risk'); mk('POUPAR', '+$5.000 certos', 'safe');
      }
    } catch {}
  },
  hideEvent() { /* mantem ultima carta visivel p/ contexto; esconde so escolhas vazias */ },
  async choose(val, btn) {
    if (btn) btn.disabled = true;
    Sound.click();
    try {
      const j = await API.game({ action: 'choice', token: this.session.token, choice: val });
      this.state = j; this.lastVersion = Number(j.room.state_version || 0);
      this.hideOverlay();
      toast(j.message || 'Escolha registrada!', 'ok');
      Sound.cash();
      this.renderGame(j);
      if (j.game.status === 'finished') this.showFinal(j);
    } catch (e) { toast(e.message, 'err'); if (btn) btn.disabled = false; }
  },
  showFinal(j) {
    this.stopGame();
    show('screen-final');
    if (window.Auth && Auth.token && Game.session) {
      const mine = j.players.find(p => p.player_id == Game.session.player_id);
      API.call('api/rank.php', { scope: 'life', auth_token: Auth.token }, 'GET').then(r => {
        if (r && r.me) toast('+' + money(mine ? mine.final_wealth || 0 : 0) + ' vitalícios! Total Vida: ' + money(r.me.total_wealth), 'ok');
      }).catch(() => {});
    }
    const trophy = document.querySelector('#screen-final .result-trophy');
    if (trophy) { trophy.classList.remove('drop'); void trophy.offsetWidth; trophy.classList.add('drop'); }
    Sound.win(); FX.confetti(120);
    if (window.Board && Board.celebrate) Board.celebrate(); // fogos na ilha 3D
    const arr = [...j.players].sort((a, b) => (b.final_wealth ?? b.money) - (a.final_wealth ?? a.money));
    const medals = ['1o', '2o', '3o', '4o'];
    document.getElementById('finalRank').innerHTML = arr.map((p, i) => '<div class="rank ' + (i === 0 ? 'first' : '') + '"><span class="pos">' + medals[i] + '</span>' +
      '<span class="avatar" style="background:' + p.avatar_color + '">' + escapeHtml((p.avatar_emoji || p.name[0]).toUpperCase()) + '</span>' +
      '<span><b>' + escapeHtml(p.name) + '</b><br><small style="color:var(--muted)">' + escapeHtml(p.career_name || 'sem carreira') + ' • ' + (p.spouse ? 'casado(a) • ' : '') + p.children_count + ' filhos • ' + escapeHtml(p.house_name || 'sem casa') + (Number(p.car_seats) >= 6 ? ' • carro 6' : '') + '</small></span>' +
      '<b style="margin-left:auto">' + money(p.final_wealth ?? p.money) + '</b></div>').join('');
  }
};
function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
