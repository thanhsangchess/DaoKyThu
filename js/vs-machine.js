(function(){
'use strict';
const $=id=>document.getElementById(id);
const VERSION='20261124-vsm-v3';
const FILES='abcdefgh';
const START_FEN='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const LEVELS=[
 {id:'max',label:'Mạnh nhất',skill:20,movetime:1500},
 {id:'hard',label:'Khó',skill:14,movetime:800},
 {id:'mid',label:'Vừa',skill:8,movetime:500},
 {id:'easy',label:'Dễ',skill:3,movetime:300}
];
const SIDE={w:'Trắng',b:'Đen'};
const PIECE={k:'Vua',q:'Hậu',r:'Xe',b:'Tượng',n:'Mã',p:'Tốt'};
const MIN_PLIES_FOR_DRAW=20;
const DRAW_ACCEPT_CP=25;
const UCI_RE=/^[a-h][1-8][a-h][1-8][qrbn]?$/;
const SQ_RE=/^[a-h][1-8]$/;
const PROTO=1,BOARD_ID='vqcVsmBoard';
const MAX_MOVES=1000;
const RESUME_MS=3*3600*1000;
const PENDING_MS=7000;
const STALE_MS=30000;
const SETUP_DEBOUNCE=400;
const INTENT_WAIT=3500;
const MARK_COLORS=['green','red','blue','yellow'];
const MAX_USER_MARKS=36;

let isOpen=false,game=null,human='w',startFen=START_FEN,level=LEVELS[0];
let preset={kind:'standard'};
let settings={color:'w',levelId:'max',kind:'standard',chernev:0};
let selected=null,lastMove=null,over=null,promotion=null,hint=null,notice='',error=null;
let engine=null,engineState='idle',thinking=false,analysing=false,drawBusy=false;
let gameEpoch=0,searchEpoch=0,analysisEpoch=0,gameReady=Promise.resolve();
let confirmResign=false,confirmTimer=null,savedFor='',chernevCache=null,viewStamp='',broadcastKey='';
const doneChernev=new Set();
let sharedActive=false,sCode='',lOff=null,lCode='',lRetry=null,lErr='';
let D=null,V=null,cFen='',cTurn='w',cPly=0,lastPly=-1,corrupt=false;
let pending=null,pendingTimer=null,auxBusy=null,auxNotice='';
let intent=null,intentTimer=null,gotFirst=false,noticeKeep=null,clearSeenFor='',clearSeen='';
let staleTimer=null,staleKey='',staleWarn=false,searchKey='',engineSent='',overHandled='',marksSeeded='',adapterOn=false,setupTimer=null,txBusy=0;

function roomOn(){return typeof roomRef!=='undefined'&&!!roomRef;}
function roomCode(){try{return roomRef?String(roomRef.id||String(roomRef.path||'').split('/').pop()||''):'';}catch(e){return '';}}
function myUid(){try{if(typeof auth!=='undefined'&&auth&&auth.currentUser&&auth.currentUser.uid)return auth.currentUser.uid;}catch(e){}return (window.accountProfile&&window.accountProfile.uid)||'';}
function myName(){const p=window.accountProfile;return (p&&(p.name||p.code))?String(p.name||p.code):(isStudent()?'Học sinh':'Giáo viên');}
function isStudent(){return roomOn()&&(typeof role!=='undefined'?role:window.accountProfile&&window.accountProfile.role)==='student';}
function isTeacherInRoom(){return roomOn()&&!isStudent();}
function sharedOn(){return roomOn()&&!!roomCode()&&!!myUid()&&typeof db!=='undefined'&&!!db&&typeof db.collection==='function'&&typeof firebase!=='undefined';}
function shared(){return sharedActive;}
function isHost(){return sharedActive&&isTeacherInRoom()&&(!V||V.teacherId===myUid());}
function locked(){return sharedActive?!isHost():isStudent();}
function lockCtl(){return sharedActive&&!isHost();}
function notify(text){if(typeof vqcNotify==='function')vqcNotify(text,'warning');}
function toMs(v){return v&&typeof v.toMillis==='function'?v.toMillis():(typeof v==='number'&&isFinite(v)?v:null);}
function SV(){return firebase.firestore.FieldValue.serverTimestamp();}
function vsmRef(){const c=sCode||roomCode();return c&&typeof db!=='undefined'&&db?db.collection('rooms').doc(c+'-vsm'):null;}
function playerName(){const p=window.accountProfile;return (p&&p.name)?String(p.name):'Em';}
function otherSide(c){return c==='w'?'b':'w';}
function curFen(){return sharedActive?cFen:(game?game.fen():'');}
function curTurn(){return sharedActive?cTurn:(game?game.turn():'w');}
function broadcast(){
 if(!isTeacherInRoom()||typeof vqcBroadcastView!=='function')return;
 if(typeof vqcNavApplying!=='undefined'&&vqcNavApplying)return;
 let key,idx;
 if(sharedActive){idx=settings.kind==='chernev'?settings.chernev:-1;key='shared';}
 else{if(preset.kind!=='chernev')return;idx=preset.index;key=String(idx);}
 if(broadcastKey===key)return;
 broadcastKey=key;
 try{vqcBroadcastView('vsmachine',idx);}catch(e){console.warn('Không phát được bài cho lớp',e);}
}

function chernev(){
 if(chernevCache)return chernevCache;
 const src=window.VQC_CHERNEV;
 if(!Array.isArray(src)||!src.length||typeof Chess!=='function'){chernevCache=[];return chernevCache;}
 const list=[];
 for(let i=0;i<src.length;i++){
  const parts=String(src[i]).split(' ');
  if(parts.length!==2||parts[1]!=='w')continue;
  const fen=parts[0]+' w - - 0 1',probe=new Chess();
  if(!probe.load(fen)||probe.fen().split(' ')[0]!==parts[0])continue;
  list.push({num:i+1,fen});
 }
 chernevCache=list;return list;
}
function sectionOf(num){
 const secs=window.VQC_CHERNEV_SECTIONS;
 if(!Array.isArray(secs))return null;
 return secs.find(x=>num>=x.from&&num<=x.to)||null;
}
function clampIdx(i){const n=chernev().length;return n?Math.max(0,Math.min(n-1,i|0)):0;}
function progressKey(){return 'vqc-vsm-chernev-done-'+((window.accountProfile&&(window.accountProfile.uid||window.accountProfile.id))||'guest');}
function restoreProgress(){
 const key=progressKey();if(savedFor===key)return;savedFor=key;doneChernev.clear();
 try{const v=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(v))v.filter(n=>Number.isInteger(n)&&n>=1&&n<=1000).forEach(n=>doneChernev.add(n));}catch(e){}
}
function persistProgress(){try{localStorage.setItem(progressKey(),JSON.stringify([...doneChernev]));}catch(e){}}
function doneCount(){const n=chernev().length;return [...doneChernev].filter(x=>x<=n).length;}
function loadPrefs(){
 try{
  const p=JSON.parse(localStorage.getItem('vqc-vsm-prefs')||'{}');
  if(p&&['w','b','random'].includes(p.color))settings.color=p.color;
  if(p&&LEVELS.some(l=>l.id===p.levelId))settings.levelId=p.levelId;
  if(p&&Number.isInteger(p.chernev)&&p.chernev>=0&&p.chernev<1000)settings.chernev=p.chernev;
 }catch(e){}
}
function savePrefs(){try{localStorage.setItem('vqc-vsm-prefs',JSON.stringify({color:settings.color,levelId:settings.levelId,chernev:settings.chernev}));}catch(e){}}

function ensureEngine(){
 if(engine)return engine;
 if(!window.VqcStockfish)throw new Error('Chưa tải được mô-đun động cơ Stockfish.');
 engine=window.VqcStockfish.create({onStatus:(s)=>{if(s==='loading'){engineState='loading';render();}}});
 engineState='idle';
 return engine;
}
function disposeEngine(){
 const e=engine;engine=null;engineState='idle';
 if(e){try{e.dispose();}catch(x){}}
}
function cancelAll(){
 searchEpoch++;analysisEpoch++;
 thinking=false;analysing=false;drawBusy=false;
 if(engine){try{engine.cancel();}catch(e){}}
}
function cancelAnalysis(){
 if(!analysing&&!drawBusy)return;
 analysisEpoch++;analysing=false;drawBusy=false;
 if(engine){try{engine.cancel();}catch(e){}}
 if(sharedActive&&isHost()&&V&&V.aux)pushAux(null);
}
function parseUci(mv){
 if(typeof mv!=='string'||!UCI_RE.test(mv))return null;
 return {from:mv.slice(0,2),to:mv.slice(2,4),promotion:mv[4]||undefined};
}
function findLegal(g,uci){
 const p=parseUci(uci);if(!p)return null;
 return g.moves({verbose:true}).find(m=>m.from===p.from&&m.to===p.to&&(m.promotion||undefined)===p.promotion)||null;
}
function uciOf(m){return m.from+m.to+(m.promotion||'');}
function engineErrorText(err){
 const c=err&&err.code;
 if(c==='bad-move')return 'Máy trả về một nước đi không hợp lệ nên em và máy chưa đi tiếp được.';
 if(c==='hang'||c==='timeout')return 'Máy suy nghĩ quá lâu nên đã bị dừng lại.';
 return 'Chưa tải được động cơ Stockfish (có thể do mạng Internet hoặc trình duyệt cũ).';
}
function errText(e){
 const c=e&&e.code;
 if(c==='permission-denied')return 'Firestore từ chối thao tác này (kiểm tra Rules của phòng lớp).';
 if(c==='no-room')return 'Chưa ở trong phòng lớp.';
 if(c==='unavailable'||(e&&/offline|network/i.test(e.message||'')))return 'Đang mất kết nối mạng — thao tác chưa được ghi. Hãy thử lại khi có mạng.';
 return 'Chưa thực hiện được: '+((e&&e.message)||'lỗi không rõ')+'.';
}

