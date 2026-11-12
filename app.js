'use strict';
(() => {
  const topics=window.PHOTO_TOPICS;
  const scenes=topics.flatMap((topic,topicIndex)=>topic.scenes.map(scene=>({...scene,topicIndex})));
  const $=id=>document.getElementById(id);
  let sceneIndex=0,returnFocus=null,revision=0;
  let audioContext,audioBuffer,audioLoading,soundSource;
  function announce(text){$('status').textContent=text;}
  function stopSound(){if(soundSource){try{soundSource.stop();}catch{}soundSource=null;}}
  function prepareSound(){
    try{
      if(!audioContext){
        audioContext=new(window.AudioContext||window.webkitAudioContext)();
        const bytes=Uint8Array.from(atob(window.PHOTO_CUE_BASE64),c=>c.charCodeAt(0));
        audioLoading=audioContext.decodeAudioData(bytes.buffer).then(buffer=>{audioBuffer=buffer;});
      }
      return Promise.all([audioContext.resume(),audioLoading]).then(()=>true).catch(()=>{announce('효과음을 재생할 수 없습니다.');return false;});
    }catch{announce('효과음을 재생할 수 없습니다.');return Promise.resolve(false);}
  }
  async function playAfterDisplay(images){
    const ticket=++revision;
    stopSound();
    const ready=prepareSound();
    try{
      const results=await Promise.all([ready,...images.map(img=>img.decode())]);
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      if(!results[0]||ticket!==revision)return;
      const source=audioContext.createBufferSource(),gain=audioContext.createGain();
      gain.gain.value=0.7;source.buffer=audioBuffer;source.connect(gain);gain.connect(audioContext.destination);
      soundSource=source;source.start();
      source.onended=()=>{source.disconnect();gain.disconnect();if(soundSource===source)soundSource=null;};
    }catch{if(ticket===revision)announce('사진을 불러오지 못했습니다.');}
  }
  const topicButtons=topics.map((topic,index)=>{
    const button=document.createElement('button');button.textContent=topic.label;
    button.addEventListener('click',()=>selectScene(scenes.findIndex(scene=>scene.topicIndex===index)));
    $('topics').append(button);return button;
  });
  function render(){
    const scene=scenes[sceneIndex];
    $('scene-title').textContent=`${topics[scene.topicIndex].label}, ${scene.title}`;
    if($('photos').contains(document.activeElement))$('scene-title').focus({preventScroll:true});
    topicButtons.forEach((button,index)=>button.setAttribute('aria-pressed',String(index===scene.topicIndex)));
    $('previous').setAttribute('aria-disabled',String(sceneIndex===0));
    $('next').setAttribute('aria-disabled',String(sceneIndex===scenes.length-1));
    $('photos').replaceChildren();
    for(const photo of scene.photos){
      const item=document.createElement('div');item.className='photo';
      const heading=document.createElement('h3');heading.className='sr-only';heading.textContent=photo.caption;
      const image=new Image();image.src=photo.src;image.alt=photo.alt;
      image.addEventListener('error',()=>announce('사진을 불러오지 못했습니다.'));
      const button=document.createElement('button');button.className='photo-open';
      button.setAttribute('aria-label',`${photo.caption} 크게 보기`);button.title='크게 보기';
      button.addEventListener('click',()=>openPhoto(photo,button));
      item.append(heading,image,button);$('photos').append(item);
    }
    announce(`장면 ${sceneIndex+1}/${scenes.length}, 사진 ${scene.photos.length}장`);
  }
  function selectScene(index){
    if(index<0||index>=scenes.length)return;
    sceneIndex=index;render();$('scene-title').focus({preventScroll:true});
    playAfterDisplay([...$('photos').querySelectorAll('img')]);
  }
  function openPhoto(photo,button){
    returnFocus=button;
    $('large-image').src=photo.src;$('large-image').alt=photo.alt;$('image-title').textContent=photo.caption;
    $('image-scroll').classList.toggle('document',topics[scenes[sceneIndex].topicIndex].id==='notebook');
    $('image-dialog').showModal();$('image-scroll').scrollTop=0;$('image-title').focus({preventScroll:true});
    playAfterDisplay([$('large-image')]);
  }
  function closePhoto(){
    ++revision;stopSound();$('image-dialog').close();returnFocus?.focus({preventScroll:true});
  }
  $('previous').addEventListener('click',()=>selectScene(sceneIndex-1));
  $('next').addEventListener('click',()=>selectScene(sceneIndex+1));
  $('close-image').addEventListener('click',closePhoto);
  $('image-dialog').addEventListener('cancel',event=>{event.preventDefault();closePhoto();});
  document.addEventListener('keydown',event=>{
    if($('image-dialog').open||!event.altKey||event.ctrlKey||event.metaKey)return;
    const digit=event.code.match(/^Digit([1-3])$/)?.[1];
    if(digit){event.preventDefault();selectScene(scenes.findIndex(scene=>scene.topicIndex===Number(digit)-1));}
    else if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();selectScene(sceneIndex+(event.key==='ArrowRight'?1:-1));}
  });
  render();
  for(const scene of scenes)for(const photo of scene.photos){const img=new Image();img.src=photo.src;}
})();
