(function(){
'use strict';
const $=id=>document.getElementById(id);
const VERSION='20261123-duel-v7';
const PROTO=2;
const FILES='abcdefgh';
const SIDE={w:'Trắng',b:'Đen'};
const PIECE={k:'Vua',q:'Hậu',r:'Xe',b:'Tượng',n:'Mã',p:'Tốt'};
const LIVE=['invited','ready','running','paused'];
const STATUSES=['invited','declined','ready','running','paused','ended'];
const UCI_RE=/^[a-h][1-8][a-h][1-8][qrbn]?$/;
const HB_LIVE=20000,HB_IDLE=300000,PEER_FRESH_LIVE=65000,PEER_FRESH_IDLE=720000;
const HIST_CAP=300;

let M=null,game=null,corrupt=false,presence={};
let isOpen=false,tab='game',selected=null,promotion=null,pending=null,pendingTimer=0,notice='',hint=null,hintBusy=false,verdictOpen=false,confirmResign=false,confirmTimer=0;
let setupOpen=true,review=null,roster=[],rosterAt=0,rosterBusy=false,rosterErr='';
const settings={pick:'number',num:1,from:1,to:300,order:'seq',studentId:'',color:'w',time:'5',custom:5};
let engine=null,engineState='idle',hintEpoch=0;
let lastRoomKey='',roomSeen=false,listenRef=null,listenOff=null,wrappedAck=false;
let mListenKey='',mListenOff=null,mRetryAt=0,mListenErr='';
let pvRemote=null,pvIn=null,pvViewKey='',pvSig='',pvSigAt=0,pvLastSig='',pvLastAt=0,pvBusy=false,pvRetryAt=0,txBusy=0;
const PV_TTL=120000,PV_REFRESH=50000,PV_DEBOUNCE=350;
let lastBeat=0,flagKey='',flagAt=0,flagSeen=0,autoKey='',inviteKey='',turnKey='',endedHandled=new Set(),userClosed=new Set();
let pvSuppress='',pvAuto=false,duelAnnounced=false;
let outboxBusy=false,remoteRes=[],remoteAt=0,remoteBusy=false,remoteErr='',probCache=null;
let ownOffset=0,ownSynced=false,syncBusy=false,syncRetryAt=0,syncedAt=0,fallbackOffset=null,lastObsAnchor=null,offCache={t:0,v:null};

function roomOn(){return typeof roomRef!=='undefined'&&!!roomRef;}
function roomCode(){try{return roomRef?String(roomRef.id||String(roomRef.path||'').split('/').pop()||''):'';}catch(e){return '';}}
function matchPath(){const c=roomCode();return c?'rooms/'+c+'-chd':'';}
function matchRef(){const c=roomCode();return c&&typeof db!=='undefined'?db.collection('rooms').doc(c+'-chd'):null;}
function myUid(){try{if(typeof auth!=='undefined'&&auth.currentUser&&auth.currentUser.uid)return auth.currentUser.uid;}catch(e){}return (window.accountProfile&&window.accountProfile.uid)||'';}
function myName(){const p=window.accountProfile;return (p&&(p.name||p.code))?String(p.name||p.code):(isTeacherUser()?'Giáo viên':'Học sinh');}
function isTeacherUser(){return (typeof role!=='undefined'?role:window.accountProfile&&window.accountProfile.role)==='teacher';}
function notify(text,type){if(typeof vqcNotify==='function')vqcNotify(text,type||'warning');}
function otherSide(c){return c==='w'?'b':'w';}
function toMs(v){return v&&typeof v.toMillis==='function'?v.toMillis():(typeof v==='number'&&isFinite(v)?v:null);}
function ci(v,a,b){v=Number(v);return isFinite(v)?Math.max(a,Math.min(b,Math.round(v))):a;}
function parseUci(mv){return typeof mv==='string'&&UCI_RE.test(mv)?{from:mv.slice(0,2),to:mv.slice(2,4),promotion:mv[4]||undefined}:null;}
function randomPick(n){try{const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]%n;}catch(e){return Math.floor(Math.random()*n);}}
function newId(){return 'cm'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function fmtClock(sec){sec=Math.max(0,Math.floor(sec));const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return (h?h+':'+String(m).padStart(2,'0'):String(m))+':'+String(s).padStart(2,'0');}
function fmtDur(ms){return fmtClock(Math.round(ms/1000));}
function fmtDate(ms){try{return new Date(ms).toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});}catch(e){return '';}}

function timerOffset(){
 const t=Date.now();if(t-offCache.t<1500)return offCache.v;
 let v=null;
 try{const d=window.vqcClassTimer&&window.vqcClassTimer._debug&&window.vqcClassTimer._debug();if(d&&d.offsetSynced&&isFinite(d.offset))v=d.offset;}catch(e){}
 offCache={t,v};return v;
}
function offset(){const o=timerOffset();if(o!=null)return o;return ownSynced?ownOffset:(fallbackOffset||0);}
function sNow(){return Date.now()+offset();}
async function syncClock(){
 if(syncBusy||typeof db==='undefined'||typeof auth==='undefined'||!auth.currentUser||timerOffset()!=null)return;
 const t=Date.now();if(t<syncRetryAt||(ownSynced&&t-syncedAt<15*60000))return;
 syncBusy=true;
 try{
  const ref=db.collection('clockSync').doc(auth.currentUser.uid);let best=null;
  for(let i=0;i<3;i++){
   const t0=Date.now();
   await ref.set({at:firebase.firestore.FieldValue.serverTimestamp()});
   const t1=Date.now(),snap=await ref.get({source:'server'}),at=toMs(snap.exists?snap.data().at:null);
   if(at==null)continue;
   const rtt=t1-t0;if(!best||rtt<best.rtt)best={rtt,o:at-(t0+t1)/2};
  }
  if(best){ownOffset=Math.round(best.o);ownSynced=true;syncedAt=Date.now();}
 }catch(e){syncRetryAt=Date.now()+10*60000;console.info('[Đấu cờ tàn] chưa đo được giờ máy chủ chính xác:',e&&e.code||e);}
 finally{syncBusy=false;}
}

function problems(){
 if(probCache)return probCache;
 const src=window.VQC_CHERNEV,list=[];
 if(Array.isArray(src)&&typeof Chess==='function'){
  for(let i=0;i<src.length;i++){
   const it=src[i];let board,turn='w',goal='win',extra=null;
   if(typeof it==='string'){const p=it.split(' ');if(p.length!==2||!/^[wb]$/.test(p[1]))continue;board=p[0];turn=p[1];}
   else if(it&&typeof it==='object'&&typeof it.fen==='string'){
    const p=it.fen.split(' ');board=p[0];turn=p[1]==='b'?'b':'w';goal=it.goal==='draw'?'draw':'win';
    extra={};for(const k of ['solution','variations','answer','note'])if(it[k]!==undefined)extra[k]=it[k];
   }else continue;
   const fen=board+' '+turn+' - - 0 1',probe=new Chess();
   if(!probe.load(fen)||probe.fen().split(' ')[0]!==board)continue;
   list.push(Object.assign({num:i+1,fen,goal,goalSide:turn},extra||{}));
  }
 }
 probCache=list;return list;
}
function problemByNum(n){return problems().find(p=>p.num===n)||null;}
function sectionOf(num){const s=window.VQC_CHERNEV_SECTIONS;return Array.isArray(s)?(s.find(x=>num>=x.from&&num<=x.to)||null):null;}
function reqText(p){return SIDE[p.goalSide]+' đi '+(p.goal==='draw'?'hòa':'thắng')+' !';}
function goalText(m){return m.goal==='draw'?SIDE[m.goalSide]+' phải giữ được hòa (không thua)':SIDE[m.goalSide]+' phải thắng (chiếu hết)';}

function normResult(r){
 if(!r||typeof r!=='object')return null;
 return {kind:String(r.kind||'manual'),winner:r.winner==='w'||r.winner==='b'?r.winner:null,
  objectiveMet:typeof r.objectiveMet==='boolean'?r.objectiveMet:null,studentOk:typeof r.studentOk==='boolean'?r.studentOk:null,
  reason:String(r.reason||''),by:String(r.by||''),note:String(r.note||'')};
}
function norm(raw){
 if(!raw||typeof raw!=='object'||raw.v!==1||typeof raw.id!=='string'||!raw.id||!STATUSES.includes(raw.status)||typeof raw.fen0!=='string')return null;
 if(raw.moves!==undefined&&!Array.isArray(raw.moves))return null;
 const moves=Array.isArray(raw.moves)?raw.moves:[];
 if(moves.some(x=>typeof x!=='string'||!UCI_RE.test(x)))return null;
 const m={
  id:raw.id,seq:ci(raw.seq,0,1e9),status:raw.status,
  teacherId:String(raw.teacherId||''),teacherName:String(raw.teacherName||'Giáo viên'),
  studentId:String(raw.studentId||''),studentName:String(raw.studentName||'Học sinh'),
  num:ci(raw.num,1,9999),fen0:raw.fen0,goal:raw.goal==='draw'?'draw':'win',goalSide:raw.goalSide==='b'?'b':'w',
  studentColor:raw.studentColor==='b'?'b':'w',limit:ci(raw.limit,0,36000000),
  used:{w:ci(raw.used&&raw.used.w,0,1e9),b:ci(raw.used&&raw.used.b,0,1e9)},
  run:raw.run==='w'||raw.run==='b'?raw.run:null,anchorMs:toMs(raw.anchor),rawAnchor:raw.anchor||null,
  moves:moves.slice(),sans:Array.isArray(raw.sans)?raw.sans.map(String):[],fen:String(raw.fen||''),
  last:raw.last&&typeof raw.last==='object'&&raw.last.from?{from:String(raw.last.from),to:String(raw.last.to),san:String(raw.last.san||''),by:raw.last.by==='b'?'b':'w'}:null,
  result:normResult(raw.result),
  startedAtMs:toMs(raw.startedAt),endedAtMs:toMs(raw.endedAt),createdAtMs:toMs(raw.createdAt),
  raw:{createdAt:raw.createdAt||null,startedAt:raw.startedAt||null,endedAt:raw.endedAt||null}
 };
 m.teacherColor=otherSide(m.studentColor);
 return m;
}
function toRaw(m,o){
 o=o||{};
 const SV=()=>firebase.firestore.FieldValue.serverTimestamp();
 const t=(mode,keep)=>mode==='now'?SV():(mode==='null'?null:(keep||null));
 return {
  v:1,id:m.id,seq:m.seq+1,status:m.status,
  teacherId:m.teacherId,teacherName:m.teacherName,studentId:m.studentId,studentName:m.studentName,
  num:m.num,fen0:m.fen0,goal:m.goal,goalSide:m.goalSide,req:SIDE[m.goalSide]+' đi '+(m.goal==='draw'?'hòa':'thắng')+' !',
  studentColor:m.studentColor,teacherColor:m.teacherColor,limit:m.limit,
  used:{w:m.used.w,b:m.used.b},run:m.run,anchor:t(o.anchor||'null',m.rawAnchor),
  moves:m.moves.slice(),sans:m.sans.slice(),fen:m.fen,last:m.last||null,result:m.result||null,
  createdAt:t(o.createdAt||'keep',m.raw.createdAt),startedAt:t(o.startedAt||'keep',m.raw.startedAt),endedAt:t(o.endedAt||'keep',m.raw.endedAt)
 };
}
function replay(m){
 if(typeof Chess!=='function')return null;
 const g=new Chess();if(!g.load(m.fen0))return null;
 for(const u of m.moves){const p=parseUci(u);if(!p)return null;const mv=g.move({from:p.from,to:p.to,promotion:p.promotion});if(!mv)return null;}
 return g;
}
function colorOfUid(m,u){if(!m||!u)return null;if(u===m.studentId)return m.studentColor;if(u===m.teacherId)return m.teacherColor;return null;}
function usedMs(m,side,now){
 let u=m.used[side];
 if(m.status==='running'&&m.run===side&&m.anchorMs!=null)u+=Math.max(0,now-m.anchorMs);
 return m.limit?Math.min(u,m.limit):u;
}
function elapsedSince(m,now){return m.run&&m.anchorMs!=null?Math.max(0,now-m.anchorMs):0;}
function endOf(g,mover){
 if(g.in_checkmate())return {kind:'mate',winner:mover};
 if(g.in_stalemate())return {kind:'stalemate',winner:null};
 if(g.insufficient_material())return {kind:'insufficient',winner:null};
 if(g.in_threefold_repetition())return {kind:'threefold',winner:null};
 const hm=parseInt(String(g.fen()).split(' ')[4],10);
 if(hm>=100)return {kind:'fifty',winner:null};
 return null;
}
function judge(m,kind,winner){
 if(kind==='aborted')return {objectiveMet:null,studentOk:null};
 const G=m.goalSide,O=otherSide(G);
 const met=m.goal==='win'?winner===G:winner!==O;
 return {objectiveMet:met,studentOk:m.studentColor===G?met:!met};
}
function reasonText(kind,winner,loser){
 switch(kind){
  case 'mate':return 'Chiếu hết! '+SIDE[winner]+' thắng.';
  case 'stalemate':return 'Hòa Pat: bên đi không còn nước hợp lệ nhưng Vua không bị chiếu.';
  case 'insufficient':return 'Hòa: không đủ quân để chiếu hết.';
  case 'threefold':return 'Hòa: thế cờ lặp lại 3 lần.';
  case 'fifty':return 'Hòa: luật 50 nước (50 nước liền không ăn quân, không đi Tốt).';
  case 'timeout':return SIDE[loser]+' hết giờ.';
  case 'resign':return SIDE[loser]+' chịu thua.';
  case 'aborted':return 'Giáo viên hủy ván (không tính kết quả).';
  default:return 'Giáo viên xác nhận kết quả.';
 }
}
function finished(cur,info,used){
 let j;
 if(info.kind==='manual'){
  const met=typeof info.objectiveMet==='boolean'?info.objectiveMet:null;
  j={objectiveMet:met,studentOk:met===null?null:(cur.studentColor===cur.goalSide?met:!met)};
 }else j=judge(cur,info.kind,info.winner||null);
 const loser=info.kind==='timeout'||info.kind==='resign'?otherSide(info.winner):null;
 const res={kind:info.kind,winner:info.winner||null,objectiveMet:j.objectiveMet,studentOk:j.studentOk,
  reason:info.reason||reasonText(info.kind,info.winner,loser),by:info.by||'rules',note:info.note||''};
 const next=Object.assign({},cur,{status:'ended',run:null,used:used||cur.used,result:res});
 return {match:toRaw(next,{anchor:'null',endedAt:'now'}),final:next,anchorNote:null};
}

