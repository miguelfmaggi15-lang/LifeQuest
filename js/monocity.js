/* BANCO IMOBILIÁRIO — cidade 3D (Three.js r128 global). Tabuleiro 32 casas em anel.
   API: Monocity.initPreview(el) | initGame(el) | setState(payload) | drive(pid,from,to,dice)
        follow(pid) | celebrate() | dispose()
   Índices 0..31 vindos do servidor; payload = mono state (players,deeds,game). */
(function () {
'use strict';
var RM = (typeof matchMedia === 'function') && matchMedia('(prefers-reduced-motion: reduce)').matches;
var STEP = 7.6, HALF = 30.4;
var GROUP_COLORS = { vilas: '#4d96ff', bairros: '#00b894', avenidas: '#fdcb6e', centro: '#e17055', orla: '#00cec9', metro: '#e84393' };

function textTex(w, h, fn) {
  var c = document.createElement('canvas'); c.width = w; c.height = h;
  fn(c.getContext('2d'), w, h);
  var t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
  return t;
}
// Anel no sentido horário visto de cima: 0=GO no canto SE; 1-7 base p/ oeste;
// 8-15 lateral oeste p/ norte; 16-23 topo p/ leste; 24-31 lateral leste p/ sul.
function tileAt(i) {
  var s = Math.floor(i / 8), k = i % 8, off = (k + 0.5) * STEP - HALF;
  if (s === 0) {
    if (k === 0) return { x: HALF, z: HALF, yaw: Math.PI };
    return { x: HALF - k * STEP, z: HALF, yaw: Math.PI };
  }
  if (s === 1) return { x: -HALF, z: HALF - k * STEP, yaw: Math.PI / 2 };
  if (s === 2) return { x: -HALF + k * STEP, z: -HALF, yaw: 0 };
  return { x: HALF, z: -HALF + k * STEP, yaw: -Math.PI / 2 };
}

var S = null;
var fallback = null;

// Detailed static miniatures share a handful of vertex-colour batches.
// The board, ownership and players remain separate from the scenery.
function cityBuilder(scene) {
  var buckets = {}, cache = {}, seed = 6319;
  function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
  function part(shape, color, x, y, z, dims, rot, category) {
    var key = shape + ':' + dims.join(','), geo = cache[key];
    if (!geo) {
      if (shape === 'box') geo = new THREE.BoxGeometry(dims[0], dims[1], dims[2]);
      else if (shape === 'cone') geo = new THREE.ConeGeometry(dims[0], dims[1], dims[2] || 8);
      else if (shape === 'sphere') geo = new THREE.IcosahedronGeometry(dims[0], 1);
      else if (shape === 'torus') geo = new THREE.TorusGeometry(dims[0], dims[1], 6, 32);
      else geo = new THREE.CylinderGeometry(dims[0], dims[1], dims[2], dims[3] || 12);
      cache[key] = geo.index ? geo.toNonIndexed() : geo;
      if (cache[key] !== geo) geo.dispose();
      geo = cache[key];
    }
    var o = new THREE.Object3D(); o.position.set(x, y, z);
    if (rot) o.rotation.set(rot[0], rot[1], rot[2]);
    if (shape === 'sphere' && dims.length > 1) o.scale.set(dims[1], dims[2], dims[3]);
    o.updateMatrix();
    var b = buckets[category || 'stone'] || (buckets[category || 'stone'] = { p: [], n: [], c: [] });
    var p = geo.attributes.position, n = geo.attributes.normal;
    var v = new THREE.Vector3(), normal = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(o.matrix);
    var col = new THREE.Color(color).convertSRGBToLinear();
    for (var i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrix); normal.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      b.p.push(v.x, v.y, v.z); b.n.push(normal.x, normal.y, normal.z); b.c.push(col.r, col.g, col.b);
    }
  }
  function box(c, x, y, z, w, h, d, rot, cat) { part('box', c, x, y, z, [w,h,d], rot, cat); }
  function cyl(c, x, y, z, rt, rb, h, cat) { part('cylinder', c, x,y,z, [rt,rb,h,16], null, cat); }
  function ball(c,x,y,z,r,sx,sy,sz,cat) { part('sphere', c,x,y,z,[r,sx||1,sy||1,sz||1],null,cat); }
  function sign(txt,x,y,z,w,bg,yaw) {
    var m = new THREE.Mesh(new THREE.PlaneGeometry(w,w*.24),new THREE.MeshStandardMaterial({
      map:textTex(512,128,function(g){g.fillStyle=bg||'#234e59';g.fillRect(0,0,512,128);g.fillStyle='#fff9e7';g.font='bold 58px Arial';g.textAlign='center';g.fillText(txt,256,85);}),roughness:.8,side:THREE.DoubleSide
    })); m.position.set(x,y,z);m.rotation.y=yaw||0;scene.add(m);
  }
  function roof(x,y,z,w,d,color) {
    var angle=.48, len=(w/2+.35)/Math.cos(angle);
    [-1,1].forEach(function(s){box(color,x+s*w*.25,y+.65,z,len,.22,d+.6,[0,0,-s*angle],'roofs');});
    box(0xe8bd8b,x,y+1.2,z,.25,.22,d+.75,null,'roofs');
    box(0xefd5b2,x+w*.22,y+1.3,z-d*.22,.45,1.2,.5);
  }
  function building(x,z,w,d,floors,color,style) {
    var base=.5,h=floors*2.05;
    box(0xb8c7ba,x,.32,z,w+.8,.4,d+.8);
    box(color,x,base+h/2,z,w,h,d);
    for(var f=0;f<floors;f++) {
      var yy=base+1.05+f*2.05;
      box(0xf2e8cf,x,yy+.92,z,w+.1,.12,d+.1);
      for(var k=0;k<3;k++) [-1,1].forEach(function(s){
        var xx=x+(k-1)*w*.29;
        box(0xf8ecd5,xx,yy,z+s*(d/2+.04),.86,1.18,.14);
        box((k+f)%3===0?0xdac490:0x397b89,xx,yy,z+s*(d/2+.13),.64,.88,.05,null,'glass');
        box(0xf9eed7,xx,yy,z+s*(d/2+.18),.05,.92,.06);
        box(0xd9c49d,xx,yy-.58,z+s*(d/2+.2),.95,.12,.3);
      });
      [-1,1].forEach(function(s){for(var j=0;j<2;j++) {
        box(0xf6e7d1,x+s*(w/2+.05),yy,z+(j-.5)*d*.5,.13,1.15,.86);
        box(0x397b89,x+s*(w/2+.13),yy,z+(j-.5)*d*.5,.05,.88,.64,null,'glass');
      }});
      if(style==='balcony' && f>0) {
        box(0xf8e8cc,x,yy-.72,z+d/2+.45,w*.82,.16,.9);
        for(var b=0;b<7;b++)box(0x3b6465,x-w*.35+b*w*.117,yy-.35,z+d/2+.87,.06,.7,.06,null,'metal');
        box(0x3b6465,x,yy,z+d/2+.87,w*.78,.06,.07,null,'metal');
      }
    }
    box(0x315e67,x,.5+.8,z+d/2+.14,.8,1.6,.15,null,'glass');
    box(0xf6dfbc,x,.5,z+d/2+.5,1.6,.15,.85);
    if(style==='tower'||style==='shop') {
      box(0xe9d8bb,x,base+h+.15,z,w+.4,.3,d+.4);
      box(0x68817b,x,base+h+.36,z,w-.35,.16,d-.35);
      box(0xb2bab1,x+.6,base+h+.75,z-.4,1,.7,.9,null,'metal');
      if(style==='tower') {
        box(0x377c8c,x,base+h/2,z+d/2+.22,.55,h,.1,null,'glass');
        cyl(0xd7d0b4,x,base+h+1.3,z,.05,.05,2,'metal');
      }
    } else roof(x,base+h,z,w,d,[0xc76242,0x397d85,0xd49b55][Math.floor(rnd()*3)]);
    if(style==='shop') {
      for(var a=0;a<7;a++)box(a%2?0xf8e7c8:0xcb7254,x+(a-3)*w/7,2.15,z+d/2+.58,w/7,.12,1.1,[.12,0,0],'roofs');
      sign('MERCADO',x,2.7,z+d/2+.3,w*.82,'#406b66');
    }
  }
  function tree(x,z,scale,palm) {
    var s=scale||1;
    cyl(0x8b6744,x,1.5*s+.3,z,.13*s,.22*s,3*s,'wood');
    if(palm) {
      for(var i=0;i<7;i++) {
        var a=i/7*Math.PI*2;
        part('sphere',0x2e7953,x+Math.cos(a)*1.05*s,3.5*s,z+Math.sin(a)*1.05*s,[.8*s,.48,.22,2.0],[0,-a,Math.cos(a)*.15],'leaves');
      }
      ball(0x79553a,x+.2,3.05*s,z,.23*s,1,1,1,'wood');
    } else {
      ball(0x3d8353,x,3.2*s,z,1.15*s,1,1.2,1,'leaves');
      ball(0x62a060,x+.65*s,2.85*s,z+.3*s,.9*s,1,1,1,'leaves');
      ball(0x39774f,x-.55*s,2.9*s,z-.3*s,.88*s,1,1,1,'leaves');
    }
    cyl(0xd5c9a7,x,.26,z,.8*s,.8*s,.18);
  }
  function lamp(x,z) {
    cyl(0x294f58,x,1.9,z,.065,.12,3.5,'metal');
    box(0x294f58,x,3.65,z,.7,.12,.5,null,'metal');
    box(0xffe2a0,x,3.43,z,.35,.43,.35,null,'lights');
    part('cone',0x294f58,x,3.95,z,[.46,.45,4],null,'metal');
  }
  function bench(x,z,yaw) {
    var g=new THREE.Object3D();g.position.set(x,0,z);g.rotation.y=yaw||0;g.updateMatrix();
    [[0,.7,0,2,.14,.65],[0,1.15,-.3,2,.65,.12],[-.7,.35,0,.12,.7,.6],[.7,.35,0,.12,.7,.6]].forEach(function(a){
      var v=new THREE.Vector3(a[0],a[1],a[2]).applyMatrix4(g.matrix);box(0x966747,v.x,v.y,v.z,a[3],a[4],a[5],[0,yaw||0,0],'wood');
    });
  }
  function flush() {
    Object.keys(buckets).forEach(function(key){
      var b=buckets[key],g=new THREE.BufferGeometry();
      g.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(b.n,3));g.setAttribute('color',new THREE.Float32BufferAttribute(b.c,3));
      var m=new THREE.MeshStandardMaterial({vertexColors:true,roughness:key==='glass'?.3:.83,metalness:key==='metal'?.45:0,
        emissive:key==='lights'?0xffd699:0x000000,emissiveIntensity:key==='lights'?.4:0});
      var mesh=new THREE.Mesh(g,m);mesh.name='Cidade costeira • '+key;mesh.castShadow=key!=='lights';mesh.receiveShadow=true;scene.add(mesh);
    });
    Object.keys(cache).forEach(function(k){cache[k].dispose();});
  }
  return {box:box,cyl:cyl,ball:ball,part:part,tree:tree,lamp:lamp,bench:bench,building:building,roof:roof,sign:sign,flush:flush,rnd:rnd};
}

