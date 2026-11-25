(function(){
'use strict';
if(window.vqcBoardEditor)return;
const VERSION='20261126-bed-v1';
const FILES='abcdefgh';
const START='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
const PALETTE=['K','Q','R','B','N','P','k','q','r','b','n','p',''];
const PNAME={k:'Vua',q:'Hậu',r:'Xe',b:'Tượng',n:'Mã',p:'Tốt'};
const LS_KEY='vqc-bed-evbar';
const UCI=/^[a-h][1-8][a-h][1-8][qrbn]?$/;

let cells=parsePlacement(START),turn='w',tool='P',flipped=false,mode='edit';
let game=null,selected=null,promo=null,lastMove=null,startNo=1,startTurn='w';
let evbOn=true;
try{const v=localStorage.getItem(LS_KEY);if(v!==null)evbOn=v==='1';}catch(e){}
let evbEng=null,evbEpoch=0,evbTimer=0,evbEv=null,evbAuto='';
let isOpen=false,msgText='',msgKind='';

function $(id){return document.getElementById(id);}
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
function notify(t,k){if(typeof window.vqcNotify==='function')window.vqcNotify(t,k||'warning');}

function parsePlacement(str){
 const rows=String(str||'').split('/');
 if(rows.length!==8)return null;
 const out=[];
 for(const row of rows){
  let n=0;
  for(const ch of row){
   if(/[1-8]/.test(ch)){const k=Number(ch);for(let j=0;j<k;j++)out.push('');n+=k;}
   else if(/[KQRBNPkqrbnp]/.test(ch)){out.push(ch);n++;}
   else return null;
  }
  if(n!==8)return null;
 }
 return out;
}
function placementOf(arr){
 const out=[];
 for(let r=0;r<8;r++){
  let row='',empty=0;
  for(let c=0;c<8;c++){
   const v=arr[r*8+c];
   if(!v){empty++;continue;}
   if(empty){row+=empty;empty=0;}
   row+=v;
  }
  if(empty)row+=empty;
  out.push(row);
 }
 return out.join('/');
}
function castleOf(arr){
 let s='';
 if(arr[60]==='K'){if(arr[63]==='R')s+='K';if(arr[56]==='R')s+='Q';}
 if(arr[4]==='k'){if(arr[7]==='r')s+='k';if(arr[0]==='r')s+='q';}
 return s||'-';
}
function fenOf(){return placementOf(cells)+' '+turn+' '+castleOf(cells)+' - 0 1';}
function curFen(){
 if(mode==='analyze'&&game)return game.fen();
 const f=fenOf();
 return validate(f)?null:f;
}
function validate(fen){
 const arr=parsePlacement(fen.split(' ')[0]);
 if(!arr)return 'FEN không hợp lệ.';
 const wk=arr.filter(x=>x==='K').length,bk=arr.filter(x=>x==='k').length;
 if(wk!==1||bk!==1)return 'Cần đúng 1 Vua trắng và 1 Vua đen.';
 if(arr.some((p,i)=>(p==='P'||p==='p')&&(i<8||i>=56)))return 'Tốt không thể đứng ở hàng 1 hoặc hàng 8.';
 const a=arr.indexOf('K'),b=arr.indexOf('k');
 if(Math.abs(Math.floor(a/8)-Math.floor(b/8))<=1&&Math.abs(a%8-b%8)<=1)return 'Hai Vua không được đứng cạnh nhau.';
 if(typeof Chess!=='function')return 'Chưa tải được thư viện luật cờ vua.';
 try{
  const g=new Chess();
  if(!g.load(fen))return 'Thế cờ chưa hợp lệ.';
  const swapped=fen.replace(/ (w|b) /,function(_,c){return ' '+(c==='w'?'b':'w')+' ';});
  const o=new Chess();
  if(o.load(swapped)&&o.in_check())return 'Vua bên không đến lượt đang bị chiếu — hãy đổi “Bên đi trước”.';
 }catch(e){return 'Thế cờ chưa hợp lệ.';}
 return '';
}
function uciToSan(fen,u){
 if(!u||!UCI.test(u)||typeof Chess!=='function')return '';
 const h=new Chess();if(!h.load(fen))return '';
 let mv=null;try{mv=h.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u.length>4?u[4]:undefined});}catch(e){}
 return mv?mv.san:'';
}
function pvToSan(fen,pv,limit){
 const out=[];if(!pv||typeof Chess!=='function')return out;
 const h=new Chess();if(!h.load(fen))return out;
 for(let i=0;i<pv.length&&i<limit;i++){
  const u=pv[i];let mv=null;
  try{mv=h.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u.length>4?u[4]:undefined});}catch(e){}
  if(!mv)break;out.push(mv.san);
 }
 return out;
}