function maybeEngineMove(attempt){
 attempt=attempt||0;
 const sh=sharedActive;
 if(!isOpen||!game||over||error||thinking)return;
 if(sh){if(!isHost()||!V||corrupt||cTurn===human)return;}
 else if(game.turn()===human||promotion)return;
 const epoch=++searchEpoch,ep=gameEpoch,fen=curFen(),sid=sh&&V?V.id:'',ply=cPly;
 thinking=true;error=null;render();
 gameReady.then(()=>{
  if(epoch!==searchEpoch||ep!==gameEpoch)return null;
  return ensureEngine().search(fen,{movetime:level.movetime,skill:level.skill});
 }).then(res=>{
  if(!res||epoch!==searchEpoch||ep!==gameEpoch||!isOpen)return null;
  thinking=false;engineState=engine?engine.state:'idle';
  if(res.cancelled){render();return null;}
  if(!game||over||res.fen!==curFen()||curTurn()===human){render();return null;}
  const probe=loadGame(fen);
  const legal=probe&&res.valid&&!res.none?findLegal(probe,res.bestmove):null;
  if(!legal){const e=new Error('bad-move');e.code='bad-move';throw e;}
  if(sh){
   engineSent=sid+':'+ply;
   return submitMove(uciOf(legal),{engine:true,ply,sid}).then(r=>{
    if(epoch!==searchEpoch||ep!==gameEpoch)return null;
    if(r&&r.error){const e=r.error;e.net=true;throw e;}
    render();return null;
   });
  }
  const made=game.move({from:legal.from,to:legal.to,promotion:legal.promotion});
  if(!made){const e=new Error('bad-move');e.code='bad-move';throw e;}
  lastMove={from:made.from,to:made.to};selected=null;hint=null;notice='';annClear();
  if(!checkEnd())render();
  return null;
 }).catch(err=>{
  if(epoch!==searchEpoch||ep!==gameEpoch)return;
  thinking=false;
  if(err&&err.net){error={text:errText(err),code:'net'};pushAux({error});render();return;}
  if(attempt<1&&err&&(err.code==='hang'||err.code==='worker-error'||err.code==='bad-move')){
   disposeEngine();maybeEngineMove(attempt+1);return;
  }
  disposeEngine();
  error={text:engineErrorText(err),code:err&&err.code};
  if(sharedActive)pushAux({error});
  render();
 });
}
function engineKick(){
 if(!sharedActive||!isHost()||!isOpen||!game||!V||over||error||corrupt||cTurn===human)return;
 const key=V.id+':'+cPly;
 if(engineSent===key||(thinking&&searchKey===key))return;
 if(thinking)cancelAll();
 searchKey=key;
 maybeEngineMove(0);
}

function loadGame(fen){
 if(typeof Chess!=='function')return null;
 const g=new Chess();
 return g.load(fen)?g:null;
}
function buildGame(fen0,moves){
 const g=loadGame(fen0);
 if(!g)return {g:null,ok:false,n:0};
 let n=0;
 for(const u of moves){
  const p=findLegal(g,u);
  if(!p)return {g,ok:false,n};
  g.move({from:p.from,to:p.to,promotion:p.promotion});n++;
 }
 return {g,ok:true,n};
}
function halfMovesOf(g){const n=parseInt(String(g.fen()).split(' ')[4],10);return isNaN(n)?0:n;}
function endText(result,reason){
 const chern=preset.kind==='chernev',sh=sharedActive;
 if(result==='win')return sh?(chern?'🏆 Cả lớp đã thắng ván cờ tàn! ':'🏆 Cả lớp thắng rồi! ')+reason:(chern?'🏆 Em đã thắng ván cờ tàn! ':'🏆 Em thắng rồi! ')+reason;
 if(result==='loss')return '😅 Máy thắng ván này. '+reason+(sh?' Giáo viên bấm “Ván mới” để cả lớp chơi lại nhé!':' Em bấm “Ván mới” để chơi lại nhé!');
 return '🤝 Ván cờ hòa. '+reason+(chern?' (Bài này Trắng cần thắng — thử lại nhé!)':'');
}
function deriveEnd(g,hum){
 const sh=sharedActive;hum=hum||human;
 if(g.in_checkmate()){
  const loser=g.turn();
  return loser===hum?{result:'loss',reason:sh?'Vua của cả lớp bị chiếu hết.':'Vua của em bị chiếu hết.'}:{result:'win',reason:'Chiếu hết Vua đối phương!'};
 }
 if(g.in_stalemate())return {result:'draw',reason:'Hòa Pat: bên đi không còn nước hợp lệ nhưng Vua không bị chiếu.'};
 if(g.insufficient_material())return {result:'draw',reason:'Không đủ quân để chiếu hết.'};
 if(g.in_threefold_repetition())return {result:'draw',reason:'Thế cờ lặp lại 3 lần.'};
 if(halfMovesOf(g)>=100)return {result:'draw',reason:'Luật 50 nước: 50 nước liền không ăn quân và không đi Tốt.'};
 return null;
}
function checkEnd(){
 if(!game)return false;
 const o=deriveEnd(game);
 if(!o)return false;
 endGame(o.result,o.reason);
 return true;
}
function recordWin(){
 if(preset.kind==='chernev'){
  const item=chernev()[preset.index];
  if(item){restoreProgress();doneChernev.add(item.num);persistProgress();}
 }
}
function endGame(result,reason,text){
 over={result,reason,text:text||endText(result,reason)};
 cancelAll();selected=null;promotion=null;hint=null;notice='';error=null;confirmResign=false;
 disposeEngine();
 if(result==='win')recordWin();
 emitResult();
 render();
}
function randomSide(){
 try{const a=new Uint8Array(1);crypto.getRandomValues(a);return a[0]%2?'w':'b';}catch(e){return Math.random()<0.5?'w':'b';}
}
function newGame(cfg){
 cfg=cfg||{};
 if(sharedActive&&!isTeacherInRoom()){notify('Giáo viên điều khiển ván cờ của cả lớp.');return false;}
 const kind=cfg.kind||settings.kind,idx=Number.isInteger(cfg.chernev)?cfg.chernev:settings.chernev;
 let fen=START_FEN,color=cfg.color||settings.color,pr={kind:'standard'};
 const lv=LEVELS.find(l=>l.id===(cfg.levelId||settings.levelId))||LEVELS[0];
 if(kind==='chernev'){
  const list=chernev(),item=list[Math.max(0,Math.min(list.length-1,idx))];
  if(item){fen=item.fen;pr={kind:'chernev',index:list.indexOf(item)};color='w';settings.chernev=pr.index;savePrefs();}
 }
 if(typeof cfg.fen==='string'){fen=cfg.fen;pr={kind:'custom'};}
 const g=loadGame(fen);
 if(!g){notice='Không tạo được thế cờ này.';render();return false;}
 if(color==='random')color=randomSide();
 const hum=color==='b'?'b':'w';
 if(sharedActive){
  cancelAll();pending=null;selected=null;promotion=null;hint=null;notice='';error=null;confirmResign=false;
  startSession({kind:pr.kind,index:pr.kind==='chernev'?pr.index:-1,fen0:fen,human:hum,levelId:lv.id});
  return true;
 }
 cancelAll();gameEpoch++;
 game=g;human=hum;startFen=fen;preset=pr;level=lv;
 selected=null;lastMove=null;over=null;promotion=null;hint=null;notice='';error=null;confirmResign=false;
 annClear();
 render();
 if(!cfg.remote)broadcast();
 const ep=gameEpoch;
 gameReady=(engine&&engine.state==='ready'?engine.newGame():Promise.resolve()).catch(()=>{});
 gameReady.then(()=>{if(ep===gameEpoch)maybeEngineMove();});
 return true;
}