function pipTex(n) {
  return textTex(128, 128, function (g) {
    g.fillStyle = '#f4f6ff'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#1a2148';
    var P = { 1: [[64, 64]], 2: [[36, 36], [92, 92]], 3: [[36, 36], [64, 64], [92, 92]], 4: [[36, 36], [92, 36], [36, 92], [92, 92]], 5: [[36, 36], [92, 36], [64, 64], [36, 92], [92, 92]], 6: [[36, 30], [92, 30], [36, 64], [92, 64], [36, 98], [92, 98]] }[n];
    P.forEach(function (p) { g.beginPath(); g.arc(p[0], p[1], 13, 0, 7); g.fill(); });
  });
}

function tileTopTexture(t) {
  var col = GROUP_COLORS[t.color_group] || ({go:'#257958',station:'#42667b',utility:'#547f85',tax:'#bc624d',sorte:'#bb9241',cofre:'#527e6e',jail:'#6b6475',stop:'#6b6475',parking:'#437b65'}[t.kind]) || '#547f85';
  var kindIcon = { go: 'INÍCIO', prop: '$', station: 'ESTAÇÃO', utility: 'CIA', tax: 'TAXA', sorte: '?', cofre: '+', jail: 'PRISÃO', parking: 'P', stop: 'VISITA' }[t.kind] || '';
  return textTex(256, 256, function (g, w, h) {
    g.fillStyle = '#f8edce'; g.fillRect(0, 0, w, h);
    g.strokeStyle='#d5c8a7';g.lineWidth=4;g.strokeRect(5,5,w-10,h-10);
    g.fillStyle = col; g.fillRect(9, 9, w-18, 42);
    g.fillStyle = '#203f49'; g.font = 'bold 25px Arial'; g.textAlign = 'center';
    var words=String(t.name).toUpperCase().split(' '),lines=[''];
    words.forEach(function(word){var li=lines.length-1,next=(lines[li]+' '+word).trim();if(g.measureText(next).width>222&&lines[li])lines.push(word);else lines[li]=next;});
    lines.forEach(function(line,i){g.fillText(line,w/2,83+i*29);});
    g.font = 'bold '+(kindIcon.length>3?'25':'45')+'px Arial'; g.fillStyle = '#285965';
    g.fillText(kindIcon, w / 2, 167);
    if (Number(t.price) > 0) {
      g.font = 'bold 28px Arial'; g.fillStyle = '#203f49';
      g.fillText('$' + Number(t.price).toLocaleString('pt-BR'), w / 2, 198);
    }
    g.fillStyle='#fff9e7';g.font='bold 26px Arial';g.fillText(String(t.tile),w/2,40);
    g.strokeStyle='#d5c8a7';g.lineWidth=2;g.beginPath();g.moveTo(46,218);g.lineTo(210,218);g.stroke();
  });
}

