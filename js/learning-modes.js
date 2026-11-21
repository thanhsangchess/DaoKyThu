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
   ['mateOverlay','mate3Overlay','pvpOverlay','captureOverlay','freeCaptureOverlay','defenseOverlay','pawnGameOverlay','checkOneOverlay','escapeOverlay','vqcMateOneOverlay','vqcMateOneBasicOverlay','vqcMateThreeOverlay','starRewardOverlay'].forEach(id=>document.getElementById(id)?.classList.remove('open'));
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

/* Biểu tượng tab trình duyệt (favicon): dùng ảnh assets/Logo-the-trang-web-co-vua.png
   (quân Vua xanh, nền trong suốt). Không ảnh hưởng logo hiển thị trên trang.
   Đổi ?v=... khi thay ảnh để trình duyệt tải bản mới. */
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

/* Mate in 3 (500 bài): nạp dữ liệu 5 phần rồi tới module, đúng thứ tự.
   Menu "Mate in 3" tự gắn vào danh sách bài học trong lớp (xem js/mate-three-pdf-500.js). */
(function(){
 try{
  const v='?v=20261121-m3-v2';
  const mountDrawing=function(){try{if(typeof window.vqcAnnotationsMount==='function')window.vqcAnnotationsMount();}catch(e){}};
  const names=['mate-three-pdf-500-data.js','mate-three-pdf-500-data-2.js','mate-three-pdf-500-data-3.js','mate-three-pdf-500-data-4.js','mate-three-pdf-500-data-5.js','mate-three-pdf-500.js'];
  names.forEach(function(name,i){
   const s=document.createElement('script');
   s.src='./js/'+name+v;s.async=false;
   if(i===names.length-1){
    // Bàn cờ Mate in 3 được tạo sau khi trang nạp xong: gắn lớp vẽ mũi tên cho bàn này.
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
