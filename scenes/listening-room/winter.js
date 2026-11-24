/* Winter set dressing and live weather/fire. All dimensions are scene-space metres.
 * Snow exists beyond the shop walls; the hearth and customers remain real 3D objects.
 */
(function(){
  'use strict';
  window.createWinterRoom=function(ctx){
    const {T,scene,architecture,dynamic,lights,material,group,box,cylinder,sphere,rod,tube,torus,plane,canvasTexture,listener,random,batch,backWall,legacyDoorParts,solid}=ctx;
    const W={stone:material('#666259'),mortar:material('#3e4642'),iron:material('#343d3d'),wood:material('#694731'),
      snow:material('#c8d9df',1),snowShade:material('#8aa8b9',1),pine:material('#345b50'),pineLight:material('#4b7060'),
      cloth:material('#914f48'),cream:material('#c7bca3'),brass:material('#ab9060',.55,.24)};
    const live=group(dynamic),staticRoot=group(architecture);
    const bulbMat=new T.MeshBasicMaterial({color:new T.Color('#ffe5ae').multiplyScalar(1.7),toneMapped:false});
    // Snowbanks beyond the side windows and a softly snow-covered entry pavement.
    for(const side of [-1,1]){
      box(4.3,.14,15,W.snowShade,side*6.42,.03,-.5,staticRoot,.025);
      for(let i=0;i<7;i++){
        const radius=.38+random()*.32,depth=.40+random()*.30;
        let x=4.55+random()*.8;
        if(side>0)x=Math.max(x,4.42+radius);
        sphere(radius,.12,depth,W.snow,side*x,.12,.3+i*1.0,staticRoot,10);
      }
      if(side<0)for(const section of [[1.62,2.04],[3.78,2.04],[5.967,2.02]])box(.28,.095,section[1],W.snow,side*4.29,.46,section[0],staticRoot,.035);
      for(const z of [.2,3.2,5.8]){
        const x=side*(5.35+random()*.45),h=1.55+random()*.55;
        cylinder(.055,.075,h*.45,W.wood,x,h*.23,z,staticRoot,8);
        for(let j=0;j<3;j++){
          const radius=.57-j*.12,cy=.62+j*.42;
          cylinder(.03,radius,.78,W.pine,x,cy,z,staticRoot,7);
          cylinder(.015,radius*.86,.61,W.snow,x,cy+.14,z,staticRoot,7);
        }
      }
    }
    box(11.4,.16,4.6,W.snowShade,0,.025,-9.75,staticRoot,.025);
    for(let i=0;i<11;i++)box(.09,.85,.08,W.wood,-5+i,.50,-10.7,staticRoot,.008);
    box(10.8,.065,.075,W.wood,0,.78,-10.7,staticRoot);box(10.8,.065,.075,W.wood,0,.37,-10.7,staticRoot);
    // A real opening in the rear wall allows the two shoppers to enter and leave.
    if(backWall)backWall.parent.remove(backWall);
    legacyDoorParts.forEach(o=>o.parent.remove(o));
    const wall=material('#3b4b4b');
    solid(box(6.98,5.2,.18,wall,-.83,2.64,-7.668,staticRoot),'后墙');
    solid(box(.42,5.2,.18,wall,4.11,2.64,-7.668,staticRoot),'后墙');
    box(1.24,2.05,.18,wall,3.28,4.215,-7.668,staticRoot);
    for(const x of [2.65,3.91])solid(box(.075,3.23,.15,material('#788478'),x,1.69,-7.53,staticRoot,.01),'入口门框');
    box(1.34,.08,.15,material('#788478'),3.28,3.30,-7.53,staticRoot,.01);
    const door=group(live,3.865,.10,-7.545);
    box(1.16,.86,.07,material('#485e5c'),-.58,.46,0,door,.012);
    for(const x of [-1.125,-.035])box(.07,3.0,.08,material('#637a75'),x,1.50,0,door,.008);
    box(1.16,.07,.08,material('#637a75'),-.58,2.965,0,door,.008);
    box(1.04,2.05,.018,new T.MeshStandardMaterial({color:'#729cae',transparent:true,opacity:.22,roughness:.2,depthWrite:false}),-.58,1.92,0,door);
    box(.035,.23,.045,W.brass,-1.01,1.18,.065,door,.01);
    // Evergreen wreath, warm string lights and a winter scarf on the coat stand.
    const wreath=torus(.27,.063,W.pine,-.58,2.03,.069,door);wreath.scale.y=1.08;
    for(let i=0;i<12;i++){const a=i/12*Math.PI*2;const l=sphere(.075,.13,.035,i%2?W.pine:W.pineLight,-.58+Math.cos(a)*.27,2.03+Math.sin(a)*.285,.11,door,6);l.rotation.z=-a;}
    box(.12,.075,.035,W.cloth,-.58,1.73,.12,door,.01);
    for(const side of [-1,1]){const tail=box(.075,.20,.025,W.cloth,-.58+side*.06,1.63,.12,door,.008);tail.rotation.z=side*.25;}
    const bell=group(live,3.20,3.16,-7.35);cylinder(.03,.08,.10,W.brass,0,0,0,bell,12);
    sphere(.025,.025,.025,W.brass,0,-.065,0,bell,8);
    tube([[-2.58,2.90,-7.17],[-1.25,2.76,-7.17],[0,2.70,-7.17],[1.25,2.76,-7.17],[2.58,2.90,-7.17]],.009,W.iron,staticRoot);
    for(let i=0;i<11;i++){const x=-2.45+i*.49,y=2.70+.20*Math.pow(x/2.5,2);sphere(.028,.044,.028,bulbMat,x,y-.038,-7.17,staticRoot,8);}
    box(.16,.72,.04,material('#a08c65'),-.95,.58,.08,door,.012);
    box(.17,.035,.045,W.cream,-.95,.235,.09,door,.003);
    // Low stone fireplace just behind the listener's right side.
    const hearth=group(staticRoot,3.73,.08,1.40);
    box(1.17,.14,.88,W.stone,0,.07,.13,hearth,.025);
    box(.92,1.33,.32,W.mortar,0,.78,-.12,hearth,.013);
    for(const side of [-1,1])box(.18,1.38,.61,W.stone,side*.46,.81,.02,hearth,.014);
    box(1.20,.12,.70,material('#86735a'),0,1.55,.035,hearth,.018);
    box(.87,3.59,.36,W.stone,0,3.33,-.13,hearth,.014);
    for(let i=0;i<16;i++)box(.88,.012,.014,W.mortar,0,1.67+i*.23,.057,hearth);
    for(let i=0;i<14;i++)box(.012,.19,.014,W.mortar,(i%2?.20:-.20),1.78+i*.23,.064,hearth);
    box(.77,.80,.025,material('#161c1d'),0,.76,.062,hearth,.01);
    solid(hearth,'壁炉');
    const logs=group(staticRoot,3.73,.08,1.40);
    for(let i=0;i<3;i++){
      const log=cylinder(.075,.075,.68,W.wood,0,.31+i*.045,.16+(i-1)*.10,logs,10);log.rotation.z=Math.PI/2;log.rotation.y=(i-1)*.18;
      for(const side of [-1,1]){const end=cylinder(.066,.066,.008,material('#9c7448'),side*.34,.31+i*.045,.16+(i-1)*.10,logs,10);end.rotation.z=Math.PI/2;}
    }
    for(let i=0;i<4;i++)rod([3.38+i*.235,.24,1.77],[3.38+i*.235,.47,1.77],.015,W.iron,staticRoot);
    rod([3.35,.47,1.77],[4.11,.47,1.77],.018,W.iron,staticRoot);
    const fireMaterial=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,uniforms:{uTime:{value:0}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`varying vec2 vUv;uniform float uTime;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
        void main(){vec2 uv=vUv;float n=noise(vec2(uv.x*8.,uv.y*8.-uTime*2.0));float alpha=0.;float core=0.;
        for(int i=0;i<3;i++){float f=float(i);float h=.72+sin(uTime*1.5+f*2.2)*.10+(i==1?.13:0.);float y=uv.y/h;
        float centre=.23+f*.27+sin(uv.y*7.-uTime*2.+f)*.045;float x=abs(uv.x-centre);float edge=(1.-y)*.17+.018-x+(n-.5)*.07;
        float tongue=smoothstep(-.018,.018,edge)*(1.-smoothstep(.82,1.,y))*smoothstep(0.,.025,uv.y);alpha=max(alpha,tongue);core=max(core,clamp(1.-x/.17,0.,1.)*(1.-uv.y*.8));}
        vec3 color=mix(vec3(1.2,.11,.008),vec3(1.55,.62,.055),core);color=mix(color,vec3(1.7,1.10,.22),pow(core,12.)*.35);gl_FragColor=vec4(color,alpha*.88);}`
    });
    const fire=plane(.74,.87,fireMaterial,3.73,.83,1.66,live);
    const fireLight=new T.PointLight('#ffab59',.95,3.7,1.4);fireLight.position.set(3.67,.84,1.98);lights.add(fireLight);
    // Log basket next to the hearth and a softly lit candle on the mantel.
    const basket=group(staticRoot);
    box(.40,.16,.50,material('#635442'),4.03,.17,2.24,basket,.012);
    for(let i=0;i<5;i++){const log=cylinder(.052,.052,.40,W.wood,3.90+(i%2)*.12,.29+Math.floor(i/2)*.09,2.24,basket,8);log.rotation.x=Math.PI/2;}
    solid(basket,'木柴筐');
    cylinder(.055,.055,.15,W.cream,3.43,1.75,1.41,staticRoot,12);
    sphere(.018,.037,.017,bulbMat,3.43,1.86,1.41,staticRoot,8);
    // Wool throw over the wooden chair arm; its woven checks are a surface texture.
    const plaid=canvasTexture(256,256,(c,w,h)=>{
      c.fillStyle='#87524c';c.fillRect(0,0,w,h);
      for(let i=0;i<8;i++){c.fillStyle='#bc9e7c77';c.fillRect(i*32,0,7,h);c.fillRect(0,i*32,w,7);c.fillStyle='#433f3c60';c.fillRect(i*32+11,0,3,h);c.fillRect(0,i*32+11,w,3);}
    });
    const blanket=new T.MeshStandardMaterial({map:plaid,roughness:1,side:T.DoubleSide});
    const throwTop=plane(.23,.62,blanket,.47,1.012,.03,listener.chair);throwTop.rotation.x=-Math.PI/2;
    const throwSide=plane(.61,.43,blanket,.586,.80,.03,listener.chair);throwSide.rotation.y=Math.PI/2;
    for(let i=0;i<11;i++)rod([.586,.585,-.25+i*.055],[.586,.53,-.25+i*.055],.005,W.cream,listener.chair);
    // Snow is generated only outdoors, so flakes cannot pass through the listener or shelves.
    const count=ctx.low?850:1800,offsets=[],phases=[],sizes=[];
    for(let i=0;i<count;i++){
      let x,z;do{x=(random()-.5)*18;z=(random()-.5)*22;}while((Math.abs(x)<4.55&&z>-8.0)||z>6.5);
      offsets.push(x,0,z);phases.push(random());sizes.push(.70+random()*.8);
    }
    const snowGeo=new T.BufferGeometry();snowGeo.setAttribute('position',new T.Float32BufferAttribute(offsets,3));snowGeo.setAttribute('aPhase',new T.Float32BufferAttribute(phases,1));snowGeo.setAttribute('aSize',new T.Float32BufferAttribute(sizes,1));
    const snowMat=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uTime:{value:0},uPixelRatio:{value:1}},
      vertexShader:'attribute float aPhase;attribute float aSize;uniform float uTime;uniform float uPixelRatio;varying float a;void main(){vec3 p=position;float t=fract(aPhase-uTime*(.033+aPhase*.024));p.y=.13+t*7.;p.x+=sin(uTime*.4+aPhase*32.)*.24;p.z+=cos(uTime*.27+aPhase*12.)*.11;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(60.*aSize*uPixelRatio/-mv.z,1.6,5.8*uPixelRatio);a=.45+aPhase*.45;}',
      fragmentShader:'varying float a;void main(){float d=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(.80,.89,.96,(1.-smoothstep(.35,1.,d))*a);}'
    });const snow=new T.Points(snowGeo,snowMat);snow.frustumCulled=false;live.add(snow);
    // Keep the dynamic door and fire separate from the room's merged static geometry.
    batch(door);batch(bell);
    let doorAmount=0,lastDoor=false,night=true;
    return {live,snow,fire,door,fireLight,hearth,
      update(time,dt,doorRequested){
        fireMaterial.uniforms.uTime.value=time;snowMat.uniforms.uTime.value=time;
        fireLight.intensity=(night?.91:.66)+Math.sin(time*3.1)*.07+Math.sin(time*7.7)*.035;
        doorAmount=0;door.rotation.y=0;
        bell.rotation.z=0;
        lastDoor=false;
      },
      setNight(value){night=!!value;},
      setPixelRatio(value){snowMat.uniforms.uPixelRatio.value=value;},
      stats(){return{snowflakes:count,fire:true,doorOpen:false,rearDoor:true};}
    };
  };
})();
