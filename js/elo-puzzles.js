(function(){
'use strict';
if(window.vqcEloPuzzles)return;
const VERSION='20261126-elo-v4';
const FILES='abcdefgh';
const THEME_VI={
 mateIn1:'Chiếu hết 1 nước',mateIn2:'Chiếu hết 2 nước',mateIn3:'Chiếu hết 3 nước',fork:'Đòn đánh đôi',pin:'Ghim quân',skewer:'Đòn xiên',
 discoveredAttack:'Đòn lộ quân',hangingPiece:'Quân bỏ không',endgame:'Cờ tàn',middlegame:'Trung cuộc',opening:'Khai cuộc',
 backRankMate:'Chiếu hết hàng cuối',smotheredMate:'Chiếu hết ngạt',promotion:'Phong cấp',trappedPiece:'Quân bị nhốt',sacrifice:'Hy sinh quân',
 deflection:'Kéo quân đi',attraction:'Dụ quân',defensiveMove:'Nước phòng thủ',quietMove:'Nước đi êm',exposedKing:'Vua hở',clearance:'Dọn đường',
 interference:'Chặn đường',doubleCheck:'Chiếu đôi',capturingDefender:'Ăn quân bảo vệ',advancedPawn:'Tốt tiến xa',rookEndgame:'Cờ tàn Xe',
 pawnEndgame:'Cờ tàn Tốt',queenEndgame:'Cờ tàn Hậu',bishopEndgame:'Cờ tàn Tượng',knightEndgame:'Cờ tàn Mã',zugzwang:'Thế bắt buộc đi',attackingF2F7:'Tấn công f2/f7',
 arabianMate:'Chiếu hết kiểu Ả Rập',anastasiaMate:'Chiếu hết Anastasia',hookMate:'Chiếu hết móc câu',bodenMate:'Chiếu hết Boden',dovetailMate:'Chiếu hết đuôi én'
};
const PNAME={k:'Vua',q:'Hậu',r:'Xe',b:'Tượng',n:'Mã',p:'Tốt'};

let S=null,P=null,game=null,applied=0,lastMove=null,selected=null,promo=null;
let status='idle',result=null,wrongTimer=0,giveTimer=0,confirmGive=false,busy=false,errorText='';
let token=0,timers=[],isOpen=false,lastDelta=null;
let mode='solo',sess=null,offset=0,clockTimer=0;
let ptr=null,lastPtrSid=null,dismissedSid=null,roomSub=null,roomOff=null;
let inkSid='',inkOffs=[],inkAll='',inkMine='';

function $(id){return document.getElementById(id);}
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
function notify(t,k){if(typeof window.vqcNotify==='function')window.vqcNotify(t,k||'warning');}
function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}
function later(fn,ms){const my=token;const t=setTimeout(function(){timers=timers.filter(function(x){return x!==t;});if(my===token&&isOpen)fn();},ms);timers.push(t);return t;}
function clearTimers(){timers.forEach(clearTimeout);timers=[];clearTimeout(wrongTimer);}
function role(){return window.accountProfile&&window.accountProfile.role||'';}
function newNonce(){
 const a='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
 const b=new Uint8Array(20);
 (window.crypto||window.msCrypto).getRandomValues(b);
 let s='';
 for(let i=0;i<b.length;i++)s+=a[b[i]%62];
 return s;
}
function retryable(e){
 const c=String(e&&e.code||'');
 return /unavailable|deadline|internal|aborted|network|unknown/i.test(c);
}
function errText(e){
 const c=String(e&&e.code||''),m=String(e&&e.message||'');
 if(/permission-denied/.test(c)&&/insufficient permissions/i.test(m))return 'Chưa có quyền lưu điểm Câu đố. Hãy báo giáo viên hoặc người quản trị cập nhật luật Firestore (Rules).';
 if(/unauthenticated/.test(c))return 'Phiên đăng nhập đã hết. Em hãy đăng nhập lại nhé.';
 if(/unavailable|deadline|network/.test(c)||(typeof navigator!=='undefined'&&navigator.onLine===false))return 'Mất kết nối mạng. Em kiểm tra Internet rồi thử lại nhé.';
 if(/internal|unknown/.test(c))return 'Hệ thống đang bận. Em thử lại sau ít giây nhé.';
 return m||'Có lỗi xảy ra. Em thử lại nhé.';
}
async function call(name,payload){
 if(!window.vqcEloLocal||typeof window.vqcEloLocal.call!=='function'){
  const e=new Error('Chưa tải xong chức năng câu đố. Em thử lại sau ít giây nhé.');e.code='unavailable';throw e;
 }
 if(typeof navigator!=='undefined'&&navigator.onLine===false){
  const e=new Error('Mất kết nối mạng.');e.code='unavailable';throw e;
 }
 let err=null;
 for(let i=0;i<3;i++){
  try{
   return await window.vqcEloLocal.call(name,payload);
  }catch(e){
   err=e;
   if(!retryable(e))throw e;
   await sleep(700*(i+1));
  }
 }
 throw err;
}

function sideName(c){return c==='w'?'Trắng':'Đen';}
function kingSquare(g,color){
 const b=g.board();
 for(let r=0;r<8;r++)for(let f=0;f<8;f++){const p=b[r][f];if(p&&p.type==='k'&&p.color===color)return FILES[f]+(8-r);}
 return null;
}
function applyUci(u){
 if(!u||!game||u.length<4)return null;
 let m=null;
 try{m=game.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u.length>4?u[4]:undefined});}catch(e){m=null;}
 return m;
}
function setLast(u){lastMove=u&&u.length>=4?{from:u.slice(0,2),to:u.slice(2,4)}:null;}
function chipThemes(){
 if(!P)return [];
 const list=P.themes.filter(function(t){return THEME_VI[t];});
 list.sort(function(a,b){return (/^mateIn/.test(b)?1:0)-(/^mateIn/.test(a)?1:0);});
 return list.slice(0,3).map(function(t){return THEME_VI[t];});
}
function canPlay(){return status==='play'&&!busy;}

