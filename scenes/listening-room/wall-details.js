/* Clock and winter wall dressing for the miniature room.
 * The two roots deliberately stay at the scene origin: shop.js applies its
 * room-width transform only to direct children, while these details use the
 * already scaled interior coordinates.
 */
(function(){
  'use strict';
  window.createWallDetails=function(ctx){
    const {T,architecture,dynamic,material,group,box,plane,canvasTexture,batch,sleeve}=ctx;
    const staticRoot=group(architecture),liveRoot=group(dynamic);
    const W={frame:material('#65533f',.68),frameLight:material('#a98d63',.58),
      wallPaper:material('#b39a74',.92),dark:material('#17242a',.7),
      clockBody:material('#20272a',.58,.10),clockEdge:material('#485052',.52,.12),
      brass:material('#b7955b',.48,.18),green:material('#536b50',.92),
      greenLight:material('#78916c',.92),red:material('#8f5c50',.9),
      snow:material('#b8d0d2',.95)};

    // Two framed sleeves from the shared 8x6 atlas. Planes face -X into the
    // shop; each id is used exactly once so the wall reads like a small record
    // shop display rather than two repeated illustrations.
    function wallPrint(id,x,y,z){
      const frame=group(staticRoot,x,y,z,-Math.PI/2);
      // The rotated group presents local XY to the wall. Keep every member in
      // that plane; a prior world-axis frame could project awkwardly into the room.
      box(.86,.86,.055,W.frameLight,0,0,0,frame,.012);
      if(typeof sleeve==='function')sleeve(.70,.70,id,0,0,.04,frame);
      else plane(.70,.70,W.dark,0,0,.04,frame);
      box(.86,.055,.055,W.frame,0,-.4025,.052,frame,.006);
      box(.86,.055,.055,W.frame,0,.4025,.052,frame,.006);
      box(.055,.86,.055,W.frame,-.4025,0,.052,frame,.006);
      box(.055,.86,.055,W.frame,.4025,0,.052,frame,.006);
      return frame;
    }
    wallPrint(0,4.16,3.35,3.25);
    wallPrint(1,4.16,3.35,4.48);
    const shelf=box(.14,.065,1.75,W.frameLight,4.08,2.77,3.86,staticRoot,.012);
    box(.12,.07,.12,W.green,4.03,2.85,3.20,staticRoot,.01);
    for(let i=0;i<5;i++){
      const z=3.30+i*.12;
      const leaf=box(.035,.16,.08,i%2?W.green:W.greenLight,4.01,2.91,z,staticRoot,.006);
      leaf.rotation.x=(i%2?.22:-.22);leaf.rotation.z=(i%2?.30:-.26);
    }

    // Compact warm digital clock above the chimney. Match the pillar width
    // (3.295..4.165) so the outer case reads as part of the masonry rather
    // than a smaller object floating on it. The taller face gives the date and
    // scene-weather line enough pixels to remain legible on the speaker.
    const clockCanvas=document.createElement('canvas');clockCanvas.width=640;clockCanvas.height=560;
    const clockTexture=new T.CanvasTexture(clockCanvas);clockTexture.encoding=T.sRGBEncoding;clockTexture.anisotropy=4;
    const clockMaterial=new T.MeshBasicMaterial({map:clockTexture,transparent:false,toneMapped:false});
    const clockFrame=group(staticRoot,3.73,4.53,1.63);
    box(.87,.82,.075,W.clockBody,0,0,0,clockFrame,.018);
    box(.81,.76,.018,W.clockEdge,0,0,.043,clockFrame,.006);
    box(.75,.72,.010,material('#101a1d',.34),0,0,.057,clockFrame,.004);
    const clockLive=group(liveRoot,3.73,4.53,1.63);
    const screen=plane(.75,.72,clockMaterial,0,0,.064,clockLive);
    const clock={display:'--:--',lastMinute:-1,texture:clockTexture,screen,frame:clockFrame,live:clockLive};
    let weatherData=null,weatherCached=true,weatherRevision=0,drawnWeatherRevision=-1;
    function dateKey(date){return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');}
    function setWeather(response,cached){
      const data=response&&response.data,location=data&&data.location;
      if(!response||response.code!==0||!location||String(location.id)!=='56778'||location.name!=='昆明'||!Array.isArray(data.daily))return false;
      weatherData=response;weatherCached=!!cached;weatherRevision++;return true;
    }
    function todayWeather(date){
      const key=dateKey(date),data=weatherData&&weatherData.data;
      // CMA may return yesterday as the first entry. Always match the local
      // calendar date rather than selecting the first forecast in the array.
      const day=data&&data.daily.find(item=>String(item.date).replace(/\//g,'-')===key);
      return day&&day.dayText?{date:key,condition:String(day.dayText),low:Math.round(day.low),high:Math.round(day.high)}:null;
    }
    if(window.KUNMING_WEATHER_SEED)setWeather(window.KUNMING_WEATHER_SEED,true);
    function drawClock(value,date){
      const c=clockCanvas.getContext('2d'),w=clockCanvas.width,h=clockCanvas.height;
      c.clearRect(0,0,w,h);const bg=c.createLinearGradient(0,0,0,h);bg.addColorStop(0,'#1a292b');bg.addColorStop(.5,'#0d171a');bg.addColorStop(1,'#091215');c.fillStyle=bg;c.fillRect(0,0,w,h);
      const on='#f1f5d9',off='rgba(100,136,116,.23)',th=18,digitW=100,digitH=230;
      const maps=[[1,1,1,1,1,1,0],[0,1,1,0,0,0,0],[1,1,0,1,1,0,1],[1,1,1,1,0,0,1],[0,1,1,0,0,1,1],[1,0,1,1,0,1,1],[1,0,1,1,1,1,1],[1,1,1,0,0,0,0],[1,1,1,1,1,1,1],[1,1,1,1,0,1,1]];
      function poly(points,color){c.beginPath();c.moveTo(points[0][0],points[0][1]);for(let i=1;i<points.length;i++)c.lineTo(points[i][0],points[i][1]);c.closePath();c.fillStyle=color;c.fill();}
      function horiz(x,y,color){const q=th*.55;poly([[x+q,y],[x+digitW-q,y],[x+digitW,y+th/2],[x+digitW-q,y+th],[x+q,y+th],[x,y+th/2]],color);}
      function vert(x,y,color){const q=th*.55;poly([[x,y+q],[x+th/2,y],[x+th,y+q],[x+th,y+digitH/2-q],[x+th/2,y+digitH/2],[x,y+digitH/2-q]],color);}
      function digit(n,x){const m=maps[n];horiz(x,26,m[0]?on:off);vert(x+digitW-th,26,m[1]?on:off);vert(x+digitW-th,26+digitH/2,m[2]?on:off);horiz(x,26+digitH-th,m[3]?on:off);vert(x,26+digitH/2,m[4]?on:off);vert(x,26,m[5]?on:off);horiz(x,26+digitH/2-th/2,m[6]?on:off);}
      const digits=value.replace(':','');[28,160,376,508].forEach((x,i)=>digit(Number(digits[i]),x));
      c.fillStyle=on;c.beginPath();c.arc(320,100,9,0,Math.PI*2);c.arc(320,190,9,0,Math.PI*2);c.fill();
      const yyyy=date.getFullYear(),mm=String(date.getMonth()+1).padStart(2,'0'),dd=String(date.getDate()).padStart(2,'0');
      c.fillStyle='#eff5e4';c.font='bold 96px Arial,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(yyyy+'-'+mm+'-'+dd,w/2,354);
      const forecast=todayWeather(date),weatherLine=forecast?forecast.condition:'天气待更新';
      let weatherFont=104;c.fillStyle='#eff5e4';
      do{c.font='bold '+weatherFont+'px Arial,"PingFang SC",sans-serif';if(c.measureText(weatherLine).width<=600)break;weatherFont-=2;}while(weatherFont>54);
      c.fillText(weatherLine,w/2,474);drawnWeatherRevision=weatherRevision;
      clockTexture.needsUpdate=true;clock.display=value;
      clock.date=yyyy+'-'+mm+'-'+dd;clock.weather=forecast?forecast.condition:null;clock.forecast=forecast;
    }
    function nowHHMM(date=new Date()){
      const hh=String(date.getHours()).padStart(2,'0'),mm=String(date.getMinutes()).padStart(2,'0');
      return hh+':'+mm;
    }
    const initialDate=new Date();drawClock(nowHHMM(initialDate),initialDate);
    let elapsed=0;
    function update(time,dt){
      elapsed+=dt||0;
      if(elapsed<.25&&clock.lastMinute>=0)return;
      elapsed=0;const date=new Date(),minute=Math.floor(date.getTime()/60000);
      if(minute===clock.lastMinute&&drawnWeatherRevision===weatherRevision)return;clock.lastMinute=minute;drawClock(nowHHMM(date),date);
    }
    if(new URLSearchParams(location.search).get('device')!=='1'&&/^https?:$/.test(location.protocol)){
      const refreshWeather=()=>fetch('/api/kunming-weather',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('Weather unavailable');return r.json();}).then(p=>setWeather(p,!!p._cached)).catch(()=>{});
      refreshWeather();setInterval(refreshWeather,30*60*1000);
    }
    return {
      root:staticRoot,live:liveRoot,clock,screen,
      update,setWeather,
      stats(){return{clock:clock.display,date:clock.date,city:'昆明',weather:clock.weather,weatherDate:clock.forecast&&clock.forecast.date,
        low:clock.forecast&&clock.forecast.low,high:clock.forecast&&clock.forecast.high,weatherSource:weatherData?'cma':'unavailable',weatherCached,
        weatherUpdatedAt:weatherData&&weatherData.data.lastUpdate,weatherFetchedAt:weatherData&&weatherData._fetchedAt,clockMinutes:clock.lastMinute};}
    };
  };
})();
