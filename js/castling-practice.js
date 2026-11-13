/* Thực hành Nhập thành — 9 bài nhiều nước Trắng; quân Đen giữ nguyên trong bài. */
(function(){
 'use strict';
 const TASKS=[{"id":1,"title":"Nhập thành gần","side":"short","fen":"rnbqkbnr/pppppppp/8/8/2B5/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1","goal":"Di chuyển Vua Trắng từ e1 đến g1 để nhập thành gần.","solution":[["e1","g1"]]},{"id":2,"title":"Nhập thành xa","side":"long","fen":"rnbqkbnr/pppppppp/8/8/8/2N5/PBPPQPPP/R3KBNR w KQkq - 0 1","goal":"Cánh Hậu đã được dọn. Hãy đưa Vua đi hai ô sang trái để nhập thành xa.","solution":[["e1","c1"]]},{"id":3,"title":"Di chuyển quân Mã đang chắn","side":"short","fen":"rnbqkbnr/pppppppp/8/8/2B5/8/PPPPPPPP/RNBQK1NR w KQkq - 0 1","goal":"Quân Mã g1 đang chắn lối nhập thành gần. Hãy di chuyển Mã ra khỏi g1, sau đó nhập thành.","solution":[["g1","f3"],["e1","g1"]]},{"id":4,"title":"Dọn đường nhập thành gần","side":"short","fen":"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1","goal":"Tượng f1 và Mã g1 đang chắn đường. Hãy di chuyển các quân Trắng cần thiết qua nhiều nước, rồi nhập thành gần.","solution":[["f2","f4"],["g2","g3"],["f1","g2"],["g1","f3"],["e1","g1"]]},{"id":5,"title":"Dọn đường nhập thành xa","side":"long","fen":"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1","goal":"Mã b1, Tượng c1 và Hậu d1 đang chắn cánh Hậu. Hãy lần lượt di chuyển các quân để mở b1, c1, d1 rồi nhập thành xa.","solution":[["b1","c3"],["d2","d3"],["c1","f4"],["d1","d2"],["e1","c1"]]},{"id":6,"title":"Quyền nhập thành của Xe","side":"long","fen":"rnbqkbnr/pppppppp/8/8/2B5/5N2/PPPPPPPP/R3K2R w KQkq - 0 1","goal":"Đi Tốt h2 lên h3, đưa Xe h1 sang h2 rồi trở về h1. Quyền nhập thành gần sẽ mất, nhưng nhập thành xa vẫn còn. Cuối cùng hãy nhập thành xa.","solution":[["h2","h3"],["h1","h2"],["h2","h1"],["e1","c1"]]},{"id":7,"title":"Chặn đường tấn công","side":"short","fen":"k7/8/8/1b6/8/8/8/4K1NR w K - 0 1","goal":"Tượng Đen b5 đang khống chế ô f1 trên đường nhập thành gần. Hãy đưa Mã g1 đến e2 để chặn đường tấn công, sau đó nhập thành gần.","solution":[["g1","e2"],["e1","g1"]]},{"id":8,"title":"Thử thách nhập thành gần","side":"short","fen":"7k/8/8/8/8/5b1n/PPPPPPPP/R3KBNR w K - 0 1","goal":"Mã Đen h3 khống chế g1 và Tượng Đen f3 cản trở. Hãy mở đường cho Tượng f1 bắt Mã h3, dùng Mã g1 bắt Tượng f3, rồi nhập thành gần.","solution":[["g2","g3"],["f1","h3"],["g1","f3"],["e1","g1"]]},{"id":9,"title":"Thử thách nhập thành xa","side":"long","fen":"7k/8/8/7b/8/8/PPPPPPPP/RNBQKBNR w Q - 0 1","goal":"Tượng Đen h5 đang khống chế ô d1. Hãy dọn cánh Hậu, đưa Mã g1 đến e2 để chặn đường chéo của Tượng, rồi nhập thành xa.","solution":[["b1","c3"],["d2","d3"],["c1","g5"],["d1","d2"],["e2","e3"],["g1","e2"],["e1","c1"]]}];
 const FILES='abcdefgh', $=id=>document.getElementById(id), overlay=()=>$('castlingPracticeOverlay');
 let index=0,game=null,moves=[],selected=null,hintMove=null,lastMove=null,feedback='',solved=false,isOpen=false,receivedKey='';
 const done=new Set();
 const task=()=>TASKS[index],goalSan=()=>task().side==='short'?'O-O':'O-O-O';
 const inRoom=()=>typeof roomRef!=='undefined'&&!!roomRef;
 const student=()=>inRoom()&&(typeof role!=='undefined'?role:window.accountProfile?.role)==='student';
 function pieceName(p){const n={p:'Tốt',n:'Mã',b:'Tượng',r:'Xe',q:'Hậu',k:'Vua'};return (p.color==='w'?'Trắng ':'Đen ')+(n[p.type]||'quân');}
 function forceWhiteTurn(g){
  const p=g.fen().split(' ');
  if(p[1]==='b'){
   p[1]='w';
   /* Trắng đi liên tiếp, nên bỏ quyền bắt tốt qua đường của lượt Đen chưa diễn ra. */
   p[3]='-';
   if(!g.load(p.join(' ')))throw Error('Không thể chuyển lượt về Trắng.');
  }
 }
 function rebuild(log){
  const g=new Chess(task().fen),clean=[];let complete=false;
  for(const item of log){
   if(!item||!/^[a-h][1-8]$/.test(item.from)||!/^[a-h][1-8]$/.test(item.to))break;
   const legal=g.moves({verbose:true}).find(m=>m.from===item.from&&m.to===item.to&&(!item.promotion||m.promotion===item.promotion));
   if(!legal||((legal.san==='O-O'||legal.san==='O-O-O')&&legal.san!==goalSan()))break;
   const made=g.move({from:legal.from,to:legal.to,promotion:item.promotion||'q'});if(!made)break;
   clean.push({from:made.from,to:made.to,promotion:made.promotion||null,san:made.san});
   if(made.san==='O-O'||made.san==='O-O-O'){complete=true;break;}forceWhiteTurn(g);
  }
  return {game:g,moves:clean,solved:complete};
 }
 function resetPosition(){game=new Chess(task().fen);moves=[];selected=null;hintMove=null;lastMove=null;solved=false;feedback=task().goal;}
 function progressKey(){return 'vqc-castling-practice-'+(window.accountProfile?.uid||window.accountProfile?.id||'guest');}
 function restoreProgress(){try{const a=JSON.parse(localStorage.getItem(progressKey())||'[]');if(Array.isArray(a))a.forEach(n=>{if(Number.isInteger(n)&&n>=0&&n<9)done.add(n);});}catch(e){}}
 function saveProgress(){try{localStorage.setItem(progressKey(),JSON.stringify([...done]));}catch(e){}}
 function clearRay(from,to){
  const fx=FILES.indexOf(from[0]),fy=+from[1]-1,tx=FILES.indexOf(to[0]),ty=+to[1]-1,sx=Math.sign(tx-fx),sy=Math.sign(ty-fy);
  let x=fx+sx,y=fy+sy;while(x!==tx||y!==ty){if(game.get(FILES[x]+(y+1)))return false;x+=sx;y+=sy;}return true;
 }
 function attacked(target,color){
  const tx=FILES.indexOf(target[0]),ty=+target[1]-1;
  for(let r=1;r<=8;r++)for(let f=0;f<8;f++){
   const p=game.get(FILES[f]+r);if(!p||p.color!==color)continue;
   const dx=tx-f,dy=ty-(r-1),ax=Math.abs(dx),ay=Math.abs(dy),from=FILES[f]+r;
   if(p.type==='p'&&ax===1&&dy===(color==='w'?1:-1))return true;
   if(p.type==='n'&&((ax===1&&ay===2)||(ax===2&&ay===1)))return true;
   if(p.type==='k'&&Math.max(ax,ay)===1)return true;
   if(p.type==='r'&&(dx===0||dy===0)&&clearRay(from,target))return true;
   if(p.type==='b'&&ax===ay&&clearRay(from,target))return true;
   if(p.type==='q'&&(dx===0||dy===0||ax===ay)&&clearRay(from,target))return true;
  }return false;
 }
 function explainBlocked(side){
  const rights=game.fen().split(' ')[2]||'-',right=side==='short'?'K':'Q',rook=side==='short'?'h1':'a1';
  if(!rights.includes(right)){
   if(!rights.includes('K')&&!rights.includes('Q'))return 'Quyền nhập thành đã mất vì Vua từng di chuyển. Đưa Vua về e1 cũng không khôi phục quyền này.';
   return 'Quyền nhập thành '+(side==='short'?'gần':'xa')+' đã mất vì Xe '+rook+' từng di chuyển. Đưa Xe về ô cũ cũng không khôi phục quyền này.';
  }
  if(game.get('e1')?.type!=='k'||game.get('e1')?.color!=='w'||game.get(rook)?.type!=='r'||game.get(rook)?.color!=='w')return 'Vua và Xe cần ở đúng ô ban đầu để nhập thành.';
  const clear=side==='short'?['f1','g1']:['b1','c1','d1'],blocked=clear.find(s=>game.get(s));
  if(blocked)return 'Ô '+blocked+' còn quân chắn. Hãy di chuyển quân đó ra khỏi đường nhập thành.';
  if(typeof game.in_check==='function'&&game.in_check())return 'Vua đang bị chiếu. Hãy hóa giải nước chiếu trước khi nhập thành.';
  const path=side==='short'?['f1','g1']:['d1','c1'],hit=path.find(s=>attacked(s,'b'));
  if(hit)return 'Ô '+hit+' đang bị quân Đen khống chế. Vua không được đi qua hoặc dừng ở ô đang bị tấn công.';
  return 'Nước nhập thành chưa hợp lệ. Hãy kiểm tra đường đi và quyền nhập thành.';
 }
 function renderBoard(){
  const board=$('castlingPracticeBoard');if(!board||!game)return;
  const layer=board.querySelector(':scope > .vqc-annotation-overlay');
  board.querySelectorAll(':scope > .castling-practice-square').forEach(x=>x.remove());
  const legal=selected?game.moves({square:selected,verbose:true}).map(m=>m.to):[];
  for(let rank=8;rank>=1;rank--)for(let f=0;f<8;f++){
   const sq=FILES[f]+rank,p=game.get(sq),code=p?(p.color==='w'?p.type.toUpperCase():p.type):'';
   const cell=document.createElement('button');cell.type='button';cell.className='castling-practice-square '+(((8-rank+f)%2===0)?'light':'dark');
   cell.dataset.square=sq;cell.dataset.piece=code;cell.setAttribute('aria-label','Ô '+sq+(p?' · '+pieceName(p):''));
   if(sq===selected)cell.classList.add('selected');
   if(legal.includes(sq)){cell.classList.add('legal');if(p)cell.classList.add('has-piece');}
   if(hintMove?.from===sq)cell.classList.add('hint-from');
   if(hintMove?.to===sq)cell.classList.add('hint-to');
   if(lastMove&&(lastMove.from===sq||lastMove.to===sq))cell.classList.add('last-move');
   if(p){const holder=document.createElement('span');holder.className='castling-practice-piece';holder.innerHTML=typeof window.pieceSvgMarkup==='function'?window.pieceSvgMarkup(code):'';if(!holder.innerHTML)holder.textContent=code;cell.appendChild(holder);}
   if(f===0){const q=document.createElement('span');q.className='castling-practice-coordinate rank';q.textContent=String(rank);cell.appendChild(q);}
   if(rank===1){const q=document.createElement('span');q.className='castling-practice-coordinate file';q.textContent=FILES[f];cell.appendChild(q);}
   cell.addEventListener('click',()=>clickSquare(sq));board.appendChild(cell);
  }
  if(layer&&layer.parentElement!==board)board.appendChild(layer);
 }
 function renderProgress(){
  const host=$('castlingPracticeSteps');host.replaceChildren();
  TASKS.forEach((t,i)=>{const step=document.createElement('span');step.className='castling-practice-step'+(done.has(i)?' complete':'')+(i===index?' active':'');step.textContent=done.has(i)?'★':String(i+1);step.setAttribute('aria-label','Bài '+(i+1)+(done.has(i)?' đã hoàn thành':''));host.appendChild(step);});
  $('castlingPracticeDone').textContent='Đã hoàn thành '+done.size+'/9 bài';
  $('castlingPracticeProgressFill').style.width=(done.size/9*100)+'%';
 }
 function render(){
  if(!game)return;const t=task();
  $('castlingPracticeTitle').textContent='♔ Thực hành Nhập thành — Bài '+(index+1)+'/9';
  $('castlingPracticeSubtitle').textContent=(t.side==='short'?'Nhập thành gần (O-O)':'Nhập thành xa (O-O-O)')+' · Trắng đi liên tiếp';
  $('castlingPracticeNumber').textContent='Bài '+(index+1)+'/9 · '+t.title;
  $('castlingPracticeGoal').textContent=t.goal;$('castlingPracticeFeedback').textContent=feedback;
  $('castlingPracticeFeedback').className='castling-practice-feedback'+(solved?' success':'');
  $('castlingPracticeMoveCount').textContent='Số nước Trắng đã đi: '+moves.length;
  $('castlingPracticePrev').disabled=index===0||student();
  $('castlingPracticeNext').disabled=index===8||student()||!solved;
  $('castlingPracticeUndo').disabled=!moves.length;$('castlingPracticeReset').disabled=!moves.length;
  $('castlingPracticeHint').disabled=solved;
  $('castlingPracticeNotation').textContent=moves.length?'Các nước Trắng: '+moves.map((m,i)=>(i+1)+'. '+m.san).join(' · '):'Chọn một quân Trắng để xem các nước đi hợp lệ.';
  renderProgress();renderBoard();
 }
 function publish(){
  if(!isOpen||!inRoom()||typeof vqcExerciseWrite!=='function'||(typeof vqcApplyingExercise!=='undefined'&&vqcApplyingExercise)||(typeof vqcNavApplying!=='undefined'&&vqcNavApplying))return;
  vqcExerciseWrite('castlingPracticeExercise',{index,moves:moves.map(m=>({from:m.from,to:m.to,promotion:m.promotion||null})),solved,done:[...done],feedback,nonce:Date.now()+'-'+Math.random().toString(36).slice(2,7)});
 }
 function finish(){solved=true;done.add(index);saveProgress();feedback='✅ Nhập thành thành công! '+(task().side==='short'?'Vua đi từ e1 đến g1, Xe h1 chuyển sang f1.':'Vua đi từ e1 đến c1, Xe a1 chuyển sang d1.');}
 function clickSquare(sq){
  if(!isOpen||!game||solved)return;
  const p=game.get(sq);
  if(p&&p.color==='b'){selected=null;feedback='Trong bài này em thao tác các quân Trắng; quân Đen giữ nguyên vị trí.';render();return;}
  if(p&&p.color==='w'){selected=selected===sq?null:sq;hintMove=null;render();return;}
  if(!selected)return;
  const possible=game.moves({square:selected,verbose:true}).find(m=>m.to===sq);
  if(!possible){
   if(selected==='e1'&&(sq==='g1'||sq==='c1'))feedback=explainBlocked(sq==='g1'?'short':'long');
   else feedback='Nước đi này chưa hợp lệ. Hãy chọn ô có dấu chấm hoặc chọn quân khác.';
   selected=null;render();return;
  }
  if((possible.san==='O-O'||possible.san==='O-O-O')&&possible.san!==goalSan()){
   feedback='Nước nhập thành này hợp lệ, nhưng bài yêu cầu '+(task().side==='short'?'nhập thành gần (O-O).':'nhập thành xa (O-O-O).');selected=null;render();return;
  }
  const made=game.move({from:possible.from,to:possible.to,promotion:possible.promotion||'q'});if(!made)return;
  moves.push({from:made.from,to:made.to,promotion:made.promotion||null,san:made.san});
  selected=null;hintMove=null;lastMove={from:made.from,to:made.to};
  if(made.san==='O-O'||made.san==='O-O-O')finish();
  else{
   forceWhiteTurn(game);
   if(index===5&&moves.some(m=>m.from==='h1'&&m.to==='h2')&&moves.some(m=>m.from==='h2'&&m.to==='h1')&&!(game.fen().split(' ')[2]||'').includes('K'))
    feedback='Đúng rồi! Xe h1 đã đi rồi quay lại nên quyền nhập thành gần mất. Quyền nhập thành xa vẫn còn.';
   else feedback='Đã đi '+made.san+'. Tiếp tục dọn đường để nhập thành.';
  }
  render();publish();
 }
 function undo(){
  if(!moves.length)return;const r=rebuild(moves.slice(0,-1));
  game=r.game;moves=r.moves;solved=r.solved;selected=null;hintMove=null;
  lastMove=moves.length?{from:moves[moves.length-1].from,to:moves[moves.length-1].to}:null;
  feedback=solved?'Đã nhập thành.':moves.length?'Đã lùi lại một nước. Hãy tiếp tục.':task().goal;render();publish();
 }
 function reset(){if(!isOpen)return;resetPosition();render();publish();}
 function hint(){
  if(!isOpen||solved)return;const path=task().solution||[];let prefix=true;
  for(let i=0;i<Math.min(moves.length,path.length);i++)if(moves[i].from!==path[i][0]||moves[i].to!==path[i][1]){prefix=false;break;}
  const next=path[prefix?moves.length:0];
  if(!next){feedback='Hãy quan sát các ô còn bị chắn và kiểm tra quyền nhập thành.';hintMove=null;render();return;}
  hintMove={from:next[0],to:next[1]};feedback='💡 Gợi ý: di chuyển quân từ '+next[0]+' đến '+next[1]+'.';render();
 }
 function change(delta){if(student())return;const n=index+delta;if(n<0||n>=9)return;open(n,false);}
 function open(n=0,remote=false){
  if(typeof Chess!=='function'){if(typeof vqcNotify==='function')vqcNotify('Chưa tải được thư viện luật cờ vua. Hãy tải lại trang.','warning');return;}
  if(!remote&&student()){if(typeof vqcNotify==='function')vqcNotify('Giáo viên chuyển bài chung; em vẫn có thể thao tác quân Trắng.','warning');return;}
  index=Number.isInteger(Number(n))?Math.max(0,Math.min(8,Number(n))):0;
  if(typeof vqcCloseOtherViews==='function')vqcCloseOtherViews('castlingpractice');
  const el=overlay();if(!el)return;if(el.parentElement!==document.body)document.body.appendChild(el);
  isOpen=true;el.hidden=false;el.classList.add('open');restoreProgress();resetPosition();render();
  if(!remote){if(typeof vqcBroadcastView==='function')vqcBroadcastView('castlingpractice',index);publish();}
 }
 function close(){
  if(student()){if(typeof vqcNotify==='function')vqcNotify('Giáo viên điều khiển việc đóng bài chung.','warning');return;}
  isOpen=false;selected=null;if(overlay()){overlay().classList.remove('open');overlay().hidden=true;}
  if(inRoom()&&typeof vqcBroadcastView==='function')vqcBroadcastView('board');
 }
 function receive(data){
  if(!data||!isOpen||data.index!==index||!Array.isArray(data.moves)||data.moves.length>40)return;
  if(typeof vqcExerciseClientId!=='undefined'&&data.clientId===vqcExerciseClientId)return;
  const key=JSON.stringify(data);if(key===receivedKey)return;receivedKey=key;
  const r=rebuild(data.moves);if(r.moves.length!==data.moves.length)return;
  if(typeof vqcApplyingExercise!=='undefined')vqcApplyingExercise=true;
  try{
   game=r.game;moves=r.moves;solved=r.solved;selected=null;hintMove=null;
   lastMove=moves.length?{from:moves[moves.length-1].from,to:moves[moves.length-1].to}:null;
   done.clear();(data.done||[]).forEach(n=>{if(Number.isInteger(n)&&n>=0&&n<9)done.add(n);});
   if(solved)done.add(index);saveProgress();
   feedback=String(data.feedback||(solved?'✅ Nhập thành thành công.':'Trạng thái đang đồng bộ.')).slice(0,350);render();
  }finally{if(typeof vqcApplyingExercise!=='undefined')vqcApplyingExercise=false;}
 }
 window.castlingPracticeOpen=open;window.castlingPracticeClose=close;window.vqcCastlingPracticeReceive=receive;
 document.addEventListener('DOMContentLoaded',()=>{
  $('castlingPracticeClose')?.addEventListener('click',close);
  $('castlingPracticePrev')?.addEventListener('click',()=>change(-1));
  $('castlingPracticeNext')?.addEventListener('click',()=>change(1));
  $('castlingPracticeUndo')?.addEventListener('click',undo);
  $('castlingPracticeReset')?.addEventListener('click',reset);
  $('castlingPracticeHint')?.addEventListener('click',hint);
  overlay()?.addEventListener('click',e=>{if(e.target===overlay())close();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&overlay()?.classList.contains('open'))close();});
 });
})();