/* Đảo Kỳ Thủ · shared PGN game review for classroom */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const glyph={wk:'♔',wq:'♕',wr:'♖',wb:'♗',wn:'♘',wp:'♙',bk:'♚',bq:'♛',br:'♜',bb:'♝',bn:'♞',bp:'♟︎'};
 let game=null, positions=[], moves=[], current=0, loadedText='', applyingRemote=false, stamp='';
 const overlay=()=> $('vqcGameReviewOverlay');
 const isTeacher=()=>typeof role!=='undefined'&&role==='teacher';
 const connected=()=>typeof roomRef!=='undefined'&&!!roomRef;
 function setOpen(open){const el=overlay();if(!el)return;el.classList.toggle('open',!!open);el.setAttribute('aria-hidden',open?'false':'true');}
 function parsePgn(pgn){
  if(!window.Chess)throw Error('Không tải được bộ luật cờ vua.');
  const clean=String(pgn||'').trim();if(!clean)throw Error('Vui lòng dán nội dung PGN.');
  if(clean.length>50000)throw Error('PGN quá dài (tối đa 50.000 ký tự).');
  const c=new Chess();
  let ok;
  try{ok=c.load_pgn(clean);}catch(e){throw Error('PGN không hợp lệ: '+(e.message||'không thể đọc ván đấu'));}
  if(ok===false)throw Error('Không thể đọc PGN. Hãy kiểm tra ký hiệu nước đi.');
  const hist=c.history({verbose:true})||[];
  const fens=new Array(hist.length+1);fens[hist.length]=c.fen();
  for(let i=hist.length-1;i>=0;i--){c.undo();fens[i]=c.fen();}
  if(hist.length===0)throw Error('PGN chưa có nước đi hợp lệ.');
  return {positions:fens,moves:hist.map(m=>({san:m.san,from:m.from,to:m.to,color:m.color}))};
 }
 function render(){
  const board=$('vqcReviewBoard');if(!board)return;
  board.replaceChildren();
  const fen=positions[current];if(!fen)return;
  const c=new Chess();c.load(fen);
  const grid=c.board(),last=moves[current-1];
  for(let r=0;r<8;r++)for(let f=0;f<8;f++){
   const piece=grid[r][f],sq='abcdefgh'[f]+(8-r),el=document.createElement('div');
   el.className='vqc-review-square '+((r+f)%2?'dark':'light');
   if(last&&(last.from===sq||last.to===sq))el.classList.add('last');
   if(piece)el.textContent=glyph[piece.color+piece.type]||'';
   if(f===0){const coord=document.createElement('span');coord.className='coord';coord.textContent=8-r;el.appendChild(coord);}
   if(r===7){const coord=document.createElement('span');coord.className='coord';coord.style.left='auto';coord.style.right='3px';coord.style.top='auto';coord.style.bottom='3px';coord.textContent='abcdefgh'[f];el.appendChild(coord);}
   board.appendChild(el);
  }
  $('vqcReviewCounter').textContent=current+' / '+moves.length+' nước';
  $('vqcReviewTurn').textContent=(current===moves.length?'Đã đến vị trí cuối ván':(current%2===0?'Trắng đi':'Đen đi'));
  $('vqcReviewPrev').disabled=current===0;$('vqcReviewFirst').disabled=current===0;
  $('vqcReviewNext').disabled=current===moves.length;$('vqcReviewLast').disabled=current===moves.length;
  const list=$('vqcReviewMoves');list.replaceChildren();
  const start=document.createElement('button');start.textContent='Vị trí ban đầu';start.classList.toggle('active',current===0);start.disabled=!isTeacher();start.addEventListener('click',()=>go(0));list.appendChild(start);
  moves.forEach((m,i)=>{const b=document.createElement('button');b.textContent=(Math.floor(i/2)+1)+(i%2?'... ':' . ')+m.san;b.classList.toggle('active',current===i+1);b.disabled=!isTeacher();b.addEventListener('click',()=>go(i+1));list.appendChild(b);});
 }
 function go(n,share=true){if(!positions.length)return;current=Math.max(0,Math.min(moves.length,Number(n)||0));render();if(share&&isTeacher())publish();}
 function publish(){
  if(!connected()||!isTeacher()||applyingRemote)return;
  const payload={open:true,pgn:loadedText,index:current,stamp:Date.now()+'-'+Math.random().toString(36).slice(2,8)};
  stamp=payload.stamp;
  roomRef.update({gameReview:payload,updatedAt:firebase.firestore.FieldValue.serverTimestamp()})
   .catch(e=>{console.error('PGN classroom sync',e);$('vqcReviewError').textContent='Chưa đồng bộ được với học sinh. Kiểm tra kết nối phòng.';});
 }
 window.vqcGameReviewOpen=function(){
  if(!connected()){if(typeof vqcNotify==='function')vqcNotify('Hãy tạo hoặc vào phòng học trước khi mở xem lại ván đấu.','warning');return;}
  if(!isTeacher()){if(typeof vqcNotify==='function')vqcNotify('Giáo viên điều khiển chức năng xem lại ván đấu.','warning');return;}
  setOpen(true);$('vqcReviewTeacherTools').hidden=false;$('vqcReviewStudentHint').hidden=true;
  publish();
 };
 window.vqcGameReviewClose=function(){
  if(!isTeacher())return;
  setOpen(false);
  if(connected())roomRef.update({gameReview:{open:false,stamp:Date.now()+'-closed'},updatedAt:firebase.firestore.FieldValue.serverTimestamp()}).catch(console.warn);
 };
 window.vqcGameReviewLoad=function(){
  if(!isTeacher())return;
  $('vqcReviewError').textContent='';
  try{
   const raw=$('vqcReviewPgn').value.trim(),parsed=parsePgn(raw);
   positions=parsed.positions;moves=parsed.moves;loadedText=raw;current=0;render();publish();
  }catch(e){$('vqcReviewError').textContent=e.message||'Không thể đọc PGN.';}
 };
 window.vqcGameReviewReceive=function(data){
  if(!data||typeof data!=='object')return;
  if(data.open===false){setOpen(false);return;}
  if(data.open!==true)return;
  applyingRemote=true;
  try{
   setOpen(true);$('vqcReviewTeacherTools').hidden=true;$('vqcReviewStudentHint').hidden=false;
   const pgn=String(data.pgn||'');
   if(pgn&&pgn!==loadedText){
    const parsed=parsePgn(pgn);positions=parsed.positions;moves=parsed.moves;loadedText=pgn;
   }
   if(positions.length){current=Math.max(0,Math.min(moves.length,Number(data.index)||0));render();}
   else{$('vqcReviewCounter').textContent='Chờ giáo viên nhập PGN';$('vqcReviewTurn').textContent='';$('vqcReviewBoard').replaceChildren();$('vqcReviewMoves').replaceChildren();}
  }catch(e){$('vqcReviewError').textContent='Không đọc được ván đấu được chia sẻ: '+(e.message||String(e));}
  finally{applyingRemote=false;}
 };
 window.addEventListener('keydown',e=>{if(!overlay()?.classList.contains('open')||!isTeacher())return;if(e.key==='ArrowLeft')go(current-1);if(e.key==='ArrowRight')go(current+1);});
 window.vqcGameReviewGo=go;
 document.addEventListener('DOMContentLoaded',()=>{
  $('vqcReviewLoad').addEventListener('click',window.vqcGameReviewLoad);
  $('vqcReviewFirst').addEventListener('click',()=>go(0));
  $('vqcReviewPrev').addEventListener('click',()=>go(current-1));
  $('vqcReviewNext').addEventListener('click',()=>go(current+1));
  $('vqcReviewLast').addEventListener('click',()=>go(moves.length));
 });
})();