function msgFor(){
 if(status==='loading')return {t:'Đang tìm câu đố hợp với em…',k:''};
 if(status==='nodata')return {t:errorText||'Chưa tải được câu đố. Em thử lại nhé.',k:'bad'};
 if(status==='intro')return {t:'Xem đối thủ đi nước đầu tiên…',k:''};
 if(status==='check')return {t:'Đang kiểm tra nước đi…',k:''};
 if(status==='wrong')return {t:'Chưa đúng rồi. Em thử nước khác nhé!',k:'bad'};
 if(status==='opp')return {t:'Đúng rồi! Đối thủ đang đáp lại…',k:'ok'};
 if(status==='play'){
  if(P&&P.hintLevel>=2)return {t:'Gợi ý: đi quân đang sáng đến ô được đánh dấu.',k:'hint'};
  if(P&&P.hintLevel===1)return {t:'Gợi ý: hãy chú ý quân đang được đánh dấu.',k:'hint'};
  return {t:sideName(P?P.color:'w')+' đi — hãy tìm nước đi tốt nhất!',k:''};
 }
 if(status==='solved'){
  if(result&&result.clean)return {t:'Giỏi lắm! Em giải đúng ngay từ lần đầu.',k:'ok'};
  return {t:'Em đã giải được câu đố, nhưng có sai hoặc dùng gợi ý nên Elo tăng ít hơn.',k:'hint'};
 }
 if(status==='failed')return {t:'Đây là đáp án. Cùng xem lại và thử câu tiếp theo nhé!',k:'bad'};
 if(status==='expired')return {t:'Đã hết giờ cho câu này. Elo của em không bị thay đổi.',k:'hint'};
 if(status==='ended')return {t:'Giáo viên đã kết thúc câu đố này. Elo của em không bị thay đổi.',k:'hint'};
 return {t:'',k:''};
}

