/* Reading, coffee and listening share one continuous prop/arm rig.
 * A new audio intent is remembered while an existing transition finishes. */
(function(){
  'use strict';
  window.createListenerLife=function(ctx){
    const {T,listener,material,group,box,cylinder,sphere,torus,plane,canvasTexture}=ctx;
    const {root,torso,head,feet,headphones}=listener;
    const BOOK_HOME=[1.03,.877,.72],CUP_HOME=[1.25,.86,.49],HP_HOME=[-.66,.21,.04];
    // The rear edge rests on the crossed thigh; the page normal tilts toward
    // the reader (-Z), rather than presenting the spread to the front camera.
    const BOOK_READ=[0,1.06,.53],HP_FRONT=[0,1.04,.62],HP_ABOVE=[0,1.83,.20];
    const paper=material('#ded3b7',.96),cover=material('#486060',.92),edge=material('#bdaf90',.96);
    const coffeeTable=group(root,1.03,0,.70);
    cylinder(.42,.43,.055,material('#92754e',.84),0,.825,0,coffeeTable,24);
    cylinder(.40,.40,.032,material('#695039',.9),0,.784,0,coffeeTable,24);
    for(const angle of [0,Math.PI*2/3,Math.PI*4/3]){
      const leg=box(.065,.77,.065,material('#765b3d',.86),Math.sin(angle)*.25,.39,Math.cos(angle)*.25,coffeeTable,.008);
      leg.rotation.z=-Math.sin(angle)*.09;leg.rotation.x=Math.cos(angle)*.09;
    }
    const book=group(root),leftLeaf=group(book),rightLeaf=group(book),turnLeaf=group(book);
    function pageTexture(right){return canvasTexture(256,384,(c,w,h)=>{
      c.fillStyle='#e4dac0';c.fillRect(0,0,w,h);c.fillStyle='#576360';
      c.font='bold 22px Georgia';c.textAlign='center';c.fillText(right?'WINTER NOTES':'SLOW LIVING',w/2,40);
      if(!right){c.fillStyle='#b0ab8e';c.fillRect(32,65,192,92);c.fillStyle='#65776d';c.beginPath();c.moveTo(40,147);c.lineTo(92,82);c.lineTo(122,126);c.lineTo(170,90);c.lineTo(218,148);c.fill();}
      c.fillStyle='#98947e';for(let i=0;i<(right?17:11);i++)c.fillRect(28,(right?73:185)+i*15,185-(i%5)*11,3);
      c.font='12px Georgia';c.fillText(right?'25':'24',w/2,h-18);
    });}
    const pages=[false,true].map(v=>new T.MeshStandardMaterial({map:pageTexture(v),roughness:1,side:T.DoubleSide}));
    for(const side of [-1,1]){
      const leaf=side<0?leftLeaf:rightLeaf,x=side*.17;
      box(.342,.017,.46,cover,x,-.015,0,leaf,.004);
      box(.318,.023,.435,paper,x,.007,0,leaf,.003);
      for(let i=0;i<3;i++)box(.31,.002,.437,edge,x,-.001+i*.007,0,leaf);
      const page=plane(.308,.416,pages[side<0?0:1],x,.021,0,leaf);page.rotation.set(-Math.PI/2,0,Math.PI);
    }
    box(.025,.055,.465,cover,-.005,.008,0,book,.003);
    const turningPage=plane(.310,.416,pages[1],.155,.0,0,turnLeaf);turningPage.rotation.set(-Math.PI/2,0,Math.PI);turnLeaf.position.y=.030;
    const cup=group(root);
    const ceramic=material('#ddc7a4',.77),coffee=material('#493424',.65);
    cylinder(.079,.058,.165,ceramic,0,.083,0,cup,18);
    const rim=torus(.074,.009,ceramic,0,.170,0,cup);rim.rotation.x=Math.PI/2;
    cylinder(.066,.066,.006,coffee,0,.161,0,cup,18);
    // The right hand approaches the mug from the character's right (positive X).
    // Keep the handle on that side so the fingers wrap toward the cup instead of
    // reaching through it from the opposite side.
    const handle=torus(.047,.011,ceramic,.097,.095,0,cup);
    // A vertical XY loop joins the right side of the mug. Turning it around Y
    // would leave a sideways hoop floating beside the ceramic body.
    const CUP_WRIST=[.185,.185,0];
    // Local hand +Z points down, and its palm normal (+Y) faces the mug (-X).
    const cupGripRotation=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(
      new T.Vector3(0,0,1),new T.Vector3(-1,0,0),new T.Vector3(0,-1,0)));
    const saucer=cylinder(.12,.105,.015,ceramic,CUP_HOME[0],.852,CUP_HOME[2],root,20);
    const steam=group(root),steamGeo=new T.BufferGeometry();
    steamGeo.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(21),3));
    steamGeo.setAttribute('aPhase',new T.Float32BufferAttribute([0,.14,.28,.42,.56,.70,.84],1));
    const steamMat=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uTime:{value:0}},
      vertexShader:'attribute float aPhase;uniform float uTime;varying float a;void main(){float t=fract(aPhase+uTime*.18);vec3 p=vec3(sin(t*7.+aPhase*8.)*.035,t*.34,cos(t*6.+aPhase)*.016);vec4 v=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*v;gl_PointSize=clamp((12.+t*23.)/-v.z,1.5,7.);a=sin(t*3.14159)*.24;}',
      fragmentShader:'varying float a;void main(){float r=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(.90,.90,.86,(1.-smoothstep(.1,1.,r))*a);}'
    });const vapor=new T.Points(steamGeo,steamMat);vapor.frustumCulled=false;steam.add(vapor);
    const steamRibbon=new T.Mesh(new T.PlaneGeometry(.16,.36),new T.ShaderMaterial({
      transparent:true,depthWrite:false,side:T.DoubleSide,uniforms:steamMat.uniforms,
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'uniform float uTime;varying vec2 vUv;void main(){float centre=.5+sin(vUv.y*9.-uTime*1.5)*.16;float w=exp(-pow((vUv.x-centre)*13.,2.));float a=w*sin(vUv.y*3.14159)*.28;gl_FragColor=vec4(.92,.91,.86,a);}'
    }));steamRibbon.position.y=.17;steam.add(steamRibbon);
    const cableGeo=new T.BufferGeometry(),cablePoints=new Float32Array(18*3);cableGeo.setAttribute('position',new T.BufferAttribute(cablePoints,3));
    const cable=new T.Line(cableGeo,new T.LineBasicMaterial({color:'#26302d'}));cable.frustumCulled=false;root.add(cable);
    const hook=group(listener.chair);
    box(.19,.035,.035,material('#8f7950',.57,.22),-.55,.98,.04,hook,.004);
    box(.025,.065,.035,material('#8f7950',.57,.22),-.64,1.01,.04,hook,.004);

    const neutral={torsoPos:[0,.84,.025],torsoRot:[-.115,0,.025]};
    const lean={torsoPos:[.18,.84,.12],torsoRot:[.03,0,-.26]};
    const coffeeLean={torsoPos:[.28,.84,.14],torsoRot:[.03,0,-.31]};
    const restL=[-.34,1.04,.29],restR=[.40,1.05,.29],playerHand=[-.88,1.31,.41];
    function clone(p){const q={};Object.keys(p).forEach(k=>q[k]=Array.isArray(p[k])?p[k].slice():p[k]);return q;}
    function base(){return Object.assign({headRot:[.32,-.025,-.020],left:restL.slice(),right:restR.slice(),leftRot:[0,0,0],rightRot:[0,0,0],
      bookPos:BOOK_READ.slice(),bookRot:[-.20,0,0],bookClose:0,bookCarry:0,bookL:1,bookR:1,page:0,pageLeft:0,pageReach:0,
      cupPos:CUP_HOME.slice(),cupRot:[0,0,0],cupR:0,sip:0,
      hpPos:HP_HOME.slice(),hpRot:[0,0,0],hpL:0,hpR:0,hpBand:0,wear:0,power:0,listen:0},clone(neutral));}
    function changed(p,values){return Object.assign(clone(p),values);}
    function blend(a,b,t){const p={};for(const k of Object.keys(a)){if(Array.isArray(a[k]))p[k]=a[k].map((v,i)=>v+(b[k][i]-v)*t);else p[k]=a[k]+(b[k]-a[k])*t;}return p;}
    const clamp=v=>Math.max(0,Math.min(1,v)),ease=v=>{v=clamp(v);return v*v*(3-2*v);};
    const read=base();
    const closed=changed(read,{bookClose:1,bookL:0,bookCarry:1});
    const placed=changed(closed,Object.assign({bookPos:BOOK_HOME.slice(),bookRot:[0,0,0],headRot:[.14,-.28,0]},lean));
    const resting=changed(placed,Object.assign({bookR:0,bookL:0,headRot:[.10,-.12,0]},neutral));
    // Coffee is an activity within reading: the open book stays on the lap,
    // supported by the left hand, while the right hand collects the cup.
    const coffeeReady=changed(read,{bookR:0,right:restR.slice(),headRot:[.22,-.12,0]});
    const cupReach=changed(coffeeReady,Object.assign({cupR:1,headRot:[.15,-.28,0]},coffeeLean));
    const cupHold=changed(cupReach,Object.assign({cupPos:[.34,1.29,.40],cupRot:[-.10,0,.03],headRot:[.27,-.035,-.01]},neutral));
    const leftPageReady=changed(cupHold,{pageLeft:1,pageReach:1});
    const leftPageFinished=changed(leftPageReady,{page:1,pageReach:0});
    const cupSip=changed(cupHold,{cupPos:[.04,1.52,.35],cupRot:[-.52,0,.04],headRot:[.065,0,0],sip:1});
    const listening=changed(resting,{headRot:[.025,-.20,-.055],wear:1,hpPos:HP_ABOVE.slice(),hpR:1,left:playerHand.slice(),leftRot:[-.10,-Math.PI/2,0],power:1,listen:1});
    let pose=clone(read),mode='reading',action='reading',wanted=false,queue=[],current=null,elapsed=0,idleTime=0,transitionCount=0;

    function startSequence(nextMode,steps){mode=nextMode;queue=steps;current=null;elapsed=0;transitionCount++;nextStep();}
    function nextStep(){
      if(!queue.length){current=null;mode=mode==='to-music'?'listening':'reading';action=mode;idleTime=0;pose=clone(mode==='listening'?listening:read);return;}
      const next=queue.shift();current={name:next[0],duration:next[1],from:clone(pose),to:clone(next[2])};action=current.name;elapsed=0;
    }
    function enterMusic(){
      const steps=[];let p=clone(pose);
      p=changed(p,{cupPos:CUP_HOME.slice(),cupRot:[0,0,0],page:p.page>.01?1:0,pageReach:0,sip:0});
      if(p.cupR>.05)Object.assign(p,coffeeLean);steps.push(['set-down-coffee',p.cupR>.05?1.4:.35,p]);
      const held=p.bookL+p.bookR>.2||Math.abs(p.bookPos[0]-BOOK_HOME[0])>.25;
      if(held){
        p=changed(p,Object.assign({cupR:0,bookClose:1,bookL:1,bookR:1,bookCarry:0,pageLeft:0,pageReach:0},neutral));steps.push(['close-book',1.35,p]);
        p=changed(p,{bookL:0,bookCarry:1});steps.push(['hold-book-spine',.65,p]);
        p=clone(placed);steps.push(['place-book-on-table',1.8,p]);
      }
      p=clone(resting);steps.push(['release-book',.65,p]);
      p=changed(p,{hpL:1,hpBand:1,headRot:[.12,.24,0],torsoPos:[-.06,.84,.025],torsoRot:[-.06,0,.10]});steps.push(['reach-headphones',1.1,p]);
      p=changed(p,Object.assign({hpPos:HP_FRONT.slice(),hpR:1,hpBand:0,headRot:[.025,0,0]},neutral));steps.push(['lift-headphones',1.25,p]);
      p=changed(p,{hpPos:HP_ABOVE.slice()});steps.push(['raise-headphones',1.15,p]);
      p=changed(p,{wear:1});steps.push(['put-on-headphones',1.25,p]);
      steps.push(['adjust-headphones',.7,p]);
      p=changed(p,{hpL:0,left:playerHand.slice(),leftRot:[-.10,-Math.PI/2,0]});steps.push(['reach-player',1.05,p]);
      p=changed(p,{left:[-.91,1.285,.41],power:1});steps.push(['switch-player-on',.8,p]);
      steps.push(['settle-into-music',.7,clone(listening)]);startSequence('to-music',steps);
    }
    function enterReading(){
      const steps=[];let p=changed(listening,{listen:0,headRot:[.025,0,0]});
      steps.push(['reach-player',.65,p]);p=changed(p,{left:[-.91,1.285,.41],power:0});steps.push(['switch-player-off',.8,p]);
      p=changed(p,{hpL:1,hpBand:0});steps.push(['hold-headphones',.9,p]);
      p=changed(p,{wear:0,hpPos:HP_ABOVE.slice()});steps.push(['take-off-headphones',1.25,p]);
      p=changed(p,{hpPos:HP_FRONT.slice()});steps.push(['lower-headphones',1.2,p]);
      p=changed(p,{hpPos:HP_HOME.slice(),hpBand:1,hpR:0,torsoPos:[-.06,.84,.025],torsoRot:[-.06,0,.10]});steps.push(['hang-headphones',1.5,p]);
      p=clone(resting);steps.push(['release-headphones',.7,p]);
      steps.push(['reach-book',1.1,clone(placed)]);steps.push(['lift-book',1.6,clone(closed)]);
      steps.push(['open-book',1.5,clone(read)]);startSequence('to-reading',steps);
    }
    function idle(t){
      t%=48;
      if(t<25){const p=clone(read);if(t>=14&&t<17)p.page=(t-14)/3;return{pose:p,action:p.page?'turn-page':'reading'};}
      if(t<25.8)return{pose:blend(read,coffeeReady,ease((t-25)/.8)),action:'free-right-hand'};
      if(t<27)return{pose:blend(coffeeReady,cupReach,ease((t-25.8)/1.2)),action:'reach-coffee'};
      if(t<28.6)return{pose:blend(cupReach,cupHold,ease((t-27)/1.6)),action:'lift-coffee'};
      if(t<29.3)return{pose:blend(cupHold,leftPageReady,ease((t-28.6)/.7)),action:'reach-page-with-left-hand'};
      if(t<32){const p=clone(leftPageReady);p.page=(t-29.3)/2.7;return{pose:p,action:'turn-page-with-coffee'};}
      if(t<32.6)return{pose:blend(changed(leftPageReady,{page:1}),leftPageFinished,ease((t-32)/.6)),action:'settle-page'};
      if(t<33.6)return{pose:blend(cupHold,cupSip,ease((t-32.6)/1)),action:'raise-coffee-to-lips'};
      if(t<35.7)return{pose:clone(cupSip),action:'sip-coffee'};
      if(t<37.3)return{pose:blend(cupSip,cupReach,ease((t-35.7)/1.6)),action:'lower-coffee'};
      if(t<38.1)return{pose:blend(cupReach,coffeeReady,ease((t-37.3)/.8)),action:'release-coffee'};
      if(t<39)return{pose:blend(coffeeReady,read,ease((t-38.1)/.9)),action:'return-hand-to-book'};
      const p=clone(read);if(t>44&&t<47)p.page=(t-44)/3;return{pose:p,action:p.page?'turn-page':'reading'};
    }
    const v=new T.Vector3(),headPos=new T.Vector3(),headQuat=new T.Quaternion(),headScale=new T.Vector3(),headMatrix=new T.Matrix4(),inverse=new T.Matrix4();
    const targetQuat=new T.Quaternion(),cupHandQuat=new T.Quaternion(),euler=new T.Euler();
    const left=new T.Vector3(),right=new T.Vector3(),pointScratch=new T.Vector3(),ear=new T.Vector3(),plug=new T.Vector3(-1.01,1.18,.40);
    const lr=[0,0,0],rr=[0,0,0];
    // All source matrices are refreshed once below. Preserve the original
    // local -> world -> root operation order without refreshing ancestors per point.
    function rootPoint(object,x,y,z,out=pointScratch){return out.set(x,y,z).applyMatrix4(object.matrixWorld).applyMatrix4(inverse);}
    function mixPoint(target,point,weight){target.lerp(point,clamp(weight));}
    function apply(time,level,phase){
      const p=pose,motion=p.listen*Math.min(1,level*2.7),sway=Math.sin(phase*.25);
      torso.position.set(...p.torsoPos);torso.rotation.set(...p.torsoRot);head.rotation.set(...p.headRot);
      torso.position.x+=sway*.010*motion;torso.rotation.z+=Math.sin(phase*.25-.25)*.025*motion;torso.rotation.y+=Math.sin(phase*.25-.45)*.015*motion;
      head.rotation.y+=sway*.085*motion;head.rotation.z+=Math.sin(phase*.25+.35)*.018*motion;
      if(mode==='reading')head.rotation.x+=Math.sin(time*.45)*.012;
      feet[0].rotation.set(Math.sin(phase*.5+.8)*.055*motion,-.14+Math.sin(phase*.5+.25)*.055*motion,Math.sin(phase*.5+.8)*.026*motion);
      book.position.set(...p.bookPos);book.rotation.set(...p.bookRot);
      rightLeaf.rotation.z=Math.PI*p.bookClose;rightLeaf.position.y=.055*p.bookClose;
      turnLeaf.visible=p.page>.001&&p.page<.999&&p.bookClose<.1;turnLeaf.rotation.z=Math.PI*ease(p.page);
      cup.position.set(...p.cupPos);cup.rotation.set(...p.cupRot);
      root.updateWorldMatrix(true,false);torso.updateWorldMatrix(false,false);
      book.updateWorldMatrix(false,false);cup.updateWorldMatrix(false,false);
      inverse.copy(root.matrixWorld).invert();
      headphones.position.set(...p.hpPos);targetQuat.setFromEuler(euler.set(...p.hpRot));headphones.quaternion.copy(targetQuat);
      if(p.wear>0){
        head.updateWorldMatrix(false,false);headMatrix.multiplyMatrices(inverse,head.matrixWorld).decompose(headPos,headQuat,headScale);
        headphones.position.lerp(headPos,p.wear);headphones.quaternion.slerp(headQuat,p.wear);
      }
      headphones.scale.setScalar(1.10);headphones.updateWorldMatrix(false,false);
      left.set(...p.left);right.set(...p.right);
      mixPoint(left,rootPoint(book,-.30,-.015,.09),p.bookL);
      const close=p.bookClose,carry=p.bookCarry;
      const closeRadius=.30-.13*ease((close-.5)*2);
      mixPoint(right,rootPoint(book,(closeRadius*Math.cos(Math.PI*close))*(1-carry)-.03*carry,(.025+closeRadius*Math.sin(Math.PI*close))*(1-carry)+.045*carry,.07),p.bookR);
      mixPoint(right,rootPoint(cup,...CUP_WRIST),p.cupR);
      mixPoint(left,rootPoint(headphones,-.40*(1-p.hpBand),.23*(1-p.hpBand)+.68*p.hpBand,-.04),p.hpL);mixPoint(right,rootPoint(headphones,.40,.23,-.04),p.hpR);
      if(p.bookClose<.1&&(p.pageReach>.001||p.page>.001&&p.page<.999)){
        const a=Math.PI*ease(p.page),point=rootPoint(book,Math.cos(a)*.20,.04+Math.sin(a)*.20,-.035);
        const pageWeight=Math.max(p.pageReach,Math.sin(Math.PI*p.page));
        // A held cup owns the right hand. The lap supports the book while the
        // left hand reaches across, turns the leaf, and returns to its edge.
        mixPoint(left,point,pageWeight*p.pageLeft);
        mixPoint(right,point,pageWeight*(1-p.pageLeft));
      }
      for(let i=0;i<3;i++){lr[i]=p.leftRot[i];rr[i]=p.rightRot[i];}
      lr[0]+=-Math.PI/2*p.hpL;lr[1]+=Math.PI/2*p.hpL;
      rr[0]+=-Math.PI/2*p.hpR;rr[1]+=-Math.PI/2*p.hpR;
      listener.prepareArmPose(inverse);listener.poseArm(0,left,lr,true);listener.poseArm(1,right,rr,true);
      const coffeeArm=listener.arms[1];
      cupHandQuat.copy(cup.quaternion).multiply(cupGripRotation);
      coffeeArm.hand.quaternion.slerp(cupHandQuat,p.cupR);
      coffeeArm.fingers.visible=p.cupR<.65;coffeeArm.coffeeFingers.visible=p.cupR>=.65;
      const eyesClosed=wanted&&mode==='listening';
      listener.openEyes.visible=!eyesClosed;listener.closedEyes.visible=eyesClosed;
      listener.update(level*p.listen,p.power>.55);
      steam.position.copy(rootPoint(cup,0,.20,0));steamMat.uniforms.uTime.value=time;
      rootPoint(headphones,-.34,.19,-.06,ear);
      for(let i=0;i<18;i++){const f=i/17;v.copy(ear).lerp(plug,f);v.y-=Math.sin(Math.PI*f)*.28;cablePoints[i*3]=v.x;cablePoints[i*3+1]=v.y;cablePoints[i*3+2]=v.z;}
      cableGeo.attributes.position.needsUpdate=true;
    }
    apply(0,0,0);
    return{coffeeTable,book,cup,steam,saucer,
      setMusicRequested(value){wanted=!!value;if(!current){if(wanted&&mode==='reading')enterMusic();else if(!wanted&&mode==='listening')enterReading();}},
      update(time,dt,level,phase){
        if(current){elapsed+=dt;pose=blend(current.from,current.to,ease(elapsed/current.duration));if(elapsed>=current.duration){pose=clone(current.to);nextStep();}}
        else if(wanted&&mode==='reading')enterMusic();
        else if(!wanted&&mode==='listening')enterReading();
        else if(mode==='reading'){idleTime+=dt;const sample=idle(idleTime);pose=sample.pose;action=sample.action;}
        else{pose=clone(listening);action='listening';}
        apply(time,level,phase);
      },
      batchParts(batch){book.remove(leftLeaf,rightLeaf,turnLeaf);batch(book);book.add(leftLeaf,rightLeaf,turnLeaf);[leftLeaf,rightLeaf,turnLeaf,cup,coffeeTable].forEach(batch);},
      stats(){return{mode,action,requestedMusic:wanted,transition:!!current,transitionCount,stageSeconds:elapsed,
        headphonesOn:pose.wear>.99,playerOn:pose.power>.55,eyesOpen:listener.openEyes.visible,eyesClosed:listener.closedEyes.visible,bookClosed:pose.bookClose>.95,bookPosition:book.position.toArray(),cupPosition:cup.position.toArray(),
        bookOnLap:Math.hypot(...book.position.toArray().map((value,i)=>value-BOOK_READ[i]))<.015,
        bookAngle:book.rotation.x,pageFacingReader:book.rotation.x<-.05&&book.rotation.x>-Math.PI/2,
        readingCycleSeconds:idleTime%48,pageTurning:turnLeaf.visible,pageHand:turnLeaf.visible?(pose.pageLeft>.5?'left':'right'):null,
        coffeeWhileReading:mode==='reading'&&pose.cupR>.05,drinking:pose.sip>.5,reachError:listener.arms.map(a=>Number(a.reachError.toFixed(3)))};}
    };
  };
})();
