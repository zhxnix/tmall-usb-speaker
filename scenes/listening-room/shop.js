/* Winter listening room. Original scene, approved concept dated 2026-11-04.
 * World units are metres. Front = +Z. All scene content is real mesh geometry.
 * Static mesh batching, cached shadows and a half-resolution mirror keep cost bounded.
 */
(function () {
  'use strict';
  const T = window.THREE;
  const root = document.getElementById('room');
  const query = new URLSearchParams(location.search);
  const device = query.get('device') === '1';
  const low = device || query.get('quality') === 'low';
  const ROOM_SCALE_X=.60;
  const simulationSize=[1024,600];
  let staticFrameDirty=true,cacheRebuilds=0,programWarmupPending=device,programWarmups=0;
  if(device)document.body.classList.add('device-runtime');
  T.ColorManagement.legacyMode = false;
  let renderer;
  try { renderer = new T.WebGLRenderer({ antialias: device || !low, powerPreference: device ? 'high-performance' : 'low-power' }); }
  catch (e) { document.getElementById('loading').textContent = '无法启动 3D，请在支持 WebGL 的浏览器中打开。'; return; }
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  renderer.setPixelRatio(device ? 1 : low ? .8 : Math.min(devicePixelRatio||1,1.4));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.info.autoReset = false;
  const gl=renderer.getContext();
  const gpuInfo=gl.getExtension('WEBGL_debug_renderer_info');
  const depthCacheSupported=renderer.capabilities.isWebGL2 || !!(gl.getExtension('WEBGL_depth_texture')&&gl.getExtension('EXT_frag_depth'));
  if(device)console.log('Miniature GPU: '+(gpuInfo?gl.getParameter(gpuInfo.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER))+'; depth cache='+depthCacheSupported);
  renderer.domElement.addEventListener('webglcontextrestored',()=>{staticFrameDirty=true;programWarmupPending=device;});
  document.getElementById('scene').appendChild(renderer.domElement);
  const scene = new T.Scene();
  // r146 clear colours bypass output encoding; keep the intended navy backdrop.
  scene.background = new T.Color('#0c1826').convertLinearToSRGB();
  scene.fog = new T.FogExp2('#142332', 0.007);
  const architecture = new T.Group(); scene.add(architecture);
  const dynamic = new T.Group(); scene.add(dynamic);
  const lights = new T.Group(); scene.add(lights);
  const navigationObjects=[],lightAnchors=[];
  function solid(object,name){navigationObjects.push({object,name});return object;}
  const materials = new Map();
  const geometries = new Map();
  let seed = 307;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  function material(color, roughness = .75, metalness = 0) {
    const key = color + ':' + roughness + ':' + metalness;
    if (!materials.has(key)) {
      const mat=new T.MeshStandardMaterial({color, roughness, metalness, flatShading:true});
      mat.userData.solidColour=true;materials.set(key,mat);
    }
    return materials.get(key);
  }
  const M = {
    wall: material('#3b4b4b'), trim: material('#526774'), dark: material('#1c2b32'),
    wood: material('#715c44'), edge: material('#423d34'), top: material('#988265'),
    shelf: material('#695b47'), paper: material('#bcb59d'), cream: material('#dbc89f'),
    brass: material('#ae9261', .44, .25), steel: material('#b9b29f', .52, .18),
    black: material('#1a2427'), rubber: material('#171b1d'), cone: material('#474a40'),
    pot: material('#b6baa9'), leaf: material('#667b53'), leaf2: material('#8c985e'),
    upholstery: material('#6d7559'), skin: material('#d2ac83'), hair: material('#272a27'),
    jacket: material('#b8af92'), shirt: material('#e0d3b0'), pants: material('#3b504d'),
    sole: material('#c7c7b2'), floor: material('#68736f', .52), plinth: material('#14212e')
  };
  const amber = new T.MeshBasicMaterial({color:'#ffdda1', toneMapped:false});
  const powerLED = new T.MeshBasicMaterial({color:'#b6d0bd', toneMapped:false});
  function group(parent, x=0,y=0,z=0,ry=0) { const g=new T.Group(); g.position.set(x,y,z);g.rotation.y=ry;(parent||architecture).add(g);return g; }
  function add(geo, mat, parent, x=0,y=0,z=0) {const o=new T.Mesh(geo,mat);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;(parent||architecture).add(o);return o;}
  function boxGeo(w,h,d,r=0) {
    const key=[w,h,d,r].join('/'); if(geometries.has(key))return geometries.get(key);
    r=Math.min(r,w*.15,h*.15,d*.15);
    const segments=r?(device?3:4):1;
    const g=new T.BoxGeometry(w,h,d,segments,segments,segments);
    if(r){const a=g.attributes.position,n=g.attributes.normal;
      for(let i=0;i<a.count;i++){
        const remap=(v,size)=>Math.abs(v)<1e-7?0:Math.sign(v)*(Math.abs(v)>size*.4?size/2:size/2-r);
        const p=new T.Vector3(remap(a.getX(i),w),remap(a.getY(i),h),remap(a.getZ(i),d));
        const core=new T.Vector3(T.MathUtils.clamp(p.x,-w/2+r,w/2-r),T.MathUtils.clamp(p.y,-h/2+r,h/2-r),T.MathUtils.clamp(p.z,-d/2+r,d/2-r));
        const normal=p.clone().sub(core).normalize();p.copy(core).addScaledVector(normal,r);a.setXYZ(i,p.x,p.y,p.z);n.setXYZ(i,normal.x,normal.y,normal.z);
      }
    }
    geometries.set(key,g);return g;
  }
  function box(w,h,d,mat,x,y,z,parent,r=0){return add(boxGeo(w,h,d,r),mat,parent,x,y,z);}
  function cylinder(rt,rb,h,mat,x,y,z,parent,segments=16){return add(new T.CylinderGeometry(rt,rb,h,segments),mat,parent,x,y,z);}
  function sphere(xr,yr,zr,mat,x,y,z,parent,segments=12){const o=add(new T.SphereGeometry(1,segments,8),mat,parent,x,y,z);o.scale.set(xr,yr,zr);return o;}
  function torus(r,t,mat,x,y,z,parent){return add(new T.TorusGeometry(r,t,5,28),mat,parent,x,y,z);}
  function rod(a,b,r,mat,parent,r2=r){const aa=new T.Vector3(...a),bb=new T.Vector3(...b),v=bb.clone().sub(aa);const o=cylinder(r2,r,v.length(),mat,0,0,0,parent,8);o.position.copy(aa.add(bb).multiplyScalar(.5));o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.normalize());return o;}
  function tube(points,r,mat,parent){return add(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),24,r,5,false),mat,parent);}
  function plane(w,h,mat,x,y,z,parent){const o=add(new T.PlaneGeometry(w,h),mat,parent,x,y,z);o.castShadow=false;return o;}
  function canvasTexture(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new T.CanvasTexture(c);t.encoding=T.sRGBEncoding;t.anisotropy=4;return t;}
  const tileTexture=canvasTexture(512,512,(c,w,h)=>{
    c.fillStyle='#6c797e';c.fillRect(0,0,w,h);
    for(let y=0;y<8;y++)for(let x=0;x<8;x++){const v=143+Math.floor(random()*10);c.fillStyle=`rgb(${v},${v+6},${v+10})`;c.fillRect(x*64+1,y*64+1,62,62);}
  });
  tileTexture.wrapS=tileTexture.wrapT=T.RepeatWrapping;tileTexture.repeat.set(2.5,2.9);
  const tileMat=new T.MeshStandardMaterial({color:'#929ca0',map:tileTexture,roughness:.67});
  box(8.82,.32,15.615,M.plinth,0,-.17,.02,null,.045);
  box(8.64,.1,14.22,tileMat,0,.025,-.72);
  // Foreground pavement is omitted; the display ends at the shop threshold.
  // Long structural edges make the front-to-back axis explicit.
  for(const side of [-1,1]){
    if(side>0){
      // The fireplace side is now a continuous painted wall.
      box(.18,5.2,14.22,M.wall,side*7.12,2.64,-.72);
    }else{
      box(.18,5.2,8.25,M.wall,side*7.12,2.64,-4.058);
      box(.18,.48,6.55,M.wall,side*7.12,.25,4.15);
      box(.18,1.58,6.55,M.wall,side*7.12,4.44,4.15);
    }
  }
  const backWall=box(8.64,4.4,.18,M.wall,0,2.24,-8.52);
  const windowPlanes=[];
  for(const side of [-1,1]){
    box(.25,.14,14.355,M.trim,side*7.12,5.29,-.72);
    box(.14,.16,14.22,M.trim,side*7.0,.18,-.72);
    for(const z of [-5.7,-1.2,3.0,5.42])if(side<0||z<0)box(.16,5.08,.16,M.trim,side*7.0,2.65,z);
  }
  box(8.74,.14,.25,M.trim,0,5.29,-8.5);
  box(8.74,.06,.11,M.trim,0,.105,7.17);
  // Transparent panes look onto actual snow and trees beyond openings in the walls.
  const windowMaterial=new T.MeshStandardMaterial({color:'#7193a2',transparent:true,opacity:.12,roughness:.18,metalness:.05,depthWrite:false});
  for(const side of [-1]){
    for(const section of [[1.8,2.10],[4.2,2.10],[6.63,2.08]]){
      const z=section[0],w=section[1];
      const p=plane(w,3.12,windowMaterial,side*7.0,2.06,z);p.rotation.y=-side*Math.PI/2;windowPlanes.push(p);
      for(const zz of [z-w/2,z+w/2])box(.12,3.25,.07,M.trim,side*6.93,2.06,zz);
      box(.1,.075,w+.1,M.trim,side*6.92,.44,z);box(.1,.075,w+.1,M.trim,side*6.92,3.66,z);
      box(.1,.055,w,M.trim,side*6.91,1.62,z);
    }
  }

  // The public build uses original cover art with the same 8-by-6 UV layout.
  const sleeves = new T.CanvasTexture(window.createRecordAtlas());
  sleeves.encoding=T.sRGBEncoding;sleeves.anisotropy=4;
  const sleeveMat=new T.MeshStandardMaterial({map:sleeves,roughness:.94});
  const recordMats=['#9a947f','#6e878a','#b8a588','#af946b','#637465','#976952','#abb1a2','#576d78'].map(c=>material(c));
  const artworkSlots={0:27,5:28,19:29,27:0,28:5,29:19};
  function sleeve(w,h,id,x,y,z,parent){
    if(Object.prototype.hasOwnProperty.call(artworkSlots,id))id=artworkSlots[id];
    const geom=new T.PlaneGeometry(w,h),uv=geom.attributes.uv,col=id%8,row=Math.floor(id/8);
    for(let i=0;i<uv.count;i++)uv.setXY(i,(col+.004+uv.getX(i)*.992)/8,(5-row+.004+uv.getY(i)*.992)/6);
    const o=add(geom,sleeveMat,parent,x,y,z);o.castShadow=false;return o;
  }
  let nextStockCover=6;
  function album(id,x,y,z,size,parent){box(size+.025,size+.025,.033,M.paper,x,y,z,parent);sleeve(size,size,id,x,y,z+.019,parent);}
  function shelfUnit(x,z,width=2.5,rotation=0){
    const g=group(architecture,x,0,z,rotation);
    box(width,2.78,.58,M.edge,0,1.55,0,g,.025);
    for(const yy of [.21,1.0,1.79,2.59,3.0])box(width+.05,.065,.68,M.top,0,yy,.04,g,.008);
    for(const xx of [-width/2,0,width/2])box(.055,2.8,.63,M.wood,xx,1.6,.03,g);
    for(let row=0;row<3;row++){
      const count=Math.floor((width-.17)/.061);
      for(let k=0;k<count;k++){
        const h=.51+random()*.13;
        box(.052,h,.38,recordMats[(k+row*3)%8],-width/2+.09+k*(width-.17)/count,.25+row*.79+h/2,.18,g);
      }
      album(nextStockCover++,width*.28,.56+row*.79,.36,.48,g);
    }
    solid(g,'墙边唱片架');return g;
  }
  for(const side of [-1,1])for(const z of [-6.42,-3.72,-1.0])shelfUnit(side*6.52,z,2.45,-side*Math.PI/2);
  // Rear counter, storage and door sit at the distant end of the aisle.
  const rear=group(architecture,0,0,-7.37);
  shelfUnit(-.15,-8.11,5.3,0);
  box(4.20,1.03,.88,M.wood,0,.65,.0,rear,.035);
  box(4.35,.10,1.02,M.top,0,1.20,.03,rear,.016);
  for(const xx of [-1.5,-.5,.5,1.5])box(.96,.82,.025,M.shelf,xx,.67,.457,rear);
  box(.65,.45,.10,M.trim,.1,1.52,-.05,rear,.015);box(.58,.37,.02,M.dark,.1,1.53,.012,rear);rod([.1,1.28,-.06],[.1,1.48,-.06],.035,M.steel,rear);box(.40,.035,.25,M.steel,.1,1.275,.02,rear);
  for(let i=0;i<4;i++)box(.43,.045,.38,recordMats[i],1.4,1.28+i*.045,.1,rear);
  solid(rear,'后部工作台');
  [-1.72,-1.13,1.13,1.72].forEach((x,i)=>album(42+i,x,1.49,.42,.42,rear));
  const legacyDoorParts=[box(1.18,3.05,.065,M.dark,5.46,1.67,-8.38,null,.018),
    box(.19,.29,.015,M.top,5.68,2.45,-8.334),sphere(.035,.035,.025,M.brass,5.90,1.55,-8.32)];
  for(const z of [-7.52,-5.95]){
    for(const y of [.4,1.22,2.05])for(let i=0;i<2;i++){
      solid(box(.75,.61,.60,material(i?'#68716a':'#77817a'),-5.3+i,y,z,null,.018),'储物箱');
      box(.24,.045,.016,M.dark,-5.3+i,y+.09,z+.31);
    }
  }
  // Soft occlusion and light pools are inexpensive small textures, not a post effect.
  const shadowTexture=canvasTexture(128,128,(c,w,h)=>{const g=c.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(5,12,18,.65)');g.addColorStop(.45,'rgba(5,12,18,.32)');g.addColorStop(1,'rgba(5,12,18,0)');c.fillStyle=g;c.fillRect(0,0,w,h)});
  function shadow(x,z,w,d,opacity=.75){const p=plane(w,d,new T.MeshBasicMaterial({map:shadowTexture,transparent:true,opacity,depthWrite:false}),x,.083,z);p.rotation.x=-Math.PI/2;return p;}
  const glowTexture=canvasTexture(128,128,(c,w,h)=>{const g=c.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(255,224,168,.36)');g.addColorStop(.20,'rgba(255,220,154,.12)');g.addColorStop(.5,'rgba(255,214,146,.03)');g.addColorStop(1,'rgba(255,214,146,0)');c.fillStyle=g;c.fillRect(0,0,w,h)});
  function glow(x,y,z,size=1.1){const s=new T.Sprite(new T.SpriteMaterial({map:glowTexture,transparent:true,blending:T.AdditiveBlending,depthWrite:false,toneMapped:false}));s.position.set(x,y,z);s.scale.set(size,size,1);lights.add(s);return s;}
  function pool(x,z,w,d){const p=plane(w,d,new T.MeshBasicMaterial({map:glowTexture,transparent:true,opacity:.5,blending:T.AdditiveBlending,depthWrite:false}),x,.086,z);p.rotation.x=-Math.PI/2;return p;}

  // Actual objects in each display: separate sleeve planes, spines, dividers and lips.
  function recordBin(x,z,w=2.3,d=1.18,columns=3){
    const g=group(architecture,x,0,z);
    box(w,.72,d,M.wood,0,.47,0,g,.018);box(w-.12,.05,d-.1,M.dark,0,.86,0,g);
    for(const xx of [-w/2,w/2])box(.065,.36,d+.03,M.top,xx,.88,0,g);
    box(w,.06,.075,M.top,0,1.06,-d/2,g);box(w,.06,.08,M.top,0,.80,d/2,g);
    for(let col=0;col<columns;col++){
      const xx=-w/2+(col+.5)*w/columns, size=Math.min(.56,w/columns-.09);
      for(let k=0;k<15;k++){
        const zz=-d/2+.14+k*(d-.24)/15;
        const r=group(g,xx,.98,zz);r.rotation.x=-.16;
        box(size,.56,.026,recordMats[(col+k)%8],0,0,0,r);
        if(k===14)sleeve(size-.015,.54,nextStockCover++,0,0,.030,r);
        if(window.CustomerTrial&&x>0&&Math.abs(z+1.38)<.01&&col===0&&k>=4&&k<=8)window.CustomerTrial.stock.push(r);
      }
      if(col>0)box(.035,.36,d-.07,M.top,xx-w/columns/2,.95,0,g);
    }
    shadow(x,z,w+.55,d+.5);
    solid(g,'唱片陈列柜');return g;
  }
  // A small window exhibition, not a bulk stock bin: three landmark releases
  // on individual angled stands, with the rest of the glass kept open.
  const windowDisplay=group(architecture,-3.60,0,5.98);
  box(2.26,.43,.72,M.wood,0,.285,0,windowDisplay,.018);
  box(2.28,.055,.74,M.top,0,.5275,0,windowDisplay,.009);
  for(const x of [-1.10,1.10])for(const z of [-.30,.30])box(.025,1.00,.025,M.brass,x,1.055,z,windowDisplay,.003);
  for(const z of [-.30,.30])box(2.24,.026,.026,M.brass,0,1.55,z,windowDisplay,.003);
  const displayGlass=new T.MeshStandardMaterial({color:'#a7babc',transparent:true,opacity:.028,roughness:.12,depthWrite:false});
  const glassCase=box(2.22,1.00,.012,displayGlass,0,1.055,.315,windowDisplay);glassCase.castShadow=false;
  const features=[{slot:29,title:'雪夜来信',artist:'Winter Sessions',year:'03'},{slot:28,title:'窗边慢放',artist:'Winter Sessions',year:'02'},{slot:27,title:'炉火微光',artist:'Winter Sessions',year:'01'}];
  features.forEach((feature,i)=>{
    const x=(i-1)*.74,lift=i===1?.045:0;
    box(.69,.08,.30,M.dark,x,.585+lift,.035,windowDisplay,.006);
    const stand=group(windowDisplay,x,.975+lift,.045);stand.rotation.x=-.10;
    box(.68,.68,.028,M.edge,0,0,0,stand,.004);sleeve(.65,.65,feature.slot,0,0,.016,stand);
    rod([x,.57,-.14],[x,1.08,-.05],.013,M.brass,windowDisplay);
    const caption=canvasTexture(512,128,(c,w,h)=>{c.fillStyle='#d9ceb2';c.fillRect(0,0,w,h);c.textAlign='center';c.fillStyle='#344341';c.font='bold 42px sans-serif';c.fillText(feature.title,w/2,52);c.font='27px sans-serif';c.fillText(feature.year+'  ·  '+feature.artist,w/2,101);});
    plane(.57,.125,new T.MeshBasicMaterial({map:caption}),x,.565+lift,.302,windowDisplay);
  });
  nextStockCover+=3;
  solid(windowDisplay,'橱窗精选陈列');shadow(-3.60,5.98,2.6,1.05,.55);
  // The foreground-right bin and its ground shadow are removed. Keep the remaining sleeve/pine colours stable.
  for(let removedSleeve=0;removedSleeve<3;removedSleeve++)random();
  for(const x of [-2.60,2.08])for(const z of [-3.60,-1.38,.86])recordBin(x,z,1.40,1.95,2);
  // Keep the centre aisle open; the leftover green stool has been removed.

  function amplifier(x,y,z,parent,scale=1,animated=false){
    const g=group(parent,x,y,z);g.scale.setScalar(scale);
    box(.90,.28,.55,M.wood,0,.15,0,g,.025);
    box(.91,.22,.025,M.steel,0,.15,.286,g,.006);
    for(const dx of [-.28,-.08]){
      box(.15,.082,.006,M.dark,dx,.17,.304,g);
      box(.126,.057,.008,amber,dx,.175,.309,g);
    }
    for(const dx of [.11,.32]){const k=cylinder(dx===.32?.065:.036,dx===.32?.065:.036,.031,M.steel,dx,.15,.32,g);k.rotation.x=Math.PI/2;}
    sphere(.012,.012,.01,powerLED,-.38,.11,.31,g,6);
    for(let i=0;i<9;i++)box(.025,.004,.27,M.black,-.32+i*.078,.294,-.03,g);
    if(animated){for(const xx of [-.28,-.08]){
      const pivot=group(dynamic,0,0,0);g.updateWorldMatrix(true,false);pivot.position.copy(g.localToWorld(new T.Vector3(xx,.148,.317)));
      rod([0,0,0],[0,.052,0],.0025,M.black,pivot);meters.push(pivot);
    }}
    return g;
  }
  const meters=[], platters=[];
  function speaker(x,y,z,parent,scale=1){
    const g=group(parent,x,y,z);g.scale.setScalar(scale);
    box(.71,1.83,.60,M.wood,0,.99,0,g,.015);box(.64,1.72,.025,M.edge,0,.99,.31,g,.006);
    for(const yy of [.55,1.15]){
      let o=cylinder(.246,.246,.025,M.black,0,yy,.335,g,28);o.rotation.x=Math.PI/2;
      o=cylinder(.224,.105,.045,M.cone,0,yy,.356,g,28);o.rotation.x=Math.PI/2;
      torus(.213,.018,M.rubber,0,yy,.38,g);sphere(.10,.10,.032,M.black,0,yy,.40,g);
    }
    let tweeter=cylinder(.087,.087,.03,M.brass,0,1.65,.34,g);tweeter.rotation.x=Math.PI/2;sphere(.043,.043,.026,M.black,0,1.65,.366,g);
    for(const xx of [-.26,.26])for(const zz of [-.18,.18])rod([xx*.95,0,zz],[xx,.20,zz],.028,M.edge,g);
    return g;
  }
  function turntable(x,y,z,parent,scale=1,animate=true){
    const g=group(parent,x,y,z);g.scale.setScalar(scale);
    box(1.05,.12,.72,M.wood,0,.07,0,g,.016);box(.99,.018,.67,M.black,0,.138,0,g);
    cylinder(.29,.29,.035,M.steel,-.14,.167,0,g,40);
    const disc=group(g,-.14,.192,0);cylinder(.276,.276,.014,M.black,0,0,0,disc,40);
    for(let k=0;k<4;k++){const r=torus(.15+k*.029,.0019,M.cone,0,.009,0,disc);r.rotation.x=-Math.PI/2;}
    cylinder(.084,.084,.006,material('#b89057'),0,.010,0,disc,24);box(.025,.004,.08,M.cream,.038,.015,0,disc);
    cylinder(.008,.008,.03,M.steel,0,.026,0,disc,8);
    cylinder(.052,.052,.07,M.steel,.36,.20,-.24,g);rod([.36,.235,-.24],[.37,.235,.16],.012,M.steel,g);rod([.37,.235,.16],[.22,.215,.22],.012,M.steel,g);box(.10,.024,.05,M.paper,.20,.203,.22,g);
    const lid=box(1.01,.58,.018,new T.MeshStandardMaterial({color:'#a3c0bf',transparent:true,opacity:.18,roughness:.25,metalness:.05,depthWrite:false}),0,.43,-.42,g);
    lid.rotation.x=-.32;lid.castShadow=false;
    if(animate)platters.push(disc);return g;
  }
  for(const x of [-2.40,2.40]){
    solid(box(1.45,.77,.64,M.shelf,x,.49,-5.34,null,.018),'后排试听柜');
    solid(box(1.55,.075,.70,M.top,x,.91,-5.34),'后排试听柜台面');
    speaker(x+(x>0?.56:-.56),.96,-5.39,architecture,.48);
    amplifier(x+(x>0?-.36:.36),.96,-5.32,architecture,.95);
  }
  // The two listening displays occupy the foreground without blocking the aisle.
  const leftPartition=group(architecture,-4.8,0,3.60);
  box(2.80,2.92,.12,material('#58645b'),0,1.60,0,leftPartition,.012);
  box(2.92,.075,.20,M.trim,0,3.10,0,leftPartition);
  box(2.68,1.07,1.10,M.wood,0,.64,.61,leftPartition,.025);box(2.84,.075,1.22,M.top,0,1.22,.61,leftPartition,.015);
  for(const xx of [-.88,0,.88])box(.82,.88,.018,M.shelf,xx,.66,1.17,leftPartition);
  amplifier(-.30,1.27,.62,leftPartition,1.05);
  turntable(.85,1.27,.62,leftPartition,1.0,true);
  box(1.47,1.38,.055,M.wood,-.08,2.18,.10,leftPartition,.016);
  function headphones(x,y,z,parent,size=1){
    const g=group(parent,x,y,z);g.scale.setScalar(size);
    tube([[-.18,-.05,0],[-.21,.16,0],[-.12,.28,0],[0,.32,0],[.12,.28,0],[.21,.16,0],[.18,-.05,0]],.025,M.black,g);
    for(const side of [-1,1]){box(.095,.21,.12,M.black,side*.18,-.015,0,g,.025);box(.023,.16,.11,M.brass,side*.233,0,0,g,.008);}
    return g;
  }
  for(let row=0;row<2;row++)for(let col=0;col<3;col++)headphones(-.58+col*.50,1.91+row*.58,.18,leftPartition,.80);
  for(const xx of [-1.23,.95])for(let i=0;i<5;i++)box(.046,1.6,.056,M.top,xx+i*.10,2.17,.10,leftPartition);
  solid(leftPartition,'左侧试听展台');
  const rightPartition=group(architecture,5.25,0,.92);
  box(2.30,2.9,.12,material('#52625c'),0,1.59,0,rightPartition,.012);
  let partitionPoster=2;
  for(const xx of [-.46,.46])for(const yy of [1.96,2.65]){box(.67,.67,.10,M.top,xx,yy,.12,rightPartition,.009);sleeve(.605,.605,partitionPoster++,xx,yy,.178,rightPartition);}
  solid(rightPartition,'试听角隔墙');
  solid(speaker(3.65,.08,1.20,architecture,.91),'落地音箱');

  function taskLamp(x,y,z,parent,scale=1){
    const g=group(parent,x,y,z);g.scale.setScalar(scale);
    cylinder(.16,.18,.04,M.brass,0,.025,0,g);rod([0,.04,0],[0,.83,0],.022,M.brass,g);
    tube([[0,.82,0],[.02,.99,.01],[.16,1.01,.01],[.23,.91,.01]],.022,M.brass,g);
    cylinder(.055,.18,.16,M.top,.23,.84,.01,g,18);cylinder(.165,.165,.012,amber,.23,.754,.01,g,18);
    lightAnchors.push({object:g,point:new T.Vector3(.23,.752,.01),intensity:.55,range:2.8});return g;
  }
  function mushroomLamp(x,y,z,parent,scale=1){
    const g=group(parent,x,y,z);g.scale.setScalar(scale);
    cylinder(.16,.16,.038,M.brass,0,.02,0,g);rod([0,.02,0],[0,.46,0],.028,M.brass,g);
    const cap=add(new T.SphereGeometry(.29,20,8,0,Math.PI*2,0,Math.PI/2),M.cream,g,0,.46,0);cap.scale.y=.7;
    cylinder(.28,.28,.014,amber,0,.458,0,g);lightAnchors.push({object:g,point:new T.Vector3(0,.45,0),intensity:1.55,range:4.8});return g;
  }
  mushroomLamp(-6.04,1.28,4.18,architecture,.9);glow(-6.04,1.7,4.18,1.4);pool(-5.7,4.25,3,3);
  for(const x of [-1.68,1.68])for(const z of [-3.7,-.9]){taskLamp(x,1.45,z,architecture,.70);glow(x+.16,1.97,z,1.2);pool(x,z,2.5,3.4);}

  function wallLamp(x,y,z,rot=0){const g=group(architecture,x,y,z,rot);box(.66,.15,.15,M.brass,0,0,0,g,.01);box(.59,.075,.02,amber,0,-.023,.084,g);glow(x,y,z+.15,1.5);}
  for(const side of [-1,1])for(const z of [-6,-2.5,1.1])wallLamp(side*6.90,3.27,z,-side*Math.PI/2);
  wallLamp(-4.80,2.99,3.77);
  for(const x of [-1.25,1.25]){
    const pendant=group(architecture,x,0,-6.9);
    cylinder(.09,.11,.045,M.brass,0,5.25,0,pendant,16);
    rod([0,5.23,0],[0,3.82,0],.012,M.black,pendant);
    cylinder(.10,.29,.18,M.dark,0,3.73,0,pendant,20);cylinder(.27,.27,.014,amber,0,3.633,0,pendant,20);
    glow(x,3.62,-6.9,1.5);pool(x,-6.8,3.5,4);
    lightAnchors.push({object:pendant,point:new T.Vector3(0,3.60,0),intensity:1.35,range:5.8});
  }
  // Greenery uses flat, faceted leaves rather than smooth plastic blobs.
  function plant(x,y,z,scale=1,parent=architecture){
    const g=group(parent,x,y,z);g.scale.setScalar(scale);
    cylinder(.22,.17,.40,M.pot,0,.21,0,g,10);cylinder(.20,.20,.01,M.edge,0,.418,0,g,10);
    for(let i=0;i<9;i++){
      const a=i*2.399,yy=.70+random()*.65,r=.22+random()*.21,tx=Math.cos(a)*r,tz=Math.sin(a)*r;
      rod([0,.40,0],[tx,yy,tz],.009,M.leaf,g);
      const l=sphere(.11,.28,.027,i%3?M.leaf:M.leaf2,tx,yy+.11,tz,g,6);l.rotation.set(Math.cos(a)*.55,a,Math.sin(a)*.8);
    }
    return g;
  }
  plant(-6.20,1.28,4.61,.6);plant(-1.38,1.25,-7.29,.52);
  for(const side of [-1,1]){
    plant(side*6.27,2.95,-2.1,.57);
    tube([[side*6.23,3.30,-2.1],[side*5.95,2.88,-2.0],[side*5.94,2.16,-1.95]],.018,M.leaf);
    for(let i=0;i<7;i++)sphere(.12,.17,.04,i%2?M.leaf:M.leaf2,side*(5.96+(i%2)*.13),2.18+i*.13,-1.92);
  }
  // Rebuilt listening corner, measured against the user's close reference.
  const listener=createMiniatureListener({T,parent:dynamic,material,box,boxGeo,cylinder,sphere,rod,tube,torus,group,plane,canvasTexture});
  const listenerLife=createListenerLife({T,listener,material,group,box,cylinder,sphere,torus,plane,canvasTexture});
  listener.root.position.set(5.05,.085,2.75);
  listener.root.rotation.y=-.40;listener.root.scale.setScalar(.74);
  listener.taskLight.shadow.mapSize.set(low?512:1024,low?512:1024);
  solid(listener.chair,'听歌扶手椅');solid(listener.table,'播放器边桌');solid(listener.lamp,'试听台灯');solid(listenerLife.coffeeTable,'书咖小圆桌');
  const {head,torso,feet}=listener;
  shadow(4.8,2.8,3.3,3.0,.75);
  const entranceMat=plane(1.47,.52,material('#44605c'),0,.084,6.85);entranceMat.rotation.x=-Math.PI/2;
  for(let k=0;k<14;k++)box(.012,.004,.45,M.trim,-.68+k*.10,.088,6.85);
  // Illumination is local and subdued; no all-over bright front light.
  const hemi=new T.HemisphereLight('#a9c7d4','#38423c',.35);lights.add(hemi);
  const moon=new T.DirectionalLight('#a2c5d8',.18);moon.position.set(-5,11,6);lights.add(moon);
  moon.castShadow=true;moon.shadow.mapSize.set(low?1024:2048,low?1024:2048);
  Object.assign(moon.shadow.camera,{left:-11,right:11,top:12,bottom:-12,near:.5,far:35});moon.target.position.set(0,0,-1);lights.add(moon.target);moon.shadow.bias=-.0004;moon.shadow.normalBias=.028;moon.shadow.radius=3;moon.shadow.autoUpdate=false;moon.shadow.needsUpdate=true;
  const warmLights=[];
  // Colour is a vertex attribute on the device, so differently coloured rigid parts
  // with the same surface response share a draw call without changing their lighting.
  const batchMaterials=new Map();
  function batch(root,options){
    root.updateMatrixWorld(true);const inverse=new T.Matrix4().copy(root.matrixWorld).invert(),buckets=new Map(),original=[];
    const collect=o=>{if(!o.isMesh||o.isSkinnedMesh||Array.isArray(o.material))return;original.push(o);
      const originalMat=o.material;let mat=originalMat;
      const tint=device&&(mat.userData.solidColour||mat.isMeshLambertMaterial)&&!mat.map&&!mat.transparent;
      if(tint){
        const paletteKey=[mat.type,mat.roughness,mat.metalness,mat.side,mat.flatShading,mat.depthTest,mat.depthWrite].join('|');
        if(!batchMaterials.has(paletteKey)){const shared=mat.clone();shared.color.set('#ffffff');shared.vertexColors=true;batchMaterials.set(paletteKey,shared);}
        mat=batchMaterials.get(paletteKey);
      }
      const key=mat.uuid+'|'+o.castShadow+'|'+o.receiveShadow;
      if(!buckets.has(key))buckets.set(key,{mat,cast:o.castShadow,receive:o.receiveShadow,geos:[]});
      const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();
      if(!g.attributes.uv)g.setAttribute('uv',new T.BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
      if(tint&&!g.attributes.color){const colours=new Float32Array(g.attributes.position.count*3);for(let i=0;i<colours.length;i+=3){colours[i]=originalMat.color.r;colours[i+1]=originalMat.color.g;colours[i+2]=originalMat.color.b;}g.setAttribute('color',new T.BufferAttribute(colours,3));}
      g.applyMatrix4(new T.Matrix4().multiplyMatrices(inverse,o.matrixWorld));buckets.get(key).geos.push(g);
    };
    if(options&&options.direct)root.children.forEach(collect);else root.traverse(collect);
    original.forEach(o=>o.parent.remove(o));
    buckets.forEach(b=>{const geo=new T.BufferGeometry();const attributes=b.mat.vertexColors?['position','normal','uv','color']:['position','normal','uv'];for(const name of attributes){let length=0;for(const g of b.geos)length+=g.attributes[name].array.length;const array=new Float32Array(length);let off=0;for(const g of b.geos){array.set(g.attributes[name].array,off);off+=g.attributes[name].array.length;}geo.setAttribute(name,new T.BufferAttribute(array,name==='uv'?2:3));}const m=new T.Mesh(geo,b.mat);m.castShadow=b.cast;m.receiveShadow=b.receive;root.add(m);b.geos.forEach(g=>g.dispose());});
  }
  // Narrow the room's footprint by repositioning furniture, not stretching the objects.
  for(const container of [architecture,dynamic,lights])for(const child of container.children){child.position.x*=ROOM_SCALE_X;child.position.z*=.90;}
  if(window.CustomerTrial){architecture.updateMatrixWorld(true);window.CustomerTrial.stock.forEach(record=>{dynamic.attach(record);record.userData.browseHome=record.rotation.x;});}
  // A continuous ceiling is seen only at the top of the glass window, never as an outside roof.
  const ceiling=box(8.64,.12,14.2,material('#283b3b'),0,5.33,-.65,architecture);ceiling.castShadow=false;
  const navigation=createShopNavigation();
  const winter=createWinterRoom({T,scene,architecture,dynamic,lights,material,group,box,cylinder,sphere,rod,tube,torus,plane,canvasTexture,listener,random,batch,backWall,legacyDoorParts,low,solid});
  const checkout=createFrontCheckout({T,architecture,dynamic,material,group,box,cylinder,rod,plane,canvasTexture,batch,solid});
  let cat;
  const customers=createShopCustomers({T,dynamic,material,group,box,cylinder,sphere,rod,plane,sleeve,batch,navigation,canvasTexture,checkoutStation:checkout,doorReady:()=>checkout.ready(),getCat:()=>cat&&cat.navigationAgent()});
  cat=createShopCat({T,architecture,dynamic,material,group,box,cylinder,sphere,rod,tube,plane,canvasTexture,batch,navigation,getShoppers:()=>customers.navigationAgents()});
  solid(cat.cabinet,'小猫休息柜');
  const wallDetails=createWallDetails({T,architecture,dynamic,material,group,box,cylinder,sphere,rod,tube,plane,canvasTexture,batch,sleeve});
  const framingTargets=[{name:'左侧柜台',object:leftPartition},{name:'左墙前沿',x:-4.36,y:2.25,z:6.46},{name:'右墙前沿',x:4.36,y:2.25,z:6.46},{name:'试听者',object:listener.root},{name:'壁炉',object:winter.hearth},{name:'猫咪柜台',object:cat.cabinet}];
  architecture.updateMatrixWorld(true);dynamic.updateMatrixWorld(true);
  lightAnchors.push(checkout.lampAnchor);
  lightAnchors.forEach(a=>{const lampLight=new T.PointLight('#ffcf8d',a.intensity,a.range,1.25);lampLight.position.copy(a.object.localToWorld(a.point.clone()));lampLight.userData.baseIntensity=a.intensity;lights.add(lampLight);warmLights.push(lampLight);});
  navigation.setObstacles(navigationObjects.map(item=>{const b=new T.Box3().setFromObject(item.object);return{name:item.name,minX:b.min.x,maxX:b.max.x,minY:b.min.y,maxY:b.max.y,minZ:b.min.z,maxZ:b.max.z};}).concat([{name:'吧台转角通行余量',minX:.56,maxX:1.40,minY:.04,maxY:2.2,minZ:5.30,maxZ:5.45,navigationOnly:true}]));
  customers.initialize();
  framingTargets.forEach(item=>{if(item.object)item.bounds=new T.Box3().setFromObject(item.object);});
  platters.forEach(p=>{dynamic.attach(p);batch(p)});
  batch(listener.chair);batch(listener.hips);batch(listener.legs);feet.forEach(batch);
  listener.batchParts(batch);listenerLife.batchParts(batch);
  listener.table.remove(listener.player);batch(listener.table);listener.table.add(listener.player);
  const livePlayerParts=listener.levelBars.concat(listener.powerIndicator);
  livePlayerParts.forEach(b=>listener.player.remove(b));batch(listener.player);livePlayerParts.forEach(b=>listener.player.add(b));
  batch(listener.lamp);
  if(device){
    // Cache the unmoving furniture and trousers at full detail, keeping the steam,
    // meter LEDs, shoes, upper body and head in the live scene.
    const steam=[];listener.table.traverse(o=>{if(o.isPoints)steam.push(o);});
    steam.concat(livePlayerParts).forEach(o=>dynamic.attach(o));
    [listener.chair,listener.hips,listener.legs,listener.table,listener.lamp,listenerLife.coffeeTable]
      .concat(listener.root.children.filter(o=>o.isMesh)).forEach(o=>architecture.attach(o));
  }
  batch(architecture);
  if(device){
    const liveMaterials=new Map();
    dynamic.traverse(o=>{if(!o.isMesh)return;o.receiveShadow=false;const m=o.material;
      if(m.isMeshStandardMaterial&&m.metalness===0&&!m.transparent){
        if(!liveMaterials.has(m.uuid))liveMaterials.set(m.uuid,new T.MeshLambertMaterial({color:m.color,map:m.map,vertexColors:m.vertexColors,flatShading:m.flatShading,side:m.side}));
        o.material=liveMaterials.get(m.uuid);
      }
    });
    const pivots=new Set();dynamic.traverse(o=>{if(o.isMesh&&o.parent!==dynamic)pivots.add(o.parent);});
    pivots.forEach(pivot=>{if(pivot.children.filter(o=>o.isMesh).length>1)batch(pivot,{direct:true});});
  }
  const vertexReuse={geometries:0,before:0,after:0};
  if(device){
    // Batching expanded every triangle to independent vertices. Weld only
    // bit-identical complete attributes, keeping every triangle in its original
    // order. This changes neither geometry nor shading, but reuses vertex work.
    const processed=new Set();
    dynamic.traverse(object=>{
      if(!object.isMesh||processed.has(object.geometry))return;
      const geometry=object.geometry;processed.add(geometry);
      if(geometry.index||!geometry.attributes.position||geometry.attributes.position.count<60)return;
      const names=Object.keys(geometry.attributes),attributes=names.map(name=>geometry.attributes[name]);
      if(attributes.some(a=>a.isInterleavedBufferAttribute||!(a.array instanceof Float32Array)))return;
      const count=geometry.attributes.position.count;
      const bits=attributes.map(a=>new Uint32Array(a.array.buffer,a.array.byteOffset,a.array.length));
      const indices=new Uint32Array(count),unique=[],lookup=new Map();
      for(let i=0;i<count;i++){
        let key='';
        for(let a=0;a<attributes.length;a++){const size=attributes[a].itemSize;for(let c=0;c<size;c++)key+=bits[a][i*size+c]+',';}
        let index=lookup.get(key);
        if(index===undefined){index=unique.length;lookup.set(key,index);unique.push(i);}
        indices[i]=index;
      }
      vertexReuse.before+=count;vertexReuse.after+=unique.length;
      if(unique.length>=count)return;
      attributes.forEach((attribute,a)=>{
        const array=new Float32Array(unique.length*attribute.itemSize);
        unique.forEach((source,target)=>{for(let c=0;c<attribute.itemSize;c++)array[target*attribute.itemSize+c]=attribute.array[source*attribute.itemSize+c];});
        geometry.setAttribute(names[a],new T.BufferAttribute(array,attribute.itemSize,attribute.normalized));
      });
      geometry.setIndex(new T.BufferAttribute(unique.length<=65535?new Uint16Array(indices):indices,1));vertexReuse.geometries++;
    });
  }
  geometries.forEach(g=>g.dispose());geometries.clear();
  renderer.shadowMap.needsUpdate=true;

  // Real planar reflections. Interior is only lightly polished; pavement is wet.
  const reflectionShader={
    uniforms:{color:{value:new T.Color('#56656b')},tDiffuse:{value:null},textureMatrix:{value:new T.Matrix4()},uTime:{value:0}},
    vertexShader:'uniform mat4 textureMatrix; varying vec4 vReflect; varying vec2 vGround; void main(){vReflect=textureMatrix*vec4(position,1.0);vGround=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`uniform vec3 color; uniform sampler2D tDiffuse; uniform float uTime; varying vec4 vReflect; varying vec2 vGround;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      void main(){bool outside=vGround.y<.087;vec4 q=vReflect;float strength=outside?.0008:.00008;float wave=sin(vGround.x*240.0+uTime*2.0)*sin(vGround.y*630.0-uTime*1.2);q.xy+=vec2(wave,sin(vGround.y*310.0+uTime))*strength*q.w;
      vec3 a=texture2DProj(tDiffuse,q).rgb;vec3 b=texture2DProj(tDiffuse,q+vec4(.001*q.w,0.,0.,0.)).rgb;vec3 reflected=mix(a,b,.35);
      float opacity=outside?0.:.055;gl_FragColor=vec4(reflected,opacity);
      #include <tonemapping_fragment>
      #include <encodings_fragment>
    }`
  };
  let mirror=null;
  if(!low){mirror=new T.Reflector(new T.PlaneGeometry(8.60,15.453),{textureWidth:768,textureHeight:768,clipBias:.001,multisample:0,shader:reflectionShader});mirror.getRenderTarget().depthTexture=new T.DepthTexture(768,768,T.UnsignedIntType);mirror.rotation.x=-Math.PI/2;mirror.position.set(0,.092,.0315);mirror.material.transparent=true;mirror.material.depthWrite=false;mirror.renderOrder=2;scene.add(mirror);}
  // Off-axis window projection: the physical display is a fixed glass aperture.
  // Moving the eye changes parallax behind that glass, never the window's corners.
  const camera=new T.PerspectiveCamera(34,1024/600,.25,80);
  const portal={z:7.60,height:4.32,bottom:.675,eyeY:4.46,eyeZ:16.80};
  const eyeTarget=new T.Vector2(),eyeCurrent=new T.Vector2();
  let detailMode=query.get('view')||'window',close=detailMode!=='window';
  if(close)root.classList.add('detail-only');
  let cameraWidth=-1,cameraHeight=-1,cameraClose=null,cameraDetail='',cameraX=NaN,cameraY=NaN;
  function updateCamera(){
    const width=root.clientWidth,height=root.clientHeight;
    if(detailMode!=='cat'&&detailMode!=='customer'&&width===cameraWidth&&height===cameraHeight&&close===cameraClose&&detailMode===cameraDetail&&eyeCurrent.x===cameraX&&eyeCurrent.y===cameraY)return;
    cameraWidth=width;cameraHeight=height;cameraClose=close;cameraDetail=detailMode;cameraX=eyeCurrent.x;cameraY=eyeCurrent.y;
    const aspect=width/height;
    checkout.storefront.visible=close;
    if(close){
      camera.near=.25;camera.clearViewOffset();camera.zoom=1;camera.aspect=aspect;camera.fov=37;
      if(detailMode==='checkout'){camera.fov=43;camera.position.set(-.7,2.6,6.15);camera.lookAt(.65,1.08,4.0);}
      else if(detailMode==='customer'){const a=customers.rigs[0].root.position,yaw=customers.rigs[0].root.rotation.y;camera.fov=40;camera.position.copy(a).add(new T.Vector3(Math.sin(yaw)*2.7-Math.cos(yaw)*.95,1.8,Math.cos(yaw)*2.7+Math.sin(yaw)*.95));camera.lookAt(a.clone().add(new T.Vector3(0,1.08,0)));}
      else if(detailMode==='cat'){const a=cat.root.rotation.y;camera.fov=38;camera.position.copy(cat.root.position).add(new T.Vector3(Math.sin(a)*1.25+Math.cos(a)*.48,.72,Math.cos(a)*1.25-Math.sin(a)*.48));camera.lookAt(cat.root.position.clone().add(new T.Vector3(0,.20,0)));}
      else{
      const anchor=listener.root.position;
      const offset=new T.Vector3(.75,2.30,4.40);
      camera.position.copy(anchor).add(offset);
      camera.lookAt(anchor.clone().add(new T.Vector3(-.48,.92,.22)));
      }
      camera.updateProjectionMatrix();
    }else{
      camera.near=.25;camera.clearViewOffset();camera.zoom=1;camera.aspect=aspect;
      camera.position.set(eyeCurrent.x,portal.eyeY+eyeCurrent.y,portal.eyeZ);
      camera.rotation.set(0,0,0);
      const halfWidth=portal.height*aspect/2,d=portal.eyeZ-portal.z,n=camera.near;
      camera.projectionMatrix.makePerspective((-halfWidth-camera.position.x)*n/d,(halfWidth-camera.position.x)*n/d,(portal.bottom+portal.height-camera.position.y)*n/d,(portal.bottom-camera.position.y)*n/d,n,camera.far);
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    }
    camera.updateMatrixWorld();
  }
  root.addEventListener('pointermove',e=>{const b=root.getBoundingClientRect();eyeTarget.set(((e.clientX-b.left)/b.width-.5)*.40,-((e.clientY-b.top)/b.height-.5)*.16);});
  root.addEventListener('pointerleave',()=>eyeTarget.set(0,0));
  const glass=new T.Mesh(new T.PlaneGeometry(1,1),new T.ShaderMaterial({
    transparent:true,depthWrite:false,uniforms:{uEye:{value:0}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position.z=-gl_Position.w+.0001;}',
    fragmentShader:'varying vec2 vUv;uniform float uEye;void main(){float edge=pow(abs(vUv.x-.5)*2.,22.)*.045;float streak=exp(-pow((vUv.x+vUv.y*.23-.12-uEye*.025)*12.,2.))*.012;gl_FragColor=vec4(.64,.79,.85,edge+streak);}'
  }));glass.position.set(0,portal.bottom+portal.height/2,portal.z);glass.renderOrder=20;scene.add(glass);
  let composer=null,outputPass=null,fxaaPass=null,msaaSamples=gl.getContextAttributes().antialias?gl.getParameter(gl.SAMPLES):0;
  if(!low){
    renderer.toneMapping=T.NoToneMapping;renderer.outputEncoding=T.LinearEncoding;
    scene.background=new T.Color('#0c1826');
    amber.color.multiplyScalar(1.65);
    const colourTarget=new T.WebGLRenderTarget(1024,600,{type:T.HalfFloatType});
    colourTarget.depthTexture=new T.DepthTexture(1024,600,T.UnsignedIntType);
    msaaSamples=renderer.capabilities.isWebGL2?Math.min(4,renderer.capabilities.maxSamples||4):0;
    colourTarget.samples=msaaSamples;
    composer=new T.EffectComposer(renderer,colourTarget);
    // Keep the faceted silhouettes crisp; the scene already has real and contact shadows.
    composer.addPass(new T.RenderPass(scene,camera));
    const bloom=new T.UnrealBloomPass(new T.Vector2(1024,600),.22,.35,.72);composer.addPass(bloom);
    outputPass=new T.ShaderPass({uniforms:{tDiffuse:{value:null},exposure:{value:1.05}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'uniform sampler2D tDiffuse;uniform float exposure;varying vec2 vUv;void main(){vec3 c=texture2D(tDiffuse,vUv).rgb*exposure;c=clamp((c*(2.51*c+.03))/(c*(2.43*c+.59)+.14),0.,1.);c=pow(c,vec3(1./2.2));float l=dot(c,vec3(.2126,.7152,.0722));c+=vec3(-.006,0.,.006)*(1.-l);gl_FragColor=vec4(c,1.);}'
    });composer.addPass(outputPass);
    fxaaPass=new T.ShaderPass(T.FXAAShader);composer.addPass(fxaaPass);
  }
  // Mobile keeps the exact 3D background colour AND depth until the eye or lighting changes.
  // Character, player, rain and glass still render live and are occluded by that cached depth.
  let staticTarget=null,cacheScene=null,cacheCamera=null,cacheMaterial=null;
  let encodedTarget=null,encodeScene=null;
  const previousView=new Float32Array(32);
  const cachedLightSprites=[];
  lights.traverse(o=>{if(o.isSprite)cachedLightSprites.push({object:o,visible:o.visible});});
  if(device&&depthCacheSupported){
    const halfColour=renderer.capabilities.isWebGL2?!!gl.getExtension('EXT_color_buffer_float'):!!(gl.getExtension('EXT_color_buffer_half_float')&&gl.getExtension('OES_texture_half_float_linear'));
    staticTarget=new T.WebGLRenderTarget(1024,600,{type:halfColour?T.HalfFloatType:T.UnsignedByteType,minFilter:T.LinearFilter,magFilter:T.LinearFilter});
    console.log('Miniature background cache: '+(halfColour?'half-float':'8-bit'));
    staticTarget.depthTexture=new T.DepthTexture(1024,600,T.UnsignedIntType);
    cacheScene=new T.Scene();cacheCamera=new T.OrthographicCamera(-1,1,1,-1,0,1);
    encodedTarget=new T.WebGLRenderTarget(1024,600,{minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:false});
    encodeScene=new T.Scene();encodeScene.add(new T.Mesh(new T.PlaneGeometry(2,2),new T.ShaderMaterial({
      uniforms:{tColour:{value:staticTarget.texture}},depthTest:false,depthWrite:false,toneMapped:false,
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:'uniform sampler2D tColour;varying vec2 vUv;void main(){vec4 c=texture2D(tColour,vUv);vec3 rgb=mix(c.rgb*12.92,1.055*pow(max(c.rgb,vec3(0.)),vec3(.416666667))-.055,step(vec3(.0031308),c.rgb));gl_FragColor=vec4(rgb,c.a);}'
    })));
    cacheMaterial=new T.ShaderMaterial({extensions:{fragDepth:true},depthTest:true,depthWrite:true,depthFunc:T.AlwaysDepth,
      uniforms:{tColour:{value:encodedTarget.texture},tDepth:{value:staticTarget.depthTexture}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:'uniform sampler2D tColour;uniform sampler2D tDepth;varying vec2 vUv;void main(){gl_FragColor=texture2D(tColour,vUv);gl_FragDepthEXT=texture2D(tDepth,vUv).r;}'
    });cacheScene.add(new T.Mesh(new T.PlaneGeometry(2,2),cacheMaterial));
  }
  function renderFrame(){
    if(programWarmupPending){
      // Compile the hidden eye/phone/player variants before their first visible
      // animation. Static-room materials keep their separate cached render path.
      renderer.setRenderTarget(null);scene.remove(architecture);
      try{renderer.compile(scene,camera);}finally{scene.add(architecture);}
      programWarmupPending=false;programWarmups++;
    }
    if(!staticTarget){if(composer)composer.render();else renderer.render(scene,camera);return;}
    let changed=staticFrameDirty;
    for(let i=0;i<16;i++)if(Math.abs(previousView[i]-camera.matrixWorld.elements[i])>1e-6||Math.abs(previousView[i+16]-camera.projectionMatrix.elements[i])>1e-6)changed=true;
    if(changed){
      cacheRebuilds++;
      // Generate the lamp/floor shadow including the listener, then retain it with the background.
      renderer.setRenderTarget(staticTarget);renderer.autoClear=true;
      listener.taskLight.shadow.needsUpdate=true;moon.shadow.needsUpdate=true;renderer.shadowMap.needsUpdate=true;
      renderer.render(scene,camera);
      const liveMeshes=[];dynamic.traverse(o=>{if(o.isMesh||o.isPoints||o.isLine){liveMeshes.push([o,o.visible]);o.visible=false;}});
      glass.visible=false;
      renderer.render(scene,camera);
      liveMeshes.forEach(pair=>pair[0].visible=pair[1]);glass.visible=!close;
      // Apply the colour conversion once, instead of to every screen pixel on every frame.
      renderer.setRenderTarget(encodedTarget);renderer.render(encodeScene,cacheCamera);
      for(let i=0;i<16;i++){previousView[i]=camera.matrixWorld.elements[i];previousView[i+16]=camera.projectionMatrix.elements[i];}
      staticFrameDirty=false;
    }
    renderer.setRenderTarget(null);renderer.autoClear=false;renderer.clear(true,true,false);
    renderer.render(cacheScene,cacheCamera);
    const background=scene.background;scene.background=null;architecture.visible=false;
    cachedLightSprites.forEach(item=>{item.object.visible=false;});
    renderer.shadowMap.needsUpdate=false;
    renderer.render(scene,camera);
    cachedLightSprites.forEach(item=>{item.object.visible=item.visible;});architecture.visible=true;scene.background=background;renderer.autoClear=true;
  }
  function resize(){
    const w=root.clientWidth,h=root.clientHeight;updateCamera();
    const renderScale=device?1:low?.8:Math.min(2,2048/w);
    renderer.setPixelRatio(renderScale);renderer.setSize(w,h,false);
    glass.scale.set(portal.height*w/h,portal.height,1);winter.setPixelRatio(renderScale);
    const bufferSize=renderer.getDrawingBufferSize(new T.Vector2());
    if(composer){composer.setSize(bufferSize.x,bufferSize.y);fxaaPass.uniforms.resolution.value.set(1/bufferSize.x,1/bufferSize.y);}
    // The room is drawn only when the view changes: supersample its fine shelf edges.
    if(staticTarget){staticTarget.setSize(bufferSize.x*2,bufferSize.y*2);encodedTarget.setSize(bufferSize.x*2,bufferSize.y*2);staticFrameDirty=true;}
  }
  window.addEventListener('resize',resize);resize();
  if(device){
    // These coordinate frames never move. Keep normal dynamic world updates;
    // only skip the unchanged furniture and lamp hierarchy on live frames.
    scene.updateMatrixWorld(true);
    scene.matrixAutoUpdate=false;dynamic.matrixAutoUpdate=false;
    architecture.matrixAutoUpdate=false;architecture.matrixWorldAutoUpdate=false;
    lights.matrixAutoUpdate=false;lights.matrixWorldAutoUpdate=false;
  }
  renderer.domElement.addEventListener('dblclick',()=>{close=false;root.classList.remove('detail-only');eyeTarget.set(0,0);eyeCurrent.set(0,0);resize();window.dispatchEvent(new CustomEvent('roomviewchange',{detail:false}));});
  let external=device,playing=false,energy=0,bass=0,lastBeat=0,beatPulse=0,previousBass=0,averageBass=.12,night=true;
  let musicTime=0,worldTime=4,rhythmPhase=0,beatSeconds=60/86,lastTime=performance.now(),frame=0,frames=0,fps=0,smoothEnergy=.2;
  let lastAudio=0,updateCpuMs=0,renderCpuMs=0;
  const debug=document.getElementById('debug');
  function frameLoop(now){
    requestAnimationFrame(frameLoop);
    if(document.hidden){lastTime=now;return;}
    if(low&&!device&&now-lastTime<32)return;
    const workStart=performance.now();
    const dt=Math.max(0,Math.min((now-lastTime)/1000,.05));lastTime=now;worldTime+=dt;if(playing)musicTime+=dt;frame++;frames++;
    if(external&&now-lastAudio>1600){energy=0;bass=0;}
    if(playing)rhythmPhase+=dt*Math.PI*2/beatSeconds;
    const phase=rhythmPhase;
    const level=playing?(external?energy:.28+Math.pow(Math.max(0,Math.cos(phase)),8)*.3):0;
    smoothEnergy+=(level-smoothEnergy)*Math.min(1,dt*9);beatPulse*=Math.exp(-dt*7);
    listenerLife.update(worldTime,dt,smoothEnergy,phase);wallDetails.update(worldTime,dt);
    const doorRequested=customers.update(worldTime,dt);winter.update(worldTime,dt,false);checkout.update(worldTime,dt,doorRequested,customers.rigs);cat.update(worldTime,dt);
    if(playing)platters.forEach(p=>p.rotation.y-=dt*3.49);
    meters.forEach((m,i)=>m.rotation.z=.55-(smoothEnergy*.9+Math.sin(phase*2+i)*.04)*1.25);
    if(mirror)mirror.material.uniforms.uTime.value=worldTime;
    eyeCurrent.lerp(eyeTarget,Math.min(1,dt*3));updateCamera();glass.visible=!close;glass.material.uniforms.uEye.value=eyeCurrent.x;renderer.info.reset();
    const renderStart=performance.now();updateCpuMs+=(renderStart-workStart-updateCpuMs)*.05;
    renderFrame();renderCpuMs+=(performance.now()-renderStart-renderCpuMs)*.05;
    if(frame===2){document.getElementById('loading').classList.add('done');document.getElementById('loading').setAttribute('aria-hidden','true');window.dispatchEvent(new Event('roomready'));}
    if(debug&&frame%15===0)debug.textContent=`${fps} fps · ${renderer.info.render.calls} calls · ${Math.round(renderer.info.render.triangles/1000)}k triangles · ${external?'PCM':'DEMO'} · ${playing?'PLAY':'PAUSE'}`;
  }
  setInterval(()=>{fps=frames;frames=0},1000);requestAnimationFrame(frameLoop);
  if(query.get('debug')==='1'&&debug)debug.hidden=false;
  window.ListeningRoom={
    setWeather(payload){return wallDetails.setWeather(payload.forecast||payload,!!payload.cached);},
    setPlaying(value){const next=!!value;if(playing===next)return;playing=next;listenerLife.setMusicRequested(next);listener.taskLight.shadow.needsUpdate=true;renderer.shadowMap.needsUpdate=true;},
    setObserver(x,y){eyeTarget.set((T.MathUtils.clamp(x,0,1)-.5)*.40,-(T.MathUtils.clamp(y,0,1)-.5)*.16);if(device)eyeCurrent.copy(eyeTarget);},
    invalidateFrame(){staticFrameDirty=true;},
    setAudio(value,lowBand){external=true;lastAudio=performance.now();energy=T.MathUtils.clamp(Number(value)||0,0,1);bass=T.MathUtils.clamp(Number(lowBand)||0,0,1);
      averageBass+=(bass-averageBass)*.055;
      if(bass>Math.max(.08,averageBass*1.10)&&bass-previousBass>.012&&lastAudio-lastBeat>230){const interval=(lastAudio-lastBeat)/1000;if(interval>.30&&interval<1.20)beatSeconds=beatSeconds*.85+interval*.15;beatPulse=Math.min(1,.35+bass);lastBeat=lastAudio;}
      previousBass=bass;
    },
    useDemo(){external=false;beatPulse=0;},
    updateFromPCM(value,spectrum){const b=spectrum||[];let lowBand=0;for(let i=0;i<Math.min(3,b.length);i++)lowBand+=b[i];this.setAudio(value,lowBand/Math.max(1,Math.min(3,b.length)));},
    setNight(value){night=!!value;scene.background.set(night?'#0c1826':'#617e8f');if(low)scene.background.convertLinearToSRGB();scene.fog.color.set(night?'#142332':'#617e8f');hemi.intensity=night?.35:1.00;moon.intensity=night?.18:1.15;listener.taskLight.intensity=night?3.6:1.7;warmLights.forEach(l=>l.intensity=l.userData.baseIntensity*(night?1:.65));if(outputPass)outputPass.uniforms.exposure.value=night?1.05:1.15;winter.setNight(night);renderer.shadowMap.needsUpdate=true;staticFrameDirty=true;},
    setDetail(value){detailMode=value;close=value!=='window';root.classList.remove('detail-only');resize();},
    setClose(value){detailMode=value?'listener':'window';close=!!value;root.classList.remove('detail-only');resize();},
    resetView(){detailMode='window';close=false;root.classList.remove('detail-only');eyeTarget.set(0,0);eyeCurrent.set(0,0);resize();},
    framing(){updateCamera();return framingTargets.map(item=>{let points;if(item.object){const b=item.bounds;points=[];for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])points.push(new T.Vector3(x,y,z));}else points=[new T.Vector3(item.x,item.y,item.z)];const p=points.map(v=>v.project(camera));return{name:item.name,left:(Math.min(...p.map(v=>v.x))+1)/2,right:(Math.max(...p.map(v=>v.x))+1)/2};});},
    captureFrame(){updateCamera();renderer.info.reset();renderFrame();return renderer.domElement.toDataURL('image/png');},
    motionInspection(){return{customers:customers.inspect(),navigation:navigation.obstacles(),cat:cat.stats(),listener:listenerLife.stats()};},
    advanceAmbient(seconds){const count=Math.ceil(seconds*30),dt=seconds/count;for(let i=0;i<count;i++){worldTime+=dt;const doorRequested=customers.update(worldTime,dt);winter.update(worldTime,dt,false);checkout.update(worldTime,dt,doorRequested,customers.rigs);cat.update(worldTime,dt);listenerLife.update(worldTime,dt,smoothEnergy,rhythmPhase);wallDetails.update(worldTime,dt);}staticFrameDirty=true;return this.motionInspection();},
    stats(){return{fps,performance:{updateMs:Number(updateCpuMs.toFixed(2)),renderMs:Number(renderCpuMs.toFixed(2)),cacheRebuilds,programWarmups,vertexReuse},drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,textures:renderer.info.memory.textures,geometries:renderer.info.memory.geometries,playing,externalAudio:external,energy,beatPulse,headPitch:head.rotation.x,headYaw:head.rotation.y,bodyRoll:torso.rotation.z,footSwing:feet[0].rotation.y,shoppers:customers.stats(),cat:cat.stats(),winter:winter.stats(),checkout:checkout.stats(),listener:listenerLife.stats(),wall:wallDetails.stats(),antialiasing:{msaa:msaaSamples,fxaa:!!fxaaPass},gpu:{webgl2:renderer.capabilities.isWebGL2,maxSamples:renderer.capabilities.maxSamples},targetFps:device?60:low?30:60,backgroundSize:staticTarget?[staticTarget.width,staticTarget.height]:null,simulationSize,renderSize:[renderer.domElement.width,renderer.domElement.height],platterAngle:platters[0].rotation.y,night,view:close?detailMode:'window',eye:[eyeCurrent.x,eyeCurrent.y],quality:device?'native':low?'low':'standard',size:[root.clientWidth,root.clientHeight]};}
  };
})();
