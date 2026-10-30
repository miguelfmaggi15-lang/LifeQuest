import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

// Real vendored Three.js geometry, deterministic clock, no GPU needed.
function island({ reduced = false } = {}) {
  let now = 0, scene, renderer;
  const frames = new Map(); let id = 0;
  const ink = new Proxy({}, { get: (_, key) => key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {} });
  class Element {
    children = []; style = {}; clientWidth = 1000; clientHeight = 520; classList = { contains: () => true };
    appendChild(child) { this.children.push(child); child.parentNode = this; }
    removeChild(child) { this.children = this.children.filter(c => c !== child); }
    setAttribute() {} addEventListener() {} querySelector() { return null; } closest() { return null; }
    getContext() { return ink; }
  }
  const context = vm.createContext({ console, AbortController, performance: { now: () => now },
    matchMedia: () => ({ matches: reduced }), setTimeout: () => 1, clearTimeout() {},
    requestAnimationFrame: fn => { frames.set(++id, fn); return id; }, cancelAnimationFrame: key => frames.delete(key),
    MutationObserver: class { observe() {} disconnect() {} },
    document: { createElement: () => new Element(), body: new Element(), addEventListener() {}, hidden: false, getElementById: () => new Element() },
    addEventListener() {}, devicePixelRatio: 1
  });
  context.window = context;
  const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  vm.runInContext(read('public/assets/js/three.min.js'), context);
  context.THREE.WebGLRenderer = class {
    domElement = new Element(); shadowMap = {}; info = { render: { calls: 0, triangles: 0 } };
    constructor() { renderer = this; }
    setSize() {} setPixelRatio() {} dispose() {}
    render(s, camera) { scene = s; this.camera = camera; }
  };
  context.MapControls = { attach() {} };
  for (const file of ['board', 'island-world', 'island-map']) {
    vm.runInContext(read('public/js/' + file + '.js'), context);
  }
  assert.equal(context.IslandMap.initGame(new Element()).ok, true);
  context.IslandMap.cancelIntro();
  function advance(ms = 10000) {
    now += ms;
    const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn(now));
  }
  const plain = value => JSON.parse(JSON.stringify(value));
  function tiles() {
    const result = [];
    scene.traverse(o => { if (Number.isInteger(o.userData.index)) result.push({ index: o.userData.index, type: o.userData.type, label: o.userData.label, position: o.position.toArray(), yaw: o.rotation.y }); });
    return plain(result);
  }
  return { api: context.IslandMap, tiles, advance, scene: () => scene, renderer: () => renderer,
    diagnostics: () => plain(context.IslandMap.diagnostics()) };
}

const players = [
  { player_id: 1, name: 'Ana', avatar_color: '#e84393', position: 5, spouse: 1, children_count: 2, car_seats: 4 },
  { player_id: 2, name: 'Bia', avatar_color: '#0984e3', position: 16, spouse: 1, children_count: 4, car_seats: 6 },
  { player_id: 3, name: 'Caio', avatar_color: '#00b894', position: 32, children_count: 0, car_seats: 4 },
  { player_id: 4, name: 'Davi', avatar_color: '#e17055', position: 52, spouse: 1, children_count: 5, car_seats: 6 }
];

// Captured from published source fbee21cc984939c63bb39052abfcad27318e3e85 before editing.
const contract = JSON.parse(fs.readFileSync(new URL('./fixtures/island-layout.json', import.meta.url), 'utf8'));

test('visual rework preserves every tile, label, pose and landmark in both board sizes', () => {
  const b = island();
  assert.deepEqual(b.tiles(), contract.tiles);
  assert.deepEqual(b.diagnostics().plots, contract.plots);
  assert.deepEqual(b.diagnostics().collisions, []);
  for (const size of [40, 60, 40, 60]) {
    b.api.setBoardSize(size);
    assert.deepEqual(b.tiles(), size === 40 ? contract.classic : contract.tiles);
  }
  b.api.dispose();
});

test('all four player positions and family capacities survive the new models', () => {
  const b = island(); b.api.setPlayers(players); b.advance();
  assert.deepEqual(b.diagnostics().positions, contract.players);
  const cars = b.scene().children.filter(o => o.userData.bodyG);
  assert.equal(cars[3].userData.badge !== null, true, 'overflow family stays represented');
  b.api.setPlayers([{ ...players[0], spouse: 1, children_count: 4, car_seats: 6 }]); b.advance();
  assert.equal(cars[0].userData.pins.children.length, 6);
  assert.equal(cars[0].userData.builtSeats, 6);
  assert.equal(cars[0].userData.wheels.length, 4);
  assert.equal(cars[0].userData.plate.visible, true);
  b.api.setPlayers([{ ...players[0], spouse: 0, children_count: 0, car_seats: 4 }]);
  assert.equal(cars[0].userData.pins.children.length, 1);
  assert.equal(cars[0].userData.builtSeats, 4);
  b.api.dispose();
});

test('animated and reduced-motion driving reach the same authoritative destination', async () => {
  for (const reduced of [false, true]) {
    const b = island({ reduced }); b.api.setPlayers(players);
    const driving = b.api.drive(1, 5, 19); b.advance(10000); await driving;
    const actual = b.diagnostics().positions[0];
    b.api.setPlayers([{ ...players[0], position: 19 }]);
    assert.deepEqual(actual, b.diagnostics().positions[0]);
    if (!reduced) assert.notEqual(b.scene().children.find(o => o.userData.bodyG).userData.wheels[0].rotation.x, 0);
    b.api.dispose();
  }
});

test('shared toy resources are released, including resources from replaced car bodies', () => {
  const b = island(); b.api.setPlayers(players); b.advance();
  const resources = new Set();
  b.scene().traverse(o => { if (o.geometry) resources.add(o.geometry); if (o.material && !Array.isArray(o.material)) resources.add(o.material); });
  let disposed = 0;
  resources.forEach(r => r.addEventListener('dispose', () => { disposed++; }));
  b.api.setPlayers([{ ...players[0], car_seats: 6, children_count: 4 }]); b.advance(); b.api.dispose();
  assert.equal(disposed, resources.size, 'each previously rendered shared resource is disposed once');
});
