import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';

const root = new URL('../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');

// Execute the real API against an isolated D1 adapter, never production rooms.
function api() {
  const rooms = new Map(), sessions = new Map();
  let next = 1;
  const db = {
    prepare(sql) {
      let args;
      return {
        bind(...values) { args = values; return this; },
        async first() {
          if (sql.includes('JOIN rooms')) {
            const session = sessions.get(args[0]);
            return session ? { ...rooms.get(session.room), player_id: session.player } : null;
          }
          return [...rooms.values()].find(r => r.code === args[0]) || null;
        },
        async run() {
          if (sql.startsWith('INSERT INTO rooms')) {
            const id = next++; rooms.set(id, { id, code: args[0], state_json: '{}', version: 1 });
            return { meta: { last_row_id: id, changes: 1 } };
          }
          if (sql.startsWith('INSERT INTO player_sessions')) sessions.set(args[0], { room: args[1], player: args[2] });
          else if (sql.startsWith('UPDATE rooms SET state_json')) rooms.get(args[1]).state_json = args[0];
          else if (sql.startsWith('UPDATE rooms SET status')) {
            const room = rooms.get(args[5]);
            if (room.version !== args[6]) return { meta: { changes: 0 } };
            room.state_json = args[3]; room.version++;
          }
          return { meta: { changes: 1 } };
        }
      };
    },
    async batch(statements) { return Promise.all(statements.map(s => s.run())); }
  };
  const context = vm.createContext({ exports: {}, require: () => ({ env: { DB: db } }), crypto: webcrypto, Request, Response, URL, console });
  const output = ts.transpileModule(read('app/api/[...path]/route.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInContext(output, context);
  return {
    rooms,
    async call(endpoint, input) {
      const response = await context.exports.POST(new Request('http://local/api/' + endpoint, { method: 'POST', body: JSON.stringify(input), headers: { 'Content-Type': 'application/json' } }), { params: Promise.resolve({ path: [endpoint] }) });
      return { status: response.status, ...await response.json() };
    }
  };
}

class Element {
  hidden = false; disabled = false; children = []; dataset = {}; textContent = ''; value = '';
  classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
  set innerHTML(value) { this.html = value; this.children = []; }
  get innerHTML() { return this.html || ''; }
  appendChild(child) { this.children.push(child); }
  querySelector() { return new Element(); }
  querySelectorAll() { return []; }
  focus() { this.focused = true; }
}
function client() {
  const elements = new Map([...read('public/game.html').matchAll(/id="([^"]+)"/g)].map(m => [m[1], new Element()]));
  // These controls are created dynamically by the real auction UI.
  for (const id of ['bidAmount', 'btnBidGo', 'btnBidPass', 'btnTradeSend', 'trTo', 'trGive', 'trGiveM', 'trWant', 'trWantM']) elements.set(id, new Element());
  const document = {
    getElementById: id => elements.get(id),
    createElement: () => new Element(),
    querySelector: () => null,
    querySelectorAll: () => []
  };
  const context = vm.createContext({ window: { matchMedia: () => ({ matches: true }) }, document, requestAnimationFrame: fn => fn(), setInterval: () => 1, clearInterval() {}, console,
    Store: { set() {}, get() {}, del() {} }, Sound: { click() {}, cash() {} }, toast() {}, money: n => '$' + n, escapeHtml: s => s, API: {} });
  vm.runInContext(read('public/js/game.js') + '\nglobalThis.Game = Game;', context);
  vm.runInContext(read('public/js/mono.js') + '\nglobalThis.Mono = Mono;', context);
  vm.runInContext(read('public/js/multiplayer-rolls.js') + '\nglobalThis.MultiplayerRolls = window.MultiplayerRolls;', context);
  context.Game.session = { token: 'guest-token', player_id: 2, game_type: 'mono' };
  return { context, elements, Game: context.Game, Mono: context.Mono };
}

test('host and guest follow the same mode, including rejoin and reconnect', async () => {
  for (const game_type of ['mono', 'life']) {
    const server = api();
    const host = await server.call('rooms.php', { action: 'create', game_type, name: 'Host' });
    assert.equal(host.status, 200, host.error);
    const guest = await server.call('rooms.php', { action: 'join', code: host.code, name: 'Guest' });
    assert.equal(guest.status, 200, guest.error);
    const rejoin = await server.call('rooms.php', { action: 'join', code: host.code, name: 'Guest' });
    assert.equal(guest.game_type, game_type); assert.equal(rejoin.game_type, game_type);
    const start = await server.call(game_type === 'mono' ? 'mono.php' : 'game.php', { action: 'start', token: host.token });
    assert.equal(start.status, 200);
    const reconnect = await server.call('rooms.php', { action: 'reconnect', token: guest.token });
    assert.equal(reconnect.room.game_type, game_type);
    const { context, Game, Mono } = client();
    let selected;
    context.API.rooms = input => server.call('rooms.php', input);
    Game.session = { ...guest, game_type: 'life' }; // A stale client session must be corrected by the room.
    Game.renderLobby = () => {};
    Game.enterGame = () => { selected = 'life'; };
    Mono.enterGame = () => { selected = 'mono'; };
    await Game.pollLobby();
    assert.equal(selected, game_type);
    assert.equal(Game.session.game_type, game_type);
  }
});

function state() {
  return { room: { state_version: 1 }, game: { id: 5, current_player_id: 2, status: 'playing', round: 1 },
    players: [{ player_id: 2, name: 'Guest', money: 5000, net_worth: 5000, position: 1, pending_type: 'buy', pending_data: { tile: 1 } }, { player_id: 3, name: 'Other', money: 5000 }],
    tiles: [{ tile: 1, name: 'Vila', price: 600 }], deeds: [], offers: [], feed: [], pending: null };
}

test('buy window closes, stays closed during polling, resumes and clears after purchase', async () => {
  const { context, Mono, elements } = client();
  const j = state(); Mono.state = j; Mono.renderGame(j);
  assert.equal(elements.get('monoEventClose').hidden, false);
  elements.get('monoEventClose').onclick();
  assert.equal(elements.get('monoEventPanel').hidden, true);
  Mono.renderGame(j);
  assert.equal(elements.get('monoEventPanel').hidden, true);
  assert.equal(elements.get('btnMonoPending').hidden, false);
  elements.get('btnMonoPending').onclick();
  assert.equal(elements.get('monoEventPanel').hidden, false);
  const resolved = structuredClone(j); resolved.players[0].pending_type = null; resolved.game.current_player_id = 3;
  context.API.call = async () => resolved;
  await elements.get('monoEventChoices').children[0].onclick();
  assert.equal(elements.get('monoEventPanel').hidden, true);
  assert.equal(elements.get('btnMonoPending').hidden, true);
  assert.equal(elements.get('btnRoll').disabled, true);
});

test('bidder and spectator can dismiss and resume auction; new bidder and completion update UI', async () => {
  const { context, Mono, elements } = client();
  const j = state(); j.players[0].pending_type = null;
  j.pending = { type: 'auction', tile: 1, order: [2, 3], idx: 0, highest: 0 };
  Mono.state = j; Mono.renderGame(j);
  elements.get('bidAmount').value = '700';
  Mono.renderGame(j);
  assert.equal(elements.get('bidAmount').value, '700');
  elements.get('monoEventClose').onclick(); Mono.renderGame(j);
  assert.equal(elements.get('monoEventPanel').hidden, true);
  elements.get('btnMonoPending').onclick();
  assert.equal(elements.get('monoEventPanel').hidden, false);
  const next = structuredClone(j); next.pending.idx = 1;
  context.API.call = async () => next;
  await elements.get('btnBidPass').onclick();
  assert.match(elements.get('monoEventText').textContent, /Aguardando Other/);
  assert.equal(elements.get('monoBidBox').innerHTML, '');
  assert.equal(elements.get('btnRoll').disabled, true);
  elements.get('monoEventClose').onclick(); Mono.renderGame(next);
  assert.equal(elements.get('monoEventPanel').hidden, true);
  const finished = structuredClone(next); finished.pending = null; Mono.renderGame(finished);
  assert.equal(elements.get('btnMonoPending').hidden, true);
  assert.equal(elements.get('btnRoll').disabled, false);
});

test('failed purchase remains recoverable without losing decision', async () => {
  const { context, Mono, elements } = client();
  const j = state(); Mono.state = j; Mono.renderGame(j);
  context.API.call = async () => { throw new Error('Dinheiro insuficiente.'); };
  await elements.get('monoEventChoices').children[0].onclick();
  assert.equal(elements.get('monoEventPanel').hidden, false);
  assert.equal(Mono._actionBusy, false);
  elements.get('monoEventClose').onclick(); elements.get('btnMonoPending').onclick();
  assert.equal(elements.get('monoEventChoices').children.length, 2);
});

test('server rejects rolling while auction is pending without changing turn', async () => {
  const server = api();
  const host = await server.call('rooms.php', { action: 'create', game_type: 'mono', name: 'Host' });
  await server.call('rooms.php', { action: 'join', code: host.code, name: 'Guest' });
  await server.call('mono.php', { action: 'start', token: host.token });
  const row = server.rooms.get(host.room_id), s = JSON.parse(row.state_json);
  s.game.current_player_id = host.player_id;
  s.game.pending_json = { type: 'auction', tile: 1, order: [host.player_id], idx: 0, highest: 0 };
  row.state_json = JSON.stringify(s);
  const before = row.state_json;
  const result = await server.call('mono.php', { action: 'roll', token: host.token });
  assert.equal(result.status, 409); assert.match(result.error, /leilão/);
  assert.equal(row.state_json, before);
});

test('both APIs persist authoritative roll details for spectators', async () => {
  for (const mode of ['life', 'mono']) {
    const server = api();
    const host = await server.call('rooms.php', { action: 'create', game_type: mode, name: 'Host' });
    const guest = await server.call('rooms.php', { action: 'join', code: host.code, name: 'Guest' });
    const endpoint = mode === 'life' ? 'game.php' : 'mono.php';
    const started = await server.call(endpoint, { action: 'start', token: host.token });
    const actor = started.game.current_player_id === host.player_id ? host : guest;
    const rolled = await server.call(endpoint, { action: mode === 'life' ? 'spin' : 'roll', token: actor.token });
    assert.equal(rolled.status, 200);
    const observed = await server.call(endpoint, { action: 'state', token: guest.token });
    const entry = observed.feed.find(f => f.action_type === (mode === 'life' ? 'spin' : 'roll'));
    assert.equal(entry.animation.from, 0);
    assert.equal(entry.animation.to, rolled.players.find(p => p.player_id === actor.player_id).position);
    if (mode === 'life') assert.equal(entry.animation.spin, rolled.event.spin);
    else assert.deepEqual(entry.animation.dice, rolled.event.dice);
  }
});

test('roll replay handles repeated rolls, unchanged polls, own actions and reconnection', async () => {
  const { context } = client();
  for (const type of ['roll', 'spin']) {
    const before = { game: { id: 10 }, players: [{ player_id: 1, position: 0 }, { player_id: 2, position: 0 }], feed: [{ id: 1 }] };
    const next = structuredClone(before);
    next.feed.push(
      { id: 2, player_id: 1, action_type: type, animation: { from: 0, to: 4, dice: [2, 2], spin: 4 } },
      { id: 3, player_id: 1, action_type: type, animation: { from: 4, to: 8, dice: [2, 2], spin: 4 } },
      { id: 4, player_id: 2, action_type: type, animation: { from: 0, to: 3, dice: [1, 2], spin: 3 } }
    );
    const calls = [];
    const animate = async r => calls.push([r.pid, r.from, r.to]);
    await context.MultiplayerRolls.replay(before, next, 2, type, animate);
    assert.deepEqual(calls, [[1, 0, 4], [1, 4, 8]]);
    await context.MultiplayerRolls.replay(next, next, 2, type, animate);
    await context.MultiplayerRolls.replay(null, next, 2, type, animate);
    await context.MultiplayerRolls.replay(before, { ...next, game: { id: 11 } }, 2, type, animate);
    assert.equal(calls.length, 2);
  }
});

test('both clients animate remote rolls before rendering and serialize polling', async () => {
  for (const mode of ['life', 'mono']) {
    const { context, Game, Mono, elements } = client();
    const controller = mode === 'life' ? Game : Mono, calls = [];
    context.Sound.spin = () => {};
    elements.get('roulette').style = { setProperty() {} };
    let release;
    const paused = new Promise(resolve => { release = resolve; });
    context.Board = { follow() {}, animateMove: async (players, pid, from, to) => { calls.push(['move', pid, from, to]); await paused; } };
    context.Monocity = context.window.Monocity = { follow() {}, rollDice: async (a,b) => calls.push(['dice',a,b]), drive: async (pid,from,to) => { calls.push(['move',pid,from,to]); await paused; } };
    const before = { game: { id: 1 }, players: [{ player_id: 1, position: 0, name: 'Host' }], feed: [{ id: 1 }], room: { state_version: 1 } };
    const next = structuredClone(before); next.room.state_version = 2;
    next.feed.push({ id: 2, player_id: 1, action_type: mode === 'life' ? 'spin' : 'roll', animation: { from: 0, to: 5, dice: [2,3], spin: 5 } });
    let requests = 0;
    context.API.game = context.API.call = async () => { requests++; return next; };
    controller.state = before;
    controller.renderGame = () => calls.push(['render']);
    const refresh = controller.refresh(false);
    for (let n=0; n<10; n++) await Promise.resolve();
    assert.equal(controller._refreshing, true);
    assert.equal(calls.some(c => c[0] === 'render'), false, JSON.stringify({ mode, calls }));
    await controller.refresh(false);
    assert.equal(requests, 1);
    release(); await refresh;
    assert.deepEqual(calls.at(-1), ['render']);
    assert.equal(controller._refreshing, false);
    await controller.refresh(false);
    assert.equal(calls.filter(c => c[0] === 'move').length, 1);
  }
});
