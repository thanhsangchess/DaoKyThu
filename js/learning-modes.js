(function(){
 window.vqcCurrentLearningMode='home';
 const body=document.body;
 function mode(next){
  window.vqcCurrentLearningMode=next;
  body.classList.remove('vqc-mode-home','vqc-mode-class','vqc-mode-world');
  body.classList.add('vqc-mode-'+next);
  document.getElementById('vqcModeHome')?.setAttribute('aria-hidden',String(next!=='home'));
  document.getElementById('vqcModeWorld')?.setAttribute('aria-hidden',String(next!=='world'));
  if(next!=='class'){
   ['mateOverlay','mate3Overlay','pvpOverlay','captureOverlay','freeCaptureOverlay','defenseOverlay','pawnGameOverlay','checkOneOverlay','escapeOverlay','vqcMateOneOverlay','vqcMateOneBasicOverlay','vqcMateThreeOverlay','starRewardOverlay','vqcVsMachineOverlay','vqcChdOverlay'].forEach(id=>document.getElementById(id)?.classList.remove('open'));
  }
  window.scrollTo?.(0,0);
 }
 window.vqcGoHome=function(){
  if(roomRef){vqcNotify('Hãy rời phòng trước khi quay về trang chủ.','warning');return;}
  if(typeof window.vqcAdventureLeaveWorld==='function')window.vqcAdventureLeaveWorld();
  mode('home');
 };
 window.vqcOpenWorld=function(){
  if(roomRef){vqcNotify('Hãy rời lớp trước khi khám phá các đảo.','warning');return;}
  mode('world');
  if(typeof window.vqcAdventureStart==='function')window.vqcAdventureStart();
 };
 window.vqcEnterClass=function(){
  if(!window.accountProfile){showAccountPanel();return;}
  if(window.accountProfile.role==='teacher'||roomRef){mode('class');return;}
  document.getElementById('vqcJoinArea').hidden=false;
  document.getElementById('vqcJoinCode')?.focus();
 };
 window.vqcJoinFromLanding=async function(){
  const input=document.getElementById('vqcJoinCode'),code=input?.value.trim();
  if(!code){vqcNotify('Hãy nhập mã phòng do giáo viên cung cấp.','warning');return;}
  document.getElementById('roomCode').value=code;
  await joinRoom();
  if(roomRef){document.getElementById('vqcJoinArea').hidden=true;mode('class');}
 };
 const originalCreate=createRoom;
 createRoom=async function(){await originalCreate();if(roomRef)mode('class');};
 const originalJoin=joinRoom;
 joinRoom=async function(){await originalJoin();if(roomRef)mode('class');};
 const originalLeave=leaveClassroom;
 leaveClassroom=async function(){await originalLeave();if(!roomRef)mode('home');};
 document.querySelectorAll('.lesson').forEach(el=>el.title=(el.title?el.title+' · ':'')+'Hoạt động dùng trong lớp học');
 mode('home');
})();

(function(){
 try{
  const href='./assets/Logo-the-trang-web-co-vua.png?v=20261117-tab-v1';
  const links=document.querySelectorAll('link[rel~="icon"]');
  if(links.length){
   links.forEach(function(l){l.type='image/png';l.removeAttribute('sizes');l.href=href;});
  }else{
   const l=document.createElement('link');
   l.rel='icon';l.type='image/png';l.href=href;
   document.head.appendChild(l);
  }
 }catch(e){}
})();

(function(){
 try{
  const s=document.createElement('script');
  s.src='./js/student-lock.js?v=20261123-lock-v2';s.async=false;
  document.head.appendChild(s);
 }catch(e){}
})();

(function(){
 try{
  const v='?v=20261124-m3-v3';
  const mountDrawing=function(){try{if(typeof window.vqcAnnotationsMount==='function')window.vqcAnnotationsMount();}catch(e){}};
  const names=['mate-three-pdf-500-data.js','mate-three-pdf-500-data-2.js','mate-three-pdf-500-data-3.js','mate-three-pdf-500-data-4.js','mate-three-pdf-500-data-5.js','mate-three-pdf-500.js'];
  names.forEach(function(name,i){
   const s=document.createElement('script');
   s.src='./js/'+name+v;s.async=false;
   if(i===names.length-1){
    s.onload=function(){
     mountDrawing();
     if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(mountDrawing,0);});
     window.addEventListener('load',function(){setTimeout(mountDrawing,0);});
    };
   }
   document.head.appendChild(s);
  });
 }catch(e){}
})();

