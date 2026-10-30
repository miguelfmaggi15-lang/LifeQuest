/* BANCO IMOBILIÁRIO — cliente multiplayer (espelha Game, fala com api/mono.php) */
const Mono = {
  state: null, lobbyTimer: null, gameTimer: null, lastVersion: -1, rolling: false,
  _money: {}, _feedN: 0, _feedSeen: 0,

  stopLobby() { if (this.lobbyTimer) clearInterval(this.lobbyTimer); this.lobbyTimer = null; },
  stopGame() { if (this.gameTimer) clearInterval(this.gameTimer); this.gameTimer = null; },

  ensureCity() {
    if (!window.Monocity) return;
    if (!document.querySelector('#monoBoard canvas')) {
      try { window.Monocity.initGame(document.getElementById('monoBoard')); } catch (e) {}
    }
  },
  async enterGame() {
    Game.stopLobby(); Game.stopGame();
    show('screen-mono');
    this.ensureCity();
    this.initTabs();
    await this.refresh(true);
    this.startGamePoll();
  },
  startGamePoll() {
    this.stopGame();
    this.gameTimer = setInterval(() => this.refresh(false), 2000);
  },

  async refresh(force) {
    if (!Game.session || this.rolling || this._refreshing) return;
    this._refreshing = true;
    try {
      const j = await API.call('api/mono.php', { action: 'state', token: Game.session.token }, 'GET');
      if (!j.game) return;
      const ver = Number(j.room.state_version || 0);
      if (!force && ver === this.lastVersion) return;
      this.lastVersion = ver;
      await MultiplayerRolls.replay(this.state, j, Game.session.player_id, 'roll', async (roll, state) => {
        document.getElementById('btnRoll').disabled = true;
        document.getElementById('rollMsg').textContent = roll.name + ' está rolando...';
        if (window.Monocity) {
          Monocity.follow(roll.pid);
          if (roll.dice) await Monocity.rollDice(roll.dice[0], roll.dice[1]);
          await Monocity.drive(roll.pid, roll.from, roll.to);
        }
        this.lastRoll = { name: roll.name, dice: roll.dice, at: Date.now() };
      });
      this.state = j;
      this.renderGame(j);
      if (j.game.status === 'finished') this.showFinal(j);
    } catch (e) { /* mantém tela; erros de ação aparecem via toast */ }
    finally { this._refreshing = false; }
  },

  initTabs() {
    const tabs = document.querySelectorAll('#screen-mono .tabs [role="tab"]');
    tabs.forEach(t => {
      if (t.dataset.bound) return;
      t.dataset.bound = '1';
      t.onclick = () => {
        Sound.click();
        tabs.forEach(x => { x.classList.toggle('on', x === t); x.setAttribute('aria-selected', x === t ? 'true' : 'false'); });
        document.querySelectorAll('#screen-mono .tabpage').forEach(pg => { pg.hidden = pg.dataset.mpage !== t.dataset.mtab; });
        if (t.dataset.mtab === 'feed') {
          this._feedSeen = (this.state && this.state.feed ? this.state.feed.length : 0);
          const b = document.getElementById('monoFeedBadge');
          if (b) { b.hidden = true; b.textContent = ''; }
        }
      };
    });
  },

  renderGame(j) {
    const meId = Game.session.player_id;
    const cur = Number(j.game.current_player_id);
    const me = j.players.find(p => p.player_id == meId);
    const curP = j.players.find(p => p.player_id == cur);
    const banner = document.getElementById('monoTurnBanner');
    const isMine = cur === Number(meId) && me && !me.bankrupt && !me.pending_type;
    banner.classList.toggle('mine', !!isMine);
    const turnStr = !curP ? 'Partida encerrada' : (cur === Number(meId) ? 'Sua vez, ' + me.name + '! Role!' : 'Turno de: ' + curP.name.toUpperCase() + ' (rodada ' + j.game.round + ')');
    const turnEl = document.getElementById('monoTurnText');
    if (turnEl.textContent !== turnStr) {
      turnEl.textContent = turnStr;
      banner.classList.remove('swap'); void banner.offsetWidth; banner.classList.add('swap');
    }
    // jogadores
    const box = document.getElementById('monoPlayers');
    box.innerHTML = '';
    j.players.forEach(p => {
      const row = document.createElement('div');
      row.className = 'player-row' + (p.bankrupt ? ' out' : '');
      const tags = [];
      if (p.player_id == meId) tags.push('VOCE');
      if (p.player_id == cur && j.game.status === 'playing') tags.push('VEZ');
      if (p.bankrupt) tags.push('FALIU');
      else if (p.in_jail > 0) tags.push('PRESO');
      row.innerHTML = '<span class="avatar" style="background:' + p.avatar_color + '">' + escapeHtml((p.name || '?')[0].toUpperCase()) + '</span>' +
        '<span><b>' + escapeHtml(p.name) + '</b><br><small style="color:var(--muted)"><b class="js-money" data-pid="' + p.player_id + '">' + money(p.money) + '</b> • PL ' + money(p.net_worth) + ' • casa ' + p.position + '</small></span>' +
        '<span style="margin-left:auto;display:grid;gap:4px;justify-items:end">' + tags.map(t => '<span class="pturn ' + (t === 'VEZ' ? 'turn' : t === 'VOCE' ? 'you' : '') + '">' + t + '</span>').join('') + '</span>';
      box.appendChild(row);
    });
    if (window.Motion) {
      this._money = this._money || {};
      box.querySelectorAll('.js-money').forEach(el => {
        const pl = j.players.find(p => p.player_id == el.dataset.pid);
        const to = pl ? Number(pl.money) : 0, from = this._money[el.dataset.pid];
        if (from !== undefined && from !== to) Motion.countUp(el, from, to);
        this._money[el.dataset.pid] = to;
      });
    }
    // cidade
    if (window.Monocity) {
      try {
        this.ensureCity();
        Monocity.setState(j);
        if (j.game.status === 'playing' && cur) Monocity.follow(cur);
      } catch (e) {}
    }
    // painel patrimônio (meus terrenos com ações)
    const mp = document.getElementById('monoPanel');
    if (me) {
      const mine = (j.deeds || []).filter(d => d.owner == meId);
      let h = '<b>' + escapeHtml(me.name) + '</b><br>Dinheiro: <b>' + money(me.money) + '</b> • Patrimônio: <b>' + money(me.net_worth) + '</b><br>';
      h += 'Posição: ' + me.position + '/31' + (me.in_jail > 0 ? ' • <b>PRESO (' + me.in_jail + ')</b>' : '') + (me.jail_free > 0 ? ' • ' + me.jail_free + ' saída(s) livre(s)' : '') + '<br>';
      if (me.in_jail > 0 && cur === Number(meId) && j.game.status === 'playing') {
        h += '<div class="row" style="margin:8px 0"><button class="btn btn-sm btn-primary" data-mact="jailpay">Pagar fiança $500</button>' +
          (me.jail_free > 0 ? '<button class="btn btn-sm btn-ghost" data-mact="jailcard">Usar saída livre</button>' : '') + '</div>';
      }
      if (me.money < 0 && !me.bankrupt) {
        h += '<div class="row" style="margin:8px 0"><button class="btn btn-sm btn-pink" data-mact="bankrupt">Declarar falência</button></div>' +
          '<span class="sub">Devendo! Hipoteque, venda, negocie ou faleça.</span>';
      }
      h += '<b style="margin-top:6px;display:block">Meus terrenos (' + mine.length + '):</b>';
      h += mine.length ? mine.map(d => {
        const nm = escapeHtml(d.info.name);
        const lvl = d.houses >= 5 ? 'HOTEL' : (d.houses > 0 ? d.houses + 'c' : 'vazio');
        const dis = (cur === Number(meId) && !me.bankrupt && j.game.status === 'playing') ? '' : ' disabled';
        return '<div class="deed-row"><span><b>' + nm + '</b> <small>' + lvl + (d.mortgaged ? ' • HIPOTECADO' : '') + '</small></span>' +
          '<span style="display:flex;gap:4px;flex-wrap:wrap">' +
          '<button class="btn btn-sm btn-ghost" data-act="build" data-t="' + d.tile + '"' + dis + '>+casa</button>' +
          '<button class="btn btn-sm btn-ghost" data-act="sell" data-t="' + d.tile + '"' + dis + '>-casa</button>' +
          (d.mortgaged
            ? '<button class="btn btn-sm btn-ghost" data-act="unmortgage" data-t="' + d.tile + '"' + dis + '>resgatar</button>'
            : '<button class="btn btn-sm btn-ghost" data-act="mortgage" data-t="' + d.tile + '"' + dis + '>hipoteca</button>') +
          '</span></div>';
      }).join('') : '<span class="sub">Nenhum ainda. Caia em terrenos livres!</span>';
      mp.innerHTML = h;
      mp.querySelectorAll('[data-act]').forEach(b => {
        b.onclick = () => this.deedAction(b.dataset.act, Number(b.dataset.t), b);
      });
      mp.querySelectorAll('[data-mact]').forEach(b => {
        b.onclick = () => this.selfAction(b.dataset.mact, b);
      });
    } else mp.innerHTML = '—';
    // ofertas envolvendo você
    this.renderTrades(j, meId);
    // feed + badge
    const feed = document.getElementById('monoFeed');
    const prevN = this._feedN || 0;
    feed.innerHTML = j.feed.map((f, i, arr) => '<div' + (i === arr.length - 1 && arr.length > prevN ? ' class="feed-in"' : '') + '><span class="t">#' + f.turn_number + '</span> ' + escapeHtml(f.description) + '</div>').join('');
    this._feedN = j.feed.length;
    feed.scrollTop = feed.scrollHeight;
    const feedTab = document.querySelector('#screen-mono .tabs [data-mtab="feed"]');
    const badge = document.getElementById('monoFeedBadge');
    if (badge && feedTab) {
      const unread = j.feed.length - (this._feedSeen || 0);
      if (!feedTab.classList.contains('on') && unread > 0 && prevN > 0) {
        badge.hidden = false;
        badge.textContent = unread > 9 ? '9+' : String(unread);
      } else if (feedTab.classList.contains('on')) {
        this._feedSeen = j.feed.length;
        badge.hidden = true;
      }
    }
    // leilão em andamento: licitante vê a interface de lance, demais assistem
    const pend = j.pending;
    if (pend && pend.type === 'auction') {
      const who = (pend.order || [])[pend.idx];
      if (Number(who) === Number(meId)) {
        this._aucKey = null;
        this.showPending(me, j);
      } else {
        const bidder = (j.players || []).find(p => p.player_id == who);
        const t = (j.tiles || []).find(x => x.tile == pend.tile) || {};
        const key = 'auc' + pend.tile + ':' + (pend.highest || 0) + ':' + pend.idx;
        if (this._aucKey !== key) {
          this._aucKey = key;
          this.showOverlay(false);
          document.getElementById('monoEventTitle').textContent = 'Leilão: ' + (t.name || ('#' + pend.tile));
          document.getElementById('monoEventText').textContent = 'Maior lance: ' + money(pend.highest || 0) +
            (bidder ? ' • Aguardando ' + bidder.name + '.' : '');
        }
      }
    } else if (this._aucKey) {
      this._aucKey = null;
      this._bidKey = null;
      if (!me.pending_type) this.hideOverlay();
    }
    // botão rolar
    const rollBtn = document.getElementById('btnRoll');
    const msg = document.getElementById('rollMsg');
    if (j.game.status !== 'playing') { rollBtn.disabled = true; msg.textContent = 'Partida encerrada.'; }
    else if (me && me.bankrupt) { rollBtn.disabled = true; msg.textContent = 'Você faliu. Assista.'; }
    else if (me && me.pending_type) { rollBtn.disabled = true; msg.textContent = 'Resolva sua pendência.'; this.showPending(me, j); }
    else if (cur === Number(meId)) { rollBtn.disabled = false; msg.textContent = 'Sua vez! Role os dados. (Enter)'; }
    else { rollBtn.disabled = true; msg.textContent = curP ? 'Aguarde ' + curP.name + '.' : 'Aguarde...'; }
    if (this.lastRoll && Date.now() - this.lastRoll.at < 12000 && this.lastRoll.dice) {
      msg.textContent = this.lastRoll.name + ': ' + this.lastRoll.dice.join(' + ') + ' = ' + this.lastRoll.dice.reduce((a, b) => a + b, 0) + ' • ' + msg.textContent;
    }
    // ofertas para você decidirem no overlay? ficam na aba ações (renderTrades) + toast
  },

  renderTrades(j, meId) {
    const box = document.getElementById('monoTradeBox');
    if (!box) return;
    const mine = (j.offers || []).filter(o => o.to_player_id == meId);
    const sent = (j.offers || []).filter(o => o.from_player_id == meId);
    let h = '<h4 style="margin:8px 0 4px">Trocas</h4>';
    const nm = id => { const p = (j.players || []).find(x => x.player_id == id); return p ? escapeHtml(p.name) : '#' + id; };
    const fmtTiles = s => String(s || '').split(',').filter(Boolean).map(t => {
      const d = (j.deeds || []).find(x => x.tile == t);
      return d ? escapeHtml(d.info.name) : '#' + t;
    }).join(', ') || '—';
    h += mine.length ? mine.map(o =>
      '<div class="deed-row"><span><b>' + nm(o.from_player_id) + '</b> oferece ' + fmtTiles(o.give_tiles) + ' +' + money(o.give_money) + '<br>quer ' + fmtTiles(o.want_tiles) + ' +' + money(o.want_money) + '</span>' +
      '<span style="display:flex;gap:4px"><button class="btn btn-sm btn-green" data-offer="accept" data-id="' + o.id + '">Aceitar</button>' +
      '<button class="btn btn-sm btn-ghost" data-offer="decline" data-id="' + o.id + '">Recusar</button></span></div>'
    ).join('') : '<span class="sub">Nenhuma oferta para você.</span>';
    if (sent.length) h += '<span class="sub">Enviadas: ' + sent.length + ' pendente(s).</span>';
    h += '<div class="form" style="margin-top:8px"><label>Oferta rápida (IDs separados por vírgula)</label>' +
      '<div class="row"><input id="trTo" placeholder="p/ jogador (id)" style="max-width:130px"><input id="trGive" placeholder="dou casas: 3,5" style="max-width:130px"></div>' +
      '<div class="row"><input id="trGiveM" placeholder="$ que dou" style="max-width:130px"><input id="trWantM" placeholder="$ que quero" style="max-width:130px"></div>' +
      '<div class="row"><input id="trWant" placeholder="quero casas: 7" style="max-width:130px"><button class="btn btn-sm" id="btnTradeSend">Propor</button></div>' +
      '<span class="sub">Veja os ids passando o mouse nos jogadores? Use: ' + (j.players || []).map(p => escapeHtml(p.name) + '=' + p.player_id).join(', ') + '</span></div>';
    box.innerHTML = h;
    box.querySelectorAll('[data-offer]').forEach(b => {
      b.onclick = async () => {
        Sound.click();
        try {
          const r = await API.call('api/mono.php', { action: b.dataset.offer === 'accept' ? 'trade_accept' : 'trade_decline', token: Game.session.token, offer_id: Number(b.dataset.id) }, 'POST');
          this.state = r; this.lastVersion = Number(r.room.state_version || 0);
          toast(r.message || 'Ok', 'ok'); this.renderGame(r);
        } catch (e) { toast(e.message, 'err'); }
      };
    });
    const send = document.getElementById('btnTradeSend');
    if (send) send.onclick = async () => {
      const to = Number(document.getElementById('trTo').value);
      try {
        const r = await API.call('api/mono.php', {
          action: 'trade_offer', token: Game.session.token, to,
          give_tiles: document.getElementById('trGive').value,
          give_money: document.getElementById('trGiveM').value,
          want_tiles: document.getElementById('trWant').value,
          want_money: document.getElementById('trWantM').value
        }, 'POST');
        toast(r.message || 'Enviada!', 'ok'); this.state = r; this.renderGame(r);
      } catch (e) { toast(e.message, 'err'); }
    };
  },

  async selfAction(act, btn) {
    if (btn) btn.disabled = true;
    Sound.click();
    const api = { jailpay: 'jail_pay', jailcard: 'jail_card', bankrupt: 'bankrupt' }[act] || act;
    try {
      const j = await API.call('api/mono.php', { action: api, token: Game.session.token }, 'POST');
      this.state = j; this.lastVersion = Number(j.room.state_version || 0);
      toast(j.message || 'Ok', 'ok'); this.renderGame(j);
      if (j.game.status === 'finished') this.showFinal(j);
    } catch (e) { toast(e.message, 'err'); if (btn) btn.disabled = false; }
  },

  async deedAction(act, tile, btn) {
    if (btn) btn.disabled = true;
    Sound.click();
    try {
      const j = await API.call('api/mono.php', { action: act, token: Game.session.token, tile }, 'POST');
      this.state = j; this.lastVersion = Number(j.room.state_version || 0);
      toast(j.message || 'Ok', 'ok'); Sound.cash(); this.renderGame(j);
    } catch (e) { toast(e.message, 'err'); if (btn) btn.disabled = false; }
  },

  async roll() {
    if (this.rolling || this._refreshing) return;
    const btn = document.getElementById('btnRoll');
    btn.disabled = true;
    this.rolling = true;
    this.hideOverlay();
    Sound.spin();
    document.getElementById('rollMsg').textContent = 'Rolando...';
    try {
      const before = this.state ? this.state.players.find(p => p.player_id == Game.session.player_id) : null;
      const from = before ? Number(before.position) : 0;
      const j = await API.call('api/mono.php', { action: 'roll', token: Game.session.token }, 'POST');
      this.state = j; this.lastVersion = Number(j.room.state_version || 0);
      const ev = j.event || {};
      const dice = ev.dice || [1, 1];
      this.lastRoll = { name: before ? before.name : 'Você', dice, at: Date.now() };
      const meAfter = j.players.find(p => p.player_id == Game.session.player_id);
      if (window.Monocity) {
        try { await Monocity.rollDice(dice[0], dice[1]); } catch (e) {}
        try { await Monocity.drive(Game.session.player_id, from, Number(meAfter.position)); } catch (e) {}
      }
      this.renderGame(j);
      this.handleEvent(ev, j);
      if (ev.gain) Sound.cash();
      else if (ev.loss) Sound.bad();
      else Sound.click();
      if (j.game.status === 'finished') this.showFinal(j);
    } catch (e) {
      toast(e.message, 'err');
      Sound.bad();
      await this.refresh(true);
    } finally {
      this.rolling = false;
    }
  },

  handleEvent(ev, j) {
    if (!ev) return;
    if (ev.need_choice) {
      // compra: COMPRAR / LEILÃO
      this.showOverlay(true);
      document.getElementById('monoEventTitle').textContent = 'Comprar terreno?';
      document.getElementById('monoEventText').textContent = ev.text || '';
      const box = document.getElementById('monoEventChoices');
      box.innerHTML = '';
      const mk = (label, desc, fn) => {
        const b = document.createElement('button');
        b.className = 'choice';
        b.innerHTML = '<b>' + escapeHtml(label) + '</b><span>' + escapeHtml(desc) + '</span>';
        b.onclick = fn;
        box.appendChild(b);
      };
      mk('COMPRAR', ev.tile_info ? ev.tile_info.name + ' • ' + money(ev.tile_info.price) : '', async (btn) => {
        if (btn) btn.disabled = true;
        try {
          const r = await API.call('api/mono.php', { action: 'buy', token: Game.session.token }, 'POST');
          this.state = r; toast(r.message, 'ok'); Sound.cash(); this.renderGame(r);
        } catch (e) { toast(e.message, 'err'); if (btn) btn.disabled = false; }
      });
      mk('LEILÃO', 'Recusar e abrir leilão entre todos', async (btn) => {
        if (btn) btn.disabled = true;
        try {
          const r = await API.call('api/mono.php', { action: 'decline', token: Game.session.token }, 'POST');
          this.state = r; toast(r.message, 'ok'); this.renderGame(r);
        } catch (e) { toast(e.message, 'err'); if (btn) btn.disabled = false; }
      });
    } else if (ev.text) {
      this.showOverlay(false);
      document.getElementById('monoEventTitle').textContent = ev.dice ? 'Dados: ' + ev.dice[0] + '+' + ev.dice[1] : 'Aconteceu!';
      document.getElementById('monoEventText').textContent = ev.text || '';
    }
  },

  showPending(me, j) {
    // leilão: mostra interface de lance se for sua vez
    const pend = j.pending;
    if (pend && pend.type === 'auction') {
      const who = (pend.order || [])[pend.idx];
      if (Number(who) === Number(Game.session.player_id)) {
        const bkey = 'bid' + pend.tile + ':' + (pend.highest || 0) + ':' + pend.idx;
        if (this._bidKey === bkey) return;
        this._bidKey = bkey;
        this.showOverlay(true);
        const t = (j.tiles || []).find(x => x.tile == pend.tile) || {};
        document.getElementById('monoEventTitle').textContent = 'Leilão: ' + (t.name || ('#' + pend.tile));
        document.getElementById('monoEventText').textContent = 'Maior lance: ' + money(pend.highest || 0) + '. Mínimo: ' + money((pend.highest || 0) + 100) + '.';
        const box = document.getElementById('monoEventChoices');
        box.innerHTML = '';
        const bidBox = document.getElementById('monoBidBox');
        bidBox.innerHTML = '<div class="row"><input id="bidAmount" type="number" min="0" step="100" placeholder="Seu lance" style="max-width:160px">' +
          '<button class="btn btn-sm btn-primary" id="btnBidGo">Licitar</button>' +
          '<button class="btn btn-sm btn-ghost" id="btnBidPass">Passar</button></div>';
        const send = async (amt, btn) => {
          if (btn) btn.disabled = true;
          try {
            const r = await API.call('api/mono.php', { action: 'bid', token: Game.session.token, amount: amt }, 'POST');
            this.state = r; toast(r.message, 'ok'); Sound.cash(); this.renderGame(r);
          } catch (e) { toast(e.message, 'err'); if (btn) btn.disabled = false; }
        };
        document.getElementById('btnBidGo').onclick = (e) => send(Number(document.getElementById('bidAmount').value) || 0, e.target);
        document.getElementById('btnBidPass').onclick = (e) => send(0, e.target);
        return;
      }
    }
    if (me.pending_type === 'buy') {
      // reconstroi a oferta de compra
      this.showOverlay(true);
      document.getElementById('monoEventTitle').textContent = 'Comprar terreno?';
      document.getElementById('monoEventText').textContent = 'Decida: comprar ou abrir leilão.';
      const box = document.getElementById('monoEventChoices');
      if (!box.children.length) {
        const mk = (label, fn) => {
          const b = document.createElement('button');
          b.className = 'choice'; b.innerHTML = '<b>' + label + '</b>';
          b.onclick = fn; box.appendChild(b);
        };
        mk('COMPRAR', async (btn) => {
          if (btn) btn.disabled = true;
          try {
            const r = await API.call('api/mono.php', { action: 'buy', token: Game.session.token }, 'POST');
            this.state = r; this.renderGame(r);
          } catch (e) { toast(e.message, 'err'); if (btn) btn.disabled = false; }
        });
        mk('LEILÃO', async (btn) => {
          if (btn) btn.disabled = true;
          try {
            const r = await API.call('api/mono.php', { action: 'decline', token: Game.session.token }, 'POST');
            this.state = r; this.renderGame(r);
          } catch (e) { toast(e.message, 'err'); if (btn) btn.disabled = false; }
        });
      }
    }
  },

  showOverlay(hasChoices) {
    const panel = document.getElementById('monoEventPanel');
    panel.hidden = false;
    document.getElementById('monoBidBox').innerHTML = '';
    const hint = document.getElementById('monoPickHint');
    if (hint) hint.hidden = !hasChoices;
    const x = document.getElementById('monoEventClose');
    if (x) {
      x.hidden = !!hasChoices;
      x.onclick = () => { Sound.click(); this.hideOverlay(); };
    }
    const card = panel.querySelector('.event-card');
    if (card) { card.classList.remove('deal'); void card.offsetWidth; card.classList.add('deal'); }
  },
  hideOverlay() {
    document.getElementById('monoEventPanel').hidden = true;
    document.getElementById('monoEventChoices').innerHTML = '';
    document.getElementById('monoBidBox').innerHTML = '';
  },

  showFinal(j) {
    this.stopGame();
    show('screen-final');
    if (window.Auth && Auth.token) {
      API.call('api/rank.php', { scope: 'mono', auth_token: Auth.token }, 'GET').then(r => {
        if (r && r.me) toast('Patrimônio somado! Total Imobiliário: ' + money(r.me.total_wealth), 'ok');
      }).catch(() => {});
    }
    const trophy = document.querySelector('#screen-final .result-trophy');
    if (trophy) { trophy.classList.remove('drop'); void trophy.offsetWidth; trophy.classList.add('drop'); }
    Sound.win(); FX.confetti(120);
    if (window.Monocity && Monocity.celebrate) { try { Monocity.celebrate(); } catch (e) {} }
    const arr = [...j.players].sort((a, b) => {
      if (!!a.bankrupt !== !!b.bankrupt) return a.bankrupt ? 1 : -1;
      return (b.net_worth ?? b.money) - (a.net_worth ?? a.money);
    });
    const medals = ['1o', '2o', '3o', '4o'];
    document.getElementById('finalSub').textContent = 'Patrimônio = dinheiro + terrenos + construções.';
    document.getElementById('finalRank').innerHTML = arr.map((p, i) => '<div class="rank ' + (i === 0 ? 'first' : '') + '"><span class="pos">' + medals[i] + '</span>' +
      '<span class="avatar" style="background:' + p.avatar_color + '">' + escapeHtml((p.name || '?')[0].toUpperCase()) + '</span>' +
      '<span><b>' + escapeHtml(p.name) + '</b><br><small style="color:var(--muted)">' + (p.bankrupt ? 'FALIU' : 'Patrimônio ' + money(p.net_worth)) + '</small></span>' +
      '<b style="margin-left:auto">' + money(p.bankrupt ? 0 : p.net_worth) + '</b></div>').join('');
    document.getElementById('btnNewFinal').onclick = () => this.newGame();
    document.getElementById('btnNewMid').onclick = () => Game.newGame && Game.newGame();
  },

  async newGame() {
    try {
      const j = await API.call('api/mono.php', { action: 'new', token: Game.session.token }, 'POST');
      this.state = j; this.lastVersion = -1;
      show('screen-mono');
      this.refresh(true); this.startGamePoll();
      toast('Nova partida!', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  }
};
