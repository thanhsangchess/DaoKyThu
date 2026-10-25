/* Dao Ky Thu — 500 independently generated mate-in-one exercises.
   These are original legal FEN variations, not a transcription of the uploaded book.
   Both peers deterministically build the same, chess.js-verified catalog.
   The existing "check in one move" lessons remain unchanged. */
(function(){
'use strict';
const $=id=>document.getElementById(id),FILES='abcdefgh',TOTAL=500;
const THEMES=[
 {label:'Hậu chiếu hết',pieces:{a8:'k',c6:'K',b6:'Q'},from:'b6',to:'b7'},
 {label:'Hai Xe phối hợp',pieces:{a8:'k',c6:'K',a6:'R',b7:'R',a7:'p'},from:'a6',to:'a7'},
 {label:'Tượng chiếu hết',pieces:{a8:'k',c7:'K',d5:'B',a7:'p',b7:'p'},from:'d5',to:'b7'},
 {label:'Mã chiếu hết',pieces:{h8:'k',g6:'K',h6:'N',e7:'N'},from:'h6',to:'f7'},
 {label:'Phong cấp chiếu hết',pieces:{a8:'k',b8:'r',c7:'K',a7:'P'},from:'a7',to:'b8',promotion:'q'}
];
// Far-side pawns create different, legally checked positions without reproducing the book.
const EXTRA=['e2','f2','g2','h2','e3','f3','g3','h3','e4','f4','g4','h4','e5','f5','g5','h5','e6','f6','g6','h6','d2','d3','d4','d5'];
let puzzles=null,idx=0,game=null,selected=null,hint=false,feedback='',solved=false,failed=false,lastMove=null,isOpen=false;
const done=new Set();
let receivedKey='',savedFor='';
function roomOn(){return typeof roomRef!=='undefined'&&!!roomRef;}
function student(){return roomOn()&&(typeof role!=='undefined'?role:window.accountProfile?.role)==='student';}
function trSq(s,t){let f=FILES.indexOf(s[0]),r=Number(s[1])-1;if(t&1)f=7-f;if(t&2){f=7-f;r=7-r;}return FILES[f]+(r+1);}
function trPiece(c,t){return (t&2)?(c===c.toLowerCase()?c.toUpperCase():c.toLowerCase()):c;}
function buildFen(position,turn){let ranks=[];for(let r=8;r>=1;r--){let row='',empties=0;for(const file of FILES){const p=position[file+r];if(!p){empties++;continue;}if(empties){row+=empties;empties=0;}row+=p;}if(empties)row+=empties;ranks.push(row);}return ranks.join('/')+' '+turn+' - - 0 1';}
function catalog(){
 if(puzzles)return puzzles;
 if(typeof Chess!=='function')throw Error('Chưa tải thư viện luật cờ vua (chess.js).');
 const seen=new Set(),groups=THEMES.map(()=>[]);
 const combinations=[[]];
 for(const s of EXTRA)combinations.push([s]);
 for(let a=0;a<EXTRA.length;a++)for(let b=a+1;b<EXTRA.length;b++)combinations.push([EXTRA[a],EXTRA[b]]);
 for(const extras of combinations){
  for(let theme=0;theme<THEMES.length;theme++){
   if(groups[theme].length>=100)continue;
   const model=THEMES[theme];
   for(let transform=0;transform<4;transform++){
    if(groups[theme].length>=100)break;
    const position={...model.pieces};
    if(extras.some(s=>position[s]))continue;
    for(const s of extras)position[s]='p';
    const mapped={};
    for(const [sq,p] of Object.entries(position))mapped[trSq(sq,transform)]=trPiece(p,transform);
    const turn=transform&2?'b':'w',fen=buildFen(mapped,turn);
    if(seen.has(fen))continue;
    const candidate=new Chess(fen),from=trSq(model.from,transform),to=trSq(model.to,transform);
    if(candidate.fen().split(' ')[0]!==fen.split(' ')[0]||candidate.turn()!==turn||candidate.in_check()||candidate.in_checkmate()||candidate.in_stalemate())continue;
    // Reject positions in which the defender was already in check before the puzzle move.
    const defender=new Chess(fen.replace(' '+turn+' ',' '+(turn==='w'?'b':'w')+' '));
    if(defender.in_check())continue;
    const possible=candidate.moves({square:from,verbose:true}).find(m=>m.to===to&&(!model.promotion||m.promotion===model.promotion));
    if(!possible)continue;
    const move=candidate.move({from,to,promotion:model.promotion||'q'});
    if(!move||!candidate.in_checkmate())continue;
    groups[theme].push({fen,from,to,promotion:model.promotion||null,label:model.label,color:turn,answer:move.san});
    seen.add(fen);
   }
  }
  if(groups.every(g=>g.length===100))break;
 }
 // Interleave motifs so that learners meet different pieces throughout the course.
 puzzles=[];
 for(let level=0;level<100;level++)for(const group of groups)if(group[level])puzzles.push(group[level]);
 if(puzzles.length!==TOTAL)console.warn('Bộ chiếu hết 1 nước: mới xác nhận '+puzzles.length+'/'+TOTAL+' thế cờ.');
 return puzzles;
}
function cacheKey(){return 'vqc-mate1-done-'+(window.accountProfile?.uid||window.accountProfile?.id||'guest');}
function restoreProgress(){
 const key=cacheKey();if(savedFor===key)return;savedFor=key;done.clear();
 try{const values=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(values))values.filter(n=>Number.isInteger(n)&&n>=0&&n<TOTAL).forEach(n=>done.add(n));}catch(e){}
}
function persist(){try{localStorage.setItem(cacheKey(),JSON.stringify([...done]));}catch(e){}}
function puzzle(){return catalog()[idx];}
function newPosition(){game=new Chess(puzzle().fen);selected=null;hint=false;feedback='Hãy tìm một nước đi khiến Vua đối phương bị chiếu hết.';solved=false;failed=false;lastMove=null;}
function message(s){feedback=s;render();}
function paint(){
 const board=$('vqcMateOneBoard');if(!board||!game)return;
 board.replaceChildren();
 const black=game.turn()==='b',ranks=black?[1,2,3,4,5,6,7,8]:[8,7,6,5,4,3,2,1],files=black?[...FILES].reverse():[...FILES];
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
 $('vqcMateOneNext').textContent=solved?'Tiếp tục →':'Bài tiếp →';
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
