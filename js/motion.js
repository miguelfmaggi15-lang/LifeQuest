/* LIFE QUEST — reveals + count-up (respeita reduced-motion) */
window.Motion = (function () {
  var RM = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function fmt(n) {
    n = Number(n || 0);
    return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('pt-BR');
  }
  function countUp(el, from, to, dur) {
    if (!el) return;
    from = Number(from || 0); to = Number(to || 0);
    if (RM || from === to || !isFinite(from) || !isFinite(to)) { el.textContent = fmt(to); return; }
    var t0 = performance.now(); dur = dur || 350;
    (function f() {
      var k = Math.min(1, (performance.now() - t0) / dur);
      var e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(Math.round(from + (to - from) * e));
      if (k < 1) requestAnimationFrame(f);
    })();
  }
  function initReveals(root) {
    root = root || document;
    root.querySelectorAll('[data-reveal]').forEach(function (el) { el.classList.add('in'); });
  }
  return { countUp: countUp, fmt: fmt, initReveals: initReveals, reduced: function () { return RM; } };
})();