function buildStatic(scene) {
  var B=cityBuilder(scene);
  // A sculpted coastline surrounds the original, exact 32 board positions.
  var p=[],cols=[],idx=[],N=160,R=12,c=new THREE.Color();
  function coast(a) {
    return 45/Math.pow(Math.pow(Math.abs(Math.cos(a)),5)+Math.pow(Math.abs(Math.sin(a)),5),1/5)
      + .9*Math.sin(a*7)+.6*Math.cos(a*11);
  }
  for(var r=0;r<=R;r++)for(var j=0;j<=N;j++) {
    var a=j/N*Math.PI*2,rr=coast(a)*r/R,x=Math.cos(a)*rr,z=Math.sin(a)*rr;
    var shore=r/R,y=shore>.91?.18-(shore-.91)*14:.18;
    p.push(x,y,z);c.setHex(shore>.86?0xe7cc94:0x7daf73);c.offsetHSL(0,0,Math.sin(x*.5)*.018);c.convertSRGBToLinear();cols.push(c.r,c.g,c.b);
    if(r<R&&j<N){var q=r*(N+1)+j;idx.push(q,q+1,q+N+1,q+1,q+N+2,q+N+1);}
  }
  var land=new THREE.BufferGeometry();land.setAttribute('position',new THREE.Float32BufferAttribute(p,3));land.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));land.setIndex(idx);land.computeVertexNormals();
  var terrain=new THREE.Mesh(land,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));terrain.receiveShadow=true;scene.add(terrain);
  var sea=new THREE.PlaneGeometry(700,700,70,70);sea.rotateX(-Math.PI/2);
  S.sea=new THREE.Mesh(sea,new THREE.ShaderMaterial({uniforms:{time:{value:0}},
    vertexShader:'uniform float time; varying vec3 vP; void main(){vec3 p=position; p.y+=.13*sin(p.x*.28+time)+.09*sin(p.z*.34-time*.7); vP=p; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}',
    fragmentShader:'uniform float time; varying vec3 vP; void main(){float d=pow(pow(abs(vP.x),5.)+pow(abs(vP.z),5.),.2); float shore=1.-smoothstep(44.,78.,d); float w=sin(vP.x*.6+time)*sin(vP.z*.43-time*.8); float glint=pow(max(0.,w),12.); vec3 c=mix(vec3(.035,.24,.34),vec3(.09,.58,.61),shore); c+=glint*.08; gl_FragColor=vec4(c,1.);}'
  }));S.sea.position.y=-2.2;scene.add(S.sea);
  var foamPoints=[];
  for(var f=0;f<=N;f++){var fa=f/N*Math.PI*2,fr=coast(fa)+.6;foamPoints.push(new THREE.Vector3(Math.cos(fa)*fr,-1.55,Math.sin(fa)*fr));}
  var foam=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(foamPoints,true),160,.13,4,true),new THREE.MeshBasicMaterial({color:0xd9f7e9,transparent:true,opacity:.65}));scene.add(foam);
  for(var rock=0;rock<44;rock++) {
    var ra=rock/44*Math.PI*2,rad=coast(ra)-.9;
    B.ball(rock%2?0x9e9b7c:0xb2a68c,Math.cos(ra)*rad,-1.4,Math.sin(ra)*rad,1.2+B.rnd()*.9,1.2,.75,1.0);
  }
  // Closed road and a broad stone promenade under the readable lots.
  var centers = [];
  for (var i = 0; i < 32; i++) { var f = tileAt(i); centers.push(new THREE.Vector3(f.x, 0, f.z)); }
  var loop = new THREE.CatmullRomCurve3(centers, true, 'catmullrom', 0.5);
  S.roadCurve = loop;
  var SEG = 220, hw = 5.2;
  (function strip() {
    var geo = new THREE.BufferGeometry(), vp = [], uv = [], idx = [];
    for (var k = 0; k <= SEG; k++) {
      var uu = k / SEG, pp = loop.getPointAt(uu), tt = loop.getTangentAt(uu);
      var px = -tt.z, pz = tt.x, pl = Math.hypot(px, pz) || 1;
      vp.push(pp.x - (px / pl) * hw, 0.4, pp.z - (pz / pl) * hw);
      vp.push(pp.x + (px / pl) * hw, 0.4, pp.z + (pz / pl) * hw);
      uv.push(uu * 30, 0, uu * 30, 1);
      if (k < SEG) { var a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vp, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    var m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xd2cbb3,roughness:.95,side:THREE.DoubleSide }));
    m.receiveShadow = true; scene.add(m);
  })();
  B.box(0x697f7c,0,.29,0,4.4,.18,49);B.box(0x697f7c,0,.3,0,49,.18,4.4);
  [-1,1].forEach(function(s){B.box(0xe1d4b5,s*2.7,.37,0,.85,.2,48);B.box(0xe1d4b5,0,.37,s*2.7,48,.2,.85);});
  for(var dash=-22;dash<=22;dash+=4){B.box(0xf3e8c9,0,.4,dash,.12,.03,1.6);B.box(0xf3e8c9,dash,.41,0,1.6,.03,.12);}
  for(var walk=-2;walk<=2;walk++)[-1,1].forEach(function(s){B.box(0xf7efd8,walk*.6,.43,s*23, .32,.03,2.1);B.box(0xf7efd8,s*23,.43,walk*.6,2.1,.03,.32);});
  B.cyl(0xeadcc0,0,.49,0,7.1,7.3,.48);
  B.part('torus',0xb79b73,0,.76,0,[6.7,.12],[Math.PI/2,0,0]);
  B.cyl(0xabbaa9,0,1.05,0,2.8,3.1,.8);B.cyl(0x358f9e,0,1.48,0,2.6,2.6,.08,'glass');
  B.cyl(0xeadbc0,0,1.75,0,.4,.65,1.1);B.cyl(0xe5d9b9,0,2.35,0,1.4,1.6,.22);
  S.fountain=new THREE.Mesh(new THREE.ConeGeometry(.28,1.65,12),new THREE.MeshStandardMaterial({color:0xbceee9,transparent:true,opacity:.78,roughness:.15}));S.fountain.position.y=3.15;scene.add(S.fountain);
  for(var jet=0;jet<8;jet++) {
    var ja=jet/8*Math.PI*2,arc=[];
    for(var v=0;v<=12;v++){var tt=v/12;arc.push(new THREE.Vector3(Math.cos(ja)*(.4+tt*1.9),2.5+Math.sin(tt*Math.PI)*1.15-tt,Math.sin(ja)*(.4+tt*1.9)));}
    var jm=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arc),12,.035,4),new THREE.MeshBasicMaterial({color:0xb8ece7,transparent:true,opacity:.8}));scene.add(jm);
  }
  [[-5,4],[5,4],[-5,-4],[5,-4]].forEach(function(q){B.bench(q[0],q[1],q[0]<0?Math.PI/2:-Math.PI/2);});
  // Districts: compact villas, lively shops, civic garden, stepped skyline.
  [[-13,13,2,0xe8bd8b],[-21,13,1,0xe7d7bb],[-13,21,1,0xefcbaa],[-21,21,2,0xa9c6b4]].forEach(function(q){B.building(q[0],q[1],4.4,4.4,q[2],q[3],'balcony');});
  [[12,13,2,0xe6c5a0],[20,13,2,0x8fbbbb],[12,21,2,0xd6a18a],[20,21,1,0xedcf95]].forEach(function(q,i){B.building(q[0],q[1],4.9,4.6,q[2],q[3],i%2?'balcony':'shop');});
  [[11,-12,4,0xabc4be],[20,-12,3,0xd6bf9d],[11,-21,5,0x7ea6b0],[20,-21,4,0xc7d3c2]].forEach(function(q){B.building(q[0],q[1],5.0,4.6,q[2],q[3],'tower');});
  // Neoclassical bank: actual columns, steps, cornice and a golden clock.
  B.box(0xdac5a2,-14,.46,-16,10,.4,8);B.box(0xf1e1bf,-14,3.1,-16,8,5.2,5.5);
  B.box(0x2f6e7c,-14,2.65,-13.16,5.5,3.6,.08,null,'glass');
  for(var col=0;col<4;col++){var bx=-17+col*2;B.cyl(0xf6ebd0,bx,2.7,-12.7,.28,.33,4.2);B.cyl(0xe6d0a5,bx,.7,-12.7,.45,.45,.2);B.cyl(0xe6d0a5,bx,4.85,-12.7,.45,.45,.2);}
  B.box(0xf5e8c7,-14,5.15,-15.7,9,.45,6.7);B.roof(-14,5.4,-15.7,9,6.1,0x497d7d);B.sign('BANCO',-14,5.22,-12.25,4.3,'#285d63');
  for(var st=0;st<3;st++)B.box(0xe9d6b5,-14,.3+st*.16,-11.6-st*.45,7,.24,1.6-st*.3);
  // Civic park with winding pond, gazebo and flower beds.
  B.cyl(0xb6c790,-14,.29,-5.8,4.8,4.8,.2);
  B.cyl(0x429c9d,-14,.43,-5.8,3.7,3.8,.12,'glass');
  B.box(0xa37c54,-14,.64,-5.8,8.4,.22,1.1,null,'wood');
  for(var rail=0;rail<9;rail++)[-1,1].forEach(function(s){B.box(0xb69060,-17.6+rail*.9,1.05,-5.8+s*.6,.06,.9,.06,null,'wood');});
  [-1,1].forEach(function(s){B.box(0xc7a97b,-14,1.49,-5.8+s*.6,8.1,.08,.08,null,'wood');});
  for(var flower=0;flower<32;flower++){var ang=B.rnd()*6.28,rf=4+B.rnd()*1.8;B.ball(flower%2?0xd4a153:0xe1a2a2,-14+Math.cos(ang)*rf,.62,-5.8+Math.sin(ang)*rf,.18,1,1,1,'flowers');}
  // Inner avenues, gardens and hedges always stay clear of the board.
  [[-22,-21],[-6,-21],[-22,-8],[-6,-8],[-6,11],[-6,20],[6,11],[6,20],[6,-10],[6,-21],[23,5],[-23,5]].forEach(function(q){B.tree(q[0],q[1],.85,false);});
  for(var garden=0;garden<18;garden++){var gx=-24+garden*2.8;B.ball(0x3c7854,gx,.75,25, .58,1,.7,1,'leaves');B.ball(0x3c7854,gx,.75,-25,.58,1,.7,1,'leaves');}
  for(var light=-24;light<=24;light+=12) [-1,1].forEach(function(s){B.lamp(light,s*24);if(Math.abs(light)<24)B.lamp(s*24,light);});
  // Coast: palms, beach loungers, striped umbrellas and a timber pier.
  [[-39,-31],[-39,-17],[-39,1],[-40,26],[40,26],[40,10],[40,-10],[23,40],[8,40],[-11,40]].forEach(function(q){B.tree(q[0],q[1],1.1,true);});
  [[-23,41],[-17,42],[29,40],[36,37]].forEach(function(q,i){
    B.cyl(0xac8054,q[0],.8,q[1],.06,.06,2.3,'wood');
    B.part('cone',i%2?0xe19b65:0x54949b,q[0],2.1,q[1],[1.9,.65,12],null,'roofs');
    B.box(0xf6e3b9,q[0]+2,.25,q[1],.85,.2,2.1,[.08,0,0]);
    B.box(0xa77853,q[0]+2,.4,q[1]-.9,.85,.4,.12,null,'wood');
  });
  for(var plank=0;plank<22;plank++) {
    B.box(0xa98259,46+plank*.5,-.5,14,.45,.22,3.8,null,'wood');
    if(plank%4===0)[-1,1].forEach(function(s){B.cyl(0x755940,46+plank*.5,-1.3,14+s*1.75,.12,.12,2.6,'wood');});
  }
  B.box(0xc6a67a,44,-.2,14,6,.25,3.8,[0,0,-.09],'wood');
  // Lighthouse anchored on a small offshore rock, with a rotating lantern.
  B.ball(0xa49f85,48,-2,-36,4.2,1.2,.65,1);
  for(var band=0;band<7;band++)B.cyl(band%2?0xc8664f:0xf4e4c3,48,.3+band*.86,-36,.87-band*.03,1.02-band*.03,.86);
  B.cyl(0x365e63,48,6.25,-36,1.4,1.4,.22,'metal');B.cyl(0xffdea0,48,6.9,-36,.7,.7,1.1,'lights');B.part('cone',0x3b6b70,48,7.95,-36,[1.35,1,12],null,'roofs');
  var beacon=new THREE.Mesh(new THREE.ConeGeometry(.6,7,12),new THREE.MeshBasicMaterial({color:0xffebb4,transparent:true,opacity:.15,depthWrite:false}));
  beacon.geometry.rotateZ(-Math.PI/2);beacon.geometry.translate(3.5,0,0);
  beacon.position.set(48,6.9,-36);scene.add(beacon);S.beacon=beacon;
  // Harbour sailboats and a quiet skyline of clouds.
  S.boats=[];
  [[59,20],[-54,-14],[8,57]].forEach(function(q,k){
    var g=new THREE.Group(),hull=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),new THREE.MeshStandardMaterial({color:0x8a5e43,roughness:.7}));
    hull.scale.set(1.1,.38,2.7);g.add(hull);
    var deck=new THREE.Mesh(new THREE.BoxGeometry(1.7,.15,3.8),new THREE.MeshStandardMaterial({color:0xf3dfb5}));deck.position.y=.28;g.add(deck);
    var mast=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,4.5,6),new THREE.MeshStandardMaterial({color:0xe9cd9d}));mast.position.y=2.3;g.add(mast);
    var sailShape=new THREE.Shape();sailShape.moveTo(.07,.5);sailShape.lineTo(.07,4.4);sailShape.lineTo(2,.5);sailShape.closePath();
    var sail=new THREE.Mesh(new THREE.ShapeGeometry(sailShape),new THREE.MeshStandardMaterial({color:k===1?0xe8b37d:0xfff0cd,side:THREE.DoubleSide}));g.add(sail);
    g.position.set(q[0],-1.9,q[1]);g.rotation.y=.5+k;scene.add(g);S.boats.push(g);
  });
  [[-52,-55,22],[9,-58,29],[58,-45,24]].forEach(function(q){
    for(var puff=0;puff<4;puff++)B.ball(0xe4efdf,q[0]+puff*2.8,q[2]+Math.sin(puff),q[1],2.4+puff%2,1.4,.55,1,'clouds');
  });
  B.flush();
  S.lotMeshes = [];
}