async function txMatch(fn){
 if(!roomOn()||typeof db==='undefined')throw Object.assign(new Error('no-room'),{code:'no-room'});
 const ref=matchRef(),code=roomCode();
 let out=null;
 txBusy++;
 try{
  await db.runTransaction(async t=>{
   const snap=await t.get(ref),d=snap.exists?snap.data():null;
   const cur=d&&d.chernevMatch?norm(d.chernevMatch):null;
   const res=fn(cur,sNow(),d);
   if(!res||res.abort){out=res||{abort:'state'};return;}
   const body={chernevMatch:res.clear?null:res.match,room:code,proto:PROTO,chernevPreview:null};
   if(snap.exists)t.update(ref,body);else t.set(ref,body);
   out=res;
  });
 }finally{txBusy--;}
 return out;
}
const ABORT={
 gone:'Ván đấu không còn tồn tại.',stale:'Thế cờ vừa thay đổi — hãy xem lại rồi đi tiếp.',turn:'Chưa đến lượt bên này.',illegal:'Nước đi không hợp lệ.',
 notrunning:'Ván chưa chạy hoặc đang tạm dừng.',notyours:'Em không điều khiển quân bên này.',corrupt:'Dữ liệu ván đấu bị lỗi — giáo viên hãy tạo lại ván.',
 forbidden:'Chỉ người được phép mới thực hiện được thao tác này.',state:'Trạng thái ván đã thay đổi, hãy thử lại.',norun:'Ván chưa ở trạng thái phù hợp.'
};
function errText(e){
 const c=e&&e.code;
 if(c==='permission-denied')return 'Firestore từ chối thao tác này (kiểm tra Rules của phòng lớp).';
 if(c==='no-room')return 'Em chưa ở trong phòng lớp.';
 if(c==='unavailable'||(e&&/offline|network/i.test(e.message||'')))return 'Đang mất kết nối mạng — thao tác chưa được ghi. Hãy thử lại khi có mạng.';
 return 'Chưa thực hiện được: '+((e&&e.message)||'lỗi không rõ')+'.';
}
async function act(fn,okMsg){
 try{
  const r=await fn();
  if(r&&r.abort){notice=ABORT[r.abort]||ABORT.state;render();return r;}
  if(okMsg)notice=okMsg;
  return r;
 }catch(e){notice=errText(e);console.warn('Đấu cờ tàn:',e);render();return null;}
}

async function createMatch(cfg){
 if(!isTeacherUser()){notify('Chỉ giáo viên mới tạo ván đấu.');return null;}
 const me=myUid(),prob=problemByNum(cfg.num);
 if(!prob){notice='Không tìm thấy bài cờ tàn số '+cfg.num+'.';render();return null;}
 if(!cfg.studentId){notice='Hãy chọn học sinh để mời.';render();return null;}
 if(cfg.studentId===me){notice='Giáo viên không tự mời chính mình.';render();return null;}
 const g=new Chess();if(!g.load(prob.fen)){notice='Không nạp được thế cờ của bài này.';render();return null;}
 const r=await act(()=>txMatch((cur,now)=>{
  if(cur&&LIVE.includes(cur.status)&&cur.teacherId&&cur.teacherId!==me)return {abort:'forbidden'};
  const same=!!cur&&cur.studentId===cfg.studentId&&['ready','running','paused','ended'].includes(cur.status);
  const m={id:newId(),seq:cur?cur.seq+1:0,status:same?'ready':'invited',teacherId:me,teacherName:myName(),studentId:cfg.studentId,studentName:cfg.studentName||'Học sinh',
   num:prob.num,fen0:prob.fen,goal:prob.goal,goalSide:prob.goalSide,studentColor:cfg.color,teacherColor:otherSide(cfg.color),limit:cfg.limitMs||0,
   used:{w:0,b:0},run:null,rawAnchor:null,anchorMs:null,moves:[],sans:[],fen:g.fen(),last:null,result:null,raw:{createdAt:null,startedAt:null,endedAt:null}};
  m.seq=cur?cur.seq:-1;
  let replaced=null,prevEnded=null;
  if(cur&&(cur.status==='running'||cur.status==='paused'||(cur.status==='ready'&&cur.moves.length)))replaced=finished(cur,{kind:'aborted',winner:null,by:'teacher',reason:'Giáo viên đổi sang bài/ván khác.'},
   cur.status==='running'?Object.assign({},cur.used,{[cur.run]:cur.used[cur.run]+elapsedSince(cur,now)}):cur.used).final;
  else if(cur&&cur.status==='ended')prevEnded=cur;
  return {match:toRaw(m,{anchor:'null',createdAt:'now',startedAt:'null',endedAt:'null'}),replaced,prevEnded,newId:m.id};
 }));
 if(r&&r.match){
  if(r.replaced)saveResult(r.replaced);
  if(r.prevEnded&&!endedHandled.has(r.prevEnded.id)){endedHandled.add(r.prevEnded.id);saveResult(r.prevEnded);}
  setupOpen=false;verdictOpen=false;hint=null;review=null;tab='game';
  render();
 }
 return r;
}
function respond(accept){
 const id=M&&M.id,me=myUid();
 return act(()=>txMatch((cur)=>{
  if(!cur||cur.id!==id)return {abort:'gone'};
  if(cur.studentId!==me)return {abort:'forbidden'};
  if(cur.status!=='invited')return {abort:'state'};
  return {match:toRaw(Object.assign({},cur,{status:accept?'ready':'declined'}),{anchor:'null'})};
 }));
}
function startMatch(){
 const id=M&&M.id,me=myUid();
 return act(()=>txMatch((cur,now)=>{
  if(!cur||cur.id!==id)return {abort:'gone'};
  if(cur.teacherId!==me)return {abort:'forbidden'};
  if(cur.status!=='ready')return {abort:'norun'};
  const g=replay(cur);if(!g)return {abort:'corrupt'};
  return {match:toRaw(Object.assign({},cur,{status:'running',run:g.turn()}),{anchor:'now',startedAt:'now'})};
 }));
}
function pauseMatch(){
 const id=M&&M.id,me=myUid();
 return act(()=>txMatch((cur,now)=>{
  if(!cur||cur.id!==id)return {abort:'gone'};
  if(cur.teacherId!==me)return {abort:'forbidden'};
  if(cur.status!=='running')return {abort:'notrunning'};
  const used=Object.assign({},cur.used);used[cur.run]=cur.limit?Math.min(cur.limit,used[cur.run]+elapsedSince(cur,now)):used[cur.run]+elapsedSince(cur,now);
  return {match:toRaw(Object.assign({},cur,{status:'paused',run:null,used}),{anchor:'null'})};
 }));
}
function resumeMatch(){
 const id=M&&M.id,me=myUid();
 return act(()=>txMatch((cur)=>{
  if(!cur||cur.id!==id)return {abort:'gone'};
  if(cur.teacherId!==me)return {abort:'forbidden'};
  if(cur.status!=='paused')return {abort:'state'};
  const g=replay(cur);if(!g)return {abort:'corrupt'};
  return {match:toRaw(Object.assign({},cur,{status:'running',run:g.turn()}),{anchor:'now'})};
 }));
}
function usedAtNow(cur,now){const used=Object.assign({},cur.used);if(cur.status==='running'&&cur.run)used[cur.run]=cur.limit?Math.min(cur.limit,used[cur.run]+elapsedSince(cur,now)):used[cur.run]+elapsedSince(cur,now);return used;}
function endMatch(verdict,note){
 const id=M&&M.id,me=myUid();
 return act(()=>txMatch((cur,now)=>{
  if(!cur||cur.id!==id)return {abort:'gone'};
  if(cur.teacherId!==me)return {abort:'forbidden'};
  if(cur.status==='ended'||cur.status==='declined'||cur.status==='invited')return {abort:'state'};
  const used=usedAtNow(cur,now),G=cur.goalSide;
  if(verdict==='void')return finished(cur,{kind:'aborted',winner:null,by:'teacher',note},used);
  const info={kind:'manual',by:'teacher',note:note||''};
  if(verdict==='met'){info.objectiveMet=true;info.winner=cur.goal==='win'?G:null;info.reason='Giáo viên xác nhận: bài đã đạt mục tiêu ('+goalText(cur)+').';}
  else if(verdict==='notmet'){info.objectiveMet=false;info.winner=null;info.reason='Giáo viên xác nhận: bài chưa đạt mục tiêu ('+goalText(cur)+').';}
  else{info.objectiveMet=cur.goal==='draw';info.winner=null;info.reason='Giáo viên xác nhận: ván hòa.';}
  return finished(cur,info,used);
 }));
}
function cancelMatch(){
 const id=M&&M.id,me=myUid();
 return act(()=>txMatch((cur)=>{
  if(!cur||cur.id!==id)return {abort:'gone'};
  if(cur.teacherId!==me)return {abort:'forbidden'};
  if(cur.moves.length||cur.status==='running'||cur.status==='paused')return {abort:'state'};
  return {clear:true,match:null};
 }));
}
function resignMatch(){
 const id=M&&M.id,me=myUid();
 return act(()=>txMatch((cur,now)=>{
  if(!cur||cur.id!==id)return {abort:'gone'};
  const side=colorOfUid(cur,me);if(!side)return {abort:'notyours'};
  if(cur.status!=='running'&&cur.status!=='paused')return {abort:'notrunning'};
  return finished(cur,{kind:'resign',winner:otherSide(side),by:'player'},usedAtNow(cur,now));
 }));
}
async function flagMatch(){
 const id=M&&M.id,me=myUid();
 try{
  return await txMatch((cur,now)=>{
   if(!cur||cur.id!==id)return {abort:'gone'};
   if(!colorOfUid(cur,me))return {abort:'notyours'};
   if(cur.status!=='running'||!cur.limit||!cur.run)return {abort:'state'};
   const used=usedAtNow(cur,now);
   if(cur.limit-used[cur.run]>250)return {abort:'state'};
   used[cur.run]=cur.limit;
   return finished(cur,{kind:'timeout',winner:otherSide(cur.run),by:'clock'},used);
  });
 }catch(e){console.info('Đấu cờ tàn: chưa báo được hết giờ (sẽ thử lại):',e&&e.code||e);return null;}
}
function moveTx(id,ply,from,to,promo,side){
 const me=myUid();
 return txMatch((cur,now)=>{
  if(!cur||cur.id!==id)return {abort:'gone'};
  if(cur.status!=='running')return {abort:'notrunning'};
  if(cur.moves.length!==ply)return {abort:'stale'};
  if(colorOfUid(cur,me)!==side)return {abort:'notyours'};
  const g=replay(cur);if(!g)return {abort:'corrupt'};
  if(g.turn()!==side)return {abort:'turn'};
  const used=Object.assign({},cur.used);used[side]+=elapsedSince(cur,now);
  if(cur.limit&&used[side]>=cur.limit){used[side]=cur.limit;return finished(cur,{kind:'timeout',winner:otherSide(side),by:'clock'},used);}
  const legal=g.moves({verbose:true}).find(x=>x.from===from&&x.to===to&&(x.promotion||undefined)===(promo||undefined));
  if(!legal)return {abort:'illegal'};
  const mv=g.move({from:legal.from,to:legal.to,promotion:legal.promotion});
  if(!mv)return {abort:'illegal'};
  const next=Object.assign({},cur,{used,moves:cur.moves.concat(legal.from+legal.to+(legal.promotion||'')),sans:cur.sans.concat(mv.san),fen:g.fen(),last:{from:mv.from,to:mv.to,san:mv.san,by:side}});
  const e=endOf(g,side);
  if(e){const f=finished(next,{kind:e.kind,winner:e.winner,by:'rules'},used);return f;}
  next.run=g.turn();
  return {match:toRaw(next,{anchor:'now'})};
 });
}

