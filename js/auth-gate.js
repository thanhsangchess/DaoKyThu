/*
 * Đảo Kỳ Thủ – lớp "yêu cầu đăng nhập" trên giao diện.
 * CHỈ là lớp trải nghiệm người dùng, KHÔNG phải cơ chế bảo mật:
 * quyền đọc/ghi thật sự do Firestore rules quyết định.
 *
 * Trạng thái được đặt lên <body>:
 *  - dkt-auth-pending : Firebase chưa báo trạng thái lần đầu (hoặc đang tải hồ sơ khi mở trang)
 *  - dkt-auth-guest   : chưa đăng nhập
 *  - dkt-auth-user    : đã đăng nhập và có hồ sơ hợp lệ (window.accountProfile)
 * File này không đọc/ghi Firestore và không đổi logic xác thực trong core.js:
 * form, accountSignIn(), kiểm tra active/role vẫn là của core.js.
 */
(function(){
 'use strict';
 if(window.dktAuthGate)return;
 var body=document.body;
 var overlay=document.getElementById('accountOverlay');
 var STATES=['pending','guest','user'];
 var authKnown=false,authUser=null,wasGuest=false;

 var REASONS={
  'class':'Em cần đăng nhập để vào lớp học.',
  islands:'Em cần đăng nhập để khám phá các đảo.',
  elo:'Em cần đăng nhập để luyện câu đố.',
  friends:'Em cần đăng nhập để xem bạn bè.',
  membership:'Em cần đăng nhập để xem gói thành viên.',
  board:'Em cần đăng nhập để dùng bàn cờ.'
 };
 /* Hành động được tự tiếp tục sau khi đăng nhập: gọi đúng hàm gốc mà nút đó gọi,
    tương đương người dùng bấm lại ngay sau khi đăng nhập. */
 var RESUME={
  'class':function(){if(typeof window.vqcEnterClass==='function')window.vqcEnterClass();},
  islands:function(){if(typeof window.vqcOpenWorld==='function')window.vqcOpenWorld();},
  elo:function(){if(window.vqcEloPuzzles&&typeof window.vqcEloPuzzles.open==='function')window.vqcEloPuzzles.open();}
 };
 var pending=null;      // {key, at}
 var lastTrigger=null;  // phần tử để trả lại focus khi đóng
 var autoSuppress=false;

 function isUser(){return !!(window.accountProfile&&window.accountProfile.uid);}
 function current(){
  if(isUser())return 'user';
  /* Đã từng là khách (đang đăng nhập trong hộp thoại) thì giữ trạng thái khách tới khi có hồ sơ. */
  if(authKnown&&(!authUser||wasGuest))return 'guest';
  return 'pending';
 }
 function overlayOpen(){return !!overlay&&!overlay.classList.contains('hidden');}
 function syncScrollLock(){body.classList.toggle('dkt-login-open',overlayOpen()&&!isUser());}
 function apply(){
  var s=current();
  if(s==='guest')wasGuest=true;
  STATES.forEach(function(name){body.classList.toggle('dkt-auth-'+name,name===s);});
  syncScrollLock();
  return s;
 }

 function setReason(key){
  var el=document.getElementById('dktLoginReason');
  if(!el)return;
  var text=REASONS[key]||'';
  el.textContent=text;
  el.hidden=!text;
 }
 function focusFirst(){
  var id=document.getElementById('accountLoginId');
  if(id&&typeof id.focus==='function'){try{id.focus({preventScroll:true});}catch(e){id.focus();}}
 }

 var origShow=window.showAccountPanel;
 function openLogin(key){
  if(isUser())return;
  if(current()==='pending')return; // chưa biết trạng thái: không mở gì
  key=key||'';
  pending=RESUME[key]?{key:key,at:Date.now()}:null;
  if(document.activeElement&&document.activeElement!==body)lastTrigger=document.activeElement;
  setReason(key);
  var err=document.getElementById('accountLoginError');
  if(err&&!overlayOpen())err.textContent='';
  if(typeof origShow==='function')origShow();
  else if(overlay)overlay.classList.remove('hidden');
  syncScrollLock();
  requestAnimationFrame(focusFirst);
 }
 function closeLogin(){
  if(isUser()||!overlay)return;
  overlay.classList.add('hidden');
  pending=null;
  syncScrollLock();
  if(lastTrigger&&document.contains(lastTrigger)&&typeof lastTrigger.focus==='function'){
   try{lastTrigger.focus({preventScroll:true});}catch(e){}
  }
  lastTrigger=null;
 }

 /* showAccountPanel(): core.js tự gọi khi Firebase báo "chưa đăng nhập" (lúc mở trang).
    Bọc lại để KHÔNG tự bật hộp thoại; các lần gọi do người dùng bấm vẫn mở như cũ. */
 if(typeof origShow==='function'){
  var wrappedShow=function(){
   if(isUser())return origShow.apply(this,arguments);
   if(autoSuppress&&!overlayOpen())return;
   if(overlayOpen())return origShow.apply(this,arguments);
   openLogin('');
  };
  wrappedShow.dktOrig=origShow;
  window.showAccountPanel=wrappedShow;
 }

 /* Nếu core.js đã kịp tự mở hộp thoại trước khi file này được nạp: đóng lại. */
 if(!isUser()&&overlay)overlay.classList.add('hidden');

 /* Chỉ đóng khi cả lúc nhấn lẫn lúc thả đều ở nền mờ (tránh đóng khi kéo chọn chữ trong ô nhập). */
 var downOnBackdrop=false;
 document.addEventListener('pointerdown',function(e){
  var t=e.target;
  downOnBackdrop=!!(t&&t.closest&&t.closest('#accountOverlay')&&!t.closest('#accountOverlay .account-modal'));
 },true);

 /* Các nút/điểm bấm khác dẫn tới chức năng (phần lớn đã bị ẩn với khách, nhưng vẫn có thể
    bị kích hoạt bằng .click() từ mã khác, ví dụ thanh điều hướng điện thoại). [selector, lý do] */
 var TRIGGERS=[
  ['#vqcFriendsOpen,[data-vqc-mobile="friends"]','friends'],
  ['#vqcMembershipLaunch','membership'],
  ['.vqc-appearance-open','board'],
  ['.header .room-box button,#vqcJoinArea,.lesson,[data-vqc-mobile="lessons"],[data-vqc-mobile="board"]','class'],
  ['[data-vqc-mobile]:not([data-vqc-mobile="home"]),.vqc-mobile-sheet__action','']
 ];
 function lockedKey(t){
  var zone=t.closest('[data-dkt-locked]');
  if(zone)return zone.getAttribute('data-dkt-locked')||'';
  for(var i=0;i<TRIGGERS.length;i++){if(t.closest(TRIGGERS[i][0]))return TRIGGERS[i][1];}
  return null;
 }

 /* Bấm nút "Đăng nhập", nút đóng, nền mờ, hoặc vùng chức năng bị khóa. Đăng ký ở pha capture
    trên window để chạy trước mọi onclick gốc và các bộ bắt sự kiện capture trên document. */
 window.addEventListener('click',function(e){
  var t=e.target;
  if(t&&t.nodeType!==1)t=t.parentElement;
  if(!t||!t.closest)return;
  if(t.closest('[data-dkt-login]')){e.preventDefault();openLogin('');return;}
  if(!isUser()&&overlayOpen()){
   if(t.closest('[data-dkt-login-close]')){e.preventDefault();closeLogin();return;}
   if(downOnBackdrop&&t.closest('#accountOverlay')&&!t.closest('#accountOverlay .account-modal')){closeLogin();return;}
  }
  if(isUser())return;
  var key=lockedKey(t);
  if(key===null)return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if(current()==='guest')openLogin(key);
 },true);

 /* Enter/Space trên các mục role="button" (không phải <button>) như .lesson. */
 window.addEventListener('keydown',function(e){
  if(isUser()||(e.key!=='Enter'&&e.key!==' '))return;
  var t=e.target;
  if(!t||!t.closest||t.closest('#accountOverlay'))return;
  if(t.tagName==='BUTTON'||t.tagName==='A'||t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT')return; // click sẽ được chặn ở trên
  var key=lockedKey(t);
  if(key===null)return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if(current()==='guest')openLogin(key);
 },true);

 /* Bọc các hàm toàn cục là điểm vào chức năng: khách → mở hộp đăng nhập, không chạy hàm gốc;
    đã đăng nhập → gọi hàm gốc nguyên vẹn. Không sửa thân hàm gốc. */
 var GUARDS=[
  ['vqcEnterClass','class'],['vqcJoinFromLanding','class'],['createRoom','class'],['joinRoom','class'],
  ['vqcOpenChallengeSafe','class'],['vqcWarmupOpen','class'],
  ['vqcOpenWorld','islands'],['vqcAdventureStart','islands'],['vqcArcadeOpen','islands'],
  ['vqcFriendChallengesOpen','friends'],
  ['vqcOpenMembershipSafe','membership'],['vqcOpenMembership','membership'],
  ['vqcOpenBoardAppearance','board']
 ];
 function guardFn(obj,name,key){
  if(!obj)return false;
  var fn=obj[name];
  if(typeof fn!=='function'||fn.dktGate)return false;
  var w=function(){
   if(!isUser()){openLogin(key);return undefined;}
   return fn.apply(this,arguments);
  };
  try{Object.keys(fn).forEach(function(k){w[k]=fn[k];});}catch(err){}
  w.dktGate=true;w.dktOrig=fn;
  try{obj[name]=w;}catch(err){return false;}
  return obj[name]===w;
 }
 function guardAll(){
  GUARDS.forEach(function(g){guardFn(window,g[0],g[1]);});
  guardFn(window.vqcEloPuzzles,'open','elo'); // elo-puzzles.js được nạp động, bọc khi xuất hiện
 }
 function guardedList(){
  var list=GUARDS.filter(function(g){return typeof window[g[0]]==='function'&&window[g[0]].dktGate;}).map(function(g){return g[0];});
  if(window.vqcEloPuzzles&&window.vqcEloPuzzles.open&&window.vqcEloPuzzles.open.dktGate)list.push('vqcEloPuzzles.open');
  if(window.showAccountPanel&&window.showAccountPanel.dktOrig)list.push('showAccountPanel');
  return list;
 }
 guardAll();
 window.addEventListener('load',guardAll);
 /* Một số script được nạp động hoặc gán lại hàm về sau: kiểm tra lại định kỳ (rất nhẹ). */
 setInterval(guardAll,1000);

 /* Esc để đóng, Tab không thoát khỏi hộp thoại (chỉ khi là khách). */
 document.addEventListener('keydown',function(e){
  if(isUser()||!overlayOpen())return;
  if(e.key==='Escape'){e.preventDefault();closeLogin();return;}
  if(e.key!=='Tab')return;
  var modal=overlay.querySelector('.account-modal');
  if(!modal)return;
  var list=Array.prototype.filter.call(modal.querySelectorAll('button,input,select,textarea,a[href],[tabindex]:not([tabindex="-1"])'),function(n){
   return !n.disabled&&n.getClientRects().length>0&&getComputedStyle(n).visibility!=='hidden';
  });
  if(!list.length)return;
  var first=list[0],last=list[list.length-1];
  if(!modal.contains(document.activeElement)){e.preventDefault();first.focus();return;}
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
 },true);

 function resumePending(){
  var p=pending;pending=null;
  if(!p||Date.now()-p.at>180000||!RESUME[p.key])return;
  setTimeout(function(){
   if(!isUser())return;
   try{RESUME[p.key]();}catch(err){console.warn('[auth-gate] resume',err);}
  },350);
 }

 window.addEventListener('vqc:account-change',function(){
  if(!isUser()){
   /* core.js gọi showAccountPanel() ngay sau sự kiện này khi chưa đăng nhập. */
   autoSuppress=true;
   setTimeout(function(){autoSuppress=false;},0);
  }
  var before=body.classList.contains('dkt-auth-user');
  apply();
  if(!before&&isUser())resumePending();
 });
 if(overlay&&typeof MutationObserver==='function'){
  new MutationObserver(syncScrollLock).observe(overlay,{attributes:true,attributeFilter:['class']});
 }
 try{
  if(typeof auth!=='undefined'&&auth&&typeof auth.onAuthStateChanged==='function'){
   auth.onAuthStateChanged(function(user){authKnown=true;authUser=user||null;apply();});
  }else{authKnown=true;}
 }catch(err){authKnown=true;console.warn('[auth-gate]',err);}
 apply();

 window.dktAuthGate={state:current,openLogin:openLogin,closeLogin:closeLogin,reasons:REASONS,guarded:guardedList};
})();
