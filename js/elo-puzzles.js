(function(){
'use strict';
if(window.vqcEloPuzzles)return;
const VERSION='20261126-elo-v1';
const FILES='abcdefgh';
const BASE='./data/puzzles/';
const START_ELO=600,MIN_ELO=200,MAX_ELO=2200,SEEN_LIMIT=400;
const THEME_VI={
 mateIn1:'Chiếu hết 1 nước',mateIn2:'Chiếu hết 2 nước',mateIn3:'Chiếu hết 3 nước',fork:'Đòn đánh đôi',pin:'Ghim quân',skewer:'Đòn xiên',
 discoveredAttack:'Đòn lộ quân',hangingPiece:'Quân bỏ không',endgame:'Cờ tàn',middlegame:'Trung cuộc',opening:'Khai cuộc',
 backRankMate:'Chiếu hết hàng cuối',smotheredMate:'Chiếu hết ngạt',promotion:'Phong cấp',trappedPiece:'Quân bị nhốt',sacrifice:'Hy sinh quân',
 deflection:'Kéo quân đi',attraction:'Dụ quân',defensiveMove:'Nước phòng thủ',quietMove:'Nước đi êm',exposedKing:'Vua hở',clearance:'Dọn đường',
 interference:'Chặn đường',doubleCheck:'Chiếu đôi',capturingDefender:'Ăn quân bảo vệ',advancedPawn:'Tốt tiến xa',rookEndgame:'Cờ tàn Xe',
 pawnEndgame:'Cờ tàn Tốt',queenEndgame:'Cờ tàn Hậu',bishopEndgame:'Cờ tàn Tượng',knightEndgame:'Cờ tàn Mã',zugzwang:'Thế bắt buộc đi',attackingF2F7:'Tấn công f2/f7'
};
const PNAME={k:'Vua',q:'Hậu',r:'Xe',b:'Tượng',n:'Mã',p:'Tốt'};

let manifest=null,manifestFail=false,bandCache={};
let S=null,P=null,game=null,idx=0,lastMove=null,selected=null,promo=null;
let mistakes=0,assisted=false,hintLevel=0,done=false,status='idle',result=null,wrongTimer=0,resetTimer=0,confirmReset=false;
let token=0,timers=[],isOpen=false,lastDelta=null;

function $(id){return document.getElementById(id);}
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
function notify(t,k){if(typeof window.vqcNotify==='function')window.vqcNotify(t,k||'warning');}
function later(fn,ms){const my=token;const t=setTimeout(function(){timers=timers.filter(function(x){return x!==t;});if(my===token&&isOpen)fn();},ms);timers.push(t);return t;}
function clearTimers(){timers.forEach(clearTimeout);timers=[];clearTimeout(wrongTimer);}
function uid(){
 try{if(typeof auth!=='undefined'&&auth.currentUser&&auth.currentUser.uid)return auth.currentUser.uid;}catch(e){}
 try{if(window.accountProfile&&window.accountProfile.uid)return window.accountProfile.uid;}catch(e){}
 return 'guest';
}
function storeKey(){return 'vqc-elo-puzzle-v1-'+uid();}
function clampElo(v){return Math.max(MIN_ELO,Math.min(MAX_ELO,Math.round(v)));}
function freshState(){return {elo:START_ELO,games:0,solved:0,streak:0,best:START_ELO,seen:[]};}
function loadState(){
 S=freshState();
 try{
  const o=JSON.parse(localStorage.getItem(storeKey())||'null');
  if(o&&Number.isFinite(o.elo)){
   S={elo:clampElo(o.elo),games:o.games|0,solved:o.solved|0,streak:o.streak|0,best:Number.isFinite(o.best)?o.best:o.elo,seen:Array.isArray(o.seen)?o.seen.slice(-SEEN_LIMIT):[]};
  }
 }catch(e){}
}
function saveState(){try{localStorage.setItem(storeKey(),JSON.stringify(S));}catch(e){}}

async function loadManifest(){
 if(manifest)return manifest;
 const res=await fetch(BASE+'manifest.json?v='+VERSION,{cache:'no-cache'});
 if(!res.ok)throw new Error('manifest');
 const m=await res.json();
 if(!m||!Array.isArray(m.bands)||!m.bands.length)throw new Error('empty');
 manifest=m;return m;
}
async function loadBand(entry){
 if(bandCache[entry.r])return bandCache[entry.r];
 const res=await fetch(BASE+entry.file+'?v='+VERSION);
 if(!res.ok)throw new Error('band');
 const j=await res.json();
 bandCache[entry.r]=Array.isArray(j.p)?j.p:[];
 return bandCache[entry.r];
}
async function pickPuzzle(){
 const m=await loadManifest();
 const bands=m.bands.slice().sort(function(a,b){return a.r-b.r;});
 const target=S.elo;
 const order=bands.slice().sort(function(a,b){return Math.abs(a.r+50-target)-Math.abs(b.r+50-target);}).slice(0,2);
 let all=[];
 for(const b of order)all=all.concat(await loadBand(b));
 if(!all.length)throw new Error('none');
 const seen=new Set(S.seen);
 let pool=all.filter(function(p){return !seen.has(p[0]);});
 if(!pool.length)pool=all;
 pool.sort(function(a,b){return Math.abs(a[3]-target)-Math.abs(b[3]-target);});
 const top=pool.slice(0,15);
 return top[Math.floor(Math.random()*top.length)];
}

function sideName(c){return c==='w'?'Trắng':'Đen';}
function kingSquare(g,color){
 const b=g.board();
 for(let r=0;r<8;r++)for(let f=0;f<8;f++){const p=b[r][f];if(p&&p.type==='k'&&p.color===color)return FILES[f]+(8-r);}
 return null;
}
function playerColor(){return P?P.color:'w';}
function expectedUci(){return P&&idx<P.moves.length?P.moves[idx]:'';}
function applyUci(u){
 if(!u||!game)return null;
 let m=null;
 try{m=game.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u.length>4?u[4]:undefined});}catch(e){m=null;}
 return m;
}

