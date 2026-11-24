/* Front-of-house checkout and an outward-opening entrance at the observation cut. */
(function(){
  'use strict';
  window.createFrontCheckout=function(ctx){
    const {T,architecture,dynamic,material,group,box,cylinder,rod,plane,canvasTexture,batch,solid}=ctx;
    const fixed=group(architecture),live=group(dynamic),storefront=group(live);
    // The observation cut hides only this facade. A camera near plane must
    // never perform the cut, because guests also cross it while entering.
    storefront.visible=false;
    const wood=material('#745b42'),top=material('#a18a64'),dark=material('#263b3c'),metal=material('#8d8f79',.58,.18);
    const counter=group(fixed,.98,.08,3.95);
    box(.78,.98,2.60,wood,0,.51,0,counter,.018);
    box(.84,.075,2.70,top,0,1.0325,0,counter,.014);
    for(const z of [-.86,0,.86]){box(.018,.75,.75,material('#846c4e'),-.398,.49,z,counter,.008);box(.020,.025,.36,metal,-.411,.70,z,counter,.004);}
    solid(counter,'前场收银吧台');
    const qr=group(fixed,.78,1.15,3.62,-Math.PI/3);
    box(.29,.026,.22,metal,0,.014,0,qr,.006);
    const display=group(qr,0,.22,0);display.rotation.x=-.12;
    box(.27,.38,.025,material('#07a85a'),0,0,0,display,.007);
    const qrTexture=canvasTexture(256,320,(c,w,h)=>{
      c.fillStyle='#07c160';c.fillRect(0,0,w,h);
      c.fillStyle='#ffffff';c.fillRect(14,62,w-28,218);
      c.font='bold 27px sans-serif';c.textAlign='center';c.fillText('微信支付',w/2,39);
      const rows=window.CHECKOUT_QR,cell=6,margin=(w-rows.length*cell)/2;
      c.fillStyle='#152c24';rows.forEach((row,y)=>row.split('').forEach((on,x)=>{if(on==='1')c.fillRect(margin+x*cell,80+y*cell,cell,cell);}));
      c.fillStyle='#07c160';c.fillRect(112,151,32,32);c.fillStyle='#ffffff';
      c.beginPath();c.ellipse(123,163,9,7,0,0,Math.PI*2);c.ellipse(132,170,8,6,0,0,Math.PI*2);c.fill();
      c.fillStyle='#ffffff';c.font='21px sans-serif';c.fillText('扫一扫付款',w/2,307);
    });
    plane(.245,.34,new T.MeshBasicMaterial({map:qrTexture,toneMapped:false}),0,0,.014,display);

    // A restrained accessory rack keeps the counter tied to the audio-shop
    // story without crowding the QR placard or the album hand-off point. It
    // sits on the far/right rear of the counter and carries only three tiny
    // real meshes: a stylus box, an ear-tip box and a record-cleaning brush.
    const accessoryRack=group(counter,.17,1.075,.76);
    const rackWood=material('#6d523b'),rackEdge=material('#b69a6d'),packDark=material('#32494a'),packLight=material('#d6c89e');
    box(.27,.028,.34,rackWood,0,.015,0,accessoryRack,.004);
    box(.27,.025,.34,rackEdge,0,.185,0,accessoryRack,.004);
    for(const x of [-.12,.12])box(.025,.22,.025,rackWood,x,.105,0,accessoryRack,.003);
    box(.22,.018,.025,rackEdge,0,.105,-.16,accessoryRack,.002);
    box(.065,.052,.085,packDark,-.070,.052,.015,accessoryRack,.004);
    box(.050,.012,.060,packLight,-.070,.085,.015,accessoryRack,.002);
    box(.072,.055,.060,packLight,.060,.218,.015,accessoryRack,.004);
    box(.052,.012,.042,packDark,.060,.250,.015,accessoryRack,.002);
    rod([-.01,.208,.03],[-.01,.208,.12],.008,rackEdge,accessoryRack);
    rod([-.01,.208,.12],[.075,.208,.12],.009,packDark,accessoryRack);

    // The facade is hidden in the fixed-window view, while its real outward
    // door and collision/ready state still operate. Detail views can show it.
    box(1.55,.035,.22,metal,-.25,.090,6.43,fixed,.004);
    for(const x of [-1.02,.52])solid(box(.055,3.18,.08,dark,x,1.68,6.65,storefront,.004),'前门门框');
    box(1.59,.055,.08,dark,-.25,3.25,6.65,storefront,.004);
    const door=group(storefront,-1.00,.10,6.66);
    box(1.48,.045,.045,dark,.74,.025,0,door,.004);box(1.48,.045,.045,dark,.74,3.08,0,door,.004);
    for(const x of [.02,1.46])box(.04,3.08,.045,dark,x,1.55,0,door,.004);
    box(1.40,3.01,.012,new T.MeshStandardMaterial({color:'#91b4b9',transparent:true,opacity:.035,depthWrite:false}),.74,1.55,0,door);
    rod([1.31,1.10,.05],[1.31,1.44,.05],.018,metal,door);
    batch(door);
    const lamp=group(fixed,.98,0,4.02);
    cylinder(.09,.11,.045,metal,0,5.25,0,lamp,16);
    rod([0,5.23,0],[0,3.80,0],.012,dark,lamp);
    cylinder(.09,.23,.18,material('#52645d'),0,3.73,0,lamp,20);
    const bulb=new T.MeshBasicMaterial({color:'#ffddb2',toneMapped:false});
    cylinder(.213,.213,.012,bulb,0,3.633,0,lamp,20);
    let opening=0,lastRequested=false,payment=false;
    return{counter,door,storefront,lampAnchor:{object:lamp,point:new T.Vector3(0,3.61,0),intensity:1.8,range:4.0},
      point:[.11,4.25],outside:[-.25,8.15],albumSpot:[.74,1.17,4.10],recordHand:[.56,1.22,4.10],scanHand:[.47,1.34,4.47],
      ready(){return opening>.90;},
      update(time,dt,requested,agents){
        lastRequested=!!requested;opening+=(Number(lastRequested)-opening)*Math.min(1,dt*3.5);door.rotation.y=-opening*Math.PI/2;
        payment=(agents||[]).some(a=>a.state==='confirm-payment');
      },
      stats(){return{frontDoorOpen:opening>.15,checkoutPaid:payment,location:'front',rearDoorUsed:false};}
    };
  };
})();
