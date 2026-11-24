/* Local-only audio: user-selected files or a small original 86 BPM instrumental.
 * Nothing is uploaded. The synthetic preview only starts after a user gesture.
 */
(function(){
  'use strict';
  // On the speaker, audio and controls belong to the native service/overlay.
  if(new URLSearchParams(location.search).get('device')==='1')return;
  var room=document.getElementById('room'),music=document.getElementById('music');
  var context,analyser,master,fileSource,synthBus,scheduler,frequency,wave;
  var playing=false,audible=false,mode='demo',night=true,close=new URLSearchParams(location.search).get('view')==='listener';
  var nextStep=0,step=0,objectURL=null,uiTimer,toastTimer,bassHistory=0;
  function toast(message){var el=document.getElementById('toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(function(){el.classList.remove('visible')},2600)}
  function showUI(){room.classList.remove('quiet');clearTimeout(uiTimer);uiTimer=setTimeout(function(){if(!room.querySelector('button:focus'))room.classList.add('quiet')},6500)}
  ['pointermove','pointerdown','keydown','focusin'].forEach(function(event){room.addEventListener(event,showUI)});showUI();
  function label(value){document.getElementById('source-label').textContent=value}
  async function init(){
    if(!context){
      var AudioContext=window.AudioContext||window.webkitAudioContext;
      if(!AudioContext)throw new Error('此浏览器不支持音频试听');
      context=new AudioContext();master=context.createGain();master.gain.value=.60;
      analyser=context.createAnalyser();analyser.fftSize=512;analyser.smoothingTimeConstant=.67;
      master.connect(analyser);analyser.connect(context.destination);
      synthBus=context.createGain();synthBus.gain.value=.72;synthBus.connect(master);
      frequency=new Uint8Array(analyser.frequencyBinCount);wave=new Uint8Array(analyser.fftSize);
      fileSource=context.createMediaElementSource(music);fileSource.connect(master);
    }
    if(context.state!=='running')await context.resume();
  }
  function voice(freq,when,duration,amp,type){
    var osc=context.createOscillator(),gain=context.createGain(),filter=context.createBiquadFilter();
    osc.type=type||'sine';osc.frequency.setValueAtTime(freq,when);filter.type='lowpass';filter.frequency.value=1800;
    gain.gain.setValueAtTime(0,when);gain.gain.linearRampToValueAtTime(amp,when+.012);gain.gain.exponentialRampToValueAtTime(.0001,when+duration);
    osc.connect(filter);filter.connect(gain);gain.connect(synthBus);osc.start(when);osc.stop(when+duration+.03);
    osc.onended=function(){osc.disconnect();filter.disconnect();gain.disconnect()};
  }
  function drum(when,kind){
    if(kind==='kick'){
      var osc=context.createOscillator(),gain=context.createGain();osc.frequency.setValueAtTime(130,when);osc.frequency.exponentialRampToValueAtTime(43,when+.12);gain.gain.setValueAtTime(.45,when);gain.gain.exponentialRampToValueAtTime(.0001,when+.24);osc.connect(gain);gain.connect(synthBus);osc.start(when);osc.stop(when+.25);osc.onended=function(){osc.disconnect();gain.disconnect()};
    }else{
      var duration=kind==='hat'?.055:.17,buffer=context.createBuffer(1,Math.ceil(context.sampleRate*duration),context.sampleRate),data=buffer.getChannelData(0);
      for(var i=0;i<data.length;i++)data[i]=(Math.random()*2-1);
      var noise=context.createBufferSource(),f=context.createBiquadFilter(),g=context.createGain();noise.buffer=buffer;f.type='highpass';f.frequency.value=kind==='hat'?6500:1800;
      g.gain.setValueAtTime(kind==='hat'?.055:.15,when);g.gain.exponentialRampToValueAtTime(.0001,when+duration);noise.connect(f);f.connect(g);g.connect(synthBus);noise.start(when);noise.onended=function(){noise.disconnect();f.disconnect();g.disconnect()};
    }
  }
  function midi(n){return 440*Math.pow(2,(n-69)/12)}
  var chords=[[48,55,59,62,64],[45,52,55,59,60],[50,57,60,64,65],[43,53,57,59,64]];
  var melody=[76,null,74,null,71,null,67,null,69,null,71,74,72,null,71,null];
  function schedule(){
    while(nextStep<context.currentTime+.12){
      var s=step%16,bar=Math.floor(step/16)%4,chord=chords[bar],swing=s%2?.018:0,at=nextStep+swing;
      if(s===0||s===10)chord.forEach(function(n,index){voice(midi(n+12),at+index*.008,1.05,.075,'triangle');voice(midi(n+24),at+index*.008,.65,.008,'sine')});
      if(s===0||s===6||s===8||s===14){voice(midi(chord[0]-12),at,.29,.28);drum(at,'kick')}
      if(s===4||s===12)drum(at,'snare');
      if(s%2===0)drum(at,'hat');
      if(melody[(s+bar*3)%16]&&s%2===0)voice(midi(melody[(s+bar*3)%16]),at+.02,.38,.045);
      nextStep+=60/86/4;step++;
    }
  }
  function stopSynth(){clearInterval(scheduler);scheduler=null;if(synthBus&&context)synthBus.gain.setTargetAtTime(0,context.currentTime,.04)}
  function startSynth(){stopSynth();synthBus.gain.setTargetAtTime(.72,context.currentTime,.03);nextStep=context.currentTime+.055;step=0;schedule();scheduler=setInterval(schedule,30)}
  function syncButtons(){
    document.getElementById('pause-icon').style.display=playing?'':'none';document.getElementById('play-icon').removeAttribute('hidden');document.getElementById('play-icon').style.display=playing?'none':'';
    document.getElementById('play').setAttribute('aria-label',playing?'暂停音乐':'播放音乐');
    document.getElementById('sound').classList.toggle('active',audible);document.getElementById('sound-off').style.display=audible?'none':'';
    document.getElementById('sound').setAttribute('aria-label',audible?'静音':'开启试听音乐');
    room.classList.toggle('paused',!playing);
    document.getElementById('view').classList.toggle('active',close);
    document.getElementById('view').setAttribute('aria-label',close?'回到玻璃视窗':'近看试听者');
    if(window.ListeningRoom)window.ListeningRoom.setPlaying(playing);
  }
  async function setPlaying(value){
    playing=value;
    try{
      if(!playing){music.pause();stopSynth()}
      else{await init();audible=true;master.gain.setTargetAtTime(.60,context.currentTime,.04);if(mode==='file')await music.play();else startSynth();label(mode==='file'?music.dataset.title:'试听音乐 · 86 BPM')}
    }catch(e){toast('音乐暂时无法播放：'+e.message);audible=false;playing=false}
    syncButtons();
  }
  document.getElementById('play').addEventListener('click',function(){setPlaying(!playing)});
  document.getElementById('sound').addEventListener('click',async function(){
    try{
      await init();audible=!audible;
      if(audible){playing=true;master.gain.setTargetAtTime(.60,context.currentTime,.04);if(mode==='file')await music.play();else startSynth();label(mode==='file'?music.dataset.title:'试听音乐 · 86 BPM');toast(mode==='file'?'正在播放本地音乐':'正在播放原创试听节奏')}
      else{master.gain.setTargetAtTime(0,context.currentTime,.04);stopSynth();music.pause();playing=false;window.ListeningRoom.useDemo();label('阅读时光 · 等待音乐')}
      syncButtons();
    }catch(e){audible=false;toast('无法开启试听：'+e.message);syncButtons()}
  });
  document.getElementById('choose').addEventListener('click',function(){document.getElementById('audio-file').click()});
  document.getElementById('audio-file').addEventListener('change',async function(e){
    var file=e.target.files[0];if(!file)return;
    try{
      await init();stopSynth();music.pause();if(objectURL)URL.revokeObjectURL(objectURL);
      objectURL=URL.createObjectURL(file);music.src=objectURL;music.dataset.title=file.name.replace(/\.[^.]+$/,'');music.loop=true;music.volume=1;
      master.gain.setTargetAtTime(.60,context.currentTime,.05);mode='file';audible=true;playing=true;await music.play();label(music.dataset.title);toast('音乐只在本机播放');syncButtons();
    }catch(error){audible=false;playing=false;mode='demo';window.ListeningRoom.useDemo();toast('这首音乐无法播放，请尝试 MP3 或 WAV');syncButtons()}
  });
  music.addEventListener('ended',function(){playing=false;stopSynth();syncButtons();});
  music.addEventListener('error',function(){if(mode==='file'){toast('无法解码这首音乐，请换一个音频文件');audible=false;playing=false;window.ListeningRoom.useDemo();syncButtons()}});
  document.getElementById('light').addEventListener('click',function(){night=!night;window.ListeningRoom.setNight(night);this.classList.toggle('active',night);this.setAttribute('aria-label',night?'切换日光氛围':'切换雪夜氛围');toast(night?'落雪的夜晚，慢慢听。':'冬日午后，慢慢听。')});
  document.getElementById('view').addEventListener('click',function(){close=!close;window.ListeningRoom.setClose(close);this.classList.toggle('active',close);this.setAttribute('aria-label',close?'回到玻璃视窗':'近看试听者')});
  async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else if(room.requestFullscreen)await room.requestFullscreen();else toast('当前预览已占满窗口')}catch(e){toast('请使用浏览器的全屏按钮')}}
  document.getElementById('fullscreen').addEventListener('click',fullscreen);
  document.addEventListener('keydown',function(e){if(e.target.tagName==='INPUT'||e.target.tagName==='BUTTON')return;if(e.code==='Space'){e.preventDefault();setPlaying(!playing)}if(e.key.toLowerCase()==='f')fullscreen();if(e.key.toLowerCase()==='h')room.classList.toggle('quiet')});
  function sample(){
    requestAnimationFrame(sample);
    if(!analyser||!audible||!playing||document.hidden)return;
    analyser.getByteFrequencyData(frequency);analyser.getByteTimeDomainData(wave);
    var sum=0;for(var i=0;i<wave.length;i++){var v=(wave[i]-128)/128;sum+=v*v}
    var energy=Math.min(1,Math.sqrt(sum/wave.length)*4.7),bass=0,mid=0,high=0;
    for(var k=1;k<5;k++)bass+=frequency[k]/(4*255);
    for(var m=5;m<30;m++)mid+=frequency[m]/(25*255);
    for(var h=30;h<100;h++)high+=frequency[h]/(70*255);
    window.ListeningRoom.setAudio(energy,bass,mid,high);
  }
  requestAnimationFrame(sample);
  document.addEventListener('visibilitychange',function(){if(document.hidden&&mode==='demo')stopSynth();else if(!document.hidden&&mode==='demo'&&audible&&playing)startSynth()});
  window.addEventListener('pagehide',function(){stopSynth();music.pause();if(objectURL)URL.revokeObjectURL(objectURL)});
  window.addEventListener('roomready',syncButtons);
  window.addEventListener('roomviewchange',function(e){close=!!e.detail;syncButtons();});
})();
