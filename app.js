'use strict';
(() => {
  const topics = window.PHOTO_TOPICS;
  const $ = id => document.getElementById(id);
  const isAudience = new URLSearchParams(location.search).get('screen') === '1';
  const origin = location.protocol === 'file:' ? '*' : location.origin;
  const messageType = 'school-workshop-photos-v3';
  let state = {topic:0,scene:0,photo:null,zoom:false,scroll:[0,0]};
  let audienceWindow = null;
  let lastImageTrigger = 0;
  let revision = 0;
  let soundEnabled = true;
  let audioContext, audioBuffer, audioLoading, soundSource;
  let closingFromState = false;

  function announce(text) { $('status').textContent=text; }
  function currentScene() { return topics[state.topic].scenes[state.scene]; }
  function send() {
    if (audienceWindow && !audienceWindow.closed) audienceWindow.postMessage({type:messageType,state},origin);
  }
  function validState(value) {
    if (!value || !Number.isInteger(value.topic) || !Number.isInteger(value.scene) || typeof value.zoom !== 'boolean') return false;
    const scene=topics[value.topic]?.scenes[value.scene];
    return !!scene && (value.photo === null || (Number.isInteger(value.photo) && !!scene.photos[value.photo])) &&
      Array.isArray(value.scroll) && value.scroll.length===2 && value.scroll.every(n=>Number.isFinite(n) && n>=0 && n<=1);
  }
  function stopSound() {
    if (soundSource) { try { soundSource.stop(); } catch {} soundSource=null; }
  }
  function prepareSound() {
    if (!soundEnabled || isAudience) return Promise.resolve(false);
    try {
      if (!audioContext) {
        audioContext=new (window.AudioContext || window.webkitAudioContext)();
        const bytes=Uint8Array.from(atob(window.PHOTO_CUE_BASE64),c=>c.charCodeAt(0));
        audioLoading=audioContext.decodeAudioData(bytes.buffer).then(buffer=>{audioBuffer=buffer;});
      }
      // 사용자 조작 안에서 오디오를 활성화하고 사진 표시가 끝나면 재생한다.
      return Promise.all([audioContext.resume(),audioLoading]).then(()=>true).catch(()=>{announce('효과음을 재생할 수 없습니다.');return false;});
    } catch { announce('효과음을 재생할 수 없습니다.'); return Promise.resolve(false); }
  }
  async function cueWhenReady(ticket,ready) {
    const images=state.photo===null ? [...$('photos').querySelectorAll('img')] : [$('large-image')];
    try {
      const results=await Promise.all([ready,...images.map(img=>img.decode())]);
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      if (!results[0] || ticket!==revision || !soundEnabled || isAudience) return;
      stopSound();
      const source=audioContext.createBufferSource();
      const gain=audioContext.createGain(); gain.gain.value=0.7;
      source.buffer=audioBuffer;source.connect(gain);gain.connect(audioContext.destination);
      soundSource=source;source.start();
      source.onended=()=>{source.disconnect();gain.disconnect();if(soundSource===source)soundSource=null;};
    } catch { if(ticket===revision) announce('사진을 불러오지 못했습니다.'); }
  }
  function update(next) {
    const ready=prepareSound();stopSound();
    if (['topic','scene','photo','zoom'].some(key=>key in next && next[key]!==state[key])) next.scroll=[0,0];
    state={...state,...next};render();send();cueWhenReady(revision,ready);
  }
  const topicButtons=topics.map((topic,index)=>{
    const button=document.createElement('button');button.textContent=topic.label;
    button.setAttribute('aria-pressed','false');
    button.addEventListener('click',()=>selectScene(index,0));
    $('topics').append(button);return button;
  });
  function selectScene(topic,scene) {
    update({topic,scene,photo:null,zoom:false});
    $('scene-title').focus({preventScroll:true});
  }
  function move(delta) {
    const next=state.scene+delta;
    if(next>=0 && next<topics[state.topic].scenes.length) selectScene(state.topic,next);
  }
  function render() {
    revision++;
    const scene=currentScene();
    $('scene-title').textContent=`${topics[state.topic].label}, ${scene.title}`;
    topicButtons.forEach((button,index)=>button.setAttribute('aria-pressed',String(index===state.topic)));
    const oldFocus=$('scene-buttons').contains(document.activeElement)||$('photos').contains(document.activeElement);
    if(oldFocus && state.photo===null) {
      const target=isAudience?$('screen-fullscreen'):document.body.classList.contains('clean')?$('restore'):topicButtons[state.topic];
      target.focus();
    }
    $('photos').replaceChildren();$('scene-buttons').replaceChildren();
    scene.photos.forEach((photo,index)=>{
      const item=document.createElement('div');item.className='photo';
      const heading=document.createElement('h3');heading.className='sr-only';heading.textContent=photo.caption;
      const img=new Image();img.src=photo.src;img.alt=photo.alt;
      img.addEventListener('error',()=>announce('사진을 불러오지 못했습니다.'));
      const button=document.createElement('button');button.className='photo-open';
      button.setAttribute('aria-label',`${photo.caption} 크게 보기`);button.title='크게 보기';
      button.addEventListener('click',()=>{lastImageTrigger=index;update({photo:index,zoom:false});});
      item.append(heading,img,button);$('photos').append(item);
    });
    if(topics[state.topic].scenes.length>1) topics[state.topic].scenes.forEach((item,index)=>{
      const button=document.createElement('button');button.setAttribute('aria-label',item.title);
      button.title=item.title;button.setAttribute('aria-pressed',String(index===state.scene));
      for(const photo of item.photos) {const img=new Image();img.src=photo.src;img.alt='';button.append(img);}
      button.addEventListener('click',()=>selectScene(state.topic,index));
      $('scene-buttons').append(button);
    });
    announce(`장면 ${state.scene+1}/${topics[state.topic].scenes.length}, 사진 ${scene.photos.length}장`);
    if(state.photo!==null) {
      const photo=scene.photos[state.photo];
      $('large-image').src=photo.src;$('large-image').alt=photo.alt;$('image-title').textContent=photo.caption;
      $('zoom').setAttribute('aria-pressed',String(state.zoom));$('zoom').title=state.zoom?'화면에 맞추기':'확대';
      $('image-scroll').classList.toggle('zoomed',state.zoom);
      if(!$('image-dialog').open) {$('image-dialog').showModal();$('image-scroll').scrollTop=0;$('image-title').focus({preventScroll:true});}
      if(isAudience) {$('large-image').onload=restoreScroll;requestAnimationFrame(restoreScroll);}
    } else if($('image-dialog').open) {closingFromState=true;$('image-dialog').close();}
  }
  function closeImage() {
    update({photo:null,zoom:false});$('photos').querySelectorAll('button')[lastImageTrigger]?.focus();
  }
  $('close-image').addEventListener('click',closeImage);
  $('image-dialog').addEventListener('cancel',event=>{event.preventDefault();closeImage();});
  $('image-dialog').addEventListener('close',()=>{
    if(closingFromState){closingFromState=false;return;}
    if(state.photo!==null)closeImage();
  });
  $('zoom').addEventListener('click',()=>update({zoom:!state.zoom}));
  function restoreScroll() {
    const box=$('image-scroll');
    box.scrollTo(state.scroll[0]*Math.max(0,box.scrollWidth-box.clientWidth),state.scroll[1]*Math.max(0,box.scrollHeight-box.clientHeight));
  }
  $('image-scroll').addEventListener('scroll',()=>{
    if(!isAudience){
      const box=$('image-scroll');state.scroll=[box.scrollLeft/Math.max(1,box.scrollWidth-box.clientWidth),box.scrollTop/Math.max(1,box.scrollHeight-box.clientHeight)];
      if(audienceWindow && !audienceWindow.closed)audienceWindow.postMessage({type:messageType,scroll:state.scroll},origin);
    }
  });
  function clean(enabled) {
    document.body.classList.toggle('clean',enabled);$('restore').hidden=!enabled;
    (enabled?$('restore'):$('clean')).focus();
  }
  $('clean').addEventListener('click',()=>clean(true));$('restore').addEventListener('click',()=>clean(false));
  $('sound').addEventListener('click',()=>{
    revision++;
    soundEnabled=!soundEnabled;stopSound();$('sound').setAttribute('aria-pressed',String(soundEnabled));
    $('sound').title=soundEnabled?'효과음 끄기':'효과음 켜기';
    $('sound').querySelector('use').setAttribute('href',soundEnabled?'#icon-sound':'#icon-mute');
    if(soundEnabled)cueWhenReady(revision,prepareSound());
  });
  async function fullscreen() {
    try {
      if(document.fullscreenElement)await document.exitFullscreen();
      else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();
      else announce('전체 화면을 지원하지 않는 브라우저입니다.');
    } catch {announce('전체 화면으로 바꾸지 못했습니다.');}
  }
  $('fullscreen').addEventListener('click',fullscreen);$('screen-fullscreen').addEventListener('click',fullscreen);
  document.addEventListener('fullscreenchange',()=>{
    const text=document.fullscreenElement?'전체 화면 종료':'전체 화면';
    for(const id of ['fullscreen','screen-fullscreen']){$(id).setAttribute('aria-label',text);$(id).title=text;}
  });
  $('audience').addEventListener('click',()=>{
    if(audienceWindow && !audienceWindow.closed){audienceWindow.focus();send();return;}
    const url=new URL(location.href);url.search='screen=1&v=3';url.hash='';
    audienceWindow=window.open(url.href,'workshop-audience','popup,width=1280,height=800');
    if(!audienceWindow)announce('청중 창이 차단되었습니다. 팝업을 허용해 주세요.');
  });
  window.addEventListener('message',event=>{
    if(location.protocol!=='file:' && event.origin!==location.origin)return;
    if(event.data?.type!==messageType)return;
    if(isAudience && event.source===window.opener){
      if(validState(event.data.state)){state=event.data.state;render();}
      if(Array.isArray(event.data.scroll) && event.data.scroll.length===2 && event.data.scroll.every(n=>Number.isFinite(n) && n>=0 && n<=1)){state.scroll=event.data.scroll;restoreScroll();}
    } else if(!isAudience && event.source===audienceWindow && event.data.ready)send();
  });
  document.addEventListener('keydown',event=>{
    if($('image-dialog').open)return;
    if(event.key==='Escape' && document.body.classList.contains('clean')){clean(false);return;}
    if(!event.altKey || event.ctrlKey || event.metaKey || isAudience)return;
    const digit=event.code.match(/^Digit([1-3])$/)?.[1];
    if(digit){event.preventDefault();selectScene(Number(digit)-1,0);}
    else if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();move(event.key==='ArrowRight'?1:-1);}
  });
  if(isAudience){
    document.body.classList.add('audience');$('screen-tools').hidden=false;document.title='청중 화면 | 대담 사진';
    if(window.opener)window.opener.postMessage({type:messageType,ready:true},origin);
  }
  render();
  for(const topic of topics)for(const scene of topic.scenes)for(const photo of scene.photos){const img=new Image();img.src=photo.src;}
})();