function chipThemes(){
 if(!P)return [];
 const list=P.themes.filter(function(t){return THEME_VI[t];});
 list.sort(function(a,b){return (/^mateIn/.test(b)?1:0)-(/^mateIn/.test(a)?1:0);});
 return list.slice(0,3).map(function(t){return THEME_VI[t];});
}
function msgFor(){
 if(status==='loading')return {t:'Đang tìm câu đố hợp với em…',k:''};
 if(status==='nodata')return {t:'Chưa có bộ câu đố trên trang này. Hãy báo giáo viên để cài đặt nhé.',k:'bad'};
 if(status==='intro')return {t:'Xem đối thủ đi nước đầu tiên…',k:''};
 if(status==='wrong')return {t:'Chưa đúng rồi. Em thử nước khác nhé!',k:'bad'};
 if(status==='play'){
  if(hintLevel>=2)return {t:'Gợi ý: đi quân đang sáng đến ô được đánh dấu.',k:'hint'};
  if(hintLevel===1)return {t:'Gợi ý: hãy chú ý quân đang được đánh dấu.',k:'hint'};
  return {t:sideName(playerColor())+' đi — hãy tìm nước đi tốt nhất!',k:''};
 }
 if(status==='solved'){
  if(result&&result.success)return {t:'Giỏi lắm! Em giải đúng ngay từ lần đầu.',k:'ok'};
  return {t:'Em đã giải được câu đố, nhưng có sai hoặc dùng gợi ý nên Elo chưa tăng nhiều.',k:'hint'};
 }
 if(status==='failed')return {t:'Đây là đáp án. Cùng xem lại và thử câu tiếp theo nhé!',k:'bad'};
 return {t:'',k:''};
}

