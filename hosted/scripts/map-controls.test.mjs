import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

function camera() {
  class Element {
    handlers = {}; children = []; attributes = {}; clientHeight = 500;
    setAttribute(k,v) { this.attributes[k] = v; }
    appendChild(child) { this.children.push(child); }
    focus() {} setPointerCapture() {}
    fire(type, input = {}) { this.handlers[type]?.({ preventDefault() {}, ...input }); }
  }
  const canvas = new Element(); canvas.parentElement = new Element();
  const target = { x: 0, y: 2, z: 0, set(x,y,z) { Object.assign(this,{x,y,z}); } };
  const state = { target, yaw: -.34, pitch: .78, dist: 172, camera: { fov: 45 }, followId: 1, chasePid: 1, chaseK: 1 };
  const context = vm.createContext({ window: {}, document: { createElement: () => new Element() } });
  vm.runInContext(fs.readFileSync(new URL('../public/js/map-controls.js', import.meta.url), 'utf8'), context);
  context.window.MapControls.attach(state, canvas, (el,type,fn) => { el.handlers[type] = fn; }, { min: 18, max: 280, home: 172 });
  return { state, canvas, buttons: canvas.parentElement.children[0].children };
}

test('drag moves the target without rotating and suspends automatic camera movement', () => {
  const { state, canvas, buttons } = camera();
  const yaw = state.yaw;
  canvas.fire('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
  canvas.fire('pointermove', { pointerId: 1, clientX: 160, clientY: 140, buttons: 1 });
  assert.notEqual(state.target.x, 0); assert.notEqual(state.target.z, 0);
  assert.equal(state.yaw, yaw); assert.equal(state.manualCamera, true);
  assert.equal(state.chasePid, null); assert.equal(state.chaseK, 0);
  canvas.fire('pointercancel', { pointerId: 1 });
  const x = state.target.x;
  canvas.fire('pointermove', { pointerId: 1, clientX: 300, clientY: 140 });
  assert.equal(state.target.x, x);
  buttons.find(b => b.textContent === 'Seguir turno').fire('click');
  assert.equal(state.manualCamera, false); assert.equal(state.wantDist, 82);
});

test('touch pinch zooms, lost capture ends movement, and keyboard and buttons remain available', () => {
  const { state, canvas, buttons } = camera();
  canvas.fire('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
  canvas.fire('pointerdown', { pointerId: 2, clientX: 200, clientY: 100 });
  canvas.fire('pointermove', { pointerId: 2, clientX: 300, clientY: 100 });
  assert.equal(state.dist, 86);
  canvas.fire('lostpointercapture', { pointerId: 1 });
  canvas.fire('lostpointercapture', { pointerId: 2 });
  const target = { ...state.target };
  canvas.fire('pointermove', { pointerId: 2, clientX: 400, clientY: 100 });
  assert.equal(state.target.x, target.x);
  canvas.fire('keydown', { key: 'ArrowRight' });
  assert.notEqual(state.target.x, target.x);
  for (let n=0; n<30; n++) buttons[0].fire('click');
  assert.equal(state.dist, 18);
  for (let n=0; n<30; n++) buttons[1].fire('click');
  assert.equal(state.dist, 280);
  buttons.find(b => b.textContent === 'Visão geral').fire('click');
  assert.equal(state.target.x, 0); assert.equal(state.target.z, 0); assert.equal(state.dist, 172);
});

test('rotation is explicitly available without moving the map target', () => {
  const { state, canvas, buttons } = camera();
  const toggle = buttons.find(b => b.textContent === 'Girar');
  toggle.fire('click'); assert.equal(toggle.attributes['aria-pressed'], 'true');
  const yaw = state.yaw;
  canvas.fire('pointerdown', { pointerId: 1, clientX: 100, clientY: 100 });
  canvas.fire('pointermove', { pointerId: 1, clientX: 160, clientY: 140, buttons: 1 });
  assert.notEqual(state.yaw, yaw); assert.equal(state.target.x, 0);
});
