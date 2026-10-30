/* LIFE QUEST — tabuleiro: ilha 3D (Three.js) com fallback para grade CSS.
   Mesma API usada por game.js: render / placeAll / animateMove / rouletteNumbers.
   window.LQ_TILES alimenta os rotulos das 60 casas na ilha (Clássica usa 0..39). */
const TILES = [
  ['inicio', 'Inicio'], ['evento', 'Evento'], ['carreira', 'Carreira'], ['payday', 'Payday'], ['evento', 'Evento'],
  ['payday', 'Payday'], ['familia', 'Filho'], ['carreira', 'Carreira'], ['imposto', 'Imposto'], ['evento', 'Evento'],
  ['escolha', 'Estudo?'], ['payday', 'Payday'], ['sorte', 'Sorte'], ['casa', 'Casa'], ['carreira', 'Carreira'],
  ['evento', 'Evento'], ['familia', 'Casar'], ['payday', 'Payday'], ['imposto', 'Imposto'], ['casa', 'Casa'],
  ['evento', 'Evento'], ['escolha', 'Investir?'], ['payday', 'Payday'], ['familia', 'Bebe'], ['sorte', 'Sorte'],
  ['carreira', 'Carreira'], ['payday', 'Payday'], ['evento', 'Evento'], ['casa', 'Casa'], ['imposto', 'Imposto'],
  ['familia', 'Familia'], ['payday', 'Payday'], ['evento', 'Evento'], ['sorte', 'Sorte+'], ['familia', 'Filho'],
  ['casa', 'Casa'], ['imposto', 'Imposto'], ['payday', 'Payday'], ['evento', 'Evento'], ['sorte', 'Marco!'],
  ['carreira', 'Carreira'], ['payday', 'Payday'], ['evento', 'Evento'], ['familia', 'Bebe'], ['escolha', 'Investir?'],
  ['payday', 'Payday'], ['casa', 'Casa Luxo'], ['imposto', 'Imposto'], ['sorte', 'Sorte'], ['familia', 'Familia'],
  ['carreira', 'Carreira'], ['payday', 'Payday'], ['evento', 'Evento'], ['casa', 'Casa'], ['imposto', 'Imposto'],
  ['sorte', 'Sorte+'], ['familia', 'Filho'], ['payday', 'Payday'], ['evento', 'Evento'], ['aposentadoria', 'FIM']
];
window.LQ_TILES = TILES;
const TILE_ICON = { inicio: 'START', payday: '$', carreira: 'JOB', evento: '!', sorte: '*', casa: 'CASA', familia: 'FAM', imposto: 'TAX', escolha: '?', aposentadoria: 'FIM' };

