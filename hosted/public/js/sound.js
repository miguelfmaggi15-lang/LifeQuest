/* LIFE QUEST — sons originais via WebAudio (sem arquivos) */
const Sound = {
  enabled: true, ctx: null,
  init() {
    this.enabled = Store.get('sound', true);
    this.syncBtn();
  },
  syncBtn() {
    const b = document.getElementById('btnSound');
    if (b) { b.textContent = 'Som: ' + (this.enabled ? 'ON' : 'OFF'); b.setAttribute('aria-pressed', String(this.enabled)); }
  },
  toggle() {
    this.enabled = !this.enabled;
    Store.set('sound', this.enabled);
    this.syncBtn();
    if (this.enabled) this.click();
  },
  ac() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
    return this.ctx;
  },
  tone(freq, dur = 0.12, type = 'sine', vol = 0.18, when = 0) {
    if (!this.enabled) return;
    const c = this.ac(); if (!c) return;
    try {
      const t = c.currentTime + when;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + dur + 0.02);
    } catch {}
  },
  click() { this.tone(660, 0.07, 'square', 0.08); },
  spin() { for (let i = 0; i < 8; i++) this.tone(300 + i * 70, 0.08, 'triangle', 0.12, i * 0.09); },
  cash() { this.tone(880, 0.1, 'sine', 0.16); this.tone(1320, 0.14, 'sine', 0.14, 0.09); },
  bad() { this.tone(220, 0.18, 'sawtooth', 0.1); this.tone(160, 0.22, 'sawtooth', 0.1, 0.1); },
  win() { [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.16, i * 0.13)); }
};
/* particulas discretas */
const FX = {
  cv: null, cx: null, parts: [],
  init() {
    this.cv = document.getElementById('fx');
    if (!this.cv) return;
    const fit = () => { this.cv.width = innerWidth; this.cv.height = innerHeight; };
    fit(); addEventListener('resize', fit);
    this.cx = this.cv.getContext('2d');
    const loop = () => {
      if (!this.cx) return;
      this.cx.clearRect(0, 0, this.cv.width, this.cv.height);
      this.parts = this.parts.filter(p => p.a > 0);
      for (const p of this.parts) {
        p.x += p.vx; p.y += p.vy; p.a -= 0.012;
        this.cx.globalAlpha = Math.max(0, p.a);
        this.cx.fillStyle = p.c;
        this.cx.beginPath(); this.cx.arc(p.x, p.y, p.r, 0, 7); this.cx.fill();
      }
      this.cx.globalAlpha = 1;
      requestAnimationFrame(loop);
    };
    loop();
    // poeira ambiente
    setInterval(() => {
      if (document.hidden || this.parts.length > 90) return;
      this.parts.push({ x: Math.random() * innerWidth, y: innerHeight - 10, vx: (Math.random() - .5) * .6, vy: -0.6 - Math.random(), r: 1 + Math.random() * 2.2, a: .5, c: '#fdcb6e' });
    }, 700);
  },
  burst(x, y, n = 26, colors = ['#fdcb6e', '#e84393', '#00b894', '#fff']) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 3;
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, r: 1.5 + Math.random() * 2.5, a: 1, c: colors[i % colors.length] });
    }
  },
  money(el) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const s = document.createElement('div');
    s.className = 'money-fly';
    s.textContent = '+$';
    s.style.left = (r.left + r.width / 2) + 'px';
    s.style.top = (r.top - 6) + 'px';
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 1700);
  },
  confetti(n = 90) {
    const colors = ['#fdcb6e', '#e84393', '#00b894', '#6c5ce7', '#fff'];
    for (let i = 0; i < n; i++) {
      const d = document.createElement('div');
      d.className = 'confetti';
      d.style.left = (Math.random() * 100) + 'vw';
      d.style.background = colors[i % colors.length];
      d.style.animationDuration = (2.2 + Math.random() * 2) + 's';
      d.style.transform = 'rotate(' + (Math.random() * 360) + 'deg)';
      document.body.appendChild(d);
      setTimeout(() => d.remove(), 4500);
    }
  }
};
