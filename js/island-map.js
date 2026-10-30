/* LIFE QUEST — ilha 3D (Three.js r128 global). Caminho 40/60 casas, carrinhos, roleta central.
   API: IslandMap.initPreview(el) | IslandMap.initGame(el) | IslandMap.setPlayers(ps)
        IslandMap.drive(pid, from, to) -> Promise | IslandMap.spinRoulette() | IslandMap.dispose()
   Fallback: retorna {ok:false} se sem THREE/WebGL — Board usa grade CSS. */
(function () {
'use strict';
var TILE_COLORS = { inicio: 0x73c2aa, payday: 0x94d2a7, carreira: 0x89bce5, evento: 0xf3d386, sorte: 0xedc45b, casa: 0xeeb07c, familia: 0xe9a4bb, imposto: 0xe89786, escolha: 0xbcaddb, aposentadoria: 0xeab18c };
var INK = '#28434a', PAPER = '#fff4d9';
var CAR_COLORS = ['#e84393', '#0984e3', '#00b894', '#e17055'];
var RM = (typeof matchMedia === 'function') && matchMedia('(prefers-reduced-motion: reduce)').matches;

function textTex(w, h, fn) {
  var c = document.createElement('canvas'); c.width = w; c.height = h;
  fn(c.getContext('2d'), w, h);
  var t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
  return t;
}
/* Printed pictograms retain each category independently of color. */
function tileIcon(g, type, cx, cy, s) {
  g.fillStyle = INK; g.strokeStyle = INK;
  s = s || 1;
  if (type === 'payday') { g.font = '900 ' + Math.round(52 * s) + 'px Arial'; g.textAlign = 'center'; g.fillText('$', cx, cy + 18 * s); }
  else if (type === 'familia') {
    g.beginPath(); g.moveTo(cx, cy + 14 * s);
    g.bezierCurveTo(cx - 26 * s, cy - 4 * s, cx - 12 * s, cy - 22 * s, cx, cy - 8 * s);
    g.bezierCurveTo(cx + 12 * s, cy - 22 * s, cx + 26 * s, cy - 4 * s, cx, cy + 14 * s); g.fill();
  }
  else if (type === 'sorte') {
    g.beginPath();
    for (var k = 0; k < 10; k++) {
      var a = -Math.PI / 2 + k * Math.PI / 5, r = (k % 2 ? 9 : 20) * s;
      g[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    g.closePath(); g.fill();
  }
  else if (type === 'evento') { g.font = '900 ' + Math.round(52 * s) + 'px Arial'; g.textAlign = 'center'; g.fillText('!', cx, cy + 18 * s); }
  else if (type === 'escolha') { g.font = '900 ' + Math.round(48 * s) + 'px Arial'; g.textAlign = 'center'; g.fillText('?', cx, cy + 16 * s); }
  else if (type === 'casa') {
    g.fillRect(cx - 16 * s, cy - 4 * s, 32 * s, 20 * s);
    g.beginPath(); g.moveTo(cx - 20 * s, cy - 4 * s); g.lineTo(cx, cy - 20 * s); g.lineTo(cx + 20 * s, cy - 4 * s); g.closePath(); g.fill();
  }
  else if (type === 'carreira') {
    g.fillRect(cx - 18 * s, cy - 8 * s, 36 * s, 24 * s);
    g.strokeStyle = INK; g.lineWidth = 5 * s;
    g.beginPath(); g.moveTo(cx - 10 * s, cy - 8 * s); g.lineTo(cx - 10 * s, cy - 16 * s); g.lineTo(cx + 10 * s, cy - 16 * s); g.lineTo(cx + 10 * s, cy - 8 * s); g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(cx - 18 * s, cy - 2 * s, 36 * s, 6 * s);
  }
  else if (type === 'imposto') {
    g.font = '900 ' + Math.round(40 * s) + 'px Arial'; g.textAlign = 'center'; g.fillText('%', cx, cy + 14 * s);
  }
  else if (type === 'aposentadoria') {
    g.fillRect(cx - 3 * s, cy - 22 * s, 5 * s, 40 * s);
    g.beginPath(); g.moveTo(cx + 2 * s, cy - 22 * s); g.lineTo(cx + 24 * s, cy - 13 * s); g.lineTo(cx + 2 * s, cy - 4 * s); g.closePath(); g.fill();
  }
  else { g.font = '900 ' + Math.round(44 * s) + 'px Arial'; g.textAlign = 'center'; g.fillText('▶', cx, cy + 15 * s); }
}
function tileTopTexture(i, label, colorCss, type) {
  return textTex(256, 256, function (g, w, h) {
    g.fillStyle = colorCss; g.fillRect(0, 0, w, h);
    // Fine dry-brush marks are deterministic; the numbers always stay crisp.
    for (var k=0;k<65;k++) {
      g.fillStyle=k%2?'rgba(255,249,225,.12)':'rgba(40,67,74,.035)';
      g.fillRect((k*73+i*17)%256,(k*109)%256,5+k%15,1);
    }
    g.strokeStyle=PAPER;g.lineWidth=5;
    g.beginPath();g.moveTo(23,15);g.lineTo(233,17);g.quadraticCurveTo(240,17,240,25);
    g.lineTo(238,232);g.quadraticCurveTo(238,240,231,240);g.lineTo(23,238);
    g.quadraticCurveTo(15,238,16,230);g.lineTo(17,24);g.quadraticCurveTo(17,15,23,15);g.stroke();
    g.fillStyle=PAPER;g.beginPath();g.arc(47,47,30,0,Math.PI*2);g.fill();
    g.fillStyle=INK;g.font='900 35px Arial';g.textAlign='center';g.fillText(String(i),47,59);
    tileIcon(g,type,137,123,1.45);
    g.fillStyle=INK;g.font='900 24px Arial';
    g.fillText(String(label).slice(0,11).toUpperCase(),128,217,208);
  });
}
function boardTexture(txt, bg, fg) {
  return textTex(512, 128, function (g, w, h) {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle='rgba(255,244,217,.5)';g.lineWidth=5;g.strokeRect(9,9,w-18,h-18);
    g.fillStyle = fg; g.font = '900 50px Arial'; g.textAlign = 'center';
    g.fillText(txt, w / 2, 84);
  });
}

function roundedBox(w,h,d,r) {
  r=Math.min(r||.15,w/4,d/4);
  var s=new THREE.Shape(),x=-w/2,y=-d/2;
  s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);
  s.lineTo(x+w,y+d-r);s.quadraticCurveTo(x+w,y+d,x+w-r,y+d);
  s.lineTo(x+r,y+d);s.quadraticCurveTo(x,y+d,x,y+d-r);
  s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);
  var g=new THREE.ExtrudeGeometry(s,{depth:h-.12,steps:1,bevelEnabled:true,bevelSize:.06,bevelThickness:.06,bevelSegments:2,curveSegments:4});
  g.rotateX(-Math.PI/2);g.translate(0,-h/2+.06,0);return g;
}

var S = null; // cena ativa
var gameSize = 60;

function craftGeometry(key, create) {
  if(!S.visualGeometries[key]) S.visualGeometries[key]=create();
  return S.visualGeometries[key];
}
function craftMaterial(color) {
  var value=new THREE.Color(color),key=value.getHexString();
  if(!S.visualMaterials[key]) S.visualMaterials[key]=new THREE.MeshStandardMaterial({color:value.convertSRGBToLinear(),roughness:.94,metalness:0});
  return S.visualMaterials[key];
}
// Bake stationary toy details into one draw call; wheels and peg groups still animate.
function joinPaintedParts(group,key) {
  var geometry=craftGeometry(key,function(){
    var positions=[],normals=[],colors=[];
    group.children.forEach(function(part){
      part.updateMatrix();
      var geo=part.geometry.index?part.geometry.toNonIndexed():part.geometry.clone();
      geo.applyMatrix4(part.matrix);
      var p=geo.attributes.position.array,n=geo.attributes.normal.array,c=part.material.color;
      for(var i=0;i<p.length;i+=3){
        positions.push(p[i],p[i+1],p[i+2]);normals.push(n[i],n[i+1],n[i+2]);colors.push(c.r,c.g,c.b);
      }
      geo.dispose();
    });
    var result=new THREE.BufferGeometry();
    result.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    result.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    result.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));return result;
  });
  if(!S.visualMaterials.painted)S.visualMaterials.painted=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.94,metalness:0});
  group.clear();var mesh=new THREE.Mesh(geometry,S.visualMaterials.painted);mesh.castShadow=true;group.add(mesh);
}
function releaseBadge(badge) {
  if(!badge)return;
  badge.geometry.dispose();if(badge.material.map)badge.material.map.dispose();badge.material.dispose();
}
function buildWorld(scene, opts) {
  opts = opts || {};
  scene.fog = new THREE.Fog(0xa2c7c3, 240, 520);
  scene.add(new THREE.HemisphereLight(0xfff5e6, 0x536b63, 0.65));
  var sun = new THREE.DirectionalLight(0xffefd7, 1.2);
  sun.position.set(-65, 100, 75); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -100; sun.shadow.camera.right = 100; sun.shadow.camera.top = 100; sun.shadow.camera.bottom = -100;
  sun.shadow.camera.far = 280; sun.shadow.radius = 3; sun.shadow.normalBias = 0.15; sun.shadow.bias = -0.0003;
  scene.add(sun);

  // Broad-radius cubic corners: unlike Catmull-Rom control points, these
  // cannot overshoot into neighboring rows or create accidental S-bends.
  var ctrl = [[-48,46],[-48,14],[48,14],[48,-20],[-48,-20],[-48,-52],[46,-52],[55,-38]];
  S.maxTile = 59;
  var pts = ctrl.map(function (p) { return new THREE.Vector3(p[0], 2.4, p[1]); });
  var curve = new THREE.CurvePath(), last = pts[0];
  for (var ci=1;ci<pts.length-1;ci++) {
    var point=pts[ci], before=pts[ci-1], after=pts[ci+1];
    var trim=Math.min(15,point.distanceTo(before)*.46,point.distanceTo(after)*.46);
    var entry=point.clone().add(before.clone().sub(point).normalize().multiplyScalar(trim));
    var exit=point.clone().add(after.clone().sub(point).normalize().multiplyScalar(trim));
    curve.add(new THREE.LineCurve3(last,entry));
    curve.add(new THREE.CubicBezierCurve3(entry,
      entry.clone().lerp(point,.552285),exit.clone().lerp(point,.552285),exit));
    last=exit;
  }
  curve.add(new THREE.LineCurve3(last,pts[pts.length-1]));
  curve.arcLengthDivisions=2400;
  S.curve = curve;
  S.count = 60; // casas; Board.setSize ajusta p/ 40 no modo Clássico
  S.samples = [];
  var i, u;
  for (i = 0; i < 60; i++) { S.samples.push(curve.getPointAt(i / 59)); }

  var tiles = (window.LQ_TILES || []);
  function disposeGroup(gr) {
    var geometries=new Set(),materials=new Set(),textures=new Set();
    gr.traverse(function (o) {
      if (o.geometry) geometries.add(o.geometry);
      if (o.material) {
        var ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach(function (m) { if (m.map) textures.add(m.map); materials.add(m); });
      }
    });
    textures.forEach(function(t){t.dispose();});materials.forEach(function(m){m.dispose();});geometries.forEach(function(g){g.dispose();});
  }
  // estrada de pedra contínua sob as casas (fita + base + meio-fio duplo)
  // tamanho variável: Clássico (40) ou Maratona (60)
  S.buildTrack = function (size) {
    size = (size === 40) ? 40 : 60;
    S.count = size;
    if (S.trackGroup) { scene.remove(S.trackGroup); disposeGroup(S.trackGroup); }
    var tg = new THREE.Group(); scene.add(tg); S.trackGroup = tg;
    var maxU = (size - 1) / 59;
    var SEG = 180, hw = 2.8;
    var stoneTex = textTex(256, 256, function (c) {
      c.fillStyle = '#ebd7ad'; c.fillRect(0,0,256,256);
      c.strokeStyle='#d9bf90';c.lineWidth=2;
      for(var k=0;k<9;k++) {
        c.beginPath();c.moveTo(0,k*32+2);c.bezierCurveTo(70,k*32-3,170,k*32+7,256,k*32+1);c.stroke();
      }
    });
    stoneTex.wrapS = stoneTex.wrapT = THREE.RepeatWrapping;
    function strip(width, y, mat) {
      var geo = new THREE.BufferGeometry();
      var vp = [], uv = [], idx = [];
      for (var k = 0; k <= SEG; k++) {
        var uu = (k / SEG) * maxU;
        var pp = curve.getPointAt(uu), tt = curve.getTangentAt(uu);
        var px = -tt.z, pz = tt.x, pl = Math.hypot(px, pz) || 1;
        vp.push(pp.x - (px / pl) * width, y, pp.z - (pz / pl) * width);
        vp.push(pp.x + (px / pl) * width, y, pp.z + (pz / pl) * width);
        uv.push(uu * 44, 0, uu * 44, 1);
        if (k < SEG) { var a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      geo.setAttribute('position', new THREE.Float32BufferAttribute(vp, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx); geo.computeVertexNormals();
      var mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true; tg.add(mesh);
      return mesh;
    }
    strip(hw, 2.5, new THREE.MeshLambertMaterial({ map: stoneTex }));
    strip(hw + 0.5, 1.15, new THREE.MeshLambertMaterial({ color: 0xbb945f })); // base/saia
    [-1, 1].forEach(function (s) {
      var pts = [];
      for (var k = 0; k <= 90; k++) {
        var uu = (k / 90) * maxU, pp = curve.getPointAt(uu), tt = curve.getTangentAt(uu);
        var px = -tt.z, pz = tt.x, pl = Math.hypot(px, pz) || 1;
        pts.push(new THREE.Vector3(pp.x + (px / pl) * hw * s, 2.78, pp.z + (pz / pl) * hw * s));
      }
      var tube = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 140, 0.28, 8),
        new THREE.MeshLambertMaterial({ color: 0xffedcc }));
      tube.castShadow = true; tg.add(tube);
    });
    // arcos: START sempre; FIM só na Maratona; CHEGADA só na Clássica (casa 39)
    function arch(x, z, txt, bg, ry) {
      var g = new THREE.Group(); g.position.set(x, 0, z);
      if (ry) g.rotation.y = ry;
      var mat = new THREE.MeshLambertMaterial({ color: 0xb58a5c });
      [-3.8, 3.8].forEach(function (dx) { var p = new THREE.Mesh(roundedBox(.7,5,.7,.15), mat); p.position.set(dx, 3.4, 0); p.castShadow = true; g.add(p); });
      var board = new THREE.Mesh(roundedBox(9,2,.6,.15), new THREE.MeshStandardMaterial({ map: boardTexture(txt, bg, PAPER), roughness:1 }));
      board.position.y = 6.4; g.add(board); tg.add(g); return g;
    }
    // Gate posts sit OUTSIDE the 5.6-wide road corridor.
    arch(-48, 45.8, '★ START', '#44796c', 0);
    if (size === 60) {
      var finish=S.samples[59], ft=curve.getTangentAt(1);
      var ra = arch(finish.x,finish.z,'APOSENTADORIA','#a87850'); ra.rotation.y = Math.atan2(ft.x,ft.z);
    } else {
      var c39 = S.samples[39], t39 = curve.getTangentAt(39 / 59);
      var ch = arch(c39.x, c39.z, '★ CHEGADA', '#1e9e6a');
      ch.rotation.y = Math.atan2(t39.x, t39.z);
    }
  // casas do tabuleiro (0..size-1); na Clássica a 39 vira FIM
    var tileList = (window.LQ_TILES || []).slice();
    if (size === 40) tileList[39] = ['aposentadoria', 'FIM'];
    S.tileMeshes = [];
    var tileGeo = roundedBox(5.1,.55,5.3,.30);
    var tileSide = new THREE.MeshStandardMaterial({color:0xf3dcb0,roughness:1});
    var shape=new THREE.Shape(),tw=2.50,td=2.60,tr=.28;
    shape.moveTo(-tw+tr,-td);shape.lineTo(tw-tr,-td);shape.quadraticCurveTo(tw,-td,tw,-td+tr);
    shape.lineTo(tw,td-tr);shape.quadraticCurveTo(tw,td,tw-tr,td);shape.lineTo(-tw+tr,td);
    shape.quadraticCurveTo(-tw,td,-tw,td-tr);shape.lineTo(-tw,-td+tr);shape.quadraticCurveTo(-tw,-td,-tw+tr,-td);
    var tileFace=new THREE.ShapeGeometry(shape,4),uv=tileFace.attributes.uv,pos=tileFace.attributes.position;
    for(var vi=0;vi<uv.count;vi++)uv.setXY(vi,(pos.getX(vi)+tw)/(tw*2),(pos.getY(vi)+td)/(td*2));
    for (var ti = 0; ti < size; ti++) {
      var tu = ti / 59;
      var tpos = S.samples[ti], ttan = curve.getTangentAt(tu);
      var type = (tileList[ti] && tileList[ti][0]) || 'evento', label = (tileList[ti] && tileList[ti][1]) || '';
      var col = TILE_COLORS[type] || 0xffffff;
      var css = '#' + ('000000' + col.toString(16)).slice(-6);
      var side = tileSide;
      var top = new THREE.MeshStandardMaterial({ map: tileTopTexture(ti, label, css, type), color:0xffffff, roughness:1 });
      var m = new THREE.Mesh(tileGeo, side);
      var face=new THREE.Mesh(tileFace,top);
      face.rotation.x=-Math.PI/2;face.position.y=.279;face.receiveShadow=true;m.add(face);
      m.position.copy(tpos); m.position.y = 2.98;
      m.rotation.y = Math.atan2(ttan.x, ttan.z);
      m.castShadow = false; m.receiveShadow = true;
      m.userData = { index: ti, type: type, label: label, topMaterial:top };
      tg.add(m); S.tileMeshes.push(m);
    }
  };
  S.buildTrack(S.count);

  S.roulettePos = { x: 0, z: -3 };
  var rg = new THREE.Group(); rg.position.set(0, 0, -3); scene.add(rg);
  [[11.4, 2.95], [10.1, 3.65], [8.9, 4.35]].forEach(function (t, k) {
    var ring = new THREE.Mesh(new THREE.CylinderGeometry(t[0], t[0] + 0.6, 1.1, 44),
      new THREE.MeshStandardMaterial({ color: k === 2 ? 0x62978d : 0xc49461,metalness:0,roughness:1 }));
    ring.position.y = t[1]; ring.castShadow = true; ring.receiveShadow = true; rg.add(ring);
    var trim = new THREE.Mesh(new THREE.TorusGeometry(t[0] + 0.15, 0.14, 8, 44),
      new THREE.MeshStandardMaterial({ color: 0xf4dfb5,metalness:0,roughness:1 }));
    trim.rotation.x = Math.PI / 2; trim.position.y = t[1] + 0.55; rg.add(trim);
  });
  var base = new THREE.Mesh(new THREE.CylinderGeometry(8.6, 9.2, 1.2, 40), new THREE.MeshLambertMaterial({ color: 0xb48756 }));
  base.position.y = 3.85; base.castShadow = true; rg.add(base);
  var segCols = ['#edc45b','#e9a4bb','#bcaddb','#94d2a7','#89bce5','#e89786','#f3d386','#73c2aa','#eeb07c','#a8c4bf'];
  var topTex = textTex(512, 512, function (g) {
    for (var k = 0; k < 10; k++) {
      g.fillStyle = segCols[k]; g.beginPath(); g.moveTo(256, 256);
      g.arc(256, 256, 250, (k * 36 - 90) * Math.PI / 180, ((k + 1) * 36 - 90) * Math.PI / 180); g.closePath(); g.fill();
      g.strokeStyle=PAPER;g.lineWidth=4;g.stroke();
      g.fillStyle = INK; g.font = '900 44px Arial'; g.textAlign = 'center';
      var a = ((k + 0.5) * 36 - 90) * Math.PI / 180;
      g.fillText(String(k + 1), 256 + Math.cos(a) * 175, 256 + Math.sin(a) * 175 + 15);
    }
  });
  var disc = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 0.5, 40), new THREE.MeshStandardMaterial({ color: 0xffffff,roughness:1,metalness:0 }));
  disc.material.map = topTex; disc.position.y = 5.0; rg.add(disc);
  S.roulette = disc;
  // coluna central do spinner (gira junto com o disco)
  var column = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 2.6, 16),
    new THREE.MeshLambertMaterial({ color: 0xc49461 }));
  column.position.y = 6.1; column.castShadow = true; rg.add(column);
  S.roulettePin = column;
  var hub = new THREE.Mesh(new THREE.SphereGeometry(1.2, 20, 14), new THREE.MeshLambertMaterial({ color: 0xfff6dd }));
  hub.position.y = 7.7; rg.add(hub);
  var pointer = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.2, 4), new THREE.MeshLambertMaterial({ color: 0xffffff }));
  pointer.position.set(0, 5.6, -11.6); pointer.rotation.x = Math.PI; scene.add(pointer);

  // mundo rico (montanhas, cidade, lago, praia, farol, ceu) — caminho intacto
  S.low = !!opts.low;
  S.boats = []; S.clouds = [];
  if (window.IslandWorld && window.IslandWorld.build) {
    window.IslandWorld.build(S, { textTex: textTex, boardTexture: boardTexture });
  }

  // aro dourado que marca a casa do jogador do turno
  var ring = new THREE.Mesh(new THREE.RingGeometry(2.9, 3.45, 44),
    new THREE.MeshBasicMaterial({ color: 0xfdcb6e, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 3.58; ring.visible = false;
  scene.add(ring); S.ring = ring;

  S.cars = {}; S.order = []; S.popAnims = []; S.chasePid = null;
}

function carColorFor(p, idx) {
  if (p && p.avatar_color) return p.avatar_color;
  return CAR_COLORS[idx % 4];
}
function laneOffset(idx) { return (idx - 1.5) * 1.1; }
function waypointPos(i, lane) {
  var u = Math.max(0, Math.min(59, i)) / 59;
  var p = S.curve.getPointAt(u).clone();
  var tan = S.curve.getTangentAt(u);
  var px = -tan.z, pz = tan.x, l = Math.hypot(px, pz) || 1;
  p.x += (px / l) * lane; p.z += (pz / l) * lane; p.y = 3.26;
  return { pos: p, yaw: Math.atan2(tan.x, tan.z) };
}
/* Turned wooden pegs: painted clothes, round heads and tiny ink eyes. */
function makePin(color, small) {
  var g = new THREE.Group(), scale = small ? .72 : 1;
  var bodyGeo=craftGeometry('peg-body',function(){return new THREE.LatheGeometry([
    new THREE.Vector2(0,0),new THREE.Vector2(.23,.02),new THREE.Vector2(.27,.07),
    new THREE.Vector2(.24,.28),new THREE.Vector2(.18,.5),new THREE.Vector2(.12,.55)],12);});
  var body=new THREE.Mesh(bodyGeo,craftMaterial(color));body.castShadow=true;g.add(body);
  var head=new THREE.Mesh(craftGeometry('peg-head',function(){return new THREE.SphereGeometry(.24,12,8);}),craftMaterial(0xf2c995));
  head.position.y=.7;head.castShadow=true;g.add(head);
  [-1,1].forEach(function(side){
    var eye=new THREE.Mesh(craftGeometry('peg-eye',function(){return new THREE.SphereGeometry(.026,6,4);}),craftMaterial(0x3d4846));
    eye.position.set(side*.083,.73,.218);g.add(eye);
  });
  // Geometry is scaled so the existing arrival/pop animation remains unchanged.
  g.children.forEach(function(o){o.scale.multiplyScalar(scale);o.position.multiplyScalar(scale);});
  joinPaintedParts(g,'peg:'+new THREE.Color(color).getHexString()+':'+small);
  return g;
}
/* Assentos (carro olha p/ +Z): frente [motorista, esposa] + fileiras de tras p/ filhos */
function seatLayout(seats) {
  var L = seats >= 6 ? 4.6 : 3.4;
  var rows = seats >= 6 ? 3 : 2, out = [], r, c;
  for (r = 0; r < rows; r++) for (c = 0; c < 2; c++) out.push({ x: c === 0 ? -0.42 : 0.42, z: L / 2 - 0.95 - r * 1.25, row: r });
  return out;
}
function refreshPins(car, p) {
  var seats = Math.max(4, Math.min(6, Number(p.car_seats || 4)));
  var spouse = p.spouse ? 1 : 0;
  var kids = Math.max(0, Number(p.children_count || 0));
  var sig = seats + '|' + spouse + '|' + kids + '|' + (p.avatar_color || '');
  if (car.userData.pinSig === sig) return;
  car.userData.pinSig = sig;
  var old = car.userData.pins;
  if (old) { car.remove(old); }
  var grp = new THREE.Group();
  var driverCol = new THREE.Color(car.userData.baseColor);
  // reconstrói o carro se o tamanho mudou (4 <-> 6 lugares)
  if (car.userData.builtSeats !== seats) { buildBody(car, driverCol, seats); }
  var layout = seatLayout(seats);
  var riders = [{ color: driverCol, small: false }];
  if (spouse) riders.push({ color: 0xff9ff3, small: false });
  for (var k = 0; k < kids && riders.length < layout.length; k++) riders.push({ color: 0xf9ca24, small: true });
  var overflow = spouse + kids + 1 - riders.length;
  riders.forEach(function (rd, i) {
    var pin = makePin(rd.color, rd.small);
    pin.position.set(layout[i].x, 0.78, layout[i].z);
    grp.add(pin);
    if (i > 0 && !RM) { pin.scale.set(0.01, 0.01, 0.01); S.popAnims.push({ obj: pin, t: 0 }); }
  });
  // badge "+N" p/ quem não coube
  if (car.userData.badge) { car.remove(car.userData.badge); releaseBadge(car.userData.badge); car.userData.badge = null; }
  if (overflow > 0) {
    var badge = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5),
      new THREE.MeshBasicMaterial({
        map: textTex(128, 128, function (c) {
          c.fillStyle = '#0b1023'; c.beginPath(); c.arc(64, 64, 58, 0, 7); c.fill();
          c.fillStyle = '#fdcb6e'; c.font = '900 52px Arial'; c.textAlign = 'center'; c.fillText('+' + overflow, 64, 82);
        }), transparent: true
      }));
    badge.position.set(-0.2, 3.1, 0);
    car.add(badge); car.userData.badge = badge;
  }
  car.add(grp);
  car.userData.pins = grp;
}
/* Carroceria conversível, frente = +Z (sem teto p/ mostrar os pinos) */
function buildBody(car, color, seats) {
  var old=car.userData.bodyG;if(old)car.remove(old);
  var L=seats>=6?4.6:3.4,g=new THREE.Group(),bodyM=craftMaterial(color);
  function block(key,w,h,d,r,mat,x,y,z) {
    var m=new THREE.Mesh(craftGeometry(key,function(){return roundedBox(w,h,d,r);}),mat);
    m.position.set(x,y,z);m.castShadow=true;g.add(m);return m;
  }
  block('chassis'+seats,1.7,.55,L,.25,bodyM,0,.55,0);
  var hood=block('hood',1.5,.35,.9,.20,bodyM,0,.85,L/2-.2);hood.rotation.x=.18;
  var cream=craftMaterial(0xffe7bb),wood=craftMaterial(0xa37651),dark=craftMaterial(0x405156);
  block('cabin'+seats,1.34,.20,L-1.2,.14,wood,0,.80,-.2);
  [-1,1].forEach(function(side){
    block('sill'+seats,.16,.30,L-1.15,.07,bodyM,side*.77,.89,-.2);
    block('bumper',1.65,.18,.23,.08,cream,0,.49,side*(L/2+.04));
    block('rear-light',.30,.16,.09,.04,craftMaterial(0xcd7667),side*.5,.72,-L/2-.06);
  });
  seatLayout(seats).forEach(function(seat){
    block('seat',.58,.18,.54,.12,cream,seat.x,.94,seat.z);
    block('seat-back',.58,.32,.15,.07,wood,seat.x,1.04,seat.z-.3);
  });
  // Opaque painted glass and a low frame leave all family pegs visible from above.
  var shield=block('windscreen',1.38,.40,.11,.05,craftMaterial(0x9dc9cd),0,1.13,L/2-.68);shield.rotation.x=-.25;
  [-1,1].forEach(function(side){block('screen-post',.09,.44,.14,.04,cream,side*.70,1.12,L/2-.68);});
  var steering=new THREE.Mesh(craftGeometry('steering',function(){return new THREE.TorusGeometry(.17,.035,6,12);}),dark);
  steering.position.set(-.42,1.08,L/2-.62);steering.rotation.x=-.65;g.add(steering);
  [-.52,.52].forEach(function(x){
    var lamp=new THREE.Mesh(craftGeometry('headlight',function(){return new THREE.SphereGeometry(.15,8,6);}),cream);
    lamp.scale.z=.5;lamp.position.set(x,.74,L/2+.09);g.add(lamp);
  });
  joinPaintedParts(g,'car:'+new THREE.Color(color).getHexString()+':'+seats);
  var wg=craftGeometry('wood-wheel',function(){var geo=new THREE.CylinderGeometry(.4,.4,.34,16);geo.rotateZ(Math.PI/2);return geo;});
  var hg=craftGeometry('wheel-hub',function(){var geo=new THREE.CylinderGeometry(.19,.19,.36,12);geo.rotateZ(Math.PI/2);return geo;});
  var wheels=[];
  [[.88,L/2-.7],[-.88,L/2-.7],[.88,-L/2+.7],[-.88,-L/2+.7]].forEach(function(o){
    var wheel=new THREE.Mesh(wg,dark);wheel.position.set(o[0],.4,o[1]);wheel.castShadow=true;g.add(wheel);wheels.push(wheel);
    wheel.add(new THREE.Mesh(hg,cream));
    var cap=new THREE.Mesh(craftGeometry('wheel-pin',function(){var geo=new THREE.CylinderGeometry(.065,.065,.38,8);geo.rotateZ(Math.PI/2);return geo;}),wood);wheel.add(cap);
  });
  car.add(g);car.userData.bodyG=g;car.userData.wheels=wheels;car.userData.builtSeats=seats;
  if(car.userData.plate)car.userData.plate.position.set(0,1.06,L/2-.2);
}
function ensureCar(p, idx) {
  var id = p.player_id != null ? p.player_id : p.id;
  if (S.cars[id]) return S.cars[id];
  var g = new THREE.Group();
  g.userData.baseColor = carColorFor(p, idx);
  g.userData.lane = laneOffset(S.order.length % 4);
  g.userData.pinSig = null; g.userData.builtSeats = 0;
  var letter = (p.avatar_emoji || (p.name || '?')[0] || '?').toUpperCase();
  var plate = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: textTex(96, 96, function (c) { c.fillStyle = PAPER; c.beginPath(); c.arc(48, 48, 44, 0, 7); c.fill(); c.fillStyle = '#0b1023'; c.font = '900 52px Arial'; c.textAlign = 'center'; c.fillText(letter, 48, 66); }), transparent: true }));
  plate.rotation.x = -Math.PI / 2; plate.position.set(1.15, 0.86, 0); g.add(plate);
  g.userData.plate = plate;
  g.scale.set(1.25, 1.25, 1.25);
  S.scene.add(g); S.cars[id] = g; S.order.push(id);
  refreshPins(g, p);
  return g;
}

