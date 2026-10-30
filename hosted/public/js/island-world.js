/* LifeQuest — diorama procedural original. Static details are merged by material;
   layout reservations include roofs, foliage and the complete road corridor. */
(function () {
  'use strict';
  let world = null;
  // Painted wood, clay, paper and stone: deliberately matte, never metallic.
  const C = { stone:0xaaa998, cream:0xf3deb2, trim:0xfff3d6, wood:0xb17d51,
    roof:0xd77960, glass:0x447c87, grass:0x83a16c, sand:0xe0c38d };
  function random(seed) {
    return function () { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  }
  function texture(w,h,draw) {
    const c=document.createElement('canvas'); c.width=w; c.height=h; draw(c.getContext('2d'),w,h);
    const t=new THREE.CanvasTexture(c); t.encoding=THREE.sRGBEncoding; return t;
  }
  function boundary(a) { return 77 + 3*Math.sin(3*a+.4) + 2*Math.cos(7*a); }
  function radius(x,z) { return Math.hypot(x,z/.91); }
  function pathDistance(S,x,z) {
    let min=Infinity;
    for (let i=0;i<S.layoutPath.length;i++) {
      const p=S.layoutPath[i]; min=Math.min(min,Math.hypot(p.x-x,p.z-z));
    }
    return min;
  }
  function clear(W,x,z,r) {
    if(radius(x,z)+r>73) return false;
    if(pathDistance(W.S,x,z)<r+3.5) return false;
    if(Math.hypot(x,z+3)<r+12.8) return false;
    return !W.plots.some(p=>Math.hypot(x-p.x,z-p.z)<r+p.r+.8);
  }
  function plot(W,name,x,z,r) {
    // Prefer the art-directed site, otherwise search a small neighborhood.
    let best=null, score=Infinity;
    for(let dz=-10;dz<=10;dz+=2) for(let dx=-10;dx<=10;dx+=2) {
      if(!clear(W,x+dx,z+dz,r)) continue;
      const d=dx*dx+dz*dz; if(d<score) { score=d; best={x:x+dx,z:z+dz,r,name}; }
    }
    if(best) W.plots.push(best);
    return best;
  }
  function height(W,x,z) {
    const d=pathDistance(W.S,x,z);
    const h=2.4+Math.max(0,Math.sin(x*.085)*Math.cos(z*.11)*1.7+.4);
    const level=Math.min(1,Math.max(0,(d-4)/5));
    if(W.plots.some(p=>Math.hypot(x-p.x,z-p.z)<p.r+1)) return 2.4;
    return 2.4+(h-2.4)*level;
  }
  // Static geometry batching. Details remain true 3D, not billboard facades.
  function batch(W,geometry,color,matrix,kind) {
    const g=geometry.index?geometry.toNonIndexed():geometry.clone();
    g.applyMatrix4(matrix);
    const key=kind||'stone', b=W.batches[key]||(W.batches[key]={p:[],n:[],c:[]});
    const p=g.attributes.position.array,n=g.attributes.normal.array,col=new THREE.Color(color).convertSRGBToLinear();
    for(let i=0;i<p.length;i+=3) {
      b.p.push(p[i],p[i+1],p[i+2]); b.n.push(n[i],n[i+1],n[i+2]); b.c.push(col.r,col.g,col.b);
    }
    g.dispose();
    if(!W.geometryCache.has(geometry)) geometry.dispose();
  }
  function part(W,geo,col,x,y,z,sx,sy,sz,rx,ry,rz,kind) {
    const o=new THREE.Object3D(); o.position.set(x,y,z); o.scale.set(sx||1,sy||1,sz||1);
    o.rotation.set(rx||0,ry||0,rz||0); o.updateMatrix(); batch(W,geo,col,o.matrix,kind);
  }
  function cached(W,key,create) {
    if(!W.geometries[key]) { W.geometries[key]=create(); W.geometryCache.add(W.geometries[key]); }
    return W.geometries[key];
  }
  function softBox(W,w,h,d) {
    return cached(W,'box:'+w+':'+h+':'+d,()=>{
      const r=Math.min(.22,w*.16,h*.16,d*.16),s=new THREE.Shape();
      s.moveTo(-w/2+r,-d/2+r);s.lineTo(w/2-r,-d/2+r);s.lineTo(w/2-r,d/2-r);s.lineTo(-w/2+r,d/2-r);s.closePath();
      const g=new THREE.ExtrudeGeometry(s,{depth:h-2*r,steps:1,bevelEnabled:true,bevelSize:r,bevelThickness:r,bevelSegments:1,curveSegments:1});
      g.rotateX(-Math.PI/2);g.translate(0,-h/2+r,0);return g;
    });
  }
  function box(W,col,x,y,z,w,h,d,kind) { part(W,softBox(W,w,h,d),col,x,y,z,1,1,1,0,0,0,kind); }
  function sphere(W,col,x,y,z,r,sx,sy,sz,kind) {
    part(W,cached(W,'clay-sphere',()=>new THREE.SphereGeometry(1,10,7)),col,x,y,z,r*(sx||1),r*(sy||1),r*(sz||1),0,0,0,kind);
  }
  function cylinder(W,col,x,y,z,rt,rb,h,segments,kind) {
    part(W,cached(W,'cylinder:'+rt+':'+rb+':'+h+':'+segments,()=>new THREE.CylinderGeometry(rt,rb,h,segments||12)),col,x,y,z,1,1,1,0,0,0,kind);
  }
  function flush(W) {
    Object.keys(W.batches).forEach(key=>{
      const b=W.batches[key],g=new THREE.BufferGeometry();
      g.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));
      g.setAttribute('normal',new THREE.Float32BufferAttribute(b.n,3));
      g.setAttribute('color',new THREE.Float32BufferAttribute(b.c,3));
      const m=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.94,metalness:0,
        side:key==='leaves'?THREE.DoubleSide:THREE.FrontSide});
      const mesh=new THREE.Mesh(g,m); mesh.castShadow=key!=='lights'; mesh.receiveShadow=true;
      mesh.name='Diorama • '+key; W.S.scene.add(mesh);
    });
    W.batches={};
    W.geometryCache.forEach(g=>g.dispose());W.geometryCache.clear();W.geometries={};
  }
  function terrain(W) {
    const positions=[],colors=[],indices=[],color=new THREE.Color(),rings=38,segments=160;
    for(let j=0;j<=rings;j++) for(let i=0;i<=segments;i++) {
      const a=i/segments*Math.PI*2, r=boundary(a)*j/rings;
      const x=Math.cos(a)*r,z=Math.sin(a)*r*.91;
      const shore=Math.max(0,(r-boundary(a)+8)/8);
      positions.push(x,height(W,x,z)-shore*1.2,z);
      const variation=.035*Math.sin(x*.72)+.025*Math.cos(z*.59);
      color.setHex(shore>.25?C.sand:C.grass); color.offsetHSL(0,0,variation); color.convertSRGBToLinear();
      colors.push(color.r,color.g,color.b);
      if(j<rings&&i<segments) {const q=j*(segments+1)+i; indices.push(q,q+1,q+segments+1,q+1,q+segments+2,q+segments+1);}
    }
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3)); g.setIndex(indices); g.computeVertexNormals();
    const land=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.95}));
    land.receiveShadow=true; land.name='Terreno esculpido'; W.S.scene.add(land);
    // A cut wooden plinth follows the SAME shoreline; laminated edges read as a model.
    const outline=new THREE.Shape();
    for(let i=0;i<=128;i++) {
      const a=-i/128*Math.PI*2,r=boundary(a),x=Math.cos(a)*r,z=Math.sin(a)*r*.91;
      if(i===0)outline.moveTo(x,-z);else outline.lineTo(x,-z);
    }
    outline.closePath();
    [[-5.9,1.8,0xb18057],[-4.1,.32,0xe8c99a],[-3.78,2.7,0xc79c69],[-1.08,.32,0xefdbb0],[-.76,2.0,0xd5b57c]].forEach(layer=>{
      const g=new THREE.ExtrudeGeometry(outline,{depth:layer[1]-.3,steps:1,bevelEnabled:true,bevelSize:.36,bevelThickness:.15,bevelSegments:2,curveSegments:1});
      g.rotateX(-Math.PI/2);g.translate(0,layer[0]+.15,0);
      batch(W,g,layer[2],new THREE.Matrix4(),'wood');
    });
    // Sparse pebbles frame the shore without competing with the board tiles.
    for(let i=0;i<52;i++) {
      const a=i/52*Math.PI*2,r=boundary(a)-1.6;
      sphere(W,i%3?0xc8b991:0xe3d1aa,Math.cos(a)*r,1.35,Math.sin(a)*r*.91,1.1+(i%4)*.15,1.6,.38,1);
    }
    const points=[];
    for(let i=0;i<=160;i++) {const a=i/160*Math.PI*2,r=boundary(a)+2;points.push(new THREE.Vector3(Math.cos(a)*r,-6.6,Math.sin(a)*r*.91));}
    const foam=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),160,.28,4),new THREE.MeshBasicMaterial({color:0xd5ece0}));
    foam.name='Contorno de tinta na água';W.S.scene.add(foam);
    const paint=texture(256,256,c=>{
      c.fillStyle='#438b98';c.fillRect(0,0,256,256);
      c.strokeStyle='rgba(226,245,223,.25)';c.lineWidth=2;
      [[28,42],[172,118],[69,201]].forEach(a=>{c.beginPath();c.ellipse(a[0],a[1],16,3,0,0,Math.PI);c.stroke();});
      for(let i=0;i<500;i++){c.fillStyle=i%2?'rgba(255,255,238,.035)':'rgba(36,93,101,.025)';c.fillRect((i*71)%256,(i*139)%256,2,1);}
    });paint.wrapS=paint.wrapT=THREE.RepeatWrapping;paint.repeat.set(18,18);
    const seaG=new THREE.PlaneGeometry(700,700);seaG.rotateX(-Math.PI/2);
    const sea=new THREE.Mesh(seaG,new THREE.MeshStandardMaterial({map:paint,roughness:1,metalness:0}));
    sea.position.y=-7;sea.receiveShadow=true;sea.name='Água de papel pintado';
    // Landing previews keep the existing transparent island silhouette.
    sea.visible=!W.S.preview;W.S.scene.add(sea);
  }

  function roof(W,x,y,z,w,d,color) {
    // Two thick painted wooden roof panels with quiet scored seams.
    const angle=.55,len=(w/2+.35)/Math.cos(angle);
    [-1,1].forEach(side=>{
      part(W,softBox(W,len,.42,d+.65),color,x+side*w*.25,y+.7,z,1,1,1,0,0,-side*angle,'roof');
      for(let k=1;k<5;k++) part(W,softBox(W,len,.04,.045),0xe59e7b,x+side*w*.25,y+.93,z-d/2+k*d/5,1,1,1,0,0,-side*angle,'roof');
    });
    box(W,color,x,y+1.48,z,.38,.34,d+.8,'roof');
    box(W,C.cream,x+w*.25,y+1.8,z-d*.22,.65,1.3,.7);
    box(W,C.wood,x+w*.25,y+2.48,z-d*.22,.8,.18,.85);
  }
  function building(W,p,opts) {
    const {x,z}=p,w=opts.w||5,d=opts.d||4,floors=opts.floors||2,h=floors*2.1,col=opts.color||C.cream;
    box(W,C.stone,x,2.5,z,w+.8,.3,d+.8);
    box(W,col,x,2.7+h/2,z,w,h,d);
    for(let f=0;f<floors;f++) {
      const y=3.6+f*2.1;
      box(W,C.trim,x,y+.95,z,w+.2,.18,d+.2);
      for(let k=0;k<2;k++) {
        const xx=x-w*.24+k*w*.48;
        [-1,1].forEach(s=>{
          box(W,C.trim,xx,y,z+s*(d/2+.04),.94,1.35,.16);
          box(W,C.glass,xx,y,z+s*(d/2+.14),.67,1.07,.07,'glass');
          box(W,C.trim,xx,y,z+s*(d/2+.2),.07,1.1,.08);
          box(W,C.trim,xx,y-.61,z+s*(d/2+.22),1.04,.14,.38);
        });
      }
      [-1,1].forEach(s=>{for(let k=0;k<2;k++) {
        box(W,C.trim,x+s*(w/2+.05),y,z-d*.24+k*d*.48,.15,1.35,.9);
        box(W,C.glass,x+s*(w/2+.15),y,z-d*.24+k*d*.48,.07,1.05,.66,'glass');
      }});
    }
    box(W,C.wood,x,3.6,z+d/2+.14,1.05,1.9,.24);
    sphere(W,C.trim,x+.32,3.55,z+d/2+.29,.085,1,1,1);
    // A tiny paper awning and flower box belong to the building, inside its plot.
    if(!opts.flat) {
      box(W,C.trim,x,4.72,z+d/2+.48,1.8,.18,.85);
      box(W,C.wood,x-w*.24,3.0,z+d/2+.35,1.2,.3,.45);
      for(let k=0;k<3;k++) sphere(W,k%2?0xe1af55:0xd98489,x-w*.24-.35+k*.35,3.24,z+d/2+.35,.16,1,1,1,'flowers');
    }
    box(W,C.trim,x,2.65,z+d/2+.6,1.7,.18,1);
    if(opts.flat) {
      box(W,0x69968e,x,2.7+h+.15,z,w+.6,.3,d+.6);
      box(W,C.trim,x,2.7+h+.5,z,w+.65,.26,d+.65);
      box(W,0xa5bca8,x+.8,3.3+h,z-.5,1.2,.5,.9,'metal');
      cylinder(W,0x566677,x-.6,3.6+h,z+.4,.08,.08,1.2,6,'metal');
    } else roof(W,x,2.7+h,z,w,d,opts.roof||C.roof);
    if(opts.balcony) {
      box(W,C.trim,x,4.8,z+d/2+.7,w*.85,.2,1.1);
      for(let k=0;k<9;k++) box(W,0xb18960,x-w*.38+k*w*.095,5.2,z+d/2+1.2,.05,.75,.05,'metal');
      box(W,0xb18960,x,5.58,z+d/2+1.2,w*.9,.06,.07,'metal');
    }
    // Garden hedges and stepping stones surround each reserved footprint.
    [-1,1].forEach(s=>{
      for(let k=0;k<4;k++) sphere(W,0x799c68,x+s*(w/2+.7),2.8,z-d/2+k*d/3,.5,1,1,1,'leaves');
    });
  }
  function mountain(W,p,h) {
    // Hand-shaped clay silhouette, a rounded summit and a brushed snow cap.
    const profile=[];
    for(let j=0;j<=18;j++) {
      const t=j/18;
      profile.push(new THREE.Vector2(p.r*Math.cos(t*Math.PI/2),Math.sin(t*Math.PI/2)*h));
    }
    const g=new THREE.LatheGeometry(profile,18),a=g.attributes.position,cols=[],c=new THREE.Color();
    for(let i=0;i<a.count;i++) {
      const y=a.getY(i),ang=Math.atan2(a.getZ(i),a.getX(i));
      const sculpt=1+.035*Math.sin(ang*3+y*.17);
      a.setX(i,a.getX(i)*sculpt);a.setZ(i,a.getZ(i)*sculpt);
      const snow=y>h*(.67+.025*Math.sin(ang*3));
      c.setHex(snow?0xfff2d7:(y<h*.22?0x8ca297:0xa4b4ab));
      c.offsetHSL(0,0,.014*Math.sin(y*3));c.convertSRGBToLinear();cols.push(c.r,c.g,c.b);
    }
    g.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));g.computeVertexNormals();
    const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));
    mesh.position.set(p.x,2.4,p.z);mesh.castShadow=true;mesh.receiveShadow=true;W.S.scene.add(mesh);
    for(let i=0;i<8;i++) {
      const a=i/8*Math.PI*2;sphere(W,C.stone,p.x+Math.cos(a)*(p.r+.45),2.75,p.z+Math.sin(a)*(p.r+.45),.75,1,.65,1);
    }
  }
  function tree(W,x,z,scale,pine) {
    const y=height(W,x,z);
    cylinder(W,C.wood,x,y+scale*.8,z,.16*scale,.23*scale,scale*1.6,8,'trunks');
    if(pine) {
      const g=cached(W,'turned-pine',()=>new THREE.LatheGeometry([
        new THREE.Vector2(0,0),new THREE.Vector2(.65,.05),new THREE.Vector2(.92,.22),
        new THREE.Vector2(.95,.4),new THREE.Vector2(.58,1),new THREE.Vector2(.72,1.08),
        new THREE.Vector2(.73,1.24),new THREE.Vector2(.38,1.88),new THREE.Vector2(.47,1.94),
        new THREE.Vector2(.46,2.1),new THREE.Vector2(.14,2.7),new THREE.Vector2(0,2.85)],10));
      part(W,g,0x638e74,x,y+scale*.7,z,scale,scale,scale,0,W.rand()*3,0,'leaves');
    } else {
      const tint=[0x8da45f,0xb8be78,0x7e9e6c][Math.floor(W.rand()*3)];
      sphere(W,tint,x,y+scale*2.35,z,scale,1,1.3,.95,'leaves');
      sphere(W,tint,x+scale*.6,y+scale*1.95,z+scale*.12,scale*.63,1,1.1,1,'leaves');
    }
  }
  function palm(W,x,z,s) {
    const y=2.4;
    cylinder(W,0x977044,x,y+2.4*s,z,.16,.25,4.8*s,8,'trunks');
    for(let k=0;k<7;k++) {
      const a=k/7*6.28,p=[],id=[];
      for(let j=0;j<6;j++) {
        const t=j/5,rr=t*3*s,yy=y+4.8*s+.6*Math.sin(t*3.14)-t*t*1.4;
        const cx=x+Math.cos(a)*rr,cz=z+Math.sin(a)*rr,ww=Math.sin(t*3.14)*.4;
        p.push(cx-Math.sin(a)*ww,yy,cz+Math.cos(a)*ww,cx+Math.sin(a)*ww,yy,cz-Math.cos(a)*ww);
        if(j<5) {const q=j*2;id.push(q,q+1,q+2,q+1,q+3,q+2);}
      }
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(id);g.computeVertexNormals();
      batch(W,g,0x416d35,new THREE.Matrix4(),'leaves');
    }
  }
  function bridge(W,p) {
    for(let i=-6;i<=6;i++) {
      const x=p.x+i*.75,y=3.1+1.8*Math.cos(i/6*Math.PI/2);
      box(W,0xb19b77,x,y,p.z,.8,.32,3.3);
      [-1,1].forEach(s=>{
        box(W,C.stone,x,y+.65,p.z+s*1.6,.8,.9,.3);
        box(W,C.cream,x,y+1.18,p.z+s*1.6,.83,.2,.38);
      });
    }
    [-4.5,4.5].forEach(dx=>box(W,C.stone,p.x+dx,2.2,p.z,1.2,2,3.4));
  }
  function bench(W,x,z,ry) {
    const g=new THREE.Group();g.position.set(x,2.4,z);g.rotation.y=ry||0;g.updateMatrix();
    [[0,.5,0,2.4,.15,.8],[0,1.1,-.4,2.4,.65,.12],[-.9,.25,0,.12,.5,.7],[.9,.25,0,.12,.5,.7]].forEach(a=>{
      const o=new THREE.Object3D();o.position.set(a[0],a[1],a[2]);o.updateMatrix();
      batch(W,new THREE.BoxGeometry(a[3],a[4],a[5]),C.wood,new THREE.Matrix4().multiplyMatrices(g.matrix,o.matrix));
    });
  }
  function extras(W) {
    const p=W.landmarks;
    // Hospital cross and helipad; both sit on the compound model.
    if(p.hospital) {
      const h=p.hospital;
      box(W,0xd84c39,h.x,6.8,h.z+2.5,1.5,.4,.12);box(W,0xd84c39,h.x,6.8,h.z+2.5,.4,1.5,.12);
      cylinder(W,0x46626a,h.x,9.6,h.z,1.7,1.7,.12,24);
      box(W,C.trim,h.x-.4,9.68,h.z,.15,.03,1);box(W,C.trim,h.x+.4,9.68,h.z,.15,.03,1);box(W,C.trim,h.x,9.68,h.z,.8,.03,.15);
    }
    if(p.school) {
      const h=p.school;box(W,C.cream,h.x,8.0,h.z-1,1.7,3,1.8);
      const m=new THREE.Mesh(new THREE.CircleGeometry(.6,20),new THREE.MeshBasicMaterial({map:texture(128,128,c=>{
        c.fillStyle='#f7efd9';c.fillRect(0,0,128,128);c.strokeStyle='#3f4d58';c.lineWidth=6;
        c.beginPath();c.moveTo(64,64);c.lineTo(64,25);c.moveTo(64,64);c.lineTo(94,77);c.stroke();
      })}));m.position.set(h.x,8.8,h.z+.0);W.S.scene.add(m);
    }
    if(p.church) {
      const h=p.church;cylinder(W,C.cream,h.x,7.2,h.z,1.0,1.1,5.8,4);
      part(W,new THREE.ConeGeometry(1.4,2.7,4),0x4d665f,h.x,11.2,h.z,1,1,1,0,.785,0);
      box(W,0xc4a55b,h.x,13.3,h.z,.13,1,.13);box(W,0xc4a55b,h.x,13.45,h.z,.6,.13,.13,'metal');
    }
    if(p.family) {
      const h=p.family,g=new THREE.Group();g.position.set(h.x,10.6,h.z);
      const mat=new THREE.MeshStandardMaterial({color:0xdb7e87,roughness:.95});
      [-.35,.35].forEach(dx=>{const m=new THREE.Mesh(new THREE.SphereGeometry(.55,16,12),mat);m.position.x=dx;g.add(m);});
      const tip=new THREE.Mesh(new THREE.ConeGeometry(.73,.9,4),mat);tip.rotation.x=Math.PI;tip.position.y=-.55;g.add(tip);
      W.S.scene.add(g);W.heart=g;cylinder(W,C.trim,h.x,9,h.z,.016,.016,2,6,'metal');
    }
    // Lighthouse on its own rock, safely outside the playing area.
    const x=77,z=15;
    sphere(W,C.stone,x,-4,z,5.5,1,1.1,1);
    for(let k=0;k<7;k++) cylinder(W,k%2?0xd65643:C.trim,x,1+k*.95,z,.95-k*.03,1.05-k*.03,.97,20);
    cylinder(W,C.wood,x,7.6,z,1.45,1.45,.2,20);
    cylinder(W,C.glass,x,8.1,z,.7,.7,.9,16,'glass');
    part(W,new THREE.ConeGeometry(1.2,1.0,16),C.roof,x,9.1,z);
    // Waterfall veil on a western ledge; flowing procedural streaks.
    const ft=texture(128,256,c=>{
      c.fillStyle='#75c9db';c.fillRect(0,0,128,256);
      for(let k=0;k<90;k++){c.fillStyle=k%3?'rgba(245,255,255,.75)':'#408fae';c.fillRect(W.rand()*128,W.rand()*256,2+W.rand()*3,10+W.rand()*50);}
    });ft.wrapS=ft.wrapT=THREE.RepeatWrapping;
    const veil=new THREE.Mesh(new THREE.PlaneGeometry(5,12),new THREE.MeshStandardMaterial({map:ft,side:THREE.DoubleSide,roughness:1}));
    veil.position.set(-72,-.4,-7);veil.rotation.y=-Math.PI/2;W.S.scene.add(veil);W.fallTex=ft;
    sphere(W,C.stone,-69,5.7,-7,4,1.3,.4,1);
    // Detailed sails, wooden hull and cabin.
    W.S.boats=[];
    [[84,-25],[-87,25],[38,85]].forEach((b,k)=>{
      const g=new THREE.Group();g.position.set(b[0],-6.5,b[1]);
      const hull=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),new THREE.MeshStandardMaterial({color:C.wood,roughness:.95}));
      hull.scale.set(1.6,.45,3.4);g.add(hull);
      const deck=new THREE.Mesh(new THREE.BoxGeometry(2.5,.2,5),new THREE.MeshStandardMaterial({color:C.cream}));deck.position.y=.25;g.add(deck);
      const mast=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,6,8),new THREE.MeshStandardMaterial({color:C.wood}));mast.position.y=3;g.add(mast);
      const sh=new THREE.Shape();sh.moveTo(.1,.3);sh.lineTo(.1,5.8);sh.lineTo(2.5,.3);sh.closePath();
      const sail=new THREE.Mesh(new THREE.ShapeGeometry(sh),new THREE.MeshStandardMaterial({color:k===1?0xe6b966:0xf9f3e3,side:THREE.DoubleSide,roughness:.9}));g.add(sail);
      g.rotation.y=k*1.2;W.S.scene.add(g);W.S.boats.push(g);
    });
    W.S.clouds=[];
    [[-112,-65],[98,-112],[-42,-125]].forEach((p,k)=>{
      const g=new THREE.Group(),mat=new THREE.MeshStandardMaterial({color:0xfff4dc,roughness:1});
      for(let i=0;i<5;i++) {
        const m=new THREE.Mesh(new THREE.SphereGeometry(3.5+i%3,14,10),mat);
        m.position.set((i-2)*3.6,Math.sin(i)*1.2,0);m.scale.y=.7;g.add(m);
      }
      g.position.set(p[0],28+k*5,p[1]);W.S.scene.add(g);W.S.clouds.push(g);
    });
    const balloon=new THREE.Group();
    const cloth=texture(256,128,c=>{
      ['#c8654a','#eac773','#44798d','#eddec2','#c8654a','#eac773','#44798d','#eddec2'].forEach((co,i)=>{c.fillStyle=co;c.fillRect(i*32,0,32,128);});
    });
    const canopy=new THREE.Mesh(new THREE.SphereGeometry(3.7,24,18),new THREE.MeshStandardMaterial({map:cloth,roughness:.9}));
    canopy.scale.set(1,1.2,1);balloon.add(canopy);
    const basket=new THREE.Mesh(new THREE.BoxGeometry(1.3,1,1.3),new THREE.MeshStandardMaterial({color:C.wood,roughness:.9}));basket.position.y=-5.7;balloon.add(basket);
    balloon.position.set(-89,30,32);W.S.scene.add(balloon);W.balloon=balloon;
  }
  function build(S) {
    const W={S,rand:random(62061),plots:[],batches:{},geometries:{},geometryCache:new Set(),landmarks:{},fireworks:[]};world=W;
    S.layoutPath=[];for(let i=0;i<=1200;i++)S.layoutPath.push(S.curve.getPointAt(i/1200));
    const sites=[
      ['hospital',-59,0,5.8,{color:0x96bfbd,w:7.2,d:5.8,floors:3,flat:true}],
      ['school',-32,29,5.8,{color:0xe3bd76,w:7.2,d:5.8,floors:3,flat:true}],
      ['church',-62,-34,5.2,{color:0xe5d9bd,w:4,d:5,floors:1,roof:0x5d7568}],
      ['family',31,31,5.6,{color:0xf0ceb0,w:6.4,d:5.2,floors:2,balcony:true}],
      ['cottage',6,31,4.5,{color:0xe1bb7b,w:4.4,d:4,floors:1,roof:0x895035}],
      ['loft',-13,30,4.8,{color:0xdca49b,w:4.4,d:4,floors:2,balcony:true}],
      ['townhouse',59,1,4.8,{color:0x9eb9ba,w:4.4,d:4,floors:2,roof:0x477580}]
    ];
    sites.forEach(a=>{const p=plot(W,a[0],a[1],a[2],a[3]);if(p){W.landmarks[a[0]]=p;}});
    const mountainSites=[[-25,-36,8.2,22],[-6,-36,8.0,29],[11,-36,6.3,20]];
    mountainSites.forEach((a,i)=>{const p=plot(W,'montanha '+i,a[0],a[1],a[2]);if(p)W.landmarks['peak'+i]={...p,h:a[3]};});
    // Skyline: each complete building is reserved before the forest is scattered.
    const city=[];
    for(let i=0;i<6;i++){const p=plot(W,'cidade '+i,28+(i%3)*10,-38-Math.floor(i/3)*8,3.8);if(p)city.push(p);}
    const lake=plot(W,'lago e ponte',53,33,7.5);
    const neighborhood=[];
    [[-57,25],[-18,44],[1,48],[18,49],[42,49],[-60,-15],[-43,-4],[-30,-3],[30,-3]].forEach((a,i)=>{
      const p=plot(W,'bairro '+i,a[0],a[1],4.1);if(p)neighborhood.push(p);
    });
    terrain(W);
    sites.forEach(a=>{const p=W.landmarks[a[0]];if(p)building(W,p,a[4]);});
    city.forEach((p,i)=>building(W,p,{w:4,d:4,floors:3+i%3,flat:true,color:[0x9fbdbc,0xe4bc88,0xd8aba4,0xb2bd93][i%4]}));
    neighborhood.forEach((p,i)=>building(W,p,{w:3.8,d:3.4,floors:1+i%2,balcony:i%2===1,color:[0xe9c68e,0xe0aca1,0xb3c8b1,0xdcc5a2][i%4],roof:[0xcc7e64,0x648d92,0xaa8968][i%3]}));
    mountainSites.forEach((a,i)=>{const p=W.landmarks['peak'+i];if(p)mountain(W,p,p.h);});
    if(lake) {
      const g=new THREE.CircleGeometry(6.4,48);g.rotateX(-Math.PI/2);
      const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:0x69aeb1,roughness:.95,metalness:0}));m.position.set(lake.x,2.5,lake.z);W.S.scene.add(m);
      bridge(W,lake);
    }
    // A denser forest made of two coherent species; every canopy has clearance.
    const trees=S.low?105:170;
    for(let i=0,guard=0;i<trees&&guard<5000;guard++) {
      const x=(W.rand()-.5)*138,z=(W.rand()-.5)*123,r=1.2+W.rand()*.8;
      if(!clear(W,x,z,r+1))continue;
      tree(W,x,z,.75+W.rand()*.65,W.rand()<.56);i++;
    }
    // Beach details, shrubs, flowers, boulders and benches.
    for(let i=0;i<8;i++){const x=58+W.rand()*10,z=-43+W.rand()*20;if(clear(W,x,z,3.1))palm(W,x,z,1+W.rand()*.3);}
    for(let i=0;i<(S.low?65:100);i++) {
      const x=(W.rand()-.5)*136,z=(W.rand()-.5)*124;
      if(!clear(W,x,z,.6))continue;
      const y=height(W,x,z);
      sphere(W,0x3c693c,x,y+.25,z,.38,1.2,.8,1,'leaves');
      if(i%3===0)for(let k=0;k<3;k++)sphere(W,[0xdbb451,0xe4b2a1,0xf6e9b8][k],x+W.rand()*.6,y+.55,z+W.rand()*.6,.1,1,1,1,'flowers');
    }
    for(let i=0;i<12;i++) {
      const a=i/12*6.28,x=Math.cos(a)*69,z=Math.sin(a)*62;
      if(clear(W,x,z,2.2))sphere(W,C.stone,x,height(W,x,z)+.5,z,1.8,1.2,.7,1);
    }
    [[59,-30],[61,-18],[-21,39]].forEach(b=>{if(clear(W,b[0],b[1],2))bench(W,b[0],b[1],.2);});
    // Beach umbrellas and a small timber pier: ground objects also respect the road.
    [[62,-40],[64,-27]].forEach((p,i)=>{
      if(!clear(W,p[0],p[1],2.6))return;
      cylinder(W,C.wood,p[0],3.6,p[1],.045,.045,2.4,6,'trunks');
      part(W,new THREE.ConeGeometry(1.9,.8,14),i?0xd99946:0x467989,p[0],5,p[1]);
      box(W,C.trim,p[0]+1.5,2.45,p[1],1.1,.05,2.2);
    });
    for(let i=0;i<12;i++) {
      box(W,C.wood,69+i*.65,-6,40, .6,.25,3);
      if(i%3===0) [-1,1].forEach(s=>cylinder(W,0x5a4436,69+i*.65,-7,40+s*1.3,.13,.13,2,6,'trunks'));
    }
    extras(W);flush(W);
    S.decorPlots=W.plots;
    return W;
  }
  window.IslandWorld={
    build,
    tick:function(t,dt,reduced) {
      if(!world||reduced)return;
      const W=world;

      if(W.foam)W.foam.material.opacity=.35+.13*Math.sin(t*1.8);
      if(W.fallTex)W.fallTex.offset.y=-(t*.8)%1;
      if(W.heart)W.heart.rotation.z=Math.sin(t*1.3)*.09;
      if(W.balloon) {W.balloon.position.y=30+Math.sin(t*.3)*1.4;W.balloon.rotation.y=t*.04;}
      for(let i=W.fireworks.length-1;i>=0;i--){
        const f=W.fireworks[i];f.life-=dt;
        const a=f.mesh.geometry.attributes.position;
        for(let k=0;k<a.count;k++){f.v[k].y-=dt*8;a.setXYZ(k,a.getX(k)+f.v[k].x*dt,a.getY(k)+f.v[k].y*dt,a.getZ(k)+f.v[k].z*dt);}
        a.needsUpdate=true;f.mesh.material.opacity=Math.max(0,f.life/2);
        if(f.life<=0){W.S.scene.remove(f.mesh);f.mesh.geometry.dispose();f.mesh.material.dispose();W.fireworks.splice(i,1);}
      }
    },
    celebrate:function(){
      if(!world)return;const W=world;
      for(let i=0;i<4;i++) {
        const p=[],v=[];for(let k=0;k<80;k++){p.push(50+i*3,12+i*2,-46);v.push(new THREE.Vector3((W.rand()-.5)*18,W.rand()*16,(W.rand()-.5)*18));}
        const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
        const m=new THREE.Points(g,new THREE.PointsMaterial({color:[0xf6c95c,0xe77561,0x6dbc99,0xe8d9b0][i],size:.5,transparent:true}));
        W.S.scene.add(m);W.fireworks.push({mesh:m,v,life:2});
      }
    }
  };
})();