function evalWhite(info,t){
 if(!info)return null;
 if(info.mate!==null&&info.mate!==undefined)return {mate:t==='w'?info.mate:-info.mate};
 if(info.cp===null||info.cp===undefined)return null;
 return {cp:t==='w'?info.cp:-info.cp};
}
function evalText(ev){
 if(!ev)return '';
 if(ev.mate!==undefined)return (ev.mate>0?'Trắng':'Đen')+' có thể chiếu hết sau '+Math.abs(ev.mate)+' nước';
 const a=Math.abs(ev.cp);if(a<30)return 'Thế cờ cân bằng';
 const who=ev.cp>0?'Trắng':'Đen';
 return a<150?who+' hơi nhỉnh hơn':a<400?who+' đang hơn':who+' hơn rất nhiều';
}
function evalShare(ev){
 if(!ev)return 50;
 if(ev.mate!==undefined)return ev.mate>0?97:3;
 return Math.round(50+50*Math.tanh(ev.cp/400)*0.94);
}
function evbLabel(ev){
 if(!ev)return '';
 if(ev.mate!==undefined)return 'M'+Math.abs(ev.mate);
 if(Math.abs(ev.cp)>=9000)return ev.cp>0?'1-0':'0-1';
 const v=Math.abs(ev.cp)/100;
 return v>=10?String(Math.round(v)):v.toFixed(1);
}
function evbStop(){
 evbEpoch++;clearTimeout(evbTimer);evbAuto='';
 if(evbEng){try{evbEng.dispose();}catch(e){}evbEng=null;}
}
function evbRun(fen,t){
 const ep=++evbEpoch;
 try{
  if(!evbEng){if(!window.VqcStockfish)return;evbEng=window.VqcStockfish.create({onStatus:function(){}});}
 }catch(e){return;}
 evbEng.search(fen,{movetime:800,skill:20}).then(function(res){
  if(ep!==evbEpoch||!res||res.cancelled)return;
  const ok=res.valid!==false&&!res.none;
  evbEv={fen:fen,ev:ok?evalWhite(res.info,t):null,
   best:ok&&res.bestmove&&UCI.test(res.bestmove)?res.bestmove:'',
   pv:ok&&res.info&&Array.isArray(res.info.pv)?res.info.pv.slice(0,8):[],
   depth:ok&&res.info&&Number.isFinite(res.info.depth)?res.info.depth:0};
  if(isOpen&&curFen()===fen)paint();
 }).catch(function(){
  if(ep!==evbEpoch)return;
  if(evbEng){try{evbEng.dispose();}catch(e){}evbEng=null;}
 });
}
function evbFor(fen){
 if(!evbOn){if(evbEng)evbStop();return null;}
 if(!fen)return null;
 if(evbEv&&evbEv.fen===fen)return evbEv;
 let p=null;
 try{p=new Chess();if(!p.load(fen))p=null;}catch(e){p=null;}
 if(!p)return null;
 if(p.game_over()){
  evbEv={fen:fen,ev:{cp:p.in_checkmate()?(p.turn()==='w'?-10000:10000):0},best:'',pv:[],depth:0,over:true};
  return evbEv;
 }
 if(evbAuto!==fen){
  evbAuto=fen;clearTimeout(evbTimer);
  const t=p.turn();
  evbTimer=setTimeout(function(){evbRun(fen,t);},350);
 }
 return null;
}

