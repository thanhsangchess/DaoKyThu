(function(){
'use strict';
if(window.vqcClassTimer)return;
const VERSION='20261122-timer-v10';
const MAX_MS=(99*60+59)*1000,DEFAULT_MS=300000;
const STYLES=[['big','Số lớn','0:2'],['ring','Vòng tròn','◯'],['led','Bảng LED','▤'],['flip','Lật số','▥'],['glass','Đồng hồ cát','⌛']];
const QUICK=[30,60,120,180,300,600,900,1200];
const LABEL={ready:'SẴN SÀNG',running:'ĐANG CHẠY',paused:'TẠM DỪNG',done:'HẾT GIỜ'};
const SVG=(vb,body)=>'<svg viewBox="'+vb+'" aria-hidden="true" focusable="false">'+body+'</svg>';
const ICON={
 ready:SVG('0 0 16 16','<circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5.2 8.3l2 2 3.7-4.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'),
 running:SVG('0 0 16 16','<path d="M4.5 2.6v10.8L13.2 8z" fill="currentColor"/>'),
 paused:SVG('0 0 16 16','<rect x="3.4" y="2.8" width="3.2" height="10.4" rx="1" fill="currentColor"/><rect x="9.4" y="2.8" width="3.2" height="10.4" rx="1" fill="currentColor"/>'),
 done:SVG('0 0 16 16','<path d="M8 1.6a4.1 4.1 0 0 0-4.1 4.1V8L2.6 10.4v.9h10.8v-.9L12.1 8V5.7A4.1 4.1 0 0 0 8 1.6zM6.3 12.5a1.7 1.7 0 0 0 3.4 0z" fill="currentColor"/>'),
 eye:SVG('0 0 24 24','<path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/>'),
 eyeoff:SVG('0 0 24 24','<path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3.8 3.8l16.4 16.4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>')
};
function setIcon(el,k){if(!el||el.dataset.k===k)return;el.dataset.k=k;if(k==='idle')el.textContent='⏱';else el.innerHTML=ICON[k]||'';}
const $=id=>document.getElementById(id);
const pad=n=>(n<10?'0':'')+n;
const clampInt=(n,min,max)=>{n=Math.round(Number(n));if(!isFinite(n))n=min;return Math.max(min,Math.min(max,n));};
function fmt(ms,tenths){const s=Math.floor(Math.max(0,ms)/1000);return pad(Math.floor(s/60))+':'+pad(s%60)+(tenths?'.'+Math.floor((ms%1000)/100):'');}
function toMs(v){
 if(v==null)return null;
 if(typeof v==='number')return v;
 if(typeof v.toMillis==='function')return v.toMillis();
 if(typeof v.seconds==='number')return v.seconds*1000+Math.floor((v.nanoseconds||0)/1e6);
 return null;
}
function notify(text,type){try{if(typeof vqcNotify==='function')vqcNotify(text,type||'info');}catch(e){}}

const inRoom=()=>typeof roomRef!=='undefined'&&!!roomRef;
const isTeacher=()=>!!(window.accountProfile&&window.accountProfile.role==='teacher');
const classMode=()=>document.body&&document.body.classList.contains('vqc-mode-class');
let ctx={ref:null,initial:true};
let timer=null,localTimer=null;
let personalStyle=null,minimized=false,overlayOpen=false,fullscreen=false;
let view={panel:false,fs:false},viewSent={panel:false,fs:false},viewTimer=0,wantOpen=false;
let ticker=null,root=null,chip=null,toast=null,faces=null,toastTimer=null;
let queue=Promise.resolve();
let pin=null,dragging=false,suppressClick=false,lastFocus=null,probe=null,placeTimer=0;
let place={x:null,y:null,lv:0,at:0,sig:'',w:0,rx:null,pref:true,tol:2};

let offset=0,offsetSynced=false,clockBusy=false,clockRetryAt=0,clockSyncedAt=0,fallbackOffset=null,lastObsAnchor=null;
function serverNow(){return Date.now()+offset;}
function nowMs(){return inRoom()?serverNow():Date.now();}
async function syncClock(force){
 if(clockBusy||typeof db==='undefined'||typeof auth==='undefined'||!auth.currentUser)return;
 const t=Date.now();
 if(t<clockRetryAt)return;
 if(!force&&offsetSynced&&t-clockSyncedAt<15*60000)return;
 clockBusy=true;
 try{
  const ref=db.collection('clockSync').doc(auth.currentUser.uid);let best=null;
  for(let i=0;i<3;i++){
   const t0=Date.now();
   await ref.set({at:firebase.firestore.FieldValue.serverTimestamp()});
   const t1=Date.now(),snap=await ref.get({source:'server'}),at=toMs(snap.exists?snap.data().at:null);
   if(at==null)continue;
   const rtt=t1-t0;
   if(!best||rtt<best.rtt)best={rtt,o:at-(t0+t1)/2};
  }
  if(best){offset=Math.round(best.o);offsetSynced=true;clockSyncedAt=Date.now();render();}
 }catch(e){
  clockRetryAt=Date.now()+10*60000;console.info('[Đồng hồ lớp] chưa đồng bộ giờ máy chủ chính xác:',e&&e.code||e);
 }finally{clockBusy=false;}
}

function norm(raw){
 if(!raw||typeof raw!=='object')return null;
 return {
  open:raw.open!==false,
  mode:raw.mode==='up'?'up':'down',
  status:['ready','running','paused'].includes(raw.status)?raw.status:'ready',
  dur:clampInt(raw.dur,0,86400000),base:clampInt(raw.base,0,360000000),
  anchor:toMs(raw.anchor),pausedAt:toMs(raw.pausedAt),
  laps:Array.isArray(raw.laps)?raw.laps.slice(0,60).map(x=>clampInt(x,0,360000000)):[],
  style:STYLES.some(s=>s[0]===raw.style)?raw.style:'big',
  beep:raw.beep!==false,seq:clampInt(raw.seq,0,1e9)
 };
}
const blank=()=>({open:true,mode:'down',status:'ready',dur:DEFAULT_MS,base:DEFAULT_MS,anchor:null,pausedAt:null,laps:[],style:'big',beep:true,seq:-1});
function runMs(T,now){
 if(T.status==='ready'||T.anchor==null)return 0;
 const end=T.status==='paused'?(T.pausedAt!=null?T.pausedAt:T.anchor):now;
 return Math.max(0,end-T.anchor);
}
function valueOf(T,now){
 const r=runMs(T,now);
 return T.mode==='down'?Math.max(0,T.base-r):Math.min(MAX_MS+999,T.base+r);
}
function viewOf(T,now){
 const value=valueOf(T,now),finished=T.mode==='down'&&T.status!=='ready'&&value<=0;
 let secs,tenths=0,frac;
 if(T.mode==='down'){secs=Math.ceil(value/1000);frac=T.dur>0?Math.min(1,value/T.dur):0;}
 else{secs=Math.floor(value/1000);tenths=Math.floor((value%1000)/100);frac=(value%60000)/60000;}
 secs=Math.min(secs,99*60+59);
 return {T,value,finished,state:finished?'done':T.status,secs,tenths,frac,mm:Math.floor(secs/60),ss:secs%60,
  over:T.mode==='down'&&T.status==='running'?runMs(T,now)-T.base:-1};
}
const current=()=>inRoom()?timer:(isTeacher()?localTimer:null);
const shown=()=>current()||(isTeacher()||(inRoom()&&view.panel)?blank():null);

function plan(prev,now,mut){
 const p=prev||blank();
 const o={open:p.open!==false,mode:p.mode,status:p.status,dur:p.dur,base:p.base,laps:p.laps.slice(),style:p.style,beep:p.beep,seq:p.seq+1,
  anchorOp:p.anchor==null?'null':'keep',pausedOp:p.pausedAt==null?'null':'keep',skip:false};
 mut(o,p,now);
 return o;
}
const clearTimes=o=>{o.anchorOp='null';o.pausedOp='null';};
const ACT={
 setTime:ms=>(o)=>{o.mode='down';o.status='ready';o.dur=o.base=clampInt(ms,1000,MAX_MS);o.laps=[];clearTimes(o);},
 setMode:m=>(o,p)=>{o.mode=m;o.status='ready';o.base=m==='down'?(p.dur||DEFAULT_MS):0;o.laps=[];clearTimes(o);},
 main:()=>(o,p,now)=>{
  const v=viewOf(p,now);
  if(p.status==='running'&&!v.finished){o.status='paused';o.pausedOp='now';return;}
  if(p.status==='paused'){
   const cur=valueOf(p,now);
   o.status='running';o.base=p.mode==='down'&&cur<=0?(p.dur||DEFAULT_MS):Math.round(cur);o.anchorOp='now';o.pausedOp='null';return;
  }
  if(v.finished){o.status='running';o.base=p.dur||DEFAULT_MS;o.laps=[];o.anchorOp='now';o.pausedOp='null';return;}
  o.status='running';o.anchorOp='now';o.pausedOp='null';
 },
 reset:()=>(o,p)=>{o.status='ready';o.base=p.mode==='down'?(p.dur||DEFAULT_MS):0;o.laps=[];clearTimes(o);},
 adjust:d=>(o,p,now)=>{
  if(p.mode!=='down'){o.skip=true;return;}
  const v=viewOf(p,now);
  if(p.status==='ready'){o.dur=o.base=clampInt(p.dur+d,1000,MAX_MS);return;}
  if(v.finished){
   if(d<=0){o.skip=true;return;}
   o.status='paused';o.base=clampInt(d,1000,MAX_MS);o.dur=Math.max(p.dur,o.base);o.anchorOp='now';o.pausedOp='now';return;
  }
  const cur=v.value,nv=clampInt(cur+d,0,MAX_MS);
  o.base=p.base+(nv-cur);o.dur=Math.max(nv,clampInt(p.dur+d,1000,MAX_MS));
 },
 lap:()=>(o,p,now)=>{
  if(p.mode!=='up'||p.status!=='running'||p.laps.length>=60){o.skip=true;return;}
  o.laps.push(Math.round(valueOf(p,now)));
 },
 style:s=>(o,p)=>{o.style=s;o.open=p.open;},
 beep:b=>(o,p)=>{o.beep=!!b;o.open=p.open;},
 hide:()=>(o)=>{o.open=false;},
 show:()=>(o)=>{o.open=true;}
};
function toDoc(o,prevRaw){
 const FV=firebase.firestore.FieldValue;
 const val=(op,kept)=>op==='now'?FV.serverTimestamp():op==='keep'?(kept==null?null:kept):null;
 return {open:!!o.open,mode:o.mode,status:o.status,dur:o.dur,base:o.base,
  anchor:val(o.anchorOp,prevRaw&&prevRaw.anchor),pausedAt:val(o.pausedOp,prevRaw&&prevRaw.pausedAt),
  laps:o.laps,style:o.style,beep:o.beep,seq:o.seq};
}
function send(mut){
 if(!isTeacher())return Promise.resolve();
 if(!inRoom()){
  const t=Date.now(),o=plan(localTimer,t,mut);
  if(!o.skip){
   const prev=localTimer||blank();
   localTimer={open:true,mode:o.mode,status:o.status,dur:o.dur,base:o.base,laps:o.laps,style:o.style,beep:o.beep,seq:o.seq,
    anchor:o.anchorOp==='now'?t:o.anchorOp==='keep'?prev.anchor:null,pausedAt:o.pausedOp==='now'?t:o.pausedOp==='keep'?prev.pausedAt:null};
   render();
  }
  return Promise.resolve();
 }
 const ref=roomRef,uid=auth.currentUser&&auth.currentUser.uid;
 queue=queue.then(()=>db.runTransaction(async tx=>{
  const snap=await tx.get(ref);
  if(!snap.exists)throw Error('Phòng không còn tồn tại.');
  const prevRaw=(snap.data()||{}).classTimer||null,o=plan(norm(prevRaw),serverNow(),mut);
  if(o.skip)return;
  tx.update(ref,{classTimer:toDoc(o,prevRaw),teacherId:uid,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
 })).catch(e=>{console.warn('Không cập nhật được đồng hồ lớp:',e);notify('Chưa cập nhật được đồng hồ. Hãy kiểm tra kết nối phòng.','warning');});
 return queue;
}

function resetCtx(ref){
 const old=ctx.ref;
 if(old&&old!==ref&&isTeacher()&&(viewSent.panel||viewSent.fs))writeView(old,{panel:false,fs:false});
 clearTimeout(viewTimer);viewTimer=0;
 ctx={ref,initial:true};timer=null;personalStyle=null;lastObsAnchor=null;soundReset();
 view={panel:false,fs:false};viewSent={panel:false,fs:false};wantOpen=false;
 if(!ref&&!isTeacher())closeOverlay();
 if(ref)syncClock();
}
function reconcile(){const ref=inRoom()?roomRef:null;if(ref!==ctx.ref)resetCtx(ref);return ref;}

const normView=raw=>({panel:!!(raw&&raw.panel===true),fs:!!(raw&&raw.panel===true&&raw.fs===true)});
function writeView(ref,want){
 const uid=auth.currentUser&&auth.currentUser.uid;
 queue=queue.then(()=>ref.update({timerView:want,teacherId:uid})).catch(e=>{
  viewSent={panel:null,fs:null};
  console.info('[Đồng hồ lớp] chưa đồng bộ trạng thái bảng với học sinh:',e&&e.code||e);
 });
}
function flushView(){
 viewTimer=0;
 if(!isTeacher()||!inRoom())return;
 const want={panel:!!overlayOpen,fs:!!(overlayOpen&&fullscreen)};
 if(want.panel===viewSent.panel&&want.fs===viewSent.fs)return;
 viewSent=want;writeView(roomRef,want);
}
function pushViewSoon(){
 if(!isTeacher()||!inRoom())return;
 clearTimeout(viewTimer);viewTimer=setTimeout(flushView,150);
}
function followTeacher(next,pv,nv){
 const visible=next?next.open:nv.panel;
 const want=visible&&nv.panel;
 if(!visible){wantOpen=false;closeOverlay();return;}
 if(want&&!wantOpen){wantOpen=true;minimized=false;openOverlay();}
 else if(!want&&wantOpen){wantOpen=false;closeOverlay();}
 else if(want&&overlayOpen&&nv.fs!==pv.fs)setFullscreen(nv.fs,true);
}
function onRoomData(data){
 const ref=reconcile();
 if(!ref)return;
 const first=ctx.initial,live=!first;ctx.initial=false;
 const pv=view,nv=normView(data&&data.timerView);view=nv;
 if(first&&isTeacher())viewSent=nv;
 const prev=timer,next=norm(data&&data.classTimer);
 const same=!!(next&&prev&&prev.seq===next.seq&&prev.anchor===next.anchor&&prev.pausedAt===next.pausedAt&&prev.open===next.open);
 if(same&&pv.panel===nv.panel&&pv.fs===nv.fs)return;
 if(next&&live&&!offsetSynced&&next.anchor!=null&&next.anchor!==lastObsAnchor){
  lastObsAnchor=next.anchor;const obs=next.anchor-Date.now();
  fallbackOffset=fallbackOffset==null?obs:Math.max(fallbackOffset,obs);offset=fallbackOffset;
 }
 timer=next;
 if(personalStyle&&next&&next.style===personalStyle)personalStyle=null;
 if(isTeacher()){if(first)pushViewSoon();}
 else followTeacher(next,pv,nv);
 render();
}
function hookRoom(){
 const f=window.vqcDisplayTeacherViewAck;
 if(typeof f==='function'&&!f.vqcTimerWrapped){
  const w=function(data){try{onRoomData(data);}catch(e){console.warn('Đồng hồ lớp:',e);}return f.apply(this,arguments);};
  w.vqcTimerWrapped=true;window.vqcDisplayTeacherViewAck=w;return true;
 }
 return !!(f&&f.vqcTimerWrapped);
}

const snd={ctx:null,on:null,vol:.7};
let lastSec=null,runKey='',finishKey='';
function soundReset(){lastSec=null;runKey='';finishKey='';}
function loadSound(){
 if(snd.on!==null)return;
 try{const s=JSON.parse(localStorage.getItem('vqct-sound-v1')||'null');if(s){snd.on=!!s.on;snd.vol=clampInt((s.vol==null?.7:s.vol)*100,0,100)/100;}}catch(e){}
 if(snd.on===null)snd.on=true;
}
function saveSound(){try{localStorage.setItem('vqct-sound-v1',JSON.stringify({on:snd.on,vol:snd.vol}));}catch(e){}}
function audio(){
 const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;
 try{if(!snd.ctx)snd.ctx=new AC();if(snd.ctx.state==='suspended')snd.ctx.resume().catch(()=>{});}catch(e){return null;}
 return snd.ctx;
}
function tone(freq,start,dur,vol,type){
 const c=audio();if(!c||!snd.on||snd.vol<=0)return;
 const o=c.createOscillator(),g=c.createGain(),t=c.currentTime+start,peak=Math.max(.0002,vol*snd.vol);
 o.type=type||'sine';o.frequency.value=freq;
 g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(peak,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
 o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+dur+.03);
}
const beep=()=>tone(880,0,.14,.45,'square');
const alarm=()=>{tone(988,0,.22,.55,'square');tone(988,.32,.22,.55,'square');tone(1319,.64,.7,.55,'square');};
document.addEventListener('pointerdown',function(){loadSound();if(snd.on)audio();},{once:true,capture:true});

const activeStyle=()=>(isTeacher()&&personalStyle)||(shown()&&shown().style)||'big';
function showToast(){
 if(!toast){toast=document.createElement('div');toast.className='vqct-toast';toast.setAttribute('role','alert');toast.textContent='⏰ HẾT GIỜ!';toast.addEventListener('click',()=>toast.classList.remove('show'));document.body.append(toast);}
 toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),6500);
}
function soundTick(v){
 loadSound();
 const T=v.T,key=T.seq+'|'+T.anchor+'|'+T.status;
 if(key!==runKey){runKey=key;lastSec=null;}
 if(T.mode!=='down'||T.status!=='running')return;
 if(!v.finished){
  if(lastSec!=null&&v.secs!==lastSec&&v.secs>=1&&v.secs<=5&&v.secs<lastSec&&T.beep)beep();
  lastSec=v.secs;return;
 }
 const fk=T.seq+'|'+T.anchor;
 if(finishKey===fk)return;
 finishKey=fk;
 if(v.over<6000){showToast();if(v.over<3000)alarm();}
}
function setText(el,text){if(el&&el.textContent!==text)el.textContent=text;}

function segDigit(){
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
 svg.setAttribute('viewBox','0 0 50 90');svg.setAttribute('class','dg');
 const t=8,h=t/2,hH=(x1,x2,y)=>[[x1,y],[x1+h,y-h],[x2-h,y-h],[x2,y],[x2-h,y+h],[x1+h,y+h]];
 const hV=(x,y1,y2)=>[[x,y1],[x+h,y1+h],[x+h,y2-h],[x,y2],[x-h,y2-h],[x-h,y1+h]];
 const P={a:hH(8,42,5),g:hH(8,42,45),d:hH(8,42,85),f:hV(5,8,42),b:hV(45,8,42),e:hV(5,48,82),c:hV(45,48,82)};
 const segs={};
 for(const k in P){const pg=document.createElementNS(ns,'polygon');pg.setAttribute('points',P[k].map(q=>q.join(',')).join(' '));svg.append(pg);segs[k]=pg;}
 const MAP={0:'abcdef',1:'bc',2:'abged',3:'abgcd',4:'fgbc',5:'afgcd',6:'afgedc',7:'abc',8:'abcdefg',9:'abcdfg'};
 let cur=null;
 return {el:svg,set(n){n=String(n);if(cur===n)return;cur=n;const on=MAP[n]||'';for(const k in segs)segs[k].classList.toggle('on',on.includes(k));}};
}
function flipDigit(){
 const el=document.createElement('div');el.className='fl';el.innerHTML='<div class="t"><span></span></div><div class="b"><span></span></div>';
 const tS=el.querySelector('.t span'),bS=el.querySelector('.b span');let cur=null;
 return {el,set(n){
  n=String(n);if(cur===n)return;
  if(cur===null){tS.textContent=bS.textContent=n;cur=n;return;}
  const old=cur;cur=n;tS.textContent=n;
  const ft=document.createElement('div'),fb=document.createElement('div');
  ft.className='t ft';ft.innerHTML='<span>'+old+'</span>';fb.className='b fb';fb.innerHTML='<span>'+n+'</span>';
  el.append(ft,fb);
  setTimeout(()=>{bS.textContent=n;ft.remove();fb.remove();},540);
 }};
}
const GLASS='M42,24 H158 C158,84 112,118 104,150 C112,182 158,216 158,276 H42 C42,216 88,182 96,150 C88,118 42,84 42,24 Z';
function buildFaces(host){
 const f={};
 host.innerHTML=
  '<div class="vqct-f" data-face="big"><div class="vqct-big"><span data-k="t">05:00</span><small class="d" data-k="d"></small></div></div>'+
  '<div class="vqct-f" data-face="ring"><div class="vqct-ring"><svg viewBox="0 0 300 300" aria-hidden="true"><defs><radialGradient id="vqctRingIn" cx="50%" cy="44%" r="62%"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#eef6fd"/></radialGradient></defs><circle class="dsk" cx="150" cy="150" r="146"/><circle class="inn" cx="150" cy="150" r="130"/><g class="tk"><path class="mn"/><path class="mj"/></g><circle class="trk" cx="150" cy="150" r="134"/><circle class="bar" cx="150" cy="150" r="134" pathLength="100" stroke-dasharray="100" stroke-dashoffset="0" transform="rotate(-90 150 150)"/></svg><div class="vqct-ring-t"><div class="rn"><span data-k="t">05:00</span><small class="d" data-k="d"></small></div><div class="rc"><span data-k="ct">Tổng thời gian</span><b data-k="cv">05:00</b></div></div></div></div>'+
  '<div class="vqct-f" data-face="led"><div class="vqct-led" data-k="led"></div></div>'+
  '<div class="vqct-f" data-face="flip"><div class="vqct-flip" data-k="flip"></div></div>'+
  '<div class="vqct-f" data-face="glass"><div class="vqct-glass"><svg viewBox="0 0 200 300" aria-hidden="true"><defs><clipPath id="vqctGlassClip"><path d="'+GLASS+'"/></clipPath></defs><rect class="cap" x="28" y="10" width="144" height="14" rx="6"/><rect class="cap" x="28" y="276" width="144" height="14" rx="6"/><path class="gl" d="'+GLASS+'"/><g clip-path="url(#vqctGlassClip)"><rect class="sand" data-k="top" x="30" y="24" width="140" height="0"/><rect class="sand" data-k="bot" x="30" y="276" width="140" height="0"/><rect class="stream" data-k="stream" x="98" y="150" width="4" height="0"/></g><path class="gh" d="M54,36 C55,80 90,106 97,132"/><path class="gh g2" d="M146,214 C146,236 150,252 150,262"/></svg><div class="gt"><span data-k="t">05:00</span><small class="d" data-k="d"></small></div></div></div>';
 host.querySelectorAll('.vqct-f').forEach(el=>{f[el.dataset.face]=el;});
 {const tk=host.querySelector('.vqct-ring .tk');let mn='',mj='';
  for(let i=0;i<60;i++){const a=i*Math.PI/30,s=Math.sin(a),c=Math.cos(a),major=i%5===0,r1=major?106:111,r2=119;
   const seg='M'+(150+r1*s).toFixed(1)+' '+(150-r1*c).toFixed(1)+'L'+(150+r2*s).toFixed(1)+' '+(150-r2*c).toFixed(1);
   if(major)mj+=seg;else mn+=seg;}
  tk.querySelector('.mn').setAttribute('d',mn);tk.querySelector('.mj').setAttribute('d',mj);}
 const led=host.querySelector('[data-k=led]'),L=[segDigit(),segDigit(),segDigit(),segDigit(),segDigit()];
 const colon=document.createElement('div');colon.className='co';colon.innerHTML='<b></b><b></b>';
 L[4].el.setAttribute('class','dg sm');
 led.append(L[0].el,L[1].el,colon,L[2].el,L[3].el,L[4].el);f.ledDigits=L;
 const fl=host.querySelector('[data-k=flip]'),F=[flipDigit(),flipDigit(),flipDigit(),flipDigit()],sep=document.createElement('span');
 sep.className='sep';sep.textContent=':';fl.append(F[0].el,F[1].el,sep,F[2].el,F[3].el);f.flipDigits=F;
 return f;
}
let ringFrac=1;
function updateFace(style,v,tenthsOn){
 const f=faces,face=f[style];if(!face)return;
 const tm=pad(v.mm)+':'+pad(v.ss),dec=tenthsOn?'.'+v.tenths:'';
 if(style==='big'||style==='ring'||style==='glass'){
  setText(face.querySelector('[data-k=t]'),tm);setText(face.querySelector('[data-k=d]'),dec);
 }
 if(style==='ring'){
  const rg=face.querySelector('.vqct-ring'),bar=rg.querySelector('.bar'),T=v.T,up=T.mode==='up';
  const fr=Math.max(0,Math.min(1,v.frac)),off=String(Math.round((1-fr)*1000)/10),jump=Math.abs(fr-ringFrac)>.05;ringFrac=fr;
  if(jump)bar.style.transition='none';
  if(bar.getAttribute('stroke-dashoffset')!==off)bar.setAttribute('stroke-dashoffset',off);
  if(jump){void bar.getBoundingClientRect();bar.style.transition='';}
  rg.classList.toggle('has-d',tenthsOn);
  setText(rg.querySelector('[data-k=ct]'),up?(T.laps.length?'Bấm giờ · '+T.laps.length+' vòng':'Bấm giờ'):'Tổng thời gian');
  setText(rg.querySelector('[data-k=cv]'),up?'':fmt(T.dur));
 }
 if(style==='led'){
  const d=[Math.floor(v.mm/10),v.mm%10,Math.floor(v.ss/10),v.ss%10];
  f.ledDigits.forEach((g,i)=>{if(i<4)g.set(d[i]);});
  f.ledDigits[4].el.style.display=tenthsOn?'':'none';if(tenthsOn)f.ledDigits[4].set(v.tenths);
 }
 if(style==='flip'){
  const d=[Math.floor(v.mm/10),v.mm%10,Math.floor(v.ss/10),v.ss%10];f.flipDigits.forEach((g,i)=>g.set(d[i]));
 }
 if(style==='glass'){
  const H=126,fr=v.T.mode==='up'?1-v.frac:v.frac,topH=H*fr,botH=H-topH,top=face.querySelector('[data-k=top]'),bot=face.querySelector('[data-k=bot]'),st=face.querySelector('[data-k=stream]');
  top.setAttribute('y',String(150-topH-2));top.setAttribute('height',String(topH));
  bot.setAttribute('y',String(276-botH));bot.setAttribute('height',String(botH));
  const run=v.state==='running'&&fr>0&&fr<1;
  st.setAttribute('height',run?String(Math.max(0,276-botH-150)):'0');
 }
}
function lapsKey(laps){return laps.join(',');}
let lastLapsKey='',barKey='',barPct=100;
function renderOverlay(v,T){
 if(!root)return;
 const teacher=isTeacher();
 root.classList.toggle('is-teacher',teacher);root.classList.toggle('is-student',!teacher);
 const minBtn=root.querySelector('[data-act="min"]');if(minBtn)minBtn.hidden=minLocked();
 const stage=$('vqctStage'),up=T.mode==='up',style=activeStyle();
 stage.className='vqct-stage st-'+style+' is-'+v.state+(!up&&v.state==='running'&&v.secs<=10&&v.secs>5?' is-warn':'')+(!up&&v.state==='running'&&v.secs<=5&&!v.finished?' is-danger':'');
 setText($('vqctStatusT'),LABEL[v.state]);setIcon($('vqctStatus').firstChild,v.state);
 for(const k in faces)if(faces[k]&&faces[k].classList&&faces[k].dataset&&faces[k].dataset.face)faces[k].classList.toggle('on',k===style);
 updateFace(style,v,up);
 const barBox=$('vqctBar'),bar=barBox.firstElementChild,pct=Math.max(0,Math.min(100,v.frac*100)),bkey=T.seq+'|'+T.mode+'|'+v.state+'|'+T.dur;
 const jump=bkey!==barKey||(T.mode==='down'?pct>barPct+.5:pct<barPct-.5);
 if(jump){barKey=bkey;bar.style.transition='none';bar.style.width=pct.toFixed(2)+'%';void bar.offsetWidth;bar.style.transition='';}
 else bar.style.width=pct.toFixed(2)+'%';
 barPct=pct;
 const pi=String(Math.round(pct));if(barBox.getAttribute('aria-valuenow')!==pi)barBox.setAttribute('aria-valuenow',pi);
 setText($('vqctTotal'),up?(T.laps.length?'Bấm giờ · '+T.laps.length+' vòng':'Bấm giờ'):'Tổng thời gian');
 setText($('vqctTotalV'),up?'':fmt(T.dur));
 root.querySelectorAll('[data-act^="style:"]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.act==='style:'+style));b.style.pointerEvents=teacher?'':'none';b.tabIndex=teacher?0:-1;});
 root.querySelectorAll('[data-act^="tab-"]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.act==='tab-'+T.mode)));
 root.classList.toggle('mode-up',up);
 const go=$('vqctGo'),label=go.querySelector('b');
 const mode=v.state==='running'?'pause':v.state==='paused'?'resume':'start';
 go.dataset.mode=mode;setIcon(go.firstElementChild,mode==='pause'?'paused':'running');setText(label,mode==='pause'?'TẠM DỪNG':mode==='resume'?'TIẾP TỤC':v.state==='done'?'CHẠY LẠI':'BẮT ĐẦU');
 const lap=$('vqctLap');lap.hidden=!up;lap.disabled=!(up&&v.state==='running');
 root.querySelectorAll('.vqct-adj button').forEach(b=>{b.disabled=up;});
 $('vqctAdj').hidden=up;
 root.querySelectorAll('.vqct-quick button').forEach(b=>b.setAttribute('aria-pressed',String(!up&&v.state==='ready'&&Number(b.dataset.sec)*1000===T.dur)));
 $('vqctQuickCard').hidden=up;$('vqctCustomCard').hidden=up;
 root.querySelector('.vqct-panels').style.display=up&&teacher?'none':'';
 const beepBox=$('vqctBeep');if(beepBox&&beepBox!==document.activeElement)beepBox.checked=T.beep;
 const key=lapsKey(T.laps);
 if(key!==lastLapsKey){
  lastLapsKey=key;const ul=$('vqctLaps');ul.textContent='';
  T.laps.slice(-6).forEach((ms,i,arr)=>{
   const n=T.laps.length-arr.length+i,prev=n>0?T.laps[n-1]:0,li=document.createElement('li');
   li.innerHTML='<span></span><span></span>';li.firstChild.textContent='Vòng '+(n+1)+' · '+fmt(ms,true);li.lastChild.textContent='+'+fmt(ms-prev,true);ul.append(li);
  });
  ul.hidden=!T.laps.length;
 }
 const off=typeof navigator!=='undefined'&&navigator.onLine===false;root.classList.toggle('offline',off);
 const vis=$('vqctVis');
 if(vis){
  const room=inRoom(),hid=room&&T.open===false,label=hid?'Hiện với học sinh':'Ẩn với học sinh';
  setIcon(vis.firstChild,hid?'eyeoff':'eye');setText(vis.lastChild,label);
  vis.classList.toggle('is-off',hid);vis.setAttribute('aria-pressed',String(hid));vis.setAttribute('aria-label',label);vis.disabled=!room;
  const tip=!room?'Vào phòng học để học sinh nhìn thấy đồng hồ':hid?'Đang ẩn: bấm để hiện đồng hồ trên máy học sinh':'Đang hiện: bấm để ẩn đồng hồ khỏi máy học sinh';
  if(vis.title!==tip)vis.title=tip;
  const note=$('vqctHidNote');if(note)note.hidden=!hid;
 }
 const sOn=$('vqctSoundBtn');if(sOn){setText(sOn,(snd.on?'🔊':'🔇')+' Âm thanh');sOn.setAttribute('aria-pressed',String(!!snd.on));const vol=$('vqctVol');if(vol&&vol!==document.activeElement)vol.value=String(Math.round(snd.vol*100));}
}
const MARGIN=12,LOW=2,PIN_KEY='vqct-chip-pin-v1';
const GRID_X=[.08,.24,.4,.56,.72,.9],GRID_Y=[.15,.5,.85];
function loadPin(){
 try{const p=JSON.parse(localStorage.getItem(PIN_KEY)||'null');
  if(p&&isFinite(p.fx)&&isFinite(p.fy))pin={fx:Math.min(1,Math.max(0,p.fx)),fy:Math.min(1,Math.max(0,p.fy)),b:isFinite(p.b)?p.b:2};}catch(e){}
}
function savePin(){try{if(pin)localStorage.setItem(PIN_KEY,JSON.stringify(pin));else localStorage.removeItem(PIN_KEY);}catch(e){}}
function syncAutoPosBtn(){const b=$('vqctAutoPos');if(b)b.hidden=!pin;}
function safeInsets(){
 if(!probe){
  probe=document.createElement('div');probe.setAttribute('aria-hidden','true');
  probe.style.cssText='position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  document.body.append(probe);
 }
 const c=getComputedStyle(probe);
 return {t:parseFloat(c.paddingTop)||0,r:parseFloat(c.paddingRight)||0,b:parseFloat(c.paddingBottom)||0,l:parseFloat(c.paddingLeft)||0};
}
function viewport(){
 const w=document.documentElement.clientWidth||window.innerWidth,h=window.innerHeight;
 let bottom=0;
 const dock=document.querySelector('.vqc-mobile-nav');
 if(dock){const r=dock.getBoundingClientRect(),c=getComputedStyle(dock);if(c.display!=='none'&&c.visibility!=='hidden'&&r.height>0&&r.top<h)bottom=h-r.top+8;}
 return {w,h,bottom};
}
function weightOf(e){
 if(!e||e===document.documentElement||e===document.body)return 0;
 if(e.closest('button,a[href],input,select,textarea,label,summary,canvas,video,[role="button"],[role="tab"],[role="menuitem"],[onclick],.lesson,.btn'))return 4;
 if(e.closest('[id$="Board"],[class*="board"],[class*="square"],[data-sq],[data-square]'))return 4;
 if(e.closest('svg,img,picture'))return 2;
 for(const n of e.childNodes)if(n.nodeType===3&&n.nodeValue.trim())return 2;
 return 0;
}
function weightAt(x,y){
 if(x<0||y<0||x>=window.innerWidth||y>=window.innerHeight)return 0;
 const stack=document.elementsFromPoint(x,y);
 for(const e of stack){
  if(e.closest&&e.closest('.vqct-chip,.vqct-toast'))continue;
  return weightOf(e);
 }
 return 0;
}
function scoreRect(x,y,w,h){let s=0;for(const fy of GRID_Y)for(const fx of GRID_X)s+=weightAt(x+w*fx,y+h*fy);return s;}
function setLv(lv){chip.classList.toggle('lv1',lv===1);chip.classList.toggle('lv2',lv===2);}
function spots(w,h,vp,ins){
 const L=ins.l+MARGIN,R=Math.max(L,vp.w-ins.r-MARGIN-w),T=ins.t+MARGIN,B=Math.max(T,vp.h-Math.max(ins.b+MARGIN,vp.bottom)-h);
 const mx=Math.max(L,Math.min(R,(vp.w-w)/2)),q1=T+(B-T)*.25,my=T+(B-T)*.5,q3=T+(B-T)*.75;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const list=[];
 if(pin)list.push({x:clamp(pin.fx*vp.w-w/2,L-8,R+8),y:clamp(pin.fy*vp.h-h/2,T-8,B+8),pin:true});
 list.push({x:R,y:B},{x:L,y:B},{x:R,y:T},{x:L,y:T},{x:R,y:q3},{x:R,y:my},{x:R,y:q1},{x:L,y:q3},{x:L,y:my},{x:L,y:q1},{x:mx,y:B},{x:mx,y:T});
 return list;
}
function searchSpot(vp,ins){
 let best=null;
 for(let lv=0;lv<3;lv++){
  setLv(lv);
  const w=chip.offsetWidth,h=chip.offsetHeight,list=spots(w,h,vp,ins);
  for(let i=0;i<list.length;i++){
   const c=list[i],s=scoreRect(c.x,c.y,w,h),tol=c.pin?(pin.b+8):LOW;
   const cand={x:c.x,y:c.y,lv,w,h,s,tol,total:s+lv*2,pref:i===0&&lv===0};
   if(s<=tol)return cand;
   if(!best||cand.total<best.total)best=cand;
  }
 }
 return best;
}
function applySpot(c,vp,ins,sig,instant){
 setLv(c.lv);
 if(instant)chip.classList.add('nomove');
 chip.style.left=Math.round(c.x)+'px';chip.style.top=Math.round(c.y)+'px';
 if(instant){void chip.offsetWidth;chip.classList.remove('nomove');}
 const R=vp.w-ins.r-MARGIN-c.w;
 place={x:Math.round(c.x),y:Math.round(c.y),lv:c.lv,at:Date.now(),sig,w:c.w,rx:Math.abs(c.x-R)<2?vp.w-(c.x+c.w):null,pref:c.pref,tol:c.tol};
}
function placeChip(force,instant){
 if(!chip||dragging||!chip.classList.contains('show'))return;
 const vp=viewport(),ins=safeInsets();
 const sig=[vp.w,vp.h,Math.round(vp.bottom),ins.t,ins.r,ins.b,ins.l].join('|');
 let cur=null;
 if(place.x!=null&&sig===place.sig){
  cur=scoreRect(place.x,place.y,chip.offsetWidth,chip.offsetHeight);
  const retry=!place.pref&&Date.now()-place.at>5000;
  if(!force&&cur<=place.tol&&!retry)return;
 }
 const best=searchSpot(vp,ins);
 if(cur!=null&&!force&&!(best.pref&&!place.pref)&&best.total>=cur+place.lv*2-2){
  setLv(place.lv);place.at=Date.now();return;
 }
 applySpot(best,vp,ins,sig,!!instant);
}
function keepAnchor(){
 if(place.rx==null||dragging)return;
 const w=chip.offsetWidth;
 if(Math.abs(w-place.w)>1){place.w=w;chip.style.left=Math.round(document.documentElement.clientWidth-place.rx-w)+'px';}
}
const placeSoon=(ms,force)=>{clearTimeout(placeTimer);placeTimer=setTimeout(()=>placeChip(force),ms);};

function chipClass(extra){return 'vqct-chip show'+(place.lv?' lv'+place.lv:'')+(extra||'');}
function renderChip(v,T){
 if(!chip)return;
 const teacher=isTeacher(),room=inRoom();
 const active=room?!!(timer&&(teacher||timer.open)):!!(localTimer&&localTimer.status!=='ready'),hid=teacher&&room&&!!timer&&timer.open===false;
 const visible=!overlayOpen&&(teacher?(classMode()||room):(room&&active));
 const was=chip.classList.contains('show');
 if(!visible){if(was){dragging=false;chip.className='vqct-chip';place.x=null;}return;}
 const tm=chip.querySelector('.tm'),st=chip.querySelector('.st');
 let cls;
 if(!active||!v){cls=chipClass(' idle'+(dragging?' dragging':''));setIcon(chip.querySelector('.ic'),'idle');setText(tm,'Đồng hồ');setText(st,'');}
 else{
  const up=T.mode==='up',danger=!up&&v.state==='running'&&v.secs<=5&&!v.finished,warn=!up&&v.state==='running'&&v.secs<=10&&v.secs>5;
  cls=chipClass(' is-'+v.state+(warn?' is-warn':'')+(danger?' is-danger':'')+(hid?' is-hid':'')+(dragging?' dragging':''));setIcon(chip.querySelector('.ic'),v.state);
  setText(tm,fmt(v.secs*1000));setText(st,LABEL[v.state]);
 }
 if(chip.className!==cls)chip.className=cls;
 const ttl=hid?'Đồng hồ đang ẩn với học sinh · bấm để mở · kéo để đổi vị trí':'Bấm để mở đồng hồ · kéo để đổi vị trí';
 if(chip.title!==ttl)chip.title=ttl;
 if(!was)placeChip(true,true);else keepAnchor();
}
function render(){
 const T=shown();
 let v=null;
 if(T){v=viewOf(T,nowMs());if(inRoom()&&timer&&timer.open||!inRoom()&&localTimer)soundTick(v);}
 if(overlayOpen&&T)renderOverlay(v,T);
 if(toast&&toast.classList.contains('show')&&!(v&&v.finished))toast.classList.remove('show');
 renderChip(v,T);
 const fast=!!(T&&T.status==='running'&&(overlayOpen||(chip&&chip.classList.contains('show')))&&!document.hidden);
 if(fast&&!ticker)ticker=setInterval(render,100);
 else if(!fast&&ticker){clearInterval(ticker);ticker=null;}
}

function buildOverlay(){
 root=document.createElement('div');root.id='vqcTimerOverlay';root.className='vqct';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','Đồng hồ lớp học');
 root.innerHTML=
 '<div class="vqct-dialog">'+
  '<div class="vqct-top"><div class="vqct-tabs" role="tablist"><button type="button" class="vqct-tab" role="tab" data-act="tab-down">⏳ Đếm ngược</button><button type="button" class="vqct-tab" role="tab" data-act="tab-up">⏱ Bấm giờ</button></div>'+
   '<div class="vqct-tools"><button type="button" class="vqct-tool" id="vqctAutoPos" data-act="autopos" hidden title="Đặt lại: thẻ đồng hồ nhỏ tự tìm chỗ trống thay vì ở chỗ bạn đã kéo tới">📍 <span class="tx">Vị trí tự động</span></button><button type="button" class="vqct-tool vqct-t" id="vqctVis" data-act="hide" aria-pressed="false" title="Ẩn đồng hồ khỏi máy học sinh"><span class="ico" aria-hidden="true"></span><span class="tx">Ẩn với học sinh</span></button><button type="button" class="vqct-tool" data-act="fullscreen">⛶ <span class="tx">Toàn màn hình</span></button><button type="button" class="vqct-tool" data-act="min">▭ <span class="tx">Thu nhỏ</span></button></div></div>'+
  '<div class="vqct-styles"><span>KIỂU ĐỒNG HỒ</span>'+STYLES.map(s=>'<button type="button" class="vqct-style" data-act="style:'+s[0]+'" aria-pressed="false" title="'+s[1]+'" aria-label="Kiểu '+s[1]+'"><i>'+s[2]+'</i><span class="tx">'+s[1]+'</span></button>').join('')+'<span class="vqct-snd"><button type="button" class="vqct-tool" id="vqctSoundBtn" data-act="sound" aria-pressed="false" title="Bật/tắt âm thanh trên máy này">🔇 Âm thanh</button><input class="vqct-vol" type="range" id="vqctVol" min="0" max="100" step="5" value="70" aria-label="Âm lượng trên máy này" title="Âm lượng trên máy này"></span></div>'+
  '<div class="vqct-stage" id="vqctStage"><button type="button" class="vqct-fs-exit" data-act="fullscreen">✕ Thoát toàn màn hình</button>'+
   '<div class="vqct-stline"><div class="vqct-status" id="vqctStatus"><span class="ico" aria-hidden="true"></span><span id="vqctStatusT">SẴN SÀNG</span></div><div class="vqct-hidnote vqct-t" id="vqctHidNote" hidden>'+ICON.eyeoff+'<span>Học sinh đang không thấy đồng hồ</span></div></div><div class="vqct-pad"><div class="vqct-face" id="vqctFace"></div>'+
   '<div class="vqct-total"><span id="vqctTotal">Tổng thời gian</span><b id="vqctTotalV">05:00</b></div><div class="vqct-bar" id="vqctBar" role="progressbar" aria-label="Tiến trình thời gian" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><i></i></div></div>'+
   '<div class="vqct-ctl vqct-t"><button type="button" class="vqct-go" id="vqctGo" data-act="main" data-mode="start"><span class="ico" aria-hidden="true">'+ICON.running+'</span><b>BẮT ĐẦU</b><kbd>Space</kbd></button><button type="button" class="vqct-ghost" id="vqctLap" data-act="lap" hidden>⚑ Vòng</button><button type="button" class="vqct-ghost red" data-act="reset">↻ Đặt lại</button></div>'+
   '<div class="vqct-adj vqct-t" id="vqctAdj"><button type="button" data-act="adj:-60000">−1 phút</button><button type="button" data-act="adj:-10000">−10 giây</button><button type="button" data-act="adj:10000">+10 giây</button><button type="button" data-act="adj:60000">+1 phút</button></div>'+
   '<ul class="vqct-laps" id="vqctLaps" hidden></ul></div>'+
  '<div class="vqct-panels vqct-t"><div class="vqct-card" id="vqctQuickCard"><h3>THỜI GIAN NHANH</h3><div class="vqct-quick">'+QUICK.map(s=>'<button type="button" data-act="quick" data-sec="'+s+'" aria-pressed="false">'+(s<60?s+' giây':(s/60)+' phút')+'</button>').join('')+'</div></div>'+
   '<div class="vqct-card" id="vqctCustomCard"><h3>TÙY CHỈNH PHÚT VÀ GIÂY</h3><div class="vqct-custom"><label>Phút<input type="number" id="vqctMin" min="0" max="99" value="5" inputmode="numeric"></label><span class="colon">:</span><label>Giây<input type="number" id="vqctSec" min="0" max="59" value="0" inputmode="numeric"></label><button type="button" class="vqct-set" data-act="custom">Đặt giờ</button></div>'+
   '<label class="vqct-opt"><input type="checkbox" id="vqctBeep" checked> Bíp đếm 5 giây cuối</label></div></div>'+
  '<p class="vqct-obs vqct-s">Giáo viên điều khiển đồng hồ — em chỉ cần quan sát.</p>'+
  '<p class="vqct-net" role="status">⚠ Máy đang mất kết nối. Đồng hồ vẫn tính theo mốc giờ đã nhận và sẽ tự đồng bộ khi có mạng.</p>'+
 '</div>';
 document.body.append(root);
 faces=buildFaces($('vqctFace'));
 root.addEventListener('click',onClick);
 $('vqctVol').addEventListener('input',e=>{loadSound();snd.vol=clampInt(e.target.value,0,100)/100;saveSound();});
 $('vqctBeep').addEventListener('change',e=>{send(ACT.beep(e.target.checked));});
 root.addEventListener('click',e=>{if(e.target===root&&!fullscreen)minimize();});
}
function onClick(e){
 const b=e.target.closest('[data-act]');if(!b||b.disabled)return;
 const a=b.dataset.act,teacher=isTeacher();
 if(a==='fullscreen')return setFullscreen(!fullscreen);
 if(a==='min')return minimize();
 if(a==='autopos'){pin=null;savePin();syncAutoPosBtn();place.x=null;return;}
 if(a==='sound'){loadSound();snd.on=!snd.on;saveSound();if(snd.on){audio();tone(880,0,.12,.4,'square');}render();return;}
 if(a.startsWith('style:')){if(!teacher)return;personalStyle=a.slice(6);send(ACT.style(personalStyle));render();return;}
 if(!teacher)return;
 if(a==='tab-down')send(ACT.setMode('down'));
 else if(a==='tab-up')send(ACT.setMode('up'));
 else if(a==='main')send(ACT.main());
 else if(a==='reset')send(ACT.reset());
 else if(a==='lap')send(ACT.lap());
 else if(a==='hide'){const cur=shown();send(cur&&cur.open===false?ACT.show():ACT.hide());}
 else if(a.startsWith('adj:'))send(ACT.adjust(Number(a.slice(4))));
 else if(a==='quick'){const s=Number(b.dataset.sec);send(ACT.setTime(s*1000));$('vqctMin').value=Math.floor(s/60);$('vqctSec').value=s%60;}
 else if(a==='custom'){
  const m=clampInt($('vqctMin').value,0,99),s=clampInt($('vqctSec').value,0,59),total=(m*60+s)*1000;
  if(total<1000){notify('Hãy nhập thời gian lớn hơn 0.','warning');return;}
  send(ACT.setTime(total));
 }
}
function setFullscreen(on,remote){
 if(!root)return;fullscreen=on;root.classList.toggle('vqct-fs',on);
 try{
  if(on){if(!remote){const f=root.requestFullscreen||root.webkitRequestFullscreen;if(f){const pr=f.call(root);if(pr&&pr.catch)pr.catch(()=>{});}}}
  else{const d=document.fullscreenElement||document.webkitFullscreenElement;if(d)(document.exitFullscreen||document.webkitExitFullscreen).call(document);}
 }catch(e){}
 pushViewSoon();
}
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&fullscreen&&root){fullscreen=false;root.classList.remove('vqct-fs');pushViewSoon();}});
function lockPage(on){
 const b=document.body;
 if(on){if(b.classList.contains('vqct-open'))return;b.style.setProperty('--vqct-sbw',Math.max(0,window.innerWidth-document.documentElement.clientWidth)+'px');b.classList.add('vqct-open');}
 else{b.classList.remove('vqct-open');b.style.removeProperty('--vqct-sbw');}
}
function openOverlay(){
 if(!root)buildOverlay();
 const was=overlayOpen;
 loadSound();overlayOpen=true;minimized=false;lastLapsKey='\u0000';barKey='';
 if(!was){lastFocus=document.activeElement;lockPage(true);}
 root.classList.add('open');
 if(!isTeacher()&&view.fs&&!fullscreen)setFullscreen(true,true);
 const T=shown();if(T){$('vqctMin').value=Math.floor(T.dur/60000);$('vqctSec').value=Math.floor(T.dur/1000)%60;}
 syncAutoPosBtn();render();pushViewSoon();
 if(!was)setTimeout(()=>{if(!overlayOpen)return;const f=isTeacher()?$('vqctGo'):root.querySelector('[data-act="fullscreen"]');if(f)try{f.focus({preventScroll:true});}catch(e){}},0);
}
function closeOverlay(){
 if(!root||!overlayOpen)return;
 if(fullscreen)setFullscreen(false);
 overlayOpen=false;root.classList.remove('open');lockPage(false);render();pushViewSoon();
 const lf=lastFocus;lastFocus=null;
 if(lf&&lf!==document.body&&document.contains(lf)&&typeof lf.focus==='function')try{lf.focus({preventScroll:true});}catch(e){}
}
function minLocked(){return !isTeacher()&&view.panel===true;}
function minimize(){if(!overlayOpen||minLocked())return;minimized=true;closeOverlay();}
function openFromUser(){
 if(!isTeacher()&&!(current()&&current().open)){notify('Giáo viên chưa bật đồng hồ lớp học.','info');return;}
 if(isTeacher()&&!inRoom())notify('Chưa vào phòng: đồng hồ chỉ chạy trên máy này, học sinh sẽ chưa nhìn thấy.','warning');
 openOverlay();
}
function buildChip(){
 chip=document.createElement('button');chip.type='button';chip.className='vqct-chip';chip.setAttribute('aria-label','Mở đồng hồ lớp học');
 chip.title='Bấm để mở đồng hồ · kéo để đổi vị trí';
 chip.innerHTML='<span class="ic" aria-hidden="true">⏱</span><span class="tm">Đồng hồ</span><span class="st"></span>';
 chip.addEventListener('click',()=>{if(suppressClick)return;openFromUser();});
 document.body.append(chip);
 loadPin();
 let pid=null,sx=0,sy=0,ox=0,oy=0,moved=false;
 chip.addEventListener('pointerdown',e=>{
  if(e.button!=null&&e.button!==0)return;
  const r=chip.getBoundingClientRect();pid=e.pointerId;sx=e.clientX;sy=e.clientY;ox=e.clientX-r.left;oy=e.clientY-r.top;moved=false;
  try{chip.setPointerCapture(pid);}catch(_){}
 });
 chip.addEventListener('pointermove',e=>{
  if(e.pointerId!==pid)return;
  if(!moved){if(Math.hypot(e.clientX-sx,e.clientY-sy)<6)return;moved=true;dragging=true;chip.classList.add('dragging');}
  const vp=viewport(),w=chip.offsetWidth,h=chip.offsetHeight;
  chip.style.left=Math.round(Math.max(4,Math.min(vp.w-w-4,e.clientX-ox)))+'px';
  chip.style.top=Math.round(Math.max(4,Math.min(vp.h-Math.max(vp.bottom,0)-h-4,e.clientY-oy)))+'px';
 });
 const end=e=>{
  if(e.pointerId!==pid)return;pid=null;
  try{chip.releasePointerCapture(e.pointerId);}catch(_){}
  if(!moved)return;
  dragging=false;chip.classList.remove('dragging');suppressClick=true;setTimeout(()=>{suppressClick=false;},400);
  const r=chip.getBoundingClientRect(),vp=viewport();
  pin={fx:(r.left+r.width/2)/vp.w,fy:(r.top+r.height/2)/vp.h,b:scoreRect(r.left,r.top,r.width,r.height)};
  savePin();syncAutoPosBtn();place.x=null;placeChip(true,false);
 };
 chip.addEventListener('pointerup',end);chip.addEventListener('pointercancel',end);
}
function mountMenu(){
 if($('vqcTimerMenu'))return;
 const item=document.createElement('div');
 item.className='lesson';item.id='vqcTimerMenu';item.setAttribute('role','button');item.tabIndex=0;
 item.innerHTML='<div class="lesson-icon">⏱</div> Đồng hồ lớp học';
 item.addEventListener('click',openFromUser);
 item.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openFromUser();}});
 const anchor=$('vqcWarmupLaunch')||document.querySelector('.lesson');
 if(anchor)anchor.insertAdjacentElement('afterend',item);
}
document.addEventListener('keydown',e=>{
 if(!overlayOpen)return;
 e.stopPropagation();
 const tag=(e.target&&e.target.tagName)||'';
 if(e.key==='Tab'){
  const f=[...root.querySelectorAll('button,input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(x=>!x.disabled&&x.offsetParent!==null&&!x.closest('[hidden]'));
  if(f.length){
   const a=document.activeElement,first=f[0],last=f[f.length-1];
   if(!root.contains(a)){e.preventDefault();first.focus();}
   else if(e.shiftKey&&a===first){e.preventDefault();last.focus();}
   else if(!e.shiftKey&&a===last){e.preventDefault();first.focus();}
  }
  return;
 }
 if(e.key==='Escape'){if(!fullscreen)minimize();return;}
 if(/INPUT|TEXTAREA|SELECT|BUTTON/.test(tag)&&e.key===' ')return;
 if(e.key===' '&&isTeacher()){e.preventDefault();send(ACT.main());}
 else if((e.key==='f'||e.key==='F')&&!/INPUT|TEXTAREA/.test(tag))setFullscreen(!fullscreen);
},true);
window.addEventListener('online',()=>{syncClock(true);render();});
window.addEventListener('offline',render);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){syncClock();render();}});

