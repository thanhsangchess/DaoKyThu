(function(){
 'use strict';
 if(window.vqcClassLive)return;
 const VERSION='20261123-live-v1';
 const HB_MS=Number(window.vqcLiveHbMs)||20000,ONLINE_MS=65000,WRITE_GAP=Number(window.vqcLiveGapMs)||3000,STUCK_STREAK=3,STUCK_IDLE_S=300;
 const LABELS={mateOverlay:'Chiếu hết 2 nước',mate3Overlay:'Chiếu hết 3 nước',pvpOverlay:'Đấu 2 người',captureOverlay:'Ăn quân',freeCaptureOverlay:'Ăn quân không được bảo vệ',
  defenseOverlay:'Phòng thủ',pawnGameOverlay:'Trò chơi Tốt',checkOneOverlay:'Chiếu trong 1 nước',escapeOverlay:'Thoát chiếu',vqcMateOneOverlay:'Chiếu hết 1 nước',
  vqcMateOneBasicOverlay:'Chiếu hết 1 nước (cơ bản)',vqcMateThreeOverlay:'Mate in 3',vqcVsMachineOverlay:'Đấu với máy',vqcChdOverlay:'Đấu cờ tàn',vqcLoneMateOverlay:'Tập chiếu hết',
  castlingOverlay:'Nhập thành',doubleAttackOverlay:'Tấn công đôi'};
 const IDLE_VIEW='Bàn cờ chính';
 function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
 function roomCode(){try{return typeof roomRef!=='undefined'&&roomRef?String(roomRef.id||''):'';}catch(e){return '';}}
 function myRole(){try{if(window.accountProfile&&window.accountProfile.role==='teacher')return 'teacher';return typeof role!=='undefined'?role:(window.accountProfile&&window.accountProfile.role)||'';}catch(e){return '';}}
 function myUid(){try{if(typeof auth!=='undefined'&&auth.currentUser&&auth.currentUser.uid)return auth.currentUser.uid;}catch(e){}return (window.accountProfile&&window.accountProfile.uid)||'';}
 function myName(){const p=window.accountProfile;return (p&&(p.name||p.code))?String(p.name||p.code).slice(0,60):'Học sinh';}
 function liveRef(){const c=roomCode();try{return c&&typeof db!=='undefined'?db.collection('rooms').doc(c+'-live'):null;}catch(e){return null;}}
 function viewLabel(){
  const open=document.querySelectorAll('[id$="Overlay"].open');
  let name='';
  for(let i=open.length-1;i>=0;i--){const id=open[i].id;if(LABELS[id]){name=LABELS[id];break;}}
  return name||IDLE_VIEW;
 }

 const me={ok:0,err:0,streak:0,lk:'',view:'',viewSince:Date.now(),lastOk:0,lastWrite:0,dirty:true,timer:0,room:''};
 function onResult(e){
  if(myRole()!=='student'||!roomCode())return;
  const k=e.detail&&e.detail.kind;
  if(k==='ok'){me.ok++;me.streak=0;me.lastOk=Date.now();}
  else if(k==='err'){me.err++;me.streak++;}
  else return;
  me.lk=k;me.dirty=true;schedule(1200);
 }
 window.addEventListener('vqc:result',onResult);
 function schedule(ms){
  if(me.timer)return;
  const wait=Math.max(ms,WRITE_GAP-(Date.now()-me.lastWrite),0);
  me.timer=setTimeout(function(){me.timer=0;writeMine();},wait);
 }
 async function writeMine(){
  const ref=liveRef(),uid=myUid();
  if(!ref||!uid||myRole()!=='student'||typeof firebase==='undefined')return;
  const now=Date.now(),since=Math.max(me.viewSince,me.lastOk||0);
  const payload={n:myName(),v:me.view,ok:me.ok,err:me.err,st:me.streak,lk:me.lk,idle:Math.max(0,Math.round((now-since)/1000)),at:firebase.firestore.FieldValue.serverTimestamp()};
  me.lastWrite=now;me.dirty=false;
  try{await ref.set({s:{[uid]:payload}},{merge:true});}
  catch(e){me.dirty=true;console.info('[Theo dõi lớp] chưa ghi được (sẽ thử lại):',e&&e.code||e);}
 }
 function studentTick(){
  const room=roomCode();
  if(room!==me.room){me.room=room;me.ok=0;me.err=0;me.streak=0;me.lk='';me.lastOk=0;me.view=viewLabel();me.viewSince=Date.now();me.dirty=true;}
  if(myRole()!=='student'||!room||document.visibilityState==='hidden')return;
  const v=viewLabel();
  if(v!==me.view){me.view=v;me.viewSince=Date.now();me.streak=0;me.dirty=true;schedule(300);}
  if(Date.now()-me.lastWrite>=HB_MS)me.dirty=true;
  if(me.dirty)schedule(0);
 }

 let rows={},off=null,listenKey='',panelOpen=false,srvOffset=0;
 try{panelOpen=localStorage.getItem('vqc-live-open')==='1';}catch(e){}
 function nowSrv(){
  try{const d=window.vqcClassTimer&&window.vqcClassTimer._debug&&window.vqcClassTimer._debug();if(d&&d.offsetSynced&&isFinite(d.offset))return Date.now()+d.offset;}catch(e){}
  return Date.now()+srvOffset;
 }
 function toMs(v){return v&&typeof v.toMillis==='function'?v.toMillis():(typeof v==='number'?v:null);}
 function listen(){
  const key=myRole()==='teacher'?roomCode():'';
  if(key===listenKey)return;
  if(off){try{off();}catch(e){}off=null;}
  rows={};listenKey=key;
  if(!key){paint();return;}
  const ref=liveRef();if(!ref)return;
  try{
   off=ref.onSnapshot(function(snap){
    if(listenKey!==key)return;
    const d=snap&&snap.exists?snap.data():null;
    rows=d&&d.s&&typeof d.s==='object'?d.s:{};
    paint();
   },function(err){console.info('[Theo dõi lớp] không đọc được:',err&&err.code||err);});
  }catch(e){}
 }
 function classify(r){
  const at=toMs(r.at),age=at==null?0:Math.max(0,nowSrv()-at);
  const online=age<ONLINE_MS;
  const idle=(Number(r.idle)||0)+(online?Math.round(age/1000):0);
  const st=Number(r.st)||0;
  const idleView=r.v&&r.v!==IDLE_VIEW;
  const stuck=online&&(st>=STUCK_STREAK||(idleView&&idle>=STUCK_IDLE_S&&(Number(r.err)||0)>0));
  return {online:online,stuck:stuck,idle:idle,age:age};
 }
 function list(){
  const out=Object.keys(rows).map(function(uid){const r=rows[uid]||{};return {uid:uid,r:r,c:classify(r)};});
  out.sort(function(a,b){
   const ra=a.c.stuck?0:(a.c.online?1:2),rb=b.c.stuck?0:(b.c.online?1:2);
   return ra-rb||String(a.r.n||'').localeCompare(String(b.r.n||''),'vi');
  });
  return out;
 }
 function css(){
  if(document.getElementById('vqcLiveCss'))return;
  const st=document.createElement('style');st.id='vqcLiveCss';
  st.textContent='#vqcLiveBtn{position:fixed;left:58px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:5300;height:38px;padding:0 14px;border-radius:999px;border:1px solid #c8dff0;background:#fff;box-shadow:0 3px 10px rgba(20,60,100,.18);font:700 14px/1 system-ui,-apple-system,"Segoe UI",sans-serif;color:#24527a;cursor:pointer;display:none}'+
   '#vqcLiveBtn.on{display:inline-flex;align-items:center;gap:6px}#vqcLiveBtn .dot{width:9px;height:9px;border-radius:50%;background:#e5484d;display:none}#vqcLiveBtn.alert .dot{display:inline-block}'+
   '#vqcLivePanel{position:fixed;left:12px;bottom:calc(60px + env(safe-area-inset-bottom,0px));z-index:5300;width:min(94vw,360px);max-height:min(62vh,520px);display:none;flex-direction:column;background:#fff;border:1px solid #cfe2f1;border-radius:16px;box-shadow:0 12px 36px rgba(20,60,100,.28);font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;color:#26384a;overflow:hidden}'+
   '#vqcLivePanel.open{display:flex}#vqcLivePanel header{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#eef6fd;font-weight:800}#vqcLivePanel header span{flex:1}#vqcLivePanel header button{border:0;background:transparent;font-size:18px;cursor:pointer;color:#456}'+
   '#vqcLiveSum{padding:6px 12px;font-size:12.5px;color:#587}#vqcLiveRows{overflow:auto;padding:0 8px 10px}.vqc-live-row{display:grid;grid-template-columns:14px 1fr auto;gap:8px;align-items:center;padding:8px 6px;border-bottom:1px solid #eef3f8}'+
   '.vqc-live-row .d{width:10px;height:10px;border-radius:50%;background:#2fb57a}.vqc-live-row.off .d{background:#b9c3cc}.vqc-live-row.stuck .d{background:#e5484d}.vqc-live-row.stuck{background:#fff5f4}.vqc-live-row.off{opacity:.62}'+
   '.vqc-live-row b{display:block}.vqc-live-row small{color:#6a7f92}.vqc-live-row .n{white-space:nowrap;font-weight:800}.vqc-live-row .n i{font-style:normal;color:#2a9a63}.vqc-live-row .n u{text-decoration:none;color:#d2493f;margin-left:6px}'+
   '.vqc-live-tag{display:inline-block;margin-left:6px;padding:1px 7px;border-radius:999px;font-size:11.5px;font-weight:800;background:#ffe3e0;color:#b3382f}.vqc-live-empty{padding:16px 12px;color:#6a7f92}'+
   '@media(max-width:760px){#vqcLiveBtn{bottom:calc(84px + env(safe-area-inset-bottom,0px))}#vqcLivePanel{bottom:calc(132px + env(safe-area-inset-bottom,0px))}}';
  document.head.appendChild(st);
 }
 function mountUi(){
  if(!document.body)return;
  css();
  if(!document.getElementById('vqcLiveBtn')){
   const b=document.createElement('button');b.type='button';b.id='vqcLiveBtn';b.innerHTML='<span class="dot"></span><span class="t">📊 Theo dõi lớp</span>';
   b.addEventListener('click',function(){panelOpen=!panelOpen;try{localStorage.setItem('vqc-live-open',panelOpen?'1':'0');}catch(e){}paint();});
   document.body.appendChild(b);
   const p=document.createElement('div');p.id='vqcLivePanel';p.setAttribute('role','region');p.setAttribute('aria-label','Theo dõi lớp');
   p.innerHTML='<header><span>📊 Theo dõi lớp</span><button type="button" id="vqcLiveClose" aria-label="Đóng">✕</button></header><div id="vqcLiveSum"></div><div id="vqcLiveRows"></div>';
   document.body.appendChild(p);
   p.querySelector('#vqcLiveClose').addEventListener('click',function(){panelOpen=false;try{localStorage.setItem('vqc-live-open','0');}catch(e){}paint();});
  }
 }
 function fmtIdle(s){return s>=3600?Math.floor(s/3600)+' giờ':s>=60?Math.floor(s/60)+' phút':s+' giây';}
 function paint(){
  if(!document.getElementById('vqcLiveBtn')&&!(myRole()==='teacher'&&roomCode()))return;
  mountUi();
  const btn=document.getElementById('vqcLiveBtn'),panel=document.getElementById('vqcLivePanel');
  if(!btn||!panel)return;
  const teacherIn=myRole()==='teacher'&&!!roomCode();
  btn.classList.toggle('on',teacherIn);
  if(!teacherIn){panel.classList.remove('open');return;}
  const L=list(),online=L.filter(function(x){return x.c.online;}).length,stuck=L.filter(function(x){return x.c.stuck;}).length;
  btn.classList.toggle('alert',stuck>0);
  btn.querySelector('.t').textContent='📊 Theo dõi lớp'+(L.length?' ('+online+'/'+L.length+')':'');
  panel.classList.toggle('open',panelOpen);
  if(!panelOpen)return;
  document.getElementById('vqcLiveSum').textContent=L.length?(online+' em trực tuyến'+(stuck?' · '+stuck+' em có thể cần giúp':'')+' · cập nhật tự động'):'';
  const box=document.getElementById('vqcLiveRows');
  if(!L.length){box.innerHTML='<div class="vqc-live-empty">Chưa có học sinh nào gửi tín hiệu. Khi học sinh vào lớp và làm bài, danh sách sẽ hiện ở đây.</div>';return;}
  box.innerHTML=L.map(function(x){
   const r=x.r,c=x.c,cls='vqc-live-row'+(c.stuck?' stuck':(c.online?'':' off'));
   const tag=c.stuck?((Number(r.st)||0)>=STUCK_STREAK?'<span class="vqc-live-tag">sai liên tiếp ×'+(Number(r.st)||0)+'</span>':'<span class="vqc-live-tag">lâu chưa tiến triển</span>'):'';
   const sub=c.online?esc(r.v||IDLE_VIEW)+(c.idle>=60?' · '+fmtIdle(c.idle)+' chưa đúng':''):'mất kết nối '+fmtIdle(Math.round(c.age/1000))+' trước';
   return '<div class="'+cls+'"><span class="d"></span><div><b>'+esc(r.n||'Học sinh')+tag+'</b><small>'+sub+'</small></div><span class="n"><i>✔ '+(Number(r.ok)||0)+'</i><u>✖ '+(Number(r.err)||0)+'</u></span></div>';
  }).join('');
 }
 function teacherTick(){listen();paint();}

 setInterval(function(){try{studentTick();teacherTick();}catch(e){console.warn('[Theo dõi lớp]',e);}},1000);
 window.vqcClassLive={version:VERSION,list:list,viewLabel:viewLabel,_rows:function(){return rows;},_flush:writeMine};
})();