function paintBoard(){
 const board=$('vqcEloBoard');if(!board)return;
 board.replaceChildren();
 if(!game)return;
 const flip=P&&P.color==='b';
 const ranks=flip?[1,2,3,4,5,6,7,8]:[8,7,6,5,4,3,2,1],files=flip?FILES.split('').reverse():FILES.split('');
 const playable=canPlay();
 const legal=playable&&selected?game.moves({square:selected,verbose:true}).map(function(m){return m.to;}):[];
 const checkSq=game.in_check()?kingSquare(game,game.turn()):null;
 const hf=status==='play'&&P&&P.hint?P.hint.from:'',ht=status==='play'&&P&&P.hint&&P.hint.to?P.hint.to:'';
 for(let ri=0;ri<8;ri++)for(let fi=0;fi<8;fi++){
  const sq=files[fi]+ranks[ri],p=game.get(sq);
  const b=el('button','vqc-elo-cell '+((ri+fi)%2?'dark':'light'));
  b.type='button';b.dataset.square=sq;
  if(selected===sq)b.classList.add('selected');
  if(legal.indexOf(sq)>=0)b.classList.add('legal');
  if(lastMove&&lastMove.from===sq)b.classList.add('vqc-last-from');
  if(lastMove&&lastMove.to===sq)b.classList.add('vqc-last-to');
  if(checkSq===sq)b.classList.add('in-check');
  if(hf===sq)b.classList.add('hint-from');
  if(ht===sq)b.classList.add('hint-to');
  b.setAttribute('aria-label','Ô '+sq+(p?' '+(p.color==='w'?'trắng ':'đen ')+PNAME[p.type]:''));
  if(!playable)b.classList.add('ro');
  if(p){
   const code=p.color==='w'?p.type.toUpperCase():p.type;
   const s=el('span','vqc-elo-pieceimg');
   if(typeof pieceSvgMarkup==='function')s.innerHTML=pieceSvgMarkup(code);
   else s.textContent=({K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'})[code];
   b.append(s);
  }
  if(fi===0)b.append(el('span','vqc-elo-rank',String(ranks[ri])));
  if(ri===7)b.append(el('span','vqc-elo-file',files[fi]));
  board.append(b);
 }
}
function paintPromo(){
 const box=$('vqcEloPromo');if(!box)return;
 box.replaceChildren();box.hidden=!promo;if(!promo)return;
 box.append(el('p','','Tốt phong cấp thành:'));
 const row=el('div','vqc-elo-promo-row');
 ['q','r','b','n'].forEach(function(k){
  const b=el('button');b.type='button';
  const code=promo.color==='w'?k.toUpperCase():k;
  const g=el('span','vqc-elo-promo-piece');
  if(typeof pieceSvgMarkup==='function')g.innerHTML=pieceSvgMarkup(code);else g.textContent=k.toUpperCase();
  b.append(g,el('span','',PNAME[k]));
  b.addEventListener('click',function(){const p=promo;promo=null;tryMove(p.from,p.to,k);});
  row.append(b);
 });
 box.append(row);
}
function sparkSvg(values){
 const v=(values||[]).slice(-24);
 if(v.length<2)return '';
 const w=150,h=38,pad=3;
 const lo=Math.min.apply(null,v),hi=Math.max.apply(null,v),span=Math.max(10,hi-lo);
 const pts=v.map(function(x,i){return (pad+i*(w-2*pad)/(v.length-1)).toFixed(1)+','+(h-pad-(x-lo)*(h-2*pad)/span).toFixed(1);});
 const last=pts[pts.length-1].split(',');
 return '<svg viewBox="0 0 '+w+' '+h+'" width="'+w+'" height="'+h+'" role="img" aria-label="Elo gần đây"><polyline fill="none" stroke="#2878cc" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" points="'+pts.join(' ')+'"/><circle cx="'+last[0]+'" cy="'+last[1]+'" r="3.6" fill="#2f9e6e"/></svg>';
}
function clockText(){
 if(!sess||sess.endsAt==null)return sess?'Không giới hạn thời gian':'';
 const rem=Math.max(0,Math.ceil((sess.endsAt-(Date.now()+offset))/1000));
 const m=Math.floor(rem/60),s=rem%60;
 return '⏱ '+m+':'+(s<10?'0':'')+s;
}
function paintSession(){
 const box=$('vqcEloSession');if(!box)return;
 const on=mode==='session'&&!!sess;
 box.hidden=!on;
 if(!on)return;
 $('vqcEloClock').textContent=clockText();
 const c=$('vqcEloClassDone');
 c.textContent=ptr&&ptr.sid===sess.id&&Number.isFinite(ptr.total)&&ptr.total>0?'Cả lớp: '+(ptr.done||0)+'/'+ptr.total+' em đã xong':'';
}
function paintPanel(){
 const st=S||{elo:'—',games:0,solved:0,streak:0,best:'—',history:[]};
 $('vqcEloRating').textContent=String(st.elo);
 const d=$('vqcEloDelta');
 const showDelta=lastDelta!=null&&(status==='solved'||status==='failed');
 if(!showDelta){d.textContent='';d.className='vqc-elo-delta';}
 else{d.textContent=(lastDelta>0?'+':lastDelta<0?'−':'±')+Math.abs(lastDelta);d.className='vqc-elo-delta '+(lastDelta>0?'up':lastDelta<0?'down':'');}
 $('vqcEloStreak').textContent=String(st.streak);
 $('vqcEloSolved').textContent=st.solved+' / '+st.games;
 $('vqcEloBest').textContent=String(st.best);
 $('vqcEloSpark').innerHTML=sparkSvg(st.history);
 $('vqcEloPuzzleRating').textContent=P&&status!=='loading'&&status!=='nodata'?String(P.rating):'—';
 const m=msgFor(),box=$('vqcEloMsg');box.textContent=m.t;box.className='vqc-elo-msg'+(m.k?' '+m.k:'');
 const chips=$('vqcEloThemes');chips.replaceChildren();
 if(P&&status!=='loading'&&status!=='nodata')chipThemes().forEach(function(t){chips.append(el('span','vqc-elo-chip',t));});
 const active=status==='play'||status==='wrong';
 const noHint=mode==='session'&&sess&&sess.hints===false;
 $('vqcEloHint').disabled=!(status==='play')||busy;
 $('vqcEloHint').hidden=!!noHint;
 $('vqcEloAnswer').disabled=!active||busy;
 $('vqcEloAnswer').textContent=confirmGive?'Bấm lần nữa để xem đáp án':'🏳️ Xem đáp án';
 const finished=status==='solved'||status==='failed'||status==='expired'||status==='ended';
 const nb=$('vqcEloNext');
 nb.disabled=!(finished||status==='nodata');
 nb.textContent=status==='nodata'?'Thử tải lại':(mode==='session'?'Luyện thêm câu khác →':'Câu tiếp theo →');
 const side=$('vqcEloSide');
 side.textContent=P&&game&&status!=='loading'&&status!=='nodata'?('Em cầm quân '+(P.color==='w'?'Trắng ⚪':'Đen ⚫')):'';
 paintSession();
}
function paint(){
 if(!isOpen)return;
 paintBoard();paintPromo();paintPanel();syncInk();
}

/* Nét vẽ của giáo viên: chỉ đọc, hiện phía trên bàn cờ (cho riêng em này và/hoặc cho cả lớp). */
function myUid(){try{return auth.currentUser.uid;}catch(e){return '';}}
function paintInk(){
 const svg=$('vqcEloInk');if(!svg)return;
 const I=window.vqcEloInk;
 if(!I||!inkSid||!isOpen){svg.replaceChildren();return;}
 I.render(svg,I.parse(inkAll).concat(I.parse(inkMine)),!!(P&&P.color==='b'));
}
function stopInk(){
 inkOffs.forEach(function(u){try{u();}catch(e){}});
 inkOffs=[];inkSid='';inkAll='';inkMine='';
 paintInk();
}
function inkChanged(prev,next){
 if(!prev&&next)notify('Giáo viên vừa vẽ lên bàn cờ của em. Hãy nhìn kỹ nhé!','success');
}
function syncInk(){
 const want=isOpen&&mode==='session'&&sess&&sess.id?String(sess.id):'';
 if(!want){if(inkSid)stopInk();else paintInk();return;}
 if(inkSid!==want){
  stopInk();
  const uid=myUid();
  let dbRef=null;
  try{dbRef=typeof db!=='undefined'&&db?db:null;}catch(e){dbRef=null;}
  if(!uid||!dbRef)return;
  inkSid=want;
  try{
   const sref=dbRef.collection('eloSessions').doc(want);
   inkOffs.push(sref.onSnapshot(function(sn){
    if(inkSid!==want)return;
    const v=sn&&sn.exists?String((sn.data()||{}).ink||''):'';
    inkChanged(inkAll,v);inkAll=v;paintInk();
   },function(){}));
   inkOffs.push(sref.collection('players').doc(uid).onSnapshot(function(sn){
    if(inkSid!==want)return;
    const v=sn&&sn.exists?String((sn.data()||{}).ink||''):'';
    inkChanged(inkMine,v);inkMine=v;paintInk();
   },function(){}));
  }catch(e){}
 }
 paintInk();
}

function onCell(sq){
 if(!canPlay()||promo||!game)return;
 if(selected){
  const mv=game.moves({square:selected,verbose:true}).filter(function(m){return m.to===sq;});
  if(mv.length){
   if(mv.some(function(m){return m.promotion;})){promo={from:selected,to:sq,color:game.turn()};paint();return;}
   tryMove(selected,sq);return;
  }
 }
 const p=game.get(sq);
 selected=p&&p.color===game.turn()&&selected!==sq?sq:null;
 paint();
}

function finishFrom(r){
 clearTimeout(wrongTimer);
 result=r.result||null;
 if(r.stats)S=r.stats;
 lastDelta=result&&Number.isFinite(result.delta)?result.delta:null;
 const st=r.status;
 status=st==='solved'?'solved':st==='failed'?'failed':'expired';
 selected=null;promo=null;
}
function expireNow(){
 clearTimeout(wrongTimer);
 status=mode==='session'&&sess&&sess.open!==false&&ptr&&ptr.active===false?'ended':'expired';
 selected=null;promo=null;
}
async function resync(my){
 try{
  const v=mode==='session'&&sess?await call('eloPuzzleStart',{sessionId:sess.id}):await call('eloPuzzleStart',{nonce:newNonce()});
  if(my!==token||!isOpen)return;
  loadView(v);
 }catch(e){
  if(my!==token||!isOpen)return;
  status='nodata';errorText=errText(e);paint();
 }
}
async function tryMove(from,to,pr){
 if(!canPlay()||!game)return;
 const prev=lastMove;
 let m=null;
 try{m=game.move({from:from,to:to,promotion:pr});}catch(e){m=null;}
 selected=null;
 if(!m){paint();return;}
 setLast(from+to);
 status='check';busy=true;paint();
 const my=token,n=P.n+1;
 let r=null;
 try{
  r=await call('eloPuzzleMove',{attemptId:P.attemptId,n:n,from:from,to:to,promotion:m.promotion||undefined});
 }catch(e){
  busy=false;
  if(my!==token||!isOpen)return;
  const c=String(e&&e.code||'');
  if(/invalid-argument/.test(c)){try{game.undo();}catch(x){}lastMove=prev;status='play';notify(errText(e));paint();return;}
  await resync(my);
  return;
 }
 busy=false;
 if(my!==token||!isOpen)return;
 P.n=n;
 if(r.expired){expireNow();paint();return;}
 if(r.done){
  if(r.correct)applied+=1;
  finishFrom(r);paint();return;
 }
 if(r.correct===false){
  P.mistakes=r.mistakes;
  status='wrong';paint();
  wrongTimer=setTimeout(function(){
   if(!isOpen||status!=='wrong')return;
   try{game.undo();}catch(e){}
   lastMove=prev;status='play';paint();
  },800);
  return;
 }
 applied+=1;P.hint=null;
 status='opp';paint();
 later(function(){
  const x=applyUci(r.reply);
  if(x){setLast(r.reply);applied+=1;}
  status='play';paint();
 },450);
}
async function revealAnswer(){
 if((status!=='play'&&status!=='wrong')||busy)return;
 if(!confirmGive){
  confirmGive=true;clearTimeout(giveTimer);
  giveTimer=setTimeout(function(){confirmGive=false;paint();},4000);
  paint();return;
 }
 confirmGive=false;clearTimeout(giveTimer);
 clearTimeout(wrongTimer);
 if(status==='wrong'){try{game.undo();}catch(e){}}
 status='check';busy=true;paint();
 const my=token,n=P.n+1;
 let r=null;
 try{r=await call('eloPuzzleGiveUp',{attemptId:P.attemptId,n:n});}
 catch(e){busy=false;if(my!==token||!isOpen)return;await resync(my);return;}
 busy=false;
 if(my!==token||!isOpen)return;
 P.n=n;
 if(r.expired){expireNow();paint();return;}
 finishFrom(r);paint();
 const moves=result&&Array.isArray(result.moves)?result.moves:[];
 const step=function(){
  const u=moves[applied];
  if(!u||!game)return;
  const x=applyUci(u);
  if(!x)return;
  setLast(u);applied++;paint();
  if(applied<moves.length)later(step,850);
 };
 later(step,500);
}
async function giveHint(){
 if(status!=='play'||busy||!P)return;
 if(mode==='session'&&sess&&sess.hints===false)return;
 busy=true;paint();
 const my=token,n=P.n+1;
 let r=null;
 try{r=await call('eloPuzzleHint',{attemptId:P.attemptId,n:n});}
 catch(e){
  busy=false;
  if(my!==token||!isOpen)return;
  const c=String(e&&e.code||'');
  if(/failed-precondition|invalid-argument|permission/.test(c)){notify(errText(e));paint();return;}
  await resync(my);return;
 }
 busy=false;
 if(my!==token||!isOpen)return;
 P.n=n;
 if(r.expired){expireNow();paint();return;}
 if(r.done){finishFrom(r);paint();return;}
 P.hintLevel=r.hintLevel;P.hint={from:r.from,to:r.to};
 paint();
}

function loadView(v){
 clearTimers();busy=false;
 const g=new Chess();
 if(!g.load(v.fen)){status='nodata';errorText='Câu đố này bị lỗi. Em thử câu khác nhé.';paint();return;}
 game=g;
 P={attemptId:v.attemptId,n:v.n||0,fen:v.fen,color:v.color,rating:v.puzzleRating,themes:v.themes||[],mistakes:v.mistakes||0,hintLevel:v.hintLevel||0,hint:v.hint||null};
 S=v.stats;offset=(Number(v.serverNow)||Date.now())-Date.now();
 sess=v.session||null;mode=sess?'session':'solo';
 applied=0;lastMove=null;selected=null;promo=null;result=v.result||null;lastDelta=null;confirmGive=false;errorText='';
 const first=v.first,played=v.played||[];
 const finished=v.status&&v.status!=='active';
 const closed=!!(sess&&sess.open===false);
 if(finished||closed||played.length||P.n>0||P.mistakes>0||P.hintLevel>0){
  const seq=[first].concat(played);
  if(finished&&result&&Array.isArray(result.moves))seq.splice(0,seq.length,...result.moves);
  seq.forEach(function(u){const m=applyUci(u);if(m){setLast(u);applied++;}});
  if(finished){
   status=v.status==='solved'?'solved':v.status==='failed'?'failed':'expired';
   lastDelta=result&&Number.isFinite(result.delta)?result.delta:null;
  }else if(closed){
   status=ptr&&ptr.sid===sess.id&&ptr.active===false?'ended':'expired';
  }else status='play';
  paint();startClock();return;
 }
 status='intro';paint();startClock();
 later(function(){
  const m=applyUci(first);
  if(!m){status='nodata';errorText='Câu đố này bị lỗi. Em thử câu khác nhé.';paint();return;}
  setLast(first);applied=1;status='play';paint();
 },800);
}
function startClock(){
 clearInterval(clockTimer);
 if(!(mode==='session'&&sess))return;
 clockTimer=setInterval(function(){
  if(!isOpen||!(mode==='session'&&sess)){clearInterval(clockTimer);return;}
  const rem=sess.endsAt==null?1:sess.endsAt-(Date.now()+offset);
  if(rem<-3500&&(status==='play'||status==='wrong'||status==='intro'||status==='opp')&&!busy){
   expireNow();paint();return;
  }
  const c=$('vqcEloClock');if(c)c.textContent=clockText();
 },500);
}
function resetView(){
 token++;clearTimers();clearTimeout(giveTimer);clearInterval(clockTimer);
 status='loading';P=null;game=null;selected=null;promo=null;result=null;lastMove=null;applied=0;confirmGive=false;busy=false;errorText='';
}
async function nextPuzzle(){
 resetView();
 mode='solo';sess=null;
 const my=token;
 paint();
 try{
  const v=await call('eloPuzzleStart',{nonce:newNonce()});
  if(my!==token||!isOpen)return;
  loadView(v);
 }catch(e){
  if(my!==token)return;
  status='nodata';errorText=errText(e);paint();
 }
}
async function sessionPuzzle(sid){
 resetView();
 mode='session';
 const my=token;
 paint();
 try{
  const v=await call('eloPuzzleStart',{sessionId:sid});
  if(my!==token||!isOpen)return;
  if(!v.session||(v.session.open===false&&v.status==='active')){nextPuzzle();return;}
  loadView(v);
 }catch(e){
  if(my!==token||!isOpen)return;
  nextPuzzle();
 }
}

const OVERLAY_HTML=`<div id="vqcEloOverlay" role="dialog" aria-modal="true" aria-labelledby="vqcEloTitle">
 <div class="vqc-elo-dialog">
  <div class="vqc-elo-top">
   <div><h2 id="vqcEloTitle">🧩 Câu đố theo Elo</h2><p>Câu đố tự tăng hoặc giảm độ khó theo trình độ của em.</p></div>
   <div class="vqc-elo-topbtns">
    <button type="button" id="vqcEloTable" class="vqc-elo-teacher" hidden>📊 Bảng Elo lớp</button>
    <button type="button" id="vqcEloLive" class="vqc-elo-teacher" hidden>🎯 Cả lớp cùng một câu</button>
    <button type="button" id="vqcEloClose" aria-label="Đóng">✕ Đóng</button>
   </div>
  </div>
  <div class="vqc-elo-layout">
   <div class="vqc-elo-boardcol">
    <div class="vqc-elo-boardwrap">
     <div id="vqcEloBoard" class="vqc-elo-board" aria-label="Bàn cờ câu đố"></div>
     <svg id="vqcEloInk" class="vqc-elo-ink" viewBox="0 0 800 800" aria-hidden="true"></svg>
     <div id="vqcEloPromo" class="vqc-elo-promo" hidden></div>
    </div>
   </div>
   <section class="vqc-elo-side">
    <div id="vqcEloSession" class="vqc-elo-sessionbar" hidden><b>👥 Cả lớp cùng một câu</b><span id="vqcEloClock"></span><span id="vqcEloClassDone"></span></div>
    <div class="vqc-elo-card">
     <div class="vqc-elo-ratingbox"><span class="vqc-elo-label">Elo của em</span><strong id="vqcEloRating">600</strong><b id="vqcEloDelta" class="vqc-elo-delta"></b></div>
     <div id="vqcEloSpark" class="vqc-elo-spark"></div>
     <div class="vqc-elo-stats">
      <div><span>🔥 Chuỗi đúng</span><b id="vqcEloStreak">0</b></div>
      <div><span>✅ Đúng / đã làm</span><b id="vqcEloSolved">0 / 0</b></div>
      <div><span>🏆 Cao nhất</span><b id="vqcEloBest">600</b></div>
      <div><span>🎯 Độ khó câu này</span><b id="vqcEloPuzzleRating">—</b></div>
     </div>
    </div>
    <p id="vqcEloSide" class="vqc-elo-sidenote"></p>
    <p id="vqcEloMsg" class="vqc-elo-msg" role="status" aria-live="polite"></p>
    <div id="vqcEloThemes" class="vqc-elo-themes"></div>
    <div class="vqc-elo-btns">
     <button type="button" id="vqcEloHint" class="vqc-elo-btn">💡 Gợi ý</button>
     <button type="button" id="vqcEloAnswer" class="vqc-elo-btn">🏳️ Xem đáp án</button>
    </div>
    <div class="vqc-elo-foot">
     <button type="button" id="vqcEloNext" class="vqc-elo-btn primary">Câu tiếp theo →</button>
    </div>
    <p class="vqc-elo-credit">Câu đố từ <a href="https://database.lichess.org/#puzzles" target="_blank" rel="noopener">cơ sở dữ liệu câu đố của Lichess</a> (CC0). Elo của em được tính và lưu theo tài khoản.</p>
   </section>
  </div>
  <div id="vqcEloTeacherHost" class="vqc-elo-teacherhost" hidden></div>
 </div>
</div>`;

function bind(){
 $('vqcEloClose').addEventListener('click',close);
 $('vqcEloHint').addEventListener('click',giveHint);
 $('vqcEloAnswer').addEventListener('click',revealAnswer);
 $('vqcEloNext').addEventListener('click',function(){nextPuzzle();});
 $('vqcEloTable').addEventListener('click',function(){if(window.vqcEloClass)window.vqcEloClass.openTable();});
 $('vqcEloLive').addEventListener('click',function(){if(window.vqcEloClass)window.vqcEloClass.openSession();});
 $('vqcEloBoard').addEventListener('click',function(e){
  const c=e.target.closest('.vqc-elo-cell');if(!c)return;
  onCell(c.dataset.square);
 });
 $('vqcEloOverlay').addEventListener('keydown',function(e){
  if(e.key==='Escape'){e.stopPropagation();close();}
 });
}
function ensureOverlay(){
 if($('vqcEloOverlay'))return;
 const holder=document.createElement('div');holder.innerHTML=OVERLAY_HTML.trim();
 document.body.append(holder.firstElementChild);
 bind();
}
function showOverlay(){
 ensureOverlay();
 if(typeof window.vqcCloseOtherViews==='function')window.vqcCloseOtherViews('elopuzzle');
 isOpen=true;
 $('vqcEloOverlay').classList.add('open');
 const t=role()==='teacher';
 $('vqcEloTable').hidden=!t;$('vqcEloLive').hidden=!t;
 if(window.vqcEloClass&&window.vqcEloClass.hide)window.vqcEloClass.hide();
 setTimeout(function(){const b=$('vqcEloClose');if(b)b.focus();},0);
}
function open(){
 if(typeof Chess!=='function'){notify('Chưa thể mở: thư viện luật cờ vua chưa được tải.');return;}
 if(!window.accountProfile){if(typeof showAccountPanel==='function')showAccountPanel();else notify('Em hãy đăng nhập để luyện câu đố nhé.');return;}
 showOverlay();
 if(role()==='student'&&ptr&&ptr.active&&ptr.sid)sessionPuzzle(ptr.sid);
 else nextPuzzle();
}
async function autoOpenSession(sid){
 if(typeof Chess!=='function'||role()!=='student')return;
 let v=null;
 try{v=await call('eloPuzzleStart',{sessionId:sid});}catch(e){return;}
 if(!v||!v.session)return;
 if(v.session.open===false&&v.status==='active')return;
 if(isOpen&&mode==='session'&&sess&&sess.id===sid)return;
 showOverlay();
 resetView();
 isOpen=true;
 loadView(v);
 notify('Giáo viên vừa gửi một câu đố cho cả lớp. Em hãy giải thật nhanh và đúng nhé!','success');
}
function close(){
 if(!isOpen)return;
 if(mode==='session'&&sess)dismissedSid=sess.id;
 isOpen=false;token++;clearTimers();clearTimeout(giveTimer);clearInterval(clockTimer);confirmGive=false;busy=false;stopInk();
 const o=$('vqcEloOverlay');if(o)o.classList.remove('open');
 if(window.vqcEloClass&&window.vqcEloClass.hide)window.vqcEloClass.hide();
}

function onPointer(data){
 const p=data&&data.eloSession||null;
 ptr=p&&p.sid?p:null;
 if(!ptr){lastPtrSid=null;paintSession();return;}
 if(role()==='student'){
  if(ptr.active&&ptr.sid!==lastPtrSid){
   lastPtrSid=ptr.sid;
   if(ptr.sid!==dismissedSid)autoOpenSession(ptr.sid);
  }
  if(ptr.active===false&&isOpen&&mode==='session'&&sess&&sess.id===ptr.sid&&(status==='play'||status==='wrong'||status==='intro'||status==='opp')&&!busy){
   status='ended';paint();notify('Giáo viên đã kết thúc câu đố cho cả lớp.','warning');
  }
 }
 paintSession();
}
function watchRoom(){
 setInterval(function(){
  let ref=null;
  try{ref=typeof roomRef!=='undefined'&&roomRef?roomRef:null;}catch(e){ref=null;}
  if(ref===roomSub)return;
  if(roomOff){try{roomOff();}catch(e){}roomOff=null;}
  roomSub=ref;ptr=null;lastPtrSid=null;dismissedSid=null;
  if(ref&&typeof ref.onSnapshot==='function'){
   roomOff=ref.onSnapshot(function(s){if(s&&s.exists)try{onPointer(s.data());}catch(e){}},function(){});
  }
 },1000);
}

function ensureMenu(){
 if($('vqcEloMenu'))return;
 const anchor=$('beginnerPuzzleMenu')||$('pvpMenu')||document.querySelector('.lesson');
 if(!anchor)return;
 const item=document.createElement('div');
 item.className='lesson';item.id='vqcEloMenu';item.setAttribute('role','button');item.tabIndex=0;
 item.innerHTML='<div class="lesson-icon">🧩</div> Câu đố theo Elo';
 item.addEventListener('click',open);
 item.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});
 anchor.insertAdjacentElement('afterend',item);
}

window.vqcEloPuzzles={open:open,close:close,version:VERSION,
 shared:{call:call,errText:errText,el:el,THEME_VI:THEME_VI,notify:notify,role:role,sleep:sleep,newNonce:newNonce,applyIsOpen:function(){return isOpen;}}};
window.vqcEloPuzzlesHide=close;
function init(){ensureMenu();watchRoom();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();
