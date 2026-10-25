/* Dao Ky Thu — first 100 exact diagrams from the user's PDF.
   Preserves every piece in its original square and the order 1–100.
   The book's solution is checked with chess.js on startup. */
(function(){
'use strict';
const $=id=>document.getElementById(id),TOTAL=100,FILES='abcdefgh';
let puzzles=null,idx=0,game=null,selected=null,hint=false,feedback='',solved=false,failed=false,lastMove=null,isOpen=false;
const done=new Set();
let receivedKey='',savedFor='';
function roomOn(){return typeof roomRef!=='undefined'&&!!roomRef;}
function student(){return roomOn()&&(typeof role!=='undefined'?role:window.accountProfile?.role)==='student';}
function catalog(){
 if(puzzles)return puzzles;
 if(typeof Chess!=='function')throw Error('Thư viện luật cờ vua chưa được tải.');
 const source=window.VQC_PDF_MATE100;
 if(!Array.isArray(source)||source.length!==TOTAL)throw Error('Chưa tải đủ 100 thế cờ gốc từ PDF.');
 const validated=source.map((p,i)=>{
  if(!p||p.num!==i+1||typeof p.fen!=='string'||typeof p.answer!=='string')throw Error('Thiếu dữ liệu bài '+(i+1));
  if(p.pdfPage!==5+Math.floor(i/6))throw Error('Sai trang gốc của bài '+(i+1));
  const chess=new Chess(p.fen);
  if(chess.fen().split(' ')[0]!==p.fen.split(' ')[0])throw Error('Sơ đồ FEN không hợp lệ, bài '+(i+1));
  const solution=chess.moves({verbose:true}).find(move=>move.san===p.answer);
  if(!solution)throw Error('Đáp án trong PDF không khớp bài '+(i+1)+': '+p.answer);
  chess.move(solution);
  if(!chess.in_checkmate())throw Error('Đáp án chưa chiếu hết, bài '+(i+1));
  return {...p,label:'Hình '+p.num+' · Trang '+p.pdfPage+' (PDF)',color:p.fen.split(' ')[1],
   from:solution.from,to:solution.to,promotion:solution.promotion||null};
 });
 puzzles=validated;
 return puzzles;
}
function cacheKey(){return 'vqc-pdf-mate100-done-'+(window.accountProfile?.uid||window.accountProfile?.id||'guest');}
function restoreProgress(){
 const key=cacheKey();if(savedFor===key)return;savedFor=key;done.clear();
 try{const values=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(values))values.filter(n=>Number.isInteger(n)&&n>=0&&n<TOTAL).forEach(n=>done.add(n));}catch(e){}
}
function persist(){try{localStorage.setItem(cacheKey(),JSON.stringify([...done]));}catch(e){}}
function puzzle(){return catalog()[idx];}
function newPosition(){game=new Chess(puzzle().fen);selected=null;hint=false;feedback=(puzzle().color==='w'?'Trắng':'Đen')+' đi trước. Hãy tìm một nước đi để chiếu hết Vua đối phương.';solved=false;failed=false;lastMove=null;}
function message(s){feedback=s;render();}
function paint(){
 const board=$('vqcMateOneBoard');if(!board||!game)return;
 board.replaceChildren();
 // The PDF always shows White's first rank at the bottom, even when Black moves first.
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
 window.vqcLastMove?.mark('vqcMateOneBoard',lastMove?.from||null,lastMove?.to||null);
}
function render(){
 if(!game||!$('vqcMateOneBoard'))return;
 const count=catalog().length,task=puzzle();
 $('vqcMateOneTitle').textContent='♛ Chiếu hết trong 1 nước — Bài '+(idx+1)+'/'+count;
 $('vqcMateOneSubtitle').textContent=task.label+' · '+(task.color==='w'?'Trắng':'Đen')+' đi trước';
 $('vqcMateOneProgress').textContent='Đã hoàn thành '+done.size+'/'+count+' bài';
 $('vqcMateOneFeedback').textContent=feedback;
 $('vqcMateOneFeedback').className='vqc-mateone-feedback'+(solved?' success':failed?' error':'');
 $('vqcMateOneNext').textContent=solved?'Tiếp tục →':'Bài sau →';
 $('vqcMateOnePrev').disabled=student();
 $('vqcMateOneNext').disabled=student();
 $('vqcMateOneJump').disabled=student();
 $('vqcMateOneJump').max=String(count);
 $('vqcMateOneJump').value=String(idx+1);
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
 vqcExerciseWrite('mateOneExercise',{index:idx,fen:game.fen(),solved,failed,hint,lastMove,done:[...done],feedback,nonce:Date.now()+'-'+Math.random().toString(36).slice(2,8)});
}
function open(i=0,remote=false){
 try{catalog();}catch(e){if(typeof vqcNotify==='function')vqcNotify('Chưa thể mở bài chiếu hết: '+e.message,'warning');else alert(e.message);return;}
 if(!remote&&student()){if(typeof vqcNotify==='function')vqcNotify('Giáo viên chọn bài; em có thể trực tiếp giải bài đang mở.','warning');return;}
 restoreProgress();const n=Number(i);idx=Number.isInteger(n)?Math.max(0,Math.min(catalog().length-1,n)):0;
 if(typeof vqcCloseOtherViews==='function')vqcCloseOtherViews('mate1');
 const el=$('vqcMateOneOverlay');if(el.parentElement!==document.body)document.body.append(el);
 el.classList.add('open');isOpen=true;newPosition();render();
 if(!remote){if(typeof vqcBroadcastView==='function')vqcBroadcastView('mate1',idx);publish();}
}
function close(){
 if(student()){if(typeof vqcNotify==='function')vqcNotify('Giáo viên điều khiển việc đóng bài học trong lớp.','warning');return;}
 isOpen=false;selected=null;$('vqcMateOneOverlay').classList.remove('open');
 if(roomOn()&&typeof vqcBroadcastView==='function')vqcBroadcastView('board');
}
function reset(){if(!isOpen)return;newPosition();render();publish();}
function next(dir){if(student()){if(typeof vqcNotify==='function')vqcNotify('Giáo viên điều khiển chuyển bài trong lớp.','warning');return;}open((idx+dir+catalog().length)%catalog().length);}
function jump(){if(student())return;open(Math.max(0,Math.min(catalog().length-1,Number($('vqcMateOneJump').value)-1)));}
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
 $('vqcMateOnePrev')?.addEventListener('click',()=>next(-1));
 $('vqcMateOneNext')?.addEventListener('click',()=>next(1));
 $('vqcMateOneReset')?.addEventListener('click',reset);
 $('vqcMateOneHint')?.addEventListener('click',showHint);
 $('vqcMateOneGo')?.addEventListener('click',jump);
 $('vqcMateOneJump')?.addEventListener('keydown',e=>{if(e.key==='Enter')jump();});
 $('vqcMateOneClose')?.addEventListener('click',close);
 $('vqcMateOneOverlay')?.addEventListener('click',e=>{if(e.target===$('vqcMateOneOverlay'))close();});
}
window.vqcMateOneOpen=open;
window.vqcMateOneReceive=receive;
window.vqcMateOneClose=close;
window.vqcMateOneCatalogCount=()=>catalog().length;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
