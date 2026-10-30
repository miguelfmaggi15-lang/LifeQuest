/* Shared camera navigation for both Three.js boards. */
window.MapControls = {
  fitPreview(state, radius) {
    const halfFov = state.camera.fov * Math.PI / 360;
    const limitingAngle = Math.atan(Math.tan(halfFov) * Math.min(1, state.camera.aspect));
    state.dist = state.wantDist = radius * 1.06 / Math.sin(limitingAngle);
    state.target.set(0, 2, 0);
  },
  attach(state, canvas, listen, options) {
    const pointers = new Map();
    let gesture = null, rotate = false;
    const manual = () => {
      if (options.cancelIntro) options.cancelIntro();
      state.manualCamera = true; state.auto = false;
      state.chasePid = null; state.chaseK = 0;
    };
    const zoom = factor => {
      manual();
      state.dist = state.wantDist = Math.max(options.min, Math.min(options.max, state.dist * factor));
    };
    const pan = (dx, dy) => {
      manual();
      const scale = 2 * state.dist * Math.tan(state.camera.fov * Math.PI / 360) / (canvas.clientHeight || 420);
      const forward = dy * scale / Math.max(.4, Math.sin(state.pitch));
      state.target.x -= Math.cos(state.yaw) * dx * scale;
      state.target.z += Math.sin(state.yaw) * dx * scale;
      state.target.x += Math.sin(state.yaw) * forward;
      state.target.z += Math.cos(state.yaw) * forward;
      state.target.x = Math.max(-100, Math.min(100, state.target.x));
      state.target.z = Math.max(-100, Math.min(100, state.target.z));
    };
    function measure() {
      const points = [...pointers.values()];
      if (!points.length) return null;
      const a = points[0], b = points[1] || a;
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y), count: points.length };
    }
    listen(canvas, 'pointerdown', e => {
      canvas.focus();
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      gesture = measure();
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    });
    listen(canvas, 'pointermove', e => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const next = measure();
      if (gesture && next.count === gesture.count) {
        const dx = next.x - gesture.x, dy = next.y - gesture.y;
        if (next.count > 1 && gesture.distance && next.distance) zoom(gesture.distance / next.distance);
        if (rotate || e.shiftKey || e.buttons === 2) {
          manual(); state.yaw -= dx * .005;
          state.pitch = Math.max(.45, Math.min(1.3, state.pitch - dy * .004));
        } else pan(dx, dy);
      }
      gesture = next;
    });
    const release = e => { pointers.delete(e.pointerId); gesture = measure(); };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(name => listen(canvas, name, release));
    listen(canvas, 'contextmenu', e => e.preventDefault());
    listen(canvas, 'wheel', e => { e.preventDefault(); zoom(Math.exp(Math.max(-100, Math.min(100, e.deltaY)) * .002)); }, { passive: false });
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', 'Mapa: arraste para mover; Shift e arraste para girar; setas para mover; mais e menos para zoom.');
    listen(canvas, 'keydown', e => {
      const moves = { ArrowLeft: [50, 0], ArrowRight: [-50, 0], ArrowUp: [0, 50], ArrowDown: [0, -50] };
      if (moves[e.key]) { e.preventDefault(); pan(...moves[e.key]); }
      else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoom(.8); }
      else if (e.key === '-') { e.preventDefault(); zoom(1.25); }
    });
    const controls = document.createElement('div'); controls.className = 'map-camera-controls';
    const button = (text, label, click) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-sm';
      b.textContent = text; b.setAttribute('aria-label', label);
      listen(b, 'click', click); controls.appendChild(b); return b;
    };
    button('+', 'Aproximar mapa', () => zoom(.8));
    button('−', 'Afastar mapa', () => zoom(1.25));
    const rotation = button('Girar', 'Alternar arraste para girar', () => { rotate = !rotate; rotation.setAttribute('aria-pressed', String(rotate)); });
    rotation.setAttribute('aria-pressed', 'false');
    button('Visão geral', 'Mostrar todo o mapa', () => {
      manual(); state.target.set(0, 2, 0); state.yaw = -.34; state.pitch = .78;
      state.dist = state.wantDist = options.home;
    });
    button('Seguir turno', 'Voltar a seguir o jogador do turno', () => {
      if (options.cancelIntro) options.cancelIntro();
      state.manualCamera = false; state.overview = false; state.wantDist = 82;
    });
    canvas.parentElement.appendChild(controls);
  }
};