function commonInit(container, opts) {
  if (typeof THREE === 'undefined') return null;
  var W = container.clientWidth || 800, H = container.clientHeight || 420;
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch (e) { return null; }
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.low ? 1.25 : 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .88;
  container.appendChild(renderer.domElement);
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0xa2c7c3);
  var cam = new THREE.PerspectiveCamera(45, W / H, 0.1, 500);
  S = { renderer: renderer, scene: scene, camera: cam, container: container, yaw: -0.34, pitch: 0.74, dist: 172, target: new THREE.Vector3(0, 2, -4), followId: null, auto: !!opts.auto, raf: 0, t0: performance.now() };
  S.visualGeometries={};S.visualMaterials={};
  S.preview=!!opts.auto;
  S.controller=new AbortController();
  var state=S;
  function listen(el,name,handler,options) {
    el.addEventListener(name,handler,Object.assign({},options||{},{signal:state.controller.signal}));
  }
  buildWorld(scene, opts);
  // controlos manuais (sem OrbitControls p/ nao vendored extra)
  if (!state.preview && !state.auto) MapControls.attach(state, renderer.domElement, listen, { min: 18, max: 280, home: 172, cancelIntro: function () { window.IslandMap.cancelIntro(); } });
  listen(window,'resize', function () {
    if (!S || S.renderer !== renderer) return;
    var w = container.clientWidth || 800, h = container.clientHeight || 420;
    renderer.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix();
    if (state.showcase) MapControls.fitPreview(state, 78);
  });
  listen(document,'visibilitychange', function () {
    if (!S || S.renderer !== renderer) return;
    cancelAnimationFrame(S.raf);
    if(!document.hidden) {lastFrame=performance.now();loop();}
  });
  var ray = new THREE.Raycaster(), mouse = new THREE.Vector2(), tip = opts.tip || null;
  function hoverTip(e) {
    if (!tip) return;
    var r = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1; mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(mouse, cam);
    var hit = ray.intersectObjects(S.tileMeshes)[0];
    if (hit) {
      tip.style.display = 'block';
      tip.textContent = hit.object.userData.index + ' • ' + hit.object.userData.label;
      tip.style.left = (e.clientX - r.left + 12) + 'px'; tip.style.top = (e.clientY - r.top - 10) + 'px';
    } else tip.style.display = 'none';
  }
  listen(renderer.domElement, 'pointermove', function (e) { if (!e.buttons && opts.tip) hoverTip(e); else if (opts.tip) opts.tip.style.display = 'none'; });
  S.dust = S.dust || [];
  if (!S.dustTex) S.dustTex = textTex(64, 64, function (c) {
    var gr = c.createRadialGradient(32, 32, 2, 32, 32, 30);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
  });
  var lastFrame = performance.now();
  function loop() {
    if (!S || S.renderer !== renderer) return;
    var owner=container.closest('.screen');
    if(document.hidden || (owner && !owner.classList.contains('active'))) return;
    var nowMs = performance.now();
    var dt = Math.min(0.05, (nowMs - lastFrame) / 1000); lastFrame = nowMs;
    var t = (nowMs - S.t0) / 1000;
    if (S.showcase) S.yaw = S.previewStartYaw + (RM ? 0 : t * 0.055);
    else if (S.auto && !RM) S.yaw += (S.autoRate === undefined ? 0.00035 : S.autoRate);
    if (S.intro && !RM) {
      var ik = Math.min(1, (nowMs - S.intro.t0) / S.intro.dur);
      var ie = ik < 0.5 ? 2 * ik * ik : 1 - Math.pow(-2 * ik + 2, 2) / 2;
      S.yaw = -.8 + (S.camHome.yaw + .8) * ie;
      S.pitch = .92 + (S.camHome.pitch - .92) * ie;
      S.dist = 240 + (S.camHome.dist - 240) * ie;
      if (ik >= 1) S.intro = null;
    }
    if (!S.manualCamera && S.followId && S.cars[S.followId]) { var c = S.cars[S.followId].position; S.target.lerp(new THREE.Vector3(c.x, 2, c.z), 0.06); }
    else if (!S.manualCamera && S.homeTarget) S.target.lerp(S.homeTarget, 0.05);
    else if (!S.manualCamera) S.target.lerp(new THREE.Vector3(0, 2, 0), 0.03);
    // aro pulsante na casa do turno
    if (S.ring) {
      var rc = (S.followId && S.cars[S.followId]) ? S.cars[S.followId].position : null;
      S.ring.visible = !!rc && !S.auto;
      if (rc) {
        S.ring.position.set(rc.x, 3.58, rc.z);
        S.ring.material.opacity = 0.5 + 0.3 * Math.sin(t * 4);
      }
    }
    if (S.wantDist) S.dist += (S.wantDist - S.dist) * 0.05;
    // chase-cam: persegue por trás do carro em movimento
    var chasing = S.chasePid && S.cars[S.chasePid];
    S.chaseK = THREE.MathUtils.clamp((S.chaseK || 0) + (chasing ? dt * 2.4 : -dt * 1.6), 0, 1);
    var ox = S.target.x + Math.sin(S.yaw) * Math.cos(S.pitch) * S.dist;
    var oy = S.target.y + Math.sin(S.pitch) * S.dist;
    var oz = S.target.z + Math.cos(S.yaw) * Math.cos(S.pitch) * S.dist;
    if (S.chaseK > 0 && S.cars[S.chasePid || S.followId]) {
      var car = S.cars[S.chasePid || S.followId];
      var fx = Math.sin(car.rotation.y), fz = Math.cos(car.rotation.y);
      var cx = car.position.x - fx * 11, cy = car.position.y + 6.5, cz = car.position.z - fz * 11;
      ox = ox + (cx - ox) * S.chaseK; oy = oy + (cy - oy) * S.chaseK; oz = oz + (cz - oz) * S.chaseK;
      cam.position.set(ox, oy, oz);
      var lx = S.target.x + (car.position.x + fx * 6 - S.target.x) * S.chaseK;
      var lz = S.target.z + (car.position.z + fz * 6 - S.target.z) * S.chaseK;
      cam.lookAt(lx, car.position.y, lz);
    } else {
      cam.position.set(ox, oy, oz);
      cam.lookAt(S.target);
    }
    if (!RM) {
      if (S.water) S.water.position.y = -0.6 + Math.sin(t * 0.8) * 0.15;
      S.boats.forEach(function (b, k) { b.position.y = -6.5 + Math.sin(t * 1.2 + k * 2) * 0.17; b.rotation.z = Math.sin(t + k) * 0.035; });
      S.clouds.forEach(function (c2, k) { c2.position.x += 0.02 + k * 0.004; if (c2.position.x > 70) c2.position.x = -70; });
      if (window.IslandWorld && IslandWorld.tick) { try { IslandWorld.tick(t, dt, RM); } catch (e) {} }
      if (S.auto && S.roulette) { S.roulette.rotation.y += 0.004; if (S.roulettePin) S.roulettePin.rotation.y += 0.004; }
      // pop-in dos pinos novos
      for (var pi = S.popAnims.length - 1; pi >= 0; pi--) {
        var an = S.popAnims[pi]; an.t += dt * 3;
        var sc = an.t >= 1 ? 1 : (1 - Math.pow(1 - an.t, 3));
        an.obj.scale.set(Math.max(0.01, sc), Math.max(0.01, sc), Math.max(0.01, sc));
        if (an.t >= 1) S.popAnims.splice(pi, 1);
      }
      // poeira
      for (var di = S.dust.length - 1; di >= 0; di--) {
        var d = S.dust[di]; d.life -= dt;
        d.spr.position.y += dt * 1.6;
        var ds = d.spr.scale.x + dt * 2.4; d.spr.scale.set(ds, ds, 1);
        d.spr.material.opacity = Math.max(0, d.life * 0.7);
        if (d.life <= 0) { scene.remove(d.spr); d.spr.material.dispose(); S.dust.splice(di, 1); }
      }
    }
    renderer.render(scene, cam);
    S.raf = requestAnimationFrame(loop);
  }
  loop();
  S.loop = loop;
  // Existing app navigation only toggles screen classes. Resume the showcase
  // when returning home, and stop GPU rendering on hidden screens.
  S.screenObserver=new MutationObserver(function(records){
    if(S!==state || !records.some(function(r){return r.target.classList && r.target.classList.contains('screen');}))return;
    var home=document.getElementById('screen-landing');
    if(!state.preview && home && home.classList.contains('active')) {
      var hero=document.getElementById('heroIsland');
      if(hero) window.IslandMap.initPreview(hero);
    } else {
      cancelAnimationFrame(state.raf);lastFrame=performance.now();loop();
    }
  });
  S.screenObserver.observe(document.body,{attributes:true,attributeFilter:['class'],subtree:true});
  return S;
}

