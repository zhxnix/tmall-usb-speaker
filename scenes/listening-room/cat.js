/* A small shop cat: aisle patrol, a ballistic jump onto its cabinet, a nap,
 * a jump down, and a second resting place near the listening corner. */
(function(){
  'use strict';
  window.createShopCat=function(ctx){
    const {T,architecture,dynamic,material,group,box,cylinder,sphere,rod,tube,plane,canvasTexture,batch,navigation,getShoppers}=ctx;
    const M={fur:material('#be9569'),stripe:material('#8f613e'),cream:material('#e5ddc9'),
      pink:material('#b58177'),dark:material('#28332e'),eye:material('#a2aa73'),wood:material('#79684e'),pad:material('#788b83')};
    const cabinet=group(architecture,-3.77,.08,4.75);
    box(.78,.62,.80,M.wood,0,.31,0,cabinet,.018);
    box(.84,.055,.84,material('#a18b65'),0,.65,0,cabinet,.012);
    for(const y of [.18,.45]){box(.71,.245,.025,material('#867354'),0,y,.412,cabinet,.007);box(.16,.023,.025,material('#baa575',.5,.2),0,y+.055,.435,cabinet,.004);}
    box(.72,.03,.72,M.pad,0,.694,0,cabinet,.014);
    for(let i=0;i<6;i++)box(.012,.003,.70,material('#a3aea0'),-.27+i*.108,.711,0,cabinet);
    const floorMat=plane(.78,.76,material('#826a5b'),3.65,.087,4.22,architecture);floorMat.rotation.x=-Math.PI/2;
    const nest=group(architecture,3.65,.08,4.25),felt=material('#9a8266'),lining=material('#798779');
    // A padded cloth bed: rounded stuffed rim, soft piping and a raised,
    // slightly indented cushion instead of a rigid flat saucer.
    sphere(.385,.052,.335,felt,0,.048,0,nest,24);
    const bedCloth=new T.MeshStandardMaterial({color:'#b29a7c',roughness:1});
    const rimGeometry=new T.TorusGeometry(.298,.078,10,40);
    const rimPositions=rimGeometry.attributes.position;
    for(let i=0;i<rimPositions.count;i++){
      const x=rimPositions.getX(i),y=rimPositions.getY(i),a=Math.atan2(y,x);
      rimPositions.setZ(i,rimPositions.getZ(i)+Math.sin(a*5)*.006+Math.cos(a*3)*.004);
    }
    rimGeometry.computeVertexNormals();
    const bolster=new T.Mesh(rimGeometry,bedCloth);bolster.position.y=.113;
    bolster.rotation.x=-Math.PI/2;bolster.scale.set(1.10,.94,.90);nest.add(bolster);
    const cushionMaterial=new T.MeshStandardMaterial({color:'#9ca38b',roughness:1});
    sphere(.295,.052,.253,cushionMaterial,0,.108,0,nest,24);
    const piping=new T.Mesh(new T.TorusGeometry(.298,.005,5,40),material('#d0baa0',1));
    piping.position.y=.182;piping.rotation.x=-Math.PI/2;piping.scale.set(1.10,.94,1);nest.add(piping);
    // Shallow stitched depressions make the centre read as filled fabric.
    for(const x of [-.11,.11])for(const z of [-.08,.08])sphere(.018,.005,.014,lining,x,.155,z,nest,8);
    const root=group(dynamic);root.name='Orange and cream shop cat';root.scale.setScalar(.65);
    const catRig=createRiggedShopCat(T,root);
    const rigState={kind:'idle',sleep:0,walking:0,jumping:false,jump:0,paw:0};
    const shadowTexture=canvasTexture(64,64,(c,w,h)=>{const g=c.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(8,13,13,.40)');g.addColorStop(1,'rgba(8,13,13,0)');c.fillStyle=g;c.fillRect(0,0,w,h);});
    const shadowMaterial=new T.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false});
    const floorShadow=plane(.48,.72,shadowMaterial,0,.097,0,dynamic);floorShadow.rotation.x=-Math.PI/2;floorShadow.renderOrder=3;
    const bedShadow=plane(.50,.64,shadowMaterial,-3.77,.794,4.75,dynamic);bedShadow.rotation.x=-Math.PI/2;bedShadow.renderOrder=3;
    const nestShadow=plane(.48,.63,shadowMaterial,3.65,.241,4.25,dynamic);nestShadow.rotation.x=-Math.PI/2;nestShadow.renderOrder=3;
    const yarn=group(dynamic,2.60,.15,4.70);
    sphere(.075,.075,.075,material('#9f625d'),0,0,0,yarn,14);
    for(let i=0;i<3;i++){
      const ring=new T.Mesh(new T.TorusGeometry(.072,.0035,4,24),material('#c79a83'));ring.rotation.set(i*.72,.35+i*.54,.22*i);yarn.add(ring);
    }
    yarn.traverse(o=>{if(o.isMesh)o.castShadow=false;});batch(yarn);
    const yarnShadow=plane(.22,.20,new T.MeshBasicMaterial({map:shadowTexture,transparent:true,opacity:.70,depthWrite:false}),2.60,.097,4.70,dynamic);
    yarnShadow.rotation.x=-Math.PI/2;yarnShadow.renderOrder=3;
    const FLOOR=.080,TOP=.790,NEST=.225,ENTRY=[2.15,5.90],APPROACH=[-2.80,4.65],BED=[-3.77,4.85],RUG=[3.65,4.25],NEST_APPROACH=[3.35,4.70];
    let yaw=-Math.PI/2,sleepBlend=0,action='walking',jumpU=0,platform=0,elapsed=4,cycle=0,steps=0,initialized=false,blocked=false,sleepRemaining=0;
    let schedule=[],duration=0,motionAccumulator=0,blockedSeconds=0,yieldSeconds=0,recovery=null,recoveryCount=0,nextRecoveryAttempt=0;
    const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
    const ease=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
    function plan(){
      schedule=[];duration=0;
      function add(kind,seconds,a,b,extra={}){const item=Object.assign({kind,begin:duration,end:duration+seconds,a:a.slice(),b:(b||a).slice()},extra);schedule.push(item);duration+=seconds;}
      add('walking',7,ENTRY,[-.615,5.90]);
      add('walking',4,[-.615,5.90],[-.615,4.65]);
      add('walking',6,[-.615,4.65],APPROACH);
      add('preparing',1,APPROACH,null,{yaw:-1.37});
      add('jumping-up',1.15,APPROACH,BED);
      add('landing',1.85,BED,null,{height:TOP,yaw:.28});
      if(cycle%2)add('watching-snow',9,BED,null,{height:TOP,yaw:-Math.PI/2});
      add('settling',4,BED,null,{height:TOP});
      add('sleeping-on-cabinet',[75,90,65][cycle%3],BED,null,{height:TOP,yaw:.28,sleep:1});
      add('waking',3,BED,null,{height:TOP,yaw:.285});
      add('jumping-down',1.15,BED,APPROACH);
      add('walking',6,APPROACH,[-.615,4.65]);
      add('sniffing-records',8,[-.615,4.65],null,{yaw:-1.25});
      add('walking',5,[-.615,4.65],[-.615,5.90]);
      add('walking',7,[-.615,5.90],ENTRY);
      add('walking',4,ENTRY,[2.25,5.00]);
      add('playing-with-yarn',28,[2.25,5.00]);
      add('walking',5,[2.25,5.00],NEST_APPROACH);
      add('entering-bed',1.4,NEST_APPROACH,RUG);
      add('looking-around',3,RUG,null,{height:NEST,yaw:-.6});
      add('sleeping-in-bed',[100,120,85][cycle%3],RUG,null,{height:NEST,yaw:-.6,sleep:1});
      add('waking',3,RUG,null,{height:NEST,yaw:0});
      add('leaving-bed',1.4,RUG,NEST_APPROACH);
      add('walking',5,NEST_APPROACH,[2.80,3.90]);
      add('sniffing-table',8,[2.80,3.90],null,{yaw:2.45});
      add('walking',5,[2.80,3.90],[2.30,5.50]);
      add('grooming',10,[2.30,5.50],null,{yaw:-.45});
      add('walking',3,[2.30,5.50],ENTRY);
      add('looking-around',5,ENTRY,null,{yaw:0});
    }
    plan();
    function sample(t){
      const seg=schedule.find(p=>t>=p.begin&&t<p.end)||schedule[schedule.length-1];
      const u=clamp((t-seg.begin)/(seg.end-seg.begin),0,1),e=ease(u),phase=t-seg.begin;
      const dx=seg.b[0]-seg.a[0],dz=seg.b[1]-seg.a[1];
      const state={x:seg.a[0]+dx*e,z:seg.a[1]+dz*e,y:seg.height||FLOOR,yaw:seg.yaw==null?Math.atan2(dx,dz):seg.yaw,
        kind:seg.kind,sleep:seg.sleep||0,platform:seg.height===TOP,backward:!!seg.backward,jump:0,paw:0,remaining:seg.end-t,ball:[2.60,4.70],inNest:seg.height===NEST};
      if(seg.kind==='jumping-up'||seg.kind==='jumping-down'){
        const up=seg.kind==='jumping-up';
        state.x=seg.a[0]+dx*(up?u:clamp((u-.12)/.88,0,1));
        state.z=seg.a[1]+dz*(up?ease((u-.68)/.32):ease(u/.20));state.jump=u;
        state.y=up?FLOOR+(TOP-FLOOR+2.8)*u-2.8*u*u:TOP+1.90*u-(TOP+1.90-FLOOR)*u*u;
      }else if(seg.kind==='entering-bed'||seg.kind==='leaving-bed'){
        state.y=(seg.kind==='entering-bed'?FLOOR+(NEST-FLOOR)*e:NEST+(FLOOR-NEST)*e)+Math.sin(Math.PI*u)*.07;state.inNest=u>.5;
      }else if(seg.kind==='settling'){
        const angle=u*Math.PI*2;state.x+=Math.sin(angle)*.025;state.z+=Math.cos(angle)*.025;state.yaw=angle+Math.PI/2;
      }else if(seg.kind==='playing-with-yarn'){
        const p=phase%14;
        if(p<2){const k=ease(p/2);state.x=2.25+.14*k;state.z=5.00-.11*k;}
        else if(p<5){state.x=2.39;state.z=4.89;if(p<3)state.paw=Math.sin((p-2)*Math.PI);if(p>=3){const k=ease((p-3)/2);state.ball=[2.60+.40*k,4.70-.35*k];}}
        else if(p<7){const k=ease((p-5)/2);state.x=2.39+.41*k;state.z=4.89-.34*k;state.y+=Math.sin(k*Math.PI)*.07;state.ball=[3.00,4.35];}
        else if(p<10){state.x=2.80;state.z=4.55;state.ball=p<8?[3.00,4.35]:[3.00-.40*ease((p-8)/2),4.35+.35*ease((p-8)/2)];if(p<8)state.paw=Math.sin((p-7)*Math.PI);}
        else{const k=ease((p-10)/4);state.x=2.80-.55*k;state.z=4.55+.45*k;}
        state.yaw=Math.atan2(state.ball[0]-state.x,state.ball[1]-state.z);
      }
      return state;
    }
    function moveAndAnimate(time,dt){
      if(!initialized){initialized=true;const initial=sample(elapsed);root.position.set(initial.x,initial.y,initial.z);yaw=initial.yaw;}
      const extras=getShoppers?getShoppers():[];
      let distance=0,state=sample(elapsed);
      if(recovery){
        state.kind=recovery.phase==='escape'?'backing-away':'making-room';state.backward=recovery.phase==='escape';state.sleep=0;blocked=false;
        if(recovery.phase==='wait'){
          yieldSeconds=Math.max(0,yieldSeconds-dt);state.kind='waiting-for-shopper';
          if(!yieldSeconds){
            let path=null;
            if(recovery.escape){
              const dx=recovery.origin[0]-root.position.x,dz=recovery.origin[1]-root.position.z,count=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.025));let clear=true;
              for(let i=1;i<=count;i++)if(!navigation.catPoseFree(root.position.x+dx*i/count,FLOOR,root.position.z+dz*i/count,recovery.fixedYaw,extras)){clear=false;break;}
              if(clear)path=[[root.position.x,root.position.z],recovery.origin];
            }else path=navigation.findPath([root.position.x,root.position.z],recovery.origin,.36,extras);
            if(path){recovery.phase='return';recovery.path=path;recovery.index=1;}else yieldSeconds=.6;
          }
        }else{
          const target=recovery.path[recovery.index],dx=target[0]-root.position.x,dz=target[1]-root.position.z,length=Math.hypot(dx,dz);
          const desired=recovery.escape?recovery.fixedYaw:Math.atan2(dx,dz),turn=Math.atan2(Math.sin(desired-yaw),Math.cos(desired-yaw)),nextYaw=yaw+turn*Math.min(1,dt*8);
          if(navigation.catPoseFree(root.position.x,root.position.y,root.position.z,nextYaw,extras))yaw=nextYaw;
          const step=Math.abs(turn)<.25?Math.min(length,dt*.40):0;
          const nx=root.position.x+(length?dx/length*step:0),nz=root.position.z+(length?dz/length*step:0);
          if(navigation.catPoseFree(nx,root.position.y,nz,yaw,extras)){distance=step;root.position.x=nx;root.position.z=nz;recovery.stalled=0;}else recovery.stalled+=dt;
          if(length<.006&&navigation.catPoseFree(target[0],root.position.y,target[1],yaw,extras)){
            root.position.x=target[0];root.position.z=target[1];recovery.index++;
            if(recovery.index>=recovery.path.length){
              if(recovery.phase==='out'||recovery.phase==='escape'){recovery.phase='wait';yieldSeconds=1.8;}
              else{elapsed=recovery.routeTime;recovery=null;blockedSeconds=0;}
            }
          }else if(recovery.stalled>.7&&!recovery.escape){
            const goal=recovery.phase==='out'?recovery.spot:recovery.origin;
            const path=navigation.findPath([root.position.x,root.position.z],goal,.36,extras);
            if(path){recovery.path=path;recovery.index=1;}recovery.stalled=0;
          }
        }
      }else if(yieldSeconds>0){yieldSeconds=Math.max(0,yieldSeconds-dt);state.kind='waiting-for-shopper';state.sleep=0;blocked=false;
      }else{
        let nextTime=elapsed+dt;const wrap=nextTime>=duration;if(wrap)nextTime-=duration;
        const candidate=sample(nextTime),turn=Math.atan2(Math.sin(candidate.yaw-yaw),Math.cos(candidate.yaw-yaw)),nextYaw=yaw+turn*Math.min(1,dt*5);
        blocked=!!navigation&&!navigation.catPoseFree(candidate.x,candidate.y,candidate.z,nextYaw,extras);
        if(!blocked){
          distance=Math.hypot(candidate.x-root.position.x,candidate.z-root.position.z);elapsed=nextTime;yaw=nextYaw;root.position.set(candidate.x,candidate.y,candidate.z);state=candidate;blockedSeconds=0;
          if(wrap){cycle++;plan();}
        }else{
          blockedSeconds+=dt;state.sleep=0;
          // Rotation is independent of forward movement, so an obstructed next
          // step cannot freeze a turn at a cabinet corner.
          if(navigation.catPoseFree(root.position.x,root.position.y,root.position.z,nextYaw,extras))yaw=nextYaw;
          // Use a real, collision-checked detour to leave the crossing clear.
          // The route clock resumes only after walking back to this exact point.
          if(blockedSeconds>1.3&&state.kind==='walking'&&root.position.y<.12&&time>=nextRecoveryAttempt){
            nextRecoveryAttempt=time+.8;
            const origin=[root.position.x,root.position.z],spots=[[2.15,5.90],[-1.55,6.15]];
            spots.sort((a,b)=>Math.hypot(a[0]-origin[0],a[1]-origin[1])-Math.hypot(b[0]-origin[0],b[1]-origin[1]));
            for(const spot of spots){if(Math.hypot(spot[0]-origin[0],spot[1]-origin[1])<.55)continue;const path=navigation.findPath(origin,spot,.36,extras);
              if(path){recovery={phase:'out',origin,spot,path,index:1,routeTime:elapsed,stalled:0};recoveryCount++;break;}
            }
            if(!recovery){
              // A conservative start circle can overlap an approaching shopper.
              // Step backwards/sideways using the cat's actual oriented footprint,
              // and park only where a human-sized passage remains alongside it.
              const nearest=extras.slice().sort((a,b)=>Math.hypot(a.x-origin[0],a.z-origin[1])-Math.hypot(b.x-origin[0],b.z-origin[1]))[0];
              const away=nearest?[origin[0]-nearest.x,origin[1]-nearest.z]:[-Math.sin(yaw),-Math.cos(yaw)];
              const directions=[away,...[-.70,.70,0,-1.15,1.15].map(a=>[-Math.sin(yaw+a),-Math.cos(yaw+a)])];
              escape:for(const length of [.55,.42,.70,.28])for(const direction of directions){
                const scale=length/Math.max(.001,Math.hypot(...direction)),spot=[origin[0]+direction[0]*scale,origin[1]+direction[1]*scale];
                if(!navigation.free(spot[0]+.85,spot[1],.43,[],[.04,2.2])&&!navigation.free(spot[0]-.85,spot[1],.43,[],[.04,2.2]))continue;
                if(nearest&&Math.hypot(spot[0]-nearest.x,spot[1]-nearest.z)<Math.hypot(origin[0]-nearest.x,origin[1]-nearest.z)+.10)continue;
                let clear=true;const count=Math.ceil(length/.025);
                for(let i=1;i<=count;i++)if(!navigation.catPoseFree(origin[0]+(spot[0]-origin[0])*i/count,FLOOR,origin[1]+(spot[1]-origin[1])*i/count,yaw,extras)){clear=false;break;}
                if(clear){recovery={phase:'escape',escape:true,fixedYaw:yaw,origin,spot,path:[origin,spot],index:1,routeTime:elapsed,stalled:0};recoveryCount++;break escape;}
              }
            }
          }
        }
      }
      state.x=root.position.x;state.y=root.position.y;state.z=root.position.z;
        steps+=distance*13.5*(state.backward?-1:1);const walking=blocked?0:clamp(distance/Math.max(dt,.001)/.50,0,1);
        action=blocked?'waiting-clearance':state.kind;platform=state.platform?1:0;jumpU=state.jump;sleepRemaining=state.sleep?state.remaining:0;
        root.rotation.y=yaw;sleepBlend+=(state.sleep-sleepBlend)*Math.min(1,dt*1.5);
        const jumping=state.kind.indexOf('jumping')===0;
        rigState.kind=state.kind;rigState.sleep=sleepBlend;rigState.walking=walking;
        rigState.jumping=jumping;rigState.jump=jumpU;rigState.paw=state.paw;
        floorShadow.position.set(state.x,.097,state.z);floorShadow.rotation.z=-yaw;floorShadow.visible=!platform&&!state.inNest;nestShadow.visible=!!state.inNest;
        const height=Math.max(0,state.y-FLOOR);floorShadow.scale.set(1+height*.35,1+height*.35,1);shadowMaterial.opacity=1/(1+height*1.5);
        bedShadow.visible=platform===1;bedShadow.position.set(state.x,.794,state.z);bedShadow.rotation.z=-yaw;
        yarn.position.set(state.ball[0],.15,state.ball[1]);yarnShadow.position.set(state.ball[0],.097,state.ball[1]);yarn.rotation.x=(state.ball[1]-4.70)*12;yarn.rotation.z=-(state.ball[0]-2.60)*12;
    }
    return {root,cabinet,nest,catRig,
      navigationAgent(){return root.position.y>.5?null:{x:root.position.x,z:root.position.z,radius:.36,visible:true};},
      update(time,dt){
        if(!initialized)moveAndAnimate(time,0);
        motionAccumulator+=Math.max(0,dt);
        const step=1/90;
        while(motionAccumulator+1e-9>=step){motionAccumulator-=step;moveAndAnimate(time-motionAccumulator,step);}
        // Keep collision movement at its fixed step. The weighted skeleton only
        // needs one evaluation for the frame that will actually be displayed.
        catRig.update(Math.max(0,dt),time,rigState);
      },

      stats(){return{model:catRig.stats(),ballPosition:yarn.position.toArray(),ballShadowPosition:yarnShadow.position.toArray(),action,position:[root.position.x,root.position.y,root.position.z],yaw,sleeping:sleepBlend>.7,sleepSecondsRemaining:Math.ceil(sleepRemaining),blocked,blockedSeconds:Number(blockedSeconds.toFixed(2)),yielding:!!recovery||yieldSeconds>0,yieldPhase:recovery?recovery.phase:null,recoveryCount,cycle,routeTime:elapsed};}
    };
  };
})();