function canHumanAct(){
 if(!isOpen||!game||over||promotion)return false;
 if(sharedActive)return !!V&&!corrupt&&!pending&&cTurn===human;
 return !thinking&&!drawBusy&&game.turn()===human;
}
function onCell(sq){
 if(!canHumanAct())return;
 if(!lockCtl())cancelAnalysis();
 const p=game.get(sq);
 if(p&&p.color===human){
  selected=selected===sq?null:sq;
  if(!sharedActive)hint=null;
  else if(isHost()&&hint){hint=null;pushAux(null);}
  render();return;
 }
 if(!selected)return;
 const choices=game.moves({square:selected,verbose:true}).filter(m=>m.to===sq);
 if(!choices.length){selected=null;notice='Ô này không phải nước đi hợp lệ. Hãy chọn lại.';render();return;}
 notice='';
 if(choices.some(m=>m.promotion)){promotion={from:selected,to:sq};render();return;}
 humanMove(selected,sq,undefined);
}
function choosePromotion(piece){
 if(!promotion||!['q','r','b','n'].includes(piece))return;
 const {from,to}=promotion;promotion=null;
 humanMove(from,to,piece);
}
function humanMove(from,to,promo){
 if(!game||over||game.turn()!==human)return;
 if(sharedActive){sharedHumanMove(from,to,promo);return;}
 const made=game.move({from,to,promotion:promo});
 if(!made){selected=null;promotion=null;notice='Nước đi không đúng luật.';render();return;}
 lastMove={from:made.from,to:made.to};selected=null;hint=null;notice='';error=null;confirmResign=false;annClear();
 if(!checkEnd()){render();maybeEngineMove();}
}
const ABORT={
 gone:'Ván cờ vừa được đổi hoặc không còn nữa.',stale:'Có bạn vừa đi quân trước em — hãy xem thế cờ mới.',turn:'Chưa đến lượt cả lớp.',
 illegal:'Nước đi không hợp lệ.',over:'Ván cờ đã kết thúc.',corrupt:'Dữ liệu ván bị lỗi — giáo viên hãy bấm “Ván mới”.',
 forbidden:'Chỉ máy giáo viên của ván này mới làm được việc đó.',state:'Trạng thái ván đã thay đổi, hãy thử lại.'
};
function sharedHumanMove(from,to,promo){
 if(!V||corrupt||pending)return;
 const legal=game.moves({verbose:true}).find(m=>m.from===from&&m.to===to&&(m.promotion||undefined)===(promo||undefined));
 if(!legal){selected=null;promotion=null;notice='Nước đi không đúng luật.';render();return;}
 const uci=uciOf(legal),ply=cPly,sid=V.id;
 pending={sid,ply,uci};
 clearTimeout(pendingTimer);
 pendingTimer=setTimeout(()=>{
  if(pending&&pending.sid===sid&&pending.ply===ply&&pending.uci===uci){pending=null;notice='Chưa gửi được nước đi — hãy thử lại.';rebuildDisplay();render();}
 },PENDING_MS);
 selected=null;notice='';confirmResign=false;
 rebuildDisplay();render();
 submitMove(uci,{ply,sid}).then(r=>{
  if(!r||(!r.error&&!r.abort))return;
  const mine=!!pending&&pending.sid===sid&&pending.ply===ply&&pending.uci===uci;
  if(mine){pending=null;clearTimeout(pendingTimer);}
  if(V&&V.id===sid&&V.moves[ply]===uci){if(mine){rebuildDisplay();render();}return;}
  if(!V||V.id!==sid)return;
  notice=r.error?errText(r.error):(ABORT[r.abort]||ABORT.state);
  const keep={sid,until:Date.now()+4000};noticeKeep=keep;
  setTimeout(()=>{if(noticeKeep===keep){noticeKeep=null;notice='';render();}},4000);
  if(mine)rebuildDisplay();
  render();
 });
}
async function submitMove(uci,o){
 const me=myUid();
 try{
  const r=await txVsm(cur=>{
   if(!cur||cur.id!==o.sid)return {abort:'gone'};
   if(cur.over)return {abort:'over'};
   if(cur.moves.length!==o.ply)return {abort:'stale'};
   if(o.engine&&cur.teacherId!==me)return {abort:'forbidden'};
   const b=buildGame(cur.fen0,cur.moves);
   if(!b.ok||cur.bad)return {abort:'corrupt'};
   if(deriveEnd(b.g,cur.human))return {abort:'over'};
   if((b.g.turn()===cur.human)===!!o.engine)return {abort:'turn'};
   if(!findLegal(b.g,uci))return {abort:'illegal'};
   return {patch:{'vsm.moves':cur.moves.concat(uci),'vsm.aux':null,'vsm.updatedAt':SV()}};
  });
  return r||{abort:'state'};
 }catch(e){console.warn('Đấu với máy: không ghi được nước đi',e);return {error:e};}
}
async function txVsm(fn){
 if(!sharedActive||typeof db==='undefined'||!db||roomCode()!==sCode)throw Object.assign(new Error('no-room'),{code:'no-room'});
 const ref=vsmRef();let out=null;
 txBusy++;
 try{
  await db.runTransaction(async t=>{
   const snap=await t.get(ref),d=snap.exists?snap.data():null;
   const cur=d&&d.vsm?normV(d.vsm):null;
   const res=fn(cur,d);
   if(!res||res.abort){out=res||{abort:'state'};return;}
   t.update(ref,res.patch);out=res;
  });
 }finally{txBusy--;}
 return out;
}
async function startSession(c){
 const ref=vsmRef();
 if(!ref){notice='Chưa ở trong phòng lớp.';render();return;}
 const id='vm'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);
 const sess={v:1,id,teacherId:myUid(),teacherName:myName().slice(0,80),kind:c.kind,index:Number.isInteger(c.index)?c.index:-1,fen0:c.fen0,
  human:c.human,levelId:c.levelId,moves:[],over:null,setup:setupSnapshot(),aux:null,updatedAt:SV()};
 try{await ref.set({room:sCode,proto:PROTO,vsm:sess,marks:{}});}
 catch(e){notice=errText(e);console.warn('Đấu với máy: không tạo được ván chung',e);render();}
}
function setupSnapshot(){return {color:settings.color,levelId:settings.levelId,kind:settings.kind,chernev:settings.chernev,done:doneCount()};}
function pushSetup(){
 if(!sharedActive||!isHost()||!V)return;
 clearTimeout(setupTimer);
 setupTimer=setTimeout(()=>{
  setupTimer=null;
  const ref=vsmRef();if(!ref||!sharedActive||!isHost())return;
  ref.update({'vsm.setup':setupSnapshot()}).catch(e=>console.warn('Đấu với máy: không ghi được lựa chọn của giáo viên',e));
 },SETUP_DEBOUNCE);
}
function pushAux(p){
 if(!sharedActive||!isHost()||!V)return;
 const ref=vsmRef();if(!ref)return;
 let val=null;
 if(p){
  val={sid:V.id,ply:cPly};
  if(p.busy)val.busy=p.busy;
  if(p.notice)val.notice=String(p.notice).slice(0,200);
  if(p.error)val.error={text:String(p.error.text||'').slice(0,200),code:String(p.error.code||'').slice(0,30)};
  if(p.hint){
   const h=p.hint,o={from:h.from,to:h.to,san:String(h.san||'').slice(0,12),piece:h.piece,turn:h.turn};
   if(h.info&&Number.isFinite(h.info.cp))o.cp=Math.round(h.info.cp);
   if(h.info&&Number.isFinite(h.info.mate))o.mate=Math.round(h.info.mate);
   val.hint=o;
  }
 }
 ref.update({'vsm.aux':val}).catch(e=>console.warn('Đấu với máy: không ghi được thông tin phụ',e));
}
async function hostSetOver(o){
 const sid=V&&V.id,me=myUid();
 try{
  const r=await txVsm(cur=>{
   if(!cur||cur.id!==sid||cur.teacherId!==me)return {abort:'gone'};
   if(cur.over)return {abort:'over'};
   return {patch:{'vsm.over':o,'vsm.aux':null,'vsm.updatedAt':SV()}};
  });
  if(r&&r.abort){notice=ABORT[r.abort]||ABORT.state;render();}
 }catch(e){notice=errText(e);render();}
}
function undo(){
 if(!isOpen||!game||over)return;
 if(sharedActive){
  if(!isHost()||!V||pending||corrupt)return;
  const need=cTurn===human?2:1;
  if(cPly<need)return;
  const sid=V.id,ply=cPly,me=myUid();
  cancelAll();confirmResign=false;
  txVsm(cur=>{
   if(!cur||cur.id!==sid||cur.teacherId!==me)return {abort:'gone'};
   if(cur.over)return {abort:'over'};
   if(cur.moves.length!==ply)return {abort:'stale'};
   return {patch:{'vsm.moves':cur.moves.slice(0,ply-need),'vsm.aux':null,'vsm.updatedAt':SV()}};
  }).then(r=>{if(r&&r.abort){notice=ABORT[r.abort]||ABORT.state;render();engineKick();}},e=>{notice=errText(e);render();engineKick();});
  return;
 }
 const plies=game.history().length,need=game.turn()===human?2:1;
 if(plies<need)return;
 cancelAll();gameEpoch++;promotion=null;error=null;hint=null;notice='';selected=null;confirmResign=false;
 for(let i=0;i<need;i++)game.undo();
 const h=game.history({verbose:true});
 lastMove=h.length?{from:h[h.length-1].from,to:h[h.length-1].to}:null;
 gameReady=Promise.resolve();annClear();
 render();
 maybeEngineMove();
}
function resign(){
 if(!isOpen||!game||over)return;
 if(lockCtl()){notifyLocked();return;}
 if(!confirmResign){
  confirmResign=true;clearTimeout(confirmTimer);
  confirmTimer=setTimeout(()=>{confirmResign=false;render();},4000);
  render();return;
 }
 clearTimeout(confirmTimer);
 if(sharedActive){confirmResign=false;hostSetOver({result:'loss',by:'resign'});return;}
 endGame('loss','Em đã chịu thua.',endText('loss','Em đã chịu thua.'));
}
function notifyLocked(){notify('Giáo viên điều khiển ván cờ của cả lớp. Em có thể đi quân và vẽ trên bàn cờ.');}
function offerDraw(){
 if(lockCtl()){notifyLocked();return;}
 if(!isOpen||!game||over||thinking||drawBusy||analysing||curTurn()!==human||promotion||pending)return;
 const plies=sharedActive?cPly:game.history().length;
 if(preset.kind==='standard'&&plies<MIN_PLIES_FOR_DRAW){
  notice='Còn quá sớm để hòa. Hãy chơi thêm vài nước nữa rồi cầu hòa nhé!';render();return;
 }
 const epoch=++analysisEpoch,ep=gameEpoch,fen=curFen();
 drawBusy=true;notice='';hint=null;selected=null;
 if(sharedActive)pushAux({busy:'draw'});
 render();
 gameReady.then(()=>ensureEngine().search(fen,{movetime:700,skill:20})).then(res=>{
  if(epoch!==analysisEpoch||ep!==gameEpoch||!game||over||curFen()!==fen)return;
  drawBusy=false;engineState=engine?engine.state:'idle';
  if(res.cancelled){if(sharedActive)pushAux(null);render();return;}
  const info=res.info;let machine=null;
  if(info){machine=info.mate!==null&&info.mate!==undefined?(info.mate>0?-100000:100000):(info.cp===null?null:-info.cp);}
  if(machine!==null&&machine<=DRAW_ACCEPT_CP){
   if(sharedActive){hostSetOver({result:'draw',by:'draw'});return;}
   endGame('draw','Máy đã đồng ý hòa.','🤝 Máy đồng ý hòa! Ván cờ kết thúc với kết quả hòa.');
  }else{
   const msg=sharedActive?'Máy chưa đồng ý hòa — cả lớp hãy chơi tiếp nhé!':'Máy chưa đồng ý hòa — em hãy chơi tiếp nhé!';
   if(sharedActive)pushAux({notice:msg});else{notice=msg;}
   render();
  }
 }).catch(err=>{
  if(epoch!==analysisEpoch||ep!==gameEpoch)return;
  drawBusy=false;disposeEngine();
  const msg='⚠️ '+engineErrorText(err);
  if(sharedActive)pushAux({notice:msg});else notice=msg;
  render();
 });
}
function analyze(){
 if(lockCtl()){notifyLocked();return;}
 if(!isOpen||!game||over||thinking||drawBusy||analysing||curTurn()!==human||promotion||pending)return;
 const epoch=++analysisEpoch,ep=gameEpoch,fen=curFen();
 analysing=true;hint=null;notice='';
 if(sharedActive)pushAux({busy:'analysing'});
 render();
 gameReady.then(()=>ensureEngine().search(fen,{movetime:1000,skill:20})).then(res=>{
  if(epoch!==analysisEpoch||ep!==gameEpoch||!game||over||curFen()!==fen)return;
  analysing=false;engineState=engine?engine.state:'idle';
  if(res.cancelled){if(sharedActive)pushAux(null);render();return;}
  const probe=new Chess();probe.load(fen);
  const legal=res.valid&&!res.none?findLegal(probe,res.bestmove):null;
  if(!legal){
   const msg='Máy chưa tìm được gợi ý. Em thử lại nhé!';
   if(sharedActive)pushAux({notice:msg});else notice=msg;
   render();return;
  }
  const made=probe.move({from:legal.from,to:legal.to,promotion:legal.promotion});
  const info=res.info||null;
  hint={from:made.from,to:made.to,san:made.san,piece:made.piece,info,turn:curTurn()};
  if(sharedActive)pushAux({hint});
  render();
 }).catch(err=>{
  if(epoch!==analysisEpoch||ep!==gameEpoch)return;
  analysing=false;disposeEngine();
  const msg='⚠️ '+engineErrorText(err);
  if(sharedActive)pushAux({notice:msg});else notice=msg;
  render();
 });
}
function retry(){
 if(lockCtl()){notifyLocked();return;}
 if(!error)return;
 error=null;disposeEngine();
 if(sharedActive){if(V&&V.aux)pushAux(null);render();searchKey='';engineSent='';engineKick();return;}
 render();maybeEngineMove();
}