window.IslandMap = {
  ok: false, waypoints: 60,
  initPreview: function (container, opts) {
    dispose();
    var hero = !!((opts && opts.hero) || container.classList.contains('hero-bg'));
    var s = commonInit(container, { auto: true, low: container.clientWidth < 700 });
    if (!s) return { ok: false };
    if (hero) {
      // vitrine 3/4 próxima: START em destaque, aposentadoria ao fundo
      S.yaw = -0.32; S.pitch = 0.72; S.dist = 160;
      S.homeTarget = new THREE.Vector3(0, 2, -7);
      S.autoRate = 0;
    }
    if (opts && opts.showcase) {
      S.showcase = true; S.yaw = -0.32; S.pitch = 0.82;
      S.previewStartYaw = S.yaw;
      MapControls.fitPreview(S, 78);
    }
    this.ok = true;
    // 2 carrinhos demo em loop
    var demos = [{ player_id: 'd1', name: 'R', avatar_emoji: 'R', avatar_color: CAR_COLORS[0] }, { player_id: 'd2', name: 'B', avatar_emoji: 'B', avatar_color: CAR_COLORS[1] }];
    demos.forEach(function (d, k) { ensureCar(d, k); });
    var start = performance.now();
    (function demo() {
      if (S!==s || !S.cars.d1) return;
      var e = (performance.now() - start) / 1000;
      [0, 1].forEach(function (k) {
        var id = k ? 'd2' : 'd1';
        var idx = ((e * (RM ? 0 : 1.2) + k * 20)) % (S.count || 60);
        var w = waypointPos(idx, laneOffset(k));
        S.cars[id].position.copy(w.pos); S.cars[id].rotation.y = w.yaw;
      });
      if (S === s) s.demoTimer=setTimeout(function () { if (S === s) requestAnimationFrame(demo); }, 32);
    })();
    return { ok: true };
  },
  cancelIntro: function () {
    if(S && S.intro && S.camHome) {
      S.yaw=S.camHome.yaw; S.pitch=S.camHome.pitch; S.dist=S.camHome.dist;
    }
    if(S) S.intro=null;
  },
  initGame: function (boardEl) {
    dispose();
    var fallbackMarkup=boardEl.innerHTML;
    boardEl.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'island-wrap';
    wrap.style.height = '520px';
    var badge = document.createElement('span'); badge.className = 'island-badge'; badge.textContent = 'MAPA 3D';
    var hint = document.createElement('span'); hint.className = 'island-hint'; hint.textContent = 'Arraste para mover • Shift para girar • roda ou pinça para zoom';
    var tip = document.createElement('div'); tip.className = 'island-tip';
    var sr = document.createElement('ol'); sr.className = 'island-sr'; sr.setAttribute('aria-label', 'Posicoes dos jogadores');
    wrap.appendChild(badge); wrap.appendChild(hint); wrap.appendChild(tip);
    boardEl.appendChild(wrap); boardEl.appendChild(sr);
    var s = commonInit(wrap, { auto: false, tip: tip, low: wrap.clientWidth < 700 });
    if (!s) {boardEl.innerHTML=fallbackMarkup;this.ok=false;return { ok: false };}
    S.sr=sr;
    // varredura cinematográfica de entrada (pulável: clique, scroll ou Escape)
    if (!RM) {
      S.camHome = { yaw: -0.32, pitch: 0.74, dist: 172 };
      S.yaw = -.8; S.pitch = .92; S.dist = 240;
      S.intro = { t0: performance.now(), dur: 1600 };
    }
    this.ok = true;
    return { ok: true };
  },
  setPlayers: function (players) {
    if (!S || !S.scene) return;
    if(S.preview && document.getElementById('screen-game').classList.contains('active')) {
      this.initGame(document.getElementById('board'));
      this.setBoardSize(gameSize);
    }
    (players || []).forEach(function (p, k) {
      var car = ensureCar(p, k);
      refreshPins(car, p); // esposa/filhos/carro 6 viram pinos
      var w = waypointPos(Math.max(0, Math.min(S.count-1, Number(p.position || 0))), car.userData.lane);
      car.position.copy(w.pos); car.rotation.y = w.yaw;
    });
    if (S.sr) S.sr.innerHTML = (players || []).map(function (p) {
      var fam = (p.spouse ? ', esposa' : '') + (p.children_count > 0 ? ', ' + p.children_count + ' filho(s)' : '');
      return '<li>' + String(p.name).replace(/[<>&]/g, '') + ' na casa ' + p.position + fam + '</li>';
    }).join('');
  },
  /* Direção contínua: um percurso com acelera–cruzeiro–freia, rodas girando e chase-cam */
  drive: function (pid, from, to) {
    var self = this;
    if (!S || !S.scene || !S.cars[pid]) { return Promise.resolve(); }
    var car = S.cars[pid];
    var drivingState=S;
    from=THREE.MathUtils.clamp(Number(from)||0,0,S.count-1);
    to=THREE.MathUtils.clamp(Number(to)||0,0,S.count-1);
    if (RM || to <= from) {
      var w0 = waypointPos(to, car.userData.lane);
      car.position.copy(w0.pos); car.rotation.y = w0.yaw;
      return Promise.resolve();
    }
    S.followId = pid; S.chasePid = S.manualCamera ? null : pid; S.chaseK = 0;
    self.spinRoulette();
    self.dust(car.position, 8);
    var curveLen = S.curve.getLength();
    var dur = 450 + 330 * (to - from);
    return new Promise(function (res) {
      var t0 = performance.now(), lastIdx = from, prevYaw = car.rotation.y, lastT = t0;
      (function frame() {
        if (S!==drivingState || !S.cars[pid]) return res();
        var now = performance.now();
        var k = Math.min(1, (now - t0) / dur);
        var e = k * k * k * (k * (k * 6 - 15) + 10); // smootherstep: arranca e freia de verdade
        var u = (from + (to - from) * e) / 59;
        var pos = S.curve.getPointAt(u), tan = S.curve.getTangentAt(u);
        var px = -tan.z, pz = tan.x, pl = Math.hypot(px, pz) || 1;
        car.position.set(pos.x + (px / pl) * car.userData.lane, 3.26, pos.z + (pz / pl) * car.userData.lane);
        var yawT = Math.atan2(tan.x, tan.z), dyaw = yawT - prevYaw;
        while (dyaw > Math.PI) dyaw -= Math.PI * 2; while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        var dt = Math.max(1, now - lastT) / 1000; lastT = now;
        var speed = curveLen * (to - from) / 59 / (dur / 1000) * (0.2 + 1.6 * Math.sin(Math.min(1, k * 1.15) * Math.PI));
        car.rotation.y = prevYaw + dyaw * Math.min(1, dt * 10); prevYaw = car.rotation.y;
        car.rotation.z = THREE.MathUtils.clamp(-dyaw * speed * 0.012, -0.12, 0.12); // inclina na curva
        (car.userData.wheels || []).forEach(function (wh) { wh.rotation.x += speed * dt * 1.4; });
        // acende a casa atravessada + tick sonoro
        var idx = Math.round(from + (to - from) * e);
        if (idx !== lastIdx) {
          lastIdx = idx;
          var tile = S.tileMeshes[idx];
          if (tile) {
            tile.userData.topMaterial.emissive.setHex(0x444422);
            setTimeout(function () { if (tile.userData.topMaterial) tile.userData.topMaterial.emissive.setHex(0x000000); }, 350);
          }
          if (window.Sound) Sound.tone(480 + idx * 10, 0.05, 'triangle', 0.06);
        }
        if (k < 1) requestAnimationFrame(frame);
        else {
          var w2 = waypointPos(to, car.userData.lane);
          car.position.copy(w2.pos); car.rotation.y = w2.yaw; car.rotation.z = 0;
          setTimeout(function () { if (S===drivingState) S.chasePid = null; }, 900);
          res();
        }
      })();
    });
  },
  celebrate: function () {
    if (window.IslandWorld && window.IslandWorld.celebrate) {
      try { window.IslandWorld.celebrate(); } catch (e) {}
    }
  },
  dust: function (pos, n) {
    if (!S || !S.scene || !S.dustTex || RM) return;
    for (var k = 0; k < (n || 6); k++) {
      if (S.dust.length > 26) return;
      var m = new THREE.SpriteMaterial({ map: S.dustTex, transparent: true, opacity: 0.55, color: 0xd9cfae, depthWrite: false });
      var spr = new THREE.Sprite(m);
      spr.position.set(pos.x + (Math.random() - 0.5) * 2.4, pos.y - 1.6, pos.z + (Math.random() - 0.5) * 2.4);
      var sc = 1 + Math.random(); spr.scale.set(sc, sc, 1);
      S.scene.add(spr); S.dust.push({ spr: spr, life: 0.7 });
    }
  },
  spinRoulette: function () {
    if (!S || !S.roulette || RM) return;
    var r = S.roulette, pin = S.roulettePin;
    var turns = 4 + Math.random() * 2, target = r.rotation.y + turns * Math.PI * 2;
    var t0 = performance.now(), dur = 2000, from = r.rotation.y, pfrom = pin ? pin.rotation.y : 0;
    (function f() {
      var k = Math.min(1, (performance.now() - t0) / dur);
      var e = 1 - Math.pow(1 - k, 3);
      r.rotation.y = from + (target - from) * e;
      if (pin) pin.rotation.y = pfrom + (target - from) * e;
      if (k < 1 && S && S.roulette === r) requestAnimationFrame(f);
    })();
  },
  follow: function (pid) {
    if(!S)return;
    if(!S.manualCamera && pid && pid!==S.followId) S.wantDist=90;
    if(!pid) S.wantDist=172;
    S.followId=pid;
  },
  diagnostics: function () {
    if(!S) return null;
    var points=[],curves=[],collisions=[],minSpacing=Infinity,pinch=Infinity;
    for(var i=0;i<=1200;i++) points.push(S.curve.getPointAt(i/1200));
    for(var k=0;k<60;k++) {
      var a=S.curve.getTangentAt(Math.max(0,k-1)/59), b=S.curve.getTangentAt(Math.min(59,k+1)/59);
      var angle=Math.acos(THREE.MathUtils.clamp(a.dot(b),-1,1))*180/Math.PI;
      if(angle>65) curves.push({tile:k,angle:angle});
      if(k<59) minSpacing=Math.min(minSpacing,S.samples[k].distanceTo(S.samples[k+1]));
    }
    // Ignore locally-connected road segments, compare stretches > 18 units apart.
    var skip=Math.ceil(18/S.curve.getLength()*1200);
    for(var i=0;i<points.length;i+=4) for(var j=i+skip;j<points.length;j+=4) pinch=Math.min(pinch,points[i].distanceTo(points[j]));
    (S.decorPlots||[]).forEach(function(p){
      var d=Infinity;points.forEach(function(q){d=Math.min(d,Math.hypot(q.x-p.x,q.z-p.z));});
      if(d<p.r+3.5) collisions.push({name:p.name,distance:d,required:p.r+3.5});
    });
    var rd=Infinity;points.forEach(function(q){rd=Math.min(rd,Math.hypot(q.x,q.z+3));});
    return {length:S.curve.getLength(),spacing:S.curve.getLength()/59,minSpacing:minSpacing,
      pinch:pinch,badCurves:curves,collisions:collisions,rouletteDistance:rd,
      tiles:S.tileMeshes.length,plots:S.decorPlots,drawCalls:S.renderer.info.render.calls,
      triangles:S.renderer.info.render.triangles,positions:Object.keys(S.cars).map(function(id){
        var c=S.cars[id];return {id:id,x:c.position.x,y:c.position.y,z:c.position.z,pins:c.userData.pins.children.length,seats:c.userData.builtSeats};
      })};
  },
  setBoardSize: function (size) {
    size = (size === 40) ? 40 : 60;
    gameSize=size;
    if (!S || !S.scene || !S.buildTrack) return false;
    if (S.count === size && S.trackGroup) return true;
    S.buildTrack(size);
    var hint=S.container.querySelector('.island-hint');
    if(hint)hint.textContent='START → '+(size===40?'CHEGADA • 40 casas':'APOSENTADORIA • 60 casas');
    return true;
  },
  dispose: function () { dispose(); this.ok = false; }
};
function dispose() {
  if (S && S.raf) cancelAnimationFrame(S.raf);
  if(S && S.controller) S.controller.abort();
  if(S && S.screenObserver) S.screenObserver.disconnect();
  if(S && S.demoTimer) clearTimeout(S.demoTimer);
  if(S && S.scene) {
    var geometries=new Set(),materials=new Set(),textures=new Set();
    S.scene.traverse(function(o){
      if(o.geometry) geometries.add(o.geometry);
      if(o.material) (Array.isArray(o.material)?o.material:[o.material]).forEach(function(m){
        materials.add(m);Object.keys(m).forEach(function(k){if(m[k] && m[k].isTexture)textures.add(m[k]);});
      });
    });
    if(S.dustTex)textures.add(S.dustTex);
    Object.keys(S.visualGeometries||{}).forEach(function(k){geometries.add(S.visualGeometries[k]);});
    Object.keys(S.visualMaterials||{}).forEach(function(k){materials.add(S.visualMaterials[k]);});
    textures.forEach(function(t){t.dispose();}); materials.forEach(function(m){m.dispose();}); geometries.forEach(function(g){g.dispose();});
  }
  if (S && S.renderer) { try { S.renderer.dispose(); if (S.renderer.domElement.parentNode) S.renderer.domElement.parentNode.removeChild(S.renderer.domElement); } catch (e) {} }
  S = null;
}
})();