function buildLots(tiles) {
  // lotes com os terrenos reais vindos do servidor (uma vez por cena)
  if (!S || !S.scene) return;
  if (S.lotsBuilt) return;
  S.lotsBuilt = true;
  S.lotMeshes = [];
  var scene = S.scene;
  tiles.forEach(function (t) {
    var f = tileAt(Number(t.tile));
    var top = new THREE.MeshStandardMaterial({ map: tileTopTexture(t),roughness:.75 });
    var side = new THREE.MeshStandardMaterial({ color: 0xc5ab82,roughness:.9 });
    var m = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.65, 6.8), [side, side, top, side, side, side]);
    m.position.set(f.x, 0.9, f.z); m.rotation.y = f.yaw;
    m.castShadow = true; m.receiveShadow = true;
    m.userData = { index: Number(t.tile), label:t.name,price:Number(t.price),top:top };
    scene.add(m); S.lotMeshes.push(m);
  });
  // GO arch + prisão
  var go = new THREE.Group(); go.position.set(HALF, 0, HALF + 4.5);
  [[-3, 0], [3, 0]].forEach(function (o) {
    var p = new THREE.Mesh(new THREE.BoxGeometry(0.8, 4.6, 0.8), new THREE.MeshLambertMaterial({ color: 0x8a5a33 }));
    p.position.set(o[0], 2.3, o[1]); go.add(p);
  });
  var gb = new THREE.Mesh(new THREE.BoxGeometry(7.6, 1.8, 0.6),
    new THREE.MeshLambertMaterial({ map: textTex(512, 128, function (g) {
      g.fillStyle = '#1e9e6a'; g.fillRect(0, 0, 512, 128);
      g.fillStyle = '#fff'; g.font = '900 60px Arial'; g.textAlign = 'center'; g.fillText('★ PARTIDA', 256, 86);
    }) }));
  gb.position.y = 5.4; go.add(gb); scene.add(go);
  var B=cityBuilder(scene),jt=tileAt(10),jx=jt.x-7;
  B.box(0xadb5a5,jx,2.5,jt.z,4.7,4.7,4.7);B.box(0xd6c8a8,jx,5,jt.z,5.1,.3,5.1);
  for(var b=0;b<3;b++){
    B.box(0x304954,jx+(b-1)*1.2,3.1,jt.z+2.4,.8,1.5,.08,null,'glass');
    for(var br=0;br<3;br++)B.box(0xe3dcc9,jx+(b-1)*1.2+(br-1)*.23,3.1,jt.z+2.48,.055,1.5,.07,null,'metal');
  }
  B.sign('PRISÃO',jx,4.5,jt.z+2.51,3.7,'#4f6261');
  // Stations are scenery attached to their real board position, not extra tiles.
  [6,15].forEach(function(t){
    var at=tileAt(t),sx=t===6?at.x:at.x-7,sz=t===6?at.z+7:at.z;
    B.box(0xe5cfa9,sx,1.25,sz,4.6,2.4,3.8);B.roof(sx,2.45,sz,4.9,4,0x477d83);
    B.sign('ESTAÇÃO',sx,2.0,sz+1.94,3.9,'#315f6b');
    for(var track=-1;track<=1;track+=2)B.box(0x63726c,sx+track*.8,.32,sz+3.7,.08,.1,2.4,null,'metal');
  });
  B.flush();
}

