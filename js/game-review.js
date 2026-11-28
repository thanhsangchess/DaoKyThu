(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const glyph={wk:'♔',wq:'♕',wr:'♖',wb:'♗',wn:'♘',wp:'♙',bk:'♚',bq:'♛',br:'♜',bb:'♝',bn:'♞',bp:'♟︎'};
 let positions=[],moves=[],current=0,loadedText='',applyingRemote=false;
 const workspace=()=> $('vqcReviewWorkspace');
 const isTeacher=()=>typeof role!=='undefined'&&role==='teacher';
 const connected=()=>typeof roomRef!=='undefined'&&!!roomRef;
 let workspaceInstalled=false;
 let variationGame=null,variationActive=false,variationMoves=[],selectedSquare=null,promotionChoices=[];
 let variationBaseIndex=null,variationActorRole=null,variationSharedStamp=null,variationRevision=0,applyingRemoteVariation=false;
 const variationClientId='review-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
 const reviewOrientationClientId='review-orientation-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
 let orientationRevision=0,orientationLastReceived='';
 let boardFlipped=false;
 let wasEmpty=null;
 function setMsg(text,kind){
  const el=$('vqcReviewError');if(!el)return;
  el.textContent=text||'';
  el.dataset.kind=text?(kind||'error'):'';
 }
 function focusImport(){
  const box=$('vqcReviewImport');if(box)box.open=true;
  const input=$('vqcReviewPgn');
  if(input){input.focus();try{input.scrollIntoView({block:'nearest'});}catch(e){}}
 }
 function installEmptyState(){
  const shell=document.querySelector('#vqcReviewWorkspace .vqc-review-board-shell');
  if(shell&&!$('vqcReviewBoardEmpty')){
   const box=document.createElement('div');box.id='vqcReviewBoardEmpty';box.className='vqc-review-board-empty';
   box.innerHTML='<div class="vqc-review-board-empty__card"><span class="vqc-review-board-empty__icon" aria-hidden="true">♟</span>'+
    '<strong data-empty="title">Chưa có ván đấu</strong><p data-empty="text"></p>'+
    '<div class="vqc-review-board-empty__actions"><button type="button" class="vqc-review-empty-primary" data-empty="paste">Dán ván PGN</button>'+
    '<button type="button" class="vqc-review-empty-secondary" data-empty="file">Chọn file .pgn</button></div></div>';
   shell.appendChild(box);
   box.querySelector('[data-empty="paste"]').addEventListener('click',focusImport);
   box.querySelector('[data-empty="file"]').addEventListener('click',()=>$('vqcReviewFile')?.click());
  }
  const side=document.querySelector('#vqcReviewWorkspace .vqc-review-workspace__side');
  if(side&&!$('vqcReviewSideEmpty')){
   const hint=document.createElement('p');hint.id='vqcReviewSideEmpty';hint.className='vqc-review-side-empty';
   side.appendChild(hint);
  }
 }
 function paintEmptyState(){
  const empty=!positions.length,teacher=isTeacher(),ws=workspace();
  if(ws){ws.classList.toggle('vqc-review--empty',empty);ws.classList.toggle('vqc-review--student',!teacher);}
  const card=$('vqcReviewBoardEmpty');
  if(card){
   card.hidden=!empty;
   card.querySelector('[data-empty="text"]').textContent=teacher?'Dán hoặc chọn file PGN để bắt đầu phân tích cùng cả lớp.':'Đang chờ giáo viên tải ván đấu. Bàn cờ sẽ tự hiện khi có ván.';
   card.querySelector('.vqc-review-board-empty__actions').hidden=!teacher;
  }
  const hint=$('vqcReviewSideEmpty');
  if(hint){hint.hidden=!empty;hint.textContent=teacher?'Dán hoặc chọn file PGN để bắt đầu.':'Giáo viên chưa tải ván đấu.';}
  const back=$('vqcReviewReturnBoard');if(back)back.hidden=!teacher;
  const keys=document.querySelector('#vqcReviewWorkspace .vqc-review-shortcut');
  if(keys){keys.textContent=teacher?'Phím tắt: ← → để đi từng nước · Home về đầu · End đến cuối':'Giáo viên đang điều khiển các nước đi.';}
  if(empty!==wasEmpty){
   const box=$('vqcReviewImport');
   if(box&&teacher)box.open=empty;
   wasEmpty=empty;
  }
 }
 function pgnTokens(clean){
  let fen='',headerError=0;
  const lines=clean.split('\n'),body=[];
  lines.forEach((line,i)=>{
   if(/^\s*\[/.test(line)){
    if(!/^\s*\[\s*[A-Za-z0-9_]+\s+"(?:[^"\\]|\\.)*"\s*\]\s*$/.test(line)){if(!headerError)headerError=i+1;return;}
    const m=/^\s*\[\s*FEN\s+"([^"]*)"\s*\]/.exec(line);if(m)fen=m[1];
    return;
   }
   body.push(line.replace(/;.*$/,''));
  });
  let text=body.join(' ').replace(/\{[^}]*\}/g,' ');
  let prev;do{prev=text;text=text.replace(/\([^()]*\)/g,' ');}while(text!==prev);
  text=text.replace(/\$\d+/g,' ').replace(/\b(?:1-0|0-1|1\/2-1\/2)\b|\*/g,' ').replace(/\d+\.(?:\.\.)?/g,' ');
  const tokens=text.split(/\s+/).filter(Boolean).map(t=>t.replace(/[!?]+$/,'')).filter(Boolean);
  return {fen,tokens,headerError};
 }
 function diagnosePgn(clean){
  const info=pgnTokens(clean);
  if(info.headerError)return 'PGN sai định dạng ở phần tiêu đề (dòng '+info.headerError+'). Mỗi dòng tiêu đề có dạng [Tên "giá trị"].';
  if(!info.tokens.length)return 'PGN sai định dạng: không tìm thấy nước đi nào. Hãy kiểm tra phần ký hiệu nước đi.';
  let c;
  try{c=new Chess();if(info.fen&&c.load(info.fen)===false)return 'PGN sai định dạng: thế cờ xuất phát (FEN) không hợp lệ.';}catch(e){return 'PGN sai định dạng: thế cờ xuất phát (FEN) không hợp lệ.';}
  for(const token of info.tokens){
   const turn=c.turn(),moveNo=Number(String(c.fen()).split(/\s+/)[5])||1;
   let made=null;
   try{made=c.move(token);}catch(e){made=null;}
   if(!made)return 'Nước đi không hợp lệ ở nước thứ '+moveNo+' ('+(turn==='w'?'Trắng':'Đen')+'): “'+token+'”. Hãy kiểm tra lại ký hiệu nước đi này.';
  }
  return 'PGN sai định dạng: không đọc được nội dung. Hãy kiểm tra phần tiêu đề và ký hiệu nước đi.';
 }
 function scrollMoveIntoView(){
  const list=$('vqcReviewMoves');if(!list)return;
  const active=list.querySelector('.vqc-review-move.is-current,.vqc-review-start-position.is-current');if(!active)return;
  const head=list.querySelector('.vqc-review-move-head');
  const top=head?head.offsetHeight:0,lr=list.getBoundingClientRect(),ar=active.getBoundingClientRect();
  if(ar.top<lr.top+top)list.scrollTop-=lr.top+top-ar.top+6;
  else if(ar.bottom>lr.bottom)list.scrollTop+=ar.bottom-lr.bottom+6;
 }
 let hintOn=false,hintEng=null,hintEpoch=0,hintTimer=0,hintFen='',hintError='';
 const hintCache=new Map(),BAD_KIDS={sailam:1,nghiemtrong:1};
 function currentFen(){return variationActive&&variationGame?variationGame.fen():positions[current];}
 function uciToSanAt(fen,uci){
  try{const c=new Chess();if(!c.load(fen))return uci;const m=c.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]||'q'});return m?m.san:uci;}catch(e){return uci;}
 }
 function reviewQuality(){
  try{
   const q=window.vqcDuelReview&&typeof window.vqcDuelReview.pgnQuality==='function'?window.vqcDuelReview.pgnQuality():null;
   return q&&q.key==='pgn:'+hashText(loadedText)?q:null;
  }catch(e){return null;}
 }
 function mistakePlies(){
  const q=reviewQuality();if(!q)return null;
  return q.moves.filter(m=>m.kid&&BAD_KIDS[m.kid]).map(m=>m.ply);
 }
 function hintStop(){
  hintEpoch++;clearTimeout(hintTimer);hintFen='';
  if(hintEng){try{hintEng.dispose();}catch(e){}hintEng=null;}
 }
 function runHint(fen){
  const ep=++hintEpoch;
  let g=null;try{g=new Chess();if(!g.load(fen))g=null;}catch(e){g=null;}
  if(!g){hintCache.set(fen,null);paintArrow();return;}
  const over=typeof g.game_over==='function'?g.game_over():g.isGameOver();
  if(over){hintCache.set(fen,null);paintArrow();return;}
  try{
   if(!hintEng){if(!window.VqcStockfish){hintError='Chưa tải được động cơ Stockfish. Hãy tải lại trang rồi thử lại.';paintArrow();return;}hintEng=window.VqcStockfish.create({onStatus:function(){}});}
  }catch(e){hintError='Không khởi động được động cơ Stockfish.';paintArrow();return;}
  hintError='';
  hintEng.search(fen,{movetime:700,skill:20}).then(res=>{
   if(ep!==hintEpoch||!res||res.cancelled)return;
   const u=res.bestmove&&/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(res.bestmove)?res.bestmove:null;
   hintCache.set(fen,u?{uci:u,san:uciToSanAt(fen,u)}:null);
   paintArrow();
  }).catch(()=>{
   if(ep!==hintEpoch)return;
   if(hintEng){try{hintEng.dispose();}catch(e){}hintEng=null;}
   hintError='Máy chưa tính được nước gợi ý. Hãy thử lại.';paintArrow();
  });
 }
 function bestFor(fen){
  if(hintCache.has(fen))return hintCache.get(fen);
  const q=variationActive?null:reviewQuality();
  const u=q&&q.best?q.best[current]:null;
  if(u){const v={uci:u,san:uciToSanAt(fen,u)};hintCache.set(fen,v);return v;}
  if(hintFen!==fen){hintFen=fen;clearTimeout(hintTimer);hintTimer=setTimeout(()=>runHint(fen),250);}
  return undefined;
 }
 function paintArrow(){
  const board=$('vqcReviewBoard'),shell=board&&board.parentNode;if(!shell)return;
  let svg=$('vqcReviewArrow');
  const text=$('vqcReviewHintText');
  const on=hintOn&&positions.length>0&&!workspace()?.hidden;
  const best=on?bestFor(currentFen()):null;
  if(text&&on){
   if(hintError)text.textContent=hintError;
   else if(best===undefined)text.textContent='💡 Máy đang tìm nước đi tốt nhất…';
   else if(best===null)text.textContent='Thế cờ này không còn nước đi (ván đã kết thúc).';
   else text.textContent='💡 Nước đi tốt nhất: '+best.san+' (mũi tên xanh trên bàn cờ)';
  }
  if(!on||!best){if(svg)svg.hidden=true;return;}
  if(!svg){
   svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.id='vqcReviewArrow';svg.setAttribute('class','vqc-review-arrow');
   svg.setAttribute('viewBox','0 0 8 8');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');
   svg.innerHTML='<defs><marker id="vqcReviewArrowHead" viewBox="0 0 10 10" refX="4" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#0F7A55"/></marker></defs>'+
    '<rect class="from" width="1" height="1" fill="#0F7A55" fill-opacity=".18"/><line stroke="#0F7A55" stroke-opacity=".88" stroke-width=".2" stroke-linecap="round" marker-end="url(#vqcReviewArrowHead)"/>';
   shell.appendChild(svg);
  }
  if(svg.parentNode!==shell)shell.appendChild(svg);
  if(getComputedStyle(shell).position==='static')shell.style.position='relative';
  const sr=shell.getBoundingClientRect(),br=board.getBoundingClientRect();
  svg.style.left=(br.left-sr.left-shell.clientLeft)+'px';svg.style.top=(br.top-sr.top-shell.clientTop)+'px';svg.style.width=br.width+'px';svg.style.height=br.height+'px';
  const pos=sq=>{const f='abcdefgh'.indexOf(sq[0]),r=Number(sq[1]);return boardFlipped?{x:7-f,y:r-1}:{x:f,y:8-r};};
  const a=pos(best.uci.slice(0,2)),b=pos(best.uci.slice(2,4));
  const x1=a.x+.5,y1=a.y+.5,x2=b.x+.5,y2=b.y+.5,len=Math.hypot(x2-x1,y2-y1)||1,cut=.3;
  const line=svg.querySelector('line'),rect=svg.querySelector('rect.from');
  line.setAttribute('x1',x1);line.setAttribute('y1',y1);line.setAttribute('x2',x2-(x2-x1)/len*cut);line.setAttribute('y2',y2-(y2-y1)/len*cut);
  rect.setAttribute('x',a.x);rect.setAttribute('y',a.y);
  svg.hidden=false;
 }
 function installHints(){
  const wrap=document.querySelector('#vqcReviewWorkspace .vqc-review-moves-wrap');
  if(!wrap||$('vqcReviewHints'))return;
  const box=document.createElement('section');box.id='vqcReviewHints';box.className='vqc-review-hints';box.setAttribute('aria-label','Gợi ý của máy');
  box.innerHTML='<div class="vqc-review-hints__row">'+
   '<button type="button" id="vqcReviewBestMove" class="vqc-review-hint-btn" aria-pressed="false">💡 Nước đi tốt nhất</button>'+
   '<button type="button" id="vqcReviewPrevMistake" class="vqc-review-hint-btn">◀ Sai lầm trước</button>'+
   '<button type="button" id="vqcReviewNextMistake" class="vqc-review-hint-btn">Sai lầm sau ▶</button></div>'+
   '<p id="vqcReviewHintText" class="vqc-review-hints__text" role="status" aria-live="polite"></p>';
  wrap.insertAdjacentElement('afterend',box);
  $('vqcReviewBestMove').addEventListener('click',()=>{
   hintOn=!hintOn;hintError='';
   if(!hintOn){hintEpoch++;clearTimeout(hintTimer);hintFen='';}
   paintHints();paintArrow();
  });
  $('vqcReviewPrevMistake').addEventListener('click',()=>{const list=mistakePlies()||[];const p=list.filter(x=>x<current).pop();if(p!=null)go(p);});
  $('vqcReviewNextMistake').addEventListener('click',()=>{const list=mistakePlies()||[];const p=list.find(x=>x>current);if(p!=null)go(p);});
  const board=$('vqcReviewBoard');
  if(board&&typeof ResizeObserver==='function'){try{new ResizeObserver(()=>requestAnimationFrame(paintArrow)).observe(board);}catch(e){}}
  window.addEventListener('resize',()=>requestAnimationFrame(paintArrow));
  setInterval(()=>{if(!workspace()?.hidden&&positions.length)paintHints();},900);
 }
 function paintHints(){
  const box=$('vqcReviewHints');if(!box)return;
  box.hidden=!positions.length;if(!positions.length)return;
  const teacher=isTeacher(),list=mistakePlies();
  const bm=$('vqcReviewBestMove');bm.setAttribute('aria-pressed',String(hintOn));bm.textContent=hintOn?'💡 Ẩn nước đi tốt nhất':'💡 Nước đi tốt nhất';
  const prev=$('vqcReviewPrevMistake'),next=$('vqcReviewNextMistake');
  prev.hidden=next.hidden=!teacher;
  const before=list?list.filter(x=>x<current).length:0,after=list?list.filter(x=>x>current).length:0;
  prev.disabled=!list||!before;next.disabled=!list||!after;
  prev.textContent='◀ Sai lầm trước'+(list?' ('+before+')':'');next.textContent='Sai lầm sau'+(list?' ('+after+')':'')+' ▶';
  const text=$('vqcReviewHintText');
  if(text&&!hintOn){
   if(!teacher)text.textContent='Bấm “Nước đi tốt nhất” để máy trên máy em vẽ mũi tên gợi ý.';
   else if(!list)text.textContent='Bấm “🤖 Phân tích ván” bên dưới để máy tìm các nước sai lầm.';
   else text.textContent=list.length?'Ván có '+list.length+' nước ⚠️ sai lầm hoặc ❌ sai lầm nghiêm trọng.':'Máy không thấy nước sai lầm nào trong ván này. 🌟';
  }
 }
 function installMoveDrawer(){
  const workspaceEl=workspace();
  const boardCol=workspaceEl?.querySelector('.vqc-review-workspace__board');
  const side=workspaceEl?.querySelector('.vqc-review-workspace__side');
  const status=workspaceEl?.querySelector('.vqc-review-status');
  const controls=workspaceEl?.querySelector('.vqc-review-controls');
  const importBox=$('vqcReviewImport');
  if(!workspaceEl||!boardCol||!side||!status||!controls||workspaceInstalled)return;

  side.prepend(status);
  if(importBox){
   importBox.open=true;
   const movesHeading=side.querySelector('.vqc-review-moves-heading');
   if(movesHeading)side.insertBefore(importBox,movesHeading);
   else side.appendChild(importBox);
  }
  side.appendChild(controls);
  workspaceInstalled=true;
 }
 function setOpen(open){
  const el=workspace();if(!el)return;
  el.hidden=!open;
  if(!open&&variationActive)resetVariation(false);
  if(!open){evbStop();hintStop();}

  const center=document.querySelector('section.center');
  if(center)center.classList.toggle('vqc-review-mode',!!open);
  const app=document.querySelector('main.app');
  if(app)app.classList.toggle('vqc-review-expanded',!!open);
  document.body.classList.toggle('vqc-review-active',!!open);
  $('vqcClassBoardTab')?.classList.toggle('is-active',!open);
  $('vqcReviewTab')?.classList.toggle('is-active',!!open);
  $('vqcClassBoardTab')?.setAttribute('aria-selected',String(!open));
  $('vqcReviewTab')?.setAttribute('aria-selected',String(!!open));
  if(open)requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
 }
 function normalizePgn(value){
  return String(value||'').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n')
   .split('\n').map(line=>line.trim().replace(/[\t ]+/g,' ')).join('\n').trim();
 }
 function parsePgn(pgn){
  if(!window.Chess)throw Error('Không tải được bộ luật cờ vua.');
  const clean=normalizePgn(pgn);
  if(!clean)throw Error('PGN đang trống. Hãy dán nội dung PGN hoặc chọn tệp .pgn, rồi bấm “Tải PGN và chia sẻ”.');
  if(clean.length>50000)throw Error('PGN quá dài (tối đa 50.000 ký tự).');
  const c=new Chess();let ok;
  try{ok=c.load_pgn(clean);}catch(e){throw Error(diagnosePgn(clean));}
  if(ok===false)throw Error(diagnosePgn(clean));
  const history=c.history({verbose:true})||[];
  if(!history.length)throw Error('PGN sai định dạng: không tìm thấy nước đi nào. Hãy kiểm tra phần ký hiệu nước đi.');
  const fens=new Array(history.length+1);fens[history.length]=c.fen();
  for(let i=history.length-1;i>=0;i--){c.undo();fens[i]=c.fen();}
  return {positions:fens,moves:history.map(m=>({san:m.san,from:m.from,to:m.to,color:m.color}))};
 }
 function makeCoordinate(text,cls){
  const el=document.createElement('span');el.className='vqc-review-coordinate '+cls;el.textContent=text;return el;
 }
 function updateVariationControls(){
  const reset=$('vqcReviewVariationReset'),status=$('vqcReviewVariationStatus'),promo=$('vqcReviewPromotion');
  if(reset)reset.hidden=!variationActive;
  if(promo)promo.hidden=!promotionChoices.length;
  if(status){
   if(variationActive){
    const ending=variationGame?.isCheckmate?.()?' · Thế cờ chiếu hết':variationGame?.isStalemate?.()?' · Không còn nước hợp lệ theo lượt chuẩn':'';
    const actorLabel=variationActorRole==='teacher'?'Giáo viên vừa thử':variationActorRole==='student'?'Học sinh vừa thử':'Đang thử';
    status.textContent=actorLabel+' · '+variationMoves.length+' nước · chọn bất kỳ quân Trắng hoặc Đen, không bắt buộc luân phiên'+ending+'. PGN gốc không thay đổi.';
   }else{
    status.textContent='Chọn quân để thử nước đi. Các nước thử sẽ hiển thị trên cả máy giáo viên và học sinh.';
   }
  }
  if(promo){
   promo.replaceChildren();
   if(promotionChoices.length){
    const label=document.createElement('span');label.textContent='Phong cấp thành:';promo.appendChild(label);
    const labels={q:'Hậu ♕',r:'Xe ♖',b:'Tượng ♗',n:'Mã ♘'};
    promotionChoices.forEach(move=>{
     const button=document.createElement('button');button.type='button';button.textContent=labels[move.promotion]||move.promotion;
     button.addEventListener('click',()=>playVariationMove(move));promo.appendChild(button);
    });
    const cancel=document.createElement('button');cancel.type='button';cancel.className='is-muted';cancel.textContent='Hủy';
    cancel.addEventListener('click',()=>{promotionChoices=[];updateVariationControls();renderBoard();});
    promo.appendChild(cancel);
   }
  }
 }
 function resetVariation(shouldRender=true){
  variationGame=null;variationActive=false;variationMoves=[];selectedSquare=null;promotionChoices=[];variationBaseIndex=null;variationActorRole=null;
  updateVariationControls();
  if(shouldRender&&positions.length)render();
 }
 function beginVariation(){
  if(!positions.length)return false;
  const chess=new Chess();
  if(!chess.load(positions[current]))return false;
  variationGame=chess;variationActive=true;variationMoves=[];selectedSquare=null;promotionChoices=[];variationBaseIndex=current;variationActorRole=null;
  updateVariationControls();
  return true;
 }
 function variationPositionForPiece(game,square){
  if(!game||!square)return null;
  const piece=game.get(square);if(!piece)return null;
  const fields=game.fen().split(/\s+/);
  if(fields[1]!==piece.color){
   fields[1]=piece.color;
   fields[3]='-';
  }
  const candidate=new Chess();
  try{return candidate.load(fields.join(' '))?candidate:null;}catch(error){return null;}
 }
 function legalVariationMoves(square){
  const candidate=variationPositionForPiece(variationGame,square);
  if(!candidate)return [];
  try{return candidate.moves({square,verbose:true});}catch(error){return [];}
 }
 function playVariationMove(move){
  if(!variationActive||!variationGame||workspace()?.hidden)return;
  try{
   const candidate=variationPositionForPiece(variationGame,move.from);
   if(!candidate)return;
   const made=candidate.move({from:move.from,to:move.to,promotion:move.promotion||'q'});
   if(!made)return;
   variationGame=candidate;
   variationMoves.push({san:made.san,from:made.from,to:made.to,color:made.color,promotion:made.promotion||'',fen:variationGame.fen()});
   variationActorRole=isTeacher()?'teacher':'student';
   selectedSquare=null;promotionChoices=[];
   updateVariationControls();renderBoard();render();
   publishVariation();
  }catch(error){
   const status=$('vqcReviewVariationStatus');
   if(status)status.textContent='Nước đi không hợp lệ. Hãy chọn một ô được đánh dấu.';
  }
 }
 function handleVariationSquare(square){
  if(workspace()?.hidden||!positions.length)return;
  if(!variationActive&&!beginVariation())return;
  if(!variationGame||promotionChoices.length)return;
  const piece=variationGame.get(square);
  if(selectedSquare){
   const choices=legalVariationMoves(selectedSquare).filter(move=>move.to===square);
   if(choices.length){
    if(choices.some(move=>move.promotion)){
     promotionChoices=choices;updateVariationControls();renderBoard();return;
    }
    playVariationMove(choices[0]);return;
   }
   if(piece){
    selectedSquare=square;renderBoard();return;
   }
   selectedSquare=null;renderBoard();return;
  }
  if(piece){
   selectedSquare=square;renderBoard();
  }
 }
 function updateFlipButton(){
  const button=$('vqcReviewFlipBoard');
  if(!button)return;
  button.textContent='↻ Đảo bàn cờ · '+(boardFlipped?'Đen':'Trắng');
  button.setAttribute('aria-pressed',String(boardFlipped));
  button.title='Góc nhìn hiện tại: '+(boardFlipped?'Đen':'Trắng')+' ở phía dưới. Nhấn để đổi góc nhìn.';
 }
 function orientationPayload(){
  return {flipped:!!boardFlipped,stamp:Date.now()+'-'+(++orientationRevision),clientId:reviewOrientationClientId};
 }
 function publishOrientation(){
  if(!connected()||workspace()?.hidden)return;
  const payload=orientationPayload();
  roomRef.update({gameReviewOrientation:payload,updatedAt:firebase.firestore.FieldValue.serverTimestamp()})
   .catch(error=>{
    console.error('Đồng bộ góc nhìn bàn cờ xem lại thất bại:',error);
    const status=$('vqcReviewVariationStatus');
    if(status)status.textContent='Chưa đồng bộ được góc nhìn bàn cờ. Hãy kiểm tra kết nối lớp.';
   });
 }
 function receiveOrientation(data){
  if(!data||typeof data!=='object'||typeof data.flipped!=='boolean')return;
  const key=JSON.stringify([data.clientId||'',data.stamp||'',data.flipped]);
  const next=!!data.flipped;
  if(key===orientationLastReceived&&boardFlipped===next)return;
  orientationLastReceived=key;
  if(boardFlipped===next)return;
  boardFlipped=next;
  updateFlipButton();
  renderBoard();
 }
 function toggleBoardOrientation(){
  boardFlipped=!boardFlipped;
  updateFlipButton();
  renderBoard();
  publishOrientation();
 }
 function renderBoard(){
  const board=$('vqcReviewBoard');if(!board)return;
  board.replaceChildren();
  board.classList.toggle('is-empty',!positions.length);
  if(!positions.length){
   for(let r=0;r<8;r++)for(let f=0;f<8;f++){const sq=document.createElement('div');sq.className='square '+((r+f)%2===0?'light':'dark');board.appendChild(sq);}
   return;
  }
  let chess;
  if(variationActive&&variationGame)chess=variationGame;
  else{chess=new Chess();if(!chess.load(positions[current]))return;}
  if(!board.dataset.variationBound){
   board.addEventListener('click',event=>{
    const square=event.target.closest('.square[data-square]');
    if(square)handleVariationSquare(square.dataset.square);
   });
   board.dataset.variationBound='true';
  }
  const grid=chess.board();
  const last=variationActive?variationMoves[variationMoves.length-1]:moves[current-1];
  const legalTargets=selectedSquare?legalVariationMoves(selectedSquare):[];
  const targetSquares=new Set(legalTargets.map(move=>move.to));
  const rows=boardFlipped?[7,6,5,4,3,2,1,0]:[0,1,2,3,4,5,6,7];
  const files=boardFlipped?[7,6,5,4,3,2,1,0]:[0,1,2,3,4,5,6,7];
  board.dataset.orientation=boardFlipped?'black':'white';
  for(const r of rows)for(const f of files){
   const piece=grid[r][f],name='abcdefgh'[f]+(8-r),square=document.createElement('div');
   square.className='square '+((r+f)%2===0?'light':'dark');
   square.dataset.square=name;
   square.dataset.piece=piece?(piece.color==='w'?piece.type.toUpperCase():piece.type):'';
   if(last&&(last.from===name||last.to===name))square.classList.add('last');
   if(variationActive&&selectedSquare===name){
    square.classList.add('selected','review-selected');
   }
   if(piece){
    const holder=document.createElement('span');holder.className='piece';
    const code=piece.color==='w'?piece.type.toUpperCase():piece.type;
    holder.innerHTML=typeof pieceSvgMarkup==='function'?pieceSvgMarkup(code):(glyph[piece.color+piece.type]||'');
    square.appendChild(holder);
   }
   if(variationActive&&targetSquares.has(name)){
    const hint=document.createElement('span');
    hint.className=piece?'capture-hint':'move-hint';
    hint.setAttribute('aria-hidden','true');
    square.appendChild(hint);
   }
   if((!boardFlipped&&f===0)||(boardFlipped&&f===7))
    square.appendChild(makeCoordinate(String(8-r),'rank'));
   if((!boardFlipped&&r===7)||(boardFlipped&&r===0))
    square.appendChild(makeCoordinate('abcdefgh'[f],'file'));
   board.appendChild(square);
  }
  updateFlipButton();
  updateVariationControls();
  paintArrow();
 }
 function renderMoveList(){
  const list=$('vqcReviewMoves');if(!list)return;list.replaceChildren();
  const header=document.createElement('div');header.className='vqc-review-move-head';
  ['#','Trắng','Đen'].forEach(label=>{const cell=document.createElement('span');cell.textContent=label;header.appendChild(cell);});
  list.appendChild(header);
  if(!moves.length){
   const empty=document.createElement('p');empty.className='vqc-review-empty';empty.textContent='Nhập PGN để xem biên bản các nước đi.';list.appendChild(empty);return;
  }
  const startRow=document.createElement('div');startRow.className='vqc-review-start-position';if(current===0)startRow.classList.add('is-current');
  const startBtn=document.createElement('button');startBtn.type='button';startBtn.textContent='Vị trí ban đầu';startBtn.disabled=!isTeacher();startBtn.addEventListener('click',()=>go(0));
  startRow.appendChild(startBtn);list.appendChild(startRow);
  for(let ply=0;ply<moves.length;ply+=2){
   const row=document.createElement('div');row.className='vqc-review-move-row';
   const number=document.createElement('span');number.className='vqc-review-move-number';number.textContent=String(Math.floor(ply/2)+1)+'.';row.appendChild(number);
   const white=document.createElement('button');white.type='button';white.className='vqc-review-move';white.textContent=moves[ply].san;
   white.disabled=!isTeacher();white.setAttribute('aria-label','Nước Trắng '+(Math.floor(ply/2)+1)+': '+moves[ply].san);
   if(current===ply+1){white.classList.add('is-current');white.setAttribute('aria-current','step');}
   white.addEventListener('click',()=>go(ply+1));row.appendChild(white);
   const black=document.createElement('button');black.type='button';black.className='vqc-review-move';
   if(moves[ply+1]){
    black.textContent=moves[ply+1].san;black.disabled=!isTeacher();
    black.setAttribute('aria-label','Nước Đen '+(Math.floor(ply/2)+1)+': '+moves[ply+1].san);
    if(current===ply+2){black.classList.add('is-current');black.setAttribute('aria-current','step');}
    black.addEventListener('click',()=>go(ply+2));
   }else{black.textContent='—';black.disabled=true;black.classList.add('is-empty');}
   row.appendChild(black);list.appendChild(row);
  }
  requestAnimationFrame(scrollMoveIntoView);
 }
 function render(){
  renderBoard();renderMoveList();paintEmptyState();paintHints();
  $('vqcReviewCounter').textContent=positions.length?(variationActive?'Thử biến thể · '+variationMoves.length+' nước':'Ván gốc · '+current+' / '+moves.length+' nước'):'Chưa có ván đấu';
  $('vqcReviewTurn').textContent=positions.length?(variationActive?(variationGame?.turn()==='w'?'Trắng đi tiếp':'Đen đi tiếp')+(variationGame?.isCheck?.()?' · Đang bị chiếu':''):(current===moves.length?'Đã đến vị trí cuối ván':(current%2===0?'Trắng đi tiếp':'Đen đi tiếp'))):'';
  $('vqcReviewMoveCount').textContent=moves.length?moves.length+' nước đi':'Chưa có nước đi';
  $('vqcReviewFirst').disabled=!isTeacher()||!moves.length||current===0;
  const canUndoVariation=variationActive&&variationMoves.length>0;
  $('vqcReviewPrev').disabled=canUndoVariation?false:(!isTeacher()||!moves.length||current===0);
  $('vqcReviewNext').disabled=!isTeacher()||!moves.length||current===moves.length;
  $('vqcReviewLast').disabled=!isTeacher()||!moves.length||current===moves.length;
  $('vqcReviewCopy').disabled=!loadedText;
  $('vqcReviewDownload').disabled=!loadedText;
  evbPaint();
  window.dispatchEvent(new CustomEvent('vqc:game-review-position',{detail:{index:current,total:moves.length}}));
 }
 function go(n,share=true){
  if(!positions.length||!isTeacher())return;
  if(variationActive)resetVariation(false);
  current=Math.max(0,Math.min(moves.length,Number(n)||0));render();
  if(share)publish();
 }
 function stepBackward(){
  if(!positions.length)return;
  if(variationActive&&variationMoves.length){
   const remaining=variationMoves.slice(0,-1);
   if(!remaining.length){
    resetVariation(false);
    clearSharedVariation();
    render();
    return;
   }
   try{
    const chess=new Chess();
    if(!Number.isInteger(variationBaseIndex)||!chess.load(positions[variationBaseIndex]))return;
    const replayed=[];
    for(const item of remaining){
     const move={from:item.from,to:item.to};
     if(['q','r','b','n'].includes(String(item.promotion||'').toLowerCase()))move.promotion=String(item.promotion).toLowerCase();
     const candidate=variationPositionForPiece(chess,item.from);
     if(!candidate)return;
     const made=candidate.move(move);
     if(!made)return;
     replayed.push({san:made.san,from:made.from,to:made.to,color:made.color,promotion:made.promotion||'',fen:candidate.fen()});
     chess.load(candidate.fen());
    }
    variationGame=chess;
    variationMoves=replayed;
    variationActorRole=isTeacher()?'teacher':'student';
    selectedSquare=null;promotionChoices=[];
    updateVariationControls();render();publishVariation();
   }catch(error){console.warn('Không thể lùi một nước trong biến thể:',error);}
   return;
  }
  if(!isTeacher()||current<=0)return;
  go(current-1);
 }
 function publish(){
  if(!connected()||!isTeacher()||applyingRemote)return;
  const payload={open:true,pgn:loadedText,index:current,stamp:Date.now()+'-'+Math.random().toString(36).slice(2,8)};
  roomRef.update({gameReview:payload,gameReviewVariation:null,gameReviewOrientation:orientationPayload(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()})
   .catch(e=>{console.error('PGN classroom sync',e);setMsg('Chưa đồng bộ được với học sinh. Kiểm tra kết nối phòng.','error');});
 }
 function publishVariation(){
  if(!connected()||applyingRemoteVariation||!variationActive||!variationGame||!variationMoves.length)return;
  const stamp=Date.now()+'-'+Math.random().toString(36).slice(2,10);
  const payload={baseIndex:Number.isInteger(variationBaseIndex)?variationBaseIndex:current,
   moves:variationMoves.map(move=>({from:move.from,to:move.to,promotion:move.promotion||''})),
   fen:variationGame.fen(),stamp,clientId:variationClientId,actorRole:isTeacher()?'teacher':'student',revision:++variationRevision};
  variationSharedStamp=stamp;
  roomRef.update({gameReviewVariation:payload,updatedAt:firebase.firestore.FieldValue.serverTimestamp()})
   .catch(error=>{
    console.error('PGN variation classroom sync',error);
    const status=$('vqcReviewVariationStatus');
    if(status)status.textContent='Chưa đồng bộ được nước thử. Hãy kiểm tra kết nối phòng học.';
   });
 }
 function clearSharedVariation(){
  if(!connected())return;
  variationSharedStamp=null;
  roomRef.update({gameReviewVariation:null,updatedAt:firebase.firestore.FieldValue.serverTimestamp()})
   .catch(error=>console.error('Clear PGN variation',error));
 }
 function receiveVariation(data){
  if(!data){
   const hadSharedVariation=!!variationSharedStamp;
   variationSharedStamp=null;
   if(hadSharedVariation&&variationActive)resetVariation(true);
   return;
  }
  if(typeof data!=='object'||workspace()?.hidden||!positions.length)return;
  if(data.clientId===variationClientId){variationSharedStamp=data.stamp||variationSharedStamp;return;}
  const baseIndex=Number(data.baseIndex);
  if(!Number.isInteger(baseIndex)||baseIndex!==current||!Array.isArray(data.moves)||data.moves.length>300)return;
  try{
   let chess=new Chess();
   if(!chess.load(positions[baseIndex]))return;
   const replayed=[];
   for(const item of data.moves){
    if(!item||typeof item.from!=='string'||typeof item.to!=='string')return;
    const move={from:item.from,to:item.to};
    if(['q','r','b','n'].includes(String(item.promotion||'').toLowerCase()))move.promotion=String(item.promotion).toLowerCase();
    const candidate=variationPositionForPiece(chess,item.from);if(!candidate)return;
    const made=candidate.move(move);if(!made)return;
    chess=candidate;
    replayed.push({san:made.san,from:made.from,to:made.to,color:made.color,promotion:made.promotion||'',fen:chess.fen()});
   }
   if(data.fen&&data.fen!==chess.fen())return;
   applyingRemoteVariation=true;
   variationGame=chess;variationActive=true;variationMoves=replayed;variationBaseIndex=baseIndex;
   selectedSquare=null;promotionChoices=[];variationActorRole=data.actorRole==='teacher'?'teacher':'student';variationSharedStamp=data.stamp||null;
   updateVariationControls();render();
  }catch(error){console.warn('Không thể khôi phục biến thể thử được chia sẻ:',error);}
  finally{applyingRemoteVariation=false;}
 }
 function importPgn(raw){
  const normalized=normalizePgn(raw);
  const parsed=parsePgn(normalized);
  positions=parsed.positions;moves=parsed.moves;loadedText=normalized;current=0;
  $('vqcReviewPgn').value=normalized;
  $('vqcReviewImport').open=false;
  resetVariation(false);
  setMsg('');
  render();
  window.dispatchEvent(new CustomEvent('vqc:game-review-loaded',{detail:{positions:positions.slice(),moves:moves.map(move=>({...move})),pgn:loadedText}}));
  publish();
 }
 async function pasteClipboard(){
  if(!isTeacher())return;
  try{
   if(!navigator.clipboard?.readText)throw Error('Trình duyệt chưa hỗ trợ đọc clipboard.');
   const text=await navigator.clipboard.readText();
   if(!text.trim())throw Error('Clipboard đang trống.');
   $('vqcReviewPgn').value=normalizePgn(text);
   $('vqcReviewPgn').focus();
   setMsg('Đã dán nội dung. Nhấn “Tải PGN và chia sẻ” để mở ván đấu.','info');
  }catch(e){
   setMsg((e.message||'Không đọc được clipboard.')+' Bạn có thể nhấn vào ô PGN rồi Ctrl + V.','error');
   $('vqcReviewPgn').focus();
  }
 }
 async function copyPgn(){
  if(!loadedText)return;
  try{await navigator.clipboard.writeText(loadedText);setMsg('Đã sao chép PGN.','success');}
  catch(e){setMsg('Trình duyệt không cho phép sao chép tự động. Hãy chọn nội dung trong ô PGN rồi Ctrl + C.','error');$('vqcReviewImport').open=true;$('vqcReviewPgn').focus();}
 }
 function downloadPgn(){
  if(!loadedText)return;
  const blob=new Blob([loadedText+'\n'],{type:'application/x-chess-pgn;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='dao-ky-thu-van-dau.pgn';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
 }
 window.vqcGameReviewShowBoard=function(){
  setOpen(false);
  if(isTeacher()&&connected())roomRef.update({gameReview:{open:false,stamp:Date.now()+'-closed'},gameReviewVariation:null,updatedAt:firebase.firestore.FieldValue.serverTimestamp()}).catch(console.warn);
 };
 window.vqcGameReviewOpen=function(){
  if(!connected()){if(typeof vqcNotify==='function')vqcNotify('Hãy tạo hoặc vào phòng học trước khi phân tích ván đấu.','warning');return;}
  if(!isTeacher()){if(typeof vqcNotify==='function')vqcNotify('Giáo viên điều khiển chức năng phân tích ván đấu.','warning');return;}
  if(typeof vqcCloseOtherViews==='function')vqcCloseOtherViews('review');
  setOpen(true);$('vqcReviewTeacherTools').hidden=false;$('vqcReviewStudentHint').hidden=true;
  render();publish();
 };
 window.vqcGameReviewClose=window.vqcGameReviewShowBoard;
 window.vqcGameReviewHide=function(){const el=workspace();if(!el||el.hidden)return;window.vqcGameReviewShowBoard();};
 window.vqcGameReviewLoad=function(){
  if(!isTeacher())return;
  try{importPgn($('vqcReviewPgn').value);}
  catch(e){setMsg(e.message||'Không thể đọc PGN.','error');focusImport();}
 };
 window.vqcGameReviewReceive=function(data){
  if(!data||typeof data!=='object')return;
  if(data.open===false){setOpen(false);return;}
  if(data.open!==true||isTeacher())return;
  applyingRemote=true;
  try{
   setOpen(true);$('vqcReviewTeacherTools').hidden=true;$('vqcReviewStudentHint').hidden=false;
   const pgn=normalizePgn(data.pgn||'');
   if(pgn&&pgn!==loadedText){resetVariation(false);const parsed=parsePgn(pgn);positions=parsed.positions;moves=parsed.moves;loadedText=pgn;window.dispatchEvent(new CustomEvent('vqc:game-review-loaded',{detail:{positions:positions.slice(),moves:moves.map(move=>({...move})),pgn:loadedText}}));}
   if(positions.length){
    const incomingIndex=Math.max(0,Math.min(moves.length,Number(data.index)||0));
    if(variationActive&&incomingIndex!==current)resetVariation(false);
    current=incomingIndex;render();
   }
   else{$('vqcReviewPgn').value='';render();}
  }catch(e){setMsg('Không đọc được ván đấu được chia sẻ: '+(e.message||String(e)),'error');}
  finally{applyingRemote=false;}
 };
 window.addEventListener('keydown',e=>{
  if(workspace()?.hidden)return;
  const target=e.target;
  if(target&&(target.matches('textarea,input,select')||target.isContentEditable))return;
  if(e.key==='ArrowLeft'&&variationActive&&variationMoves.length){e.preventDefault();stepBackward();return;}
  if(!isTeacher())return;
  if(e.key==='ArrowLeft'){e.preventDefault();stepBackward();}
  else if(e.key==='ArrowRight'){e.preventDefault();go(current+1);}
  else if(e.key==='Home'){e.preventDefault();go(0);}
  else if(e.key==='End'){e.preventDefault();go(moves.length);}
 });
 let evbOn=false,evbEv=null,evbEng=null,evbEpoch=0,evbAuto='',evbTimer=0,evbLast=null,evbKey='';
 try{evbOn=localStorage.getItem('vqc-review-evbar')==='1';}catch(e){}
 function hashText(t){let h=5381;t=String(t||'');for(let i=0;i<t.length;i++)h=((h<<5)+h+t.charCodeAt(i))|0;return (h>>>0).toString(36)+'-'+t.length;}
 function pgnTag(name,fallback){
  const m=new RegExp('\\['+name+'\\s+"([^"]*)"\\]').exec(loadedText||'');
  const v=m?m[1].trim():'';
  return v&&v!=='?'?v:fallback;
 }
 function evWhite(info,turn){
  if(!info)return null;
  if(info.mate!==null&&info.mate!==undefined)return {mate:turn==='w'?info.mate:-info.mate};
  if(info.cp===null||info.cp===undefined)return null;
  return {cp:turn==='w'?info.cp:-info.cp};
 }
 function evText(ev){
  if(!ev)return '';
  if(ev.mate!==undefined)return (ev.mate>0?'Trắng':'Đen')+' có thể chiếu hết sau '+Math.abs(ev.mate)+' nước';
  if(Math.abs(ev.cp)>=9000)return ev.cp>0?'Trắng thắng':'Đen thắng';
  const a=Math.abs(ev.cp);if(a<30)return 'Thế cờ cân bằng';
  const who=ev.cp>0?'Trắng':'Đen';return a<150?who+' hơi nhỉnh hơn':a<400?who+' đang hơn':who+' hơn rất nhiều';
 }
 function evLabel(ev){
  if(!ev)return '';
  if(ev.mate!==undefined)return 'M'+Math.abs(ev.mate);
  if(Math.abs(ev.cp)>=9000)return ev.cp>0?'1-0':'0-1';
  const v=Math.abs(ev.cp)/100;return v>=10?String(Math.round(v)):v.toFixed(1);
 }
 function evShare(ev){if(!ev)return 50;if(ev.mate!==undefined)return ev.mate>0?97:3;return Math.round(50+50*Math.tanh(ev.cp/400)*0.94);}
 function evbStop(){
  evbEpoch++;clearTimeout(evbTimer);evbAuto='';
  if(evbEng){try{evbEng.dispose();}catch(e){}evbEng=null;}
 }
 function evbRun(fen,turn){
  const ep=++evbEpoch;
  let eng=null;
  try{
   if(!evbEng){if(!window.VqcStockfish)return;evbEng=window.VqcStockfish.create({onStatus:function(){}});}
   eng=evbEng;
  }catch(e){return;}
  eng.search(fen,{movetime:800,skill:20}).then(function(res){
   if(ep!==evbEpoch||!res||res.cancelled)return;
   evbEv={fen:fen,ev:res.valid&&!res.none?evWhite(res.info,turn):null};
   evbPaint();
  }).catch(function(){
   if(ep!==evbEpoch)return;
   if(evbEng){try{evbEng.dispose();}catch(e){}evbEng=null;}
  });
 }
 function evbFor(fen){
  if(!evbOn||!fen)return null;
  if(evbEv&&evbEv.fen===fen)return evbEv.ev;
  let p=null;
  try{p=new Chess();if(!p.load(fen))p=null;}catch(e){p=null;}
  if(!p)return null;
  const over=typeof p.game_over==='function'?p.game_over():p.isGameOver();
  if(over){
   const mate=typeof p.in_checkmate==='function'?p.in_checkmate():p.isCheckmate();
   evbEv={fen:fen,ev:{cp:mate?(p.turn()==='w'?-10000:10000):0}};return evbEv.ev;
  }
  if(evbAuto!==fen){
   evbAuto=fen;clearTimeout(evbTimer);
   const turn=p.turn();
   evbTimer=setTimeout(function(){evbRun(fen,turn);},350);
  }
  return null;
 }
 function evbPaint(){
  const board=$('vqcReviewBoard'),shell=board&&board.parentNode;
  const tg=$('vqcReviewEvToggleRow'),tx=$('vqcReviewEvText'),teacher=isTeacher();
  if(tg){tg.hidden=!teacher;const cb=$('vqcReviewEvToggle');if(cb)cb.checked=evbOn;}
  const on=teacher&&evbOn&&positions.length>0&&!workspace()?.hidden&&!!shell;
  let bar=$('vqcReviewEvBar');
  if(!on){
   if(bar)bar.hidden=true;
   if(tx)tx.hidden=true;
   if(!(teacher&&evbOn)&&evbEng)evbStop();
   return;
  }
  const key=hashText(loadedText);
  if(key!==evbKey){evbKey=key;evbLast=null;}
  const fen=variationActive&&variationGame?variationGame.fen():positions[current];
  const ev=evbFor(fen);
  if(ev)evbLast=ev;
  const shown=ev||evbLast,share=evShare(shown),whiteLead=share>=50;
  if(!bar||bar.parentNode!==shell){
   if(bar&&bar.parentNode)bar.parentNode.removeChild(bar);
   bar=document.createElement('div');bar.id='vqcReviewEvBar';bar.className='vqc-review-evbar';bar.setAttribute('role','img');
   bar.innerHTML='<span class="evb-white"></span><i class="evb-mid"></i><b class="evb-label"></b>';
   shell.appendChild(bar);
  }
  if(getComputedStyle(shell).position==='static')shell.style.position='relative';
  const sr=shell.getBoundingClientRect(),br=board.getBoundingClientRect();
  const room=br.left-sr.left>=36&&br.width>0;
  bar.hidden=!room;
  if(room){
   bar.style.left=(br.left-sr.left-34)+'px';bar.style.top=(br.top-sr.top)+'px';bar.style.height=br.height+'px';
  }
  bar.classList.toggle('flip',boardFlipped);bar.classList.toggle('stale',!ev);
  bar.querySelector('.evb-white').style.height=share+'%';
  const lb=bar.querySelector('.evb-label'),whiteEnd=boardFlipped?'top':'bottom',lead=whiteLead?whiteEnd:(whiteEnd==='top'?'bottom':'top');
  lb.textContent=evLabel(shown);lb.className='evb-label '+lead+(whiteLead?' dk':' lt');
  bar.title=shown?evText(shown):'Đang chờ máy đánh giá…';
  bar.setAttribute('aria-label',shown?'Đánh giá của máy: '+evText(shown):'Chưa có đánh giá của máy');
  if(tx){tx.hidden=false;tx.textContent=shown?' · Đánh giá '+evLabel(shown)+' · '+evText(shown)+(ev?'':' (đang cập nhật…)'):' · Đang đánh giá…';}
 }
 function evbInit(){
  const actions=document.querySelector('#vqcReviewWorkspace .vqc-review-variation-actions__buttons');
  if(actions&&!$('vqcReviewEvToggleRow')){
   const lab=document.createElement('label');lab.id='vqcReviewEvToggleRow';lab.className='vqc-review-evsw';lab.hidden=true;
   lab.innerHTML='<span>Thanh đánh giá</span><input type="checkbox" id="vqcReviewEvToggle"><i aria-hidden="true"></i>';
   actions.appendChild(lab);
   lab.querySelector('input').addEventListener('change',function(e){
    evbOn=!!e.target.checked;evbAuto='';clearTimeout(evbTimer);
    try{localStorage.setItem('vqc-review-evbar',evbOn?'1':'0');}catch(x){}
    if(!evbOn)evbStop();
    evbPaint();
   });
  }
  const turn=$('vqcReviewTurn');
  if(turn&&!$('vqcReviewEvText')){
   const s=document.createElement('span');s.id='vqcReviewEvText';s.className='vqc-review-turn';s.hidden=true;
   turn.parentNode.insertBefore(s,turn.nextSibling);
  }
  const board=$('vqcReviewBoard');
  if(board&&typeof ResizeObserver==='function'){try{new ResizeObserver(function(){requestAnimationFrame(evbPaint);}).observe(board);}catch(e){}}
  window.addEventListener('resize',function(){requestAnimationFrame(evbPaint);});
 }
 window.vqcGameReviewShareData=null;
 window.vqcGameReviewShareReceive=function(d){window.vqcGameReviewShareData=d&&typeof d==='object'?d:null;};
 window.vqcGameReviewApi={
  active:function(){return positions.length>0&&!workspace()?.hidden;},
  info:function(){
   if(!positions.length)return null;
   const res=pgnTag('Result','');
   return {ply:current,total:moves.length,fen0:positions[0],sans:moves.map(function(m){return m.san;}),teacher:isTeacher(),vm:variationActive?variationMoves.length:0,
    key:hashText(loadedText),white:pgnTag('White','Trắng'),black:pgnTag('Black','Đen'),result:res,event:pgnTag('Event','Xem lại ván PGN')};
  },
  jump:function(n){go(n);}
 };
 window.vqcGameReviewGo=go;
 window.vqcGameReviewVariationReceive=receiveVariation;
 window.vqcGameReviewOrientationReceive=receiveOrientation;
 document.addEventListener('DOMContentLoaded',()=>{
  installMoveDrawer();
  installEmptyState();
  installHints();
  evbInit();
  $('vqcReviewPgn')?.addEventListener('input',()=>{const el=$('vqcReviewError');if(el&&el.dataset.kind==='error')setMsg('');});
  $('vqcReviewLoad')?.addEventListener('click',window.vqcGameReviewLoad);
  $('vqcReviewPaste')?.addEventListener('click',pasteClipboard);
  $('vqcReviewFile')?.addEventListener('change',async event=>{
   const file=event.target.files?.[0];if(!file)return;
   try{const text=await file.text();$('vqcReviewPgn').value=normalizePgn(text);setMsg('Đã đọc tệp '+file.name+'. Nhấn “Tải PGN và chia sẻ” để tiếp tục.','info');$('vqcReviewImport').open=true;}
   catch(e){setMsg('Không đọc được tệp PGN: '+(e.message||String(e)),'error');}
   event.target.value='';
  });
  $('vqcReviewCopy')?.addEventListener('click',copyPgn);
  $('vqcReviewDownload')?.addEventListener('click',downloadPgn);
  $('vqcReviewFirst')?.addEventListener('click',()=>go(0));
  $('vqcReviewPrev')?.addEventListener('click',stepBackward);
  $('vqcReviewNext')?.addEventListener('click',()=>go(current+1));
  $('vqcReviewLast')?.addEventListener('click',()=>go(moves.length));
  $('vqcReviewVariationReset')?.addEventListener('click',()=>{resetVariation(true);clearSharedVariation();});
  $('vqcReviewFlipBoard')?.addEventListener('click',toggleBoardOrientation);
  updateFlipButton();
  $('vqcReviewReturnBoard')?.addEventListener('click',()=>{
   if(!isTeacher()&&connected()){if(typeof vqcNotify==='function')vqcNotify('Giáo viên sẽ đóng phần phân tích ván đấu cho cả lớp.','warning');return;}
   window.vqcGameReviewShowBoard?.();
  });
  updateVariationControls();
 });
})();