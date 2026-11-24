/* Reference-built low-poly listener, furniture and task light.
 * Geometry remains three-dimensional; separate head/torso/foot pivots drive music motion.
 */
(function(){
  'use strict';
  window.createMiniatureListener=function(ctx){
    const {T, parent, material, box, boxGeo, cylinder, sphere, rod, tube, torus, group, plane, canvasTexture}=ctx;
    const root=group(parent,0,0,0);
    const C={
      skin:material('#e6a287',.9),skinLight:material('#efb594',.85),skinShade:material('#ca8d6f',.9),
      hair:material('#222924',.96),hairSide:material('#29312d',.94),hairTop:material('#333830',.95),
      eyes:material('#625140',.95),shirt:material('#e2d3ae',.94),jacket:material('#a5a89b',.94),
      jacketSide:material('#9da393',.94),cuff:material('#d3cbb1',.95),seam:material('#8e9687',.94),
      trousers:material('#344e48',.95),trouserLight:material('#425b52',.95),trouserDark:material('#2d423d',.98),
      canvas:material('#253735',.96),sole:material('#d3ceb6',.95),soleLine:material('#7a8374',.95),
      wood:material('#765b3d',.86),woodTop:material('#92754e',.83),seat:material('#9c7850',.94),
      seatSide:material('#81633f',.95),pillow:material('#65734b',.97),pillowTop:material('#788359',.96),
      headphone:material('#233638',.65),pad:material('#26302d',.95),rim:material('#9eaa9b',.55,.16),
      lamp:material('#52564a',.7,.1),brass:material('#8f7950',.57,.22),
      ampTop:material('#c4b294',.72),ampFront:material('#988d75',.65,.12),knob:material('#d0ad69',.43,.24)
    };
    const lightMaterial=new T.MeshBasicMaterial({color:new T.Color('#ffe8af').multiplyScalar(1.65),toneMapped:false});
    const smallLED=new T.MeshBasicMaterial({color:'#e9c885',toneMapped:false});
    function rectBeam(a,b,widthA,widthB,depthA,depthB,mat,into){
      const aa=new T.Vector3(...a),bb=new T.Vector3(...b),direction=bb.clone().sub(aa),length=direction.length();
      const maxW=Math.max(widthA,widthB),maxD=Math.max(depthA,depthB);
      const geom=boxGeo(maxW,length,maxD,Math.min(.015,maxW*.10,length*.1)).clone();
      const pos=geom.attributes.position;
      for(let i=0;i<pos.count;i++){
        const top=pos.getY(i)>0;
        pos.setX(i,pos.getX(i)*(top?widthB:widthA)/maxW);pos.setZ(i,pos.getZ(i)*(top?depthB:depthA)/maxD);
      }
      geom.computeVertexNormals();
      const mesh=new T.Mesh(geom,mat);mesh.position.copy(aa.add(bb).multiplyScalar(.5));
      mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),direction.normalize());
      mesh.castShadow=true;mesh.receiveShadow=true;into.add(mesh);return mesh;
    }
    function cuff(a,b,width,depth,mat,into){return rectBeam(a,b,width,width,depth,depth,mat,into);}
    function clothLimb(points,widths,depths,mat,into){
      const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)),false,'catmullrom',.18);
      const positions=[],indices=[],rings=7;
      for(let i=0;i<rings;i++){
        const t=i/(rings-1),p=curve.getPoint(t),tangent=curve.getTangent(t).normalize();
        let u=new T.Vector3(1,0,0).addScaledVector(tangent,-tangent.x);
        if(u.lengthSq()<.02)u=new T.Vector3(0,0,1).addScaledVector(tangent,-tangent.z);
        u.normalize();const v=new T.Vector3().crossVectors(tangent,u).normalize();
        const n=Math.min(widths.length-2,Math.floor(t*(widths.length-1))),f=t*(widths.length-1)-n;
        const w=T.MathUtils.lerp(widths[n],widths[n+1],f),d=T.MathUtils.lerp(depths[n],depths[n+1],f),r=Math.min(w,d)*.12;
        const ring=[[-w/2+r,-d/2],[w/2-r,-d/2],[w/2,-d/2+r],[w/2,d/2-r],[w/2-r,d/2],[-w/2+r,d/2],[-w/2,d/2-r],[-w/2,-d/2+r]];
        for(const q of ring){const point=p.clone().addScaledVector(u,q[0]).addScaledVector(v,q[1]);positions.push(point.x,point.y,point.z);}
        if(i>0)for(let k=0;k<8;k++){const a=(i-1)*8+k,b=(i-1)*8+(k+1)%8,c=i*8+k,e=i*8+(k+1)%8;indices.push(a,b,c,b,e,c);}
      }
      for(let k=1;k<7;k++){indices.push(0,k+1,k);const off=(rings-1)*8;indices.push(off,off+k,off+k+1);}
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();
      const m=new T.Mesh(g,mat);m.castShadow=m.receiveShadow=true;into.add(m);return m;
    }
    // The reference has an amber upholstered wooden armchair, and a green head cushion.
    const chair=group(root,0,0,0,-.06);
    for(const side of [-1,1]){
      box(.10,.94,.11,C.wood,side*.46,.47,.40,chair,.009);
      const rearLeg=box(.10,1.46,.11,C.wood,side*.46,.73,-.43,chair,.009);rearLeg.rotation.x=-.045;
      box(.12,.075,1.12,C.woodTop,side*.46,.96,-.03,chair,.013);
      box(.075,.10,.89,C.wood,side*.46,.34,-.015,chair,.007);
      
    }
    box(.96,.14,.96,C.wood,0,.55,.0,chair,.015);
    box(.82,.17,.83,C.seatSide,0,.665,.015,chair,.022);
    box(.82,.07,.82,C.seat,0,.755,.02,chair,.025);
    const back=group(chair,0,.86,-.40);back.rotation.x=-.115;
    box(.90,.88,.14,C.wood,0,.29,-.06,back,.014);
    box(.80,.73,.16,C.seat,0,.32,.055,back,.027);
    box(.87,.23,.24,C.pillow,0,.83,.015,back,.028);
    box(.84,.025,.21,C.pillowTop,0,.956,.015,back,.009);
    // Hip joint sits naturally on the cushion; rectangular tapered limbs give cloth volume.
    const hips=group(root,0,.78,.07);
    box(.49,.22,.36,C.trousers,0,.04,.025,hips,.026);
    const legs=group(root);
    // Supporting leg. The second thigh rests across this knee, not merely crossed ankles.
    clothLimb([[-.15,.82,.10],[.13,.65,.62],[.16,.20,.80]],[.23,.205,.15],[.24,.22,.16],C.trousers,legs);
    cuff([.159,.23,.785],[.16,.18,.82],.17,.174,C.trouserLight,legs);
    rectBeam([.16,.19,.82],[.16,.105,.83],.11,.11,.12,.12,C.skin,legs);
    // Upper crossed leg: right hip to left knee, with the relaxed shoe hanging forward.
    clothLimb([[.16,.87,.08],[-.11,.87,.66],[-.34,.36,.87]],[.245,.22,.15],[.25,.23,.165],C.trousers,legs);
    cuff([-.32,.39,.855],[-.345,.335,.895],.17,.18,C.trouserLight,legs);
    rectBeam([-.345,.337,.896],[-.35,.25,.94],.115,.11,.13,.12,C.skin,legs);
    // Subtle flat crease patches, consistent with the faceted fabric in the reference.
    const thighCrease=box(.023,.018,.34,C.trouserDark,-.085,.99,.35,legs);thighCrease.rotation.y=-.68;
    const feet=[];
    function sneaker(x,y,z,turn){
      const f=group(root,x,y,z,turn);
      box(.25,.057,.48,C.sole,0,.029,.105,f,.019);
      box(.251,.012,.469,C.soleLine,0,.055,.105,f,.010);
      box(.232,.15,.34,C.canvas,0,.133,.025,f,.021);
      box(.237,.052,.17,C.sole,0,.089,.266,f,.019);
      const toe=sphere(.119,.056,.105,C.sole,0,.105,.245,f,10);toe.scale.y*=.88;
      box(.115,.025,.25,C.canvas,0,.209,.07,f,.006);
      for(let i=0;i<4;i++){
        const zz=-.005+i*.052,yy=.240-i*.004;
        rod([-.069,yy,zz],[.069,yy-.003,zz+.020],.008,C.sole,f);
        for(const side of [-1,1])sphere(.012,.006,.012,C.soleLine,side*.081,yy-.007,zz,f,6);
      }
      box(.10,.025,.008,C.soleLine,0,.035,.350,f,.002);
      feet.push(f);return f;
    }
    sneaker(-.36,.19,.98,-.14);sneaker(.17,.012,.90,.05);
    // Open light-grey jacket over a warm ivory T-shirt; no vest-like button strips.
    const torso=group(root,0,.84,.025);torso.rotation.x=-.115;torso.rotation.z=.025;
    const bodyGeometry=boxGeo(.59,.67,.37,.025).clone();
    const bp=bodyGeometry.attributes.position;
    for(let i=0;i<bp.count;i++)if(bp.getY(i)<0)bp.setX(i,bp.getX(i)*.83);
    bodyGeometry.computeVertexNormals();
    const body=new T.Mesh(bodyGeometry,C.jacket);body.position.y=.34;body.castShadow=body.receiveShadow=true;torso.add(body);
    box(.29,.57,.045,C.shirt,0,.335,.202,torso,.013);
    for(const side of [-1,1]){
      const panel=box(.15,.62,.05,C.jacket,side*.225,.335,.205,torso,.010);panel.rotation.z=side*.045;
      const edge=box(.017,.57,.013,C.seam,side*.142,.32,.237,torso,.002);edge.rotation.z=side*.04;
      const collar=box(.107,.23,.06,C.jacket,side*.14,.596,.213,torso,.008);collar.rotation.z=side*.32;
    }
    box(.14,.12,.017,C.jacketSide,-.22,.39,.24,torso,.004);
    box(.14,.016,.020,C.cuff,-.22,.45,.247,torso,.002);
    box(.47,.035,.40,C.jacketSide,0,.028,.012,torso,.008);
    cylinder(.09,.105,.16,C.skin,0,.74,.0,torso,8);
    const neckline=torus(.087,.015,C.cuff,0,.699,.114,torso);neckline.rotation.x=.25;neckline.scale.y=.50;
    // Two articulated sleeve segments and a separate hand preserve the blocky
    // silhouette while reaching the book, cup, headphones and player.
    const arms=[];
    for(const side of [-1,1]){
      const shoulder=new T.Vector3(side*.29,.60,.015),upperLength=.43,foreLength=.44;
      const upper=group(torso,...shoulder.toArray()),fore=group(torso),hand=group(root);
      clothLimb([[0,0,0],[0,-upperLength*.5,.008],[0,-upperLength,0]],[.195,.18,.16],[.205,.18,.16],C.jacket,upper);
      clothLimb([[0,0,0],[0,-foreLength*.5,0],[0,-foreLength+.04,0]],[.16,.15,.126],[.17,.16,.14],C.jacket,fore);
      box(.14,.07,.15,C.cuff,0,-foreLength+.035,0,fore,.009);
      box(.108,.065,.14,C.skin,0,0,.035,hand,.012);
      const fingers=group(hand),coffeeFingers=side>0?group(hand):null;
      for(let i=0;i<4;i++){
        const x=-.036+i*.024;
        rectBeam([x,.008,.087],[x,.010,.145],.020,.018,.021,.020,C.skinLight,fingers);
        rectBeam([x,.010,.145],[x,-.025,.155],.018,.017,.020,.019,C.skin,fingers);
        if(coffeeFingers){
          // Curl around the outer upright of the handle; the middle fingers
          // turn through its opening while the thumb rests above them.
          rectBeam([x,.008,.087],[x,.035,.119],.020,.019,.021,.020,C.skinLight,coffeeFingers);
          rectBeam([x,.035,.119],[x,.075,.111],.019,.018,.020,.019,C.skin,coffeeFingers);
          rectBeam([x,.075,.111],[x,.085,.090],.018,.017,.019,.018,C.skinLight,coffeeFingers);
        }
      }
      rectBeam([side*.045,-.004,.04],[side*.075,-.020,.095],.032,.026,.034,.025,C.skin,fingers);
      if(coffeeFingers){
        rectBeam([.045,-.004,.040],[.060,.035,.060],.032,.029,.034,.027,C.skin,coffeeFingers);
        rectBeam([.060,.035,.060],[.030,.065,.071],.029,.025,.027,.025,C.skinLight,coffeeFingers);
        coffeeFingers.visible=false;
      }
      arms.push({side,shoulder,upper,fore,hand,fingers,coffeeFingers,upperLength,foreLength,reachError:0});
    }
    const down=new T.Vector3(0,-1,0),armPoint=new T.Vector3(),armDelta=new T.Vector3(),armBend=new T.Vector3();
    const armElbow=new T.Vector3(),armWrist=new T.Vector3(),armDirection=new T.Vector3();
    const armRootInverse=new T.Matrix4(),armTorsoInverse=new T.Matrix4();
    function prepareArmPose(worldToRoot){
      if(worldToRoot)armRootInverse.copy(worldToRoot);else armRootInverse.copy(root.matrixWorld).invert();
      armTorsoInverse.copy(torso.matrixWorld).invert();
    }
    function poseArm(index,target,rotation,prepared=false){
      // The paired frame update prepares these transforms once. Keep standalone
      // callers correct too, without depending on the order of previous frames.
      if(!prepared){root.updateWorldMatrix(true,false);torso.updateWorldMatrix(false,false);prepareArmPose();}
      const arm=arms[index];
      if(target.isVector3)armPoint.copy(target);else armPoint.set(...target);
      armPoint.applyMatrix4(root.matrixWorld).applyMatrix4(armTorsoInverse);
      const delta=armDelta.copy(armPoint).sub(arm.shoulder);
      const requested=delta.length(),distance=T.MathUtils.clamp(requested,.06,arm.upperLength+arm.foreLength-.012);
      delta.normalize();
      const along=(arm.upperLength*arm.upperLength-arm.foreLength*arm.foreLength+distance*distance)/(2*distance);
      const height=Math.sqrt(Math.max(0,arm.upperLength*arm.upperLength-along*along));
      const bend=armBend.set(arm.side*.52,-1,.12);bend.addScaledVector(delta,-bend.dot(delta)).normalize();
      const elbow=armElbow.copy(arm.shoulder).addScaledVector(delta,along).addScaledVector(bend,height);
      const wrist=armWrist.copy(arm.shoulder).addScaledVector(delta,distance);
      arm.upper.position.copy(arm.shoulder);arm.upper.quaternion.setFromUnitVectors(down,armDirection.copy(elbow).sub(arm.shoulder).normalize());
      arm.fore.position.copy(elbow);arm.fore.quaternion.setFromUnitVectors(down,armDirection.copy(wrist).sub(elbow).normalize());
      arm.hand.position.copy(wrist.applyMatrix4(torso.matrixWorld).applyMatrix4(armRootInverse));
      arm.hand.rotation.set(...rotation);arm.reachError=Math.max(0,requested-distance);
    }
    // Reference silhouette: tapered square face, uneven stepped hair, large circular cups.
    const head=group(torso,0,.76,-.008);head.scale.setScalar(1.10);
    const faceGeo=boxGeo(.435,.445,.355,.015).clone();
    const hp=faceGeo.attributes.position;
    for(let i=0;i<hp.count;i++)if(hp.getY(i)<0)hp.setX(i,hp.getX(i)*.91);
    faceGeo.computeVertexNormals();
    const face=new T.Mesh(faceGeo,C.skin);face.position.set(0,.205,.035);face.castShadow=face.receiveShadow=true;head.add(face);
    // Slight bevels on the cheek edges maintain the square model rather than a sphere.
    
    for(const side of [-1,1])box(.057,.17,.10,C.skinShade,side*.224,.23,.0,head,.014);
    box(.49,.21,.41,C.hair,0,.45,-.025,head,.009);
    box(.50,.31,.11,C.hairSide,0,.33,-.207,head,.005);
    for(const side of [-1,1]){
      box(.105,.31,.31,C.hair,side*.233,.34,-.055,head,.005);
      box(.083,.19,.13,C.hairSide,side*.252,.22,.050,head,.004);
    }
    const locks=[[-.206,.575,.13,.12,.29],[-.095,.620,.14,.13,.30],[.030,.595,.15,.12,.31],[.162,.557,.14,.12,.32]];
    locks.forEach(([x,y,w,h,d],i)=>{const m=box(w,h,d,i%2?C.hairTop:C.hair,x,y,-.015,head,.003);m.rotation.z=(i-1.5)*-.022;});
    const bangs=[[-.185,.415,.10,.09],[-.078,.410,.11,.11],[.043,.428,.105,.08],[.153,.392,.10,.15]];
    bangs.forEach(([x,y,w,h])=>box(w,h,.085,C.hair,x,y,.181,head,.003));
    box(.085,.10,.14,C.hairSide,.282,.428,-.141,head,.003);
    box(.105,.065,.17,C.hair,-.285,.515,.04,head,.002);box(.075,.12,.15,C.hairTop,-.18,.651,-.07,head,.002);
    const closedEyes=group(head),openEyes=group(head);
    for(const side of [-1,1]){
      const x=side*.113;
      tube([[x-.045,.218,.219],[x-.012,.205,.222],[x+.021,.207,.222],[x+.045,.219,.219]],.009,C.eyes,closedEyes);
      // Reading uses friendly bead eyes: two small dark low-poly dots with a
      // tiny warm highlight. Listening still swaps to the separate curved
      // closed-eye group below, so the music transition remains unchanged.
      sphere(.034,.034,.015,C.eyes,x,.215,.237,openEyes,8);
      sphere(.007,.007,.005,C.shirt,x-side*.006,.226,.249,openEyes,6);
    }
    const noseGeo=new T.BufferGeometry();
    noseGeo.setAttribute('position',new T.Float32BufferAttribute([-.027,.192,.216,.028,.192,.216,.012,.135,.263, -.027,.192,.216,.012,.135,.263,-.021,.139,.222, .028,.192,.216,.028,.132,.221,.012,.135,.263, -.021,.139,.222,.012,.135,.263,.028,.132,.221],3));noseGeo.computeVertexNormals();
    const nose=new T.Mesh(noseGeo,C.skinShade);head.add(nose);nose.castShadow=true;
    tube([[-.031,.078,.220],[-.006,.070,.223],[.024,.078,.220]],.006,C.eyes,head);
    const headphones=group(root);headphones.scale.setScalar(1.10);
    // Padded band and pale metal yokes clearly separate the headphones from the hair.
    tube([[-.305,.20,-.077],[-.34,.44,-.077],[-.25,.645,-.077],[0,.704,-.077],[.25,.645,-.077],[.34,.44,-.077],[.305,.20,-.077]],.016,C.rim,headphones);
    tube([[-.27,.591,-.082],[0,.675,-.082],[.27,.591,-.082]],.023,C.pad,headphones);
    for(const side of [-1,1]){
      let c=cylinder(.157,.157,.075,C.pad,side*.272,.22,-.060,headphones,20);c.rotation.z=Math.PI/2;
      c=cylinder(.153,.153,.075,C.rim,side*.326,.22,-.060,headphones,20);c.rotation.z=Math.PI/2;
      c=cylinder(.123,.123,.080,C.headphone,side*.341,.22,-.060,headphones,20);c.rotation.z=Math.PI/2;
      const rim=torus(.133,.014,C.rim,side*.384,.22,-.060,headphones);rim.rotation.y=Math.PI/2;
      rectBeam([side*.33,.33,-.165],[side*.33,.45,-.115],.025,.025,.027,.027,C.rim,headphones);
    }
    // Small walnut side table and the exact compact silver player layout.
    const table=group(root,-1.17,0,.22);
    for(const x of [-.29,.29])for(const z of [-.25,.25]){
      rectBeam([x*1.19,.035,z*1.20],[x,.965,z],.075,.055,.075,.055,C.wood,table);
    }
    cylinder(.51,.51,.065,C.wood,0,.996,0,table,28);
    cylinder(.515,.51,.025,C.woodTop,0,1.041,0,table,28);
    const player=group(table,0,1.06,-.02);
    box(.55,.30,.38,C.ampTop,0,.155,0,player,.007);
    box(.552,.252,.018,C.ampFront,0,.142,.198,player,.004);
    box(.12,.026,.010,C.headphone,-.020,.205,.211,player,.001);
    for(const x of [-.18,-.115])for(const y of [.104,.164])box(.027,.027,.012,smallLED,x,y,.215,player,.003);
    box(.034,.022,.012,C.knob,-.010,.100,.217,player,.003);
    const knob=cylinder(.048,.048,.029,C.knob,.178,.145,.227,player,16);knob.rotation.x=Math.PI/2;
    const cap=cylinder(.031,.031,.032,C.ampTop,.178,.145,.232,player,16);cap.rotation.x=Math.PI/2;
    box(.006,.018,.006,C.cream||C.shirt,.178,.163,.253,player);
    const powerIndicator=box(.028,.023,.010,smallLED,.045,.205,.218,player,.003);
    const levelBars=[];
    for(let i=0;i<4;i++){const b=box(.012,.012,.004,smallLED,-.062+i*.025,.206,.218,player);levelBars.push(b);}
    // Reference lamp: on the table's LEFT, curving above the player and toward the face.
    const lamp=group(root,-1.92,0,-.14);
    cylinder(.25,.28,.044,C.lamp,0,.025,0,lamp,20);
    tube([[0,.04,0],[0,2.48,0],[.05,2.79,0],[.21,2.94,0],[.44,2.91,0],[.58,2.76,.015]],.024,C.brass,lamp);
    const shade=group(lamp,.59,2.58,.025);shade.rotation.z=-.10;
    cylinder(.083,.29,.28,C.lamp,0,.12,0,shade,24);
    cylinder(.287,.287,.016,lightMaterial,0,-.029,0,shade,24);
    cylinder(.075,.075,.11,C.lamp,0,.313,0,shade,16);
    sphere(.074,.056,.074,lightMaterial,0,-.057,0,shade,16);
    const taskLight=new T.SpotLight('#ffddaa',3.6,4.0,.80,.62,1.4);
    taskLight.position.set(-1.33,2.52,-.12);taskLight.target.position.set(-.32,1.40,.40);
    taskLight.castShadow=true;taskLight.shadow.mapSize.set(1024,1024);taskLight.shadow.bias=-.0010;taskLight.shadow.normalBias=.032;taskLight.shadow.autoUpdate=false;taskLight.shadow.needsUpdate=true;
    root.add(taskLight,taskLight.target);
    // Quiet woven grid, not long grass-like stripes.
    const rugTexture=canvasTexture(512,512,(c,w,h)=>{
      c.fillStyle='#707955';c.fillRect(0,0,w,h);
      for(let y=0;y<512;y+=12)for(let x=0;x<512;x+=12){c.fillStyle=(x+y)%24?'#687150':'#747c57';c.fillRect(x,y,9,9);c.fillStyle='#838b64';c.fillRect(x+2,y+1,4,1);}
      c.strokeStyle='#91966f';c.lineWidth=7;c.strokeRect(10,10,492,492);c.strokeStyle='#515d43';c.lineWidth=3;c.strokeRect(19,19,474,474);
    });
    const rug=plane(3.40,2.80,new T.MeshStandardMaterial({map:rugTexture,color:'#b4baa5',roughness:1}),-.50,.012,.43,root);rug.rotation.x=-Math.PI/2;
    root.name='Reference listener and listening corner';
    function batchParts(batch){
      const separate=[head,...arms.map(a=>a.upper),...arms.map(a=>a.fore)];
      separate.forEach(o=>torso.remove(o));batch(torso);separate.forEach(o=>torso.add(o));
      head.remove(openEyes,closedEyes);batch(head);head.add(openEyes,closedEyes);
      [openEyes,closedEyes,headphones,...arms.map(a=>a.upper),...arms.map(a=>a.fore)].forEach(batch);
      arms.forEach(arm=>{
        const fingers=[arm.fingers,arm.coffeeFingers].filter(Boolean);
        fingers.forEach(f=>arm.hand.remove(f));batch(arm.hand);
        fingers.forEach(f=>{arm.hand.add(f);batch(f);});
      });
    }
    return {root,chair,hips,legs,feet,torso,head,table,player,lamp,levelBars,powerIndicator,taskLight,
      arms,poseArm,prepareArmPose,headphones,openEyes,closedEyes,batchParts,
      update(level,on){powerIndicator.visible=!!on;levelBars.forEach((b,i)=>{b.visible=!!on&&level>.025+i*.11;});}
    };
  };
})();