function syncRoomKey(){const key=roomKey();if(key!==lastRoomKey){lastRoomKey=key;roomSeen=false;resetMatch();}}
function onRoomData(data){
 syncRoomKey();
 presence=data&&data.chernevPresence&&typeof data.chernevPresence==='object'?data.chernevPresence:{};
 if(isOpen){paintStudents();paintConn();}
 if(!roomSeen){roomSeen=true;beat(true,true);}
}
function onMatchData(data){
 syncRoomKey();
 mListenErr='';
 pvRemote=data&&data.chernevPreview&&typeof data.chernevPreview==='object'?data.chernevPreview:null;
 pvIn=!isTeacherUser()&&pvRemote?normPreview(pvRemote):null;
 const raw=data&&data.chernevMatch,n=raw?norm(raw):null;
 if(n&&n.anchorMs!=null&&n.anchorMs!==lastObsAnchor&&n.status==='running'&&!ownSynced&&timerOffset()==null){
  lastObsAnchor=n.anchorMs;const obs=n.anchorMs-Date.now();fallbackOffset=fallbackOffset==null?obs:Math.max(fallbackOffset,obs);
 }
 applyMatch(raw?n:null,!!raw&&!n);
 pvRefreshView();
 if(isOpen){paintStudents();paintConn();}
}
function roomKey(){try{return roomRef?(roomRef.path||roomRef.id||'room'):'';}catch(e){return '';}}
function resetMatch(){
 lastSig='';M=null;game=null;corrupt=false;selected=null;promotion=null;pending=null;notice='';hint=null;verdictOpen=false;review=null;
 autoKey='';inviteKey='';turnKey='';flagKey='';
 pvRemote=null;pvIn=null;pvViewKey='';pvLastSig='';pvLastAt=0;pvSuppress='';pvAuto=false;
 paintInvite();
}
function resetAll(){
 if(mListenOff){try{mListenOff();}catch(e){}mListenOff=null;}
 mListenKey='';mListenErr='';
 resetMatch();roomSeen=false;lastRoomKey='';hideOverlay();paintChip();
}
function applyMatch(n,bad){
 const prev=M;
 if(bad){corrupt=true;M=null;game=null;lastSig='bad';render();return;}
 if(n&&prev&&n.id===prev.id&&n.seq<prev.seq)return;
 const sig=matchSig(n);
 if(sig===lastSig)return;
 lastSig=sig;
 M=n;corrupt=false;
 if(!M){game=null;pending=null;hint=null;verdictOpen=false;render();paintInvite();paintChip();return;}
 game=replay(M);
 if(!game)corrupt=true;
 else if(game.fen()!==M.fen)console.warn('Đấu cờ tàn: FEN lưu khác FEN phát lại (dùng bản phát lại).');
 if(!prev||prev.id!==M.id){selected=null;promotion=null;pending=null;hint=null;verdictOpen=false;review=null;notice='';confirmResign=false;if(M.status==='invited'||M.status==='ready')setupOpen=false;}
 if(pending&&(pending.id!==M.id||M.moves.length>pending.ply||M.status!=='running'))clearPending();
 if(prev&&prev.id===M.id&&prev.moves.length!==M.moves.length){selected=null;promotion=null;hint=null;}
 if(M.status==='ended'||M.status==='declined'){verdictOpen=false;}
 if(prev&&prev.id===M.id&&prev.status!==M.status&&(M.status==='ended'||M.status==='declined')){setupOpen=true;confirmResign=false;}
 if(M.status==='ended'&&!endedHandled.has(M.id)){
  endedHandled.add(M.id);
  const seenLive=prev&&prev.id===M.id&&prev.status!=='ended';
  saveResult(M);
  if(seenLive)notify(resultBrief(M),M.result&&M.result.studentOk===false?'warning':'success');
  if(seenLive&&amParticipant()&&!isOpen)open({auto:true});
 }
 const mine=mySide(),tk=M.id+':'+M.moves.length+':'+M.status;
 if(M.status==='running'&&mine&&game&&game.turn()===mine&&turnKey!==tk){turnKey=tk;if(!isOpen&&M.moves.length>0)notify('Đến lượt em đi ('+SIDE[mine]+') — bài cờ tàn số '+M.num+'.','info');}
 const live=LIVE.includes(M.status)&&M.status!=='invited';
 const ak=M.id+':'+(M.status==='running'?'run':M.status);
 if(live&&autoKey!==ak&&!userClosed.has(M.id)&&(amParticipant()||(!isTeacherUser()&&M.status==='running'))&&!isOpen){autoKey=ak;open({auto:true});}
 else if(live)autoKey=ak;
 if(M.status==='invited'&&M.teacherId===myUid()&&!isOpen&&autoKey!==ak){autoKey=ak;}
 paintInvite();paintChip();
 if(isOpen)render();
 if(M.status!=='ended'&&M.status!=='declined')beat(false);
}
let lastSig='';
function matchSig(n){return n?[n.id,n.seq,n.status,n.moves.length,n.anchorMs,n.startedAtMs,n.endedAtMs].join(':'):'-';}
function clearPending(){pending=null;clearTimeout(pendingTimer);}
function amParticipant(){return !!M&&!!colorOfUid(M,myUid());}
function mySide(){return M?colorOfUid(M,myUid()):null;}
function amController(){return !!M&&M.teacherId===myUid()&&isTeacherUser();}
function resultBrief(m){
 const r=m.result;if(!r)return 'Ván đấu đã kết thúc.';
 if(r.kind==='aborted')return 'Ván đấu cờ tàn bị hủy (không tính kết quả).';
 const me=myUid();
 if(me===m.studentId)return r.studentOk?'🏆 Em đã hoàn thành bài cờ tàn số '+m.num+'!':'Bài cờ tàn số '+m.num+' chưa đạt mục tiêu. '+r.reason;
 return 'Ván bài '+m.num+' ('+m.studentName+'): '+(r.objectiveMet===null?'không tính':(r.objectiveMet?'ĐẠT mục tiêu':'CHƯA đạt mục tiêu'))+'. '+r.reason;
}

function pvSigOf(o){return o?['pick','num','fen','from','to','color','limitMin','studentId','studentName','teacherId','teacherName','goal','goalSide'].map(k=>o[k]==null?'':String(o[k])).join('|'):'';}
function pvDesired(){
 if(!isTeacherUser()||!roomOn()||!isOpen||M||corrupt||review||!setupOpen||!myUid())return null;
 const len=Math.max(1,problems().length||300);
 const o={pick:settings.pick,num:null,fen:'',goal:'win',goalSide:'w',from:null,to:null,color:settings.color,
  limitMin:settings.time==='custom'?ci(settings.custom,1,180):ci(settings.time,0,180),
  studentId:settings.studentId||'',studentName:'',teacherId:myUid(),teacherName:myName()};
 if(o.studentId){const st=studentChoices().find(s=>s.id===o.studentId);o.studentName=st?String(st.name).slice(0,80):'';}
 if(settings.pick==='number'){
  const p=problemByNum(ci(settings.num,1,len));if(!p)return null;
  o.num=p.num;o.fen=p.fen;o.goal=p.goal;o.goalSide=p.goalSide;
 }else{o.from=Math.max(1,Math.min(settings.from,settings.to));o.to=Math.min(len,Math.max(settings.from,settings.to));}
 return o;
}
async function pvWrite(o){
 const ref=matchRef();if(!ref||typeof firebase==='undefined')return false;
 try{
  const body=o?{chernevPreview:Object.assign({},o,{at:firebase.firestore.FieldValue.serverTimestamp()}),room:roomCode(),proto:PROTO}:{chernevPreview:null};
  await ref.set(body,{merge:true});
  return true;
 }catch(e){console.info('Đấu cờ tàn: chưa đồng bộ được thế cờ đang chọn sang máy học sinh:',e&&e.code||e);return false;}
}
function pvTick(){
 if(!isTeacherUser()||!roomOn())return;
 const now=Date.now(),want=pvDesired(),sig=want?pvSigOf(want):'';
 if(sig!==pvSig){pvSig=sig;pvSigAt=now;}
 if(pvBusy||txBusy>0||now<pvRetryAt||now-pvSigAt<PV_DEBOUNCE)return;
 const r=pvRemote,mine=!!r&&r.teacherId===myUid();
 let go=false;
 if(want)go=sig!==pvLastSig||now-pvLastAt>=PV_REFRESH||(!mine&&now-pvLastAt>4000);
 else if(mine)go=now-pvLastAt>1500;
 else pvLastSig='';
 if(!go)return;
 pvBusy=true;
 pvWrite(want).then(ok=>{pvBusy=false;if(ok){pvLastSig=sig;pvLastAt=Date.now();}else pvRetryAt=Date.now()+8000;});
}
function normPreview(raw){
 if(!raw||typeof raw!=='object'||typeof Chess!=='function')return null;
 const pick=raw.pick==='range'||raw.pick==='random'?raw.pick:'number';
 const o={pick,teacherId:String(raw.teacherId||''),teacherName:String(raw.teacherName||'Giáo viên').slice(0,80),studentId:String(raw.studentId||''),studentName:String(raw.studentName||'').slice(0,80),
  color:raw.color==='b'||raw.color==='random'?raw.color:'w',limitMin:ci(raw.limitMin,0,180),from:ci(raw.from,1,9999),to:ci(raw.to,1,9999),
  num:0,fen:'',goal:raw.goal==='draw'?'draw':'win',goalSide:raw.goalSide==='b'?'b':'w',atMs:toMs(raw.at),raw};
 if(!o.teacherId||o.atMs==null)return null;
 if(pick==='number'){
  o.num=ci(raw.num,1,9999);
  let fen=typeof raw.fen==='string'?raw.fen:'';
  if(!fen||!new Chess().load(fen)){const p=problemByNum(o.num);if(!p)return null;fen=p.fen;o.goal=p.goal;o.goalSide=p.goalSide;}
  o.fen=fen;
 }
 return o;
}
function currentPreview(){
 if(M||isTeacherUser()||!pvIn)return null;
 if(pvIn.atMs!=null&&sNow()-pvIn.atMs>PV_TTL)return null;
 return pvIn;
}
function pvRefreshView(){
 const pv=currentPreview(),k=pv?pvSigOf(pv.raw):'';
 const changed=k!==pvViewKey;
 pvViewKey=k;
 pvFollow(pv,k);
 if(!changed)return;
 if(isOpen)render();
 paintChip();
}
function pvFollow(pv,k){
 if(isTeacherUser()||!roomOn())return;
 if(M){pvAuto=false;return;}
 if(!pv){
  pvSuppress='';
  if(isOpen&&pvAuto)hideOverlay(true);
  pvAuto=false;
  return;
 }
 if(!isOpen&&k!==pvSuppress&&typeof Chess==='function')open({auto:true,pv:true});
}
function announceDuel(){
 if(!isTeacherUser()||!roomOn()||typeof vqcBroadcastView!=='function')return;
 if(typeof vqcNavApplying!=='undefined'&&vqcNavApplying)return;
 duelAnnounced=true;
 try{vqcBroadcastView('vsduel',0);}catch(e){console.warn('Đấu cờ tàn: chưa báo được cho lớp biết giáo viên đang mở mục này',e);}
}
function pvStatus(pv){
 const what=pv.pick==='number'?'bài cờ tàn số '+pv.num+' ('+reqText({goalSide:pv.goalSide,goal:pv.goal})+')':
  (pv.pick==='range'?'các bài từ '+pv.from+' đến '+pv.to+' (lần lượt từng bài)':'một bài ngẫu nhiên trong khoảng '+pv.from+'–'+pv.to);
 const me=!!pv.studentId&&pv.studentId===myUid();
 return '👀 '+pv.teacherName+' đang chọn '+what+(me?' để mời em':'')+'. Em chỉ xem, chưa đi quân được — hãy chờ lời mời nhé.';
}

function beat(force,jitter){
 if(!roomOn()||!myUid()||typeof firebase==='undefined')return;
 const live=!!M&&LIVE.includes(M.status)&&amParticipant(),every=live?HB_LIVE:HB_IDLE,t=Date.now();
 if(!force&&t-lastBeat<every)return;
 lastBeat=t;
 const write=()=>{try{
  const p=roomRef.update({['chernevPresence.'+myUid()]:{n:myName(),r:isTeacherUser()?'t':'s',at:firebase.firestore.FieldValue.serverTimestamp()}});
  if(p&&p.catch)p.catch(()=>{});
 }catch(e){}};
 if(jitter&&!isTeacherUser())setTimeout(write,Math.floor(Math.random()*2500));else write();
}
function peerFresh(u){
 const p=presence[u];if(!p)return false;
 const live=!!M&&LIVE.includes(M.status);
 const at=toMs(p.at);if(at==null)return true;
 return sNow()-at<(live?PEER_FRESH_LIVE:PEER_FRESH_IDLE);
}
async function loadRoster(force){
 if(!isTeacherUser()||rosterBusy||typeof db==='undefined'||!myUid())return;
 if(!force&&Date.now()-rosterAt<60000)return;
 rosterBusy=true;
 try{
  const s=await db.collection('users').where('teacherId','==',myUid()).limit(100).get();
  roster=s.docs.map(d=>{const x=d.data()||{};return {id:d.id,name:String(x.name||x.code||'Học viên'),code:String(x.code||'')};});
  rosterErr='';rosterAt=Date.now();
 }catch(e){rosterErr='Chưa tải được danh sách học viên của giáo viên: '+((e&&e.code)||(e&&e.message)||'lỗi');}
 finally{rosterBusy=false;if(isOpen)paintStudents();}
}
function studentChoices(){
 const map=new Map();
 for(const r of roster)map.set(r.id,{id:r.id,name:r.name,code:r.code,inRoom:false});
 for(const u of Object.keys(presence)){
  const p=presence[u];if(!p||p.r!=='s'||u===myUid())continue;
  const x=map.get(u)||{id:u,name:String(p.n||'Học sinh'),code:'',inRoom:false};
  x.inRoom=peerFresh(u);map.set(u,x);
 }
 return [...map.values()].sort((a,b)=>(b.inRoom-a.inRoom)||a.name.localeCompare(b.name,'vi'));
}

