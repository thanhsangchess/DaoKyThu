(function(){
'use strict';
const $=id=>document.getElementById(id),TOTAL=500,FILES='abcdefgh',FIRST_PAGE=5,PER_PAGE=6,REPLY_DELAY=600;
let puzzles=null,idx=0,game=null,selected=null,hint=false,feedback='',solved=false,failed=false,lastMove=null,isOpen=false;
let step=0,played=[],busy=false,timer=null,unsubscribe=null,receivedKey='',savedFor='',viewStamp='';
const done=new Set();
function roomOn(){return typeof roomRef!=='undefined'&&!!roomRef;}
function student(){return roomOn()&&(typeof role!=='undefined'?role:window.accountProfile?.role)==='student';}
function notify(text){if(typeof vqcNotify==='function')vqcNotify(text,'warning');else alert(text);}
function catalog(){
 if(puzzles)return puzzles;
 if(typeof Chess!=='function')throw Error('Thư viện luật cờ vua chưa được tải.');
 const source=window.VQC_PDF_MATE3;
 if(!Array.isArray(source)||source.length!==TOTAL)throw Error('Chưa tải đủ 500 thế cờ từ PDF.');
 puzzles=source.map((text,i)=>{
  const parts=String(text).split(' ');
  if(parts.length!==7)throw Error('Sai định dạng dữ liệu bài '+(i+1));
  const board=parts[0],color=parts[1],fen=board+' '+color+' - - 0 1',chess=new Chess(fen);
  if(!chess.fen()||chess.fen().split(' ')[0]!==board)throw Error('Sơ đồ không hợp lệ, bài '+(i+1));
  const line=[];
  for(const uci of parts.slice(2)){
   const made=chess.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]||undefined});
   if(!made)throw Error('Nước đi trong sách không hợp lệ, bài '+(i+1)+': '+uci);
   line.push({from:made.from,to:made.to,promotion:made.promotion||null,san:made.san});
  }
  if(line.length!==5||!chess.in_checkmate())throw Error('Lời giải chưa chiếu hết trong 3 nước, bài '+(i+1));
  const pdfPage=FIRST_PAGE+Math.floor(i/PER_PAGE);
  return {num:i+1,fen,color,line,pdfPage,label:'Hình '+(i+1)+' · Trang '+pdfPage+' (PDF)'};
 });
 return puzzles;
}
function cacheKey(){return 'vqc-pdf-mate3-done-'+(window.accountProfile?.uid||window.accountProfile?.id||'guest');}
function restoreProgress(){
 const key=cacheKey();if(savedFor===key)return;savedFor=key;done.clear();
 try{const values=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(values))values.filter(n=>Number.isInteger(n)&&n>=0&&n<TOTAL).forEach(n=>done.add(n));}catch(e){}
}
function persist(){try{localStorage.setItem(cacheKey(),JSON.stringify([...done]));}catch(e){}}
function puzzle(){return catalog()[idx];}
function solutionText(){return puzzle().line.map(m=>m.san).join(' ');}
function newPosition(){
 clearTimeout(timer);timer=null;busy=false;
 game=new Chess(puzzle().fen);selected=null;hint=false;solved=false;failed=false;lastMove=null;step=0;played=[];
 feedback=(puzzle().color==='w'?'Trắng':'Đen')+' đi trước. Hãy chiếu hết Vua đối phương trong 3 nước! Sau mỗi nước đi, đối phương sẽ đáp lại.'+(puzzle().color==='b'?' (Bàn cờ đã xoay: Đen ở dưới.)':'');
}
function message(text){feedback=text;render();}
function paint(){
 const board=$('vqcMateThreeBoard');if(!board||!game)return;
 board.replaceChildren();
 const flip=puzzle().color==='b',ranks=flip?[1,2,3,4,5,6,7,8]:[8,7,6,5,4,3,2,1],files=flip?[...FILES].reverse():[...FILES];
 const legal=selected&&!busy?game.moves({square:selected,verbose:true}).map(m=>m.to):[];
 const next=hint&&!busy&&!solved&&!failed?puzzle().line[step]:null;
 for(let ri=0;ri<8;ri++)for(let fi=0;fi<8;fi++){
  const sq=files[fi]+ranks[ri],p=game.get(sq),button=document.createElement('button');
  button.type='button';button.dataset.square=sq;button.className='vqc-mateone-cell '+((ri+fi)%2?'dark':'light');
  if(selected===sq)button.classList.add('selected');
  if(legal.includes(sq))button.classList.add('legal');
  if(next&&next.from===sq)button.classList.add('hint-from');
  if(next&&next.to===sq)button.classList.add('hint-to');
  if(lastMove&&lastMove.from===sq)button.classList.add('vqc-mate3-last-from');
  if(lastMove&&lastMove.to===sq)button.classList.add('vqc-mate3-last-to');
  button.setAttribute('aria-label','Ô '+sq+(p?' '+(p.color==='w'?'trắng ':'đen ')+p.type:''));
  if(p){
   const piece=document.createElement('span');piece.className='vqc-mateone-piece';
   if(typeof pieceSvgMarkup==='function')piece.innerHTML=pieceSvgMarkup(p.color==='w'?p.type.toUpperCase():p.type);
   else piece.textContent=({w:{k:'♔',q:'♕',r:'♖',b:'♗',n:'♘',p:'♙'},b:{k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'}}[p.color]||{})[p.type]||'';
   button.append(piece);
  }
  if(fi===0){const x=document.createElement('span');x.className='vqc-mateone-rank';x.textContent=sq[1];button.append(x);}
  if(ri===7){const x=document.createElement('span');x.className='vqc-mateone-file';x.textContent=sq[0];button.append(x);}
  button.addEventListener('click',()=>click(sq));board.append(button);
 }
}
function render(){
 if(!game||!$('vqcMateThreeBoard'))return;
 const count=catalog().length,task=puzzle();
 $('vqcMateThreeTitle').textContent='♛ Mate in 3 — Bài '+(idx+1)+'/'+count;
 $('vqcMateThreeSubtitle').textContent=task.label+' · '+(task.color==='w'?'Trắng':'Đen')+' đi trước · Chiếu hết trong 3 nước';
 $('vqcMateThreeProgress').textContent='Đã hoàn thành '+done.size+'/'+count+' bài';
 $('vqcMateThreeFeedback').textContent=feedback;
 $('vqcMateThreeFeedback').className='vqc-mateone-feedback'+(solved?' success':failed?' error':'');
 $('vqcMateThreeNext').textContent=solved?'Tiếp tục →':'Bài sau →';
 $('vqcMateThreeUndo').disabled=!failed||busy;
 $('vqcMateThreeHint').disabled=busy||solved||failed;
 $('vqcMateThreePrev').disabled=student();
 $('vqcMateThreeNext').disabled=student();
 $('vqcMateThreeJump').disabled=student();
 $('vqcMateThreeGo').disabled=student();
 $('vqcMateThreeJump').max=String(count);
 $('vqcMateThreeJump').value=String(idx+1);
 paint();
}
function sameMove(a,b){return !!a&&!!b&&a.from===b.from&&a.to===b.to&&(a.promotion||null)===(b.promotion||null);}
function click(sq){
 if(!isOpen||!game||solved||failed||busy)return;
 const p=game.get(sq),turn=game.turn();
 if(p&&p.color===turn){selected=selected===sq?null:sq;hint=false;render();return;}
 if(!selected)return;
 const choices=game.moves({square:selected,verbose:true}).filter(m=>m.to===sq);
 if(!choices.length){selected=null;message('Ô này không phải nước đi hợp lệ. Hãy chọn lại.');return;}
 const book=puzzle().line[step];
 const move=(book&&book.from===selected&&book.to===sq&&choices.find(m=>(m.promotion||null)===book.promotion))||choices.find(m=>m.promotion==='q')||choices[0];
 const outcome=game.move({from:move.from,to:move.to,promotion:move.promotion||'q'});
 if(!outcome){selected=null;message('Nước đi không đúng luật.');return;}
 const made={from:outcome.from,to:outcome.to,promotion:outcome.promotion||null};
 played.push(made);lastMove={from:made.from,to:made.to};selected=null;hint=false;
 if(game.in_checkmate()){
  solved=true;done.add(idx);persist();
  feedback='🏆 Chính xác! '+outcome.san+' — Vua đã bị chiếu hết. Lời giải trong sách: '+solutionText()+'. Nhấn “Tiếp tục” để sang bài tiếp theo!';
  render();publish();return;
 }
 if(!sameMove(made,book)||step>=4){
  failed=true;
  feedback=game.in_stalemate()
   ?'Chưa đúng: thế cờ này hòa Pat, không phải chiếu hết. Nhấn “Đi lại nước này”.'
   :'Chưa đúng! Nước này không dẫn tới chiếu hết trong 3 nước. Nhấn “Đi lại nước này” để thử nước khác, hoặc “Làm lại” để bắt đầu lại bài.';
  render();publish();return;
 }
 step+=1;busy=true;
 feedback='✅ Đúng rồi! '+outcome.san+' — đối phương đang đáp lại…';
 render();publish();
 timer=setTimeout(()=>{
  timer=null;
  const reply=puzzle().line[step];
  const answer=game.move({from:reply.from,to:reply.to,promotion:reply.promotion||undefined});
  busy=false;
  if(!answer){failed=true;feedback='Không thể thực hiện nước đáp của đối phương. Nhấn “Làm lại”.';render();return;}
  played.push({from:answer.from,to:answer.to,promotion:answer.promotion||null});
  lastMove={from:answer.from,to:answer.to};step+=1;
  feedback='Đối phương đáp '+answer.san+'. Nước '+(step/2+1)+'/3: hãy tìm nước đi tiếp theo để chiếu hết!';
  render();publish();
 },REPLY_DELAY);
}
function undoWrong(){
 if(!isOpen||!failed||busy)return;
 game.undo();played.pop();failed=false;selected=null;hint=false;
 lastMove=played.length?{from:played[played.length-1].from,to:played[played.length-1].to}:null;
 feedback='Đã trả lại nước đi. Hãy thử một nước khác!';
 render();publish();
}
function publish(){
 if(!isOpen||!roomOn()||typeof vqcExerciseWrite!=='function'||(typeof vqcNavApplying!=='undefined'&&vqcNavApplying)||(typeof vqcApplyingExercise!=='undefined'&&vqcApplyingExercise))return;
 vqcExerciseWrite('mate3PdfExercise',{index:idx,moves:played.map(m=>m.from+m.to+(m.promotion||'')),step,solved,failed,hint,done:[...done],feedback,nonce:Date.now()+'-'+Math.random().toString(36).slice(2,8)});
}
function receive(data){
 if(!data||!isOpen||!game||!Number.isInteger(data.index)||data.index!==idx||!Array.isArray(data.moves)||data.moves.length>8||!Array.isArray(data.done)||data.done.length>TOTAL)return;
 const key=JSON.stringify(data);if(key===receivedKey)return;receivedKey=key;
 const replay=new Chess(puzzle().fen),list=[];
 for(const uci of data.moves){
  if(typeof uci!=='string'||uci.length<4||uci.length>5)return;
  const made=replay.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]||undefined});
  if(!made)return;
  list.push({from:made.from,to:made.to,promotion:made.promotion||null});
 }
 const stepValue=Number.isInteger(data.step)&&data.step>=0&&data.step<=4&&data.step<=list.length?data.step:0;
 if(typeof vqcApplyingExercise!=='undefined')vqcApplyingExercise=true;
 try{
  clearTimeout(timer);timer=null;busy=false;
  game=replay;played=list;step=stepValue;selected=null;hint=!!data.hint;
  solved=!!data.solved&&game.in_checkmate();failed=!!data.failed&&!solved&&list.length>0;
  lastMove=list.length?{from:list[list.length-1].from,to:list[list.length-1].to}:null;
  feedback=String(data.feedback||'').slice(0,400);
  for(const n of data.done)if(Number.isInteger(n)&&n>=0&&n<TOTAL)done.add(n);
  if(solved)done.add(idx);persist();render();
 }finally{if(typeof vqcApplyingExercise!=='undefined')vqcApplyingExercise=false;}
}
function listen(){
 stopListening();
 if(!roomOn()||typeof roomRef.onSnapshot!=='function')return;
 try{
  unsubscribe=roomRef.onSnapshot(snapshot=>{
   const data=snapshot&&snapshot.data?snapshot.data():null,state=data&&data.mate3PdfExercise;
   if(!state||(typeof vqcExerciseClientId!=='undefined'&&state.clientId===vqcExerciseClientId))return;
   try{receive(state);}catch(e){console.warn('Lỗi đồng bộ Mate in 3',e);}
  },error=>console.warn('Không theo dõi được bài Mate in 3:',error));
 }catch(e){console.warn('Không theo dõi được bài Mate in 3:',e);}
}
function stopListening(){if(typeof unsubscribe==='function'){try{unsubscribe();}catch(e){}}unsubscribe=null;}
function open(i=0,remote=false){
 try{catalog();}catch(e){notify('Chưa thể mở bài Mate in 3: '+e.message);return;}
 if(!remote&&student()){notify('Giáo viên chọn bài; em có thể trực tiếp giải bài đang mở.');return;}
 restoreProgress();const n=Number(i);idx=Number.isInteger(n)?Math.max(0,Math.min(catalog().length-1,n)):0;
 if(typeof vqcCloseOtherViews==='function')vqcCloseOtherViews('mate3pdf');
 const el=$('vqcMateThreeOverlay');if(el.parentElement!==document.body)document.body.append(el);
 el.classList.add('open');isOpen=true;receivedKey='';newPosition();render();
 if(!remote){if(typeof vqcBroadcastView==='function')vqcBroadcastView('mate3pdf',idx);publish();}
 listen();
}
function hide(){
 clearTimeout(timer);timer=null;busy=false;
 if(isOpen){isOpen=false;selected=null;stopListening();}
 $('vqcMateThreeOverlay')?.classList.remove('open');
}
function close(){
 if(student()){notify('Giáo viên điều khiển việc đóng bài học trong lớp.');return;}
 hide();
 if(roomOn()&&typeof vqcBroadcastView==='function')vqcBroadcastView('board');
}
function reset(){if(!isOpen)return;newPosition();render();publish();}
function next(dir){if(student()){notify('Giáo viên điều khiển chuyển bài trong lớp.');return;}open((idx+dir+catalog().length)%catalog().length);}
function jump(){if(student())return;open(Math.max(0,Math.min(catalog().length-1,Number($('vqcMateThreeJump').value)-1)));}
function showHint(){if(!isOpen||solved||failed||busy)return;hint=true;feedback='💡 Gợi ý: nước đi tiếp theo đi từ ô có viền vàng tới ô có viền xanh.';render();publish();}
function hookClassroom(){
 const closeOthers=window.vqcCloseOtherViews;
 if(typeof closeOthers==='function'&&!closeOthers.vqcMate3Wrapped){
  const wrapped=function(target){const result=closeOthers.apply(this,arguments);if(target!=='mate3pdf')hide();return result;};
  wrapped.vqcMate3Wrapped=true;window.vqcCloseOtherViews=wrapped;
 }
 const receiveView=window.vqcReceiveView;
 if(typeof receiveView==='function'&&!receiveView.vqcMate3Wrapped){
  const wrapped=function(data){
   const result=receiveView.apply(this,arguments);
   try{
    if(data&&data.view==='mate3pdf'&&data.stamp&&typeof role!=='undefined'&&role==='student'){
     const index=Number(data.index)||0,el=$('vqcMateThreeOverlay');
     if(!isOpen||viewStamp!==data.stamp||idx!==index||!el.classList.contains('open')){viewStamp=data.stamp;open(index,true);}
    }
   }catch(e){console.warn('Không mở được Mate in 3 từ giáo viên',e);}
   return result;
  };
  wrapped.vqcMate3Wrapped=true;window.vqcReceiveView=wrapped;
 }
}

