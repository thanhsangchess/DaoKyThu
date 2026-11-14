(function(){
'use strict';
const TASKS=[{"id":1,"title":"Tấn công đôi (Fork)","side":"b","fen":"r2q1r2/ppp2pbk/4b1pp/4p3/1B2P3/3P4/PPP3BP/R1Q1R1K1 b - - 0 1","answer":"d8d4","goal":{"kind":"capture","square":"b4","piece":"b","color":"w"},"notation":"Qd4+","prompt":"Trắng vừa đưa Tượng đến b4. Đen đi và tận dụng sai lầm này bằng cách nào?","hint":"Tìm nước Hậu vừa chiếu Vua Trắng vừa tấn công quân Tượng ở b4.","explanation":"1...Qd4+ tạo đòn tấn công đôi: Hậu chiếu Vua Trắng ở g1, đồng thời tấn công Tượng b4. Trắng phải đưa Vua ra khỏi thế chiếu; sau đó Đen có thể ăn Tượng b4."},{"id":2,"title":"Đòn xiên (Skewer)","side":"w","fen":"r3k3/1p3p2/2p1qP1Q/p7/3p4/P2P1B2/1PP2KPP/8 w - - 0 1","answer":"h6h8","goal":{"kind":"capture","square":"a8","piece":"r","color":"b"},"notation":"Qh8+","prompt":"Trắng đi. Hãy tìm nước buộc Vua Đen phải di chuyển, sau đó để lộ Xe a8.","hint":"Quan sát đường ngang thứ 8: Vua Đen và Xe a8 nằm trên cùng một hàng.","explanation":"1.Qh8+ là đòn xiên. Nước chiếu buộc Vua Đen phải rời vị trí; sau đó Trắng có thể bắt Xe ở a8."},{"id":3,"title":"Ghim tuyệt đối (Absolute pin)","side":"b","fen":"3rr1k1/1pq2pp1/pbp1b2p/8/1PP5/5NQP/4BPP1/R4RK1 b - - 0 1","answer":"c7g3","goal":{"kind":"capture","square":"g3","piece":"q","color":"w"},"notation":"Qxg3","prompt":"Đen đi. Hãy tận dụng quân Tốt f2 đang bị ghim để thắng Hậu Trắng.","hint":"Quan sát đường chéo của Tượng b6: quân Tốt f2 không thể tự do rời vị trí vì đang chắn đường tới Vua.","explanation":"1...Qxg3! thắng Hậu Trắng. Tốt f2 bị ghim tuyệt đối bởi Tượng Đen b6 trên đường chéo hướng tới Vua Trắng g1."},{"id":4,"title":"Loại bỏ quân phòng thủ (Remove the defender)","side":"b","fen":"r1bq1rk1/pp3ppp/5b2/3Q4/8/2N1P3/PP3PPP/R3K1NR b - - 0 1","answer":"f6c3","goal":{"kind":"capture","square":"c3","piece":"n","color":"w"},"notation":"Bxc3+","prompt":"Đen đi. Mã c3 đang bảo vệ Hậu Trắng. Hãy tìm cách loại bỏ quân phòng thủ đó.","hint":"Tìm đường chéo của Tượng f6 hướng tới Mã c3.","explanation":"1...Bxc3+ loại bỏ Mã c3 – quân đang bảo vệ Hậu Trắng. Sau khi Vua Trắng tránh chiếu, Đen có thể ăn Hậu bằng ...Qxd5."},{"id":5,"title":"Tấn công khám phá (Discovered attack)","side":"b","fen":"4r1k1/1pr2pp1/p3b2p/2p5/7P/4QNq1/PPP3P1/1K3R1R b - - 0 1","answer":"e6a2","goal":{"kind":"capture","square":"e3","piece":"q","color":"w"},"notation":"Bxa2+","prompt":"Đen đi. Hãy tìm nước tạo ra đòn tấn công khám phá lên Hậu Trắng.","hint":"Quan sát đường chéo từ Tượng e6 tới a2 và đường tấn công đang bị cản.","explanation":"1...Bxa2+ tạo đòn tấn công khám phá nhằm vào Hậu Trắng. Trắng phải đưa Vua ra khỏi thế chiếu; sau đó Đen có thể chơi ...Rxe3."},{"id":6,"title":"Loại bỏ quân phòng thủ (Remove the defender)","side":"w","fen":"1r4k1/3q1p1p/3p2p1/1p1Nb3/8/2P5/1P2QPPP/4R1K1 w - - 0 1","answer":"e2e5","goal":{"kind":"capture","square":"e5","piece":"b","color":"b"},"notation":"Qxe5","prompt":"Trắng đi. Tìm nước loại bỏ Tượng Đen đang bảo vệ ô f6.","hint":"Tượng e5 là quân đang bảo vệ ô f6. Hãy tìm cách bắt Tượng đó.","explanation":"1.Qxe5! loại bỏ Tượng đang bảo vệ ô f6. Sau khi Tượng bị bắt, Trắng đe dọa Nf6+, tạo đòn tấn công đôi vào Vua và Hậu Đen; Trắng thắng Tượng."},{"id":7,"title":"Tấn công đôi (Fork)","side":"w","fen":"2r3k1/1p1q1ppp/pn6/3p4/8/1P6/PBP2PPP/3QR1K1 w - - 0 1","answer":"d1d4","goal":{"kind":"first-move"},"notation":"Qd4","prompt":"Trắng đi. Hãy tìm nước Hậu tạo hai mối đe dọa cùng lúc.","hint":"Tìm một ô trung tâm để Hậu vừa nhắm đến g7, vừa tấn công quân ở b6.","explanation":"1.Qd4! tạo đòn tấn công đôi: Trắng đe dọa Qxg7# và đồng thời Qxb6."},{"id":8,"title":"Khai thác quân bị ghim (Exploiting a pin)","side":"w","fen":"2k5/5p2/p3pQ1p/1pP3p1/1P2pP2/P1r1P1P1/1Q3K1P/5R2 w - - 0 1","answer":"f1c1","goal":{"kind":"capture","square":"c3","piece":"r","color":"b"},"notation":"Rc1","prompt":"Trắng đi. Xe Đen c3 đang bị ghim vào Hậu f6. Hãy tận dụng tình huống này.","hint":"Đưa Xe Trắng tới c1 để gây sức ép lên Xe Đen c3.","explanation":"1.Rc1! đe dọa bắt Xe Đen c3 ở nước tiếp theo. Nếu Xe Đen di chuyển khỏi cột c, Trắng sẽ bắt Hậu f6."},{"id":9,"title":"Tấn công khám phá và đòn xiên","side":"w","fen":"2r3k1/p3rppp/1p2p3/2q5/8/2Q1P3/PP3PPP/2R1R1K1 w - - 0 1","answer":"c3d2","goal":{"kind":"capture","square":"c8","piece":"r","color":"b"},"notation":"Qd2","prompt":"Trắng đi. Hãy di chuyển Hậu để mở đường tấn công khám phá lên Hậu Đen.","hint":"Quan sát Xe Trắng c1 và Hậu Đen c5 cùng nằm trên cột c.","explanation":"1.Qd2! rời cột c để mở đường cho Xe Trắng tấn công Hậu Đen. Nếu Hậu Đen rời đi, Trắng có thể chơi Rxc8+."},{"id":10,"title":"Tấn công khám phá (Discovered attack)","side":"w","fen":"r4rk1/ppp2ppp/3b1n2/8/Q1B4q/2N5/PP3PPP/3R1RK1 w - - 0 1","answer":"c4f7","goal":{"kind":"capture","square":"h4","piece":"q","color":"b"},"notation":"Bxf7+","prompt":"Trắng đi. Đen đang đe dọa Qxh2#. Hãy tìm nước đảo ngược tình thế bằng đòn tấn công khám phá.","hint":"Tượng c4 có thể tạo nước chiếu ở f7 và đồng thời giải phóng đường ngang cho Hậu a4.","explanation":"1.Bxf7+! là đòn tấn công khám phá. Khi Tượng rời c4, Hậu Trắng a4 mở đường tới Hậu Đen h4; sau đó Trắng có thể chơi Qxh4 để bắt Hậu."}];
const FILES='abcdefgh',$=id=>document.getElementById(id),overlay=()=>$('beginnerPuzzleOverlay');
let index=0,game=null,selected=null,solved=false,answerShown=false,hintShown=false,attempts=0,feedback='',lastMove=null,isOpen=false,receivedKey='',thinking=false,started=false,goalSquare='',moveHistory=[],engineWorker=null,engineReady=false,engineInitPromise=null,engineReadyTimer=null,engineReadyReject=null,engineBestResolve=null,engineBestReject=null,engineBlobUrl='',engineFailed=false,puzzleSession=0;
const done=new Set(),task=()=>TASKS[index],inRoom=()=>typeof roomRef!=='undefined'&&!!roomRef;
const student=()=>inRoom()&&(typeof role!=='undefined'?role:window.accountProfile?.role)==='student';
const uci=m=>m.from+m.to+(m.promotion||''),parseUci=s=>({from:s.slice(0,2),to:s.slice(2,4),...(s.length>4?{promotion:s[4]}:{})});
function validateCatalog(){
 if(typeof Chess!=='function')throw Error('Thư viện luật cờ vua chưa tải.');
 if(TASKS.length!==10)throw Error('Danh mục chưa đủ 10 bài.');
 TASKS.forEach((t,i)=>{
  const g=new Chess(t.fen),k={w:0,b:0};
  if(t.id!==i+1||g.turn()!==t.side||!g.moves({verbose:true}).some(m=>uci(m)===t.answer))throw Error('Sơ đồ hoặc nước đáp án chưa hợp lệ ở Bài '+(i+1)+'.');
  for(let r=1;r<=8;r++)for(const f of FILES){const p=g.get(f+r);if(p?.type==='k')k[p.color]++;}
  if(k.w!==1||k.b!==1)throw Error('Sơ đồ Bài '+(i+1)+' thiếu hoặc thừa Vua.');
 });
}
function progressKey(){return 'vqc-beginner-puzzles-'+(window.accountProfile?.uid||window.accountProfile?.id||'guest');}
function restoreDone(){try{const a=JSON.parse(localStorage.getItem(progressKey())||'[]');if(Array.isArray(a))a.forEach(n=>{if(Number.isInteger(n)&&n>=0&&n<10)done.add(n);});}catch(e){}}
function saveDone(){try{localStorage.setItem(progressKey(),JSON.stringify([...done]));}catch(e){}}
function resetPosition(){stopEngineSearch();puzzleSession++;game=new Chess(task().fen);selected=null;solved=false;answerShown=false;hintShown=false;attempts=0;lastMove=null;thinking=false;started=false;goalSquare=task().goal?.square||'';moveHistory=[];engineFailed=false;feedback=task().prompt;}
function renderBoard(){
 const board=$('beginnerPuzzleBoard');if(!board||!game)return;
 const layer=board.querySelector(':scope > .vqc-annotation-overlay');
 board.querySelectorAll(':scope > .beginner-puzzle-cell').forEach(c=>c.remove());
 const legal=selected?game.moves({square:selected,verbose:true}).map(m=>m.to):[],answer=parseUci(task().answer);
 // Giữ góc nhìn cố định theo bên được giao giải bài; không đổi sau mỗi nước đi.
 const whiteAtBottom=task().side==='w';
 const ranks=whiteAtBottom?[8,7,6,5,4,3,2,1]:[1,2,3,4,5,6,7,8];
 const files=whiteAtBottom?FILES:[...FILES].reverse();
 for(let row=0;row<8;row++)for(let col=0;col<8;col++){
  const rank=ranks[row],file=files[col],f=FILES.indexOf(file);
  const square=file+rank,p=game.get(square),code=p?(p.color==='w'?p.type.toUpperCase():p.type):'';
  const cell=document.createElement('button');cell.type='button';cell.disabled=thinking||solved||answerShown||game.turn()!==task().side;cell.className='beginner-puzzle-cell '+(((8-rank+f)%2===0)?'light':'dark');
  cell.dataset.square=square;cell.dataset.piece=code;
  cell.setAttribute('aria-label','Ô '+square+(p?' · '+(p.color==='w'?'Trắng ':'Đen ')+({p:'Tốt',n:'Mã',b:'Tượng',r:'Xe',q:'Hậu',k:'Vua'}[p.type]):''));
  if(selected===square)cell.classList.add('selected');
  if(legal.includes(square)){cell.classList.add('legal');if(p)cell.classList.add('has-piece');}
  if(hintShown&&!solved&&!answerShown&&(square===answer.from||square===answer.to))cell.classList.add(square===answer.from?'hint-from':'hint-to');
  if(lastMove&&(lastMove.from===square||lastMove.to===square))cell.classList.add('last-move');
  if(p){const holder=document.createElement('span');holder.className='beginner-puzzle-piece';holder.innerHTML=typeof window.pieceSvgMarkup==='function'?window.pieceSvgMarkup(code):'';if(!holder.innerHTML)holder.textContent=code;cell.appendChild(holder);}
  if(col===0){const q=document.createElement('span');q.className='beginner-puzzle-coordinate rank';q.textContent=String(rank);cell.appendChild(q);}
  if(row===7){const q=document.createElement('span');q.className='beginner-puzzle-coordinate file';q.textContent=file;cell.appendChild(q);}
  cell.addEventListener('click',()=>clickSquare(square));board.appendChild(cell);
 }
 if(layer&&layer.parentElement!==board)board.appendChild(layer);
}
function renderProgress(){
 const strip=$('beginnerPuzzleSteps');strip.replaceChildren();
 TASKS.forEach((t,i)=>{const b=document.createElement('button');b.type='button';b.className='beginner-puzzle-step'+(done.has(i)?' complete':'')+(i===index?' active':'');b.textContent=done.has(i)?'✓':String(i+1);b.disabled=student();b.setAttribute('aria-label','Bài '+(i+1)+(done.has(i)?' đã hoàn thành':''));b.addEventListener('click',()=>{if(!student())open(i);});strip.appendChild(b);});
 $('beginnerPuzzleDone').textContent='Đã hoàn thành '+done.size+'/10 bài';$('beginnerPuzzleProgressFill').style.width=(done.size/10*100)+'%';
}
function render(){
 if(!game)return;const t=task();
 $('beginnerPuzzleTitle').textContent='♟️ Đố cờ vua cơ bản — Bài '+(index+1)+'/10';
 $('beginnerPuzzleSubtitle').textContent='Đến lượt '+(game.turn()==='w'?'Trắng':'Đen');
 $('beginnerPuzzleSectionNumber').textContent='Bài '+(index+1)+'/10';$('beginnerPuzzleNumber').textContent='Bài '+(index+1)+'/10';
 $('beginnerPuzzlePrompt').textContent=t.prompt;$('beginnerPuzzleFeedback').textContent=feedback;
 $('beginnerPuzzleFeedback').className='beginner-puzzle-feedback'+(solved?' success':'');
 $('beginnerPuzzleAttempts').textContent='Số lần thử: '+attempts;
 $('beginnerPuzzlePrev').disabled=index===0||student()||thinking;$('beginnerPuzzleNext').disabled=index===9||student()||thinking;
 $('beginnerPuzzleHint').disabled=solved||hintShown||thinking;$('beginnerPuzzleAnswer').disabled=answerShown||thinking;
 $('beginnerPuzzleRestart').disabled=thinking||(!solved&&!attempts&&!answerShown&&!started);
 const retry=$('beginnerPuzzleEngineRetry');if(retry){retry.hidden=!engineFailed;retry.disabled=thinking;}
 $('beginnerPuzzleAnswerText').hidden=!answerShown;$('beginnerPuzzleAnswerText').textContent=answerShown?task().notation+' — '+task().explanation:'';
 $('beginnerPuzzleHintText').hidden=!hintShown||answerShown;$('beginnerPuzzleHintText').textContent=hintShown&&!answerShown?task().hint:'';
 const played=game.history().join(' ');
 $('beginnerPuzzleNotation').textContent=solved?'Mục tiêu câu đố đã hoàn thành.':played?'Diễn biến: '+played:(thinking?'Đối phương đang phân tích nước đáp trả...':'Chọn quân có lượt đi, sau đó chọn ô đích được đánh dấu.');
 renderProgress();renderBoard();
}
function publish(){
 if(!isOpen||!inRoom()||typeof vqcExerciseWrite!=='function'||(typeof vqcApplyingExercise!=='undefined'&&vqcApplyingExercise)||(typeof vqcNavApplying!=='undefined'&&vqcNavApplying))return;
 vqcExerciseWrite('beginnerPuzzleExercise',{index,moves:[...moveHistory],move:moveHistory[0]||null,solved,answerShown,hintShown,attempts,feedback,done:[...done],thinking,engineFailed,nonce:Date.now()+'-'+Math.random().toString(36).slice(2,7)});
}
function updateGoal(move){
 const goal=task().goal;if(!goal)return false;
 if(goal.kind==='first-move')return move.color===task().side&&moveHistory.length===1&&moveHistory[0]===task().answer;
 if(move.color===goal.color&&move.from===goalSquare&&move.piece===goal.piece)goalSquare=move.to;
 return move.color===task().side&&move.to===goalSquare&&move.captured===goal.piece;
}
function applyPuzzleMove(moveUci){
 const parsed=parseUci(moveUci),candidate=game.moves({verbose:true}).find(m=>uci(m)===moveUci);
 if(!candidate)return null;
 const made=game.move({from:parsed.from,to:parsed.to,promotion:parsed.promotion||'q'});
 if(!made)return null;
 moveHistory.push(moveUci);lastMove={from:made.from,to:made.to};
 return {move:made,goalReached:updateGoal(made)};
}
function completePuzzle(){
 thinking=false;engineFailed=false;solved=true;selected=null;done.add(index);saveDone();
 feedback='✅ Hoàn thành mục tiêu! '+task().explanation;
 render();publish();
}
function terminalFeedback(){
 if(!game.game_over())return false;
 thinking=false;feedback=game.in_checkmate()?'Ván cờ kết thúc bằng chiếu hết trước khi đạt mục tiêu.':'Ván cờ kết thúc trước khi đạt mục tiêu câu đố.';
 render();publish();return true;
}
// Stockfish.js 19.0.1 (GPL-3.0), loaded only when an opponent reply is needed.
const STOCKFISH_BASE='https://cdn.jsdelivr.net/npm/stockfish@19.0.1/bin/';
function stopEngineSearch(){
 if(engineBestReject){const cancel=engineBestReject;engineBestReject=null;engineBestResolve=null;engineWorker?.postMessage('stop');cancel(new Error('Đã hủy lượt phân tích cũ.'));}
 else if(engineWorker&&engineReady)engineWorker.postMessage('stop');
}

function ensurePuzzleEngine(){
 if(engineReady&&engineWorker)return Promise.resolve();
 if(engineInitPromise)return engineInitPromise;
 const bases=[
  STOCKFISH_BASE,
  'https://unpkg.com/stockfish@19.0.1/bin/'
 ];
 engineInitPromise=(async()=>{
  let lastError=null;
  for(const base of bases){
   await new Promise((resolve,reject)=>{
    let settled=false;
    const cleanup=()=>{
     clearTimeout(engineReadyTimer);
     engineReadyReject=null;
    };
    const fail=error=>{
     if(settled)return;
     settled=true;cleanup();
     try{engineWorker?.terminate();}catch(e){}
     engineWorker=null;engineReady=false;
     if(engineBlobUrl){URL.revokeObjectURL(engineBlobUrl);engineBlobUrl='';}
     reject(error instanceof Error?error:new Error(String(error||'Không thể tải Stockfish.')));
    };
    const ready=()=>{
     if(settled)return;
     settled=true;cleanup();engineReady=true;resolve();
    };
    try{
     const bootstrap='self.Module=self.Module||{};self.Module.locateFile=function(path){return '+JSON.stringify(base)+'+path;};importScripts('+JSON.stringify(base+'stockfish-19-lite-single.js')+');';
     const blob=new Blob([bootstrap],{type:'text/javascript'});
     engineBlobUrl=URL.createObjectURL(blob);
     engineWorker=new Worker(engineBlobUrl);
    }catch(error){fail(error);return;}
    engineReadyReject=fail;
    engineReadyTimer=setTimeout(()=>fail(new Error('Hết thời gian tải engine từ '+base)),20000);
    engineWorker.onmessage=event=>{
     const line=String(event.data||'').trim();
     if(line==='uciok'){engineWorker.postMessage('isready');return;}
     if(line==='readyok'){ready();return;}
     if(line.startsWith('bestmove ')&&engineBestResolve){
      const best=line.split(/\s+/)[1]||'';
      const finish=engineBestResolve;engineBestResolve=null;engineBestReject=null;
      finish(best);
     }
    };
    engineWorker.onerror=event=>fail(new Error(event.message||'Worker Stockfish không khởi động được.'));
    engineWorker.onmessageerror=()=>fail(new Error('Không đọc được dữ liệu phản hồi từ Stockfish.'));
    engineWorker.postMessage('uci');
   }).catch(error=>{lastError=error;});
   if(engineReady)return;
  }
  throw lastError||new Error('Không thể tải Stockfish từ các máy chủ dự phòng.');
 })().catch(error=>{
  engineInitPromise=null;engineReady=false;
  if(engineWorker){engineWorker.terminate();engineWorker=null;}
  if(engineBlobUrl){URL.revokeObjectURL(engineBlobUrl);engineBlobUrl='';}
  throw error;
 });
 return engineInitPromise;
}
async function requestBestReply(fen){
 await ensurePuzzleEngine();
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{
   engineBestResolve=null;engineBestReject=null;engineWorker?.postMessage('stop');
   reject(new Error('Engine không phản hồi kịp thời.'));
  },15000);
  engineBestResolve=best=>{clearTimeout(timer);resolve(best);};
  engineBestReject=error=>{clearTimeout(timer);reject(error);};
  engineWorker.postMessage('position fen '+fen);engineWorker.postMessage('go depth 10');
 });
}
async function makeOpponentReply(){
 if(!isOpen||!game||solved||game.turn()===task().side)return;
 const session=puzzleSession;
 thinking=true;engineFailed=false;feedback='Đối phương đang phân tích nước đáp trả...';render();publish();
 try{
  // Các bài có biến đáp trả được thiết kế sẵn để bảo đảm đúng trình tự lời giải.
  // Bài 1: ...Qd4+ Qe3, sau đó người học tìm ...Qxb4.
  // Bài 2: Qh8+ Kd7, sau đó người học tìm Qxa8.
  const scriptedReply=moveHistory.length===1&&moveHistory[0]===task().answer
   ?(task().id===1?'c1e3':task().id===2?'e8d7':null)
   :null;
  const best=scriptedReply||await requestBestReply(game.fen());
  if(!isOpen||session!==puzzleSession||solved)return;
  if(!best||best==='(none)'||best==='0000')throw new Error('Vị trí hiện tại không có nước đáp trả hợp lệ.');
  const result=applyPuzzleMove(best);if(!result)throw new Error('Nước đáp trả '+best+' không hợp lệ trong thế cờ hiện tại.');
  thinking=false;
  if(result.goalReached){completePuzzle();return;}
  if(terminalFeedback())return;
  feedback=(result.move.color==='w'?'Trắng':'Đen')+' đáp trả: '+result.move.san+'. Hãy tiếp tục.';
  render();publish();
 }catch(error){
  if(!isOpen||session!==puzzleSession)return;
  thinking=false;engineFailed=true;
  feedback='Chưa tải được engine để chọn nước đáp trả tốt nhất. Kiểm tra kết nối mạng rồi nhấn “Thử lại đáp trả”.';
  console.warn('Beginner puzzle engine:',error);render();publish();
 }
}
function retryOpponentReply(){if(!engineFailed||thinking||solved||!game)return;engineFailed=false;makeOpponentReply();}
function clickSquare(square){
 if(!isOpen||!game||solved||answerShown||thinking||game.turn()!==task().side)return;
 const p=game.get(square);
 if(p&&p.color===game.turn()){selected=selected===square?null:square;render();return;}
 if(!selected)return;
 const candidate=game.moves({square:selected,verbose:true}).find(m=>m.to===square);
 if(!candidate){selected=null;feedback='Ô đích chưa tạo thành nước đi hợp lệ. Hãy chọn lại quân hoặc ô được đánh dấu.';render();return;}
 selected=null;const candidateUci=uci(candidate);
 if(!started&&candidateUci!==task().answer){attempts++;feedback='Nước đi hợp lệ, nhưng chưa đạt yêu cầu của câu đố. Hãy thử lại.';render();publish();return;}
 attempts++;
 const result=applyPuzzleMove(candidateUci);if(!result)return;
 started=true;
 if(result.goalReached){completePuzzle();return;}
 if(terminalFeedback())return;
 makeOpponentReply();
}
function showHint(){if(!isOpen||solved||hintShown||thinking)return;hintShown=true;feedback='💡 '+task().hint;render();publish();}
function showAnswer(){if(!isOpen||answerShown||thinking)return;answerShown=true;hintShown=false;feedback='Lời giải tham khảo từ Chessfox. Hãy quan sát nước đi và ý tưởng chiến thuật.';render();publish();}
function restart(){if(!isOpen)return;resetPosition();render();publish();}
function change(d){if(student())return;const n=index+d;if(n<0||n>=10)return;open(n);}
function open(n=0,remote=false){
 try{validateCatalog();}catch(e){console.error('Beginner puzzle validation:',e);if(window.vqcNotify)window.vqcNotify('Chưa thể mở bộ Đố cờ vua cơ bản: '+e.message,'warning');return;}
 if(!remote&&student()){if(window.vqcNotify)window.vqcNotify('Giáo viên chọn bài chung; em vẫn có thể trực tiếp giải trên bàn cờ.','warning');return;}
 const v=Number(n);index=Number.isInteger(v)?Math.max(0,Math.min(9,v)):0;
 if(window.vqcCloseOtherViews)window.vqcCloseOtherViews('beginnerpuzzles');
 const el=overlay();if(!el)return;if(el.parentElement!==document.body)document.body.appendChild(el);
 isOpen=true;el.hidden=false;el.classList.add('open');restoreDone();resetPosition();render();
 if(!remote){if(window.vqcBroadcastView)window.vqcBroadcastView('beginnerpuzzles',index);publish();}
}
function close(){
 stopEngineSearch();puzzleSession++;
 if(student()){if(window.vqcNotify)window.vqcNotify('Giáo viên điều khiển việc đóng bài chung.','warning');return;}
 isOpen=false;selected=null;if(overlay()){overlay().classList.remove('open');overlay().hidden=true;}
 if(inRoom()&&window.vqcBroadcastView)window.vqcBroadcastView('board');
}
function receive(data){
 if(!data||!isOpen||data.index!==index||!Array.isArray(data.done)||data.done.length>10)return;
 if(typeof vqcExerciseClientId!=='undefined'&&data.clientId===vqcExerciseClientId)return;
 const signature=JSON.stringify(data);if(signature===receivedKey)return;receivedKey=signature;
 if(typeof vqcApplyingExercise!=='undefined')vqcApplyingExercise=true;
 try{
  puzzleSession++;game=new Chess(task().fen);selected=null;solved=false;thinking=false;engineFailed=!!data.engineFailed;
  started=false;goalSquare=task().goal?.square||'';moveHistory=[];lastMove=null;
  const incoming=Array.isArray(data.moves)?data.moves:(data.move===task().answer?[data.move]:[]);
  for(const textMove of incoming.slice(0,80)){
   if(typeof textMove!=='string')break;
   const result=applyPuzzleMove(textMove);if(!result)break;
   started=true;if(result.goalReached)solved=true;
  }
  answerShown=!!data.answerShown;hintShown=!!data.hintShown;attempts=Math.max(0,Math.min(100,Number(data.attempts)||0));
  thinking=!!data.thinking&&!solved;
  done.clear();data.done.forEach(n=>{if(Number.isInteger(n)&&n>=0&&n<10)done.add(n);});
  if(solved||data.solved){solved=true;done.add(index);}saveDone();
  feedback=String(data.feedback||'Trạng thái đang đồng bộ.').slice(0,650);render();
 }finally{if(typeof vqcApplyingExercise!=='undefined')vqcApplyingExercise=false;}
}
window.beginnerPuzzleOpen=open;window.beginnerPuzzleClose=close;window.vqcBeginnerPuzzleReceive=receive;
document.addEventListener('DOMContentLoaded',()=>{
 $('beginnerPuzzleClose')?.addEventListener('click',close);
 $('beginnerPuzzlePrev')?.addEventListener('click',()=>change(-1));$('beginnerPuzzleNext')?.addEventListener('click',()=>change(1));
 $('beginnerPuzzleRestart')?.addEventListener('click',restart);$('beginnerPuzzleHint')?.addEventListener('click',showHint);$('beginnerPuzzleAnswer')?.addEventListener('click',showAnswer);$('beginnerPuzzleEngineRetry')?.addEventListener('click',retryOpponentReply);
 overlay()?.addEventListener('click',e=>{if(e.target===overlay())close();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&overlay()?.classList.contains('open'))close();});
});
})();