(function(){
 try{
  if(!document.getElementById('vqctCss')){
   const l=document.createElement('link');
   l.id='vqctCss';l.rel='stylesheet';l.href='./css/class-timer.css?v=20261122-timer-v9';
   document.head.appendChild(l);
  }
  const s=document.createElement('script');
  s.src='./js/class-timer.js?v=20261122-timer-v10';s.async=false;
  document.head.appendChild(s);
 }catch(e){}
})();

(function(){
 try{
  const v='?v=20261126-vsm-v9';
  if(!document.getElementById('vqcVsmCss')){
   const l=document.createElement('link');
   l.id='vqcVsmCss';l.rel='stylesheet';l.href='./css/vs-machine.css?v=20261126-vsm-v9';
   document.head.appendChild(l);
  }
  ['chernev-endgames-data.js','vs-machine-engine.js','vs-machine.js','vsm-review.js'].forEach(function(name){
   const s=document.createElement('script');
   s.src='./js/'+name+v;s.async=false;
   document.head.appendChild(s);
  });
 }catch(e){}
})();

(function(){
 try{
  if(!document.getElementById('vqcChdCss')){
   const l=document.createElement('link');
   l.id='vqcChdCss';l.rel='stylesheet';l.href='./css/chernev-duel.css?v=20261126-duel-v25';
   document.head.appendChild(l);
  }
  const s=document.createElement('script');
  s.src='./js/chernev-duel.js?v=20261126-duel-v25';s.async=false;
  document.head.appendChild(s);
 }catch(e){}
})();

(function(){
 try{
  if(!document.getElementById('vqcEloCss')){
   const l=document.createElement('link');
   l.id='vqcEloCss';l.rel='stylesheet';l.href='./css/elo-puzzles.css?v=20261126-elo-v3';
   document.head.appendChild(l);
  }
  const s0=document.createElement('script');
  s0.src='./js/elo-local.js?v=20261126-elo-v4';s0.async=false;
  document.head.appendChild(s0);
  const sInk=document.createElement('script');
  sInk.src='./js/elo-ink.js?v=20261126-elo-v4';sInk.async=false;
  document.head.appendChild(sInk);
  const s=document.createElement('script');
  s.src='./js/elo-puzzles.js?v=20261126-elo-v5';s.async=false;
  document.head.appendChild(s);
  const s2=document.createElement('script');
  s2.src='./js/elo-class.js?v=20261126-elo-v4';s2.async=false;
  document.head.appendChild(s2);
 }catch(e){}
})();

(function(){
 try{
  if(!document.getElementById('vqcBedCss')){
   const l=document.createElement('link');
   l.id='vqcBedCss';l.rel='stylesheet';l.href='./css/board-editor.css?v=20261126-bed-v1';
   document.head.appendChild(l);
  }
  const s=document.createElement('script');
  s.src='./js/board-editor.js?v=20261126-bed-v1';s.async=false;
  document.head.appendChild(s);
 }catch(e){}
})();

(function(){
 try{
  ['move-smooth.js?v=20261124-smooth-v3','piece-drag.js?v=20261124-drag-v3'].forEach(function(name){
   const s=document.createElement('script');
   s.src='./js/'+name;s.async=false;
   document.head.appendChild(s);
  });
 }catch(e){}
})();

(function(){
 try{
  if(!document.getElementById('vqcQuietCss')){
   const l=document.createElement('link');
   l.id='vqcQuietCss';l.rel='stylesheet';l.href='./css/ui-quiet.css?v=20261124-quiet-v1';
   document.head.appendChild(l);
  }
  if(!document.getElementById('vqcLoginUpgradeCss')){
   const l=document.createElement('link');
   l.id='vqcLoginUpgradeCss';l.rel='stylesheet';l.href='./css/login-upgrade.css?v=20261124-login-v2';
   document.head.appendChild(l);
  }
  const s=document.createElement('script');
  s.src='./js/login-upgrade.js?v=20261124-login-v2';s.async=false;
  document.head.appendChild(s);
 }catch(e){}
})();

(function(){
 let started=false;
 function start(){
  if(started)return;started=true;
  try{
   ['move-sounds.js?v=20261124-sounds-v1','move-fx.js?v=20261124-fx-v2','net-status.js?v=20261123-net-v1','class-live.js?v=20261123-live-v1','duel-review.js?v=20261126-review-v8','pvp-review.js?v=20261125-pvr-v3'].forEach(function(name){
    const s=document.createElement('script');
    s.src='./js/'+name;s.async=false;
    document.head.appendChild(s);
   });
  }catch(e){}
 }
 function later(){
  if(typeof window.requestIdleCallback==='function')window.requestIdleCallback(start,{timeout:3000});
  else setTimeout(start,1500);
 }
 if(document.readyState==='complete')later();
 else window.addEventListener('load',later,{once:true});
 setTimeout(start,10000);
})();
