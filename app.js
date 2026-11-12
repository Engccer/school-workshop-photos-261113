'use strict';
(() => {
  const topics = window.PHOTO_TOPICS;
  const $ = id => document.getElementById(id);
  const isAudience = new URLSearchParams(location.search).get('screen') === '1';
  let state = {topic:-1, scene:0, photo:null, zoom:false, scroll:[0,0]};
  let audienceWindow = null;
  let lastImageTrigger = null;
  let closingFromState = false;
  const origin = location.protocol === 'file:' ? '*' : location.origin;
  const messageType = 'school-workshop-photos-v1';

  function announce(text) { $('status').textContent = text; }
  function currentScene() { return topics[state.topic]?.scenes[state.scene]; }
  function send() {
    if (audienceWindow && !audienceWindow.closed) audienceWindow.postMessage({type:messageType,state},origin);
  }
  function validState(value) {
    if (!value || !Number.isInteger(value.topic) || !Number.isInteger(value.scene) || typeof value.zoom !== 'boolean') return false;
    if (value.topic === -1) return value.scene === 0 && value.photo === null;
    const scene = topics[value.topic]?.scenes[value.scene];
    return !!scene && (value.photo === null || (Number.isInteger(value.photo) && !!scene.photos[value.photo]));
  }
  function update(next) {
    if (['topic','scene','photo','zoom'].some(key => key in next && next[key] !== state[key])) next.scroll=[0,0];
    state = {...state,...next};
    render();
    if (!isAudience) send();
  }
  const topicButtons = topics.map((topic,index) => {
    const button = document.createElement('button');
    button.textContent = topic.label;
    button.setAttribute('aria-pressed','false');
    button.addEventListener('click',() => selectTopic(index));
    $('topics').append(button);
    return button;
  });
  function selectTopic(index) {
    update({topic:index,scene:0,photo:null,zoom:false});
  }
  function move(delta) {
    const scenes = topics[state.topic]?.scenes;
    if (!scenes) return;
    const next = state.scene + delta;
    if (next >= 0 && next < scenes.length) update({scene:next,photo:null,zoom:false});
  }
  function closeImageFromState() {
    if ($('image-dialog').open) {
      closingFromState = true;
      $('image-dialog').close();
    }
  }
  function render() {
    const scene = currentScene();
    $('cover').hidden = !!scene;
    $('slide').hidden = !scene;
    $('cover-button').setAttribute('aria-pressed',String(!scene));
    topicButtons.forEach((button,index) => button.setAttribute('aria-pressed',String(index === state.topic)));
    const oldSceneFocus = $('scene-buttons').contains(document.activeElement);
    const oldPhotoFocus = $('photos').contains(document.activeElement);
    if ((oldSceneFocus || oldPhotoFocus) && state.photo === null) {
      const target = isAudience ? $('screen-fullscreen') : document.body.classList.contains('clean') ? $('restore') : topicButtons[state.topic] || $('cover-button');
      target.focus();
    }
    $('scene-buttons').replaceChildren();
    $('photos').replaceChildren();
    $('previous').setAttribute('aria-disabled',String(!scene || state.scene === 0));
    $('next').setAttribute('aria-disabled',String(!scene || state.scene === topics[state.topic].scenes.length - 1));
    if (!scene) {
      closeImageFromState();
      announce('대담 표지');
      return;
    }
    $('period').textContent = scene.period;
    $('slide-title').textContent = scene.title;
    $('slide-count').textContent = `${state.scene+1} / ${topics[state.topic].scenes.length}`;
    $('slide-note').textContent = scene.note || '';
    scene.photos.forEach((photo,index) => {
      const figure = document.createElement('figure');
      const button = document.createElement('button');
      button.className = 'photo-button';
      button.title = '사진 크게 보기';
      const img = new Image();
      img.src = photo.src;
      img.alt = photo.alt;
      img.addEventListener('error',() => announce('사진을 불러오지 못했습니다. 인터넷 연결 또는 assets 폴더를 확인해 주세요.'));
      button.append(img);
      button.addEventListener('click',() => { lastImageTrigger = index; update({photo:index,zoom:false}); });
      const caption = document.createElement('figcaption');
      caption.textContent = photo.caption;
      figure.append(button,caption);
      $('photos').append(figure);
    });
    if (topics[state.topic].scenes.length > 1) topics[state.topic].scenes.forEach((item,index) => {
      const button = document.createElement('button');
      button.textContent = item.title;
      button.setAttribute('aria-pressed',String(index === state.scene));
      button.addEventListener('click',() => { update({scene:index,photo:null,zoom:false}); $('scene-buttons').children[index].focus(); });
      $('scene-buttons').append(button);
    });
    announce(`${topics[state.topic].label}, ${scene.title}, ${state.scene+1}/${topics[state.topic].scenes.length}`);
    if (state.photo !== null) {
      const photo = scene.photos[state.photo];
      $('large-image').src = photo.src;
      $('large-image').alt = photo.alt;
      $('image-title').textContent = photo.caption;
      $('zoom').textContent = state.zoom ? '화면에 맞추기' : '크게 확대';
      $('zoom').setAttribute('aria-pressed',String(state.zoom));
      $('image-scroll').classList.toggle('zoomed',state.zoom);
      if (!$('image-dialog').open) { $('image-dialog').showModal(); $('image-scroll').scrollTop=0; }
      if (isAudience) {
        $('large-image').onload = restoreScroll;
        requestAnimationFrame(restoreScroll);
      }
    } else closeImageFromState();
  }
  function closeImage() {
    update({photo:null,zoom:false});
    if (lastImageTrigger !== null) $('photos').querySelectorAll('button')[lastImageTrigger]?.focus();
  }
  $('close-image').addEventListener('click',closeImage);
  $('image-dialog').addEventListener('cancel',event => { event.preventDefault(); closeImage(); });
  $('image-dialog').addEventListener('close',() => {
    if (closingFromState) { closingFromState=false; return; }
    if (state.photo !== null) closeImage();
  });
  $('zoom').addEventListener('click',() => update({zoom:!state.zoom}));
  function restoreScroll() {
    const box=$('image-scroll');
    const pos=state.scroll || [0,0];
    box.scrollTo(pos[0]*Math.max(0,box.scrollWidth-box.clientWidth),pos[1]*Math.max(0,box.scrollHeight-box.clientHeight));
  }
  $('image-scroll').addEventListener('scroll',() => {
    if (!isAudience) {
      const box=$('image-scroll');
      state.scroll=[box.scrollLeft/Math.max(1,box.scrollWidth-box.clientWidth),box.scrollTop/Math.max(1,box.scrollHeight-box.clientHeight)];
      if (audienceWindow && !audienceWindow.closed) audienceWindow.postMessage({type:messageType,scroll:state.scroll},origin);
    }
  });
  $('previous').addEventListener('click',() => move(-1));
  $('next').addEventListener('click',() => move(1));
  $('cover-button').addEventListener('click',() => update({topic:-1,scene:0,photo:null,zoom:false}));
  $('help').addEventListener('click',() => $('help-dialog').showModal());
  $('close-help').addEventListener('click',() => $('help-dialog').close());
  function clean(enabled) {
    document.body.classList.toggle('clean',enabled);
    $('restore').hidden = !enabled;
    if (enabled) $('restore').focus(); else $('clean').focus();
  }
  $('clean').addEventListener('click',() => clean(true));
  $('restore').addEventListener('click',() => clean(false));
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else announce('이 브라우저에서는 전체 화면 버튼을 지원하지 않습니다. 브라우저의 전체 화면 기능을 이용해 주세요.');
    } catch { announce('전체 화면으로 바꾸지 못했습니다. 브라우저의 전체 화면 기능을 이용해 주세요.'); }
  }
  $('fullscreen').addEventListener('click',fullscreen);
  $('screen-fullscreen').addEventListener('click',fullscreen);
  document.addEventListener('fullscreenchange',() => {
    const text = document.fullscreenElement ? '전체 화면 종료' : '전체 화면';
    $('fullscreen').textContent=text; $('screen-fullscreen').textContent=text;
  });
  $('audience').addEventListener('click',() => {
    if (audienceWindow && !audienceWindow.closed) { audienceWindow.focus(); send(); return; }
    const url = new URL(location.href); url.search='screen=1'; url.hash='';
    audienceWindow = window.open(url.href,'workshop-audience','popup,width=1280,height=800');
    if (!audienceWindow) announce('청중 창이 차단되었습니다. 브라우저에서 이 사이트의 팝업을 허용한 뒤 다시 눌러 주세요.');
    else announce('청중 창을 열었습니다. 새 창을 프로젝터로 옮긴 뒤 전체 화면을 누르세요.');
  });
  window.addEventListener('message',event => {
    if (location.protocol !== 'file:' && event.origin !== location.origin) return;
    if (event.data?.type !== messageType) return;
    if (isAudience && event.source === window.opener) {
      if (validState(event.data.state)) { state=event.data.state; render(); }
      if (Array.isArray(event.data.scroll) && event.data.scroll.length === 2 && event.data.scroll.every(value => Number.isFinite(value) && value >= 0 && value <= 1)) {state.scroll=event.data.scroll;restoreScroll();}
    } else if (!isAudience && event.source === audienceWindow && event.data.ready) send();
  });
  document.addEventListener('keydown',event => {
    if ($('help-dialog').open || $('image-dialog').open) return;
    if (event.key === 'Escape' && document.body.classList.contains('clean')) {clean(false);return;}
    if (!event.altKey || event.ctrlKey || event.metaKey || isAudience) return;
    const digit = event.code.match(/^Digit([0-5])$/)?.[1];
    if (digit !== undefined) {
      event.preventDefault();
      if (digit === '0') update({topic:-1,scene:0,photo:null,zoom:false}); else selectTopic(Number(digit)-1);
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {event.preventDefault();move(event.key === 'ArrowRight' ? 1 : -1);}
  });
  if (isAudience) {
    document.body.classList.add('audience');
    $('screen-tools').hidden=false;
    document.title='청중 화면 | 함께 일하는 학교의 이야기';
    if (window.opener) window.opener.postMessage({type:messageType,ready:true},origin);
  }
  render();
  // 다음 전환 때까지 기다리지 않고 원본 사진을 미리 불러온다.
  for (const topic of topics) for (const scene of topic.scenes) for (const photo of scene.photos) { const img=new Image(); img.src=photo.src; }
})();