function release(root, extraTextures) {
  var gs=new Set(),ms=new Set(),ts=new Set(extraTextures||[]);
  root.traverse(function(o){if(o.geometry)gs.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(function(m){ms.add(m);Object.keys(m).forEach(function(k){if(m[k]&&m[k].isTexture)ts.add(m[k]);});});});
  ts.forEach(function(t){t.dispose();});ms.forEach(function(m){m.dispose();});gs.forEach(function(g){g.dispose();});
}

function deedLayer(scene) {
  if (S.deedGroup) { scene.remove(S.deedGroup);release(S.deedGroup); }
  var g = new THREE.Group(); scene.add(g); S.deedGroup = g;
}

function refreshDeeds(payload) {
  var key = (payload.deeds || []).map(function (d) { return d.tile + ':' + (d.owner === null ? '-' : d.owner) + ':' + d.houses + ':' + d.mortgaged; }).join('|');
  if (key === S.deedKey) return;
  S.deedKey = key;
  var colormap = {};
  (payload.players || []).forEach(function (p) { colormap[p.player_id] = p.avatar_color || '#fff'; });
  deedLayer(S.scene);
  var g = S.deedGroup,B=cityBuilder(g);
  (payload.deeds || []).forEach(function (d) {
    var f = tileAt(Number(d.tile));
    var side=Math.floor(Number(d.tile)/8),ox=side===1?-1:side===3?1:0,oz=side===0?1:side===2?-1:0;
    var bx = f.x + ox * 5.9, bz = f.z + oz * 5.9;
    if (d.owner !== null) {
      // bandeira do dono
      var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.4, 6),
        new THREE.MeshLambertMaterial({ color: 0xffffff }));
      pole.position.set(f.x+ox*2.7, 2.9, f.z+oz*2.7); g.add(pole);
      var flag = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1),
        new THREE.MeshLambertMaterial({ color: new THREE.Color(colormap[d.owner] || '#fff'), side: THREE.DoubleSide }));
      flag.position.copy(pole.position);flag.position.x+=.8;flag.position.y=4.1; g.add(flag);
      var h = Number(d.houses);
      if (h > 0 && h < 5) {
        for (var k = 0; k < h; k++) {
          var hx=bx-.9+(k%2)*1.8,hz=bz-.85+Math.floor(k/2)*1.7;
          B.box(0xcbe0b3,hx,1.05,hz,1.4,1.6,1.3);B.roof(hx,1.85,hz,1.5,1.4,0x43836b);
          B.box(0x31586a,hx-.3,1.2,hz+.66,.35,.45,.05,null,'glass');B.box(0xae8258,hx+.35,.8,hz+.67,.3,.9,.06,null,'wood');
        }
      } else if (h >= 5) {
        B.building(bx,bz,3.7,3.1,3,0xecc78b,'balcony');B.sign('HOTEL',bx,6.9,bz+1.58,3,'#805e3c');
      }
      if (Number(d.mortgaged)) {
        var tag = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.1),
          new THREE.MeshLambertMaterial({ color: 0xd63031 }));
        tag.position.set(f.x+ox*2.7, 4.9, f.z+oz*2.7); g.add(tag);
      }
    }
  });
  B.flush();
}