function normHint(h){
 if(!h||typeof h!=='object'||!SQ_RE.test(String(h.from||''))||!SQ_RE.test(String(h.to||'')))return null;
 const info={};
 if(Number.isFinite(h.cp))info.cp=Math.round(h.cp);
 if(Number.isFinite(h.mate))info.mate=Math.round(h.mate);
 return {from:h.from,to:h.to,san:String(h.san||'').slice(0,12),piece:PIECE[h.piece]?h.piece:'p',turn:h.turn==='b'?'b':'w',
  info:(info.cp!==undefined||info.mate!==undefined)?info:null};
}
function normV(r){
 if(!r||typeof r!=='object'||r.v!==1)return null;
 const id=typeof r.id==='string'&&r.id.length>0&&r.id.length<=60?r.id:'';
 const kind=r.kind==='chernev'||r.kind==='standard'||r.kind==='custom'?r.kind:'';
 const fen0=typeof r.fen0==='string'&&r.fen0.length>8&&r.fen0.length<=100?r.fen0:'';
 if(!id||!kind||!fen0)return null;
 const hum=r.human==='b'?'b':'w';
 const levelId=LEVELS.some(l=>l.id===r.levelId)?r.levelId:LEVELS[0].id;
 const index=Number.isInteger(r.index)&&r.index>=0&&r.index<1000?r.index:-1;
 const moves=[];let bad=false;
 if(Array.isArray(r.moves)){
  for(const m of r.moves.slice(0,MAX_MOVES)){if(typeof m==='string'&&UCI_RE.test(m))moves.push(m);else{bad=true;break;}}
  if(r.moves.length>MAX_MOVES)bad=true;
 }else if(r.moves!=null)bad=true;
 let ov=null;
 if(r.over&&typeof r.over==='object'&&['win','loss','draw'].includes(r.over.result)&&['resign','draw'].includes(r.over.by))ov={result:r.over.result,by:r.over.by};
 const s=r.setup&&typeof r.setup==='object'?r.setup:{};
 const setup={
  color:['w','b','random'].includes(s.color)?s.color:hum,
  levelId:LEVELS.some(l=>l.id===s.levelId)?s.levelId:levelId,
  kind:s.kind==='chernev'||s.kind==='standard'?s.kind:(kind==='chernev'?'chernev':'standard'),
  chernev:Number.isInteger(s.chernev)&&s.chernev>=0&&s.chernev<1000?s.chernev:Math.max(0,index),
  done:Number.isInteger(s.done)&&s.done>=0&&s.done<=1000?s.done:0
 };
 let aux=null;const a=r.aux;
 if(a&&typeof a==='object'&&a.sid===id&&Number.isInteger(a.ply)){
  aux={ply:a.ply,busy:a.busy==='analysing'||a.busy==='draw'?a.busy:null,notice:typeof a.notice==='string'?a.notice.slice(0,200):'',
   error:a.error&&typeof a.error==='object'&&typeof a.error.text==='string'?{text:a.error.text.slice(0,200),code:String(a.error.code||'').slice(0,30)}:null,
   hint:normHint(a.hint)};
 }
 return {id,teacherId:String(r.teacherId||''),teacherName:String(r.teacherName||'Giáo viên').slice(0,80),kind,index,fen0,human:hum,levelId,
  moves,bad,over:ov,setup,aux,updatedMs:toMs(r.updatedAt)};
}
function reasonOf(by){return by==='resign'?(sharedActive?'Cả lớp đã chịu thua.':'Em đã chịu thua.'):'Máy đã đồng ý hòa.';}
function rebuildDisplay(){
 if(!V)return;
 const moves=pending&&pending.sid===V.id&&pending.ply===cPly?V.moves.concat(pending.uci):V.moves;
 const b=buildGame(V.fen0,moves);
 if(b.g&&b.ok){game=b.g;}
 else if(pending){pending=null;const c=buildGame(V.fen0,V.moves);if(c.g)game=c.g;}
 const h=game?game.history({verbose:true}):[];
 lastMove=h.length?{from:h[h.length-1].from,to:h[h.length-1].to}:null;
}
function onDoc(d){
 D=d||null;gotFirst=true;lErr='';
 if(window.vqcVsmReview&&typeof window.vqcVsmReview.onDoc==='function'){try{window.vqcVsmReview.onDoc(D);}catch(e){}}
 let nv=null;
 try{nv=D&&D.vsm?normV(D.vsm):null;}catch(e){nv=null;}
 applyV(nv);
 if(intent)resolveIntent();
}
function applyV(nv){
 const prev=V;V=nv;
 if(!V){
  if(prev||game){
   cancelAll();game=null;pending=null;over=null;hint=null;error=null;selected=null;promotion=null;
   cPly=0;cFen='';cTurn='w';lastPly=-1;corrupt=false;auxBusy=null;auxNotice='';annClear();
  }
  armStale();render();refreshMarks();return;
 }
 const sessionChanged=!prev||prev.id!==V.id;
 if(engine&&sharedActive&&!isHost())disposeEngine();
 const b=buildGame(V.fen0,V.moves);
 if(!b.g){
  corrupt=true;game=null;over=null;armStale();render();return;
 }
 corrupt=!b.ok||V.bad;
 cFen=b.g.fen();cTurn=b.g.turn();cPly=b.n;
 const plyChanged=sessionChanged||lastPly!==cPly;
 lastPly=cPly;
 human=V.human;startFen=V.fen0;
 preset=V.kind==='chernev'&&V.index>=0?{kind:'chernev',index:V.index}:{kind:V.kind==='chernev'?'standard':V.kind};
 level=LEVELS.find(l=>l.id===V.levelId)||LEVELS[0];
 if(sessionChanged){
  cancelAll();gameEpoch++;pending=null;error=null;confirmResign=false;overHandled='';marksSeeded='';searchKey='';engineSent='';
  if(isHost())gameReady=(engine&&engine.state==='ready'?engine.newGame():Promise.resolve()).catch(()=>{});
 }
 if(plyChanged){
  if(!sessionChanged)cancelAll();
  selected=null;promotion=null;confirmResign=false;error=null;annClear();
  if(!(noticeKeep&&noticeKeep.sid===V.id&&Date.now()<noticeKeep.until)){notice='';noticeKeep=null;}
 }
 if(pending&&(pending.sid!==V.id||cPly>pending.ply)){pending=null;clearTimeout(pendingTimer);}
 game=b.g;
 if(pending){
  const pm=buildGame(V.fen0,V.moves.concat(pending.uci));
  if(pm.g&&pm.ok)game=pm.g;else{pending=null;clearTimeout(pendingTimer);}
 }
 const hs=game.history({verbose:true});
 lastMove=hs.length?{from:hs[hs.length-1].from,to:hs[hs.length-1].to}:null;
 let end=null;
 if(corrupt)end=null;
 else if(V.over)end={result:V.over.result,reason:reasonOf(V.over.by),text:V.over.by==='draw'?'🤝 Máy đồng ý hòa! Ván cờ kết thúc với kết quả hòa.':null};
 else end=deriveEnd(b.g);
 over=end?{result:end.result,reason:end.reason,text:end.text||endText(end.result,end.reason)}:null;
 if(over&&overHandled!==V.id)onOver();
 const A=V.aux&&V.aux.ply===cPly?V.aux:null;
 auxBusy=A&&!over?A.busy:null;auxNotice=A&&!over?A.notice:'';
 hint=A&&A.hint&&!over?{...A.hint}:null;
 if(!isHost())error=A&&A.error&&!over?{...A.error}:null;
 armStale();
 render();
 refreshMarks();
 engineKick();
}
function onOver(){
 overHandled=V.id;
 if(isHost())emitResult();
 cancelAll();selected=null;promotion=null;confirmResign=false;
 if(isHost())disposeEngine();
 if(over.result==='win'){recordWin();if(isHost())pushSetup();}
}
function armStale(){
 const need=sharedActive&&!isHost()&&!!V&&!over&&!corrupt&&!!game&&cTurn!==human;
 const key=need?V.id+':'+cPly:'';
 if(key===staleKey)return;
 clearTimeout(staleTimer);staleTimer=null;staleKey=key;staleWarn=false;
 if(!key)return;
 staleTimer=setTimeout(()=>{if(staleKey===key){staleWarn=true;render();}},STALE_MS);
}
function clearStale(){clearTimeout(staleTimer);staleTimer=null;staleKey='';staleWarn=false;}
function shownNotice(){
 return notice||auxNotice||(staleWarn?'⚠️ Chưa thấy máy giáo viên trả lời (đã hơn 30 giây). Hãy nhờ giáo viên kiểm tra máy của giáo viên.':'');
}
function resolveIntent(){
 if(!intent||!sharedActive||!isTeacherInRoom())return;
 const it=intent;intent=null;clearTimeout(intentTimer);intentTimer=null;
 const cur=V;
 const fresh=!!cur&&(cur.updatedMs==null||Date.now()-cur.updatedMs<RESUME_MS);
 const sameKind=!!cur&&(it.kind==='chernev'?(cur.kind==='chernev'&&cur.index===it.index):cur.kind!=='chernev');
 if(cur&&cur.teacherId===myUid()&&fresh&&sameKind&&!corrupt){pushSetup();engineKick();return;}
 newGame({});
}
function attachListener(){
 const code=roomCode();if(!code)return;
 if(lOff&&lCode===code)return;
 detachListener();
 lCode=code;
 const ref=vsmRef();if(!ref)return;
 try{
  lOff=ref.onSnapshot(s=>{if(lCode!==code||!sharedActive)return;onDoc(s&&s.exists?s.data():null);},err=>{
   if(lCode!==code)return;
   lOff=null;
   lErr=(err&&err.code==='permission-denied')?'Firestore không cho đọc ván đấu (kiểm tra Rules của phòng lớp).':'Mất kết nối tới ván đấu — đang thử lại…';
   console.warn('Đấu với máy: lỗi trình nghe ván chung',err);
   notice=lErr;render();
   clearTimeout(lRetry);lRetry=setTimeout(()=>{if(isOpen&&sharedActive){lCode='';attachListener();}},5000);
  });
 }catch(e){lOff=null;lCode='';console.warn('Đấu với máy: không nghe được ván chung',e);}
}
function detachListener(){
 if(lOff){try{lOff();}catch(e){}}
 lOff=null;lCode='';clearTimeout(lRetry);lRetry=null;
}

