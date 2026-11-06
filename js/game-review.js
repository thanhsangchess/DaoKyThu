/* Đảo Kỳ Thủ · PGN game review, classroom-synced */
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
 let boardFlipped=false;
 function installMoveDrawer(){
  const workspaceEl=workspace();
  const boardCol=workspaceEl?.querySelector('.vqc-review-workspace__board');
  const side=workspaceEl?.querySelector('.vqc-review-workspace__side');
  const status=workspaceEl?.querySelector('.vqc-review-status');
  const controls=workspaceEl?.querySelector('.vqc-review-controls');
  const importBox=$('vqcReviewImport');
  if(!workspaceEl||!boardCol||!side||!status||!controls||workspaceInstalled)return;

  /* Two-column layout: board left, status/import/moves/navigation right. */
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
  if(!open)window.vqcGameReviewAnalysisCancel?.();

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
  if(!clean)throw Error('Bạn hãy dán PGN hoặc chọn tệp .pgn trước nhé.');
  if(clean.length>50000)throw Error('PGN quá dài (tối đa 50.000 ký tự).');
  const c=new Chess();let ok;
  try{ok=c.load_pgn(clean);}catch(e){throw Error('PGN không hợp lệ: '+(e.message||'không thể đọc nước đi'));}
  if(ok===false)throw Error('Không thể đọc PGN. Hãy kiểm tra ký hiệu nước đi.');
  const history=c.history({verbose:true})||[];
  if(!history.length)throw Error('PGN chưa có nước đi hợp lệ.');
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
    const side=variationGame?.turn()==='w'?'Trắng':'Đen';
    const ending=variationGame?.isCheckmate?.()?' · Chiếu hết':variationGame?.isStalemate?.()?' · Hết nước đi hợp lệ':'';
    status.textContent='Đang thử biến thể riêng · '+variationMoves.length+' nước · '+side+' đi tiếp'+ending+'. Ván PGN gốc không thay đổi.';
   }else{
    status.textContent='Chọn quân cờ trên bàn để tự thử nước đi từ vị trí đang xem.';
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
  variationGame=null;variationActive=false;variationMoves=[];selectedSquare=null;promotionChoices=[];
  updateVariationControls();
  if(shouldRender&&positions.length)render();
 }
 function beginVariation(){
  if(!positions.length)return false;
  const chess=new Chess();
  if(!chess.load(positions[current]))return false;
  variationGame=chess;variationActive=true;variationMoves=[];selectedSquare=null;promotionChoices=[];
  updateVariationControls();
  return true;
 }
 function legalVariationMoves(square){
  if(!variationGame||!square)return [];
  try{return variationGame.moves({square,verbose:true});}catch(error){return [];}
 }
 function playVariationMove(move){
  if(!variationActive||!variationGame||!isTeacher())return;
  try{
   const made=variationGame.move({from:move.from,to:move.to,promotion:move.promotion||'q'});
   if(!made)return;
   variationMoves.push({san:made.san,from:made.from,to:made.to,color:made.color,fen:variationGame.fen()});
   selectedSquare=null;promotionChoices=[];
   updateVariationControls();renderBoard();render();
  }catch(error){
   const status=$('vqcReviewVariationStatus');
   if(status)status.textContent='Nước đi không hợp lệ. Hãy chọn một ô được đánh dấu.';
  }
 }
 function handleVariationSquare(square){
  if(!isTeacher()||!positions.length)return;
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
   if(piece&&piece.color===variationGame.turn()){
    selectedSquare=square;renderBoard();return;
   }
   selectedSquare=null;renderBoard();return;
  }
  if(piece&&piece.color===variationGame.turn()){
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
 function toggleBoardOrientation(){
  boardFlipped=!boardFlipped;
  updateFlipButton();
  renderBoard();
 }
 function renderBoard(){
  const board=$('vqcReviewBoard');if(!board)return;
  board.replaceChildren();
  if(!positions.length)return;
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
  const active=list.querySelector('.vqc-review-move.is-current');
  if(active)active.scrollIntoView({block:'nearest',behavior:'smooth'});
 }
 function render(){
  renderBoard();renderMoveList();
  $('vqcReviewCounter').textContent=positions.length?(variationActive?'Thử biến thể · '+variationMoves.length+' nước':'Ván gốc · '+current+' / '+moves.length+' nước'):'Chưa có ván đấu';
  $('vqcReviewTurn').textContent=positions.length?(variationActive?(variationGame?.turn()==='w'?'Trắng đi tiếp':'Đen đi tiếp')+(variationGame?.isCheck?.()?' · Đang bị chiếu':''):(current===moves.length?'Đã đến vị trí cuối ván':(current%2===0?'Trắng đi tiếp':'Đen đi tiếp'))):'';
  $('vqcReviewMoveCount').textContent=moves.length?moves.length+' nước đi':'Chưa có nước đi';
  $('vqcReviewFirst').disabled=!isTeacher()||!moves.length||current===0;
  $('vqcReviewPrev').disabled=!isTeacher()||!moves.length||current===0;
  $('vqcReviewNext').disabled=!isTeacher()||!moves.length||current===moves.length;
  $('vqcReviewLast').disabled=!isTeacher()||!moves.length||current===moves.length;
  $('vqcReviewCopy').disabled=!loadedText;
  $('vqcReviewDownload').disabled=!loadedText;
  window.dispatchEvent(new CustomEvent('vqc:game-review-position',{detail:{index:current,total:moves.length}}));
 }
 function go(n,share=true){
  if(!positions.length||!isTeacher())return;
  if(variationActive)resetVariation(false);
  current=Math.max(0,Math.min(moves.length,Number(n)||0));render();
  if(share)publish();
 }
 function publish(){
  if(!connected()||!isTeacher()||applyingRemote)return;
  const payload={open:true,pgn:loadedText,index:current,stamp:Date.now()+'-'+Math.random().toString(36).slice(2,8)};
  roomRef.update({gameReview:payload,updatedAt:firebase.firestore.FieldValue.serverTimestamp()})
   .catch(e=>{console.error('PGN classroom sync',e);$('vqcReviewError').textContent='Chưa đồng bộ được với học sinh. Kiểm tra kết nối phòng.';});
 }
 function importPgn(raw){
  const normalized=normalizePgn(raw);
  const parsed=parsePgn(normalized);
  positions=parsed.positions;moves=parsed.moves;loadedText=normalized;current=0;
  $('vqcReviewPgn').value=normalized;
  $('vqcReviewImport').open=false;
  resetVariation(false);
  $('vqcReviewError').textContent='';
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
   $('vqcReviewError').textContent='Đã dán nội dung. Nhấn “Tải PGN và chia sẻ” để mở ván đấu.';
  }catch(e){
   $('vqcReviewError').textContent=(e.message||'Không đọc được clipboard.')+' Bạn có thể nhấn vào ô PGN rồi Ctrl + V.';
   $('vqcReviewPgn').focus();
  }
 }
 async function copyPgn(){
  if(!loadedText)return;
  try{await navigator.clipboard.writeText(loadedText);$('vqcReviewError').textContent='Đã sao chép PGN.';}
  catch(e){$('vqcReviewError').textContent='Trình duyệt không cho phép sao chép tự động. Hãy chọn nội dung trong ô PGN rồi Ctrl + C.';$('vqcReviewImport').open=true;$('vqcReviewPgn').focus();}
 }
 function downloadPgn(){
  if(!loadedText)return;
  const blob=new Blob([loadedText+'\n'],{type:'application/x-chess-pgn;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='dao-ky-thu-van-dau.pgn';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
 }
 window.vqcGameReviewShowBoard=function(){
  setOpen(false);
  if(isTeacher()&&connected())roomRef.update({gameReview:{open:false,stamp:Date.now()+'-closed'},updatedAt:firebase.firestore.FieldValue.serverTimestamp()}).catch(console.warn);
 };
 window.vqcGameReviewOpen=function(){
  if(!connected()){if(typeof vqcNotify==='function')vqcNotify('Hãy tạo hoặc vào phòng học trước khi xem lại ván đấu.','warning');return;}
  if(!isTeacher()){if(typeof vqcNotify==='function')vqcNotify('Giáo viên điều khiển chức năng xem lại ván đấu.','warning');return;}
  setOpen(true);$('vqcReviewTeacherTools').hidden=false;$('vqcReviewStudentHint').hidden=true;
  render();publish();
 };
 window.vqcGameReviewClose=window.vqcGameReviewShowBoard;
 window.vqcGameReviewLoad=function(){
  if(!isTeacher())return;
  try{importPgn($('vqcReviewPgn').value);}
  catch(e){$('vqcReviewError').textContent=e.message||'Không thể đọc PGN.';}
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
   if(positions.length){current=Math.max(0,Math.min(moves.length,Number(data.index)||0));render();}
   else{$('vqcReviewPgn').value='';render();}
  }catch(e){$('vqcReviewError').textContent='Không đọc được ván đấu được chia sẻ: '+(e.message||String(e));}
  finally{applyingRemote=false;}
 };
 window.addEventListener('keydown',e=>{
  if(workspace()?.hidden||!isTeacher())return;
  const target=e.target;
  if(target&&(target.matches('textarea,input,select')||target.isContentEditable))return;
  if(e.key==='ArrowLeft'){e.preventDefault();go(current-1);}
  else if(e.key==='ArrowRight'){e.preventDefault();go(current+1);}
  else if(e.key==='Home'){e.preventDefault();go(0);}
  else if(e.key==='End'){e.preventDefault();go(moves.length);}
 });
 window.vqcGameReviewGo=go;
 document.addEventListener('DOMContentLoaded',()=>{
  installMoveDrawer();
  $('vqcReviewLoad')?.addEventListener('click',window.vqcGameReviewLoad);
  $('vqcReviewPaste')?.addEventListener('click',pasteClipboard);
  $('vqcReviewFile')?.addEventListener('change',async event=>{
   const file=event.target.files?.[0];if(!file)return;
   try{const text=await file.text();$('vqcReviewPgn').value=normalizePgn(text);$('vqcReviewError').textContent='Đã đọc tệp '+file.name+'. Nhấn “Tải PGN và chia sẻ” để tiếp tục.';$('vqcReviewImport').open=true;}
   catch(e){$('vqcReviewError').textContent='Không đọc được tệp PGN: '+(e.message||String(e));}
   event.target.value='';
  });
  $('vqcReviewCopy')?.addEventListener('click',copyPgn);
  $('vqcReviewDownload')?.addEventListener('click',downloadPgn);
  $('vqcReviewFirst')?.addEventListener('click',()=>go(0));
  $('vqcReviewPrev')?.addEventListener('click',()=>go(current-1));
  $('vqcReviewNext')?.addEventListener('click',()=>go(current+1));
  $('vqcReviewLast')?.addEventListener('click',()=>go(moves.length));
  $('vqcReviewVariationReset')?.addEventListener('click',()=>resetVariation(true));
  $('vqcReviewFlipBoard')?.addEventListener('click',toggleBoardOrientation);
  updateFlipButton();
  $('vqcReviewReturnBoard')?.addEventListener('click',()=>window.vqcGameReviewShowBoard?.());
  updateVariationControls();
 });
})();