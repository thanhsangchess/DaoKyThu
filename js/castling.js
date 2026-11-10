/* Đảo Kỳ Thủ · Bài tập nhận biết điều kiện nhập thành */
(function(){
 'use strict';
 const TASKS=[
  {figure:141,side:'w',castle:'short',fen:'r4rk1/pp3pb1/5n1p/8/8/4BP2/PPP3PP/R2K3R w - - 0 1',answer:false,reason:'Vua Trắng đang ở d1, không còn đứng trên ô xuất phát e1. Vì vậy Trắng không thể nhập thành ngắn.'},
  {figure:142,side:'b',castle:'short',fen:'1r2kb1r/pp3ppp/2n5/8/8/8/PP3PPP/R4RK1 b k - 0 1',answer:false,reason:'Tượng Đen ở f8 chắn giữa Vua e8 và Xe h8. Đường đi của Vua phải thông thoáng nên không thể nhập thành ngắn.'},
  {figure:143,side:'w',castle:'short',fen:'5rk1/1pp2pp1/7p/4P3/1bP5/5N2/1P4PP/4K2R w K - 0 1',answer:false,reason:'Tượng Đen ở b4 đang chiếu Vua Trắng e1 theo đường chéo b4–c3–d2–e1. Vua đang bị chiếu nên không được nhập thành.'},
  {figure:144,side:'b',castle:'short',fen:'2r1k2r/1R4pp/5n2/8/8/1B6/P5PP/5RK1 b k - 0 1',answer:false,reason:'Tượng Trắng ở b3 khống chế ô g8 theo đường chéo b3–c4–d5–e6–f7–g8. Vua Đen không được đi qua ô đang bị tấn công.'},
  {figure:145,side:'w',castle:'short',fen:'5rk1/5ppp/2q1p3/8/8/6P1/1P3P1P/3QK2R w K - 0 1',answer:true,reason:'Vua Trắng ở e1 và Xe h1 còn đúng vị trí. Hai ô f1, g1 đều trống và đường đi của Vua không bị quân Đen khống chế, nên Trắng có thể nhập thành ngắn.'},
  {figure:146,side:'w',castle:'long',fen:'r4rk1/1pp3pp/p7/8/8/2N2bP1/PPP4P/R3K1R1 w Q - 0 1',answer:false,reason:'Tượng Đen ở f3 khống chế ô d1 theo đường chéo f3–e2–d1. Đây là ô Vua Trắng phải đi qua khi nhập thành dài, nên nước nhập thành không hợp lệ.'},
  {figure:147,side:'b',castle:'short',fen:'4k2r/1p3p1p/6p1/5b2/8/2B4P/1P3PP1/3R2K1 b k - 0 1',answer:true,reason:'Vua Đen ở e8 và Xe h8 còn đúng vị trí. Hai ô f8, g8 trống, Vua không bị chiếu và các ô đi qua đều an toàn, nên Đen có thể nhập thành ngắn.'},
  {figure:148,side:'w',castle:'short',fen:'r1b2rk1/pp1nbppp/1qpp1n2/8/2B1PP2/2N2N2/PPP3PP/R1BQK2R w K - 0 1',answer:false,reason:'Hậu Đen ở b6 khống chế ô g1 theo đường chéo b6–c5–d4–e3–f2–g1. Vua Trắng không được đi qua ô g1 đang bị tấn công.'},
  {figure:149,side:'b',castle:'long',fen:'r3k2r/pppq1ppp/2npb3/4p3/2B1Pn1B/3P1N2/PPP2PPP/R2Q1RK1 b q - 0 1',answer:false,reason:'Tượng Trắng ở h4 khống chế ô d8 theo đường chéo h4–g5–f6–e7–d8. Vua Đen phải đi qua d8 khi nhập thành dài nên không thể nhập thành.'},
  {figure:150,side:'b',castle:'short',fen:'r3k1Br/ppp3pp/1b1p4/5p2/3P1B2/2P4P/PP3PP1/2KR3R b k - 0 1',answer:false,reason:'Ô g8 đang có Tượng Trắng. Vua Đen không thể nhập thành ngắn vì ô đến của Vua phải trống.'}
 ];
 const $=id=>document.getElementById(id);
 let current=0;
 const answers=Array(TASKS.length).fill(null);
 const overlay=()=>$('castlingOverlay');
 function placementToBoard(fen){
  const rows=fen.split(/\s+/)[0].split('/'),out=[];
  rows.forEach((row,r)=>{
   let file=0;
   for(const token of row){
    if(/[1-8]/.test(token)){file+=Number(token);continue;}
    out.push({file,rank:8-r,code:token});file++;
   }
  });
  return out;
 }
 function pieceName(code){
  const names={K:'Vua Trắng',Q:'Hậu Trắng',R:'Xe Trắng',B:'Tượng Trắng',N:'Mã Trắng',P:'Tốt Trắng',k:'Vua Đen',q:'Hậu Đen',r:'Xe Đen',b:'Tượng Đen',n:'Mã Đen',p:'Tốt Đen'};
  return names[code]||'Quân cờ';
 }
 function renderBoard(task){
  const board=$('castlingBoard');if(!board)return;
  board.replaceChildren();
  const pieces=new Map(placementToBoard(task.fen).map(p=>[p.file+','+p.rank,p.code]));
  for(let rank=8;rank>=1;rank--){
   for(let file=0;file<8;file++){
    const cell=document.createElement('div');
    cell.className='castling-square '+(((8-rank+file)%2===0)?'light':'dark');
    const code=pieces.get(file+','+rank);
    cell.setAttribute('aria-label',(code?pieceName(code)+', ':'')+'ô '+'abcdefgh'[file]+rank);
    if(code){
     const holder=document.createElement('span');holder.className='piece';
     holder.innerHTML=typeof window.pieceSvgMarkup==='function'?window.pieceSvgMarkup(code):'';
     if(!holder.innerHTML)holder.textContent=code.toUpperCase();
     cell.appendChild(holder);
    }
    if(file===0){const label=document.createElement('span');label.className='castling-coordinate rank';label.textContent=String(rank);cell.appendChild(label);}
    if(rank===1){const label=document.createElement('span');label.className='castling-coordinate file';label.textContent='abcdefgh'[file];cell.appendChild(label);}
    board.appendChild(cell);
   }
  }
 }
 function calculateAnswer(task){
  if(typeof window.Chess!=='function')return task.answer;
  try{
   const game=new Chess(task.fen),target=task.castle==='short'?'O-O':'O-O-O';
   return game.moves({verbose:true}).some(move=>move.san===target);
  }catch(error){
   console.warn('Không thể kiểm tra tự động điều kiện nhập thành Hình '+task.figure,error);
   return task.answer;
  }
 }
 function updateSummary(){
  const done=answers.filter(value=>value!==null).length;
  const score=answers.reduce((total,value,index)=>total+(value===TASKS[index].answer?1:0),0);
  $('castlingProgressText').textContent='Hình '+TASKS[current].figure+' · Câu '+(current+1)+'/10';
  $('castlingScore').textContent='Đã trả lời '+done+'/10 · Đúng '+score+'/10';
  $('castlingProgressFill').style.width=(done/TASKS.length*100)+'%';
 }
 function render(){
  const task=TASKS[current],chosen=answers[current];
  renderBoard(task);
  $('castlingFigure').textContent='HÌNH '+task.figure;
  $('castlingQuestion').textContent=(task.side==='w'?'Trắng':'Đen')+' có thể nhập thành '+(task.castle==='short'?'ngắn':'dài')+' không?';
  $('castlingSide').textContent=(task.side==='w'?'⚪ Trắng':'⚫ Đen')+' · '+(task.castle==='short'?'Nhập thành ngắn (O-O)':'Nhập thành dài (O-O-O)');
  const yes=$('castlingYes'),no=$('castlingNo'),feedback=$('castlingFeedback');
  [yes,no].forEach(button=>button.classList.remove('is-correct','is-wrong','is-selected'));
  yes.classList.toggle('is-selected',chosen===true);
  no.classList.toggle('is-selected',chosen===false);
  feedback.className='castling-feedback';feedback.replaceChildren();
  if(chosen!==null){
   const correct=task.answer,good=chosen===correct;
   feedback.classList.add('show',good?'good':'bad');
   const title=document.createElement('strong');
   title.textContent=good?'✓ Chính xác!':'Chưa chính xác. Đáp án đúng: '+(correct?'Có':'Không')+'.';
   const explanation=document.createElement('p');explanation.textContent=task.reason;
   feedback.append(title,explanation);
   (correct?yes:no).classList.add('is-correct');
   if(!good)(chosen?yes:no).classList.add('is-wrong');
  }
  const locked=!!(typeof roomRef!=='undefined'&&roomRef&&typeof role!=='undefined'&&role==='student');
  $('castlingPrev').disabled=current===0||locked;
  $('castlingNext').disabled=current===TASKS.length-1||locked;
  $('castlingRoomNote').textContent=locked
   ?'Giáo viên chuyển hình chung cho cả lớp. Em tự chọn đáp án trên thiết bị của mình.'
   :'Chọn Có hoặc Không. Sau khi trả lời, em sẽ thấy lý do đúng/sai.';
  updateSummary();
 }
 function answer(choice){answers[current]=choice;render();}
 window.castlingOpen=function(index=0,fromSync=false){
  if(typeof roomRef!=='undefined'&&roomRef&&typeof role!=='undefined'&&role==='student'&&!fromSync){
   if(typeof vqcNotify==='function')vqcNotify('Giáo viên chọn bài nhập thành chung cho lớp.','warning');
   return;
  }
  current=Math.max(0,Math.min(TASKS.length-1,Number(index)||0));
  if(typeof vqcCloseOtherViews==='function')vqcCloseOtherViews('castling');
  render();if(overlay())overlay().hidden=false;overlay()?.classList.add('open');
  if(!fromSync&&typeof vqcBroadcastView==='function')vqcBroadcastView('castling',current);
 };
 window.castlingClose=function(){
  if(overlay()){overlay().classList.remove('open');overlay().hidden=true;}
  if((typeof roomRef==='undefined'||!roomRef||role==='teacher')&&typeof vqcBroadcastView==='function')vqcBroadcastView('board');
 };
 window.castlingPrev=function(){if(current>0)window.castlingOpen(current-1);};
 window.castlingNext=function(){if(current<TASKS.length-1)window.castlingOpen(current+1);};
 window.castlingReset=function(){answers.fill(null);render();};
 window.castlingRetryCurrent=function(){answers[current]=null;render();};
 document.addEventListener('DOMContentLoaded',()=>{
  $('castlingYes')?.addEventListener('click',()=>answer(true));
  $('castlingNo')?.addEventListener('click',()=>answer(false));
  $('castlingPrev')?.addEventListener('click',window.castlingPrev);
  $('castlingNext')?.addEventListener('click',window.castlingNext);
  $('castlingReset')?.addEventListener('click',window.castlingReset);
  $('castlingRetry')?.addEventListener('click',window.castlingRetryCurrent);
  overlay()?.addEventListener('click',event=>{if(event.target===overlay())window.castlingClose();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&overlay()?.classList.contains('open'))window.castlingClose();});
  TASKS.forEach(task=>{
   const calculated=calculateAnswer(task);
   if(calculated!==task.answer)console.warn('Kiểm tra đáp án nhập thành Hình '+task.figure+': FEN cho kết quả '+(calculated?'Có':'Không')+', đáp án biên soạn '+(task.answer?'Có':'Không'));
  });
 });
})();