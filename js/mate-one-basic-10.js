/* 10 basic, original mate-in-one exercises. Exactly three pieces per position.\n   All examples must have exactly one legal mate, verified with chess.js.\n   Uses the same exercise and classroom sync conventions as PDF mate-one. */
(function(){
'use strict';
const $=id=>document.getElementById(id),TOTAL=10,FILES='abcdefgh';
let puzzles=null,idx=0,game=null,selected=null,hint=false,feedback='',solved=false,failed=false,lastMove=null,isOpen=false;
const done=new Set();
let receivedKey='',savedFor='';
function roomOn(){return typeof roomRef!=='undefined'&&!!roomRef;}
function student(){return roomOn()&&(typeof role!=='undefined'?role:window.accountProfile?.role)==='student';}
const BASIC_MATE_PUZZLES=[
 {
  "num": 1,
  "label": "Hậu — chiếu theo hàng ngang",
  "fen": "7k/5K2/8/8/8/Q7/8/8 w - - 0 1",
  "answer": "Qh3#"
 },
 {
  "num": 2,
  "label": "Hậu — khóa góc bàn cờ",
  "fen": "k7/8/2K5/8/8/1Q6/8/8 w - - 0 1",
  "answer": "Qb7#"
 },
 {
  "num": 3,
  "label": "Hậu — ép Vua ở cạnh bàn",
  "fen": "8/8/5K2/7k/8/Q7/8/8 w - - 0 1",
  "answer": "Qh3#"
 },
 {
  "num": 4,
  "label": "Hậu — phối hợp cùng Vua",
  "fen": "3k4/8/2K5/8/8/7Q/8/8 w - - 0 1",
  "answer": "Qd7#"
 },
 {
  "num": 5,
  "label": "Hậu — chiếu ở cột a",
  "fen": "8/8/8/8/8/6Q1/2K5/k7 w - - 0 1",
  "answer": "Qa3#"
 },
 {
  "num": 6,
  "label": "Xe — chiếu theo hàng ngang",
  "fen": "7k/5K2/8/8/8/R7/8/8 w - - 0 1",
  "answer": "Rh3#"
 },
 {
  "num": 7,
  "label": "Xe — chiếu ở hàng 8",
  "fen": "k7/8/1K6/8/8/2R5/8/8 w - - 0 1",
  "answer": "Rc8#"
 },
 {
  "num": 8,
  "label": "Xe — ép Vua vào góc",
  "fen": "8/8/8/8/8/2R3K1/8/7k w - - 0 1",
  "answer": "Rc1#"
 },
 {
  "num": 9,
  "label": "Xe — đường chiếu dài",
  "fen": "3k4/8/3K4/8/8/7R/8/8 w - - 0 1",
  "answer": "Rh8#"
 },
 {
  "num": 10,
  "label": "Xe — khóa đường thoát",
  "fen": "8/8/8/1R6/8/8/2K5/k7 w - - 0 1",
  "answer": "Ra5#"
 }
];
function catalog(){
 if(puzzles)return puzzles;
 if(typeof Chess!=='function')throw Error('Chưa tải được thư viện luật cờ vua.');
 const seen=new Set();
 puzzles=BASIC_MATE_PUZZLES.map((p,i)=>{
  if(p.num!==i+1||!p.fen||!p.answer||seen.has(p.fen))throw Error('Dữ liệu bài cơ bản '+(i+1)+' không hợp lệ.');
  seen.add(p.fen);
  const g=new Chess(p.fen);
  if(g.fen()!==p.fen||g.turn()!=='w'||g.in_check())throw Error('Thế cờ cơ bản '+(i+1)+' không hợp lệ.');
  const enemy=new Chess(p.fen.replace(' w ',' b '));
  if(enemy.in_check())throw Error('Vua đối phương đã bị chiếu trong bài '+(i+1));
  const pieces=g.board().flat().filter(Boolean);
  if(pieces.length!==3)throw Error('Bài '+(i+1)+' không có đúng 3 quân.');
  const mates=[];
  for(const move of g.moves({verbose:true})){
   g.move(move);
   if(g.in_checkmate())mates.push(move);
   g.undo();
  }
  if(mates.length!==1||mates[0].san!==p.answer)throw Error('Bài '+(i+1)+' không có đúng một nước chiếu hết hợp lệ.');
  return {...p,color:'w',from:mates[0].from,to:mates[0].to,promotion:null};
 });
 return puzzles;
}
function cacheKey(){return 'vqc-basic-mate10-done-'+(window.accountProfile?.uid||window.accountProfile?.id||'guest');}
function restoreProgress(){
 const key=cacheKey();if(savedFor===key)return;savedFor=key;done.clear();
 try{const values=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(values))values.filter(n=>Number.isInteger(n)&&n>=0&&n<TOTAL).forEach(n=>done.add(n));}catch(e){}
}
function persist(){try{localStorage.setItem(cacheKey(),JSON.stringify([...done]));}catch(e){}}
function puzzle(){return catalog()[idx];}
function newPosition(){game=new Chess(puzzle().fen);selected=null;hint=false;feedback=(puzzle().color==='w'?'Trắng':'Đen')+' đi trước. Hãy tìm một nước đi để chiếu hết Vua đối phương.';solved=false;failed=false;lastMove=null;}
function message(s){feedback=s;render();}
function paint(){
 const board=$('vqcMateOneBasicBoard');if(!board||!game)return;
 board.replaceChildren();
 // White always moves first; rank 1 stays at the bottom.
 const ranks=[8,7,6,5,4,3,2,1],files=[...FILES];
 const legal=selected?game.moves({square:selected,verbose:true}).map(m=>m.to):[];
 for(let ri=0;ri<8;ri++)for(let fi=0;fi<8;fi++){
  const sq=files[fi]+ranks[ri],p=game.get(sq),button=document.createElement('button');
  button.type='button';button.dataset.square=sq;button.className='vqc-mateone-cell '+((ri+fi)%2?'dark':'light');
  if(selected===sq)button.classList.add('selected');if(legal.includes(sq))button.classList.add('legal');
  if(hint&&puzzle().from===sq)button.classList.add('hint-from');if(hint&&puzzle().to===sq)button.classList.add('hint-to');
  button.setAttribute('aria-label','Ô '+sq+(p?' '+(p.color==='w'?'trắng ':'đen ')+p.type:''));
  if(p){const piece=document.createElement('span');piece.className='vqc-mateone-piece';if(typeof pieceSvgMarkup==='function')piece.innerHTML=pieceSvgMarkup(p.color==='w'?p.type.toUpperCase():p.type);else piece.textContent=({w:{k:'♔',q:'♕',r:'♖',b:'♗',n:'♘',p:'♙'},b:{k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'}}[p.color]||{})[p.type]||'';button.append(piece);}
  if(fi===0){let x=document.createElement('span');x.className='vqc-mateone-rank';x.textContent=sq[1];button.append(x);}
  if(ri===7){let x=document.createElement('span');x.className='vqc-mateone-file';x.textContent=sq[0];button.append(x);}
  button.addEventListener('click',()=>click(sq));board.append(button);
 }
 window.vqcLastMove?.mark('vqcMateOneBasicBoard',lastMove?.from||null,lastMove?.to||null);
}
function render(){
 if(!game||!$('vqcMateOneBasicBoard'))return;
 const count=catalog().length,task=puzzle();
 $('vqcMateOneBasicTitle').textContent='♛ Chiếu hết trong 1 nước (Cơ bản) — Bài '+(idx+1)+'/'+count;
 $('vqcMateOneBasicSubtitle').textContent=task.label+' · '+(task.color==='w'?'Trắng':'Đen')+' đi trước';
 $('vqcMateOneBasicProgress').textContent='Đã hoàn thành '+done.size+'/'+count+' bài';
 $('vqcMateOneBasicFeedback').textContent=feedback;
 $('vqcMateOneBasicFeedback').className='vqc-mateone-feedback'+(solved?' success':failed?' error':'');
 $('vqcMateOneBasicNext').textContent=solved?'Tiếp tục →':'Bài sau →';
 $('vqcMateOneBasicPrev').disabled=student();
 $('vqcMateOneBasicNext').disabled=student();
 $('vqcMateOneBasicJump').disabled=student();
 $('vqcMateOneBasicJump').max=String(count);
 $('vqcMateOneBasicJump').value=String(idx+1);
 paint();
}
function click(sq){
 if(!isOpen||!game||solved||failed)return;
 const p=game.get(sq),turn=game.turn();
 if(p&&p.color===turn){selected=selected===sq?null:sq;hint=false;render();return;}
 if(!selected)return;
 const choices=game.moves({square:selected,verbose:true}).filter(m=>m.to===sq);
 if(!choices.length){selected=null;message('Ô này không phải nước đi hợp lệ. Hãy chọn lại.');return;}
 const move=choices.find(m=>m.promotion==='q')||choices[0];
 const outcome=game.move({from:move.from,to:move.to,promotion:move.promotion||'q'});
 if(!outcome){selected=null;message('Nước đi không đúng luật.');return;}
 lastMove={from:outcome.from,to:outcome.to};selected=null;hint=false;
 if(game.in_checkmate()){
  solved=true;done.add(idx);persist();
  feedback='🏆 Chính xác! '+outcome.san+' — Vua đã bị chiếu hết. Nhấn “Tiếp tục” để sang bài tiếp theo!';
 }else{
  failed=true;
  feedback=game.in_stalemate()?'Chưa đúng: thế cờ này hòa Pat, không phải chiếu hết. Nhấn “Thử lại”.':'Chưa đúng! Đối phương vẫn còn cách chống đỡ. Nhấn “Thử lại” để tìm nước chiếu hết.';
 }
 render();publish();
}
function publish(){
 if(!isOpen||!roomOn()||typeof vqcExerciseWrite!=='function'||(typeof vqcNavApplying!=='undefined'&&vqcNavApplying)||(typeof vqcApplyingExercise!=='undefined'&&vqcApplyingExercise))return;
 vqcExerciseWrite('mateOneBasicExercise',{index:idx,fen:game.fen(),solved,failed,hint,lastMove,done:[...done],feedback,nonce:Date.now()+'-'+Math.random().toString(36).slice(2,8)});
}
function open(i=0,remote=false){
 try{catalog();}catch(e){if(typeof vqcNotify==='function')vqcNotify('Chưa thể mở bài chiếu hết: '+e.message,'warning');else alert(e.message);return;}
 if(!remote&&student()){if(typeof vqcNotify==='function')vqcNotify('Giáo viên chọn bài; em có thể trực tiếp giải bài đang mở.','warning');return;}
 restoreProgress();const n=Number(i);idx=Number.isInteger(n)?Math.max(0,Math.min(catalog().length-1,n)):0;
 if(typeof vqcCloseOtherViews==='function')vqcCloseOtherViews('mate1basic');
 const el=$('vqcMateOneBasicOverlay');if(el.parentElement!==document.body)document.body.append(el);
 el.classList.add('open');isOpen=true;newPosition();render();
 if(!remote){if(typeof vqcBroadcastView==='function')vqcBroadcastView('mate1basic',idx);publish();}
}
function close(){
 if(student()){if(typeof vqcNotify==='function')vqcNotify('Giáo viên điều khiển việc đóng bài học trong lớp.','warning');return;}
 isOpen=false;selected=null;$('vqcMateOneBasicOverlay').classList.remove('open');
 if(roomOn()&&typeof vqcBroadcastView==='function')vqcBroadcastView('board');
}
function reset(){if(!isOpen)return;newPosition();render();publish();}
function next(dir){if(student()){if(typeof vqcNotify==='function')vqcNotify('Giáo viên điều khiển chuyển bài trong lớp.','warning');return;}open((idx+dir+catalog().length)%catalog().length);}
function jump(){if(student())return;open(Math.max(0,Math.min(catalog().length-1,Number($('vqcMateOneBasicJump').value)-1)));}
function showHint(){if(!isOpen||solved||failed)return;hint=true;feedback='💡 Gợi ý: chú ý quân được đánh dấu và ô cần đi tới.';render();publish();}
function receive(data){
 if(!data||!isOpen||!game||!Number.isInteger(data.index)||data.index!==idx||typeof data.fen!=='string'||data.fen.length>140||!Array.isArray(data.done)||data.done.length>TOTAL)return;
 const key=JSON.stringify(data);if(key===receivedKey)return;receivedKey=key;
 // Validate that the received board equals the initial board or one legal move from it.
 const replay=new Chess(puzzle().fen);
 let accepted=data.fen===puzzle().fen,actualMove=null;
 if(!accepted){for(const m of replay.moves({verbose:true})){
  const v=new Chess(puzzle().fen),made=v.move({from:m.from,to:m.to,promotion:m.promotion||'q'});
  if(made&&v.fen()===data.fen){accepted=true;actualMove=made;break;}
 }}
 if(!accepted)return;
 if(typeof vqcApplyingExercise!=='undefined')vqcApplyingExercise=true;
 try{
  game=new Chess(data.fen);selected=null;hint=!!data.hint;solved=!!data.solved&&game.in_checkmate();
  failed=!!data.failed&&!solved&&data.fen!==puzzle().fen;
  lastMove=actualMove?{from:actualMove.from,to:actualMove.to}:null;
  feedback=String(data.feedback||'').slice(0,350);
  for(const n of data.done)if(Number.isInteger(n)&&n>=0&&n<catalog().length)done.add(n);
  if(solved)done.add(idx);persist();render();
 }finally{if(typeof vqcApplyingExercise!=='undefined')vqcApplyingExercise=false;}
}
function init(){
 $('vqcMateOneBasicPrev')?.addEventListener('click',()=>next(-1));
 $('vqcMateOneBasicNext')?.addEventListener('click',()=>next(1));
 $('vqcMateOneBasicReset')?.addEventListener('click',reset);
 $('vqcMateOneBasicHint')?.addEventListener('click',showHint);
 $('vqcMateOneBasicGo')?.addEventListener('click',jump);
 $('vqcMateOneBasicJump')?.addEventListener('keydown',e=>{if(e.key==='Enter')jump();});
 $('vqcMateOneBasicClose')?.addEventListener('click',close);
 $('vqcMateOneBasicOverlay')?.addEventListener('click',e=>{if(e.target===$('vqcMateOneBasicOverlay'))close();});
}
window.vqcMateOneBasicOpen=open;
window.vqcMateOneBasicReceive=receive;
window.vqcMateOneBasicClose=close;
window.vqcMateOneBasicCatalogCount=()=>catalog().length;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