function ensureToken(p, idx) {
  var id = p.player_id;
  if (S.tokens[id]) return S.tokens[id];
  var g = new THREE.Group();
  var col = new THREE.Color(p.avatar_color || '#fff');
  var cone = new THREE.Mesh(new THREE.CylinderGeometry(0.45,0.85,1.4,20), new THREE.MeshStandardMaterial({ color: col,roughness:.3,metalness:.15 }));
  cone.position.y = 1.6; cone.castShadow = true; g.add(cone);
  var head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), new THREE.MeshStandardMaterial({ color: col,roughness:.3,metalness:.15 }));
  head.position.y = 2.8; g.add(head);
  var letter = (p.name || '?')[0].toUpperCase();
  var plate = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), new THREE.MeshBasicMaterial({
    map: textTex(96, 96, function (c) {
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(48, 48, 44, 0, 7); c.fill();
      c.fillStyle = '#0b1023'; c.font = '900 52px Arial'; c.textAlign = 'center'; c.fillText(letter, 48, 66);
    }), transparent: true, side: THREE.DoubleSide
  }));
  plate.position.y = 3.9; g.add(plate);
  var foot=new THREE.Mesh(new THREE.CylinderGeometry(.95,1.05,.25,24),new THREE.MeshStandardMaterial({color:0xeed5a0,roughness:.4,metalness:.35}));foot.position.y=.55;g.add(foot);
  g.userData.lane=laneOf(idx%4);
  S.scene.add(g); S.tokens[id] = g;
  return g;
}

function laneOf(idx) { return (idx - 1.5) * 1.0; }
function spotOf(pos, lane) {
  var f = tileAt(((pos % 32) + 32) % 32);
  return { x: f.x + lane * 0.9, z: f.z + lane * 0.9, yaw: f.yaw };
}

