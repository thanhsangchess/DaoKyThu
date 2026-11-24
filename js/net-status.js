(function(){
 'use strict';
 if(window.vqcNet)return;
 const VERSION='20261123-net-v1';
 const PROBE_MS=Number(window.vqcNetProbeMs)||8000;
 const FAILS_TO_OFFLINE=2;
 let offline=false,offSince=0,fails=0,probing=false,hideTimer=0,tickTimer=0,lastProbeOk=true;
 function inRoom(){try{return typeof roomRef!=='undefined'&&!!roomRef;}catch(e){return false;}}
 function isTeacher(){try{return typeof role!=='undefined'?role==='teacher':!!(window.accountProfile&&window.accountProfile.role==='teacher');}catch(e){return false;}}

 function css(){
  if(document.getElementById('vqcNetCss'))return;
  const st=document.createElement('style');st.id='vqcNetCss';
  st.textContent='#vqcNetBanner{position:fixed;top:10px;left:50%;transform:translate(-50%,-140%);z-index:5400;max-width:min(92vw,560px);padding:9px 16px;border-radius:999px;font:700 14px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;color:#fff;background:#d9534f;box-shadow:0 6px 20px rgba(0,0,0,.25);pointer-events:none;transition:transform .25s ease,opacity .25s ease;opacity:0;text-align:center}'+
   '#vqcNetBanner.show{transform:translate(-50%,0);opacity:1}#vqcNetBanner.ok{background:#238b62}'+
   '@media(prefers-reduced-motion:reduce){#vqcNetBanner{transition:none}}';
  document.head.appendChild(st);
 }
 function banner(){
  let b=document.getElementById('vqcNetBanner');
  if(!b&&document.body){
   css();
   b=document.createElement('div');b.id='vqcNetBanner';b.setAttribute('role','status');b.setAttribute('aria-live','polite');
   document.body.appendChild(b);
  }
  return b;
 }
 function offlineText(){
  const s=Math.max(0,Math.round((Date.now()-offSince)/1000));
  const t=s>=60?Math.floor(s/60)+' phút '+(s%60)+' giây':s+' giây';
  if(inRoom())return '📡 Mất kết nối mạng ('+t+') — '+(isTeacher()?'học sinh chưa nhận được thao tác của giáo viên. Đang thử kết nối lại…':'em chưa nhận được thao tác của giáo viên. Đang thử kết nối lại…');
  return '📡 Mất kết nối mạng ('+t+') — một số tính năng cần mạng tạm dừng. Đang thử kết nối lại…';
 }
 function showOffline(){
  const b=banner();if(!b)return;
  clearTimeout(hideTimer);
  b.classList.remove('ok');b.textContent=offlineText();b.classList.add('show');
 }
 function showBack(){
  const b=banner();if(!b)return;
  clearTimeout(hideTimer);
  b.classList.add('ok');b.textContent='✅ Đã kết nối lại';b.classList.add('show');
  hideTimer=setTimeout(function(){b.classList.remove('show');},3200);
 }
 function setOffline(){
  if(offline)return;
  offline=true;offSince=Date.now();
  showOffline();
  clearInterval(tickTimer);
  tickTimer=setInterval(function(){if(offline)showOffline();},1000);
  try{window.dispatchEvent(new CustomEvent('vqc:net',{detail:{online:false}}));}catch(e){}
 }
 function setOnline(){
  if(!offline)return;
  offline=false;fails=0;
  clearInterval(tickTimer);
  showBack();
  try{if(typeof db!=='undefined'&&db&&typeof db.enableNetwork==='function')db.enableNetwork().catch(function(){});}catch(e){}
  try{if(typeof role!=='undefined'&&role==='student'&&typeof sendStudentHeartbeat==='function')sendStudentHeartbeat();}catch(e){}
  try{window.dispatchEvent(new CustomEvent('vqc:net',{detail:{online:true}}));}catch(e){}
 }
 async function probe(){
  if(probing)return lastProbeOk;
  probing=true;
  let ok=false;
  try{
   const ac=typeof AbortController==='function'?new AbortController():null;
   const to=setTimeout(function(){if(ac)ac.abort();},5000);
   const r=await fetch(location.pathname+(location.search||''),{method:'HEAD',cache:'no-store',signal:ac?ac.signal:undefined});
   clearTimeout(to);
   ok=!!r;
  }catch(e){ok=false;}
  probing=false;lastProbeOk=ok;
  if(ok){fails=0;setOnline();}
  else{fails++;if(fails>=FAILS_TO_OFFLINE||navigator.onLine===false)setOffline();}
  return ok;
 }
 window.addEventListener('offline',function(){setOffline();});
 window.addEventListener('online',function(){probe();});
 setInterval(function(){
  if(document.visibilityState==='hidden')return;
  if(inRoom()||offline)probe();
 },PROBE_MS);
 document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible'&&(inRoom()||offline))probe();});
 if(navigator.onLine===false){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setOffline);else setOffline();}
 window.vqcNet={version:VERSION,isOnline:function(){return !offline;},probe:probe,_state:function(){return {offline:offline,fails:fails};}};
})();