function paintBoard(){
 const board=$('vqcEloBoard');if(!board)return;
 board.replaceChildren();
 if(!game)return;
 const flip=P&&P.color==='b';
 const ranks=flip?[1,2,3,4,5,6,7,8]:[8,7,6,5,4,3,2,1],files=flip?FILES.split('').reverse():FILES.split('');
 const canPlay=status==='play';
 const legal=canPlay&&selected?game.moves({square:selected,verbose:true}).map(function(m){return m.to;}):[];
 const checkSq=game.in_check()?kingSquare(game,game.turn()):null;
 const exp=expectedUci();
 const hf=canPlay&&hintLevel>=1&&exp?exp.slice(0,2):'',ht=canPlay&&hintLevel>=2&&exp?exp.slice(2,4):'';
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
  if(!canPlay)b.classList.add('ro');
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
function paintPanel(){
 if(!S)return;
 $('vqcEloRating').textContent=String(S.elo);
 const d=$('vqcEloDelta');
 if(lastDelta==null||status==='play'||status==='intro'||status==='loading'){d.textContent='';d.className='vqc-elo-delta';}
 else{d.textContent=(lastDelta>0?'+':lastDelta<0?'−':'±')+Math.abs(lastDelta);d.className='vqc-elo-delta '+(lastDelta>0?'up':lastDelta<0?'down':'');}
 $('vqcEloStreak').textContent=String(S.streak);
 $('vqcEloSolved').textContent=S.solved+' / '+S.games;
 $('vqcEloBest').textContent=String(S.best);
 $('vqcEloPuzzleRating').textContent=P&&status!=='loading'&&status!=='nodata'?String(P.rating):'—';
 const m=msgFor(),box=$('vqcEloMsg');box.textContent=m.t;box.className='vqc-elo-msg'+(m.k?' '+m.k:'');
 const chips=$('vqcEloThemes');chips.replaceChildren();
 if(P&&status!=='loading'&&status!=='nodata')chipThemes().forEach(function(t){chips.append(el('span','vqc-elo-chip',t));});
 const active=status==='play'||status==='wrong';
 $('vqcEloHint').disabled=!(status==='play');
 $('vqcEloAnswer').disabled=!active;
 $('vqcEloNext').disabled=!(status==='solved'||status==='failed'||status==='nodata');
 $('vqcEloNext').textContent=status==='nodata'?'Thử tải lại':'Câu tiếp theo →';
 $('vqcEloReset').textContent=confirmReset?'Bấm lần nữa để đặt lại Elo':'Đặt lại Elo';
 const side=$('vqcEloSide');
 side.textContent=P&&game&&status!=='loading'&&status!=='nodata'?('Em cầm quân '+(P.color==='w'?'Trắng ⚪':'Đen ⚫')):'';
}
function paint(){
 if(!isOpen)return;
 paintBoard();paintPromo();paintPanel();
}

function onCell(sq){
 if(status!=='play'||promo||!game)return;
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
function tryMove(from,to,pr){
 if(status!=='play'||!game)return;
 const exp=expectedUci();
 const prev=lastMove;
 let m=null;
 try{m=game.move({from:from,to:to,promotion:pr});}catch(e){m=null;}
 selected=null;
 if(!m){paint();return;}
 const uci=from+to+(m.promotion||'');
 if(uci===exp||game.in_checkmate()){
  lastMove={from:from,to:to};
  idx++;
  if(uci!==exp||idx>=P.moves.length){finish(true);paint();return;}
  status='opp';paint();
  later(function(){
   const u=expectedUci();const r=applyUci(u);
   if(r){lastMove={from:u.slice(0,2),to:u.slice(2,4)};idx++;}
   if(!r||idx>=P.moves.length){finish(true);}else status='play';
   paint();
  },450);
  return;
 }
 mistakes++;
 lastMove={from:from,to:to};
 status='wrong';paint();
 wrongTimer=setTimeout(function(){
  if(!isOpen||status!=='wrong')return;
  try{game.undo();}catch(e){}
  lastMove=prev;status='play';paint();
 },800);
}
function finish(solvedOk){
 if(done)return;done=true;
 const clean=solvedOk&&mistakes===0&&!assisted;
 const score=clean?1:(solvedOk?0.3:0);
 const E=1/(1+Math.pow(10,(P.rating-S.elo)/400));
 const K=S.games<10?48:32;
 let d=Math.round(K*(score-E));
 if(clean&&d<1)d=1;
 const before=S.elo;
 S.elo=clampElo(S.elo+d);
 lastDelta=S.elo-before;
 S.games++;
 if(clean){S.solved++;S.streak++;}else S.streak=0;
 S.best=Math.max(S.best,S.elo);
 S.seen.push(P.id);if(S.seen.length>SEEN_LIMIT)S.seen=S.seen.slice(-SEEN_LIMIT);
 saveState();
 result={success:clean,solved:solvedOk};
 status=solvedOk?'solved':'failed';
 selected=null;promo=null;
}
function revealAnswer(){
 if(status!=='play'&&status!=='wrong')return;
 clearTimeout(wrongTimer);
 if(status==='wrong'){try{game.undo();}catch(e){}}
 finish(false);
 selected=null;promo=null;paint();
 const step=function(){
  const u=expectedUci();
  if(!u||!game)return;
  const r=applyUci(u);
  if(!r)return;
  lastMove={from:u.slice(0,2),to:u.slice(2,4)};idx++;paint();
  if(idx<P.moves.length)later(step,850);
 };
 later(step,500);
}
function giveHint(){
 if(status!=='play')return;
 assisted=true;hintLevel=Math.min(2,hintLevel+1);paint();
}
async function nextPuzzle(){
 token++;clearTimers();
 const my=token;
 status='loading';P=null;game=null;selected=null;promo=null;result=null;
 paint();
 let item;
 try{item=await pickPuzzle();}
 catch(e){
  if(my!==token)return;
  manifestFail=true;status='nodata';paint();return;
 }
 if(my!==token||!isOpen)return;
 manifestFail=false;
 const themes=String(item[4]||'').split(' ').filter(Boolean);
 const g=new Chess();
 if(!g.load(item[1])){nextPuzzle();return;}
 const moves=String(item[2]).split(' ');
 const color=g.turn()==='w'?'b':'w';
 P={id:item[0],fen:item[1],moves:moves,rating:item[3],themes:themes,color:color};
 game=g;idx=0;lastMove=null;mistakes=0;assisted=false;hintLevel=0;done=false;lastDelta=null;
 status='intro';paint();
 later(function(){
  const u=expectedUci();const r=applyUci(u);
  if(!r){nextPuzzle();return;}
  lastMove={from:u.slice(0,2),to:u.slice(2,4)};idx++;
  status='play';paint();
 },800);
}

const OVERLAY_HTML=`<div id="vqcEloOverlay" role="dialog" aria-modal="true" aria-labelledby="vqcEloTitle">
 <div class="vqc-elo-dialog">
  <div class="vqc-elo-top">
   <div><h2 id="vqcEloTitle">🧩 Câu đố theo Elo</h2><p>Câu đố tự tăng hoặc giảm độ khó theo trình độ của em.</p></div>
   <button type="button" id="vqcEloClose" aria-label="Đóng">✕ Đóng</button>
  </div>
  <div class="vqc-elo-layout">
   <div class="vqc-elo-boardcol">
    <div class="vqc-elo-boardwrap">
     <div id="vqcEloBoard" class="vqc-elo-board" aria-label="Bàn cờ câu đố"></div>
     <div id="vqcEloPromo" class="vqc-elo-promo" hidden></div>
    </div>
   </div>
   <section class="vqc-elo-side">
    <div class="vqc-elo-card">
     <div class="vqc-elo-ratingbox"><span class="vqc-elo-label">Elo của em</span><strong id="vqcEloRating">600</strong><b id="vqcEloDelta" class="vqc-elo-delta"></b></div>
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
     <button type="button" id="vqcEloReset" class="vqc-elo-link">Đặt lại Elo</button>
    </div>
    <p class="vqc-elo-credit">Câu đố từ <a href="https://database.lichess.org/#puzzles" target="_blank" rel="noopener">cơ sở dữ liệu câu đố của Lichess</a> (CC0).</p>
   </section>
  </div>
 </div>
</div>`;

function bind(){
 $('vqcEloClose').addEventListener('click',close);
 $('vqcEloHint').addEventListener('click',giveHint);
 $('vqcEloAnswer').addEventListener('click',revealAnswer);
 $('vqcEloNext').addEventListener('click',nextPuzzle);
 $('vqcEloReset').addEventListener('click',function(){
  if(!confirmReset){
   confirmReset=true;clearTimeout(resetTimer);
   resetTimer=setTimeout(function(){confirmReset=false;paint();},4000);
   paint();return;
  }
  confirmReset=false;clearTimeout(resetTimer);
  S=freshState();saveState();lastDelta=null;
  nextPuzzle();
 });
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
function open(){
 if(typeof Chess!=='function'){notify('Chưa thể mở: thư viện luật cờ vua chưa được tải.');return;}
 ensureOverlay();
 if(typeof window.vqcCloseOtherViews==='function')window.vqcCloseOtherViews('elopuzzle');
 isOpen=true;
 $('vqcEloOverlay').classList.add('open');
 loadState();
 nextPuzzle();
 setTimeout(function(){const b=$('vqcEloClose');if(b)b.focus();},0);
}
function close(){
 if(!isOpen)return;
 isOpen=false;token++;clearTimers();clearTimeout(resetTimer);confirmReset=false;
 const o=$('vqcEloOverlay');if(o)o.classList.remove('open');
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

window.vqcEloPuzzles={open:open,close:close,version:VERSION};
window.vqcEloPuzzlesHide=close;
function gateMenu(){
 loadManifest().then(function(){ensureMenu();}).catch(function(){});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',gateMenu,{once:true});
else gateMenu();
})();
