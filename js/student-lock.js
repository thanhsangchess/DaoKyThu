(function(){
 'use strict';
 if(window.vqcStudentLock)return;
 const VERSION='20261123-lock-v2';
 const MSG='Giáo viên chọn bài cho cả lớp — em chỉ cần theo dõi nhé!';
 const LOCK_TITLE='Giáo viên chọn bài cho cả lớp';
 const GUARDED='.lesson,#vqcMobileLessonSheet .vqc-mobile-sheet__action,#vqcMobileLessonsShortcut,[data-vqc-mobile="lessons"],#vqcVsmToDuel';
 const OPENERS=['escapeOpen','checkOneOpen','captureOpen','freeCaptureOpen','defenseOpen','defenseOpenNew','openMateExercises','openMate3'];
 function currentRole(){
  try{if(typeof role!=='undefined'&&role)return role;}catch(e){}
  return window.accountProfile&&window.accountProfile.role||'student';
 }
 function inRoom(){try{return typeof roomRef!=='undefined'&&!!roomRef;}catch(e){return false;}}
 function locked(){
  if(window.accountProfile&&window.accountProfile.role==='teacher')return false;
  return currentRole()==='student'&&inRoom();
 }
 function applying(){
  try{if(typeof vqcNavApplying!=='undefined'&&vqcNavApplying)return true;}catch(e){}
  try{if(typeof vqcApplyingExercise!=='undefined'&&vqcApplyingExercise)return true;}catch(e){}
  return false;
 }
 let lastNote=0;
 function note(){
  const now=Date.now();if(now-lastNote<1500)return;lastNote=now;
  try{if(typeof vqcNotify==='function')vqcNotify(MSG,'warning');}catch(e){}
 }
 function hits(target){
  const el=target&&target.nodeType===1?target:(target&&target.parentElement);
  return !!(el&&el.closest&&el.closest(GUARDED));
 }
 function guard(event){
  if(!locked()||!hits(event.target))return;
  event.preventDefault();event.stopImmediatePropagation();
  note();
 }
 window.addEventListener('click',guard,true);
 window.addEventListener('auxclick',guard,true);
 window.addEventListener('keydown',function(event){if(event.key==='Enter'||event.key===' ')guard(event);},true);
 window.addEventListener('keyup',function(event){if(event.key==='Enter'||event.key===' ')guard(event);},true);

 function guardOpen(name){
  const fn=window[name];
  if(typeof fn!=='function'||fn.vqcLock)return false;
  const w=function(){
   if(locked()&&!applying()){note();return;}
   return fn.apply(this,arguments);
  };
  try{for(const k of Object.keys(fn))w[k]=fn[k];}catch(e){}
  w.vqcLock=true;w.vqcLockOrig=fn;
  try{window[name]=w;}catch(e){return false;}
  return true;
 }
 function wrapOpeners(){OPENERS.forEach(guardOpen);}
 wrapOpeners();

 const L='body.vqc-student-lessons-locked ';
 const NAV=['#captureStars','#freeCaptureStars','#defenseStars','#checkOneStars','#escapeStars'].map(function(s){return L+s+' button';})
  .concat(['captureOpen(','freeCaptureOpen(','defenseOpen(','checkOneOpen(','escapeOpen(','openMate3('].map(function(s){return L+'[onclick*="'+s+'"]';}))
  .concat([L+'[onclick="matePrev()"]',L+'[onclick="mateNext()"]']);
 const style=document.createElement('style');
 style.id='vqcStudentLockCss';
 style.textContent=L+'.lesson{cursor:not-allowed;opacity:.62}'+
  L+'.lesson:hover{filter:none;transform:none}'+
  NAV.join(',')+'{cursor:not-allowed}'+
  L+'#vqcVsmToDuel{display:none!important}';
 (document.head||document.documentElement).appendChild(style);
 let applied=false;
 function refresh(){
  wrapOpeners();
  const on=locked();
  document.body&&document.body.classList.toggle('vqc-student-lessons-locked',on);
  if(on){
   document.querySelectorAll('.lesson:not([data-vqc-lock])').forEach(function(el){
    el.setAttribute('data-vqc-lock','1');el.setAttribute('aria-disabled','true');
    el.setAttribute('data-vqc-title',el.getAttribute('title')||'');
    el.title=LOCK_TITLE;
   });
  }else if(applied){
   document.querySelectorAll('.lesson[data-vqc-lock]').forEach(function(el){
    el.removeAttribute('data-vqc-lock');el.removeAttribute('aria-disabled');
    const t=el.getAttribute('data-vqc-title');el.removeAttribute('data-vqc-title');
    if(el.getAttribute('title')===LOCK_TITLE){if(t)el.title=t;else el.removeAttribute('title');}
   });
  }
  applied=on;
 }
 setInterval(refresh,700);
 window.addEventListener('vqc:account-change',refresh);
 window.addEventListener('load',wrapOpeners);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refresh);else refresh();
 window.vqcStudentLock={locked:locked,refresh:refresh,message:MSG,version:VERSION,
  guarded:function(){return OPENERS.filter(function(n){return typeof window[n]==='function'&&window[n].vqcLock;});}};
})();