function annApi(name){return typeof window[name]==='function'?window[name]:null;}
function rv(){const r=window.vqcVsmReview;return r&&r.active&&r.active()?r:null;}
function snapResult(){
 if(!game||!over)return null;
 const mv=game.history({verbose:true}).map(uciOf);
 if(!mv.length)return null;
 const list=chernev(),item=preset.kind==='chernev'?list[preset.index]:null;
 return {id:sharedActive&&V?V.id:'vs'+Date.now().toString(36)+Math.random().toString(36).slice(2,7),kind:item?'chernev':(preset.kind==='custom'?'custom':'standard'),
  num:item?item.num:0,fen0:startFen,human,levelId:level.id,result:over.result,reason:String(over.reason||'').slice(0,200),moves:mv,shared:sharedActive};
}
function emitResult(){
 const r=window.vqcVsmReview;
 if(!r||typeof r.save!=='function'||isStudent())return;
 try{const s=snapResult();if(s)r.save(s);}catch(e){console.warn('Đấu với máy: không lưu được kết quả ván',e);}
}
function annClear(){const f=annApi('vqcAnnotationsClearBoard');if(f)f(BOARD_ID);}
function flipped(){return human==='b';}
function sqToIdx(sq){const f=FILES.indexOf(sq[0]),r=Number(sq[1]);return flipped()?(r-1)*8+(7-f):(8-r)*8+f;}
function idxToSq(i){const ri=i>>3,fi=i&7;return flipped()?FILES[7-fi]+(ri+1):FILES[fi]+(8-ri);}
function cleanMark(m){
 if(!m||typeof m!=='object'||!['circle','arrow'].includes(m.kind)||!SQ_RE.test(String(m.from||''))||!SQ_RE.test(String(m.to||''))||!MARK_COLORS.includes(m.color))return null;
 return {kind:m.kind,from:sqToIdx(m.from),to:sqToIdx(m.to),color:m.color,...(m.knightPath===true?{knightPath:true}:{})};
}
function publishMarks(list,info){
 if(!sharedActive||!V||!isOpen)return;
 const ref=vsmRef(),uid=myUid();
 if(!ref||!uid)return;
 if(info&&info.all&&isHost()){ref.update({marks:{},markClear:{gid:V.id,ply:cPly,id:uid+':'+Date.now()}}).catch(e=>console.warn('Đấu với máy: không xóa được nét vẽ',e));return;}
 const entry={gid:V.id,ply:cPly,by:myName().slice(0,40),
  marks:(list||[]).slice(0,MAX_USER_MARKS).map(m=>({kind:m.kind,from:idxToSq(m.from),to:idxToSq(m.to),color:m.color,...(m.knightPath?{knightPath:true}:{})}))};
 ref.set({marks:{[uid]:entry}},{merge:true}).catch(e=>console.warn('Đấu với máy: không gửi được nét vẽ',e));
}
function registerAdapter(){
 const f=annApi('vqcAnnotationsAdapter');
 if(!f||adapterOn)return;
 const mount=annApi('vqcAnnotationsMount');if(mount)mount();
 adapterOn=!!f(BOARD_ID,{publish:publishMarks,canClearAll:()=>isHost()});
}
function unregisterAdapter(){
 const f=annApi('vqcAnnotationsAdapter');
 if(f&&adapterOn)f(BOARD_ID,null);
 adapterOn=false;
}
function refreshMarks(){
 if(!sharedActive||!isOpen||rv())return;
 registerAdapter();
 const setRemote=annApi('vqcAnnotationsRemote');
 if(!setRemote||!V)return;
 const me=myUid(),list=[];
 const all=D&&D.marks&&typeof D.marks==='object'?D.marks:null;
 if(all){
  let users=0;
  for(const uid of Object.keys(all)){
   if(uid===me)continue;
   const e=all[uid];
   if(!e||e.gid!==V.id||e.ply!==cPly||!Array.isArray(e.marks))continue;
   if(++users>40)break;
   for(const m of e.marks.slice(0,MAX_USER_MARKS)){const k=cleanMark(m);if(k)list.push(k);}
   if(list.length>400)break;
  }
 }
 setRemote(BOARD_ID,list);
 if(marksSeeded!==V.id){
  marksSeeded=V.id;
  const e=all&&all[me],setOwn=annApi('vqcAnnotationsSetOwn');
  if(setOwn&&e&&e.gid===V.id&&e.ply===cPly&&Array.isArray(e.marks)){
   setOwn(BOARD_ID,e.marks.slice(0,MAX_USER_MARKS).map(cleanMark).filter(Boolean));
  }
 }
 const mc=D&&D.markClear&&typeof D.markClear==='object'?D.markClear:null;
 const mcId=mc&&mc.gid===V.id&&mc.ply===cPly&&typeof mc.id==='string'?mc.id:'';
 const seenKey=V.id+':'+cPly;
 if(clearSeenFor!==seenKey){clearSeenFor=seenKey;clearSeen=mcId;}
 else if(mcId&&mcId!==clearSeen){
  clearSeen=mcId;
  const setOwn=annApi('vqcAnnotationsSetOwn');
  if(setOwn&&mcId.indexOf(me+':')!==0)setOwn(BOARD_ID,[]);
 }
}

