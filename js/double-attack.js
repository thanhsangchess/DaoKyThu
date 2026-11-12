/* Đảo Kỳ Thủ — Tấn công đôi, 24 sơ đồ trích từ PDF trang 2–5.
   PDF chỉ cho sơ đồ và lượt đi, không kèm đáp án. Bài 18 cần giáo viên đánh giá
   theo bản scan; không tự gán đáp án khi bộ kiểm tra đòn fork chưa xác nhận. */
(function(){
 'use strict';
 const TASKS=[
  {
    "num": 1,
    "pdfPage": 2,
    "fen": "5r2/4b3/2q3kp/2p2p1p/8/1P1N3P/2Q2PP1/3R2K1 w - - 0 1"
  },
  {
    "num": 2,
    "pdfPage": 2,
    "fen": "8/1k6/1p6/2p2q1p/2N4P/1P4B1/5P1K/8 w - - 0 1"
  },
  {
    "num": 3,
    "pdfPage": 2,
    "fen": "8/8/4q1k1/1p3p1r/8/1P4P1/2P1N1B1/Q5K1 w - - 0 1"
  },
  {
    "num": 4,
    "pdfPage": 2,
    "fen": "8/1p1n2bk/2p1q1p1/5p2/8/2P2N1P/1PQB1PK1/8 w - - 0 1"
  },
  {
    "num": 5,
    "pdfPage": 2,
    "fen": "r5k1/p1p3pp/1p3r2/8/8/7P/PPPQ1PP1/6K1 w - - 0 1"
  },
  {
    "num": 6,
    "pdfPage": 2,
    "fen": "4r2k/2q3p1/8/2p1p3/8/1P4P1/4Q1KP/5R2 w - - 0 1"
  },
  {
    "num": 7,
    "pdfPage": 3,
    "fen": "k7/2pr4/1p1b4/6p1/6P1/7P/6K1/3Q4 w - - 0 1"
  },
  {
    "num": 8,
    "pdfPage": 3,
    "fen": "r7/1n5k/3p3p/2p1p1p1/4P3/1P4P1/1KP2Q2/8 w - - 0 1"
  },
  {
    "num": 9,
    "pdfPage": 3,
    "fen": "8/8/1n3k1p/6p1/r1p5/2P4B/1P2R3/6K1 w - - 0 1"
  },
  {
    "num": 10,
    "pdfPage": 3,
    "fen": "8/8/4k1n1/1p6/4PP2/2P1K3/1P6/8 w - - 0 1"
  },
  {
    "num": 11,
    "pdfPage": 3,
    "fen": "6k1/5pp1/1pr1q2p/p7/1pPP4/1P5P/P4PP1/R2Q2K1 w - - 0 1"
  },
  {
    "num": 12,
    "pdfPage": 3,
    "fen": "8/7k/6b1/1P2p3/2PpP3/8/2K3R1/8 b - - 0 1"
  },
  {
    "num": 13,
    "pdfPage": 4,
    "sourceLabel": "PDF lặp nhãn Bài 12",
    "fen": "r6r/1p1k4/2pp2p1/8/2RPR3/6P1/1P3K2/8 b - - 0 1"
  },
  {
    "num": 14,
    "pdfPage": 4,
    "fen": "8/6k1/7p/1b4p1/3PNpP1/2P5/8/1K6 b - - 0 1"
  },
  {
    "num": 15,
    "pdfPage": 4,
    "fen": "8/2p3p1/bb4k1/8/4N1N1/1P3p2/K4P2/8 b - - 0 1"
  },
  {
    "num": 16,
    "pdfPage": 4,
    "fen": "7k/4qpp1/r2p4/1p6/1P6/1Q6/2P2PP1/5RK1 w - - 0 1"
  },
  {
    "num": 17,
    "pdfPage": 4,
    "fen": "7k/5pp1/3pq3/2n5/1Q5P/5NP1/5PK1/8 w - - 0 1"
  },
  {
    "num": 18,
    "pdfPage": 4,
    "sourceLabel": "Cần giáo viên xác nhận theo sơ đồ scan",
    "fen": "7k/8/7p/2B3p1/2B5/7P/6PK/1r6 w - - 0 1"
  },
  {
    "num": 19,
    "pdfPage": 5,
    "fen": "4r1k1/p4p1p/6p1/4p3/r3P3/7P/P3QPP1/6K1 w - - 0 1"
  },
  {
    "num": 20,
    "pdfPage": 5,
    "fen": "1r4k1/p4p1p/1p3np1/2p1p3/4P3/1P5P/P5P1/3Q2K1 w - - 0 1"
  },
  {
    "num": 21,
    "pdfPage": 5,
    "fen": "2r3k1/bp3npp/5n2/8/8/2N2QPP/1P3PK1/8 w - - 0 1"
  },
  {
    "num": 22,
    "pdfPage": 5,
    "fen": "1k6/2p4r/r4p2/8/8/5QP1/1P4KP/8 w - - 0 1"
  },
  {
    "num": 23,
    "pdfPage": 5,
    "fen": "6k1/r4p1p/2p2np1/pp2p3/4P3/P1B4P/1P1Q2P1/6K1 w - - 0 1"
  },
  {
    "num": 24,
    "pdfPage": 5,
    "fen": "3q2k1/1p3ppp/p1pQ4/2P4r/nP6/P7/5PP1/5RK1 w - - 0 1"
  }
];
 const FILES='abcdefgh',MANUAL_ONLY=new Set([17]);
 const $=id=>document.getElementById(id),overlay=()=>$('doubleAttackOverlay');
 let index=0,game=null,selected=null,solved=false,failed=false,hint=false,manualReview=false;
 let hintMove=null,lastMove=null,targetSquares=[],feedback='',isOpen=false,receivedKey='';
 const done=new Set();
 let catalogChecked=false;
 function inRoom(){return typeof roomRef!=='undefined'&&!!roomRef;}
 function student(){return inRoom()&&(typeof role!=='undefined'?role:window.accountProfile?.role)==='student';}
 function task(){return TASKS[index];}
 function sideToMove(t=task()){return t.fen.split(' ')[1]==='w'?'Trắng':'Đen';}
 function xy(square){return {x:FILES.indexOf(square[0]),y:Number(square[1])-1};}
 function pieceName(piece){
  const names={p:'Tốt',n:'Mã',b:'Tượng',r:'Xe',q:'Hậu',k:'Vua'};
  return (piece.color==='w'?'Trắng ':'Đen ')+(names[piece.type]||'quân');
 }
 function clearRay(position,from,to){
  const a=xy(from),b=xy(to),sx=Math.sign(b.x-a.x),sy=Math.sign(b.y-a.y);
  let x=a.x+sx,y=a.y+sy;
  while(x!==b.x||y!==b.y){
   if(position.get(FILES[x]+(y+1)))return false;
   x+=sx;y+=sy;
  }
  return true;
 }
 function attacksSquare(position,from,to){
  const piece=position.get(from);if(!piece||from===to)return false;
  const a=xy(from),b=xy(to),dx=b.x-a.x,dy=b.y-a.y,ax=Math.abs(dx),ay=Math.abs(dy),type=piece.type;
  if(type==='p')return ax===1&&dy===(piece.color==='w'?1:-1);
  if(type==='n')return (ax===1&&ay===2)||(ax===2&&ay===1);
  if(type==='k')return Math.max(ax,ay)===1;
  if(type==='r'&&dx!==0&&dy!==0)return false;
  if(type==='b'&&ax!==ay)return false;
  if(type==='q'&&!(dx===0||dy===0||ax===ay))return false;
  if(!['b','r','q'].includes(type))return false;
  return clearRay(position,from,to);
 }
 function targetsAttackedBy(position,from){
  const attacker=position.get(from);if(!attacker)return [];
  const targets=[];
  for(let rank=1;rank<=8;rank++)for(const file of FILES){
   const square=file+rank,piece=position.get(square);
   if(!piece||piece.color===attacker.color)continue;
   if(attacksSquare(position,from,square))targets.push({square,piece:{color:piece.color,type:piece.type},name:pieceName(piece)});
  }
  return targets;
 }
 function findForkMoves(t){
  const original=new Chess(t.fen),found=[];
  for(const move of original.moves({verbose:true})){
   const trial=new Chess(t.fen),made=trial.move({from:move.from,to:move.to,promotion:move.promotion||'q'});
   if(!made)continue;
   const targets=targetsAttackedBy(trial,made.to);
   if(targets.length>=2)found.push({from:made.from,to:made.to,san:made.san,targets});
  }
  return found;
 }
 function validateCatalog(){
  if(catalogChecked)return;
  if(typeof Chess!=='function')throw Error('Thư viện luật cờ vua chưa được tải.');
  if(TASKS.length!==24)throw Error('Danh mục chưa đủ 24 bài.');
  TASKS.forEach((t,i)=>{
   if(t.num!==i+1)throw Error('Sai thứ tự Bài '+(i+1)+'.');
   const chess=new Chess(t.fen),whiteKings=[],blackKings=[];
   if(chess.fen().split(' ')[0]!==t.fen.split(' ')[0])throw Error('FEN không hợp lệ ở Bài '+t.num+'.');
   for(let rank=1;rank<=8;rank++)for(const file of FILES){
    const p=chess.get(file+rank);if(p?.type==='k')(p.color==='w'?whiteKings:blackKings).push(file+rank);
   }
   if(whiteKings.length!==1||blackKings.length!==1)throw Error('Thiếu/thừa Vua ở Bài '+t.num+'.');
   if(!chess.moves().length)throw Error('Bài '+t.num+' không có nước đi hợp lệ.');
   if(!MANUAL_ONLY.has(i)&&!findForkMoves(t).length)throw Error('Chưa xác nhận được đòn tấn công đôi ở Bài '+t.num+'. Hãy rà sơ đồ trước khi dùng.');
  });
  catalogChecked=true;
 }
 function progressKey(){return 'vqc-double-attack-'+(window.accountProfile?.uid||window.accountProfile?.id||'guest');}
 function restoreDone(){
  try{const list=JSON.parse(localStorage.getItem(progressKey())||'[]');if(Array.isArray(list))list.forEach(n=>{if(Number.isInteger(n)&&n>=0&&n<24)done.add(n);});}catch(e){}
 }
 function persistDone(){try{localStorage.setItem(progressKey(),JSON.stringify([...done]));}catch(e){}}
 function freshPosition(){
  game=new Chess(task().fen);selected=null;solved=false;failed=false;hint=false;manualReview=false;
  hintMove=null;lastMove=null;targetSquares=[];
  feedback='Lượt đi: '+sideToMove()+'. Hãy tìm một nước tấn công đôi.';
 }
 function renderBoard(){
  const board=$('doubleAttackBoard');if(!board||!game)return;
  const annotationLayer=board.querySelector(':scope > .vqc-annotation-overlay');
  board.querySelectorAll(':scope > .double-attack-cell').forEach(cell=>cell.remove());
  const legal=selected?game.moves({square:selected,verbose:true}).map(move=>move.to):[];
  const hintTargets=hintMove?.targets?.map(target=>target.square)||[];
  for(let rank=8;rank>=1;rank--)for(let fi=0;fi<8;fi++){
   const square=FILES[fi]+rank,piece=game.get(square),cell=document.createElement('button');
   cell.type='button';cell.dataset.square=square;cell.dataset.piece=piece?(piece.color==='w'?piece.type.toUpperCase():piece.type):'';
   cell.className='double-attack-cell '+(((8-rank+fi)%2===0)?'light':'dark');
   if(selected===square)cell.classList.add('selected');
   if(legal.includes(square)){cell.classList.add('legal');if(piece)cell.classList.add('has-piece');}
   if(hint&&hintMove?.from===square)cell.classList.add('hint-from');
   if(hint&&hintMove?.to===square)cell.classList.add('hint-to');
   if((hint&&hintTargets.includes(square))||targetSquares.some(target=>target.square===square))cell.classList.add('double-target');
   cell.setAttribute('aria-label','Ô '+square+(piece?' · '+pieceName(piece):''));
   if(piece){
    const holder=document.createElement('span');holder.className='double-attack-piece';
    const code=piece.color==='w'?piece.type.toUpperCase():piece.type;
    holder.innerHTML=typeof window.pieceSvgMarkup==='function'?window.pieceSvgMarkup(code):'';
    if(!holder.innerHTML)holder.textContent=code;
    cell.appendChild(holder);
   }
   if(fi===0){const coord=document.createElement('span');coord.className='double-attack-coordinate double-attack-rank';coord.textContent=String(rank);cell.appendChild(coord);}
   if(rank===1){const coord=document.createElement('span');coord.className='double-attack-coordinate double-attack-file';coord.textContent=FILES[fi];cell.appendChild(coord);}
   cell.addEventListener('click',()=>clickSquare(square));board.appendChild(cell);
  }
  if(annotationLayer&&annotationLayer.parentElement!==board)board.appendChild(annotationLayer);
  window.vqcLastMove?.mark('doubleAttackBoard',lastMove?.from||null,lastMove?.to||null);
 }
 function render(){
  if(!game)return;
  const t=task();
  $('doubleAttackTitle').textContent='⚔️ Tấn công đôi — Bài '+t.num+(t.sourceLabel?'*':'')+' ('+(index+1)+'/24)';
  $('doubleAttackSubtitle').textContent=sideToMove(t)+' đi trước · Theo sơ đồ PDF trang '+t.pdfPage;
  $('doubleAttackNumber').textContent='Bài '+(index+1)+' / 24';
  $('doubleAttackFeedback').textContent=feedback;
  $('doubleAttackFeedback').className='double-attack-feedback'+(solved?' success':failed?' error':'');
  $('doubleAttackProgress').textContent='Đã hoàn thành '+done.size+'/24 bài';
  $('doubleAttackPrev').disabled=index===0||student();
  $('doubleAttackNext').disabled=index===23||student();
  $('doubleAttackJump').disabled=student();$('doubleAttackGo').disabled=student();
  $('doubleAttackHint').disabled=solved||failed||manualReview;
  $('doubleAttackReset').disabled=!failed&&!solved&&!manualReview&&!lastMove;
  $('doubleAttackTargets').textContent=targetSquares.length>=2
   ?'Mục tiêu bị tấn công: '+targetSquares.map(t=>t.square+' ('+t.name+')').join(' · '):'';
  $('doubleAttackSourceNote').textContent=t.sourceLabel
   ?'Nguồn: PDF in lặp nhãn Bài 12 tại vị trí 13. Ứng dụng đánh số liên tục 1–24.':'';
  const confirm=$('doubleAttackConfirm');
  if(confirm)confirm.hidden=!(manualReview&&!solved&&!student());
  renderBoard();
 }
 function clickSquare(square){
  if(!isOpen||!game||solved||failed||manualReview)return;
  const piece=game.get(square);
  if(piece&&piece.color===game.turn()){
   selected=selected===square?null:square;hint=false;hintMove=null;render();return;
  }
  if(!selected)return;
  const move=game.moves({square:selected,verbose:true}).find(item=>item.to===square);
  if(!move){selected=null;feedback='Ô này không phải nước đi hợp lệ. Hãy chọn lại.';render();return;}
  const made=game.move({from:move.from,to:move.to,promotion:move.promotion||'q'});
  if(!made)return;
  selected=null;hint=false;hintMove=null;lastMove={from:made.from,to:made.to};
  targetSquares=targetsAttackedBy(game,made.to);
  if(targetSquares.length>=2){
   solved=true;failed=false;done.add(index);persistDone();
   feedback='✅ Tấn công đôi thành công! '+made.san+' đồng thời đe dọa '+targetSquares.length+' quân đối phương.';
  }else if(MANUAL_ONLY.has(index)){
   manualReview=true;failed=false;
   feedback='Nước đi đã được ghi nhận. Theo sơ đồ scan hiện có, hệ thống chưa xác nhận được đòn fork đơn; giáo viên hãy kiểm tra và có thể xác nhận hoàn thành.';
  }else{
   failed=true;
   feedback='Nước đi hợp lệ nhưng chưa tạo đòn tấn công đôi (chưa tấn công đồng thời ít nhất hai quân đối phương). Hãy thử lại.';
  }
  render();publish();
 }
 function publish(){
  if(!isOpen||!inRoom()||typeof vqcExerciseWrite!=='function'||
     (typeof vqcApplyingExercise!=='undefined'&&vqcApplyingExercise)||
     (typeof vqcNavApplying!=='undefined'&&vqcNavApplying))return;
  vqcExerciseWrite('doubleAttackExercise',{
   index,fen:game.fen(),solved,failed,manualReview,hint,hintMove,lastMove,targetSquares,
   feedback,done:[...done],nonce:Date.now()+'-'+Math.random().toString(36).slice(2,8)
  });
 }
 function receive(data){
  if(!data||!isOpen||!game||data.index!==index||typeof data.fen!=='string'||
     data.fen.length>120||!Array.isArray(data.done)||data.done.length>24)return;
  if(typeof vqcExerciseClientId!=='undefined'&&data.clientId===vqcExerciseClientId)return;
  const signature=JSON.stringify(data);if(signature===receivedKey)return;receivedKey=signature;
  const base=new Chess(task().fen);let receivedGame=null,replayedMove=null;
  if(data.fen===task().fen)receivedGame=base;
  else for(const candidate of base.moves({verbose:true})){
   const attempt=new Chess(task().fen);
   const made=attempt.move({from:candidate.from,to:candidate.to,promotion:candidate.promotion||'q'});
   if(made&&attempt.fen()===data.fen){receivedGame=attempt;replayedMove={from:made.from,to:made.to};break;}
  }
  if(!receivedGame)return;
  const computedTargets=replayedMove?targetsAttackedBy(receivedGame,replayedMove.to):[];
  const computedSolved=computedTargets.length>=2;
  if(typeof vqcApplyingExercise!=='undefined')vqcApplyingExercise=true;
  try{
   game=receivedGame;solved=computedSolved||!!data.solved&&MANUAL_ONLY.has(index);
   failed=!!data.failed&&!solved;manualReview=!!data.manualReview&&MANUAL_ONLY.has(index);
   hint=!!data.hint;hintMove=hint?findForkMoves(task())[0]||null:null;
   lastMove=replayedMove;targetSquares=computedTargets;selected=null;
   feedback=String(data.feedback||'').slice(0,500);
   (data.done||[]).forEach(n=>{if(Number.isInteger(n)&&n>=0&&n<24)done.add(n);});
   if(solved)done.add(index);persistDone();render();
  }finally{if(typeof vqcApplyingExercise!=='undefined')vqcApplyingExercise=false;}
 }
 function open(i=0,remote=false){
  try{validateCatalog();}catch(error){
   if(typeof window.vqcNotify==='function')window.vqcNotify('Chưa thể mở bài Tấn công đôi: '+error.message,'warning');
   else alert(error.message);return;
  }
  if(!remote&&student()){
   if(typeof window.vqcNotify==='function')window.vqcNotify('Giáo viên chọn bài chung; em có thể trực tiếp giải trên bàn cờ.','warning');
   return;
  }
  const n=Number(i);index=Number.isInteger(n)?Math.max(0,Math.min(23,n)):0;
  if(typeof window.vqcCloseOtherViews==='function')window.vqcCloseOtherViews('doubleattack');
  const el=overlay();if(el?.parentElement!==document.body)document.body.append(el);
  isOpen=true;el?.classList.add('open');restoreDone();freshPosition();render();
  if(!remote){if(typeof window.vqcBroadcastView==='function')window.vqcBroadcastView('doubleattack',index);publish();}
 }
 function close(){
  if(student()){if(typeof window.vqcNotify==='function')window.vqcNotify('Giáo viên điều khiển việc đóng bài chung.','warning');return;}
  isOpen=false;selected=null;overlay()?.classList.remove('open');
  if(inRoom()&&typeof window.vqcBroadcastView==='function')window.vqcBroadcastView('board');
 }
 function reset(){if(!isOpen)return;freshPosition();render();publish();}
 function change(delta){if(student())return;const n=index+delta;if(n<0||n>=24)return;open(n);}
 function jump(){if(student())return;const n=Number($('doubleAttackJump').value);if(Number.isInteger(n)&&n>=1&&n<=24)open(n-1);}
 function showHint(){
  if(!isOpen||solved||failed||manualReview)return;
  const candidate=findForkMoves(task())[0];
  if(!candidate){feedback='Chưa có gợi ý tự động đáng tin cậy cho sơ đồ này. Giáo viên có thể phân tích trực tiếp.';render();return;}
  hint=true;hintMove=candidate;
  feedback='💡 Gợi ý: thử '+candidate.san+' ('+candidate.from+' → '+candidate.to+'). Nước này đồng thời tấn công '+candidate.targets.map(t=>t.square).join(' và ')+'.';
  render();publish();
 }
 function confirmManual(){
  if(!isOpen||!MANUAL_ONLY.has(index)||!manualReview||student())return;
  solved=true;failed=false;done.add(index);persistDone();
  feedback='✅ Giáo viên đã xác nhận hoàn thành Bài 18.';
  render();publish();
 }
 window.doubleAttackOpen=open;window.doubleAttackClose=close;window.vqcDoubleAttackReceive=receive;
 document.addEventListener('DOMContentLoaded',()=>{
  $('doubleAttackClose')?.addEventListener('click',close);
  $('doubleAttackPrev')?.addEventListener('click',()=>change(-1));
  $('doubleAttackNext')?.addEventListener('click',()=>change(1));
  $('doubleAttackReset')?.addEventListener('click',reset);
  $('doubleAttackHint')?.addEventListener('click',showHint);
  $('doubleAttackGo')?.addEventListener('click',jump);
  $('doubleAttackConfirm')?.addEventListener('click',confirmManual);
  $('doubleAttackJump')?.addEventListener('keydown',e=>{if(e.key==='Enter')jump();});
  overlay()?.addEventListener('click',e=>{if(e.target===overlay())close();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&overlay()?.classList.contains('open'))close();});
 });
})();