function commonInit(container, opts) {
  if (typeof THREE === 'undefined') return null;
  var W = container.clientWidth || 800, H = container.clientHeight || 420;
  var renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch (e) { return null; }
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.low ? 1.25 : 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
  container.appendChild(renderer.domElement);
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9dcbd0);
  scene.fog = new THREE.Fog(0x9dcbd0, 190, 430);
  var cam = new THREE.PerspectiveCamera(45, W / H, 0.1, 800);
  S = {
    renderer: renderer, scene: scene, camera: cam, container: container,
    yaw: -.42, pitch: .78, dist: W/H<.9?230:142, target: new THREE.Vector3(0, 2, 0),
    followId: null, auto: !!opts.auto, raf: 0, t0: performance.now(),
    tokens: {}, order: [], dice: [], popAnims: []
  };
  var state=S;S.preview=!!opts.auto;S.controller=new AbortController();S.animations=new Set();
  S.homeDist=S.dist;S.overview=true;
  function listen(el,event,fn,options){el.addEventListener(event,fn,Object.assign({},options||{},{signal:state.controller.signal}));}
  renderer.domElement.setAttribute('aria-label','Ilha-cidade do Banco Imobiliário. Arraste para girar e use a roda para ampliar.');
  scene.add(new THREE.HemisphereLight(0xe5f3ed, 0x678361, .8));
  var sun = new THREE.DirectionalLight(0xffe0aa, 1.25);
  sun.position.set(-45, 85, 65); sun.castShadow = true; sun.shadow.mapSize.set(opts.low?1024:2048, opts.low?1024:2048);
  sun.shadow.camera.left = -70; sun.shadow.camera.right = 70; sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
  sun.shadow.camera.near=1;sun.shadow.camera.far=180;sun.shadow.normalBias=.12;sun.shadow.bias=-.0002;
  scene.add(sun);
  // dados 3D (escondidos até rolar)
  S.pipTex = [1, 2, 3, 4, 5, 6].map(pipTex);
  S.diceMaterials=S.pipTex.map(function(t){return new THREE.MeshStandardMaterial({map:t,roughness:.4});});
  S.diceMeshes = [0, 1].map(function () {
    var m = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 2.2), S.diceMaterials.slice());
    m.visible = false; m.castShadow = true; scene.add(m);
    return m;
  });
  if (!state.preview) MapControls.attach(state, renderer.domElement, listen, { min: 18, max: 280, home: state.homeDist || 142 });
  listen(renderer.domElement, 'pointermove', function(e) {
    if (!state.tip) return;
    if(e.buttons) {state.tip.style.display='none';return;}
    var rect=renderer.domElement.getBoundingClientRect(),mouse=new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),ray=new THREE.Raycaster();
    ray.setFromCamera(mouse,cam);var hit=ray.intersectObjects(state.lotMeshes||[])[0];
    state.tip.style.display=hit?'block':'none';
    if(hit){var data=hit.object.userData;state.tip.textContent=data.index+' • '+data.label+(data.price?' • $'+data.price.toLocaleString('pt-BR'):'');state.tip.style.left=Math.max(8,Math.min(rect.width-228,e.clientX-rect.left+12))+'px';state.tip.style.top=Math.max(8,e.clientY-rect.top-48)+'px';}
  });
  listen(renderer.domElement,'pointerleave',function(){if(state.tip)state.tip.style.display='none';});
  function resize() {
    if (S!==state) return;
    var w = container.clientWidth || 800, h = container.clientHeight || 420;
    renderer.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix();
    if (state.showcase) MapControls.fitPreview(state, 55);
    else { state.homeDist=w/h<.9?230:142;if(state.overview && !state.manualCamera)state.dist=state.wantDist=state.homeDist; }
  }
  state.resizeObserver=new ResizeObserver(resize);state.resizeObserver.observe(container);
  listen(document,'visibilitychange', function () {if(S===state){cancelAnimationFrame(state.raf);if(!document.hidden)loop();}});
  state.screenObserver=new MutationObserver(function(records){if(S===state&&records.some(function(r){return r.target.classList&&r.target.classList.contains('screen');})){cancelAnimationFrame(state.raf);loop();}});
  state.screenObserver.observe(document.body,{attributes:true,attributeFilter:['class'],subtree:true});
  if(state.preview && typeof IntersectionObserver!=='undefined') {
    state.onScreen=true;state.visibleObserver=new IntersectionObserver(function(es){state.onScreen=es[0].isIntersecting;cancelAnimationFrame(state.raf);if(state.onScreen&&S===state)loop();});state.visibleObserver.observe(container);
  }
  function loop() {
    if (!S || S.renderer !== renderer) return;
    var owner=container.closest('.screen');if(document.hidden||(owner&&!owner.classList.contains('active'))||state.onScreen===false)return;
    var t = (performance.now() - S.t0) / 1000;
    if (S.showcase) S.yaw = S.previewStartYaw + (RM ? 0 : t * 0.055);
    else if (S.auto && !RM) S.yaw += 0.00035;
    if (!S.manualCamera && !S.overview && S.followId && S.tokens[S.followId]) { var c = S.tokens[S.followId].position; S.target.lerp(new THREE.Vector3(c.x, 2, c.z), 0.06); }
    else if (!S.manualCamera) S.target.lerp(new THREE.Vector3(0, 2, 0), 0.03);
    if (S.wantDist) S.dist += (S.wantDist - S.dist) * 0.05;
    cam.position.set(S.target.x + Math.sin(S.yaw) * Math.cos(S.pitch) * S.dist, S.target.y + Math.sin(S.pitch) * S.dist, S.target.z + Math.cos(S.yaw) * Math.cos(S.pitch) * S.dist);
    cam.lookAt(S.target);
    if (!RM && S.fountain) S.fountain.scale.y = 1 + Math.sin(t * 5) * 0.18;
    if(!RM){if(S.sea)S.sea.material.uniforms.time.value=t;if(S.beacon)S.beacon.rotation.y=t*.35;(S.boats||[]).forEach(function(b,k){b.position.y=-1.9+Math.sin(t*1.3+k)*.1;b.rotation.z=Math.sin(t+k)*.025;});}
    if(S.turnRing&&S.tokens[S.followId]){var token=S.tokens[S.followId];S.turnRing.position.set(token.position.x,1.32,token.position.z);S.turnRing.visible=!S.preview;}
    renderer.render(scene, cam);
    S.raf = requestAnimationFrame(loop);
  }
  loop();
  return S;
}

function dispose() {
  if (S && S.raf) cancelAnimationFrame(S.raf);
  if(S){
    if(S.controller)S.controller.abort();if(S.resizeObserver)S.resizeObserver.disconnect();if(S.screenObserver)S.screenObserver.disconnect();if(S.visibleObserver)S.visibleObserver.disconnect();
    if(S.demoTimer)clearTimeout(S.demoTimer);if(S.animations)S.animations.forEach(function(finish){finish();});
    release(S.scene,S.pipTex||[]);
  }
  if (S && S.renderer) { try { S.renderer.dispose(); if (S.renderer.domElement.parentNode) S.renderer.domElement.parentNode.removeChild(S.renderer.domElement); } catch (e) {} }
  S = null;
  fallback=null;
}