function evalWhite(info,turn){
 if(!info)return null;
 if(info.mate!==null&&info.mate!==undefined){const m=turn==='w'?info.mate:-info.mate;return {mate:m};}
 if(info.cp===null||info.cp===undefined)return null;
 return {cp:turn==='w'?info.cp:-info.cp};
}
function evalText(ev){
 if(!ev)return '';
 if(ev.mate!==undefined){
  const who=ev.mate>0?'Trắng':'Đen',n=Math.abs(ev.mate);
  return who+' có thể chiếu hết sau '+n+' nước';
 }
 const a=Math.abs(ev.cp);
 if(a<30)return 'Thế cờ cân bằng';
 const who=ev.cp>0?'Trắng':'Đen';
 if(a<150)return who+' hơi nhỉnh hơn';
 if(a<400)return who+' đang hơn';
 return who+' hơn rất nhiều';
}
function evalShare(ev){
 if(!ev)return 50;
 if(ev.mate!==undefined)return ev.mate>0?97:3;
 return Math.round(50+50*Math.tanh(ev.cp/400)*0.94);
}
function kingSquare(color){
 for(const f of FILES)for(let r=1;r<=8;r++){const p=game.get(f+r);if(p&&p.type==='k'&&p.color===color)return f+r;}
 return null;
}
function analysingNow(){return analysing||auxBusy==='analysing';}
function drawingNow(){return drawBusy||auxBusy==='draw';}
function busyAny(){
 if(over)return false;
 if(thinking||analysingNow()||drawingNow())return true;
 return sharedActive&&!error&&!corrupt&&!!game&&game.turn()!==human;
}
function statusText(){
 if(over)return over.text;
 if(error)return '⚠️ '+error.text;
 if(sharedActive){
  if(lErr&&!game)return '⚠️ '+lErr;
  if(!V)return isTeacherInRoom()?'⏳ Đang kết nối với lớp…':'⏳ Đang chờ máy giáo viên bắt đầu ván cờ…';
  if(corrupt)return '⚠️ '+ABORT.corrupt;
 }
 if(!game)return '';
 if(engineState==='loading'&&(thinking||analysing||drawBusy))return '⏳ Đang tải động cơ Stockfish… (lần đầu có thể hơi lâu)';
 if(busyAny())return 'AI ĐANG PHÂN TÍCH...';
 const chk=game.in_check()?' ⚠️ Vua đang bị chiếu!':'';
 if(game.turn()===human)return (sharedActive?'Đến lượt cả lớp (':'Đến lượt em (')+SIDE[human]+').'+chk;
 return 'Đến lượt máy ('+SIDE[otherSide(human)]+').'+chk;
}
function paintBoard(){
 const board=$('vqcVsmBoard');if(!board)return;
 if(!game){board.replaceChildren();return;}
 board.replaceChildren();
 const flip=human==='b',ranks=flip?[1,2,3,4,5,6,7,8]:[8,7,6,5,4,3,2,1],files=flip?[...FILES].reverse():[...FILES];
 const legal=selected&&canHumanAct()?game.moves({square:selected,verbose:true}).map(m=>m.to):[];
 const checkSq=game.in_check()?kingSquare(game.turn()):null;
 for(let ri=0;ri<8;ri++)for(let fi=0;fi<8;fi++){
  const sq=files[fi]+ranks[ri],p=game.get(sq),b=document.createElement('button');
  b.type='button';b.dataset.square=sq;b.className='vqc-vsm-cell '+((ri+fi)%2?'dark':'light');
  if(selected===sq)b.classList.add('selected');
  if(legal.includes(sq))b.classList.add('legal');
  if(lastMove&&lastMove.from===sq)b.classList.add('vqc-last-from');
  if(lastMove&&lastMove.to===sq)b.classList.add('vqc-last-to');
  if(hint&&hint.from===sq)b.classList.add('hint-from');
  if(hint&&hint.to===sq)b.classList.add('hint-to');
  if(checkSq===sq)b.classList.add('in-check');
  b.setAttribute('aria-label','Ô '+sq+(p?' '+(p.color==='w'?'trắng ':'đen ')+(PIECE[p.type]||''):''));
  if(p){
   const s=document.createElement('span');s.className='vqc-vsm-piece';
   if(typeof pieceSvgMarkup==='function')s.innerHTML=pieceSvgMarkup(p.color==='w'?p.type.toUpperCase():p.type);
   else s.textContent=({w:{k:'♔',q:'♕',r:'♖',b:'♗',n:'♘',p:'♙'},b:{k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'}}[p.color]||{})[p.type]||'';
   b.append(s);
  }
  if(fi===0){const x=document.createElement('span');x.className='vqc-vsm-rank';x.textContent=sq[1];b.append(x);}
  if(ri===7){const x=document.createElement('span');x.className='vqc-vsm-file';x.textContent=sq[0];b.append(x);}
  b.addEventListener('click',()=>onCell(sq));
  board.append(b);
 }
}
function paintPromotion(){
 const el=$('vqcVsmPromo');if(!el)return;
 el.replaceChildren();el.hidden=!promotion;
 if(!promotion)return;
 const t=document.createElement('p');t.textContent='Tốt phong cấp thành:';el.append(t);
 const row=document.createElement('div');row.className='vqc-vsm-promo-row';
 for(const k of ['q','r','b','n']){
  const b=document.createElement('button');b.type='button';b.dataset.promo=k;b.setAttribute('aria-label',PIECE[k]);
  const glyph=typeof pieceSvgMarkup==='function'?pieceSvgMarkup(human==='w'?k.toUpperCase():k):'';
  b.innerHTML='<span class="vqc-vsm-promo-piece">'+glyph+'</span><span>'+PIECE[k]+'</span>';
  b.addEventListener('click',()=>choosePromotion(k));row.append(b);
 }
 el.append(row);
}
function paintHistory(){
 const box=$('vqcVsmHistory');if(!box)return;
 if(!game){box.replaceChildren();return;}
 const sans=game.history(),parts=startFen.split(' ');
 let startBlack=parts[1]==='b',num=parseInt(parts[5],10);if(isNaN(num)||num<1)num=1;
 box.replaceChildren();
 if(!sans.length){const p=document.createElement('p');p.className='vqc-vsm-empty';p.textContent='Chưa có nước đi nào.';box.append(p);return;}
 const rows=[];let i=0,n=num;
 if(startBlack){rows.push({n,w:'…',b:sans[0]});i=1;n++;}
 for(;i<sans.length;i+=2,n++)rows.push({n,w:sans[i],b:sans[i+1]||''});
 const last=sans.length-1;
 rows.forEach((r,ri)=>{
  const row=document.createElement('div');row.className='vqc-vsm-hrow';
  const a=document.createElement('span');a.className='vqc-vsm-hnum';a.textContent=r.n+'.';
  const w=document.createElement('span');w.textContent=r.w;
  const b=document.createElement('span');b.textContent=r.b;
  const wi=startBlack?(ri===0?-1:2*ri-1):2*ri,bi=startBlack?(ri===0?0:2*ri):2*ri+1;
  if(wi===last)w.className='cur';if(bi===last)b.className='cur';
  row.append(a,w,b);box.append(row);
 });
 box.scrollTop=box.scrollHeight;
}
function paintPlayers(){
 const ai=otherSide(human),sh=sharedActive;
 const mk=(id,isAI,color)=>{
  const el=$(id);if(!el)return;
  const turnNow=!over&&game&&game.turn()===color;
  el.classList.toggle('turn',!!turnNow);
  el.querySelector('.vqc-vsm-avatar').textContent=isAI?'🤖':(sh?'👥':'🙂');
  el.querySelector('.vqc-vsm-pname').textContent=isAI?'Máy Stockfish':(sh?'Cả lớp (giáo viên & học sinh)':playerName()+' (em)');
  el.querySelector('.vqc-vsm-pside').textContent=(color==='w'?'⚪ ':'⚫ ')+SIDE[color]+(isAI?' · '+level.label:'');
  el.querySelector('.vqc-vsm-turn').textContent=turnNow?(isAI&&busyAny()&&!drawingNow()?'đang nghĩ…':'đến lượt'):'';
 };
 mk('vqcVsmTop',true,ai);mk('vqcVsmBottom',false,human);
}
function setupView(){
 if(sharedActive&&locked()&&V&&V.setup)return V.setup;
 return {color:settings.color,levelId:settings.levelId,kind:settings.kind,chernev:settings.chernev,done:doneCount()};
}
function paintSetup(lock){
 const S=setupView(),list=chernev();
 document.querySelectorAll('#vqcVsMachineOverlay [data-color]').forEach(b=>{
  const c=b.dataset.color;
  b.setAttribute('aria-pressed',String(S.kind==='chernev'?c==='w':S.color===c));
  b.disabled=lock||(S.kind==='chernev'&&c!=='w');
 });
 $('vqcVsmLevel').value=S.levelId;$('vqcVsmLevel').disabled=sharedActive&&lock;
 $('vqcVsmKind').value=S.kind;$('vqcVsmKind').disabled=lock;
 $('vqcVsmChernevRow').hidden=S.kind!=='chernev';
 const num=$('vqcVsmChernevNum');if(document.activeElement!==num)num.value=String(S.chernev+1);
 num.max=String(Math.max(1,list.length));
 const doneN=sharedActive&&lock?S.done:doneCount();
 $('vqcVsmChernevInfo').textContent=list.length?('Đã thắng '+doneN+'/'+list.length+' bài'):'Chưa tải dữ liệu Chernev';
 $('vqcVsmKind').querySelector('option[value="chernev"]').disabled=!list.length;
 for(const id of ['vqcVsmChPrev','vqcVsmChNext','vqcVsmChernevNum','vqcVsmSection'])$(id).disabled=lock;
 const chern=preset.kind==='chernev'?list[preset.index]:null,sec=chern?sectionOf(chern.num):null;
 const sel=$('vqcVsmSection');
 if(sharedActive&&lock){const n=list[S.chernev],s2=n?sectionOf(n.num):null;if(s2)sel.value=String(s2.from);}
 else if(chern&&sec)sel.value=String(sec.from);
}
function renderEmpty(){
 const st=$('vqcVsmStatus');
 if(st){st.textContent=statusText();st.className='vqc-vsm-status'+(corrupt||lErr?' error':'');}
 const nt=$('vqcVsmNotice');if(nt){const t=shownNotice();nt.textContent=t;nt.hidden=!t;}
 paintBoard();paintPromotion();paintHistory();
 $('vqcVsmTitle').textContent='🤖 Đấu với máy — Stockfish';
 $('vqcVsmSubtitle').textContent=sharedActive?'Ván cờ chung của cả lớp':'';
 $('vqcVsmEval').hidden=true;$('vqcVsmRetry').hidden=true;$('vqcVsmNextProblem').hidden=true;
 for(const id of ['vqcVsmUndo','vqcVsmDraw','vqcVsmResign','vqcVsmHint'])$(id).disabled=true;
 $('vqcVsmNew').disabled=!(sharedActive&&isTeacherInRoom());
 paintSetup(sharedActive?locked():false);
 paintLockNote();
}
function paintLockNote(){
 const n=$('vqcVsmLockNote');if(!n)return;
 n.hidden=!sharedActive;
 n.textContent=sharedActive?'👥 Cả lớp cùng một ván cờ, hai máy luôn hiển thị giống nhau. Giáo viên điều khiển ván; học sinh được đi quân bên “cả lớp” và vẽ mũi tên, vòng tròn trên bàn cờ (mọi người cùng thấy).':'';
 $('vqcVsMachineOverlay').classList.toggle('vqc-vsm-locked',sharedActive&&locked());
}
function render(){
 if(!$('vqcVsMachineOverlay'))return;
 {const r=rv();if(r){r.paint();return;}}
 if(!game){renderEmpty();return;}
 const sh=sharedActive,lock=locked();
 const list=chernev(),chern=preset.kind==='chernev'?list[preset.index]:null;
 $('vqcVsmTitle').textContent=chern?'♚ Thực hành cờ tàn — đấu với máy':'🤖 Đấu với máy — Stockfish';
 const sec=chern?sectionOf(chern.num):null;
 const whoPlays=chern?'Máy cầm Đen':((sh?'Cả lớp cầm ':'Em cầm ')+SIDE[human]);
 $('vqcVsmSubtitle').textContent=(chern?'Cờ tàn Chernev'+(sec?' · '+sec.name:'')+' · Bài '+chern.num+'/'+list.length+' · Trắng đi và phải thắng':'Ván cờ đầy đủ luật')+' · '+whoPlays+' · Mức: '+level.label;
 const st=$('vqcVsmStatus');
 st.textContent=statusText();
 st.className='vqc-vsm-status'+(over?' '+over.result:'')+(error?' error':'')+(busyAny()&&!over?' busy':'');
 const nt=shownNotice();
 $('vqcVsmNotice').textContent=nt;$('vqcVsmNotice').hidden=!nt;
 const retryBtn=$('vqcVsmRetry');retryBtn.hidden=!error;retryBtn.disabled=lockCtl();
 paintBoard();paintPromotion();paintHistory();paintPlayers();
 const humanTurn=canHumanAct(),plies=sh?cPly:game.history().length,need=curTurn()===human?2:1;
 const lc=lockCtl();
 $('vqcVsmNew').disabled=sh?!isTeacherInRoom():false;
 $('vqcVsmUndo').disabled=lc||!isOpen||!!over||plies<need||!!pending||corrupt;
 $('vqcVsmDraw').disabled=lc||!humanTurn||analysingNow();
 $('vqcVsmResign').disabled=lc||!!over||corrupt;
 $('vqcVsmResign').textContent=confirmResign?'❗ Bấm lần nữa để chịu thua':'🏳️ Chịu thua';
 $('vqcVsmHint').disabled=lc||!humanTurn||analysingNow();
 const box=$('vqcVsmEval');
 if(hint&&!over){
  const ev=evalWhite(hint.info,hint.turn);
  box.hidden=false;
  $('vqcVsmHintText').textContent='💡 Máy gợi ý: '+(PIECE[hint.piece]||'quân')+' '+hint.from+' → '+hint.to+' ('+hint.san+')';
  $('vqcVsmEvalText').textContent=evalText(ev);
  $('vqcVsmEvalFill').style.width=evalShare(ev)+'%';
  $('vqcVsmEvalBar').hidden=!ev;
 }else box.hidden=true;
 paintSetup(lock);
 const nxt=$('vqcVsmNextProblem');
 nxt.hidden=!(over&&over.result==='win'&&chern&&preset.index<list.length-1)||(!sh&&lock);
 nxt.disabled=lc;
 $('vqcVsmClose').title=isStudent()?'Giáo viên điều khiển việc đóng bài học':'';
 paintLockNote();
}

function open(opts){
 opts=opts||{};
 if(typeof Chess!=='function'){notify('Chưa thể mở chế độ Đấu với máy: thư viện luật cờ vua chưa được tải.');return;}
 if(isStudent()&&!opts.remote){notify('Giáo viên chọn bài cờ tàn; em sẽ tự thấy thế cờ giáo viên đang mở và đấu với máy ở thế cờ đó.');return;}
 const el=$('vqcVsMachineOverlay');if(!el)return;
 if(typeof window.vqcCloseOtherViews==='function')window.vqcCloseOtherViews('vsmachine');
 if(el.parentElement!==document.body)document.body.append(el);
 restoreProgress();
 if(opts.kind==='chernev'&&chernev().length)settings.kind='chernev';
 else if(opts.kind==='standard')settings.kind='standard';
 if(settings.kind==='chernev'&&Number.isInteger(opts.index))settings.chernev=clampIdx(opts.index);
 else settings.chernev=clampIdx(settings.chernev);
 el.classList.add('open');isOpen=true;
 const annMount=annApi('vqcAnnotationsMount');if(annMount)annMount();
 if(sharedOn()){openShared(opts);return;}
 const same=game&&!sharedActive&&(settings.kind==='chernev'?(preset.kind==='chernev'&&preset.index===settings.chernev):preset.kind!=='chernev');
 if(!same)newGame({remote:!!opts.remote});
 else{render();maybeEngineMove();if(!opts.remote)broadcast();}
 try{ensureEngine().init().then(()=>{engineState=engine?engine.state:'idle';render();},()=>{});}catch(e){}
}
function openShared(opts){
 const code=roomCode();
 if(!sharedActive||sCode!==code){
  cancelAll();disposeEngine();
  sharedActive=true;sCode=code;
  V=null;D=null;game=null;pending=null;over=null;hint=null;error=null;selected=null;promotion=null;notice='';
  cPly=0;cFen='';cTurn='w';lastPly=-1;corrupt=false;auxBusy=null;auxNotice='';gotFirst=false;overHandled='';marksSeeded='';searchKey='';engineSent='';
  clearStale();detachListener();
 }
 if(isTeacherInRoom()){
  intent={kind:settings.kind,index:settings.chernev};
  clearTimeout(intentTimer);intentTimer=setTimeout(()=>{if(intent)resolveIntent();},INTENT_WAIT);
 }
 broadcast();
 attachListener();
 registerAdapter();
 render();
 if(isTeacherInRoom()){
  if(gotFirst)resolveIntent();
  try{ensureEngine().init().then(()=>{engineState=engine?engine.state:'idle';render();},()=>{});}catch(e){}
 }
}
function hide(){
 cancelAll();disposeEngine();isOpen=false;broadcastKey='';
 clearTimeout(pendingTimer);clearTimeout(setupTimer);clearTimeout(intentTimer);clearTimeout(confirmTimer);clearStale();
 intent=null;noticeKeep=null;
 if(sharedActive){
  detachListener();unregisterAdapter();annClear();
  sharedActive=false;sCode='';V=null;D=null;game=null;pending=null;over=null;hint=null;error=null;selected=null;promotion=null;notice='';
  cPly=0;cFen='';cTurn='w';lastPly=-1;corrupt=false;auxBusy=null;auxNotice='';gotFirst=false;lErr='';
 }
 const ov=$('vqcVsMachineOverlay');
 if(ov){ov.classList.remove('open');ov.classList.remove('vqc-vsm-locked');}
}
function close(){
 if(isStudent()){notify('Giáo viên điều khiển việc đóng bài học trong lớp.');return;}
 const announced=broadcastKey!=='';
 hide();
 if(announced&&isTeacherInRoom()&&typeof vqcBroadcastView==='function'){try{vqcBroadcastView('board');}catch(e){}}
}
function state(){
 return {
  open:isOpen,fen:game?game.fen():null,turn:game?game.turn():null,human,over:over?{...over}:null,thinking,analysing,drawBusy,
  history:game?game.history():[],lastMove,error:error?{...error}:null,engineState,
  status:$('vqcVsmStatus')?$('vqcVsmStatus').textContent:'',preset:{...preset},level:level.id,hint:hint?{from:hint.from,to:hint.to,san:hint.san}:null,promotion:promotion?{...promotion}:null,
  engineAlive:!!engine,
  shared:sharedActive,host:isHost(),locked:locked(),sid:V?V.id:null,ply:cPly,committedFen:cFen,pending:pending?{...pending}:null,corrupt,
  setup:setupView(),notice:shownNotice(),adapter:adapterOn,txBusy,intent:!!intent
 };
}

const OVERLAY_HTML=`<div id="vqcVsMachineOverlay" role="dialog" aria-modal="true" aria-labelledby="vqcVsmTitle">
 <div class="vqc-vsm-dialog">
  <div class="vqc-vsm-top">
   <div><h2 id="vqcVsmTitle">🤖 Đấu với máy — Stockfish</h2><p id="vqcVsmSubtitle"></p></div>
   <button type="button" id="vqcVsmClose" aria-label="Đóng">✕ Đóng</button>
  </div>
  <div class="vqc-vsm-layout">
   <div class="vqc-vsm-boardcol">
    <div class="vqc-vsm-player" id="vqcVsmTop"><span class="vqc-vsm-avatar"></span><span class="vqc-vsm-pname"></span><span class="vqc-vsm-pside"></span><span class="vqc-vsm-turn"></span></div>
    <div class="vqc-vsm-boardwrap">
     <div id="vqcVsmBoard" class="vqc-vsm-board" aria-label="Bàn cờ đấu với máy"></div>
     <div id="vqcVsmPromo" class="vqc-vsm-promo" hidden></div>
    </div>
    <div class="vqc-vsm-player" id="vqcVsmBottom"><span class="vqc-vsm-avatar"></span><span class="vqc-vsm-pname"></span><span class="vqc-vsm-pside"></span><span class="vqc-vsm-turn"></span></div>
   </div>
   <section class="vqc-vsm-side">
    <p id="vqcVsmStatus" class="vqc-vsm-status" role="status" aria-live="polite"></p>
    <p id="vqcVsmNotice" class="vqc-vsm-notice" role="status" aria-live="polite" hidden></p>
    <p id="vqcVsmLockNote" class="vqc-vsm-lock-note" hidden></p>
    <button type="button" id="vqcVsmRetry" class="vqc-vsm-retry" hidden>↻ Thử lại</button>
    <button type="button" id="vqcVsmNextProblem" class="vqc-vsm-retry vqc-vsm-next" hidden>Bài cờ tàn tiếp theo →</button>
    <div class="vqc-vsm-controls">
     <button type="button" id="vqcVsmNew">▶ Ván mới</button>
     <button type="button" id="vqcVsmUndo">↩ Đi lại</button>
     <button type="button" id="vqcVsmDraw">🤝 Cầu hòa</button>
     <button type="button" id="vqcVsmResign">🏳️ Chịu thua</button>
     <button type="button" id="vqcVsmHint">💡 Gợi ý (máy phân tích)</button>
    </div>
    <div id="vqcVsmEval" class="vqc-vsm-eval" hidden>
     <p id="vqcVsmHintText"></p>
     <div id="vqcVsmEvalBar" class="vqc-vsm-evalbar" aria-hidden="true"><span id="vqcVsmEvalFill"></span></div>
     <p id="vqcVsmEvalText" class="vqc-vsm-evaltext"></p>
    </div>
    <div class="vqc-vsm-histwrap"><h3>📜 Các nước đã đi</h3><div id="vqcVsmHistory" class="vqc-vsm-history"></div></div>
    <fieldset class="vqc-vsm-setup">
     <legend>⚙️ Ván mới</legend>
     <div class="vqc-vsm-chips" role="group" aria-label="Chọn bên">
      <button type="button" data-color="w" aria-pressed="true">⚪ Trắng</button>
      <button type="button" data-color="b" aria-pressed="false">⚫ Đen</button>
      <button type="button" data-color="random" aria-pressed="false">🎲 Ngẫu nhiên</button>
     </div>
     <label for="vqcVsmLevel">Mức của máy</label>
     <select id="vqcVsmLevel"></select>
     <label for="vqcVsmKind">Thế cờ xuất phát</label>
     <select id="vqcVsmKind"><option value="standard">Ván cờ thường (đủ quân)</option><option value="chernev">Cờ tàn Chernev — Trắng phải thắng</option></select>
     <div id="vqcVsmChernevRow" class="vqc-vsm-chrow" hidden>
      <select id="vqcVsmSection" aria-label="Chọn nhóm cờ tàn"></select>
      <button type="button" id="vqcVsmChPrev" aria-label="Bài trước">←</button>
      <label for="vqcVsmChernevNum">Bài</label><input id="vqcVsmChernevNum" type="number" min="1" max="300" value="1" inputmode="numeric">
      <button type="button" id="vqcVsmChNext" aria-label="Bài sau">→</button>
      <span id="vqcVsmChernevInfo"></span>
     </div>
    </fieldset>
    <p class="vqc-vsm-license">Động cơ: <a href="https://github.com/nmrugg/stockfish.js" target="_blank" rel="noopener">Stockfish 19</a> (giấy phép GNU GPL v3, <a href="https://github.com/official-stockfish/Stockfish" target="_blank" rel="noopener">mã nguồn</a>). Máy rất mạnh nhưng không phải lúc nào cũng chơi hoàn hảo.</p>
   </section>
  </div>
 </div>
</div>`;

function mountDom(){
 if(!$('vqcVsmCss')){
  const link=document.createElement('link');link.id='vqcVsmCss';link.rel='stylesheet';
  link.href='./css/vs-machine.css?v='+VERSION;document.head.append(link);
 }
 if(!$('vqcVsMachineOverlay')){
  const holder=document.createElement('div');holder.innerHTML=OVERLAY_HTML.trim();document.body.append(holder.firstElementChild);
 }
 const anchor0=$('mate3PdfMenu')||$('mateOnePdfMenu')||$('mateOneBasicMenu')||document.querySelector('.lesson');
 let anchor=anchor0;
 const addItem=(id,icon,text,onOpen)=>{
  if($(id))return $(id);
  const item=document.createElement('div');
  item.className='lesson';item.id=id;item.setAttribute('role','button');item.tabIndex=0;
  item.innerHTML='<div class="lesson-icon">'+icon+'</div> '+text;
  const launch=()=>{onOpen();if($('vqcVsMachineOverlay')?.classList.contains('open'))document.querySelectorAll('.lesson').forEach(n=>n.classList.toggle('active',n===item));};
  item.addEventListener('click',launch);
  item.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();launch();}});
  if(anchor){anchor.insertAdjacentElement('afterend',item);anchor=item;}
  return item;
 };
 addItem('vsChernevMenu','♚','Cờ tàn Chernev (đấu với máy)',()=>open({kind:'chernev',index:settings.chernev}));
 addItem('vsMachineMenu','🤖','Đấu với máy (ván đủ quân)',()=>open({kind:'standard'}));
}
function hookClassroom(){
 const closeOthers=window.vqcCloseOtherViews;
 if(typeof closeOthers==='function'&&!closeOthers.vqcVsmWrapped){
  const wrapped=function(target){const r=closeOthers.apply(this,arguments);if(target!=='vsmachine')hide();return r;};
  for(const k of Object.keys(closeOthers))wrapped[k]=closeOthers[k];
  wrapped.vqcVsmWrapped=true;
  window.vqcCloseOtherViews=wrapped;
 }
 const receiveView=window.vqcReceiveView;
 if(typeof receiveView==='function'&&!receiveView.vqcVsmWrapped){
  const wrapped=function(data){
   const result=receiveView.apply(this,arguments);
   try{
    if(data&&data.view==='vsmachine'&&data.stamp&&isStudent()){
     const raw=Number(data.index),el=$('vqcVsMachineOverlay');
     if(!isOpen||viewStamp!==data.stamp||!el||!el.classList.contains('open')){
      viewStamp=data.stamp;
      open(raw>=0?{kind:'chernev',index:raw,remote:true}:{kind:'standard',remote:true});
     }
    }
   }catch(e){console.warn('Không mở được Đấu với máy từ giáo viên',e);}
   return result;
  };
  for(const k of Object.keys(receiveView))wrapped[k]=receiveView[k];
  wrapped.vqcVsmWrapped=true;
  window.vqcReceiveView=wrapped;
 }
}
function init(){
 mountDom();
 loadPrefs();
 const lvl=$('vqcVsmLevel');
 if(lvl&&!lvl.options.length)LEVELS.forEach(l=>{const o=document.createElement('option');o.value=l.id;o.textContent=l.label+(l.id==='max'?' (mặc định)':'');lvl.append(o);});
 const secSel=$('vqcVsmSection');
 if(secSel&&!secSel.options.length&&Array.isArray(window.VQC_CHERNEV_SECTIONS))window.VQC_CHERNEV_SECTIONS.forEach(x=>{const o=document.createElement('option');o.value=String(x.from);o.textContent=x.name+' (bài '+x.from+'–'+x.to+')';secSel.append(o);});
 const setCh=n=>{const len=chernev().length||1;settings.chernev=((n%len)+len)%len;if(game)render();pushSetup();};
 $('vqcVsmSection')?.addEventListener('change',e=>{if(locked())return;setCh(parseInt(e.target.value,10)-1);newGame();});
 $('vqcVsmNextProblem')?.addEventListener('click',()=>{if(locked())return;setCh(preset.index+1);newGame();});
 $('vqcVsmClose')?.addEventListener('click',close);
 $('vqcVsMachineOverlay')?.addEventListener('click',e=>{if(e.target===$('vqcVsMachineOverlay'))close();});
 $('vqcVsmNew')?.addEventListener('click',()=>{if(sharedActive?!isTeacherInRoom():isStudent())return;newGame();});
 $('vqcVsmUndo')?.addEventListener('click',()=>{if(lockCtl())return;undo();});
 $('vqcVsmDraw')?.addEventListener('click',offerDraw);
 $('vqcVsmResign')?.addEventListener('click',resign);
 $('vqcVsmHint')?.addEventListener('click',analyze);
 $('vqcVsmRetry')?.addEventListener('click',retry);
 document.querySelectorAll('#vqcVsMachineOverlay [data-color]').forEach(b=>b.addEventListener('click',()=>{if(locked())return;settings.color=b.dataset.color;savePrefs();if(game)render();pushSetup();}));
 $('vqcVsmLevel')?.addEventListener('change',e=>{if(locked())return;settings.levelId=e.target.value;savePrefs();if(game)render();pushSetup();});
 $('vqcVsmKind')?.addEventListener('change',e=>{if(locked())return;settings.kind=e.target.value==='chernev'&&chernev().length?'chernev':'standard';if(game)render();pushSetup();});
 $('vqcVsmChPrev')?.addEventListener('click',()=>{if(locked())return;setCh(settings.chernev-1);newGame();});
 $('vqcVsmChNext')?.addEventListener('click',()=>{if(locked())return;setCh(settings.chernev+1);newGame();});
 $('vqcVsmChernevNum')?.addEventListener('change',e=>{if(locked())return;const v=parseInt(e.target.value,10);if(!isNaN(v)){setCh(v-1);newGame();}});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&isOpen&&!promotion)close();});
 const ov=$('vqcVsMachineOverlay');
 if(ov&&typeof MutationObserver==='function'){
  new MutationObserver(()=>{if(isOpen&&!ov.classList.contains('open'))hide();}).observe(ov,{attributes:true,attributeFilter:['class']});
 }
 window.addEventListener('pagehide',()=>{cancelAll();disposeEngine();detachListener();});
 hookClassroom();
}
window.vqcVsMachineOpen=function(kind,index){open({kind:kind==='standard'?'standard':'chernev',index:Number.isInteger(index)?index:undefined});};
window.vqcVsMachine={open,close,hide,newGame,undo,resign,offerDraw,analyze,retry,state,levels:LEVELS.map(l=>({...l})),version:VERSION,
 ext:{ref:vsmRef,uid:myUid,name:myName,room:()=>sCode||roomCode(),open:()=>isOpen,student:isStudent,shared:()=>sharedActive,render,refreshMarks,
  unregisterAdapter:()=>{if(sharedActive)unregisterAdapter();},registerAdapter:()=>{if(sharedActive)registerAdapter();}}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