function hookCreateRoom(){
 if(typeof createRoom!=='function'||createRoom.vqctWrapped)return;
 const original=createRoom;
 const wrapped=async function(){
  const result=await original.apply(this,arguments);
  try{if(inRoom()&&isTeacher()&&typeof auth!=='undefined'&&auth.currentUser)await roomRef.update({teacherId:auth.currentUser.uid});}
  catch(e){console.info('[Đồng hồ lớp] chưa đặt chủ phòng:',e&&e.code||e);}
  return result;
 };
 wrapped.vqctWrapped=true;createRoom=wrapped;
}
function init(){
 hookCreateRoom();buildChip();mountMenu();
 if(!hookRoom()){
  let unsub=null,subRef=null;
  setInterval(()=>{
   const ref=inRoom()?roomRef:null;
   if(ref===subRef)return;
   if(unsub){try{unsub();}catch(e){}unsub=null;}subRef=ref;
   if(ref&&typeof ref.onSnapshot==='function')unsub=ref.onSnapshot(s=>{if(s&&s.exists)try{onRoomData(s.data());}catch(e){}});
  },1000);
 }
 setInterval(()=>{reconcile();if(overlayOpen&&!classMode()&&!inRoom())closeOverlay();render();placeChip(false);},1000);
 window.addEventListener('resize',()=>placeSoon(120,true));
 window.addEventListener('orientationchange',()=>placeSoon(300,true));
 window.addEventListener('scroll',()=>placeSoon(250,false),{passive:true,capture:true});
 render();
}
window.vqcClassTimer={open:openOverlay,close:closeOverlay,minimize,render,
 _debug:()=>({timer,localTimer,offset,offsetSynced,overlayOpen,fullscreen,panel:view,view:shown()&&viewOf(shown(),nowMs())})};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();

if(!document.getElementById('vqctCss')){
 const link=document.createElement('link');link.id='vqctCss';link.rel='stylesheet';link.href='./css/class-timer.css?v='+VERSION;document.head.append(link);
}
})();