window.Monocity = {
  initPreview: function (container, opts) {
    dispose();
    var s = commonInit(container, { auto: true, low: container.clientWidth < 700 });
    if (!s) return { ok: false };
    if (opts && opts.showcase) {
      s.showcase = true; s.yaw = -0.42; s.pitch = 0.82;
      s.previewStartYaw = s.yaw;
      MapControls.fitPreview(s, 55);
      s.renderer.domElement.setAttribute('aria-label', 'Prévia completa do Banco Imobiliário com rotação automática.');
    }
    buildStatic(s.scene);
    fetch('api/mono.php?action=tiles').then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.ok && S===s) buildLots(j.tiles || []);
    }).catch(function () {});
    var demos = [
      { player_id: 'd1', name: 'R', avatar_color: '#e84393', position: 0 },
      { player_id: 'd2', name: 'B', avatar_color: '#0984e3', position: 16 }
    ];
    demos.forEach(function (d, k) { ensureToken(d, k); });
    var start = performance.now();
    (function demo() {
      if (S!==s || !S.tokens.d1) return;
      var e = (performance.now() - start) / 1000;
      [['d1', 0], ['d2', 16]].forEach(function (dd, k) {
        var progress=(e*(RM?0:.7)+dd[1])%32,idx=Math.floor(progress),fraction=progress-idx;
        var w = spotOf(idx, laneOf(k)),next=spotOf(idx+1,laneOf(k));
        S.tokens[dd[0]].position.set(w.x+(next.x-w.x)*fraction, 1.1, w.z+(next.z-w.z)*fraction);
      });
      if (S===s && S.auto) s.demoTimer=setTimeout(function () { if (S===s && S.auto) requestAnimationFrame(demo); }, 50);
    })();
    return { ok: true };
  },
  initGame: function (boardEl) {
    dispose();
    boardEl.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'island-wrap mono-city';
    wrap.style.height = '520px';
    boardEl.appendChild(wrap);
    var s = commonInit(wrap, { auto: false, low: wrap.clientWidth < 700 });
    if (!s) {fallback=wrap;return { ok: false };}
    buildStatic(s.scene);
    var tip=document.createElement('div');tip.className='island-tip';wrap.appendChild(tip);s.tip=tip;
    var hint=document.createElement('span');hint.className='island-hint';hint.textContent='Arraste para mover • Shift para girar • roda ou pinça para zoom';wrap.appendChild(hint);
    s.turnRing=new THREE.Mesh(new THREE.RingGeometry(1.15,1.4,32),new THREE.MeshBasicMaterial({color:0xffd378,side:THREE.DoubleSide,depthWrite:false}));s.turnRing.rotation.x=-Math.PI/2;s.turnRing.visible=false;s.scene.add(s.turnRing);
    var sr=document.createElement('ol');sr.className='island-sr';sr.setAttribute('aria-label','Posições no Banco Imobiliário');wrap.appendChild(sr);s.sr=sr;
    return { ok: true };
  },
  setState: function (payload) {
    if(fallback){
      fallback.classList.add('mono-fallback');fallback.replaceChildren();
      var note=document.createElement('p');note.textContent='Tabuleiro acessível — 32 casas';fallback.appendChild(note);
      var list=document.createElement('ol');
      (payload.tiles||[]).forEach(function(t){var li=document.createElement('li'),names=(payload.players||[]).filter(function(p){return !p.bankrupt&&Number(p.position)===Number(t.tile);}).map(function(p){return p.name;});li.textContent=t.tile+' • '+t.name+(names.length?' — '+names.join(', '):'');list.appendChild(li);});fallback.appendChild(list);return;
    }
    if (!S || !S.scene) return;
    buildLots(payload.tiles || []);
    refreshDeeds(payload);
    (payload.players || []).forEach(function (p, k) {
      if (p.bankrupt) { if (S.tokens[p.player_id]) { S.scene.remove(S.tokens[p.player_id]);release(S.tokens[p.player_id]);delete S.tokens[p.player_id]; } return; }
      var tk = ensureToken(p, k);
      var w = spotOf(Number(p.position || 0), laneOf(k % 4));
      tk.position.set(w.x, 1.1, w.z);
    });
    if(S.sr){S.sr.replaceChildren();(payload.players||[]).forEach(function(p){var li=document.createElement('li');li.textContent=p.name+' — casa '+p.position+(p.bankrupt?' — faliu':'');S.sr.appendChild(li);});}
  },
  drive: function (pid, from, to) {
    if (!S || !S.scene || !S.tokens[pid]) return Promise.resolve();
    var steps = (((to - from) % 32) + 32) % 32;
    if (RM || steps <= 0) {
      var w0 = spotOf(to, S.tokens[pid].userData.lane);
      S.tokens[pid].position.set(w0.x, 1.1, w0.z);
      return Promise.resolve();
    }
    S.followId = pid;
    var state=S,tk=S.tokens[pid];
    return new Promise(function (res) {
      var step = 0,raf=0,timer=0,done=false;
      function finish(){if(done)return;done=true;cancelAnimationFrame(raf);clearTimeout(timer);state.animations.delete(finish);res();}
      state.animations.add(finish);
      (function next() {
        if(S!==state||done)return finish();
        step++;
        if (step > steps) return finish();
        var idx = (((from + step) % 32) + 32) % 32;
        var w = spotOf(idx, tk.userData.lane);
        var p0 = tk.position.clone(), t0 = performance.now(), dur = 200;
        (function frame() {
          if(S!==state||done)return finish();
          var k = Math.min(1, (performance.now() - t0) / dur);
          var e = 1 - Math.pow(1 - k, 3);
          tk.position.lerpVectors(p0, new THREE.Vector3(w.x, 1.1, w.z), e);
          tk.position.y = 1.1 + Math.sin(e * Math.PI) * 0.35;
          if (k < 1) raf=requestAnimationFrame(frame); else timer=setTimeout(next, 30);
        })();
      })();
    });
  },
  rollDice: function (d1, d2, at) {
    if (!S || !S.scene) return Promise.resolve();
    if (RM) return Promise.resolve();
    var cx = at ? at.x : S.target.x, cz = at ? at.z : S.target.z;
    var vals = [d1, d2];
    var state=S;
    S.diceMeshes.forEach(function (m, k) {
      m.visible = true;
      m.position.set(cx - 2 + k * 4, 12, cz);
      m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    });
    return new Promise(function (res) {
      var t0 = performance.now(), dur = 1100,raf=0,timer=0,done=false;
      function finish(){if(done)return;done=true;cancelAnimationFrame(raf);clearTimeout(timer);state.diceMeshes.forEach(function(m){m.visible=false;});state.animations.delete(finish);res();}
      state.animations.add(finish);
      (function frame() {
        if(S!==state||done)return finish();
        var k = Math.min(1, (performance.now() - t0) / dur);
        S.diceMeshes.forEach(function (m, i) {
          m.rotation.x += 0.25; m.rotation.y += 0.2;
          m.position.y = 9 - 7.45 * k + Math.abs(Math.sin(k * 9 + i)) * 1.2 * (1 - k);
          if (k >= 1) {
            m.rotation.set(0, 0, 0);
            var mats = state.diceMaterials.slice();
            mats[2] = state.diceMaterials[vals[i] - 1];
            m.material = mats;
            m.position.y = 1.55;
          }
        });
        if (k < 1) raf=requestAnimationFrame(frame);
        else timer=setTimeout(finish, 500);
      })();
    });
  },
  follow: function (pid) {
    if (S) S.followId = pid;
  },
  debug: function () {
    if (!S || !S.scene) return null;
    var kinds = {}, n = 0;
    S.scene.traverse(function (o) {
      if (o.isMesh) {
        n++;
        var k = o.geometry && o.geometry.type ? o.geometry.type : '?';
        kinds[k] = (kinds[k] || 0) + 1;
      }
    });
    return { meshes: n, kinds: kinds, cam: S.camera.position.toArray().map(Math.round), lots: (S.lotMeshes || []).length,drawCalls:S.renderer.info.render.calls,triangles:S.renderer.info.render.triangles,tokens:Object.keys(S.tokens).map(function(id){return {id:id,position:S.tokens[id].position.toArray()};}) };
  },
  celebrate: function () {
    if (!S || !S.scene || RM) return;
    var state=S;
    for (var k = 0; k < 40; k++) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.1),
        new THREE.MeshBasicMaterial({ color: [0xfdcb6e, 0xe84393, 0x00b894, 0xffffff][k % 4] }));
      m.position.set((Math.random() - 0.5) * 30, 20 + Math.random() * 10, (Math.random() - 0.5) * 30);
      m.userData.vy = -6 - Math.random() * 4;
      S.scene.add(m);
      (function (mm) {
        var t0 = performance.now();
        (function fall() {
          if (S!==state) return;
          var k = Math.min(1, (performance.now() - t0) / 2500);
          mm.position.y -= (6 * (1 - k) + 1) * 0.05;
          mm.rotation.x += 0.1; mm.rotation.y += 0.07;
          if (k < 1 && mm.parent) requestAnimationFrame(fall);
          else if (mm.parent) {mm.parent.remove(mm);release(mm);}
        })();
      })(m);
    }
  },
  dispose: function () { dispose(); }
};
})();
