/* LIFE QUEST — cliente HTTP (fetch/AJAX) */
const API = {
  async call(path, params = {}, method = 'POST') {
    const opts = { method, headers: {} };
    let url = path;
    if (method === 'GET') {
      url += '?' + new URLSearchParams(params).toString();
    } else {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(params);
    }
    const r = await fetch(url, opts);
    const j = await r.json().catch(() => ({ ok: false, error: 'Resposta invalida do servidor.' }));
    if (!j.ok) throw new Error(j.error || 'Erro desconhecido.');
    return j;
  },
  rooms(p, m = 'POST') { return this.call('api/rooms.php', p, m); },
  game(p, m = 'POST') { return this.call('api/game.php', p, m); }
};
const Store = {
  get(k, d = null) { try { const v = localStorage.getItem('lq_' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('lq_' + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem('lq_' + k); } catch {} }
};
function toast(msg, kind = '') {
  const z = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = 'toast arrive ' + kind;
  t.textContent = msg;
  z.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3400);
}
function money(n) {
  n = Number(n || 0);
  const neg = n < 0;
  return (neg ? '-$' : '$') + Math.abs(n).toLocaleString('pt-BR');
}