const Board = {
  _island: false,
  _players: [],
  _el: null,
  _size: 60,

  setSize(size) {
    size = (Number(size) === 40) ? 40 : 60;
    if (size === this._size) return;
    this._size = size;
    if (this._island && window.IslandMap) {
      try {
        if (window.IslandMap.setBoardSize(size)) {
          window.IslandMap.setPlayers(this._players);
          return;
        }
      } catch (e) {}
      this._island = false;
    }
    if (this._el) { this.renderFallback(this._el, this._players); this.upgrade(); }
  },

  render(boardEl, players) {
    this._el = boardEl;
    this._players = players || [];
    // Render imediato: grade CSS (funciona mesmo oculta). Upgrade p/ 3D ao exibir.
    this.renderFallback(boardEl, this._players);
    this.upgrade();
  },

  upgrade() {
    if (this._island || !this._el) return false;
    if (!window.IslandMap || typeof THREE === 'undefined') return false;
    if (!this._el.offsetParent && this._el.clientWidth === 0) return false; // ainda oculta
    try {
      var r = window.IslandMap.initGame(this._el);
      if (r && r.ok) {
        this._island = true;
        window.IslandMap.setBoardSize(this._size);
        window.IslandMap.setPlayers(this._players);
        return true;
      }
    } catch (e) { /* fallback grade */ }
    return false;
  },

  placeAll(players) {
    this._players = players || [];
    if (!this._island) {
      if (!this.upgrade()) { this.renderFallback(this._el, this._players); return; }
    }
    try { window.IslandMap.setPlayers(this._players); }
    catch (e) { this._island = false; this.renderFallback(this._el, this._players); }
  },

  follow(pid) {
    if (this._island && window.IslandMap) {
      try { window.IslandMap.follow(pid); } catch (e) {}
    }
  },

  async animateMove(players, playerId, from, to) {
    const cap = this._size - 1;
    from = Math.max(0, Math.min(cap, from)); to = Math.max(0, Math.min(cap, to));
    if (this._island && window.IslandMap) {
      try { await window.IslandMap.drive(playerId, from, to); return; }
      catch (e) { /* cai p/ fallback visual */ }
    }
    // fallback: percorre casas uma a uma na grade
    if (to <= from) { this.placeAll(players); return; }
    for (let pos = from + 1; pos <= to; pos++) {
      const tmp = players.map(p => p.player_id == playerId ? { ...p, position: pos } : p);
      this.placeFallback(tmp);
      const tile = document.getElementById('tile-' + pos);
      if (tile) { tile.classList.add('active'); setTimeout(() => tile.classList.remove('active'), 450); }
      if (window.Sound) Sound.tone(400 + pos * 12, 0.06, 'triangle', 0.07);
      await new Promise(r => setTimeout(r, 210));
    }
  },

  renderFallback(boardEl, players) {
    if (!boardEl) return;
    if (!boardEl.querySelector('.board3d')) {
      boardEl.innerHTML = '<div class="board-stage"><div class="board3d" aria-label="Tabuleiro LIFE QUEST"></div></div>';
    }
    const grid = boardEl.querySelector('.board3d');
    grid.innerHTML = '';
    const list = TILES.slice(0, this._size).map((t, i) => (this._size === 40 && i === 39) ? ['aposentadoria', 'FIM'] : t);
    list.forEach(([type, label], i) => {
      const d = document.createElement('div');
      d.className = 'tile ' + type;
      d.id = 'tile-' + i;
      d.innerHTML = '<span class="n">' + i + '</span><span>' + (TILE_ICON[type] || '') + '</span><span>' + label + '</span><small>' + type + '</small><div class="pawns"></div>';
      grid.appendChild(d);
    });
    this.placeFallback(players || []);
  },

  placeFallback(players) {
    document.querySelectorAll('.tile .pawns').forEach(e => e.innerHTML = '');
    const byPos = {};
    const cap = this._size - 1;
    (players || []).forEach(p => {
      const pos = Math.max(0, Math.min(cap, Number(p.position || 0)));
      (byPos[pos] = byPos[pos] || []).push(p);
    });
    Object.entries(byPos).forEach(([pos, list]) => {
      const tile = document.getElementById('tile-' + pos);
      if (!tile) return;
      const box = tile.querySelector('.pawns');
      list.slice(0, 4).forEach((p, k) => {
        const s = document.createElement('span');
        s.className = 'pawn';
        s.style.background = p.avatar_color || '#fff';
        s.style.animationDelay = (k * 0.25) + 's';
        s.title = p.name + ' • casa ' + pos;
        s.textContent = (p.avatar_emoji || (p.name || '?')[0]).toUpperCase();
        box.appendChild(s);
      });
    });
  },

  placeAll_alias(players) { return this.placeAll(players); },

  celebrate() {
    if (this._island && window.IslandMap && window.IslandMap.celebrate) {
      try { window.IslandMap.celebrate(); } catch (e) {}
    }
  },

  rouletteNumbers() {
    const r = document.getElementById('roulette');
    if (!r) return;
    r.querySelectorAll('.num').forEach(e => e.remove());
    const off = Math.round(((r.clientWidth || 210) / 2) - 27); // raio util conforme o tamanho
    for (let i = 1; i <= 10; i++) {
      const s = document.createElement('span');
      s.className = 'num';
      const ang = (i - 1) * 36;
      s.innerHTML = '<i style="transform:rotate(' + ang + 'deg) translateY(-' + off + 'px)">' + i + '</i>';
      r.appendChild(s);
    }
  }
};