const VERSION='20261121-m3-v1';
const OVERLAY_HTML=`<div id="vqcMateThreeOverlay" role="dialog" aria-modal="true" aria-labelledby="vqcMateThreeTitle">
 <div class="vqc-mateone-dialog">
  <div class="vqc-mateone-top">
   <div><h2 id="vqcMateThreeTitle">♛ Mate in 3 — Chiếu hết trong 3 nước</h2><p id="vqcMateThreeSubtitle">500 bài trong PDF · Trắng hoặc Đen đi trước</p></div>
   <button type="button" id="vqcMateThreeClose" aria-label="Đóng bài tập">✕ Đóng</button>
  </div>
  <div class="vqc-mateone-layout">
   <div id="vqcMateThreeBoard" class="vqc-mateone-board" aria-label="Bàn cờ chiếu hết 3 nước"></div>
   <section class="vqc-mateone-side">
    <div id="vqcMateThreeProgress" class="vqc-mateone-progress">Đã hoàn thành 0/500 bài</div>
    <p id="vqcMateThreeFeedback" class="vqc-mateone-feedback" role="status" aria-live="polite">Hãy tìm chuỗi nước đi chiếu hết trong 3 nước!</p>
    <div class="vqc-mateone-controls">
     <button type="button" id="vqcMateThreePrev">← Bài trước</button>
     <button type="button" id="vqcMateThreeNext">Bài tiếp →</button>
     <button type="button" id="vqcMateThreeUndo">↩ Đi lại nước này</button>
     <button type="button" id="vqcMateThreeReset">↻ Làm lại</button>
     <button type="button" id="vqcMateThreeHint">💡 Gợi ý</button>
    </div>
    <div class="vqc-mateone-jump"><label for="vqcMateThreeJump">Chuyển đến bài</label>
     <input id="vqcMateThreeJump" type="number" min="1" max="500" value="1" inputmode="numeric">
     <button type="button" id="vqcMateThreeGo">Chuyển</button>
    </div>
    <p class="vqc-mateone-rules">♟ <strong>Cách chơi:</strong> em đi 3 nước để chiếu hết Vua đối phương; sau nước 1 và nước 2, đối phương sẽ tự đáp lại. Chọn quân rồi chọn ô đến. ✏️ <strong>Vẽ trên bàn cờ:</strong> trên máy tính, kéo chuột phải để kẻ mũi tên hoặc nhấn chuột phải để khoanh ô. Trên điện thoại, bật nút “Vẽ”, sau đó kéo hoặc chạm vào ô. Nét vẽ của giáo viên được đồng bộ tới học sinh.</p>
   </section>
  </div>
 </div>
</div>`;
function mountDom(){
 if(!$('vqcMateThreeCss')){
  const link=document.createElement('link');link.id='vqcMateThreeCss';link.rel='stylesheet';
  link.href='./css/mate-three-pdf-500.css?v='+VERSION;document.head.append(link);
 }
 if(!$('vqcMateThreeOverlay')){
  const holder=document.createElement('div');holder.innerHTML=OVERLAY_HTML.trim();document.body.append(holder.firstElementChild);
 }
 if(!$('mate3PdfMenu')){
  const item=document.createElement('div');
  item.className='lesson';item.id='mate3PdfMenu';item.setAttribute('role','button');item.tabIndex=0;
  item.innerHTML='<div class="lesson-icon">♛</div> Mate in 3 (500 bài)';
  const launch=()=>{
   open(0);
   if($('vqcMateThreeOverlay')?.classList.contains('open'))document.querySelectorAll('.lesson').forEach(n=>n.classList.toggle('active',n===item));
  };
  item.addEventListener('click',launch);
  item.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();launch();}});
  const anchor=$('mateOnePdfMenu')||$('mateOneBasicMenu')||document.querySelector('.lesson');
  if(anchor)anchor.insertAdjacentElement('afterend',item);
 }
}
function init(){
 mountDom();
 $('vqcMateThreePrev')?.addEventListener('click',()=>next(-1));
 $('vqcMateThreeNext')?.addEventListener('click',()=>next(1));
 $('vqcMateThreeReset')?.addEventListener('click',reset);
 $('vqcMateThreeUndo')?.addEventListener('click',undoWrong);
 $('vqcMateThreeHint')?.addEventListener('click',showHint);
 $('vqcMateThreeGo')?.addEventListener('click',jump);
 $('vqcMateThreeJump')?.addEventListener('keydown',e=>{if(e.key==='Enter')jump();});
 $('vqcMateThreeClose')?.addEventListener('click',close);
 $('vqcMateThreeOverlay')?.addEventListener('click',e=>{if(e.target===$('vqcMateThreeOverlay'))close();});
 hookClassroom();
}
window.vqcMateThreeOpen=open;
window.vqcMateThreeReceive=receive;
window.vqcMateThreeClose=close;
window.vqcMateThreeHide=hide;
window.vqcMateThreeCatalogCount=()=>catalog().length;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
