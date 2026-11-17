/* Hai không gian độc lập: lớp học đồng bộ và hành trình cá nhân.
   Không sử dụng dữ liệu bài tập lớp để ghi tiến độ khám phá. */
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
   ['mateOverlay','mate3Overlay','pvpOverlay','captureOverlay','freeCaptureOverlay','defenseOverlay','pawnGameOverlay','checkOneOverlay','escapeOverlay','vqcMateOneOverlay','vqcMateOneBasicOverlay','starRewardOverlay'].forEach(id=>document.getElementById(id)?.classList.remove('open'));
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
 // Trạng thái lớp không được dùng để mở khóa vùng đất.
 document.querySelectorAll('.lesson').forEach(el=>el.title=(el.title?el.title+' · ':'')+'Hoạt động dùng trong lớp học');
 mode('home');
})();

/* Biểu tượng tab trình duyệt (favicon): huy hiệu logo bo tròn 64x64, rất nhẹ (~2KB),
   thay cho ảnh logo.png 1,3MB dạng chữ nhật. Không ảnh hưởng logo hiển thị trên trang. */
(function(){
 try{
  const uri='data:image/png;base64,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';
  const links=document.querySelectorAll('link[rel~="icon"]');
  if(links.length){
   links.forEach(function(l){l.type='image/png';l.removeAttribute('sizes');l.href=uri;});
  }else{
   const l=document.createElement('link');
   l.rel='icon';l.type='image/png';l.href=uri;
   document.head.appendChild(l);
  }
 }catch(e){}
})();