function setMsg(t,k){msgText=t||'';msgKind=k||'';const m=$('vqcBedMsg');if(m){m.textContent=msgText;m.className='vqc-bed-msg'+(msgKind?' '+msgKind:'');}}

function paintPalette(){
 const pal=$('vqcBedPalette');if(!pal)return;
 pal.replaceChildren();
 PALETTE.forEach(function(code){
  const b=el('button','vqc-bed-piece'+(tool===code?' active':''));
  b.type='button';
  const name=code?(PNAME[code.toLowerCase()]+' '+(code===code.toUpperCase()?'trắng':'đen')):'Cục tẩy: xóa quân';
  b.title=name;b.setAttribute('aria-label',name);b.setAttribute('aria-pressed',String(tool===code));
  if(code&&typeof pieceSvgMarkup==='function')b.innerHTML=pieceSvgMarkup(code);
  else if(code)b.textContent=({K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'})[code];
  else b.textContent='✕';
  b.addEventListener('click',function(){tool=code;paintPalette();});
  pal.append(b);
 });
}
function kingSquare(g,color){
 const b=g.board();
 for(let r=0;r<8;r++)for(let f=0;f<8;f++){const p=b[r][f];if(p&&p.type==='k'&&p.color===color)return FILES[f]+(8-r);}
 return null;
}
function paintBoard(){
 const board=$('vqcBedBoard');if(!board)return;
 board.replaceChildren();
 const ranks=flipped?[1,2,3,4,5,6,7,8]:[8,7,6,5,4,3,2,1],files=flipped?FILES.split('').reverse():FILES.split('');
 const analyze=mode==='analyze'&&game;
 const legal=analyze&&selected?game.moves({square:selected,verbose:true}).map(function(m){return m.to;}):[];
 const checkSq=analyze&&game.in_check()?kingSquare(game,game.turn()):null;
 for(let ri=0;ri<8;ri++)for(let fi=0;fi<8;fi++){
  const sq=files[fi]+ranks[ri];
  const idx=(8-ranks[ri])*8+FILES.indexOf(files[fi]);
  let code='';
  if(analyze){const p=game.get(sq);if(p)code=p.color==='w'?p.type.toUpperCase():p.type;}
  else code=cells[idx];
  const b=el('button','vqc-bed-cell '+((ri+fi)%2?'dark':'light'));
  b.type='button';b.dataset.square=sq;b.dataset.idx=String(idx);
  if(selected===sq)b.classList.add('selected');
  if(legal.indexOf(sq)>=0)b.classList.add('legal');
  if(analyze&&lastMove&&lastMove.from===sq)b.classList.add('vqc-last-from');
  if(analyze&&lastMove&&lastMove.to===sq)b.classList.add('vqc-last-to');
  if(checkSq===sq)b.classList.add('in-check');
  b.setAttribute('aria-label','Ô '+sq+(code?' '+(code===code.toUpperCase()?'trắng ':'đen ')+PNAME[code.toLowerCase()]:''));
  if(code){
   const s=el('span','vqc-bed-pieceimg');
   if(typeof pieceSvgMarkup==='function')s.innerHTML=pieceSvgMarkup(code);
   else s.textContent=({K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'})[code];
   b.append(s);
  }
  if(fi===0)b.append(el('span','vqc-bed-rank',String(ranks[ri])));
  if(ri===7)b.append(el('span','vqc-bed-file',files[fi]));
  board.append(b);
 }
}
function paintPromo(){
 const box=$('vqcBedPromo');if(!box)return;
 box.replaceChildren();box.hidden=!promo;if(!promo)return;
 box.append(el('p','','Tốt phong cấp thành:'));
 const row=el('div','vqc-bed-promo-row');
 ['q','r','b','n'].forEach(function(k){
  const b=el('button');b.type='button';
  const code=promo.color==='w'?k.toUpperCase():k;
  const g=el('span','vqc-bed-promo-piece');
  if(typeof pieceSvgMarkup==='function')g.innerHTML=pieceSvgMarkup(code);else g.textContent=k.toUpperCase();
  b.append(g,el('span','',PNAME[k]));
  b.addEventListener('click',function(){const p=promo;promo=null;doMove(p.from,p.to,k);});
  row.append(b);
 });
 box.append(row);
}
function paintEv(){
 const bar=$('vqcBedEvBar'),box=$('vqcBedEvBox');if(!bar||!box)return;
 bar.hidden=!evbOn;
 $('vqcBedEvToggle').checked=evbOn;
 box.replaceChildren();box.hidden=!evbOn;
 if(!evbOn)return;
 const fen=curFen(),entry=evbFor(fen);
 const ev=entry&&entry.ev?entry.ev:null;
 const share=evalShare(ev),whiteLead=share>=50;
 bar.classList.toggle('flip',flipped);bar.classList.toggle('stale',!ev);
 $('vqcBedEvWhite').style.height=share+'%';
 const lb=$('vqcBedEvLabel');lb.textContent=evbLabel(ev);
 const whiteEnd=flipped?'top':'bottom',lead=whiteLead?whiteEnd:(whiteEnd==='top'?'bottom':'top');
 lb.className='evb-label '+lead+(whiteLead?' dk':' lt');
 bar.title=ev?evalText(ev):'Đang chờ máy đánh giá…';
 bar.setAttribute('aria-label',ev?'Đánh giá của máy: '+evalText(ev):'Chưa có đánh giá của máy');
 if(!fen){box.append(el('p','vqc-bed-evline','Thế cờ chưa hợp lệ nên máy chưa đánh giá được.'));return;}
 if(!entry){box.append(el('p','vqc-bed-evline','Máy đang đánh giá thế cờ…'));return;}
 if(!ev){box.append(el('p','vqc-bed-evline','Máy chưa đánh giá được thế này.'));return;}
 box.append(el('p','vqc-bed-evhead','🤖 '+evalText(ev)+(entry.over?'':' ('+(ev.mate!==undefined?'M'+Math.abs(ev.mate):(ev.cp>0?'+':ev.cp<0?'−':'')+evbLabel(ev))+')')));
 if(entry.best){const san=uciToSan(fen,entry.best);if(san)box.append(el('p','vqc-bed-evline','Nước máy đề xuất: '+san));}
 if(entry.pv&&entry.pv.length){const l=pvToSan(fen,entry.pv,6);if(l.length)box.append(el('p','vqc-bed-evline','Biến chính: '+l.join(' ')));}
 if(entry.depth)box.append(el('p','vqc-bed-evline vqc-bed-dim','Độ sâu tìm kiếm: '+entry.depth));
}
function statusText(){
 if(!game)return '';
 const side=game.turn()==='w'?'Trắng':'Đen',other=game.turn()==='w'?'Đen':'Trắng';
 if(game.in_checkmate())return 'Chiếu hết! '+other+' thắng.';
 if(game.in_stalemate())return 'Hòa vì hết nước đi (pat).';
 if(game.game_over())return 'Ván cờ hòa.';
 return side+' đi'+(game.in_check()?' — đang bị chiếu':'')+'.';
}
function paintMoves(){
 const box=$('vqcBedMoves');if(!box)return;
 box.replaceChildren();
 const hist=game?game.history():[];
 if(!hist.length){box.append(el('p','vqc-bed-dim','Chưa có nước đi. Bấm quân để thử các nước.'));return;}
 const list=el('ol','vqc-bed-movelist');
 let no=startNo,whiteToMove=startTurn==='w';
 let li=null;
 hist.forEach(function(san,i){
  if(whiteToMove||!li){li=el('li');li.append(el('b','',no+(whiteToMove?'.':'…')));list.append(li);}
  li.append(el('span','',san));
  if(!whiteToMove)no++;
  whiteToMove=!whiteToMove;
 });
 box.append(list);
 box.scrollTop=box.scrollHeight;
}
function paint(){
 if(!isOpen)return;
 const analyze=mode==='analyze'&&!!game;
 $('vqcBedEditPane').hidden=analyze;
 $('vqcBedPlayPane').hidden=!analyze;
 $('vqcBedAnalyze').disabled=analyze;
 $('vqcBedBack').disabled=!analyze;
 $('vqcBedTitle').textContent=analyze?'🔎 Phân tích thế cờ':'✏️ Chỉnh sửa bàn cờ';
 if(!analyze){
  $('vqcBedTurn').value=turn;
  $('vqcBedFen').value=fenOf();
  paintPalette();
 }else{
  $('vqcBedStatus').textContent=statusText();
  $('vqcBedUndo').disabled=!game.history().length;
  paintMoves();
 }
 $('vqcBedBoardWrap').classList.toggle('editing',!analyze);
 paintBoard();paintPromo();paintEv();
}

function onCell(sq,idx,alt){
 if(mode==='analyze'&&game){
  if(promo)return;
  if(selected){
   const mv=game.moves({square:selected,verbose:true}).filter(function(m){return m.to===sq;});
   if(mv.length){
    if(mv.some(function(m){return m.promotion;})){promo={from:selected,to:sq,color:game.turn()};paint();return;}
    doMove(selected,sq);return;
   }
  }
  const p=game.get(sq);
  selected=p&&p.color===game.turn()&&selected!==sq?sq:null;
  paint();return;
 }
 if(alt||tool===''||cells[idx]===tool)cells[idx]='';
 else cells[idx]=tool;
 setMsg('');paint();
}
function doMove(from,to,pr){
 if(!game)return;
 let m=null;
 try{m=game.move({from:from,to:to,promotion:pr});}catch(e){m=null;}
 selected=null;
 if(m)lastMove={from:from,to:to};
 paint();
}
function startAnalysis(){
 const fen=fenOf(),err=validate(fen);
 if(err){setMsg(err,'err');return;}
 const g=new Chess();
 if(!g.load(fen)){setMsg('Thế cờ chưa hợp lệ.','err');return;}
 game=g;mode='analyze';selected=null;promo=null;lastMove=null;
 const parts=fen.split(' ');startNo=parseInt(parts[5],10)||1;startTurn=parts[1]==='b'?'b':'w';
 setMsg('');paint();
}
function backToEdit(){
 if(game){
  const arr=parsePlacement(game.fen().split(' ')[0]);
  if(arr){cells=arr;turn=game.turn();}
 }
 game=null;mode='edit';selected=null;promo=null;lastMove=null;
 setMsg('');paint();
}
function undo(){
 if(!game||!game.history().length)return;
 game.undo();selected=null;promo=null;
 const h=game.history({verbose:true});
 lastMove=h.length?{from:h[h.length-1].from,to:h[h.length-1].to}:null;
 paint();
}
function useFen(){
 const raw=String($('vqcBedFen').value||'').trim().replace(/\s+/g,' ');
 if(!raw){setMsg('Hãy nhập FEN trước.','err');return;}
 const parts=raw.split(' ');
 const arr=parsePlacement(parts[0]);
 if(!arr){setMsg('FEN không hợp lệ: cần 8 hàng, mỗi hàng đủ 8 ô và chỉ gồm các ký tự KQRBNPkqrbnp.','err');return;}
 cells=arr;
 if(parts[1]==='w'||parts[1]==='b')turn=parts[1];
 setMsg('Đã đặt thế cờ từ FEN.','ok');paint();
}
function copyFen(){
 const fen=fenOf();
 const fallback=function(){
  const inp=$('vqcBedFen');inp.value=fen;inp.focus();inp.select();
  let ok=false;try{ok=document.execCommand('copy');}catch(e){}
  setMsg(ok?'Đã sao chép FEN.':'Hãy nhấn Ctrl+C để sao chép FEN đang được chọn.',ok?'ok':'');
 };
 if(navigator.clipboard&&window.isSecureContext){
  navigator.clipboard.writeText(fen).then(function(){setMsg('Đã sao chép FEN.','ok');}).catch(fallback);
 }else fallback();
}

const OVERLAY_HTML=`<div id="vqcBedOverlay" role="dialog" aria-modal="true" aria-labelledby="vqcBedTitle">
 <div class="vqc-bed-dialog">
  <div class="vqc-bed-top">
   <div><h2 id="vqcBedTitle">✏️ Chỉnh sửa bàn cờ</h2><p>Đặt quân tự do, nhập FEN rồi nhờ Stockfish phân tích thế cờ.</p></div>
   <button type="button" id="vqcBedClose" aria-label="Đóng">✕ Đóng</button>
  </div>
  <div class="vqc-bed-layout">
   <div class="vqc-bed-boardcol">
    <div class="vqc-bed-evrow">
     <div id="vqcBedEvBar" class="vqc-bed-evbar" role="img"><span id="vqcBedEvWhite" class="evb-white"></span><i class="evb-mid"></i><b id="vqcBedEvLabel" class="evb-label"></b></div>
     <div id="vqcBedBoardWrap" class="vqc-bed-boardwrap">
      <div id="vqcBedBoard" class="vqc-bed-board" aria-label="Bàn cờ chỉnh sửa"></div>
      <div id="vqcBedPromo" class="vqc-bed-promo" hidden></div>
     </div>
    </div>
   </div>
   <section class="vqc-bed-side">
    <div class="vqc-bed-tools">
     <button type="button" id="vqcBedFlip" class="vqc-bed-btn">🔄 Đảo bàn cờ</button>
     <label class="vqc-bed-evsw"><span>Thanh đánh giá</span><input type="checkbox" id="vqcBedEvToggle"><i aria-hidden="true"></i></label>
    </div>
    <div id="vqcBedEvBox" class="vqc-bed-evbox" role="status" aria-live="polite"></div>
    <div id="vqcBedEditPane" class="vqc-bed-pane">
     <p class="vqc-bed-hint">Chọn quân rồi bấm vào ô để đặt; chọn cục tẩy để xóa quân. Bấm lại đúng quân đang có trên ô cũng sẽ xóa quân đó.</p>
     <div id="vqcBedPalette" class="vqc-bed-palette"></div>
     <label class="vqc-bed-row"><span>Bên đi trước</span><select id="vqcBedTurn"><option value="w">Trắng</option><option value="b">Đen</option></select></label>
     <div class="vqc-bed-btns"><button type="button" id="vqcBedReset" class="vqc-bed-btn">Thế ban đầu</button><button type="button" id="vqcBedClear" class="vqc-bed-btn">Xóa bàn cờ</button></div>
     <label class="vqc-bed-fenlabel" for="vqcBedFen">FEN</label>
     <input type="text" id="vqcBedFen" class="vqc-bed-fen" spellcheck="false" autocomplete="off" autocapitalize="off">
     <div class="vqc-bed-btns"><button type="button" id="vqcBedUseFen" class="vqc-bed-btn">Dùng FEN này</button><button type="button" id="vqcBedCopyFen" class="vqc-bed-btn">Sao chép FEN</button></div>
     <p id="vqcBedMsg" class="vqc-bed-msg" role="status" aria-live="polite"></p>
    </div>
    <div id="vqcBedPlayPane" class="vqc-bed-pane" hidden>
     <p id="vqcBedStatus" class="vqc-bed-status" role="status"></p>
     <div class="vqc-bed-btns"><button type="button" id="vqcBedUndo" class="vqc-bed-btn">↩ Đi lại</button></div>
     <div class="vqc-bed-movehead">Các nước đã đi thử</div>
     <div id="vqcBedMoves" class="vqc-bed-moves"></div>
    </div>
    <div class="vqc-bed-foot">
     <button type="button" id="vqcBedAnalyze" class="vqc-bed-btn primary">Phân tích thế này</button>
     <button type="button" id="vqcBedBack" class="vqc-bed-btn">Sửa thế cờ</button>
    </div>
   </section>
  </div>
 </div>
</div>`;

function bind(){
 $('vqcBedClose').addEventListener('click',close);
 $('vqcBedFlip').addEventListener('click',function(){flipped=!flipped;paint();});
 $('vqcBedEvToggle').addEventListener('change',function(){
  evbOn=!!$('vqcBedEvToggle').checked;evbAuto='';clearTimeout(evbTimer);
  try{localStorage.setItem(LS_KEY,evbOn?'1':'0');}catch(e){}
  if(!evbOn)evbStop();
  paint();
 });
 $('vqcBedTurn').addEventListener('change',function(){turn=$('vqcBedTurn').value==='b'?'b':'w';setMsg('');paint();});
 $('vqcBedReset').addEventListener('click',function(){cells=parsePlacement(START);turn='w';setMsg('');paint();});
 $('vqcBedClear').addEventListener('click',function(){cells=new Array(64).fill('');setMsg('');paint();});
 $('vqcBedUseFen').addEventListener('click',useFen);
 $('vqcBedFen').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();useFen();}});
 $('vqcBedCopyFen').addEventListener('click',copyFen);
 $('vqcBedAnalyze').addEventListener('click',startAnalysis);
 $('vqcBedBack').addEventListener('click',backToEdit);
 $('vqcBedUndo').addEventListener('click',undo);
 const board=$('vqcBedBoard');
 board.addEventListener('click',function(e){
  const c=e.target.closest('.vqc-bed-cell');if(!c)return;
  onCell(c.dataset.square,Number(c.dataset.idx),false);
 });
 board.addEventListener('contextmenu',function(e){
  const c=e.target.closest('.vqc-bed-cell');if(!c)return;
  e.preventDefault();
  if(mode==='edit')onCell(c.dataset.square,Number(c.dataset.idx),true);
 });
 $('vqcBedOverlay').addEventListener('keydown',function(e){
  if(e.key==='Escape'){e.stopPropagation();close();}
 });
}
function ensureOverlay(){
 if($('vqcBedOverlay'))return;
 const holder=document.createElement('div');holder.innerHTML=OVERLAY_HTML.trim();
 document.body.append(holder.firstElementChild);
 bind();
}
function open(){
 if(typeof Chess!=='function'){notify('Chưa thể mở: thư viện luật cờ vua chưa được tải.');return;}
 ensureOverlay();
 if(typeof window.vqcCloseOtherViews==='function')window.vqcCloseOtherViews('boardeditor');
 isOpen=true;
 $('vqcBedOverlay').classList.add('open');
 paint();
 setTimeout(function(){const b=$('vqcBedClose');if(b)b.focus();},0);
}
function close(){
 if(!isOpen)return;
 isOpen=false;evbStop();
 const o=$('vqcBedOverlay');if(o)o.classList.remove('open');
}
function ensureMenu(){
 if($('vqcBedMenu'))return;
 const anchor=$('vqcReviewMenu')||$('pvpMenu')||document.querySelector('.lesson');
 if(!anchor)return;
 const item=document.createElement('div');
 item.className='lesson';item.id='vqcBedMenu';item.setAttribute('role','button');item.tabIndex=0;
 item.innerHTML='<div class="lesson-icon">✏️</div> Chỉnh sửa bàn cờ';
 item.addEventListener('click',open);
 item.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});
 anchor.insertAdjacentElement('afterend',item);
}

window.vqcBoardEditor={open:open,close:close,version:VERSION,_fen:fenOf};
window.vqcBoardEditorHide=close;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensureMenu,{once:true});
else ensureMenu();
})();