function histKey(){return 'vqc-duel-hist-'+(myUid()||'guest');}
function outKey(){return 'vqc-duel-out-'+(myUid()||'guest');}
function readLS(k){try{const v=JSON.parse(localStorage.getItem(k)||'[]');return Array.isArray(v)?v:[];}catch(e){return [];}}
function writeLS(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
function buildRecord(m){
 const r=m.result||{},total=m.used.w+m.used.b;
 return {
  id:m.id,room:roomKey().split('/').pop()||'',teacherId:m.teacherId,teacherName:m.teacherName,studentId:m.studentId,studentName:m.studentName,
  num:m.num,fen0:m.fen0,goal:m.goal,goalSide:m.goalSide,studentColor:m.studentColor,teacherColor:m.teacherColor,limit:m.limit,
  kind:r.kind||'manual',winner:r.winner||null,objectiveMet:typeof r.objectiveMet==='boolean'?r.objectiveMet:null,studentOk:typeof r.studentOk==='boolean'?r.studentOk:null,
  reason:String(r.reason||'').slice(0,300),by:String(r.by||''),note:String(r.note||'').slice(0,300),
  playedMs:total,usedW:m.used.w,usedB:m.used.b,plies:m.moves.length,moves:m.moves.slice(0,400),sans:m.sans.slice(0,400),
  startedAtMs:m.startedAtMs||null,endedAtMs:m.endedAtMs||Date.now()
 };
}
function keepLocal(rec){
 const list=readLS(histKey()).filter(x=>x&&x.id!==rec.id);list.unshift(rec);writeLS(histKey(),list.slice(0,HIST_CAP));
}
async function saveResult(m){
 if(!m||!m.result)return;
 const rec=buildRecord(m);
 keepLocal(rec);
 if(m.teacherId!==myUid()||!isTeacherUser()){return;}
 if(!(m.moves.length||rec.kind!=='aborted'))return;
 await writeRemote(rec,true);
}
async function writeRemote(rec,queueOnFail){
 try{
  const ref=db.collection('chernevResults').doc(rec.id);
  const ex=await ref.get();
  if(!ex.exists)await ref.set(Object.assign({},rec,{createdAt:firebase.firestore.FieldValue.serverTimestamp()}));
  dropOutbox(rec.id);remoteAt=0;remoteErr='';
  if(isOpen&&tab==='results')render();
  return true;
 }catch(e){
  if(queueOnFail){
   const q=readLS(outKey()).filter(x=>x&&x.id!==rec.id);q.push(rec);writeLS(outKey(),q.slice(-200));
   remoteErr=(e&&e.code==='permission-denied')?'Chưa lưu được lên Firebase: cần đăng bản Rules mới có chernevResults (xem hướng dẫn). Kết quả được giữ trên máy này và sẽ gửi lại khi được phép.':'Chưa lưu được kết quả lên Firebase (mạng?) — đã giữ trên máy này và sẽ tự gửi lại.';
   notify(remoteErr,'warning');
  }
  return false;
 }
}
function dropOutbox(id){const q=readLS(outKey());if(q.some(x=>x&&x.id===id))writeLS(outKey(),q.filter(x=>x&&x.id!==id));}
async function flushOutbox(){
 if(outboxBusy||!isTeacherUser()||!myUid()||typeof db==='undefined')return;
 const q=readLS(outKey());if(!q.length)return;
 outboxBusy=true;
 try{for(const rec of q){if(rec&&rec.teacherId===myUid()){const ok=await writeRemote(rec,false);if(!ok)break;}}}
 finally{outboxBusy=false;}
}
async function loadRemote(force){
 if(remoteBusy||typeof db==='undefined'||!myUid())return;
 if(!force&&Date.now()-remoteAt<30000)return;
 remoteBusy=true;
 try{
  const teacher=isTeacherUser();
  const s=await db.collection('chernevResults').where(teacher?'teacherId':'studentId','==',myUid()).limit(500).get();
  remoteRes=s.docs.map(d=>Object.assign({id:d.id},d.data()));remoteErr='';remoteAt=Date.now();
 }catch(e){remoteErr=(e&&e.code==='permission-denied')?'Chưa đọc được kết quả từ Firebase (Rules chưa có chernevResults) — đang hiển thị các ván lưu trên máy này.':'Chưa tải được kết quả từ Firebase — đang hiển thị các ván lưu trên máy này.';}
 finally{remoteBusy=false;if(isOpen&&tab==='results')render();}
}
function allResults(){
 const map=new Map();
 for(const r of remoteRes)map.set(r.id,r);
 for(const r of readLS(histKey()))if(r&&r.id&&!map.has(r.id))map.set(r.id,r);
 const me=myUid(),teacher=isTeacherUser();
 return [...map.values()].filter(r=>teacher?r.teacherId===me:r.studentId===me).sort((a,b)=>(toMs(b.endedAtMs)||0)-(toMs(a.endedAtMs)||0));
}

function ensureEngine(){
 if(engine)return engine;
 if(!window.VqcStockfish)throw new Error('Chưa tải được mô-đun động cơ Stockfish.');
 engine=window.VqcStockfish.create({onStatus:s=>{if(s==='loading'){engineState='loading';render();}}});engineState='idle';return engine;
}
function disposeEngine(){const e=engine;engine=null;engineState='idle';hintEpoch++;hintBusy=false;if(e){try{e.dispose();}catch(x){}}}
function evalWhite(info,turn){
 if(!info)return null;
 if(info.mate!==null&&info.mate!==undefined)return {mate:turn==='w'?info.mate:-info.mate};
 if(info.cp===null||info.cp===undefined)return null;
 return {cp:turn==='w'?info.cp:-info.cp};
}
function evalText(ev){
 if(!ev)return '';
 if(ev.mate!==undefined)return (ev.mate>0?'Trắng':'Đen')+' có thể chiếu hết sau '+Math.abs(ev.mate)+' nước';
 const a=Math.abs(ev.cp);if(a<30)return 'Thế cờ cân bằng';
 const who=ev.cp>0?'Trắng':'Đen';return a<150?who+' hơi nhỉnh hơn':a<400?who+' đang hơn':who+' hơn rất nhiều';
}
function evalShare(ev){if(!ev)return 50;if(ev.mate!==undefined)return ev.mate>0?97:3;return Math.round(50+50*Math.tanh(ev.cp/400)*0.94);}
function analyze(){
 if(!amController()||!game||hintBusy)return;
 const fen=game.fen(),turn=game.turn(),epoch=++hintEpoch,mid=M.id;
 hintBusy=true;hint=null;notice='';render();
 let eng;try{eng=ensureEngine();}catch(e){hintBusy=false;notice='⚠️ '+e.message;render();return;}
 eng.search(fen,{movetime:1000,skill:20}).then(res=>{
  if(epoch!==hintEpoch)return;hintBusy=false;engineState=engine?engine.state:'idle';
  if(res.cancelled||!M||M.id!==mid||!game||game.fen()!==fen){render();return;}
  const probe=new Chess();probe.load(fen);
  const p=res.valid&&!res.none?parseUci(res.bestmove):null;
  const legal=p&&probe.moves({verbose:true}).find(x=>x.from===p.from&&x.to===p.to&&(x.promotion||undefined)===p.promotion);
  const made=legal?probe.move({from:legal.from,to:legal.to,promotion:legal.promotion}):null;
  hint={fen,turn,san:made?made.san:'',from:made?made.from:'',to:made?made.to:'',piece:made?made.piece:'',ev:evalWhite(res.info,turn)};
  render();
 }).catch(err=>{
  if(epoch!==hintEpoch)return;hintBusy=false;disposeEngine();notice='⚠️ Chưa tải được động cơ Stockfish (có thể do mạng hoặc trình duyệt cũ).';render();
 });
}

function canMove(){
 return isOpen&&!review&&!!M&&!!game&&M.status==='running'&&!pending&&!promotion&&!!mySide()&&game.turn()===mySide();
}
function onCell(sq){
 if(!canMove())return;
 const side=mySide(),p=game.get(sq);
 if(p&&p.color===side){selected=selected===sq?null:sq;notice='';render();return;}
 if(!selected)return;
 const choices=game.moves({square:selected,verbose:true}).filter(m=>m.to===sq);
 if(!choices.length){selected=null;notice='Ô này không phải nước đi hợp lệ. Hãy chọn lại.';render();return;}
 notice='';
 if(choices.some(m=>m.promotion)){promotion={from:selected,to:sq};render();return;}
 submitMove(selected,sq,undefined);
}
function choosePromotion(k){
 if(!promotion||!['q','r','b','n'].includes(k))return;
 const {from,to}=promotion;promotion=null;submitMove(from,to,k);
}
async function submitMove(from,to,promo){
 if(!M||!game||pending)return;
 const side=mySide(),ply=M.moves.length,id=M.id;
 if(!side||game.turn()!==side)return;
 pending={id,ply,from,to,promo};selected=null;
 clearTimeout(pendingTimer);pendingTimer=setTimeout(()=>{if(pending&&pending.ply===ply){pending=null;render();}},7000);
 render();
 try{
  const r=await moveTx(id,ply,from,to,promo,side);
  if(r&&r.abort){clearPending();notice=ABORT[r.abort]||ABORT.state;render();}
  else if(r&&r.final&&r.final.status==='ended'&&!endedHandled.has(r.final.id)){ }
 }catch(e){clearPending();notice=errText(e);render();}
}
function previewGame(){
 if(M)return null;
 if(!isTeacherUser()){const pv=currentPreview();if(!pv||pv.pick!=='number')return null;const g=new Chess();return g.load(pv.fen)?g:null;}
 if(!setupOpen||settings.pick!=='number')return null;
 const p=problemByNum(ci(settings.num,1,Math.max(1,problems().length)));if(!p)return null;
 const g=new Chess();return g.load(p.fen)?g:null;
}
function displayGame(){
 if(review)return reviewGame();
 if(!game)return previewGame();
 if(pending){
  const g=new Chess(game.fen());
  const mv=g.move({from:pending.from,to:pending.to,promotion:pending.promo});
  if(mv)return g;
 }
 return game;
}
function lastOf(){
 if(review){const k=review.ply;return k>0?uciToMove(review.rec.moves[k-1]):null;}
 if(pending)return {from:pending.from,to:pending.to};
 return M&&M.last?{from:M.last.from,to:M.last.to}:null;
}
function uciToMove(u){const p=parseUci(u);return p?{from:p.from,to:p.to}:null;}

function reviewGame(){
 const g=new Chess();if(!g.load(review.rec.fen0))return null;
 for(let i=0;i<review.ply&&i<review.rec.moves.length;i++){const p=parseUci(review.rec.moves[i]);if(!p||!g.move({from:p.from,to:p.to,promotion:p.promotion}))break;}
 return g;
}
function openReview(id){
 const rec=allResults().find(r=>r.id===id);if(!rec)return;
 const moves=Array.isArray(rec.moves)?rec.moves.filter(x=>UCI_RE.test(x)):[];
 review={rec:Object.assign({},rec,{moves}),ply:moves.length};
 tab='game';selected=null;promotion=null;render();
}
function closeReview(){review=null;render();}
function reviewStep(d){
 if(!review)return;const n=review.rec.moves.length;
 review.ply=d===Infinity?n:d===-Infinity?0:Math.max(0,Math.min(n,review.ply+d));render();
}

function kingSquare(g,color){
 for(const f of FILES)for(let r=1;r<=8;r++){const p=g.get(f+r);if(p&&p.type==='k'&&p.color===color)return f+r;}
 return null;
}
function bottomSide(){
 if(review)return review.rec.studentId===myUid()?review.rec.studentColor:review.rec.teacherColor;
 if(!M){const pv=!isTeacherUser()?currentPreview():null;return pv&&pv.color!=='random'?pv.color:'w';}
 return mySide()||M.studentColor;
}
function paintBoard(){
 const board=$('vqcChdBoard');if(!board)return;
 const g=displayGame();board.replaceChildren();if(!g)return;
 const bottom=bottomSide(),flip=bottom==='b';
 const ranks=flip?[1,2,3,4,5,6,7,8]:[8,7,6,5,4,3,2,1],files=flip?[...FILES].reverse():[...FILES];
 const legal=selected&&canMove()?game.moves({square:selected,verbose:true}).map(m=>m.to):[];
 const last=lastOf(),checkSq=g.in_check()?kingSquare(g,g.turn()):null;
 const mineCells=canMove();
 for(let ri=0;ri<8;ri++)for(let fi=0;fi<8;fi++){
  const sq=files[fi]+ranks[ri],p=g.get(sq),b=document.createElement('button');
  b.type='button';b.dataset.square=sq;b.className='vqc-chd-cell '+((ri+fi)%2?'dark':'light');
  if(selected===sq)b.classList.add('selected');
  if(legal.includes(sq))b.classList.add('legal');
  if(last&&last.from===sq)b.classList.add('vqc-last-from');
  if(last&&last.to===sq)b.classList.add('vqc-last-to');
  if(hint&&!review&&hint.from===sq)b.classList.add('hint-from');
  if(hint&&!review&&hint.to===sq)b.classList.add('hint-to');
  if(checkSq===sq)b.classList.add('in-check');
  b.setAttribute('aria-label','Ô '+sq+(p?' '+(p.color==='w'?'trắng ':'đen ')+(PIECE[p.type]||''):''));
  if(!mineCells)b.classList.add('ro');
  if(p){
   const s=document.createElement('span');s.className='vqc-chd-piece';
   if(typeof pieceSvgMarkup==='function')s.innerHTML=pieceSvgMarkup(p.color==='w'?p.type.toUpperCase():p.type);
   else s.textContent=({w:{k:'♔',q:'♕',r:'♖',b:'♗',n:'♘',p:'♙'},b:{k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'}}[p.color]||{})[p.type]||'';
   b.append(s);
  }
  if(fi===0){const x=document.createElement('span');x.className='vqc-chd-rank';x.textContent=sq[1];b.append(x);}
  if(ri===7){const x=document.createElement('span');x.className='vqc-chd-file';x.textContent=sq[0];b.append(x);}
  b.addEventListener('click',()=>onCell(sq));
  board.append(b);
 }
}
function paintPromotion(){
 const el=$('vqcChdPromo');if(!el)return;
 el.replaceChildren();el.hidden=!promotion;if(!promotion)return;
 const t=document.createElement('p');t.textContent='Tốt phong cấp thành:';el.append(t);
 const row=document.createElement('div');row.className='vqc-chd-promo-row';
 const side=mySide()||'w';
 for(const k of ['q','r','b','n']){
  const b=document.createElement('button');b.type='button';b.dataset.promo=k;b.setAttribute('aria-label',PIECE[k]);
  const glyph=typeof pieceSvgMarkup==='function'?pieceSvgMarkup(side==='w'?k.toUpperCase():k):'';
  b.innerHTML='<span class="vqc-chd-promo-piece">'+glyph+'</span><span>'+PIECE[k]+'</span>';
  b.addEventListener('click',()=>choosePromotion(k));row.append(b);
 }
 el.append(row);
}
function paintHistory(){
 const box=$('vqcChdHistory');if(!box)return;
 const sans=review?(function(){const g=new Chess();g.load(review.rec.fen0);const out=[];for(let i=0;i<review.rec.moves.length;i++){const p=parseUci(review.rec.moves[i]);const mv=p&&g.move({from:p.from,to:p.to,promotion:p.promotion});if(!mv)break;out.push(mv.san);}return out;})():(M?M.sans:[]);
 const fen0=review?review.rec.fen0:(M?M.fen0:'');
 box.replaceChildren();
 if(!sans.length){const p=document.createElement('p');p.className='vqc-chd-empty';p.textContent='Chưa có nước đi nào.';box.append(p);return;}
 const parts=fen0.split(' ');const startBlack=parts[1]==='b';let num=parseInt(parts[5],10);if(isNaN(num)||num<1)num=1;
 const rows=[];let i=0,n=num;
 if(startBlack){rows.push({n,w:'…',b:sans[0]});i=1;n++;}
 for(;i<sans.length;i+=2,n++)rows.push({n,w:sans[i],b:sans[i+1]||''});
 const last=review?review.ply-1:sans.length-1;
 rows.forEach((r,ri)=>{
  const row=document.createElement('div');row.className='vqc-chd-hrow';
  const a=document.createElement('span');a.className='vqc-chd-hnum';a.textContent=r.n+'.';
  const w=document.createElement('span');w.textContent=r.w;const b=document.createElement('span');b.textContent=r.b;
  const wi=startBlack?(ri===0?-1:2*ri-1):2*ri,bi=startBlack?(ri===0?0:2*ri):2*ri+1;
  if(wi===last)w.className='cur';if(bi===last)b.className='cur';
  row.append(a,w,b);box.append(row);
 });
 if(!review)box.scrollTop=box.scrollHeight;
}
function turnSide(){return M&&game&&(M.status==='running'||M.status==='paused')?game.turn():null;}
function paintPlayers(){
 const bottom=bottomSide(),top=otherSide(bottom);
 const nameOf=side=>{
  if(review){const r=review.rec;return side===r.studentColor?{n:r.studentName,t:'🙂',me:r.studentId===myUid()}:{n:r.teacherName,t:'👩‍🏫',me:r.teacherId===myUid()};}
  if(!M&&!isTeacherUser()){
   const pv=currentPreview();
   if(pv){
    if(pv.color==='random')return {n:'Bốc thăm màu quân',t:'🎲',me:false};
    const isMe=!!pv.studentId&&pv.studentId===myUid();
    return side===pv.color?{n:isMe?myName():(pv.studentName||'Học sinh (chưa chọn)'),t:'🙂',me:isMe}:{n:pv.teacherName,t:'👩‍🏫',me:false};
   }
  }
  if(!M)return {n:side===bottom?(isTeacherUser()?myName():'Em'):(isTeacherUser()?'Học sinh (chưa mời)':'Giáo viên'),t:isTeacherUser()===(side===bottom)?'👩‍🏫':'🙂',me:side===bottom};
  return side===M.studentColor?{n:M.studentName,t:'🙂',me:M.studentId===myUid()}:{n:M.teacherName,t:'👩‍🏫',me:M.teacherId===myUid()};
 };
 const mk=(id,side)=>{
  const el=$(id);if(!el)return;
  const who=nameOf(side),turnNow=!review&&turnSide()===side&&M.status==='running';
  el.classList.toggle('turn',!!turnNow);el.dataset.side=side;
  el.querySelector('.vqc-chd-avatar').textContent=who.t;
  el.querySelector('.vqc-chd-pname').textContent=who.n+(who.me?' (em)':'');
  el.querySelector('.vqc-chd-pside').textContent=(side==='w'?'⚪ ':'⚫ ')+SIDE[side];
  el.querySelector('.vqc-chd-turn').textContent=review?'':(turnNow?'đến lượt':'');
  el.querySelector('.vqc-chd-clock').dataset.side=side;
 };
 mk('vqcChdTop',top);mk('vqcChdBottom',bottom);
 paintClocks();
}
function paintClocks(){
 const now=sNow();
 for(const el of document.querySelectorAll('#vqcChdOverlay .vqc-chd-clock')){
  const side=el.dataset.side;
  if(review||!M||!side){el.textContent=review?fmtDur(side==='w'?review.rec.usedW||0:review.rec.usedB||0):'--:--';el.classList.remove('low','run');continue;}
  const u=usedMs(M,side,now);
  const rem=M.limit?M.limit-u:null;
  const txt=M.limit?fmtClock(Math.ceil(rem/1000)):'⏱ '+fmtClock(Math.floor(u/1000));
  if(el.textContent!==txt)el.textContent=txt;
  el.classList.toggle('low',!!M.limit&&rem<=30000&&M.status!=='ended');
  el.classList.toggle('run',M.status==='running'&&M.run===side);
  el.title=M.limit?'Thời gian còn lại của '+SIDE[side]:'Thời gian đã dùng của '+SIDE[side]+' (không giới hạn)';
 }
}
function resultText(m){
 const r=m.result;if(!r)return '';
 const me=myUid();
 if(r.kind==='aborted')return '🚫 '+r.reason;
 const goal=goalText(m);
 const verdict=r.objectiveMet===null?'':(r.objectiveMet?'🎯 Mục tiêu bài ('+goal+'): ĐÃ ĐẠT.':'🎯 Mục tiêu bài ('+goal+'): CHƯA đạt.');
 let head;
 if(me===m.studentId)head=r.studentOk?(m.studentColor===m.goalSide?'🏆 Em đã hoàn thành bài cờ tàn!':'🛡️ Em đã giữ được thế cờ — bài chưa đạt mục tiêu của bên tấn công!'):'😅 Chưa đạt mục tiêu.';
 else if(me===m.teacherId||isTeacherUser())head=r.studentOk===null?'Ván đã kết thúc.':(r.studentOk?'✅ '+m.studentName+' đã hoàn thành nhiệm vụ của bên mình.':'❌ '+m.studentName+' chưa hoàn thành nhiệm vụ.');
 else head=r.objectiveMet?'Bài đã đạt mục tiêu.':'Ván đã kết thúc.';
 return head+' '+r.reason+(verdict?' '+verdict:'')+(r.note?' Ghi chú: '+r.note:'');
}
function statusText(){
 if(corrupt)return '⚠️ Dữ liệu ván đấu bị lỗi nên chưa hiển thị được. Giáo viên hãy tạo lại ván.';
 if(!roomOn())return 'Em chưa ở trong phòng lớp học.';
 if(!M){
  if(isTeacherUser())return 'Chưa có ván đấu. Hãy chọn bài, học sinh, màu quân và thời gian rồi bấm “Gửi lời mời”.';
  {const pv=currentPreview();if(pv)return pvStatus(pv);}
  return 'Chưa có ván đấu. Em chờ giáo viên mời nhé — lời mời sẽ hiện ngay khi giáo viên gửi.';
 }
 const mine=mySide(),ctl=amController(),peer=mine?(M.studentId===myUid()?M.teacherName:M.studentName):'';
 switch(M.status){
  case 'invited':return ctl?'📨 Đã mời '+M.studentName+'. Đang chờ em ấy chấp nhận…':(M.studentId===myUid()?'Giáo viên '+M.teacherName+' mời em đấu bài cờ tàn số '+M.num+'. Hãy trả lời lời mời.':'Giáo viên đang mời '+M.studentName+' đấu bài số '+M.num+'.');
  case 'declined':return ctl?'🙅 '+M.studentName+' đã từ chối lời mời. Hãy mời học sinh khác hoặc thử lại.':'Lời mời đã bị từ chối.';
  case 'ready':return ctl?'✅ '+M.studentName+' đã sẵn sàng. Bấm “Bắt đầu” để chạy đồng hồ và cho phép đi quân.':(mine?'Đã sẵn sàng — chờ giáo viên bấm “Bắt đầu”.':'Ván sắp bắt đầu — '+M.teacherName+' với '+M.studentName+'.');
  case 'paused':return '⏸ Giáo viên đã tạm dừng ván đấu. Đồng hồ của cả hai bên đang dừng.';
  case 'ended':return resultText(M);
  default:{
   if(!game)return '';
   const chk=game.in_check()?' ⚠️ Vua đang bị chiếu!':'',t=game.turn();
   if(mine)return t===mine?(pending?'Đang gửi nước đi…':'Đến lượt em ('+SIDE[mine]+').')+chk:'Đến lượt '+(ctl?'học sinh':'giáo viên')+' ('+SIDE[t]+'). '+(pending?'':'Em chờ nhé.')+chk;
   return 'Đến lượt '+SIDE[t]+' ('+(t===M.studentColor?M.studentName:M.teacherName)+').'+chk;
  }
 }
}
function paintProblem(){
 const el=$('vqcChdProblem');if(!el)return;
 const m=M;
 if(!m){
  el.hidden=true;
  return;
 }
 el.hidden=false;
 const sec=sectionOf(m.num),mine=mySide();
 const lines=['<b>Bài '+m.num+'/'+Math.max(problems().length,300)+'</b>'+(sec?' · '+esc(sec.name):''),
  'Yêu cầu: <b>'+esc(SIDE[m.goalSide]+' đi '+(m.goal==='draw'?'hòa':'thắng')+' !')+'</b>',
  'Học sinh cầm '+(m.studentColor==='w'?'⚪ Trắng':'⚫ Đen')+' · Giáo viên cầm '+(m.teacherColor==='w'?'⚪ Trắng':'⚫ Đen')+(mine?' · <b>Em cầm '+(mine==='w'?'⚪ Trắng':'⚫ Đen')+'</b>':''),
  m.limit?'Thời gian: '+Math.round(m.limit/60000*10)/10+' phút mỗi bên':'Thời gian: không giới hạn'];
 el.innerHTML=lines.map(x=>'<div>'+x+'</div>').join('');
}
function paintConn(){
 const el=$('vqcChdConn');if(!el)return;
 if(!M||!LIVE.includes(M.status)||review||!amParticipant()){el.hidden=true;return;}
 const peerId=M.studentId===myUid()?M.teacherId:M.studentId,peerName=M.studentId===myUid()?M.teacherName:M.studentName;
 const ok=peerFresh(peerId);
 el.hidden=false;el.className='vqc-chd-conn '+(ok?'ok':'off');
 el.textContent=ok?'🟢 '+peerName+' đang trực tuyến.':'🔴 Chưa thấy '+peerName+' trực tuyến (mất kết nối?). Đồng hồ vẫn chạy theo giờ máy chủ; giáo viên có thể tạm dừng.';
}
function paintStudents(){
 const sel=$('vqcChdStudent');if(!sel)return;
 {const pv=!isTeacherUser()&&!M&&!review?currentPreview():null;if(pv){paintStudentMirror(pv);return;}}
 const cur=settings.studentId,list=studentChoices();
 const sig=list.map(s=>s.id+'|'+s.name+'|'+s.inRoom).join(';')+'#'+cur;
 const err=$('vqcChdRosterErr');if(err){err.textContent=rosterErr;err.hidden=!rosterErr;}
 if(sel.dataset.sig===sig&&sel.options.length)return;
 sel.dataset.sig=sig;
 sel.replaceChildren();
 const ph=document.createElement('option');ph.value='';ph.textContent=list.length?'— Chọn học sinh —':'(Chưa có học sinh nào)';sel.append(ph);
 for(const s of list){const o=document.createElement('option');o.value=s.id;o.textContent=(s.inRoom?'🟢 ':'⚪ ')+s.name+(s.code?' ('+s.code+')':'')+(s.inRoom?' — đang trong lớp':' — chưa vào lớp');sel.append(o);}
 sel.value=list.some(s=>s.id===cur)?cur:'';
 if(sel.value!==cur){settings.studentId=sel.value;sel.dataset.sig=list.map(s=>s.id+'|'+s.name+'|'+s.inRoom).join(';')+'#'+sel.value;}
}
function limitMs(){
 if(settings.time==='custom')return ci(settings.custom,1,180)*60000;
 return ci(settings.time,0,180)*60000;
}
function pickProblem(){
 const list=problems();if(!list.length)return null;
 const lo=Math.max(1,Math.min(settings.from,settings.to)),hi=Math.min(list.length,Math.max(settings.from,settings.to));
 if(settings.pick==='number')return ci(settings.num,1,list.length);
 const pool=[];for(let n=lo;n<=hi;n++)pool.push(n);
 if(!pool.length)return lo;
 if(settings.pick==='random'){
  const done=new Set(allResults().filter(r=>r.studentId===settings.studentId&&r.studentOk===true&&r.kind!=='aborted').map(r=>r.num));
  const fresh=pool.filter(n=>!done.has(n)),src=fresh.length?fresh:pool;
  return src[randomPick(src.length)];
 }
 const cur=pool.includes(settings.num)?settings.num:lo;
 return cur;
}
function send(){
 const num=pickProblem();
 if(!num){notice='Chưa có dữ liệu bài cờ tàn.';render();return;}
 const st=studentChoices().find(s=>s.id===settings.studentId);
 if(!st){notice='Hãy chọn học sinh để mời.';render();return;}
 let color=settings.color;if(color==='random')color=randomPick(2)?'w':'b';
 settings.num=num;
 createMatch({num,studentId:st.id,studentName:st.name,color,limitMs:limitMs()}).then(r=>{
  if(r&&r.match&&settings.pick==='range'){const lo=Math.min(settings.from,settings.to),hi=Math.max(settings.from,settings.to);settings.num=num+1>hi?lo:num+1;}
 });
}
function paintSetup(){
 const box=$('vqcChdSetup');if(!box)return;
 const teacher=isTeacherUser()&&(!M||amController()||!LIVE.includes(M.status));
 const pv=!isTeacherUser()&&!M&&!review?currentPreview():null;
 box.hidden=!((teacher&&setupOpen&&!review)||!!pv);
 box.disabled=!!pv;box.classList.toggle('vqc-chd-locked',!!pv);
 const lockNote=$('vqcChdLockNote');if(lockNote)lockNote.hidden=!pv;
 if(box.hidden)return;
 const S=pv?pvSettings(pv):settings;
 const list=problems(),maxN=Math.max(1,list.length);
 document.querySelectorAll('#vqcChdOverlay [data-pick]').forEach(b=>b.setAttribute('aria-pressed',String(S.pick===b.dataset.pick)));
 document.querySelectorAll('#vqcChdOverlay [data-dcolor]').forEach(b=>b.setAttribute('aria-pressed',String(S.color===b.dataset.dcolor)));
 document.querySelectorAll('#vqcChdOverlay [data-dtime]').forEach(b=>b.setAttribute('aria-pressed',String(S.time===b.dataset.dtime)));
 $('vqcChdRangeRow').hidden=S.pick==='number';
 $('vqcChdNumRow').hidden=S.pick==='random';
 const num=$('vqcChdNum');if(document.activeElement!==num)num.value=String(S.num);num.max=String(maxN);
 const f=$('vqcChdFrom'),t=$('vqcChdTo');if(document.activeElement!==f)f.value=String(S.from);if(document.activeElement!==t)t.value=String(S.to);
 f.max=t.max=String(maxN);
 $('vqcChdCustomRow').hidden=S.time!=='custom';
 const c=$('vqcChdCustom');if(document.activeElement!==c)c.value=String(S.custom);
 const n=S.pick==='number'?ci(S.num,1,maxN):null,p=n?problemByNum(n):null,sec=sectionOf(n||S.from);
 $('vqcChdProbInfo').textContent=p?('Bài '+p.num+(sec?' · '+sec.name:'')+' · '+reqText(p)):(S.pick==='random'?'Máy chọn ngẫu nhiên trong khoảng '+S.from+'–'+S.to+(S.studentId?' (ưu tiên bài em này chưa đạt).':'.'):'Bài '+S.from+'→'+S.to+', lần lượt từng bài.');
 $('vqcChdSection').value=sec?String(sec.from):'';
 const colorTxt=S.color==='random'?'ngẫu nhiên':(S.color==='w'?'⚪ Trắng':'⚫ Đen');
 $('vqcChdColorInfo').textContent='Học sinh cầm: '+colorTxt+(S.color==='random'?'':' · Giáo viên cầm: '+(S.color==='w'?'⚫ Đen':'⚪ Trắng'));
 $('vqcChdSend').disabled=!!pv||!S.studentId||!roomOn()||!list.length;
 $('vqcChdSend').textContent=pv?'📨 Giáo viên sẽ gửi lời mời':(M&&LIVE.includes(M.status)?'📨 Đổi sang bài này':'📨 Gửi lời mời');
 if(pv)paintStudentMirror(pv);else paintStudents();
}
function pvSettings(pv){
 const t=pv.limitMin,std=[0,3,5,10,15].includes(t);
 return {pick:pv.pick,num:pv.num||1,from:pv.from,to:pv.to,studentId:pv.studentId,color:pv.color,time:std?String(t):'custom',custom:t||5};
}
function paintStudentMirror(pv){
 const sel=$('vqcChdStudent');if(!sel)return;
 const sid=pv.studentId,nm=pv.studentName||'',sig='pv|'+sid+'|'+nm;
 const err=$('vqcChdRosterErr');if(err)err.hidden=true;
 if(sel.dataset.sig===sig)return;
 sel.dataset.sig=sig;sel.replaceChildren();
 const o=document.createElement('option');o.value=sid;
 o.textContent=sid?('🟢 '+(sid===myUid()?(nm||'Em')+' (em)':(nm||'Học sinh'))):'— Giáo viên chưa chọn học sinh —';
 sel.append(o);sel.value=sid;
}

function paintVerdict(){
 const box=$('vqcChdVerdict');if(!box)return;
 box.hidden=!(verdictOpen&&amController()&&M&&LIVE.includes(M.status)&&M.status!=='invited');
 if(box.hidden)return;
 $('vqcChdVerdictGoal').textContent='Mục tiêu của bài: '+goalText(M)+'.';
 const ev=hint&&game&&hint.fen===game.fen()?(evalText(hint.ev)+(hint.san?' · nước máy gợi ý: '+hint.san:'')):'';
 $('vqcChdVerdictEval').textContent=ev?'🤖 Máy (tham khảo): '+ev:'';
}
function paintResults(){
 const box=$('vqcChdResults');if(!box)return;
 const teacher=isTeacherUser();
 const all=allResults();
 const sel=$('vqcChdResFilter');
 if(sel){
  const prev=sel.value;sel.hidden=!teacher;
  if(teacher){
   const names=new Map();all.forEach(r=>names.set(r.studentId,r.studentName));
   sel.replaceChildren();const o0=document.createElement('option');o0.value='';o0.textContent='Tất cả học sinh';sel.append(o0);
   [...names.entries()].sort((a,b)=>String(a[1]).localeCompare(String(b[1]),'vi')).forEach(([id,n])=>{const o=document.createElement('option');o.value=id;o.textContent=n;sel.append(o);});
   sel.value=[...names.keys()].includes(prev)?prev:'';
  }
 }
 const f=teacher&&sel?sel.value:'';
 const rows=all.filter(r=>!f||r.studentId===f);
 const real=rows.filter(r=>r.kind!=='aborted');
 const ok=real.filter(r=>r.studentOk===true).length,solved=new Set(real.filter(r=>r.studentOk===true).map(r=>r.num)).size;
 $('vqcChdResStats').textContent=real.length?('Tổng '+real.length+' ván · Hoàn thành nhiệm vụ '+ok+' ('+Math.round(100*ok/real.length)+'%) · '+solved+' bài khác nhau đạt'):'Chưa có ván nào được lưu.';
 const err=$('vqcChdResErr');err.textContent=remoteErr;err.hidden=!remoteErr;
 box.replaceChildren();
 for(const r of rows){
  const b=document.createElement('button');b.type='button';b.className='vqc-chd-resrow';b.dataset.id=r.id;
  const icon=r.kind==='aborted'?'⚪':(r.studentOk===true?'✅':(r.studentOk===false?'❌':'⚪'));
  const t=(r.playedMs!=null?fmtDur(r.playedMs):'');
  b.innerHTML='<span>'+icon+'</span><span><b>Bài '+esc(r.num)+'</b>'+(teacher?' · '+esc(r.studentName):' · với '+esc(r.teacherName))+'<small>'+esc(r.reason||'')+'</small></span><span class="vqc-chd-resmeta">'+(r.studentColor==='w'?'⚪':'⚫')+' · '+esc(t)+' · '+esc(r.plies)+' nước<small>'+esc(fmtDate(toMs(r.endedAtMs)||0))+'</small></span>';
  b.addEventListener('click',()=>openReview(r.id));
  box.append(b);
 }
}
function render(){
 paintAux();
 const ov=$('vqcChdOverlay');if(!ov||!isOpen)return;
 const teacher=isTeacherUser(),ctl=amController(),st=M?M.status:'none',mine=mySide();
 $('vqcChdTitle').textContent='👩‍🏫 Đấu cờ tàn Chernev — Giáo viên với học sinh';
 $('vqcChdSubtitle').textContent=review?('Xem lại ván · Bài '+review.rec.num+' · '+review.rec.studentName+' với '+review.rec.teacherName):
  (M?('Bài '+M.num+' · '+M.teacherName+' với '+M.studentName):(currentPreview()?currentPreview().teacherName+' đang chọn bài cho ván mới':'Chọn bài rồi mời một học sinh trong lớp'));
 const status=$('vqcChdStatus');
 status.textContent=review?(review.rec.reason||''):statusText();
 status.className='vqc-chd-status'+((M&&M.status==='ended'&&!review)?(M.result&&M.result.studentOk===true?' win':(M.result&&M.result.studentOk===false?' loss':' draw')):'')+(M&&M.status==='paused'?' busy':'')+(corrupt?' error':'')+(M&&M.status==='running'&&mine&&game&&game.turn()===mine&&!review?' mine':'');
 $('vqcChdNotice').textContent=notice;$('vqcChdNotice').hidden=!notice;
 $('vqcChdTabGame').setAttribute('aria-selected',String(tab==='game'));$('vqcChdTabResults').setAttribute('aria-selected',String(tab==='results'));
 $('vqcChdPanelGame').hidden=tab!=='game';$('vqcChdPanelResults').hidden=tab!=='results';
 $('vqcChdReplayBar').hidden=!review;
 if(review){const n=review.rec.moves.length;$('vqcChdReplayLabel').textContent='Nước '+review.ply+'/'+n;}
 paintBoard();paintPromotion();paintHistory();paintPlayers();paintProblem();paintConn();paintSetup();paintVerdict();
 if(tab==='results')paintResults();
 const live=!!M&&LIVE.includes(st)&&!review;
 const show=(id,v)=>{const e=$(id);if(e)e.hidden=!v;};
 show('vqcChdStart',ctl&&st==='ready'&&!review);
 show('vqcChdPause',ctl&&(st==='running'||st==='paused')&&!review);
 $('vqcChdPause').textContent=st==='paused'?'▶ Tiếp tục':'⏸ Tạm dừng';
 show('vqcChdEnd',ctl&&live&&st!=='invited');
 show('vqcChdCancel',ctl&&live&&!(M.moves&&M.moves.length)&&st!=='running'&&st!=='paused'||ctl&&st==='declined');
 show('vqcChdResign',!!mine&&(st==='running'||st==='paused')&&!review);
 $('vqcChdResign').textContent=confirmResign?'❗ Bấm lần nữa để chịu thua':'🏳️ Chịu thua';
 show('vqcChdSwitch',teacher&&!review&&!setupOpen&&(!M||ctl||!LIVE.includes(st)));
 $('vqcChdSwitch').textContent=M&&LIVE.includes(st)?'🔄 Đổi bài / học sinh':'➕ Ván mới';
 show('vqcChdHint',ctl&&!review&&!!game);
 $('vqcChdHint').disabled=hintBusy;
 $('vqcChdHint').textContent=hintBusy?(engineState==='loading'?'⏳ Đang tải Stockfish…':'⏳ Máy đang phân tích…'):'💡 Máy đánh giá thế cờ (gợi ý cho giáo viên)';
 const box=$('vqcChdEval');
 if(hint&&ctl&&!review&&game&&hint.fen===game.fen()){
  box.hidden=false;
  $('vqcChdHintText').textContent='💡 Máy gợi ý (chỉ để tham khảo): '+(PIECE[hint.piece]||'quân')+' '+hint.from+' → '+hint.to+' ('+hint.san+')';
  $('vqcChdEvalText').textContent=evalText(hint.ev);$('vqcChdEvalFill').style.width=evalShare(hint.ev)+'%';$('vqcChdEvalBar').hidden=!hint.ev;
 }else box.hidden=true;
 show('vqcChdToMachine',teacher&&(!M||!LIVE.includes(st))&&!review);
 {const lockClose=!isTeacherUser()&&!M&&!!currentPreview();$('vqcChdClose').hidden=lockClose;$('vqcChdClose').title='';}
}
function ensureAux(){
 if(!$('vqcChdInviteBox')){
  const d=document.createElement('div');d.id='vqcChdInviteBox';d.setAttribute('role','alertdialog');d.setAttribute('aria-labelledby','vqcChdInviteTitle');d.hidden=true;
  d.innerHTML='<div class="vqc-chd-invite-card"><h3 id="vqcChdInviteTitle">👩‍🏫 Lời mời đấu cờ tàn</h3><p id="vqcChdInviteText"></p><div class="vqc-chd-invite-btns"><button type="button" id="vqcChdAccept">✅ Chấp nhận</button><button type="button" id="vqcChdDecline">Từ chối</button></div></div>';
  document.body.append(d);
  $('vqcChdAccept').addEventListener('click',async()=>{const r=await respond(true);if(r&&r.match){userClosed.delete(M&&M.id);open({auto:true});}});
  $('vqcChdDecline').addEventListener('click',()=>respond(false));
 }
 if(!$('vqcChdChip')){
  const c=document.createElement('button');c.type='button';c.id='vqcChdChip';c.hidden=true;
  c.addEventListener('click',()=>{if(M)userClosed.delete(M.id);open({});});document.body.append(c);
 }
 if(!$('vqcChdChooser')){
  const d=document.createElement('div');d.id='vqcChdChooser';d.setAttribute('role','dialog');d.setAttribute('aria-labelledby','vqcChdChooserTitle');d.hidden=true;
  d.innerHTML='<div class="vqc-chd-invite-card vqc-chd-chooser-card"><h3 id="vqcChdChooserTitle">♚ Đấu cờ tàn Chernev</h3><p>Em muốn đấu với ai?</p>'+
   '<button type="button" id="vqcChdPickMachine"><b>1. Đấu với máy</b><small>Máy Stockfish cầm Đen, em cầm Trắng — mỗi bạn tự chơi trên máy mình.</small></button>'+
   '<button type="button" id="vqcChdPickTeacher"><b>2. Đấu với giáo viên</b><small>Giáo viên chọn bài và mời một học sinh trong lớp; hai bên đi quân và xem đồng hồ cùng lúc.</small></button>'+
   '<button type="button" id="vqcChdPickCancel" class="vqc-chd-chooser-x">Đóng</button></div>';
  document.body.append(d);
  d.addEventListener('click',e=>{if(e.target===d)d.hidden=true;});
  $('vqcChdPickCancel').addEventListener('click',()=>{d.hidden=true;});
  $('vqcChdPickMachine').addEventListener('click',()=>{d.hidden=true;if(window.vqcVsMachine&&window.vqcVsMachine.open)window.vqcVsMachine.open({kind:'chernev'});else notify('Chế độ đấu với máy chưa được tải.');});
  $('vqcChdPickTeacher').addEventListener('click',()=>{d.hidden=true;open({});});
 }
}
function paintInvite(){
 ensureAux();
 const d=$('vqcChdInviteBox');if(!d)return;
 const show=!!M&&M.status==='invited'&&M.studentId===myUid()&&!isTeacherUser();
 d.hidden=!show;
 if(show){
  $('vqcChdInviteText').innerHTML=esc(M.teacherName)+' mời em đấu <b>bài cờ tàn số '+M.num+'</b> ('+esc(SIDE[M.goalSide]+' đi '+(M.goal==='draw'?'hòa':'thắng'))+'). Em cầm <b>'+(M.studentColor==='w'?'⚪ Trắng':'⚫ Đen')+'</b>. '+(M.limit?'Mỗi bên có '+Math.round(M.limit/60000*10)/10+' phút.':'Không giới hạn thời gian.');
  const k=M.id;if(inviteKey!==k){inviteKey=k;notify('Giáo viên mời em đấu cờ tàn (bài '+M.num+').','info');}
 }
}
function paintChip(){
 ensureAux();
 const c=$('vqcChdChip');if(!c)return;
 const pv=null;
 const showM=!isOpen&&!!M&&roomOn()&&((amParticipant()&&(M.status==='ready'||M.status==='running'||M.status==='paused'))||(M.status==='running'&&!isTeacherUser()));
 const show=showM||!!pv;
 c.hidden=!show;
 if(pv){c.className='';c.textContent='👀 '+pv.teacherName+' đang chọn thế cờ — bấm để xem cùng';return;}
 if(show){
  const myTurn=M.status==='running'&&game&&mySide()&&game.turn()===mySide();
  c.className=myTurn?'turn':'';
  c.textContent=myTurn?'♟ Đến lượt em! Mở ván đấu cờ tàn':'♟ Ván đấu cờ tàn — mở lại';
 }
}
function paintAux(){paintInvite();paintChip();}

const OVERLAY_HTML=`<div id="vqcChdOverlay" role="dialog" aria-modal="true" aria-labelledby="vqcChdTitle">
 <div class="vqc-chd-dialog">
  <div class="vqc-chd-top">
   <div><h2 id="vqcChdTitle">👩‍🏫 Đấu cờ tàn Chernev — Giáo viên với học sinh</h2><p id="vqcChdSubtitle"></p></div>
   <div class="vqc-chd-topbtns"><button type="button" id="vqcChdToMachine">🤖 Đấu với máy</button><button type="button" id="vqcChdClose" aria-label="Đóng">✕ Đóng</button></div>
  </div>
  <div class="vqc-chd-layout">
   <div class="vqc-chd-boardcol">
    <div class="vqc-chd-player" id="vqcChdTop"><span class="vqc-chd-avatar"></span><span class="vqc-chd-pname"></span><span class="vqc-chd-pside"></span><span class="vqc-chd-turn"></span><span class="vqc-chd-clock" aria-live="off"></span></div>
    <div class="vqc-chd-boardwrap">
     <div id="vqcChdBoard" class="vqc-chd-board" aria-label="Bàn cờ đấu giáo viên – học sinh"></div>
     <div id="vqcChdPromo" class="vqc-chd-promo" hidden></div>
    </div>
    <div class="vqc-chd-player" id="vqcChdBottom"><span class="vqc-chd-avatar"></span><span class="vqc-chd-pname"></span><span class="vqc-chd-pside"></span><span class="vqc-chd-turn"></span><span class="vqc-chd-clock" aria-live="off"></span></div>
    <div id="vqcChdReplayBar" class="vqc-chd-replaybar" hidden>
     <button type="button" data-step="-Infinity" aria-label="Về đầu">⏮</button><button type="button" data-step="-1" aria-label="Lùi một nước">◀</button>
     <span id="vqcChdReplayLabel"></span>
     <button type="button" data-step="1" aria-label="Tiến một nước">▶</button><button type="button" data-step="Infinity" aria-label="Đến cuối">⏭</button>
     <button type="button" id="vqcChdReplayExit">✕ Thoát xem lại</button>
    </div>
   </div>
   <section class="vqc-chd-side">
    <div class="vqc-chd-tabs" role="tablist">
     <button type="button" role="tab" id="vqcChdTabGame" aria-selected="true">♟ Ván đấu</button>
     <button type="button" role="tab" id="vqcChdTabResults" aria-selected="false">📚 Kết quả đã lưu</button>
    </div>
    <p id="vqcChdStatus" class="vqc-chd-status" role="status" aria-live="polite"></p>
    <p id="vqcChdNotice" class="vqc-chd-notice" role="status" aria-live="polite" hidden></p>
    <div id="vqcChdPanelGame" class="vqc-chd-panel">
     <div id="vqcChdProblem" class="vqc-chd-problem" hidden></div>
     <p id="vqcChdConn" class="vqc-chd-conn" hidden></p>
     <div class="vqc-chd-controls">
      <button type="button" id="vqcChdStart" hidden>▶ Bắt đầu</button>
      <button type="button" id="vqcChdPause" hidden>⏸ Tạm dừng</button>
      <button type="button" id="vqcChdEnd" hidden>⏹ Kết thúc ván</button>
      <button type="button" id="vqcChdResign" hidden>🏳️ Chịu thua</button>
      <button type="button" id="vqcChdCancel" hidden>✖ Hủy lời mời / ván</button>
      <button type="button" id="vqcChdSwitch" hidden>🔄 Đổi bài / học sinh</button>
      <button type="button" id="vqcChdHint" hidden>💡 Máy đánh giá thế cờ (gợi ý cho giáo viên)</button>
     </div>
     <div id="vqcChdVerdict" class="vqc-chd-verdict" hidden>
      <h3>Xác nhận kết quả ván</h3>
      <p id="vqcChdVerdictGoal"></p><p id="vqcChdVerdictEval" class="vqc-chd-verdict-eval"></p>
      <label for="vqcChdNote">Ghi chú (không bắt buộc)</label><input id="vqcChdNote" type="text" maxlength="200" placeholder="Nhận xét ngắn về ván đấu">
      <div class="vqc-chd-verdict-btns">
       <button type="button" data-verdict="met">✅ Đạt mục tiêu</button>
       <button type="button" data-verdict="notmet">❌ Chưa đạt mục tiêu</button>
       <button type="button" data-verdict="draw">🤝 Ván hòa</button>
       <button type="button" data-verdict="void">🚫 Hủy ván (không tính)</button>
       <button type="button" data-verdict="back">↩ Quay lại ván</button>
      </div>
     </div>
     <div id="vqcChdEval" class="vqc-chd-eval" hidden>
      <p id="vqcChdHintText"></p>
      <div id="vqcChdEvalBar" class="vqc-chd-evalbar" aria-hidden="true"><span id="vqcChdEvalFill"></span></div>
      <p id="vqcChdEvalText" class="vqc-chd-evaltext"></p>
     </div>
     <div class="vqc-chd-histwrap"><h3>📜 Các nước đã đi</h3><div id="vqcChdHistory" class="vqc-chd-history"></div></div>
     <fieldset id="vqcChdSetup" class="vqc-chd-setup" hidden>
      <legend>⚙️ Tạo ván đấu</legend>
      <p id="vqcChdLockNote" class="vqc-chd-small vqc-chd-lock" hidden>🔒 Giáo viên đang chọn — máy em hiện cùng bảng điều khiển nhưng các nút đã bị khóa, em chỉ xem.</p>
      <label for="vqcChdStudent">Học sinh trong lớp <button type="button" id="vqcChdRefresh" aria-label="Tải lại danh sách">↻</button></label>
      <select id="vqcChdStudent"></select><p id="vqcChdRosterErr" class="vqc-chd-small" hidden></p>
      <div class="vqc-chd-chips" role="group" aria-label="Cách chọn bài">
       <button type="button" data-pick="number" aria-pressed="true">Chọn số bài</button>
       <button type="button" data-pick="range" aria-pressed="false">Theo khoảng</button>
       <button type="button" data-pick="random" aria-pressed="false">🎲 Ngẫu nhiên</button>
      </div>
      <div id="vqcChdNumRow" class="vqc-chd-chrow">
       <button type="button" id="vqcChdPrev" aria-label="Bài trước">←</button><label for="vqcChdNum">Bài</label><input id="vqcChdNum" type="number" min="1" max="300" value="1" inputmode="numeric"><button type="button" id="vqcChdNext" aria-label="Bài sau">→</button>
      </div>
      <div id="vqcChdRangeRow" class="vqc-chd-chrow" hidden>
       <label for="vqcChdFrom">Từ bài</label><input id="vqcChdFrom" type="number" min="1" max="300" value="1" inputmode="numeric">
       <label for="vqcChdTo">đến</label><input id="vqcChdTo" type="number" min="1" max="300" value="300" inputmode="numeric">
      </div>
      <select id="vqcChdSection" aria-label="Chọn nhóm bài"></select>
      <p id="vqcChdProbInfo" class="vqc-chd-small"></p>
      <label>Màu quân của học sinh</label>
      <div class="vqc-chd-chips" role="group" aria-label="Màu quân của học sinh">
       <button type="button" data-dcolor="w" aria-pressed="true">⚪ Trắng</button>
       <button type="button" data-dcolor="b" aria-pressed="false">⚫ Đen</button>
       <button type="button" data-dcolor="random" aria-pressed="false">🎲 Ngẫu nhiên</button>
      </div>
      <p id="vqcChdColorInfo" class="vqc-chd-small"></p>
      <label>Thời gian mỗi bên</label>
      <div class="vqc-chd-chips five" role="group" aria-label="Thời gian">
       <button type="button" data-dtime="0" aria-pressed="false">Không giới hạn</button>
       <button type="button" data-dtime="3" aria-pressed="false">3 phút</button>
       <button type="button" data-dtime="5" aria-pressed="true">5 phút</button>
       <button type="button" data-dtime="10" aria-pressed="false">10 phút</button>
       <button type="button" data-dtime="15" aria-pressed="false">15 phút</button>
       <button type="button" data-dtime="custom" aria-pressed="false">Tùy chỉnh</button>
      </div>
      <div id="vqcChdCustomRow" class="vqc-chd-chrow" hidden><label for="vqcChdCustom">Số phút mỗi bên</label><input id="vqcChdCustom" type="number" min="1" max="180" value="5" inputmode="numeric"></div>
      <button type="button" id="vqcChdSend" class="vqc-chd-send">📨 Gửi lời mời</button>
     </fieldset>
    </div>
    <div id="vqcChdPanelResults" class="vqc-chd-panel" hidden>
     <select id="vqcChdResFilter" aria-label="Lọc theo học sinh" hidden></select>
     <p id="vqcChdResStats" class="vqc-chd-small"></p>
     <p id="vqcChdResErr" class="vqc-chd-small" hidden></p>
     <div id="vqcChdResults" class="vqc-chd-results"></div>
     <p class="vqc-chd-small">Bấm vào một ván để xem lại từng nước. Mỗi ván được lưu riêng, ván làm lại không ghi đè ván cũ.</p>
    </div>
   </section>
  </div>
 </div>
</div>`;
function mountDom(){
 if(!$('vqcChdCss')){
  const link=document.createElement('link');link.id='vqcChdCss';link.rel='stylesheet';link.href='./css/chernev-duel.css?v='+VERSION;document.head.append(link);
 }
 if(!$('vqcChdOverlay')){
  const holder=document.createElement('div');holder.innerHTML=OVERLAY_HTML.trim();document.body.append(holder.firstElementChild);
 }
 ensureAux();
 let anchor=$('vsMachineMenu')||$('vsChernevMenu')||$('mate3PdfMenu')||document.querySelector('.lesson');
 if(!$('vsDuelMenu')){
  const item=document.createElement('div');
  item.className='lesson';item.id='vsDuelMenu';item.setAttribute('role','button');item.tabIndex=0;
  item.innerHTML='<div class="lesson-icon">👩‍🏫</div> Đấu cờ tàn Chernev (GV – HS)';
  const launch=()=>openChooser();
  item.addEventListener('click',launch);
  item.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();launch();}});
  if(anchor)anchor.insertAdjacentElement('afterend',item);
 }
}
function openChooser(){
 ensureAux();
 if(!roomOn()){notify('Hãy vào phòng lớp học trước khi chọn chế độ đấu cờ tàn.');return;}
 $('vqcChdChooser').hidden=false;$('vqcChdPickTeacher').focus();
}
function open(opts){
 opts=opts||{};
 const wasOpen=isOpen;
 if(typeof Chess!=='function'){notify('Chưa thể mở: thư viện luật cờ vua chưa được tải.');return;}
 if(!roomOn()){notify('Hãy vào phòng lớp học trước khi đấu cờ tàn với giáo viên.');return;}
 if(!isTeacherUser()&&!opts.auto&&!opts.pv&&!M&&!currentPreview()){notify('Giáo viên sẽ mở bảng đấu cho cả lớp — em chờ nhé!','info');return;}
 const el=$('vqcChdOverlay');if(!el)return;
 if(typeof window.vqcCloseOtherViews==='function')window.vqcCloseOtherViews('vsduel');
 const ch=$('vqcChdChooser');if(ch)ch.hidden=true;
 if(el.parentElement!==document.body)document.body.append(el);
 el.classList.add('open');isOpen=true;
 if(M)userClosed.delete(M.id);
 tab='game';review=null;
 setupOpen=!M||!LIVE.includes(M.status)||M.status==='declined';
 if(isTeacherUser())loadRoster(true);
 fillSections($('vqcChdSection'));
 syncClock();flushOutbox();
 pvAuto=!!opts.pv&&!isTeacherUser();
 render();paintChip();
 if(!wasOpen)announceDuel();
}
function hideOverlay(byPreview){
 if(!isOpen)return;
 if(!byPreview&&!isTeacherUser()){const pv=currentPreview();if(pv)pvSuppress=pvSigOf(pv.raw);}
 pvAuto=false;duelAnnounced=false;
 isOpen=false;hintEpoch++;hintBusy=false;disposeEngine();clearPending();promotion=null;selected=null;
 $('vqcChdOverlay')?.classList.remove('open');
 paintChip();
}
function close(){
 if(!isTeacherUser()&&!M&&currentPreview()){notify('Giáo viên đang chọn thế cờ — em chưa đóng cửa sổ này được.','info');return;}
 const id=M&&M.id,announced=duelAnnounced;
 hideOverlay();
 if(id&&M&&LIVE.includes(M.status))userClosed.add(id);
 if(announced&&isTeacherUser()&&!M&&roomOn()&&typeof vqcBroadcastView==='function'){try{vqcBroadcastView('board');}catch(e){}}
 paintChip();
}
function fillSections(sel){
 if(sel&&!sel.options.length){
  const o0=document.createElement('option');o0.value='';o0.textContent='Chọn nhóm bài (nhảy nhanh)';sel.append(o0);
  if(Array.isArray(window.VQC_CHERNEV_SECTIONS))window.VQC_CHERNEV_SECTIONS.forEach(x=>{const o=document.createElement('option');o.value=String(x.from);o.textContent=x.name+' (bài '+x.from+'–'+x.to+')';sel.append(o);});
 }
}
function state(){
 const now=sNow(),clocks={};
 for(const s of ['w','b'])clocks[s]=M?(M.limit?M.limit-usedMs(M,s,now):usedMs(M,s,now)):null;
 return {
  open:isOpen,tab,review:review?{num:review.rec.num,ply:review.ply}:null,corrupt,pending:!!pending,notice,
  match:M?{id:M.id,seq:M.seq,status:M.status,num:M.num,fen0:M.fen0,fen:M.fen,turn:game?game.turn():null,moves:M.moves.slice(),sans:M.sans.slice(),limit:M.limit,used:{...M.used},run:M.run,anchorMs:M.anchorMs,
   studentId:M.studentId,studentName:M.studentName,teacherId:M.teacherId,studentColor:M.studentColor,teacherColor:M.teacherColor,goal:M.goal,goalSide:M.goalSide,result:M.result?{...M.result}:null,last:M.last}:null,
  gameFen:game?game.fen():null,boardFen:(g=>g?g.fen():null)(displayGame()),
  preview:(pv=>pv?{pick:pv.pick,num:pv.num,fen:pv.fen,color:pv.color,limitMin:pv.limitMin,studentId:pv.studentId,teacherName:pv.teacherName}:null)(currentPreview()),mySide:mySide(),canMove:canMove(),controller:amController(),clocks,offset:offset(),
  status:$('vqcChdStatus')?$('vqcChdStatus').textContent:'',setupOpen,roster:roster.length,
  inviteVisible:!!$('vqcChdInviteBox')&&!$('vqcChdInviteBox').hidden,chipVisible:!!$('vqcChdChip')&&!$('vqcChdChip').hidden,
  hint:hint?{from:hint.from,to:hint.to,san:hint.san}:null,presence:Object.keys(presence),
  clockTexts:[...document.querySelectorAll('#vqcChdOverlay .vqc-chd-clock')].map(e=>({side:e.dataset.side,text:e.textContent,low:e.classList.contains('low'),run:e.classList.contains('run')}))
 };
}

let tickN=0;
function tick(){
 if(!roomOn()){if(M||isOpen||lastRoomKey)resetAll();return;}
 if(roomKey()!==lastRoomKey){lastRoomKey=roomKey();roomSeen=false;resetMatch();ensureListener();}
 ensureListener();
 beat(false);
 pvTick();pvRefreshView();
 if(M&&M.status==='running')syncClock();
 if(isOpen&&M)paintClocks();
 if(isOpen&&(++tickN%4===0)){paintConn();paintStudents();}
 if(M&&M.status==='running'&&M.limit&&M.run&&amParticipant()){
  const rem=M.limit-usedMs(M,M.run,sNow());
  if(rem<=0){
   const key=M.id+':'+M.seq,t=Date.now();
   if(flagKey!==key){flagKey=key;flagSeen=t;flagAt=0;}
   const wait=amController()?0:1500;
   if(t-flagSeen>=wait&&t-flagAt>4000){flagAt=t;flagMatch();}
  }
 }
 if(isTeacherUser()&&Math.random()<0.02)flushOutbox();
}
function ensureListener(){
 if(!roomOn())return;
 if(!wrappedAck&&listenRef!==roomRef){
  if(listenOff){try{listenOff();}catch(e){}listenOff=null;}
  listenRef=roomRef;
  try{listenOff=roomRef.onSnapshot(s=>{if(s.exists)onRoomData(s.data());});}catch(e){listenRef=null;}
 }
 const key=matchPath();
 if(key&&mListenKey!==key&&Date.now()>=mRetryAt){
  if(mListenOff){try{mListenOff();}catch(e){}mListenOff=null;}
  mListenKey=key;
  try{
   mListenOff=matchRef().onSnapshot(s=>{if(matchPath()!==key)return;onMatchData(s&&s.exists?s.data():null);},err=>{
    if(matchPath()!==key)return;
    mListenKey='';mRetryAt=Date.now()+5000;
    mListenErr=(err&&err.code==='permission-denied')?'Firestore không cho đọc ván đấu (kiểm tra Rules của phòng lớp).':'Mất kết nối tới ván đấu — đang thử lại…';
    console.warn('Đấu cờ tàn: lỗi trình nghe ván',err);
    if(isOpen){notice=mListenErr;render();}
   });
  }catch(e){mListenKey='';mRetryAt=Date.now()+5000;}
 }
}
function hookClassroom(){
 const closeOthers=window.vqcCloseOtherViews;
 if(typeof closeOthers==='function'&&!closeOthers.vqcChdWrapped){
  const wrapped=function(target){const r=closeOthers.apply(this,arguments);if(target!=='vsduel')hideOverlay();return r;};
  for(const k of Object.keys(closeOthers))wrapped[k]=closeOthers[k];
  wrapped.vqcChdWrapped=true;window.vqcCloseOtherViews=wrapped;
 }
 const f=window.vqcDisplayTeacherViewAck;
 if(typeof f==='function'&&!f.vqcChdWrapped){
  const w=function(data){try{onRoomData(data);}catch(e){console.warn('Đấu cờ tàn:',e);}return f.apply(this,arguments);};
  for(const k of Object.keys(f))w[k]=f[k];
  w.vqcChdWrapped=true;window.vqcDisplayTeacherViewAck=w;wrappedAck=true;
 }else if(f&&f.vqcChdWrapped)wrappedAck=true;
}
function injectMachineLink(){
 const close=$('vqcVsmClose');
 if(!close)return;
 const teacher=isTeacherUser();
 let b=$('vqcVsmToDuel');
 if(!b){
  if(!teacher)return;
  b=document.createElement('button');b.type='button';b.id='vqcVsmToDuel';b.textContent='👩‍🏫 Đấu với giáo viên';
  b.style.marginRight='8px';
  b.addEventListener('click',()=>{
   if(!isTeacherUser()){notify('Giáo viên sẽ mở bảng đấu cho cả lớp — em chờ nhé!','info');return;}
   if(window.vqcVsMachine&&window.vqcVsMachine.hide)window.vqcVsMachine.hide();
   if(!roomOn()){notify('Hãy vào phòng lớp học trước.');return;}
   open({});
  });
  close.insertAdjacentElement('beforebegin',b);
 }
 b.hidden=!teacher;b.style.display=teacher?'':'none';
}
function init(){
 mountDom();
 const $$=(id,ev,fn)=>$(id)&&$(id).addEventListener(ev,fn);
 $$('vqcChdClose','click',close);
 $$('vqcChdOverlay','click',e=>{if(e.target===$('vqcChdOverlay'))close();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&isOpen&&!promotion&&!verdictOpen)close();});
 $$('vqcChdToMachine','click',()=>{hideOverlay();if(window.vqcVsMachine&&window.vqcVsMachine.open)window.vqcVsMachine.open({kind:'chernev'});});
 $$('vqcChdTabGame','click',()=>{tab='game';render();});
 $$('vqcChdTabResults','click',()=>{tab='results';review=null;loadRemote(true);flushOutbox();render();});
 $$('vqcChdResFilter','change',()=>render());
 $$('vqcChdStart','click',()=>startMatch());
 $$('vqcChdPause','click',()=>{if(M&&M.status==='paused')resumeMatch();else pauseMatch();});
 $$('vqcChdEnd','click',()=>{verdictOpen=true;render();});
 $$('vqcChdCancel','click',()=>cancelMatch());
 $$('vqcChdSwitch','click',()=>{setupOpen=true;loadRoster(false);render();});
 $$('vqcChdHint','click',analyze);
 $$('vqcChdResign','click',()=>{
  if(!confirmResign){confirmResign=true;clearTimeout(confirmTimer);confirmTimer=setTimeout(()=>{confirmResign=false;render();},4000);render();return;}
  clearTimeout(confirmTimer);confirmResign=false;resignMatch();
 });
 document.querySelectorAll('#vqcChdVerdict [data-verdict]').forEach(b=>b.addEventListener('click',async()=>{
  const v=b.dataset.verdict;
  if(v==='back'){verdictOpen=false;render();return;}
  const note=($('vqcChdNote').value||'').trim().slice(0,200);
  const r=await endMatch(v,note);
  if(r&&r.match){verdictOpen=false;$('vqcChdNote').value='';}
 }));
 document.querySelectorAll('#vqcChdReplayBar [data-step]').forEach(b=>b.addEventListener('click',()=>reviewStep(Number(b.dataset.step))));
 $$('vqcChdReplayExit','click',closeReview);
 document.querySelectorAll('#vqcChdOverlay [data-pick]').forEach(b=>b.addEventListener('click',()=>{settings.pick=b.dataset.pick;render();}));
 document.querySelectorAll('#vqcChdOverlay [data-dcolor]').forEach(b=>b.addEventListener('click',()=>{settings.color=b.dataset.dcolor;render();}));
 document.querySelectorAll('#vqcChdOverlay [data-dtime]').forEach(b=>b.addEventListener('click',()=>{settings.time=b.dataset.dtime;render();}));
 const clampN=v=>{const n=parseInt(v,10);const max=Math.max(1,problems().length||300);return isNaN(n)?1:Math.max(1,Math.min(max,n));};
 $$('vqcChdNum','change',e=>{settings.num=clampN(e.target.value);render();});
 $$('vqcChdFrom','change',e=>{settings.from=clampN(e.target.value);settings.num=Math.max(settings.num,Math.min(settings.from,settings.to));render();});
 $$('vqcChdTo','change',e=>{settings.to=clampN(e.target.value);render();});
 $$('vqcChdCustom','change',e=>{const n=parseInt(e.target.value,10);settings.custom=isNaN(n)?5:Math.max(1,Math.min(180,n));render();});
 $$('vqcChdPrev','click',()=>{const len=Math.max(1,problems().length||300);settings.num=((settings.num-2+len)%len)+1;render();});
 $$('vqcChdNext','click',()=>{const len=Math.max(1,problems().length||300);settings.num=(settings.num%len)+1;render();});
 $$('vqcChdSection','change',e=>{const v=parseInt(e.target.value,10);if(!isNaN(v)){settings.num=v;const sec=sectionOf(v);settings.from=sec?sec.from:v;settings.to=sec?sec.to:v;}render();});
 $$('vqcChdStudent','change',e=>{settings.studentId=e.target.value;render();});
 $$('vqcChdRefresh','click',()=>loadRoster(true));
 $$('vqcChdSend','click',send);
 const ov=$('vqcChdOverlay');
 if(ov&&typeof MutationObserver==='function')new MutationObserver(()=>{if(isOpen&&!ov.classList.contains('open'))hideOverlay();}).observe(ov,{attributes:true,attributeFilter:['class']});
 window.addEventListener('pagehide',()=>{disposeEngine();});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){offCache.t=0;beat(true);if(isOpen)render();}});
 hookClassroom();injectMachineLink();
 window.addEventListener('vqc:account-change',()=>{try{injectMachineLink();}catch(e){}});
 setInterval(tick,500);
 setInterval(()=>{injectMachineLink();hookClassroom();},3000);
}
window.vqcDuel={open,close,hide:hideOverlay,openChooser,state,problems,createMatch,respond,startMatch,pauseMatch,resumeMatch,endMatch,resignMatch,cancelMatch,analyze,
 judge,version:VERSION,proto:PROTO,_matchPath:matchPath,_serverNow:sNow,_flush:flushOutbox,_reload:()=>loadRemote(true),
 _move:(from,to,promo,side,ply)=>moveTx(M.id,ply==null?M.moves.length:ply,from,to,promo,side),_flag:flagMatch,_resetProblems:()=>{probCache=null;}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
