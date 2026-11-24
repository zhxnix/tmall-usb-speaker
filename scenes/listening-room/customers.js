/* Quiet shoppers take turns through the front entrance, aisle and QR checkout.
 * Only one guest is inside; the next enters after the previous guest fully exits.
 */
(function(){
  'use strict';
  window.createShopCustomers=function(ctx){
    const {T,dynamic,material,group,box,cylinder,sphere,rod,plane,sleeve,batch,navigation,doorReady,checkoutStation,getCat,canvasTexture}=ctx;
    const rigs=[];
    const phoneTextures=[false,true].map(paid=>canvasTexture(128,224,(c,w,h)=>{
      c.fillStyle='#132429';c.fillRect(0,0,w,h);c.fillStyle='#cfdec9';c.font='bold 17px sans-serif';c.textAlign='center';c.fillText(paid?'支付成功':'扫码付款',w/2,29);
      c.strokeStyle=paid?'#82d6a0':'#f0ead5';c.lineWidth=5;
      if(paid){c.beginPath();c.moveTo(30,112);c.lineTo(54,136);c.lineTo(99,84);c.stroke();}
      else{for(const a of [[22,64],[106,64],[22,160],[106,160]]){c.beginPath();c.moveTo(a[0]+(a[0]<64?18:-18),a[1]);c.lineTo(a[0],a[1]);c.lineTo(a[0],a[1]+(a[1]<100?18:-18));c.stroke();}c.fillStyle='#719d8e';c.fillRect(26,112,76,3);}
    }));
    const shadowCanvas=document.createElement('canvas');shadowCanvas.width=64;shadowCanvas.height=64;
    const sc=shadowCanvas.getContext('2d'),gradient=sc.createRadialGradient(32,32,0,32,32,32);
    gradient.addColorStop(0,'rgba(8,14,16,.42)');gradient.addColorStop(1,'rgba(8,14,16,0)');sc.fillStyle=gradient;sc.fillRect(0,0,64,64);
    const shadowTexture=new T.CanvasTexture(shadowCanvas);
    function create(index){
      const root=group(dynamic);root.scale.setScalar(.80);
      const coat=material(index?'#637d85':'#956650');
      const coatDark=material(index?'#4e6871':'#79513f');
      const scarf=material(index?'#c9b88f':'#a98d62');
      const skin=material(index?'#dbab88':'#cfa07a');
      const hair=material(index?'#39312b':'#342d27');
      const pants=material(index?'#4d5650':'#384b49');
      const boot=material('#353b36'),sole=material('#b7b6a4');
      const body=group(root,0,.89,0);
      box(.57,.77,.34,coat,0,.37,0,body,.035);
      box(.55,.045,.35,coatDark,0,-.015,0,body,.012);
      box(.025,.68,.02,coatDark,0,.36,.185,body,.004);
      for(const side of [-1,1])box(.14,.15,.025,coatDark,side*.17,.15,.19,body,.01);
      for(let i=0;i<3;i++)sphere(.018,.018,.01,scarf,.052,.20+i*.16,.195,body,6);
      cylinder(.09,.10,.15,skin,0,.80,0,body,8);
      box(.36,.13,.35,scarf,0,.77,0,body,.024);
      const scarfEnd=box(.14,.34,.035,scarf,-.13,.53,.205,body,.008);scarfEnd.rotation.z=-.10;
      for(let i=0;i<5;i++)rod([-.19+i*.026,.37,.215],[-.19+i*.026,.30,.215],.007,scarf,body);
      const head=group(body,0,.90,0);
      box(.37,.41,.32,skin,0,.18,.01,head,.025);
      box(.41,.16,.35,hair,0,.40,-.025,head,.018);
      box(.40,.29,.10,hair,0,.27,-.15,head,.013);
      for(const side of [-1,1]){
        box(.075,index?.32:.15,.26,hair,side*.18,index?.24:.37,-.02,head,.01);
        box(.035,.025,.013,hair,side*.091,.19,.180,head,.003);
      }
      box(.045,.045,.035,skin,0,.13,.185,head,.008);
      box(.047,.008,.009,hair,0,.065,.179,head,.002);
      const hat=material(index?'#d0c4a9':'#8c5448');
      cylinder(.218,.215,.12,hat,0,.465,-.01,head,12);
      const crown=sphere(.216,.165,.19,hat,0,.52,-.01,head,12);
      sphere(.052,.055,.05,hat,0,.69,-.01,head,8);
      const arms=[],forearms=[];
      for(const side of [-1,1]){
        const arm=group(body,side*.32,.63,0);
        box(.16,.27,.18,coat,0,-.135,0,arm,.025);
        const elbow=group(arm,0,-.27,0);
        box(.15,.25,.17,coat,0,-.125,0,elbow,.022);
        box(.16,.06,.18,coatDark,0,-.25,0,elbow,.010);
        box(.12,.14,.115,skin,0,-.32,.012,elbow,.018);
        arms.push(arm);forearms.push(elbow);
      }
      const legs=[];
      for(const side of [-1,1]){
        const leg=group(root,side*.16,.87,0);
        box(.195,.69,.215,pants,0,-.34,0,leg,.023);
        box(.215,.17,.34,boot,0,-.74,.07,leg,.025);
        box(.23,.04,.36,sole,0,-.834,.075,leg,.012);
        legs.push(leg);
      }
      const album=group(body,.06,.25,.30);
      album.rotation.x=-.15;
      box(.42,.42,.035,material('#c9bd9e'),0,0,0,album,.003);
      sleeve(.404,.404,46+index,0,0,.021,album);
      const phone=group(dynamic);phone.visible=false;
      box(.105,.19,.014,material('#18262b'),0,0,0,phone,.008);
      const phoneMaterial=new T.MeshBasicMaterial({map:phoneTextures[0],toneMapped:false});
      plane(.089,.163,phoneMaterial,0,0,.0075,phone);
      sphere(.008,.008,.002,material('#74837c'),-.030,.069,-.009,phone,6);batch(phone);
      const bag=group(body,-.40,.12,.035);
      box(.28,.33,.13,material(index?'#a8aca0':'#b9aa87'),0,-.09,0,bag,.012);
      for(const side of [-1,1])rod([side*.10,.08,.02],[side*.06,.23,.02],.012,coatDark,bag);
      // Keep the shoulder, elbow and carried record independent for safe shelf-reaching poses.
      rod([-.31,.67,.02],[-.46,.35,.055],.012,coatDark,body);rod([-.31,.67,-.035],[-.34,.35,-.015],.012,coatDark,body);forearms.forEach(batch);
      arms.forEach((arm,i)=>{arm.remove(forearms[i]);batch(arm);arm.add(forearms[i]);});
      batch(album);batch(bag);batch(head);legs.forEach(batch);
      body.remove(head,album,bag);arms.forEach(a=>body.remove(a));batch(body);body.add(head,album,bag);arms.forEach(a=>body.add(a));
      root.name=index?'Winter shopper in blue':'Winter shopper in rust';
      root.traverse(o=>{if(o.isMesh)o.castShadow=false;});
      const shadow=plane(.74,.55,new T.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false}),0,.098,0,dynamic);shadow.rotation.x=-Math.PI/2;shadow.renderOrder=3;
      root.visible=false;shadow.visible=false;
      const rig={root,body,head,arms,forearms,legs,album,bag,shadow,phone,phoneMaterial,index,paid:false,recordOnCounter:false,radius:.43,slot:null,
        state:'outside',action:'outside',elapsed:0,dwell:0,position:checkoutStation.outside.slice(),
        yaw:index?-Math.PI/2:Math.PI/2,path:null,pathIndex:0,speed:0,walkBlend:0,step:0,carrying:false,visits:0,nextPlan:0,waitReason:''};
      rigs.push(rig);return rig;
    }
    // Fitting scenes can request only their replacement actor. Omitted means
    // both original customers still appear, in a strict round-robin order.
    const activeCustomerIndices=Array.isArray(ctx.activeCustomerIndices)?ctx.activeCustomerIndices:[0,1];
    [...new Set(activeCustomerIndices)].filter(index=>index===0||index===1).forEach(create);
    const slots=[[.02,-1.23],[-.34,-3.35]],checkout=checkoutStation.point,outside=checkoutStation.outside;
    const payStates=['align-counter','place-record','reach-phone','scan-code','confirm-payment','put-phone-away','pick-up-record'];
    let mover=null,initialized=false,clock=0,minimumSeparation=Infinity,nextCustomer=0;
    const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
    const mix=(a,b,t)=>a+(b-a)*clamp(t,0,1);
    function others(r){const agents=rigs.filter(o=>o!==r&&o.root.visible).map(o=>({x:o.position[0],z:o.position[1],radius:o.radius,visible:true}));const cat=getCat&&getCat();if(cat)agents.push(cat);return agents;}
    function change(r,state){r.root.updateMatrixWorld(true);r.albumFrom=r.album.getWorldPosition(new T.Vector3());r.albumQuaternion=r.album.getWorldQuaternion(new T.Quaternion());r.handFrom=r.forearms[1].localToWorld(new T.Vector3(0,-.32,.012));r.leftHandFrom=r.forearms[0].localToWorld(new T.Vector3(0,-.32,.012));r.state=state;r.action=state;r.elapsed=0;r.waitReason='';r.path=null;r.speed=0;}
    function finishMove(r){
      mover=null;r.path=null;r.speed=0;
      if(r.state==='walk-entry'){change(r,'browsing');r.dwell=(r.slot===0?32:23)+(r.visits%3)*3;r.carrying=false;r.paid=false;}
      else if(r.state==='walk-checkout')change(r,'align-counter');
      else if(r.state==='walk-exit'){
        change(r,'outside');r.root.visible=false;r.slot=null;r.carrying=false;r.visits++;r.dwell=12+r.index*3;
        nextCustomer=(rigs.indexOf(r)+1)%rigs.length;
      }
    }
    function entrySlot(r){
      // A visitor already inside keeps its reserved destination when replanning.
      if(r.root.visible&&r.slot!==null)return r.slot;
      if(rigs[nextCustomer]!==r||rigs.some(o=>o!==r&&(o.root.visible||o.state==='walk-entry')))return -1;
      return r.index%slots.length;
    }
    function chooseMover(){
      const intents=rigs.filter(r=>['want-checkout','want-exit','want-entry'].includes(r.state)&&clock>=r.nextPlan);
      intents.sort((a,b)=>((a.state==='want-entry')-(b.state==='want-entry'))||b.position[1]-a.position[1]);
      for(const r of intents){
        let goal,slot=r.slot,state;
        if(r.state==='want-entry'){
          slot=entrySlot(r);if(slot<0){r.waitReason='等上一位顾客离店';continue;}
          goal=slots[slot];state='walk-entry';
        }else if(r.state==='want-exit'){goal=outside;state='walk-exit';}
        else{
          goal=checkout;state='walk-checkout';
        }
        if((state==='walk-entry'||state==='walk-exit')&&!doorReady()){r.waitReason='等门打开';continue;}
        const path=navigation.findPath(r.position,goal,r.radius,others(r));
        if(!path){r.waitReason='等候安全通路';r.nextPlan=clock+.8;continue;}
        if(state==='walk-entry'&&!r.root.visible){
          r.yaw=Math.atan2(path[1][0]-r.position[0],path[1][1]-r.position[1]);
        }
        r.slot=slot;r.state=state;r.action=state;r.elapsed=0;r.path=path;r.pathIndex=1;r.root.visible=true;r.waitReason='';mover=r;return;
      }
    }
    const ease=u=>{u=clamp(u,0,1);return u*u*(3-2*u);};
    const flatRecord=new T.Quaternion().setFromEuler(new T.Euler(-Math.PI/2,0,0));
    const down=new T.Vector3(0,-1,0);
    function reach(r,target,index=1){
      r.root.updateMatrixWorld(true);
      const shoulder=r.arms[index].position.clone(),point=r.body.worldToLocal(target.clone()),delta=point.sub(shoulder);
      const d=clamp(delta.length(),.04,.588),a=.27,b=.32;delta.normalize();
      const along=(a*a-b*b+d*d)/(2*d),height=Math.sqrt(Math.max(0,a*a-along*along));
      const bend=new T.Vector3(index?.45:-.45,-1,.10);bend.addScaledVector(delta,-bend.dot(delta)).normalize();
      const elbow=shoulder.clone().addScaledVector(delta,along).addScaledVector(bend,height),wrist=shoulder.clone().addScaledVector(delta,d);
      const q=new T.Quaternion().setFromUnitVectors(down,elbow.clone().sub(shoulder).normalize());
      r.arms[index].quaternion.copy(q);r.forearms[index].quaternion.copy(q.clone().invert()).multiply(new T.Quaternion().setFromUnitVectors(down,wrist.sub(elbow).normalize()));
    }
    function albumWorld(r,position,quaternion){
      r.root.updateMatrixWorld(true);r.album.position.copy(r.body.worldToLocal(position.clone()));
      r.album.quaternion.copy(r.body.getWorldQuaternion(new T.Quaternion()).invert()).multiply(quaternion);
    }
    function followPalm(r){
      r.root.updateMatrixWorld(true);
      const palm=r.body.worldToLocal(r.forearms[1].localToWorld(new T.Vector3(0,-.32,.012)));
      r.album.position.set(palm.x-.18,palm.y+.08,palm.z+.02);
    }
    function pose(r,time,dt,walking){
      const browse=r.state==='browsing',picking=r.state==='picking',examining=r.state==='examining',paying=payStates.includes(r.state);
      const waiting=r.state.startsWith('want-');
      if(!r.path){const target=(browse||picking||examining)?(r.slot===1?-Math.PI/2:Math.PI/2):(paying?Math.PI/2:r.yaw);r.yaw+=Math.atan2(Math.sin(target-r.yaw),Math.cos(target-r.yaw))*Math.min(1,dt*5);}
      r.walkBlend+=(walking-r.walkBlend)*Math.min(1,dt*8);r.root.rotation.y=r.yaw;
      r.root.position.set(r.position[0],.08-Math.pow(Math.sin(r.step),2)*.022*r.walkBlend,r.position[1]);
      r.legs[0].rotation.x=Math.sin(r.step)*.26*r.walkBlend;r.legs[1].rotation.x=-Math.sin(r.step)*.26*r.walkBlend;
      r.body.rotation.z=Math.sin(r.step*.5)*.009*r.walkBlend;
      r.head.rotation.x=browse||picking?.14:examining||paying?.25:.025;
      r.head.rotation.y=browse?Math.sin(time*.37+r.index)*.06:waiting?Math.sin(time*.35)*.08:0;
      r.arms.forEach(a=>{a.position.y=.63;a.rotation.set(0,0,0);});r.forearms.forEach(a=>a.rotation.set(0,0,0));
      r.arms[0].rotation.x=Math.sin(r.step+Math.PI)*.15*r.walkBlend;r.arms[1].rotation.x=-Math.sin(r.step+Math.PI)*.15*r.walkBlend;
      r.album.visible=r.carrying||picking||examining;r.album.rotation.set(-.04,0,0);
      if(browse||picking){r.arms[1].position.y=.81;r.arms[1].rotation.x=-1.40+Math.sin(time*.85)*.012;r.forearms[1].rotation.x=-.14;r.album.rotation.x=-1.20;}
      else if(examining){
        const withdraw=clamp(r.elapsed/1.3,0,1),lower=clamp((r.elapsed-1.3)/1.1,0,1);
        r.arms[1].position.y=mix(.81,.63,lower);r.arms[1].rotation.x=mix(-1.40,-.45,lower);
        r.forearms[1].rotation.x=mix(mix(-.14,-1.50,withdraw),-1.0,lower);r.album.rotation.x=mix(-1.20,-.08,lower);
      }else if(r.carrying){r.arms[1].rotation.x=-.42;r.arms[1].rotation.z=-.08;r.forearms[1].rotation.x=-.14;}
      if(r.album.visible)followPalm(r);
      r.root.updateMatrixWorld(true);
      const heldPosition=r.album.getWorldPosition(new T.Vector3()),heldQuaternion=r.album.getWorldQuaternion(new T.Quaternion());
      const heldHand=r.forearms[1].localToWorld(new T.Vector3(0,-.32,.012));
      const recordSpot=new T.Vector3(...checkoutStation.albumSpot),recordHand=new T.Vector3(...checkoutStation.recordHand);
      const leftRest=r.forearms[0].localToWorld(new T.Vector3(0,-.32,.012));
      const pocket=r.root.localToWorld(new T.Vector3(-.22,1.03,.19)),scanHand=new T.Vector3(...checkoutStation.scanHand);
      r.phone.visible=false;r.recordOnCounter=false;
      if(r.state==='align-counter'){
        const target=recordHand.clone();target.x-=.12;
        reach(r,heldHand.lerp(target,ease(r.elapsed/.8)));followPalm(r);
      }else if(r.state==='place-record'){
        const u=ease(r.elapsed/1.65),p=r.albumFrom.clone().lerp(recordSpot,u);p.y+=Math.sin(Math.PI*u)*.14;
        const hand=r.handFrom.clone().lerp(recordHand,u);hand.y+=Math.sin(Math.PI*u)*.13;reach(r,hand);
        albumWorld(r,p,r.albumQuaternion.clone().slerp(flatRecord,u));
      }else if(['reach-phone','scan-code','confirm-payment','put-phone-away'].includes(r.state)){
        albumWorld(r,recordSpot,flatRecord);r.recordOnCounter=true;
        let hand;
        if(r.state==='reach-phone'){const clear=new T.Vector3(.39,1.26,4.10),returnHand=r.elapsed<.35?r.handFrom.clone().lerp(clear,ease(r.elapsed/.35)):clear.lerp(heldHand,ease((r.elapsed-.35)/.65));reach(r,returnHand);hand=r.leftHandFrom.clone().lerp(pocket,ease(r.elapsed/.9));r.phone.visible=r.elapsed>.70;}
        else if(r.state==='scan-code'){hand=pocket.clone().lerp(scanHand,ease(r.elapsed/.85));r.phone.visible=true;}
        else if(r.state==='confirm-payment'){hand=scanHand.clone();hand.y+=Math.sin(time*2)*.006;r.phone.visible=true;}
        else{hand=scanHand.clone().lerp(pocket,ease(r.elapsed/1.1));r.phone.visible=r.elapsed<.85;}
        reach(r,hand,0);r.phoneMaterial.map=phoneTextures[r.state==='confirm-payment'?1:0];
      }else if(r.state==='pick-up-record'){
        const clear=new T.Vector3(.39,1.26,4.10),liftedHand=recordHand.clone();liftedHand.y=1.39;
        let hand,p,q;
        if(r.elapsed<.7){
          hand=r.elapsed<.32?r.handFrom.clone().lerp(clear,ease(r.elapsed/.32)):clear.lerp(recordHand,ease((r.elapsed-.32)/.38));
          p=recordSpot.clone();q=flatRecord.clone();
        }else if(r.elapsed<1.15){
          const u=ease((r.elapsed-.7)/.45);hand=recordHand.clone().lerp(liftedHand,u);p=recordSpot.clone();p.y=mix(recordSpot.y,1.43,u);q=flatRecord.clone();
        }else if(r.elapsed<2.05){
          const u=ease((r.elapsed-1.15)/.90),handEnd=heldHand.clone();handEnd.y=1.39;
          hand=liftedHand.clone().lerp(handEnd,u);p=new T.Vector3(recordSpot.x,1.43,recordSpot.z).lerp(new T.Vector3(heldPosition.x,1.43,heldPosition.z),u);q=flatRecord.clone().slerp(heldQuaternion,u);
        }else{
          const u=ease((r.elapsed-2.05)/.65),handStart=heldHand.clone();handStart.y=1.39;hand=handStart.lerp(heldHand,u);
          p=heldPosition.clone();p.y=mix(1.43,heldPosition.y,u);q=heldQuaternion;
        }
        reach(r,hand);reach(r,r.leftHandFrom.clone().lerp(leftRest,ease(r.elapsed/.5)),0);albumWorld(r,p,q);r.recordOnCounter=r.elapsed<.7;
      }

      if(r.phone.visible){r.root.updateMatrixWorld(true);r.phone.position.copy(r.forearms[0].localToWorld(new T.Vector3(0,-.32,.012))).add(new T.Vector3(.018,.065,.016));r.phone.rotation.set(-.12,-.36,.04);}
      r.phone.visible=r.phone.visible&&r.root.visible;r.bag.rotation.z=Math.sin(r.step)*.035*r.walkBlend;
      r.shadow.visible=r.root.visible;r.shadow.position.set(r.position[0],.098,r.position[1]);r.action=waiting?'waiting':r.state;
    }
    function initialize(){
      if(initialized)return;initialized=true;
      rigs.forEach((r,index)=>{
        r.position=outside.slice();r.slot=null;r.root.visible=false;r.state='outside';r.action='outside';r.elapsed=0;r.dwell=index===0?1.2:0;
        pose(r,0,0,0);
      });
    }
    return {
      rigs,initialize,
      navigationAgents(){return rigs.filter(r=>r.root.visible).map(r=>({x:r.position[0],z:r.position[1],radius:r.radius,visible:true,moving:mover===r}));},
      update(time,dt){
        initialize();clock+=dt;
        rigs.forEach(r=>{
          if(r.path||r.state.startsWith('want-'))return;
          r.elapsed+=dt;
          if(r.state==='browsing'&&r.elapsed>=r.dwell)change(r,'picking');
          else if(r.state==='picking'&&r.elapsed>=2.6){r.carrying=true;change(r,'examining');}
          else if(r.state==='examining'&&r.elapsed>=6.4)change(r,'want-checkout');
          else if(r.state==='align-counter'&&r.elapsed>=.85)change(r,'place-record');
          else if(r.state==='place-record'&&r.elapsed>=1.65)change(r,'reach-phone');
          else if(r.state==='reach-phone'&&r.elapsed>=1.1)change(r,'scan-code');
          else if(r.state==='scan-code'&&r.elapsed>=2.8)change(r,'confirm-payment');
          else if(r.state==='confirm-payment'&&r.elapsed>=1.6){r.paid=true;change(r,'put-phone-away');}
          else if(r.state==='put-phone-away'&&r.elapsed>=1.2)change(r,'pick-up-record');
          else if(r.state==='pick-up-record'&&r.elapsed>=2.75)change(r,'want-exit');
          else if(r.state==='outside'&&r.elapsed>=r.dwell){r.position=outside.slice();change(r,'want-entry');}
        });
        if(!mover)chooseMover();
        let moved=0;
        if(mover){
          const r=mover,target=r.path[r.pathIndex],dx=target[0]-r.position[0],dz=target[1]-r.position[1],distance=Math.hypot(dx,dz);
          const wanted=Math.atan2(dx,dz),turn=Math.atan2(Math.sin(wanted-r.yaw),Math.cos(wanted-r.yaw));
          r.yaw+=clamp(turn,-dt*3.2,dt*3.2);
          if(Math.abs(turn)<.18||distance<.04){
            r.speed=Math.min(.56,r.speed+dt*.80);
            const step=Math.min(distance,r.speed*dt),next=distance>1e-7?[r.position[0]+dx/distance*step,r.position[1]+dz/distance*step]:target.slice();
            if(navigation.segment(r.position,next,r.radius,others(r))){r.position=next;r.step+=step*10.2;moved=step/Math.max(dt,.001)/.56;}
            else{const previous=r.state;r.path=null;mover=null;r.state=previous==='walk-entry'?'want-entry':previous==='walk-exit'?'want-exit':'want-checkout';r.waitReason='让行';r.nextPlan=clock+.6;r.speed=0;}
            // Reach the checked corner exactly before taking the next segment.
            if(r.path&&Math.hypot(target[0]-r.position[0],target[1]-r.position[1])<1e-6){r.pathIndex++;if(r.pathIndex>=r.path.length)finishMove(r);}
          }else r.speed=0;
        }
        rigs.forEach(r=>pose(r,time,dt,mover===r?moved:0));
        if(rigs.length>1&&rigs.every(r=>r.root.visible))minimumSeparation=Math.min(minimumSeparation,Math.hypot(rigs[0].position[0]-rigs[1].position[0],rigs[0].position[1]-rigs[1].position[1]));
        return rigs.some(r=>r.state==='want-entry'&&entrySlot(r)>=0||r.state==='want-exit'||r.state==='walk-entry'&&r.position[1]>5.85||r.state==='walk-exit');
      },
      inspect(){
        const collisions=[];
        rigs.forEach(r=>{if(!r.root.visible)return;r.root.updateMatrixWorld(true);r.root.traverseVisible(o=>{if(!o.isMesh)return;if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();const b=o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);navigation.intersections(b).forEach(hit=>collisions.push({shopper:r.index,state:r.state,fixture:hit.name,overlap:hit.overlap}));});});
        return{collisions,minimumSeparation:Number.isFinite(minimumSeparation)?minimumSeparation:null,mover:mover?mover.index:null,agents:this.stats()};
      },
      stats(){return rigs.map(r=>({action:r.action,state:r.state,position:r.position.slice(),visible:r.root.visible,waiting:r.waitReason,slot:r.slot,paid:r.paid,phoneVisible:r.phone.visible,recordOnCounter:r.recordOnCounter,visits:r.visits}));}
    };
  };
})();
